// Air, Land & Sea — Instant ability triggers.
//
// Ongoing abilities (Cover Fire, Escalation, Aerodrome, Containment, Air
// Support, Blockade) are NOT handled here — they're read passively during
// strength computation (scoring.ts) and during deploy validation (reducer.ts).
//
// This module handles INSTANT abilities only — the ones that fire when a card
// is placed face-up. Each handler either:
//   - applies its effect immediately (e.g. Air Drop just sets a flag), OR
//   - sets state.subPhase + state.pendingAbility to await a follow-up action.
//
// Returns `true` if the turn should advance after the placement, `false` if
// the active player needs to make a follow-up choice (in which case the
// reducer leaves the turn paused).

import type { AlsState, AlsPlacedCard, AlsCardTemplate, AlsLogEntry } from './types';

type LogPartial = DistributiveOmit<AlsLogEntry, 'seq' | 'battle'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: AlsState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({ seq: state.logSeq, battle: state.battleNumber, ...partial } as AlsLogEntry);
}

/** Result of firing an Instant ability. */
export interface InstantResult {
  /** If false, the active player must make a follow-up choice before the turn ends. */
  turnAdvances: boolean;
}

/** Fire the Instant ability of `card` just placed face-up by seat `sideIdx`.
 *  Mutates state. The caller (`reducer.applyDeploy`) decides what to do based
 *  on the returned `turnAdvances`. */
export function fireInstantAbility(
  state: AlsState,
  card: AlsCardTemplate,
  sideIdx: 0 | 1,
  placedTheaterIdx: number,
): InstantResult {
  if (card.trigger !== 'instant') return { turnAdvances: true };
  if (!card.ability) return { turnAdvances: true };

  // Convenience: which other seat is this.
  const otherSide: 0 | 1 = sideIdx === 0 ? 1 : 0;
  const me = state.players[sideIdx];
  const myId = me.id;
  void otherSide;

  switch (card.ability) {
    // ---------- Air Drop ----------
    case 'airDrop': {
      // Arm next-turn deploy override.
      me.airDropArmed = true;
      return { turnAdvances: true };
    }

    // ---------- Maneuver: flip a card in ADJACENT theater ----------
    case 'maneuver': {
      if (!hasFlipTarget(state, /*requireAdjacent*/ true, placedTheaterIdx)) {
        // No legal target → effect fizzles, turn advances.
        return { turnAdvances: true };
      }
      state.subPhase = 'awaitingFlipTarget';
      state.pendingAbility = {
        kind: 'maneuver',
        sourceCardId: card.id,
        sourceTheaterIdx: placedTheaterIdx,
      };
      state.activePlayerId = myId; // remain on the chooser
      return { turnAdvances: false };
    }

    // ---------- Ambush: flip an UNCOVERED card anywhere ----------
    case 'ambush': {
      if (!hasFlipTarget(state, /*requireAdjacent*/ false, placedTheaterIdx)) {
        return { turnAdvances: true };
      }
      state.subPhase = 'awaitingFlipTarget';
      state.pendingAbility = { kind: 'ambush', sourceCardId: card.id };
      state.activePlayerId = myId;
      return { turnAdvances: false };
    }

    // ---------- Disrupt: opponent flips theirs, then you flip yours ----------
    case 'disrupt': {
      // If neither side has a flip target, effect fizzles entirely.
      const opponentHas = hasFlipTargetForSide(state, otherSide);
      const selfHas = hasFlipTargetForSide(state, sideIdx);
      if (!opponentHas && !selfHas) {
        return { turnAdvances: true };
      }
      state.subPhase = 'awaitingFlipTarget';
      state.pendingAbility = {
        kind: 'disrupt',
        sourceCardId: card.id,
        chooserSeatIdx: otherSide,
        opponentFlippedYet: !opponentHas, // skip ahead to self if opponent has nothing
      };
      // Chooser is the OPPONENT first (per rulebook: "your opponent flips 1 of theirs").
      state.activePlayerId = opponentHas ? state.players[otherSide].id : myId;
      return { turnAdvances: false };
    }

    // ---------- Transport: move one of your cards to a different theater ----------
    case 'transport':
    case 'transportSea': {
      if (!hasOwnPlacedCard(state, sideIdx)) {
        // The just-placed card itself counts as one of your cards — but moving
        // the card you JUST played is legal per rules. So at minimum the source
        // card itself qualifies. Just check there's at least one other theater
        // to move to.
        if (state.config.theaters.length <= 1) {
          return { turnAdvances: true };
        }
      }
      state.subPhase = 'awaitingTransportTarget';
      state.pendingAbility = {
        kind: 'transport',
        sourceCardId: card.id,
        chooserSeatIdx: sideIdx,
      };
      state.activePlayerId = myId;
      return { turnAdvances: false };
    }

    // ---------- Redeploy: return one of your face-down cards to hand, then play again ----------
    case 'redeploy': {
      if (!hasOwnFaceDownCard(state, sideIdx)) {
        return { turnAdvances: true };
      }
      state.subPhase = 'awaitingRedeployTarget';
      state.pendingAbility = { kind: 'redeploy', sourceCardId: card.id };
      state.activePlayerId = myId;
      return { turnAdvances: false };
    }

    // ---------- Reinforce: peek top of deck, optionally play face-down anywhere ----------
    case 'reinforce': {
      const topId = state.deck[state.deck.length - 1] ?? null;
      // If the deck is empty, ability fizzles.
      if (topId === null) {
        return { turnAdvances: true };
      }
      state.subPhase = 'awaitingReinforcePlacement';
      state.pendingAbility = {
        kind: 'reinforce',
        sourceCardId: card.id,
        revealedTopCardId: topId,
      };
      state.activePlayerId = myId;
      return { turnAdvances: false };
    }

    // ---------- SLS placeholders (no-op for now; cards play normally) ----------
    case 'intel1': case 'intel2': case 'intel3': case 'intel4': case 'intel5':
    case 'diplo1': case 'diplo2': case 'diplo3': case 'diplo4': case 'diplo5':
    case 'econ1': case 'econ2': case 'econ3': case 'econ4': case 'econ5':
      return { turnAdvances: true };

    // ---------- Catch-all: 6-strength cards and ongoing-only abilities shouldn't reach here ----------
    default:
      pushLog(state, { kind: 'deploy', playerId: myId, cardId: card.id, theaterIdx: placedTheaterIdx });
      return { turnAdvances: true };
  }
}

