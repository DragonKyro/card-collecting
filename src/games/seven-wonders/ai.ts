// 7 Wonders AI — simple heuristic for the base game.
//
// Approach: score every card in hand by what it'd give us NOW (resources we
// don't have, science we collect, blue VPs, shields when we're behind a
// neighbor). Discard if nothing scores positively and we have a free wonder
// stage we can afford.

import type { PlayerId } from '@/core/types';
import type { SwState, SwAction, SwCard, SwPlayer, SwPendingPick } from './types';
import { wonderById } from './wonders';
import {
  canChainBuild, productionFor,
  shortfall, suggestCheapestPurchase, validatePayment,
  shieldsFor,
} from './resources';
import { getActiveExpansions } from './expansions/registry';

function approxCardValue(state: SwState, p: SwPlayer, card: SwCard): number {
  let v = 0;
  // Duplicates are illegal — strongly negative.
  if (p.tableau.some((c) => c.name === card.name)) return -100;

  // Base value from effects.
  for (const eff of card.effects) {
    if (eff.kind === 'vp') v += eff.vp;
    else if (eff.kind === 'shields') {
      // value shields more if we're losing to a neighbor
      const idx = state.players.findIndex((x) => x.id === p.id);
      const n = state.players.length;
      const west = state.players[(idx - 1 + n) % n];
      const east = state.players[(idx + 1) % n];
      const myShields = shieldsFor(p);
      const wDiff = myShields - shieldsFor(west);
      const eDiff = myShields - shieldsFor(east);
      v += eff.shields * 2;
      if (wDiff <= 0) v += eff.shields;
      if (eDiff <= 0) v += eff.shields;
    }
    else if (eff.kind === 'coins') v += eff.amount * 0.4;
    else if (eff.kind === 'science') {
      // Diminishing returns by symbol — sets-of-3 are valuable.
      const counts = scienceCounts(p);
      const min = Math.min(counts.compass, counts.gear, counts.tablet);
      v += 3 + (counts[eff.symbol] === min ? 2 : 0);
    }
    else if (eff.kind === 'produce') {
      // Producing a resource we don't have is great early; less so later.
      const prod = productionFor(state, p);
      const novelty = eff.production.some((opts) =>
        opts.some((r) => (prod.fixed.get(r) ?? 0) === 0)
      );
      v += novelty ? 4 : 1.5;
    }
    else if (eff.kind === 'tradeDiscountRaw' || eff.kind === 'tradeDiscountManufactured') {
      v += 2.5;
    }
    else if (eff.kind === 'endVp') {
      // Rough estimate: 1 VP per matching card in scope.
      let count = 0;
      const idx = state.players.findIndex((x) => x.id === p.id);
      const n = state.players.length;
      const west = state.players[(idx - 1 + n) % n];
      const east = state.players[(idx + 1) % n];
      const targets =
        eff.from === 'self' ? [p]
        : eff.from === 'neighbors' ? [west, east]
        : [p, west, east];
      for (const t of targets) {
        if (eff.countWhat.kind === 'cardColor') {
          const color = eff.countWhat.color;
          count += t.tableau.filter((c) => c.color === color).length;
        } else if (eff.countWhat.kind === 'wonderStages') {
          count += t.wonderStagesBuilt;
        }
      }
      v += count * (eff.vpPer ?? 0);
      v += count * (eff.coinsPerOnPlay ?? 0) * 0.4;
    }
  }

  // Penalty by neighbor-purchase cost (rough).
  const sf = shortfall(state, p, card.cost);
  if (sf.selfCovers && !canChainBuild(p, card)) {
    // self-covered: just the coin cost
    v -= (card.cost.coins ?? 0) * 0.4;
  } else if (canChainBuild(p, card)) {
    // free build
  } else {
    const plan = suggestCheapestPurchase(state, p, sf.stillNeed);
    if (!plan) return -100; // can't afford
    if (p.coins < (card.cost.coins ?? 0) + plan.coins) return -100;
    v -= plan.coins * 0.4;
  }
  return v;
}

function scienceCounts(p: SwPlayer): { compass: number; gear: number; tablet: number } {
  const counts = { compass: 0, gear: 0, tablet: 0 };
  for (const c of p.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'science') counts[eff.symbol] += 1;
    }
  }
  return counts;
}

