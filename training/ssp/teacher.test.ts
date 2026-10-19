import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { actWithPolicy } from '@/games/sea-salt-paper/nn/agent';
import { NUM_SLOTS, SLOT_NAMES, SSP_ACTIONS, legalMask } from '@/games/sea-salt-paper/nn/actions';
import { observe } from '@/games/sea-salt-paper/nn/observation';
import { greedyPolicy } from '@/games/sea-salt-paper/nn/policy';
import { sampleStates } from '@/games/sea-salt-paper/testSupport';
import { Teacher } from './teacher';
import { SspVecEnv } from './vec-env';

const HARD = join(__dirname, '..', '..', 'src', 'games', 'sea-salt-paper', 'policies', 'hard-update10000.json');

describe('Teacher (the shipped Hard, encoder v2 / 66 slots, read in the current 137-slot space)', () => {
  const teacher = new Teacher(HARD);
  const states = sampleStates({ players: 2, extraSalt: true, matches: 6, seed: 31, every: 3 });

  it('is a distribution over legal slots of the current action space', () => {
    expect(teacher.policy.actions.numSlots).toBe(66);
    const out = new Float32Array(NUM_SLOTS);
    let checked = 0;
    for (const state of states) {
      const actor = state.subPhase === 'roundEnd' ? state.players[0].id : state.activePlayerId!;
      const views = [observe(state, actor)];
      if (state.subPhase === 'awaitingCrabPick') {
        for (const pile of [0, 1] as const) {
          if (state.discards[pile].length) views.push(observe(state, actor, { crabLookPile: pile }));
        }
      }
      for (const obs of views) {
        teacher.targets(obs, out);
        const mask = legalMask(obs);
        let sum = 0;
        for (let s = 0; s < NUM_SLOTS; s++) {
          if (!mask[s]) expect(out[s], `${SLOT_NAMES[s]} is illegal`).toBe(0);
          expect(out[s]).toBeGreaterThanOrEqual(0);
          sum += out[s];
        }
        expect(sum).toBeCloseTo(1, 4);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('its favourite is the move Hard actually plays', () => {
    const out = new Float32Array(NUM_SLOTS);
    const policy = greedyPolicy(teacher.policy);
    let checked = 0;
    for (const state of states) {
      if (state.subPhase === 'roundEnd') continue;
      const actor = state.activePlayerId!;
      const obs = observe(state, actor);
      const played = actWithPolicy(state, actor, policy, teacher.policy.actions)!;
      teacher.targets(obs, out);
      // The first decision of a turn: the slot the played action belongs to.
      const slot = SSP_ACTIONS.slotForAction(obs, played);
      const best = out.indexOf(Math.max(...out));
      // Near-ties may break differently between the two spaces; a clear favourite must agree.
      if (out[best] > 0.6) {
        expect(SLOT_NAMES[best]).toBe(SLOT_NAMES[slot]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('names the exact colour Hard would take from a crab dig', () => {
    const out = new Float32Array(NUM_SLOTS);
    let digs = 0;
    for (const state of sampleStates({ players: 2, extraSalt: true, matches: 12, seed: 77, every: 1 })) {
      if (state.subPhase !== 'awaitingCrabPick') continue;
      const actor = state.activePlayerId!;
      for (const pile of [0, 1] as const) {
        if (!state.discards[pile].length) continue;
        const obs = observe(state, actor, { crabLookPile: pile });
        teacher.targets(obs, out);
        const hot = [...out.keys()].filter((s) => out[s] > 0.01).map((s) => SLOT_NAMES[s]);
        // Only per-colour card slots (crab:family/colour or crab:top) carry mass in a dig.
        expect(hot.every((n) => n.startsWith('crab:'))).toBe(true);
        expect(hot.every((n) => n === 'crab:top' || n.includes('/'))).toBe(true);
        digs++;
      }
    }
    expect(digs).toBeGreaterThan(5);
  });
});

describe('SspVecEnv with a teacher', () => {
  it('reports a distribution with every decision row, and stops on request', () => {
    const env = new SspVecEnv({ numEnvs: 3, opponent: 'self', extraSalt: true, teacher: HARD });
    let b = env.reset();
    for (let step = 0; step < 6; step++) {
      expect(b.teacher).not.toBeNull();
      for (let i = 0; i < 3; i++) {
        const row = b.teacher!.subarray(i * NUM_SLOTS, (i + 1) * NUM_SLOTS);
        const mask = b.mask.subarray(i * NUM_SLOTS, (i + 1) * NUM_SLOTS);
        expect(row.reduce((a, v) => a + v, 0)).toBeCloseTo(1, 4);
        row.forEach((p, s) => { if (p > 0) expect(mask[s]).toBe(1); });
      }
      b = env.step(Array.from({ length: 3 }, (_, i) => b.mask.subarray(i * NUM_SLOTS, (i + 1) * NUM_SLOTS).indexOf(1)));
    }
    env.configure({ teacher: null });
    b = env.step(Array.from({ length: 3 }, (_, i) => b.mask.subarray(i * NUM_SLOTS, (i + 1) * NUM_SLOTS).indexOf(1)));
    expect(b.teacher).toBeNull();
  });
});
