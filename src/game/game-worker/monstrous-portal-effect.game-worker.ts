import { IGameWorker } from './game-worker.interface';
import { IGameInstance, IGameAction, IGameCard, IInteractionPutCardOnBoard } from '@thefirstspine/types-matches';
import { Injectable } from '@nestjs/common';
import { ICardCoords } from '@thefirstspine/types-game';
import { GameHookService } from '../game-hook/game-hook.service';
import { IHasGameHookService } from '../injections.interface';
import { ArenaRoomsService } from '../../rooms/arena-rooms.service';
import { randBetween } from '../../utils/maths.utils';
import { LogsService } from '@thefirstspine/logs-nest';

/**
 * The effect of the monstrous portal action game worker.
 * When the Monstrous Portal is damaged, the player can place a card near one of the Monstrous Portal under his control.
 */
@Injectable() // Injectable required here for dependency injection
export class MonstrousPortalEffectGameWorker implements IGameWorker, IHasGameHookService {

  public gameHookService: GameHookService;

  public readonly type: string = 'monstrous-portal-effect';

  constructor(
    private readonly logsService: LogsService,
    private readonly arenaRoomsService: ArenaRoomsService,
  ) {}

  /**
   * @inheritdoc
   */
  public async create(gameInstance: IGameInstance, data: {user: number}): Promise<IGameAction<IInteractionPutCardOnBoard>> {
    return {
      createdAt: Date.now(),
      type: this.type,
      name: {
        en: `Place a card on the board`,
        fr: `Placer une carte`,
      },
      description: {
        en: `You can place a card on the board`,
        fr: `Vous pouvez placer une carte sur le plateau de jeu.`,
      },
      expiresAt: Date.now() + (30 * 1000 * (gameInstance.expirationTimeModifier ? gameInstance.expirationTimeModifier : 1)), // expires in 30 seconds
      user: data.user as number,
      priority: 3,
      interaction: {
        type: 'putCardOnBoard',
        description: {
          en: `Place a card around one of your Monstrous Portals`,
          fr: `Placer une carte autour de l'un des Portails Monstrueux`,
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
    if (gameAction.interaction.params.boardCoords.length === 0) {
      // We do not have available action, we should destroy this action
      return this.delete(gameInstance, gameAction);
    }
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
    const allowedCoordsOnBoard: string[] = gameAction.interaction.params.boardCoords;
    const responseHandIndex: number = gameAction.response.handIndex;
    const responseBoardCoords: string = gameAction.response.boardCoords;
    if (!allowedHandIndexes.includes(responseHandIndex)) {
      this.logsService.warning('Not allowed hand index', gameAction);
      return false;
    }
    if (!allowedCoordsOnBoard.includes(responseBoardCoords)) {
      this.logsService.warning('Not allowed board coords', gameAction);
      return false;
    }

    // Transform coords
    const x: number = parseInt(responseBoardCoords.split('-')[0], 10);
    const y: number = parseInt(responseBoardCoords.split('-')[1], 10);

    // Place the card
    const card: IGameCard|undefined = gameInstance.cards
      .filter((c: IGameCard) => c.location === 'hand' && c.user === gameAction.user)
      .find((c: IGameCard, index: number) => index === responseHandIndex);
    if (!card) {
      this.logsService.warning('Card not found', gameAction);
      return false;
    }
    card.location = 'board';
    card.coords = {x, y};

    // Dispatch event
    await this.gameHookService.dispatch(gameInstance, `card:placed:${card.card.id}`, {gameCard: card});

    // Send message to rooms
    this.arenaRoomsService.sendMessageForGame(
      gameInstance,
      {
        fr: `A placé une carte`,
        en: `Placed a card`,
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
    const handIndexes = this.getHandIndexes(gameInstance, gameAction.user);
    const handIndex = handIndexes[randBetween(0, handIndexes.length - 1)];
    const boardCoords = gameAction.interaction.params.boardCoords[0];
    gameAction.response = {handIndex, boardCoords};
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
   * Get the possible hand indexes where a user can take a card from
   * @param gameInstance
   * @param user
   */
  protected getHandIndexes(gameInstance: IGameInstance, user: number): number[] {
    // Get the hand indexes of the creatures & artifacts
    return gameInstance.cards.filter((card: IGameCard) => {
      return card.user === user && card.location === 'hand';
    }).map((card: IGameCard, index: number) => {
      if (['creature', 'artifact'].includes(card.card.type)) {
        return index;
      }
      return null;
    }).filter((i: number) => i !== null);
  }

  /**
   * Get the possibilities where to place a card
   * @param gameInstance
   * @param user
   */
  protected getBoardCoords(gameInstance: IGameInstance, user: number): string[] {
    // Get the coordinates where the user can place a card
    const boardCoords: string[] = [];
    gameInstance.cards.filter((card: IGameCard) => {
      return card.user === user && card.location === 'board' && card.card.id === 'monstrous-portal';
    }).forEach((card: IGameCard) => {
      const x: number = card.coords.x;
      const y: number = card.coords.y;
      [
        {x: x + 1, y},
        {x: x - 1, y},
        {x, y: y + 1},
        {x, y: y - 1},
      ].forEach((coords: ICardCoords) => {
        // Skip invalid coords
        if (coords.x < 0 || coords.y < 0) {
          return;
        }
        if (coords.x > 6 || coords.y > 6) {
          return;
        }
        // Skip already taken coords
        const card: IGameCard =
          gameInstance.cards.find((c: IGameCard) => c.location === 'board' && c.coords.x === coords.x && c.coords.y === coords.y);
        if (card) {
          if (card.card.type === 'creature' || card.card.type === 'artifact' || card.card.type === 'player') {
            return;
          }
          if (card.card.id === 'ditch' || card.card.id === 'burden-earth') {
            return;
          }
        }
        boardCoords.push(`${coords.x}-${coords.y}`);
      });
    });

    return boardCoords;
  }

}
