// Babel expansion — card data sanity tests.

import { describe, it, expect } from 'vitest';
import {
  buildBabelDeck, BABEL_AGE_I_NAMES, BABEL_AGE_II_NAMES, BABEL_AGE_III_NAMES,
  BABEL_CARD_TEMPLATES, resetBabelCardIdCounter,
} from './cards';

describe('Babel cards', () => {
  it('has 5 templates per age', () => {
    expect(BABEL_AGE_I_NAMES.length).toBe(5);
    expect(BABEL_AGE_II_NAMES.length).toBe(5);
    expect(BABEL_AGE_III_NAMES.length).toBe(5);
  });

  it('all templates use color="orange"', () => {
    for (const t of BABEL_CARD_TEMPLATES) {
      expect(t.color).toBe('orange');
    }
  });

  it('cards have unique ids when instantiated across all ages', () => {
    resetBabelCardIdCounter(30000);
    const deck = [
      ...buildBabelDeck(1, 7),
      ...buildBabelDeck(2, 7),
      ...buildBabelDeck(3, 7),
    ];
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });

  it('Tower of Babel has babelScoreExtra vpPerScienceSet effect', () => {
    const tower = BABEL_CARD_TEMPLATES.find((t) => t.name === 'Tower of Babel');
    expect(tower).toBeDefined();
    const sx = tower!.effects.find((e) => e.kind === 'babelScoreExtra');
    expect(sx).toBeDefined();
    if (sx?.kind === 'babelScoreExtra') {
      expect(sx.rule.type).toBe('vpPerScienceSet');
    }
  });

  it('scales with player count (higher counts deal at least as many cards)', () => {
    resetBabelCardIdCounter(30000);
    const deck3 = buildBabelDeck(1, 3);
    resetBabelCardIdCounter(30000);
    const deck7 = buildBabelDeck(1, 7);
    expect(deck7.length).toBeGreaterThanOrEqual(deck3.length);
  });
});
