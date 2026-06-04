// 7 Wonders Duel — Progress Tokens (10 total, 5 drawn at setup).
//
// Each token has a unique passive effect. Some apply on claim (Agriculture,
// Urbanism), some are endgame VP (Mathematics, Philosophy), some modify
// ongoing rules (Architecture, Masonry, Strategy, Theology, Law, Economy).
//
// Effects are handled in reducer.ts and scoring.ts by inspecting the player's
// progressTokens list. v1 implementation summary:
//   - Agriculture: +6 coins, +4 VP on claim — applied immediately in
//     reducer.claimProgress().
//   - Architecture: -2 resources on wonder construction. Applied in
//     resources.effectiveCostForWonder.
//   - Economy: when opponent buys from us, gain those coins. Applied during
//     opponent's takeAndBuild purchase resolution.
//   - Law: counts as a wild science symbol. Applied in scoring.scienceCount.
//   - Masonry: -2 resources on blue cards. Applied in resources.effectiveCostForCard.
//   - Mathematics: +3 VP per token at endgame. Applied in scoring.progressVps.
//   - Philosophy: +7 VP at endgame. Applied in scoring.progressVps.
//   - Strategy: +1 shield bonus when triggering military. Applied in
//     reducer.applyShields (treats each shield effect as +1 if owner has Strategy).
//   - Theology: wonders grant extra turn — NOT modeled in v1 (extra turn
//     mechanic itself isn't implemented; flagged as not-modeled in wonder
//     descriptions).
//   - Urbanism: +6 coins immediate. Applied in reducer.claimProgress().

import type { DuelProgressToken, DuelProgressTokenId } from './types';

export const ALL_PROGRESS_TOKENS: readonly DuelProgressToken[] = [
  {
    id: 'agriculture',
    name: 'Agriculture',
    description: 'Gain 6 coins. +4 VP at endgame.',
  },
  {
    id: 'architecture',
    name: 'Architecture',
    description: 'Wonders cost 2 fewer resources of any kind.',
  },
  {
    id: 'economy',
    name: 'Economy',
    description: 'When opponent pays for resources from you, gain those coins.',
  },
  {
    id: 'law',
    name: 'Law',
    description: 'Counts as one wild science symbol (toward 6-symbol supremacy).',
  },
  {
    id: 'masonry',
    name: 'Masonry',
    description: 'Civilian (blue) cards cost 2 fewer resources.',
  },
  {
    id: 'mathematics',
    name: 'Mathematics',
    description: '+3 VP per Progress Token you own at endgame.',
  },
  {
    id: 'philosophy',
    name: 'Philosophy',
    description: '+7 VP at endgame.',
  },
  {
    id: 'strategy',
    name: 'Strategy',
    description: '+1 shield each time you advance the military pawn.',
  },
  {
    id: 'theology',
    name: 'Theology',
    description: 'Wonder constructions grant an extra turn. (Not fully modeled in v1.)',
  },
  {
    id: 'urbanism',
    name: 'Urbanism',
    description: 'Gain 6 coins on claim.',
  },
];

export function progressTokenById(id: DuelProgressTokenId): DuelProgressToken {
  return ALL_PROGRESS_TOKENS.find((t) => t.id === id) ?? ALL_PROGRESS_TOKENS[0];
}
