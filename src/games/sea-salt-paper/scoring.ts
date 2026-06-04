// Scoring helpers for Sea Salt & Paper.
//
// A player's score = duo-pair points (1 per pair) + collector-set points
// + multiplier points + mermaid color bonus. Multipliers do NOT count as
// their referenced family. Mermaids do NOT score points themselves but enable
// color counting (mermaids are white).

import type { SspCard, SspCardFamily, SspColor } from './types';
import { duoPartner, FAMILY } from './cards';

// Each table is indexed by the number of cards held (so PTS[0] = 0 cards, PTS[1] = 1 card, …).
// Rulebook: a single collector card scores 0 — only sets pay out.
export const SHELL_POINTS   = [0, 0, 2, 4, 6, 8, 10] as const;  // up to 6
export const OCTOPUS_POINTS = [0, 0, 3, 6, 9, 12]    as const;  // up to 5
export const PENGUIN_POINTS = [0, 1, 3, 5]           as const;  // up to 3
export const SAILOR_POINTS  = [0, 0, 5]              as const;  // up to 2

/** Total points if a player has the given count of each scoring family. */
export function collectorPoints(family: SspCardFamily, count: number): number {
  if (count <= 0) return 0;
  const pick = <T extends ReadonlyArray<number>>(arr: T): number =>
    arr[Math.min(count, arr.length - 1)];
  switch (family) {
    case 'shell':   return pick(SHELL_POINTS);
    case 'octopus': return pick(OCTOPUS_POINTS);
    case 'penguin': return pick(PENGUIN_POINTS);
    case 'sailor':  return pick(SAILOR_POINTS);
    default:        return 0;
  }
}

export function countBy<T extends string>(items: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const x of items) out[x] = (out[x] ?? 0) + 1;
  return out;
}

/**
 * Compute the color bonus: for each mermaid held, take the most-frequent
 * remaining color group. No color can be claimed by more than one mermaid.
 * Mermaids themselves are white. Multiplier cards have their own colors and
 * count toward color groups (they are real cards, just not their referenced
 * family).
 */
export function mermaidColorBonus(cards: SspCard[]): number {
  let mermaidCount = 0;
  const byColor: Record<SspColor, number> = {
    white: 0, yellow: 0, green: 0, pink: 0, purple: 0,
    lightblue: 0, darkblue: 0, black: 0, gray: 0,
  };
  for (const c of cards) {
    byColor[c.color] += 1;
    if (c.family === 'mermaid') mermaidCount += 1;
  }
  if (mermaidCount === 0) return 0;

  const groups = Object.values(byColor).sort((a, b) => b - a);
  let bonus = 0;
  for (let i = 0; i < mermaidCount && i < groups.length; i++) {
    bonus += groups[i];
  }
  return bonus;
}

/** Sum of point values from the cards themselves (no color bonus). */
export function cardPoints(cards: SspCard[]): number {
  const familyCounts: Partial<Record<SspCardFamily, number>> = {};
  for (const c of cards) {
    familyCounts[c.family] = (familyCounts[c.family] ?? 0) + 1;
  }

  let total = 0;

  // Duo pairs: hand cards do NOT count as pairs. The rulebook's "duo pair"
  // scoring is for cards on the table (played). Caller decides which subset
  // to pass for duo pair calculation. Here we conservatively count UNORDERED
  // pairs within the input set, since callers pass either (hand+table) or
  // just table — and the hand can never have completed pairs to score (they'd
  // be played). Practically: number of completed pairs we can form.
  let crab = familyCounts.crab ?? 0;
  let boat = familyCounts.boat ?? 0;
  let fish = familyCounts.fish ?? 0;
  let shark = familyCounts.shark ?? 0;
  let swimmer = familyCounts.swimmer ?? 0;
  total += Math.floor(crab / 2);
  total += Math.floor(boat / 2);
  total += Math.floor(fish / 2);
  total += Math.min(shark, swimmer);

  // Collectors
  total += collectorPoints('shell', familyCounts.shell ?? 0);
  total += collectorPoints('octopus', familyCounts.octopus ?? 0);
  total += collectorPoints('penguin', familyCounts.penguin ?? 0);
  total += collectorPoints('sailor', familyCounts.sailor ?? 0);

  // Multipliers
  if (familyCounts.lighthouse) total += familyCounts.boat ?? 0;
  if (familyCounts.shoal) total += familyCounts.fish ?? 0;
  if (familyCounts.penguinColony) total += 2 * (familyCounts.penguin ?? 0);
  if (familyCounts.captain) total += 3 * (familyCounts.sailor ?? 0);

  return total;
}

/** Sum card points + mermaid color bonus across all of a player's cards. */
export function totalScore(handAndTable: SspCard[]): { cardPoints: number; colorBonus: number; total: number } {
  const cp = cardPoints(handAndTable);
  const cb = mermaidColorBonus(handAndTable);
  return { cardPoints: cp, colorBonus: cb, total: cp + cb };
}

/** Convenience — combined hand + table for a player. */
export function allCards(hand: SspCard[], table: SspCard[]): SspCard[] {
  return [...hand, ...table];
}

/** True if the two cards form a valid duo pair. */
export function isValidDuoPair(a: SspCard, b: SspCard): boolean {
  if (a.id === b.id) return false;
  if (a.family === b.family) {
    return a.family === 'crab' || a.family === 'boat' || a.family === 'fish';
  }
  const partner = duoPartner(a.family);
  return partner === b.family;
}

/** Used by the "can end round?" check. Mirrors total score, including color bonus. */
export function tentativeScore(hand: SspCard[], table: SspCard[]): number {
  return totalScore(allCards(hand, table)).total;
}

/** A card's nominal point contribution for AI heuristics — see ai.ts for the full model. */
export function isFamily(card: SspCard, family: SspCardFamily): boolean {
  return card.family === family;
}

/** Reference to keep callers honest the family list lives in cards.ts. */
export const _FAMILY = FAMILY;
