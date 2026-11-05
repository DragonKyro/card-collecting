import { describe, expect, it } from 'vitest';
import type { Seat } from '@/core/types';
import { sevenWondersModule } from '../../module';
import { applyAction } from '../../reducer';
import type { SwState } from '../../types';

// Hot-seat with several humans in the Leaders draft and leader play: every
// human gets the turn (activePlayerId parks on each) before the AIs, so the
// second human is never skipped and the match never stalls.

const seats = (humans: number[]): Seat[] =>
  Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#888', isAI: !humans.includes(i), isLocal: true }));

function newMatch(humans: number[]): SwState {
  return sevenWondersModule.createInitialState(
    { expansions: ['leaders'], wonderAssignment: 'random', wonderSide: 'A' },
    5,
    seats(humans),
  );
}

describe('Leaders with two humans sharing the device', () => {
  it('the leader draft hands the turn to each human, then the AIs, every round', () => {
    let s = newMatch([0, 2]);
    expect(s.subPhase).toBe('leaderDraft');
    for (let round = 1; round <= 4; round++) {
      expect(s.leaderDraftRound).toBe(round);
      const order: string[] = [];
      for (let i = 0; i < 4; i++) {
        const pid = s.activePlayerId!;
        order.push(pid);
        s = applyAction(s, { type: 'submitLeaderDraft', playerId: pid, cardId: s.leaderDraftHands![pid]![0]!.id });
      }
      expect(order, `round ${round}`).toEqual(['p0', 'p2', 'p1', 'p3']);
    }
    expect(s.subPhase).toBe('leaderPlay');
  });

  it('leader play does the same, and the age starts once everyone has gone', () => {
    let s = newMatch([1, 3]);
    for (let i = 0; i < 16; i++) {
      const pid = s.activePlayerId!;
      s = applyAction(s, { type: 'submitLeaderDraft', playerId: pid, cardId: s.leaderDraftHands![pid]![0]!.id });
    }
    expect(s.subPhase).toBe('leaderPlay');
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      const pid = s.activePlayerId!;
      order.push(pid);
      s = applyAction(s, { type: 'submitLeaderPlay', playerId: pid, pick: { kind: 'skip' } });
    }
    expect(order).toEqual(['p1', 'p3', 'p0', 'p2']);
    expect(s.subPhase).toBe('picking');
  });
});
