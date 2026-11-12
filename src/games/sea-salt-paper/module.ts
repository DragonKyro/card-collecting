// Sea Salt & Paper module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import type { SspState, SspAction, SspConfig } from './types';
import { applyAction } from './reducer';
import { defaultTargetScore } from './cards';
import { createSspState } from './setup';
import { SeaSaltPaperThumbnail } from './Thumbnail';
import { AI_LEVELS, DEFAULT_AI_LEVEL, aiLevelsOf, isAiLevel } from './levels';

export { attachSeatsAndStart } from './setup';

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
  // Each AI seat picks its own (seat.aiLevel).
  aiLevels: AI_LEVELS,
  defaultAiLevel: DEFAULT_AI_LEVEL,

  defaultConfig(seats: Seat[]): SspConfig {
    return {
      targetScore: defaultTargetScore(seats.length || 2),
      expansions: { extraSalt: false, extraPepper: false },
    };
  },

  validateConfig(config, seats) {
    const errors: string[] = [];
    if (!(config.targetScore >= 20 && config.targetScore <= 100)) errors.push('Target score must be 20–100.');
    if (seats?.some((s) => s.isAI && s.aiLevel !== undefined && !isAiLevel(s.aiLevel))) errors.push('Unknown AI difficulty.');
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

  async prepare(_config, seats) {
    if (!seats.some((s) => s.isAI)) return;
    aiLevels ??= await import('./aiLevels');
    const { prepareAiLevel } = aiLevels;
    await Promise.all(aiLevelsOf(seats).map((level) => prepareAiLevel(level)));
  },

  // The shell's look around this game (lobby banner, game bar, page).
  theme: {
    accent: '#4fd1c5',
    accentInk: '#04252a',
    titleFont: 'var(--font-hand)',
    backdrop: 'radial-gradient(1000px 560px at 50% -14%, rgba(150, 235, 255, 0.32), transparent 66%), repeating-linear-gradient(105deg, rgba(255, 255, 255, 0.025) 0 40px, transparent 40px 120px), linear-gradient(180deg, #0f4457 0%, #0b2c3d 55%, #071a26 100%)',
  },

  Thumbnail: SeaSaltPaperThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
