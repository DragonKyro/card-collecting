// 7 Wonders base-game rules: deck make-up, passing, trading, simultaneous
// resolution, military tokens, and the wonder powers (Babylon's 7th card,
// Halicarnassus' discard build, Olympia's free build).

import { describe, it, expect } from 'vitest';
import { createRng } from '@/core/rng';
import { sevenWondersModule } from './module';
import { applyAction, _internals, canBuildFree } from './reducer';
import { buildAgeDeck, buildAgeIIIDeck } from './cards';
import { planPayment, sellableProductionFor } from './resources';
import { WONDERS, wonderById } from './wonders';
import type { SwState } from './types';
import { discardAll, newMatch, producer, realCard, testCard } from './testSupport';

const copies = (deck: { name: string }[], name: string) => deck.filter((c) => c.name === name).length;

describe('decks', () => {
  it('every Age holds exactly 7 cards per player at 3–7 players', () => {
    for (let n = 3; n <= 7; n++) {
      expect(buildAgeDeck(1, n)).toHaveLength(7 * n);
      expect(buildAgeDeck(2, n)).toHaveLength(7 * n);
      const age3 = buildAgeIIIDeck(createRng(n), n);
      expect(age3).toHaveLength(7 * n);
      expect(age3.filter((c) => c.color === 'purple')).toHaveLength(n + 2);
    }
  });

  it('follows the rulebook copy counts', () => {
    expect(copies(buildAgeDeck(1, 3), 'Lumber Yard')).toBe(1);
    expect(copies(buildAgeDeck(1, 4), 'Lumber Yard')).toBe(2);
    expect(copies(buildAgeDeck(1, 7), 'Ore Vein')).toBe(2);
    expect(copies(buildAgeDeck(1, 5), 'Stone Pit')).toBe(2);
    expect(copies(buildAgeDeck(1, 6), 'Loom')).toBe(2);
    expect(copies(buildAgeDeck(1, 6), 'Pawnshop')).toBe(1);
    expect(copies(buildAgeDeck(1, 7), 'Pawnshop')).toBe(2);
    expect(copies(buildAgeDeck(1, 7), 'Baths')).toBe(2);
    expect(copies(buildAgeDeck(2, 7), 'Forum')).toBe(3);
    expect(copies(buildAgeDeck(3, 6), 'Circus')).toBe(3);
  });

  it('wonder boards match the printed costs that were wrong before', () => {
    expect(wonderById('ephesos-a').stages[2].cost.resources).toEqual(['papyrus', 'papyrus']);
    expect(wonderById('halicarnassus-a').stages[2].cost.resources).toEqual(['loom', 'loom']);
    expect(wonderById('babylon-a').stages[1].effects).toEqual([{ kind: 'scienceWild' }]);
    expect(wonderById('babylon-b').stages.map((st) => st.cost.resources)).toEqual([
      ['clay', 'loom'], ['wood', 'wood', 'glass'], ['clay', 'clay', 'clay', 'papyrus'],
    ]);
    // Every stage does something.
    for (const w of WONDERS) for (const st of w.stages) expect(st.effects.length).toBeGreaterThan(0);
  });
});

describe('passing', () => {
  it('Age I passes to the west (left) neighbour, Age II to the east', () => {
    let s = newMatch(4);
    const before = s.players.map((p) => p.hand.slice(1).map((c) => c.id));
    s = discardAll(s);
    expect(s.ageRound).toBe(2);
    // Player i now holds what player i+1 (its east neighbour) passed west.
    for (let i = 0; i < 4; i++) expect(s.players[i].hand.map((c) => c.id)).toEqual(before[(i + 1) % 4]);

    for (let k = 0; k < 6; k++) s = discardAll(s);
    s = applyAction(s, { type: 'continue' });
    expect(s.age).toBe(2);
    const before2 = s.players.map((p) => p.hand.slice(1).map((c) => c.id));
    s = discardAll(s);
    for (let i = 0; i < 4; i++) expect(s.players[i].hand.map((c) => c.id)).toEqual(before2[(i + 3) % 4]);
  });
});

