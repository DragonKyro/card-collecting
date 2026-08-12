import { describe, expect, it } from 'vitest';
import type { Seat } from '@/core/types';
import { boardCards } from './board';
import { engineFor, type SetModeId } from './modes';
import { applyAction, createInitialSetState } from './reducer';
import type { SetState } from './types';

const SEAT: Seat = { id: 'p1', name: 'You', color: '#e64a4a', isAI: false, isLocal: true };
const SEAT2: Seat = { id: 'p2', name: 'Friend', color: '#3a6ec9', isAI: false, isLocal: true };

function start(modeId: SetModeId, seats: Seat[] = [SEAT], seed = 1234): SetState {
  return createInitialSetState({ modeId, enableHints: true }, seed, seats);
}

/** Click through a group, one card per action. */
function claim(state: SetState, cards: readonly string[], by = 'p1', t0 = 1000): SetState {
  let next = state;
  cards.forEach((cardId, i) => {
    next = applyAction(next, { type: 'toggleCard', cardId, byPlayerId: by, atMs: t0 + i * 100 });
  });
  return next;
}

describe('setup', () => {
  it('deals the mode minimum and drops AI seats', () => {
    const state = start('normal', [SEAT, { ...SEAT2, id: 'bot', isAI: true }]);
    expect(state.seats.map((s) => s.id)).toEqual(['p1']);
    expect(state.boardSize).toBe(12);
    expect(state.deck).toHaveLength(81);
    expect(state.activePlayerId).toBeNull();
    expect(state.phase).toBe('playing');
  });

  it('falls back to the first seat when every seat is AI', () => {
    const state = start('normal', [{ ...SEAT, isAI: true }]);
    expect(state.seats).toHaveLength(1);
    expect(state.seats[0].isAI).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    expect(start('normal').deck).toEqual(start('normal').deck);
    expect(start('normal', [SEAT], 99).deck).not.toEqual(start('normal').deck);
  });
});

describe('claiming', () => {
  it('scores a valid set, takes the cards and refills the board', () => {
    const engine = engineFor('normal');
    let state = start('normal');
    const group = engine.findSet(boardCards(state.deck, state.boardSize))!;
    state = claim(state, group);
    expect(state.scores.p1).toBe(1);
    expect(state.deck).toHaveLength(78);
    expect(state.boardSize).toBe(12);
    expect(state.selection).toEqual([]);
    expect(state.lastResult?.kind).toBe('set');
    const entry = state.history.at(-1)!;
    expect(entry.kind).toBe('set');
    expect(entry.byPlayerId).toBe('p1');
    expect(entry.splitMs).toBe(200); // two clicks after the first stamped the start
    for (const card of group) expect(state.deck).not.toContain(card);
  });

  it('records a mistake and clears the selection on an invalid claim', () => {
    let state = start('normal');
    const engine = engineFor('normal');
    const board = boardCards(state.deck, state.boardSize);
    const bad = findNonSet(engine, board);
    state = claim(state, bad);
    expect(state.scores.p1).toBe(0);
    expect(state.mistakes.p1).toBe(1);
    expect(state.selection).toEqual([]);
    expect(state.lastResult?.kind).toBe('error');
    expect(state.lastResult?.message).toBe('Not a set');
    expect(state.deck).toHaveLength(81);
  });

  it('toggles a card off when clicked twice', () => {
    let state = start('normal');
    const card = state.deck[0];
    state = applyAction(state, { type: 'toggleCard', cardId: card, byPlayerId: 'p1', atMs: 1 });
    expect(state.selection).toEqual([card]);
    state = applyAction(state, { type: 'toggleCard', cardId: card, byPlayerId: 'p1', atMs: 2 });
    expect(state.selection).toEqual([]);
  });

  it('rejects cards that are not on the board', () => {
    const state = start('normal');
    const offBoard = state.deck[state.boardSize];
    expect(() => applyAction(state, {
      type: 'toggleCard', cardId: offBoard, byPlayerId: 'p1', atMs: 1,
    })).toThrow(/not on the board/);
  });

  it('credits the seat that claimed, in shared-screen play', () => {
    const engine = engineFor('normal');
    let state = start('normal', [SEAT, SEAT2]);
    const group = engine.findSet(boardCards(state.deck, state.boardSize))!;
    state = claim(state, group, 'p2');
    expect(state.scores).toEqual({ p1: 0, p2: 1 });
    expect(state.claimantId).toBe('p2');
  });

  it('resets a part-built selection when the claimant changes', () => {
    let state = start('normal', [SEAT, SEAT2]);
    state = applyAction(state, {
      type: 'toggleCard', cardId: state.deck[0], byPlayerId: 'p1', atMs: 1,
    });
    state = applyAction(state, { type: 'setClaimant', playerId: 'p2' });
    expect(state.selection).toEqual([]);
    expect(state.claimantId).toBe('p2');
  });
});

