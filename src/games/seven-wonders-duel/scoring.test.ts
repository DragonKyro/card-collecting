// 7 Wonders Duel — scoring tests.

import { describe, it, expect } from 'vitest';
import { createRng } from '@/core/rng';
import type { DuelCard, DuelState } from './types';
import { scoreMatch } from './scoring';

function emptyState(): DuelState {
  return {
    phase: 'playing',
    seats: [
      { id: 'p0', name: 'P0', color: '#3d6da0', isAI: true, isLocal: true },
      { id: 'p1', name: 'P1', color: '#b73c3c', isAI: true, isLocal: true },
    ],
    activePlayerId: 'p0',
    finalScores: null,
    rngState: createRng(1),
    config: { variant: 'base' },
    age: 1,
    subPhase: 'turn',
    players: [
      { id: 'p0', tableau: [], wonders: [], coins: 0, progressTokens: [] },
      { id: 'p1', tableau: [], wonders: [], coins: 0, progressTokens: [] },
    ],
    activeSeatIdx: 0,
    pyramid: [],
    cardsById: {},
    discard: [],
    militaryPawn: 0,
    militaryAwards: { p1At3: false, p1At6: false, p2At3: false, p2At6: false },
    progressOffer: [],
    pendingProgressPick: null,
    wonderDraft: null,
    pendingWonderBury: null,
    finalScoringBreakdown: null,
    endReason: null,
    winnerSeatIdx: null,
    log: [],
    logSeq: 0,
  };
}

function blueCard(id: number, vp: number): DuelCard {
  return {
    id, name: `Blue${id}`, age: 1, color: 'blue',
    cost: {}, effects: [{ kind: 'vp', vp }],
  };
}

function sciCard(id: number, sym: 'compass' | 'gear' | 'tablet' | 'lyre' | 'wheel' | 'sundial' | 'mortar'): DuelCard {
  return {
    id, name: `Sci${id}-${sym}`, age: 1, color: 'green',
    cost: {}, effects: [{ kind: 'science', symbol: sym }],
  };
}

describe('Duel scoring', () => {
  it('civilian: sum of blue VP', () => {
    const s = emptyState();
    s.players[0].tableau = [blueCard(1, 3), blueCard(2, 5), blueCard(3, 2)];
    const rows = scoreMatch(s);
    expect(rows[0].civilian).toBe(10);
  });

  it('science: n² per symbol set', () => {
    const s = emptyState();
    // 2 compass + 1 gear → 4 + 1 = 5
    s.players[0].tableau = [sciCard(1, 'compass'), sciCard(2, 'compass'), sciCard(3, 'gear')];
    const rows = scoreMatch(s);
    expect(rows[0].science).toBe(5);
  });

  it('treasury: floor(coins / 3)', () => {
    const s = emptyState();
    s.players[0].coins = 10;
    const rows = scoreMatch(s);
    expect(rows[0].treasury).toBe(3);
  });

  it('military VPs scale with pawn position', () => {
    const s = emptyState();
    s.militaryPawn = 4; // in seat 0's favor
    const rows = scoreMatch(s);
    expect(rows[0].military).toBe(5); // ≥3 = 5
    expect(rows[1].military).toBe(0);
  });

  it('Philosophy progress token = +7 VP', () => {
    const s = emptyState();
    s.players[0].progressTokens = ['philosophy'];
    const rows = scoreMatch(s);
    expect(rows[0].progress).toBe(7);
  });

  it('Mathematics scales with progress-token count', () => {
    const s = emptyState();
    s.players[0].progressTokens = ['mathematics', 'philosophy'];
    const rows = scoreMatch(s);
    // mathematics = 3 × 2 tokens = 6, philosophy = 7 → 13 total
    expect(rows[0].progress).toBe(13);
  });

  it('Agriculture adds +4 VP', () => {
    const s = emptyState();
    s.players[0].progressTokens = ['agriculture'];
    const rows = scoreMatch(s);
    expect(rows[0].progress).toBe(4);
  });

  it('total = sum of all categories', () => {
    const s = emptyState();
    s.players[0].tableau = [blueCard(1, 6)];
    s.players[0].coins = 9;
    s.militaryPawn = 5;
    s.players[0].progressTokens = ['philosophy'];
    const rows = scoreMatch(s);
    // civilian 6 + science 0 + commercial 0 + guild 0 + wonders 0 + treasury 3 + military 5 + progress 7 = 21
    expect(rows[0].total).toBe(21);
  });
});