describe('trading', () => {
  it("a neighbour's starting wonder resource is for sale; yellow and stage production is not", () => {
    const s = newMatch(3, { wonders: ['rhodes-a', 'gizah-a', 'alexandria-a'] });
    const [me, east] = s.players;
    const plan = planPayment(s, me, { resources: ['stone'] });
    expect(plan).toMatchObject({ ok: true, totalCoins: 2, payment: { fromEast: ['stone'], fromWest: [] } });

    east.tableau.push(realCard('Caravansery'));
    east.wonderId = 'alexandria-b';
    east.wonderStagesBuilt = 1; // raw choice from a stage
    const sells = sellableProductionFor(s, east);
    expect(sells.choices).toEqual([]);
    expect([...sells.fixed.entries()]).toEqual([['glass', 1]]);
  });

  it('finds the cheapest split: own choice cards first, then the discounted neighbour', () => {
    const s = newMatch(3, { wonders: ['rhodes-a', 'gizah-a', 'olympia-a'] });
    const me = s.players[0];
    me.tableau.push(realCard('Tree Farm'), realCard('Forest Cave')); // wood/clay, wood/ore
    expect(planPayment(s, me, { resources: ['wood', 'clay'] })).toMatchObject({ ok: true, totalCoins: 0 });

    // Stone: east (Gizah) and west (Olympia) — only east sells it; with the
    // East Trading Post it costs 1.
    me.tableau.push(realCard('East Trading Post'));
    expect(planPayment(s, me, { resources: ['stone'] })).toMatchObject({ ok: true, totalCoins: 1, payment: { fromEast: ['stone'] } });
    // Clay, 2 ore and wood: both choice cards go to clay and the second ore,
    // so the wood is bought west (Olympia's starting wood, no discount).
    expect(planPayment(s, me, { resources: ['clay', 'ore', 'ore', 'wood'] })).toMatchObject({ ok: true, totalCoins: 2, payment: { fromWest: ['wood'] } });

    me.coins = 1;
    expect(planPayment(s, me, { resources: ['clay', 'ore', 'ore', 'wood'] })).toEqual({ ok: false, reason: 'coins', totalCoins: 2 });
    expect(planPayment(s, me, { resources: ['papyrus'] })).toMatchObject({ ok: false, reason: 'resources' });
  });
});

describe('simultaneous resolution', () => {
  function vineyardTurn(vineyardSeat: number, lumberSeat: number): number {
    let s = newMatch(3);
    s.players[vineyardSeat].hand[0] = realCard('Vineyard');
    s.players[lumberSeat].hand[0] = realCard('Lumber Yard');
    for (const [i, p] of s.players.entries()) {
      const c = p.hand[0];
      const pick = i === vineyardSeat || i === lumberSeat
        ? { kind: 'build' as const, cardId: c.id, payment: { fromWest: [], fromEast: [], coins: 0 } }
        : { kind: 'discard' as const, cardId: c.id };
      s = applyAction(s, { type: 'submitPick', playerId: p.id, pick });
    }
    return s.players[vineyardSeat].coins;
  }

  it("Vineyard counts a neighbour's brown card built the same turn, whatever the seat order", () => {
    expect(vineyardTurn(0, 1)).toBe(4);
    expect(vineyardTurn(1, 0)).toBe(4);
    expect(vineyardTurn(2, 0)).toBe(4);
  });

  it('a payment is validated against the start of the turn', () => {
    let s = newMatch(3, { wonders: ['rhodes-a', 'gizah-a', 'olympia-a'] });
    // East builds a Clay Pool this turn; I can't buy clay from it yet.
    s.players[1].hand[0] = realCard('Clay Pool');
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', pick: { kind: 'build', cardId: s.players[1].hand[0].id, payment: { fromWest: [], fromEast: [], coins: 0 } } });
    s.players[0].hand[0] = realCard('Guard Tower');
    expect(() => applyAction(s, {
      type: 'submitPick', playerId: 'p0',
      pick: { kind: 'build', cardId: s.players[0].hand[0].id, payment: { fromWest: [], fromEast: ['clay'], coins: 0 } },
    })).toThrow(/East neighbor cannot supply/);
  });
});

