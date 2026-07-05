import { IGameWorker } from './game-worker.interface';
import { IGameInstance,
  IGameAction,
  IInteractionMoveCardOnBoardPossibility,
  IInteractionSelectCoupleOnBoard,
  IGameCard } from '@thefirstspine/types-matches';
import { Injectable } from '@nestjs/common';
import { GameWorkerService } from './game-worker.service';
import { cardCapacity, cardSide, ICardCoords } from '@thefirstspine/types-game';
import { GameHookService } from '../game-hook/game-hook.service';
import { IHasGameHookService, IHasGameWorkerService } from '../injections.interface';
import { ArenaRoomsService } from '../../rooms/arena-rooms.service';
import { LogsService } from '@thefirstspine/logs-nest';
import { rotateCard, getSubjectiveSides, getSideCoords } from '../../utils/game.utils';

/**
 * Maps a board-based side to an owner-relative side for a given card.
 * When a card owner is player 1, sides are rotated 180 degrees: top↔bottom, left↔right.
 * @param side Board-based side (absolute reference frame)
 * @param card The card being queried
 * @param gameInstance Game instance containing player info
 * @returns The side as seen by the card owner
 */
function mapBoardSideToOwnerSide(side: cardSide, card: IGameCard, gameInstance: IGameInstance): cardSide {
  const ownerIndex = gameInstance.gameUsers.findIndex((w) => w.user == card.user);
  if (ownerIndex === 1) {
    const sideMap: {[k in cardSide]: cardSide} = {
      top: 'bottom',
      bottom: 'top',
      left: 'right',
      right: 'left',
    };
    return sideMap[side];
  }
  return side;
}

/**
 * The main confrontation game worker. Normally a confrontation is closing the turn of the player. This worker
 * will self-generate confrontations once every confrontation is done, and then throw a game:turnEnded event.
 */
@Injectable() // Injectable required here for dependency injection
export class ConfrontsGameWorker implements IGameWorker, IHasGameHookService, IHasGameWorkerService {

  public gameHookService: GameHookService;
  public gameWorkerService: GameWorkerService;

  readonly type: string = 'confronts';

  constructor(
    private readonly logsService: LogsService,
    private readonly arenaRoomsService: ArenaRoomsService,
  ) {}

  /**
   * @inheritdoc
   */
  public async create(gameInstance: IGameInstance, data: {user: number}): Promise<IGameAction<IInteractionSelectCoupleOnBoard>> {
    return {
      createdAt: Date.now(),
      type: this.type,
      name: {
        en: `Confront`,
        fr: `Confronter`,
      },
      description: {
        en: `Confront two cards`,
        fr: `Confronter deux cartes`,
      },
      user: data.user as number,
      priority: 1,
      expiresAt: Date.now() + (30 * 1000 * (gameInstance.expirationTimeModifier ? gameInstance.expirationTimeModifier : 1)), // expires in 30 seconds
      interaction: {
        type: 'selectCoupleOnBoard',
        description: {
          en: `Resolve a confrontation`,
          fr: `Résoudre une confrontation.`,
        },
        params: {
          possibilities: this.getPossibilities(gameInstance, data.user),
        },
      },
    };
  }

