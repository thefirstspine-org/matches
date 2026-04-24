import { IGameWorker } from './game-worker.interface';
import { IGameInstance, IGameAction, IInteractionPutCardOnBoard, IGameCard } from '@thefirstspine/types-matches';
import { Injectable } from '@nestjs/common';
import { GameHookService } from '../game-hook/game-hook.service';
import { IHasGameHookService } from '../injections.interface';
import { ArenaRoomsService } from '../../rooms/arena-rooms.service';
import { LogsService } from '@thefirstspine/logs-nest';

/**
 * Worker for "da-capo" spell.
 */
@Injectable()
export class SpellDaCapoGameWorker implements IGameWorker, IHasGameHookService {

  public gameHookService: GameHookService;

  constructor(
    private readonly logsService: LogsService,
    private readonly arenaRoomsService: ArenaRoomsService,
  ) {}

  readonly type: string = 'spell-da-capo';

  public async create(gameInstance: IGameInstance, data: {user: number}): Promise<IGameAction<IInteractionPutCardOnBoard>> {
    return {
      createdAt: Date.now(),
      type: this.type,
      name: {
        en: `Play Da Capo`,
        fr: `Jouer Da Capo`,
      },
      description: {
        en: `Play Da Capo to reset`,
        fr: `Jouer Da Capo pour`,
      },
      user: data.user as number,
      priority: 1,
      interaction: {
        type: 'putCardOnBoard',
        description: {
          en: `Play a spell on a card`,
          fr: `Jouer un sort sur une carte`,
        },
        params: {
          handIndexes: this.getHandIndexes(gameInstance, data.user),
          boardCoords: this.getBoardCoords(gameInstance, data.user),
        },
      },
    };
  }

  public async refresh(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPutCardOnBoard>): Promise<void> {
    gameAction.interaction.params.handIndexes = this.getHandIndexes(gameInstance, gameAction.user);
    gameAction.interaction.params.boardCoords = this.getBoardCoords(gameInstance, gameAction.user);
  }

  public async execute(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPutCardOnBoard>): Promise<boolean> {
    if (
      gameAction.response.handIndex === undefined ||
      gameAction.response.boardCoords === undefined
    ) {
      this.logsService.warning('Response in a wrong format', gameAction);
      return false;
    }

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

    const x: number = parseInt(responseBoardCoords.split('-')[0], 10);
    const y: number = parseInt(responseBoardCoords.split('-')[1], 10);

    const cardUsed: IGameCard|undefined = gameInstance.cards
      .filter((c: IGameCard) => c.location === 'hand' && c.user === gameAction.user)
      .find((c: IGameCard, index: number) => index === responseHandIndex);
    if (!cardUsed) {
      this.logsService.warning('Card not found', gameAction);
      return false;
    }
    cardUsed.location = 'discard';

    const cardDamaged: IGameCard|undefined = gameInstance.cards
      .find((c: IGameCard) => c.location === 'board' && c.coords && c.coords.x === x && c.coords.y === y);
    if (!cardDamaged) {
      this.logsService.warning('Target not found', gameAction);
      return false;
    }

    gameInstance.cards.forEach((card: IGameCard) => {
      if (card.currentStats?.capacities?.includes('requiem')) {
        card.metadata = card.metadata ? card.metadata : {};
        card.metadata.requiemTurns = 5;
      }
    });

    await this.gameHookService.dispatch(gameInstance, `card:spell:used:${cardUsed.card.id}`, {gameCard: cardUsed});

    this.arenaRoomsService.sendMessageForGame(
      gameInstance,
      {
        fr: `A joué Da Capo`,
        en: `Played Da Capo`,
      },
      gameAction.user);

    return true;
  }

  public async expires(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionPutCardOnBoard>): Promise<boolean> {
    return true;
  }

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

  protected getHandIndexes(gameInstance: IGameInstance, user: number): number[] {
    return gameInstance.cards.filter((card: IGameCard) => {
      return card.user === user && card.location === 'hand';
    }).map((card: IGameCard, index: number) => {
      if (card.card.id === 'da-capo') {
        return index;
      }
      return null;
    }).filter((i: number) => i !== null);
  }

  protected getBoardCoords(gameInstance: IGameInstance, user: number): string[] {
    return gameInstance.cards.filter((card: IGameCard) => card.location === 'board' && card.card.type === 'player' && card.user === user && !card.currentStats.effects?.includes('shadow'))
      .map((card: IGameCard) => `${card.coords.x}-${card.coords.y}`);
  }
}
