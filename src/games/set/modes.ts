// Game modes.
//
// A mode is pure data: which trait axes the deck uses, which rule decides a valid
// group, and four orthogonal twists (chain / puzzle / shuffle / face-down). Every
// variant in the reference implementation falls out of that product, and so will
// the drill modes — a new drill is a new SET_MODES entry (plus, if it needs one,
// an objective field the reducer reads), not a new reducer branch.
//
// ModeEngine is the compiled form of a spec: spec + CardSpace + SetRule, with the
// searches the reducer and board policy need. Engines are derived data, never
// stored in game state (state only ever holds the mode id), and are memoised
// because building one allocates a card space and rule object.

import type { CardId } from './cards';
import { CardSpace, cardGroupKey } from './cards';
import type { SearchAnchor, SetRule } from './rules';
import { PairSumRule, ZeroSumRule } from './rules';

export type SetModeId =
  | 'normal' | 'junior' | 'megaset'
  | 'setchain' | 'ultrachain' | '4setjrchain'
  | 'ultraset' | 'ultra9' | 'ghostset'
  | '4set' | '4setjr'
  | 'puzzle' | 'ultra9puzzle' | '4setjrpuzzle'
  | 'shuffle' | 'memory';

export type SetRuleFamily = 'set' | 'ultraset' | 'ghostset' | '4set';

export type SetModeGroup = 'classic' | 'chain' | 'ultra' | 'fourset' | 'puzzle' | 'twist';

export interface SetModeSpec {
  readonly id: SetModeId;
  readonly name: string;
  readonly group: SetModeGroup;
  /** One-line description shown in the lobby and the rules book. */
  readonly blurb: string;
  readonly family: SetRuleFamily;
  /** Number of traits per card: 3, 4 or 5. */
  readonly traitCount: number;
  /** Variants per trait: 3 (mod-3 traits) or 4 (Klein-four traits). */
  readonly variants: number;
  /** Cards that must be reused from the previous group. 0 = no chaining. */
  readonly chain: number;
  /** Find every group on the board before it advances. */
  readonly puzzle: boolean;
  /** Reshuffle the board after each group. */
  readonly shuffle: boolean;
  /** Deal face down — only the current selection is visible. */
  readonly faceDown: boolean;
  /** Smallest board the mode ever shows; grows by 3s when no group exists. */
  readonly minBoardSize: number;
}

