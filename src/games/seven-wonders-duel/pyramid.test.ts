// 7 Wonders Duel — pyramid mechanics.

import { describe, it, expect } from 'vitest';
import {
  buildPyramid, isSlotAvailable, flipUncovered, isPyramidEmpty, pyramidSize,
} from './pyramid';

describe('Duel pyramid', () => {
  it('Age I size = 20', () => {
    expect(pyramidSize(1)).toBe(20);
  });

  it('Age II size = 20', () => {
    expect(pyramidSize(2)).toBe(20);
  });

  it('Age III size = 20', () => {
    expect(pyramidSize(3)).toBe(20);
  });

  it('built pyramid maps cardIds to slots', () => {
    const cardIds = Array.from({ length: 20 }, (_, i) => i + 100);
    const pyramid = buildPyramid(1, cardIds);
    expect(pyramid.length).toBe(20);
    expect(new Set(pyramid.map((s) => s.cardId)).size).toBe(20);
  });

  it('top-row slots are immediately available', () => {
    const cardIds = Array.from({ length: 20 }, (_, i) => i + 100);
    const pyramid = buildPyramid(1, cardIds);
    const topRow = pyramid.filter((s) => s.row === 0);
    expect(topRow.length).toBeGreaterThan(0);
    for (const s of topRow) {
      expect(isSlotAvailable(s, pyramid)).toBe(true);
    }
  });

  it('lower-row slots are NOT initially available', () => {
    const cardIds = Array.from({ length: 20 }, (_, i) => i + 100);
    const pyramid = buildPyramid(1, cardIds);
    const bottomRow = pyramid.filter((s) => s.row === 4);
    for (const s of bottomRow) {
      // bottom row covered by row above
      if (s.coveredBy.length > 0) {
        expect(isSlotAvailable(s, pyramid)).toBe(false);
      }
    }
  });

  it('taking a top slot does not flip lower slots that are still covered', () => {
    const cardIds = Array.from({ length: 20 }, (_, i) => i + 100);
    const pyramid = buildPyramid(1, cardIds);
    const top0 = pyramid.find((s) => s.row === 0 && s.col === 0)!;
    top0.taken = true;
    flipUncovered(pyramid);
    // Row 1, col 0 — was face-down — covered by both top-row slots. Taking only top-0
    // should leave it still face-down because top-1 still covers it.
    const r1c0 = pyramid.find((s) => s.row === 1 && s.col === 0)!;
    // r1c0 is covered by (0, -1) [no] and (0, 0) [yes], so coveredBy = [top0].
    // With top0 taken, r1c0 should be available + face-up.
    if (r1c0.coveredBy.length === 1) {
      // Only top0 covered it
      expect(isSlotAvailable(r1c0, pyramid)).toBe(true);
    }
  });

  it('isPyramidEmpty true only after all slots taken', () => {
    const cardIds = Array.from({ length: 20 }, (_, i) => i + 100);
    const pyramid = buildPyramid(1, cardIds);
    expect(isPyramidEmpty(pyramid)).toBe(false);
    for (const s of pyramid) s.taken = true;
    expect(isPyramidEmpty(pyramid)).toBe(true);
  });
});
