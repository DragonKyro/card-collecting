// Sea Salt & Paper module — STUB.

import type { GameModule } from '@/core/module';
import type { Seat } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SspState, SspAction, SspConfig } from './types';

export const seaSaltPaperModule: GameModule<SspState, SspAction, SspConfig> = {
  id: 'sea-salt-paper',
  name: 'Sea Salt & Paper',
  tagline: 'Draw, pair, and decide when to call STOP.',
  minPlayers: 2,
  maxPlayers: 4,

  defaultConfig(_seats: Seat[]): SspConfig {
    return { targetScore: 35 };
  },

  validateConfig(config) {
    return config.targetScore >= 20 && config.targetScore <= 100
      ? []
      : ['Target score must be 20–100.'];
  },

  createInitialState(config, seed) {
    return {
      phase: 'playing',
      seats: [],
      activePlayerId: null,
      finalScores: null,
      rngState: createRng(seed),
      config,
      round: 1,
      deck: [],
      discard: [],
      players: [],
      subPhase: 'draw',
      lastChanceFrom: null,
      lastChanceRemaining: [],
    };
  },

  applyAction(state, _action) {
    // TODO: implement reducer.
    return state;
  },

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