describe('military', () => {
  it('records one token per battle, so a win never hides a defeat', () => {
    const s = newMatch(3);
    s.age = 2;
    s.players[0].tableau.push(testCard('S2', 'red', [{ kind: 'shields', shields: 2 }]));
    s.players[1].tableau.push(testCard('S3', 'red', [{ kind: 'shields', shields: 3 }]));
    const summary = _internals.resolveMilitary(s);
    // p0 beats west (p2, 0 shields), loses to east (p1).
    expect(s.players[0].militaryTokens).toEqual([3, -1]);
    expect(summary.perPlayer[0]).toMatchObject({ vsWest: 'win', vsEast: 'loss', tokenGained: 2 });
    expect(s.players[1].militaryTokens).toEqual([3, 3]);
    expect(s.players[2].militaryTokens).toEqual([-1, -1]);
  });
});

/** Play discard-only turns until `round` of Age I is open. */
function toRound(s: SwState, round: number): SwState {
  while (s.ageRound < round) s = discardAll(s);
  return s;
}

describe('Babylon B: the 7th card', () => {
  it('the Hanging Gardens play their last card as a turn of their own', () => {
    let s = newMatch(3, { wonders: ['babylon-b', 'gizah-a', 'rhodes-a'] });
    s.players[0].wonderStagesBuilt = 2;
    s = toRound(s, 6);
    s = discardAll(s);
    expect(s.ageRound).toBe(7);
    expect(s.subPhase).toBe('picking');
    expect(s.players.map((p) => p.hand.length)).toEqual([1, 0, 0]);
    expect(s.activePlayerId).toBe('p0');
    expect(s.discard).toHaveLength(6 * 3 + 2);
    expect(() => discardAll({ ...s })).not.toThrow();
    s = discardAll(s);
    expect(s.subPhase).toBe('militaryEnd');
    expect(s.discard).toHaveLength(21);
  });

  it('without the power, the Age ends after the 6th pick', () => {
    let s = newMatch(3, { wonders: ['babylon-b', 'gizah-a', 'rhodes-a'] });
    s.players[0].wonderStagesBuilt = 1;
    s = toRound(s, 6);
    s = discardAll(s);
    expect(s.subPhase).toBe('militaryEnd');
    expect(s.discard).toHaveLength(21);
  });
});

describe('Halicarnassus: build from the discard pile', () => {
  function stageTurn(round: number): SwState {
    let s = newMatch(3, { wonders: ['halicarnassus-a', 'gizah-a', 'rhodes-a'] });
    s.players[0].wonderStagesBuilt = 1;
    s.players[0].tableau.push(producer('ore', 'ore', 'ore'));
    s = toRound(s, round);
    const me = s.players[0];
    s = applyAction(s, {
      type: 'submitPick', playerId: 'p0',
      pick: { kind: 'wonder', cardId: me.hand[0].id, stageIndex: 1, payment: { fromWest: [], fromEast: [], coins: 0 } },
    });
    return discardAll(s);
  }

  it('the stage opens a free build from the discard pile at the end of the turn', () => {
    let s = stageTurn(2);
    expect(s.subPhase).toBe('discardBuild');
    expect(s.activePlayerId).toBe('p0');
    expect(s.ageRound).toBe(2);
    expect(s.discard).toHaveLength(3 + 2);
    expect(() => applyAction(s, { type: 'buildFromDiscard', playerId: 'p1', cardId: null })).toThrow(/not your pick/);
    const target = s.discard[0];
    const coins = s.players[0].coins;
    s = applyAction(s, { type: 'buildFromDiscard', playerId: 'p0', cardId: target.id });
    expect(s.players[0].tableau.map((c) => c.id)).toContain(target.id);
    expect(s.discard.map((c) => c.id)).not.toContain(target.id);
    expect(s.players[0].coins).toBeGreaterThanOrEqual(coins); // free (Tavern-like income still pays)
    expect(s.subPhase).toBe('picking');
    expect(s.ageRound).toBe(3);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.log.at(-1)).toMatchObject({ kind: 'discardBuilt', playerId: 'p0', cardId: target.id });
  });

  it('may pass; on the 6th turn the Age’s last cards are in the pile', () => {
    let s = stageTurn(6);
    expect(s.subPhase).toBe('discardBuild');
    expect(s.discard).toHaveLength(5 * 3 + 2 + 3); // five turns, two sales, three last cards
    s = applyAction(s, { type: 'buildFromDiscard', playerId: 'p0', cardId: null });
    expect(s.subPhase).toBe('militaryEnd');
  });

  it('a card the city already owns can’t be taken', () => {
    const s = stageTurn(2);
    const dup = s.discard[0];
    s.players[0].tableau.push({ ...dup, id: 99999 });
    expect(() => applyAction(s, { type: 'buildFromDiscard', playerId: 'p0', cardId: dup.id })).toThrow(/can't be built/);
  });
});

