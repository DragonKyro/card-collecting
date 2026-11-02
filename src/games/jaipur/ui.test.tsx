import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { JaipurCard, JaipurCardType, JaipurState } from './types';
import { createJaipurState } from './reducer';
import { bundle } from './ui';

afterEach(cleanup);

let nextId = 500;
const cards = (...types: JaipurCardType[]): JaipurCard[] => types.map((type) => ({ id: nextId++, type }));

function position(): JaipurState {
  const s = createJaipurState({ sealsToWin: 2 }, 9, [
    { id: 'me', name: 'Me', color: '#6aa0ff', isAI: false, isLocal: true },
    { id: 'ai', name: 'Bot', color: '#ff8a65', isAI: true, isLocal: true },
  ]);
  s.market = cards('camel', 'diamond', 'diamond', 'leather', 'spice');
  s.players[0].hand = cards('cloth', 'cloth', 'cloth', 'gold');
  s.players[0].herd = cards('camel', 'camel');
  s.players[1].hand = cards('silver', 'silver');
  s.activePlayerId = 'me';
  return s;
}

function setup(state = position(), localPlayerId: string | null = 'me') {
  const dispatch = vi.fn();
  const view = render(<bundle.GameView state={state} localPlayerId={localPlayerId} dispatch={dispatch} />);
  const q = (sel: string) => Array.from(view.container.querySelectorAll<HTMLElement>(sel));
  const market = () => q('.jp-market .jp-card');
  const hand = () => q('.jp-player-bottom .jp-hand .jp-card');
  const herd = () => q('.jp-player-bottom .jp-herd .jp-card');
  const go = () => view.container.querySelector<HTMLButtonElement>('.jp-go')!;
  const hint = () => view.container.querySelector('.jp-intent-hint')!.textContent;
  return { state, dispatch, view, market, hand, herd, go, hint };
}

describe('jaipur game view', () => {
  it('takes one good from the market', () => {
    const t = setup();
    fireEvent.click(t.market()[1]);
    expect(t.go().textContent).toBe('Take Diamond');
    fireEvent.click(t.go());
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'takeOne', cardId: t.state.market[1].id });
  });

  it('a market camel selects all camels for one take', () => {
    const t = setup();
    fireEvent.click(t.market()[0]);
    expect(t.go().textContent).toBe('Take 1 camel');
    fireEvent.click(t.go());
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'takeCamels' });
  });

  it('builds a trade from market goods and herd camels', () => {
    const t = setup();
    fireEvent.click(t.market()[1]);
    fireEvent.click(t.market()[2]);
    expect(t.go().disabled).toBe(true);
    expect(t.hint()).toMatch(/Pick 2 more cards/);
    fireEvent.click(t.herd()[0]);
    fireEvent.click(t.herd()[1]);
    expect(t.go().textContent).toBe('Trade 2 for 2');
    fireEvent.click(t.go());
    const [d1, d2] = [t.state.market[1].id, t.state.market[2].id];
    const [c1, c2] = t.state.players[0].herd.map((c) => c.id);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'exchange', takeIds: [d1, d2], giveIds: [c1, c2] });
  });

  it('sells cards of one good, and refuses a mixed or too-small sale', () => {
    const t = setup();
    const byType = (label: string) => t.hand().filter((c) => c.querySelector(`[aria-label="${label}"]`));
    const [gold] = byType('Gold');
    const [cl1, cl2, cl3] = byType('Cloth');
    fireEvent.click(gold);
    expect(t.go().disabled).toBe(true);
    expect(t.hint()).toMatch(/2 at a time/);
    fireEvent.click(cl1);
    expect(t.hint()).toMatch(/one type of good/);
    fireEvent.click(gold);
    fireEvent.click(cl2);
    fireEvent.click(cl3);
    expect(t.go().textContent).toBe('Sell 3 Cloth');
    fireEvent.click(t.go());
    const ids = t.state.players[0].hand.filter((c) => c.type === 'cloth').map((c) => c.id);
    expect(t.dispatch).toHaveBeenCalledWith({ type: 'sell', cardIds: expect.arrayContaining(ids) });
  });

  it('greys out hand cards of a type being taken', () => {
    const s = position();
    s.market = cards('cloth', 'cloth', 'diamond', 'leather', 'spice');
    const t = setup(s);
    fireEvent.click(t.market()[0]);
    expect(t.hand().filter((c) => c.classList.contains('disabled'))).toHaveLength(3);
  });

  it('never shows the opponent\'s hand or bonus values', () => {
    const s = position();
    s.players[1].bonusTokens = [{ id: 100, size: 3, value: 3 }];
    const t = setup(s);
    const top = t.view.container.querySelector('.jp-player-top')!;
    expect(top.querySelectorAll('.jp-hand [aria-label="Silver"]')).toHaveLength(0);
    expect(top.querySelectorAll('.jp-hand [aria-label="Card back"]')).toHaveLength(2);
    expect(top.querySelector('.jp-bonus')!.getAttribute('title')).toMatch(/face down/);
  });

  it('offers nothing to click when it is not the viewer\'s turn', () => {
    const s = position();
    s.activePlayerId = 'ai';
    const t = setup(s);
    expect(t.view.container.querySelector('.jp-go')).toBeNull();
    expect(t.view.container.textContent).toMatch(/Waiting for Bot/);
  });
});
