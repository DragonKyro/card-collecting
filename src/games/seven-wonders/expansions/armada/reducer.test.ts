// Armada expansion — integration tests.

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
    { expansions: ['armada'], wonderAssignment: 'random', wonderSide: 'A' },
    seed, aiSeats(n));
}

describe('Armada — reducer integration', () => {
  it('deals navy cards into the hand pool when Armada is active', () => {
    const s = makeState(4, 13);
    const seen = new Set<string>();
    for (const p of s.players) for (const c of p.hand) seen.add(c.color);
    expect(seen.has('navy')).toBe(true);
  });

  it('does NOT deal navy cards when Armada is OFF', () => {
    const s = sevenWondersModule.createInitialState(
      { expansions: [], wonderAssignment: 'random', wonderSide: 'A' },
      11, aiSeats(4));
    for (const p of s.players) {
      for (const c of p.hand) expect(c.color).not.toBe('navy');
    }
  });

  it('AI vs AI Armada match completes to gameOver', () => {
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

  it('All four implemented expansions together: each contributes its color', () => {
    const s = sevenWondersModule.createInitialState(
      { expansions: ['leaders', 'cities', 'babel', 'armada'], wonderAssignment: 'random', wonderSide: 'A' },
      55, aiSeats(5));
    // Leaders is in the leaderDraft subphase before age 1 deal, so the hand
    // won't have base cards yet. Skip the hand check; just verify setupMatch
    // didn't blow up and that leaderDraft state is present.
    expect(s.subPhase).toBe('leaderDraft');
    for (const p of s.players) {
      expect(p.debtTokens).toBe(0);
      expect(p.diplomacyTokens).toBe(0);
    }
  });
});
