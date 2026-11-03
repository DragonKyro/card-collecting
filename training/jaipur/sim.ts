// Headless Jaipur matches: the real reducer, no UI, no timers. Round-end
// screens are clicked through automatically; agents only see their own turns.
// A seed pins the deal of every round and who starts round one, so a
// seat-swapped eval replays the same cards from both chairs.

import type { PlayerId, Seat } from '@/core/types';
import type { JaipurState } from '@/games/jaipur/types';
import { applyAction, createJaipurState } from '@/games/jaipur/reducer';
import type { JaipurAgent } from './agents';

export interface SimOptions {
  /** Seals to win the match (2 = best of three). */
  sealsToWin?: number;
  /** Abandon a match after this many reducer steps (counted as truncated). */
  maxSteps?: number;
}

export interface SeatStats {
  decisions: number;
  thinkMs: number;
  /** Rupees summed over the match's rounds (camel token included). */
  rupees: number;
  roundsWon: number;
  camelTokens: number;
  sales: number;
  cardsSold: number;
  bonusTokens: number;
  trades: number;
  singleTakes: number;
  camelTakes: number;
}

export interface MatchResult {
  seed: number;
  outcome: 'finished' | 'truncated' | 'error';
  winnerSeat: number | null;
  /** Seals per seat. */
  scores: number[];
  rounds: number;
  steps: number;
  seats: SeatStats[];
  /** Set when an agent returned nothing, threw, or made a move the reducer rejected. */
  error?: { seat: number; message: string };
}

export function seatIds(): PlayerId[] {
  return ['s0', 's1'];
}

export function newMatch(seed: number, opts: SimOptions = {}): JaipurState {
  const seats: Seat[] = seatIds().map((id) => ({ id, name: id, color: '#888', isAI: true, isLocal: true }));
  return createJaipurState({ sealsToWin: opts.sealsToWin ?? 2 }, seed, seats);
}

/** The seat whose turn it is (−1 between rounds / after the match). */
export function actingSeat(state: JaipurState): number {
  return state.players.findIndex((p) => p.id === state.activePlayerId);
}

export function winnerSeatOf(state: JaipurState): number | null {
  const i = state.players.findIndex((p) => p.id === state.winnerId);
  return i === -1 ? null : i;
}

const emptyStats = (): SeatStats => ({
  decisions: 0, thinkMs: 0, rupees: 0, roundsWon: 0, camelTokens: 0, sales: 0, cardsSold: 0, bonusTokens: 0,
  trades: 0, singleTakes: 0, camelTakes: 0,
});

/** Play one match with `agents[i]` in seat i. */
export function playMatch(agents: JaipurAgent[], seed: number, opts: SimOptions = {}): MatchResult {
  const maxSteps = opts.maxSteps ?? 5_000;
  let state = newMatch(seed, opts);
  const seats = agents.map(emptyStats);
  let steps = 0;
  let error: MatchResult['error'];

  while (state.phase === 'playing' && steps < maxSteps) {
    if (state.subPhase === 'roundEnd') {
      state = applyAction(state, { type: 'nextRound' });
      steps++;
      continue;
    }
    const seat = actingSeat(state);
    const pid = state.players[seat].id;
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

  const index = new Map(state.players.map((p, i) => [p.id, i]));
  for (const e of state.log) {
    if (!('playerId' in e)) continue;
    const st = seats[index.get(e.playerId)!];
    if (!st) continue;
    switch (e.kind) {
      case 'sell': st.sales++; st.cardsSold += e.count; if (e.bonus) st.bonusTokens++; break;
      case 'exchange': st.trades++; break;
      case 'takeOne': st.singleTakes++; break;
      case 'takeCamels': st.camelTakes++; break;
    }
  }
  for (const r of state.roundHistory) {
    for (const row of r.perPlayer) {
      const st = seats[index.get(row.playerId)!];
      st.rupees += row.total;
      if (row.camel) st.camelTokens++;
    }
    if (r.winnerId) seats[index.get(r.winnerId)!].roundsWon++;
  }
  const finished = state.phase === 'gameOver';
  return {
    seed,
    outcome: error ? 'error' : finished ? 'finished' : 'truncated',
    winnerSeat: finished ? winnerSeatOf(state) : null,
    scores: state.players.map((p) => p.seals),
    rounds: state.roundHistory.length,
    steps,
    seats,
    error,
  };
}
