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

  // The shell's look around this game (lobby banner, game bar, page).
  theme: {
    accent: '#ffd23f',
    accentInk: '#3a2500',
    titleFont: 'var(--font-display)',
    // Golden-hour sky over two rows of rolling hills (a far hazy ridge
    // with a few lit windows, a near green one).
    backdrop: [
      `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 300' preserveAspectRatio='none'%3E%3Cpath d='M0 120 Q180 60 400 104 T820 86 T1240 98 T1600 70 V300 H0Z' fill='%232f5a4f'/%3E%3Cg fill='%23ffd77a' opacity='.55'%3E%3Crect x='300' y='96' width='5' height='4'/%3E%3Crect x='312' y='99' width='4' height='4'/%3E%3Crect x='1130' y='92' width='5' height='4'/%3E%3Crect x='1142' y='95' width='4' height='3'/%3E%3C/g%3E%3Cpath d='M0 190 Q260 120 560 172 T1120 160 T1600 140 V300 H0Z' fill='%23234a33'/%3E%3C/svg%3E") bottom / 100% 30vh no-repeat`,
      'radial-gradient(900px 520px at 85% -12%, rgba(255, 214, 120, 0.4), transparent 66%)',
      'radial-gradient(1400px 420px at 50% 100%, rgba(255, 170, 110, 0.28), transparent 70%)',
      'linear-gradient(180deg, #1c3263 0%, #263f77 45%, #47467f 78%, #5a4673 100%)',
    ].join(', '),
  },

  Thumbnail: MachiKoroThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
