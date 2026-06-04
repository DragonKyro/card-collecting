// Leaders expansion — modifyCost hook implementation.
//
// Scans the player's leaderTableau for `leaderCostModifier` effects and applies
// them to the cost being computed.

import type { SwCost, SwPlayer, SwState } from '../../types';
import type { SwCostTarget } from '../types';

export function modifyCostLeaders(
  _state: SwState,
  player: SwPlayer,
  target: SwCostTarget,
  cost: SwCost,
): SwCost {
  const leaders = player.leaderTableau ?? [];
  let resources = cost.resources ? cost.resources.slice() : undefined;
  let coins = cost.coins;

  for (const leader of leaders) {
    for (const eff of leader.effects) {
      if (eff.kind !== 'leaderCostModifier') continue;
      const matches = matchesTarget(eff, target);
      if (!matches) continue;
      if (eff.remove === 'oneResource' && resources && resources.length > 0) {
        // Strip one resource (the player effectively gets to choose which —
        // for cost validation we strip the first listed resource).
        resources.shift();
      } else if (eff.remove === 'allResources') {
        resources = [];
      } else if (eff.remove === 'allCoins') {
        coins = 0;
      }
    }
  }
  return { coins, resources };
}

function matchesTarget(
  eff: { target: string; targetColor?: string },
  target: SwCostTarget,
): boolean {
  if (eff.target === 'wonderStage' && target.kind === 'wonderStage') return true;
  if (eff.target === 'leader' && target.kind === 'leader') return true;
  if (eff.target === 'cardColor' && target.kind === 'card') {
    return target.card.color === eff.targetColor;
  }
  if (eff.target === 'guild' && target.kind === 'card') {
    return target.card.color === 'purple';
  }
  return false;
}
