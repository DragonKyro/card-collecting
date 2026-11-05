// 7 Wonders Duel — the Pantheon expansion: setup, Mythology / Offering
// tokens, placing and invoking Divinities, every Divinity's power, the Gate,
// the two wonders, Grand Temples and the new Progress tokens.

import { describe, it, expect } from 'vitest';
import type { DuelDivinityId, DuelState } from './types';
import { applyAction, legalActions, _internals } from './reducer';
import { availableSlots, isSlotAvailable } from './pyramid';
import { divinityCost, STRUCTURE_TOKEN_SLOTS } from './pantheon';
import { cardPayment } from './resources';
import { scoreMatch } from './scoring';
import { act, cardNamed, emptyPyramidBut, giveCard, newMatch, SEATS, stage, startedMatch, turnOf } from './testSupport';

const PANTHEON = { pantheon: true } as const;
const W: [string[], string[]] = [['pyramids', 'sphinx', 'divine-theater', 'sanctuary'], ['colossus', 'piraeus', 'mausoleum', 'great-library']];

/** Age I, the first player's turn, Pantheon on; the player to move holds W[0]. */
function pantheonMatch(seed = 3): DuelState {
  const s = startedMatch(seed, W, PANTHEON);
  const seat = s.activeSeatIdx;
  s.players[seat].wonders = W[0].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  s.players[1 - seat].wonders = W[1].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  return s;
}

/** Put a Divinity on a space and open the Pantheon (as in Age II). */
function onSpace(s: DuelState, divinity: DuelDivinityId, space = 0): void {
  s.pantheon!.spaces[space] = { divinity, placedBy: 0 };
  s.pantheon!.revealed = true;
}

/** Invoke the Divinity on `space` for the active seat, with plenty of coins. */
function invoke(s: DuelState, space = 0, offerings?: number[]): DuelState {
  s.players[s.activeSeatIdx].coins = Math.max(s.players[s.activeSeatIdx].coins, 30);
  return act(s, { type: 'invokeDivinity', playerId: s.activePlayerId!, space, ...(offerings ? { offerings } : {}) });
}

describe('Pantheon setup', () => {
  it('shuffles three Divinities into each Mythology deck, 13 Progress tokens and the Pantheon wonders into the draft', () => {
    const s = newMatch(5, SEATS, PANTHEON);
    for (const deck of Object.values(s.pantheon!.decks)) expect(deck).toHaveLength(3);
    expect(s.pantheon!.spaces).toEqual([null, null, null, null, null, null]);
    expect(s.progressOffer).toHaveLength(5);
    expect(s.progressBox).toHaveLength(8);
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const t = newMatch(seed, SEATS, PANTHEON);
      for (const w of [...t.wonderDraft!.pool, ...t.wonderDraft!.next]) seen.add(w);
      for (const tok of [...t.progressOffer, ...t.progressBox]) seen.add(tok);
    }
    for (const id of ['sanctuary', 'divine-theater', 'mysticism', 'poliorcetics', 'engineering']) expect(seen).toContain(id);
    for (const id of ['curia-julia', 'knossos', 'corruption']) expect(seen).not.toContain(id);
  });

  it('lays 5 Mythology tokens on face-down Age I cards and 3 Offering tokens on Age II', () => {
    const s = pantheonMatch();
    const tokens = s.pyramid.filter((x) => x.token);
    expect(tokens.map((x) => x.index)).toEqual(STRUCTURE_TOKEN_SLOTS.base[1]);
    for (const slot of tokens) {
      expect(slot.faceUp).toBe(false);
      expect(slot.token!.kind).toBe('mythology');
    }
    _internals.startAge(s, 2);
    const offerings = s.pyramid.filter((x) => x.token);
    expect(offerings.map((x) => x.token?.kind === 'offering' ? x.token.value : 0).sort()).toEqual([2, 3, 4]);
    for (const slot of offerings) expect(slot.faceUp).toBe(false);
  });

  it('puts Grand Temples, not Guilds, in Age III', () => {
    const s = pantheonMatch();
    _internals.startAge(s, 3);
    const purple = s.pyramid.map((x) => s.cardsById[x.cardId]).filter((c) => c.color === 'purple');
    expect(purple).toHaveLength(3);
    for (const c of purple) expect(c.name).toMatch(/Grand Temple/);
  });
});

