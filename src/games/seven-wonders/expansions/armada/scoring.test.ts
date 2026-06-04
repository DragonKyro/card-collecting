// Armada expansion — scoreExtras tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwCard, SwCardColor, SwAge, SwState } from '../../types';
import { scoreExtrasArmada } from './scoring';
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
    { expansions: ['armada'], wonderAssignment: 'random', wonderSide: 'A' },
    1, aiSeats(n));
}

function bareCard(id: number, color: SwCardColor, vp?: number, age: SwAge = 1): SwCard {
  return {
    id, name: `Card${id}`, age, color,
    minPlayers: 3, maxPlayers: 99, cost: {},
    effects: vp !== undefined ? [{ kind: 'vp', vp }] : [],
  };
}

describe('Armada scoring', () => {
  it('pure VP on navy cards is scored in the armada bucket', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau.push(bareCard(1, 'navy', 4));
    p.tableau.push(bareCard(2, 'navy', 3));
    const ex = scoreExtrasArmada(s, p);
    expect(ex.armada).toBe(7);
  });

  it('Pirates Cove: +1 VP per defeat token across both neighbors', () => {
    const s = freshState(3);
    const p = s.players[0];
    // West neighbor (idx 2) has 3 defeat tokens, east (idx 1) has 2.
    s.players[2].militaryTokens = [-1, -1, -1, 3];
    s.players[1].militaryTokens = [-1, -1, 5];
    p.tableau.push({
      id: 100, name: 'Pirates Cove', age: 3, color: 'navy',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'armadaScoreExtra', rule: { type: 'vpPerNeighborMilitaryLosses', vpPer: 1 } }],
    });
    const ex = scoreExtrasArmada(s, p);
    expect(ex.armada).toBe(5);
  });

  it('Naval Academy: +1 VP per Age III card in own tableau', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau.push(bareCard(10, 'blue', undefined, 3));
    p.tableau.push(bareCard(11, 'green', undefined, 3));
    p.tableau.push(bareCard(12, 'blue', undefined, 1)); // not Age III
    p.tableau.push({
      id: 100, name: 'Naval Academy', age: 3, color: 'navy',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'armadaScoreExtra', rule: { type: 'vpPerOwnAgeIIIBuilds', vpPer: 1 } }],
    });
    const ex = scoreExtrasArmada(s, p);
    // Counts Age III cards including itself = 3 (blue, green, Naval Academy)
    expect(ex.armada).toBe(3);
  });

  it('Admiralty: +5 VP per complete (R+B+G+Y) set', () => {
    const s = freshState();
    const p = s.players[0];
    // 2 of each.
    let id = 100;
    for (const color of ['red', 'blue', 'green', 'yellow'] as SwCardColor[]) {
      p.tableau.push(bareCard(id++, color));
      p.tableau.push(bareCard(id++, color));
    }
    p.tableau.push({
      id: 200, name: 'Admiralty', age: 3, color: 'navy',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'armadaScoreExtra', rule: { type: 'vpPerOwnNavalSet', vpPerSet: 5 } }],
    });
    const ex = scoreExtrasArmada(s, p);
    expect(ex.armada).toBe(10); // 2 sets * 5
  });

  it('Admiralty: missing one color = 0 sets', () => {
    const s = freshState();
    const p = s.players[0];
    // No green.
    let id = 100;
    for (const color of ['red', 'blue', 'yellow'] as SwCardColor[]) {
      p.tableau.push(bareCard(id++, color));
    }
    p.tableau.push({
      id: 200, name: 'Admiralty', age: 3, color: 'navy',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'armadaScoreExtra', rule: { type: 'vpPerOwnNavalSet', vpPerSet: 5 } }],
    });
    const ex = scoreExtrasArmada(s, p);
    expect(ex.armada ?? 0).toBe(0);
  });

  it('empty case: no extras', () => {
    const s = freshState();
    const ex = scoreExtrasArmada(s, s.players[0]);
    expect(ex.armada).toBeUndefined();
  });
});
