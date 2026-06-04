// Cities expansion — module assembly.
//
// Cities contributes ~9 black cards per age via ageDeckCards. New mechanics:
//   - Debt tokens (-1 VP each at endgame), accrued via citiesDebtToNeighbors.
//   - Diplomacy tokens, auto-consumed at age-end military to skip a player's
//     comparison (their neighbors compare across the gap). Handled in the base
//     reducer's resolveMilitary via state.players[i].diplomacyTokens.
//   - End-game scoring extras (citiesScoreExtra effect kinds).
//
// Cities does NOT own any subPhases — it's a pure deck contributor + onEvent
// observer + scoreExtras provider.

import type { SwExpansion } from '../types';
import type { SwAge, SwCard, SwState } from '../../types';
import type { RngState } from '@/core/rng';
import { buildCitiesDeck, resetCitiesCardIdCounter } from './cards';
import { onEventCities } from './triggers';
import { scoreExtrasCities } from './scoring';
import { CitiesLobbySection } from './ui';

function setupCities(state: SwState): void {
  resetCitiesCardIdCounter(20000);
  for (const p of state.players) {
    p.debtTokens = 0;
    p.diplomacyTokens = 0;
  }
}

function ageDeckCardsCities(age: SwAge, playerCount: number, rng: RngState): SwCard[] {
  void rng;
  return buildCitiesDeck(age, playerCount);
}

export const citiesExpansion: SwExpansion = {
  id: 'cities',
  label: 'Cities',

  setupMatch(state) {
    setupCities(state);
  },

  ageDeckCards(age, playerCount, rng) {
    return ageDeckCardsCities(age, playerCount, rng);
  },

  onEvent(state, event) {
    onEventCities(state, event);
  },

  scoreExtras(state, player) {
    return scoreExtrasCities(state, player);
  },

  scoreCategories: ['cities'],

  LobbySection: CitiesLobbySection,
};