  /**
   * @inheritdoc
   */
  public async execute(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionSelectCoupleOnBoard>): Promise<boolean> {
    // Validate response form
    if (
      gameAction.response.boardCoordsFrom === undefined ||
      gameAction.response.boardCoordsTo === undefined
    ) {
      this.logsService.warning('Response in a wrong format', gameAction);
      return false;
    }

    // Validate response input
    const boardCoordsFrom: string = gameAction.response.boardCoordsFrom;
    const boardCoordsTo: string = gameAction.response.boardCoordsTo;
    const possibilities: IInteractionMoveCardOnBoardPossibility[] = gameAction.interaction.params.possibilities;
    const possibility: IInteractionMoveCardOnBoardPossibility|undefined = possibilities.find((p: IInteractionMoveCardOnBoardPossibility) => {
      return p.boardCoordsFrom === boardCoordsFrom && p.boardCoordsTo.includes(boardCoordsTo);
    });
    if (!possibility) {
      this.logsService.warning('Possibility not found', gameAction);
      return false;
    }

    // Find the cards
    const boardCoordsFromX: number = parseInt(boardCoordsFrom.split('-')[0], 10);
    const boardCoordsFromY: number = parseInt(boardCoordsFrom.split('-')[1], 10);
    const boardCoordsToX: number = parseInt(boardCoordsTo.split('-')[0], 10);
    const boardCoordsToY: number = parseInt(boardCoordsTo.split('-')[1], 10);
    const cardFrom: IGameCard = gameInstance.cards.find((c: IGameCard) => {
      return c.location === 'board' && c.coords.x === boardCoordsFromX && c.coords.y === boardCoordsFromY;
    });
    const cardTo: IGameCard = gameInstance.cards.find((c: IGameCard) => {
      return c.location === 'board' && c.coords.x === boardCoordsToX && c.coords.y === boardCoordsToY;
    });

    // Ensure that manipulations will not fuck everything
    const cardFromRotatedByActive: IGameCard = rotateCard(cardFrom, gameInstance, gameAction.user);
    const cardToRotatedByActive: IGameCard = rotateCard(cardTo, gameInstance, gameAction.user);

    // Determine engaged sides based on board delta (consistent with getPossibilities)
    const dx = boardCoordsToX - boardCoordsFromX;
    const dy = boardCoordsToY - boardCoordsFromY;
    let sideFrom: cardSide|undefined;
    if (dx === 0 && dy === 1) sideFrom = 'top';
    if (dx === 0 && dy === -1) sideFrom = 'bottom';
    if (dx === -1 && dy === 0) sideFrom = 'left';
    if (dx === 1 && dy === 0) sideFrom = 'right';

    const oppositeSide: {[k in cardSide]: cardSide} = {top: 'bottom', bottom: 'top', left: 'right', right: 'left'};
    const sideTo: cardSide|undefined = sideFrom ? oppositeSide[sideFrom] : undefined;

    // For damage calculations, use owner-relative rotations so strengths/defenses match card faces
    const cardFromOwnerRot: IGameCard = rotateCard(cardFrom, gameInstance, cardFrom.user);
    const cardToOwnerRot: IGameCard = rotateCard(cardTo, gameInstance, cardTo.user);

    // Damages calculation
    let lifeLostTo = 0;
    let lifeLostFrom = 0;
    const capacitiesToAddToTarget: cardCapacity[] = [];
    if (sideFrom && sideTo) {
      // attacker's damage to target
      lifeLostTo = cardFromOwnerRot.currentStats[sideFrom].strength - cardToOwnerRot.currentStats[sideTo].defense;
      // defender's counter damage to attacker
      lifeLostFrom = cardToOwnerRot.currentStats[sideTo].strength - cardFromOwnerRot.currentStats[sideFrom].defense;

      // Handle kiss/requiem capacity on the attacker's engaged side as seen by the owner
      // Map board-based sides to owner-relative sides
      const sideFromOwnerRelative = mapBoardSideToOwnerSide(sideFrom, cardFrom, gameInstance);
      const sideToOwnerRelative = mapBoardSideToOwnerSide(sideTo, cardTo, gameInstance);
      
      if (cardFromOwnerRot.currentStats[sideFromOwnerRelative]?.capacity == 'kiss' && !cardToOwnerRot.currentStats.capacities?.includes('requiem')) {
        capacitiesToAddToTarget.push('requiem');
      }
    }

    // Keep direction for logs & messages (derive from sideFrom to preserve existing uses)
    let direction: cardSide|undefined = sideFrom;

    capacitiesToAddToTarget.forEach((capacity: cardCapacity) => {
      if (!cardTo.currentStats.capacities) {
        cardTo.currentStats.capacities = [];
      }
      cardTo.currentStats.capacities.push(capacity);
    });

    // Debug: log computed sides/values before applying damages
    try {
      this.logsService.info('Confronts: pre-apply', {
        boardCoordsFrom,
        boardCoordsTo,
        direction,
        gameUsers: gameInstance.gameUsers.map((u) => u.user),
        cardFrom: {
          id: cardFrom.id,
          user: cardFrom.user,
          rotatedByActiveUser: {
            top: cardFromRotatedByActive.currentStats.top,
            right: cardFromRotatedByActive.currentStats.right,
            bottom: cardFromRotatedByActive.currentStats.bottom,
            left: cardFromRotatedByActive.currentStats.left,
          },
          rotatedByOwner: (() => {
            try { const r = rotateCard(cardFrom, gameInstance, cardFrom.user); return {top: r.currentStats.top, right: r.currentStats.right, bottom: r.currentStats.bottom, left: r.currentStats.left}; } catch (e) { return null; }
          })(),
          life: cardFrom.currentStats.life,
        },
        cardTo: {
          id: cardTo.id,
          user: cardTo.user,
          rotatedByActiveUser: {
            top: cardToRotatedByActive.currentStats.top,
            right: cardToRotatedByActive.currentStats.right,
            bottom: cardToRotatedByActive.currentStats.bottom,
            left: cardToRotatedByActive.currentStats.left,
          },
          rotatedByOwner: (() => {
            try { const r = rotateCard(cardTo, gameInstance, cardTo.user); return {top: r.currentStats.top, right: r.currentStats.right, bottom: r.currentStats.bottom, left: r.currentStats.left}; } catch (e) { return null; }
          })(),
          life: cardTo.currentStats.life,
        },
        sidesByActiveUser: (() => { try { const s = getSubjectiveSides(gameAction.user, gameInstance); return s; } catch (e) { return null; } })(),
        lifeLostTo,
        lifeLostFrom,
        capacitiesToAddToTarget,
      });
    } catch (e) {
      // ignore logging errors
    }

    // Apply damages
    if (lifeLostTo > 0) {
      cardTo.currentStats.life -= lifeLostTo;
      await this.gameHookService.dispatch(
        gameInstance,
        `card:lifeChanged:damaged:${cardTo.card.type}:${cardTo.card.id}`, {gameCard: cardTo, source: cardFrom, lifeChanged: -lifeLostTo});
    }
    if (lifeLostFrom > 0) {
      cardFrom.currentStats.life -= lifeLostFrom;
      await this.gameHookService.dispatch(
        gameInstance,
        `card:lifeChanged:damaged:${cardFrom.card.type}:${cardFrom.card.id}`, {gameCard: cardFrom, source: cardTo, lifeChanged: -lifeLostFrom});
    }

    // Get the old confronts based on the last 50 actions (+ this one)
    const alreadyConfront: string[] = [boardCoordsFrom];
    let isInConfront = true;
    for (let i = 0; i < 50 && i < gameInstance.actions.previous.length; i ++) {
      const prevAction = gameInstance.actions.previous[gameInstance.actions.previous.length - (i + 1)];
      if (prevAction.type !== 'start-confronts' && isInConfront) {
        alreadyConfront.push(prevAction.response.boardCoordsFrom);
      } else {
        isInConfront = false;
      }
    }

    // Get the new possibilities
    const newPossibilities = this.getPossibilities(gameInstance, gameAction.user).filter((p: IInteractionMoveCardOnBoardPossibility) => {
      return !alreadyConfront.includes(p.boardCoordsFrom);
    });

    if (newPossibilities.length > 0) {
      // Generate the action & replaces the possibilities
      const action: IGameAction<any> = await this.gameWorkerService.getWorker(this.type).create(gameInstance, {user: gameAction.user});
      action.interaction.params.possibilities = newPossibilities;
      // Add the the pool
      gameInstance.actions.current.push(action);
    } else {
      // End turn
      const endTurnAction: IGameAction<any> = await this.gameWorkerService.getWorker('end-turn').create(gameInstance, {user: gameAction.user});
      gameInstance.actions.current.push(endTurnAction);
    }

    // Send message to rooms
    this.arenaRoomsService.sendMessageForGame(
      gameInstance,
      {
        fr: `A joué une confrontation`,
        en: `Played a confrontation`,
      },
      gameAction.user);

    return true;
  }

