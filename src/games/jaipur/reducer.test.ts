import { describe, it, expect } from 'vitest';
import type { JaipurCard, JaipurCardType, JaipurGood, JaipurState } from './types';
import { BONUS_VALUES, CARD_COUNTS, CARD_TYPES, DECK_SIZE, GOODS, TOKEN_VALUES } from './cards';
import { applyAction, createJaipurState, emptyPiles } from './reducer';
import { scoreRound } from './scoring';
import { DEFAULT_TEST_CONFIG, sampleStates, seatsFor } from './testSupport';

const fresh = (seed = 1) => createJaipurState(DEFAULT_TEST_CONFIG, seed, seatsFor());

let nextId = 1000;
const cards = (...types: JaipurCardType[]): JaipurCard[] => types.map((type) => ({ id: nextId++, type }));

/** A hand-built turn for p0: given market, hands and herds; deck of leather. */
function position(opts: {
  market: JaipurCardType[];
  hand?: JaipurCardType[];
  herd?: number;
  oppHand?: JaipurCardType[];
  deck?: JaipurCardType[];
}): JaipurState {
  const s = fresh();
  s.market = cards(...opts.market);
  s.players[0].hand = cards(...(opts.hand ?? []));
  s.players[0].herd = cards(...Array<JaipurCardType>(opts.herd ?? 0).fill('camel'));
  s.players[1].hand = cards(...(opts.oppHand ?? []));
  s.players[1].herd = [];
  s.deck = cards(...(opts.deck ?? Array<JaipurCardType>(20).fill('leather')));
  s.activePlayerId = 'p0';
  return s;
}

function allCardIds(s: JaipurState): number[] {
  return [
    ...s.deck, ...s.market, ...s.discard,
    ...s.players.flatMap((p) => [...p.hand, ...p.herd]),
  ].map((c) => c.id).sort((a, b) => a - b);
}

const typesOf = (cs: JaipurCard[]) => cs.map((c) => c.type);

describe('setup', () => {
  it('deals a 5-card market with 3 camels, 5 cards each with camels herded, and fresh piles', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = fresh(seed);
      expect(s.market).toHaveLength(5);
      expect(s.market.filter((c) => c.type === 'camel').length).toBeGreaterThanOrEqual(3);
      for (const p of s.players) {
        expect(p.hand.length + p.herd.length).toBe(5);
        expect(p.hand.every((c) => c.type !== 'camel')).toBe(true);
        expect(p.herd.every((c) => c.type === 'camel')).toBe(true);
      }
      expect(s.deck).toHaveLength(DECK_SIZE - 5 - 10);
      expect(allCardIds(s)).toEqual(Array.from({ length: DECK_SIZE }, (_, i) => i));
      for (const g of GOODS) expect(s.tokens[g].map((t) => t.value)).toEqual(TOKEN_VALUES[g]);
      for (const size of [3, 4, 5] as const) {
        expect(s.bonus[size].map((t) => t.value).sort()).toEqual([...BONUS_VALUES[size]].sort());
      }
      expect(s.activePlayerId).toBe(s.roundStarterId);
    }
  });

  it('has the printed card counts', () => {
    const s = fresh();
    const all = [...s.deck, ...s.market, ...s.players.flatMap((p) => [...p.hand, ...p.herd])];
    for (const t of CARD_TYPES) expect(all.filter((c) => c.type === t)).toHaveLength(CARD_COUNTS[t]);
  });

  it('is deterministic in the seed', () => {
    expect(JSON.stringify(fresh(42))).toBe(JSON.stringify(fresh(42)));
    expect(JSON.stringify(fresh(42).deck)).not.toBe(JSON.stringify(fresh(43).deck));
  });
});

