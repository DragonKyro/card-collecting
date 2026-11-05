// 7 Wonders Duel — the card list against the printed deck.

import { describe, it, expect } from 'vitest';
import { createRng } from '@/core/rng';
import type { DuelAge } from './types';
import { DUEL_CARD_SCIENCE } from './types';
import { ageCards, allCards, dealAge, guildCards } from './cards';

const byName = (name: string) => allCards().find((c) => c.name === name)!;

describe('Duel cards', () => {
  it('has 23 / 23 / 20 age cards and 7 guilds, every name and id unique', () => {
    expect(ageCards(1)).toHaveLength(23);
    expect(ageCards(2)).toHaveLength(23);
    expect(ageCards(3)).toHaveLength(20);
    expect(guildCards()).toHaveLength(7);
    const all = allCards();
    expect(new Set(all.map((c) => c.name)).size).toBe(73);
    expect(new Set(all.map((c) => c.id)).size).toBe(73);
  });

  it('has the printed colour mix per age', () => {
    const mix = (age: DuelAge) => {
      const m: Record<string, number> = {};
      for (const c of ageCards(age)) m[c.color] = (m[c.color] ?? 0) + 1;
      return m;
    };
    expect(mix(1)).toEqual({ brown: 6, gray: 2, red: 4, green: 4, yellow: 4, blue: 3 });
    expect(mix(2)).toEqual({ brown: 3, gray: 2, red: 5, green: 4, yellow: 4, blue: 5 });
    expect(mix(3)).toEqual({ red: 5, green: 4, yellow: 5, blue: 6 });
  });

  it('puts every science symbol on exactly two green cards', () => {
    const counts = new Map<string, number>();
    for (const c of allCards()) {
      for (const e of c.effects) if (e.kind === 'science') counts.set(e.symbol, (counts.get(e.symbol) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([...DUEL_CARD_SCIENCE].sort());
    for (const n of counts.values()) expect(n).toBe(2);
  });

  it('links every chain symbol from one card to exactly one later card', () => {
    const shown = allCards().filter((c) => c.chain);
    const needed = allCards().filter((c) => c.chainCost);
    expect(shown).toHaveLength(17);
    expect(needed).toHaveLength(17);
    for (const c of needed) {
      const from = byName(c.chainFrom!);
      expect(from.chain).toBe(c.chainCost);
      expect(from.age).toBeLessThan(c.age);
      expect(shown.filter((s) => s.chain === c.chainCost)).toHaveLength(1);
    }
  });

  it('matches printed spot checks', () => {
    expect(byName('Pretorium')).toMatchObject({ color: 'red', cost: { coins: 8 }, effects: [{ kind: 'shields', shields: 3 }] });
    expect(byName('Lighthouse').chainFrom).toBe('Tavern');
    expect(byName('Arena').chainFrom).toBe('Brewery');
    expect(byName('Fortifications').chainFrom).toBe('Palisade');
    expect(byName('Customs House').effects).toEqual([{ kind: 'tradeFixed', resources: ['papyrus', 'glass'] }]);
    expect(byName('Caravansery').cost).toEqual({ coins: 2, resources: ['glass', 'papyrus'] });
    expect(byName('Scientists Guild').effects).toEqual([{ kind: 'guild', what: { kind: 'color', colors: ['green'] }, vpPer: 1, coinsPer: 1 }]);
  });

  it('deals 20 cards an age: 3 left out, 3 guilds in Age III', () => {
    for (const age of [1, 2, 3] as const) {
      const deck = dealAge(age, createRng(age * 11));
      expect(deck).toHaveLength(20);
      expect(new Set(deck.map((c) => c.id)).size).toBe(20);
      expect(deck.filter((c) => c.color === 'purple')).toHaveLength(age === 3 ? 3 : 0);
    }
    expect(dealAge(2, createRng(5)).map((c) => c.id)).toEqual(dealAge(2, createRng(5)).map((c) => c.id));
  });
});
