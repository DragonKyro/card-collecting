// Leaders expansion — scoreExtras hook implementation.
//
// Aggregates VPs from:
//   1. Pure VP effects on leaders (Cleopatra 5, Nefertiti 4, Zenobia 3, Sappho 2)
//   2. End-game endVp effects on leaders (Amytis, Hiram, Hypatia, Nebuchadnezzar,
//      Pericles, Phidias, Praxiteles, Varro) — uses the same evaluator as the
//      base scoring for guilds.
//   3. Custom scoring rules: Aristotle, Justinian, Plato, Midas, Alexander.
//
// Returns { leaders: N } for the row.extras column.

import type { SwCardColor, SwPlayer, SwState } from '../../types';
import type { SwScoreExtras } from '../types';

const ALL_COLORS: SwCardColor[] = ['brown', 'gray', 'blue', 'yellow', 'red', 'green', 'purple'];

export function scoreExtrasLeaders(state: SwState, player: SwPlayer): SwScoreExtras {
  const leaders = player.leaderTableau ?? [];
  if (leaders.length === 0) return {};
  let leaderVps = 0;

  for (const leader of leaders) {
    for (const eff of leader.effects) {
      if (eff.kind === 'vp') {
        leaderVps += eff.vp;
      } else if (eff.kind === 'endVp') {
        leaderVps += evaluateEndVp(state, player, eff);
      } else if (eff.kind === 'leaderScoreExtra') {
        leaderVps += evaluateScoreExtra(state, player, eff.rule);
      }
    }
  }
  return { leaders: leaderVps };
}

function evaluateEndVp(
  state: SwState,
  p: SwPlayer,
  eff: { from: 'self' | 'neighbors' | 'all'; countWhat: { kind: 'cardColor'; color: SwCardColor } | { kind: 'wonderStages' } | { kind: 'military' }; vpPer?: number },
): number {
  const vpPer = eff.vpPer ?? 0;
  if (vpPer === 0) return 0;
  const targets = collectTargets(state, p, eff.from);
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

function collectTargets(state: SwState, p: SwPlayer, from: 'self' | 'neighbors' | 'all'): SwPlayer[] {
  if (from === 'self') return [p];
  const idx = state.players.findIndex((x) => x.id === p.id);
  const n = state.players.length;
  const west = state.players[(idx - 1 + n) % n];
  const east = state.players[(idx + 1) % n];
  if (from === 'neighbors') return [west, east];
  return [p, west, east];
}

function evaluateScoreExtra(
  _state: SwState,
  p: SwPlayer,
  rule:
    | { type: 'completeScienceSet'; vpPerSet: number }
    | { type: 'completeRGBSet'; vpPerSet: number }
    | { type: 'completeAllColorsSet'; vpPerSet: number }
    | { type: 'midasCoinBonus' }
    | { type: 'alexanderTokenBonus' },
): number {
  if (rule.type === 'completeScienceSet') {
    const symbols = { compass: 0, gear: 0, tablet: 0 };
    for (const c of [...p.tableau, ...(p.leaderTableau ?? [])]) {
      for (const eff of c.effects) {
        if (eff.kind === 'science') symbols[eff.symbol] += 1;
      }
    }
    const sets = Math.min(symbols.compass, symbols.gear, symbols.tablet);
    return sets * rule.vpPerSet;
  }
  if (rule.type === 'completeRGBSet') {
    const counts = countColors(p);
    const sets = Math.min(counts.red, counts.blue, counts.green);
    return sets * rule.vpPerSet;
  }
  if (rule.type === 'completeAllColorsSet') {
    const counts = countColors(p);
    let sets = Infinity;
    for (const color of ALL_COLORS) {
      const c = (counts as Record<string, number>)[color] ?? 0;
      if (c < sets) sets = c;
    }
    return (sets === Infinity ? 0 : sets) * rule.vpPerSet;
  }
  if (rule.type === 'midasCoinBonus') {
    return Math.floor(p.coins / 3);
  }
  if (rule.type === 'alexanderTokenBonus') {
    // +1 VP per existing victory token (positive military tokens only).
    return p.militaryTokens.filter((t) => t > 0).length;
  }
  return 0;
}

function countColors(p: SwPlayer): Record<SwCardColor, number> {
  const counts: Record<SwCardColor, number> = {
    brown: 0, gray: 0, blue: 0, yellow: 0, red: 0, green: 0, purple: 0, leader: 0, black: 0,
  };
  for (const c of p.tableau) counts[c.color] += 1;
  return counts;
}
