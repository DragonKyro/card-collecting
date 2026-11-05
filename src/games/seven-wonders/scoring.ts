// 7 Wonders — final scoring.
//
// 7 categories:
//   military:    sum of military tokens (-1 / +1 / +3 / +5)
//   treasury:    floor(coins / 3)
//   wonder:      VP printed on the wonder stages built
//   civilian:    VP of blue cards
//   commercial:  end-game VP of yellow Age III cards (Haven, Lighthouse, Chamber, Arena)
//   guild:       VP of purple cards (each guild has its own counting rule)
//   science:     n² per symbol + 7 per set of 3 (more with Aristotle / Babel's
//                science token); wild symbols (Scientists Guild, Babylon)
//                and masks (Cities: a symbol copied from a neighbour's green
//                card) become whichever symbols score most
// plus the expansions' columns (`scoreExtras`: leaders, black cards, debt,
// the tower, Great Projects).
//
// Olympia B copies the neighbour's guild that adds the most, scored as if it
// stood in its own city. The most VP wins; ties go to the most coins, and a
// tie on both is a shared victory (`rankRows`).

import type { PlayerId } from '@/core/types';
import type { SwCard, SwCardEffect, SwFinalScoringRow, SwPlayer, SwScience, SwState } from './types';
import { AGE_CARD_COLORS } from './types';
import { builtStageEffects, hasWonderPower } from './wonders';
import { getActiveExpansions } from './expansions/registry';
import { applyExtrasToRow } from './expansions/types';

type EndVpEffect = Extract<SwCardEffect, { kind: 'endVp' }>;
type ScoreRule = Extract<SwCardEffect, { kind: 'scoreRule' }>['rule'];

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
  const civilian = colorVps(state, p, 'blue');
  const commercial = colorVps(state, p, 'yellow');
  const guild = guildVps(state, p, copied);
  const science = scienceVps(state, p, copied);

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

/** VP of one card: printed VP, counted VP, and score rules. */
export function cardVps(state: SwState, p: SwPlayer, card: SwCard): number {
  let v = 0;
  for (const eff of card.effects) {
    if (eff.kind === 'vp') v += eff.vp;
    else if (eff.kind === 'endVp') v += evaluateEndVp(state, p, eff);
    else if (eff.kind === 'scoreRule') v += evaluateScoreRule(p, eff.rule);
  }
  return v;
}

function colorVps(state: SwState, p: SwPlayer, color: 'blue' | 'yellow'): number {
  return p.tableau.filter((c) => c.color === color).reduce((s, c) => s + cardVps(state, p, c), 0);
}

function guildVps(state: SwState, p: SwPlayer, copied: SwCard | null): number {
  const guilds = p.tableau.filter((c) => c.color === 'purple');
  return (copied ? [...guilds, copied] : guilds).reduce((s, c) => s + cardVps(state, p, c), 0);
}

/** Evaluate an endVp effect. Counts what it says in the requested players' tableaus. */
export function evaluateEndVp(state: SwState, p: SwPlayer, eff: EndVpEffect): number {
  const vpPer = eff.vpPer ?? 0;
  if (vpPer === 0) return 0;
  return countEndVpTargets(state, p, eff) * vpPer;
}

/** How many things an endVp effect counts for `p` right now. */
export function countEndVpTargets(state: SwState, p: SwPlayer, eff: Pick<EndVpEffect, 'from' | 'countWhat'>): number {
  let count = 0;
  const w = eff.countWhat;
  for (const tgt of collectTargets(state, p, eff.from)) {
    switch (w.kind) {
      case 'cardColor': count += tgt.tableau.filter((c) => c.color === w.color).length; break;
      case 'wonderStages': count += tgt.wonderStagesBuilt; break;
      case 'military': count += tgt.militaryTokens.filter((t) => t < 0).length; break;
      case 'victoryTokens': count += tgt.militaryTokens.filter((t) => t > 0).length; break;
      case 'leaders': count += (tgt.leaderTableau ?? []).filter((c) => !c.copyOf).length; break;
      case 'coinSets': count += Math.floor(tgt.coins / 3); break;
    }
  }
  return count;
}

