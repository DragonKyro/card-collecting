// Cities expansion — scoreExtras tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwCard, SwCardColor, SwState } from '../../types';
import { scoreExtrasCities } from './scoring';
import type { Seat } from '@/core/types';

function aiSeats(n: number): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `p${i}`, name: `AI${i}`, color: '#888', isAI: true, isLocal: true });
  }
  return out;
}

function freshState(n = 3): SwState {
  return sevenWondersModule.createInitialState(
    { expansions: ['cities'], wonderAssignment: 'random', wonderSide: 'A' },
    1, aiSeats(n));
}

function bareCard(id: number, color: SwCardColor, vp?: number): SwCard {
  return {
    id, name: `Card${id}`, age: 1, color,
    minPlayers: 3, maxPlayers: 99, cost: {},
    effects: vp !== undefined ? [{ kind: 'vp', vp }] : [],
  };
}

describe('Cities scoring', () => {
  it('debt tokens each subtract 1 VP', () => {
    const s = freshState();
    const p = s.players[0];
    p.debtTokens = 4;
    const ex = scoreExtrasCities(s, p);
    expect(ex.cities).toBe(-4);
  });

  it('pure VP on a black card is scored in the cities bucket', () => {
    const s = freshState();
    const p = s.players[0];
    p.debtTokens = 0;
    p.tableau.push(bareCard(1, 'black', 5));
    p.tableau.push(bareCard(2, 'black', 3));
    const ex = scoreExtrasCities(s, p);
    expect(ex.cities).toBe(8);
  });

  it('debt offsets black VP', () => {
    const s = freshState();
    const p = s.players[0];
    p.debtTokens = 3;
    p.tableau.push(bareCard(1, 'black', 5));
    const ex = scoreExtrasCities(s, p);
    expect(ex.cities).toBe(2);
  });

  it('Tourist Office: +7 per complete 7-color set', () => {
    const s = freshState();
    const p = s.players[0];
    p.debtTokens = 0;
    // One of each color.
    const colors: SwCardColor[] = ['brown', 'gray', 'blue', 'yellow', 'red', 'green', 'purple'];
    let id = 100;
    for (const c of colors) p.tableau.push(bareCard(id++, c));
    // Tourist Office black card
    p.tableau.push({
      id: 200, name: 'Tourist Office', age: 3, color: 'black',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'citiesScoreExtra', rule: { type: 'completeAllColorsSet', vpPerSet: 7 } }],
    });
    const ex = scoreExtrasCities(s, p);
    expect(ex.cities).toBe(7);
  });

  it('Tourist Office: 2 sets = +14', () => {
    const s = freshState();
    const p = s.players[0];
    const colors: SwCardColor[] = ['brown', 'gray', 'blue', 'yellow', 'red', 'green', 'purple'];
    let id = 100;
    for (const c of colors) { p.tableau.push(bareCard(id++, c)); p.tableau.push(bareCard(id++, c)); }
    p.tableau.push({
      id: 200, name: 'Tourist Office', age: 3, color: 'black',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'citiesScoreExtra', rule: { type: 'completeAllColorsSet', vpPerSet: 7 } }],
    });
    const ex = scoreExtrasCities(s, p);
    expect(ex.cities).toBe(14);
  });

  it('Tourist Office: missing one color = 0 sets', () => {
    const s = freshState();
    const p = s.players[0];
    // Missing 'purple'
    const colors: SwCardColor[] = ['brown', 'gray', 'blue', 'yellow', 'red', 'green'];
    let id = 100;
    for (const c of colors) p.tableau.push(bareCard(id++, c));
    p.tableau.push({
      id: 200, name: 'Tourist Office', age: 3, color: 'black',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'citiesScoreExtra', rule: { type: 'completeAllColorsSet', vpPerSet: 7 } }],
    });
    const ex = scoreExtrasCities(s, p);
    // No sets, no debt, no black VP → no extras column entry.
    expect(ex.cities ?? 0).toBe(0);
  });

  it('Gambling Hall: VP per debt token across ALL players', () => {
    const s = freshState();
    s.players[0].debtTokens = 2;
    s.players[1].debtTokens = 3;
    s.players[2].debtTokens = 0;
    // The owner is p2 (no debt herself).
    const p2 = s.players[2];
    p2.tableau.push({
      id: 300, name: 'Gambling Hall', age: 3, color: 'black',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'citiesScoreExtra', rule: { type: 'vpPerDebtTotal', vpPer: 1 } }],
    });
    const ex = scoreExtrasCities(s, p2);
    expect(ex.cities).toBe(5); // 2 + 3 + 0 = 5 debt total
  });

  it('empty case: no extras', () => {
    const s = freshState();
    const p = s.players[0];
    p.debtTokens = 0;
    const ex = scoreExtrasCities(s, p);
    expect(ex.cities).toBeUndefined();
  });
});