  /**
   * Get all the confronts possibilities for a giver user in a game instance
   * @param gameInstance
   * @param user
   */
  protected getPossibilities(gameInstance: IGameInstance, user: number): IInteractionMoveCardOnBoardPossibility[] {
    const ret: IInteractionMoveCardOnBoardPossibility[] = [];
    gameInstance.cards.forEach((card: IGameCard) => {
      // Cards that does not have stats can confront
      if (!card.currentStats || card.location !== 'board') {
        return;
      }

      const attacksOn: cardSide[] = [];
      const allSides: cardSide[] = ['top', 'right', 'bottom', 'left'];
      const cardRotated: IGameCard = rotateCard(card, gameInstance, user);

      if (cardRotated.user === user) {
        if (cardRotated.card.type === 'creature') {
          // The creatures can attack on all sides
          attacksOn.push('top', 'right', 'bottom', 'left');
        } else {
          // The other cards can attack on the "threat" side
          allSides.forEach((s: cardSide) => {
            if (cardRotated.currentStats[s].capacity === 'threat') {
              attacksOn.push(s);
            }
          });
        }
      }

      if (attacksOn.length > 0) {
        const coordsFrom: ICardCoords = JSON.parse(JSON.stringify(cardRotated.coords));
        const boardCoordsTo = [];
        attacksOn.forEach((side: cardSide) => {
          const coordsTo: ICardCoords = JSON.parse(JSON.stringify(cardRotated.coords));
          switch (side) {
            case 'bottom':
              coordsTo.y --;
              break;
            case 'left':
              coordsTo.x --;
              break;
            case 'right':
              coordsTo.x ++;
              break;
            case 'top':
              coordsTo.y ++;
              break;
          }

          if (
            gameInstance.cards.find((card) => {
              return card.location === 'board' &&
                card.coords.x === coordsTo.x &&
                card.coords.y === coordsTo.y &&
                card.user !== user &&
                ['creature', 'artifact', 'player'].includes(card.card.type);
            })
          ) {
            boardCoordsTo.push(`${coordsTo.x}-${coordsTo.y}`);
          }
        });
        if (boardCoordsTo.length > 0) {
          ret.push({
            boardCoordsFrom: `${coordsFrom.x}-${coordsFrom.y}`,
            boardCoordsTo,
          });
        }
      }
    });
    return ret;
  }

