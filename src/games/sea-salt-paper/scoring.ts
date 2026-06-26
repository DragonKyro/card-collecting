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
/** Mermaid claims (counted as CARD POINTS in our display): for each mermaid
 *  held, claim the largest unclaimed NON-WHITE color group. White is reserved
 *  for mermaids themselves (handled separately by the LAST CHANCE special
 *  color bonus when applicable). Two mermaids claim two DISTINCT groups —
 *  the second mermaid cannot claim the same color again. */
export function mermaidColorBonus(cards: SspCard[], opts: { forceMinMermaids?: number } = {}): number {
  let mermaidCount = 0;
  const byColor: Record<SspColor, number> = {
    white: 0, yellow: 0, green: 0, pink: 0, purple: 0,
    teal: 0, darkblue: 0, black: 0, gray: 0, orange: 0, tan: 0,
  };
  for (const c of cards) {
    byColor[c.color] += 1;
    if (c.family === 'mermaid') mermaidCount += 1;
  }
  const effective = Math.max(mermaidCount, opts.forceMinMermaids ?? 0);
  if (effective === 0) return 0;

  const groups: number[] = [];
  for (const [color, n] of Object.entries(byColor)) {
    if (color === 'white') continue;
    if (n > 0) groups.push(n);
  }
  groups.sort((a, b) => b - a);
  let bonus = 0;
  for (let i = 0; i < effective && i < groups.length; i++) {
    bonus += groups[i];
  }
  return bonus;
}

/** "Special color bonus" per the rulebook: 1 point per card of the color the
 *  player has most of (their single largest color group, including white).
 *  Earned by every player when the round ended via LAST CHANCE; not earned
 *  on STOP / deck-empty / mermaid-win. Computed independently of the mermaid
 *  claims that go into the card-points column. */
export function specialColorBonus(cards: SspCard[]): number {
  const byColor: Record<SspColor, number> = {
    white: 0, yellow: 0, green: 0, pink: 0, purple: 0,
    teal: 0, darkblue: 0, black: 0, gray: 0, orange: 0, tan: 0,
  };
  for (const c of cards) byColor[c.color] += 1;
  let best = 0;
  for (const n of Object.values(byColor)) if (n > best) best = n;
  return best;
}

