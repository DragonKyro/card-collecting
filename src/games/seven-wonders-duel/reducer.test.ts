// 7 Wonders Duel — rules and match flow.

import { describe, it, expect } from 'vitest';
import { applyAction, legalActions } from './reducer';
import { availableSlots } from './pyramid';
import { act, emptyPyramidBut, giveCard, newMatch, stage, startedMatch } from './testSupport';
import type { DuelState } from './types';

const ids = (s: DuelState) => [s.players[0].id, s.players[1].id] as const;

describe('Duel setup and draft', () => {
  it('gives 7 coins, 5 tokens on the board and 5 in the box', () => {
    const s = newMatch(2);
    expect(s.players.map((p) => p.coins)).toEqual([7, 7]);
    expect(s.progressOffer).toHaveLength(5);
    expect(s.progressBox).toHaveLength(5);
    expect(new Set([...s.progressOffer, ...s.progressBox]).size).toBe(10);
  });

  it('draws the first player and drafts in two groups of four (1-2-1, then 1-2-1 the other way)', () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed < 30; seed++) firsts.add(newMatch(seed).firstSeatIdx);
    expect(firsts).toEqual(new Set([0, 1]));

    let s = newMatch(3);
    const f = s.firstSeatIdx;
    const o = 1 - f;
    expect(s.wonderDraft!.pool).toHaveLength(4);
    expect(s.wonderDraft!.next).toHaveLength(4);
    const pickers: number[] = [];
    while (s.subPhase === 'wonderDraft') {
      pickers.push(s.activeSeatIdx);
      if (pickers.length === 4) expect(s.wonderDraft!.pool).toHaveLength(1);
      s = act(s, { type: 'submitWonderDraft', playerId: s.activePlayerId!, wonderId: s.wonderDraft!.pool[0] });
      if (pickers.length === 4) expect(s.wonderDraft!.pool).toHaveLength(4);
    }
    expect(pickers).toEqual([f, o, o, f, o, f, f, o]);
    expect(s.players.map((p) => p.wonders.length)).toEqual([4, 4]);
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(f);
    expect(availableSlots(s.pyramid)).toHaveLength(6);
  });
});

