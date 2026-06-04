// Leaders expansion — module assembly.

import type { SwExpansion } from '../types';
import { setupLeaders, beforeAgeStart, applyAction, nextAIPicker } from './reducer';
import { chooseAIAction } from './ai';
import { modifyCostLeaders } from './costs';
import { onEventLeaders } from './triggers';
import { scoreExtrasLeaders } from './scoring';
import { LeadersOverlay, LeadersLobbySection } from './ui';

const OWNED_SUBPHASES = new Set(['leaderDraft', 'leaderPlay', 'solomonAwaitPick']);

export const leadersExpansion: SwExpansion = {
  id: 'leaders',
  label: 'Leaders',

  setupMatch(state) {
    setupLeaders(state);
  },

  beforeAgeStart(state, age) {
    return beforeAgeStart(state, age);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  nextAIPicker(state) {
    return nextAIPicker(state);
  },

  chooseAIAction(state, playerId) {
    return chooseAIAction(state, playerId);
  },

  modifyCost(state, player, target, cost) {
    return modifyCostLeaders(state, player, target, cost);
  },

  onEvent(state, event) {
    onEventLeaders(state, event);
  },

  scoreExtras(state, player) {
    return scoreExtrasLeaders(state, player);
  },

  scoreCategories: ['leaders'],

  ownsSubPhase(subPhase) {
    return OWNED_SUBPHASES.has(subPhase);
  },

  GameOverlay: LeadersOverlay,
  LobbySection: LeadersLobbySection,
};
