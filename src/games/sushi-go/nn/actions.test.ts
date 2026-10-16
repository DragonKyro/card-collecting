import { describe, it, expect } from 'vitest';
import { createRng, rngNext } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { SushiGoAction, SushiGoCardKind, SushiGoState } from '../types';
import { randomMenu } from '../cards';
import { applyAction } from '../reducer';
import { sushiGoModule } from '../module';
import { sampleStates, seatsFor } from '../testSupport';
import { observe, type SushiGoDraft } from './observation';
import { ACTION_SPACE_VERSION, NUM_SLOTS, SLOT_NAMES, decodeSlot, legalMask } from './actions';
import { actWithPolicy } from './agent';
import { faceIndex } from './faces';

const MENUS: SushiGoCardKind[][] = [
  ['nigiri', 'uramaki', 'misoSoup', 'mizuOnigiri', 'eel', 'specialOrder', 'takeoutBox', 'fruit'],
  ['nigiri', 'temaki', 'edamame', 'tofu', 'tempura', 'spoon', 'chopsticks', 'pudding'],
  ['nigiri', 'maki', 'sashimi', 'dumpling', 'tempura', 'menu', 'wasabi', 'greenTeaIceCream'],
];

/** Every action reachable by legal slot sequences from this seat (capped). */
function reachable(state: SushiGoState, pid: string, cap = 400): SushiGoAction[] {
  const out: SushiGoAction[] = [];
  const walk = (draft: SushiGoDraft | null) => {
    const obs = observe(state, pid, { draft });
    const mask = legalMask(obs);
    for (let s = 0; s < NUM_SLOTS && out.length < cap; s++) {
      if (!mask[s]) continue;
      const d = decodeSlot(obs, s);
      if (d.type === 'draft') walk(d.draft);
      else out.push(d);
    }
  };
  walk(null);
  return out;
}

describe('sushi-go action space', () => {
  it('has the versioned slot list (bump ACTION_SPACE_VERSION when it changes)', () => {
    expect({ version: ACTION_SPACE_VERSION, slots: NUM_SLOTS }).toEqual({ version: 1, slots: 45 });
    expect(new Set(SLOT_NAMES).size).toBe(NUM_SLOTS);
  });

  it('every legal slot sequence ends in an action the reducer accepts', () => {
    const seen = new Set<string>();
    for (const [k, menu] of MENUS.entries()) {
      for (const players of [2, 3, 4]) {
        // Spoon hand-over choices are rare: give the spoon menu more matches.
        const matches = menu.includes('spoon') && players > 2 ? 6 : 2;
        for (const state of sampleStates({ players, menu, matches, seed: 31 + k, every: 2 })) {
          for (const p of state.players) {
            const obs = observe(state, p.id);
            if (!obs.decision) {
              expect(legalMask(obs).some((m) => m === 1)).toBe(false);
              continue;
            }
            seen.add(obs.decision.type);
            const actions = reachable(state, p.id);
            expect(actions.length).toBeGreaterThan(0);
            for (const a of actions) {
              seen.add(a.type);
              expect(() => applyAction(state, a), `${a.type} in ${state.subPhase}`).not.toThrow();
            }
          }
        }
      }
    }
    for (const t of ['pick', 'copy', 'spoon', 'menu', 'takeout', 'copyCard', 'askSpoon', 'pickMenu', 'flipCards']) {
      expect(seen, t).toContain(t);
    }
  });

  it('every card in hand can be played, with chopsticks every pair, and a spoon call either way', () => {
    const states = sampleStates({ players: 3, menu: MENUS[1], matches: 3, seed: 8 })
      .filter((s) => s.subPhase === 'selecting');
    let chopsticks = 0;
    for (const state of states) {
      for (const p of state.players) {
        const obs = observe(state, p.id);
        if (obs.decision?.type !== 'pick') continue;
        const picks = reachable(state, p.id, 5000).filter((a) => a.type === 'submitPick');
        // Copies of a face are interchangeable: every face in hand must be playable.
        const faceOf = (id: number) => faceIndex(p.hand.find((h) => h.id === id)!);
        for (const c of p.hand) {
          expect(picks.some((a) => a.cardIds.some((id) => faceOf(id) === faceIndex(c)))).toBe(true);
        }
        if (obs.decision.canChopsticks) {
          chopsticks++;
          expect(picks.some((a) => a.cardIds.length === 2)).toBe(true);
        }
        if (obs.decision.canSpoon) {
          expect(picks.some((a) => a.useSpoon)).toBe(true);
          expect(picks.some((a) => !a.useSpoon)).toBe(true);
        }
      }
    }
    expect(chopsticks).toBeGreaterThan(0);
  });

  it('a spoon giver chooses among the asked variants it holds', () => {
    const menu = MENUS[1];
    const s0 = sushiGoModule.createInitialState({ menu, rounds: 3 }, 5, seatsFor(3));
    let id = 7000;
    const card = (kind: SushiGoCardKind, variant?: string) => ({ id: id++, kind, ...(variant ? { variant } : {}) });
    s0.players[0].table = [card('spoon', '4')];
    s0.players[0].hand = [card('tempura'), card('tempura'), card('tempura')];
    s0.players[1].hand = [card('tempura'), card('nigiri', 'egg'), card('nigiri', 'squid')];
    s0.players[2].hand = [card('tempura'), card('tofu'), card('tofu')];
    let s = applyAction(s0, { type: 'submitPick', playerId: 'p0', cardIds: [s0.players[0].hand[0].id], useSpoon: true });
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', cardIds: [s0.players[1].hand[0].id] });
    s = applyAction(s, { type: 'submitPick', playerId: 'p2', cardIds: [s0.players[2].hand[0].id] });
    const ask = reachable(s, 'p0').find((a) => a.type === 'askSpoon' && a.kind === 'nigiri' && a.variant === undefined)!;
    s = applyAction(s, ask);
    const obs = observe(s, 'p1');
    expect(obs.decision?.type).toBe('spoonGive');
    const gives = reachable(s, 'p1');
    expect(gives.map((a) => a.type === 'giveSpoon' && s.players[1].hand.find((c) => c.id === a.cardId)!.variant).sort())
      .toEqual(['egg', 'squid']);
    for (const a of gives) expect(() => applyAction(s, a)).not.toThrow();
  });

  it('random slot play finishes matches on random menus at 2 and 4 players', () => {
    const rng = createRng(77);
    for (const n of [2, 2, 2, 4]) {
      const menu = randomMenu(n, () => rngNext(rng));
      let s = sushiGoModule.createInitialState({ menu, rounds: 3 }, Math.floor(rngNext(rng) * 1e9), seatsFor(n));
      const policy = (_obs: unknown, mask: Uint8Array) => sampleLegal(mask, rngNext(rng));
      for (let step = 0; step < 4000 && s.phase === 'playing'; step++) {
        if (s.subPhase === 'roundEnd') { s = applyAction(s, { type: 'nextRound' }); continue; }
        const pid = s.subPhase === 'selecting' ? s.players.find((p) => !p.pendingPick)!.id : s.activePlayerId!;
        s = applyAction(s, actWithPolicy(s, pid, policy)!);
      }
      expect(s.phase, menu.join(',')).toBe('gameOver');
    }
  });
});