describe('Pantheon: Mythology tokens and placing Divinities', () => {
  it('turning up a token card takes the token and places 1 of the 2 top Divinities face down', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    // Clear the row in front of a token card so the next take turns it up.
    const tokenSlot = s.pyramid.find((x) => x.token && x.row === 3)!;
    for (const c of tokenSlot.coveredBy.slice(1)) s.pyramid[c].taken = true;
    const last = tokenSlot.coveredBy[0];
    const m = tokenSlot.token?.kind === 'mythology' ? tokenSlot.token.mythology : null;
    const top2 = s.pantheon!.decks[m!].slice(-2);
    s = act(s, { type: 'takeAndDiscard', playerId: s.activePlayerId!, cardId: s.pyramid[last].cardId });
    expect(s.players[seat].pantheon!.mythologyTokens).toEqual([m]);
    expect(s.subPhase).toBe('placeDivinity');
    expect(s.activeSeatIdx).toBe(seat);
    const p = s.pending[0];
    expect(p.kind === 'placeDivinity' && p.options!.slice().sort()).toEqual(top2.slice().sort());
    expect(s.pantheon!.decks[m!]).toHaveLength(1);
    const keep = p.kind === 'placeDivinity' ? p.options![0] : 'enki';
    s = act(s, { type: 'placeDivinity', playerId: s.activePlayerId!, divinity: keep, space: 4 });
    expect(s.pantheon!.spaces[4]).toEqual({ divinity: keep, placedBy: seat });
    // The other goes back on top.
    expect(s.pantheon!.decks[m!]).toHaveLength(2);
    expect(s.pantheon!.decks[m!][1]).not.toBe(keep);
    // The log names the Mythology only.
    const entry = s.log.find((e) => e.kind === 'divinityPlaced')!;
    expect(JSON.stringify(entry)).not.toContain(keep);
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(1 - seat);
  });

  it('refuses a taken space or a Divinity that was not drawn', () => {
    let s = pantheonMatch();
    const tokenSlot = s.pyramid.find((x) => x.token && x.row === 3)!;
    for (const c of tokenSlot.coveredBy.slice(1)) s.pyramid[c].taken = true;
    s.pantheon!.spaces[0] = { divinity: 'mars', placedBy: 1 };
    s = act(s, { type: 'takeAndDiscard', playerId: s.activePlayerId!, cardId: s.pyramid[tokenSlot.coveredBy[0]].cardId });
    const p = s.pending[0];
    const d = p.kind === 'placeDivinity' ? p.options![0] : 'enki';
    expect(() => act(s, { type: 'placeDivinity', playerId: s.activePlayerId!, divinity: d, space: 0 })).toThrow(/empty space/);
    expect(() => act(s, { type: 'placeDivinity', playerId: s.activePlayerId!, divinity: 'gate', space: 1 })).toThrow(/drawn/);
    expect(legalActions(s).every((a) => a.type === 'placeDivinity' && a.space !== 0)).toBe(true);
  });

  it('opens the Pantheon in Age II: the Gate on the empty space, every Divinity face up', () => {
    let s = pantheonMatch();
    s.pantheon!.spaces = [
      { divinity: 'mars', placedBy: 0 }, { divinity: 'tanit', placedBy: 1 }, null,
      { divinity: 'enki', placedBy: 0 }, { divinity: 'ra', placedBy: 1 }, { divinity: 'zeus', placedBy: 0 },
    ];
    for (const slot of s.pyramid) slot.token = undefined;
    const last = availableSlots(s.pyramid)[0].cardId;
    emptyPyramidBut(s, last);
    s = act(s, { type: 'takeAndDiscard', playerId: s.activePlayerId!, cardId: last });
    expect(s.age).toBe(2);
    expect(s.pantheon!.revealed).toBe(true);
    expect(s.pantheon!.spaces[2]).toEqual({ divinity: 'gate', placedBy: null });
    // Enki is face up: 2 boxed tokens lie on it.
    expect(s.pantheon!.enkiTokens).toHaveLength(2);
    expect(s.progressBox).toHaveLength(6);
  });
});

