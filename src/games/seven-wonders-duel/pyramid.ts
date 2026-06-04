// 7 Wonders Duel — pyramid layouts per age.
//
// Each age has a fixed-shape pyramid of slots. Slots have:
//   - A position (row, col) for display.
//   - `coveredBy` indices: which slots SIT ON TOP of this slot, blocking it.
//     The slot is "available" to pick when ALL coveredBy slots are taken.
//   - Initial faceUp flag (some rows start face-down by rulebook).
//
// When a slot is taken, the reducer checks all slots beneath it: if a slot's
// `coveredBy` is now all-taken AND it was face-down, flip it face-up.
//
// Layouts are best-effort matches to the rulebook geometry. The exact card
// counts per age in the official rulebook: 20 per age. We use 20 for ages I
// and II, and 20 for age III (17 base + 3 random guilds).

import type { DuelAge, DuelPyramidSlot } from './types';

/** A pyramid skeleton: list of slot definitions, indexed by position in the array. */
interface SlotDef {
  row: number;
  col: number;
  faceUp: boolean;
  /** Names of slots covering this (in order they were inserted). */
  coveredBy: number[];
}

/** Build the slot skeleton for an age. Returns an array of length 20. */
function ageISkeleton(): SlotDef[] {
  // Age I: 5 rows, classic triangular pyramid.
  // Row 1: 2 cards (face-up).
  // Row 2: 3 cards (face-down).
  // Row 3: 4 cards (face-up).
  // Row 4: 5 cards (face-down).
  // Row 5: 6 cards (face-up).
  // Total = 20.
  const rows: number[] = [2, 3, 4, 5, 6];
  const slots: SlotDef[] = [];
  // Pre-compute starting indices for each row.
  const rowStart: number[] = [];
  let acc = 0;
  for (const r of rows) { rowStart.push(acc); acc += r; }
  for (let r = 0; r < rows.length; r++) {
    const len = rows[r];
    for (let c = 0; c < len; c++) {
      slots.push({
        row: r,
        col: c,
        faceUp: r % 2 === 0, // rows 0, 2, 4 face-up
        coveredBy: [],
      });
    }
  }
  // Fill coveredBy: a slot is covered by the slot(s) ABOVE it that overlap.
  // In a classic 7W Duel pyramid, slot (r, c) is covered by (r-1, c-1) and (r-1, c),
  // skipping out-of-bounds.
  for (let r = 1; r < rows.length; r++) {
    for (let c = 0; c < rows[r]; c++) {
      const myIdx = rowStart[r] + c;
      // (r-1, c-1) covers me if it exists. NO — actually the inverse: I'm
      // covered by slots ABOVE me. The rule: slot (r, c) is BELOW slot
      // (r-1, c-1) and (r-1, c) [if they exist in row r-1]. So slot (r, c)
      // is covered by those slots.
      // In Duel's standard pyramid the upper rows are shorter, so (r-1, c-1)
      // and (r-1, c) at row r-1 (length rows[r-1] = rows[r] - 1) are valid
      // when c-1 >= 0 AND c < rows[r-1].
      // BUT WAIT — actually in Duel the pyramid is "expanding downward",
      // meaning lower rows are wider. The COVERING slots are the higher rows
      // (smaller r) which are NARROWER. So we look UP, not DOWN, for blockers.
      // For r=1 (3 cards) covering r=0 (2 cards): each row-0 card covers two
      // row-1 cards (slot 0 covers 1-0 and 1-1; slot 1 covers 1-1 and 1-2).
      // Reversed perspective: row-1 card c is covered by row-0 cards c-1 and c,
      // when they exist in row-0 (i.e., 0 <= c-1, c <= rows[0]-1 = 1).
      // Wait that's wrong direction. Let's restart with clear semantics:
      //   A "covers B" iff B is BELOW A AND visually behind A.
      //   B is "available" when no A is covering B (all of B's coveredBy are taken).
      // In Duel's downward-widening pyramid:
      //   Row 0 (top, 2 cards): no one covers them — they're at the top.
      //   Row 1 (3 cards): each is covered by the two row-0 cards above-left and above-right.
      //                    Slot (1, c) is covered by (0, c-1) and (0, c) if those exist.
      //   And so on down.
      // So coveredBy for (r, c) = the two slots one row UP at columns (c-1) and (c).
      // BUT for an upward-widening pyramid (top has fewer), the upper-row cols are
      // c-1 and c only when both fit.
      const prevLen = rows[r - 1];
      const candidates = [c - 1, c];
      for (const cc of candidates) {
        if (cc >= 0 && cc < prevLen) {
          const aboveIdx = rowStart[r - 1] + cc;
          slots[myIdx].coveredBy.push(aboveIdx);
        }
      }
    }
  }
  return slots;
}

