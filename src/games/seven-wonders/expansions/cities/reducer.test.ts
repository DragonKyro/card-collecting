// Cities — coin losses and debt, diplomacy, masks, the docks, the warehouse
// and the market, the Architect Cabinet, and the scoring columns.

import { describe, expect, it } from 'vitest';
import { applyAction, _internals } from '../../reducer';
import { effectiveCostFor, planPayment, productionFor, tradeCoins } from '../../resources';
import { scoreMatch } from '../../scoring';
import type { SwState } from '../../types';
import { newMatch, playOut, producer, realCard, discardAll } from '../../testSupport';
import { wonderById } from '../../wonders';

const NO_PAY = { fromWest: [], fromEast: [], coins: 0 };

function cities(n = 3, wonders = ['gizah-a', 'rhodes-a', 'ephesos-a', 'alexandria-a', 'olympia-a', 'babylon-a', 'halicarnassus-a']): SwState {
  return newMatch(n, { expansions: ['cities'], wonders: wonders.slice(0, n), seed: 3 });
}

describe('Cities: coin losses and debt', () => {
  it('a city with no coins takes debt; one with coins decides, the rest is debt', () => {
    let s = cities(3);
    const me = s.players[0];
    me.hand[0] = realCard('Lair');
    me.tableau.push(producer('wood', 'glass'));
    s.players[1].coins = 0;
    s.players[2].coins = 5;
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY } });
    // p1 sells (3 coins — but losses are settled after the turn's income).
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', pick: { kind: 'discard', cardId: s.players[1].hand[0].id } });
    s = applyAction(s, { type: 'submitPick', playerId: 'p2', pick: { kind: 'discard', cardId: s.players[2].hand[0].id } });
    expect(s.subPhase).toBe('debt');
    expect(s.pendingLosses).toEqual({ p1: 2, p2: 2 });
    expect(() => applyAction(s, { type: 'settleDebt', playerId: 'p0', coins: 0 })).toThrow();
    s = applyAction(s, { type: 'settleDebt', playerId: 'p1', coins: 1 });
    s = applyAction(s, { type: 'settleDebt', playerId: 'p2', coins: 2 });
    expect(s.subPhase).toBe('picking');
    expect([s.players[1].coins, s.players[1].debtTokens]).toEqual([2, 1]);
    expect([s.players[2].coins, s.players[2].debtTokens]).toEqual([6, 0]);
    expect(s.players[0].debtTokens).toBe(0);
  });

  it('Sepulcher and Builders Union count victory tokens and wonder stages', () => {
    let s = cities(3);
    s.age = 2;
    const me = s.players[0];
    me.hand[0] = realCard('Sepulcher');
    me.tableau.push(producer('ore', 'glass'));
    s.players[1].militaryTokens = [1, 3, -1];
    s.players[2].militaryTokens = [];
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.pendingLosses).toEqual({ p1: 2 });
  });

  it('Gambling Den: 6 coins, each neighbour 1', () => {
    let s = cities(3);
    const me = s.players[0];
    me.hand[0] = realCard('Gambling Den');
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.players.map((p) => p.coins)).toEqual([3 + 6, 3 + 3 + 1, 3 + 3 + 1]);
  });

  it('debt costs 1 VP each, black cards score in their own column', () => {
    const s = cities(3);
    const me = s.players[0];
    me.debtTokens = 4;
    me.tableau = [realCard('Capitol'), realCard('Secret Society'), realCard('Pigeon Loft')];
    const row = scoreMatch(s).find((r) => r.playerId === me.id)!;
    expect(row.extras).toMatchObject({ cities: 8 + 3, debt: -4 });
  });
});

