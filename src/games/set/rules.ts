// Set rules, expressed as linear algebra over the CardSpace.
//
// Two classes cover every variant this game ships:
//
//   ZeroSumRule(n)   n cards whose vectors sum to 0.
//                      n=3 over Z_3 → Set        ("all same or all different")
//                      n=6 over Z_3 → GhostSet   (3 pairs with a common set)
//                      n=4 over Z_2 → 4Set       (AAAA / ABCD / AABB, i.e. XOR)
//   PairSumRule(2)   4 cards splittable into two pairs with equal sums,
//                    i.e. two pairs sharing the same completing card → UltraSet.
//
// Both use CardSpace.completion() to solve for the missing card instead of
// scanning, which is what keeps enumeration cheap: a Set search over a 12-card
// board is 66 pair lookups, and an UltraSet search is O(board²) rather than the
// O(board³) triple loop the reference implementation uses.
//
// A new variant is a new subclass here plus an entry in modes.ts. Nothing else
// in the game needs to know it exists.

import type { CardId, CardSpace } from './cards';
import { cardGroupKey } from './cards';

export type SetRuleKind = 'zeroSum' | 'pairSum';

/** Constrain a search to groups that reuse exactly `count` of `cards`
 *  (the chain modes' "exactly N cards from the previous set" requirement). */
export interface SearchAnchor {
  cards: readonly CardId[];
  count: number;
}

export interface SearchOptions {
  anchor?: SearchAnchor;
  /** Group keys (see cardGroupKey) to skip — puzzle mode's already-found sets. */
  exclude?: ReadonlySet<string>;
}

export abstract class SetRule {
  abstract readonly kind: SetRuleKind;
  /** How many cards a valid group contains. */
  abstract readonly size: number;
  /** Name used in messages: "Not a set" / "Not an UltraSet". */
  abstract readonly noun: string;

  constructor(readonly space: CardSpace) {}

  /** Validate a group. Returns the cards in canonical order (pair-major for
   *  PairSumRule, so the UI can show which cards pair up), or null. */
  abstract check(cards: readonly CardId[]): CardId[] | null;

  /** Every valid group inside `pool`, deduped, respecting `opts`. */
  abstract enumerate(pool: readonly CardId[], opts?: SearchOptions): Generator<CardId[]>;

  isValid(cards: readonly CardId[]): boolean {
    return this.check(cards) !== null;
  }

  /** First valid group, or null if the pool is dead. */
  findFirst(pool: readonly CardId[], opts?: SearchOptions): CardId[] | null {
    for (const group of this.enumerate(pool, opts)) return group;
    return null;
  }

  /** How many distinct valid groups the pool holds. Only used by puzzle modes
   *  and the rules book — never on a hot path with a big pool. */
  countAll(pool: readonly CardId[], opts?: SearchOptions): number {
    let n = 0;
    for (const _group of this.enumerate(pool, opts)) n++;
    return n;
  }
}

/** `size` cards whose vectors sum to zero. */
export class ZeroSumRule extends SetRule {
  readonly kind = 'zeroSum';

  constructor(space: CardSpace, readonly size: number, readonly noun: string) {
    super(space);
  }

  check(cards: readonly CardId[]): CardId[] | null {
    if (cards.length !== this.size) return null;
    if (hasDuplicates(cards)) return null;
    return this.space.isZero(this.space.sum(cards)) ? cards.slice() : null;
  }

  *enumerate(pool: readonly CardId[], opts?: SearchOptions): Generator<CardId[]> {
    const poolSet = new Set(pool);
    const seen = new Set<string>();
    const exclude = opts?.exclude;
    // The last card of a zero-sum group is forced, so we only ever choose
    // size-1 cards and look the final one up.
    for (const partial of anchoredPartials(pool, this.size - 1, opts?.anchor)) {
      const last = this.space.completion(partial);
      if (!poolSet.has(last)) continue;
      if (partial.includes(last)) continue;
      const group = [...partial, last];
      const key = cardGroupKey(group);
      if (seen.has(key)) continue;
      seen.add(key);
      if (exclude?.has(key)) continue;
      yield group;
    }
  }
}

/** Two pairs sharing the same completing card (UltraSet). Generalises to
 *  `pairs` pairs, though only 2 is used today. */