describe('Duel turns', () => {
  it('builds a card, paying coins and trading at 2 + the opponent\'s production', () => {
    const s = startedMatch(4);
    const seat = s.activeSeatIdx;
    const p = s.players[seat].id;
    giveCard(s, (1 - seat) as 0 | 1, 'Quarry');
    const id = stage(s, 'Baths'); // 1 stone → 3 coins
    const next = act(s, { type: 'takeAndBuild', playerId: p, cardId: id });
    expect(next.players[seat].coins).toBe(7 - 3);
    expect(next.players[seat].tableau.map((c) => c.name)).toContain('Baths');
    expect(next.activeSeatIdx).toBe(1 - seat);
  });

  it('refuses covered cards and builds it cannot pay for', () => {
    const s = startedMatch(4);
    const p = s.activePlayerId!;
    const covered = s.pyramid.find((x) => x.row === 0)!;
    expect(() => act(s, { type: 'takeAndDiscard', playerId: p, cardId: covered.cardId })).toThrow();
    s.players[s.activeSeatIdx].coins = 2;
    const id = stage(s, 'Stone Reserve');
    expect(() => act(s, { type: 'takeAndBuild', playerId: p, cardId: id })).toThrow(/coins/);
  });

  it('discards for 2 coins + 1 per yellow card', () => {
    const s = startedMatch(4);
    const seat = s.activeSeatIdx;
    giveCard(s, seat, 'Tavern');
    const id = availableSlots(s.pyramid)[0].cardId;
    const next = act(s, { type: 'takeAndDiscard', playerId: s.activePlayerId!, cardId: id });
    expect(next.players[seat].coins).toBe(7 + 3);
    expect(next.discard.map((c) => c.id)).toEqual([id]);
  });

  it('builds through a chain for free, with 4 coins under Urbanism', () => {
    const s = startedMatch(4);
    const seat = s.activeSeatIdx;
    giveCard(s, seat, 'Theater');
    s.players[seat].progressTokens.push('urbanism');
    const id = stage(s, 'Statue');
    const next = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(next.players[seat].coins).toBe(7 + 4);
  });

  it('hands trading coins to an opponent with Economy', () => {
    const s = startedMatch(4);
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    s.players[opp].progressTokens.push('economy');
    const id = stage(s, 'Walls'); // 2 stone → 4 coins
    const next = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(next.players[seat].coins).toBe(3);
    expect(next.players[opp].coins).toBe(11);
  });

  it('counts the Lighthouse itself and pays guilds from the city with the most', () => {
    const s = startedMatch(4);
    const seat = s.activeSeatIdx;
    giveCard(s, seat, 'Tavern', 'Clay Pit', 'Clay Pool', 'Glassworks');
    const id = stage(s, 'Lighthouse');
    const next = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(next.players[seat].coins).toBe(7 + 2); // Tavern chain: free; 2 yellow cards

    const t = startedMatch(4);
    const me = t.activeSeatIdx;
    giveCard(t, me, 'Lumber Yard', 'Clay Pit', 'Quarry', 'Glassworks', 'Press');
    giveCard(t, (1 - me) as 0 | 1, 'Garrison', 'Stable', 'Palisade');
    const g = stage(t, 'Tacticians Guild'); // red: my 0, theirs 3
    t.players[me].coins = 20;
    const after = act(t, { type: 'takeAndBuild', playerId: t.activePlayerId!, cardId: g });
    expect(after.players[me].coins).toBe(20 - 2 + 3); // buys the second stone
  });

  it('gives Strategy\'s extra shield to red cards only', () => {
    const s = startedMatch(4);
    const seat = s.activeSeatIdx;
    const dir = seat === 0 ? 1 : -1;
    s.players[seat].progressTokens.push('strategy');
    s.players[seat].coins = 30;
    const id = stage(s, 'Guard Tower');
    let next = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(next.militaryPawn).toBe(2 * dir);
    // A wonder's shields get no bonus.
    next.activeSeatIdx = seat;
    next.activePlayerId = s.activePlayerId;
    next.players[seat].wonders = [{ wonderId: 'colossus', built: false, buriedCardId: null }];
    const card = availableSlots(next.pyramid)[0].cardId;
    next = act(next, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: card, wonderId: 'colossus' });
    expect(next.militaryPawn).toBe(4 * dir);
  });
});

describe('Duel military', () => {
  it('takes the looting tokens once and wins at the capital', () => {
    let s = startedMatch(6);
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    s.players[seat].coins = 30;
    s.militaryPawn = seat === 0 ? 2 : -2;
    const id = stage(s, 'Walls');
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(s.players[opp].coins).toBe(5);
    expect(seat === 0 ? s.militaryAwards.p1At3 : s.militaryAwards.p2At3).toBe(true);

    s.activeSeatIdx = seat;
    s.activePlayerId = s.players[seat].id;
    s.militaryPawn = seat === 0 ? 7 : -7;
    const w = stage(s, 'Archery Range');
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: w });
    expect(s.phase).toBe('gameOver');
    expect(s.endReason).toBe('military');
    expect(s.winnerSeatIdx).toBe(seat);
    expect(s.players[opp].coins).toBe(0); // the 5-coin token took what was left
  });
});

describe('Duel science', () => {
  it('takes a Progress token for a pair and Agriculture pays 6 coins', () => {
    let s = startedMatch(8);
    const seat = s.activeSeatIdx;
    giveCard(s, seat, 'Workshop');
    s.progressOffer = ['agriculture', 'philosophy'];
    s.players[seat].coins = 20;
    const id = stage(s, 'Laboratory');
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(s.subPhase).toBe('progressPick');
    expect(s.activeSeatIdx).toBe(seat);
    const coins = s.players[seat].coins;
    s = act(s, { type: 'chooseProgressToken', playerId: s.activePlayerId!, tokenId: 'agriculture' });
    expect(s.players[seat].coins).toBe(coins + 6);
    expect(s.progressOffer).toEqual(['philosophy']);
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(1 - seat);
  });

  it('wins with six different symbols, Law counting as one', () => {
    let s = startedMatch(8);
    const seat = s.activeSeatIdx;
    giveCard(s, seat, 'Workshop', 'Apothecary', 'Scriptorium', 'Pharmacist');
    s.players[seat].coins = 30;
    s.progressOffer = ['law'];
    giveCard(s, seat, 'Study'); // 5 different
    const id = stage(s, 'Academy'); // sundial pair → token
    s = act(s, { type: 'takeAndBuild', playerId: s.activePlayerId!, cardId: id });
    expect(s.subPhase).toBe('progressPick');
    s = act(s, { type: 'chooseProgressToken', playerId: s.activePlayerId!, tokenId: 'law' });
    expect(s.phase).toBe('gameOver');
    expect(s.endReason).toBe('science');
    expect(s.winnerSeatIdx).toBe(seat);
  });
});

