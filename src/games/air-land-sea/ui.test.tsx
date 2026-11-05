import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { AlsConfig, AlsState } from './types';
import { bundle } from './ui';
import { applyAction } from './reducer';
import { AlsCardView } from './Card';
import { CARD_TEMPLATES } from './cards';
import { arrange, card, newMatch, play } from './testSupport';

afterEach(cleanup);

const SLS: Partial<AlsConfig> = { theaters: ['intel', 'diplo', 'econ'], expansions: { spiesLiesSupplies: true } };

function setup(state: AlsState, localPlayerId: string | null = 'p0') {
  const dispatch = vi.fn();
  const view = render(<bundle.GameView state={state} localPlayerId={localPlayerId} dispatch={dispatch} />);
  return { dispatch, view, c: view.container };
}

const theater = (c: HTMLElement, i: number) => c.querySelectorAll('.als-theater')[i] as HTMLElement;
const handCard = (c: HTMLElement, name: string) =>
  Array.from(c.querySelectorAll('.als-hand .als-card')).find((el) => el.textContent?.includes(name)) as HTMLElement;
const boardCard = (c: HTMLElement, id: number) => c.querySelector(`[data-card="${id}"] .als-card`) as HTMLElement;
const button = (c: HTMLElement, text: string) =>
  Array.from(c.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

/** A battle in progress with face-down cards on both sides. */
function midBattle(): AlsState {
  return arrange(newMatch(), {
    hands: [[card('air', 6), card('sea', 6), card('land', 3)], [card('land', 6), card('sea', 1)]],
    board: {
      0: [[[card('air', 1), 'd']], []],
      1: [[], [[card('land', 5), 'd']]],
      2: [[], [[card('sea', 2), 'u'], [card('sea', 4), 'd']]],
    },
    turn: 0,
    first: 0,
  });
}

describe('hidden information', () => {
  it("hides the opponent's face-down cards and peeks at your own", () => {
    const { c } = setup(midBattle());
    const board = c.querySelector('.als-board')!.innerHTML;
    expect(board).not.toContain('Disrupt');
    expect(board).not.toContain('Redeploy');
    expect(c.querySelector('.als-peek')?.textContent).toContain('Support');
    // The opponent's face-down cards count 4 under their face-up Escalation.
    const backs = Array.from(c.querySelectorAll('.als-board .als-back:not(.als-peek) .als-card-str'));
    expect(backs.map((b) => b.textContent)).toEqual(['4', '4']);
  });

  it('the opponent sees the same board the other way round', () => {
    const { c } = setup(midBattle(), 'p1');
    const board = c.querySelector('.als-board')!.innerHTML;
    expect(board).not.toContain('Support');
    expect(board).toContain('Disrupt');
    expect(board).toContain('Redeploy');
  });

  it("names an improvised card in the history for its owner only", () => {
    const s = applyAction(midBattle(), { type: 'improvise', playerId: 'p0', cardId: card('sea', 6), theaterIdx: 0 });
    const mine = setup(s, 'p0').c.querySelector('.als-sidebar')!.textContent!;
    cleanup();
    const theirs = setup(s, 'p1').c.querySelector('.als-sidebar')!.textContent!;
    expect(mine).toContain('played Super Battleship face down');
    expect(theirs).toContain('played a card face down');
    expect(theirs).not.toContain('Super Battleship');
  });

  it('shows revealed cards in the opponent’s hand', () => {
    const s = midBattle();
    s.players[1].known = [card('sea', 1)];
    const { c } = setup(s);
    expect(c.querySelectorAll('.als-opp-hand .als-mini-face')).toHaveLength(1);
    expect(c.querySelector('.als-opp-hand')!.textContent).toContain('1 revealed');
  });
});

describe('turn actions', () => {
  it('deploys: pick a card, then a highlighted theater', () => {
    const { c, dispatch, view } = setup(midBattle());
    fireEvent.click(handCard(c, 'Heavy Bombers'));
    expect(theater(c, 0).className).toContain('als-theater-highlight');
    expect(theater(c, 1).className).not.toContain('als-theater-highlight');
    fireEvent.click(theater(c, 1));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(theater(c, 0));
    expect(dispatch).toHaveBeenCalledWith({ type: 'deploy', playerId: 'p0', cardId: card('air', 6), theaterIdx: 0 });
    void view;
  });

  it('improvises face down to any theater', () => {
    const { c, dispatch } = setup(midBattle());
    fireEvent.click(handCard(c, 'Super Battleship'));
    fireEvent.click(button(c, 'Improvise'));
    fireEvent.click(theater(c, 1));
    expect(dispatch).toHaveBeenCalledWith({ type: 'improvise', playerId: 'p0', cardId: card('sea', 6), theaterIdx: 1 });
  });

  it('withdraws after a confirmation, showing what it costs', () => {
    const { c, dispatch } = setup(midBattle());
    // 1st player with 3 cards: 3 VP.
    fireEvent.click(button(c, 'Withdraw'));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(button(c, 'Confirm withdraw (+3 VP'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'withdraw', playerId: 'p0' });
  });

  it('continues to the next battle from the summary', () => {
    const s = applyAction(midBattle(), { type: 'withdraw', playerId: 'p0' });
    const { c, dispatch } = setup(s, 'p0');
    expect(c.textContent).toContain('Bob wins the battle');
    fireEvent.click(button(c, 'Next battle'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'continueBattle' });
  });
});

describe('ability decisions', () => {
  it('Maneuver: highlights the legal targets and answers with the clicked card', () => {
    const s = applyAction(midBattle(), { type: 'deploy', playerId: 'p0', cardId: card('land', 3), theaterIdx: 1 });
    const { c, dispatch } = setup(s);
    expect(c.querySelector('.als-decision')!.textContent).toContain('Flip an uncovered card');
    expect(c.querySelectorAll('.als-stack-slot.highlighted')).toHaveLength(2);
    fireEvent.click(boardCard(c, card('sea', 4)));
    expect(dispatch).toHaveBeenCalledWith({ type: 'answer', playerId: 'p0', answer: { kind: 'card', cardId: card('sea', 4) } });
  });

  it('shows the other player whose decision it is', () => {
    const s = applyAction(midBattle(), { type: 'deploy', playerId: 'p0', cardId: card('land', 3), theaterIdx: 1 });
    const { c } = setup(s, 'p1');
    expect(c.querySelector('.als-decision.waiting')!.textContent).toContain('Ann is choosing a card to flip');
  });

  it('Transport: pick your card, then the theater', () => {
    const s = arrange(newMatch(), {
      hands: [[card('sea', 1)], [card('air', 6)]],
      board: { 0: [[[card('air', 5), 'u'], [card('air', 2), 'd']], []] },
      turn: 0,
    });
    const after = applyAction(s, { type: 'deploy', playerId: 'p0', cardId: card('sea', 1), theaterIdx: 2 });
    const { c, dispatch, view } = setup(after);
    fireEvent.click(boardCard(c, card('air', 5)));
    // Re-render with the same state: the local pick is kept and theaters light up.
    expect(c.querySelectorAll('.als-theater-highlight')).toHaveLength(2);
    fireEvent.click(theater(c, 1));
    expect(dispatch).toHaveBeenCalledWith({ type: 'answer', playerId: 'p0', answer: { kind: 'move', cardId: card('air', 5), theaterIdx: 1 } });
    void view;
  });

  it("Surveil: the enemy picks a card to reveal from their hand", () => {
    const s = arrange(newMatch(SLS), { hands: [[card('intel', 5), card('econ', 1)], [card('econ', 4), card('diplo', 1)]], turn: 0 });
    const after = applyAction(s, { type: 'deploy', playerId: 'p0', cardId: card('intel', 5), theaterIdx: 0 });
    const { c, dispatch } = setup(after, 'p1');
    expect(c.querySelector('.als-decision')!.textContent).toContain('you must reveal a card');
    fireEvent.click(handCard(c, 'Requisition'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'answer', playerId: 'p1', answer: { kind: 'card', cardId: card('econ', 4) } });
  });

  it('Give & Take: the drawn card is shown to its drawer only', () => {
    const s = arrange(newMatch(SLS), { hands: [[card('diplo', 5)], [card('econ', 5)]], deckTop: [card('econ', 1), card('intel', 6)], turn: 0 });
    const after = applyAction(s, { type: 'deploy', playerId: 'p0', cardId: card('diplo', 5), theaterIdx: 1 });
    const mine = setup(after, 'p0');
    expect(mine.c.querySelector('.als-decision')!.textContent).toContain('You drew Covert Operations');
    fireEvent.click(button(mine.c, 'Give it'));
    expect(mine.dispatch).toHaveBeenCalledWith({ type: 'answer', playerId: 'p0', answer: { kind: 'option', option: 'give' } });
    cleanup();
    const theirs = setup(after, 'p1');
    expect(theirs.c.textContent).not.toContain('Covert Operations');
  });

  it('Neutralize: name a card from the picker', () => {
    const s = arrange(newMatch(SLS), { hands: [[card('intel', 4), card('diplo', 6)], [card('econ', 6)]], turn: 0 });
    const after = applyAction(s, { type: 'deploy', playerId: 'p0', cardId: card('intel', 4), theaterIdx: 0 });
    const { c, dispatch } = setup(after);
    const buttons = c.querySelectorAll('.als-name-btn');
    expect(buttons).toHaveLength(18);
    // Your own hand card is dimmed: it can't be in the enemy's hand.
    expect(Array.from(buttons).find((b) => b.textContent?.includes('Grand Betrayal'))!.className).toContain('seen');
    fireEvent.click(Array.from(buttons).find((b) => b.textContent?.includes('Production Surge'))!);
    expect(dispatch).toHaveBeenCalledWith({ type: 'answer', playerId: 'p0', answer: { kind: 'name', cardId: card('econ', 6) } });
  });

  it('Neutralized cards are the only playable ones, face down', () => {
    let s = arrange(newMatch(SLS), { hands: [[card('intel', 4), card('diplo', 6)], [card('econ', 6), card('econ', 5)]], turn: 0 });
    s = play(s,
      { type: 'deploy', playerId: 'p0', cardId: card('intel', 4), theaterIdx: 0 },
      { type: 'answer', playerId: 'p0', answer: { kind: 'name', cardId: card('econ', 6) } });
    const { c } = setup(s, 'p1');
    expect(c.querySelector('.als-hint')!.textContent).toContain('must play Production Surge face down');
    expect(handCard(c, 'Arms Race').className).toContain('muted');
    fireEvent.click(handCard(c, 'Production Surge'));
    expect(button(c, 'Deploy').disabled).toBe(true);
    expect(c.querySelectorAll('.als-theater-highlight')).toHaveLength(3);
  });
});

describe('lobby', () => {
  it('switches to the expansion theaters and to Epic Mode', () => {
    const onChange = vi.fn();
    const base: AlsConfig = { theaters: ['air', 'land', 'sea'], expansions: { spiesLiesSupplies: false }, targetVp: 12, randomOrder: true };
    const view = render(<bundle.LobbyConfig config={base} seats={[]} onChange={onChange} />);
    fireEvent.click(view.getByText('Spies, Lies & Supplies').closest('label')!.querySelector('input')!);
    expect(onChange.mock.calls[0][0]).toMatchObject({ theaters: ['intel', 'diplo', 'econ'], expansions: { spiesLiesSupplies: true } });
    cleanup();
    const sls: AlsConfig = { ...base, theaters: ['intel', 'diplo', 'econ'], expansions: { spiesLiesSupplies: true } };
    const v2 = render(<bundle.LobbyConfig config={sls} seats={[]} onChange={onChange} />);
    fireEvent.click(v2.getByText('Epic Mode').closest('label')!.querySelector('input')!);
    expect(onChange.mock.calls[1][0]).toMatchObject({ epic: true, targetVp: 6 });
    expect(onChange.mock.calls[1][0].theaters).toHaveLength(5);
  });
});

describe('cards', () => {
  it('draws every card face', () => {
    const view = render(<div>{CARD_TEMPLATES.map((c) => <AlsCardView key={c.id} card={c} />)}</div>);
    expect(view.container.querySelectorAll('.als-card svg').length).toBeGreaterThanOrEqual(36);
    for (const c of CARD_TEMPLATES) expect(view.container.textContent).toContain(c.name);
  });
});
