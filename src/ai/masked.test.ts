import { describe, it, expect } from 'vitest';
import { countLegal, maskedArgmax, sampleLegal } from './masked';

describe('masked slot helpers', () => {
  const mask = [0, 1, 0, 1, 1];

  it('argmax ignores illegal slots, even when they score higher', () => {
    expect(maskedArgmax([9, 1, 9, 3, 2], mask)).toBe(3);
    expect(maskedArgmax([0, -5, 0, -1, -1], mask)).toBe(3);
    expect(maskedArgmax([1, 2], [0, 0])).toBe(-1);
  });

  it('samples only legal slots, covering each of them', () => {
    expect(countLegal(mask)).toBe(3);
    const hits = new Set<number>();
    for (let u = 0; u < 1; u += 0.01) hits.add(sampleLegal(mask, u));
    expect([...hits].sort()).toEqual([1, 3, 4]);
    expect(sampleLegal([0, 0], 0.5)).toBe(-1);
  });
});
