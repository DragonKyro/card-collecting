// Babel expansion — end-game scoring extras.
//
// Two contributions:
//   1. Pure VP from orange cards (color === 'orange', kind: 'vp') — these are
//      not counted by base civilian/commercial/guild buckets.
//   2. babelScoreExtra effect kinds:
//        - vpPerScienceSet: +V per complete {compass,gear,tablet} set the
//          player owns (counts science from both base tableau AND leaderTableau).
//        - vpPerNeighborCards: +V per matching card across BOTH neighbors.
//        - vpPerOwnColors: +V per card whose color is in the listed set.

import type { SwPlayer, SwState } from '../../types';

export function scoreExtrasBabel(state: SwState, player: SwPlayer): Record<string, number> {
  let babel = 0;
  // 1) Pure VP from orange cards (base color-counting skips orange).
  for (const c of player.tableau) {
    if (c.color !== 'orange') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'vp') babel += eff.vp;
    }
  }
  // 2) babelScoreExtra effects.
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind !== 'babelScoreExtra') continue;
      const rule = eff.rule;
      if (rule.type === 'vpPerScienceSet') {
        const sets = scienceSets(player);
        babel += sets * rule.vpPerSet;
      } else if (rule.type === 'vpPerNeighborCards') {
        const idx = state.players.findIndex((x) => x.id === player.id);
        const n = state.players.length;
        const west = state.players[(idx - 1 + n) % n];
        const east = state.players[(idx + 1) % n];
        const count = west.tableau.filter((c2) => c2.color === rule.color).length
          + east.tableau.filter((c2) => c2.color === rule.color).length;
        babel += count * rule.vpPer;
      } else if (rule.type === 'vpPerOwnColors') {
        const allow = new Set(rule.colors);
        const count = player.tableau.filter((c2) => allow.has(c2.color)).length;
        babel += count * rule.vpPer;
      }
    }
  }
  return babel === 0 ? {} : { babel };
}

/** Count complete science sets {compass,gear,tablet} the player owns, including
 *  symbols from leaderTableau (mirrors base scienceVps). Ignores Scientists
 *  Guild's wild (that's a base-scoring concern, not Babel's). */
function scienceSets(p: SwPlayer): number {
  const symbols: Record<'compass' | 'gear' | 'tablet', number> = { compass: 0, gear: 0, tablet: 0 };
  const sources = [...p.tableau, ...(p.leaderTableau ?? [])];
  for (const c of sources) {
    for (const eff of c.effects) {
      if (eff.kind === 'science') symbols[eff.symbol] += 1;
    }
  }
  return Math.min(symbols.compass, symbols.gear, symbols.tablet);
}
