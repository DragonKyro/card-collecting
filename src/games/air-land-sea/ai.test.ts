// ALS AI smoke + end-to-end tests.

import { describe, it, expect } from 'vitest';
import { airLandSeaModule } from './module';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import type { AlsState } from './types';
import { BASE_THEATER_IDS, DEFAULT_TARGET_VP } from './cards';
import type { Seat } from '@/core/types';

function aiSeats(): Seat[] {
  return [
    { id: 'a', name: 'AI-A', color: '#fff', isAI: true, isLocal: true },
    { id: 'b', name: 'AI-B', color: '#ccc', isAI: true, isLocal: true },
  ];
}

function freshState(seed = 7): AlsState {
  return airLandSeaModule.createInitialState(
    { theaters: BASE_THEATER_IDS.slice(), targetVp: DEFAULT_TARGET_VP },
    seed,
    aiSeats(),
  );
}

function runAIGame(seed = 1, maxSteps = 5000): AlsState {
  let s = freshState(seed);
  for (let i = 0; i < maxSteps && s.phase === 'playing'; i++) {
    const playerId = s.activePlayerId;
    if (!playerId) break;
    const action = chooseAIAction(s, playerId);
    if (!action) break;
    s = applyAction(s, action);
  }
  return s;
}

describe('ALS AI', () => {
  it('runs an end-to-end AI vs AI match without throwing', () => {
    expect(() => runAIGame(1)).not.toThrow();
    expect(() => runAIGame(2)).not.toThrow();
    expect(() => runAIGame(3)).not.toThrow();
  });

  it('produces a legal first move from the initial state', () => {
    const s = freshState();
    const a = chooseAIAction(s, s.activePlayerId!);
    expect(a).not.toBeNull();
    expect(['deploy', 'improvise', 'withdraw']).toContain(a!.type);
  });

  it('eventually reaches gameOver across several matches', () => {
    let reached = 0;
    for (let seed = 100; seed < 110; seed++) {
      const s = runAIGame(seed);
      if (s.phase === 'gameOver') reached += 1;
    }
    expect(reached).toBeGreaterThan(0);
  });
});
