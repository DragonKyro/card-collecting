// Edifice expansion — end-game scoring extras.
//
// For each of the three project tiles:
//   - If contributors.length >= project.threshold: reward each contributor.
//     Non-contributors get the penalty.
//   - If threshold NOT met: nothing happens.
//
// Most rewards/penalties are VP. Non-VP outcomes (shields, science symbols,
// coins, debt tokens) are converted to their VP equivalent at endgame:
//   - shields N → counts as if N shields were on the player's tableau when
//     scoring military (in practice we approximate as +N VP since base
//     military is already resolved by the time scoring runs — see note below).
//   - science symbol → folded into scienceVps via player.edificeScienceBonus
//     (we add a transient symbol count to the player at endgame). Since we
//     can't mutate base scoring from here, we approximate as +5 VP per symbol
//     (roughly average set value at end of game).
//   - coins +N → +N coins (but treasury is already counted — so coin reward
//     becomes floor(N/3) VP approximately; we just give +1 VP per 2 coins).
//   - debt tokens N → -N VP regardless of Cities expansion state.
//
// All adjustments are applied to a single `edifice` extras column.

import type { SwPlayer, SwState, SwEdificeProject, SwEdificeOutcome } from '../../types';

export function scoreExtrasEdifice(state: SwState, player: SwPlayer): Record<string, number> {
  const projects = state.edificeProjects;
  const contribs = state.edificeContributors;
  if (!projects || !contribs) return {};
  let edifice = 0;
  for (let ageIdx = 0; ageIdx < projects.length; ageIdx++) {
    const project = projects[ageIdx];
    const contributors = contribs[ageIdx] ?? [];
    if (contributors.length < project.threshold) continue;
    const isContributor = contributors.includes(player.id);
    const outcome = isContributor ? project.reward : project.penalty;
    edifice += vpOf(outcome);
  }
  void state;
  return edifice === 0 ? {} : { edifice };
}

/** Convert an outcome to its VP equivalent at endgame. */
function vpOf(outcome: SwEdificeOutcome): number {
  switch (outcome.kind) {
    case 'vp': return outcome.vp;
    case 'shields': return outcome.shields * 2;       // approximation — military already resolved
    case 'science': return 5;                          // approximation — avg set value
    case 'coins': return Math.floor(outcome.coins / 2); // approximation — coin → VP rate
    case 'debtTokens': return -outcome.amount;         // each debt = -1 VP
    case 'none': return 0;
  }
}

/** Used by tests / debug. */
export function isProjectCompleted(state: SwState, ageIdx: number): boolean {
  const projects = state.edificeProjects;
  const contribs = state.edificeContributors;
  if (!projects || !contribs) return false;
  const project = projects[ageIdx];
  if (!project) return false;
  return (contribs[ageIdx] ?? []).length >= project.threshold;
}

/** Used by tests / debug. */
export function describeProject(p: SwEdificeProject): string {
  return `${p.name} (age ${p.age}, threshold ${p.threshold})`;
}
