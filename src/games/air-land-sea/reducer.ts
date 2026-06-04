// Air, Land & Sea reducer.
//
// Turn flow (alternating per active seat):
//   subPhase = 'awaitingAction':
//     - deploy: face-up to matching theater (with Aerodrome / Air Drop overrides);
//       fire Instant ability if any; if Instant needs a target, subPhase shifts
//       to awaiting* and we DO NOT advance the turn until the follow-up arrives.
//     - improvise: face-down anywhere. Containment → discard immediately.
//                  Blockade → may discard the new card. No ability fires.
//     - withdraw: end the battle in favor of the opponent.
//   subPhase = 'awaitingFlipTarget' / 'awaitingTransportTarget' / etc:
//     the matching choose* action resolves it. Then turn advances (or, for
//     Redeploy and Disrupt's second flip, may stay with the same player or
//     trigger another follow-up).
//   subPhase = 'battleEnd': awaiting `continueBattle` to start the next battle
//     (or `continueMatch` if a player reached targetVp — in which case phase
//     is already 'gameOver').
//
// Determinism: deck order is shuffled once at battle start using
// `state.rngState`. No per-action randomness — Reinforce's "look at top" is
// deterministic given the deck order.

import type { PlayerId } from '@/core/types';
import { shuffle } from '@/core/rng';
import type {
  AlsState, AlsAction, AlsPlayer, AlsCardTemplate, AlsLogEntry, AlsBattleResult,
} from './types';
import { handSizeFor, cardIdsForTheaters } from './cards';
import {
  computeTheaterControl, resolveFullBattle, theaterStrength,
  ownerHasOngoing, vpForWithdraw, FULL_BATTLE_VP, adjacentTheaters,
} from './scoring';
import {
  fireInstantAbility, applyContainmentIfActive, applyBlockadeIfActive, findOwnPlaced,
} from './abilities';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<AlsLogEntry, 'seq' | 'battle'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: AlsState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({ seq: state.logSeq, battle: state.battleNumber, ...partial } as AlsLogEntry);
}

function seatIdxOf(state: AlsState, id: PlayerId): 0 | 1 {
  if (state.players[0].id === id) return 0;
  if (state.players[1].id === id) return 1;
  throw new Error(`unknown player ${id}`);
}

function otherSeat(s: 0 | 1): 0 | 1 { return s === 0 ? 1 : 0; }

function requireActive(state: AlsState, playerId: PlayerId): { player: AlsPlayer; seatIdx: 0 | 1 } {
  if (state.activePlayerId !== playerId) {
    throw new Error(`not your turn (active=${state.activePlayerId}, you=${playerId})`);
  }
  const seatIdx = seatIdxOf(state, playerId);
  return { player: state.players[seatIdx], seatIdx };
}

// ---------- Battle setup ----------

/** Build the deck, deal hands, reset board. Call when starting a new battle. */
function dealBattle(state: AlsState): void {
  const ids = cardIdsForTheaters(state.config.theaters);
  state.deck = shuffle(state.rngState, ids);
  state.discard = [];
  // Reset board.
  state.playedCards = state.config.theaters.map(() => [[], []]);
  state.supplyTokens = state.config.theaters.map(() => [0, 0]);
  // Reset per-player battle fields.
  const hand = handSizeFor(state.config.theaters.length);
  for (const p of state.players) {
    p.hand = [];
    p.airDropArmed = false;
  }
  for (let i = 0; i < hand; i++) {
    for (const sideIdx of [0, 1] as const) {
      const id = state.deck.pop();
      if (id !== undefined) state.players[sideIdx].hand.push(id);
    }
  }
  state.subPhase = 'awaitingAction';
  state.pendingAbility = null;
  state.activePlayerId = state.players[state.firstPlayerSeatIdx].id;
}

export function setupNewMatch(state: AlsState): void {
  state.battleNumber = 1;
  // First player for battle #1 is whoever sits at seat 0 by default — could be
  // randomized, but rulebook lets players choose. Keep deterministic.
  state.firstPlayerSeatIdx = 0;
  state.lastBattleResult = null;
  dealBattle(state);
}