/** End-game rules that aren't a simple count (Justinian, Plato, Midas, Alexander). */
export function evaluateScoreRule(p: SwPlayer, rule: ScoreRule): number {
  switch (rule.type) {
    case 'completeRGBSet': {
      const n = (c: string) => p.tableau.filter((x) => x.color === c).length;
      return Math.min(n('red'), n('blue'), n('green')) * rule.vpPerSet;
    }
    case 'completeAllColorsSet':
      return Math.min(...AGE_CARD_COLORS.map((c) => p.tableau.filter((x) => x.color === c).length)) * rule.vpPerSet;
    case 'vpPerCoinSet': return Math.floor(p.coins / 3) * rule.vpPer;
    case 'vpPerVictoryToken': return p.militaryTokens.filter((t) => t > 0).length * rule.vpPer;
  }
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
  /** Masks (Cities): each copies the symbol of a different green card… */
  masks: number;
  /** …from these, the neighbours' green cards. */
  copyable: Record<SwScience, number>;
  /** VP added to each complete set (Aristotle, Babel's science token). */
  setBonus: number;
}

/** A city's science: symbols on its cards (leaders included), its wilds,
 *  masks and set bonuses. */
export function scienceHoldings(state: SwState, p: SwPlayer, copied: SwCard | null = null): ScienceHoldings {
  const symbols: Record<SwScience, number> = { compass: 0, gear: 0, tablet: 0 };
  let wild = 0;
  let masks = 0;
  let setBonus = 0;
  const cards = [...p.tableau, ...(p.leaderTableau ?? []), ...(copied ? [copied] : [])];
  const effects = [...cards.flatMap((c) => c.effects), ...builtStageEffects(p)];
  for (const eff of effects) {
    if (eff.kind === 'science') symbols[eff.symbol] += 1;
    else if (eff.kind === 'scienceWild') wild += 1;
    else if (eff.kind === 'mask') masks += 1;
    else if (eff.kind === 'scienceSetBonus') setBonus += eff.vp;
  }
  for (const ext of getActiveExpansions(state.config)) setBonus += ext.scienceExtras?.(state, p).setBonus ?? 0;
  const copyable: Record<SwScience, number> = { compass: 0, gear: 0, tablet: 0 };
  if (masks > 0) {
    for (const n of collectTargets(state, p, 'neighbors')) {
      if (n.id === p.id) continue;
      for (const c of n.tableau) {
        if (c.color !== 'green') continue;
        for (const eff of c.effects) if (eff.kind === 'science') copyable[eff.symbol] += 1;
      }
    }
  }
  return { symbols, wild, masks, copyable, setBonus };
}

function scienceVps(state: SwState, p: SwPlayer, copied: SwCard | null): number {
  return bestScience(scienceHoldings(state, p, copied));
}

/** The best science score: masks spent on the neighbours' symbols, then
 *  wilds, every split tried. */
export function bestScience(h: ScienceHoldings): number {
  let best = 0;
  const avail = h.copyable;
  const masks = Math.min(h.masks, avail.compass + avail.gear + avail.tablet);
  for (let a = 0; a <= Math.min(masks, avail.compass); a++) {
    for (let b = 0; b <= Math.min(masks - a, avail.gear); b++) {
      const c = masks - a - b;
      if (c > avail.tablet) continue;
      const s = {
        compass: h.symbols.compass + a,
        gear: h.symbols.gear + b,
        tablet: h.symbols.tablet + c,
      };
      best = Math.max(best, bestScienceScore(s, h.wild, h.setBonus));
    }
  }
  return best;
}

/** Given the three symbol counts (compass/gear/tablet) and a number of "wild"
 *  symbols, compute the maximum-scoring assignment. */
export function bestScienceScore(
  symbols: { compass: number; gear: number; tablet: number },
  wildcards: number,
  setBonus = 0,
): number {
  let best = 0;
  for (let a = 0; a <= wildcards; a++) {
    for (let b = 0; a + b <= wildcards; b++) {
      const ca = symbols.compass + a;
      const ga = symbols.gear + b;
      const ta = symbols.tablet + (wildcards - a - b);
      const score = ca * ca + ga * ga + ta * ta + (7 + setBonus) * Math.min(ca, ga, ta);
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
