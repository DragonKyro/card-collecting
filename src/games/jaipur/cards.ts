// Jaipur — the card and token tables (see the header of types.ts).

import type { JaipurBonusSize, JaipurCardType, JaipurGood } from './types';

/** Display and encoding order: the order the token piles sit in. */
export const GOODS: readonly JaipurGood[] = ['diamond', 'gold', 'silver', 'cloth', 'spice', 'leather'];
export const CARD_TYPES: readonly JaipurCardType[] = [...GOODS, 'camel'];
export const BONUS_SIZES: readonly JaipurBonusSize[] = [3, 4, 5];

export const CARD_COUNTS: Record<JaipurCardType, number> = {
  diamond: 6, gold: 6, silver: 6, cloth: 8, spice: 8, leather: 10, camel: 11,
};
export const DECK_SIZE = 55;

/** Each good's tokens, top (most valuable) first. */
export const TOKEN_VALUES: Record<JaipurGood, readonly number[]> = {
  diamond: [7, 7, 5, 5, 5],
  gold: [6, 6, 5, 5, 5],
  silver: [5, 5, 5, 5, 5],
  cloth: [5, 3, 3, 2, 2, 1, 1],
  spice: [5, 3, 3, 2, 2, 1, 1],
  leather: [4, 3, 2, 1, 1, 1, 1, 1, 1],
};

export const BONUS_VALUES: Record<JaipurBonusSize, readonly number[]> = {
  3: [3, 3, 2, 2, 2, 1, 1],
  4: [6, 6, 5, 5, 4, 4],
  5: [10, 10, 9, 8, 8],
};

export const CAMEL_TOKEN = 5;
export const MARKET_SIZE = 5;
export const HAND_LIMIT = 7;
export const HAND_DEAL = 5;
export const MARKET_CAMELS = 3;
/** The round ends once this many goods piles are empty. */
export const EMPTY_PILES_TO_END = 3;
/** Diamond, gold and silver sell 2 at a time at least. */
export const PRECIOUS: ReadonlySet<JaipurGood> = new Set(['diamond', 'gold', 'silver']);

export function minSale(good: JaipurGood): number {
  return PRECIOUS.has(good) ? 2 : 1;
}

/** Bonus pile earned by selling `count` cards at once, or null. */
export function bonusSizeFor(count: number): JaipurBonusSize | null {
  return count >= 5 ? 5 : count === 4 ? 4 : count === 3 ? 3 : null;
}

/** Average value of a bonus pile as dealt. */
export const BONUS_MEAN: Record<JaipurBonusSize, number> = {
  3: BONUS_VALUES[3].reduce((a, b) => a + b, 0) / BONUS_VALUES[3].length,
  4: BONUS_VALUES[4].reduce((a, b) => a + b, 0) / BONUS_VALUES[4].length,
  5: BONUS_VALUES[5].reduce((a, b) => a + b, 0) / BONUS_VALUES[5].length,
};

export interface CardTypeInfo {
  label: string;
  plural: string;
  /** Card / token colour. */
  color: string;
  /** Darker edge for frames and text on the colour. */
  ink: string;
}

export const CARD_INFO: Record<JaipurCardType, CardTypeInfo> = {
  diamond: { label: 'Diamond', plural: 'Diamonds', color: '#d8343f', ink: '#7a121b' },
  gold: { label: 'Gold', plural: 'Gold', color: '#e9b52c', ink: '#7d5508' },
  silver: { label: 'Silver', plural: 'Silver', color: '#a9b3bd', ink: '#46505b' },
  cloth: { label: 'Cloth', plural: 'Cloth', color: '#9b4fb4', ink: '#4b1b5c' },
  spice: { label: 'Spice', plural: 'Spice', color: '#4f9a3c', ink: '#21481a' },
  leather: { label: 'Leather', plural: 'Leather', color: '#9a6236', ink: '#4a2a12' },
  camel: { label: 'Camel', plural: 'Camels', color: '#e2c58f', ink: '#7a5a2a' },
};

export function cardLabel(type: JaipurCardType, n = 1): string {
  return n === 1 ? CARD_INFO[type].label : CARD_INFO[type].plural;
}
