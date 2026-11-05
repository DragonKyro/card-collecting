// Babel — the Tower of Babel: draft, building tiles, the tower, every tile's
// rule, scoring.

import { describe, expect, it } from 'vitest';
import { applyAction, _internals, pickCostFor } from '../../reducer';
import {
  canChainBuild, effectiveCostFor, neighborPurchasePrice, productionCanSupply, productionFor, sellableProductionFor,
} from '../../resources';
import { scoreMatch } from '../../scoring';
import type { SwState } from '../../types';
import { newMatch, playOut, realCard, discardAll } from '../../testSupport';
import { BABEL_TILES, towerVp } from './cards';
import { activeTiles } from './tower';

const NO_PAY = { fromWest: [], fromEast: [], coins: 0 };
const WONDERS = ['gizah-a', 'rhodes-a', 'ephesos-a', 'alexandria-a', 'olympia-a', 'babylon-a', 'halicarnassus-a'];

function tower(n = 3): SwState {
  return newMatch(n, { expansions: ['babelTower'], wonders: WONDERS.slice(0, n), seed: 9 });
}

/** A match in Age I with these tiles showing. */
function withTiles(ids: number[], n = 3): SwState {
  const s = playOut(tower(n), (x) => x.subPhase === 'picking');
  s.babelTower = s.babelTower!.map((_, i) => (ids[i] !== undefined ? [ids[i]] : []));
  return s;
}

describe('Tower of Babel: draft and building', () => {
  it('drafts 3 tiles each before Age I (keep one, pass right, keep the last)', () => {
    let s = tower(3);
    expect(s.subPhase).toBe('babelDraft');
    const before = Object.fromEntries(s.players.map((p) => [p.id, s.babelDraftHands![p.id].slice()]));
    for (const p of s.players) s = applyAction(s, { type: 'submitBabelDraft', playerId: p.id, tileId: before[p.id][0] });
    expect(s.babelDraftHands!.p1).toEqual(before.p0.slice(1));
    for (const p of s.players) s = applyAction(s, { type: 'submitBabelDraft', playerId: p.id, tileId: s.babelDraftHands![p.id][0] });
    expect(s.subPhase).toBe('picking');
    expect(s.players.every((p) => p.babelHand!.length === 3)).toBe(true);
    const all = s.players.flatMap((p) => p.babelHand!);
    expect(new Set(all).size).toBe(9);
  });

  it('with Leaders, the leader draft comes first', () => {
    const s = newMatch(3, { expansions: ['leaders', 'babelTower'], seed: 2 });
    expect(s.subPhase).toBe('leaderDraft');
    const after = playOut(s, (x) => x.subPhase !== 'leaderDraft');
    expect(after.subPhase).toBe('babelDraft');
  });

  it('a discarded card builds a tile; tiles go on clockwise, lowest number first, then cover the oldest', () => {
    let s = playOut(tower(3), (x) => x.subPhase === 'picking');
    for (const p of s.players) p.babelHand = [10 + s.players.indexOf(p), 20 + s.players.indexOf(p)];
    s = applyAction(s, { type: 'submitPick', playerId: 'p0', pick: { kind: 'babelTile', cardId: s.players[0].hand[0].id, tileId: 10 } });
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', pick: { kind: 'babelTile', cardId: s.players[1].hand[0].id, tileId: 11 } });
    s = applyAction(s, { type: 'submitPick', playerId: 'p2', pick: { kind: 'discard', cardId: s.players[2].hand[0].id } });
    expect(s.babelTower).toEqual([[10], [11], []]);
    expect(s.players[0].coins).toBe(3); // no 3 coins for a tile
    for (const id of ['p0', 'p1', 'p2']) {
      const i = Number(id[1]);
      s = applyAction(s, { type: 'submitPick', playerId: id, pick: { kind: 'babelTile', cardId: s.players[i].hand[0].id, tileId: 20 + i } });
    }
    expect(s.babelTower).toEqual([[10, 21], [11, 22], [20]]);
    expect(activeTiles(s)).toEqual(new Set([21, 22, 20]));
    expect(s.players.map((p) => p.babelBuilt)).toEqual([2, 2, 1]);
  });

  it('refuses a tile you do not hold, and tiles without the tower', () => {
    const s = playOut(tower(3), (x) => x.subPhase === 'picking');
    s.players[0].babelHand = [5];
    expect(() => applyAction(s, { type: 'submitPick', playerId: 'p0', pick: { kind: 'babelTile', cardId: s.players[0].hand[0].id, tileId: 6 } })).toThrow();
    const base = newMatch(3);
    expect(() => applyAction(base, { type: 'submitPick', playerId: 'p0', pick: { kind: 'babelTile', cardId: base.players[0].hand[0].id, tileId: 6 } })).toThrow();
  });

  it('has 3 spaces at 2–4 players, 4 at 5–8; 1/2/3 tiles score 2/5/10', () => {
    expect(tower(4).babelTower).toHaveLength(3);
    expect(tower(5).babelTower).toHaveLength(4);
    expect([towerVp(0), towerVp(1), towerVp(2), towerVp(3)]).toEqual([0, 2, 5, 10]);
    const s = tower(3);
    s.players[0].babelBuilt = 3;
    expect(scoreMatch(s).find((r) => r.playerId === 'p0')!.extras?.tower).toBe(10);
    expect(BABEL_TILES).toHaveLength(24);
  });
});

