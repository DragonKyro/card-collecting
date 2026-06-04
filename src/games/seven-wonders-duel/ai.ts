// 7 Wonders Duel — AI.
//
// Simple greedy heuristic — handles each subphase deterministically:
//   wonderDraft: pick highest-approx-value wonder from pool.
//   turn: rank available pyramid cards by (build value, bury value, discard value)
//         and pick the best action overall.
//   wonderConstruct: pick the cheapest unbuilt wonder to bury under.
//   progressPick: pick highest-value progress token in offer.

import type { PlayerId } from '@/core/types';
import type {
  DuelAction, DuelCard, DuelPlayer, DuelProgressTokenId, DuelResource,
  DuelState,
} from './types';
import { isSlotAvailable } from './pyramid';
import { WONDERS, wonderById } from './wonders';
import {
  canChainBuild, effectiveCostForCard, effectiveCostForWonder,
  productionFor, productionCanSupply, purchaseCost, shieldsFor,
} from './resources';

export function chooseAIAction(state: DuelState, playerId: PlayerId): DuelAction | null {
  const seatIdx = state.players[0].id === playerId ? 0 : 1;
  if (seatIdx !== state.activeSeatIdx) return null;
  if (state.phase === 'gameOver') return null;

  if (state.subPhase === 'wonderDraft') {
    return aiPickWonderDraft(state, playerId, seatIdx);
  }
  if (state.subPhase === 'progressPick') {
    return aiPickProgressToken(state, playerId);
  }
  if (state.subPhase === 'wonderConstruct') {
    return aiPickWonderToBury(state, playerId, seatIdx);
  }
  if (state.subPhase === 'turn') {
    return aiPlayTurn(state, playerId, seatIdx);
  }
  return null;
}

function aiPickWonderDraft(
  state: DuelState,
  playerId: PlayerId,
  seatIdx: 0 | 1,
): DuelAction | null {
  void seatIdx;
  if (!state.wonderDraft || state.wonderDraft.pool.length === 0) return null;
  // Heuristic: prefer wonders with the most VP + low resource cost.
  const ranked = [...state.wonderDraft.pool].sort((a, b) => {
    return wonderValue(b) - wonderValue(a);
  });
  return { type: 'submitWonderDraft', playerId, wonderId: ranked[0] };
}

function wonderValue(wonderId: string): number {
  const w = wonderById(wonderId);
  let v = 0;
  for (const eff of w.effects) {
    if (eff.kind === 'vp' && eff.vp) v += eff.vp;
    if (eff.kind === 'coins' && eff.coins) v += eff.coins * 0.4;
    if (eff.kind === 'shields' && eff.shields) v += eff.shields * 2;
    if (eff.kind === 'science') v += 3;
    if (eff.kind === 'produce') v += 1;
    if (eff.kind === 'tradeDiscountRaw' || eff.kind === 'tradeDiscountManufactured') v += 2;
  }
  v -= (w.cost.resources?.length ?? 0) * 0.5;
  return v;
}

function aiPickProgressToken(state: DuelState, playerId: PlayerId): DuelAction | null {
  if (state.progressOffer.length === 0) return null;
  // Heuristic preference order.
  const PREF: DuelProgressTokenId[] = [
    'philosophy', 'mathematics', 'agriculture', 'masonry', 'architecture',
    'law', 'urbanism', 'strategy', 'economy', 'theology',
  ];
  for (const t of PREF) {
    if (state.progressOffer.includes(t)) {
      return { type: 'chooseProgressToken', playerId, tokenId: t };
    }
  }
  return { type: 'chooseProgressToken', playerId, tokenId: state.progressOffer[0] };
}

function aiPickWonderToBury(
  state: DuelState,
  playerId: PlayerId,
  seatIdx: 0 | 1,
): DuelAction | null {
  const me = state.players[seatIdx];
  const unbuilt = me.wonders.filter((w) => !w.built);
  if (unbuilt.length === 0) return null;
  // Try each unbuilt wonder, pick the cheapest one we can pay for.
  for (const ws of unbuilt) {
    const wonder = wonderById(ws.wonderId);
    const cost = effectiveCostForWonder(me, wonder);
    const required = cost.resources ?? [];
    const prod = productionFor(me);
    const purchase: DuelResource[] = [];
    const remaining: DuelResource[] = required.slice();
    // First try self-production; what's left, buy.
    // For simplicity: anything we can't self-produce, buy.
    const selfCovered: DuelResource[] = [];
    for (const r of required) {
      const tryWith = selfCovered.concat([r]);
      if (productionCanSupply(prod, tryWith)) {
        selfCovered.push(r);
      } else {
        purchase.push(r);
      }
    }
    // remaining = required - selfCovered. We pre-built purchase as the leftovers.
    void remaining;
    const opp = state.players[(1 - seatIdx) as 0 | 1];
    const purchaseCoins = purchaseCost(me, opp, purchase);
    if (me.coins >= (cost.coins ?? 0) + purchaseCoins) {
      return { type: 'chooseWonderToBury', playerId, wonderId: ws.wonderId, purchase };
    }
  }
  // If we can't afford any, pick the first one with empty purchase (will throw,
  // but at least we tried).
  return { type: 'chooseWonderToBury', playerId, wonderId: unbuilt[0].wonderId, purchase: [] };
}

