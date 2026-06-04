import { describe, it, expect } from 'vitest';
import { buildDeck, FAMILY, FAMILY_ORDER, duoPartner, defaultTargetScore } from './cards';

describe('deck composition', () => {
  it('totals exactly 58 cards', () => {
    const deck = buildDeck();
    expect(deck.length).toBe(58);
  });

  it('matches the rulebook family counts', () => {
    const expected: Record<string, number> = {
      crab: 9, boat: 8, fish: 7, shark: 5, swimmer: 5,
      shell: 6, octopus: 5, penguin: 3, sailor: 2,
      lighthouse: 1, shoal: 1, penguinColony: 1, captain: 1,
      mermaid: 4,
    };
    const counts: Record<string, number> = {};
    for (const c of buildDeck()) {
      counts[c.family] = (counts[c.family] ?? 0) + 1;
    }
    expect(counts).toEqual(expected);
  });

  it('FAMILY counts also sum to 58', () => {
    let sum = 0;
    for (const f of FAMILY_ORDER) sum += FAMILY[f].count;
    expect(sum).toBe(58);
  });

  it('all card ids are unique', () => {
    const deck = buildDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(58);
  });

  it('mermaids are always white', () => {
    for (const c of buildDeck()) {
      if (c.family === 'mermaid') expect(c.color).toBe('white');
    }
  });

  it('non-mermaid cards are never white', () => {
    for (const c of buildDeck()) {
      if (c.family !== 'mermaid') expect(c.color).not.toBe('white');
    }
  });
});

describe('duoPartner', () => {
  it('crab/boat/fish partner with themselves', () => {
    expect(duoPartner('crab')).toBe('crab');
    expect(duoPartner('boat')).toBe('boat');
    expect(duoPartner('fish')).toBe('fish');
  });

  it('shark and swimmer pair together', () => {
    expect(duoPartner('shark')).toBe('swimmer');
    expect(duoPartner('swimmer')).toBe('shark');
  });

  it('non-duos have no partner', () => {
    expect(duoPartner('shell')).toBeNull();
    expect(duoPartner('mermaid')).toBeNull();
    expect(duoPartner('lighthouse')).toBeNull();
  });
});

describe('defaultTargetScore', () => {
  it('scales by player count', () => {
    expect(defaultTargetScore(2)).toBe(40);
    expect(defaultTargetScore(3)).toBe(35);
    expect(defaultTargetScore(4)).toBe(30);
  });
});
