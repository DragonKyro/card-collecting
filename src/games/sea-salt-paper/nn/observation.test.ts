import { describe, it, expect } from 'vitest';
import { createRng } from '@/core/rng';
import type { SspCard, SspState } from '../types';
import { applyAction } from '../reducer';
import { createSspState } from '../setup';
import { sampleStates, scrambleHidden, seatsFor } from '../testSupport';
import { observe } from './observation';
import { encodeObservation } from './encode';
import { legalMask } from './actions';

const CONFIGS = [
  { name: '2p base', players: 2, extraSalt: false, extraPepper: false, matches: 6 },
  { name: '2p Extra Salt', players: 2, extraSalt: true, extraPepper: false, matches: 10 },
  { name: '2p Salt + Pepper', players: 2, extraSalt: true, extraPepper: true, matches: 5 },
  { name: '3p Extra Salt', players: 3, extraSalt: true, extraPepper: false, matches: 4 },
];

function sameView(a: SspState, b: SspState, viewerId: string, crabLookPile: 0 | 1 | null = null) {
  const oa = observe(a, viewerId, { crabLookPile });
  const ob = observe(b, viewerId, { crabLookPile });
  expect(JSON.stringify(ob)).toBe(JSON.stringify(oa));
  expect(Array.from(encodeObservation(ob))).toEqual(Array.from(encodeObservation(oa)));
  expect(Array.from(legalMask(ob))).toEqual(Array.from(legalMask(oa)));
}

describe('observe() hides what a real player cannot see', () => {
  for (const cfg of CONFIGS) {
    it(`observation, features and mask ignore hidden information (${cfg.name})`, () => {
      const states = sampleStates({ ...cfg, seed: 101, every: 3 });
      const rng = createRng(4242);
      let changes = 0;
      let crabLooks = 0;
      for (const state of states) {
        for (const viewer of state.players) {
          const { s, changes: n } = scrambleHidden(state, viewer.id, rng);
          changes += n;
          sameView(state, s, viewer.id);
          // Mid-crab, after choosing a pile: that pile is seen as it really is.
          if (state.subPhase === 'awaitingCrabPick' && state.activePlayerId === viewer.id) {
            for (const pile of [0, 1] as const) {
              if (state.discards[pile].length === 0) continue;
              const { s: s2 } = scrambleHidden(state, viewer.id, rng, { lookingAt: pile });
              sameView(state, s2, viewer.id, pile);
              crabLooks++;
            }
          }
        }
      }
      // Guard against a vacuous pass: the scrambler really did move hidden cards.
      expect(changes).toBeGreaterThan(states.length);
      if (cfg.matches >= 5) expect(crabLooks).toBeGreaterThan(0);
    });
  }

  it('the features DO react to the viewer\'s own hand (control for the test above)', () => {
    const states = sampleStates({ players: 2, extraSalt: true, matches: 3, seed: 7, every: 5 });
    let reacted = 0;
    for (const state of states) {
      const viewer = state.players[0];
      const j = state.deck.findIndex((c) => viewer.hand.some((h) => h.family !== c.family));
      const i = j === -1 ? -1 : viewer.hand.findIndex((h) => h.family !== state.deck[j].family);
      if (i === -1) continue;
      const s = JSON.parse(JSON.stringify(state)) as SspState;
      [s.players[0].hand[i], s.deck[j]] = [s.deck[j], s.players[0].hand[i]];
      const a = encodeObservation(observe(state, viewer.id));
      const b = encodeObservation(observe(s, viewer.id));
      if (Array.from(a).some((v, k) => v !== b[k])) reacted++;
    }
    expect(reacted).toBeGreaterThan(10);
  });

  it('carries no deck, RNG, log or opponent-hand fields', () => {
    const [state] = sampleStates({ players: 2, matches: 1, seed: 3 });
    const obs = observe(state, state.players[0].id) as unknown as Record<string, unknown>;
    for (const key of ['deck', 'rngState', 'log', 'discards', 'pendingLobsterPick']) expect(obs).not.toHaveProperty(key);
    const opp = (obs.players as Array<Record<string, unknown>>)[1];
    expect(opp).not.toHaveProperty('hand');
  });

  it('shows the pending draw only to the player choosing', () => {
    let s = createSspState({ targetScore: 40 }, 11, seatsFor(2));
    s = applyAction(s, { type: 'drawPair' });
    expect(observe(s, 'p0').pendingDraw).toHaveLength(2);
    expect(observe(s, 'p1').pendingDraw).toHaveLength(0);
  });
});