describe('taking cards', () => {
  it('takes one good and refills its slot from the top of the deck', () => {
    const s = position({ market: ['camel', 'diamond', 'gold', 'camel', 'spice'], deck: ['cloth', 'silver'] });
    const diamond = s.market[1];
    const next = applyAction(s, { type: 'takeOne', cardId: diamond.id });
    expect(next.players[0].hand.map((c) => c.id)).toEqual([diamond.id]);
    expect(typesOf(next.market)).toEqual(['camel', 'silver', 'gold', 'camel', 'spice']);
    expect(next.activePlayerId).toBe('p1');
  });

  it('will not take a camel singly or past the hand limit', () => {
    const s = position({ market: ['camel', 'diamond', 'gold', 'camel', 'spice'], hand: Array(7).fill('leather') });
    expect(() => applyAction(s, { type: 'takeOne', cardId: s.market[0].id })).toThrow(/camel/);
    expect(() => applyAction(s, { type: 'takeOne', cardId: s.market[1].id })).toThrow(/hand limit/);
  });

  it('takes every camel at once into the herd, refilling each slot', () => {
    const s = position({ market: ['camel', 'diamond', 'camel', 'camel', 'spice'], herd: 1, deck: ['gold', 'cloth', 'silver'] });
    const next = applyAction(s, { type: 'takeCamels' });
    expect(next.players[0].herd).toHaveLength(4);
    expect(typesOf(next.market)).toEqual(['silver', 'diamond', 'cloth', 'gold', 'spice']);
    expect(next.players[0].hand).toHaveLength(0);
  });

  it('exchanges 2+ goods for hand cards and camels, into the same slots', () => {
    const s = position({ market: ['diamond', 'diamond', 'leather', 'camel', 'spice'], hand: ['cloth', 'leather'], herd: 2 });
    const [d1, d2] = s.market;
    const cloth = s.players[0].hand[0];
    const camel = s.players[0].herd[0];
    const next = applyAction(s, { type: 'exchange', takeIds: [d1.id, d2.id], giveIds: [cloth.id, camel.id] });
    expect(typesOf(next.market)).toEqual(['cloth', 'camel', 'leather', 'camel', 'spice']);
    expect(typesOf(next.players[0].hand).sort()).toEqual(['diamond', 'diamond', 'leather']);
    expect(next.players[0].herd).toHaveLength(1);
    expect(next.deck).toHaveLength(s.deck.length);
  });

  it('rejects exchanges of one card, of camels, of mismatched counts, and of a type for itself', () => {
    const s = position({ market: ['diamond', 'leather', 'leather', 'camel', 'spice'], hand: ['leather', 'gold'], herd: 2 });
    const [d, l1, l2, c] = s.market;
    const [hl, hg] = s.players[0].hand;
    expect(() => applyAction(s, { type: 'exchange', takeIds: [d.id], giveIds: [hg.id] })).toThrow(/at least 2/);
    expect(() => applyAction(s, { type: 'exchange', takeIds: [d.id, c.id], giveIds: [hg.id, hl.id] })).toThrow(/camel/);
    expect(() => applyAction(s, { type: 'exchange', takeIds: [d.id, l1.id], giveIds: [hg.id] })).toThrow(/as many/);
    expect(() => applyAction(s, { type: 'exchange', takeIds: [l1.id, l2.id], giveIds: [hl.id, hg.id] })).toThrow(/type you take/);
    expect(() => applyAction(s, { type: 'exchange', takeIds: [l1.id, l2.id], giveIds: [hg.id, s.players[0].herd[0].id] })).not.toThrow();
  });

  it('rejects an exchange that would leave more than 7 cards in hand', () => {
    const s = position({ market: ['diamond', 'gold', 'leather', 'camel', 'spice'], hand: Array(6).fill('cloth'), herd: 3 });
    const [d, g] = s.market;
    const herd = s.players[0].herd;
    expect(() => applyAction(s, { type: 'exchange', takeIds: [d.id, g.id], giveIds: [herd[0].id, herd[1].id] })).toThrow();
    const ok = applyAction(s, { type: 'exchange', takeIds: [d.id, g.id], giveIds: [herd[0].id, s.players[0].hand[0].id] });
    expect(ok.players[0].hand).toHaveLength(7);
  });
});

