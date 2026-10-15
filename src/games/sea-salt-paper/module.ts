// Sea Salt & Paper module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import type { SspState, SspAction, SspConfig } from './types';
import { applyAction } from './reducer';
import { defaultTargetScore } from './cards';
import { createSspState } from './setup';
import { SeaSaltPaperThumbnail } from './Thumbnail';

export { attachSeatsAndStart } from './setup';

const AI_LEVEL_IDS = ['easy', 'normal', 'hard'];

// The trained AI (encoder + network runtime) is loaded on demand by prepare(),
// keeping it out of the game-picker bundle.
type AiLevels = typeof import('./aiLevels');
let aiLevels: AiLevels | null = null;

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
      aiLevel: 'normal',
    };
  },

  validateConfig(config) {
    const errors: string[] = [];
    if (!(config.targetScore >= 20 && config.targetScore <= 100)) errors.push('Target score must be 20–100.');
    if (config.aiLevel !== undefined && !AI_LEVEL_IDS.includes(config.aiLevel)) errors.push('Unknown AI difficulty.');
    return errors;
  },

  createInitialState(config, seed, seats) {
    return createSspState(config, seed, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return aiLevels ? aiLevels.chooseLeveledAction(state, playerId) : null;
  },

  async prepare(config, seats) {
    if (!seats.some((s) => s.isAI)) return;
    aiLevels ??= await import('./aiLevels');
    await aiLevels.prepareAiLevel(aiLevels.aiLevelOf(config));
  },

  Thumbnail: SeaSaltPaperThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
