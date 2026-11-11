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

  // The shell's look around this game (lobby banner, game bar, page).
  theme: {
    accent: '#ff7a59',
    accentInk: '#2b0f06',
    titleFont: 'var(--font-round)',
    // Lacquer-red sushi bar: two lantern glows over seigaiha scales (each row
    // drawn opaque over the one above, so the glows and shade sit on top).
    backdrop: `radial-gradient(640px 420px at 6% -4%, rgba(255, 170, 96, 0.42), transparent 70%), radial-gradient(560px 380px at 96% 2%, rgba(255, 130, 80, 0.3), transparent 70%), radial-gradient(900px 520px at 50% 115%, rgba(255, 90, 70, 0.14), transparent 70%), linear-gradient(180deg, rgba(28, 6, 4, 0) 0%, rgba(20, 4, 3, 0.62) 100%), url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='28' viewBox='0 0 40 20'><g fill='%23461410' stroke='%23ffcf94' stroke-opacity='0.07' stroke-width='0.9'><g><circle cx='20' cy='-10' r='19.5'/><circle cx='20' cy='-10' r='14' fill='none'/><circle cx='20' cy='-10' r='8.5' fill='none'/><circle cx='20' cy='-10' r='3' fill='none'/></g><g><circle cx='0' cy='0' r='19.5'/><circle cx='0' cy='0' r='14' fill='none'/><circle cx='0' cy='0' r='8.5' fill='none'/><circle cx='0' cy='0' r='3' fill='none'/></g><g><circle cx='40' cy='0' r='19.5'/><circle cx='40' cy='0' r='14' fill='none'/><circle cx='40' cy='0' r='8.5' fill='none'/><circle cx='40' cy='0' r='3' fill='none'/></g><g><circle cx='20' cy='10' r='19.5'/><circle cx='20' cy='10' r='14' fill='none'/><circle cx='20' cy='10' r='8.5' fill='none'/><circle cx='20' cy='10' r='3' fill='none'/></g><g><circle cx='0' cy='20' r='19.5'/><circle cx='0' cy='20' r='14' fill='none'/><circle cx='0' cy='20' r='8.5' fill='none'/><circle cx='0' cy='20' r='3' fill='none'/></g><g><circle cx='40' cy='20' r='19.5'/><circle cx='40' cy='20' r='14' fill='none'/><circle cx='40' cy='20' r='8.5' fill='none'/><circle cx='40' cy='20' r='3' fill='none'/></g><g><circle cx='20' cy='30' r='19.5'/><circle cx='20' cy='30' r='14' fill='none'/><circle cx='20' cy='30' r='8.5' fill='none'/><circle cx='20' cy='30' r='3' fill='none'/></g></g></svg>"), #461410`,
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
