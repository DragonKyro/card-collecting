// The expansions' screens: the Recruitment phase, the Babel tile draft and a
// tile built from the hand, joining a Great Project, the tower and project
// panels, a failed project's penalty, a coin loss to settle, the lobby.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { Seat } from '@/core/types';
import type { SwConfig, SwState } from './types';
import { sevenWondersModule } from './module';
import { bundle } from './ui';
import { realCard, producer } from './testSupport';

afterEach(cleanup);

const SEATS: Seat[] = ['me', 'b', 'c'].map((id, i) => ({
  id, name: id.toUpperCase(), color: ['#e2513f', '#2f7fd1', '#3b9b4a'][i], isAI: i > 0, isLocal: i === 0,
}));

function start(expansions: SwConfig['expansions'], seed = 3): SwState {
  const m = sevenWondersModule;
  return m.createInitialState({ ...m.defaultConfig(SEATS), expansions, wonderAssignment: 'preset', presetWonders: ['gizah-a', 'rhodes-a', 'ephesos-a'] }, seed, SEATS);
}

/** Let the AI play every seat but mine until `stop`; mine is played by `mine`. */
function playUntil(s: SwState, stop: (s: SwState) => boolean): SwState {
  const m = sevenWondersModule;
  for (let i = 0; i < 4000 && s.phase !== 'gameOver' && !stop(s); i++) {
    if (s.subPhase === 'militaryEnd') { s = m.applyAction(s, { type: 'continue' }); continue; }
    const pid = s.activePlayerId;
    if (!pid) break;
    const a = m.chooseAIAction!(s, pid);
    if (!a) break;
    s = m.applyAction(s, a);
  }
  return s;
}

function setup(state: SwState) {
  const dispatch = vi.fn();
  const view = render(<bundle.GameView state={state} localPlayerId="me" dispatch={dispatch} />);
  const q = (sel: string) => Array.from(view.container.querySelectorAll<HTMLElement>(sel));
  const button = (text: RegExp) => q('button').find((b) => text.test(b.textContent ?? ''));
  return { dispatch, view, q, button };
}

const NO_PAY = { fromWest: [], fromEast: [], coins: 0 };