/** Rotate theater list one step (rightmost theater wraps to the left front)
 *  and swap first player. Used between battles. */
function rotateForNextBattle(state: AlsState): void {
  const next = state.config.theaters.slice();
  if (next.length > 0) {
    const tail = next.pop()!;       // rightmost goes to front
    next.unshift(tail);
  }
  state.config = { ...state.config, theaters: next };
  state.firstPlayerSeatIdx = otherSeat(state.firstPlayerSeatIdx);
  state.battleNumber += 1;
  state.lastBattleResult = null;
  dealBattle(state);
}

// ---------- Deploy / improvise validation ----------

/** Aerodrome: if the player has a face-up Aerodrome on the board, they may
 *  deploy strength 1-3 cards to any theater. */
function aerodromeRelaxesTheater(state: AlsState, sideIdx: 0 | 1, card: AlsCardTemplate): boolean {
  if (card.strength < 1 || card.strength > 3) return false;
  return ownerHasOngoing(state, sideIdx, 'aerodrome');
}

function validateDeploy(
  state: AlsState,
  sideIdx: 0 | 1,
  card: AlsCardTemplate,
  theaterIdx: number,
): void {
  if (theaterIdx < 0 || theaterIdx >= state.config.theaters.length) {
    throw new Error('deploy: theater out of range');
  }
  const theaterId = state.config.theaters[theaterIdx];
  if (card.theater === theaterId) return; // matches
  if (aerodromeRelaxesTheater(state, sideIdx, card)) return;
  if (state.players[sideIdx].airDropArmed) return; // one-shot consumed elsewhere
  throw new Error(`deploy: card ${card.name} (${card.theater}) doesn't match theater ${theaterId}`);
}

/** Place a card face-up on a theater stack (top of stack = last index). */
function placeFaceUp(state: AlsState, sideIdx: 0 | 1, theaterIdx: number, cardId: number): void {
  state.playedCards[theaterIdx][sideIdx].push({ cardId, faceDown: false });
}

/** Place a card face-down on a theater stack. */
function placeFaceDown(state: AlsState, sideIdx: 0 | 1, theaterIdx: number, cardId: number): void {
  state.playedCards[theaterIdx][sideIdx].push({ cardId, faceDown: true });
}

// ---------- Turn advancement ----------

/** Hand off to the other seat. Used after a turn fully resolves. */
function advanceTurn(state: AlsState): void {
  const cur = seatIdxOf(state, state.activePlayerId ?? state.players[0].id);
  const next = otherSeat(cur);
  state.activePlayerId = state.players[next].id;
  state.subPhase = 'awaitingAction';
  state.pendingAbility = null;
}

/** Check whether both players have empty hands → end the battle as full-play. */
function checkFullPlayEnd(state: AlsState): boolean {
  if (state.players[0].hand.length === 0 && state.players[1].hand.length === 0) {
    finalizeBattle(state, /*withdrawer*/ null);
    return true;
  }
  return false;
}