// ---------- Helpers for "is there a legal target?" ----------

/** Is there at least one flippable target?
 *  Flippable = top-of-stack on either side. Uncovered only — Ambush is "any
 *  uncovered card in any theater"; we treat top-of-stack as the only flippable
 *  position. */
function hasFlipTarget(
  state: AlsState,
  requireAdjacent: boolean,
  sourceTheaterIdx: number,
): boolean {
  const range = requireAdjacent
    ? [sourceTheaterIdx - 1, sourceTheaterIdx + 1].filter(
        (i) => i >= 0 && i < state.config.theaters.length,
      )
    : Array.from({ length: state.config.theaters.length }, (_, i) => i);
  for (const t of range) {
    for (const side of [0, 1] as const) {
      const stack = state.playedCards[t][side];
      if (stack.length === 0) continue;
      // Top card is the source itself? Skip — Maneuver/Ambush per rulebook
      // affect "another" card, but the FAQ says you CAN flip your own; the
      // source card is the only thing on its theater here if it just landed.
      // We allow it.
      return true;
    }
  }
  return false;
}

function hasFlipTargetForSide(state: AlsState, sideIdx: 0 | 1): boolean {
  for (let t = 0; t < state.playedCards.length; t++) {
    if (state.playedCards[t][sideIdx].length > 0) return true;
  }
  return false;
}

function hasOwnPlacedCard(state: AlsState, sideIdx: 0 | 1): boolean {
  for (let t = 0; t < state.playedCards.length; t++) {
    if (state.playedCards[t][sideIdx].length > 0) return true;
  }
  return false;
}

