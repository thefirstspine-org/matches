import { IGameHook } from './game-hook.interface';
import { Injectable } from '@nestjs/common';
import { IGameInstance, IGameCard, IGameAction } from '@thefirstspine/types-matches';
import { IHasGameWorkerService } from '../injections.interface';
import { GameWorkerService } from '../game-worker/game-worker.service';

/**
 * This subscriber is executed once a 'card:spell:used' event is thrown. It wil delete old spells actions.
 * @param gameInstance
 * @param params
 */
@Injectable()
export class SpellUsedGameHook implements IGameHook, IHasGameWorkerService {

  constructor(
  ) {}

  public gameWorkerService: GameWorkerService;

  async execute(gameInstance: IGameInstance, params: {gameCard: IGameCard}): Promise<boolean> {
    // Add strength to the Insane's Echo card
    gameInstance.cards
      .filter((card: IGameCard) => card.location === 'board' && card.user === params.gameCard.user && card.card.id === 'insanes-echo')
      .forEach((card: IGameCard) => {
        card.currentStats.bottom.strength += 2;
        card.currentStats.left.strength += 2;
        card.currentStats.right.strength += 2;
        card.currentStats.top.strength += 2;
      });

    // Get the player's remained spells and decrement (default 1 per turn)
    const playerCard: IGameCard = gameInstance.cards.find((c: IGameCard) => c.user === params.gameCard.user && c.card.type === 'player' );
    playerCard.metadata = playerCard.metadata ? playerCard.metadata : {};
    // Default allowed spells per turn is 1 unless explicitly increased by effects (like Ether)
    playerCard.metadata.remainedSpells = typeof playerCard.metadata.remainedSpells === 'number' ?
      playerCard.metadata.remainedSpells - 1 :
      0;

    // If no remained spells left, remove all pending spell actions for this user
    if (!playerCard.metadata.remainedSpells) {
      const toRemove: Array<IGameAction<any>> = gameInstance.actions.current.filter((a: IGameAction<any>) => {
        return typeof a.type === 'string' && a.type.startsWith('spell-') && a.user === params.gameCard.user;
      });
      toRemove.forEach((action: IGameAction<any>) => {
        gameInstance.actions.current = gameInstance.actions.current.filter((a: IGameAction<any>) => a !== action);
        gameInstance.actions.previous.push({
          ...action,
          passedAt: Date.now(),
        });
      });
    }

    return true;
  }

}