export const SET_MODES: readonly SetModeSpec[] = [
  {
    id: 'normal', name: 'Normal', group: 'classic', family: 'set',
    blurb: 'Classic Set. Three cards where every feature is all the same or all different.',
    traitCount: 4, variants: 3, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 12,
  },
  {
    id: 'junior', name: 'Junior', group: 'classic', family: 'set',
    blurb: 'Solid shading only — three features instead of four. A 27-card deck.',
    traitCount: 3, variants: 3, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 9,
  },
  {
    id: 'megaset', name: 'MegaSet', group: 'classic', family: 'set',
    blurb: 'A fifth feature — border style. 243 cards, 16 on the board. A long game.',
    traitCount: 5, variants: 3, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 16,
  },
  {
    id: 'setchain', name: 'Set-Chain', group: 'chain', family: 'set',
    blurb: 'Every set after the first must reuse exactly one card from the previous set.',
    traitCount: 4, variants: 3, chain: 1, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 12,
  },
  {
    id: 'ultrachain', name: 'UltraSet-Chain', group: 'chain', family: 'ultraset',
    blurb: 'Set-Chain meets UltraSet: reuse exactly two cards from the previous UltraSet.',
    traitCount: 4, variants: 3, chain: 2, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 12,
  },
  {
    id: '4setjrchain', name: '4Set Jr-Chain', group: 'chain', family: '4set',
    blurb: 'Junior 4Sets, chained — reuse exactly two cards from the previous 4Set.',
    traitCount: 3, variants: 4, chain: 2, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 11,
  },
  {
    id: 'ultraset', name: 'UltraSet', group: 'ultra', family: 'ultraset',
    blurb: 'Four cards forming two pairs that complete to the same fifth card.',
    traitCount: 4, variants: 3, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 12,
  },
  {
    id: 'ultra9', name: 'Ultra9', group: 'ultra', family: 'ultraset',
    blurb: 'UltraSet on a 9-card board — around 5 UltraSets instead of 19. Much harder.',
    traitCount: 4, variants: 3, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 9,
  },
  {
    id: 'ghostset', name: 'GhostSet', group: 'ultra', family: 'ghostset',
    blurb: 'Six cards in three pairs whose three completing cards themselves form a set.',
    traitCount: 4, variants: 3, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 10,
  },
  {
    id: '4set', name: '4Set', group: 'fourset', family: '4set',
    blurb: 'Four variants per feature. Pick four cards: all same, all different, or two pairs.',
    traitCount: 4, variants: 4, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 15,
  },
  {
    id: '4setjr', name: '4Set Junior', group: 'fourset', family: '4set',
    blurb: 'Solid shading only — three features. The place to start with 4Set.',
    traitCount: 3, variants: 4, chain: 0, puzzle: false, shuffle: false, faceDown: false,
    minBoardSize: 11,
  },
  {
    id: 'puzzle', name: 'Puzzle', group: 'puzzle', family: 'set',
    blurb: 'Find every set on the board before it advances. No racing the deck.',
    traitCount: 4, variants: 3, chain: 0, puzzle: true, shuffle: false, faceDown: false,
    minBoardSize: 12,
  },
  {
    id: 'ultra9puzzle', name: 'Ultra9 Puzzle', group: 'puzzle', family: 'ultraset',
    blurb: 'Clear every UltraSet from a 9-card board before it advances.',
    traitCount: 4, variants: 3, chain: 0, puzzle: true, shuffle: false, faceDown: false,
    minBoardSize: 9,
  },
  {
    id: '4setjrpuzzle', name: '4Set Jr-Puzzle', group: 'puzzle', family: '4set',
    blurb: 'Clear every junior 4Set from the board before it advances.',
    traitCount: 3, variants: 4, chain: 0, puzzle: true, shuffle: false, faceDown: false,
    minBoardSize: 11,
  },
  {
    id: 'shuffle', name: 'Shuffle', group: 'twist', family: 'set',
    blurb: 'Normal Set, but the whole board is reshuffled every time a set is taken.',
    traitCount: 4, variants: 3, chain: 0, puzzle: false, shuffle: true, faceDown: false,
    minBoardSize: 12,
  },
  {
    id: 'memory', name: 'Memory', group: 'twist', family: 'set',
    blurb: 'Set crossed with Concentration: 21 cards face down, reveal three at a time.',
    traitCount: 4, variants: 3, chain: 0, puzzle: false, shuffle: false, faceDown: true,
    minBoardSize: 21,
  },
];

export const MODE_GROUP_LABELS: Record<SetModeGroup, string> = {
  classic: 'Classic',
  chain: 'Chain',
  ultra: 'Ultra & Ghost',
  fourset: '4Set',
  puzzle: 'Puzzle',
  twist: 'Twists',
};

export const DEFAULT_MODE_ID: SetModeId = 'normal';

export function getModeSpec(id: SetModeId): SetModeSpec {
  const spec = SET_MODES.find((m) => m.id === id);
  if (!spec) throw new Error(`Unknown Set mode: ${id}`);
  return spec;
}

/** A spec plus the algebra it implies, and the searches built on top. */
export class ModeEngine {
  readonly space: CardSpace;
  readonly rule: SetRule;

  constructor(readonly spec: SetModeSpec) {
    this.space = CardSpace.forMode(spec.traitCount, spec.variants);
    this.rule = buildRule(spec.family, this.space);
  }

