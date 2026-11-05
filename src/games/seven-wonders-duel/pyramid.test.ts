// 7 Wonders Duel — the three card structures.

import { describe, it, expect } from 'vitest';
import type { DuelAge } from './types';
import { availableSlots, buildPyramid, flipUncovered, isPyramidEmpty, pyramidSize, wouldUncover } from './pyramid';

const ids = Array.from({ length: 20 }, (_, i) => 500 + i);
const rows = (age: DuelAge) => {
  const p = buildPyramid(age, ids);
  const out: number[] = [];
  for (const s of p) out[s.row] = (out[s.row] ?? 0) + 1;
  return out;
};

describe('Duel pyramid', () => {
  it('holds 20 cards in the printed rows', () => {
    for (const age of [1, 2, 3] as const) expect(pyramidSize(age)).toBe(20);
    expect(rows(1)).toEqual([2, 3, 4, 5, 6]);
    expect(rows(2)).toEqual([6, 5, 4, 3, 2]);
    expect(rows(3)).toEqual([2, 3, 4, 2, 4, 3, 2]);
  });

  it('opens with 6 cards in Age I and 2 in Ages II and III, all face up', () => {
    const open = (age: DuelAge) => availableSlots(buildPyramid(age, ids));
    expect(open(1)).toHaveLength(6);
    expect(open(2)).toHaveLength(2);
    expect(open(3)).toHaveLength(2);
    for (const age of [1, 2, 3] as const) for (const s of open(age)) expect(s.faceUp).toBe(true);
  });

  it('alternates face up and face down rows, back and front rows up', () => {
    for (const age of [1, 2, 3] as const) {
      const p = buildPyramid(age, ids);
      for (const s of p) expect(s.faceUp).toBe(s.row % 2 === 0);
    }
  });

  it('covers an edge card of the wide Age II back row with one card only', () => {
    const p = buildPyramid(2, ids);
    const back = p.filter((s) => s.row === 0).sort((a, b) => a.x - b.x);
    expect(back[0].coveredBy).toHaveLength(1);
    expect(back[2].coveredBy).toHaveLength(2);
  });

  it('splits the Age III middle row over the outer pairs', () => {
    const p = buildPyramid(3, ids);
    const middle = p.filter((s) => s.row === 3);
    expect(middle.map((s) => s.x)).toEqual([-2, 2]);
    // The inner cards of the row behind it are covered by one middle card each.
    const inner = p.filter((s) => s.row === 2 && Math.abs(s.x) === 1);
    for (const s of inner) expect(s.coveredBy).toHaveLength(1);
  });

  it('turns cards up as they become accessible, in any taking order', () => {
    for (const age of [1, 2, 3] as const) {
      const p = buildPyramid(age, ids);
      let guard = 0;
      while (!isPyramidEmpty(p) && guard++ < 40) {
        const open = availableSlots(p);
        for (const s of open) expect(s.faceUp).toBe(true);
        const pick = open[guard % open.length];
        const opened = wouldUncover(pick, p).map((s) => s.index);
        pick.taken = true;
        flipUncovered(p);
        const nowOpen = availableSlots(p).map((s) => s.index);
        for (const i of opened) expect(nowOpen).toContain(i);
      }
      expect(isPyramidEmpty(p)).toBe(true);
    }
  });
});
