// Smoke sweep: play every mode from the opening deal to game over by repeatedly
// claiming whatever the engine's own search finds. The analogue of the other
// games' AI-vs-AI tests — it catches illegal claims, stalled state machines and
// board bookkeeping that drifts out of sync with the deck.

import { describe, expect, it } from 'vitest';
import type { Seat } from '@/core/types';
import { boardCards } from './board';
import { cardGroupKey } from './cards';
import { engineFor, SET_MODES } from './modes';
import { applyAction, createInitialSetState } from './reducer';
import type { SetState } from './types';

const SEAT: Seat = { id: 'p1', name: 'You', color: '#e64a4a', isAI: false, isLocal: true };

/** Play a whole match. Returns the final state and the number of claims made. */
function playOut(state: SetState, maxClaims: number): { state: SetState; claims: number } {
  const engine = engineFor(state.config.modeId);
  let claims = 0;
  let t = 1000;
  while (state.phase === 'playing') {
    const board = boardCards(state.deck, state.boardSize);
    const group = engine.findSet(board, state.lastSet, state.foundKeys);
    if (!group) {
      throw new Error(
        `mode ${state.config.modeId}: no group found but match still running ` +
        `(deck ${state.deck.length}, board ${state.boardSize})`,
      );
    }
    // Every card must be clickable: on the board, or reused from the chain.
    for (const card of group) {
      expect(board.includes(card) || state.lastSet.includes(card)).toBe(true);
    }
    const before = state.scores.p1;
    for (const card of group) {
      t += 50;
      state = applyAction(state, {
        type: 'toggleCard', cardId: card, byPlayerId: 'p1', atMs: t,
      });
    }
    expect(state.scores.p1).toBe(before + 1);
    expect(state.selection).toEqual([]);
    claims++;
    if (claims > maxClaims) throw new Error(`mode ${state.config.modeId}: runaway match`);
  }
  return { state, claims };
}

describe('every mode plays to completion', () => {
  for (const spec of SET_MODES) {
    it(`${spec.name} (${spec.id})`, () => {
      const state = createInitialSetState(
        { modeId: spec.id, enableHints: false }, 20260812, [SEAT],
      );
      const engine = engineFor(spec.id);

      // Opening deal.
      expect(state.deck).toHaveLength(engine.deckSize);
      expect(state.boardSize).toBeGreaterThanOrEqual(
        Math.min(spec.minBoardSize, engine.deckSize),
      );
      expect(engine.hasSet(boardCards(state.deck, state.boardSize))).toBe(true);

      const { state: final, claims } = playOut(state, engine.deckSize);

      expect(final.phase).toBe('gameOver');
      expect(claims).toBeGreaterThan(0);
      expect(final.finalScores).toEqual({ p1: claims });
      expect(final.mistakes.p1).toBe(0);

      // Every recorded find really is a legal group, and no card was ever
      // credited twice (chain reuse aside).
      const finds = final.history.filter((h) => h.kind === 'set');
      expect(finds).toHaveLength(claims);
      const seen = new Set<string>();
      for (const entry of finds) {
        expect(entry.cards).toHaveLength(engine.setSize);
        expect(engine.rule.isValid(entry.cards)).toBe(true);
        const key = cardGroupKey(entry.cards);
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }

      // Cards are conserved: taken cards + remaining deck = the full deck, with
      // chain modes reusing cards (so they are counted once) and puzzle modes
      // clearing whole boards.
      const takenCards = new Set(finds.flatMap((h) => h.cards));
      const remaining = new Set(final.deck);
      for (const card of remaining) expect(takenCards.has(card)).toBe(false);
      expect(remaining.size + takenCards.size).toBeLessThanOrEqual(engine.deckSize);
    });
  }
});

describe('mode shapes', () => {
  it('puzzle modes clear at least one board', () => {
    for (const spec of SET_MODES.filter((m) => m.puzzle)) {
      const state = createInitialSetState(
        { modeId: spec.id, enableHints: false }, 7, [SEAT],
      );
      const { state: final } = playOut(state, engineFor(spec.id).deckSize);
      expect(final.history.some((h) => h.kind === 'boardDone')).toBe(true);
    }
  });

  it('chain modes keep the previous group on screen', () => {
    for (const spec of SET_MODES.filter((m) => m.chain > 0)) {
      const state = createInitialSetState(
        { modeId: spec.id, enableHints: false }, 7, [SEAT],
      );
      const { state: final } = playOut(state, engineFor(spec.id).deckSize);
      expect(final.lastSet).toHaveLength(engineFor(spec.id).setSize);
      const finds = final.history.filter((h) => h.kind === 'set');
      for (let i = 1; i < finds.length; i++) {
        const reused = finds[i].cards.filter((c) => finds[i - 1].cards.includes(c));
        expect(reused).toHaveLength(spec.chain);
      }
    }
  });
});
