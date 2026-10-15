// Sea Salt & Paper module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import type { SspState, SspAction, SspConfig } from './types';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { defaultTargetScore } from './cards';
import { createSspState } from './setup';
import { SeaSaltPaperThumbnail } from './Thumbnail';

export { attachSeatsAndStart } from './setup';

export const seaSaltPaperModule: GameModule<SspState, SspAction, SspConfig> = {
  id: 'sea-salt-paper',
  name: 'Sea Salt & Paper',
  tagline: 'Draw, pair, and decide when to call STOP.',
  minPlayers: 2,
  maxPlayers: 4,

  defaultConfig(seats: Seat[]): SspConfig {
    return {
      targetScore: defaultTargetScore(seats.length || 2),
      expansions: { extraSalt: false, extraPepper: false },
    };
  },

  validateConfig(config) {
    return config.targetScore >= 20 && config.targetScore <= 100
      ? []
      : ['Target score must be 20–100.'];
  },

  createInitialState(config, seed, seats) {
    return createSspState(config, seed, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return chooseAIAction(state, playerId);
  },

  Thumbnail: SeaSaltPaperThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
