// 7 Wonders Duel — the three card structures.
//
// Rows run from the back of the table (row 0, taken last) to the front (the
// last row, accessible from the start). Rows alternate face up / face down,
// the back and front rows face up. Each card sits half a card across from the
// cards it overlaps: a card at (row r, x) is covered by the cards of row r + 1
// at x − 1 and x + 1 (x counts half-card steps from the centre line), and
// becomes accessible — turning face up if it was down — once they are gone.
//
//   Age I   2 · 3 · 4 · 5 · 6          a pyramid: 6 cards to choose from first
//   Age II  6 · 5 · 4 · 3 · 2          upside down: only 2 at first
//   Age III 2 · 3 · 4 · 2 · 4 · 3 · 2  two pyramids joined by a split middle row
//                                      (its two cards over the outer pairs)
//
// Agora's Senators make the structures 25 / 25 / 23 cards: a card more per
// row (3…7, 7…3) and Age III a full diamond 2 · 3 · 4 · 5 · 4 · 3 · 2.

import type { DuelAge, DuelPyramidSlot } from './types';

/** Half-card x positions of a centred row of `n` cards. */
const centred = (n: number): number[] => Array.from({ length: n }, (_, i) => 2 * i - (n - 1));

const LAYOUTS: Record<DuelAge, number[][]> = {
  1: [2, 3, 4, 5, 6].map(centred),
  2: [6, 5, 4, 3, 2].map(centred),
  3: [centred(2), centred(3), centred(4), [-2, 2], centred(4), centred(3), centred(2)],
};

/** Agora's bigger structures (its Senators make 25 / 25 / 23 cards): a row
 *  longer each, and Age III a full diamond (no split middle row). */
const AGORA_LAYOUTS: Record<DuelAge, number[][]> = {
  1: [3, 4, 5, 6, 7].map(centred),
  2: [7, 6, 5, 4, 3].map(centred),
  3: [2, 3, 4, 5, 4, 3, 2].map(centred),
};

interface SlotDef { row: number; x: number; faceUp: boolean; coveredBy: number[] }

function skeleton(rows: number[][]): SlotDef[] {
  const slots: SlotDef[] = [];
  rows.forEach((xs, row) => xs.forEach((x) => slots.push({ row, x, faceUp: row % 2 === 0, coveredBy: [] })));
  for (const s of slots) {
    s.coveredBy = slots
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => o.row === s.row + 1 && Math.abs(o.x - s.x) === 1)
      .map(({ i }) => i);
  }
  return slots;
}

const SKELETONS: Record<DuelAge, SlotDef[]> = { 1: skeleton(LAYOUTS[1]), 2: skeleton(LAYOUTS[2]), 3: skeleton(LAYOUTS[3]) };
const AGORA_SKELETONS: Record<DuelAge, SlotDef[]> = {
  1: skeleton(AGORA_LAYOUTS[1]), 2: skeleton(AGORA_LAYOUTS[2]), 3: skeleton(AGORA_LAYOUTS[3]),
};

/** Number of cards an age's structure holds (20 for every age; 25 / 25 / 23 with Agora). */
export function pyramidSize(age: DuelAge, agora = false): number {
  return (agora ? AGORA_SKELETONS : SKELETONS)[age].length;
}

/** Deal `cardIds` (in order) into an age's structure. */
export function buildPyramid(age: DuelAge, cardIds: readonly number[], agora = false): DuelPyramidSlot[] {
  const sk = (agora ? AGORA_SKELETONS : SKELETONS)[age];
  if (cardIds.length !== sk.length) throw new Error(`Age ${age} needs ${sk.length} cards, got ${cardIds.length}.`);
  return sk.map((s, i) => ({
    index: i,
    cardId: cardIds[i],
    faceUp: s.faceUp,
    taken: false,
    coveredBy: s.coveredBy.slice(),
    row: s.row,
    x: s.x,
  }));
}

/** A slot can be taken when it is still there and nothing covers it. */
export function isSlotAvailable(slot: DuelPyramidSlot, pyramid: readonly DuelPyramidSlot[]): boolean {
  return !slot.taken && slot.coveredBy.every((c) => pyramid[c].taken);
}

/** Slots that can be taken right now. */
export function availableSlots(pyramid: readonly DuelPyramidSlot[]): DuelPyramidSlot[] {
  return pyramid.filter((s) => isSlotAvailable(s, pyramid));
}

/** Turn up every face-down card that nothing covers any more; returns them. */
export function flipUncovered(pyramid: DuelPyramidSlot[]): DuelPyramidSlot[] {
  const flipped: DuelPyramidSlot[] = [];
  for (const s of pyramid) {
    if (!s.faceUp && isSlotAvailable(s, pyramid)) {
      s.faceUp = true;
      flipped.push(s);
    }
  }
  return flipped;
}

/** Slots that taking `slot` would make accessible (they may be face down). */
export function wouldUncover(slot: DuelPyramidSlot, pyramid: readonly DuelPyramidSlot[]): DuelPyramidSlot[] {
  return pyramid.filter((s) => !s.taken && s.coveredBy.includes(slot.index)
    && s.coveredBy.every((c) => c === slot.index || pyramid[c].taken));
}

/** The age is over when every card has been taken. */
export function isPyramidEmpty(pyramid: readonly DuelPyramidSlot[]): boolean {
  return pyramid.every((s) => s.taken);
}
