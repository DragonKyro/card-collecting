import { describe, it, expect } from 'vitest';
import type { AlsConfig } from './types';
import { CARD_TEMPLATES, cardIdsForTheaters } from './cards';
import {
  battleWinner, deployVia, effectiveCardStrength, playOptions, theaterControl, theaterStrength, vpForWithdraw,
} from './rules';
import { arrange, card, newMatch } from './testSupport';

const SLS = { expansions: { spiesLiesSupplies: true } };
const EPIC: Partial<AlsConfig> = { theaters: ['air', 'land', 'sea', 'intel', 'diplo'], ...SLS };

describe('cards', () => {
  it('has strengths 1–6 in each of the six theaters, the 6 without an ability', () => {
    expect(CARD_TEMPLATES).toHaveLength(36);
    for (const t of ['air', 'land', 'sea', 'intel', 'diplo', 'econ'] as const) {
      const row = CARD_TEMPLATES.filter((c) => c.theater === t);
      expect(row.map((c) => c.strength)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(row[5].ability).toBeNull();
      expect(row[2].ability).toBe(t === 'air' || t === 'land' || t === 'sea' ? 'maneuver' : 'manipulate');
    }
  });

  it('prints the revised base deck', () => {
    const names = (t: string) => CARD_TEMPLATES.filter((c) => c.theater === t).map((c) => c.name);
    expect(names('air')).toEqual(['Support', 'Air Drop', 'Maneuver', 'Aerodrome', 'Containment', 'Heavy Bombers']);
    expect(names('land')).toEqual(['Reinforce', 'Ambush', 'Maneuver', 'Cover Fire', 'Disrupt', 'Heavy Tanks']);
    expect(names('sea')).toEqual(['Transport', 'Escalation', 'Maneuver', 'Redeploy', 'Blockade', 'Super Battleship']);
    expect(names('intel')).toEqual(['Incite', 'Spy Network', 'Manipulate', 'Neutralize', 'Surveil', 'Covert Operations']);
    expect(names('diplo')).toEqual(['Relinquish', 'Envoy', 'Manipulate', 'Leverage', 'Give & Take', 'Grand Betrayal']);
    expect(names('econ')).toEqual(['Retrofit', 'Supply Lines', 'Manipulate', 'Requisition', 'Arms Race', 'Production Surge']);
    const ongoing = CARD_TEMPLATES.filter((c) => c.trigger === 'ongoing').map((c) => c.name);
    expect(ongoing).toEqual(['Support', 'Aerodrome', 'Containment', 'Cover Fire', 'Escalation', 'Blockade', 'Spy Network', 'Envoy', 'Supply Lines']);
  });
});

describe('strength', () => {
  it('counts face-down cards as 2, or 4 under their owner’s Escalation', () => {
    let s = arrange(newMatch(), {
      board: { 0: [[[card('land', 6), 'd']], [[card('air', 6), 'd']]], 2: [[[card('sea', 2), 'u']], []] },
    });
    expect(theaterStrength(s, 0, 0)).toBe(4);
    expect(theaterStrength(s, 0, 1)).toBe(2);
    s = arrange(newMatch(), { board: { 0: [[[card('land', 6), 'd']], []], 2: [[[card('sea', 2), 'd']], []] } });
    expect(theaterStrength(s, 0, 0)).toBe(2);
  });

  it('Cover Fire makes every card it covers 4 — a 6 drops to 4', () => {
    const s = arrange(newMatch(), {
      board: { 1: [[[card('land', 6), 'u'], [card('land', 1), 'd'], [card('land', 4), 'u']], []] },
    });
    expect([0, 1, 2].map((i) => effectiveCardStrength(s, 1, 0, i))).toEqual([4, 4, 4]);
    expect(theaterStrength(s, 1, 0)).toBe(12);
  });

  it('Support adds 3 to its owner in the adjacent theaters only', () => {
    const s = arrange(newMatch(), { board: { 0: [[[card('air', 1), 'u']], []] } });
    expect([0, 1, 2].map((t) => theaterStrength(s, t, 0))).toEqual([1, 3, 0]);
    expect(theaterStrength(s, 1, 1)).toBe(0);
  });

  it('Spy Network adds 3 per face-down card its owner has in the adjacent theaters', () => {
    const s = arrange(newMatch({ theaters: ['intel', 'diplo', 'econ'], ...SLS }), {
      board: {
        0: [[[card('econ', 1), 'd']], [[card('intel', 6), 'd']]],
        1: [[[card('intel', 2), 'u'], [card('diplo', 6), 'd']], []],
        2: [[[card('diplo', 1), 'd'], [card('econ', 6), 'd']], []],
      },
    });
    // Spy Network 2 + the face-down 2 under it + 3 × (1 in theater 0 + 2 in theater 2).
    expect(theaterStrength(s, 1, 0)).toBe(2 + 2 + 9);
  });

  it('adds a supply token as 1 strength', () => {
    const s = arrange(newMatch(), {});
    s.supplies[2][1] = 3;
    expect(theaterStrength(s, 2, 1)).toBe(3);
  });
});

describe('control and battle winner', () => {
  it('gives ties and empty theaters to the 1st player', () => {
    const s = arrange(newMatch(), {
      first: 1,
      board: { 0: [[[card('air', 3), 'u']], [[card('air', 2), 'u']]], 1: [[[card('land', 2), 'u']], [[card('land', 3), 'd']]] },
    });
    expect(theaterControl(s)).toEqual([0, 1, 1]);
    expect(battleWinner(s)).toBe(1);
  });
});

describe('withdraw charts', () => {
  it('uses the withdrawing player’s Supreme Commander card', () => {
    const s = arrange(newMatch(), { first: 0 });
    const chart = (seat: 0 | 1) => [6, 5, 4, 3, 2, 1, 0].map((n) => vpForWithdraw(s, seat, n));
    expect(chart(0)).toEqual([2, 2, 2, 3, 3, 4, 6]);   // 1st player: 4+ / 2–3 / 1 / 0
    expect(chart(1)).toEqual([2, 2, 3, 3, 4, 6, 6]);   // 2nd player: 5+ / 3–4 / 2 / 0–1
  });

  it('uses the Epic column with five theaters', () => {
    const s = arrange(newMatch(EPIC), { first: 1 });
    const chart = (seat: 0 | 1) => [10, 7, 6, 5, 4, 3, 2, 1, 0].map((n) => vpForWithdraw(s, seat, n));
    expect(chart(1)).toEqual([2, 2, 2, 3, 3, 3, 4, 4, 6]);   // 1st: 6+ / 3–5 / 1–2 / 0
    expect(chart(0)).toEqual([2, 2, 3, 3, 3, 4, 4, 6, 6]);   // 2nd: 7+ / 4–6 / 2–3 / 0–1
  });

  it('is always 1 VP in Beginner Mode', () => {
    const s = arrange(newMatch({ beginner: true, targetVp: 3 }), {});
    expect(vpForWithdraw(s, 0, 0)).toBe(1);
    expect(vpForWithdraw(s, 1, 6)).toBe(1);
  });
});

describe('deploy restrictions', () => {
  it('needs the matching theater unless an ability allows otherwise', () => {
    const s = arrange(newMatch(), { hands: [[card('sea', 6), card('land', 2)], []] });
    expect(playOptions(s, 0, card('sea', 6))).toEqual({ faceUp: [2], faceDown: [0, 1, 2] });
  });

  it('Aerodrome lets its owner deploy strength 3 or less anywhere', () => {
    const s = arrange(newMatch(), {
      hands: [[card('sea', 3), card('sea', 4)], [card('land', 1)]],
      board: { 0: [[[card('air', 4), 'u']], []] },
    });
    expect(deployVia(s, 0, card('sea', 3), 0)).toBe('aerodrome');
    expect(deployVia(s, 0, card('sea', 4), 0)).toBeNull();
    expect(deployVia(s, 1, card('land', 1), 0)).toBeNull();
  });

  it('limits ongoing abilities to their own and the adjacent theaters in Epic Mode', () => {
    const s = arrange(newMatch(EPIC), {
      hands: [[card('sea', 3)], []],
      board: {
        0: [[[card('air', 4), 'u']], []],
        2: [[[card('sea', 2), 'u']], []],
        3: [[[card('intel', 6), 'd']], []],
        4: [[[card('land', 1), 'd']], []],
      },
    });
    expect(deployVia(s, 0, card('sea', 3), 1)).toBe('aerodrome');
    expect(deployVia(s, 0, card('sea', 3), 3)).toBeNull();
    // Escalation in theater 2 reaches 1–3, not 4.
    expect(theaterStrength(s, 3, 0)).toBe(4);
    expect(theaterStrength(s, 4, 0)).toBe(2);
  });

  it('builds each battle deck from the theaters in play', () => {
    expect(cardIdsForTheaters(['air', 'diplo', 'econ'])).toHaveLength(18);
    const s = newMatch(EPIC);
    expect(s.players[0].hand).toHaveLength(10);
    expect(s.players[1].hand).toHaveLength(10);
    expect(s.deck).toHaveLength(10);
  });
});