/** Build a pendingPick for the chosen card. */
function buildPick(state: SwState, p: SwPlayer, card: SwCard): SwPendingPick | null {
  if (canChainBuild(p, card)) {
    return {
      kind: 'build',
      cardId: card.id,
      payment: { fromWest: [], fromEast: [], coins: 0 },
    };
  }
  const sf = shortfall(state, p, card.cost);
  const baseCoins = card.cost.coins ?? 0;
  if (sf.selfCovers) {
    if (p.coins < baseCoins) return null;
    return {
      kind: 'build',
      cardId: card.id,
      payment: { fromWest: [], fromEast: [], coins: 0 },
    };
  }
  const plan = suggestCheapestPurchase(state, p, sf.stillNeed);
  if (!plan) return null;
  if (p.coins < baseCoins + plan.coins) return null;
  const pick: SwPendingPick = {
    kind: 'build',
    cardId: card.id,
    payment: { fromWest: plan.fromWest, fromEast: plan.fromEast, coins: 0 },
  };
  const v = validatePayment(state, p, card.cost, pick.payment);
  if (!v.ok) return null;
  return pick;
}

/** Build a wonder pendingPick at the next stage, if affordable. */
function buildWonderPick(state: SwState, p: SwPlayer, cardId: number): SwPendingPick | null {
  const wonder = wonderById(p.wonderId);
  const stageIdx = p.wonderStagesBuilt;
  if (stageIdx >= wonder.stages.length) return null;
  const cost = wonder.stages[stageIdx].cost;
  const sf = shortfall(state, p, cost);
  const baseCoins = cost.coins ?? 0;
  if (sf.selfCovers) {
    if (p.coins < baseCoins) return null;
    return {
      kind: 'wonder', cardId, stageIndex: stageIdx,
      payment: { fromWest: [], fromEast: [], coins: 0 },
    };
  }
  const plan = suggestCheapestPurchase(state, p, sf.stillNeed);
  if (!plan) return null;
  if (p.coins < baseCoins + plan.coins) return null;
  return {
    kind: 'wonder', cardId, stageIndex: stageIdx,
    payment: { fromWest: plan.fromWest, fromEast: plan.fromEast, coins: 0 },
  };
}

/** Heuristic top-level: pick best action this tick. */
export function chooseAIAction(state: SwState, playerId: PlayerId): SwAction | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'militaryEnd') {
    // Only one player needs to advance, but the host driver only ticks the
    // active player. We accept the continue from anyone.
    return { type: 'continue' };
  }
  // Expansion-owned subphase (e.g., Leaders' draft/play, Solomon's pick) —
  // delegate to whichever expansion owns it. Without this, AI seats freeze
  // during the leader draft when Leaders is enabled.
  if (state.subPhase !== 'picking') {
    for (const ext of getActiveExpansions(state.config)) {
      if (!ext.ownsSubPhase?.(state.subPhase) || !ext.chooseAIAction) continue;
      const a = ext.chooseAIAction(state, playerId);
      if (a) return a;
    }
    return null;
  }
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  if (me.pendingPick !== null) return null;
  if (me.hand.length === 0) return null;

  // Score every card.
  const ranked = me.hand
    .map((c) => ({ card: c, value: approxCardValue(state, me, c) }))
    .sort((a, b) => b.value - a.value);

  // Try to build the top card. If we can't, try discarding for coins or wonder-stage.
  for (const r of ranked) {
    if (r.value < 0) break;
    const pick = buildPick(state, me, r.card);
    if (pick) return { type: 'submitPick', playerId, pick };
  }

  // Try a wonder stage using whichever card.
  const wonder = wonderById(me.wonderId);
  if (me.wonderStagesBuilt < wonder.stages.length) {
    // Use the LOWEST-value card to wonder-stage with.
    const worst = ranked[ranked.length - 1];
    const wp = buildWonderPick(state, me, worst.card.id);
    if (wp) return { type: 'submitPick', playerId, pick: wp };
  }

  // Otherwise discard the worst card.
  const worst = ranked[ranked.length - 1];
  return {
    type: 'submitPick',
    playerId,
    pick: { kind: 'discard', cardId: worst.card.id },
  };
}