describe('Pantheon: invoking', () => {
  it('costs 8…3 coins from space 1 to 6 for the first player and 3…8 for the other; the Gate doubles', () => {
    const s = pantheonMatch();
    const first = s.firstSeatIdx;
    const second = (1 - first) as 0 | 1;
    for (let space = 0; space < 6; space++) s.pantheon!.spaces[space] = { divinity: space === 5 ? 'gate' : 'mars', placedBy: 0 };
    expect([0, 1, 2, 3, 4].map((sp) => divinityCost(s, first, sp))).toEqual([8, 7, 6, 5, 4]);
    expect([0, 1, 2, 3, 4].map((sp) => divinityCost(s, second, sp))).toEqual([3, 4, 5, 6, 7]);
    expect(divinityCost(s, first, 5)).toBe(6);
    expect(divinityCost(s, second, 5)).toBe(16);
    // Offering tokens and the Sanctuary come off, never below zero.
    expect(divinityCost(s, first, 0, [3])).toBe(5);
    s.players[first].wonders = [{ wonderId: 'sanctuary', built: true, buriedCardId: 100 }];
    expect(divinityCost(s, first, 0, [4, 3])).toBe(0);
  });

  it('is a turn: pays, takes the Divinity off its space and passes the turn', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    onSpace(s, 'tanit', 0);
    s.players[seat].coins = 9;
    const cost = divinityCost(s, seat, 0);
    s = act(s, { type: 'invokeDivinity', playerId: s.activePlayerId!, space: 0 });
    expect(s.players[seat].coins).toBe(9 - cost + 12);
    expect(s.players[seat].pantheon!.divinities).toEqual(['tanit']);
    expect(s.pantheon!.spaces[0]).toBeNull();
    expect(s.activeSeatIdx).toBe(1 - seat);
  });

  it('uses Offering tokens, which are spent', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    onSpace(s, 'aphrodite', 0);
    s.players[seat].pantheon!.offeringTokens = [2, 4];
    s.players[seat].coins = 10;
    const cost = divinityCost(s, seat, 0, [4]);
    s = act(s, { type: 'invokeDivinity', playerId: s.activePlayerId!, space: 0, offerings: [4] });
    expect(s.players[seat].coins).toBe(10 - cost);
    expect(s.players[seat].pantheon!.offeringTokens).toEqual([2]);
    expect(() => act(turnOf(s, seat), { type: 'invokeDivinity', playerId: s.players[seat].id, space: 0, offerings: [3] })).toThrow();
  });

  it('is not possible in Age I, nor without the coins', () => {
    const s = pantheonMatch();
    s.pantheon!.spaces[0] = { divinity: 'mars', placedBy: 0 };
    expect(() => act(s, { type: 'invokeDivinity', playerId: s.activePlayerId!, space: 0 })).toThrow(/Age II/);
    s.pantheon!.revealed = true;
    s.players[s.activeSeatIdx].coins = 0;
    expect(() => act(s, { type: 'invokeDivinity', playerId: s.activePlayerId!, space: 0 })).toThrow(/coins/);
    expect(legalActions(s).some((a) => a.type === 'invokeDivinity')).toBe(false);
  });
});

