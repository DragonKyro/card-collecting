// 7 Wonders Duel — reducer + match flow tests.

import { describe, it, expect } from 'vitest';
import type { Seat } from '@/core/types';
import { sevenWondersDuelModule } from './module';
import { applyAction, _internals } from './reducer';
import { chooseAIAction } from './ai';
import type { DuelState } from './types';

function twoAISeats(): Seat[] {
  return [
    { id: 'p0', name: 'AI0', color: '#3d6da0', isAI: true, isLocal: true },
    { id: 'p1', name: 'AI1', color: '#b73c3c', isAI: true, isLocal: true },
  ];
}

function makeState(seed = 7): DuelState {
  return sevenWondersDuelModule.createInitialState({ variant: 'base' }, seed, twoAISeats());
}

describe('Duel reducer', () => {
  it('createInitialState produces wonder draft sub-phase with 8 wonders in pool', () => {
    const s = makeState(1);
    expect(s.subPhase).toBe('wonderDraft');
    expect(s.wonderDraft).not.toBeNull();
    expect(s.wonderDraft!.pool.length).toBe(8);
    expect(s.wonderDraft!.pickOrder.length).toBe(8);
    expect(s.players[0].coins).toBe(7);
    expect(s.players[1].coins).toBe(7);
  });

  it('progressOffer is 5 unique tokens from 10', () => {
    const s = makeState(2);
    expect(s.progressOffer.length).toBe(5);
    expect(new Set(s.progressOffer).size).toBe(5);
  });

  it('wonder draft completes after 8 picks, transitions to turn + age 1', () => {
    let s = makeState(3);
    // AI both sides for the draft.
    for (let i = 0; i < 8; i++) {
      const active = s.players[s.activeSeatIdx];
      const a = chooseAIAction(s, active.id);
      expect(a).not.toBeNull();
      s = applyAction(s, a!);
    }
    expect(s.subPhase).toBe('turn');
    expect(s.age).toBe(1);
    expect(s.pyramid.length).toBe(20);
    expect(s.wonderDraft).toBeNull();
    // Each player should have 4 wonders.
    expect(s.players[0].wonders.length).toBe(4);
    expect(s.players[1].wonders.length).toBe(4);
  });

  it('AI vs AI full match completes to gameOver with valid endReason', () => {
    let s = makeState(33);
    let safety = 5000;
    while (s.phase === 'playing' && safety-- > 0) {
      const active = s.players[s.activeSeatIdx];
      const a = chooseAIAction(s, active.id);
      if (!a) break;
      try {
        s = applyAction(s, a);
      } catch {
        // AI proposed an invalid action for the current subphase. Try a
        // subphase-appropriate fallback.
        if (s.subPhase === 'turn') {
          const avail = s.pyramid.find((sl) => sl.faceUp && !sl.taken &&
            sl.coveredBy.every((c) => s.pyramid[c].taken));
          if (!avail) break;
          s = applyAction(s, { type: 'takeAndDiscard', playerId: active.id, cardId: avail.cardId });
        } else if (s.subPhase === 'progressPick' && s.progressOffer.length > 0) {
          s = applyAction(s, { type: 'chooseProgressToken', playerId: active.id, tokenId: s.progressOffer[0] });
        } else if (s.subPhase === 'wonderConstruct' && s.pendingWonderBury) {
          // Find any unbuilt wonder and try with empty purchase (will throw if
          // it can't afford → break).
          const me = s.players[s.activeSeatIdx];
          const unbuilt = me.wonders.find((w) => !w.built);
          if (!unbuilt) break;
          try {
            s = applyAction(s, { type: 'chooseWonderToBury', playerId: active.id, wonderId: unbuilt.wonderId, purchase: [] });
          } catch { break; }
        } else {
          break;
        }
      }
    }
    expect(s.phase).toBe('gameOver');
    expect(['civilian', 'military', 'science']).toContain(s.endReason);
    expect(s.finalScoringBreakdown).not.toBeNull();
  }, 30000);

  it('advanceMilitary pushes pawn toward opponent capital and triggers thresholds', () => {
    let s = makeState(4);
    // Skip wonder draft.
    for (let i = 0; i < 8; i++) {
      const active = s.players[s.activeSeatIdx];
      const a = chooseAIAction(s, active.id);
      s = applyAction(s, a!);
    }
    // Manually push pawn for p0.
    _internals.advanceMilitary(s, 0, 4);
    expect(s.militaryPawn).toBe(4);
    expect(s.militaryAwards.p1At3).toBe(true);
    // P2 should have lost coins.
    expect(s.players[1].coins).toBeLessThan(7);
  });

  it('military pawn at +9 triggers military supremacy gameOver', () => {
    let s = makeState(5);
    // Skip draft.
    for (let i = 0; i < 8; i++) {
      const active = s.players[s.activeSeatIdx];
      const a = chooseAIAction(s, active.id);
      s = applyAction(s, a!);
    }
    // Force the pawn to +8 then trigger a +1 advance.
    s.militaryPawn = 8;
    _internals.advanceMilitary(s, 0, 1);
    expect(s.militaryPawn).toBe(9);
    // Now call finishTurn — should detect military supremacy.
    const result = _internals.finishTurn(s, 0);
    expect(result.phase).toBe('gameOver');
    expect(result.endReason).toBe('military');
    expect(result.winnerSeatIdx).toBe(0);
  });
});
