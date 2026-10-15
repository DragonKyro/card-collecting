// Board policy: how many cards are face up, and what happens to the layout when
// a group is taken.
//
// The board is a window on the remaining deck: `board = deck.slice(0, boardSize)`.
// One array, no separate "board" and "deck" lists to keep in sync, and dealing a
// replacement card is just closing the gap. Everything here is pure and takes its
// randomness from the caller's RngState, so peers reduce identically.

import { rngInt, type RngState } from '@/core/rng';
import type { CardId } from './cards';
import type { ModeEngine } from './modes';

/** Cards currently face up. */
export function boardCards(deck: readonly CardId[], boardSize: number): CardId[] {
  return deck.slice(0, boardSize);
}

/** Smallest board (>= `minSize`, aligned to whole rows of 3) that contains a
 *  legal group — or the entire remaining deck if none does. */
export function findBoardSize(
  engine: ModeEngine,
  deck: readonly CardId[],
  minSize: number,
  lastSet: readonly CardId[] = [],
  foundKeys: readonly string[] = [],
): number {
  let len = Math.min(deck.length, minSize);
  while (len < deck.length && !engine.hasSet(deck.slice(0, len), lastSet, foundKeys)) {
    // Grow to the next multiple of three so the 3-wide layout stays square.
    len += 3 - (len % 3);
  }
  return Math.min(len, deck.length);
}

/** Remove taken cards from `deck` (mutating), keeping the surviving cards in
 *  their on-screen positions wherever possible.
 *
 *  The first `cutoff` positions are the ones that must stay filled after the
 *  removal, so holes there are back-filled from the first cards beyond the
 *  cutoff; holes at or past the cutoff are simply spliced out and everything
 *  after them shifts up (which is invisible, because those positions are about
 *  to be off the board anyway). */
export function removeFromBoard(
  deck: CardId[],
  boardSize: number,
  taken: readonly CardId[],
  minBoardSize: number,
): void {
  if (taken.length === 0) return;
  // Descending, so splicing never invalidates an index we still need. Cards that
  // are no longer in the deck (chain modes reuse cards that were already taken)
  // simply don't leave a hole.
  const holes = taken
    .map((c) => deck.indexOf(c))
    .filter((i) => i >= 0)
    .sort((a, b) => b - a);
  if (holes.length === 0) return;
  if (holes.length >= boardSize) {
    // Whole board cleared (puzzle mode's board flip) — nothing to preserve.
    deck.splice(0, boardSize);
    return;
  }
  const cutoff = Math.min(deck.length - holes.length, minBoardSize);
  for (let i = 0; i < holes.length; i++) {
    const hole = holes[i];
    if (hole >= cutoff) {
      deck.splice(hole, 1);
      continue;
    }
    // This hole and every remaining one are inside the protected prefix. Pull
    // that many cards from just past the cutoff and drop them into the holes,
    // lowest index first.
    const fill = deck.splice(cutoff, holes.length - i);
    for (let j = 0; j < fill.length; j++) {
      deck[holes[holes.length - 1 - j]] = fill[j];
    }
    break;
  }
}

/** Fisher-Yates over the first `count` entries only (Shuffle mode reshuffles the
 *  board without disturbing the undealt deck order). */
export function shufflePrefix(rng: RngState, arr: CardId[], count: number): void {
  for (let i = Math.min(count, arr.length) - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