describe('selling', () => {
  it('takes tokens off the top of the pile and a bonus for 3+ cards', () => {
    const s = position({ market: ['camel', 'camel', 'camel', 'gold', 'gold'], hand: ['cloth', 'cloth', 'cloth', 'cloth', 'leather'] });
    const ids = s.players[0].hand.filter((c) => c.type === 'cloth').map((c) => c.id);
    const next = applyAction(s, { type: 'sell', cardIds: ids });
    expect(next.players[0].goodsTokens.map((t) => t.value)).toEqual([5, 3, 3, 2]);
    expect(next.tokens.cloth.map((t) => t.value)).toEqual([2, 1, 1]);
    expect(next.players[0].bonusTokens).toHaveLength(1);
    expect(next.players[0].bonusTokens[0].size).toBe(4);
    expect(next.bonus[4]).toHaveLength(BONUS_VALUES[4].length - 1);
    expect(typesOf(next.discard)).toEqual(['cloth', 'cloth', 'cloth', 'cloth']);
    expect(typesOf(next.players[0].hand)).toEqual(['leather']);
  });

  it('pays a ×5 bonus for 5 or more, and no tokens once a pile is empty', () => {
    const s = position({ market: ['camel', 'camel', 'camel', 'gold', 'gold'], hand: Array(7).fill('leather') });
    s.tokens.leather = s.tokens.leather.slice(0, 4);
    const next = applyAction(s, { type: 'sell', cardIds: s.players[0].hand.map((c) => c.id) });
    expect(next.players[0].goodsTokens.map((t) => t.value)).toEqual([4, 3, 2, 1]);
    expect(next.players[0].bonusTokens.map((t) => t.size)).toEqual([5]);
    expect(next.tokens.leather).toHaveLength(0);
  });

  it('sells diamonds, gold and silver two at a time at least, and one good per sale', () => {
    const s = position({ market: ['camel', 'camel', 'camel', 'gold', 'gold'], hand: ['diamond', 'diamond', 'cloth'] });
    const [d1, d2, cl] = s.players[0].hand;
    expect(() => applyAction(s, { type: 'sell', cardIds: [d1.id] })).toThrow(/at least 2/);
    expect(() => applyAction(s, { type: 'sell', cardIds: [d1.id, cl.id] })).toThrow(/one type/);
    expect(applyAction(s, { type: 'sell', cardIds: [cl.id] }).players[0].goodsTokens[0].value).toBe(5);
    expect(applyAction(s, { type: 'sell', cardIds: [d1.id, d2.id] }).players[0].goodsTokens.map((t) => t.value)).toEqual([7, 7]);
  });
});

