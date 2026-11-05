// Air, Land & Sea reducer.
//
// Turn flow: in `subPhase: 'action'` the turn player (`turnSeatIdx`) deploys,
// improvises or withdraws. A play queues whatever it sets off (abilities.ts);
// `drain` then resolves the queue, stopping whenever an ability asks a player
// something (`subPhase: 'resolving'`, `activePlayerId` = the chooser) and
// resuming on that player's `answer`. Once nothing is left the turn ends: the
// battle ends if both hands are empty, otherwise the other player moves (a
// player with no cards left while the opponent still has some is skipped).
//
// Battle end → `battleEnd` (activePlayerId parked on the 1st player so the AI
// driver can click through) → `continueBattle` rotates the theater row one
// step (rightmost to the left end), swaps the Supreme Commanders and deals.
//
// Randomness: the deck, the first battle's theater order and 1st player all
// come from `state.rngState` when a battle is dealt; actions carry none.

import type { PlayerId } from '@/core/types';
import { rngInt, shuffle } from '@/core/rng';
import type { AlsAction, AlsBattleResult, AlsPlayer, AlsState } from './types';
import { cardIdsForTheaters, handSizeFor } from './cards';
import {
  battleWinner, fullBattleVp, otherSeat, theaterControl, theaterStrength, vpForWithdraw,
} from './rules';
import { answerPending, performPlay, pushLog, runFrame, startNextFrame } from './abilities';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export function seatIdxOf(state: AlsState, id: PlayerId): 0 | 1 {
  if (state.players[0].id === id) return 0;
  if (state.players[1].id === id) return 1;
  throw new Error(`unknown player ${id}`);
}

export function freshPlayer(id: PlayerId): AlsPlayer {
  return { id, hand: [], vp: 0, airDrop: false, known: [], neutralized: [] };
}

// ---------- Battle setup ----------

function dealBattle(state: AlsState): void {
  state.deck = shuffle(state.rngState, cardIdsForTheaters(state.theaters));
  state.board = state.theaters.map(() => [[], []]);
  state.supplies = state.theaters.map(() => [0, 0]);
  for (const p of state.players) {
    p.hand = [];
    p.airDrop = false;
    p.known = [];
    p.neutralized = [];
  }
  const handSize = handSizeFor(state.theaters.length);
  for (let i = 0; i < handSize; i++) {
    for (const seat of [state.firstPlayerSeatIdx, otherSeat(state.firstPlayerSeatIdx)]) {
      const id = state.deck.pop();
      if (id !== undefined) state.players[seat].hand.push(id);
    }
  }
  state.queue = [];
  state.frame = null;
  state.pending = null;
  state.turnSeatIdx = state.firstPlayerSeatIdx;
  state.activePlayerId = state.players[state.firstPlayerSeatIdx].id;
  state.subPhase = 'action';
  pushLog(state, { kind: 'battleStart', firstSeat: state.firstPlayerSeatIdx, theaters: state.theaters.slice() });
}

/** Start the match: theater row (shuffled unless `randomOrder === false`), a random 1st player, battle 1. */
export function setupNewMatch(state: AlsState): void {
  state.theaters = state.config.randomOrder === false
    ? state.config.theaters.slice()
    : shuffle(state.rngState, state.config.theaters);
  state.firstPlayerSeatIdx = rngInt(state.rngState, 2) as 0 | 1;
  state.battleNumber = 1;
  state.lastBattleResult = null;
  dealBattle(state);
}

function nextBattle(state: AlsState): void {
  const row = state.theaters.slice();
  row.unshift(row.pop()!);
  state.theaters = row;
  state.firstPlayerSeatIdx = otherSeat(state.firstPlayerSeatIdx);
  state.battleNumber += 1;
  state.lastBattleResult = null;
  dealBattle(state);
}

// ---------- Turn flow ----------

/** Resolve queued abilities until someone must decide or the turn is over. */
function drain(state: AlsState): void {
  for (let guard = 0; guard < 500; guard++) {
    if (state.subPhase === 'battleEnd' || state.subPhase === 'gameOver') return;
    if (state.pending) {
      state.subPhase = 'resolving';
      state.activePlayerId = state.players[state.pending.seat].id;
      return;
    }
    if (state.frame) { runFrame(state); continue; }
    if (startNextFrame(state)) continue;
    endTurn(state);
    return;
  }
  throw new Error('ability resolution did not settle');
}

