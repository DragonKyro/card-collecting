// Armada expansion — end-game scoring extras.
//
// Two contributions:
//   1. Pure VP from navy cards (color === 'navy', kind: 'vp') — not counted
//      by base civilian/commercial/guild buckets.
//   2. armadaScoreExtra effect kinds:
//        - vpPerNeighborMilitaryLosses: +V per defeat token across both neighbors.
//        - vpPerOwnAgeIIIBuilds: +V per Age III card in own tableau.
//        - vpPerOwnNavalSet: +V per complete set of (red+blue+green+yellow).

import type { SwPlayer, SwState } from '../../types';

export function scoreExtrasArmada(state: SwState, player: SwPlayer): Record<string, number> {
  let armada = 0;
  // 1) Pure VP from navy cards.
  for (const c of player.tableau) {
    if (c.color !== 'navy') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'vp') armada += eff.vp;
    }
  }
  // 2) armadaScoreExtra effects.
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind !== 'armadaScoreExtra') continue;
      const rule = eff.rule;
      if (rule.type === 'vpPerNeighborMilitaryLosses') {
        const idx = state.players.findIndex((x) => x.id === player.id);
        const n = state.players.length;
        const west = state.players[(idx - 1 + n) % n];
        const east = state.players[(idx + 1) % n];
        const losses =
          west.militaryTokens.filter((t) => t < 0).length +
          east.militaryTokens.filter((t) => t < 0).length;
        armada += losses * rule.vpPer;
      } else if (rule.type === 'vpPerOwnAgeIIIBuilds') {
        const count = player.tableau.filter((c2) => c2.age === 3).length;
        armada += count * rule.vpPer;
      } else if (rule.type === 'vpPerOwnNavalSet') {
        const counts = (['red', 'blue', 'green', 'yellow'] as const)
          .map((color) => player.tableau.filter((c2) => c2.color === color).length);
        const sets = Math.min(...counts);
        armada += sets * rule.vpPerSet;
      }
    }
  }
  return armada === 0 ? {} : { armada };
}