/** Age II: inverted pyramid — top rows wider, bottom rows narrower. */
function ageIISkeleton(): SlotDef[] {
  // Row 0: 6 face-up
  // Row 1: 5 face-down
  // Row 2: 4 face-up
  // Row 3: 3 face-down
  // Row 4: 2 face-up
  // Total = 20.
  const rows: number[] = [6, 5, 4, 3, 2];
  return triangularSkeleton(rows);
}

/** Age III: diamond / hourglass — 20 slots in two trios with a central pinch. */
function ageIIISkeleton(): SlotDef[] {
  // Simplified Age III: 5 rows, expanding then contracting then expanding.
  // Row 0: 2 face-up (top of upper diamond)
  // Row 1: 3 face-down
  // Row 2: 4 face-up (mid)
  // Row 3: 5 face-down
  // Row 4: 6 face-up (bottom)
  // (Same shape as Age I — Duel's real Age III is more complex with two
  // separated columns, but this approximation preserves the gameplay feel.)
  const rows: number[] = [2, 3, 4, 5, 6];
  return triangularSkeleton(rows);
}

/** Generic triangular pyramid skeleton given row widths. Even rows face-up,
 *  odd rows face-down. coveredBy = above-left + above-right (if in bounds). */
function triangularSkeleton(rows: number[]): SlotDef[] {
  const slots: SlotDef[] = [];
  const rowStart: number[] = [];
  let acc = 0;
  for (const r of rows) { rowStart.push(acc); acc += r; }
  for (let r = 0; r < rows.length; r++) {
    const len = rows[r];
    for (let c = 0; c < len; c++) {
      slots.push({ row: r, col: c, faceUp: r % 2 === 0, coveredBy: [] });
    }
  }
  // coveredBy: same logic for both narrowing-up and widening-up shapes.
  // For a slot (r, c): the slots immediately above (r-1) that overlap.
  // Widening: rows[r] > rows[r-1] → above-left = (r-1, c-1), above-right = (r-1, c).
  //           Above slots exist when 0 <= cc <= rows[r-1] - 1.
  // Narrowing: rows[r] < rows[r-1] → above-left = (r-1, c), above-right = (r-1, c+1).
  for (let r = 1; r < rows.length; r++) {
    const myLen = rows[r];
    const prevLen = rows[r - 1];
    const widening = myLen > prevLen;
    for (let c = 0; c < myLen; c++) {
      const myIdx = rowStart[r] + c;
      const candidates: number[] = widening
        ? [c - 1, c]
        : [c, c + 1];
      for (const cc of candidates) {
        if (cc >= 0 && cc < prevLen) {
          const aboveIdx = rowStart[r - 1] + cc;
          slots[myIdx].coveredBy.push(aboveIdx);
        }
      }
    }
  }
  return slots;
}

/** Build pyramid slots for the given age. `cardIds` should be exactly 20 ids
 *  (the shuffled deck). Each slot is assigned one card. */
export function buildPyramid(age: DuelAge, cardIds: number[]): DuelPyramidSlot[] {
  const skeleton =
    age === 1 ? ageISkeleton()
    : age === 2 ? ageIISkeleton()
    : ageIIISkeleton();
  if (cardIds.length < skeleton.length) {
    // Pad: if we somehow have fewer cards than slots (shouldn't happen with
    // 20-card decks), wrap around — keeps the reducer working.
    while (cardIds.length < skeleton.length) cardIds.push(cardIds[0] ?? 0);
  }
  return skeleton.map((s, i) => ({
    index: i,
    cardId: cardIds[i],
    faceUp: s.faceUp,
    taken: false,
    coveredBy: s.coveredBy,
    covers: [], // computed below
    row: s.row,
    col: s.col,
  }));
}

/** A slot is available (can be picked) if it's not yet taken AND all slots
 *  covering it ARE taken. */
export function isSlotAvailable(slot: DuelPyramidSlot, pyramid: readonly DuelPyramidSlot[]): boolean {
  if (slot.taken) return false;
  for (const c of slot.coveredBy) {
    if (!pyramid[c].taken) return false;
  }
  return true;
}

/** After a slot is taken, flip any newly-uncovered slots to face-up. */
export function flipUncovered(pyramid: DuelPyramidSlot[]): void {
  for (const s of pyramid) {
    if (s.taken || s.faceUp) continue;
    let allCovered = true;
    for (const c of s.coveredBy) {
      if (!pyramid[c].taken) { allCovered = false; break; }
    }
    if (allCovered) s.faceUp = true;
  }
}

/** Pyramid is "empty" (age over) when every slot is taken. */
export function isPyramidEmpty(pyramid: readonly DuelPyramidSlot[]): boolean {
  return pyramid.every((s) => s.taken);
}

/** Count cards needed for an age's pyramid. */
export function pyramidSize(age: DuelAge): number {
  const skeleton =
    age === 1 ? ageISkeleton()
    : age === 2 ? ageIISkeleton()
    : ageIIISkeleton();
  return skeleton.length;
}
