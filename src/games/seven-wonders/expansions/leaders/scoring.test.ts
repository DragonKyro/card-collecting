// Leaders expansion — scoreExtras tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwState, SwCard, SwCardColor } from '../../types';
import { scoreExtrasLeaders } from './scoring';
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
    { expansions: ['leaders'], wonderAssignment: 'random', wonderSide: 'A' },
    1, aiSeats(n));
}

function leader(id: number, name: string, effects: SwCard['effects']): SwCard {
  return {
    id, name, age: 1, color: 'leader', minPlayers: 3, maxPlayers: 7,
    cost: { coins: 0 }, effects,
  };
}

function colored(id: number, name: string, color: SwCardColor): SwCard {
  return { id, name, age: 1, color, minPlayers: 3, maxPlayers: 99, cost: {}, effects: [] };
}

function greenSci(id: number, sym: 'compass' | 'gear' | 'tablet'): SwCard {
  return { id, name: `Sci-${sym}-${id}`, age: 1, color: 'green', minPlayers: 3, maxPlayers: 99, cost: {}, effects: [{ kind: 'science', symbol: sym }] };
}

describe('leaders expansion — scoring', () => {
  it('Cleopatra: +5 VP', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Cleopatra', [{ kind: 'vp', vp: 5 }])];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(5);
  });

  it('Hypatia: 1 VP per green card', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [
      leader(1, 'Hypatia', [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'green' }, vpPer: 1 }]),
    ];
    p.tableau = [colored(2, 'Lab', 'green'), colored(3, 'Lib', 'green'), colored(4, 'Workshop', 'green')];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(3);
  });

  it('Aristotle: +3 VP per completed science set', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau = [greenSci(2, 'compass'), greenSci(3, 'gear'), greenSci(4, 'tablet')];
    p.leaderTableau = [
      leader(1, 'Aristotle', [{ kind: 'leaderScoreExtra', rule: { type: 'completeScienceSet', vpPerSet: 3 } }]),
    ];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(3); // 1 set × 3
  });

  it('Aristotle: 2 sets → +6 VP, counts leader-supplied symbols', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau = [
      greenSci(2, 'compass'), greenSci(3, 'compass'),
      greenSci(4, 'gear'), greenSci(5, 'gear'),
      greenSci(6, 'tablet'),
    ];
    p.leaderTableau = [
      leader(1, 'Aristotle', [{ kind: 'leaderScoreExtra', rule: { type: 'completeScienceSet', vpPerSet: 3 } }]),
      leader(7, 'Ptolemy', [{ kind: 'science', symbol: 'tablet' }]), // brings tablet to 2 → completes 2nd set
    ];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(6); // 2 sets × 3
  });

  it('Justinian: +3 VP per {red, blue, green} triple', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau = [
      colored(2, 'Walls', 'red'), colored(3, 'Forti', 'red'),
      colored(4, 'Baths', 'blue'), colored(5, 'Aqua', 'blue'),
      colored(6, 'Lab', 'green'),
    ];
    p.leaderTableau = [
      leader(1, 'Justinian', [{ kind: 'leaderScoreExtra', rule: { type: 'completeRGBSet', vpPerSet: 3 } }]),
    ];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(3); // 1 triple (min over 2 red, 2 blue, 1 green)
  });

  it('Plato: +7 VP per all-7-color set', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau = [
      colored(2, 'a', 'brown'), colored(3, 'b', 'gray'), colored(4, 'c', 'blue'),
      colored(5, 'd', 'yellow'), colored(6, 'e', 'red'), colored(7, 'f', 'green'),
      colored(8, 'g', 'purple'),
    ];
    p.leaderTableau = [
      leader(1, 'Plato', [{ kind: 'leaderScoreExtra', rule: { type: 'completeAllColorsSet', vpPerSet: 7 } }]),
    ];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(7);
  });

  it('Plato: 0 VP if missing one color', () => {
    const s = freshState();
    const p = s.players[0];
    p.tableau = [
      colored(2, 'a', 'brown'), colored(3, 'b', 'gray'), colored(4, 'c', 'blue'),
      colored(5, 'd', 'yellow'), colored(6, 'e', 'red'), colored(7, 'f', 'green'),
      // No purple!
    ];
    p.leaderTableau = [
      leader(1, 'Plato', [{ kind: 'leaderScoreExtra', rule: { type: 'completeAllColorsSet', vpPerSet: 7 } }]),
    ];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(0);
  });

  it('Midas: +1 VP per 3 coins', () => {
    const s = freshState();
    const p = s.players[0];
    p.coins = 12;
    p.leaderTableau = [
      leader(1, 'Midas', [{ kind: 'leaderScoreExtra', rule: { type: 'midasCoinBonus' } }]),
    ];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(4);
  });

  it('Alexander: +1 VP per positive military token', () => {
    const s = freshState();
    const p = s.players[0];
    p.militaryTokens = [1, 3, 5, -1]; // 3 positive tokens
    p.leaderTableau = [
      leader(1, 'Alexander', [{ kind: 'leaderScoreExtra', rule: { type: 'alexanderTokenBonus' } }]),
    ];
    const got = scoreExtrasLeaders(s, p);
    expect(got.leaders).toBe(3);
  });

  it('returns empty when no leaders', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [];
    const got = scoreExtrasLeaders(s, p);
    expect(got).toEqual({});
  });
});
