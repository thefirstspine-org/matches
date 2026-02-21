import { IGameCard, IGameInstance } from '@thefirstspine/types-matches';

/**
 * Returns a copy of a card, changing its stats
 * @param card
 * @param gameInstance
 */
export function rotateCard(card: IGameCard, gameInstance: IGameInstance) {
  // Get the current user index
  const currentIndex = gameInstance.gameUsers.findIndex((w) => w.user === card.user);

  // Copy card to not fuck everything
  const copy: IGameCard = JSON.parse(JSON.stringify(card));

  // 180 degrees rotation
  if (currentIndex === 0) {
    copy.currentStats.bottom = JSON.parse(JSON.stringify(card.currentStats.top));
    copy.currentStats.top = JSON.parse(JSON.stringify(card.currentStats.bottom));
    copy.currentStats.left = JSON.parse(JSON.stringify(card.currentStats.right));
    copy.currentStats.right = JSON.parse(JSON.stringify(card.currentStats.left));
  }

  return copy;
}
export function getSubjectiveSides(userId: number, gameInstance: IGameInstance) {
  // Get the current user index
  const currentIndex = gameInstance.gameUsers.findIndex((w) => w.user === userId);

  // 180 degrees rotation
  if (currentIndex === 0) {
    return [
      {x: 1, y: 0},
      {x: -1, y: 0},
      {x: 0, y: 1},
      {x: 0, y: -1},
    ];
  }

  return [
      {x: -1, y: 0},
      {x: 1, y: 0},
      {x: 0, y: -1},
      {x: 0, y: 1},
    ];
}
