// Session stats derived from SetState.history.
//
// Nothing is persisted (the project's "no saves between sessions" non-goal
// stands) — this is the end-of-run readout and the live pace indicator, computed
// fresh from the history the reducer already records.

import type { PlayerId } from '@/core/types';
import type { SetHistoryEntry, SetState } from './types';

export interface SeatStats {
  playerId: PlayerId;
  sets: number;
  mistakes: number;
  /** Accuracy over claims that completed a selection. */
  accuracy: number;
  /** Split times between this seat's consecutive finds, in ms. */
  splits: number[];
  bestMs: number | null;
  medianMs: number | null;
  meanMs: number | null;
}

export interface MatchStats {
  /** Wall-clock span of the match, in ms. */
  elapsedMs: number;
  totalSets: number;
  totalMistakes: number;
  hintsUsed: number;
  /** Boards cleared — puzzle modes only. */
  boardsCleared: number;
  seats: SeatStats[];
}

export function matchStats(state: SetState): MatchStats {
  const finds = state.history.filter((h) => h.kind === 'set');
  const misses = state.history.filter((h) => h.kind === 'mistake');
  const last = state.history[state.history.length - 1];
  const elapsedMs = state.startedAtMs === null || !last
    ? 0
    : Math.max(0, last.atMs - state.startedAtMs);

  return {
    elapsedMs,
    totalSets: finds.length,
    totalMistakes: misses.length,
    hintsUsed: state.hintsUsed,
    boardsCleared: state.history.filter((h) => h.kind === 'boardDone').length,
    seats: state.seats.map((seat) => seatStats(seat.id, finds, misses)),
  };
}

function seatStats(
  playerId: PlayerId,
  finds: readonly SetHistoryEntry[],
  misses: readonly SetHistoryEntry[],
): SeatStats {
  const mine = finds.filter((h) => h.byPlayerId === playerId);
  const myMisses = misses.filter((h) => h.byPlayerId === playerId);
  const splits = mine.map((h) => h.splitMs).filter((ms) => ms > 0);
  const claims = mine.length + myMisses.length;
  return {
    playerId,
    sets: mine.length,
    mistakes: myMisses.length,
    accuracy: claims === 0 ? 1 : mine.length / claims,
    splits,
    bestMs: splits.length ? Math.min(...splits) : null,
    medianMs: median(splits),
    meanMs: splits.length ? splits.reduce((a, b) => a + b, 0) / splits.length : null,
  };
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** mm:ss.t — matches the pace at which a Set player reads a clock. */
export function formatMs(ms: number, showTenths = true): string {
  const total = Math.max(0, ms);
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  const base = `${mins}:${String(secs).padStart(2, '0')}`;
  return showTenths ? `${base}.${tenths}` : base;
}

/** 4.2s — for split times, where minutes are noise. */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
