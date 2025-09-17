import { IGameWorker } from './game-worker.interface';
import { IGameInstance, IGameAction, IGameCard, IInteractionPass } from '@thefirstspine/types-matches';
import { Injectable } from '@nestjs/common';
import { GameHookService } from '../game-hook/game-hook.service';
import { IHasGameHookService, IHasGameWorkerService } from '../injections.interface';
import { ArenaRoomsService } from '../../rooms/arena-rooms.service';
import { GameWorkerService } from './game-worker.service';
import { GameAssetsService } from '../../game-assets/game-assets.service';
import { ICard } from '@thefirstspine/types-game';

/**
 * Terminate the turn of the user.
 */
@Injectable() // Injectable required here for dependency injection
export class EndTurnGameWorker implements IGameWorker, IHasGameHookService, IHasGameWorkerService, IHasGameHookService {

  public gameHookService: GameHookService;
  public gameWorkerService: GameWorkerService;

  public readonly type: string = 'end-turn';

  constructor(
    private readonly restService: GameAssetsService,
    private readonly arenaRoomsService: ArenaRoomsService,
  ) {}

  /**
   * @inheritdoc
   */
  public async create(gameInstance: IGameInstance, data: {user: number}): Promise<IGameAction<IInteractionPass>> {
    return {
      createdAt: Date.now(),
      type: this.type,
      name: {
        en: `End the turn`,
        fr: `Terminer le tour`,
      },
      description: {
        en: `End the turn`,
        fr: `Terminer le tour`,
      },
      user: data.user as number,
      priority: 1,
      expiresAt: Date.now() + (10 * 1000 * (gameInstance.expirationTimeModifier ? gameInstance.expirationTimeModifier : 1)), // expires in 10 seconds
      interaction: {
        type: 'pass',
        description: {
          en: `End the turn`,
          fr: `Terminer le tour`,
        },
        params: {},
      },
    };
  }

