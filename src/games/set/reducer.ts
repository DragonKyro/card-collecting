// Set reducer.
//
// Flow (there is no turn order — Set is real-time):
//   toggleCard × n  → selection grows. When it reaches the rule's size the
//                     reducer resolves it immediately:
//                       valid   → score, take the cards, refill, record a split
//                       invalid → mistake recorded, selection cleared (Memory
//                                 keeps the reveal until the next click)
//   clearSelection  → drop the selection and any hint highlight
//   setClaimant     → shared-screen play: who gets credit for the next group
//   addHint         → practice mode only; reveals one more card of a real group
//   quit            → end the match early
//
// Mode twists all land in this one path:
//   chain   the previous group stays on screen and must supply exactly
//           `spec.chain` of the cards (ModeEngine.validate enforces it)
//   puzzle  the board holds until every group on it has been found, then flips
//           wholesale and `foundKeys` resets
//   shuffle the board is reshuffled (from state.rngState) before the take
//   memory  purely a rendering difference; the state machine is unchanged
//
// Determinism: the deck is shuffled once from `state.rngState` at setup, and
// Shuffle mode's reshuffles advance the same generator. Wall-clock time arrives
// in the action payload, never from `Date.now()`.

import type { PlayerId, Seat } from '@/core/types';
import { createRng, shuffle } from '@/core/rng';
import { cardGroupKey, type CardId } from './cards';
import { boardCards, findBoardSize, removeFromBoard, shufflePrefix } from './board';
import { engineFor, type ModeEngine } from './modes';
import type { SetAction, SetConfig, SetHistoryEntry, SetState } from './types';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/** Seats that actually play: Set has no AI, so AI seats are dropped (the lobby
 *  hands us one by default). Falls back to the first seat if they all are. */
export function playingSeats(seats: readonly Seat[]): Seat[] {
  const humans = seats.filter((s) => !s.isAI);
  if (humans.length > 0) return humans.map((s) => ({ ...s }));
  if (seats.length > 0) return [{ ...seats[0], isAI: false }];
  return [{ id: 'p1', name: 'Player 1', color: '#6aa0ff', isAI: false, isLocal: true }];
}

export function createInitialSetState(config: SetConfig, seed: number, seats: readonly Seat[]): SetState {
  const engine = engineFor(config.modeId);
  const rngState = createRng(seed);
  const players = playingSeats(seats);
  const deck = shuffle(rngState, engine.freshDeck());
  const boardSize = findBoardSize(engine, deck, engine.spec.minBoardSize);
  const scores: Record<PlayerId, number> = {};
  const mistakes: Record<PlayerId, number> = {};
  for (const s of players) { scores[s.id] = 0; mistakes[s.id] = 0; }
  return {
    phase: 'playing',
    seats: players,
    activePlayerId: null,
    finalScores: null,
    rngState,
    config,
    deck,
    boardSize,
    selection: [],
    claimantId: players[0].id,
    lastSet: [],
    foundKeys: [],
    scores,
    mistakes,
    history: [],
    hintCards: [],
    hintsUsed: 0,
    startedAtMs: null,
    lastEventAtMs: null,
    lastResult: null,
  };
}

export function applyAction(state: SetState, action: SetAction): SetState {
  switch (action.type) {
    case 'toggleCard': return handleToggleCard(state, action);
    case 'clearSelection': return handleClearSelection(state);
    case 'setClaimant': return handleSetClaimant(state, action.playerId);
    case 'addHint': return handleAddHint(state, action.atMs);
    case 'quit': return handleQuit(state);
    default: {
      const never: never = action;
      throw new Error(`unknown Set action: ${JSON.stringify(never)}`);
    }
  }
}

// ----- actions -----

function handleToggleCard(
  state: SetState,
  action: { cardId: CardId; byPlayerId: PlayerId; atMs: number },
): SetState {
  requirePlaying(state);
  const engine = engineFor(state.config.modeId);
  const next = clone(state);
  stampStart(next, action.atMs);
  next.lastResult = null;

  // A completed-but-rejected selection is still on screen (Memory keeps the
  // reveal). The next click clears it first.
  if (next.selection.length >= engine.setSize) next.selection = [];

  const clickable = new Set([...boardCards(next.deck, next.boardSize), ...next.lastSet]);
  if (!clickable.has(action.cardId)) {
    throw new Error(`card ${action.cardId} is not on the board`);
  }
  if (!(action.byPlayerId in next.scores)) {
    throw new Error(`unknown player ${action.byPlayerId}`);
  }
  next.claimantId = action.byPlayerId;

  if (next.selection.includes(action.cardId)) {
    // Memory mode can't un-see a card, so deselection is a no-op there.
    if (engine.spec.faceDown) return next;
    next.selection = next.selection.filter((c) => c !== action.cardId);
    return next;
  }

  next.selection = [...next.selection, action.cardId];
  // Chain modes: never let the selection hold more than `chain` reused cards —
  // clicking another one rotates the oldest out instead of dooming the claim.
  if (engine.spec.chain && next.lastSet.length > 0) {
    const reused = next.selection.filter((c) => next.lastSet.includes(c));
    while (reused.length > engine.spec.chain) {
      const drop = reused.shift()!;
      next.selection = next.selection.filter((c) => c !== drop);
    }
  }
  if (next.selection.length < engine.setSize) return next;

  return resolveSelection(next, engine, action.atMs);
}