describe('what a seat learns about opponents and piles', () => {
  /** p0 takes a deck turn and passes, so p1 is up. */
  function p1ToAct(seed: number): SspState {
    let s = createSspState({ targetScore: 40 }, seed, seatsFor(2));
    s = applyAction(s, { type: 'drawPair' });
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    return applyAction(s, { type: 'pass' });
  }
  /** Discard `card` onto `pile` the way a deck draw does, landing record included. */
  function land(s: SspState, pile: 0 | 1, card: SspCard, by = 'p0'): void {
    s.discards[pile].push(card);
    s.logSeq += 1;
    s.log.push({
      seq: s.logSeq, round: s.round, kind: 'drawDeck', playerId: by,
      keptFamily: 'fish', discardedFamily: card.family, toPile: pile, card: { ...card },
    });
  }
  /** Put p1 into a crab pick with a known pile 0: [sailor, shell, octopus (top)], bottom first. */
  function p1Crabbing(): SspState {
    const s = p1ToAct(5);
    s.discards[0] = [];
    land(s, 0, { id: 9101, family: 'sailor', color: 'pink' });
    land(s, 0, { id: 9102, family: 'shell', color: 'yellow' });
    land(s, 0, { id: 9103, family: 'octopus', color: 'teal' });
    s.players[1].hand.push({ id: 9001, family: 'crab', color: 'yellow' }, { id: 9002, family: 'crab', color: 'teal' });
    s.subPhase = 'awaitingPlayOrEnd';
    return applyAction(s, { type: 'playPair', cardIds: [9001, 9002] });
  }

  it('a discard-pile draw is public, and the drawer knows the others know', () => {
    let s = p1ToAct(5);
    s.discards[0].push({ id: 9001, family: 'shell', color: 'yellow' });
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    expect(observe(s, 'p0').players[1].knownCards.map((c) => c.id)).toEqual([9001]);
    expect(observe(s, 'p1').players[0].knownCards.map((c) => c.id)).toEqual([9001]);
  });

  it('the card kept from a deck draw stays private', () => {
    let s = p1ToAct(5);
    s = applyAction(s, { type: 'drawPair' });
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 1 });
    expect(observe(s, 'p0').players[1].knownCards).toEqual([]);
  });

  it('a crab dig below the top is private: the pile is one card short, which one is unknown', () => {
    const s = applyAction(p1Crabbing(), { type: 'crabPick', pile: 0, cardId: 9102 });
    const seen = observe(s, 'p0');
    expect(seen.players[1].knownCards).toEqual([]);
    expect(seen.piles[0].top?.id).toBe(9103);
    expect(seen.piles[0].size).toBe(2);
    // Both remembered buried cards are still listed, in landing order; one of them is gone.
    expect(seen.piles[0].buried.map((c) => c.id)).toEqual([9101, 9102]);
    expect(seen.piles[0].unknownRemovals).toBe(1);
    expect(seen.players[1].hiddenDigs).toBe(1);
  });

  it('a dug card that landed above the new top is known to be gone', () => {
    let s = applyAction(p1Crabbing(), { type: 'crabPick', pile: 0, cardId: 9102 });
    s = applyAction(s, { type: 'pass' });
    // p0 takes the octopus: the sailor is the new top, so the shell (which
    // landed after it) must be the card that was dug.
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    const seen = observe(s, 'p0');
    expect(seen.piles[0].top?.id).toBe(9101);
    expect(seen.piles[0].buried).toEqual([]);
    expect(seen.piles[0].unknownRemovals).toBe(0);
    expect(seen.players[1].hiddenDigs).toBe(0);
  });

  it('remembers every pile in landing order when nothing was dug unseen', () => {
    let checked = 0;
    for (const state of sampleStates({ players: 2, extraSalt: true, matches: 4, seed: 61, every: 4 })) {
      for (const viewer of state.players) {
        const obs = observe(state, viewer.id);
        obs.piles.forEach((pile, i) => {
          const remembered = [...pile.buried, ...(pile.top ? [pile.top] : [])].map((c) => c.id);
          const actual = state.discards[i].map((c) => c.id);
          if (pile.unknownRemovals === 0) {
            expect(remembered).toEqual(actual);
          } else {
            // The real pile is the memory with the unseen digs taken out.
            expect(remembered.filter((id) => actual.includes(id))).toEqual(actual);
            expect(remembered.length - actual.length).toBe(pile.unknownRemovals);
          }
          checked++;
        });
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('records what each player discarded and which tops they passed over', () => {
    let s = createSspState({ targetScore: 40 }, 11, seatsFor(2));
    const tops = s.discards.map((pile) => pile[pile.length - 1].id).sort();
    s = applyAction(s, { type: 'drawPair' });
    const discarded = s.pendingDraw[1];
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    const p0 = observe(s, 'p1').players[1];
    expect(p0.discards.map((c) => c.id)).toEqual([discarded.id]);
    expect(p0.passedTops.map((c) => c.id).sort()).toEqual(tops);
    expect(p0.pulls).toEqual([]);
  });

  it('a jellyfish-locked deck draw passes over nothing (the deck was forced)', () => {
    let s = p1ToAct(5);
    s.nextTurnLockedPlayerId = 'p1';
    s = applyAction(s, { type: 'drawPair' });
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 1 });
    const p1 = observe(s, 'p0').players[1];
    expect(p1.discards).toHaveLength(1);
    expect(p1.passedTops).toEqual([]);
  });

  it('shows everyone the LAST CHANCE score and who still has a final turn', () => {
    let s = createSspState({ targetScore: 40 }, 13, seatsFor(3));
    s = applyAction(s, { type: 'drawPair' });
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    s = applyAction(s, { type: 'pass' });
    const shells = ['darkblue', 'teal', 'black', 'yellow', 'green'] as const;
    s.players[1].hand = shells.map((color, i) => ({ id: 9300 + i, family: 'shell' as const, color }));
    s.subPhase = 'awaitingPlayOrEnd';
    s = applyAction(s, { type: 'lastChance' });
    expect(s.activePlayerId).toBe('p2');
    const seen = observe(s, 'p2');
    expect(seen.lastChanceScore).toBe(8);
    expect(seen.lastChanceOffset).toBe(2);
    expect(seen.players.map((p) => [p.id, p.finalTurnPending])).toEqual([['p2', false], ['p0', true], ['p1', false]]);
  });

  it('a crab pick of the top card is public', () => {
    const s = applyAction(p1Crabbing(), { type: 'crabPick', pile: 0, cardId: 9103 });
    const seen = observe(s, 'p0');
    expect(seen.players[1].knownCards.map((c) => c.id)).toEqual([9103]);
    expect(seen.piles[0].unknownRemovals).toBe(0);
  });

  it('digging through the pile yourself shows what an earlier dig took', () => {
    let s = applyAction(p1Crabbing(), { type: 'crabPick', pile: 0, cardId: 9102 });
    // p1 passes; p0 gets a crab pair and digs through pile 0.
    s = applyAction(s, { type: 'pass' });
    s.players[0].hand.push({ id: 9201, family: 'crab', color: 'yellow' }, { id: 9202, family: 'crab', color: 'teal' });
    s.subPhase = 'awaitingPlayOrEnd';
    s = applyAction(s, { type: 'playPair', cardIds: [9201, 9202] });
    const looking = observe(s, 'p0', { crabLookPile: 0 });
    expect(looking.piles[0].unknownRemovals).toBe(0);
    expect(looking.piles[0].buried.map((c) => c.id)).toEqual([9101]);
    expect(looking.players[1].knownCards.map((c) => c.id)).toEqual([9102]);
    // Before choosing a pile, nothing about the dig is revealed yet.
    expect(observe(s, 'p0').piles[0].unknownRemovals).toBe(1);
  });
});
