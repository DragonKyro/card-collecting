import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { createRng, rngNext } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import { NUM_SLOTS } from '@/games/sea-salt-paper/nn/actions';
import { OBS_DIM } from '@/games/sea-salt-paper/nn/encode';
import { SspVecEnv, type Episode, type VecBatch } from './vec-env';

/** Drive `env` with uniformly random legal slots until `episodes` matches finish. */
function drive(env: SspVecEnv, episodes: number, check: (b: VecBatch) => void) {
  const rng = createRng(3);
  const n = env.opts.numEnvs;
  const done: Episode[] = [];
  const reward = [0, 0];
  let b = env.reset();
  for (let guard = 0; done.length < episodes && guard < 100_000; guard++) {
    check(b);
    const actions = Array.from({ length: n }, (_, i) =>
      sampleLegal(b.mask.subarray(i * NUM_SLOTS, (i + 1) * NUM_SLOTS), rngNext(rng)));
    b = env.step(actions);
    for (let i = 0; i < n; i++) {
      reward[0] += b.reward[i * 2];
      reward[1] += b.reward[i * 2 + 1];
    }
    done.push(...b.episodes);
  }
  return { done, reward };
}

const wellFormed = (b: VecBatch) => {
  const n = b.seat.length;
  expect(b.obs.length).toBe(n * OBS_DIM);
  for (let i = 0; i < n; i++) {
    expect(b.mask.subarray(i * NUM_SLOTS, (i + 1) * NUM_SLOTS).some((m) => m === 1)).toBe(true);
  }
};

describe('SspVecEnv', () => {
  it('only hands the learner its own seat vs a fixed opponent, alternating seats', () => {
    const env = new SspVecEnv({ numEnvs: 4, opponent: 'random', extraSalt: true });
    const { done, reward } = drive(env, 6, wellFormed);
    expect(done.length).toBeGreaterThanOrEqual(6);
    for (const e of done) {
      expect(e.learnerSeats).toHaveLength(1);
      expect(e.truncated).toBe(false);
    }
    expect(new Set(done.map((e) => e.learnerSeats[0])).size).toBe(2);
    // Terminal rewards only (roundReward 0): ±1 per finished match, zero-sum.
    expect(reward[0] + reward[1]).toBeCloseTo(0, 5);
  });

  it('self-play gives both seats decisions and zero-sum shaped rewards', () => {
    const env = new SspVecEnv({ numEnvs: 3, opponent: 'self', extraSalt: true, roundReward: 0.05 });
    const seats = new Set<number>();
    const { done, reward } = drive(env, 3, (b) => { wellFormed(b); b.seat.forEach((s) => seats.add(s)); });
    expect(seats).toEqual(new Set([0, 1]));
    expect(done.every((e) => e.learnerSeats.length === 2)).toBe(true);
    expect(reward[0] + reward[1]).toBeCloseTo(0, 4);
  });

  it('rejects an illegal slot', () => {
    const env = new SspVecEnv({ numEnvs: 1, opponent: 'random' });
    const b = env.reset();
    const illegal = b.mask.findIndex((m) => m === 0);
    expect(() => env.step([illegal])).toThrow(/not legal/);
  });

  it('configure swaps the fixed opponent but not the self-play split', () => {
    const hard = join(__dirname, '..', '..', 'src', 'games', 'sea-salt-paper', 'policies', 'hard-update10000.json');
    const fixed = new SspVecEnv({ numEnvs: 2, opponent: 'random' });
    fixed.reset();
    fixed.configure({ opponent: `nn-sample:${hard}` });
    expect(fixed.opts.opponent).toBe(`nn-sample:${hard}`);
    expect(() => fixed.configure({ opponent: 'self' })).toThrow(/self-play/);
    const self = new SspVecEnv({ numEnvs: 2, opponent: 'self' });
    expect(() => self.configure({ opponent: 'random' })).toThrow(/self-play/);
  });
});
