import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { AlsState } from './types';
import { airLandSeaModule } from './module';
import { bundle } from './ui';

afterEach(cleanup);

const SEATS = [
  { id: 'me', name: 'Me', color: '#6aa0ff', isAI: false, isLocal: true },
  { id: 'bot', name: 'Bot', color: '#ff8a65', isAI: true, isLocal: true },
];

/** A battle in progress with face-down cards on both sides. */
function midBattle(): AlsState {
  const s = structuredClone(airLandSeaModule.createInitialState(airLandSeaModule.defaultConfig(SEATS), 3, SEATS));
  const idOf = (name: string) => Number(Object.keys(s.deckPool).find((k) => s.deckPool[Number(k)].name === name));
  const put = (t: number, side: 0 | 1, name: string, faceDown = false) => {
    const id = idOf(name);
    for (const p of s.players) p.hand = p.hand.filter((x) => x !== id);
    s.deck = s.deck.filter((x) => x !== id);
    s.playedCards[t][side].push({ cardId: id, faceDown });
  };
  put(0, 0, 'Heavy Bombers');
  put(0, 0, 'Support', true);         // mine, face-down
  put(1, 1, 'Escalation');
  put(1, 1, 'Disrupt', true);         // the bot's, face-down
  put(2, 1, 'Redeploy', true);        // the bot's, face-down, uncovered
  s.activePlayerId = 'me';
  s.subPhase = 'awaitingAction';
  s.pendingAbility = null;
  return s;
}

function setup(state: AlsState, localPlayerId: string | null = 'me') {
  const dispatch = vi.fn();
  const view = render(<bundle.GameView state={state} localPlayerId={localPlayerId} dispatch={dispatch} />);
  return { dispatch, view };
}

describe('air, land & sea game view', () => {
  it("hides the opponent's face-down cards and peeks at your own", () => {
    const { view } = setup(midBattle());
    const html = view.container.innerHTML;
    expect(html).not.toContain('Disrupt');
    expect(html).not.toContain('Redeploy');
    // Own face-down card: a back with a strip naming it.
    expect(view.container.querySelector('.als-peek')?.textContent).toContain('Support');
    // The opponent's face-down cards count 4 under their face-up Escalation.
    const backs = Array.from(view.container.querySelectorAll('.als-back:not(.als-peek):not(.als-card-mini) .als-card-str'));
    expect(backs.map((b) => b.textContent)).toEqual(['4', '4']);
  });

  it('the opponent sees the same board the other way round', () => {
    const { view } = setup(midBattle(), 'bot');
    const html = view.container.innerHTML;
    expect(html).not.toContain('Support');
    expect(html).toContain('Disrupt');
    expect(html).toContain('Redeploy');
  });

  it('deploys a selected hand card to its highlighted theater', () => {
    const s = midBattle();
    const { dispatch, view } = setup(s);
    const cardId = s.players[0].hand.find((id) => s.deckPool[id].theater === 'sea')!;
    const hand = Array.from(view.container.querySelectorAll<HTMLElement>('.als-hand .als-card'));
    fireEvent.click(hand[s.players[0].hand.indexOf(cardId)]);
    const theaters = view.container.querySelectorAll<HTMLElement>('.als-theater');
    expect(theaters[2].classList.contains('als-theater-highlight')).toBe(true);
    fireEvent.click(theaters[2]);
    expect(dispatch).toHaveBeenCalledWith({ type: 'deploy', playerId: 'me', cardId, theaterIdx: 2 });
  });

  it('picks a flip target among the uncovered cards', () => {
    const s = midBattle();
    s.subPhase = 'awaitingFlipTarget';
    s.pendingAbility = { kind: 'ambush', sourceCardId: 0 };
    const { dispatch, view } = setup(s);
    const targets = view.container.querySelectorAll<HTMLElement>('.als-stack-slot.highlighted .als-card');
    expect(targets.length).toBe(3);
    fireEvent.click(targets[0]);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'chooseFlipTarget', playerId: 'me' }));
  });

  it('renders the battle summary and the end of the war', () => {
    const s = midBattle();
    s.subPhase = 'battleEnd';
    s.lastBattleResult = {
      battleNumber: 1, endedBy: 'withdraw', withdrawerSeatIdx: 1, winnerSeatIdx: 0, vpAwardedToWinner: 3,
      theaterControl: [0, 1, 0], theaterStrengths: [[8, 0], [0, 9], [0, 2]],
    };
    s.players[0].vp = 3;
    const end = setup(s);
    expect(end.view.container.textContent).toContain('Me wins the battle');
    expect(end.view.container.querySelectorAll('.als-result-table tbody tr').length).toBe(3);
    fireEvent.click(end.view.getByText('Next battle →'));
    expect(end.dispatch).toHaveBeenCalledWith({ type: 'continueBattle' });
    cleanup();

    const over = structuredClone(s);
    over.phase = 'gameOver';
    over.subPhase = 'gameOver';
    over.players[0].vp = 12;
    expect(setup(over).view.container.textContent).toContain('Me wins the war!');
  });
});
