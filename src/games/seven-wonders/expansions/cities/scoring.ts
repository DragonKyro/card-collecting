// Cities expansion — end-game scoring extras.
//
// Two contributions:
//   1. Debt penalty: each debt token = -1 VP. Applied as a negative `cities`
//      score extra.
//   2. citiesScoreExtra effect kinds:
//        - completeAllColorsSet: +V per set of {brown, gray, blue, yellow, red, green, purple}
//        - vpPerDebtTotal: +V × total debt tokens across all players (Gambling Hall)
//        - coinsPerDebtTotal: not used in v1
//
// Black card pure-VP effects (kind: 'vp') are scored as part of the normal
// 'civilian' / 'commercial' / 'guild' bucket? No — they're a new color. Base
// scoring iterates colors specifically (only blue counts as civilian, etc.) so
// black-card `vp` effects are NOT counted by base scoring. We score them here
// as part of the `cities` extras column.

import type { SwPlayer, SwState } from '../../types';

const REQUIRED_COLORS = ['brown', 'gray', 'blue', 'yellow', 'red', 'green', 'purple'] as const;

export function scoreExtrasCities(state: SwState, player: SwPlayer): Record<string, number> {
  let cities = 0;
  // 1) Pure VP from black cards (color === 'black', kind: 'vp')
  for (const c of player.tableau) {
    if (c.color !== 'black') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'vp') cities += eff.vp;
      // black cards can also carry `endVp` — uncommon but possible (treat as cities)
      if (eff.kind === 'endVp') {
        cities += evaluateEndVpInline(state, player, eff);
      }
    }
  }
  // 2) citiesScoreExtra effects
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind !== 'citiesScoreExtra') continue;
      const rule = eff.rule;
      if (rule.type === 'completeAllColorsSet') {
        const counts = REQUIRED_COLORS.map((color) =>
          player.tableau.filter((tc) => tc.color === color).length);
        const sets = Math.min(...counts);
        cities += sets * rule.vpPerSet;
      } else if (rule.type === 'vpPerDebtTotal') {
        let totalDebt = 0;
        for (const pp of state.players) totalDebt += pp.debtTokens ?? 0;
        cities += totalDebt * rule.vpPer;
      } else if (rule.type === 'coinsPerDebtTotal') {
        // Not used in v1.
      }
    }
  }
  // 3) Debt penalty: -1 VP per debt token held.
  cities -= player.debtTokens ?? 0;
  return cities === 0 ? {} : { cities };
}

/** Mirror of the base scoring.ts evaluateEndVp — kept inline to avoid
 *  expanding the base public surface. Only used for the rare black card whose
 *  effect is endVp. */
function evaluateEndVpInline(
  state: SwState,
  p: SwPlayer,
  eff: { kind: 'endVp'; from: 'self' | 'neighbors' | 'all'; countWhat: { kind: 'cardColor'; color: string } | { kind: 'wonderStages' } | { kind: 'military' }; coinsPerOnPlay?: number; vpPer?: number },
): number {
  const vpPer = eff.vpPer ?? 0;
  if (vpPer === 0) return 0;
  const idx = state.players.findIndex((x) => x.id === p.id);
  const n = state.players.length;
  const targets: SwPlayer[] =
    eff.from === 'self' ? [p]
    : eff.from === 'neighbors' ? [state.players[(idx - 1 + n) % n], state.players[(idx + 1) % n]]
    : [p, state.players[(idx - 1 + n) % n], state.players[(idx + 1) % n]];
  let count = 0;
  const w = eff.countWhat;
  for (const tgt of targets) {
    if (w.kind === 'cardColor') {
      count += tgt.tableau.filter((c) => c.color === w.color).length;
    } else if (w.kind === 'wonderStages') {
      count += tgt.wonderStagesBuilt;
    } else if (w.kind === 'military') {
      count += tgt.militaryTokens.filter((t) => t < 0).length;
    }
  }
  return count * vpPer;
}
