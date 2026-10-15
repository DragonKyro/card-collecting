// Set module.
//
// Solo / shared-screen only for now: no chooseAIAction (Set has no turn order for
// an AI driver to hook into) and no online support (a real-time race needs
// host-authoritative claim arbitration, which the action-broadcast net layer
// can't provide yet — see CLAUDE.md).

import type { GameModule } from '@/core/module';
import type { Seat } from '@/core/types';
import { DEFAULT_MODE_ID, SET_MODES } from './modes';
import { applyAction, createInitialSetState } from './reducer';
import type { SetAction, SetConfig, SetState } from './types';
import { SetThumbnail } from './Thumbnail';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;

export const setModule: GameModule<SetState, SetAction, SetConfig> = {
  id: 'set',
  name: 'Set',
  tagline: 'Spot the pattern. Three cards, four features, one answer.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  // Real-time claims can't be arbitrated by the action-broadcast net layer yet.
  onlineSupported: false,

  defaultConfig(_seats: Seat[]): SetConfig {
    return { modeId: DEFAULT_MODE_ID, enableHints: false };
  },

  validateConfig(config) {
    const errs: string[] = [];
    if (!SET_MODES.some((m) => m.id === config.modeId)) {
      errs.push(`Unknown mode: ${config.modeId}.`);
    }
    return errs;
  },

  createInitialState(config, seed, seats) {
    return createInitialSetState(config, seed, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  Thumbnail: SetThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
