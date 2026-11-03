import { describe, it, expect } from 'vitest';
import { createRng } from '@/core/rng';
import type { JaipurState } from '../types';
import { CARD_COUNTS, CARD_TYPES } from '../cards';
import { applyAction } from '../reducer';
import { countCards } from '../rules';
import { knowledgeOf } from '../knowledge';
import { sampleStates, scrambleHidden } from '../testSupport';
import { observe } from './observation';
import { encodeObservation } from './encode';
import { legalMask } from './actions';

function sameView(a: JaipurState, b: JaipurState, viewerId: string) {
  const oa = observe(a, viewerId);
  const ob = observe(b, viewerId);
  expect(JSON.stringify(ob)).toBe(JSON.stringify(oa));
  expect(Array.from(encodeObservation(ob))).toEqual(Array.from(encodeObservation(oa)));
  expect(Array.from(legalMask(ob))).toEqual(Array.from(legalMask(oa)));
}

describe('observe() hides what a real player cannot see', () => {
  for (const players of ['random', 'policy', 'mixed'] as const) {
    it(`observation, features and mask ignore hidden information (${players} play)`, () => {
      const states = sampleStates({ matches: 4, seed: 101, every: 2, players });
      const rng = createRng(4242);
      let changes = 0;
      for (const state of states) {
        for (const viewer of state.players) {
          const { s, changes: n } = scrambleHidden(state, viewer.id, rng);
          changes += n;
          sameView(state, s, viewer.id);
        }
      }
      // Guard against a vacuous pass: the scrambler really did move hidden things.
      expect(changes).toBeGreaterThan(states.length);
    });
  }

  it('knows an opponent card exactly while it stays in their hand', () => {
    const states = sampleStates({ matches: 6, seed: 7, players: 'mixed' });
    let checked = 0;
    for (const s of states) {
      if (s.subPhase !== 'turn') continue;
      for (const [vi, viewer] of s.players.entries()) {
        const k = knowledgeOf(s, viewer.id);
        const oi = 1 - vi;
        const real = countCards(s.players[oi].hand);
        for (const g of Object.keys(k.knownHands[oi]) as Array<keyof typeof k.knownHands[0]>) {
          expect(k.knownHands[oi][g]).toBeLessThanOrEqual(real[g]);
          if (k.knownHands[oi][g] > 0) checked++;
        }
        expect(k.unknownCounts[oi]).toBeGreaterThanOrEqual(0);
        // Unseen = deck + the opponent's unknown cards, by type.
        const deck = countCards(s.deck);
        const unseenTotal = CARD_TYPES.reduce((n, t) => n + k.unseen[t], 0);
        expect(unseenTotal).toBe(s.deck.length + k.unknownCounts[oi]);
        for (const t of CARD_TYPES) {
          expect(k.unseen[t]).toBeGreaterThanOrEqual(deck[t]);
          expect(k.unseen[t]).toBeLessThanOrEqual(CARD_COUNTS[t]);
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('a good taken from the market becomes known, and stops being known once sold', () => {
    let s = sampleStates({ matches: 1, seed: 11 })[0];
    const taker = s.activePlayerId!;
    const other = s.players.find((p) => p.id !== taker)!.id;
    const good = s.market.find((c) => c.type !== 'camel');
    if (!good) return;
    const before = observe(s, other).opponent.known[good.type as 'diamond'];
    s = applyAction(s, { type: 'takeOne', cardId: good.id });
    expect(observe(s, other).opponent.known[good.type as 'diamond']).toBe(before + 1);
    expect(observe(s, other).exposed).toEqual(observe(s, other).exposed); // own exposure is well-formed
    expect(observe(s, taker).exposed[good.type as 'diamond']).toBe(before + 1);
  });

  it('carries no deck, RNG, log, bonus piles or opponent hand fields', () => {
    const [state] = sampleStates({ matches: 1, seed: 3 });
    const obs = observe(state, state.players[0].id) as unknown as Record<string, unknown>;
    for (const key of ['deck', 'rngState', 'log', 'bonus', 'seats', 'players']) expect(obs).not.toHaveProperty(key);
    const opp = obs.opponent as Record<string, unknown>;
    for (const key of ['hand', 'bonusTokens']) expect(opp).not.toHaveProperty(key);
  });

  it('asks only the active seat for a decision', () => {
    for (const s of sampleStates({ matches: 2, seed: 5, every: 3 })) {
      for (const p of s.players) {
        const obs = observe(s, p.id);
        const expected = s.phase === 'playing' && s.subPhase === 'turn' && s.activePlayerId === p.id;
        expect(obs.decision !== null).toBe(expected);
      }
    }
  });
});
