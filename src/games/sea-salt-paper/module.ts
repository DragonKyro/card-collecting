// Sea Salt & Paper module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SspState, SspAction, SspConfig, SspPlayer } from './types';
import { applyAction, setupNewMatch } from './reducer';
import { chooseAIAction } from './ai';
import { defaultTargetScore } from './cards';

export const seaSaltPaperModule: GameModule<SspState, SspAction, SspConfig> = {
  id: 'sea-salt-paper',
  name: 'Sea Salt & Paper',
  tagline: 'Draw, pair, and decide when to call STOP.',
  minPlayers: 2,
  maxPlayers: 4,

  defaultConfig(seats: Seat[]): SspConfig {
    return { targetScore: defaultTargetScore(seats.length || 2) };
  },

  validateConfig(config) {
    return config.targetScore >= 20 && config.targetScore <= 100
      ? []
      : ['Target score must be 20–100.'];
  },

  createInitialState(config, seed, seats) {
    const state: SspState = {
      phase: 'playing',
      seats: [],
      activePlayerId: null,
      finalScores: null,
      rngState: createRng(seed),
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
      mermaidWinnerId: null,
    };
    return attachSeatsAndStart(state, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return chooseAIAction(state, playerId);
  },

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};

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
