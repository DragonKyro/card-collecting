// Leaders expansion — reducer behavior tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import { applyAction } from '../../reducer';
import { chooseAIAction as leaderAI } from './ai';
import { chooseAIAction as baseAI } from '../../ai';
import type { SwState } from '../../types';
import type { Seat } from '@/core/types';

function chooseAIAction(s: SwState, pid: string) {
  // Try leaders first (handles its own subphases), then fall back to base.
  return leaderAI(s, pid) ?? baseAI(s, pid);
}

function aiSeats(n: number): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `p${i}`, name: `AI${i}`, color: '#888', isAI: true, isLocal: true });
  }
  return out;
}

function makeState(n: number, seed = 7): SwState {
  return sevenWondersModule.createInitialState(
    { expansions: ['leaders'], wonderAssignment: 'random', wonderSide: 'A' },
    seed, aiSeats(n));
}

describe('leaders expansion — reducer', () => {
  it('initializes in leaderDraft phase with 4 leaders per player', () => {
    const s = makeState(3);
    expect(s.subPhase).toBe('leaderDraft');
    expect(s.leaderDraftRound).toBe(1);
    expect(s.leaderDraftHands).toBeDefined();
    for (const p of s.players) {
      expect(s.leaderDraftHands?.[p.id].length).toBe(4);
      expect(p.leaderHand?.length).toBe(0);
      expect(p.leaderTableau?.length).toBe(0);
    }
  });

  it('all 4 draft rounds complete, leaving 4 leaders in each player\'s reserve', () => {
    let s = makeState(3, 11);
    // Drive AI through all 4 draft rounds.
    let safety = 100;
    while (s.subPhase === 'leaderDraft' && safety-- > 0) {
      for (const p of s.players) {
        if (p.leaderDraftPick !== null) continue;
        const action = chooseAIAction(s, p.id);
        if (action) s = applyAction(s, action);
      }
    }
    expect(s.subPhase).toBe('leaderPlay');
    for (const p of s.players) {
      expect(p.leaderHand?.length).toBe(4);
    }
  });

  it('leaderPlay → after all submit, transitions to picking and starts Age 1', () => {
    let s = makeState(3, 22);
    // Skip through draft.
    let safety = 100;
    while (s.subPhase === 'leaderDraft' && safety-- > 0) {
      for (const p of s.players) {
        if (p.leaderDraftPick !== null) continue;
        const a = chooseAIAction(s, p.id);
        if (a) s = applyAction(s, a);
      }
    }
    expect(s.subPhase).toBe('leaderPlay');
    // Now everyone skips.
    for (const p of s.players) {
      s = applyAction(s, { type: 'submitLeaderPlay', playerId: p.id, pick: { kind: 'skip' } });
    }
    expect(s.subPhase).toBe('picking');
    expect(s.age).toBe(1);
    expect(s.ageRound).toBe(1);
    for (const p of s.players) {
      expect(p.hand.length).toBe(7);
    }
  });

  it('AI vs AI match with Leaders completes to gameOver', () => {
    let s = makeState(3, 33);
    let safety = 2000;
    while (s.phase === 'playing' && safety-- > 0) {
      let advanced = false;
      if (s.subPhase === 'militaryEnd') {
        s = applyAction(s, { type: 'continue' });
        advanced = true;
      } else {
        // For draft, play, picking, solomonAwaitPick — drive each AI.
        for (const p of s.players) {
          const action = chooseAIAction(s, p.id);
          if (action) {
            s = applyAction(s, action);
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

  it('base chooseAIAction handles leader subphases (no manual expansion fallback needed)', () => {
    // Regression: GameHost calls the module's chooseAIAction = base AI only.
    // The base AI must dispatch into the Leaders expansion during leaderDraft.
    let s = makeState(3, 77);
    expect(s.subPhase).toBe('leaderDraft');
    for (const p of s.players) {
      const action = baseAI(s, p.id);
      expect(action, `base AI returned null for ${p.id} during leaderDraft`).not.toBeNull();
      expect(action!.type).toBe('submitLeaderDraft');
      s = applyAction(s, action!);
    }
  });

  it('match WITHOUT leaders works (backward-compat)', () => {
    let s = sevenWondersModule.createInitialState(
      { expansions: [], wonderAssignment: 'random', wonderSide: 'A' },
      99, aiSeats(3));
    expect(s.subPhase).toBe('picking');
    expect(s.age).toBe(1);
    let safety = 2000;
    while (s.phase === 'playing' && safety-- > 0) {
      let advanced = false;
      if (s.subPhase === 'militaryEnd') {
        s = applyAction(s, { type: 'continue' });
        advanced = true;
      } else if (s.subPhase === 'picking') {
        for (const p of s.players) {
          if (p.pendingPick !== null) continue;
          // discard always-legal fallback
          s = applyAction(s, {
            type: 'submitPick', playerId: p.id,
            pick: { kind: 'discard', cardId: p.hand[0].id },
          });
          advanced = true;
        }
      }
      if (!advanced) break;
    }
    expect(s.phase).toBe('gameOver');
  }, 30000);
});
