import { describe, expect, it, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { Seat } from '@/core/types';
import type { DuelAction, DuelState } from './types';
import { bundle } from './ui';
import { sevenWondersDuelModule as duel } from './module';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';

afterEach(cleanup);

const SEATS: Seat[] = [
  { id: 'me', name: 'Me', color: '#e2513f', isAI: false, isLocal: true },
  { id: 'bot', name: 'Bot', color: '#2f7fd1', isAI: true, isLocal: true },
];

const newMatch = (seed: number): DuelState => duel.createInitialState(duel.defaultConfig(SEATS), seed, SEATS);

/** Plays both seats with the AI until `stop` holds (or the match ends). */
function advance(state: DuelState, stop: (s: DuelState) => boolean, cap = 600): DuelState {
  let s = state;
  for (let i = 0; i < cap && s.phase !== 'gameOver' && !stop(s); i++) {
    const a = chooseAIAction(s, s.activePlayerId!);
    if (!a) break;
    s = applyAction(s, a);
  }
  return s;
}

/** Hosts GameView for "me"; `api` lets the test play the bot's moves. */
function Harness({ initial, api }: { initial: DuelState; api: { state: DuelState; dispatch: (a: DuelAction) => void } }) {
  const [state, setState] = useState(initial);
  api.state = state;
  api.dispatch = (a) => setState((s) => applyAction(s, a));
  return <bundle.GameView state={state} localPlayerId="me" dispatch={api.dispatch} />;
}

function clickButton(name: RegExp): boolean {
  const btn = screen.queryAllByRole('button').find((b) => name.test(b.textContent ?? '') && !(b as HTMLButtonElement).disabled);
  if (!btn) return false;
  fireEvent.click(btn);
  return true;
}

describe('7 Wonders Duel game view', () => {
  it('drafts a wonder by clicking its card', () => {
    const state = newMatch(4);
    expect(state.subPhase).toBe('wonderDraft');
    const api = { state, dispatch: (_a: DuelAction) => {} };
    const { container } = render(<Harness initial={state} api={api} />);
    const before = api.state.wonderDraft!.pool.length;
    const meFirst = api.state.activePlayerId === 'me';
    const pickable = container.querySelectorAll('.swd-wonder.pickable');
    expect(pickable.length).toBe(meFirst ? before : 0);
    if (meFirst) {
      fireEvent.click(pickable[0]);
      expect(api.state.wonderDraft!.pool.length).toBe(before - 1);
      expect(api.state.players[0].wonders).toHaveLength(1);
    }
  });

  it('a human can play a whole match from the pyramid', () => {
    const api = { state: newMatch(21), dispatch: (_a: DuelAction) => {} };
    const { container } = render(<Harness initial={api.state} api={api} />);
    let picks = 0;
    for (let i = 0; i < 400 && api.state.phase !== 'gameOver'; i++) {
      const s = api.state;
      if (s.activePlayerId === 'bot') {
        act(() => api.dispatch(chooseAIAction(s, 'bot')!));
        continue;
      }
      switch (s.subPhase) {
        case 'wonderDraft':
          fireEvent.click(container.querySelector('.swd-wonder.pickable')!);
          break;
        case 'turn': {
          const card = container.querySelector('.swd-slot.pickable .swd-card') as HTMLElement;
          expect(card).not.toBeNull();
          fireEvent.click(card);
          expect(container.querySelector('.swd-pick-panel .swd-card-lg')).not.toBeNull();
          expect(clickButton(/^Build\b(?! a wonder)/) || clickButton(/^Discard for coins/)).toBe(true);
          picks++;
          break;
        }
        case 'progressPick':
          fireEvent.click(container.querySelector('.swd-progress-choice.pickable')!);
          break;
        default:
          throw new Error(`unexpected sub-phase for the human: ${s.subPhase}`);
      }
    }
    expect(api.state.phase).toBe('gameOver');
    expect(picks).toBeGreaterThan(10);
    expect(container.querySelector('.swd-gameover-banner')?.textContent).toMatch(/wins|Draw/);
    expect(container.querySelectorAll('.swd-score-table tbody tr')).toHaveLength(2);
  });

  it('builds a wonder through the construct picker', () => {
    // Find a seed where the bot's AI hands "me" a wonderConstruct turn.
    let state: DuelState | null = null;
    for (let seed = 1; seed < 40 && !state; seed++) {
      const s = advance(newMatch(seed), (x) => x.subPhase === 'wonderConstruct' && x.activePlayerId === 'me');
      if (s.subPhase === 'wonderConstruct' && s.activePlayerId === 'me') state = s;
    }
    expect(state).not.toBeNull();
    const api = { state: state!, dispatch: (_a: DuelAction) => {} };
    const { container } = render(<Harness initial={api.state} api={api} />);
    const built = api.state.players[0].wonders.filter((w) => w.built).length;
    const pickable = container.querySelector('.swd-wonder.pickable');
    expect(pickable).not.toBeNull();
    fireEvent.click(pickable!);
    expect(api.state.players[0].wonders.filter((w) => w.built).length).toBe(built + 1);
  });

  it('a face-down Age III guild shows the guild back, other cards their age back', () => {
    const s = advance(newMatch(9), (x) => x.age === 3 && x.subPhase === 'turn');
    expect(s.age).toBe(3);
    const hidden = s.pyramid.filter((slot) => !slot.faceUp && !slot.taken);
    expect(hidden.length).toBeGreaterThan(1);
    const [guildSlot, other] = hidden;
    s.cardsById[guildSlot.cardId] = { ...s.cardsById[guildSlot.cardId], color: 'purple' };
    s.cardsById[other.cardId] = { ...s.cardsById[other.cardId], color: 'blue' };
    const { container } = render(<bundle.GameView state={s} localPlayerId="me" dispatch={() => {}} />);
    const backs = [...container.querySelectorAll('.swd-pyramid .swd-card-back')].map((b) => b.getAttribute('title'));
    expect(backs).toContain('Face-down guild card');
    expect(backs).toContain('Face-down Age 3 card');
    // Face-down cards never leak their name.
    expect(container.querySelector('.swd-pyramid')!.textContent).not.toContain(s.cardsById[guildSlot.cardId].name);
  });

  it('shows the looting tokens until the pawn claims them', () => {
    const s = newMatch(5);
    const count = () => {
      const { container } = render(<bundle.GameView state={s} localPlayerId="me" dispatch={() => {}} />);
      const n = container.querySelectorAll('.swd-military svg g[transform^="translate"] rect[fill="#9b2f22"]').length;
      cleanup();
      return n;
    };
    expect(count()).toBe(4);
    s.militaryAwards = { p1At3: true, p1At6: false, p2At3: false, p2At6: false };
    expect(count()).toBe(3);
  });
});
