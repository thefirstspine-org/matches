import { IGameHook } from './game-hook.interface';
import { Injectable } from '@nestjs/common';
import { IGameInstance, IGameCard, IGameAction } from '@thefirstspine/types-matches';
import { GameHookService } from './game-hook.service';
import { ICard } from '@thefirstspine/types-game';
import { GameAssetsService } from '../../game-assets/game-assets.service';
import { randBetween } from '../../utils/maths.utils';
import { GameWorkerService } from '../game-worker/game-worker.service';

/**
 * This subscriber is executed once a 'game:card:destroyed' event is thrown. It will look for dead
 * cards and place it on the discard.
 * @param gameInstance
 * @param params
 */
@Injectable()
export class CardDestroyedGameHook implements IGameHook {

  constructor(
    private readonly gameHookService: GameHookService,
    private readonly restService: GameAssetsService,
    private readonly gameWorkerService: GameWorkerService,
  ) {}

  async execute(gameInstance: IGameInstance, params: {gameCard: IGameCard, source: IGameCard}): Promise<boolean> {
    let discard: boolean = true;

    if (params.gameCard?.currentStats?.capacities?.includes('burdenEarth')) {
      // On a card with "burdenEarth" capacity, place a Burden Earth card
      const burdenEarth: ICard = await this.restService.card('burden-earth');
      const randomId: number = randBetween(0, Number.MAX_SAFE_INTEGER);
      const burdenEarthGameCard: IGameCard = {
        card: burdenEarth,
        id: `${gameInstance.id}_${randomId}`,
        location: 'board',
        user: params.gameCard.user,
        coords: {
          x: params.gameCard.coords.x,
          y: params.gameCard.coords.y,
        },
      };
      gameInstance.cards.push(burdenEarthGameCard);
    }

    if (params.gameCard?.currentStats?.capacities?.includes('treason') && params.gameCard.user !== params?.source?.user) {
      // On a card with "treason" capacity, replace the card at the same position only on an empty square
      const card: IGameCard|undefined = gameInstance.cards.find((c: IGameCard) => {
        return c !== params.gameCard &&
          c.location === 'board' &&
          c.coords?.x === params.gameCard.coords?.x &&
          c.coords?.y === params.gameCard.coords?.y &&
          (
            c.card.type === 'creature' || c.card.type === 'artifact' || c.card.type === 'player' ||
            c.card.id === 'ditch' || c.card.id === 'burden-earth'
          );
      });
      if (!card) {
        // Do not discard the card at the end of the hook execution
        discard = false;
        // The square is free, replace it
        params.gameCard.location = 'board';
        params.gameCard.user = params.source.user;
        params.gameCard.currentStats = JSON.parse(JSON.stringify(params.gameCard.card.stats));
        if (params.gameCard.currentStats.capacities) {
          params.gameCard.currentStats.capacities = params.gameCard.currentStats.capacities.filter(c => c !== 'treason');
        }
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('insanes-run')) {
      // Create a new action
      const action: IGameAction<any> = await this.gameWorkerService.getWorker('insanes-run-effect')
        .create(gameInstance, {user: params.gameCard.user});
      // Add it to the current actions
      if (action.interaction.params.boardCoords.length > 0) {
        gameInstance.actions.current.push(action);
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('guardian')) {
      // Get the player card of the user
      const user: number = params.gameCard.user;
      const wizardCard: IGameCard|undefined = gameInstance.cards.find((c: IGameCard) => {
        return c.card.type === 'player' && c.user === user;
      });

      // Guard for wizard card existence
      if (wizardCard) {
        // Add life to the wizard
        wizardCard.currentStats.life += 2;
        await this.gameHookService.dispatch(
          gameInstance,
          `card:lifeChanged:healed:${wizardCard.card.id}`,
          {gameCard: wizardCard, source: params.gameCard, lifeChanged: 2});
      }
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
        wizardCard.currentStats.bottom.defense -= 1;
        wizardCard.currentStats.left.defense -= 1;
        wizardCard.currentStats.right.defense -= 1;
        wizardCard.currentStats.top.defense -= 1;
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
        wizardCard.currentStats.bottom.strength -= 1;
        wizardCard.currentStats.left.strength -= 1;
        wizardCard.currentStats.right.strength -= 1;
        wizardCard.currentStats.top.strength -= 1;
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('volkha')) {
      // Create a new action
      const action: IGameAction<any> = await this.gameWorkerService.getWorker('volka-effect')
        .create(gameInstance, {user: params.gameCard.user});
      // Add it to the current actions
      if (action.interaction.params.boardCoords.length > 0) {
        gameInstance.actions.current.push(action);
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('jellyfish')) {
      // Test for possibility to put a water card
      if (!gameInstance.cards.find((c: IGameCard) => {
        return c.location === 'board' &&
          c.coords.x === params.gameCard.coords.x &&
          c.coords.y === params.gameCard.coords.y &&
          (['creature', 'artifact'].includes(c.card.type) || ['burden-earth', 'ditch'].includes(c.card.id));
      })) {
        const water: ICard = await this.restService.card('water');
        const randomId: number = randBetween(0, Number.MAX_SAFE_INTEGER);
        const waterGameCard: IGameCard = {
          card: water,
          id: `${gameInstance.id}_${randomId}`,
          location: 'board',
          user: 0,
          coords: {
            x: params.gameCard.coords.x,
            y: params.gameCard.coords.y,
          },
        };
        gameInstance.cards.push(waterGameCard);
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('pocket-volcano')) {
      // Test for possibility to put a ditch card
      if (!gameInstance.cards.find((c: IGameCard) => {
        return c.location === 'board' &&
          c.coords.x === params.gameCard.coords.x &&
          c.coords.y === params.gameCard.coords.y &&
          (['creature', 'artifact'].includes(c.card.type) || ['burden-earth', 'ditch'].includes(c.card.id));
      })) {
        const ditch: ICard = await this.restService.card('lava');
        const randomId: number = randBetween(0, Number.MAX_SAFE_INTEGER);
        const ditchGameCard: IGameCard = {
          card: ditch,
          id: `${gameInstance.id}_${randomId}`,
          location: 'board',
          user: 0,
          coords: {
            x: params.gameCard.coords.x,
            y: params.gameCard.coords.y,
          },
        };
        gameInstance.cards.push(ditchGameCard);
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('annihilation-matt')) {
      // Get the player associate with the source
      const player: IGameCard|undefined = gameInstance.cards.find((c: IGameCard) => c.user === params.source.user && c.card.type === 'player');
      if (player) {
        player.currentStats.life -= 10;
        await this.gameHookService.dispatch(
          gameInstance,
          `card:lifeChanged:damaged:${player.card.type}:${player.card.id}`,
          {gameCard: player, source: params.gameCard, lifeChanged: -10});
      }
    }

    if (params.gameCard?.currentStats?.effects?.includes('ice-statue')) {
      const possibleCards: string[] = [
        'frozen-fox',
        'frozen-viper',
        'frozen-banshee',
      ];
      const iceStatueCard: ICard = await this.restService.card(possibleCards[randBetween(0, possibleCards.length - 1)]);
      const randomId: number = randBetween(0, Number.MAX_SAFE_INTEGER);
      gameInstance.cards.push({
        card: iceStatueCard,
        id: `${gameInstance.id}_${randomId}`,
        location: 'board',
        metadata: {},
        user: params.source.user,
        currentStats: JSON.parse(JSON.stringify(iceStatueCard.stats)),
        coords: JSON.parse(JSON.stringify(params.gameCard.coords)),
      });
    }

    if (params.gameCard?.currentStats?.effects?.includes('spawn-insanes-echo')) {
      if (!gameInstance.cards.find((c: IGameCard) => {
        return c.location === 'board' &&
          c.id != params.gameCard.id &&
          c.coords.x === params.gameCard.coords.x &&
          c.coords.y === params.gameCard.coords.y &&
          (['creature', 'artifact'].includes(c.card.type) || ['burden-earth', 'ditch'].includes(c.card.id));
      })) {
        const insaneEcho: ICard = await this.restService.card('insanes-echo');
        const randomId: number = randBetween(0, Number.MAX_SAFE_INTEGER);
        const insanesEchoGameCard: IGameCard = {
          card: insaneEcho,
          id: `${gameInstance.id}_${randomId}`,
          location: 'board',
          user: params.source.user,
          currentStats: insaneEcho.stats,
          coords: {
            x: params.gameCard.coords.x,
            y: params.gameCard.coords.y,
          },
        };
        gameInstance.cards.push(insanesEchoGameCard);
      }
    }

    // Discard the card
    if (discard) {
      params.gameCard.location = 'discard';
      await this.gameHookService.dispatch(gameInstance, `card:discarded:${params.gameCard.card.id}`, {gameCard: params.gameCard});
    }

    return true;
  }

}
