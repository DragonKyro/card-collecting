import { describe, it, expect } from 'vitest';
import {
  cardPoints, collectorPoints, mermaidColorBonus, isValidDuoPair,
  isValidStarfishTrio, totalScore,
  SHELL_POINTS, OCTOPUS_POINTS, PENGUIN_POINTS, SAILOR_POINTS,
} from './scoring';
import type { SspCard, SspCardFamily, SspColor } from './types';

function card(id: number, family: SspCardFamily, color: SspColor = 'yellow'): SspCard {
  return { id, family, color };
}

describe('collectorPoints', () => {
  it('shells scoring 0/0/2/4/6/8/10 indexed by count', () => {
    expect(SHELL_POINTS).toEqual([0, 0, 2, 4, 6, 8, 10]);
    expect(collectorPoints('shell', 0)).toBe(0);
    expect(collectorPoints('shell', 1)).toBe(0);
    expect(collectorPoints('shell', 2)).toBe(2);
    expect(collectorPoints('shell', 3)).toBe(4);
    expect(collectorPoints('shell', 6)).toBe(10);
    expect(collectorPoints('shell', 99)).toBe(10);
  });

  it('octopus scoring 0/0/3/6/9/12', () => {
    expect(OCTOPUS_POINTS).toEqual([0, 0, 3, 6, 9, 12]);
    expect(collectorPoints('octopus', 1)).toBe(0);
    expect(collectorPoints('octopus', 2)).toBe(3);
    expect(collectorPoints('octopus', 5)).toBe(12);
    expect(collectorPoints('octopus', 12)).toBe(12);
  });

  it('penguin scoring 0/1/3/5', () => {
    expect(PENGUIN_POINTS).toEqual([0, 1, 3, 5]);
    expect(collectorPoints('penguin', 1)).toBe(1);
    expect(collectorPoints('penguin', 2)).toBe(3);
    expect(collectorPoints('penguin', 3)).toBe(5);
  });

  it('sailor scoring 0/0/5', () => {
    expect(SAILOR_POINTS).toEqual([0, 0, 5]);
    expect(collectorPoints('sailor', 1)).toBe(0);
    expect(collectorPoints('sailor', 2)).toBe(5);
  });
});

describe('cardPoints', () => {
  it('scores zero for empty', () => {
    expect(cardPoints([])).toBe(0);
  });

  it('scores 1 per pair of duo cards', () => {
    const cards = [
      card(1, 'crab'), card(2, 'crab'),
      card(3, 'boat'), card(4, 'boat'),
      card(5, 'fish'), card(6, 'fish'),
    ];
    expect(cardPoints(cards)).toBe(3);
  });

  it('scores 1 per shark+swimmer match', () => {
    expect(cardPoints([card(1, 'shark'), card(2, 'swimmer')])).toBe(1);
    expect(cardPoints([card(1, 'shark'), card(2, 'shark'), card(3, 'swimmer')])).toBe(1);
    expect(cardPoints([card(1, 'shark'), card(2, 'swimmer'), card(3, 'shark'), card(4, 'swimmer')])).toBe(2);
  });

  it('odd duos round down (orphaned card scores nothing)', () => {
    expect(cardPoints([card(1, 'crab'), card(2, 'crab'), card(3, 'crab')])).toBe(1);
  });

  it('collector + multiplier stacks', () => {
    const cards = [
      card(1, 'sailor'), card(2, 'sailor'),  // 5 pts (set of 2)
      card(3, 'captain'),                     // +3 per sailor = +6
    ];
    expect(cardPoints(cards)).toBe(11);
  });

  it('lighthouse multiplies boats (not counted as boat itself)', () => {
    const cards = [
      card(1, 'boat'), card(2, 'boat'), card(3, 'boat'),
      card(4, 'lighthouse'),
    ];
    // 1 pair = 1 pt, +3 boats from lighthouse = 4
    expect(cardPoints(cards)).toBe(4);
  });

  it('shoal multiplies fish', () => {
    const cards = [
      card(1, 'fish'), card(2, 'fish'),
      card(3, 'shoal'),
    ];
    expect(cardPoints(cards)).toBe(1 + 2);
  });

  it('penguin colony at 2x', () => {
    const cards = [
      card(1, 'penguin'), card(2, 'penguin'), card(3, 'penguin'),
      card(4, 'penguinColony'),
    ];
    // 3 penguins = 5 pts, +6 from colony = 11
    expect(cardPoints(cards)).toBe(11);
  });

  it('single collector card scores 0', () => {
    expect(cardPoints([card(1, 'shell')])).toBe(0);
    expect(cardPoints([card(1, 'octopus')])).toBe(0);
    expect(cardPoints([card(1, 'sailor')])).toBe(0);
  });
});

