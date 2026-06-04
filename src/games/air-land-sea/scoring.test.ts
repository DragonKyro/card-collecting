import { describe, it, expect } from 'vitest';
import { vpForWithdraw, adjacentTheaters } from './scoring';

describe('vpForWithdraw', () => {
  it('matches the official chart', () => {
    expect(vpForWithdraw(6)).toBe(2);
    expect(vpForWithdraw(7)).toBe(2);
    expect(vpForWithdraw(5)).toBe(3);
    expect(vpForWithdraw(4)).toBe(3);
    expect(vpForWithdraw(3)).toBe(4);
    expect(vpForWithdraw(2)).toBe(4);
    expect(vpForWithdraw(1)).toBe(6);
    expect(vpForWithdraw(0)).toBe(6);
  });
});

describe('adjacentTheaters', () => {
  it('returns column neighbors only (no wrap)', () => {
    expect(adjacentTheaters(3, 0)).toEqual([1]);
    expect(adjacentTheaters(3, 1)).toEqual([0, 2]);
    expect(adjacentTheaters(3, 2)).toEqual([1]);
    expect(adjacentTheaters(5, 0)).toEqual([1]);
    expect(adjacentTheaters(5, 2)).toEqual([1, 3]);
    expect(adjacentTheaters(5, 4)).toEqual([3]);
  });
});