function hasOwnFaceDownCard(state: AlsState, sideIdx: 0 | 1): boolean {
  for (let t = 0; t < state.playedCards.length; t++) {
    for (const placed of state.playedCards[t][sideIdx]) {
      if (placed.faceDown) return true;
    }
  }
  return false;
}

// ---------- Containment & Blockade enforcement (called by reducer post-placement) ----------

/** If Containment is in play anywhere on the board, the just-played face-down
 *  card is immediately discarded. Returns true if discarded. */
export function applyContainmentIfActive(
  state: AlsState,
  placedTheaterIdx: number,
  sideIdx: 0 | 1,
  placedCardId: number,
): boolean {
  // Already imported in callers; lookup inline for less coupling here.
  let active = false;
  outer: for (let t = 0; t < state.config.theaters.length; t++) {
    for (const side of [0, 1] as const) {
      const stack = state.playedCards[t][side];
      for (const placed of stack) {
        if (placed.faceDown) continue;
        const tpl = state.deckPool[placed.cardId];
        if (tpl?.ability === 'containment') {
          active = true;
          break outer;
        }
      }
    }
  }
  if (!active) return false;
  // Remove the just-placed card from its theater, move to discard.
  const stack = state.playedCards[placedTheaterIdx][sideIdx];
  const idx = stack.findIndex((p) => p.cardId === placedCardId);
  if (idx !== -1) {
    stack.splice(idx, 1);
    state.discard.push(placedCardId);
    pushLog(state, { kind: 'containment', playerId: state.players[sideIdx].id, cardId: placedCardId, theaterIdx: placedTheaterIdx });
  }
  return true;
}

/** Blockade: if opponent has Blockade face-up on an adjacent theater AND the
 *  just-played card brings the OPPONENT-of-blockader (i.e. the just-played
 *  player) to 3+ cards on the theater they played into, discard the new card.
 *
 *  Per rulebook + BGG FAQ: Blockade affects newly-played cards, NOT moved
 *  cards (so Transport does not trigger it). The card moves to discard. */
export function applyBlockadeIfActive(
  state: AlsState,
  placedTheaterIdx: number,
  placerSideIdx: 0 | 1,
  placedCardId: number,
): boolean {
  const blockadeSide: 0 | 1 = placerSideIdx === 0 ? 1 : 0;
  // Look at theaters adjacent to placedTheaterIdx, on the BLOCKADER's side.
  const neighborIndices = [placedTheaterIdx - 1, placedTheaterIdx + 1].filter(
    (i) => i >= 0 && i < state.config.theaters.length,
  );
  let blockaded = false;
  for (const nIdx of neighborIndices) {
    const stack = state.playedCards[nIdx][blockadeSide];
    for (const placed of stack) {
      if (placed.faceDown) continue;
      const tpl = state.deckPool[placed.cardId];
      if (tpl?.ability === 'blockade') {
        // Trigger if placer now has 3+ cards in placedTheaterIdx.
        if (state.playedCards[placedTheaterIdx][placerSideIdx].length >= 3) {
          blockaded = true;
        }
        break;
      }
    }
    if (blockaded) break;
  }
  if (!blockaded) return false;
  const stack = state.playedCards[placedTheaterIdx][placerSideIdx];
  const idx = stack.findIndex((p) => p.cardId === placedCardId);
  if (idx !== -1) {
    stack.splice(idx, 1);
    state.discard.push(placedCardId);
    pushLog(state, { kind: 'blockade', playerId: state.players[placerSideIdx].id, cardId: placedCardId, theaterIdx: placedTheaterIdx });
  }
  return true;
}

/** Util re-exposed for reducer. */
export function findOwnPlaced(
  state: AlsState,
  sideIdx: 0 | 1,
  cardId: number,
): { theaterIdx: number; slotIdx: number; placed: AlsPlacedCard } | null {
  for (let t = 0; t < state.playedCards.length; t++) {
    const stack = state.playedCards[t][sideIdx];
    const slotIdx = stack.findIndex((p) => p.cardId === cardId);
    if (slotIdx !== -1) {
      return { theaterIdx: t, slotIdx, placed: stack[slotIdx] };
    }
  }
  return null;
}