describe('mermaidColorBonus', () => {
  it('zero with no mermaids', () => {
    expect(mermaidColorBonus([card(1, 'crab', 'yellow'), card(2, 'crab', 'green')])).toBe(0);
  });

  it('one mermaid = top color group count', () => {
    const cards = [
      card(1, 'mermaid', 'white'),
      card(2, 'crab', 'yellow'), card(3, 'boat', 'yellow'), card(4, 'fish', 'yellow'),
      card(5, 'shell', 'green'),
    ];
    // Top group yellow (3); mermaid white is its own group of 1 — but yellow wins.
    expect(mermaidColorBonus(cards)).toBe(3);
  });

  it('two mermaids = top + second-top color groups', () => {
    const cards = [
      card(1, 'mermaid', 'white'), card(2, 'mermaid', 'white'),
      card(3, 'crab', 'yellow'), card(4, 'boat', 'yellow'), card(5, 'fish', 'yellow'),
      card(6, 'shell', 'green'), card(7, 'octopus', 'green'),
    ];
    // White: 2, Yellow: 3, Green: 2 → top two: 3 + 2 = 5
    expect(mermaidColorBonus(cards)).toBe(5);
  });

  it('mermaids count toward white bonus', () => {
    const cards = [
      card(1, 'mermaid', 'white'),
      card(2, 'mermaid', 'white'),
      card(3, 'mermaid', 'white'),
    ];
    // White group is 3 mermaids; with 3 mermaids → top 3 groups = 3 + 0 + 0 = 3
    expect(mermaidColorBonus(cards)).toBe(3);
  });
});

describe('isValidDuoPair', () => {
  it('matched-family duo pairs', () => {
    expect(isValidDuoPair(card(1, 'crab'), card(2, 'crab'))).toBe(true);
    expect(isValidDuoPair(card(1, 'boat'), card(2, 'boat'))).toBe(true);
    expect(isValidDuoPair(card(1, 'fish'), card(2, 'fish'))).toBe(true);
  });

  it('shark and swimmer pair', () => {
    expect(isValidDuoPair(card(1, 'shark'), card(2, 'swimmer'))).toBe(true);
    expect(isValidDuoPair(card(1, 'swimmer'), card(2, 'shark'))).toBe(true);
  });

  it('rejects two sharks or two swimmers', () => {
    expect(isValidDuoPair(card(1, 'shark'), card(2, 'shark'))).toBe(false);
    expect(isValidDuoPair(card(1, 'swimmer'), card(2, 'swimmer'))).toBe(false);
  });

  it('rejects non-duo combinations', () => {
    expect(isValidDuoPair(card(1, 'shell'), card(2, 'shell'))).toBe(false);
    expect(isValidDuoPair(card(1, 'mermaid'), card(2, 'mermaid'))).toBe(false);
    expect(isValidDuoPair(card(1, 'crab'), card(2, 'boat'))).toBe(false);
  });

  it('rejects same card by id', () => {
    expect(isValidDuoPair(card(1, 'crab'), card(1, 'crab'))).toBe(false);
  });
});

describe('totalScore', () => {
  it('combines card points and color bonus', () => {
    const cards = [
      card(1, 'shell', 'yellow'), card(2, 'shell', 'yellow'),       // 2 shells = 2
      card(3, 'mermaid', 'white'),                                  // +bonus
      card(4, 'crab', 'pink'),
    ];
    const t = totalScore(cards);
    // Yellow: 2 cards; that's the top group. Mermaid (1) → +2.
    expect(t.cardPoints).toBe(2);
    expect(t.colorBonus).toBe(2);
    expect(t.total).toBe(4);
  });

  it('Calm Waters event doubles the mermaid color bonus', () => {
    const cards = [
      card(1, 'shell', 'yellow'), card(2, 'shell', 'yellow'),
      card(3, 'mermaid', 'white'),
      card(4, 'crab', 'pink'),
    ];
    const t = totalScore(cards, { doubleColorBonus: true });
    // Base bonus is 2 (top yellow group), doubled → 4.
    expect(t.colorBonus).toBe(4);
    expect(t.total).toBe(6);
  });
});

