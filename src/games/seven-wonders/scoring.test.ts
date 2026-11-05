// 7 Wonders scoring tests — verify per-category VP computation.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from './module';
import type { SwState, SwCard } from './types';
import { rankRows, scoreMatch } from './scoring';
import { newMatch, realCard } from './testSupport';
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
    { expansions: [], wonderAssignment: 'random', wonderSide: 'A' },
    1, aiSeats(n));
}

function blueCard(id: number, name: string, vp: number): SwCard {
  return {
    id, name, age: 1, color: 'blue', minPlayers: 3, maxPlayers: 99,
    cost: {}, effects: [{ kind: 'vp', vp }],
  };
}

function greenCard(id: number, symbol: 'compass' | 'gear' | 'tablet'): SwCard {
  return {
    id, name: `Sci-${symbol}-${id}`, age: 1, color: 'green', minPlayers: 3, maxPlayers: 99,
    cost: {}, effects: [{ kind: 'science', symbol }],
  };
}

describe('seven-wonders scoring', () => {
  it('civilian: sums blue card VPs', () => {
    const s = freshState();
    s.players[0].tableau = [blueCard(1, 'A', 3), blueCard(2, 'B', 5)];
    const rows = scoreMatch(s);
    const row = rows.find((r) => r.playerId === s.players[0].id)!;
    expect(row.civilian).toBe(8);
  });

  it('treasury: floor(coins / 3)', () => {
    const s = freshState();
    s.players[0].coins = 10;
    s.players[1].coins = 3;
    s.players[2].coins = 0;
    const rows = scoreMatch(s);
    expect(rows.find((r) => r.playerId === s.players[0].id)!.treasury).toBe(3);
    expect(rows.find((r) => r.playerId === s.players[1].id)!.treasury).toBe(1);
    expect(rows.find((r) => r.playerId === s.players[2].id)!.treasury).toBe(0);
  });

  it('military: sums positive and negative tokens', () => {
    const s = freshState();
    s.players[0].militaryTokens = [1, 3, 5];
    s.players[1].militaryTokens = [-1, -1, -1];
    s.players[2].militaryTokens = [];
    const rows = scoreMatch(s);
    expect(rows.find((r) => r.playerId === s.players[0].id)!.military).toBe(9);
    expect(rows.find((r) => r.playerId === s.players[1].id)!.military).toBe(-3);
    expect(rows.find((r) => r.playerId === s.players[2].id)!.military).toBe(0);
  });

  it('science: n² each + 7 per set of 3', () => {
    const s = freshState();
    // 2 compass, 2 gear, 2 tablet → 4+4+4 + 7×2 = 26
    s.players[0].tableau = [
      greenCard(1, 'compass'), greenCard(2, 'compass'),
      greenCard(3, 'gear'), greenCard(4, 'gear'),
      greenCard(5, 'tablet'), greenCard(6, 'tablet'),
    ];
    const rows = scoreMatch(s);
    expect(rows.find((r) => r.playerId === s.players[0].id)!.science).toBe(4 + 4 + 4 + 7 * 2);

    // 3 compass only → 9
    s.players[1].tableau = [
      greenCard(7, 'compass'), greenCard(8, 'compass'), greenCard(9, 'compass'),
    ];
    const rows2 = scoreMatch(s);
    expect(rows2.find((r) => r.playerId === s.players[1].id)!.science).toBe(9);
  });

  it('total equals sum of components', () => {
    const s = freshState();
    s.players[0].tableau = [blueCard(1, 'A', 5)];
    s.players[0].coins = 12;
    s.players[0].militaryTokens = [3];
    const rows = scoreMatch(s);
    const r = rows.find((r) => r.playerId === s.players[0].id)!;
    expect(r.total).toBe(r.military + r.treasury + r.wonder + r.civilian + r.commercial + r.science + r.guild);
  });
});

