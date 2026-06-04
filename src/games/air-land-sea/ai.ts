// Air, Land & Sea AI — heuristic, single difficulty.
//
// Strategy
// --------
// 1. Always answer follow-up sub-phases first (flip target, transport target,
//    redeploy target, reinforce placement). These pick the locally-best target
//    (highest opponent strength to flip / closest theater to swing / etc.).
// 2. On `awaitingAction`:
//    a. Compute strength on every theater for both sides + a "value" for the
//       cards in hand.
//    b. Consider withdrawing if expected VP loss from continuing > VP loss
//       from withdrawing now.
//    c. Otherwise score every legal deploy and every legal improvise; pick
//       the highest-scoring action.
//
// Scoring an action ≈ delta in (theaters likely to be won by us) × big weight
// + raw strength delta + ability value bonus − penalty for "burning" a high-
// value card too early.

import type { PlayerId } from '@/core/types';
import type { AlsState, AlsAction, AlsCardTemplate } from './types';
import { theaterStrength, ownerHasOngoing, vpForWithdraw, FULL_BATTLE_VP } from './scoring';

// Rough ability value table — added as a bonus when scoring an Instant/Ongoing
// play. Tuned by feel, not optimized.
const ABILITY_VALUE: Partial<Record<NonNullable<AlsCardTemplate['ability']>, number>> = {
  // Instants
  maneuver: 2.5,
  ambush: 3.0,
  disrupt: 4.0,
  transport: 2.0,
  transportSea: 2.0,
  redeploy: 1.5,
  reinforce: 2.0,
  airDrop: 1.0,
  // Ongoings (high — they keep working)
  aerodrome: 3.5,
  escalation: 3.0,
  containment: 4.0,
  support: 3.0,
  coverFire: 3.0,
  coverFireSea: 3.0,
  blockade: 3.0,
  // 6-strength = pure strength (handled separately via raw strength)
  heavyBombers: 0,
  heavyTanks: 0,
  superBattleship: 0,
};

function seatIdxOf(state: AlsState, id: PlayerId): 0 | 1 | null {
  if (state.players[0].id === id) return 0;
  if (state.players[1].id === id) return 1;
  return null;
}
function other(s: 0 | 1): 0 | 1 { return s === 0 ? 1 : 0; }

function controlMargin(state: AlsState, seatIdx: 0 | 1): number {
  let wins = 0;
  for (let t = 0; t < state.config.theaters.length; t++) {
    const me = theaterStrength(state, t, seatIdx);
    const opp = theaterStrength(state, t, other(seatIdx));
    if (me > opp) wins += 1;
    else if (me === opp) {
      // tie goes to first player
      if (state.firstPlayerSeatIdx === seatIdx) wins += 1;
    }
  }
  return wins;
}

/** Estimate the value of deploying `card` to theaterIdx. Mutates a clone. */
function scoreDeploy(state: AlsState, seatIdx: 0 | 1, card: AlsCardTemplate, theaterIdx: number): number {
  // Forecast: roughly, this card contributes its strength to that theater on
  // our side. Plus ability bonus.
  const opp = other(seatIdx);
  const myCurrent = theaterStrength(state, theaterIdx, seatIdx);
  const oppCurrent = theaterStrength(state, theaterIdx, opp);
  const myAfter = myCurrent + card.strength;
  // Crossing thresholds: going from "behind" to "ahead" is most valuable.
  let v = card.strength * 0.4;
  if (myCurrent <= oppCurrent && myAfter > oppCurrent) v += 6;
  else if (myAfter > oppCurrent) v += 2;
  // Ability bonus.
  if (card.ability) v += ABILITY_VALUE[card.ability] ?? 0;
  // Penalty: burning a 5 or 6 too early (round-1).
  if (card.strength >= 5 && state.players[seatIdx].hand.length >= 4) v -= 1;
  return v;
}

