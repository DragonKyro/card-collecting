// 7 Wonders Duel — the Agora expansion: setup, Senators, the Senate (cubes,
// control, Decrees, Political Supremacy), Conspiracies (conspire, prepare,
// trigger — every one), the two wonders and the new Progress tokens.

import { describe, it, expect } from 'vitest';
import type { DuelConspiracyId, DuelDecreeId, DuelState } from './types';
import { applyAction, legalActions, _internals } from './reducer';
import { availableSlots } from './pyramid';
import { chamberController, senateActionCount } from './agora';
import { cardPayment, discardGain, wonderPayment } from './resources';
import { wonderById } from './wonders';
import { scoreMatch } from './scoring';
import { act, cardNamed, giveCard, giveConspiracy, newMatch, SEATS, stage, startedMatch, turnOf } from './testSupport';

const AGORA = { agora: true } as const;
const W: [string[], string[]] = [['pyramids', 'sphinx', 'curia-julia', 'knossos'], ['colossus', 'piraeus', 'mausoleum', 'great-library']];

/** Age I, the first player's turn, Agora on; the player to move holds W[0]. */
function agoraMatch(seed = 3): DuelState {
  const s = startedMatch(seed, W, AGORA);
  const seat = s.activeSeatIdx;
  s.players[seat].wonders = W[0].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  s.players[1 - seat].wonders = W[1].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  return s;
}

/** Put a Decree alone in a Chamber (0-based), face up. */
function decreeIn(s: DuelState, chamber: number, id: DuelDecreeId): void {
  for (const ds of s.agora!.decrees) for (let i = ds.length - 1; i >= 0; i--) if (ds[i].id === id) ds.splice(i, 1);
  s.agora!.decrees[chamber] = [{ id, faceUp: true }];
}

/** Give a seat control of a Chamber (0-based) with `n` cubes. */
function control(s: DuelState, chamber: number, seat: 0 | 1, n = 1): void {
  s.agora!.chambers[chamber][seat] += n;
  s.players[seat].agora!.cubes -= n;
}

/** Trigger a prepared Conspiracy for the active seat. */
function trigger(s: DuelState, id: DuelConspiracyId): DuelState {
  giveConspiracy(s, s.activeSeatIdx, id, true);
  return act(s, { type: 'triggerConspiracy', playerId: s.activePlayerId!, conspiracy: id });
}