function aiPlayTurn(
  state: DuelState,
  playerId: PlayerId,
  seatIdx: 0 | 1,
): DuelAction | null {
  const me = state.players[seatIdx];
  const opp = state.players[(1 - seatIdx) as 0 | 1];
  // Get available cards.
  const available = state.pyramid
    .filter((s) => isSlotAvailable(s, state.pyramid) && s.faceUp)
    .map((s) => state.cardsById[s.cardId])
    .filter(Boolean);
  if (available.length === 0) {
    // Fallback: also include face-down cards (AI can see them in code).
    const fallback = state.pyramid
      .filter((s) => isSlotAvailable(s, state.pyramid))
      .map((s) => state.cardsById[s.cardId])
      .filter(Boolean);
    if (fallback.length === 0) return null;
    available.push(...fallback);
  }
  // Try each card as build / bury / discard, pick the best.
  type Option = { action: DuelAction; value: number };
  const options: Option[] = [];
  for (const card of available) {
    // BUILD
    const buildOption = tryBuild(state, me, opp, card, playerId);
    if (buildOption) options.push(buildOption);
    // BURY (only if we have an unbuilt wonder we can actually afford)
    if (me.wonders.some((w) => !w.built) && canAffordAnyUnbuiltWonder(state, me, seatIdx)) {
      options.push({
        action: { type: 'takeAndBury', playerId, cardId: card.id },
        value: buryValue(state, me, card, seatIdx),
      });
    }
    // DISCARD
    options.push({
      action: { type: 'takeAndDiscard', playerId, cardId: card.id },
      value: discardValue(me, card),
    });
  }
  if (options.length === 0) return null;
  options.sort((a, b) => b.value - a.value);
  return options[0].action;
}

function tryBuild(
  _state: DuelState,
  me: DuelPlayer,
  opp: DuelPlayer,
  card: DuelCard,
  playerId: PlayerId,
): { action: DuelAction; value: number } | null {
  // Duplicate check.
  if (me.tableau.some((c) => c.name === card.name)) return null;
  // Chain?
  if (canChainBuild(me, card)) {
    return {
      action: { type: 'takeAndBuild', playerId, cardId: card.id, purchase: [] },
      value: cardValue(card) + 5,
    };
  }
  const effCost = effectiveCostForCard(me, card);
  const required = effCost.resources ?? [];
  // Try to self-produce as much as possible; buy the rest.
  const prod = productionFor(me);
  const selfCovered: DuelResource[] = [];
  const purchase: DuelResource[] = [];
  for (const r of required) {
    const tryWith = selfCovered.concat([r]);
    if (productionCanSupply(prod, tryWith)) {
      selfCovered.push(r);
    } else {
      purchase.push(r);
    }
  }
  const purchaseCoins = purchaseCost(me, opp, purchase);
  const total = (effCost.coins ?? 0) + purchaseCoins;
  if (me.coins < total) return null;
  return {
    action: { type: 'takeAndBuild', playerId, cardId: card.id, purchase },
    value: cardValue(card) - total * 0.4,
  };
}

function cardValue(card: DuelCard): number {
  let v = 0;
  for (const eff of card.effects) {
    if (eff.kind === 'vp') v += eff.vp;
    if (eff.kind === 'shields') v += eff.shields * 2.5;
    if (eff.kind === 'coins') v += eff.amount * 0.4;
    if (eff.kind === 'science') v += 4; // valuable in Duel
    if (eff.kind === 'produce') v += 1.5;
    if (eff.kind === 'tradeDiscountRaw' || eff.kind === 'tradeDiscountManufactured') v += 2;
    if (eff.kind === 'endVp') v += (eff.vpPer ?? 0) * 2 + (eff.coinsPerOnPlay ?? 0) * 0.5;
    if (eff.kind === 'forceOpponentDiscardCoins') v += eff.amount * 0.3;
    if (eff.kind === 'gainCoinsPerCardColor') v += eff.per * 1;
  }
  return v;
}

function buryValue(state: DuelState, me: DuelPlayer, card: DuelCard, seatIdx: 0 | 1): number {
  void state; void card; void seatIdx;
  // Bury is valuable when we have unbuilt wonders with good effects.
  const unbuilt = me.wonders.filter((w) => !w.built);
  if (unbuilt.length === 0) return 0;
  // Find the best unbuilt wonder by value.
  let best = 0;
  for (const ws of unbuilt) {
    const v = wonderValue(ws.wonderId);
    if (v > best) best = v;
  }
  // Discount for cost.
  return best * 0.6;
}

function canAffordAnyUnbuiltWonder(state: DuelState, me: DuelPlayer, seatIdx: 0 | 1): boolean {
  const opp = state.players[(1 - seatIdx) as 0 | 1];
  for (const ws of me.wonders) {
    if (ws.built) continue;
    const wonder = wonderById(ws.wonderId);
    const cost = effectiveCostForWonder(me, wonder);
    const required = cost.resources ?? [];
    const prod = productionFor(me);
    const selfCovered: DuelResource[] = [];
    const purchase: DuelResource[] = [];
    for (const r of required) {
      const tryWith = selfCovered.concat([r]);
      if (productionCanSupply(prod, tryWith)) selfCovered.push(r);
      else purchase.push(r);
    }
    const total = (cost.coins ?? 0) + purchaseCost(me, opp, purchase);
    if (me.coins >= total) return true;
  }
  return false;
}

function discardValue(me: DuelPlayer, card: DuelCard): number {
  void me; void card;
  // Discard always gives 2 + yellow coins; treat as worth ~2.
  return 2 + me.tableau.filter((c) => c.color === 'yellow').length * 0.5;
}

void shieldsFor; void WONDERS;
