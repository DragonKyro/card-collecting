// Cities expansion — onEvent trigger tests for debt + diplomacy.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwCard, SwState } from '../../types';
import { onEventCities } from './triggers';
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

const blackDebtCard: SwCard = {
  id: 9001, name: 'Test Debtor', age: 1, color: 'black',
  minPlayers: 3, maxPlayers: 99, cost: {},
  effects: [{ kind: 'citiesDebtToNeighbors', amount: 1 }],
};

const blackDiplomacyCard: SwCard = {
  id: 9002, name: 'Test Embassy', age: 1, color: 'black',
  minPlayers: 3, maxPlayers: 99, cost: {},
  effects: [{ kind: 'citiesGainDiplomacy', amount: 1 }],
};

describe('Cities triggers', () => {
  it('citiesDebtToNeighbors gives both seat neighbors 1 debt token each', () => {
    const s = freshState(3);
    const playerId = s.players[0].id;
    const west = s.players[2]; // (0-1+3)%3 = 2
    const east = s.players[1]; // (0+1)%3 = 1
    expect(west.debtTokens).toBe(0);
    expect(east.debtTokens).toBe(0);
    onEventCities(s, { kind: 'cardBuilt', playerId, card: blackDebtCard, viaChain: false });
    expect(west.debtTokens).toBe(1);
    expect(east.debtTokens).toBe(1);
    // Builder itself is unaffected.
    expect(s.players[0].debtTokens).toBe(0);
  });

  it('citiesGainDiplomacy gives the builder a diplomacy token', () => {
    const s = freshState(3);
    const p = s.players[0];
    expect(p.diplomacyTokens).toBe(0);
    onEventCities(s, { kind: 'cardBuilt', playerId: p.id, card: blackDiplomacyCard, viaChain: false });
    expect(p.diplomacyTokens).toBe(1);
  });

  it('non-cardBuilt events are ignored', () => {
    const s = freshState(3);
    onEventCities(s, { kind: 'tickStart' });
    onEventCities(s, { kind: 'militaryTokenGained', playerId: s.players[0].id, vp: 1, age: 1 });
    for (const p of s.players) {
      expect(p.debtTokens ?? 0).toBe(0);
      expect(p.diplomacyTokens ?? 0).toBe(0);
    }
  });

  it('debt tokens stack across multiple builds', () => {
    const s = freshState(3);
    const playerId = s.players[0].id;
    onEventCities(s, { kind: 'cardBuilt', playerId, card: blackDebtCard, viaChain: false });
    onEventCities(s, { kind: 'cardBuilt', playerId, card: blackDebtCard, viaChain: false });
    expect(s.players[1].debtTokens).toBe(2);
    expect(s.players[2].debtTokens).toBe(2);
  });
});
