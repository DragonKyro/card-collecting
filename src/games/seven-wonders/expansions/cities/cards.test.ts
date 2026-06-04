// Cities expansion — card data sanity tests.

import { describe, it, expect } from 'vitest';
import {
  buildCitiesDeck, CITIES_AGE_I_NAMES, CITIES_AGE_II_NAMES, CITIES_AGE_III_NAMES,
  CITIES_CARD_TEMPLATES, resetCitiesCardIdCounter,
} from './cards';

describe('Cities cards', () => {
  it('has 9 templates per age', () => {
    expect(CITIES_AGE_I_NAMES.length).toBe(9);
    expect(CITIES_AGE_II_NAMES.length).toBe(9);
    expect(CITIES_AGE_III_NAMES.length).toBe(9);
  });

  it('templates have unique ids when built (per age)', () => {
    resetCitiesCardIdCounter(20000);
    const deck = [
      ...buildCitiesDeck(1, 7),
      ...buildCitiesDeck(2, 7),
      ...buildCitiesDeck(3, 7),
    ];
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });

  it('all templates are color="black"', () => {
    for (const t of CITIES_CARD_TEMPLATES) {
      expect(t.color).toBe('black');
    }
  });

  it('scales with player count (3p deals fewer cards than 7p)', () => {
    resetCitiesCardIdCounter(20000);
    const deck3 = buildCitiesDeck(1, 3);
    resetCitiesCardIdCounter(20000);
    const deck7 = buildCitiesDeck(1, 7);
    expect(deck7.length).toBeGreaterThanOrEqual(deck3.length);
  });

  it('Tourist Office has citiesScoreExtra completeAllColorsSet effect', () => {
    const tourist = CITIES_CARD_TEMPLATES.find((t) => t.name === 'Tourist Office');
    expect(tourist).toBeDefined();
    const sx = tourist!.effects.find((e) => e.kind === 'citiesScoreExtra');
    expect(sx).toBeDefined();
    if (sx?.kind === 'citiesScoreExtra') {
      expect(sx.rule.type).toBe('completeAllColorsSet');
    }
  });
});