function handleClearSelection(state: SetState): SetState {
  const next = clone(state);
  next.selection = [];
  next.hintCards = [];
  next.lastResult = null;
  return next;
}

function handleSetClaimant(state: SetState, playerId: PlayerId): SetState {
  if (!(playerId in state.scores)) throw new Error(`unknown player ${playerId}`);
  if (state.claimantId === playerId) return state;
  const next = clone(state);
  next.claimantId = playerId;
  // Switching claimant mid-selection would credit the wrong seat, so reset.
  next.selection = [];
  return next;
}

function handleAddHint(state: SetState, atMs: number): SetState {
  requirePlaying(state);
  if (!state.config.enableHints) throw new Error('hints are disabled for this match');
  const engine = engineFor(state.config.modeId);
  const next = clone(state);
  stampStart(next, atMs);
  const group = engine.findSet(
    boardCards(next.deck, next.boardSize),
    next.lastSet,
    next.foundKeys,
  );
  if (!group) return next;
  const reveal = Math.min(next.hintCards.length + 1, group.length);
  next.hintCards = group.slice(0, reveal);
  next.hintsUsed += 1;
  return next;
}

function handleQuit(state: SetState): SetState {
  if (state.phase === 'gameOver') return state;
  const next = clone(state);
  endMatch(next);
  return next;
}

// ----- resolution -----

function resolveSelection(state: SetState, engine: ModeEngine, atMs: number): SetState {
  const verdict = engine.validate(state.selection, state.lastSet, state.foundKeys);
  if (!verdict.ok) {
    recordMistake(state, engine, verdict.message, atMs);
    return state;
  }
  const group = verdict.cards;
  const spec = engine.spec;
  // Captured before lastSet is overwritten — advanceBoard needs to know which of
  // the group's cards were reused (they are already out of the deck).
  const prevLastSet = state.lastSet.slice();

  state.scores[state.claimantId] = (state.scores[state.claimantId] ?? 0) + 1;
  pushHistory(state, {
    kind: 'set',
    byPlayerId: state.claimantId,
    cards: group.slice(),
    atMs,
    splitMs: splitFrom(state, atMs),
  });
  state.lastEventAtMs = atMs;
  state.lastResult = { kind: 'set', cards: group.slice(), message: 'Found!', atMs };
  state.selection = [];
  state.hintCards = [];
  if (spec.chain) state.lastSet = group.slice();

  advanceBoard(state, engine, group, prevLastSet, atMs);

  if (!engine.hasSet(boardCards(state.deck, state.boardSize), state.lastSet, state.foundKeys)) {
    endMatch(state);
  }
  return state;
}

function recordMistake(state: SetState, engine: ModeEngine, message: string, atMs: number): void {
  state.mistakes[state.claimantId] = (state.mistakes[state.claimantId] ?? 0) + 1;
  pushHistory(state, {
    kind: 'mistake',
    byPlayerId: state.claimantId,
    cards: state.selection.slice(),
    atMs,
    splitMs: splitFrom(state, atMs),
    message,
  });
  state.lastResult = { kind: 'error', cards: state.selection.slice(), message, atMs };
  // Memory mode leaves the three revealed cards up until the next click, so the
  // player can actually memorise them. Every other mode clears straight away.
  if (!engine.spec.faceDown) state.selection = [];
}

/** Take the group off the board and refill, honouring puzzle / shuffle. */
function advanceBoard(
  state: SetState,
  engine: ModeEngine,
  group: readonly CardId[],
  prevLastSet: readonly CardId[],
  atMs: number,
): void {
  const spec = engine.spec;
  const boardBefore = state.boardSize;
  let taken: CardId[] = spec.chain
    ? group.filter((c) => !prevLastSet.includes(c))
    : group.slice();

  if (spec.shuffle) {
    shufflePrefix(state.rngState, state.deck, state.boardSize);
  }

  if (spec.puzzle) {
    state.foundKeys = [...state.foundKeys, cardGroupKey(group)];
    const board = boardCards(state.deck, state.boardSize);
    if (engine.hasSet(board, state.lastSet, state.foundKeys)) {
      // More to find — the board stays exactly as it is.
      return;
    }
    // Board exhausted: flip the whole thing and start a fresh tally.
    pushHistory(state, {
      kind: 'boardDone',
      byPlayerId: null,
      cards: board,
      atMs,
      splitMs: 0,
      count: state.foundKeys.length,
    });
    state.foundKeys = [];
    taken = board;
  }

  removeFromBoard(state.deck, boardBefore, taken, spec.minBoardSize);
  const minSize = Math.max(boardBefore - taken.length, spec.minBoardSize);
  state.boardSize = findBoardSize(engine, state.deck, minSize, state.lastSet, state.foundKeys);
}

// ----- helpers -----

function requirePlaying(state: SetState): void {
  if (state.phase !== 'playing') throw new Error('match is over');
}

function stampStart(state: SetState, atMs: number): void {
  if (state.startedAtMs === null) {
    state.startedAtMs = atMs;
    state.lastEventAtMs = atMs;
  }
}

function splitFrom(state: SetState, atMs: number): number {
  const from = state.lastEventAtMs ?? state.startedAtMs ?? atMs;
  return Math.max(0, atMs - from);
}

function pushHistory(state: SetState, entry: SetHistoryEntry): void {
  state.history = [...state.history, entry];
}

function endMatch(state: SetState): void {
  state.phase = 'gameOver';
  state.finalScores = { ...state.scores };
  state.selection = [];
  state.hintCards = [];
}
