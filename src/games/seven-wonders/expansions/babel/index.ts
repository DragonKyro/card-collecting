// Babel expansion — module assembly.
//
// Babel adds 5 orange cards per age (per-player-count appearances) via the
// ageDeckCards hook. It does not own any subPhases and emits no events of its
// own; the contribution is pure card-pool + scoring extras.
//
// The headline central-board mechanics (Tower of Babel law tiles, Great
// Projects of Babylon cooperative goals) are NOT modeled in v1 — they require
// shared central state with round-by-round consensus that we don't have
// authoritative rule text for. Documented in CLAUDE.md and README.md.

import type { SwExpansion } from '../types';
import type { SwAge, SwCard, SwState } from '../../types';
import type { RngState } from '@/core/rng';
import { buildBabelDeck, resetBabelCardIdCounter } from './cards';
import { scoreExtrasBabel } from './scoring';
import { BabelLobbySection } from './ui';

function setupBabel(state: SwState): void {
  void state;
  resetBabelCardIdCounter(30000);
}

function ageDeckCardsBabel(age: SwAge, playerCount: number, rng: RngState): SwCard[] {
  void rng;
  return buildBabelDeck(age, playerCount);
}

export const babelExpansion: SwExpansion = {
  id: 'babel',
  label: 'Babel',

  setupMatch(state) {
    setupBabel(state);
  },

  ageDeckCards(age, playerCount, rng) {
    return ageDeckCardsBabel(age, playerCount, rng);
  },

  scoreExtras(state, player) {
    return scoreExtrasBabel(state, player);
  },

  scoreCategories: ['babel'],

  LobbySection: BabelLobbySection,
};
