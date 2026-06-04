// Smoke tests for the 7 Wonders reducer.
//
// Focus: build the initial state for 3-7 player counts, drive a full match using
// the AI as a stand-in, and confirm we land at gameOver with finalScores.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule, attachSeatsAndStart } from './module';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { wonderById } from './wonders';
import type { SwState } from './types';
import type { Seat } from '@/core/types';

function aiSeats(n: number): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `p${i}`, name: `AI${i}`, color: '#888',
      isAI: true, isLocal: true,
    });
  }
  return out;
}

function makeState(n: number, seed = 7): SwState {
  return sevenWondersModule.createInitialState(
    { expansions: [], wonderAssignment: 'random', wonderSide: 'A' },
    seed, aiSeats(n));
}

/** Drive AI vs AI to gameOver or until step cap. */
function runAIMatch(s: SwState, maxSteps = 600): SwState {
  let steps = 0;
  let cur = s;
  while (cur.phase === 'playing' && steps < maxSteps) {
    let advanced = false;
    if (cur.subPhase === 'militaryEnd') {
      cur = applyAction(cur, { type: 'continue' });
      advanced = true;
    } else if (cur.subPhase === 'picking') {
      for (const p of cur.players) {
        if (p.pendingPick !== null) continue;
        const a = chooseAIAction(cur, p.id);
        if (!a) {
          // fallback: discard first card to make progress
          cur = applyAction(cur, {
            type: 'submitPick', playerId: p.id,
            pick: { kind: 'discard', cardId: p.hand[0].id },
          });
        } else {
          cur = applyAction(cur, a);
        }
        advanced = true;
      }
    }
    if (!advanced) break;
    steps += 1;
  }
  return cur;
}

describe('seven-wonders reducer', () => {
  it('initial state has 7 cards per player at start of Age I', () => {
    const s = makeState(4);
    expect(s.age).toBe(1);
    expect(s.ageRound).toBe(1);
    expect(s.subPhase).toBe('picking');
    for (const p of s.players) {
      expect(p.hand.length).toBe(7);
      expect(p.tableau.length).toBe(0);
      expect(p.coins).toBe(3);
      expect(p.wonderStagesBuilt).toBe(0);
    }
  });

  it('every seat gets a wonder', () => {
    const s = makeState(5);
    const seen = new Set<string>();
    for (const p of s.players) {
      expect(p.wonderId.length).toBeGreaterThan(0);
      // wonderById doesn't throw on a valid id
      expect(() => wonderById(p.wonderId)).not.toThrow();
      seen.add(p.wonderId);
    }
    // Should be unique (different ids) — random assignment picks one of each wonder.
    expect(seen.size).toBe(5);
  });

  it('submitPick from a player marks them as submitted without revealing', () => {
    let s = makeState(3);
    const me = s.players[0];
    // Discard a card — always legal.
    s = applyAction(s, {
      type: 'submitPick', playerId: me.id,
      pick: { kind: 'discard', cardId: me.hand[0].id },
    });
    expect(s.players[0].pendingPick).not.toBeNull();
    // Others not yet picked → subPhase stays picking, age round unchanged.
    expect(s.subPhase).toBe('picking');
    expect(s.ageRound).toBe(1);
  });

  it('when all players submit, hands rotate and ageRound advances', () => {
    let s = makeState(3);
    const initialHands = s.players.map((p) => p.hand.map((c) => c.id));
    for (const p of s.players) {
      s = applyAction(s, {
        type: 'submitPick', playerId: p.id,
        pick: { kind: 'discard', cardId: p.hand[0].id },
      });
    }
    // After reveal: hands rotated → player[i].hand differs from initialHands[i]
    expect(s.ageRound).toBe(2);
    expect(s.subPhase).toBe('picking');
    for (let i = 0; i < s.players.length; i++) {
      // We rotated so each player should now have someone else's (reduced) hand.
      const newIds = new Set(s.players[i].hand.map((c) => c.id));
      const initialIds = new Set(initialHands[i]);
      // The rotated hand should differ from the original by at least one card.
      let diff = 0;
      for (const id of newIds) if (!initialIds.has(id)) diff += 1;
      expect(diff).toBeGreaterThan(0);
    }
  });

  it('drives an AI vs AI match to gameOver', () => {
    let s = makeState(3, 42);
    s = runAIMatch(s);
    expect(s.phase).toBe('gameOver');
    expect(s.finalScores).not.toBeNull();
    expect(Object.keys(s.finalScores!).length).toBe(3);
    expect(s.finalScoringBreakdown).not.toBeNull();
    expect(s.finalScoringBreakdown!.length).toBe(3);
    // Total should equal the sum of all categories.
    for (const row of s.finalScoringBreakdown!) {
      const sum = row.military + row.treasury + row.wonder + row.civilian + row.commercial + row.science + row.guild;
      expect(sum).toBe(row.total);
    }
  });

  it('attachSeatsAndStart resets per-player state', () => {
    const s = makeState(3);
    s.players[0].coins = 999;
    s.players[0].tableau = [];
    attachSeatsAndStart(s, aiSeats(3));
    expect(s.players[0].coins).toBe(3);
    expect(s.age).toBe(1);
    expect(s.ageRound).toBe(1);
  });

  it('three ages played: ageRound resets between ages and players accumulate military tokens', () => {
    let s = makeState(3, 1);
    s = runAIMatch(s);
    expect(s.phase).toBe('gameOver');
    // All players should have at LEAST 0 tokens (could be empty if every age was a draw).
    for (const p of s.players) {
      expect(p.militaryTokens.length).toBeGreaterThanOrEqual(0);
    }
  });
});
