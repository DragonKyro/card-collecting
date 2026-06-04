// Sushi Go! Party AI smoke + regression tests.

import { describe, it, expect } from 'vitest';
import { chooseAIAction } from './ai';
import { sushiGoModule } from './module';
import { applyAction } from './reducer';
import type { Seat } from '@/core/types';
import type { SushiGoState } from './types';

function aiSeats(n = 3): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `p${i}`, name: `AI${i}`, color: '#888', isAI: true, isLocal: true });
  }
  return out;
}

function freshState(seed = 7, n = 3): SushiGoState {
  return sushiGoModule.createInitialState(sushiGoModule.defaultConfig(aiSeats(n)), seed, aiSeats(n));
}

function runFullAIGame(seed = 1, n = 3, maxSteps = 5000): SushiGoState {
  let s = freshState(seed, n);
  for (let i = 0; i < maxSteps && s.phase === 'playing'; i++) {
    // All-AI simultaneous: drive each player that hasn't picked yet.
    let advanced = false;
    if (s.subPhase === 'roundEnd') {
      const a = chooseAIAction(s, s.players[0].id);
      if (a) {
        s = applyAction(s, a);
        advanced = true;
      }
    } else if (s.subPhase === 'selecting') {
      for (const p of s.players) {
        if (p.pendingPick !== null) continue;
        const a = chooseAIAction(s, p.id);
        if (!a) continue;
        s = applyAction(s, a);
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return s;
}

describe('Sushi Go! Party AI', () => {
  it('completes an end-to-end 3-player AI match', () => {
    const s = runFullAIGame(1, 3);
    expect(s.phase).toBe('gameOver');
    expect(s.finalScores).not.toBeNull();
  });

  it('completes an end-to-end 2-player AI match', () => {
    const s = runFullAIGame(2, 2);
    expect(s.phase).toBe('gameOver');
  });

  it('never returns an illegal pick during selection', () => {
    // Run a few games with different seeds; an illegal pick throws on apply.
    expect(() => runFullAIGame(10, 3)).not.toThrow();
    expect(() => runFullAIGame(11, 4)).not.toThrow();
    expect(() => runFullAIGame(12, 5)).not.toThrow();
  });
});
