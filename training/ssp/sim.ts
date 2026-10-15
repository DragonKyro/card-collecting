// Headless Sea Salt & Paper matches: the real reducer, no UI, no timers.
// Round-end screens are clicked through automatically; agents only see
// decisions that belong to them.

import type { PlayerId, Seat } from '@/core/types';
import type { SspState } from '@/games/sea-salt-paper/types';
import { applyAction } from '@/games/sea-salt-paper/reducer';
import { createSspState } from '@/games/sea-salt-paper/setup';
import type { SspAgent } from './agents';

export interface SimOptions {
  extraSalt: boolean;
  extraPepper?: boolean;
  targetScore: number;
  /** Abandon a match after this many reducer steps (counted as truncated). */
  maxSteps?: number;
}

export interface SeatStats {
  decisions: number;
  thinkMs: number;
  stops: number;
  lastChances: number;
  lastChancesWon: number;
  /** Rounds where this seat's round total was strictly the highest. */
  roundsWon: number;
  mermaidWin: boolean;
}

export interface MatchResult {
  seed: number;
  outcome: 'finished' | 'truncated' | 'error';
  winnerSeat: number | null;
  scores: number[];
  rounds: number;
  steps: number;
  seats: SeatStats[];
  /** Set when an agent returned nothing, threw, or made a move the reducer rejected. */
  error?: { seat: number; message: string };
}

export function seatIds(n: number): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `s${i}`);
}

export function newMatch(seed: number, opts: SimOptions, players = 2): SspState {
  const seats: Seat[] = seatIds(players).map((id) => ({ id, name: id, color: '#888', isAI: true, isLocal: true }));
  return createSspState(
    {
      targetScore: opts.targetScore,
      expansions: { extraSalt: opts.extraSalt, extraPepper: !!opts.extraPepper },
    },
    seed,
    seats,
  );
}

export function winnerSeatOf(state: SspState): number | null {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i];
    if (e.kind === 'matchEnd') {
      const idx = state.players.findIndex((p) => p.id === e.winnerId);
      return idx === -1 ? null : idx;
    }
  }
  return null;
}

/** Play one match with `agents[i]` in seat i. */
export function playMatch(agents: SspAgent[], seed: number, opts: SimOptions): MatchResult {
  const maxSteps = opts.maxSteps ?? 10_000;
  let state = newMatch(seed, opts, agents.length);
  const seats: SeatStats[] = agents.map(() => ({
    decisions: 0, thinkMs: 0, stops: 0, lastChances: 0, lastChancesWon: 0, roundsWon: 0, mermaidWin: false,
  }));
  let steps = 0;
  let error: MatchResult['error'];

  while (state.phase === 'playing' && steps < maxSteps) {
    if (state.subPhase === 'roundEnd') {
      state = applyAction(state, { type: 'nextRound' });
      steps++;
      continue;
    }
    const pid = state.activePlayerId!;
    const seat = state.players.findIndex((p) => p.id === pid);
    try {
      const t0 = performance.now();
      const action = agents[seat].act(state, pid);
      seats[seat].thinkMs += performance.now() - t0;
      seats[seat].decisions++;
      if (!action) throw new Error(`no action in ${state.subPhase}`);
      state = applyAction(state, action);
    } catch (e) {
      error = { seat, message: (e as Error).message };
      break;
    }
    steps++;
  }

  for (const r of state.roundHistory) {
    const by = state.players.findIndex((p) => p.id === r.endedByPlayerId);
    if (by !== -1 && r.endedBy === 'stop') seats[by].stops++;
    if (by !== -1 && r.endedBy === 'lastChance') {
      seats[by].lastChances++;
      if (r.lastChanceWon) seats[by].lastChancesWon++;
    }
    const totals = state.players.map((p) => r.perPlayer.find((row) => row.playerId === p.id)?.total ?? 0);
    const top = Math.max(...totals);
    if (totals.filter((t) => t === top).length === 1) seats[totals.indexOf(top)].roundsWon++;
  }
  const mermaidSeat = state.players.findIndex((p) => p.id === state.mermaidWinnerId);
  if (mermaidSeat !== -1) seats[mermaidSeat].mermaidWin = true;

  const finished = state.phase === 'gameOver';
  return {
    seed,
    outcome: error ? 'error' : finished ? 'finished' : 'truncated',
    winnerSeat: finished ? winnerSeatOf(state) : null,
    scores: state.players.map((p) => p.matchScore),
    rounds: state.round,
    steps,
    seats,
    error,
  };
}
