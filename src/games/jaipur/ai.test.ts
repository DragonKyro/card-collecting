import { describe, it, expect } from 'vitest';
import { createRng, rngNext } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { JaipurState } from './types';
import { applyAction, createJaipurState } from './reducer';
import { chooseJaipurAction } from './ai';
import { actWithPolicy } from './nn/agent';
import { DEFAULT_TEST_CONFIG, seatsFor } from './testSupport';

function playOut(seed: number, heuristicSeats: number[]): { s: JaipurState; steps: number } {
  let s = createJaipurState(DEFAULT_TEST_CONFIG, seed, seatsFor());
  const rng = createRng(seed ^ 0x1234);
  let steps = 0;
  for (; steps < 3000 && s.phase === 'playing'; steps++) {
    if (s.subPhase === 'roundEnd') {
      const a = chooseJaipurAction(s, s.players[0].id);
      expect(a).toEqual({ type: 'nextRound' });
      s = applyAction(s, a!);
      continue;
    }
    const pid = s.activePlayerId!;
    const seat = s.players.findIndex((p) => p.id === pid);
    const a = heuristicSeats.includes(seat)
      ? chooseJaipurAction(s, pid)
      : actWithPolicy(s, pid, (_o, mask) => sampleLegal(mask, rngNext(rng)));
    expect(a, `no action in ${s.subPhase}`).not.toBeNull();
    s = applyAction(s, a!);
  }
  return { s, steps };
}

describe('jaipur heuristic AI', () => {
  it('plays whole matches against itself legally and they end', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s } = playOut(seed, [0, 1]);
      expect(s.phase).toBe('gameOver');
    }
  });

  it('beats uniformly random play nearly always', () => {
    let wins = 0;
    const n = 40;
    for (let seed = 1; seed <= n; seed++) {
      const seat = seed % 2;
      const { s } = playOut(1000 + seed, [seat]);
      if (s.winnerId === s.players[seat].id) wins++;
    }
    expect(wins / n).toBeGreaterThan(0.9);
  });

  it('only answers for the active seat, and leaves a round summary to humans', () => {
    const s = createJaipurState(DEFAULT_TEST_CONFIG, 5, seatsFor());
    const idle = s.players.find((p) => p.id !== s.activePlayerId)!;
    expect(chooseJaipurAction(s, idle.id)).toBeNull();
    const mixed = { ...s, seats: [{ ...s.seats[0], isAI: false }, s.seats[1]], subPhase: 'roundEnd' as const };
    expect(chooseJaipurAction(mixed, s.players[1].id)).toBeNull();
  });
});