  /**
   * @inheritdoc
   */
  public async execute(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPass>): Promise<boolean> {
    await this.gameHookService.dispatch(gameInstance, `game:turnEnded`, {user: gameAction.user});
    // Send message to rooms
    this.arenaRoomsService.sendMessageForGame(
      gameInstance,
      {
        fr: `Termine son tour`,
        en: `Ends his turn`,
      },
      gameAction.user);

    // Get the next user
    const foundIndex = gameInstance.gameUsers.findIndex((u) => u.user === gameAction.user);
    const nextIndex = foundIndex === gameInstance.gameUsers.length - 1 ? 0 : foundIndex + 1;
    const nextUser = gameInstance.gameUsers[nextIndex].user;

    // Send message to rooms
    this.arenaRoomsService.sendMessageForGame(
      gameInstance,
      {
        fr: `Commence son tour`,
        en: `Starts his turn`,
      },
      nextUser);

    // Generate "run" & "skip-run" action
    const runAction: IGameAction<any> = await this.gameWorkerService.getWorker('run')
      .create(gameInstance, {user: nextUser});
    if (runAction.interaction.params.possibilities.length) {
      // There some cards to move, register this action on the worker
      gameInstance.actions.current.push(runAction);
      // Register a skip too
      const skipRunAction: IGameAction<any> = await this.gameWorkerService.getWorker('skip-run')
        .create(gameInstance, {user: nextUser});
      gameInstance.actions.current.push(skipRunAction);
    }

    // Get the squares on the board
    const squares: IGameCard[] = gameInstance.cards.filter((c: IGameCard) => {
      return c.location === 'board' && c.card.type === 'square';
    });

    const promisesCapacities: Array<Promise<any>> = [];
    gameInstance.cards.forEach((c: IGameCard) => {
      // Remove the "burden-earth" cards of the next user
      if (c.user === nextUser && c.location === 'board' && c.card.id === 'burden-earth') {
        c.location = 'discard';
        const promise = this.gameHookService.dispatch(gameInstance, `card:discarded:${c.card.id}`, {gameCard: c});
        promisesCapacities.push(promise);
      }

      // Add strength to "growth" capacity
      if (c.user === nextUser && c.currentStats?.capacities?.includes('grow') && c.location === 'board') {
        c.metadata = c.metadata ? c.metadata : {};
        c.metadata.growBonus = c.metadata.growBonus ? c.metadata.growBonus + 1 : 1;
        if (c.metadata.growBonus <= 5) {
          c.currentStats.bottom.strength += 2;
          c.currentStats.left.strength += 2;
          c.currentStats.right.strength += 2;
          c.currentStats.top.strength += 2;
        }
      }

      // Remove 1 turn for requiem
      if (c.user === nextUser && c.currentStats?.capacities?.includes('requiem') && c.location === 'board') {
        c.metadata = c.metadata ? c.metadata : {};
        c.metadata.requiemTurns = c.metadata.requiemTurns ? c.metadata.requiemTurns : 5;
        c.metadata.requiemTurns--;
        if (c.metadata.requiemTurns <= 0) {
          const lifeRequiemLost = c.currentStats.life;
          c.currentStats.life = 0;
          promisesCapacities.push(
            this.gameHookService.dispatch(
              gameInstance,
              `card:lifeChanged:damaged:${c.card.type}:${c.card.id}`, {gameCard: c, source: null, lifeChanged: -lifeRequiemLost}
            )
          );
        }
      }
    });

    await Promise.all(promisesCapacities);

    const promisesEffects: Array<Promise<any>> = [];
    gameInstance.cards.forEach((c: IGameCard) => {
      // Damages the cards of the next player on lava squares
      const square: IGameCard|undefined = squares.find((s: IGameCard) => c.coords && s.coords.x === c.coords.x && s.coords.y === s.coords.y);
      if (square && square.card.id === 'lava' && c.user === nextUser && c.card.type !== 'square') {
        c.currentStats.life --;
        promisesEffects.push(
          this.gameHookService
          .dispatch(
            gameInstance,
            `card:lifeChanged:damaged:${c.card.type}:${c.card.id}`, {gameCard: c, source: square, lifeChanged: -1}));
      }

      // Replace the "Great Old" cards
      if (c.location === 'board' && c.user === nextUser && c.currentStats?.effects?.includes('great-ancient-egg')) {
        const juvenilegreatAncientPromise: Promise<ICard> = this.restService.card('juvenile-great-ancient');
        juvenilegreatAncientPromise.then((replacement: ICard) => {
          c.card = replacement;
          c.currentStats = replacement.stats;
        });
        promisesEffects.push(juvenilegreatAncientPromise);
      }
      if (c.location === 'board' && c.user === nextUser && c.currentStats?.effects?.includes('juvenile-great-ancient')) {
        const greatAncientPromise: Promise<ICard> = this.restService.card('great-ancient');
        greatAncientPromise.then((replacement: ICard) => {
          c.card = replacement;
          c.currentStats = replacement.stats;
        });
        promisesEffects.push(greatAncientPromise);
      }
    });

    await Promise.all(promisesEffects);

    // Generate the actions of the user
    const action: IGameAction<any> = await this.gameWorkerService.getWorker('throw-cards')
      .create(gameInstance, {user: nextUser});
    gameInstance.actions.current.push(action);

    return true;
  }

  /**
   * Default refresh method
   * @param gameInstance
   * @param gameAction
   */
  public async refresh(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPass>): Promise<void> {
    return;
  }

  /**
   * On expiration, do not throw cards
   * @param gameInstance
   * @param gameAction
   */
  public async expires(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPass>): Promise<boolean> {
    gameAction.response = [];
    return true;
  }

  /**
   * Default delete method
   * @param gameInstance
   * @param gameAction
   */
  public async delete(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPass>): Promise<void> {
    gameInstance.actions.current = gameInstance.actions.current.filter((gameActionRef: IGameAction<any>) => {
      if (gameActionRef === gameAction) {
        gameInstance.actions.previous.push({
          ...gameAction,
          passedAt: Date.now(),
        });
        return false;
      }
      return true;
    });
  }
}
