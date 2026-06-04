// 7 Wonders Duel — card data tests.

import { describe, it, expect } from 'vitest';
import { createRng } from '@/core/rng';
import {
  buildDuelAgeDeck, resetDuelCardIdCounter,
  DUEL_AGE_I_COUNT, DUEL_AGE_II_COUNT, DUEL_AGE_III_COUNT,
} from './cards';

describe('Duel cards', () => {
  it('builds Age I deck with expected count', () => {
    resetDuelCardIdCounter(1);
    const deck = buildDuelAgeDeck(1, createRng(1));
    expect(deck.length).toBe(DUEL_AGE_I_COUNT);
    expect(deck.length).toBeGreaterThanOrEqual(20);
  });

  it('builds Age II deck with expected count', () => {
    resetDuelCardIdCounter(1);
    const deck = buildDuelAgeDeck(2, createRng(2));
    expect(deck.length).toBe(DUEL_AGE_II_COUNT);
    expect(deck.length).toBeGreaterThanOrEqual(20);
  });

  it('builds Age III deck including 3 guilds', () => {
    resetDuelCardIdCounter(1);
    const deck = buildDuelAgeDeck(3, createRng(3));
    expect(deck.length).toBe(DUEL_AGE_III_COUNT);
    const guildCount = deck.filter((c) => c.color === 'purple').length;
    expect(guildCount).toBe(3);
  });

  it('all card ids are unique across an age', () => {
    resetDuelCardIdCounter(1);
    const deck = buildDuelAgeDeck(1, createRng(5));
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });

  it('all cards have a defined color and cost', () => {
    resetDuelCardIdCounter(1);
    const deck = buildDuelAgeDeck(1, createRng(7));
    for (const c of deck) {
      expect(c.color).toBeTruthy();
      expect(c.cost).toBeDefined();
      expect(c.effects).toBeInstanceOf(Array);
    }
  });
});
