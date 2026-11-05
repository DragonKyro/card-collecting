import { describe, expect, it, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { Seat } from '@/core/types';
import type { DuelAction, DuelState } from './types';
import { bundle } from './ui';
import { sevenWondersDuelModule as duel } from './module';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { availableSlots } from './pyramid';
import { allCards } from './cards';
import { WONDERS } from './wonders';
import { ALL_PROGRESS_TOKENS } from './progress';
import { CardFace, ProgressToken, WonderCard } from './Card';
import { giveCard } from './testSupport';

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

/** A started match where it is my turn in Age I with the given wonders. */
function myTurn(seed: number, wonders: string[]): DuelState {
  const s = advance(newMatch(seed), (x) => x.subPhase === 'turn' && x.activePlayerId === 'me');
  s.players[0].wonders = wonders.map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  return s;
}

describe('7 Wonders Duel game view', () => {
  it('drafts a wonder by clicking its card, four on offer at a time', () => {
    const state = newMatch(4);
    expect(state.subPhase).toBe('wonderDraft');
    const api = { state, dispatch: (_a: DuelAction) => {} };
    const { container } = render(<Harness initial={state} api={api} />);
    expect(container.querySelectorAll('.swd-wonder-grid .swd-wonder')).toHaveLength(4);
    const meFirst = api.state.activePlayerId === 'me';
    const pickable = container.querySelectorAll('.swd-wonder.pickable');
    expect(pickable.length).toBe(meFirst ? 4 : 0);
    if (meFirst) {
      fireEvent.click(pickable[0]);
      expect(api.state.wonderDraft!.pool).toHaveLength(3);
      expect(api.state.players[0].wonders).toHaveLength(1);
    }
  });

  it('a human can play whole matches through every decision', () => {
    const seen = new Set<string>();
    for (const seed of [21, 22]) {
      const api = { state: newMatch(seed), dispatch: (_a: DuelAction) => {} };
      const { container } = render(<Harness initial={api.state} api={api} />);
      let picks = 0;
      for (let i = 0; i < 500 && api.state.phase !== 'gameOver'; i++) {
        const s = api.state;
        if (s.activePlayerId === 'bot') {
          act(() => api.dispatch(chooseAIAction(s, 'bot')!));
          continue;
        }
        seen.add(s.subPhase);
        switch (s.subPhase) {
          case 'wonderDraft':
            fireEvent.click(container.querySelector('.swd-wonder.pickable')!);
            break;
          case 'turn': {
            const cards = container.querySelectorAll('.swd-slot.pickable .swd-card');
            expect(cards.length).toBeGreaterThan(0);
            fireEvent.click(cards[i % cards.length]);
            expect(container.querySelector('.swd-pick-panel .swd-card-lg')).not.toBeNull();
            // Mix the three moves; fall back to a discard (always possible).
            const tryWonder = i % 3 === 0 && clickButton(/^Build a wonder with it/);
            if (tryWonder) {
              const w = container.querySelector('.swd-wonder-choices .swd-wonder.pickable');
              expect(w).not.toBeNull();
              fireEvent.click(w!);
            } else {
              expect(clickButton(/^Build\b(?! a wonder)/) || clickButton(/^Discard for coins/)).toBe(true);
            }
            picks++;
            break;
          }
          case 'progressPick':
          case 'libraryPick':
            fireEvent.click(container.querySelector('.swd-token-choices .swd-progress-choice')!);
            break;
          case 'destroyCard':
          case 'discardBuild':
            fireEvent.click(container.querySelector('.swd-card-choices .swd-card.pickable')!);
            break;
          case 'chooseStarter':
            expect(clickButton(/^I start$/)).toBe(true);
            break;
          default:
            throw new Error(`unexpected sub-phase for the human: ${s.subPhase}`);
        }
      }
      expect(api.state.phase).toBe('gameOver');
      expect(picks).toBeGreaterThan(10);
      expect(container.querySelector('.swd-gameover-banner')?.textContent).toMatch(/wins|Draw/);
      expect(container.querySelectorAll('.swd-score-table tbody tr')).toHaveLength(2);
      cleanup();
    }
    expect(seen.has('chooseStarter')).toBe(true);
  });

  it('builds a wonder in two clicks and locks the wonders it cannot afford', () => {
    const s = myTurn(6, ['pyramids', 'sphinx']);
    s.players[0].coins = 8; // the Pyramids (8) yes, the Sphinx (8) — make it dearer
    giveCard(s, 1, 'Glassworks', 'Glass-Blower');
    const api = { state: s, dispatch: (_a: DuelAction) => {} };
    const { container } = render(<Harness initial={s} api={api} />);
    fireEvent.click(container.querySelector('.swd-slot.pickable .swd-card')!);
    expect(clickButton(/^Build a wonder with it/)).toBe(true);
    const choices = container.querySelectorAll('.swd-wonder-choices .swd-wonder');
    expect(choices).toHaveLength(2);
    expect(container.querySelectorAll('.swd-wonder-choices .swd-wonder.pickable')).toHaveLength(1);
    fireEvent.click(container.querySelector('.swd-wonder-choices .swd-wonder.pickable')!);
    expect(api.state.players[0].wonders.find((w) => w.wonderId === 'pyramids')!.built).toBe(true);
  });

  it('disables "Build a wonder" when no wonder is affordable (no dead end)', () => {
    const s = myTurn(6, ['pyramids']);
    s.players[0].coins = 1;
    const { container } = render(<bundle.GameView state={s} localPlayerId="me" dispatch={() => {}} />);
    fireEvent.click(container.querySelector('.swd-slot.pickable .swd-card')!);
    const btn = screen.getAllByRole('button').find((b) => /^Build a wonder with it/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('destroys an opponent\'s card from the decision panel', () => {
    const s = myTurn(7, ['statue-of-zeus']);
    s.players[0].coins = 30;
    s.players[1].tableau = [];
    s.discard = [];
    giveCard(s, 1, 'Sawmill', 'Press');
    const api = { state: s, dispatch: (_a: DuelAction) => {} };
    const { container } = render(<Harness initial={s} api={api} />);
    act(() => api.dispatch({ type: 'takeAndWonder', playerId: 'me', cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'statue-of-zeus' }));
    expect(api.state.subPhase).toBe('destroyCard');
    const options = container.querySelectorAll('.swd-card-choices .swd-card');
    expect(options).toHaveLength(1);
    fireEvent.click(options[0]);
    expect(api.state.discard.map((c) => c.name)).toEqual(['Sawmill']);
    expect(container.querySelector('.swd-discard')?.children).toHaveLength(1);
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
    for (const slot of hidden) expect(container.querySelector('.swd-pyramid')!.textContent).not.toContain(s.cardsById[slot.cardId].name);
  });

  it('lays out the Age I pyramid with its 6-card front row accessible', () => {
    const s = advance(newMatch(3), (x) => x.subPhase === 'turn');
    const { container } = render(<bundle.GameView state={s} localPlayerId="me" dispatch={() => {}} />);
    expect(container.querySelectorAll('.swd-pyramid .swd-slot')).toHaveLength(20);
    expect(container.querySelectorAll('.swd-pyramid .swd-slot.available')).toHaveLength(6);
  });

  it('fades the looting tokens out once the pawn claims them', () => {
    const s = newMatch(5);
    const count = () => {
      const { container } = render(<bundle.GameView state={s} localPlayerId="me" dispatch={() => {}} />);
      const n = container.querySelectorAll('.swd-military .swd-loot:not(.taken)').length;
      cleanup();
      return n;
    };
    expect(count()).toBe(4);
    s.militaryAwards = { p1At3: true, p1At6: false, p2At3: false, p2At6: false };
    expect(count()).toBe(3);
  });

  it('draws every card, wonder and Progress token', () => {
    const { container } = render(
      <div>
        {allCards().map((c) => <CardFace key={c.id} card={c} size="md" />)}
        {WONDERS.map((w) => <WonderCard key={w.id} wonder={w} />)}
        {ALL_PROGRESS_TOKENS.map((t) => <ProgressToken key={t.id} id={t.id} />)}
      </div>,
    );
    expect(container.querySelectorAll('.swd-card')).toHaveLength(73);
    expect(container.querySelectorAll('.swd-wonder')).toHaveLength(12);
    // Chain symbols show on both ends of every chain.
    expect(container.querySelectorAll('.swd-card-chainto')).toHaveLength(17);
    expect(container.querySelectorAll('.swd-card-chainfrom')).toHaveLength(17);
  });
});
