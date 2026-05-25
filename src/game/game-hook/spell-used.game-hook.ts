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

    // Get the remained spells & remove one
    const playerCard: IGameCard = gameInstance.cards.find((c: IGameCard) => c.user === params.gameCard.user && c.card.type === 'player' );
    if (playerCard?.metadata?.remainedSpells) {
      // Remove one remaining spell
      playerCard.metadata.remainedSpells --;
    }

    // No spell remaining
    if (!playerCard?.metadata?.remainedSpells) {
      // Get the spells in the hand & delete the associated actions
      gameInstance.cards
        .filter((card: IGameCard) => card.location === 'hand' && card.user === params.gameCard.user && card.card.type === 'spell')
        .forEach((card: IGameCard) => {
          const actions: Array<IGameAction<any>> = gameInstance.actions.current.filter((a: IGameAction<any>) => a.type === `spell-${card.card.id}`);
          actions.forEach((action: IGameAction<any>) => {
            if (action.type === `spell-${params.gameCard.id}`) {
              // Skip to delete that spell
              return;
            }
            gameInstance.actions.current = gameInstance.actions.current.filter((a: IGameAction<any>) => a !== action);
            gameInstance.actions.previous.push({
              ...action,
              passedAt: Date.now(),
            });
          });
        });
    }

    return true;
  }

}
