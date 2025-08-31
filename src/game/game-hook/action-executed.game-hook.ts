import { IGameHook } from './game-hook.interface';
import { Injectable } from '@nestjs/common';
import { IGameInstance, IGameCard, IGameAction } from '@thefirstspine/types-matches';
import { ICardCoords } from '@thefirstspine/types-game';
import { rotateCard } from '../../utils/game.utils';

@Injectable()
export class ActionExecutedGameHook implements IGameHook {

  constructor(
  ) {}

  async execute(gameInstance: IGameInstance, params: {user: number, action: IGameAction<any>}): Promise<boolean> {
    // Get the cards on the board to decrease iterations
    const cardsOnBoard: IGameCard[] = gameInstance.cards.filter((c) => c.location === 'board');

    // Reset all cards stats on the board
    cardsOnBoard.forEach((c: IGameCard) => {
      if (c.metadata?.aurastrength) {
        c.currentStats.bottom.strength -= c.metadata.aurastrength;
        c.currentStats.left.strength -= c.metadata.aurastrength;
        c.currentStats.right.strength -= c.metadata.aurastrength;
        c.currentStats.top.strength -= c.metadata.aurastrength;
        c.metadata.aurastrength = 0;
      }
      if (c.metadata?.guardDefense) {
        c.currentStats.bottom.defense -= c.metadata.guardDefense;
        c.currentStats.left.defense -= c.metadata.guardDefense;
        c.currentStats.right.defense -= c.metadata.guardDefense;
        c.currentStats.top.defense -= c.metadata.guardDefense;
        c.metadata.guardDefense = 0;
      }
      if (c.metadata?.jesterstrength) {
        c.currentStats.bottom.strength -= c.metadata.jesterstrength;
        c.currentStats.left.strength -= c.metadata.jesterstrength;
        c.currentStats.right.strength -= c.metadata.jesterstrength;
        c.currentStats.top.strength -= c.metadata.jesterstrength;
        c.metadata.jesterstrength = 0;
      }
      if (c.metadata?.hammerstrength) {
        c.currentStats.bottom.strength -= c.metadata.hammerstrength;
        c.currentStats.left.strength -= c.metadata.hammerstrength;
        c.currentStats.right.strength -= c.metadata.hammerstrength;
        c.currentStats.top.strength -= c.metadata.hammerstrength;
        c.metadata.hammerstrength = 0;
      }
      if (c.metadata?.anvildefense) {
        c.currentStats.bottom.defense -= c.metadata.anvildefense;
        c.currentStats.left.defense -= c.metadata.anvildefense;
        c.currentStats.right.defense -= c.metadata.anvildefense;
        c.currentStats.top.defense -= c.metadata.anvildefense;
        c.metadata.anvildefense = 0;
      }
    });

    // Count the jesters
    const jesters: number = cardsOnBoard.filter((c) => c.currentStats?.effects?.includes('jester')).length;

    // Count the hammers & anvils
    const hammersPerUsers: {[key: number]: number} = {};
    const anvilsPerUsers: {[key: number]: number} = {};
    gameInstance.cards.forEach((c: IGameCard) => {
      hammersPerUsers[c.user] = hammersPerUsers[c.user] ? hammersPerUsers[c.user] : 0;
      if (c.currentStats?.effects?.includes('flesh-hammer') && c.location === 'board') {
        hammersPerUsers[c.user] ++;
      }
      anvilsPerUsers[c.user] = anvilsPerUsers[c.user] ? anvilsPerUsers[c.user] : 0;
      if (c.currentStats?.effects?.includes('anvil-of-xiarmha') && c.location === 'board') {
        anvilsPerUsers[c.user] ++;
      }
    });

    // Main loop for cards on board
    cardsOnBoard.forEach((gameCard: IGameCard) => {
      if (!gameCard.currentStats) {
        // There is no stat in this game card
        // No stat on board means a special square that has no effect in this loop
        return;
      }

      // Increase jester's strength
      if (gameCard.currentStats?.effects?.includes('jester')) {
        gameCard.currentStats.bottom.strength += jesters * 2;
        gameCard.currentStats.left.strength += jesters * 2;
        gameCard.currentStats.right.strength += jesters * 2;
        gameCard.currentStats.top.strength += jesters * 2;
        gameCard.metadata.jesterstrength = jesters * 2;
      }

      // From now, we need rotated card
      const rotatedCard: IGameCard = rotateCard(gameCard, gameInstance);
      
      // Sides of the card
      const sides = [
        {x: rotatedCard.coords.x + 1, y: rotatedCard.coords.y},
        {x: rotatedCard.coords.x - 1, y: rotatedCard.coords.y},
        {x: rotatedCard.coords.x, y: rotatedCard.coords.y + 1},
        {x: rotatedCard.coords.x, y: rotatedCard.coords.y - 1},
      ];

      // Increase aura
      ['right', 'left', 'bottom', 'top'].forEach((side: string, sideIndex: number) => {
        if (rotatedCard?.currentStats?.[side]?.capacity === 'aura') {
          // Find a card on the board, with the same user to the position
          const position: ICardCoords = sides[sideIndex];
          const cardTarget: IGameCard|undefined = cardsOnBoard.find((cardTargetPotential: IGameCard) => {
            return ['artifact', 'creature', 'player'].includes(cardTargetPotential.card.type) &&
              rotatedCard.user === cardTargetPotential.user &&
              position.x === cardTargetPotential.coords.x &&
              position.y === cardTargetPotential.coords.y;
          });
          if (cardTarget !== undefined) {
            cardTarget.currentStats.bottom.strength += 2;
            cardTarget.currentStats.top.strength += 2;
            cardTarget.currentStats.right.strength += 2;
            cardTarget.currentStats.left.strength += 2;
            cardTarget.metadata.aurastrength = cardTarget.metadata.aurastrength ?
              cardTarget.metadata.aurastrength + 2 :
              2;
          }
          }
      });

      // Increase defense
      ['right', 'left', 'bottom', 'top'].forEach((side: string, sideIndex: number) => {
        if (rotatedCard?.currentStats?.[side]?.capacity === 'guard') {
          // Find a card on the board, with the same user to the position
          const position: ICardCoords = sides[sideIndex];
          const cardTarget: IGameCard|undefined = cardsOnBoard.find((cardTargetPotential: IGameCard) => {
            return ['artifact', 'creature', 'player'].includes(cardTargetPotential.card.type) &&
              rotatedCard.user === cardTargetPotential.user &&
              position.x === cardTargetPotential.coords.x &&
              position.y === cardTargetPotential.coords.y;
          });
          if (cardTarget !== undefined) {
            cardTarget.currentStats.bottom.defense += 2;
            cardTarget.currentStats.top.defense += 2;
            cardTarget.currentStats.right.defense += 2;
            cardTarget.currentStats.left.defense += 2;
            cardTarget.metadata.guardDefense = cardTarget.metadata.guardDefense ?
              cardTarget.metadata.guardDefense + 2 :
              2;
          }
          }
      });

      // Increase strength with the hammers
      if (hammersPerUsers[gameCard.user] > 0 && gameCard.card.type === 'creature') {
        gameCard.currentStats.bottom.strength += hammersPerUsers[gameCard.user] * 2;
        gameCard.currentStats.top.strength += hammersPerUsers[gameCard.user] * 2;
        gameCard.currentStats.right.strength += hammersPerUsers[gameCard.user] * 2;
        gameCard.currentStats.left.strength += hammersPerUsers[gameCard.user] * 2;
        gameCard.metadata.hammerstrength = hammersPerUsers[gameCard.user] * 2;
      }

      // Increase defense with the anvils
      if (anvilsPerUsers[gameCard.user] > 0 && gameCard.card.type === 'artifact') {
        gameCard.currentStats.bottom.defense += anvilsPerUsers[gameCard.user] * 1;
        gameCard.currentStats.top.defense += anvilsPerUsers[gameCard.user] * 1;
        gameCard.currentStats.right.defense += anvilsPerUsers[gameCard.user] * 1;
        gameCard.currentStats.left.defense += anvilsPerUsers[gameCard.user] * 1;
        gameCard.metadata.anvildefense = anvilsPerUsers[gameCard.user] * 1;
      }
    });

    return true;
  }

}
