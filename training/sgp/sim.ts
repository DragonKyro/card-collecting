// Headless Sushi Go! Party matches: the real reducer, no UI, no timers.
// Round-end screens are clicked through automatically; agents only see
// decisions that belong to them. Picks are simultaneous in the rules — here
// seats submit one after another, each seeing only that others HAVE picked.
//
// Every match gets its own random legal menu, drawn from the match seed, so a
// seed pins the deal and the menu together (seat-swapped evals replay both).

import type { PlayerId, Seat } from '@/core/types';
import { createRng, rngNext } from '@/core/rng';
import type { SushiGoCardKind, SushiGoState } from '@/games/sushi-go/types';
import { randomMenu } from '@/games/sushi-go/cards';
import { applyAction } from '@/games/sushi-go/reducer';
import { sushiGoModule } from '@/games/sushi-go/module';
import type { SushiGoAgent } from './agents';

export interface SimOptions {
  /** A fixed menu, or a random legal one per match (the default). */
  menu?: SushiGoCardKind[] | 'random';
  rounds?: number;
  /** Abandon a match after this many reducer steps (counted as truncated). */
  maxSteps?: number;
}

export interface SeatStats {
  decisions: number;
  thinkMs: number;
  roundPoints: number;
  dessertPoints: number;
}

export interface MatchResult {
  seed: number;
  outcome: 'finished' | 'truncated' | 'error';
  /** Null for a draw: same total and same dessert count. */
  winnerSeat: number | null;
  scores: number[];
  steps: number;
  seats: SeatStats[];
  /** Set when an agent returned nothing, threw, or made a move the reducer rejected. */
  error?: { seat: number; message: string };
}

export function seatIds(n: number): PlayerId[] {
  return Array.from({ length: n }, (_, i) => `s${i}`);
}

export function menuFor(seed: number, players: number, opts: SimOptions): SushiGoCardKind[] {
  if (opts.menu && opts.menu !== 'random') return opts.menu.slice();
  const rng = createRng((seed ^ 0x6d2b79f5) >>> 0);
  return randomMenu(players, () => rngNext(rng));
}

export function newMatch(seed: number, opts: SimOptions, players = 2): SushiGoState {
  const seats: Seat[] = seatIds(players).map((id) => ({ id, name: id, color: '#888', isAI: true, isLocal: true }));
  return sushiGoModule.createInitialState({ menu: menuFor(seed, players, opts), rounds: opts.rounds ?? 3 }, seed, seats);
}

/** The seat whose decision the match is waiting on (simultaneous picks: lowest seat still to pick). */
export function actingSeat(state: SushiGoState): number {
  if (state.subPhase === 'selecting') return state.players.findIndex((p) => p.pendingPick === null);
  return state.players.findIndex((p) => p.id === state.activePlayerId);
}

/** Highest total wins; ties go to more dessert cards (the rulebook), else a draw. */
export function winnerSeatOf(state: SushiGoState): number | null {
  if (!state.finalScores) return null;
  const key = (i: number) => [state.finalScores![state.players[i].id], state.players[i].dessertPile.length];
  let best = 0;
  let tied = false;
  for (let i = 1; i < state.players.length; i++) {
    const [s, d] = key(i);
    const [bs, bd] = key(best);
    if (s > bs || (s === bs && d > bd)) { best = i; tied = false; }
    else if (s === bs && d === bd) tied = true;
  }
  return tied ? null : best;
}

/** Play one match with `agents[i]` in seat i. */
export function playMatch(agents: SushiGoAgent[], seed: number, opts: SimOptions): MatchResult {
  const maxSteps = opts.maxSteps ?? 5_000;
  let state = newMatch(seed, opts, agents.length);
  const seats: SeatStats[] = agents.map(() => ({ decisions: 0, thinkMs: 0, roundPoints: 0, dessertPoints: 0 }));
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

  state.players.forEach((p, i) => {
    seats[i].roundPoints = p.scoreByRound.reduce((s, x) => s + x, 0);
    seats[i].dessertPoints = p.dessertScore;
  });
  const finished = state.phase === 'gameOver';
  return {
    seed,
    outcome: error ? 'error' : finished ? 'finished' : 'truncated',
    winnerSeat: finished ? winnerSeatOf(state) : null,
    scores: state.players.map((p) => state.finalScores?.[p.id] ?? p.scoreByRound.reduce((s, x) => s + x, 0)),
    steps,
    seats,
    error,
  };
}
