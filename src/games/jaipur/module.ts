// Jaipur module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import type { JaipurState, JaipurAction, JaipurConfig } from './types';
import { applyAction, createJaipurState } from './reducer';
import { AI_LEVELS, DEFAULT_AI_LEVEL, aiLevelsOf, isAiLevel } from './levels';
import { JaipurThumbnail } from './Thumbnail';

// The AI levels (encoder + network runtime) are loaded on demand by
// prepare(), keeping them out of the game-picker bundle.
type AiLevels = typeof import('./aiLevels');
let aiLevels: AiLevels | null = null;

/** Pause before an AI move when a human is playing (the shell's default is 380 ms). */
const AI_DELAY_MS = 1000;

export const jaipurModule: GameModule<JaipurState, JaipurAction, JaipurConfig> = {
  id: 'jaipur',
  name: 'Jaipur',
  tagline: 'Trade goods at the market, herd camels, and sell before your rival does.',
  minPlayers: 2,
  maxPlayers: 2,
  // Each AI seat picks its own (seat.aiLevel): one per shipped policy.
  aiLevels: AI_LEVELS,
  defaultAiLevel: DEFAULT_AI_LEVEL,

  defaultConfig(_seats: Seat[]): JaipurConfig {
    return { sealsToWin: 2 };
  },

  validateConfig(config, seats) {
    const errors: string[] = [];
    if (!(Number.isInteger(config.sealsToWin) && config.sealsToWin >= 1 && config.sealsToWin <= 3)) {
      errors.push('Seals to win must be 1–3.');
    }
    if (seats?.some((s) => s.isAI && s.aiLevel !== undefined && !isAiLevel(s.aiLevel))) errors.push('Unknown AI difficulty.');
    if (seats && seats.length !== 2) errors.push('Jaipur is for exactly 2 players.');
    return errors;
  },

  createInitialState(config, seed, seats) {
    return createJaipurState(config, seed, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  // With a human at the table, the AI waits a beat before moving: the
  // human's own move finishes landing first, then the AI's flies slowly
  // (ui.tsx), so it can be seen and followed.
  aiDelayMs() {
    return AI_DELAY_MS;
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

  Thumbnail: JaipurThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
