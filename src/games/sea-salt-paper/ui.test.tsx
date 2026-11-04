import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { Seat } from '@/core/types';
import type { SspCard, SspCardFamily, SspColor, SspEventId, SspState } from './types';
import { createSspState } from './setup';
import { bundle } from './ui';

afterEach(cleanup);

const card = (id: number, family: SspCardFamily, color: SspColor = 'yellow'): SspCard => ({ id, family, color });

function seats(n: number): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, color: '#888', isAI: i > 0, isLocal: true,
  }));
}

/** p0 (the local human) to act in `subPhase`, under `event`. */
function position(event: SspEventId | null, subPhase: SspState['subPhase'], players = 2): SspState {
  const s = createSspState({ targetScore: 200, expansions: { extraSalt: true, extraPepper: true } }, 9, seats(players));
  s.event!.current = event;
  s.subPhase = subPhase;
  s.activePlayerId = 'p0';
  return s;
}

function setup(state: SspState, localPlayerId: string | null = 'p0') {
  const dispatch = vi.fn();
  const view = render(<bundle.GameView state={state} localPlayerId={localPlayerId} dispatch={dispatch} />);
  const q = (sel: string) => Array.from(view.container.querySelectorAll<HTMLElement>(sel));
  const button = (text: RegExp) => q('button').find((b) => text.test(b.textContent ?? ''));
  return { dispatch, view, q, button };
}

describe('sea salt & paper view — Extra Pepper', () => {
  it('asks the event winner which card to keep, and holds the next round until then', () => {
    const s = position('danceOfShells', 'awaitingEventChoice');
    s.lastRoundSummary = { round: 1, endedBy: 'deckEmpty', endedByPlayerId: null, lastChanceWon: null, perPlayer: [] };
    s.pendingEventChoice = { playerId: 'p0', newEventId: 'danceOfShells', oldEventId: 'sunfish', resumeActiveId: 'p1' };
    const t = setup(s);
    expect(t.button(/Next round/)!.hasAttribute('disabled')).toBe(true);
    fireEvent.click(t.button(/Keep The Sunfish/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'chooseEvent', keep: 'sunfish' });
    cleanup();
    expect(setup(s, 'p1').view.container.textContent).toMatch(/Waiting for P0 to choose/);
  });

  it('shows who holds which event card', () => {
    const s = position(null, 'awaitingAction');
    s.players[1].heldEvents = ['tornado'];
    expect(setup(s).q('.ssp-held-event').map((e) => e.textContent)).toEqual(['The Tornado']);
  });

  it('the Angelfish: take one of the two same-colour tops', () => {
    const s = position('angelfish', 'awaitingAngelfishPick');
    s.pendingAngelfish = { via: 'pass' };
    s.discards = [[card(50, 'crab', 'pink')], [card(51, 'sailor', 'pink')]];
    const t = setup(s);
    fireEvent.click(t.button(/Sailor \(pile 2\)/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'angelfishPick', pile: 1 });
  });

  it('the Hermit Crab: only the pile still to dig is offered', () => {
    const s = position('hermitCrab', 'awaitingCrabPick');
    s.discards = [[card(50, 'crab')], [card(51, 'sailor'), card(52, 'shell')]];
    s.crabPilesLeft = [1];
    const t = setup(s);
    expect(t.view.container.textContent).toMatch(/Hermit Crab.*pile 2/);
    const piles = t.q('.center .pile');
    fireEvent.click(piles[0]);
    expect(t.q('.crab-overlay')).toHaveLength(0);
    fireEvent.click(piles[1]);
    expect(t.q('.crab-overlay .card')).toHaveLength(2);
  });

  it('the Water Rodeo: two swimmers make a playable pair', () => {
    const s = position('waterRodeo', 'awaitingPlayOrEnd');
    s.players[0].hand = [card(1, 'swimmer'), card(2, 'swimmer')];
    const t = setup(s);
    for (const c of t.q('.hand-area .cards .card')) fireEvent.click(c);
    fireEvent.click(t.button(/Play pair/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'playPair', cardIds: [1, 2] });
  });

  it('the Water Rodeo: choose whose hand to look at', () => {
    const s = position('waterRodeo', 'awaitingRodeoTarget', 3);
    s.players[1].hand = [card(60, 'boat')];
    s.players[2].hand = [card(61, 'boat')];
    const t = setup(s);
    fireEvent.click(t.button(/^P2/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'rodeoLook', targetPlayerId: 'p2' });
  });

  it('the Water Rodeo: pick one of theirs and one of yours to swap — or swap nothing', () => {
    const s = position('waterRodeo', 'awaitingRodeoSwap');
    s.players[0].hand = [card(3, 'crab')];
    s.players[1].hand = [card(60, 'sailor'), card(61, 'boat')];
    s.pendingRodeo = { targetId: 'p1' };
    const t = setup(s);
    expect(t.button(/^Swap$/)!.hasAttribute('disabled')).toBe(true);
    fireEvent.click(t.q('.crab-overlay .card')[0]);
    fireEvent.click(t.q('.hand-area .cards .card')[0]);
    fireEvent.click(t.button(/^Swap$/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'rodeoSwap', swap: [3, 60] });
    fireEvent.click(t.button(/Don.t swap/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'rodeoSwap', swap: null });
  });

  it('the Water Rodeo: choose a pair to take from an opponent', () => {
    const s = position('waterRodeo', 'awaitingPairSteal');
    s.players[1].table = [card(70, 'boat'), card(71, 'boat')];
    const t = setup(s);
    fireEvent.click(t.button(/P1: Boat \+ Boat/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'stealPair', targetPlayerId: 'p1', cardIds: [70, 71] });
  });

  it('the Coral Reef: place a shell face down; an immune opponent is marked', () => {
    const s = position('coralReef', 'awaitingPlayOrEnd');
    s.players[0].hand = [card(1, 'shell'), card(2, 'crab')];
    s.players[1].coralShell = card(80, 'shell');
    const t = setup(s);
    expect(t.view.container.textContent).toMatch(/immune/);
    fireEvent.click(t.button(/Place shell face down/)!);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'placeCoralShell', cardId: 1 });
  });
});