describe('Agora setup', () => {
  it('a Senate of 6 empty Chambers, 6 Decrees (1, 3, 5 face up), 16 Conspiracies, 12 cubes each', () => {
    const s = newMatch(4, SEATS, AGORA);
    const ag = s.agora!;
    expect(ag.chambers).toEqual([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(ag.decrees.map((d) => d.length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(ag.decrees.map((d) => d[0].faceUp)).toEqual([true, false, true, false, true, false]);
    expect(ag.conspiracyDeck).toHaveLength(16);
    expect(ag.senatorPile).toHaveLength(13);
    expect(s.players.map((p) => p.agora!.cubes)).toEqual([12, 12]);
    expect(s.progressBox).toHaveLength(7);
  });

  it('shuffles 5 / 5 / 3 Senators into the ages: structures of 25 / 25 / 23 cards', () => {
    const s = agoraMatch();
    const senators = (st: DuelState) => st.pyramid.filter((x) => st.cardsById[x.cardId].color === 'senator').length;
    expect(s.pyramid).toHaveLength(25);
    expect(senators(s)).toBe(5);
    expect(availableSlots(s.pyramid)).toHaveLength(7);
    _internals.startAge(s, 2);
    expect(s.pyramid).toHaveLength(25);
    expect(senators(s)).toBe(5);
    expect(availableSlots(s.pyramid)).toHaveLength(3);
    _internals.startAge(s, 3);
    expect(s.pyramid).toHaveLength(23);
    expect(senators(s)).toBe(3);
    expect(s.agora!.senatorPile).toHaveLength(0);
    expect(s.boxedCards).toHaveLength(9);
  });

  it('Curia Julia conspires and Knossos places a cube the moment they are drafted', () => {
    let s = newMatch(11, SEATS, AGORA);
    s.wonderDraft!.pool = ['curia-julia', 'knossos', 'pyramids', 'sphinx'];
    const seat = s.activeSeatIdx;
    s = act(s, { type: 'submitWonderDraft', playerId: s.activePlayerId!, wonderId: 'curia-julia' });
    expect(s.subPhase).toBe('conspire');
    const p = s.pending[0];
    const [keep, other] = p.kind === 'conspire' ? p.options! : [];
    s = act(s, { type: 'chooseConspiracy', playerId: s.activePlayerId!, conspiracy: keep });
    expect(s.subPhase).toBe('remnant');
    s = act(s, { type: 'placeRemnant', playerId: s.activePlayerId!, top: false });
    expect(s.agora!.conspiracyDeck[0]).toBe(other);
    expect(s.players[seat].agora!.conspiracies).toEqual([{ id: keep, preparedWith: null, triggered: false }]);
    expect(s.subPhase).toBe('wonderDraft');
    expect(s.activeSeatIdx).toBe(1 - seat);
    s = act(s, { type: 'submitWonderDraft', playerId: s.activePlayerId!, wonderId: 'knossos' });
    expect(s.subPhase).toBe('placeInfluence');
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 3 });
    expect(s.agora!.chambers[2][1 - seat]).toBe(1);
    expect(s.subPhase).toBe('wonderDraft');
    // The log never names the kept Conspiracy.
    expect(JSON.stringify(s.log)).not.toContain(keep);
  });
});

describe('Agora: Senators', () => {
  it('a Senator costs a coin per Senator already in the city; Corruption makes them free', () => {
    const s = agoraMatch();
    const seat = s.activeSeatIdx;
    const politician = cardNamed('Politician (left)');
    expect(cardPayment(s, seat, politician).coins).toBe(0);
    giveCard(s, seat, 'Conspirator', 'Politician (right)');
    expect(cardPayment(s, seat, politician).coins).toBe(2);
    s.players[seat].progressTokens.push('corruption');
    expect(cardPayment(s, seat, politician).coins).toBe(0);
  });

  it('a Politician gives 1 / 2 / 3 Senate actions for 0–1 / 2–3 / 4+ blue cards (Majority: +2)', () => {
    const s = agoraMatch();
    const seat = s.activeSeatIdx;
    expect(senateActionCount(s, seat)).toBe(1);
    giveCard(s, seat, 'Theater', 'Altar');
    expect(senateActionCount(s, seat)).toBe(2);
    giveCard(s, seat, 'Baths', 'Temple');
    expect(senateActionCount(s, seat)).toBe(3);
    const t = agoraMatch();
    decreeIn(t, 0, 'senateBoost');
    control(t, 0, t.activeSeatIdx);
    expect(senateActionCount(t, t.activeSeatIdx)).toBe(2);
  });

  it('Senate actions: place in the section, move to the next Chamber, or stop', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    giveCard(s, seat, 'Theater', 'Altar'); // 2 actions
    s.players[seat].coins = 10;
    const id = stage(s, 'Politician (centre)');
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(s.subPhase).toBe('senate');
    expect(() => act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 1 })).toThrow(/section/);
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 4 });
    expect(s.subPhase).toBe('senate');
    expect(legalActions(s).map((a) => a.type).sort()).toEqual(['moveInfluence', 'moveInfluence', 'placeInfluence', 'placeInfluence', 'skip']);
    s = act(s, { type: 'moveInfluence', playerId: s.activePlayerId!, from: 4, to: 5 });
    expect(s.agora!.chambers[3][seat]).toBe(0);
    expect(s.agora!.chambers[4][seat]).toBe(1);
    expect(s.players[seat].agora!.cubes).toBe(11);
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(1 - seat);
  });

  it('a Conspirator places a cube anywhere or conspires; Organized Crime keeps both', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const id = stage(s, 'Conspirator');
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(s.subPhase).toBe('conspirator');
    s = act(s, { type: 'conspiratorChoice', playerId: s.activePlayerId!, choice: 'influence' });
    expect(s.subPhase).toBe('placeInfluence');
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 6 });
    expect(s.agora!.chambers[5][seat]).toBe(1);

    let t = agoraMatch();
    const ts = t.activeSeatIdx;
    t.players[ts].progressTokens.push('organizedCrime');
    const top2 = t.agora!.conspiracyDeck.slice(-2);
    t = act(t, { type: 'takeAndBuild', playerId: t.activePlayerId!, cardId: stage(t, 'Conspirator') });
    t = act(t, { type: 'conspiratorChoice', playerId: t.activePlayerId!, choice: 'conspire' });
    expect(t.players[ts].agora!.conspiracies.map((c) => c.id).sort()).toEqual(top2.slice().sort());
    expect(t.subPhase).toBe('turn');
    expect(t.activeSeatIdx).toBe(1 - ts);
  });

  it('the Secret Society Decree makes a Conspirator play again', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    decreeIn(s, 1, 'conspiratorReplay');
    control(s, 1, seat);
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: stage(s, 'Conspirator') });
    s = act(s, { type: 'conspiratorChoice', playerId: s.activePlayerId!, choice: 'influence' });
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 1 });
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(seat);
  });
});