describe('Cities: diplomacy', () => {
  it('a city with a token sits out; its neighbours fight across the gap', () => {
    const s = cities(4);
    s.players[0].diplomacyTokens = 1;
    s.players[0].tableau = [realCard('Stockade')];
    s.players[1].tableau = [realCard('Stockade'), realCard('Barracks')];
    s.players[3].tableau = [];
    const summary = _internals.resolveMilitary(s);
    expect(s.players[0].militaryTokens).toEqual([]);
    expect(s.players[0].diplomacyTokens).toBe(0);
    expect(summary.perPlayer[0].diplomacy).toBe(true);
    // p1 (2 shields) now faces p3 (0) on its west.
    expect(s.players[1].militaryTokens).toContain(1);
    expect(s.players[3].militaryTokens).toContain(-1);
  });

  it('with only two cities left in a conflict they fight once', () => {
    const s = cities(3);
    s.players[0].diplomacyTokens = 1;
    s.players[1].tableau = [realCard('Stockade')];
    _internals.resolveMilitary(s);
    expect(s.players[1].militaryTokens).toEqual([1]);
    expect(s.players[2].militaryTokens).toEqual([-1]);
  });
});

describe('Cities: card powers', () => {
  it('masks copy the best of the neighbours\' green-card symbols', () => {
    const s = cities(3);
    const me = s.players[0];
    me.tableau = [realCard('Apothecary'), realCard('Workshop'), realCard('Pigeon Loft'), realCard('Spy Ring')];
    s.players[1].tableau = [realCard('Scriptorium')];
    s.players[2].tableau = [realCard('Library')];
    // compass + gear + 2 tablets copied: 1 + 1 + 4 + 7.
    expect(scoreMatch(s).find((r) => r.playerId === me.id)!.science).toBe(13);
  });

  it('Clandestine Docks take 1 off the first unit bought from that side', () => {
    const s = cities(3);
    const me = s.players[0];
    expect(tradeCoins(s, me, ['ore', 'ore'], [])).toEqual({ toWest: 4, toEast: 0 });
    me.tableau.push(realCard('Clandestine Dock West'));
    expect(tradeCoins(s, me, ['ore', 'ore'], [])).toEqual({ toWest: 3, toEast: 0 });
    expect(tradeCoins(s, me, [], ['ore'])).toEqual({ toWest: 0, toEast: 2 });
  });

  it('Secret Warehouse adds one of what you make; Black Market one of what you don\'t', () => {
    const s = cities(3);
    const me = s.players[0]; // Gizah: stone
    me.tableau.push(realCard('Secret Warehouse'));
    let prod = productionFor(s, me);
    expect(prod.choices).toContainEqual(['stone']);
    me.tableau.push(realCard('Black Market'));
    prod = productionFor(s, me);
    expect(prod.choices.find((c) => c.length === 6)).toEqual(['wood', 'ore', 'clay', 'glass', 'papyrus', 'loom']);
    // Neither is sold to the neighbours.
    expect(planPayment(s, s.players[1], { resources: ['stone', 'stone'] }).ok).toBe(false);
  });

  it('the Architect Cabinet makes wonder stages free of resources', () => {
    const s = cities(3);
    const me = s.players[0];
    const stage = wonderById(me.wonderId).stages[0];
    expect(effectiveCostFor(s, me, { kind: 'wonderStage', stageIndex: 0, stage }).resources?.length).toBe(2);
    me.tableau.push(realCard('Architect Cabinet'));
    expect(effectiveCostFor(s, me, { kind: 'wonderStage', stageIndex: 0, stage }).resources).toEqual([]);
  });

  it('Petra B makes the others lose 2 coins; its 2nd stage costs 14 coins', () => {
    let s = cities(3, ['petra-b', 'gizah-a', 'rhodes-a']);
    const me = s.players[0];
    me.tableau.push(producer('clay', 'ore', 'ore'));
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'wonder', cardId: me.hand[0].id, stageIndex: 0, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.subPhase).toBe('debt');
    expect(s.pendingLosses).toEqual({ p1: 2, p2: 2 });
    expect(wonderById('petra-b').stages[1].cost).toEqual({ coins: 14 });
  });
});

describe('Cities: AI', () => {
  it('plays whole matches at 3–8 players', () => {
    for (let n = 3; n <= 8; n++) {
      const s = playOut(newMatch(n, { expansions: ['cities'], seed: 40 + n, side: 'random' }));
      expect(s.phase).toBe('gameOver');
    }
  });
});
