// Leaders expansion — AI for draft + play + Solomon + Bilkis.
//
// Simple heuristic: rank each leader by approximate end-of-match value. Higher
// is better. Tier-(a) flat VPs are easy; tier-(b) per-color VPs use a rough
// "I expect to have ~4 cards of that color" assumption.

import type { PlayerId } from '@/core/types';
import type { SwAction, SwCard, SwState } from '../../types';

function approxLeaderValue(card: SwCard): number {
  let v = -((card.cost.coins ?? 0) * 0.4);
  for (const eff of card.effects) {
    if (eff.kind === 'vp') v += eff.vp;
    else if (eff.kind === 'shields') v += eff.shields * 2;
    else if (eff.kind === 'coins') v += eff.amount * 0.4;
    else if (eff.kind === 'science') v += 3.5;
    else if (eff.kind === 'endVp') {
      // assume 4 of the target color/scope, vpPer = vpPer
      v += 4 * (eff.vpPer ?? 0);
    }
    else if (eff.kind === 'leaderCostModifier') v += 3;
    else if (eff.kind === 'leaderTrigger') v += 2;
    else if (eff.kind === 'leaderScoreExtra') {
      if (eff.rule.type === 'midasCoinBonus') v += 3;
      else if (eff.rule.type === 'alexanderTokenBonus') v += 4;
      else if (eff.rule.type === 'completeScienceSet') v += 5;
      else if (eff.rule.type === 'completeRGBSet') v += 4;
      else if (eff.rule.type === 'completeAllColorsSet') v += 5;
    }
    else if (eff.kind === 'leaderActivated') v += 3;
    else if (eff.kind === 'leaderOnRecruit') v += 6;
  }
  return v;
}

export function chooseAIAction(state: SwState, playerId: PlayerId): SwAction | null {
  if (state.subPhase === 'leaderDraft') {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return null;
    if (player.leaderDraftPick !== null && player.leaderDraftPick !== undefined) return null;
    const hand = state.leaderDraftHands?.[playerId] ?? [];
    if (hand.length === 0) return null;
    const sorted = [...hand].sort((a, b) => approxLeaderValue(b) - approxLeaderValue(a));
    return { type: 'submitLeaderDraft', playerId, cardId: sorted[0].id };
  }
  if (state.subPhase === 'leaderPlay') {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return null;
    if (player.leaderPlayPick !== null && player.leaderPlayPick !== undefined) return null;
    const hand = player.leaderHand ?? [];
    if (hand.length === 0) {
      return { type: 'submitLeaderPlay', playerId, pick: { kind: 'skip' } };
    }
    // Try to play the best affordable leader.
    const sorted = [...hand].sort((a, b) => approxLeaderValue(b) - approxLeaderValue(a));
    for (const card of sorted) {
      const baseCoin = card.cost.coins ?? 0;
      // Maecenas effect: assume already in tableau if present.
      const maecenas = (player.leaderTableau ?? []).some((c) => c.name === 'Maecenas');
      const effCoin = maecenas ? 0 : baseCoin;
      if (player.coins >= effCoin) {
        return {
          type: 'submitLeaderPlay', playerId,
          pick: { kind: 'play', cardId: card.id, payment: { fromWest: [], fromEast: [], coins: 0 } },
        };
      }
    }
    // Can't afford anything — discard the worst for 3 coins.
    const worst = [...hand].sort((a, b) => approxLeaderValue(a) - approxLeaderValue(b))[0];
    return { type: 'submitLeaderPlay', playerId, pick: { kind: 'discard', cardId: worst.id } };
  }
  if (state.subPhase === 'solomonAwaitPick') {
    if (state.solomonPickerId !== playerId) return null;
    if (state.discard.length === 0) return null;
    // Pick the highest-VP card from the discard.
    const ranked = [...state.discard].sort((a, b) => discardCardValue(b) - discardCardValue(a));
    return { type: 'solomonPick', playerId, cardId: ranked[0].id };
  }
  return null;
}

function discardCardValue(card: SwCard): number {
  let v = 0;
  for (const eff of card.effects) {
    if (eff.kind === 'vp') v += eff.vp;
    else if (eff.kind === 'shields') v += eff.shields * 2;
    else if (eff.kind === 'science') v += 3.5;
    else if (eff.kind === 'endVp') v += 3 * (eff.vpPer ?? 0);
    else if (eff.kind === 'coins') v += eff.amount * 0.4;
    else if (eff.kind === 'produce') v += 1;
  }
  return v;
}
