import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { Seat } from '@/core/types';
import { createRng } from '@/core/rng';
import type { SwCard, SwConfig, SwState } from './types';
import { sevenWondersModule } from './module';
import { buildAgeDeck, buildAgeIIIDeck } from './cards';
import { buildLeaderDeck } from './expansions/leaders/cards';
import { buildCitiesDeck } from './expansions/cities/cards';
import { buildBabelDeck } from './expansions/babel/cards';
import { buildArmadaDeck } from './expansions/armada/cards';
import { WONDERS } from './wonders';
import { CardBand, CardFace, WonderBoard } from './Card';
import { bundle } from './ui';
import { discardAll, producer, realCard } from './testSupport';

afterEach(cleanup);

const SEATS: Seat[] = ['me', 'b', 'c', 'd'].map((id, i) => ({
  id, name: id.toUpperCase(), color: ['#e2513f', '#2f7fd1', '#3b9b4a', '#f2c230'][i], isAI: i > 0, isLocal: i === 0,
}));

/** Play every seat with the AI until `stop` holds (or the match ends). */
function playUntil(config: Partial<SwConfig>, seed: number, stop: (s: SwState) => boolean): SwState {
  const m = sevenWondersModule;
  let s = m.createInitialState({ ...m.defaultConfig(SEATS), ...config }, seed, SEATS);
  for (let i = 0; i < 5000 && s.phase !== 'gameOver' && !stop(s); i++) {
    // With a human seat the reducer leaves the between-age screen to a click.
    if (s.subPhase === 'militaryEnd') { s = m.applyAction(s, { type: 'continue' }); continue; }
    const pid = s.activePlayerId ?? s.players.find((p) => p.pendingPick === null)?.id;
    if (!pid) break;
    const a = m.chooseAIAction!(s, pid);
    if (!a) break;
    s = m.applyAction(s, a);
  }
  return s;
}

const tickStart = (age: number, round: number) => (s: SwState) =>
  s.subPhase === 'picking' && s.age === age && s.ageRound === round && s.players.every((p) => p.pendingPick === null);

function setup(state: SwState) {
  const dispatch = vi.fn();
  const view = render(<bundle.GameView state={state} localPlayerId="me" dispatch={dispatch} />);
  const q = (sel: string) => Array.from(view.container.querySelectorAll<HTMLElement>(sel));
  const button = (text: RegExp) => q('button').find((b) => text.test(b.textContent ?? ''))!;
  return { dispatch, view, q, button };
}

