import { IGameHook } from './game-hook.interface';
import { Injectable } from '@nestjs/common';
import { IGameInstance, IGameCard } from '@thefirstspine/types-matches';
import { GameHookService } from './game-hook.service';

/**
 * This subscriber is executed once a 'card:placed' event is thrown.
 * @param gameInstance
 * @param params
 */
@Injectable()
export class CardPlacedGameHook implements IGameHook {

  constructor(
    private readonly gameHookService: GameHookService,
  ) {}

  async execute(gameInstance: IGameInstance, params: {gameCard: IGameCard}): Promise<boolean> {

    if (params.gameCard.currentStats?.effects?.includes('soul-of-a-sacrified-hunter')) {
      let life: number = 0;
      let str: number = 0;

      // Get cards in the user's discard
      gameInstance.cards.forEach((c: IGameCard) => {
        if (c.user === params.gameCard.user && c.location === 'discard') {
          if (c.card.type === 'artifact') {
            str ++;
          }
          if (c.card.type === 'creature') {
            life ++;
          }
        }
      });

      // Set card current stats
      params.gameCard.currentStats.life += life;
      params.gameCard.currentStats.bottom.strength += str;
      params.gameCard.currentStats.left.strength += str;
      params.gameCard.currentStats.right.strength += str;
      params.gameCard.currentStats.top.strength += str;

      // Act like this is the original stats to avoid bugs in healing
      params.gameCard.card.stats.life += life;
      params.gameCard.card.stats.bottom.strength += str;
      params.gameCard.card.stats.left.strength += str;
      params.gameCard.card.stats.right.strength += str;
      params.gameCard.card.stats.top.strength += str;
    }

    if (params.gameCard?.currentStats?.effects?.includes('caduceus')) {
      // Get the player card of the user
      const user: number = params.gameCard.user;
      const wizardCard: IGameCard|undefined = gameInstance.cards.find((c: IGameCard) => {
        return c.card.type === 'player' && c.user === user;
      });

      // Guard for wizard card existence
      if (wizardCard) {
        // Add life to the wizard
        wizardCard.currentStats.bottom.defense += 1;
        wizardCard.currentStats.left.defense += 1;
        wizardCard.currentStats.right.defense += 1;
        wizardCard.currentStats.top.defense += 1;
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('talon')) {
      // Get the player card of the user
      const user: number = params.gameCard.user;
      const wizardCard: IGameCard|undefined = gameInstance.cards.find((c: IGameCard) => {
        return c.card.type === 'player' && c.user === user;
      });

      // Guard for wizard card existence
      if (wizardCard) {
        // Add life to the wizard
        wizardCard.currentStats.bottom.strength += 1;
        wizardCard.currentStats.left.strength += 1;
        wizardCard.currentStats.right.strength += 1;
        wizardCard.currentStats.top.strength += 1;
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('torturer')) {
      // Get the player card of the user
      const user: number = params.gameCard.user;
      const wizardCard: IGameCard|undefined = gameInstance.cards.find((c: IGameCard) => {
        return c.card.type === 'player' && c.user === user;
      });

      // Guard for wizard card existence
      if (!wizardCard) {
        return true;
      }

      // Add strength to the wizard
      wizardCard.currentStats.bottom.strength += 1;
      wizardCard.currentStats.left.strength += 1;
      wizardCard.currentStats.right.strength += 1;
      wizardCard.currentStats.top.strength += 1;

      // Remove life
      wizardCard.currentStats.life -= 1;
      this.gameHookService.dispatch(
        gameInstance,
        `card:lifeChanged:damaged:${wizardCard.card.type}:${wizardCard.card.id}`,
        {gameCard: wizardCard, source: params.gameCard, lifeChanged: -1});
    }

    if (params.gameCard?.currentStats?.effects?.includes('chimera')) {
      let lifeMissing: number = 0;

      // Get cards in the user's discard
      const player: IGameCard|undefined = gameInstance.cards.find((c: IGameCard) => c.user === params.gameCard.user && c.card.type === 'player');
      if (player) {
        lifeMissing = player.card.stats.life - player.currentStats.life;
      }

      // Set card current stats
      params.gameCard.currentStats.bottom.strength += lifeMissing;
      params.gameCard.currentStats.left.strength += lifeMissing;
      params.gameCard.currentStats.right.strength += lifeMissing;
      params.gameCard.currentStats.top.strength += lifeMissing;

      // Act like this is the original stats to avoid bugs in healing
      params.gameCard.card.stats.bottom.strength += lifeMissing;
      params.gameCard.card.stats.left.strength += lifeMissing;
      params.gameCard.card.stats.right.strength += lifeMissing;
      params.gameCard.card.stats.top.strength += lifeMissing;
    }

    return true;
  }

}
