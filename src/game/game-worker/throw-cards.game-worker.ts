import { IGameWorker } from './game-worker.interface';
import { IGameInstance, IGameAction, IGameCard, IInteractionMoveCardToDiscard } from '@thefirstspine/types-matches';
import { Injectable } from '@nestjs/common';
import { GameHookService } from '../game-hook/game-hook.service';
import { IHasGameHookService } from '../injections.interface';
import { ArenaRoomsService } from '../../rooms/arena-rooms.service';
import { LogsService } from '@thefirstspine/logs-nest';

/**
 * At the beggining of his turn, the player can throw to the discard one or more cards.
 */
@Injectable() // Injectable required here for dependency injection
export class ThrowCardsGameWorker implements IGameWorker, IHasGameHookService {

  public gameHookService: GameHookService;

  public readonly type: string = 'throw-cards';

  constructor(
    private readonly logsService: LogsService,
    private readonly arenaRoomsService: ArenaRoomsService,
  ) {}

  /**
   * @inheritdoc
   */
  public async create(gameInstance: IGameInstance, data: {user: number}): Promise<IGameAction<IInteractionMoveCardToDiscard>> {
    return {
      createdAt: Date.now(),
      type: this.type,
      name: {
        en: `Discard`,
        fr: `Défausser`,
      },
      description: {
        en: `You can discard one or more cards`,
        fr: `Vous pouvez défausser une ou plusieurs cartes.`,
      },
      user: data.user as number,
      priority: 1,
      expiresAt: Date.now() + (30 * 1000 * (gameInstance.expirationTimeModifier ? gameInstance.expirationTimeModifier : 1)), // expires in 30 seconds
      interaction: {
        type: 'moveCardsToDiscard',
        description: {
          en: `Discard one or more cards`,
          fr: `Défausser une ou plusieurs cartes`,
        },
        params: {
          handIndexes: this.getHandIndexes(gameInstance, data.user),
          max: 6,
          min: 0,
        },
      },
    };
  }

  /**
   * @inheritdoc
   */
  public async execute(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionMoveCardToDiscard>): Promise<boolean> {
    if (!Array.isArray(gameAction.response.handIndexes)) {
      this.logsService.warning('Response in a wrong format', gameAction);
      return false;
    }

    // Validate response inputs
    const allowedHandIndexes: number[] = gameAction.interaction.params.handIndexes;
    const responseHandIndexes: number[] = gameAction.response.handIndexes as number[];
    const falseIndex: number[] = responseHandIndexes.filter((i: number) => !allowedHandIndexes.includes(i));
    if (falseIndex.length) {
      this.logsService.warning('Not allowed hand index', gameAction);
      return false;
    }

    // Discard the cards
    const cards: IGameCard[] = [];
    gameInstance.cards.filter((c: IGameCard) => c.location === 'hand' && c.user === gameAction.user)
                      .forEach((c: IGameCard, index: number) => {
                        if (responseHandIndexes.includes(index)) {
                          cards.push(c);
                        }
                      });

    await Promise.all(cards.map((c: IGameCard) => {
      c.location = 'discard';
      return this.gameHookService.dispatch(gameInstance, `card:discarded:${c.card.id}`, {gameCard: c});
    }));

    // Pick the new cards
    const currentPlayerCard: IGameCard = gameInstance.cards.find(c => c.card && c.card.type === 'player' && c.user === gameAction.user);
    const currentCards: number = gameInstance.cards.filter(c => c.location === 'hand' && c.user === gameAction.user).length;
    let burnDamages: number = 0;
    for (let i = currentCards; i < 6; i ++) {
      const card = gameInstance.cards.find(c => c.location === 'deck' && c.user === gameAction.user);
      if (card) {
        card.location = 'hand';
        await this.gameHookService.dispatch(gameInstance, `game:card:picked:${card.card.id}`);
      } else {
        burnDamages ++;
      }
    }

    // Process burn
    if (burnDamages > 0) {
      currentPlayerCard.currentStats.life -= burnDamages;
      await this.gameHookService.dispatch(
        gameInstance,
        `card:lifeChanged:damaged:player:${currentPlayerCard.card.id}`, {gameCard: currentPlayerCard, source: null, lifeChanged: -burnDamages});
    }

    // Remove life from the player for more than one card discarded
    const damages: number = responseHandIndexes.length - 1;
    if (damages > 0) {
      currentPlayerCard.currentStats.life -= damages;
      await this.gameHookService.dispatch(
        gameInstance,
        `card:lifeChanged:damaged:player:${currentPlayerCard.card.id}`, {gameCard: currentPlayerCard, source: null, lifeChanged: -damages});
    }

    // Dispatch event
    await this.gameHookService.dispatch(gameInstance, `game:phaseChanged:actions`, {user: gameAction.user});

    // Send message to rooms
    const numCards: number = responseHandIndexes.length;
    this.arenaRoomsService.sendMessageForGame(
      gameInstance,
      {
        fr: `Défausse ${numCards} carte${(numCards > 1 ? 's' : '')}`,
        en: `Discard ${numCards} card${(numCards > 1 ? 's' : '')}`,
      },
      gameAction.user);

    return true;
  }

  /**
   * Default refresh method
   * @param gameInstance
   * @param gameAction
   */
  public async refresh(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionMoveCardToDiscard>): Promise<void> {
    return;
  }

  /**
   * On expiration, do not throw cards
   * @param gameInstance
   * @param gameAction
   */
  public async expires(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionMoveCardToDiscard>): Promise<boolean> {
    gameAction.response = {handIndexes: []};
    return true;
  }

  /**
   * Default delete method
   * @param gameInstance
   * @param gameAction
   */
  public async delete(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionMoveCardToDiscard>): Promise<void> {
    gameInstance.actions.current = gameInstance.actions.current.filter((gameActionRef: IGameAction<IInteractionMoveCardToDiscard>) => {
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

  /**
   * Get the hand indexes of the allowed cards. The user CANNOT discard the "Curse of Mara" card.
   * @param gameInstance
   * @param user
   */
  protected getHandIndexes(gameInstance: IGameInstance, user: number): number[] {
    return gameInstance.cards
      .filter((card: IGameCard) => {
        return card.user === user && card.location === 'hand';
      })
      .map((card: IGameCard, index: number) => card.card.id !== 'curse-of-mara' ? index : null)
      .filter((i) => i !== null);
  }
}