describe('expansion screens', () => {
  it('Recruitment: pick a leader and recruit it, or discard it', async () => {
    const s = playUntil(start(['leaders']), (x) => x.subPhase === 'leaderPlay');
    s.players[0].leaderHand = [realCard('Sappho'), realCard('Pericles')];
    s.players[0].coins = 6;
    const t = setup(s);
    await waitFor(() => expect(t.q('.sw-hand .sw-cardface')).toHaveLength(2));
    fireEvent.click(t.q('.sw-hand .sw-cardface')[0]);
    fireEvent.click(t.button(/^Confirm$/)!);
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: 'submitLeaderPlay', playerId: 'me', pick: { kind: 'play', cardId: s.players[0].leaderHand![0].id, payment: NO_PAY } });
    fireEvent.click(t.button(/Discard for 3 coins/)!);
    fireEvent.click(t.button(/^Confirm$/)!);
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: 'submitLeaderPlay', playerId: 'me', pick: { kind: 'discard', cardId: s.players[0].leaderHand![0].id } });
  });

  it('Babel: drafts a tile, then builds one from the hand; the tower shows what is in force', async () => {
    const draft = start(['babelTower']);
    let t = setup(draft);
    await waitFor(() => expect(t.q('.sw-tile-choice').length).toBe(3));
    fireEvent.click(t.q('.sw-tile-choice')[0]);
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: 'submitBabelDraft', playerId: 'me', tileId: draft.babelDraftHands!.me[0] });
    cleanup();

    const s = playUntil(start(['babelTower']), (x) => x.subPhase === 'picking');
    s.babelTower = [[7], [], []];
    t = setup(s);
    await waitFor(() => expect(t.view.container.textContent).toMatch(/Tower of Babel/));
    expect(t.q('.sw-tower-space.on')).toHaveLength(1);
    fireEvent.click(t.q('.sw-hand .sw-cardface')[0]);
    fireEvent.click(t.button(/Build a Babel tile/)!);
    fireEvent.click(t.q('.sw-tile-choice')[0]);
    fireEvent.click(t.button(/^Confirm$/)!);
    expect(t.dispatch).toHaveBeenLastCalledWith({
      type: 'submitPick', playerId: 'me', pick: { kind: 'babelTile', cardId: s.players[0].hand[0].id, tileId: s.players[0].babelHand![0] },
    });
  });

  it('Great Projects: the panel, joining with a card, and a failed project\'s penalty', async () => {
    const s = start(['babelProjects']);
    s.project = { projectId: 'rampart-road', tokensLeft: 2, outcome: null };
    s.players[0].hand[0] = realCard('Tavern');
    let t = setup(s);
    await waitFor(() => expect(t.view.container.textContent).toMatch(/Rampart Road/));
    fireEvent.click(t.q('.sw-hand .sw-cardface')[0]);
    const join = t.q('.sw-join input')[0] as HTMLInputElement;
    fireEvent.click(join);
    fireEvent.click(t.button(/^Confirm$/)!);
    const call = t.dispatch.mock.calls.at(-1)![0];
    expect(call).toMatchObject({ type: 'submitPick', pick: { kind: 'build', participate: true, cardId: s.players[0].hand[0].id } });
    expect(sevenWondersModule.applyAction(s, call).players[0].pendingPick).not.toBeNull();
    cleanup();

    const pen = start(['babelProjects']);
    pen.project = { projectId: 'belvedere', tokensLeft: 0, outcome: 'failure' };
    pen.subPhase = 'projectPenalty';
    pen.projectPenaltyQueue = ['me'];
    pen.players[0].tableau.push(realCard('Stockade'), realCard('Barracks'));
    t = setup(pen);
    await waitFor(() => expect(t.q('.sw-hand .sw-cardface')).toHaveLength(2));
    fireEvent.click(t.q('.sw-hand .sw-cardface')[1]);
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: 'projectPenalty', playerId: 'me', cardId: pen.players[0].tableau[1].id });
  });

  it('Cities: settles a coin loss with the coins chosen', async () => {
    let s = start(['cities']);
    const m = sevenWondersModule;
    s.players[1].hand[0] = realCard('Lair');
    s.players[1].tableau.push(producer('wood', 'glass'));
    s.players[0].coins = 5;
    s = m.applyAction(s, { type: 'submitPick', playerId: 'b', pick: { kind: 'build', cardId: s.players[1].hand[0].id, payment: NO_PAY } });
    s = m.applyAction(s, { type: 'submitPick', playerId: 'c', pick: { kind: 'discard', cardId: s.players[2].hand[0].id } });
    s = m.applyAction(s, { type: 'submitPick', playerId: 'me', pick: { kind: 'discard', cardId: s.players[0].hand[0].id } });
    expect(s.subPhase).toBe('debt');
    const t = setup(s);
    await waitFor(() => expect(t.view.container.textContent).toMatch(/You lose 2 coins/));
    const input = t.q('input[aria-label="Coins to pay"]')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.click(t.button(/^Confirm$/)!);
    expect(t.dispatch).toHaveBeenLastCalledWith({ type: 'settleDebt', playerId: 'me', coins: 1 });
  });

  it('the lobby lists the four expansions and turns them on in order', () => {
    const onChange = vi.fn();
    const config = sevenWondersModule.defaultConfig(SEATS);
    const view = render(<bundle.LobbyConfig config={config} seats={SEATS} onChange={onChange} />);
    const boxes = Array.from(view.container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes).toHaveLength(4);
    fireEvent.click(boxes[3]);
    expect(onChange).toHaveBeenLastCalledWith({ ...config, expansions: ['babelProjects'] });
  });
});
