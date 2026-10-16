import { describe, it, expect } from 'vitest';
import { createRng } from '@/core/rng';
import type { SushiGoCardKind, SushiGoState } from '../types';
import { applyAction } from '../reducer';
import { sampleStates, scrambleHidden } from '../testSupport';
import { observe } from './observation';
import { encodeObservation } from './encode';

const SPECIALS_A: SushiGoCardKind[] = ['nigiri', 'uramaki', 'misoSoup', 'mizuOnigiri', 'eel', 'specialOrder', 'menu', 'fruit'];
const SPECIALS_B: SushiGoCardKind[] = ['nigiri', 'temaki', 'edamame', 'tofu', 'tempura', 'spoon', 'takeoutBox', 'pudding'];
const SPECIALS_C: SushiGoCardKind[] = ['nigiri', 'maki', 'sashimi', 'dumpling', 'eel', 'chopsticks', 'spoon', 'greenTeaIceCream'];

const CONFIGS = [
  { name: '2p default menu', players: 2, menu: undefined, matches: 3 },
  { name: '2p special order / menu', players: 2, menu: SPECIALS_A, matches: 3 },
  { name: '3p spoon / takeout box', players: 3, menu: SPECIALS_B, matches: 2 },
  { name: '4p chopsticks / spoon', players: 4, menu: SPECIALS_C, matches: 2 },
  { name: '6p special order / menu', players: 6, menu: SPECIALS_A, matches: 1 },
  { name: '8p chopsticks / spoon', players: 8, menu: SPECIALS_C, matches: 1 },
];

function sameView(a: SushiGoState, b: SushiGoState, viewerId: string) {
  const oa = observe(a, viewerId);
  const ob = observe(b, viewerId);
  expect(JSON.stringify(ob)).toBe(JSON.stringify(oa));
  expect(Array.from(encodeObservation(ob))).toEqual(Array.from(encodeObservation(oa)));
}

describe('observe() hides what a real player cannot see', () => {
  for (const cfg of CONFIGS) {
    it(`observation and features ignore hidden information (${cfg.name})`, () => {
      const states = sampleStates({ ...cfg, seed: 101, every: 3 });
      const rng = createRng(4242);
      let changes = 0;
      for (const state of states) {
        for (const viewer of state.players) {
          const { s, changes: n } = scrambleHidden(state, viewer.id, rng);
          changes += n;
          sameView(state, s, viewer.id);
        }
      }
      // Guard against a vacuous pass: the scrambler really did move hidden cards.
      expect(changes).toBeGreaterThan(states.length);
    });
  }

  it('knows exactly the hands the viewer has held: offset k after k passes', () => {
    // A menu with nothing that moves cards between hands, so every known hand
    // must be part of a hand the viewer held k turns ago.
    const menu: SushiGoCardKind[] = ['nigiri', 'maki', 'tempura', 'sashimi', 'dumpling', 'wasabi', 'tea', 'pudding'];
    for (const players of [2, 3, 5]) {
      for (const state of sampleStates({ players, menu, matches: 1, seed: 9, every: 1 })) {
        if (state.subPhase !== 'selecting') continue;
        const viewer = state.players[0];
        const obs = observe(state, viewer.id);
        obs.players.forEach((p, k) => {
          if (k === 0) return;
          expect(p.knownHand !== null).toBe(k <= obs.passes);
        });
        if (players === 2 && obs.passes >= 1) {
          expect(obs.players[1].knownHand!.map((c) => c.id).sort()).toEqual(state.players[1].hand.map((c) => c.id).sort());
        }
      }
    }
  });

  it('a known hand is part of the hand the viewer passed that many turns ago', () => {
    const menu: SushiGoCardKind[] = ['nigiri', 'maki', 'tempura', 'sashimi', 'dumpling', 'wasabi', 'tea', 'pudding'];
    for (const players of [3, 4]) {
      let s = sampleStates({ players, menu, matches: 1, seed: 21 })[0];
      const viewerId = s.players[0].id;
      const held: number[][] = []; // viewer's hand ids at the start of each turn this round
      let checked = 0;
      while (s.subPhase === 'selecting') {
        const obs = observe(s, viewerId);
        held[obs.passes] = s.players[0].hand.map((c) => c.id);
        obs.players.forEach((p, k) => {
          if (k === 0 || !p.knownHand) return;
          const passed = new Set(held[obs.passes - k]);
          for (const c of p.knownHand) expect(passed.has(c.id)).toBe(true);
          checked++;
        });
        for (const p of s.players) {
          if (!p.pendingPick && s.subPhase === 'selecting') {
            s = applyAction(s, { type: 'submitPick', playerId: p.id, cardIds: [p.hand[0].id] });
          }
        }
      }
      expect(checked).toBeGreaterThan(players);
    }
  });

  it('the features DO react to the viewer\'s hand and to a known opponent hand (control)', () => {
    const states = sampleStates({ players: 2, menu: SPECIALS_A, matches: 2, seed: 7, every: 2 })
      .filter((s) => s.subPhase === 'selecting');
    let ownReacted = 0;
    let oppReacted = 0;
    for (const state of states) {
      const viewer = state.players[0];
      const obs = observe(state, viewer.id);
      const swapInto = (pi: number) => {
        const hand = state.players[pi].hand;
        const j = state.deck.findIndex((c) => hand.some((h) => h.kind !== c.kind));
        if (j === -1) return null;
        const i = hand.findIndex((h) => h.kind !== state.deck[j].kind);
        const s = JSON.parse(JSON.stringify(state)) as SushiGoState;
        [s.players[pi].hand[i], s.deck[j]] = [s.deck[j], s.players[pi].hand[i]];
        return s;
      };
      const differs = (s: SushiGoState | null) => {
        if (!s) return false;
        const a = encodeObservation(observe(state, viewer.id));
        const b = encodeObservation(observe(s, viewer.id));
        return Array.from(a).some((v, k) => v !== b[k]);
      };
      if (differs(swapInto(0))) ownReacted++;
      if (obs.players[1].knownHand && differs(swapInto(1))) oppReacted++;
    }
    expect(ownReacted).toBeGreaterThan(10);
    expect(oppReacted).toBeGreaterThan(5);
  });

  it('carries no deck, RNG, log, supply, resolution or opponent-pick fields', () => {
    const [state] = sampleStates({ players: 3, menu: SPECIALS_B, matches: 1, seed: 3 });
    const obs = observe(state, state.players[0].id) as unknown as Record<string, unknown>;
    for (const key of ['deck', 'rngState', 'log', 'dessertSupply', 'resolution', 'seats']) expect(obs).not.toHaveProperty(key);
    for (const p of obs.players as Array<Record<string, unknown>>) {
      for (const key of ['hand', 'pendingPick', 'pendingSpoon']) expect(p).not.toHaveProperty(key);
    }
  });

  it('shows a menu draw only to the player choosing', () => {
    const states = sampleStates({ players: 3, menu: SPECIALS_A, matches: 3, seed: 55 })
      .filter((s) => s.subPhase === 'resolving' && s.resolution!.steps[0].type === 'menu');
    expect(states.length).toBeGreaterThan(0);
    for (const s of states) {
      const chooser = s.resolution!.steps[0].playerId;
      for (const p of s.players) {
        const obs = observe(s, p.id);
        if (p.id === chooser) {
          expect(obs.decision?.type).toBe('menu');
        } else {
          expect(obs.decision).toBeNull();
          expect(obs.waitingOn?.type).toBe('menu');
          expect(JSON.stringify(obs)).not.toContain('"drawn"');
        }
      }
    }
  });
});