describe('seven-wonders scoring: wilds, guilds, ties', () => {
  it('the Scientists Guild and Babylon add science symbols of their choice', () => {
    const s = newMatch(3, { wonders: ['babylon-a', 'gizah-a', 'rhodes-a'] });
    const me = s.players[0];
    me.tableau = [greenCard(1, 'compass'), greenCard(2, 'gear')];
    const science = () => scoreMatch(s).find((r) => r.playerId === me.id)!.science;
    expect(science()).toBe(2);
    me.tableau.push(realCard('Scientists Guild'));
    expect(science()).toBe(1 + 1 + 1 + 7); // the wild completes the set
    me.wonderStagesBuilt = 2; // Babylon A stage 2: a second wild
    expect(science()).toBe(4 + 1 + 1 + 7); // best split: 2 compass, 1 gear, 1 tablet
    expect(scoreMatch(s).find((r) => r.playerId === me.id)!.guild).toBe(0); // the guild's VP is science
  });

  it('Olympia B copies the neighbour guild worth the most to it', () => {
    const s = newMatch(3, { wonders: ['olympia-b', 'gizah-a', 'rhodes-a'] });
    const [me, east, west] = s.players;
    me.wonderStagesBuilt = 3;
    east.tableau.push(realCard('Spies Guild'), realCard('Stockade'), realCard('Barracks'), realCard('Guard Tower'));
    west.tableau.push(realCard('Magistrates Guild'), realCard('Baths'));
    const row = scoreMatch(s).find((r) => r.playerId === me.id)!;
    expect(row.copiedGuild).toBe('Spies Guild');
    expect(row.guild).toBe(3); // the 3 red cards next door, counted from Olympia's seat

    me.wonderStagesBuilt = 2;
    expect(scoreMatch(s).find((r) => r.playerId === me.id)!.copiedGuild).toBeUndefined();
  });

  it('a copied Scientists Guild is one more wild symbol', () => {
    const s = newMatch(3, { wonders: ['olympia-b', 'gizah-a', 'rhodes-a'] });
    const [me, east] = s.players;
    me.wonderStagesBuilt = 3;
    me.tableau = [greenCard(1, 'compass'), greenCard(2, 'gear')];
    east.tableau.push(realCard('Scientists Guild'));
    const row = scoreMatch(s).find((r) => r.playerId === me.id)!;
    expect(row.copiedGuild).toBe('Scientists Guild');
    expect(row.science).toBe(10);
  });

  it('the Strategists Guild counts every defeat token next door', () => {
    const s = newMatch(3);
    const [me, east, west] = s.players;
    me.tableau.push(realCard('Strategists Guild'));
    east.militaryTokens = [-1, -1, 3];
    west.militaryTokens = [5, -1];
    expect(scoreMatch(s).find((r) => r.playerId === me.id)!.guild).toBe(3);
  });

  it('Shipowners counts its own brown, gray and purple cards (itself included)', () => {
    const s = newMatch(3);
    const me = s.players[0];
    me.tableau.push(realCard('Shipowners Guild'), realCard('Lumber Yard'), realCard('Loom'), realCard('Workers Guild'));
    expect(scoreMatch(s).find((r) => r.playerId === me.id)!.guild).toBe(4);
  });

  it('a tie on points goes to the most coins; a tie on both is shared', () => {
    const s = freshState(3);
    const rows = s.players.map((p) => ({
      playerId: p.id, military: 0, treasury: 0, wonder: 0, civilian: 10, commercial: 0, guild: 0, science: 0, total: 10,
    }));
    s.players[0].coins = 2; s.players[1].coins = 5; s.players[2].coins = 5;
    rows[0].total = 11;
    expect(rankRows(s, rows).winnerIds).toEqual(['p0']);
    rows[0].total = 10;
    const { sorted, winnerIds } = rankRows(s, rows);
    expect(winnerIds).toEqual(['p1', 'p2']);
    expect(sorted.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p0']);
  });
});
