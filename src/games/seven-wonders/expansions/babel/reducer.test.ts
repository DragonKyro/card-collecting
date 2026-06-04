// Babel expansion — integration tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import { applyAction } from '../../reducer';
import { chooseAIAction as baseAI } from '../../ai';
import type { SwState } from '../../types';
import type { Seat } from '@/core/types';

function aiSeats(n: number): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `p${i}`, name: `AI${i}`, color: '#888', isAI: true, isLocal: true });
  }
  return out;
}

function makeState(n: number, seed = 7): SwState {
  return sevenWondersModule.createInitialState(
    { expansions: ['babel'], wonderAssignment: 'random', wonderSide: 'A' },
    seed, aiSeats(n));
}

describe('Babel — reducer integration', () => {
  it('deals orange cards into the hand pool when Babel is active', () => {
    const s = makeState(4, 13);
    const seen = new Set<string>();
    for (const p of s.players) for (const c of p.hand) seen.add(c.color);
    expect(seen.has('orange')).toBe(true);
  });

  it('does NOT deal orange cards when Babel is OFF', () => {
    const s = sevenWondersModule.createInitialState(
      { expansions: [], wonderAssignment: 'random', wonderSide: 'A' },
      11, aiSeats(4));
    for (const p of s.players) {
      for (const c of p.hand) expect(c.color).not.toBe('orange');
    }
  });

  it('AI vs AI Babel match completes to gameOver', () => {
    let s = makeState(3, 33);
    let safety = 2000;
    while (s.phase === 'playing' && safety-- > 0) {
      let advanced = false;
      if (s.subPhase === 'militaryEnd') {
        s = applyAction(s, { type: 'continue' });
        advanced = true;
      } else if (s.subPhase === 'picking') {
        for (const p of s.players) {
          if (p.pendingPick !== null) continue;
          const a = baseAI(s, p.id);
          if (a) {
            s = applyAction(s, a);
            advanced = true;
            break;
          }
        }
      }
      if (!advanced) break;
    }
    expect(s.phase).toBe('gameOver');
    expect(s.finalScoringBreakdown).not.toBeNull();
  }, 30000);

  it('Cities + Babel together both contribute (each adds its color)', () => {
    const s = sevenWondersModule.createInitialState(
      { expansions: ['cities', 'babel'], wonderAssignment: 'random', wonderSide: 'A' },
      55, aiSeats(4));
    const colors = new Set<string>();
    for (const p of s.players) for (const c of p.hand) colors.add(c.color);
    expect(colors.has('black')).toBe(true);
    expect(colors.has('orange')).toBe(true);
  });
});
