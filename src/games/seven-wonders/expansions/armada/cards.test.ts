// Armada expansion — card data sanity tests.

import { describe, it, expect } from 'vitest';
import {
  buildArmadaDeck, ARMADA_AGE_I_NAMES, ARMADA_AGE_II_NAMES, ARMADA_AGE_III_NAMES,
  ARMADA_CARD_TEMPLATES, resetArmadaCardIdCounter,
} from './cards';

describe('Armada cards', () => {
  it('has 5 templates per age', () => {
    expect(ARMADA_AGE_I_NAMES.length).toBe(5);
    expect(ARMADA_AGE_II_NAMES.length).toBe(5);
    expect(ARMADA_AGE_III_NAMES.length).toBe(5);
  });

  it('all templates use color="navy"', () => {
    for (const t of ARMADA_CARD_TEMPLATES) {
      expect(t.color).toBe('navy');
    }
  });

  it('unique ids when instantiated across all ages', () => {
    resetArmadaCardIdCounter(40000);
    const deck = [
      ...buildArmadaDeck(1, 7),
      ...buildArmadaDeck(2, 7),
      ...buildArmadaDeck(3, 7),
    ];
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });

  it('Pirates Cove has armadaScoreExtra vpPerNeighborMilitaryLosses', () => {
    const t = ARMADA_CARD_TEMPLATES.find((x) => x.name === 'Pirates Cove');
    expect(t).toBeDefined();
    const sx = t!.effects.find((e) => e.kind === 'armadaScoreExtra');
    expect(sx).toBeDefined();
    if (sx?.kind === 'armadaScoreExtra') {
      expect(sx.rule.type).toBe('vpPerNeighborMilitaryLosses');
    }
  });

  it('scales with player count', () => {
    resetArmadaCardIdCounter(40000);
    const deck3 = buildArmadaDeck(1, 3);
    resetArmadaCardIdCounter(40000);
    const deck7 = buildArmadaDeck(1, 7);
    expect(deck7.length).toBeGreaterThanOrEqual(deck3.length);
  });
});
