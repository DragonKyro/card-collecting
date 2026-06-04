// Leaders expansion — sanity tests on the leader card data.

import { describe, it, expect } from 'vitest';
import { buildLeaderDeck, ALL_LEADER_NAMES, LEADER_COUNT, resetLeaderIdCounter } from './cards';

describe('leaders expansion — cards', () => {
  it('has 36 leaders', () => {
    expect(LEADER_COUNT).toBe(36);
    expect(ALL_LEADER_NAMES.length).toBe(36);
  });

  it('all leaders have unique names', () => {
    const set = new Set(ALL_LEADER_NAMES);
    expect(set.size).toBe(36);
  });

  it('buildLeaderDeck instantiates 36 leaders with unique ids', () => {
    resetLeaderIdCounter(10000);
    const deck = buildLeaderDeck();
    expect(deck.length).toBe(36);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(36);
    for (const c of deck) {
      expect(c.color).toBe('leader');
      expect(c.cost.coins).toBeGreaterThanOrEqual(0);
    }
  });

  it('expected leaders are present', () => {
    const names = new Set(ALL_LEADER_NAMES);
    for (const expected of ['Caesar', 'Cleopatra', 'Bilkis', 'Solomon', 'Aristotle', 'Plato', 'Justinian', 'Maecenas', 'Archimedes']) {
      expect(names.has(expected)).toBe(true);
    }
  });
});
