// 7 Wonders — final scoring.
//
// 7 categories:
//   military:    sum of military tokens (-1 / +1 / +3 / +5)
//   treasury:    floor(coins / 3)
//   wonder:      sum of VP effects on wonder stages built
//   civilian:    sum of vp from blue cards
//   commercial:  vp from yellow Age III cards (Haven, Lighthouse, Chamber, Arena)
//   science:     SUM(n²) over each symbol + 7 × min(sets-of-3)
//   guild:       vp from purple cards (each guild has its own counting rule)

import type { SwFinalScoringRow, SwPlayer, SwState } from './types';
import { wonderById } from './wonders';

export function scoreMatch(state: SwState): SwFinalScoringRow[] {
  const players = state.players;
  return players.map((p) => scorePlayer(state, p));
}

function scorePlayer(state: SwState, p: SwPlayer): SwFinalScoringRow {
  const military = p.militaryTokens.reduce((s, t) => s + t, 0);
  const treasury = Math.floor(p.coins / 3);
  const wonder = wonderVps(p);
  const civilian = civilianVps(p);
  const commercial = commercialVps(state, p);
  const science = scienceVps(p);
  const guild = guildVps(state, p);

  return {
    playerId: p.id,
    military,
    treasury,
    wonder,
    civilian,
    commercial,
    science,
    guild,
    total: military + treasury + wonder + civilian + commercial + science + guild,
  };
}

function wonderVps(p: SwPlayer): number {
  const w = wonderById(p.wonderId);
  let v = 0;
  for (let i = 0; i < p.wonderStagesBuilt; i++) {
    for (const eff of w.stages[i].effects) {
      if (eff.kind === 'vp') v += eff.vp;
    }
  }
  return v;
}

function civilianVps(p: SwPlayer): number {
  let v = 0;
  for (const c of p.tableau) {
    if (c.color !== 'blue') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'vp') v += eff.vp;
    }
  }
  return v;
}

function commercialVps(state: SwState, p: SwPlayer): number {
  let v = 0;
  for (const c of p.tableau) {
    if (c.color !== 'yellow') continue;
    if (c.age !== 3) continue; // Age I/II yellows score only on play
    for (const eff of c.effects) {
      if (eff.kind === 'endVp') v += evaluateEndVp(state, p, eff);
    }
  }
  return v;
}

function guildVps(state: SwState, p: SwPlayer): number {
  let v = 0;
  for (const c of p.tableau) {
    if (c.color !== 'purple') continue;
    // Scientists Guild — adds +1 to player's best science symbol; handled in science block.
    if (c.name === 'Scientists Guild') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'endVp') v += evaluateEndVp(state, p, eff);
    }
  }
  return v;
}

/** Evaluate an endVp effect. Counts what it says in the requested players' tableaus. */
function evaluateEndVp(
  state: SwState,
  p: SwPlayer,
  eff: { kind: 'endVp'; from: 'self' | 'neighbors' | 'all'; countWhat: { kind: 'cardColor'; color: string } | { kind: 'wonderStages' } | { kind: 'military' }; coinsPerOnPlay?: number; vpPer?: number },
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
      // count DEFEAT tokens (negative ones) — Strategists Guild
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

/** Science scoring with Scientists Guild bonus (adds 1 to your best symbol). */
function scienceVps(p: SwPlayer): number {
  const symbols: Record<'compass' | 'gear' | 'tablet', number> = { compass: 0, gear: 0, tablet: 0 };
  for (const c of p.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'science') symbols[eff.symbol] += 1;
    }
  }
  // Babylon B / Scientists Guild — add 1 to best symbol if present.
  if (p.tableau.some((c) => c.name === 'Scientists Guild')) {
    return bestScienceScore(symbols, 1);
  }
  return bestScienceScore(symbols, 0);
}

/** Given the three symbol counts (compass/gear/tablet) and a number of "wild"
 *  symbols, compute the maximum-scoring assignment. */
function bestScienceScore(
  symbols: { compass: number; gear: number; tablet: number },
  wildcards: number,
): number {
  // Try all wildcard assignments to the three symbols (up to 3 wildcards).
  // We have at most 1 wildcard in base game (Scientists Guild), but we keep it general.
  let best = 0;
  const triples: Array<[number, number, number]> = [];
  function gen(remaining: number, prefix: number[]) {
    if (prefix.length === 3) {
      if (remaining === 0) triples.push([prefix[0], prefix[1], prefix[2]]);
      return;
    }
    for (let take = 0; take <= remaining; take++) {
      gen(remaining - take, [...prefix, take]);
    }
  }
  gen(wildcards, []);
  for (const [a, b, c] of triples) {
    const ca = symbols.compass + a;
    const ga = symbols.gear + b;
    const ta = symbols.tablet + c;
    const sets = Math.min(ca, ga, ta);
    const score = ca * ca + ga * ga + ta * ta + 7 * sets;
    if (score > best) best = score;
  }
  return best;
}

/** Coins-on-play helper for yellow/purple Age III cards (Haven, Lighthouse, etc.).
 *  Returns the number of matching cards in `from` × coinsPerOnPlay. */
export function coinsOnPlayForEndVp(
  state: SwState,
  player: SwPlayer,
  eff: { kind: 'endVp'; from: 'self' | 'neighbors' | 'all'; countWhat: { kind: 'cardColor'; color: string } | { kind: 'wonderStages' } | { kind: 'military' }; coinsPerOnPlay?: number; vpPer?: number },
): number {
  const per = eff.coinsPerOnPlay ?? 0;
  if (per === 0) return 0;
  const targets = collectTargets(state, player, eff.from);
  const w = eff.countWhat;
  let count = 0;
  for (const tgt of targets) {
    if (w.kind === 'cardColor') {
      count += tgt.tableau.filter((c) => c.color === w.color).length;
    } else if (w.kind === 'wonderStages') {
      count += tgt.wonderStagesBuilt;
    }
  }
  return count * per;
}