function endTurn(state: AlsState): void {
  const [p0, p1] = state.players;
  if (p0.hand.length === 0 && p1.hand.length === 0) {
    finalizeBattle(state, null);
    return;
  }
  let next = otherSeat(state.turnSeatIdx);
  if (state.players[next].hand.length === 0) {
    pushLog(state, { kind: 'pass', seat: next });
    next = state.turnSeatIdx;
  }
  state.turnSeatIdx = next;
  state.activePlayerId = state.players[next].id;
  state.subPhase = 'action';
}

function finalizeBattle(state: AlsState, withdrawer: 0 | 1 | null): void {
  const strengths = state.board.map((_, t) => [theaterStrength(state, t, 0), theaterStrength(state, t, 1)] as [number, number]);
  const control = theaterControl(state);
  let winner: 0 | 1;
  let vp: number;
  let cardsLeft: number | null = null;
  if (withdrawer !== null) {
    winner = otherSeat(withdrawer);
    cardsLeft = state.players[withdrawer].hand.length;
    vp = vpForWithdraw(state, withdrawer, cardsLeft);
    pushLog(state, { kind: 'withdraw', seat: withdrawer, cardsLeft });
  } else {
    winner = battleWinner(state);
    vp = fullBattleVp(state);
  }
  state.players[winner].vp += vp;
  const result: AlsBattleResult = {
    battleNumber: state.battleNumber,
    endedBy: withdrawer !== null ? 'withdraw' : 'fullPlay',
    withdrawerSeatIdx: withdrawer,
    cardsLeft,
    winnerSeatIdx: winner,
    vpAwarded: vp,
    firstPlayerSeatIdx: state.firstPlayerSeatIdx,
    theaters: state.theaters.slice(),
    theaterControl: control,
    theaterStrengths: strengths,
  };
  state.lastBattleResult = result;
  state.queue = [];
  state.frame = null;
  state.pending = null;
  pushLog(state, { kind: 'battleEnd', result });

  if (state.players[winner].vp >= state.config.targetVp) {
    state.phase = 'gameOver';
    state.subPhase = 'gameOver';
    state.activePlayerId = null;
    state.finalScores = {
      [state.players[0].id]: state.players[0].vp,
      [state.players[1].id]: state.players[1].vp,
    };
    pushLog(state, { kind: 'matchEnd', winnerSeatIdx: winner });
    return;
  }
  state.subPhase = 'battleEnd';
  state.activePlayerId = state.players[state.firstPlayerSeatIdx].id;
}

// ---------- Reducer ----------

function requireTurn(state: AlsState, playerId: PlayerId): 0 | 1 {
  if (state.subPhase !== 'action') throw new Error('not the time for that');
  const seat = seatIdxOf(state, playerId);
  if (seat !== state.turnSeatIdx || state.activePlayerId !== playerId) throw new Error('not your turn');
  return seat;
}

export function applyAction(state: AlsState, action: AlsAction): AlsState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);
  switch (action.type) {
    case 'deploy':
    case 'improvise': {
      const seat = requireTurn(s, action.playerId);
      performPlay(s, seat, action.cardId, action.theaterIdx, action.type === 'improvise');
      drain(s);
      return s;
    }
    case 'withdraw': {
      const seat = requireTurn(s, action.playerId);
      finalizeBattle(s, seat);
      return s;
    }
    case 'answer': {
      if (s.subPhase !== 'resolving' || !s.pending) throw new Error('nothing to answer');
      answerPending(s, seatIdxOf(s, action.playerId), action.answer);
      drain(s);
      return s;
    }
    case 'continueBattle': {
      if (s.subPhase !== 'battleEnd') throw new Error('continueBattle: the battle is not over');
      nextBattle(s);
      return s;
    }
  }
}

export const _internals = { dealBattle, nextBattle, finalizeBattle, drain };
