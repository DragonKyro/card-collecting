// Sushi Go! Party module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SushiGoState, SushiGoAction, SushiGoConfig, SushiGoPlayer } from './types';
import { applyAction, setupNewMatch } from './reducer';
import { DEFAULT_MENU, validateMenu } from './cards';
import { SushiGoThumbnail } from './Thumbnail';
import { AI_LEVELS, DEFAULT_AI_LEVEL, aiLevelsOf, isAiLevel } from './levels';

// The trained AI (encoder + network runtime) is loaded on demand by prepare(),
// keeping it out of the game-picker bundle.
type AiLevels = typeof import('./aiLevels');
let aiLevels: AiLevels | null = null;

export const sushiGoModule: GameModule<SushiGoState, SushiGoAction, SushiGoConfig> = {
  id: 'sushi-go',
  name: 'Sushi Go! Party',
  tagline: 'Pick a card, pass the rest. Build the best meal across 3 rounds.',
  minPlayers: 2,
  maxPlayers: 8,
  replayInLobby: true,
  // Each AI seat picks its own (seat.aiLevel).
  aiLevels: AI_LEVELS,
  defaultAiLevel: DEFAULT_AI_LEVEL,

  defaultConfig(_seats: Seat[]): SushiGoConfig {
    return { menu: DEFAULT_MENU.slice(), rounds: 3 };
  },

  validateConfig(config, seats) {
    const errors: string[] = [];
    errors.push(...validateMenu(config.menu, seats?.length));
    if (config.rounds < 1 || config.rounds > 5) errors.push('Rounds must be 1–5.');
    if (seats?.some((s) => s.isAI && s.aiLevel !== undefined && !isAiLevel(s.aiLevel))) errors.push('Unknown AI difficulty.');
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
      dessertSupply: [],
      discards: [],
      players: [],
      uramakiNextPlace: 0,
      resolution: null,
      lastRoundSummary: null,
      roundHistory: [],
      log: [],
      logSeq: 0,
    };
    return attachSeatsAndStart(state, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return aiLevels ? aiLevels.chooseLeveledAction(state, playerId) : null;
  },

  async prepare(_config, seats) {
    if (!seats.some((s) => s.isAI)) return;
    aiLevels ??= await import('./aiLevels');
    const { prepareAiLevel } = aiLevels;
    await Promise.all(aiLevelsOf(seats).map((level) => prepareAiLevel(level)));
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
    uramakiPoints: 0,
    scoreByRound: [],
    dessertScore: 0,
  }));
  setupNewMatch(state);
  return state;
}