describe('Duel wonders', () => {
  it('builds a wonder with a pyramid card, which is tucked under it', () => {
    let s = startedMatch(10, [['pyramids', 'colossus', 'sphinx', 'mausoleum'], ['appian-way', 'piraeus', 'statue-of-zeus', 'great-library']]);
    const seat = s.activeSeatIdx;
    s.players[seat].wonders = [{ wonderId: 'pyramids', built: false, buriedCardId: null }];
    s.players[seat].coins = 20;
    const card = availableSlots(s.pyramid)[0].cardId;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: card, wonderId: 'pyramids' });
    expect(s.players[seat].wonders[0]).toEqual({ wonderId: 'pyramids', built: true, buriedCardId: card });
    expect(s.players[seat].coins).toBe(20 - 8);
  });

  it('plays again after a play-again wonder or under Theology', () => {
    let s = startedMatch(10);
    const seat = s.activeSeatIdx;
    s.players[seat].wonders = [
      { wonderId: 'sphinx', built: false, buriedCardId: null },
      { wonderId: 'pyramids', built: false, buriedCardId: null },
    ];
    s.players[seat].coins = 40;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'sphinx' });
    expect(s.activeSeatIdx).toBe(seat);
    expect(s.log.some((e) => e.kind === 'playAgain')).toBe(true);
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'pyramids' });
    expect(s.activeSeatIdx).toBe(1 - seat);
    const t = startedMatch(10);
    const ts = t.activeSeatIdx;
    t.players[ts].progressTokens.push('theology');
    t.players[ts].wonders = [{ wonderId: 'pyramids', built: false, buriedCardId: null }];
    t.players[ts].coins = 20;
    const u = act(t, { type: 'takeAndWonder', playerId: t.activePlayerId!, cardId: availableSlots(t.pyramid)[0].cardId, wonderId: 'pyramids' });
    expect(u.activeSeatIdx).toBe(ts);
  });

  it('loses a play-again earned with the last card of an age', () => {
    let s = startedMatch(10);
    const seat = s.activeSeatIdx;
    s.players[seat].wonders = [{ wonderId: 'sphinx', built: false, buriedCardId: null }];
    s.players[seat].coins = 20;
    const last = availableSlots(s.pyramid)[0].cardId;
    emptyPyramidBut(s, last);
    s.militaryPawn = seat === 0 ? 2 : -2; // the opponent is weaker → chooses
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: last, wonderId: 'sphinx' });
    expect(s.age).toBe(2);
    expect(s.subPhase).toBe('chooseStarter');
    expect(s.activeSeatIdx).toBe(1 - seat);
    s = act(s, { type: 'chooseStarter', playerId: s.activePlayerId!, starterId: s.players[seat].id });
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(seat);
    expect(availableSlots(s.pyramid)).toHaveLength(2);
  });

  it('lets whoever took the last card choose the starter when the pawn is centred', () => {
    let s = startedMatch(10);
    const seat = s.activeSeatIdx;
    const last = availableSlots(s.pyramid)[0].cardId;
    emptyPyramidBut(s, last);
    s = act(s, { type: 'takeAndDiscard', playerId: s.activePlayerId!, cardId: last });
    expect(s.subPhase).toBe('chooseStarter');
    expect(s.activeSeatIdx).toBe(seat);
  });

  it('destroys an opponent\'s card of the colour, or skips when there is none', () => {
    let s = startedMatch(12);
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    s.players[seat].wonders = [
      { wonderId: 'statue-of-zeus', built: false, buriedCardId: null },
      { wonderId: 'circus-maximus', built: false, buriedCardId: null },
    ];
    s.players[seat].coins = 40;
    giveCard(s, opp, 'Sawmill', 'Glass-Blower');
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'statue-of-zeus' });
    expect(s.subPhase).toBe('destroyCard');
    const legal = legalActions(s);
    expect(legal).toHaveLength(1);
    s = applyAction(s, legal[0]);
    expect(s.players[opp].tableau.map((c) => c.name)).toEqual(['Glass-Blower']);
    expect(s.discard.map((c) => c.name)).toEqual(['Sawmill']);
    expect(s.subPhase).toBe('turn');
    // No gray card left? The opponent's gray is still there; take it away and build Circus Maximus.
    s.players[opp].tableau = [];
    s.activeSeatIdx = seat;
    s.activePlayerId = s.players[seat].id;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'circus-maximus' });
    expect(s.subPhase).toBe('turn');
    expect(s.activeSeatIdx).toBe(opp);
  });

  it('builds a discarded card for free with the Mausoleum', () => {
    let s = startedMatch(12);
    const seat = s.activeSeatIdx;
    s.players[seat].wonders = [{ wonderId: 'mausoleum', built: false, buriedCardId: null }];
    s.players[seat].coins = 30;
    giveCard(s, (1 - seat) as 0 | 1, 'Temple');
    const temple = s.players[1 - seat].tableau.pop()!;
    s.discard.push(temple);
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'mausoleum' });
    expect(s.subPhase).toBe('discardBuild');
    const coins = s.players[seat].coins;
    s = act(s, { type: 'buildFromDiscard', playerId: s.activePlayerId!, cardId: temple.id });
    expect(s.players[seat].tableau.map((c) => c.name)).toContain('Temple');
    expect(s.players[seat].coins).toBe(coins);
    expect(s.discard).toHaveLength(0);
  });

  it('draws 3 boxed tokens for the Great Library', () => {
    let s = startedMatch(12);
    const seat = s.activeSeatIdx;
    s.players[seat].wonders = [{ wonderId: 'great-library', built: false, buriedCardId: null }];
    s.players[seat].coins = 30;
    const box = s.progressBox.slice();
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: 'great-library' });
    expect(s.subPhase).toBe('libraryPick');
    const p = s.pending[0];
    expect(p.kind === 'library' && p.options.length).toBe(3);
    if (p.kind !== 'library') return;
    for (const t of p.options) expect(box).toContain(t);
    s = act(s, { type: 'chooseProgressToken', playerId: s.activePlayerId!, tokenId: p.options[1] });
    expect(s.players[seat].progressTokens).toEqual([p.options[1]]);
    expect(s.progressOffer).toHaveLength(5);
  });

  it('returns the eighth wonder to the box once seven are built', () => {
    let s = startedMatch(12);
    const seat = s.activeSeatIdx;
    for (const p of s.players) for (const w of p.wonders) w.built = true;
    s.players[seat].wonders[3].built = false;
    s.players[1 - seat].wonders[3].built = false;
    s.players[seat].coins = 40;
    const target = s.players[seat].wonders[3].wonderId;
    s = act(s, { type: 'takeAndWonder', playerId: s.activePlayerId!, cardId: availableSlots(s.pyramid)[0].cardId, wonderId: target });
    expect(s.players[1 - seat].wonders).toHaveLength(3);
    expect(s.log.some((e) => e.kind === 'wonderRemoved')).toBe(true);
  });
});

describe('Duel match end', () => {
  it('scores a civilian victory after Age III', () => {
    let s = startedMatch(14);
    s.age = 3;
    const last = availableSlots(s.pyramid)[0].cardId;
    emptyPyramidBut(s, last);
    s = act(s, { type: 'takeAndDiscard', playerId: s.activePlayerId!, cardId: last });
    expect(s.phase).toBe('gameOver');
    expect(s.endReason).toBe('civilian');
    expect(s.finalScoringBreakdown).toHaveLength(2);
    expect(Object.keys(s.finalScores!)).toEqual([...ids(s)]);
  });

  it('offers only legal actions, and each one applies', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let s = newMatch(seed);
      for (let i = 0; i < 300 && s.phase === 'playing'; i++) {
        const legal = legalActions(s);
        expect(legal.length).toBeGreaterThan(0);
        // A different legal action each step exercises every branch.
        s = applyAction(s, legal[(i * 7 + seed) % legal.length]);
      }
      expect(s.phase).toBe('gameOver');
    }
  });
});
