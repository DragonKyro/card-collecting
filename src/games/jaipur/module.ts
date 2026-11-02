// Jaipur module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import type { JaipurState, JaipurAction, JaipurConfig } from './types';
import { applyAction, createJaipurState } from './reducer';
import { chooseJaipurAction } from './ai';
import { JaipurThumbnail } from './Thumbnail';

export const jaipurModule: GameModule<JaipurState, JaipurAction, JaipurConfig> = {
  id: 'jaipur',
  name: 'Jaipur',
  tagline: 'Trade goods at the market, herd camels, and sell before your rival does.',
  minPlayers: 2,
  maxPlayers: 2,

  defaultConfig(_seats: Seat[]): JaipurConfig {
    return { sealsToWin: 2, memoryAid: true };
  },

  validateConfig(config, seats) {
    const errors: string[] = [];
    if (!(Number.isInteger(config.sealsToWin) && config.sealsToWin >= 1 && config.sealsToWin <= 3)) {
      errors.push('Seals to win must be 1–3.');
    }
    if (seats && seats.length !== 2) errors.push('Jaipur is for exactly 2 players.');
    return errors;
  },

  createInitialState(config, seed, seats) {
    return createJaipurState(config, seed, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return chooseJaipurAction(state, playerId);
  },

  Thumbnail: JaipurThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
