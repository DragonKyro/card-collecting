// Scoring helpers for Sea Salt & Paper.
//
// A player's score = duo-pair points (1 per pair) + collector-set points
// + multiplier points + mermaid color bonus. Multipliers do NOT count as
// their referenced family. Mermaids do NOT score points themselves but enable
// color counting (mermaids are white).

import type { SspCard, SspCardFamily, SspColor } from './types';
import { FAMILY } from './cards';

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

/** Opts for cards-with-trio-cancel + per-player event holdings. */
export interface CardPointsOpts {
  /** Card ids of cards whose duo-pair scoring should be SKIPPED because they
   *  were played as part of a starfish trio. The trio itself scores 3 pts via
   *  `trios` instead. */
  trioCancelledIds?: Set<number>;
  /** Trio groups owned by this player; each scores a flat 3 pts. */
  trios?: number;
}

/** Sum of point values from the cards themselves (no color bonus). */
export function cardPoints(cards: SspCard[], opts: CardPointsOpts = {}): number {
  // Optionally drop trio-bound cards from duo-pair counting so they don't
  // double-score (the trio bonus is added separately below).
  const effective = opts.trioCancelledIds
    ? cards.filter((c) => !opts.trioCancelledIds!.has(c.id))
    : cards;

  const familyCounts: Partial<Record<SspCardFamily, number>> = {};
  for (const c of effective) {
    familyCounts[c.family] = (familyCounts[c.family] ?? 0) + 1;
  }

  let total = 0;

  // Duo pairs: number of completed pairs we can form from the input set.
  // Salt: lobster pairs with crab, jellyfish pairs with swimmer. Greedy
  // pairing: dedicated Salt pairings first so we don't double-spend a crab/
  // swimmer that could match its base partner.
  const crab = familyCounts.crab ?? 0;
  const boat = familyCounts.boat ?? 0;
  const fish = familyCounts.fish ?? 0;
  const shark = familyCounts.shark ?? 0;
  const swimmer = familyCounts.swimmer ?? 0;
  const jellyfish = familyCounts.jellyfish ?? 0;
  const lobster = familyCounts.lobster ?? 0;

  const lobsterPairs = Math.min(lobster, crab);
  const crabAfterLobster = crab - lobsterPairs;
  total += lobsterPairs;
  total += Math.floor(crabAfterLobster / 2);

  const jellyfishPairs = Math.min(jellyfish, swimmer);
  const swimmerAfterJelly = swimmer - jellyfishPairs;
  total += jellyfishPairs;
  total += Math.min(shark, swimmerAfterJelly);

  total += Math.floor(boat / 2);
  total += Math.floor(fish / 2);

  // Starfish trios — each is worth a flat 3 pts.
  total += 3 * (opts.trios ?? 0);

  // Collectors. Seahorse is a wildcard collector — figure out which collector
  // gains the most from one additional card and apply it (rulebook: must have
  // at least one card of that collector; capped at that set's max payout).
  const collectorCounts = {
    shell: familyCounts.shell ?? 0,
    octopus: familyCounts.octopus ?? 0,
    penguin: familyCounts.penguin ?? 0,
    sailor: familyCounts.sailor ?? 0,
  };
  const seahorse = familyCounts.seahorse ?? 0;
  if (seahorse > 0) {
    // Pick the collector family where +1 card yields the biggest score gain
    // (over no-seahorse baseline). Ties broken by collector iteration order.
    let bestGain = 0;
    let bestFam: keyof typeof collectorCounts | null = null;
    for (const fam of ['shell', 'octopus', 'penguin', 'sailor'] as const) {
      const baseline = collectorPoints(fam, collectorCounts[fam]);
      const augmented = collectorCounts[fam] >= 1
        ? collectorPoints(fam, collectorCounts[fam] + 1)
        : 0; // seahorse needs at least one of that collector
      const gain = augmented - baseline;
      if (gain > bestGain) {
        bestGain = gain;
        bestFam = fam;
      }
    }
    total += bestGain;
    void bestFam;
  }

  total += collectorPoints('shell', collectorCounts.shell);
  total += collectorPoints('octopus', collectorCounts.octopus);
  total += collectorPoints('penguin', collectorCounts.penguin);
  total += collectorPoints('sailor', collectorCounts.sailor);

  // Multipliers
  if (familyCounts.lighthouse) total += familyCounts.boat ?? 0;
  if (familyCounts.shoal) total += familyCounts.fish ?? 0;
  if (familyCounts.penguinColony) total += 2 * (familyCounts.penguin ?? 0);
  if (familyCounts.captain) total += 3 * (familyCounts.sailor ?? 0);
  if (familyCounts.crabBasket) total += familyCounts.crab ?? 0;

  return total;
}

export interface TotalScoreOpts extends CardPointsOpts {
  /** Calm Waters event: double the mermaid color bonus. */
  doubleColorBonus?: boolean;
}

/** Sum card points + mermaid color bonus across all of a player's cards. */
export function totalScore(
  handAndTable: SspCard[],
  opts: TotalScoreOpts = {},
): { cardPoints: number; colorBonus: number; total: number } {
  const cp = cardPoints(handAndTable, opts);
  let cb = mermaidColorBonus(handAndTable);
  if (opts.doubleColorBonus) cb *= 2;
  return { cardPoints: cp, colorBonus: cb, total: cp + cb };
}

/** Convenience — combined hand + table for a player. */
export function allCards(hand: SspCard[], table: SspCard[]): SspCard[] {
  return [...hand, ...table];
}

/** True if the two cards form a valid duo pair (Salt-aware: jellyfish+swimmer
 *  and lobster+crab are also valid). Symmetric. */
export function isValidDuoPair(a: SspCard, b: SspCard): boolean {
  if (a.id === b.id) return false;
  if (a.family === b.family) {
    return a.family === 'crab' || a.family === 'boat' || a.family === 'fish';
  }
  const pairs: ReadonlyArray<[SspCardFamily, SspCardFamily]> = [
    ['shark', 'swimmer'],
    ['jellyfish', 'swimmer'],
    ['lobster', 'crab'],
  ];
  for (const [x, y] of pairs) {
    if ((a.family === x && b.family === y) || (a.family === y && b.family === x)) {
      return true;
    }
  }
  return false;
}

/** True if the three cards form a valid starfish trio (any duo pair + one starfish). */
export function isValidStarfishTrio(a: SspCard, b: SspCard, c: SspCard): boolean {
  const cards = [a, b, c];
  const star = cards.find((x) => x.family === 'starfish');
  if (!star) return false;
  const rest = cards.filter((x) => x.id !== star.id);
  if (rest.length !== 2) return false;
  return isValidDuoPair(rest[0], rest[1]);
}

/** Used by the "can end round?" check. Mirrors total score, including color bonus. */
export function tentativeScore(hand: SspCard[], table: SspCard[], opts: TotalScoreOpts = {}): number {
  return totalScore(allCards(hand, table), opts).total;
}

/** A card's nominal point contribution for AI heuristics — see ai.ts for the full model. */
export function isFamily(card: SspCard, family: SspCardFamily): boolean {
  return card.family === family;
}

/** Reference to keep callers honest the family list lives in cards.ts. */
export const _FAMILY = FAMILY;