describe('Agora: control, Decrees and Political Supremacy', () => {
  it('more cubes control a Chamber; a tie is nobody; gaining control turns its Decree face up', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    expect(s.agora!.decrees[1][0].faceUp).toBe(false);
    s.pending = [{ kind: 'placeInfluence', seatIdx: seat }];
    s = _internals.settle(s);
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 2 });
    expect(chamberController(s.agora!, 1)).toBe(seat);
    expect(s.agora!.decrees[1][0].faceUp).toBe(true);
    s.agora!.chambers[1][1 - seat] = 1;
    expect(chamberController(s.agora!, 1)).toBeNull();
  });

  it('the Levy pushes the pawn toward the opponent on gaining control, back on losing it', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    const dir = seat === 0 ? 1 : -1;
    decreeIn(s, 0, 'militaryDecree');
    s.pending = [{ kind: 'placeInfluence', seatIdx: seat }];
    s = _internals.settle(s);
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 1 });
    expect(s.militaryPawn).toBe(dir);
    // The opponent ties it (pawn back), then takes it (a step toward me): 2 spaces in all.
    s.pending = [{ kind: 'placeInfluence', seatIdx: opp }, { kind: 'placeInfluence', seatIdx: opp }];
    s = _internals.settle(s);
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 1 });
    expect(s.militaryPawn).toBe(0);
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 1 });
    expect(s.militaryPawn).toBe(-dir);
  });

  it('colour taxes and the Monument Tax pay their controller the current Age in coins', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    decreeIn(s, 0, 'blueCoins');
    decreeIn(s, 2, 'wonderCoins');
    control(s, 0, opp);
    control(s, 2, opp);
    const before = s.players[opp].coins;
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: stage(s, 'Theater') });
    expect(s.players[opp].coins).toBe(before + 1);
    s = turnOf(s, seat);
    s.players[seat].coins = 30;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'pyramids' });
    expect(s.players[opp].coins).toBe(before + 2);
  });

  it('charters ignore a cost symbol, trade rights take a coin off bought resources, Salvage Rights add 2 to a discard', () => {
    const s = agoraMatch();
    const seat = s.activeSeatIdx;
    const pretorium = cardNamed('Pretorium'); // 8 coins
    expect(cardPayment(s, seat, pretorium).coins).toBe(8);
    decreeIn(s, 0, 'redRebate');
    control(s, 0, seat);
    expect(cardPayment(s, seat, pretorium)).toMatchObject({ coins: 0, ignored: 'coins' });
    const walls = cardNamed('Walls'); // 2 stone at 2 each
    expect(cardPayment(s, seat, walls)).toMatchObject({ coins: 2, ignored: 'stone' });
    decreeIn(s, 2, 'rawTrade');
    control(s, 2, seat);
    expect(cardPayment(s, seat, cardNamed('Baths')).coins).toBe(1);
    decreeIn(s, 4, 'wonderRebate');
    control(s, 4, seat);
    expect(wonderPayment(s, seat, wonderById('pyramids')).coins).toBe(3 * 1 + 2 - 1 - 1);
    decreeIn(s, 1, 'discardBonus');
    control(s, 1, seat);
    expect(discardGain(s, seat)).toBe(4);
  });

  it('Common Heritage chains from the opponent\'s cards', () => {
    const s = agoraMatch();
    const seat = s.activeSeatIdx;
    giveCard(s, (1 - seat) as 0 | 1, 'Baths');
    expect(cardPayment(s, seat, cardNamed('Aqueduct')).chained).toBe(false);
    decreeIn(s, 0, 'sharedChains');
    control(s, 0, seat);
    expect(cardPayment(s, seat, cardNamed('Aqueduct')).chained).toBe(true);
  });

  it('controlling all six Chambers wins at once (Political Supremacy)', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    for (let c = 0; c < 5; c++) control(s, c, seat);
    s.pending = [{ kind: 'placeInfluence', seatIdx: seat }];
    s = _internals.settle(s);
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 6 });
    expect(s.phase).toBe('gameOver');
    expect(s.endReason).toBe('political');
    expect(s.winnerSeatIdx).toBe(seat);
  });

  it('scores 1 / 2 / 3 / 3 / 2 / 1 VP per Chamber controlled', () => {
    const s = agoraMatch();
    control(s, 0, 0);
    control(s, 2, 0);
    control(s, 4, 1);
    const rows = scoreMatch(s);
    expect(rows[0].senate).toBe(1 + 3);
    expect(rows[1].senate).toBe(2);
  });

  it('military tokens give Senate actions instead of looting coins', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    s.militaryPawn = seat === 0 ? 2 : -2;
    s.players[seat].coins = 30;
    control(s, 3, opp, 2);
    const oppCoins = s.players[opp].coins;
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: stage(s, 'Guard Tower') });
    expect(s.players[opp].coins).toBe(oppCoins);
    expect(s.subPhase).toBe('placeInfluence');
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 1 });
    // Then to 6: remove one of the opponent's cubes, then may move one.
    s = turnOf(s, seat);
    s.militaryPawn = seat === 0 ? 5 : -5;
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: stage(s, 'Stable') });
    expect(s.subPhase).toBe('removeInfluence');
    s = act(s, { type: 'removeInfluence', playerId: s.activePlayerId!, chamber: 4 });
    expect(s.agora!.chambers[3][opp]).toBe(1);
    expect(s.subPhase).toBe('moveInfluence');
    s = act(s, { type: 'skip', playerId: s.activePlayerId! });
    expect(s.subPhase).toBe('turn');
  });
});

