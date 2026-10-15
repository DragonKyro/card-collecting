import { describe, it, expect } from 'vitest';
import { makeJobs, runJobs, summarize, wilson, type MatchupSpec } from './evaluate';

describe('eval harness', () => {
  it('plays every seed from both seats', () => {
    const jobs = makeJobs(5, 100);
    expect(jobs).toHaveLength(6);
    for (const seed of [100, 101, 102]) {
      expect(jobs.filter((j) => j.seed === seed).map((j) => j.aSeat).sort()).toEqual([0, 1]);
    }
  });

  it('a deterministic agent against itself splits every seed pair', () => {
    const spec: MatchupSpec = { a: 'heuristic', b: 'heuristic', sim: { extraSalt: true, targetScore: 40 } };
    const s = summarize(spec, runJobs(spec, makeJobs(12, 1)));
    expect(s.aScore).toBe(0.5);
    expect(s.pairs).toEqual({ aSwept: 0, split: 6, bSwept: 0 });
  });

  it('the heuristic beats random with Extra Salt, with no forfeits', () => {
    const spec: MatchupSpec = { a: 'heuristic', b: 'random', sim: { extraSalt: true, targetScore: 40 } };
    const s = summarize(spec, runJobs(spec, makeJobs(20, 7)));
    expect(s.a.errors + s.b.errors + s.truncated).toBe(0);
    expect(s.aScore).toBeGreaterThan(0.8);
    expect(s.a.wins + s.a.draws + s.a.losses).toBe(20);
  });

  it('computes a Wilson interval that brackets the estimate', () => {
    const [lo, hi] = wilson(0.55, 4000);
    expect(lo).toBeCloseTo(0.5346, 3);
    expect(hi).toBeCloseTo(0.5653, 3);
    expect(wilson(1, 10)[1]).toBe(1);
  });
});