function scoreImprovise(state: AlsState, seatIdx: 0 | 1, card: AlsCardTemplate, theaterIdx: number): number {
  const opp = other(seatIdx);
  // Face-down strength: 2 base, 4 with own Escalation in play.
  const fdStrength = ownerHasOngoing(state, seatIdx, 'escalation') ? 4 : 2;
  const myCurrent = theaterStrength(state, theaterIdx, seatIdx);
  const oppCurrent = theaterStrength(state, theaterIdx, opp);
  const myAfter = myCurrent + fdStrength;
  let v = fdStrength * 0.3;
  if (myCurrent <= oppCurrent && myAfter > oppCurrent) v += 4;
  else if (myAfter > oppCurrent) v += 1;
  // Improvise hides our strong cards — bonus for using strong cards face-down
  // when we don't have a matching theater.
  if (card.strength >= 5) v += 1.5;
  // Strong penalty if Containment is in play (card would be discarded).
  if (ownerHasOngoing(state, 0, 'containment') || ownerHasOngoing(state, 1, 'containment')) {
    v -= 6;
  }
  return v;
}

function deployLegalTheaters(state: AlsState, seatIdx: 0 | 1, card: AlsCardTemplate): number[] {
  const out: number[] = [];
  const matching = state.config.theaters.findIndex((t) => t === card.theater);
  if (matching !== -1) out.push(matching);
  // Aerodrome: 1-3 strength cards can go anywhere.
  if (card.strength <= 3 && ownerHasOngoing(state, seatIdx, 'aerodrome')) {
    for (let i = 0; i < state.config.theaters.length; i++) {
      if (!out.includes(i)) out.push(i);
    }
  }
  // Air Drop: one-shot anywhere.
  if (state.players[seatIdx].airDropArmed) {
    for (let i = 0; i < state.config.theaters.length; i++) {
      if (!out.includes(i)) out.push(i);
    }
  }
  return out;
}

