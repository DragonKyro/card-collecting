// Edifice expansion — module assembly.
//
// Edifice adds three central "Project" tiles (one per age), drawn at match
// setup from a pool of 8. A player contributes to age N's project by building
// any wonder stage during age N. At endgame, each completed project rewards
// its contributors and penalizes its non-contributors (per the project's
// `reward` / `penalty` outcomes).
//
// Modeled as a pure observer:
//   - setupMatch draws 3 projects deterministically from state.rngState.
//   - onEvent watches wonderStageBuilt events and appends the builder's id
//     to edificeContributors[ageIdx] (deduplicated — multi-stage in one age
//     still counts as one contribution).
//   - scoreExtras applies rewards/penalties at endgame as `edifice` extras.

import type { SwExpansion } from '../types';
import type { SwEdificeProject, SwState } from '../../types';
import type { SwEvent } from '../types';
import { shuffle } from '@/core/rng';
import { projectsForAge } from './projects';
import { scoreExtrasEdifice } from './scoring';
import { EdificeLobbySection } from './ui';

function setupEdifice(state: SwState): void {
  const drawn: SwEdificeProject[] = [];
  for (const age of [1, 2, 3] as const) {
    const choices = projectsForAge(age);
    if (choices.length === 0) continue;
    const shuffled = shuffle(state.rngState, choices.slice());
    drawn.push(shuffled[0]);
  }
  state.edificeProjects = drawn;
  state.edificeContributors = drawn.map(() => []);
}

function onEventEdifice(state: SwState, event: SwEvent): void {
  if (event.kind !== 'wonderStageBuilt') return;
  const projects = state.edificeProjects;
  const contribs = state.edificeContributors;
  if (!projects || !contribs) return;
  // state.age is the current age at the moment of emission.
  const ageIdx = projects.findIndex((p) => p.age === state.age);
  if (ageIdx === -1) return;
  const list = contribs[ageIdx];
  if (!list.includes(event.playerId)) list.push(event.playerId);
}

export const edificeExpansion: SwExpansion = {
  id: 'edifice',
  label: 'Edifice',

  setupMatch(state) {
    setupEdifice(state);
  },

  onEvent(state, event) {
    onEventEdifice(state, event);
  },

  scoreExtras(state, player) {
    return scoreExtrasEdifice(state, player);
  },

  scoreCategories: ['edifice'],

  LobbySection: EdificeLobbySection,
};
