// 7 Wonders — final scoring.
//
// 7 categories:
//   military:    sum of military tokens (-1 / +1 / +3 / +5)
//   treasury:    floor(coins / 3)
//   wonder:      VP printed on the wonder stages built
//   civilian:    VP of blue cards
//   commercial:  end-game VP of yellow Age III cards (Haven, Lighthouse, Chamber, Arena)
//   guild:       VP of purple cards (each guild has its own counting rule)
//   science:     n² per symbol + 7 per set of 3; wild symbols (Scientists
//                Guild, Babylon) become whichever symbol scores most
//
// Olympia B copies the neighbour's guild that adds the most, scored as if it
// stood in its own city. The most VP wins; ties go to the most coins, and a
// tie on both is a shared victory (`rankRows`).

import type { PlayerId } from '@/core/types';
import type { SwCard, SwCardEffect, SwFinalScoringRow, SwPlayer, SwScience, SwState } from './types';
import { builtStageEffects, hasWonderPower } from './wonders';
import { getActiveExpansions } from './expansions/registry';
import { applyExtrasToRow } from './expansions/types';

type EndVpEffect = Extract<SwCardEffect, { kind: 'endVp' }>;

export function scoreMatch(state: SwState): SwFinalScoringRow[] {
  const expansions = getActiveExpansions(state.config);
  return state.players.map((p) => {
    const row = scorePlayer(state, p);
    applyExtrasToRow(expansions, state, p, row);
    return row;
  });
}

/** Base-game score of one city (no expansion extras). With Olympia B's last
 *  stage built, the best neighbour guild is copied and named in `copiedGuild`. */
export function scorePlayer(state: SwState, p: SwPlayer): SwFinalScoringRow {
  let row = scoreWith(state, p, null);
  if (hasWonderPower(p, 'copyGuild')) {
    for (const guild of copyableGuilds(state, p)) {
      const alt = scoreWith(state, p, guild);
      if (alt.total > row.total) row = { ...alt, copiedGuild: guild.name };
    }
  }
  return row;
}

/** Guilds Olympia B may copy: those built by either neighbour. */
export function copyableGuilds(state: SwState, p: SwPlayer): SwCard[] {
  return collectTargets(state, p, 'neighbors').flatMap((n) => n.tableau.filter((c) => c.color === 'purple'));
}

function scoreWith(state: SwState, p: SwPlayer, copied: SwCard | null): SwFinalScoringRow {
  const military = p.militaryTokens.reduce((s, t) => s + t, 0);
  const treasury = Math.floor(p.coins / 3);
  const wonder = wonderVps(p);
  const civilian = civilianVps(p);
  const commercial = commercialVps(state, p);
  const guild = guildVps(state, p, copied);
  const science = scienceVps(p, copied);

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
  let v = 0;
  for (const eff of builtStageEffects(p)) {
    if (eff.kind === 'vp') v += eff.vp;
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
    // Age I / II yellows (Vineyard, Bazaar) pay coins only: no vpPer.
    for (const eff of c.effects) {
      if (eff.kind === 'endVp') v += evaluateEndVp(state, p, eff);
    }
  }
  return v;
}

function guildVps(state: SwState, p: SwPlayer, copied: SwCard | null): number {
  let v = 0;
  const guilds = p.tableau.filter((c) => c.color === 'purple');
  for (const c of copied ? [...guilds, copied] : guilds) {
    for (const eff of c.effects) {
      if (eff.kind === 'endVp') v += evaluateEndVp(state, p, eff);
    }
  }
  return v;
}

/** Evaluate an endVp effect. Counts what it says in the requested players' tableaus. */
function evaluateEndVp(state: SwState, p: SwPlayer, eff: EndVpEffect): number {
  const vpPer = eff.vpPer ?? 0;
  if (vpPer === 0) return 0;
  return countEndVpTargets(state, p, eff) * vpPer;
}

/** How many things an endVp effect counts for `p` right now. */
export function countEndVpTargets(state: SwState, p: SwPlayer, eff: EndVpEffect): number {
  let count = 0;
  const w = eff.countWhat;
  for (const tgt of collectTargets(state, p, eff.from)) {
    if (w.kind === 'cardColor') {
      count += tgt.tableau.filter((c) => c.color === w.color).length;
    } else if (w.kind === 'wonderStages') {
      count += tgt.wonderStagesBuilt;
    } else if (w.kind === 'military') {
      // count DEFEAT tokens (negative ones) — Strategists Guild
      count += tgt.militaryTokens.filter((t) => t < 0).length;
    }
  }
  return count;
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

export interface ScienceHoldings {
  symbols: Record<SwScience, number>;
  /** Symbols of the owner's choice (Scientists Guild, Babylon). */
  wild: number;
}

/** A city's science: symbols on its cards (leaders included) and its wilds. */
export function scienceHoldings(p: SwPlayer, copied: SwCard | null = null): ScienceHoldings {
  const symbols: Record<SwScience, number> = { compass: 0, gear: 0, tablet: 0 };
  let wild = 0;
  const cards = [...p.tableau, ...(p.leaderTableau ?? []), ...(copied ? [copied] : [])];
  const effects = [...cards.flatMap((c) => c.effects), ...builtStageEffects(p)];
  for (const eff of effects) {
    if (eff.kind === 'science') symbols[eff.symbol] += 1;
    else if (eff.kind === 'scienceWild') wild += 1;
  }
  return { symbols, wild };
}

function scienceVps(p: SwPlayer, copied: SwCard | null): number {
  const { symbols, wild } = scienceHoldings(p, copied);
  return bestScienceScore(symbols, wild);
}

/** Given the three symbol counts (compass/gear/tablet) and a number of "wild"
 *  symbols, compute the maximum-scoring assignment. */
export function bestScienceScore(
  symbols: { compass: number; gear: number; tablet: number },
  wildcards: number,
): number {
  // Try every way to split the wilds over the three symbols (at most 3 in the
  // base game: Scientists Guild, Babylon, a copied Scientists Guild).
  let best = 0;
  for (let a = 0; a <= wildcards; a++) {
    for (let b = 0; a + b <= wildcards; b++) {
      const ca = symbols.compass + a;
      const ga = symbols.gear + b;
      const ta = symbols.tablet + (wildcards - a - b);
      const score = ca * ca + ga * ga + ta * ta + 7 * Math.min(ca, ga, ta);
      if (score > best) best = score;
    }
  }
  return best;
}

/** Final standings: most VP first, ties broken by the most coins. `winnerIds`
 *  holds every city tied with the leader on both (a shared victory). */
export function rankRows(state: SwState, rows: readonly SwFinalScoringRow[]): { sorted: SwFinalScoringRow[]; winnerIds: PlayerId[] } {
  const coins = (id: PlayerId) => state.players.find((p) => p.id === id)?.coins ?? 0;
  const sorted = [...rows].sort((a, b) => b.total - a.total || coins(b.playerId) - coins(a.playerId));
  const top = sorted[0];
  const winnerIds = top
    ? sorted.filter((r) => r.total === top.total && coins(r.playerId) === coins(top.playerId)).map((r) => r.playerId)
    : [];
  return { sorted, winnerIds };
}

/** Coins-on-play helper for yellow cards (Vineyard, Bazaar, Haven, Lighthouse…).
 *  Returns the number of matching cards in `from` × coinsPerOnPlay. */
export function coinsOnPlayForEndVp(state: SwState, player: SwPlayer, eff: EndVpEffect): number {
  const per = eff.coinsPerOnPlay ?? 0;
  if (per === 0) return 0;
  return countEndVpTargets(state, player, eff) * per;
}
