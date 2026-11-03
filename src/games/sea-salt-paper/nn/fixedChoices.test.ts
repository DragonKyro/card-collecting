import { describe, it, expect } from 'vitest';
import type { SspCard, SspCardFamily, SspColor, SspEventId, SspState } from '../types';
import { applyAction } from '../reducer';
import { createSspState } from '../setup';
import { sampleStates, seatsFor } from '../testSupport';
import { observe } from './observation';
import { legalMask } from './actions';
import { fixedChoice } from './fixedChoices';

const card = (id: number, family: SspCardFamily, color: SspColor = 'yellow'): SspCard => ({ id, family, color });

/** p0 at the play-or-end step with `hand`, under `event`. */
function pepperTurn(event: SspEventId | null, hand: SspCard[]): SspState {
  const s = createSspState({ targetScore: 200, expansions: { extraSalt: true, extraPepper: true } }, 3, seatsFor(2));
  s.event!.current = event;
  s.players[0].hand = hand;
  s.subPhase = 'awaitingPlayOrEnd';
  return s;
}

describe('fixed choices for the Extra Pepper decisions', () => {
  it('every decision has an answer the reducer accepts — a slot or a fixed choice', () => {
    const seen = new Set<string>();
    for (const players of [2, 3, 4]) {
      const states = sampleStates({ players, extraSalt: true, extraPepper: true, matches: 12, seed: 515 + players });
      for (const state of states) {
        if (state.subPhase === 'roundEnd') continue;
        seen.add(state.subPhase);
        for (const e of state.log) if (e.kind === 'coralShell') seen.add('coralShell');
        const obs = observe(state, state.activePlayerId!);
        const fixed = fixedChoice(obs);
        if (fixed) {
          expect(() => applyAction(state, fixed), `${JSON.stringify(fixed)} in ${state.subPhase}`).not.toThrow();
        } else {
          expect(legalMask(obs).some((m) => m === 1), `nothing to do in ${state.subPhase}`).toBe(true);
        }
      }
    }
    for (const phase of ['awaitingRodeoTarget', 'awaitingRodeoSwap', 'awaitingAngelfishPick', 'awaitingEventChoice', 'coralShell']) {
      expect(seen.has(phase), phase).toBe(true);
    }
  });

  it('keeps the better of two event cards', () => {
    const s = pepperTurn(null, []);
    s.subPhase = 'awaitingEventChoice';
    s.activePlayerId = 'p0';
    s.pendingEventChoice = { playerId: 'p0', newEventId: 'coralReef', oldEventId: 'danceOfShells', resumeActiveId: 'p1' };
    expect(fixedChoice(observe(s, 'p0'))).toEqual({ type: 'chooseEvent', keep: 'danceOfShells' });
    s.pendingEventChoice = { playerId: 'p0', newEventId: 'kraken', oldEventId: 'diodonFish', resumeActiveId: 'p1' };
    expect(fixedChoice(observe(s, 'p0'))).toEqual({ type: 'chooseEvent', keep: 'kraken' });
    expect(fixedChoice(observe(s, 'p1'))).toBeNull();
  });

  it('the Angelfish takes the top worth more', () => {
    let s = pepperTurn('angelfish', [card(1, 'sailor', 'pink')]);
    s.discards = [[card(50, 'crab', 'pink')], [card(51, 'sailor', 'pink')]];
    s = applyAction(s, { type: 'pass' });
    expect(fixedChoice(observe(s, 'p0'))).toEqual({ type: 'angelfishPick', pile: 1 });
  });

  it('the Water Rodeo swap happens only when it gains', () => {
    let s = pepperTurn('waterRodeo', [card(1, 'swimmer'), card(2, 'swimmer'), card(3, 'crab'), card(4, 'sailor')]);
    s.players[1].hand = [card(60, 'sailor'), card(61, 'boat')];
    s = applyAction(s, { type: 'playPair', cardIds: [1, 2] });
    s = applyAction(s, { type: 'rodeoLook', targetPlayerId: 'p1' });
    expect(fixedChoice(observe(s, 'p0'))).toEqual({ type: 'rodeoSwap', swap: [3, 60] });

    let t = pepperTurn('waterRodeo', [card(1, 'swimmer'), card(2, 'swimmer'), card(3, 'crab')]);
    t.players[1].hand = [card(61, 'boat')];
    t = applyAction(applyAction(t, { type: 'playPair', cardIds: [1, 2] }), { type: 'rodeoLook', targetPlayerId: 'p1' });
    expect(fixedChoice(observe(t, 'p0'))).toEqual({ type: 'rodeoSwap', swap: null });
  });

  it('plays a Water Rodeo duo when nothing else wants its cards', () => {
    const s = pepperTurn('waterRodeo', [card(1, 'swimmer'), card(2, 'swimmer')]);
    s.players[1].hand = [card(60, 'boat')];
    expect(fixedChoice(observe(s, 'p0'))).toEqual({ type: 'playPair', cardIds: [1, 2] });
    s.players[0].hand.push(card(3, 'shark'));
    expect(fixedChoice(observe(s, 'p0'))).toBeNull(); // shark + swimmer is the network's call
  });

  it('places a Coral Reef shell only when it scores nothing in hand', () => {
    const lone = pepperTurn('coralReef', [card(1, 'shell', 'pink'), card(2, 'crab')]);
    expect(fixedChoice(observe(lone, 'p0'))).toEqual({ type: 'placeCoralShell', cardId: 1 });
    const pair = pepperTurn('coralReef', [card(1, 'shell'), card(2, 'shell')]);
    expect(fixedChoice(observe(pair, 'p0'))).toBeNull();
  });
});