describe('Agora: preparing and triggering Conspiracies', () => {
  it('prepares a Conspiracy with a structure card (a turn), triggers it at the start of a later turn, then plays the turn', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    giveConspiracy(s, seat, 'coup', false);
    const card = availableSlots(s.pyramid)[0].cardId;
    s = act(s, { type: 'takeAndPrepare', playerId: s.activePlayerId!, cardId: card, conspiracy: 'coup' });
    expect(s.players[seat].agora!.conspiracies[0].preparedWith).toBe(card);
    expect(s.activeSeatIdx).toBe(1 - seat);
    s = turnOf(s, seat);
    s = act(s, { type: 'triggerConspiracy', playerId: s.activePlayerId!, conspiracy: 'coup' });
    expect(s.militaryPawn).toBe(seat === 0 ? 2 : -2);
    // Still my turn, and only one Conspiracy a turn.
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(seat);
    expect(legalActions(s).some((a) => a.type === 'triggerConspiracy')).toBe(false);
    s = act(s, { type: 'takeAndDiscard', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId });
    expect(s.activeSeatIdx).toBe(1 - seat);
  });

  it('refuses to trigger an unprepared one, or a second one in the same turn', () => {
    const s = agoraMatch();
    const seat = s.activeSeatIdx;
    giveConspiracy(s, seat, 'blackmail', false);
    expect(() => act(s, { type: 'triggerConspiracy', playerId: s.activePlayerId!, conspiracy: 'blackmail' })).toThrow(/prepared/);
    giveConspiracy(s, seat, 'coup', true);
    giveConspiracy(s, seat, 'embezzlement', true);
    const t = act(s, { type: 'triggerConspiracy', playerId: s.activePlayerId!, conspiracy: 'coup' });
    expect(() => act(t, { type: 'triggerConspiracy', playerId: t.activePlayerId!, conspiracy: 'embezzlement' })).toThrow(/one Conspiracy/);
  });

  it('Curia Julia (built) may trigger an unprepared Conspiracy, then plays again', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    giveConspiracy(s, seat, 'coup', false);
    s.players[seat].coins = 40;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'curia-julia' });
    expect(s.subPhase).toBe('triggerUnprepared');
    s = act(s, { type: 'triggerConspiracy', playerId: s.activePlayerId!, conspiracy: 'coup' });
    expect(s.militaryPawn).toBe(seat === 0 ? 2 : -2);
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(seat);
  });

  it('Knossos (built) places a cube, then may move one; 3 VP', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    s.players[seat].coins = 40;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'knossos' });
    expect(s.subPhase).toBe('placeInfluence');
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 2 });
    expect(s.subPhase).toBe('moveInfluence');
    s = act(s, { type: 'moveInfluence', playerId: s.activePlayerId!, from: 2, to: 3 });
    expect(s.agora!.chambers[2][seat]).toBe(1);
    expect(scoreMatch(s)[seat].wonders).toBe(3);
  });
});

