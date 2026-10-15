// The vector model has to agree with the human-readable rules, so these tests
// check it two ways: exhaustively against the "all same or all different"
// formulation, and against worked examples lifted from the rules prose.

import { describe, expect, it } from 'vitest';
import { CardSpace } from './cards';
import { PairSumRule, ZeroSumRule, combinations } from './rules';
import { engineFor, SET_MODES } from './modes';

const setSpace = CardSpace.forMode(4, 3);
const juniorSpace = CardSpace.forMode(3, 3);
const fourSpace = CardSpace.forMode(4, 4);

describe('CardSpace', () => {
  it('sizes decks as variants ^ traits', () => {
    expect(juniorSpace.deckSize).toBe(27);
    expect(setSpace.deckSize).toBe(81);
    expect(CardSpace.forMode(5, 3).deckSize).toBe(243);
    expect(CardSpace.forMode(3, 4).deckSize).toBe(64);
    expect(fourSpace.deckSize).toBe(256);
  });

  it('generates each card exactly once', () => {
    const all = setSpace.allCards();
    expect(all).toHaveLength(81);
    expect(new Set(all).size).toBe(81);
    expect(all.every((c) => c.length === 4)).toBe(true);
  });

  it('round-trips cards through their vector', () => {
    for (const card of fourSpace.allCards()) {
      expect(fourSpace.cardOf(fourSpace.vectorOf(card))).toBe(card);
    }
  });

  it('solves for the completing card of a mod-3 pair', () => {
    // Same digit stays; differing digits give the third value.
    expect(setSpace.completion(['1202', '1122'])).toBe('1012');
    expect(setSpace.completion(['0212', '2112'])).toBe('1012');
    expect(setSpace.completion(['0000', '0000'])).toBe('0000');
  });

  it('solves for the completing card of a Klein-four triple (XOR)', () => {
    expect(fourSpace.completion(['2130', '3201', '0312'])).toBe('1023');
  });
});

describe('ZeroSumRule — Set', () => {
  const rule = new ZeroSumRule(setSpace, 3, 'set');

  /** The textbook formulation: per feature, all same or all different. */
  function classicallyValid(space: CardSpace, cards: readonly string[]): boolean {
    for (let t = 0; t < space.traitCount; t++) {
      const vals = cards.map((c) => space.traitValues(c)[t]);
      const distinct = new Set(vals).size;
      if (distinct !== 1 && distinct !== vals.length) return false;
    }
    return true;
  }

  it('agrees with "all same or all different" on every triple of the Junior deck', () => {
    const juniorRule = new ZeroSumRule(juniorSpace, 3, 'set');
    const deck = juniorSpace.allCards();
    let valid = 0;
    for (const trio of combinations(deck, 3)) {
      const byVector = juniorRule.isValid(trio);
      expect(byVector).toBe(classicallyValid(juniorSpace, trio));
      if (byVector) valid++;
    }
    // A 27-card deck has 27 * 26 / 6 = 117 sets (each pair has one completion).
    expect(valid).toBe(117);
  });

  it('rejects groups of the wrong size or with duplicates', () => {
    expect(rule.isValid(['0000', '1111'])).toBe(false);
    expect(rule.isValid(['0000', '0000', '0000'])).toBe(false);
  });

  it('finds a set on any board that has one, and none on one that does not', () => {
    // Three cards that differ in exactly one feature are never a set.
    const dead = ['0000', '0001', '1000'];
    expect(rule.findFirst(dead)).toBeNull();
    expect(rule.findFirst([...dead, '2000'])).toEqual(['0000', '1000', '2000']);
  });
});

describe('ZeroSumRule — 4Set', () => {
  const rule = new ZeroSumRule(fourSpace, 4, '4Set');

  it('accepts exactly the AAAA / ABCD / AABB patterns, feature by feature', () => {
    const axis = fourSpace.axes[0];
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) {
        for (let c = 0; c < 4; c++) {
          for (let d = 0; d < 4; d++) {
            const counts = new Map<number, number>();
            for (const v of [a, b, c, d]) counts.set(v, (counts.get(v) ?? 0) + 1);
            const shape = [...counts.values()].sort((x, y) => y - x).join('');
            const wantValid = shape === '4' || shape === '1111' || shape === '22';
            const coords = [a, b, c, d]
              .map((v) => axis.embed(v))
              .reduce((acc, v) => acc.map((x, i) => x + v[i]));
            const gotValid = coords.every((x) => x % axis.modulus === 0);
            expect(gotValid).toBe(wantValid);
          }
        }
      }
    }
  });

  it('accepts the worked examples and rejects the counter-example', () => {
    expect(rule.isValid(['2130', '3201', '0312', '1023'])).toBe(true);
    expect(rule.isValid(['1102', '1101', '1202', '1201'])).toBe(true);
    expect(rule.isValid(['3101', '1201', '2231', '0131'])).toBe(true);
    expect(rule.isValid(['2310', '1200', '1132', '2022'])).toBe(true);
    // Colours are AAAB and counts ABCC — not a 4Set.
    expect(rule.isValid(['0001', '0102', '0200', '1300'])).toBe(false);
  });
});

