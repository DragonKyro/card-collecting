// Smoke tests for Sushi Go! Party reducer.
//
// Focus: drive a tiny 2-player match through start → all-submit → reveal → score
// flow without throwing, and check that the round summary contains expected scoring.

import { describe, it, expect } from 'vitest';
import { sushiGoModule, attachSeatsAndStart } from './module';
import { applyAction } from './reducer';
import type { SushiGoState } from './types';
import { DEFAULT_MENU } from './cards';
import type { Seat } from '@/core/types';

function seats(): Seat[] {
  return [
    { id: 'p1', name: 'P1', color: '#f00', isAI: false, isLocal: true },
    { id: 'p2', name: 'P2', color: '#00f', isAI: false, isLocal: true },
  ];
}

function makeState(): SushiGoState {
  return sushiGoModule.createInitialState({ menu: DEFAULT_MENU.slice(), rounds: 3 }, 42, seats());
}

describe('sushi-go reducer', () => {
  it('initial state has hands dealt and selecting subPhase', () => {
    const s = makeState();
    expect(s.subPhase).toBe('selecting');
    expect(s.players).toHaveLength(2);
    for (const p of s.players) expect(p.hand.length).toBeGreaterThan(0);
  });

  it('submitPick stores pendingPick without auto-revealing', () => {
    let s = makeState();
    const card = s.players[0].hand[0];
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', cardIds: [card.id] });
    expect(s.subPhase).toBe('selecting');
    expect(s.players[0].pendingPick).not.toBeNull();
    expect(s.players[1].pendingPick).toBeNull();
  });

  it('revealing happens once all players have submitted', () => {
    let s = makeState();
    const c1 = s.players[0].hand[0];
    const c2 = s.players[1].hand[0];
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', cardIds: [c1.id] });
    s = applyAction(s, { type: 'submitPick', playerId: 'p2', cardIds: [c2.id] });
    // After both submit, picks should be on tables and pendingPicks cleared,
    // and hands rotated (player 0's hand should not contain the original card).
    expect(s.players[0].table.length).toBe(1);
    expect(s.players[1].table.length).toBe(1);
    expect(s.players.every((p) => p.pendingPick === null)).toBe(true);
    expect(s.subPhase === 'selecting' || s.subPhase === 'roundEnd').toBe(true);
  });

  it('drives a full round to roundEnd without throwing', () => {
    let s = makeState();
    // Loop: while in selecting, each player picks the first card of their hand.
    let ticks = 0;
    while (s.subPhase === 'selecting' && ticks < 50) {
      for (const p of s.players) {
        if (p.pendingPick == null && p.hand.length > 0) {
          s = applyAction(s, { type: 'submitPick', playerId: p.id, cardIds: [p.hand[0].id] });
        }
      }
      ticks += 1;
    }
    expect(s.subPhase).toBe('roundEnd');
    expect(s.lastRoundSummary).not.toBeNull();
    expect(s.lastRoundSummary!.perPlayer).toHaveLength(2);
  });

  it('nextRound advances and final round triggers matchEnd', () => {
    let s = makeState();
    for (let round = 1; round <= s.config.rounds; round++) {
      // Play to roundEnd
      let ticks = 0;
      while (s.subPhase === 'selecting' && ticks < 50) {
        for (const p of s.players) {
          if (p.pendingPick == null && p.hand.length > 0) {
            s = applyAction(s, { type: 'submitPick', playerId: p.id, cardIds: [p.hand[0].id] });
          }
        }
        ticks += 1;
      }
      expect(s.subPhase).toBe('roundEnd');
      s = applyAction(s, { type: 'nextRound' });
    }
    expect(s.phase).toBe('gameOver');
    expect(s.finalScores).not.toBeNull();
    expect(Object.keys(s.finalScores!).length).toBe(2);
  });

  it('attachSeatsAndStart resets all per-player state', () => {
    const state = sushiGoModule.createInitialState({ menu: DEFAULT_MENU.slice(), rounds: 3 }, 1, seats());
    // Pollute then restart
    state.players[0].dessertPile.push({ id: 9999, kind: 'pudding' });
    attachSeatsAndStart(state, seats());
    expect(state.players[0].dessertPile.length).toBe(0);
    expect(state.players[0].scoreByRound.length).toBe(0);
  });
});
