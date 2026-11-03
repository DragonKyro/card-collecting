// Machi Koro module — Machi Koro 2 by default, the original base game (with its
// Harbor and Millionaire's Row expansions) as an edition option.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import type { MkAction, MkConfig, MkState } from './types';
import { applyAction, createMatch } from './reducer';
import { chooseAIAction } from './ai';
import { ALL_EXPANSIONS, EDITIONS, rulesFor } from './cards';
import { MachiKoroThumbnail } from './Thumbnail';

export const machiKoroModule: GameModule<MkState, MkAction, MkConfig> = {
  id: 'machi-koro',
  name: 'Machi Koro',
  tagline: 'Roll the dice, collect coins, grow your town. Machi Koro 2 or the original.',
  minPlayers: 2,
  maxPlayers: 5,
  hiddenInfo: false,

  defaultConfig(_seats: Seat[]): MkConfig {
    return { edition: 'mk2', promoLandmarks: false, expansions: [] };
  },

  validateConfig(config, seats) {
    const errors: string[] = [];
    if (!EDITIONS[config.edition]) return ['Unknown edition.'];
    if (config.expansions?.some((x) => !ALL_EXPANSIONS.includes(x))) return ['Unknown expansion.'];
    const R = rulesFor(config);
    if (seats && (seats.length < R.minPlayers || seats.length > R.maxPlayers)) {
      errors.push(`${R.name} plays ${R.minPlayers}–${R.maxPlayers} players.`);
    }
    return errors;
  },

  createInitialState(config, seed, seats) {
    return createMatch(config, seed, seats);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return chooseAIAction(state, playerId);
  },

  aiDelayMs(state) {
    // Give a watching human time to follow the dice and the coins: an AI's
    // roll waits for the previous turn's animations to land, and its build
    // waits for its own payouts to finish flying.
    if (state.subPhase === 'build') return state.turn.roll ? 1300 : 700;
    if (state.subPhase === 'roll') return 750;
    return 900;
  },

  Thumbnail: MachiKoroThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