describe('end of round', () => {
  it('ends the moment a third goods pile empties, and the camel token goes to the bigger herd', () => {
    const s = position({ market: ['camel', 'camel', 'camel', 'gold', 'gold'], hand: ['spice', 'spice'], herd: 3 });
    s.tokens.diamond = [];
    s.tokens.silver = [];
    s.tokens.spice = s.tokens.spice.slice(0, 2);
    s.players[1].goodsTokens = [{ id: 900, good: 'gold', value: 6 }];
    const next = applyAction(s, { type: 'sell', cardIds: s.players[0].hand.map((c) => c.id) });
    expect(emptyPiles(next)).toBe(3);
    expect(next.subPhase).toBe('roundEnd');
    const sum = next.lastRoundSummary!;
    expect(sum.endedBy).toBe('tokens');
    expect(sum.camelTokenTo).toBe('p0');
    expect(sum.perPlayer[0]).toMatchObject({ goods: 5 + 3, camel: 5, total: 13 });
    expect(sum.winnerId).toBe('p0');
    expect(next.players[0].seals).toBe(1);
    // The loser starts the next round.
    const r2 = applyAction(next, { type: 'nextRound' });
    expect(r2.round).toBe(2);
    expect(r2.activePlayerId).toBe('p1');
    expect(r2.players[0].seals).toBe(1);
    expect(r2.players[0].goodsTokens).toHaveLength(0);
  });

  it('ends when the market needs a card the deck no longer has', () => {
    const s = position({ market: ['camel', 'camel', 'diamond', 'gold', 'gold'], deck: ['leather'] });
    const next = applyAction(s, { type: 'takeCamels' });
    expect(next.subPhase).toBe('roundEnd');
    expect(next.lastRoundSummary!.endedBy).toBe('deck');
    // An exactly emptied deck keeps the round going.
    const t = position({ market: ['camel', 'spice', 'diamond', 'gold', 'gold'], deck: ['leather'] });
    const after = applyAction(t, { type: 'takeOne', cardId: t.market[1].id });
    expect(after.subPhase).toBe('turn');
    expect(after.deck).toHaveLength(0);
    const end = applyAction(after, { type: 'takeOne', cardId: after.market[2].id });
    expect(end.subPhase).toBe('roundEnd');
  });

  it('breaks rupee ties on bonus tokens, then goods tokens; a full tie awards no seal', () => {
    const s = fresh();
    const [a, b] = s.players;
    a.goodsTokens = [{ id: 1, good: 'cloth', value: 5 }];
    b.goodsTokens = [{ id: 2, good: 'spice', value: 3 }];
    b.bonusTokens = [{ id: 3, size: 3, value: 2 }];
    a.herd = [];
    b.herd = [];
    expect(scoreRound(s.players, 1, 'deck')).toMatchObject({ winnerId: 'p1', decidedBy: 'bonusTokens' });
    b.bonusTokens = [];
    b.goodsTokens = [{ id: 2, good: 'spice', value: 3 }, { id: 4, good: 'leather', value: 2 }];
    expect(scoreRound(s.players, 1, 'deck')).toMatchObject({ winnerId: 'p1', decidedBy: 'goodsTokens' });
    b.goodsTokens = [{ id: 2, good: 'cloth', value: 5 }];
    expect(scoreRound(s.players, 1, 'deck')).toMatchObject({ winnerId: null, decidedBy: 'tie' });
  });

  it('gives no camel token on a tied herd', () => {
    const s = fresh();
    s.players[0].herd = cards('camel', 'camel');
    s.players[1].herd = cards('camel', 'camel');
    expect(scoreRound(s.players, 1, 'deck').camelTokenTo).toBeNull();
  });

  it('ends the match at the configured number of seals', () => {
    const s = position({ market: ['camel', 'camel', 'diamond', 'gold', 'gold'], deck: [] , herd: 2 });
    s.players[0].seals = 1;
    const next = applyAction(s, { type: 'takeCamels' });
    expect(next.phase).toBe('gameOver');
    expect(next.winnerId).toBe('p0');
    expect(next.finalScores).toEqual({ p0: 2, p1: 0 });
    expect(() => applyAction(next, { type: 'nextRound' })).toThrow();
  });
});

describe('random play', () => {
  it('conserves every card, keeps hands within 7, and finishes matches', () => {
    const states = sampleStates({ matches: 12, seed: 3 });
    let finished = 0;
    for (const s of states) {
      expect(allCardIds(s)).toEqual(Array.from({ length: DECK_SIZE }, (_, i) => i));
      for (const p of s.players) {
        expect(p.hand.length).toBeLessThanOrEqual(7);
        expect(p.hand.every((c) => c.type !== 'camel')).toBe(true);
      }
      const tokens = GOODS.reduce((n, g: JaipurGood) => n + s.tokens[g].length, 0)
        + s.players.reduce((n, p) => n + p.goodsTokens.length, 0);
      if (s.subPhase === 'turn' && s.phase === 'playing') expect(tokens).toBe(38);
      if (s.phase === 'gameOver') finished++;
    }
    expect(finished).toBe(12);
  });
});