/** Resolve a battle: compute VPs, push log, set subPhase. */
function finalizeBattle(state: AlsState, withdrawer: 0 | 1 | null): void {
  let result: AlsBattleResult;
  if (withdrawer !== null) {
    const winner = otherSeat(withdrawer);
    const left = state.players[withdrawer].hand.length;
    const vp = vpForWithdraw(left);
    state.players[winner].vp += vp;
    const strengths = state.playedCards.map((_, t) =>
      [theaterStrength(state, t, 0), theaterStrength(state, t, 1)] as [number, number],
    );
    // Theater control for display, even on withdraw.
    const control = computeTheaterControl(state);
    result = {
      battleNumber: state.battleNumber,
      endedBy: 'withdraw',
      withdrawerSeatIdx: withdrawer,
      winnerSeatIdx: winner,
      vpAwardedToWinner: vp,
      theaterControl: control,
      theaterStrengths: strengths,
    };
    pushLog(state, { kind: 'withdraw', playerId: state.players[withdrawer].id, cardsLeftInHand: left });
  } else {
    const { winnerSeatIdx, control, strengths } = resolveFullBattle(state);
    state.players[winnerSeatIdx].vp += FULL_BATTLE_VP;
    result = {
      battleNumber: state.battleNumber,
      endedBy: 'fullPlay',
      withdrawerSeatIdx: null,
      winnerSeatIdx,
      vpAwardedToWinner: FULL_BATTLE_VP,
      theaterControl: control,
      theaterStrengths: strengths,
    };
  }
  state.lastBattleResult = result;
  pushLog(state, { kind: 'battleEnd', result });

  // Match end?
  if (state.players.some((p) => p.vp >= state.config.targetVp)) {
    state.phase = 'gameOver';
    state.subPhase = 'gameOver';
    state.finalScores = {
      [state.players[0].id]: state.players[0].vp,
      [state.players[1].id]: state.players[1].vp,
    };
    const winnerSeatIdx: 0 | 1 = state.players[0].vp >= state.players[1].vp ? 0 : 1;
    pushLog(state, { kind: 'matchEnd', winnerSeatIdx });
    return;
  }

  state.subPhase = 'battleEnd';
  // Show the "Continue" prompt to the first player of the just-finished battle
  // so the AI driver picks it up if either seat is AI.
  state.activePlayerId = state.players[state.firstPlayerSeatIdx].id;
}

// ---------- Reducer entry ----------

export function applyAction(state: AlsState, action: AlsAction): AlsState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);

  switch (action.type) {
    case 'deploy':       return applyDeploy(s, action);
    case 'improvise':    return applyImprovise(s, action);
    case 'withdraw':     return applyWithdraw(s, action);
    case 'chooseFlipTarget':           return applyChooseFlipTarget(s, action);
    case 'chooseTransportCard':        return applyChooseTransportCard(s, action);
    case 'chooseTransportDestination': return applyChooseTransportDestination(s, action);
    case 'chooseRedeployTarget':       return applyChooseRedeployTarget(s, action);
    case 'reinforcePlace':             return applyReinforcePlace(s, action);
    case 'continueBattle':             return applyContinueBattle(s);
    case 'continueMatch':              return s;
  }
}

// ---------- Action handlers ----------

function applyDeploy(state: AlsState, action: Extract<AlsAction, { type: 'deploy' }>): AlsState {
  if (state.subPhase !== 'awaitingAction') throw new Error('deploy: wrong subPhase');
  const { player, seatIdx } = requireActive(state, action.playerId);
  const handIdx = player.hand.indexOf(action.cardId);
  if (handIdx === -1) throw new Error('deploy: card not in hand');
  const card = state.deckPool[action.cardId];
  if (!card) throw new Error('deploy: unknown card');

  validateDeploy(state, seatIdx, card, action.theaterIdx);

  // Consume the card from hand and place face-up.
  player.hand.splice(handIdx, 1);
  placeFaceUp(state, seatIdx, action.theaterIdx, card.id);
  pushLog(state, { kind: 'deploy', playerId: player.id, cardId: card.id, theaterIdx: action.theaterIdx });

  // Air Drop is a one-shot, consumed by this deploy. Per rulebook: "on your
  // next turn, you may deploy a card to a non-matching theater" — so it
  // applies to ONE deploy, this turn's, regardless of whether the deployment
  // actually used the relaxation.
  if (player.airDropArmed) {
    player.airDropArmed = false;
  }

  // Blockade: face-up deploys to an adjacent theater may trigger a Blockade.
  // The just-played card is discarded if it brings the placer's side of that
  // theater to 3+ cards.
  const blockaded = applyBlockadeIfActive(state, action.theaterIdx, seatIdx, card.id);

  if (blockaded) {
    // Card never enters play, ability never fires. Turn advances.
    advanceTurn(state);
    return state;
  }

  // Fire Instant ability if any.
  if (card.trigger === 'instant') {
    const { turnAdvances } = fireInstantAbility(state, card, seatIdx, action.theaterIdx);
    if (!turnAdvances) {
      // Wait for follow-up action.
      return state;
    }
  }

  if (checkFullPlayEnd(state)) return state;
  advanceTurn(state);
  return state;
}