  get setSize(): number {
    return this.rule.size;
  }

  get deckSize(): number {
    return this.space.deckSize;
  }

  /** Full deck in odometer order; the reducer shuffles it with the match seed. */
  freshDeck(): CardId[] {
    return this.space.allCards();
  }

  /** Chain constraint for a search, given the previous group. */
  anchorFor(lastSet: readonly CardId[]): SearchAnchor | undefined {
    if (!this.spec.chain || lastSet.length === 0) return undefined;
    return { cards: lastSet, count: this.spec.chain };
  }

  /** Keys of groups the search must skip (puzzle modes). */
  excludeFor(foundKeys: readonly string[]): ReadonlySet<string> | undefined {
    if (!this.spec.puzzle || foundKeys.length === 0) return undefined;
    return new Set(foundKeys);
  }

  /** First legal group in `pool`, honouring chain + puzzle constraints. */
  findSet(
    pool: readonly CardId[],
    lastSet: readonly CardId[] = [],
    foundKeys: readonly string[] = [],
  ): CardId[] | null {
    return this.rule.findFirst(pool, {
      anchor: this.anchorFor(lastSet),
      exclude: this.excludeFor(foundKeys),
    });
  }

  /** Whether `pool` still holds a legal group. */
  hasSet(
    pool: readonly CardId[],
    lastSet: readonly CardId[] = [],
    foundKeys: readonly string[] = [],
  ): boolean {
    return this.findSet(pool, lastSet, foundKeys) !== null;
  }

  /** Validate a claim. Returns canonical order, or an error message. */
  validate(
    cards: readonly CardId[],
    lastSet: readonly CardId[],
    foundKeys: readonly string[],
  ): { ok: true; cards: CardId[] } | { ok: false; message: string } {
    const { chain, puzzle } = this.spec;
    if (chain && lastSet.length > 0) {
      const reused = cards.filter((c) => lastSet.includes(c)).length;
      if (reused !== chain) {
        return {
          ok: false,
          message: `${chain === 1 ? 'One card' : `${chain} cards`} must come from the previous ${this.rule.noun}`,
        };
      }
    }
    const group = this.rule.check(cards);
    if (!group) return { ok: false, message: `Not ${indefinite(this.rule.noun)}` };
    if (puzzle && foundKeys.includes(cardGroupKey(group))) {
      return { ok: false, message: `That ${this.rule.noun} was already found` };
    }
    return { ok: true, cards: alignWithChain(group, lastSet, chain) };
  }
}

function buildRule(family: SetRuleFamily, space: CardSpace): SetRule {
  switch (family) {
    case 'set': return new ZeroSumRule(space, 3, 'set');
    case 'ghostset': return new ZeroSumRule(space, 6, 'GhostSet');
    case '4set': return new ZeroSumRule(space, 4, '4Set');
    case 'ultraset': return new PairSumRule(space, 2, 'UltraSet');
  }
}

/** "a set" / "an UltraSet". */
function indefinite(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

/** In multi-card chains, put the reused cards in the slots they occupied in the
 *  previous group so the board moves as little as possible on screen. */
function alignWithChain(group: CardId[], lastSet: readonly CardId[], chain: number): CardId[] {
  if (chain < 2) return group;
  const out = group.slice();
  for (let i = 0; i < lastSet.length; i++) {
    const at = out.indexOf(lastSet[i]);
    if (at >= 0 && at !== i && i < out.length) {
      [out[i], out[at]] = [out[at], out[i]];
    }
  }
  return out;
}

const engineCache = new Map<SetModeId, ModeEngine>();

/** Memoised engine for a mode id. Pure — same id always yields the same engine. */
export function engineFor(id: SetModeId): ModeEngine {
  const hit = engineCache.get(id);
  if (hit) return hit;
  const engine = new ModeEngine(getModeSpec(id));
  engineCache.set(id, engine);
  return engine;
}
