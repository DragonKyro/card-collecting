import { describe, it, expect } from 'vitest';
import { countLegal, maskedArgmax, sampleLegal, sampleMaskedSoftmax } from './masked';

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

  it('softmax sampling never picks an illegal slot and follows the logits', () => {
    const logits = [50, 0, 50, Math.log(3), 0];
    const hits = [0, 0, 0, 0, 0];
    for (let k = 0; k < 400; k++) hits[sampleMaskedSoftmax(logits, mask, (k + 0.5) / 400)]++;
    expect(hits[0] + hits[2]).toBe(0);
    // Legal logits log(3), 0, 0 → probabilities 3/5, 1/5, 1/5.
    expect(hits).toEqual([0, 80, 0, 240, 80]);
    expect(sampleMaskedSoftmax([1, 2], [0, 0], 0.3)).toBe(-1);
  });
});