describe('Pantheon: the Divinities', () => {
  it('Enki: keep 1 of its 2 tokens; the other goes back to the box', () => {
    let s = pantheonMatch();
    onSpace(s, 'enki');
    s.pantheon!.enkiTokens = [s.progressBox[0], s.progressBox[1]];
    const [a, b] = s.pantheon!.enkiTokens;
    s.progressBox = s.progressBox.slice(2);
    const seat = s.activeSeatIdx;
    s = invoke(s);
    expect(s.subPhase).toBe('enki');
    s = act(s, { type: 'chooseProgressToken', playerId: s.activePlayerId!, tokenId: b });
    expect(s.players[seat].progressTokens).toContain(b);
    expect(s.progressBox).toContain(a);
    expect(s.pantheon!.enkiTokens).toEqual([]);
  });

  it('Ishtar: the scales symbol — a pair with Law takes a Progress token', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    s.players[seat].progressTokens = ['law'];
    onSpace(s, 'ishtar');
    s = invoke(s);
    expect(s.subPhase).toBe('progressPick');
    expect(s.activeSeatIdx).toBe(seat);
  });

  it('Nisaba: the Snake lends the symbol of an opponent\'s green card (and a pair takes a token)', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    giveCard(s, opp, 'Workshop'); // plumb
    giveCard(s, seat, 'Laboratory'); // plumb
    onSpace(s, 'nisaba');
    s = invoke(s);
    expect(s.subPhase).toBe('snake');
    const workshop = s.players[opp].tableau.find((c) => c.name === 'Workshop')!;
    s = act(s, { type: 'placeSnake', playerId: s.activePlayerId!, cardId: workshop.id });
    expect(s.players[seat].pantheon!.snake).toEqual({ cardId: workshop.id, symbol: 'plumb' });
    expect(s.subPhase).toBe('progressPick');
  });

  it('Astarte: 7 coins on the card — spendable, safe from coin losses, 1 VP each', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    onSpace(s, 'astarte');
    s = invoke(s);
    const me = s.players[seat];
    expect(me.pantheon!.astarteCoins).toBe(7);
    // The Appian Way only reaches the treasury.
    me.coins = 1;
    s = turnOf(s, (1 - seat) as 0 | 1);
    s.players[1 - seat].wonders = [{ wonderId: 'appian-way', built: false, buriedCardId: null }];
    s.players[1 - seat].coins = 30;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'appian-way' });
    expect(s.players[seat].coins).toBe(0);
    expect(s.players[seat].pantheon!.astarteCoins).toBe(7);
    // Spending dips into Astarte once the treasury is empty.
    s = turnOf(s, seat);
    const id = stage(s, 'Stone Reserve'); // 3 coins
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(s.players[seat].pantheon!.astarteCoins).toBe(4);
    expect(scoreMatch(s)[seat].divinities).toBe(4);
  });

  it('Baal: takes a brown or gray card from the opponent', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    giveCard(s, opp, 'Sawmill', 'Theater');
    onSpace(s, 'baal');
    s = invoke(s);
    expect(legalActions(s)).toHaveLength(1);
    s = applyAction(s, legalActions(s)[0]);
    expect(s.players[seat].tableau.map((c) => c.name)).toContain('Sawmill');
    expect(s.players[opp].tableau.map((c) => c.name)).toEqual(['Theater']);
  });

  it('Tanit 12 coins, Aphrodite 9 VP, Mars 2 shields', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const dir = seat === 0 ? 1 : -1;
    onSpace(s, 'mars', 0);
    s = invoke(s);
    expect(s.militaryPawn).toBe(2 * dir);
    s = turnOf(s, seat);
    onSpace(s, 'aphrodite', 1);
    s = invoke(s, 1);
    expect(scoreMatch(s)[seat].divinities).toBe(9);
  });

  it('Hades builds a discarded card for free', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    s.discard.push(cardNamed('Palace'));
    onSpace(s, 'hades');
    s = invoke(s);
    expect(s.subPhase).toBe('discardBuild');
    const coins = s.players[seat].coins;
    s = act(s, { type: 'buildFromDiscard', playerId: s.activePlayerId!, cardId: s.discard[0].id });
    expect(s.players[seat].tableau.map((c) => c.name)).toContain('Palace');
    expect(s.players[seat].coins).toBe(coins);
  });

  it('Zeus discards any structure card, face down too, and its token goes to the invoker', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    onSpace(s, 'zeus');
    s = invoke(s);
    expect(s.subPhase).toBe('zeus');
    const hidden = s.pyramid.find((x) => !x.faceUp && x.token)!;
    expect(isSlotAvailable(hidden, s.pyramid)).toBe(false);
    const m = hidden.token?.kind === 'mythology' ? hidden.token.mythology : null;
    s = act(s, { type: 'discardStructureCard', playerId: s.activePlayerId!, cardId: hidden.cardId });
    expect(s.pyramid[hidden.index].taken).toBe(true);
    expect(s.discard.map((c) => c.id)).toContain(hidden.cardId);
    expect(s.players[seat].pantheon!.mythologyTokens).toEqual([m]);
    expect(s.subPhase).toBe('placeDivinity');
  });

  it('Anubis un-builds a wonder (its card to the discard pile); it can be built again', () => {
    let s = pantheonMatch();
    const opp = (1 - s.activeSeatIdx) as 0 | 1;
    s.players[opp].wonders[0] = { wonderId: 'colossus', built: true, buriedCardId: s.pyramid[0].cardId };
    onSpace(s, 'anubis');
    s = invoke(s);
    s = act(s, { type: 'chooseWonder', playerId: s.activePlayerId!, wonderId: 'colossus' });
    expect(s.players[opp].wonders[0]).toEqual({ wonderId: 'colossus', built: false, buriedCardId: null });
    expect(s.discard.map((c) => c.id)).toContain(s.pyramid[0].cardId);
  });

  it('Isis builds one of your wonders with a discarded card, for free and with its effects', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const card = cardNamed('Theater');
    s.discard.push(card);
    onSpace(s, 'isis');
    s = invoke(s);
    const coins = s.players[seat].coins;
    s = act(s, { type: 'wonderFromDiscard', playerId: s.activePlayerId!, cardId: card.id, wonderId: 'sphinx' });
    const ws = s.players[seat].wonders.find((w) => w.wonderId === 'sphinx')!;
    expect(ws).toEqual({ wonderId: 'sphinx', built: true, buriedCardId: card.id });
    expect(s.players[seat].coins).toBe(coins);
    expect(s.activeSeatIdx).toBe(seat); // the Sphinx plays again
  });

  it('Ra takes one of the opponent\'s unbuilt wonders', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    onSpace(s, 'ra');
    s = invoke(s);
    expect(legalActions(s)).toHaveLength(4);
    s = act(s, { type: 'chooseWonder', playerId: s.activePlayerId!, wonderId: 'piraeus' });
    expect(s.players[seat].wonders.map((w) => w.wonderId)).toContain('piraeus');
    expect(s.players[1 - seat].wonders.map((w) => w.wonderId)).not.toContain('piraeus');
  });

  it('Minerva stops the conflict pawn in front of her and leaves the game', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    const towardMe = seat === 0 ? -1 : 1;
    onSpace(s, 'minerva');
    s = invoke(s);
    expect(() => act(s, { type: 'placeMinerva', playerId: s.activePlayerId!, position: 0 })).toThrow();
    s = act(s, { type: 'placeMinerva', playerId: s.activePlayerId!, position: 2 * towardMe });
    expect(s.pantheon!.minerva).toBe(2 * towardMe);
    s = turnOf(s, opp);
    s.players[opp].coins = 30;
    const walls = stage(s, 'Walls'); // 2 shields, stopped after 1
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: walls });
    expect(s.militaryPawn).toBe(towardMe);
    expect(s.pantheon!.minerva).toBeNull();
  });

  it('Neptune discards a military token without effect, then applies another', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    s.players[opp].coins = 9;
    onSpace(s, 'neptune');
    s = invoke(s);
    expect(s.subPhase).toBe('neptuneDiscard');
    const mine = seat === 0 ? 'p2At6' : 'p1At6';
    const theirs = seat === 0 ? 'p1At6' : 'p2At6';
    s = act(s, { type: 'chooseMilitaryToken', playerId: s.activePlayerId!, token: mine });
    expect(s.subPhase).toBe('neptuneApply');
    expect(legalActions(s)).toHaveLength(3);
    s = act(s, { type: 'chooseMilitaryToken', playerId: s.activePlayerId!, token: theirs });
    expect(s.players[opp].coins).toBe(4);
    expect(s.militaryAwards[mine]).toBe(true);
    expect(s.militaryAwards[theirs]).toBe(true);
  });

  it('the Gate (twice the cost) invokes one of the decks\' top cards for free; the others stay on top', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    onSpace(s, 'gate', 2);
    s.pantheon!.decks.roman = ['minerva', 'neptune', 'mars'];
    s.players[seat].coins = 40;
    const cost = divinityCost(s, seat, 2);
    s = act(s, { type: 'invokeDivinity', playerId: s.activePlayerId!, space: 2 });
    expect(s.players[seat].coins).toBe(40 - cost);
    expect(s.subPhase).toBe('gate');
    expect(legalActions(s)).toHaveLength(5);
    const tops = Object.values(s.pantheon!.decks).map((d) => d[d.length - 1]);
    s = act(s, { type: 'chooseDivinity', playerId: s.activePlayerId!, divinity: 'mars' });
    expect(s.militaryPawn).toBe(seat === 0 ? 2 : -2);
    expect(s.pantheon!.decks.roman).toEqual(['minerva', 'neptune']);
    for (const d of tops) if (d !== 'mars') expect(Object.values(s.pantheon!.decks).some((deck) => deck[deck.length - 1] === d)).toBe(true);
  });
});