describe('Tower of Babel: the tiles', () => {
  it('taxes red / blue / chain / wonder builds by the Age (1, 6, 13, 16)', () => {
    const s = withTiles([1, 6, 16]);
    const me = s.players[0];
    expect(effectiveCostFor(s, me, { kind: 'card', card: realCard('Stockade') }).coins).toBe(1);
    expect(effectiveCostFor(s, me, { kind: 'card', card: realCard('Altar') }).coins).toBe(1);
    s.age = 2;
    expect(effectiveCostFor(s, me, { kind: 'wonderStage', stageIndex: 0, stage: { cost: {}, effects: [], text: '' } }).coins).toBe(2);
    const chained = withTiles([13]);
    chained.age = 3;
    expect(effectiveCostFor(chained, me, { kind: 'chain', card: realCard('Pantheon') }).coins).toBe(3);
  });

  it('frees red cards / wonder stages of resources (2, 15) and makes blue / purple coins (8, 23)', () => {
    const s = withTiles([2, 15, 8]);
    const me = s.players[0];
    expect(effectiveCostFor(s, me, { kind: 'card', card: realCard('Barracks') }).resources).toEqual([]);
    expect(effectiveCostFor(s, me, { kind: 'wonderStage', stageIndex: 0, stage: { cost: { resources: ['stone', 'stone'] }, effects: [], text: '' } }).resources).toEqual([]);
    expect(effectiveCostFor(s, me, { kind: 'card', card: realCard('Baths') })).toMatchObject({ coins: 1, resources: [] });
    const g = withTiles([23]);
    expect(effectiveCostFor(g, me, { kind: 'card', card: realCard('Builders Guild') })).toMatchObject({ coins: 5, resources: [] });
  });

  it('changes neighbour prices (9–12), never below 0, and can switch off the trading posts (4)', () => {
    const s = withTiles([11, 10]);
    const me = s.players[0];
    expect(neighborPurchasePrice(s, me, 'east', 'ore')).toBe(1);
    expect(neighborPurchasePrice(s, me, 'east', 'glass')).toBe(3);
    me.tableau.push(realCard('East Trading Post'));
    expect(neighborPurchasePrice(s, me, 'east', 'ore')).toBe(0);
    const off = withTiles([4]);
    off.players[0].tableau.push(realCard('East Trading Post'));
    expect(neighborPurchasePrice(off, off.players[0], 'east', 'ore')).toBe(2);
  });

  it('gives free resources (17, 18, 21), blocks double browns (3), multiplies single browns (20)', () => {
    let s = withTiles([17, 21]);
    const me = s.players[0];
    expect(productionCanSupply(productionFor(s, me), ['wood', 'loom'])).toBe(true);
    expect(productionCanSupply(sellableProductionFor(s, me), ['wood'])).toBe(false);
    s = withTiles([3]);
    s.players[0].tableau.push(realCard('Sawmill'), realCard('Lumber Yard'));
    expect(productionFor(s, s.players[0]).fixed.get('wood')).toBe(1);
    s = withTiles([20]);
    s.players[0].tableau.push(realCard('Lumber Yard'));
    expect(productionCanSupply(productionFor(s, s.players[0]), ['wood', 'wood', 'wood', 'wood'])).toBe(true);
  });

  it('lets chains use the neighbours\' buildings (7)', () => {
    const s = withTiles([7]);
    s.players[1].tableau.push(realCard('Baths'));
    expect(canChainBuild(s, s.players[0], realCard('Aqueduct'))).toBe(true);
    s.babelTower = [[], [], []];
    expect(canChainBuild(s, s.players[0], realCard('Aqueduct'))).toBe(false);
  });

  it('pays for blue builds and chains (5, 14) and guilds (24)', () => {
    let s = withTiles([5]);
    const me = s.players[0];
    me.hand[0] = realCard('Altar');
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.players[0].coins).toBe(3 + 1);
  });

  it('changes the military tokens (19, 22)', () => {
    const s = withTiles([19, 22]);
    s.age = 2;
    s.players[0].tableau.push(realCard('Barracks'));
    _internals.resolveMilitary(s);
    expect(s.players[0].militaryTokens).toEqual([1, 1]);
    expect(s.players[1].militaryTokens).toEqual([-1, -1]);
    expect(s.players[2].militaryTokens).toEqual([-1, -1]);
  });

  it('pick costs include the taxes', () => {
    const s = withTiles([1]);
    const me = s.players[0];
    const card = realCard('Stockade');
    me.hand[0] = card;
    expect(pickCostFor(s, me, { kind: 'build', cardId: card.id, payment: NO_PAY }, card)).toMatchObject({ coins: 1 });
  });
});

describe('Tower of Babel: AI', () => {
  it('plays whole matches at 3–8 players with every expansion', () => {
    for (let n = 3; n <= 8; n++) {
      const s = playOut(newMatch(n, { expansions: ['leaders', 'cities', 'babelTower', 'babelProjects'], seed: 60 + n, side: 'random' }));
      expect(s.phase).toBe('gameOver');
      expect(s.players.some((p) => (p.babelBuilt ?? 0) > 0)).toBe(true);
    }
  });
});
