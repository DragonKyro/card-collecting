// Cities — the black cards, the deal (hands of 8; 7 at 8 players) and the
// new wonders.

import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { blackCards, CITIES_CARD_NAMES, citiesDeckCards, citiesGuilds } from './cards';
import { availableWonders } from '../../wonders';
import { handSize, picksPerAge } from '../../reducer';
import { newMatch } from '../../testSupport';

describe('Cities cards', () => {
  it('has 9 black cards per Age, all different', () => {
    for (const age of [1, 2, 3] as const) {
      expect(blackCards(age)).toHaveLength(9);
      expect(blackCards(age).every((c) => c.color === 'black' && c.age === age)).toBe(true);
    }
    const names = [1, 2, 3].flatMap((a) => CITIES_CARD_NAMES[a as 1]);
    expect(new Set(names).size).toBe(27);
    expect(citiesGuilds().map((g) => g.name)).toEqual(['Counterfeiters Guild', 'Guild of Shadows', 'Mourners Guild']);
  });

  it('prints the real costs', () => {
    const card = (age: 1 | 2 | 3, name: string) => blackCards(age).find((c) => c.name === name)!;
    expect(card(1, 'Militia').cost).toEqual({ coins: 3 });
    expect(card(1, 'Pigeon Loft').cost).toEqual({ coins: 1, resources: ['ore'] });
    expect(card(2, 'Tabularium').cost).toEqual({ coins: 2, resources: ['ore', 'wood', 'loom'] });
    expect(card(3, 'Capitol').cost).toEqual({ coins: 2, resources: ['clay', 'clay', 'stone', 'stone', 'glass', 'papyrus'] });
    expect(card(3, 'Brotherhood').cost).toEqual({ resources: ['wood', 'wood', 'ore', 'loom'] });
    expect(card(1, 'Hideout').effects).toContainEqual({ kind: 'coinLoss', amount: 2 });
    expect(card(3, 'Contingent').cost).toEqual({ coins: 5, resources: ['loom'] });
  });

  it('adds one black card per player each Age, 7 at most', () => {
    expect(citiesDeckCards(1, 3, createRng(1))).toHaveLength(3);
    expect(citiesDeckCards(2, 7, createRng(1))).toHaveLength(7);
    expect(citiesDeckCards(3, 8, createRng(1))).toHaveLength(7);
  });

  it('deals hands of 8 (7 picks an Age), 7 at 8 players', () => {
    for (let n = 3; n <= 8; n++) {
      const s = newMatch(n, { expansions: ['cities'], seed: n });
      expect(handSize(s)).toBe(n <= 7 ? 8 : 7);
      expect(picksPerAge(s)).toBe(n <= 7 ? 7 : 6);
      expect(s.players.every((p) => p.hand.length === handSize(s))).toBe(true);
      const ids = s.players.flatMap((p) => p.hand.map((c) => c.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(s.players.flatMap((p) => p.hand).filter((c) => c.color === 'black')).toHaveLength(Math.min(n, 7));
    }
  });

  it('adds Petra and Byzantium only with Cities', () => {
    expect(availableWonders([]).some((w) => w.id.startsWith('petra'))).toBe(false);
    expect(availableWonders(['cities']).filter((w) => /petra|byzantium/.test(w.id))).toHaveLength(4);
  });
});
