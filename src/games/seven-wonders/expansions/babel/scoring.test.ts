// Babel expansion — scoreExtras tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwCard, SwCardColor, SwState } from '../../types';
import { scoreExtrasBabel } from './scoring';
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
    { expansions: ['babel'], wonderAssignment: 'random', wonderSide: 'A' },
    1, aiSeats(n));
}

function bareCard(id: number, color: SwCardColor, vp?: number): SwCard {
  return {
    id, name: `Card${id}`, age: 1, color,
    minPlayers: 3, maxPlayers: 99, cost: {},
    effects: vp !== undefined ? [{ kind: 'vp', vp }] : [],
  };
}

function scienceCard(id: number, sym: 'compass' | 'gear' | 'tablet'): SwCard {
  return {
    id, name: `Science${id}`, age: 1, color: 'green',
    minPlayers: 3, maxPlayers: 99, cost: {},
    effects: [{ kind: 'science', symbol: sym }],
  };
}

describe('Babel scoring', () => {
  it('pure VP on orange cards is scored in the babel bucket', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau.push(bareCard(1, 'orange', 5));
    p.tableau.push(bareCard(2, 'orange', 2));
    const ex = scoreExtrasBabel(s, p);
    expect(ex.babel).toBe(7);
  });

  it('Tower of Babel: +4 per complete science set', () => {
    const s = freshState();
    const p = s.players[0];
    // 2 of each symbol = 2 sets.
    p.tableau.push(scienceCard(10, 'compass'));
    p.tableau.push(scienceCard(11, 'compass'));
    p.tableau.push(scienceCard(12, 'gear'));
    p.tableau.push(scienceCard(13, 'gear'));
    p.tableau.push(scienceCard(14, 'tablet'));
    p.tableau.push(scienceCard(15, 'tablet'));
    p.tableau.push({
      id: 100, name: 'Tower of Babel', age: 3, color: 'orange',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'babelScoreExtra', rule: { type: 'vpPerScienceSet', vpPerSet: 4 } }],
    });
    const ex = scoreExtrasBabel(s, p);
    expect(ex.babel).toBe(8); // 2 sets * 4
  });

  it('Tower of Babel: science from leaderTableau counts', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau.push(scienceCard(10, 'compass'));
    p.tableau.push(scienceCard(11, 'gear'));
    // Tablet via leader (Ptolemy-like).
    p.leaderTableau = [{
      id: 9000, name: 'Ptolemy', age: 1, color: 'leader',
      minPlayers: 3, maxPlayers: 99, cost: { coins: 3 },
      effects: [{ kind: 'science', symbol: 'tablet' }],
    }];
    p.tableau.push({
      id: 100, name: 'Tower of Babel', age: 3, color: 'orange',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'babelScoreExtra', rule: { type: 'vpPerScienceSet', vpPerSet: 4 } }],
    });
    const ex = scoreExtrasBabel(s, p);
    expect(ex.babel).toBe(4); // 1 set * 4
  });

  it('Court of Babylon: +1 VP per blue card across both neighbors', () => {
    const s = freshState(3);
    const p = s.players[0];
    // p1 is east, p2 is west of p0 (idx 0).
    s.players[1].tableau.push(bareCard(20, 'blue'));
    s.players[1].tableau.push(bareCard(21, 'blue'));
    s.players[2].tableau.push(bareCard(22, 'blue'));
    // p0 has no blue cards itself.
    p.tableau.push({
      id: 100, name: 'Court of Babylon', age: 3, color: 'orange',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'babelScoreExtra', rule: { type: 'vpPerNeighborCards', color: 'blue', vpPer: 1 } }],
    });
    const ex = scoreExtrasBabel(s, p);
    expect(ex.babel).toBe(3); // 2 (east) + 1 (west)
  });

  it('Ziggurat of Etemenanki: +1 VP per (red OR green) card in own tableau', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau.push(bareCard(30, 'red'));
    p.tableau.push(bareCard(31, 'red'));
    p.tableau.push(bareCard(32, 'green'));
    p.tableau.push(bareCard(33, 'blue')); // not counted
    p.tableau.push({
      id: 100, name: 'Ziggurat of Etemenanki', age: 3, color: 'orange',
      minPlayers: 3, maxPlayers: 99, cost: {},
      effects: [{ kind: 'babelScoreExtra', rule: { type: 'vpPerOwnColors', colors: ['red', 'green'], vpPer: 1 } }],
    });
    const ex = scoreExtrasBabel(s, p);
    expect(ex.babel).toBe(3);
  });

  it('empty case: no extras', () => {
    const s = freshState();
    const p = s.players[0];
    const ex = scoreExtrasBabel(s, p);
    expect(ex.babel).toBeUndefined();
  });
});