describe('PairSumRule — UltraSet', () => {
  const rule = new PairSumRule(setSpace, 2, 'UltraSet');

  it('accepts four cards whose two pairs share a completing card', () => {
    const cards = ['1202', '1122', '0212', '2112'];
    expect(rule.isValid(cards)).toBe(true);
    // Order must not matter.
    expect(rule.isValid(['0212', '1202', '2112', '1122'])).toBe(true);
  });

  it('returns the cards in pair-major order', () => {
    const group = rule.check(['1202', '0212', '1122', '2112']);
    expect(group).not.toBeNull();
    const [a, b, c, d] = group!;
    expect(setSpace.completion([a, b])).toBe(setSpace.completion([c, d]));
  });

  it('rejects four cards with no common completion', () => {
    expect(rule.isValid(['0000', '0001', '0002', '0010'])).toBe(false);
  });

  it('enumerates only valid, distinct groups', () => {
    const board = setSpace.allCards().slice(0, 12);
    const groups = [...rule.enumerate(board)];
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(new Set(g).size).toBe(4);
      expect(rule.isValid(g)).toBe(true);
    }
    const keys = groups.map((g) => g.slice().sort().join('|'));
    expect(new Set(keys).size).toBe(groups.length);
  });
});

describe('ZeroSumRule — GhostSet', () => {
  const rule = new ZeroSumRule(setSpace, 6, 'GhostSet');

  it('accepts the worked example, whose three completions form a set', () => {
    const cards = ['0211', '2211', '1100', '2222', '0210', '1012'];
    expect(rule.isValid(cards)).toBe(true);
    const ghosts = [
      setSpace.completion(['0211', '2211']),
      setSpace.completion(['1100', '2222']),
      setSpace.completion(['0210', '1012']),
    ];
    expect(ghosts).toEqual(['1211', '0011', '2111']);
    expect(new ZeroSumRule(setSpace, 3, 'set').isValid(ghosts)).toBe(true);
  });

  it('accepts two disjoint sets stacked together', () => {
    const twoSets = ['0000', '1000', '2000', '0001', '1001', '2001'];
    expect(rule.isValid(twoSets)).toBe(true);
  });
});

describe('search constraints', () => {
  it('honours the chain anchor — exactly N cards from the previous group', () => {
    const engine = engineFor('setchain');
    const deck = engine.space.allCards();
    const board = deck.slice(20, 32);
    const lastSet = ['0000', '1000', '2000'];
    const group = engine.findSet(board, lastSet);
    expect(group).not.toBeNull();
    expect(group!.filter((c) => lastSet.includes(c))).toHaveLength(1);
    expect(engine.rule.isValid(group!)).toBe(true);
  });

  it('honours the puzzle exclusion list', () => {
    const engine = engineFor('puzzle');
    const board = engine.space.allCards().slice(0, 12);
    const first = engine.findSet(board)!;
    const key = first.slice().sort().join('|');
    const second = engine.findSet(board, [], [key]);
    expect(second).not.toBeNull();
    expect(second!.slice().sort().join('|')).not.toBe(key);
  });
});

describe('mode registry', () => {
  it('gives every mode a distinct id and a working engine', () => {
    expect(new Set(SET_MODES.map((m) => m.id)).size).toBe(SET_MODES.length);
    for (const spec of SET_MODES) {
      const engine = engineFor(spec.id);
      expect(engine.setSize).toBeGreaterThanOrEqual(3);
      expect(engine.deckSize).toBe(spec.variants ** spec.traitCount);
      expect(engine.freshDeck()).toHaveLength(engine.deckSize);
    }
  });

  it('memoises engines per mode', () => {
    expect(engineFor('normal')).toBe(engineFor('normal'));
  });
});
