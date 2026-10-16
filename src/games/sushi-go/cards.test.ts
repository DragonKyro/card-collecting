// Sushi Go! Party card tables and menu rules, pinned against the rulebook.

import { describe, it, expect } from 'vitest';
import { createRng, rngNext } from '@/core/rng';
import {
  handSize, dessertsForRound, validateMenu, randomMenu, roundCards, dessertCards,
  kindAllowedAt, DEFAULT_MENU, cardColor,
} from './cards';
import type { SushiGoCardKind } from './types';

const count = <T,>(xs: T[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>());

describe('sushi-go cards', () => {
  it('deals the rulebook hand sizes', () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(handSize)).toEqual([10, 10, 9, 9, 8, 8, 7]);
  });

  it('adds 5/3/2 desserts at 2–5 players and 7/5/3 at 6–8', () => {
    expect([1, 2, 3].map((r) => dessertsForRound(5, r))).toEqual([5, 3, 2]);
    expect([1, 2, 3].map((r) => dessertsForRound(6, r))).toEqual([7, 5, 3]);
  });

  it('has 12 nigiri: 4 egg, 5 salmon, 3 squid', () => {
    const nigiri = roundCards(DEFAULT_MENU, 1).filter((c) => c.kind === 'nigiri');
    expect(count(nigiri.map((c) => c.variant))).toEqual(new Map([['egg', 4], ['salmon', 5], ['squid', 3]]));
  });

  it('numbers chopsticks 1–3, spoon 4–6, menu 7–9, takeout box 10–12', () => {
    const menu: SushiGoCardKind[] = ['nigiri', 'maki', 'tempura', 'sashimi', 'dumpling', 'chopsticks', 'spoon', 'pudding'];
    const nums = (k: SushiGoCardKind, m = menu) => roundCards(m, 1).filter((c) => c.kind === k).map((c) => c.variant);
    expect(nums('chopsticks')).toEqual(['1', '2', '3']);
    expect(nums('spoon')).toEqual(['4', '5', '6']);
    const menu2: SushiGoCardKind[] = ['nigiri', 'maki', 'tempura', 'sashimi', 'dumpling', 'menu', 'takeoutBox', 'pudding'];
    expect(nums('menu', menu2)).toEqual(['7', '8', '9']);
    expect(nums('takeoutBox', menu2)).toEqual(['10', '11', '12']);
  });

  it('has 15 fruit cards: 2 of each double, 3 of each mixed pair', () => {
    const fruit = dessertCards(['nigiri', 'maki', 'tempura', 'sashimi', 'dumpling', 'wasabi', 'tea', 'fruit']);
    expect(count(fruit.map((c) => c.variant))).toEqual(new Map([
      ['WW', 2], ['PP', 2], ['OO', 2], ['WP', 3], ['WO', 3], ['PO', 3],
    ]));
  });

  it('keeps spoon / edamame out of 2-player games and menu / special order out of 7–8', () => {
    expect(kindAllowedAt('spoon', 2)).toBe(false);
    expect(kindAllowedAt('edamame', 2)).toBe(false);
    expect(kindAllowedAt('spoon', 3)).toBe(true);
    expect(kindAllowedAt('menu', 6)).toBe(true);
    expect(kindAllowedAt('menu', 7)).toBe(false);
    expect(kindAllowedAt('specialOrder', 8)).toBe(false);
    const menu: SushiGoCardKind[] = ['nigiri', 'maki', 'tempura', 'sashimi', 'edamame', 'wasabi', 'menu', 'pudding'];
    expect(validateMenu(menu)).toEqual([]);
    expect(validateMenu(menu, 4)).toEqual([]);
    expect(validateMenu(menu, 2)).toHaveLength(1);
    expect(validateMenu(menu, 7)).toHaveLength(1);
  });

  it('random menus are always legal for the player count', () => {
    const rng = createRng(123);
    const rand = () => rngNext(rng);
    for (let n = 2; n <= 8; n++) {
      for (let i = 0; i < 200; i++) {
        const menu = randomMenu(n, rand);
        expect(validateMenu(menu, n)).toEqual([]);
      }
    }
  });

  it('gives every food its own color except wasabi, which shares nigiri yellow', () => {
    expect(cardColor('wasabi')).toBe(cardColor('nigiri'));
    expect(cardColor('maki')).not.toBe(cardColor('temaki'));
  });
});