function applyImprovise(state: AlsState, action: Extract<AlsAction, { type: 'improvise' }>): AlsState {
  if (state.subPhase !== 'awaitingAction') throw new Error('improvise: wrong subPhase');
  const { player, seatIdx } = requireActive(state, action.playerId);
  if (action.theaterIdx < 0 || action.theaterIdx >= state.config.theaters.length) {
    throw new Error('improvise: theater out of range');
  }
  const handIdx = player.hand.indexOf(action.cardId);
  if (handIdx === -1) throw new Error('improvise: card not in hand');

  player.hand.splice(handIdx, 1);
  placeFaceDown(state, seatIdx, action.theaterIdx, action.cardId);
  pushLog(state, { kind: 'improvise', playerId: player.id, cardId: action.cardId, theaterIdx: action.theaterIdx });

  // Containment: discard face-down plays.
  applyContainmentIfActive(state, action.theaterIdx, seatIdx, action.cardId);
  // Blockade: same rule as deploy.
  applyBlockadeIfActive(state, action.theaterIdx, seatIdx, action.cardId);

  if (checkFullPlayEnd(state)) return state;
  advanceTurn(state);
  return state;
}

function applyWithdraw(state: AlsState, action: Extract<AlsAction, { type: 'withdraw' }>): AlsState {
  if (state.subPhase !== 'awaitingAction') throw new Error('withdraw: wrong subPhase');
  const { seatIdx } = requireActive(state, action.playerId);
  finalizeBattle(state, seatIdx);
  return state;
}

// ---------- Follow-up handlers ----------

function applyChooseFlipTarget(
  state: AlsState,
  action: Extract<AlsAction, { type: 'chooseFlipTarget' }>,
): AlsState {
  if (state.subPhase !== 'awaitingFlipTarget') throw new Error('chooseFlipTarget: wrong subPhase');
  if (state.activePlayerId !== action.playerId) throw new Error('chooseFlipTarget: not chooser');
  const pending = state.pendingAbility;
  if (!pending) throw new Error('chooseFlipTarget: no pending ability');

  const { theaterIdx, sideIdx } = action;
  if (theaterIdx < 0 || theaterIdx >= state.config.theaters.length) {
    throw new Error('chooseFlipTarget: theater out of range');
  }
  const stack = state.playedCards[theaterIdx][sideIdx];
  if (stack.length === 0) throw new Error('chooseFlipTarget: empty stack');
  const topIdx = stack.length - 1;
  const top = stack[topIdx];

  // Source restrictions per ability:
  if (pending.kind === 'maneuver') {
    const adj = adjacentTheaters(state.config.theaters.length, pending.sourceTheaterIdx);
    if (!adj.includes(theaterIdx)) throw new Error('maneuver: target must be in adjacent theater');
  } else if (pending.kind === 'disrupt') {
    if (sideIdx !== pending.chooserSeatIdx) throw new Error('disrupt: flip own side only');
  } else if (pending.kind !== 'ambush') {
    throw new Error('chooseFlipTarget: pending ability does not consume flip-targets');
  }
  // Ambush: "uncovered" — top-of-stack is always uncovered, so this passes.

  // Flip it.
  top.faceDown = !top.faceDown;
  pushLog(state, {
    kind: 'flip',
    playerId: state.activePlayerId,
    cardId: top.cardId,
    theaterIdx,
    now: top.faceDown ? 'down' : 'up',
  });

  // What's next?
  if (pending.kind === 'disrupt') {
    if (!pending.opponentFlippedYet) {
      // First flip done; now self side flips one of theirs.
      // Determine source seat (who DEPLOYED Disrupt).
      // Source is the OTHER side from current chooser (current was opponent).
      const sourceSeat = otherSeat(pending.chooserSeatIdx);
      // Switch to "self flip".
      const selfHas = state.playedCards.some(
        (theater) => theater[sourceSeat].length > 0,
      );
      if (selfHas) {
        state.pendingAbility = {
          kind: 'disrupt',
          sourceCardId: pending.sourceCardId,
          chooserSeatIdx: sourceSeat,
          opponentFlippedYet: true,
        };
        state.activePlayerId = state.players[sourceSeat].id;
        state.subPhase = 'awaitingFlipTarget';
        return state;
      }
      // No own card to flip; effect done.
    }
  }

  // Done with this ability; advance to source-deployer's turn end.
  // Find who originally deployed the Instant card — it's the seat AT THE TIME
  // the pending ability was set, which may differ from the current chooser
  // (e.g. Disrupt). For Maneuver/Ambush the chooser IS the source.
  state.pendingAbility = null;
  // The card was deployed by ... we need to remember. For now: the active
  // player BEFORE Disrupt-opponent-flip is the one who deployed. We use the
  // current activePlayerId as the deployer for Maneuver/Ambush. For Disrupt
  // post-self-flip we just swapped to source above. Either way the turn
  // advances FROM the source's seat.
  if (checkFullPlayEnd(state)) return state;
  advanceTurn(state);
  return state;
}

