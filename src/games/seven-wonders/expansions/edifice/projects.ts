// 7 Wonders Edifice expansion — central project tiles.
//
// At match setup, three project tiles are drawn (one for each age) from a pool
// of 8. Each project has:
//   - threshold: minimum number of contributors required for the reward to
//     trigger at age end.
//   - reward: applied to every contributor (only if threshold met).
//   - penalty: applied to every non-contributor (only if threshold met).
// A player counts as contributing to age N's project if they built any wonder
// stage during age N. This is the simplest faithful reading of the Edifice
// mechanic — wonder stages already exist as an action, no new action type
// is needed. (The full rulebook describes a player-pawn deposit; in v1 we
// fold that into the existing wonder-stage build.)
//
// Rewards / penalties are computed at endgame as `edifice` score extras to
// avoid mutating state at age-end.

import type { SwEdificeProject } from '../../types';

export const EDIFICE_PROJECT_POOL: readonly SwEdificeProject[] = [
  // ----- Age I projects -----
  {
    id: 'colossus-foundation',
    name: 'Foundation of the Colossus',
    age: 1,
    threshold: 2,
    reward: { kind: 'shields', shields: 2 },
    penalty: { kind: 'vp', vp: -3 },
    description: 'Each contributor: +2 shields. Each non-contributor: -3 VP.',
  },
  {
    id: 'great-library-foundation',
    name: 'Foundation of the Great Library',
    age: 1,
    threshold: 2,
    reward: { kind: 'science', symbol: 'tablet' },
    penalty: { kind: 'vp', vp: -2 },
    description: 'Each contributor: +1 tablet symbol. Each non-contributor: -2 VP.',
  },
  {
    id: 'public-baths-foundation',
    name: 'Foundation of the Public Baths',
    age: 1,
    threshold: 2,
    reward: { kind: 'vp', vp: 3 },
    penalty: { kind: 'coins', coins: -4 },
    description: 'Each contributor: +3 VP. Each non-contributor: -4 coins (at endgame, capped to current treasury).',
  },

  // ----- Age II projects -----
  {
    id: 'colossus-erection',
    name: 'Erection of the Colossus',
    age: 2,
    threshold: 3,
    reward: { kind: 'shields', shields: 3 },
    penalty: { kind: 'vp', vp: -4 },
    description: 'Each contributor: +3 shields. Each non-contributor: -4 VP.',
  },
  {
    id: 'great-library-erection',
    name: 'Construction of the Great Library',
    age: 2,
    threshold: 3,
    reward: { kind: 'science', symbol: 'compass' },
    penalty: { kind: 'vp', vp: -3 },
    description: 'Each contributor: +1 compass symbol. Each non-contributor: -3 VP.',
  },
  {
    id: 'aqueduct-construction',
    name: 'Construction of the Aqueduct',
    age: 2,
    threshold: 3,
    reward: { kind: 'vp', vp: 5 },
    penalty: { kind: 'debtTokens', amount: 3 },
    description: 'Each contributor: +5 VP. Each non-contributor: 3 debt tokens (-3 VP at endgame).',
  },

  // ----- Age III projects -----
  {
    id: 'colossus-completion',
    name: 'Completion of the Colossus',
    age: 3,
    threshold: 4,
    reward: { kind: 'vp', vp: 7 },
    penalty: { kind: 'vp', vp: -5 },
    description: 'Each contributor: +7 VP. Each non-contributor: -5 VP.',
  },
  {
    id: 'mausoleum-completion',
    name: 'Completion of the Mausoleum',
    age: 3,
    threshold: 4,
    reward: { kind: 'vp', vp: 8 },
    penalty: { kind: 'vp', vp: -6 },
    description: 'Each contributor: +8 VP. Each non-contributor: -6 VP.',
  },
];

/** Filter the pool to projects of a specific age. */
export function projectsForAge(age: 1 | 2 | 3): readonly SwEdificeProject[] {
  return EDIFICE_PROJECT_POOL.filter((p) => p.age === age);
}
