// Armada expansion — module assembly.
//
// Armada adds 5 navy cards per age (per-player-count appearances) via the
// ageDeckCards hook. It does not own any subPhases and emits no events; the
// contribution is pure card-pool + scoring extras.
//
// The headline mechanics (personal shipyards, naval combat, island cards,
// pirate track) are NOT modeled in v1.

import type { SwExpansion } from '../types';
import type { SwAge, SwCard, SwState } from '../../types';
import type { RngState } from '@/core/rng';
import { buildArmadaDeck, resetArmadaCardIdCounter } from './cards';
import { scoreExtrasArmada } from './scoring';
import { ArmadaLobbySection } from './ui';

function setupArmada(state: SwState): void {
  void state;
  resetArmadaCardIdCounter(40000);
}

function ageDeckCardsArmada(age: SwAge, playerCount: number, rng: RngState): SwCard[] {
  void rng;
  return buildArmadaDeck(age, playerCount);
}

export const armadaExpansion: SwExpansion = {
  id: 'armada',
  label: 'Armada',

  setupMatch(state) {
    setupArmada(state);
  },

  ageDeckCards(age, playerCount, rng) {
    return ageDeckCardsArmada(age, playerCount, rng);
  },

  scoreExtras(state, player) {
    return scoreExtrasArmada(state, player);
  },

  scoreCategories: ['armada'],

  LobbySection: ArmadaLobbySection,
};
