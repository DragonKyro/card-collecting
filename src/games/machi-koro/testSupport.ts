// Test helpers: seat a match, skip the opening rounds, set cities, rig dice.

import { rngInt } from '@/core/rng';
import type { Seat } from '@/core/types';
import type { MkAction, MkEdition, MkMove, MkPlayer, MkState } from './types';
import { applyAction, createMatch, freshTurn } from './reducer';

export function seats(n: number, ai = false): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, color: '#888', isAI: ai, isLocal: !ai,
  }));
}

/** A fresh match with `first` as the first player, past any opening rounds. */
export function newMatch(edition: MkEdition, n: number, opts: { seed?: number; first?: number; promo?: boolean; keepSetup?: boolean } = {}): MkState {
  const state = createMatch({ edition, promoLandmarks: opts.promo ?? false }, opts.seed ?? 1, seats(n));
  if (opts.first !== undefined) {
    state.firstIdx = opts.first;
    state.currentIdx = opts.first;
    state.activePlayerId = state.players[opts.first].id;
  }
  if (!opts.keepSetup) {
    state.setupRound = 0;
    state.round = 1;
    state.subPhase = 'roll';
  }
  return state;
}

export function player(state: MkState, i: number): MkPlayer {
  return state.players[i];
}

/** Give player i exactly this city / coins / landmarks. */
export function setPlayer(state: MkState, i: number, patch: Partial<Omit<MkPlayer, 'id'>>): void {
  Object.assign(state.players[i], patch);
}

/** Make the active player's turn start fresh (as if it just began). */
export function startTurnFor(state: MkState, i: number): void {
  state.currentIdx = i;
  state.activePlayerId = state.players[i].id;
  state.subPhase = 'roll';
  state.turn = freshTurn();
}

/** Point the RNG at a seed whose next draws are exactly these die faces. */
export function rigDice(state: MkState, dice: number[]): void {
  for (let s = 0; ; s++) {
    const r = { seed: s };
    if (dice.every((d) => rngInt(r, 6) + 1 === d)) {
      state.rngState = { seed: s };
      return;
    }
  }
}

/** Roll these exact dice for the active player. */
export function roll(state: MkState, dice: number[]): MkState {
  rigDice(state, dice);
  return applyAction(state, { type: 'roll', playerId: state.activePlayerId!, dice: dice.length as 1 | 2 });
}

export function act(state: MkState, action: MkMove): MkState {
  return applyAction(state, { ...action, playerId: state.activePlayerId! } as MkAction);
}

/** Put a card into the market (front of the right row) so it can be bought. */
export function stock(state: MkState, row: 'low' | 'high' | 'landmark', cardId: string, count = 1): void {
  const slots = state.market[row].slots;
  const at = slots.findIndex((s) => s.cardId === cardId);
  if (at >= 0) slots[at].count = Math.max(slots[at].count, count);
  else slots.unshift({ cardId, count });
}