describe('7 wonders game view', () => {
  it('sells a card from the hand for 3 coins', () => {
    const s = playUntil({}, 7, tickStart(1, 2));
    const t = setup(s);
    const cards = t.q('.sw-hand .sw-cardface');
    expect(cards).toHaveLength(s.players[0].hand.length);
    fireEvent.click(cards[0]);
    fireEvent.click(t.button(/Sell for 3 coins/));
    fireEvent.click(t.button(/^Confirm$/));
    expect(t.dispatch).toHaveBeenCalledWith({
      type: 'submitPick', playerId: 'me', pick: { kind: 'discard', cardId: s.players[0].hand[0].id },
    });
  });

  it('builds a buildable card', () => {
    const s = playUntil({}, 7, tickStart(1, 1));
    const t = setup(s);
    const idx = t.q('.sw-hand .sw-cardface').findIndex((c) => c.querySelector('.sw-cf-status.ok, .sw-cf-status.pay'));
    expect(idx).toBeGreaterThanOrEqual(0);
    fireEvent.click(t.q('.sw-hand .sw-cardface')[idx]);
    fireEvent.click(t.button(/^Confirm$/));
    const call = t.dispatch.mock.calls[0][0];
    expect(call.type).toBe('submitPick');
    expect(call.pick.kind).toBe('build');
    expect(call.pick.cardId).toBe(s.players[0].hand[idx].id);
  });

  it('shows neighbours in table order with their wonders and cities', () => {
    const s = playUntil({}, 7, tickStart(2, 3));
    const t = setup(s);
    const strips = t.q('.sw-opp');
    expect(strips).toHaveLength(3);
    expect(strips[0].textContent).toMatch(/West neighbour/);
    expect(strips[2].textContent).toMatch(/East neighbour/);
    expect(t.q('.sw-wmini')).toHaveLength(3);
    expect(t.q('.sw-wboard')).toHaveLength(1);
    const built = s.players.reduce((n, p) => n + p.tableau.length, 0);
    expect(t.q('.sw-band')).toHaveLength(built);
  });

  it('military end and game over render, and continue dispatches', () => {
    const mil = playUntil({}, 3, (s) => s.subPhase === 'militaryEnd');
    const t = setup(mil);
    expect(t.q('.sw-military-banner tbody tr')).toHaveLength(4);
    fireEvent.click(t.button(/Continue to Age II/));
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'continue' });
    cleanup();

    const over = playUntil({ wonderSide: 'B' }, 3, () => false);
    expect(over.phase).toBe('gameOver');
    const g = setup(over);
    expect(g.q('.sw-final-table tbody tr')).toHaveLength(4);
    expect(g.view.container.textContent).toMatch(/wins!/);
  });

  it('drafts a leader from the (lazily loaded) leaders overlay', async () => {
    const s = playUntil({ expansions: ['leaders'] }, 9, (x) => x.subPhase === 'leaderDraft');
    const t = setup(s);
    await waitFor(() => expect(t.q('.sw-hand .sw-cardface').length).toBeGreaterThan(0));
    const leaders = t.q('.sw-hand .sw-cardface');
    fireEvent.click(leaders[0]);
    expect(t.dispatch.mock.calls[0][0]).toMatchObject({ type: 'submitLeaderDraft', playerId: 'me' });
  });

  it('Halicarnassus picks a card from the discard pile', () => {
    const m = sevenWondersModule;
    const config = { ...m.defaultConfig(SEATS), wonderAssignment: 'preset' as const, presetWonders: ['halicarnassus-a', '', '', ''] };
    let s = m.createInitialState(config, 4, SEATS);
    s.players[0].wonderStagesBuilt = 1;
    s.players[0].tableau.push(producer('ore', 'ore', 'ore'));
    s = m.applyAction(s, {
      type: 'submitPick', playerId: 'me',
      pick: { kind: 'wonder', cardId: s.players[0].hand[0].id, stageIndex: 1, payment: { fromWest: [], fromEast: [], coins: 0 } },
    });
    s = discardAll(s);
    expect(s.subPhase).toBe('discardBuild');
    const t = setup(s);
    const cards = t.q('.sw-discard-build .sw-cardface');
    expect(cards).toHaveLength(s.discard.length);
    fireEvent.click(cards[0]);
    fireEvent.click(t.button(/^Build /));
    expect(t.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'buildFromDiscard', playerId: 'me' }));
    cleanup();
    // Everyone else just waits.
    const other = render(<bundle.GameView state={s} localPlayerId="b" dispatch={vi.fn()} />);
    expect(other.container.textContent).toMatch(/is searching the discard pile/);
  });

  it("offers Olympia A's free build", () => {
    const m = sevenWondersModule;
    const config = { ...m.defaultConfig(SEATS), wonderAssignment: 'preset' as const, presetWonders: ['olympia-a', '', '', ''] };
    const s = m.createInitialState(config, 4, SEATS);
    s.players[0].wonderStagesBuilt = 2;
    s.players[0].hand[0] = realCard('Palace');
    const t = setup(s);
    fireEvent.click(t.q('.sw-hand .sw-cardface')[0]);
    fireEvent.click(t.button(/Build free/));
    fireEvent.click(t.button(/^Confirm$/));
    expect(t.dispatch.mock.calls[0][0]).toMatchObject({ type: 'submitPick', pick: { kind: 'build', free: true, cardId: s.players[0].hand[0].id } });
  });

  it('hides a locked-in hand when two humans share the table, and says what the others did', () => {
    const m = sevenWondersModule;
    const two = SEATS.map((x, i) => (i === 2 ? { ...x, isAI: false } : x));
    let s = m.createInitialState(m.defaultConfig(two), 7, two);
    s = m.applyAction(s, { type: 'submitPick', playerId: 'me', pick: { kind: 'discard', cardId: s.players[0].hand[0].id } });
    const t = setup(s);
    expect(t.q('.sw-hand .sw-cardface')).toHaveLength(0);
    expect(t.view.container.textContent).toMatch(/hand is hidden/);
    cleanup();

    s = discardAll(s);
    expect(s.ageRound).toBe(2);
    const u = setup(s);
    expect(u.q('.sw-opp-last').map((e) => e.textContent)).toEqual(Array(3).fill('Last turn: sold a card for 3 coins'));
  });

  it('draws every card of every deck and every wonder board', () => {
    const all: SwCard[] = [
      ...buildAgeDeck(1, 7), ...buildAgeDeck(2, 7), ...buildAgeIIIDeck(createRng(1), 8),
      ...[1, 2, 3].flatMap((a) => [...buildCitiesDeck(a as 1, 7), ...buildBabelDeck(a as 1, 7), ...buildArmadaDeck(a as 1, 7)]),
      ...buildLeaderDeck(),
    ];
    const view = render(
      <div>
        {all.map((c) => <CardFace key={`f${c.id}`} card={c} />)}
        {all.map((c) => <CardBand key={`b${c.id}`} card={c} />)}
        {WONDERS.map((w) => <WonderBoard key={w.id} wonder={w} built={1} />)}
      </div>,
    );
    expect(view.container.querySelectorAll('.sw-cardface')).toHaveLength(all.length);
    expect(view.container.querySelectorAll('.sw-wstage.built')).toHaveLength(WONDERS.length);
  });
});
