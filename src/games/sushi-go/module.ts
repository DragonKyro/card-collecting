// Sushi Go! Party module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SushiGoState, SushiGoAction, SushiGoConfig, SushiGoPlayer } from './types';
import { applyAction, setupNewMatch } from './reducer';
import { chooseAIAction } from './ai';
import { DEFAULT_MENU, validateMenu } from './cards';
import { SushiGoThumbnail } from './Thumbnail';

export const sushiGoModule: GameModule<SushiGoState, SushiGoAction, SushiGoConfig> = {
  id: 'sushi-go',
  name: 'Sushi Go! Party',
  tagline: 'Pick a card, pass the rest. Build the best meal across 3 rounds.',
  minPlayers: 2,
  maxPlayers: 8,

  defaultConfig(_seats: Seat[]): SushiGoConfig {
    return { menu: DEFAULT_MENU.slice(), rounds: 3 };
  },

  validateConfig(config) {
    const errors: string[] = [];
    errors.push(...validateMenu(config.menu));
    if (config.rounds < 1 || config.rounds > 5) errors.push('Rounds must be 1–5.');
    return errors;
  },

  createInitialState(config, seed, seats) {
    const state: SushiGoState = {
      phase: 'playing',
      seats: [],
      activePlayerId: null,
      finalScores: null,
      rngState: createRng(seed),
      config,
      round: 1,
      subPhase: 'selecting',
      deck: [],
      players: [],
      lastRoundSummary: null,
      passDirection: 'cw',
      log: [],
      logSeq: 0,
    };
    return attachSeatsAndStart(state, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return chooseAIAction(state, playerId);
  },

  Thumbnail: SushiGoThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};

export function attachSeatsAndStart(state: SushiGoState, seats: Seat[]): SushiGoState {
  state.seats = seats;
  state.players = seats.map<SushiGoPlayer>((s) => ({
    id: s.id,
    hand: [],
    table: [],
    dessertPile: [],
    pendingPick: null,
    scoreByRound: [],
    dessertScore: 0,
  }));
  setupNewMatch(state);
  return state;
}
