import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { useState } from 'react';
import type { MkAction, MkEdition, MkState } from './types';
import { bundle } from './ui';
import { applyAction, createMatch } from './reducer';
import { chooseAIAction } from './ai';
import { newMatch, roll, seats, setPlayer } from './testSupport';

/** Hosts GameView for p0 (human); the test plays the other seats with the AI. */
function Harness({ initial, onState }: { initial: MkState; onState: (s: MkState) => void }) {
  const [state, setState] = useState(initial);
  onState(state);
  return (
    <bundle.GameView
      state={state}
      localPlayerId="p0"
      dispatch={(a: MkAction) => setState((s) => applyAction(s, a))}
    />
  );
}

function clickButton(name: RegExp): boolean {
  const btn = screen.queryAllByRole('button').find((b) => name.test(b.textContent ?? '') && !(b as HTMLButtonElement).disabled);
  if (!btn) return false;
  fireEvent.click(btn);
  return true;
}

/** Play p0 through the UI only: roll, build the first buyable card, answer prompts. */
function humanStep(state: MkState, container: HTMLElement): void {
  switch (state.subPhase) {
    case 'roll':
      expect(clickButton(/Roll 2 dice/) || clickButton(/Roll 1 die/)).toBe(true);
      break;
    case 'reroll':
      expect(clickButton(/^Keep/)).toBe(true);
      break;
    case 'tvTarget':
      expect(clickButton(/\(\d+/)).toBe(true);
      break;
    case 'exchange':
      expect(clickButton(/Don’t swap/)).toBe(true);
      break;
    case 'gift': {
      const mine = container.querySelector('.mk-town .mk-town-card.pickable .mk-card') as HTMLElement;
      expect(mine).not.toBeNull();
      fireEvent.click(mine);
      break;
    }
    case 'build':
    case 'setupBuild': {
      const buyable = container.querySelector('.mk-slot.buyable .mk-card, .mk-town-card.buyable .mk-card') as HTMLElement | null;
      if (buyable) {
        fireEvent.click(buyable);
        expect(clickButton(/^Build /)).toBe(true);
      } else {
        expect(clickButton(/^(Pass|Skip)/)).toBe(true);
      }
      break;
    }
  }
}

describe('GameView', () => {
  it('renders the opening rounds and builds through the market', () => {
    const state = createMatch({ edition: 'mk2', promoLandmarks: false }, 5, seats(2));
    state.currentIdx = 0;
    state.activePlayerId = 'p0';
    let latest = state;
    const { container } = render(<Harness initial={state} onState={(s) => { latest = s; }} />);
    expect(screen.getByText(/Opening round 1 \/ 3/)).toBeTruthy();
    expect(container.querySelectorAll('.mk-market-row')).toHaveLength(3);
    const buyable = container.querySelector('.mk-slot.buyable .mk-card') as HTMLElement;
    fireEvent.click(buyable);
    fireEvent.click(screen.getByRole('button', { name: /^Build / }));
    expect(Object.keys(latest.players[0].city)).toHaveLength(1);
    expect(latest.activePlayerId).toBe('p1');
    cleanup();
  });

  for (const [edition, n] of [['mk2', 3], ['mk1', 2]] as const) {
    it(`${edition}: a human can play a whole match from the UI`, () => {
      const end = playThroughUi(edition, n, 21);
      expect(end.phase).toBe('gameOver');
    });
  }

  it('swaps establishments through the Business Center prompt', () => {
    const state = newMatch('mk2', 2, { first: 0 });
    setPlayer(state, 0, { coins: 2, city: { businessCenter: 1, wheatField: 1 } });
    setPlayer(state, 1, { city: { mine: 1 } });
    const rolled = roll(state, [6]);
    expect(rolled.subPhase).toBe('exchange');
    let latest = rolled;
    const { container } = render(<Harness initial={rolled} onState={(s) => { latest = s; }} />);
    const pick = (owner: string, name: string) => {
      const town = [...container.querySelectorAll('.mk-town')].find((t) => t.textContent?.includes(owner))!;
      const card = [...town.querySelectorAll('.mk-town-card.pickable .mk-card')].find((c) => c.getAttribute('title')?.startsWith(name))!;
      fireEvent.click(card);
    };
    pick('P0', 'Wheat Field');
    pick('P1', 'Mine');
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(latest.players[0].city).toEqual({ businessCenter: 1, mine: 1 });
    expect(latest.players[1].city).toEqual({ wheatField: 1 });
    expect(latest.subPhase).toBe('build');
    cleanup();
  });

  it('shows the winner on the game-over screen', () => {
    let s = createMatch({ edition: 'mk2', promoLandmarks: false }, 9, seats(2, true));
    while (s.phase === 'playing') s = applyAction(s, chooseAIAction(s, s.activePlayerId!)!);
    render(<bundle.GameView state={s} localPlayerId="p0" dispatch={() => {}} />);
    expect(screen.getByText(/wins!/, { selector: 'h2' })).toBeTruthy();
    cleanup();
  });
});

/** One mounted view; AI seats' moves are dispatched the way the host's AI driver sends them. */
function playThroughUi(edition: MkEdition, n: number, seed: number): MkState {
  const initial = createMatch({ edition, promoLandmarks: true }, seed, seats(n));
  let latest = initial;
  let dispatchRef: ((a: MkAction) => void) | null = null;
  function Host() {
    const [state, setState] = useState(initial);
    latest = state;
    dispatchRef = (a) => setState((s) => applyAction(s, a));
    return <bundle.GameView state={state} localPlayerId="p0" dispatch={(a) => dispatchRef!(a)} />;
  }
  const { container } = render(<Host />);
  for (let steps = 0; latest.phase === 'playing'; steps++) {
    if (steps > 3000) throw new Error('UI match did not finish');
    const before = latest.logSeq;
    if (latest.activePlayerId === 'p0') {
      humanStep(latest, container);
    } else {
      const a = chooseAIAction(latest, latest.activePlayerId!)!;
      act(() => dispatchRef!(a));
    }
    expect(latest.logSeq).toBeGreaterThan(before);
  }
  cleanup();
  return latest;
}