  /**
   * Default refresh method
   * @param gameInstance
   * @param gameAction
   */
  public async refresh(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionSelectCoupleOnBoard>): Promise<void> {
    // Get the old confronts based on the last 50 actions
    const alreadyConfront: string[] = [];
    let isInConfront = true;
    for (let i = 0; i < 50 && i < gameInstance.actions.previous.length; i ++) {
      const prevAction = gameInstance.actions.previous[gameInstance.actions.previous.length - (i + 1)];
      if (prevAction.type !== 'start-confronts' && isInConfront) {
        alreadyConfront.push(prevAction.response.boardCoordsFrom);
      } else {
        isInConfront = false;
      }
    }

    gameAction.interaction.params.possibilities =
      this.getPossibilities(gameInstance, gameAction.user).filter((p: IInteractionMoveCardOnBoardPossibility) => {
        return !alreadyConfront.includes(p.boardCoordsFrom);
      });

    if (gameAction.interaction.params.possibilities.length === 0) {
      this.delete(gameInstance, gameAction);
      // No possibility, delete this action and ends the turn
      const endTurnAction: IGameAction<any> = await this.gameWorkerService.getWorker('end-turn').create(gameInstance, {user: gameAction.user});
      gameInstance.actions.current.push(endTurnAction);
    }
    return;
  }

  /**
   * Expires by chosing confronts randomly
   * @param gameInstance
   * @param gameAction
   */
  public async expires(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionSelectCoupleOnBoard>): Promise<boolean> {
    const possibilities: IInteractionMoveCardOnBoardPossibility[] = gameAction.interaction.params.possibilities;
    const possibility: IInteractionMoveCardOnBoardPossibility = possibilities[Math.floor(Math.random() * possibilities.length)];
    const boardCoordsTo: string = possibility.boardCoordsTo[Math.floor(Math.random() * possibility.boardCoordsTo.length)];
    gameAction.response = {
      boardCoordsFrom: possibility.boardCoordsFrom,
      boardCoordsTo,
    };
    return true;
  }

  /**
   * Default delete method
   * @param gameInstance
   * @param gameAction
   */
  public async delete(gameInstance: IGameInstance, gameAction: IGameAction<IInteractionSelectCoupleOnBoard>): Promise<void> {
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