describe('Pantheon wonders, temples and tokens', () => {
  it('the Divine Theater looks through a deck and invokes one for free, the rest in the chosen order', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    s.players[seat].coins = 40;
    s.pantheon!.decks.phoenician = ['astarte', 'baal', 'tanit'];
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'divine-theater' });
    expect(s.subPhase).toBe('theaterDeck');
    s = act(s, { type: 'chooseMythology', playerId: s.activePlayerId!, mythology: 'phoenician' });
    expect(s.subPhase).toBe('theater');
    expect(legalActions(s)).toHaveLength(6); // 3 choices × which of the other two goes on top
    const coins = s.players[seat].coins;
    s = act(s, { type: 'chooseDivinity', playerId: s.activePlayerId!, divinity: 'tanit', top: 'astarte' });
    expect(s.players[seat].coins).toBe(coins + 12);
    expect(s.pantheon!.decks.phoenician).toEqual(['baal', 'astarte']);
  });

  it('the Sanctuary takes 2 coins off every invocation and plays again', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    s.players[seat].coins = 40;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'sanctuary' });
    expect(s.activeSeatIdx).toBe(seat);
    onSpace(s, 'mars', 0);
    const plain = divinityCost({ ...s, players: [{ ...s.players[0], wonders: [] }, { ...s.players[1], wonders: [] }] } as DuelState, seat, 0);
    expect(divinityCost(s, seat, 0)).toBe(plain - 2);
  });

  it('Grand Temples: free with a Mythology token of their type; 5 / 12 / 21 VP', () => {
    const s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const temple = cardNamed('Roman Grand Temple');
    expect(cardPayment(s, seat, temple).chained).toBe(false);
    s.players[seat].pantheon!.mythologyTokens = ['roman'];
    expect(cardPayment(s, seat, temple)).toMatchObject({ chained: true, coins: 0 });
    giveCard(s, seat, 'Roman Grand Temple');
    expect(scoreMatch(s)[seat].guild).toBe(5);
    giveCard(s, seat, 'Greek Grand Temple');
    expect(scoreMatch(s)[seat].guild).toBe(12);
    giveCard(s, seat, 'Egyptian Grand Temple');
    expect(scoreMatch(s)[seat].guild).toBe(21);
  });

  it('Engineering builds chain cards (and temples) for 1 coin', () => {
    const s = pantheonMatch();
    const seat = s.activeSeatIdx;
    s.players[seat].progressTokens = ['engineering'];
    expect(cardPayment(s, seat, cardNamed('Aqueduct'))).toMatchObject({ coins: 1, engineering: true });
    expect(cardPayment(s, seat, cardNamed('Greek Grand Temple'))).toMatchObject({ coins: 1, engineering: true });
    // Cards without a chain symbol under the cost pay as usual.
    expect(cardPayment(s, seat, cardNamed('Palace')).coins).toBeGreaterThan(1);
  });

  it('Poliorcetics costs the opponent a coin per space; Mysticism scores 2 VP per token kept', () => {
    let s = pantheonMatch();
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    s.players[seat].progressTokens = ['poliorcetics', 'mysticism'];
    s.players[seat].pantheon!.mythologyTokens = ['greek', 'roman'];
    s.players[seat].pantheon!.offeringTokens = [3];
    s.players[seat].coins = 30;
    s.players[opp].coins = 7;
    const walls = stage(s, 'Walls');
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: walls });
    expect(s.players[opp].coins).toBe(5);
    expect(scoreMatch(s)[seat].progress).toBe(6);
  });
});
