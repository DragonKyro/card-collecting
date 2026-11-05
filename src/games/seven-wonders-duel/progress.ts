// 7 Wonders Duel — the 10 Progress tokens (5 on the board each match, the
// other 5 boxed for the Great Library).
//
// Where each one is applied:
//   - Agriculture, Urbanism: 6 coins when taken (reducer.takeProgressToken);
//     Agriculture's 4 VP and Philosophy / Mathematics in scoring.progressVps.
//   - Architecture / Masonry: 2 fewer resources for wonders / blue cards,
//     the owner's choice — resources.ts waives the two dearest to buy.
//   - Economy: the opponent's trading coins go to the owner (reducer.pay).
//   - Law: the scales symbol (scienceSymbols in resources.ts).
//   - Strategy: +1 shield on each red card built after it (reducer).
//   - Theology: every wonder the owner builds plays again (reducer).
//   - Urbanism: 4 coins on every chain build (reducer).
//
// The expansions shuffle in more (EXPANSION_PROGRESS_TOKENS): Agora's
// Corruption (Senators free, resources.cardPayment) and Organized Crime
// (keep both Conspiracies, reducer.openPending); Pantheon's Mysticism
// (scoring.progressVps), Poliorcetics (reducer.advanceMilitary) and
// Engineering (resources.cardPayment).

import type { DuelProgressToken, DuelProgressTokenId } from './types';

export const ALL_PROGRESS_TOKENS: readonly DuelProgressToken[] = [
  { id: 'agriculture', name: 'Agriculture', description: 'Take 6 coins. 4 VP.' },
  { id: 'architecture', name: 'Architecture', description: 'Your wonders cost 2 fewer resources.' },
  { id: 'economy', name: 'Economy', description: 'Coins your opponent spends trading for resources come to you.' },
  { id: 'law', name: 'Law', description: 'Counts as a science symbol (the scales).' },
  { id: 'masonry', name: 'Masonry', description: 'Your blue cards cost 2 fewer resources.' },
  { id: 'mathematics', name: 'Mathematics', description: '3 VP for each Progress token you own (this one too).' },
  { id: 'philosophy', name: 'Philosophy', description: '7 VP.' },
  { id: 'strategy', name: 'Strategy', description: 'Each red card you build from now on gives 1 extra shield.' },
  { id: 'theology', name: 'Theology', description: 'Every wonder you build from now on lets you play again.' },
  { id: 'urbanism', name: 'Urbanism', description: 'Take 6 coins. Take 4 coins each time you build a card for free through a chain.' },
];

/** The expansions' Progress tokens, shuffled in with the base 10. */
export const EXPANSION_PROGRESS_TOKENS: readonly DuelProgressToken[] = [
  { id: 'corruption', name: 'Corruption', expansion: 'agora', description: 'You recruit Senators (Politicians and Conspirators) for free.' },
  { id: 'organizedCrime', name: 'Organized Crime', expansion: 'agora', description: 'When you Conspire, keep both Conspiracies drawn.' },
  { id: 'mysticism', name: 'Mysticism', expansion: 'pantheon', description: '2 VP for each Mythology and Offering token you still have at the end.' },
  { id: 'poliorcetics', name: 'Poliorcetics', expansion: 'pantheon', description: 'Each time you move the conflict pawn, your opponent loses a coin per space.' },
  { id: 'engineering', name: 'Engineering', expansion: 'pantheon', description: 'Any card with a chain symbol under its cost costs you 1 coin, even without the chain.' },
];

/** Every Progress token, the expansions' included. */
export const EVERY_PROGRESS_TOKEN: readonly DuelProgressToken[] = [...ALL_PROGRESS_TOKENS, ...EXPANSION_PROGRESS_TOKENS];

/** The tokens a match deals from (the base 10 first, in their printed order). */
export function progressPool(config: { pantheon?: boolean; agora?: boolean }): DuelProgressTokenId[] {
  return EVERY_PROGRESS_TOKEN
    .filter((t) => !t.expansion || (t.expansion === 'agora' ? !!config.agora : !!config.pantheon))
    .map((t) => t.id);
}

const BY_ID = new Map(EVERY_PROGRESS_TOKEN.map((t) => [t.id, t]));

export function progressTokenById(id: DuelProgressTokenId): DuelProgressToken {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`Unknown progress token: ${id}`);
  return t;
}