describe('Olympia A: one free build per Age', () => {
  it('builds anything for free once per Age', () => {
    let s = newMatch(3, { wonders: ['olympia-a', 'gizah-a', 'rhodes-a'] });
    s.players[0].wonderStagesBuilt = 2;
    const palace = realCard('Palace');
    s.players[0].hand[0] = palace;
    expect(canBuildFree(s, s.players[0])).toBe(true);
    s = applyAction(s, {
      type: 'submitPick', playerId: 'p0',
      pick: { kind: 'build', cardId: palace.id, payment: { fromWest: [], fromEast: [], coins: 0 }, free: true },
    });
    s = discardAll(s);
    expect(s.players[0].tableau.map((c) => c.name)).toContain('Palace');
    expect(s.players[0].coins).toBe(3);
    expect(s.players[0].freeBuildUsedAge).toBe(1);
    expect(canBuildFree(s, s.players[0])).toBe(false);
    expect(() => applyAction(s, {
      type: 'submitPick', playerId: 'p0',
      pick: { kind: 'build', cardId: s.players[0].hand[0].id, payment: { fromWest: [], fromEast: [], coins: 0 }, free: true },
    })).toThrow(/No free build/);
    expect(canBuildFree({ ...s, age: 2 }, s.players[0])).toBe(true);
  });

  it('is not available before the stage is built', () => {
    const s = newMatch(3, { wonders: ['olympia-a', 'gizah-a', 'rhodes-a'] });
    s.players[0].wonderStagesBuilt = 1;
    expect(() => applyAction(s, {
      type: 'submitPick', playerId: 'p0',
      pick: { kind: 'build', cardId: s.players[0].hand[0].id, payment: { fromWest: [], fromEast: [], coins: 0 }, free: true },
    })).toThrow(/No free build/);
  });
});

describe('who acts next', () => {
  it('with one human, the AIs pick first and then the human is parked', () => {
    let s = newMatch(3, { humans: [0] });
    expect(s.activePlayerId).toBe('p1');
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', pick: { kind: 'discard', cardId: s.players[1].hand[0].id } });
    s = applyAction(s, { type: 'submitPick', playerId: 'p2', pick: { kind: 'discard', cardId: s.players[2].hand[0].id } });
    expect(s.activePlayerId).toBe('p0');
  });

  it('with several humans, every human (hot-seat) gets the device before the AIs', () => {
    let s = newMatch(4, { humans: [0, 2] });
    expect(s.activePlayerId).toBe('p0');
    s = applyAction(s, { type: 'submitPick', playerId: 'p0', pick: { kind: 'discard', cardId: s.players[0].hand[0].id } });
    expect(s.activePlayerId).toBe('p2');
    s = applyAction(s, { type: 'submitPick', playerId: 'p2', pick: { kind: 'discard', cardId: s.players[2].hand[0].id } });
    expect(s.activePlayerId).toBe('p1');
  });
});

describe('wonder assignment', () => {
  it('a manual pick for some seats leaves the rest random and distinct', () => {
    const s = newMatch(4, { wonders: ['', 'olympia-b', '', ''], side: 'B', seed: 5 });
    expect(s.players[1].wonderId).toBe('olympia-b');
    const names = s.players.map((p) => wonderById(p.wonderId).name);
    expect(new Set(names).size).toBe(4);
    expect(s.players.every((p) => p.wonderId.endsWith('-b'))).toBe(true);
  });

  it('two seats on the same wonder is a config error', () => {
    const seated = sevenWondersModule.validateConfig(
      { expansions: [], wonderAssignment: 'preset', wonderSide: 'A', presetWonders: ['gizah-a', 'gizah-b', ''] },
      newMatch(3).seats,
    );
    expect(seated[0]).toMatch(/Pyramids of Gizah/);
  });
});
