// Babel expansion — the two modules (played together or separately): the
// Tower of Babel and the Great Projects. Their overlays and table panels draw
// with the game's art, so they load lazily (GameView wraps them in Suspense).

import { lazy } from 'react';
import type { SwExpansion } from '../types';
import { towerExpansion as towerRules } from './tower';
import { projectsExpansion as projectsRules } from './projects';
import { towerAI, projectsAI, towerPickOptions, participationValue } from './ai';
import { TowerLobbySection, ProjectsLobbySection } from './lobby';

const TowerOverlay = lazy(() => import('./ui').then((m) => ({ default: m.TowerOverlay })));
const TowerPanel = lazy(() => import('./ui').then((m) => ({ default: m.TowerPanel })));
const ProjectsOverlay = lazy(() => import('./ui').then((m) => ({ default: m.ProjectPenaltyOverlay })));
const ProjectPanel = lazy(() => import('./ui').then((m) => ({ default: m.ProjectPanel })));

export const towerExpansion: SwExpansion = {
  ...towerRules,
  chooseAIAction: towerAI,
  extraPickOptions: towerPickOptions,
  LobbySection: TowerLobbySection,
  GameOverlay: TowerOverlay,
  TablePanel: TowerPanel,
};

export const projectsExpansion: SwExpansion = {
  ...projectsRules,
  chooseAIAction: projectsAI,
  aiPickValue: participationValue,
  LobbySection: ProjectsLobbySection,
  GameOverlay: ProjectsOverlay,
  TablePanel: ProjectPanel,
};