describe('Extra Salt scoring', () => {
  it('lobster + crab counts as a duo pair (1 pt)', () => {
    expect(cardPoints([card(1, 'lobster'), card(2, 'crab')])).toBe(1);
  });

  it('lobster + crab is preferred over crab + crab when both can pair', () => {
    // 1 lobster + 2 crabs → lobster pairs with one crab (1 pt), no pair from the lone crab.
    expect(cardPoints([card(1, 'lobster'), card(2, 'crab'), card(3, 'crab')])).toBe(1);
  });

  it('jellyfish + swimmer counts as a duo pair (1 pt)', () => {
    expect(cardPoints([card(1, 'jellyfish'), card(2, 'swimmer')])).toBe(1);
  });

  it('jellyfish + swimmer is independent of shark + swimmer', () => {
    // 1 shark + 1 jellyfish + 2 swimmers → both pairs satisfied, 2 pts.
    expect(cardPoints([
      card(1, 'shark'), card(2, 'jellyfish'), card(3, 'swimmer'), card(4, 'swimmer'),
    ])).toBe(2);
  });

  it('Cast of Crabs (crabBasket) adds +1 per crab held', () => {
    // 3 crabs (=1 pair → 1 pt) + crabBasket (+3 pts) = 4 pts.
    expect(cardPoints([
      card(1, 'crab'), card(2, 'crab'), card(3, 'crab'),
      card(4, 'crabBasket'),
    ])).toBe(4);
  });

  it('seahorse boosts the best collector by one card (capped)', () => {
    // 1 shell on its own scores 0; with seahorse it scores like 2 shells = 2.
    expect(cardPoints([card(1, 'shell'), card(2, 'seahorse')])).toBe(2);
  });

  it('seahorse picks the most-profitable collector to extend', () => {
    // 1 shell + 1 octopus + seahorse: octopus@1→0 vs @2→3 gain=3; shell@1→0 vs @2→2 gain=2.
    // Should pick octopus (+3 pts).
    expect(cardPoints([card(1, 'shell'), card(2, 'octopus'), card(3, 'seahorse')])).toBe(3);
  });

  it('seahorse needs at least one card of the chosen collector', () => {
    // Just a seahorse with no collectors at all → 0 pts.
    expect(cardPoints([card(1, 'seahorse')])).toBe(0);
  });

  it('starfish trios add 3 pts and skip the underlying duo pair', () => {
    // 2 crabs + 1 starfish, played as a trio: scoring should give 3 (not 1+anything).
    const trioIds = new Set([1, 2, 3]);
    expect(cardPoints(
      [card(1, 'crab'), card(2, 'crab'), card(3, 'starfish')],
      { trioCancelledIds: trioIds, trios: 1 },
    )).toBe(3);
  });
});

describe('isValidStarfishTrio', () => {
  it('accepts 2 duo cards + 1 starfish', () => {
    expect(isValidStarfishTrio(
      card(1, 'crab'), card(2, 'crab'), card(3, 'starfish'),
    )).toBe(true);
    expect(isValidStarfishTrio(
      card(1, 'shark'), card(2, 'swimmer'), card(3, 'starfish'),
    )).toBe(true);
    expect(isValidStarfishTrio(
      card(1, 'lobster'), card(2, 'crab'), card(3, 'starfish'),
    )).toBe(true);
  });

  it('rejects 3 random cards', () => {
    expect(isValidStarfishTrio(
      card(1, 'crab'), card(2, 'shell'), card(3, 'starfish'),
    )).toBe(false);
  });

  it('rejects when there is no starfish', () => {
    expect(isValidStarfishTrio(
      card(1, 'crab'), card(2, 'crab'), card(3, 'crab'),
    )).toBe(false);
  });
});

describe('Extra Salt: isValidDuoPair', () => {
  it('jellyfish + swimmer is a valid pair', () => {
    expect(isValidDuoPair(card(1, 'jellyfish'), card(2, 'swimmer'))).toBe(true);
    expect(isValidDuoPair(card(1, 'swimmer'), card(2, 'jellyfish'))).toBe(true);
  });

  it('lobster + crab is a valid pair', () => {
    expect(isValidDuoPair(card(1, 'lobster'), card(2, 'crab'))).toBe(true);
    expect(isValidDuoPair(card(1, 'crab'), card(2, 'lobster'))).toBe(true);
  });

  it('two jellyfish (or two lobsters) are NOT pairs', () => {
    expect(isValidDuoPair(card(1, 'jellyfish'), card(2, 'jellyfish'))).toBe(false);
    expect(isValidDuoPair(card(1, 'lobster'), card(2, 'lobster'))).toBe(false);
  });
});