function applyChooseTransportCard(
  state: AlsState,
  action: Extract<AlsAction, { type: 'chooseTransportCard' }>,
): AlsState {
  if (state.subPhase !== 'awaitingTransportTarget') throw new Error('chooseTransportCard: wrong subPhase');
  if (state.activePlayerId !== action.playerId) throw new Error('chooseTransportCard: not chooser');
  const pending = state.pendingAbility;
  if (!pending || pending.kind !== 'transport') throw new Error('chooseTransportCard: no transport pending');
  const seatIdx = pending.chooserSeatIdx;
  // Ensure the picked card belongs to the chooser.
  const found = findOwnPlaced(state, seatIdx, action.cardId);
  if (!found) throw new Error('chooseTransportCard: card not on your board');
  if (found.theaterIdx !== action.theaterIdx) {
    throw new Error('chooseTransportCard: theater mismatch');
  }
  // Only top-of-stack is moveable (consistent with flip-target restrictions).
  const stack = state.playedCards[found.theaterIdx][seatIdx];
  if (found.slotIdx !== stack.length - 1) {
    throw new Error('chooseTransportCard: only the top card is moveable');
  }
  state.pendingAbility = {
    kind: 'transport',
    sourceCardId: pending.sourceCardId,
    chooserSeatIdx: seatIdx,
    pickedCardId: action.cardId,
    pickedFromTheaterIdx: action.theaterIdx,
  };
  // Stay in awaitingTransportTarget — next message is destination.
  return state;
}

function applyChooseTransportDestination(
  state: AlsState,
  action: Extract<AlsAction, { type: 'chooseTransportDestination' }>,
): AlsState {
  if (state.subPhase !== 'awaitingTransportTarget') throw new Error('chooseTransportDestination: wrong subPhase');
  if (state.activePlayerId !== action.playerId) throw new Error('chooseTransportDestination: not chooser');
  const pending = state.pendingAbility;
  if (!pending || pending.kind !== 'transport') throw new Error('chooseTransportDestination: no transport pending');
  if (pending.pickedCardId === undefined || pending.pickedFromTheaterIdx === undefined) {
    throw new Error('chooseTransportDestination: pick card first');
  }
  const seatIdx = pending.chooserSeatIdx;
  if (action.theaterIdx === pending.pickedFromTheaterIdx) {
    throw new Error('chooseTransportDestination: must be different theater');
  }
  if (action.theaterIdx < 0 || action.theaterIdx >= state.config.theaters.length) {
    throw new Error('chooseTransportDestination: theater out of range');
  }
  // Move the card.
  const fromStack = state.playedCards[pending.pickedFromTheaterIdx][seatIdx];
  const idx = fromStack.findIndex((p) => p.cardId === pending.pickedCardId);
  if (idx === -1) throw new Error('chooseTransportDestination: card lost');
  const moved = fromStack.splice(idx, 1)[0];
  state.playedCards[action.theaterIdx][seatIdx].push(moved);
  pushLog(state, {
    kind: 'transport',
    playerId: action.playerId,
    cardId: pending.pickedCardId,
    fromTheaterIdx: pending.pickedFromTheaterIdx,
    toTheaterIdx: action.theaterIdx,
  });

  state.pendingAbility = null;
  if (checkFullPlayEnd(state)) return state;
  advanceTurn(state);
  return state;
}