describe('Agora: every Conspiracy', () => {
  /** Skip the optional cube move most Conspiracies end with. */
  const skipMove = (s: DuelState) => (s.subPhase === 'moveInfluence' ? act(s, { type: 'skip', playerId: s.activePlayerId! }) : s);

  it('Extortion takes an unbuilt wonder', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    control(s, 0, seat);
    s = trigger(s, 'extortion');
    s = act(s, { type: 'chooseWonder', playerId: s.activePlayerId!, wonderId: 'mausoleum' });
    expect(s.subPhase).toBe('moveInfluence');
    s = skipMove(s);
    expect(s.players[seat].wonders.map((w) => w.wonderId)).toContain('mausoleum');
  });

  it('Blackmail takes half the opponent\'s coins, rounded up', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    s.players[1 - seat].coins = 7;
    const mine = s.players[seat].coins;
    s = trigger(s, 'blackmail');
    expect(s.players[1 - seat].coins).toBe(3);
    expect(s.players[seat].coins).toBe(mine + 4);
  });

  it('Expropriation discards a blue card, Swindle a yellow one', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    giveCard(s, opp, 'Theater', 'Tavern');
    s = trigger(s, 'expropriation');
    expect(s.subPhase).toBe('destroyCard');
    s = applyAction(s, legalActions(s)[0]);
    expect(s.players[opp].tableau.map((c) => c.name)).toEqual(['Tavern']);
    s = turnOf(s, seat);
    s = trigger(s, 'swindle');
    s = applyAction(s, legalActions(s)[0]);
    expect(s.players[opp].tableau).toHaveLength(0);
    expect(s.discard.map((c) => c.name)).toEqual(['Theater', 'Tavern']);
  });

  it('Obscurantism locks a token from the board, the opponent or the box (a boxed one stays unnamed)', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    s.players[1 - seat].progressTokens = ['philosophy'];
    s = trigger(s, 'obscurantism');
    expect(legalActions(s)).toHaveLength(5 + 1 + s.progressBox.length);
    s = act(s, { type: 'lockProgressToken', playerId: s.activePlayerId!, tokenId: 'philosophy' });
    expect(s.players[1 - seat].progressTokens).toEqual([]);
    expect(s.agora!.locked).toEqual({ tokenId: 'philosophy', from: 'opponent' });
    let t = agoraMatch();
    const boxed = t.progressBox[0];
    t = trigger(t, 'obscurantism');
    t = act(t, { type: 'lockProgressToken', playerId: t.activePlayerId!, tokenId: boxed });
    expect(t.progressBox).not.toContain(boxed);
    expect(t.log.find((e) => e.kind === 'tokenLocked')).toMatchObject({ tokenId: null, from: 'box' });
  });

  it('Coup: 2 shields', () => {
    const s = trigger(agoraMatch(), 'coup');
    expect(Math.abs(s.militaryPawn)).toBe(2);
  });

  it('Property Fraud builds a back-row card for free (not a Senator)', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    s = trigger(s, 'propertyFraud');
    expect(s.subPhase).toBe('backRowBuild');
    const legal = legalActions(s);
    for (const a of legal) {
      const slot = s.pyramid.find((x) => a.type === 'buildCard' && x.cardId === a.cardId)!;
      expect(slot.row).toBe(0);
      expect(s.cardsById[slot.cardId].color).not.toBe('senator');
    }
    const coins = s.players[seat].coins;
    s = applyAction(s, legal[0]);
    expect(s.players[seat].tableau).toHaveLength(1);
    expect(s.players[seat].coins).toBeGreaterThanOrEqual(coins);
  });

  it('Treason builds one of the boxed cards of the ages so far', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const boxed = s.boxedCards!.map((c) => c.id);
    expect(boxed).toHaveLength(3);
    s = trigger(s, 'treason');
    expect(legalActions(s).map((a) => a.type === 'buildCard' && a.cardId).sort()).toEqual(boxed.slice().sort());
    s = applyAction(s, legalActions(s)[0]);
    expect(s.players[seat].tableau.map((c) => c.id)).toContain(boxed[0]);
    expect(s.boxedCards).toHaveLength(2);
  });

  it('Political Maneuver: place, remove, then may move', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    control(s, 5, (1 - seat) as 0 | 1, 2);
    s = trigger(s, 'politicalManeuver');
    expect(s.subPhase).toBe('placeInfluence');
    s = act(s, { type: 'placeInfluence', playerId: s.activePlayerId!, chamber: 5 });
    expect(s.subPhase).toBe('removeInfluence');
    s = act(s, { type: 'removeInfluence', playerId: s.activePlayerId!, chamber: 6 });
    expect(s.subPhase).toBe('moveInfluence');
    s = act(s, { type: 'moveInfluence', playerId: s.activePlayerId!, from: 5, to: 6 });
    expect(chamberController(s.agora!, 5)).toBeNull();
    expect(s.subPhase).toBe('turn');
  });

  it('Espionage takes any boxed Progress token', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const box = s.progressBox.slice();
    s = trigger(s, 'espionage');
    expect(legalActions(s)).toHaveLength(box.length);
    s = act(s, { type: 'chooseProgressToken', playerId: s.activePlayerId!, tokenId: box[box.length - 1] });
    expect(s.players[seat].progressTokens).toEqual([box[box.length - 1]]);
    expect(s.progressBox).toHaveLength(box.length - 1);
  });

  it('Turn of Events discards one accessible card, maybe a second', () => {
    let s = agoraMatch();
    s = trigger(s, 'turnOfEvents');
    expect(s.subPhase).toBe('discardAvailable');
    expect(legalActions(s).some((a) => a.type === 'skip')).toBe(false);
    s = act(s, { type: 'discardStructureCard', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId });
    expect(legalActions(s).some((a) => a.type === 'skip')).toBe(true);
    s = act(s, { type: 'discardStructureCard', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId });
    expect(s.discard).toHaveLength(2);
    expect(s.subPhase).toBe('turn');
  });

  it('Embezzlement: coins per own cube in the Senate; the opponent loses a coin per theirs', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    control(s, 0, seat, 3);
    control(s, 1, opp, 2);
    const [mine, theirs] = [s.players[seat].coins, s.players[opp].coins];
    s = trigger(s, 'embezzlement');
    expect(s.players[seat].coins).toBe(mine + 3);
    expect(s.players[opp].coins).toBe(theirs - 2);
  });

  it('Foreclosure takes a brown or gray card', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    giveCard(s, (1 - seat) as 0 | 1, 'Press');
    s = trigger(s, 'foreclosure');
    s = applyAction(s, legalActions(s)[0]);
    expect(s.players[seat].tableau.map((c) => c.name)).toEqual(['Press']);
  });

  it('Coercion swaps a blue for a blue (or a green for a green); pairs take tokens on both sides', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    giveCard(s, opp, 'Workshop', 'Courthouse');
    giveCard(s, seat, 'Laboratory', 'Theater');
    s.players[seat].tableau.push(cardNamed('Apothecary'));
    s = trigger(s, 'coercion');
    expect(legalActions(s)).toHaveLength(1 + 2); // blue-blue, and Workshop for either green
    const workshop = s.players[opp].tableau.find((c) => c.name === 'Workshop')!;
    const apothecary = s.players[seat].tableau.find((c) => c.name === 'Apothecary')!;
    s = act(s, { type: 'swapCards', playerId: s.activePlayerId!, takeId: workshop.id, giveId: apothecary.id });
    // Workshop (plumb) joins my Laboratory (plumb): a pair → a token for me.
    expect(s.subPhase).toBe('progressPick');
    expect(s.activeSeatIdx).toBe(seat);
    expect(s.players[opp].tableau.map((c) => c.name)).toContain('Apothecary');
  });

  it('Insider Influence moves a Decree under another; control of it follows the Chamber', () => {
    let s = agoraMatch();
    const seat = s.activeSeatIdx;
    decreeIn(s, 0, 'militaryDecree');
    s.agora!.decrees[0][0].faceUp = false;
    control(s, 4, seat);
    s = trigger(s, 'insiderInfluence');
    expect(s.subPhase).toBe('moveDecree');
    s = act(s, { type: 'moveDecree', playerId: s.activePlayerId!, from: 1, to: 5 });
    expect(s.agora!.decrees[0]).toEqual([]);
    expect(s.agora!.decrees[4].map((d) => d.id)[1]).toBe('militaryDecree');
    expect(s.agora!.decrees[4][1].faceUp).toBe(true);
    expect(s.militaryPawn).toBe(seat === 0 ? 1 : -1);
  });

  it('Sabotage returns a built wonder to the box', () => {
    let s = agoraMatch();
    const opp = (1 - s.activeSeatIdx) as 0 | 1;
    s.players[opp].wonders[0] = { wonderId: 'colossus', built: true, buriedCardId: s.pyramid[0].cardId };
    s = trigger(s, 'sabotage');
    s = act(s, { type: 'chooseWonder', playerId: s.activePlayerId!, wonderId: 'colossus' });
    expect(s.players[opp].wonders.map((w) => w.wonderId)).not.toContain('colossus');
    expect(s.discard.map((c) => c.id)).toContain(s.pyramid[0].cardId);
  });
});
