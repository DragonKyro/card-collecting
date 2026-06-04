// 7 Wonders module — STUB.

import type { GameModule } from '@/core/module';
import type { Seat } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SwState, SwAction, SwConfig } from './types';
import { SevenWondersThumbnail } from './Thumbnail';

export const sevenWondersModule: GameModule<SwState, SwAction, SwConfig> = {
  id: 'seven-wonders',
  name: '7 Wonders',
  tagline: 'Build a civilization in three ages. Draft, pass, build.',
  minPlayers: 3,
  maxPlayers: 7,

  defaultConfig(_seats: Seat[]): SwConfig {
    return { expansions: [], wonderAssignment: 'random' };
  },

  validateConfig(config) {
    const errors: string[] = [];
    if (config.wonderAssignment === 'preset' && (!config.presetWonders || config.presetWonders.length === 0)) {
      errors.push('Preset wonders required when wonder assignment is "preset".');
    }
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
      age: 1,
      ageRound: 1,
      subPhase: 'picking',
      players: [],
      discard: [],
    };
  },

  applyAction(state, _action) {
    // TODO: implement reducer (pick collection, batch apply, military resolution, final scoring).
    return state;
  },

  Thumbnail: SevenWondersThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
