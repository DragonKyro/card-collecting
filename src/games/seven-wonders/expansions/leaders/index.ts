// Leaders expansion — module assembly.

import { lazy } from 'react';
import type { SwExpansion } from '../types';
import {
  setupLeaders, pregameLeaders, beforeAgeStart, applyAction, nextAIPicker,
  onEventLeaders, LEADERS_TURN_END_STEPS,
} from './reducer';
import { leadersGuilds } from './cards';
import { chooseAIAction } from './ai';
import { scoreExtrasLeaders } from './scoring';
import { LeadersLobbySection } from './lobby';

// The overlay draws cards with the game's art, which ships in the lazily
// loaded game-view chunk — so load it lazily too (GameView wraps it in Suspense).
const LeadersOverlay = lazy(() => import('./ui').then((m) => ({ default: m.LeadersOverlay })));

const OWNED_SUBPHASES = new Set(['leaderDraft', 'leaderPlay', 'solomonAwaitPick', 'courtesan', 'romeRecruit']);

export const leadersExpansion: SwExpansion = {
  id: 'leaders',
  label: 'Leaders',

  guilds: leadersGuilds,
  setupMatch: setupLeaders,
  pregame: pregameLeaders,
  beforeAgeStart: (state) => beforeAgeStart(state),

  applyAction,
  ownsSubPhase: (subPhase) => OWNED_SUBPHASES.has(subPhase),
  nextAIPicker,
  chooseAIAction,

  onEvent: onEventLeaders,
  turnEndSteps: LEADERS_TURN_END_STEPS,

  scoreExtras: scoreExtrasLeaders,
  scoreCategories: ['leaders'],

  GameOverlay: LeadersOverlay,
  LobbySection: LeadersLobbySection,
};
