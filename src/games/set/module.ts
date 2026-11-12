// Set module.
//
// Solo / shared-screen only for now: no chooseAIAction (Set has no turn order for
// an AI driver to hook into) and no online support (the selection is shared
// state built card by card, so two players selecting at once would trample
// each other; a claim needs to be one action — see "Set online racing" in
// CLAUDE.md).

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
  // Real-time claims are shared card-by-card selections: not raceable online yet.
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

  // The shell's look around this game (lobby banner, game bar, page).
  theme: {
    accent: '#a66cff',
    accentInk: '#ffffff',
    titleFont: 'var(--font-round)',
    backdrop: 'radial-gradient(700px 500px at 10% 10%, rgba(232, 60, 80, 0.2), transparent 70%), radial-gradient(700px 500px at 90% 20%, rgba(40, 180, 100, 0.18), transparent 70%), radial-gradient(800px 600px at 50% 110%, rgba(140, 80, 230, 0.26), transparent 70%), linear-gradient(180deg, #17122c 0%, #100c20 100%)',
  },

  Thumbnail: SetThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
