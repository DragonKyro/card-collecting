// 7 Wonders AI — every seat AI-driven to the end of the match, at every table
// size and on every wonder (so each wonder power's step is exercised), plus a
// few checks that it plays like it should.

import { describe, it, expect } from 'vitest';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { WONDERS } from './wonders';
import type { SwState } from './types';
import { discardAll, newMatch, playOut, producer, realCard } from './testSupport';

function finished(s: SwState): void {
  expect(s.phase).toBe('gameOver');
  for (const row of s.finalScoringBreakdown!) {
    expect(row.total).toBe(row.military + row.treasury + row.wonder + row.civilian + row.commercial + row.science + row.guild);
  }
}

describe('7 wonders AI', () => {
  it('plays full matches at 3–7 players on either side without an illegal move', () => {
    for (let n = 3; n <= 7; n++) {
      for (const side of ['A', 'B', 'random'] as const) finished(playOut(newMatch(n, { seed: 100 + n, side })));
    }
  });

  it('plays every wonder board, powers included', () => {
    const a = WONDERS.filter((w) => w.side === 'A').map((w) => w.id);
    const b = WONDERS.filter((w) => w.side === 'B').map((w) => w.id);
    for (const seed of [1, 2, 3]) {
      finished(playOut(newMatch(7, { seed, wonders: a })));
      finished(playOut(newMatch(7, { seed, wonders: b })));
    }
  });

  it('builds wonder stages and scores like a player', () => {
    let stages = 0;
    let points = 0;
    let cities = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = playOut(newMatch(4, { seed, side: 'random' }));
      for (const p of s.players) stages += p.wonderStagesBuilt;
      for (const r of s.finalScoringBreakdown!) points += r.total;
      cities += s.players.length;
    }
    expect(stages / cities).toBeGreaterThanOrEqual(1.2);
    expect(points / cities).toBeGreaterThanOrEqual(35);
  });

  it('takes the chain build and the free Olympia build when they pay off', () => {
    let s = newMatch(3, { wonders: ['olympia-a', 'gizah-a', 'rhodes-a'] });
    const me = s.players[0];
    me.wonderStagesBuilt = 2;
    me.coins = 0;
    me.hand = [realCard('Palace'), realCard('Lumber Yard')];
    const a = chooseAIAction(s, 'p0');
    expect(a).toMatchObject({ type: 'submitPick', pick: { kind: 'build', cardId: me.hand[0].id, free: 'olympia' } });

    // Age II: the Aqueduct is free through the Baths; the Statue costs coins.
    s = newMatch(3, { wonders: ['rhodes-a', 'gizah-a', 'olympia-a'] });
    s.age = 2;
    s.players[0].tableau.push(realCard('Baths'));
    const aqueduct = realCard('Aqueduct');
    s.players[0].hand = [realCard('Statue'), aqueduct];
    expect(chooseAIAction(s, 'p0')).toMatchObject({ pick: { kind: 'build', cardId: aqueduct.id } });
  });

  it('shores up a battle it is losing', () => {
    const s = newMatch(3, { wonders: ['rhodes-a', 'gizah-a', 'olympia-a'] });
    s.ageRound = 6;
    s.players[1].tableau.push(realCard('Stockade'));
    s.players[2].tableau.push(realCard('Barracks'));
    s.players[0].tableau.push(producer('wood', 'clay'));
    const tower = realCard('Guard Tower'), stockade = realCard('Stockade');
    s.players[0].hand = [tower, realCard('Lumber Yard')];
    s.players[0].tableau.push(stockade);
    // 1 shield vs 1 + 1: the Guard Tower turns two draws into two wins.
    expect(chooseAIAction(s, 'p0')).toMatchObject({ pick: { kind: 'build', cardId: tower.id } });
  });

  it('builds the best card from the discard pile (Halicarnassus)', () => {
    let s = newMatch(3, { wonders: ['halicarnassus-a', 'gizah-a', 'rhodes-a'] });
    s.players[0].wonderStagesBuilt = 1;
    s.players[0].tableau.push(producer('ore', 'ore', 'ore'));
    s.players[1].hand[0] = realCard('Palace');
    s = applyAction(s, {
      type: 'submitPick', playerId: 'p0',
      pick: { kind: 'wonder', cardId: s.players[0].hand[0].id, stageIndex: 1, payment: { fromWest: [], fromEast: [], coins: 0 } },
    });
    s = discardAll(s);
    expect(s.subPhase).toBe('discardBuild');
    const a = chooseAIAction(s, 'p0');
    expect(a).toMatchObject({ type: 'buildFromDiscard', playerId: 'p0' });
    const built = s.discard.find((c) => a?.type === 'buildFromDiscard' && c.id === a.cardId);
    expect(built?.name).toBe('Palace');
    expect(chooseAIAction(s, 'p1')).toBeNull();
  });
});
