import { IGameCard, IGameInstance } from '@thefirstspine/types-matches';
import { cardSide } from '@thefirstspine/types-game';

/**
 * Returns a copy of a card, changing its stats
 * @param card
 * @param gameInstance
 */
export function rotateCard(card: IGameCard, gameInstance: IGameInstance, viewerUser?: number) {
  // Determine which user's perspective to use. Default: the card owner (backwards compatible).
  const perspectiveUser = viewerUser !== undefined ? viewerUser : card.user;
  // Get the current user index
  const currentIndex = gameInstance.gameUsers.findIndex((w) => w.user == perspectiveUser);

  // Copy card to not fuck everything
  const copy: IGameCard = JSON.parse(JSON.stringify(card));

  // 180 degrees rotation when perspective is the second player
  if (currentIndex === 1) {
    copy.currentStats.bottom = JSON.parse(JSON.stringify(card.currentStats.top));
    copy.currentStats.top = JSON.parse(JSON.stringify(card.currentStats.bottom));
    copy.currentStats.left = JSON.parse(JSON.stringify(card.currentStats.right));
    copy.currentStats.right = JSON.parse(JSON.stringify(card.currentStats.left));
  }

  return copy;
}

/**
 * For a given side name and player, returns the side index in the getSubjectiveSides array.
 * Accounts for the fact that rotateCard swaps sides for player 1.
 * @param side The side name (top, right, bottom, left)
 * @param playerIndex The player index (0 or 1)
 * @returns The index in the subjective sides array
 */
function getSideIndexInSubjectiveSides(side: cardSide, playerIndex: number): number {
  // For player 1, the stats are rotated, so we need to look up the opposite side
  const mappedSide = playerIndex === 1 ? getOppositeSide(side) : side;
  
  // Now map the absolute side to the array index
  const sideToIndex: {[k in cardSide]: number} = {
    right: 0,
    left: 1,
    bottom: 2,
    top: 3,
  };
  return sideToIndex[mappedSide];
}

function getOppositeSide(side: cardSide): cardSide {
  const oppositeSide: {[k in cardSide]: cardSide} = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };
  return oppositeSide[side];
}
export function getSubjectiveSides(userId: number, gameInstance: IGameInstance) {
  // Get the current user index
  const currentIndex = gameInstance.gameUsers.findIndex((w) => w.user == userId);

  // 180 degrees rotation
  if (currentIndex === 0) {
    return [
      {x: 1, y: 0},
      {x: -1, y: 0},
      {x: 0, y: -1},
      {x: 0, y: 1},
    ];
  }

  return [
    {x: -1, y: 0},
    {x: 1, y: 0},
    {x: 0, y: 1},
    {x: 0, y: -1},
  ];
}

/**
 * Get the board coordinates for a specific side of a card, accounting for the card owner's rotation.
 * @param side The side name (as it appears in rotatedCard.currentStats)
 * @param card The original card (not rotated)
 * @param gameInstance Game instance
 * @returns The board coordinates for that side
 */
export function getSideCoords(side: cardSide, card: IGameCard, gameInstance: IGameInstance): {x: number, y: number} {
  const ownerIndex = gameInstance.gameUsers.findIndex((w) => w.user == card.user);
  const subjectiveSides = getSubjectiveSides(card.user, gameInstance);
  const sideIndex = getSideIndexInSubjectiveSides(side, ownerIndex);
  const sideDelta = subjectiveSides[sideIndex];
  
  return {
    x: card.coords.x + sideDelta.x,
    y: card.coords.y + sideDelta.y,
  };
}
