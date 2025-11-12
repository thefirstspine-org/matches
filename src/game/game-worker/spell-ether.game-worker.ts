import { IGameWorker } from './game-worker.interface';
import { IGameInstance, IGameAction, IGameCard, IInteractionPutCardOnBoard } from '@thefirstspine/types-matches';
import { Injectable } from '@nestjs/common';
import { GameHookService } from '../game-hook/game-hook.service';
import { IHasGameHookService } from '../injections.interface';
import { ArenaRoomsService } from '../../rooms/arena-rooms.service';
import { LogsService } from '@thefirstspine/logs-nest';

/**
 * Main worker for "heal" spell.
 */
@Injectable() // Injectable required here for dependency injection
export class SpellEtherGameWorker implements IGameWorker, IHasGameHookService {

  public gameHookService: GameHookService;

  constructor(
    private readonly logsService: LogsService,
    private readonly arenaRoomsService: ArenaRoomsService,
  ) {}

  readonly type: string = 'spell-ether';

  /**
   * @inheritdoc
   */
  public async create(gameInstance: IGameInstance, data: {user: number}): Promise<IGameAction<IInteractionPutCardOnBoard>> {
    return {
      createdAt: Date.now(),
      type: this.type,
      name: {
        en: `Play Ether`,
        fr: `Jouer un Ether`,
      },
      description: {
        en: `Play Ether on yourself`,
        fr: `Jouer un Ether sur vous-même`,
      },
      user: data.user as number,
      priority: 1,
      interaction: {
        type: 'putCardOnBoard',
        description: {
          en: `Play a spell`,
          fr: `Jouer un sort`,
        },
        params: {
          handIndexes: this.getHandIndexes(gameInstance, data.user),
          boardCoords: this.getBoardCoords(gameInstance, data.user),
        },
      },
    };
  }

  /**
   * @inheritdoc
   */
  public async refresh(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPutCardOnBoard>): Promise<void> {
    gameAction.interaction.params.handIndexes = this.getHandIndexes(gameInstance, gameAction.user);
    gameAction.interaction.params.boardCoords = this.getBoardCoords(gameInstance, gameAction.user);
  }

  /**
   * @inheritdoc
   */
  public async execute(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPutCardOnBoard>): Promise<boolean> {
    // Validate response form
    if (
      gameAction.response.handIndex === undefined ||
      gameAction.response.boardCoords === undefined
    ) {
      this.logsService.warning('Response in a wrong format', gameAction);
      return false;
    }

    // Validate response inputs
    const allowedHandIndexes: number[] = gameAction.interaction.params.handIndexes;
    const responseHandIndex: number = gameAction.response.handIndex;
    if (!allowedHandIndexes.includes(responseHandIndex)) {
      this.logsService.warning('Not allowed hand index', gameAction);
      return false;
    }

    // Discard the spell
    const cardUsed: IGameCard|undefined = gameInstance.cards
      .filter((c: IGameCard) => c.location === 'hand' && c.user === gameAction.user)
      .find((c: IGameCard, index: number) => index === responseHandIndex);
    if (!cardUsed) {
      this.logsService.warning('Card not found', gameAction);
      return false;
    }
    cardUsed.location = 'discard';

    // Edit metadata of the player for ether used
    const playerCard: IGameCard = gameInstance.cards.find((c: IGameCard) => c.user === gameAction.user && c.card.type === 'player' );
    playerCard.metadata = playerCard.metadata ? playerCard.metadata : {};
    playerCard.metadata.remainedSpells = playerCard.metadata.remainedSpells ? playerCard.metadata.remainedSpells + 3 : 3;

    // Dispatch event
    await this.gameHookService.dispatch(gameInstance, `card:spell:used:${cardUsed.card.id}`, {gameCard: cardUsed});

    // Send message to rooms
    this.arenaRoomsService.sendMessageForGame(
      gameInstance,
      {
        fr: `A joué un Ether`,
        en: `Played Ether`,
      },
      gameAction.user);

    return true;
  }

  /**
   * Default expires method
   * @param gameInstance
   * @param gameAction
   */
  public async expires(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPutCardOnBoard>): Promise<boolean> {
    return true;
  }

  /**
   * Default delete method
   * @param gameInstance
   * @param gameAction
   */
  public async delete(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPutCardOnBoard>): Promise<void> {
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

  /**
   * Get the hand indexes of the spell
   * @param gameInstance
   * @param user
   */
  protected getHandIndexes(gameInstance: IGameInstance, user: number): number[] {
    // Get the hand indexes of the creatures & artifacts
    return gameInstance.cards.filter((card: IGameCard) => {
      return card.user === user && card.location === 'hand';
    }).map((card: IGameCard, index: number) => {
      if (card.card.id === 'ether') {
        return index;
      }
      return null;
    }).filter((i: number) => i !== null);
  }

  /**
   * Get the board coordinates where the spell can be played
   * @param gameInstance
   * @param user
   */
  protected getBoardCoords(gameInstance: IGameInstance, user: number): string[] {
    // Get the coordinates where the user can place a card
    return gameInstance.cards.filter((card: IGameCard) => card.location === 'board' && card.card.type === 'player' && card.user === user && !card.currentStats.effects?.includes('shadow'))
      .map((card: IGameCard) => `${card.coords.x}-${card.coords.y}`);
  }

}
