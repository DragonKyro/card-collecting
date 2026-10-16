// Smoke tests for Sushi Go! Party reducer.
//
// Focus: drive a tiny 2-player match through start → all-submit → reveal → score
// flow without throwing, and check that the round summary contains expected scoring.

import { describe, it, expect } from 'vitest';
import { sushiGoModule, attachSeatsAndStart } from './module';
import { applyAction } from './reducer';
import type { SushiGoState, SushiGoCard, SushiGoCardKind } from './types';
import { DEFAULT_MENU } from './cards';
import type { Seat } from '@/core/types';

function seats(): Seat[] {
  return [
    { id: 'p1', name: 'P1', color: '#f00', isAI: false, isLocal: true },
    { id: 'p2', name: 'P2', color: '#00f', isAI: false, isLocal: true },
  ];
}

function makeState(): SushiGoState {
  return sushiGoModule.createInitialState({ menu: DEFAULT_MENU.slice(), rounds: 3 }, 42, seats());
}

describe('sushi-go reducer', () => {
  it('initial state has hands dealt and selecting subPhase', () => {
    const s = makeState();
    expect(s.subPhase).toBe('selecting');
    expect(s.players).toHaveLength(2);
    for (const p of s.players) expect(p.hand.length).toBeGreaterThan(0);
  });

  it('submitPick stores pendingPick without auto-revealing', () => {
    let s = makeState();
    const card = s.players[0].hand[0];
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', cardIds: [card.id] });
    expect(s.subPhase).toBe('selecting');
    expect(s.players[0].pendingPick).not.toBeNull();
    expect(s.players[1].pendingPick).toBeNull();
  });

  it('revealing happens once all players have submitted', () => {
    let s = makeState();
    const c1 = s.players[0].hand[0];
    const c2 = s.players[1].hand[0];
    s = applyAction(s, { type: 'submitPick', playerId: 'p1', cardIds: [c1.id] });
    s = applyAction(s, { type: 'submitPick', playerId: 'p2', cardIds: [c2.id] });
    // After both submit, picks should be on tables and pendingPicks cleared,
    // and hands rotated (player 0's hand should not contain the original card).
    expect(s.players[0].table.length).toBe(1);
    expect(s.players[1].table.length).toBe(1);
    expect(s.players.every((p) => p.pendingPick === null)).toBe(true);
    expect(s.subPhase === 'selecting' || s.subPhase === 'roundEnd').toBe(true);
  });

  it('drives a full round to roundEnd without throwing', () => {
    let s = makeState();
    // Loop: while in selecting, each player picks the first card of their hand.
    let ticks = 0;
    while (s.subPhase === 'selecting' && ticks < 50) {
      for (const p of s.players) {
        if (p.pendingPick == null && p.hand.length > 0) {
          s = applyAction(s, { type: 'submitPick', playerId: p.id, cardIds: [p.hand[0].id] });
        }
      }
      ticks += 1;
    }
    expect(s.subPhase).toBe('roundEnd');
    expect(s.lastRoundSummary).not.toBeNull();
    expect(s.lastRoundSummary!.perPlayer).toHaveLength(2);
  });

  it('nextRound advances and final round triggers matchEnd', () => {
    let s = makeState();
    for (let round = 1; round <= s.config.rounds; round++) {
      // Play to roundEnd
      let ticks = 0;
      while (s.subPhase === 'selecting' && ticks < 50) {
        for (const p of s.players) {
          if (p.pendingPick == null && p.hand.length > 0) {
            s = applyAction(s, { type: 'submitPick', playerId: p.id, cardIds: [p.hand[0].id] });
          }
        }
        ticks += 1;
      }
      expect(s.subPhase).toBe('roundEnd');
      s = applyAction(s, { type: 'nextRound' });
    }
    expect(s.phase).toBe('gameOver');
    expect(s.finalScores).not.toBeNull();
    expect(Object.keys(s.finalScores!).length).toBe(2);
  });

  it('attachSeatsAndStart resets all per-player state', () => {
    const state = sushiGoModule.createInitialState({ menu: DEFAULT_MENU.slice(), rounds: 3 }, 1, seats());
    // Pollute then restart
    state.players[0].dessertPile.push({ id: 9999, kind: 'pudding' });
    attachSeatsAndStart(state, seats());
    expect(state.players[0].dessertPile.length).toBe(0);
    expect(state.players[0].scoreByRound.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Special cards, played out on rigged hands.

let rigId = 5000;
function c(kind: SushiGoCardKind, variant?: string): SushiGoCard {
  return { id: rigId++, kind, ...(variant !== undefined ? { variant } : {}) };
}

function humanSeats(n: number): Seat[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#888', isAI: false, isLocal: true }));
}

const SPECIALS_MENU: SushiGoCardKind[] = ['nigiri', 'uramaki', 'misoSoup', 'tempura', 'eel', 'specialOrder', 'spoon', 'pudding'];
const BOX_MENU: SushiGoCardKind[] = ['nigiri', 'maki', 'tempura', 'sashimi', 'dumpling', 'takeoutBox', 'menu', 'pudding'];

/** A fresh match whose hands / tables are replaced by the given cards. */
function rigged(hands: SushiGoCard[][], tables: SushiGoCard[][] = [], menu = SPECIALS_MENU): SushiGoState {
  const s = sushiGoModule.createInitialState({ menu, rounds: 3 }, 9, humanSeats(hands.length));
  s.players.forEach((p, i) => {
    p.hand = hands[i];
    p.table = tables[i] ?? [];
  });
  return s;
}

function pick(s: SushiGoState, pid: string, cards: SushiGoCard[], useSpoon = false): SushiGoState {
  return applyAction(s, { type: 'submitPick', playerId: pid, cardIds: cards.map((x) => x.id), ...(useSpoon ? { useSpoon } : {}) });
}

/** Everyone not named picks the first card of their hand. */
function othersPickFirst(s: SushiGoState, ...skip: string[]): SushiGoState {
  for (const p of s.players) {
    if (skip.includes(p.id) || p.pendingPick) continue;
    s = pick(s, p.id, [s.players.find((q) => q.id === p.id)!.hand[0]]);
  }
  return s;
}

const player = (s: SushiGoState, pid: string) => s.players.find((p) => p.id === pid)!;
const kinds = (cards: SushiGoCard[]) => cards.map((x) => x.kind);

describe('sushi-go special cards', () => {
  it('passes hands to the left every round, round 2 included', () => {
    let s = sushiGoModule.createInitialState({ menu: DEFAULT_MENU.slice(), rounds: 3 }, 4, humanSeats(3));
    while (s.subPhase === 'selecting') s = othersPickFirst(s);
    s = applyAction(s, { type: 'nextRound' });
    expect(s.round).toBe(2);
    const keptByP0 = s.players[0].hand.slice(1).map((x) => x.id);
    s = othersPickFirst(s);
    expect(s.players[1].hand.map((x) => x.id)).toEqual(keptByP0);
  });

  it('deals the rulebook hand size and dessert count for the player count', () => {
    const s = sushiGoModule.createInitialState({ menu: DEFAULT_MENU.slice(), rounds: 3 }, 3, humanSeats(6));
    expect(s.players.every((p) => p.hand.length === 8)).toBe(true);
    const desserts = [...s.deck, ...s.players.flatMap((p) => p.hand)].filter((x) => x.kind === 'pudding');
    expect(desserts).toHaveLength(7);
    expect(s.dessertSupply).toHaveLength(8);
  });

  it('discards every miso soup when more than one is played in a turn', () => {
    const [m0, m1] = [c('misoSoup'), c('misoSoup')];
    let s = rigged([[m0, c('eel')], [m1, c('eel')], [c('tempura'), c('eel')]]);
    s = othersPickFirst(s);
    expect(kinds(player(s, 'p0').table)).toEqual([]);
    expect(kinds(player(s, 'p1').table)).toEqual([]);
    expect(kinds(s.discards)).toEqual(['misoSoup', 'misoSoup']);

    let s2 = rigged([[c('misoSoup'), c('eel')], [c('eel'), c('eel')], [c('eel'), c('eel')]]);
    s2 = othersPickFirst(s2);
    expect(kinds(player(s2, 'p0').table)).toEqual(['misoSoup']);
  });

  it('scores uramaki the moment 10 icons are reached and discards them', () => {
    let s = rigged([[c('uramaki', '3'), c('eel')], [c('eel'), c('eel')], [c('eel'), c('eel')]], [[c('uramaki', '5'), c('uramaki', '4')]]);
    s = othersPickFirst(s);
    expect(player(s, 'p0').uramakiPoints).toBe(8);
    expect(kinds(player(s, 'p0').table)).toEqual([]);
    expect(s.uramakiNextPlace).toBe(1);
  });

  it('a special order asks its owner what to copy as soon as it is revealed', () => {
    const salmon = c('nigiri', 'salmon');
    const so = c('specialOrder');
    let s = rigged([[so, c('eel')], [c('eel'), c('eel')], [c('eel'), c('eel')]], [[salmon]]);
    s = othersPickFirst(s);
    expect(s.subPhase).toBe('resolving');
    expect(s.activePlayerId).toBe('p0');
    expect(s.resolution!.steps[0]).toMatchObject({ type: 'copy', playerId: 'p0', cardId: so.id });
    expect(() => applyAction(s, { type: 'copyCard', playerId: 'p1', targetId: salmon.id })).toThrow();
    s = applyAction(s, { type: 'copyCard', playerId: 'p0', targetId: salmon.id });
    expect(s.subPhase).toBe('selecting');
    expect(player(s, 'p0').table.find((x) => x.id === so.id)!.copyOf).toEqual({ kind: 'nigiri', variant: 'salmon' });
  });

  it('a special order with nothing to copy is discarded', () => {
    let s = rigged([[c('specialOrder'), c('eel')], [c('eel'), c('eel')], [c('eel'), c('eel')]]);
    s = othersPickFirst(s);
    expect(s.subPhase).toBe('selecting');
    expect(player(s, 'p0').table).toEqual([]);
  });

  it('a takeout box flips cards from earlier turns, then is discarded', () => {
    const old = c('tempura');
    const box = c('takeoutBox', '10');
    let s = rigged([[box, c('sashimi')], [c('sashimi'), c('sashimi')]], [[old]], BOX_MENU);
    s = othersPickFirst(s);
    expect(s.resolution!.steps[0]).toMatchObject({ type: 'takeout', playerId: 'p0' });
    expect(() => applyAction(s, { type: 'flipCards', playerId: 'p0', cardIds: [box.id] })).toThrow();
    s = applyAction(s, { type: 'flipCards', playerId: 'p0', cardIds: [old.id] });
    expect(player(s, 'p0').table).toEqual([{ ...old, flipped: true }]);
    expect(s.subPhase).toBe('selecting');
  });

  it('a menu draws 4, plays the chosen one and shuffles the rest back', () => {
    let s = rigged([[c('menu', '7'), c('sashimi')], [c('sashimi'), c('sashimi')]], [], BOX_MENU);
    const deckBefore = s.deck.length;
    s = othersPickFirst(s);
    const step = s.resolution!.steps[0];
    if (step.type !== 'menu') throw new Error(`expected a menu step, got ${step.type}`);
    expect(step.drawn).toHaveLength(4);
    const choice = step.drawn!.find((x) => x.kind !== 'menu')!;
    s = applyAction(s, { type: 'pickMenu', playerId: 'p0', cardId: choice.id });
    expect(player(s, 'p0').table.map((x) => x.id)).toEqual([choice.id]);
    expect(s.deck.length).toBe(deckBefore - 1);
    expect(kinds(s.discards)).toEqual(['menu']);
  });

  it('resolves numbered cards lowest first', () => {
    let s = rigged([[c('menu', '9'), c('sashimi')], [c('menu', '7'), c('sashimi')]], [], BOX_MENU);
    s = othersPickFirst(s);
    expect(s.resolution!.steps.map((x) => x.playerId)).toEqual(['p1', 'p0']);
    expect(s.activePlayerId).toBe('p1');
  });

  it('a spoon takes the named card from the first player to the left holding it', () => {
    const spoon = c('spoon', '4');
    const mine = c('tempura');
    const [eel1, eel2] = [c('eel'), c('eel')];
    let s = rigged(
      [[mine, c('tempura'), c('tempura')], [c('tempura'), eel1, c('tempura')], [c('tempura'), eel2, c('tempura')]],
      [[spoon]],
    );
    s = othersPickFirst(pick(s, 'p0', [mine], true));
    expect(s.resolution!.steps[0]).toMatchObject({ type: 'spoon', playerId: 'p0' });
    s = applyAction(s, { type: 'askSpoon', playerId: 'p0', kind: 'eel' });
    expect(player(s, 'p0').table.map((x) => x.id)).toEqual([mine.id, eel1.id]);
    // p1 gave the eel and took the spoon; then hands passed left.
    expect(player(s, 'p2').hand.map((x) => x.id)).toContain(spoon.id);
    expect(s.players.every((p) => p.hand.length === 2)).toBe(true);
  });

  it('asked for a kind in general, the giver chooses which copy to hand over', () => {
    const spoon = c('spoon', '5');
    const mine = c('tempura');
    const [egg, squid] = [c('nigiri', 'egg'), c('nigiri', 'squid')];
    const setup = () => othersPickFirst(pick(rigged(
      [[mine, c('tempura'), c('tempura')], [c('tempura'), egg, squid], [c('tempura'), c('tempura'), c('tempura')]],
      [[spoon]],
    ), 'p0', [mine], true));

    let s = applyAction(setup(), { type: 'askSpoon', playerId: 'p0', kind: 'nigiri' });
    expect(s.resolution!.steps[0]).toMatchObject({ type: 'spoonGive', playerId: 'p1', options: [egg.id, squid.id] });
    expect(s.activePlayerId).toBe('p1');
    s = applyAction(s, { type: 'giveSpoon', playerId: 'p1', cardId: egg.id });
    expect(player(s, 'p0').table.map((x) => x.id)).toEqual([mine.id, egg.id]);

    // Asking for the exact variant skips the choice.
    const s2 = applyAction(setup(), { type: 'askSpoon', playerId: 'p0', kind: 'nigiri', variant: 'squid' });
    expect(player(s2, 'p0').table.map((x) => x.id)).toEqual([mine.id, squid.id]);
  });

  it('chopsticks play 2 cards and go back into the hand that is passed on', () => {
    const chop = c('chopsticks', '1');
    const [a, b] = [c('tempura'), c('tempura')];
    let s = rigged([[a, b, c('eel')], [c('eel'), c('eel'), c('eel')]], [[chop]]);
    s = othersPickFirst(pick(s, 'p0', [a, b]));
    expect(kinds(player(s, 'p0').table)).toEqual(['tempura', 'tempura']);
    expect(player(s, 'p1').hand.map((x) => x.id)).toContain(chop.id);
  });
});