export function chooseAIAction(state: AlsState, playerId: PlayerId): AlsAction | null {
  if (state.phase !== 'playing') return null;
  const seatIdx = seatIdxOf(state, playerId);
  if (seatIdx === null) return null;

  // Battle-end advance: anyone (in our two-player setup, the active player)
  // can press continue. Just do it.
  if (state.subPhase === 'battleEnd') {
    if (state.activePlayerId === playerId) return { type: 'continueBattle' };
    return null;
  }

  // Must be the active player for everything else.
  if (state.activePlayerId !== playerId) return null;

  // ---------- Follow-up handlers ----------
  switch (state.subPhase) {
    case 'awaitingFlipTarget': {
      // Find the highest-strength uncovered card on the legal side(s).
      const pending = state.pendingAbility;
      if (!pending) return null;
      let bestT = -1, bestSide: 0 | 1 = 0, bestVal = -1;
      const allowedSides: Array<0 | 1> =
        pending.kind === 'disrupt' ? [pending.chooserSeatIdx] : [0, 1];
      const allowedTheaters =
        pending.kind === 'maneuver'
          ? [pending.sourceTheaterIdx - 1, pending.sourceTheaterIdx + 1].filter(
              (i) => i >= 0 && i < state.config.theaters.length,
            )
          : Array.from({ length: state.config.theaters.length }, (_, i) => i);
      for (const t of allowedTheaters) {
        for (const side of allowedSides) {
          const stack = state.playedCards[t][side];
          if (stack.length === 0) continue;
          const top = stack[stack.length - 1];
          const tpl = state.deckPool[top.cardId];
          if (!tpl) continue;
          // Higher-strength face-up enemy card = best flip target.
          let val = 0;
          if (side !== seatIdx && !top.faceDown) val = tpl.strength;
          else if (side === seatIdx && top.faceDown) val = 5; // flip own face-down up = often good
          else val = 1;
          if (val > bestVal) { bestVal = val; bestT = t; bestSide = side; }
        }
      }
      if (bestT === -1) {
        // No legal target — shouldn't happen since reducer guards. Skip via no-op.
        return null;
      }
      return { type: 'chooseFlipTarget', playerId, theaterIdx: bestT, sideIdx: bestSide };
    }
    case 'awaitingTransportTarget': {
      const pending = state.pendingAbility;
      if (!pending || pending.kind !== 'transport') return null;
      if (pending.pickedCardId === undefined) {
        // Step 1: pick a card. Pick top-of-stack with the most "swing" potential
        // — the top card on a theater where we're losing (move it to a theater
        // where we might win).
        let bestT = -1, bestId = -1, bestVal = -Infinity;
        for (let t = 0; t < state.playedCards.length; t++) {
          const stack = state.playedCards[t][seatIdx];
          if (stack.length === 0) continue;
          const top = stack[stack.length - 1];
          // Score: prefer face-up high-strength on losing theater.
          const opp = other(seatIdx);
          const meS = theaterStrength(state, t, seatIdx);
          const oppS = theaterStrength(state, t, opp);
          const margin = meS - oppS;
          const v = -margin; // bigger loss = better to move from
          if (v > bestVal) { bestVal = v; bestT = t; bestId = top.cardId; }
        }
        if (bestT === -1) return null;
        return { type: 'chooseTransportCard', playerId, theaterIdx: bestT, cardId: bestId };
      }
      // Step 2: pick destination — the most-contested theater we could swing.
      let bestDest = -1, bestVal = -Infinity;
      for (let t = 0; t < state.config.theaters.length; t++) {
        if (t === pending.pickedFromTheaterIdx) continue;
        const opp = other(seatIdx);
        const meS = theaterStrength(state, t, seatIdx);
        const oppS = theaterStrength(state, t, opp);
        const gap = oppS - meS;
        if (gap > bestVal) { bestVal = gap; bestDest = t; }
      }
      if (bestDest === -1) return null;
      return { type: 'chooseTransportDestination', playerId, theaterIdx: bestDest };
    }
    case 'awaitingRedeployTarget': {
      // Recall the face-down card on our weakest losing theater.
      let bestT = -1, bestId = -1, bestVal = -Infinity;
      for (let t = 0; t < state.playedCards.length; t++) {
        const stack = state.playedCards[t][seatIdx];
        const top = stack[stack.length - 1];
        if (!top || !top.faceDown) continue;
        const opp = other(seatIdx);
        const margin = theaterStrength(state, t, seatIdx) - theaterStrength(state, t, opp);
        const v = -margin;
        if (v > bestVal) { bestVal = v; bestT = t; bestId = top.cardId; }
      }
      if (bestT === -1) return null;
      return { type: 'chooseRedeployTarget', playerId, theaterIdx: bestT, cardId: bestId };
    }
    case 'awaitingReinforcePlacement': {
      // Almost always place the free face-down on a losing theater.
      let bestT = -1, bestVal = -Infinity;
      for (let t = 0; t < state.config.theaters.length; t++) {
        const opp = other(seatIdx);
        const gap = theaterStrength(state, t, opp) - theaterStrength(state, t, seatIdx);
        if (gap > bestVal) { bestVal = gap; bestT = t; }
      }
      if (bestT === -1) {
        return { type: 'reinforcePlace', playerId, theaterIdx: null };
      }
      return { type: 'reinforcePlace', playerId, theaterIdx: bestT };
    }
    default:
      break;
  }

  if (state.subPhase !== 'awaitingAction') return null;
  const me = state.players[seatIdx];

  // ---------- Withdraw decision ----------
  // If we're losing badly (control margin < 0 and most of hand played), withdraw
  // when withdraw cost < expected loss cost.
  const myMargin = controlMargin(state, seatIdx);
  const halfTheaters = state.config.theaters.length / 2;
  const losing = myMargin < halfTheaters;
  const cardsLeft = me.hand.length;
  if (losing && cardsLeft >= 1 && cardsLeft <= 4) {
    // Withdrawing gives opp: vpForWithdraw(cardsLeft). Full-play loss gives 6.
    // If they're already winning theaters AND likely to keep them, withdraw.
    const oppMargin = controlMargin(state, other(seatIdx));
    if (oppMargin > halfTheaters && vpForWithdraw(cardsLeft) < FULL_BATTLE_VP) {
      return { type: 'withdraw', playerId };
    }
  }

  // ---------- Score every legal deploy + improvise ----------
  let bestAction: AlsAction | null = null;
  let bestScore = -Infinity;
  for (const cardId of me.hand) {
    const card = state.deckPool[cardId];
    if (!card) continue;
    // Deploy options
    for (const t of deployLegalTheaters(state, seatIdx, card)) {
      const v = scoreDeploy(state, seatIdx, card, t);
      if (v > bestScore) {
        bestScore = v;
        bestAction = { type: 'deploy', playerId, cardId, theaterIdx: t };
      }
    }
    // Improvise options
    for (let t = 0; t < state.config.theaters.length; t++) {
      const v = scoreImprovise(state, seatIdx, card, t);
      if (v > bestScore) {
        bestScore = v;
        bestAction = { type: 'improvise', playerId, cardId, theaterIdx: t };
      }
    }
  }
  return bestAction;
}
