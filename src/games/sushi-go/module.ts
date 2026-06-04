// Sushi Go! Party module — STUB. Engine + UI to be filled in once base scaffolding
// lands. Keeps the registry compiling and lets the lobby show the game card.

import type { GameModule } from '@/core/module';
import type { Seat } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SushiGoState, SushiGoAction, SushiGoConfig, SushiGoCardKind } from './types';

const DEFAULT_MENU: SushiGoCardKind[] = [
  'nigiri', 'maki',
  'tempura', 'sashimi', 'dumpling',
  'soySauce', 'wasabi', 'pudding',
];

export const sushiGoModule: GameModule<SushiGoState, SushiGoAction, SushiGoConfig> = {
  id: 'sushi-go',
  name: 'Sushi Go! Party',
  tagline: 'Pass-and-pick set collection. 3 rounds. Try to score the most.',
  minPlayers: 2,
  maxPlayers: 8,

  defaultConfig(_seats: Seat[]): SushiGoConfig {
    return { menu: DEFAULT_MENU.slice(), rounds: 3 };
  },

  validateConfig(config) {
    const errors: string[] = [];
    if (config.menu.length !== 8) errors.push('Menu must be exactly 8 card kinds.');
    if (config.rounds < 1 || config.rounds > 5) errors.push('Rounds must be 1–5.');
    return errors;
  },

  createInitialState(config, seed, _seats) {
    return {
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
    };
  },

  applyAction(state, _action) {
    // TODO: implement reducer (submitPick / resolveSpecial / advanceTick).
    return state;
  },

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