/** Opts for cards-with-trio-cancel + per-player event holdings. */
export interface CardPointsOpts {
  /** Card ids of cards whose duo-pair scoring should be SKIPPED because they
   *  were played as part of a starfish trio. The trio itself scores 3 pts via
   *  `trios` instead. */
  trioCancelledIds?: Set<number>;
  /** Trio groups owned by this player; each scores a flat 3 pts. */
  trios?: number;
  // ---- Extra Pepper event scoring overrides ----
  /** Dance of the Shells: each shell scores 2 pts; skip the shell collector set. */
  shellPerCard?: boolean;
  /** The Kraken: each octopus scores 1 pt; skip the octopus collector set. */
  octopusPerCard?: boolean;
  /** Tornado: mermaids contribute 0 pts (but the instant-win at 4 still fires). */
  mermaidsScoreZero?: boolean;
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
  // Extra Pepper overrides: Dance of the Shells skips the shell collector and
  // scores each shell flat 2 pts; The Kraken skips the octopus collector and
  // scores each octopus 1 pt. The seahorse wildcard still considers all four
  // collectors (it gets included in the set normally where active).
  const collectorCounts = {
    shell: familyCounts.shell ?? 0,
    octopus: familyCounts.octopus ?? 0,
    penguin: familyCounts.penguin ?? 0,
    sailor: familyCounts.sailor ?? 0,
  };
  const shellPerCard = opts.shellPerCard === true;
  const octopusPerCard = opts.octopusPerCard === true;
  const seahorse = familyCounts.seahorse ?? 0;
  if (seahorse > 0) {
    // Pick the collector family where +1 card yields the biggest score gain
    // (over no-seahorse baseline). Ties broken by collector iteration order.
    let bestGain = 0;
    let bestFam: keyof typeof collectorCounts | null = null;
    for (const fam of ['shell', 'octopus', 'penguin', 'sailor'] as const) {
      // Skip collectors whose per-card override is in effect — Seahorse isn't
      // a "shell" in those modes either.
      if (fam === 'shell' && shellPerCard) continue;
      if (fam === 'octopus' && octopusPerCard) continue;
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

  if (shellPerCard) total += 2 * collectorCounts.shell;
  else total += collectorPoints('shell', collectorCounts.shell);
  if (octopusPerCard) total += collectorCounts.octopus;
  else total += collectorPoints('octopus', collectorCounts.octopus);
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
  /** Calm Waters (legacy) event: double the mermaid color bonus. */
  doubleColorBonus?: boolean;
  /** Round ended via LAST CHANCE → every player earns the special color bonus
   *  (1 point per card of their most-frequent color). On STOP / deck-empty /
   *  mermaid-win the bonus column is 0. */
  lastChanceColorBonus?: boolean;
}

/** Score breakdown displayed on the round-end summary.
 *  - `cardPoints` = full card scoring: duos + collectors + multipliers + trios
 *    + mermaid claims (each mermaid claims its largest unclaimed non-white
 *    color group). This is the score used to determine who wins the round.
 *  - `colorBonus` = the rulebook's "special color bonus": 1 point per card of
 *    the player's most-frequent color (any color, including white). EARNED
 *    ONLY ON LAST CHANCE — both the caller and the opponents get this; on
 *    STOP / deck-empty / mermaid-win the bonus is 0.
 *  - `total` = sum of the two.
 *
 *  The LAST CHANCE forfeit (whichever side loses the bet) gets only the
 *  `colorBonus` column for that round; that logic lives in the reducer.
 */
export function totalScore(
  handAndTable: SspCard[],
  opts: TotalScoreOpts = {},
): { cardPoints: number; colorBonus: number; total: number } {
  const cp = cardPoints(handAndTable, opts);
  if (opts.mermaidsScoreZero) {
    return { cardPoints: cp, colorBonus: 0, total: cp };
  }
  let claims = mermaidColorBonus(handAndTable, { forceMinMermaids: 0 });
  if (opts.doubleColorBonus) claims *= 2;
  const cards = cp + claims;
  // The special color bonus is always computed (displayed) but only counts
  // toward total when LAST CHANCE was called. Callers that just need the
  // tentative score (e.g. STOP-threshold checks) leave lastChanceColorBonus
  // off → bonus is shown × in the round summary and excluded from total.
  const bonus = specialColorBonus(handAndTable);
  const counts = !!opts.lastChanceColorBonus;
  return {
    cardPoints: cards,
    colorBonus: bonus,
    total: cards + (counts ? bonus : 0),
  };
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

/** Per-category point breakdown for a player's end-of-round tableau. Useful
 *  for post-match analytics. Order matches cardPoints() internals so the sum
 *  of categories equals cardPoints (and total = sum + mermaidClaim + colorBonus
 *  if LAST CHANCE was active).
 *
 *  Categories are mutually exclusive — every scored point lands in exactly one. */
export interface CategoryBreakdown {
  /** Duo pair points (1 pt per pair, including starfish trio replacements where applicable). */
  duos: number;
  /** Collector set points (shell/octopus/penguin/sailor + seahorse wildcard). */
  sets: number;
  /** Multiplier card bonuses (lighthouse/shoal/penguinColony/captain/crabBasket). */
  multipliers: number;
  /** Starfish trio points (3 pts per trio). */
  trios: number;
  /** Mermaid color-group claim points (largest unclaimed non-white group per mermaid). */
  mermaidClaim: number;
  /** Special LAST CHANCE color bonus (largest single color group, including white).
   *  Only counts toward the total when LAST CHANCE was the round-end mechanism. */
  colorBonus: number;
}

/** Compute the full category breakdown for a player's hand+table. The numeric
 *  categories sum to the same total as totalScore.cardPoints + .colorBonus. */
export function categoryBreakdown(cards: SspCard[], opts: TotalScoreOpts = {}): CategoryBreakdown {
  // Re-run scoring per category. We compute each category in isolation to keep
  // this function readable; the result MUST be consistent with cardPoints()'s
  // sum. Cards in trios are excluded from duo counting (matches cardPoints).
  const effective = opts.trioCancelledIds
    ? cards.filter((c) => !opts.trioCancelledIds!.has(c.id))
    : cards;
  const counts: Partial<Record<SspCardFamily, number>> = {};
  for (const c of effective) counts[c.family] = (counts[c.family] ?? 0) + 1;

  // Duo pairs (Salt-aware): replicate cardPoints' greedy pairing.
  const crab = counts.crab ?? 0;
  const boat = counts.boat ?? 0;
  const fish = counts.fish ?? 0;
  const shark = counts.shark ?? 0;
  const swimmer = counts.swimmer ?? 0;
  const jellyfish = counts.jellyfish ?? 0;
  const lobster = counts.lobster ?? 0;
  let duos = 0;
  const lobsterPairs = Math.min(lobster, crab);
  duos += lobsterPairs;
  duos += Math.floor((crab - lobsterPairs) / 2);
  const jellyfishPairs = Math.min(jellyfish, swimmer);
  duos += jellyfishPairs;
  duos += Math.min(shark, swimmer - jellyfishPairs);
  duos += Math.floor(boat / 2);
  duos += Math.floor(fish / 2);

  // Trios — 3 pts each.
  const trios = 3 * (opts.trios ?? 0);

  // Collector sets.
  const shellPerCard = opts.shellPerCard === true;
  const octopusPerCard = opts.octopusPerCard === true;
  const shells = counts.shell ?? 0;
  const octopi = counts.octopus ?? 0;
  const penguins = counts.penguin ?? 0;
  const sailors = counts.sailor ?? 0;
  const seahorse = counts.seahorse ?? 0;
  let sets = 0;
  if (shellPerCard) sets += 2 * shells;
  else sets += collectorPoints('shell', shells);
  if (octopusPerCard) sets += octopi;
  else sets += collectorPoints('octopus', octopi);
  sets += collectorPoints('penguin', penguins);
  sets += collectorPoints('sailor', sailors);
  if (seahorse > 0) {
    let bestGain = 0;
    for (const fam of ['shell', 'octopus', 'penguin', 'sailor'] as const) {
      if (fam === 'shell' && shellPerCard) continue;
      if (fam === 'octopus' && octopusPerCard) continue;
      const n = counts[fam] ?? 0;
      if (n < 1) continue;
      const gain = collectorPoints(fam, n + 1) - collectorPoints(fam, n);
      if (gain > bestGain) bestGain = gain;
    }
    sets += bestGain;
  }

  // Multipliers.
  let multipliers = 0;
  if (counts.lighthouse)    multipliers += counts.boat ?? 0;
  if (counts.shoal)         multipliers += counts.fish ?? 0;
  if (counts.penguinColony) multipliers += 2 * (counts.penguin ?? 0);
  if (counts.captain)       multipliers += 3 * (counts.sailor ?? 0);
  if (counts.crabBasket)    multipliers += counts.crab ?? 0;

  // Mermaid claims (largest non-white group per mermaid). Skip if Tornado is in
  // force (mermaids score 0).
  let mermaidClaim = 0;
  if (!opts.mermaidsScoreZero) {
    let mc = mermaidColorBonus(cards, { forceMinMermaids: 0 });
    if (opts.doubleColorBonus) mc *= 2;
    mermaidClaim = mc;
  }

  // Special LAST CHANCE color bonus.
  const colorBonus = opts.mermaidsScoreZero ? 0 : specialColorBonus(cards);

  return { duos, sets, multipliers, trios, mermaidClaim, colorBonus };
}

/** Reference to keep callers honest the family list lives in cards.ts. */
export const _FAMILY = FAMILY;