export class PairSumRule extends SetRule {
  readonly kind = 'pairSum';
  readonly size: number;

  constructor(space: CardSpace, readonly pairs: number, readonly noun: string) {
    super(space);
    this.size = pairs * 2;
  }

  check(cards: readonly CardId[]): CardId[] | null {
    if (cards.length !== this.size) return null;
    if (hasDuplicates(cards)) return null;
    for (const pairing of pairings(cards)) {
      const target = this.space.completion(pairing[0]);
      if (pairing.every((pair) => this.space.completion(pair) === target)) {
        return pairing.flat();
      }
    }
    return null;
  }

  *enumerate(pool: readonly CardId[], opts?: SearchOptions): Generator<CardId[]> {
    const seen = new Set<string>();
    const exclude = opts?.exclude;
    if (opts?.anchor) {
      // Anchored search: the anchor cards may be split across pairs, so we take
      // the straightforward route — every legal split, validated. The pools are
      // tiny (a 4-card anchor and a ~12-card board), so this stays cheap.
      for (const partial of anchoredPartials(pool, this.size, opts.anchor)) {
        const group = this.check(partial);
        if (!group) continue;
        const key = cardGroupKey(group);
        if (seen.has(key)) continue;
        seen.add(key);
        if (exclude?.has(key)) continue;
        yield group;
      }
      return;
    }
    if (this.pairs !== 2) {
      // Generic fallback for hypothetical 3-pair rules.
      for (const partial of combinations(pool, this.size)) {
        const group = this.check(partial);
        if (!group) continue;
        const key = cardGroupKey(group);
        if (exclude?.has(key)) continue;
        yield group;
      }
      return;
    }
    // Bucket every pair by the card that completes it; two disjoint pairs in the
    // same bucket are an UltraSet. O(pool²) pairs, then O(bucket²) per bucket.
    const buckets = new Map<CardId, [CardId, CardId][]>();
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const pair: [CardId, CardId] = [pool[i], pool[j]];
        const ghost = this.space.completion(pair);
        const list = buckets.get(ghost);
        if (list) list.push(pair);
        else buckets.set(ghost, [pair]);
      }
    }
    for (const list of buckets.values()) {
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const [p, q] = [list[a], list[b]];
          if (p[0] === q[0] || p[0] === q[1] || p[1] === q[0] || p[1] === q[1]) continue;
          const group = [...p, ...q];
          const key = cardGroupKey(group);
          if (seen.has(key)) continue;
          seen.add(key);
          if (exclude?.has(key)) continue;
          yield group;
        }
      }
    }
  }
}

// ----- combinatorial helpers -----

function hasDuplicates(cards: readonly CardId[]): boolean {
  return new Set(cards).size !== cards.length;
}

/** All k-subsets of `pool`, as arrays in pool order. */
export function* combinations<T>(pool: readonly T[], k: number): Generator<T[]> {
  if (k < 0 || k > pool.length) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k === 0) { yield []; return; }
  for (;;) {
    yield idx.map((i) => pool[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === pool.length - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** Groups of `total` cards drawn from `pool`, optionally forced to reuse exactly
 *  `anchor.count` cards from `anchor.cards`. Anchor cards are excluded from the
 *  pool side so the count is exact. */
function* anchoredPartials(
  pool: readonly CardId[],
  total: number,
  anchor?: SearchAnchor,
): Generator<CardId[]> {
  if (!anchor || anchor.count <= 0 || anchor.cards.length === 0) {
    yield* combinations(pool, total);
    return;
  }
  const anchorSet = new Set(anchor.cards);
  const rest = pool.filter((c) => !anchorSet.has(c));
  const fromPool = total - anchor.count;
  if (fromPool < 0) return;
  for (const picked of combinations(anchor.cards, anchor.count)) {
    for (const others of combinations(rest, fromPool)) {
      yield [...picked, ...others];
    }
  }
}

/** All ways to split 2n cards into n unordered pairs. */
function* pairings(cards: readonly CardId[]): Generator<CardId[][]> {
  if (cards.length === 0) { yield []; return; }
  const [first, ...rest] = cards;
  for (let i = 0; i < rest.length; i++) {
    const remainder = rest.filter((_, j) => j !== i);
    for (const tail of pairings(remainder)) {
      yield [[first, rest[i]], ...tail];
    }
  }
}