describe('chain modes', () => {
  it('requires exactly one card from the previous set', () => {
    const engine = engineFor('setchain');
    let state = start('setchain');
    const first = engine.findSet(boardCards(state.deck, state.boardSize))!;
    state = claim(state, first);
    expect(state.lastSet).toEqual(first);
    expect(state.scores.p1).toBe(1);

    // A set made only of fresh board cards is illegal while a chain is running.
    const board = boardCards(state.deck, state.boardSize);
    const freshOnly = engine.rule.findFirst(board);
    if (freshOnly) {
      const rejected = claim(state, freshOnly, 'p1', 5000);
      expect(rejected.scores.p1).toBe(1);
      expect(rejected.lastResult?.message).toMatch(/previous set/);
    }

    // A chain-legal group scores.
    const chained = engine.findSet(board, state.lastSet)!;
    expect(chained.filter((c) => state.lastSet.includes(c))).toHaveLength(1);
    const after = claim(state, chained, 'p1', 9000);
    expect(after.scores.p1).toBe(2);
    expect(after.lastSet).toEqual(chained);
  });

  it('rotates the reused card instead of over-filling the chain', () => {
    const engine = engineFor('setchain');
    let state = start('setchain');
    state = claim(state, engine.findSet(boardCards(state.deck, state.boardSize))!);
    const [a, b] = state.lastSet;
    state = applyAction(state, { type: 'toggleCard', cardId: a, byPlayerId: 'p1', atMs: 5000 });
    state = applyAction(state, { type: 'toggleCard', cardId: b, byPlayerId: 'p1', atMs: 5100 });
    expect(state.selection).toEqual([b]);
  });
});

describe('puzzle modes', () => {
  it('holds the board until every set on it has been found', () => {
    const engine = engineFor('puzzle');
    let state = start('puzzle');
    const deckBefore = state.deck.slice();
    const first = engine.findSet(boardCards(state.deck, state.boardSize))!;
    state = claim(state, first);
    expect(state.scores.p1).toBe(1);
    expect(state.foundKeys).toHaveLength(1);
    expect(state.deck).toEqual(deckBefore); // board untouched

    // Re-claiming the same set is rejected.
    const again = claim(state, first, 'p1', 4000);
    expect(again.scores.p1).toBe(1);
    expect(again.lastResult?.message).toMatch(/already found/);

    // Clear the rest of the board and it flips wholesale.
    let guard = 0;
    while (state.phase === 'playing' && guard++ < 100) {
      const next = engine.findSet(
        boardCards(state.deck, state.boardSize), [], state.foundKeys,
      );
      if (!next) break;
      state = claim(state, next, 'p1', 10000 + guard * 1000);
      if (state.foundKeys.length === 0) break; // board flipped
    }
    expect(state.history.some((h) => h.kind === 'boardDone')).toBe(true);
    expect(state.deck.length).toBeLessThan(81);
  });
});

describe('memory mode', () => {
  it('keeps a failed reveal on screen and refuses to un-see a card', () => {
    let state = start('memory');
    expect(state.boardSize).toBe(21);
    const engine = engineFor('memory');
    const bad = findNonSet(engine, boardCards(state.deck, state.boardSize));
    state = applyAction(state, { type: 'toggleCard', cardId: bad[0], byPlayerId: 'p1', atMs: 1 });
    state = applyAction(state, { type: 'toggleCard', cardId: bad[0], byPlayerId: 'p1', atMs: 2 });
    expect(state.selection).toEqual([bad[0]]); // no take-backs
    state = claim(state, bad.slice(1), 'p1', 10);
    expect(state.lastResult?.kind).toBe('error');
    expect(state.selection).toHaveLength(3); // still revealed
    // The next click starts a fresh reveal.
    state = applyAction(state, {
      type: 'toggleCard', cardId: state.deck[20], byPlayerId: 'p1', atMs: 500,
    });
    expect(state.selection).toEqual([state.deck[20]]);
  });
});

describe('hints, clearing and quitting', () => {
  it('reveals one more card of a real group per hint', () => {
    let state = start('normal');
    state = applyAction(state, { type: 'addHint', atMs: 500 });
    expect(state.hintCards).toHaveLength(1);
    state = applyAction(state, { type: 'addHint', atMs: 600 });
    expect(state.hintCards).toHaveLength(2);
    expect(state.hintsUsed).toBe(2);
    const engine = engineFor('normal');
    const completed = [...state.hintCards, engine.space.completion(state.hintCards)];
    expect(engine.rule.isValid(completed)).toBe(true);
  });

  it('refuses hints when practice mode is off', () => {
    const state = createInitialSetState({ modeId: 'normal', enableHints: false }, 1, [SEAT]);
    expect(() => applyAction(state, { type: 'addHint', atMs: 1 })).toThrow(/hints are disabled/);
  });

  it('clears selection and hint highlight', () => {
    let state = start('normal');
    state = applyAction(state, { type: 'addHint', atMs: 1 });
    state = applyAction(state, {
      type: 'toggleCard', cardId: state.deck[0], byPlayerId: 'p1', atMs: 2,
    });
    state = applyAction(state, { type: 'clearSelection', atMs: 3 });
    expect(state.selection).toEqual([]);
    expect(state.hintCards).toEqual([]);
  });

  it('ends the match on quit and freezes further actions', () => {
    let state = start('normal');
    state = applyAction(state, { type: 'quit', atMs: 10 });
    expect(state.phase).toBe('gameOver');
    expect(state.finalScores).toEqual({ p1: 0 });
    expect(() => applyAction(state, {
      type: 'toggleCard', cardId: state.deck[0], byPlayerId: 'p1', atMs: 11,
    })).toThrow(/match is over/);
  });
});

/** Three board cards that are deliberately not a set. */
function findNonSet(engine: ReturnType<typeof engineFor>, board: readonly string[]): string[] {
  for (let i = 0; i < board.length; i++) {
    for (let j = i + 1; j < board.length; j++) {
      for (let k = j + 1; k < board.length; k++) {
        const trio = [board[i], board[j], board[k]];
        if (!engine.rule.isValid(trio)) return trio;
      }
    }
  }
  throw new Error('board is all sets — impossible');
}
