// Match setup for Sea Salt & Paper. Kept apart from module.ts so headless
// callers (the training simulator, tests) can start a match without pulling
// in the module's React thumbnail.

import type { Seat } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SspState, SspConfig, SspPlayer } from './types';
import { setupNewMatch } from './reducer';
import { buildEventDeck } from './events';

export function createSspState(config: SspConfig, seed: number, seats: Seat[]): SspState {
  const rngState = createRng(seed);
  const usingPepper = !!config.expansions?.extraPepper;
  const state: SspState = {
    phase: 'playing',
    seats: [],
    activePlayerId: null,
    finalScores: null,
    rngState,
    config,
    round: 1,
    deck: [],
    discards: [[], []],
    pendingDraw: [],
    players: [],
    subPhase: 'awaitingAction',
    lastChanceFrom: null,
    lastChanceRemaining: [],
    lastRoundSummary: null,
    roundHistory: [],
    mermaidWinnerId: null,
    pendingLobsterPick: [],
    lockedPlayerIds: [],
    event: usingPepper
      ? { deck: buildEventDeck(rngState), current: null }
      : null,
    log: [],
    logSeq: 0,
  };
  return attachSeatsAndStart(state, seats);
}

/** Helper to attach seats and start the match. Called by the lobby on game start. */
export function attachSeatsAndStart(state: SspState, seats: Seat[]): SspState {
  state.seats = seats;
  state.players = seats.map<SspPlayer>((s) => ({
    id: s.id,
    hand: [],
    table: [],
    roundScore: 0,
    matchScore: 0,
  }));
  setupNewMatch(state);
  return state;
}