function applyChooseRedeployTarget(
  state: AlsState,
  action: Extract<AlsAction, { type: 'chooseRedeployTarget' }>,
): AlsState {
  if (state.subPhase !== 'awaitingRedeployTarget') throw new Error('chooseRedeployTarget: wrong subPhase');
  if (state.activePlayerId !== action.playerId) throw new Error('chooseRedeployTarget: not chooser');
  const seatIdx = seatIdxOf(state, action.playerId);
  // Validate card is a face-down card of the chooser's.
  const stack = state.playedCards[action.theaterIdx]?.[seatIdx];
  if (!stack) throw new Error('chooseRedeployTarget: theater out of range');
  const slotIdx = stack.findIndex((p) => p.cardId === action.cardId);
  if (slotIdx === -1) throw new Error('chooseRedeployTarget: card not in stack');
  const placed = stack[slotIdx];
  if (!placed.faceDown) throw new Error('chooseRedeployTarget: card must be face-down');
  // Top-of-stack rule: a card is "uncovered" only when at the top. Allow only top.
  if (slotIdx !== stack.length - 1) throw new Error('chooseRedeployTarget: only top card can be redeployed');
  // Return to hand.
  stack.splice(slotIdx, 1);
  const me = state.players[seatIdx];
  me.hand.push(placed.cardId);
  pushLog(state, {
    kind: 'redeploy',
    playerId: action.playerId,
    cardId: placed.cardId,
    fromTheaterIdx: action.theaterIdx,
  });
  state.pendingAbility = null;
  // "Take another turn" — stay with the same player. Reset subPhase.
  state.subPhase = 'awaitingAction';
  return state;
}

function applyReinforcePlace(
  state: AlsState,
  action: Extract<AlsAction, { type: 'reinforcePlace' }>,
): AlsState {
  if (state.subPhase !== 'awaitingReinforcePlacement') throw new Error('reinforcePlace: wrong subPhase');
  if (state.activePlayerId !== action.playerId) throw new Error('reinforcePlace: not chooser');
  const pending = state.pendingAbility;
  if (!pending || pending.kind !== 'reinforce') throw new Error('reinforcePlace: no reinforce pending');
  const seatIdx = seatIdxOf(state, action.playerId);

  if (action.theaterIdx === null) {
    // Decline: top card stays on deck.
    state.pendingAbility = null;
    pushLog(state, { kind: 'reinforce', playerId: action.playerId, cardId: pending.revealedTopCardId ?? -1, theaterIdx: null });
    if (checkFullPlayEnd(state)) return state;
    advanceTurn(state);
    return state;
  }

  if (action.theaterIdx < 0 || action.theaterIdx >= state.config.theaters.length) {
    throw new Error('reinforcePlace: theater out of range');
  }
  // Pop top of deck and place face-down.
  const topId = state.deck.pop();
  if (topId === undefined) throw new Error('reinforcePlace: deck empty');
  placeFaceDown(state, seatIdx, action.theaterIdx, topId);
  pushLog(state, { kind: 'reinforce', playerId: action.playerId, cardId: topId, theaterIdx: action.theaterIdx });
  // Containment / Blockade may catch it.
  applyContainmentIfActive(state, action.theaterIdx, seatIdx, topId);
  applyBlockadeIfActive(state, action.theaterIdx, seatIdx, topId);

  state.pendingAbility = null;
  if (checkFullPlayEnd(state)) return state;
  advanceTurn(state);
  return state;
}

function applyContinueBattle(state: AlsState): AlsState {
  if (state.subPhase !== 'battleEnd') throw new Error('continueBattle: wrong subPhase');
  rotateForNextBattle(state);
  return state;
}

// ---------- Helpers used by external (UI, tests) ----------

export const _internals = {
  dealBattle,
  rotateForNextBattle,
  finalizeBattle,
  validateDeploy,
};

