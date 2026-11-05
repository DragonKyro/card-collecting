import { describe, expect, it } from 'vitest';
import type { Seat } from './types';
import { aiLevelsInPlay, nextSimultaneousSeat, seatAiLevel, sharedDeviceHumans } from './seats';

const seat = (id: string, isAI: boolean, isLocal = true, aiLevel?: string): Seat =>
  ({ id, name: id, color: '#888', isAI, isLocal, ...(aiLevel ? { aiLevel } : {}) });

describe('nextSimultaneousSeat', () => {
  it('with one human, the AIs go first, then the human', () => {
    const seats = [seat('h', false), seat('a1', true), seat('a2', true)];
    expect(nextSimultaneousSeat(seats, ['h', 'a1', 'a2'])).toBe('a1');
    expect(nextSimultaneousSeat(seats, ['h', 'a2'])).toBe('a2');
    expect(nextSimultaneousSeat(seats, ['h'])).toBe('h');
    expect(nextSimultaneousSeat(seats, [])).toBeNull();
  });

  it('with two humans sharing the device, each human goes (in seat order) before the AIs', () => {
    const seats = [seat('a1', true), seat('h1', false), seat('h2', false)];
    expect(sharedDeviceHumans(seats)).toBe(2);
    expect(nextSimultaneousSeat(seats, ['a1', 'h1', 'h2'])).toBe('h1');
    expect(nextSimultaneousSeat(seats, ['a1', 'h2'])).toBe('h2');
    expect(nextSimultaneousSeat(seats, ['a1'])).toBe('a1');
  });

  it('online (no seat is local) the AIs still go first, whatever the human count', () => {
    const seats = [seat('h1', false, false), seat('h2', false, false), seat('a1', true, false)];
    expect(sharedDeviceHumans(seats)).toBe(0);
    expect(nextSimultaneousSeat(seats, ['h1', 'h2', 'a1'])).toBe('a1');
  });
});

describe('seat AI levels', () => {
  const levels = [{ id: 'easy' }, { id: 'hard' }] as const;
  it("a seat plays its own level when it's offered, else the default", () => {
    expect(seatAiLevel(levels, 'hard', { aiLevel: 'easy' })).toBe('easy');
    expect(seatAiLevel(levels, 'hard', { aiLevel: 'impossible' })).toBe('hard');
    expect(seatAiLevel(levels, 'hard', {})).toBe('hard');
    expect(seatAiLevel(levels, 'hard', undefined)).toBe('hard');
  });

  it('lists every level the AI seats play at, once each, ignoring human seats', () => {
    const seats = [seat('h', false, true, 'easy'), seat('a', true, true, 'easy'), seat('b', true), seat('c', true, true, 'easy')];
    expect(aiLevelsInPlay(levels, 'hard', seats)).toEqual(['easy', 'hard']);
    expect(aiLevelsInPlay(levels, 'hard', [seat('h', false)])).toEqual([]);
  });
});
