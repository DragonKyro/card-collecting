import { describe, expect, it } from 'vitest';
import { applyAction, buildBlocker, priceOf } from './reducer';
import { EDITIONS, MARKET_ROW_SIZE } from './cards';
import type { MkState } from './types';
import { act, newMatch, player, rigDice, roll, setPlayer, startTurnFor, stock } from './testSupport';

const coins = (s: MkState) => s.players.map((p) => p.coins);

describe('MK2 setup', () => {
  it('starts everyone on 5 coins and no cards, with three full market rows', () => {
    const s = newMatch('mk2', 3, { keepSetup: true });
    expect(coins(s)).toEqual([5, 5, 5]);
    expect(s.players.every((p) => Object.keys(p.city).length === 0 && p.landmarks.length === 0)).toBe(true);
    for (const row of ['low', 'high', 'landmark'] as const) {
      const ids = s.market[row].slots.map((x) => x.cardId);
      expect(ids.length).toBe(MARKET_ROW_SIZE);
      expect(new Set(ids).size).toBe(MARKET_ROW_SIZE);
    }
    const inRows = (row: 'low' | 'high') =>
      s.market[row].deck.length + s.market[row].slots.reduce((a, x) => a + x.count, 0);
    expect(inRows('low') + inRows('high')).toBe(86);
    expect(s.market.landmark.deck.length + MARKET_ROW_SIZE).toBe(20);
    expect(s.subPhase).toBe('setupBuild');
  });

  it('adds the 3 promo landmarks when switched on', () => {
    const s = newMatch('mk2', 2, { promo: true, keepSetup: true });
    expect(s.market.landmark.deck.length + MARKET_ROW_SIZE).toBe(23);
  });

  it('plays three build-only opening rounds, establishments only, then rolls', () => {
    let s = newMatch('mk2', 2, { keepSetup: true, first: 1 });
    const lm = s.market.landmark.slots[0].cardId;
    expect(buildBlocker(s, player(s, 1), lm)).toMatch(/opening rounds/);
    expect(() => act(s, { type: 'roll', dice: 1 } as never)).toThrow();
    for (let k = 0; k < 6; k++) {
      expect(s.subPhase).toBe('setupBuild');
      s = act(s, { type: 'pass' });
    }
    expect(s.subPhase).toBe('roll');
    expect(s.round).toBe(1);
    expect(s.activePlayerId).toBe('p1');
    // Passing in the opening rounds never pays out (no Airport, no broke coin).
    expect(coins(s)).toEqual([5, 5]);
  });

  it('refills a sold-out stack in place, stacking drawn duplicates', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    s.subPhase = 'build';
    const row = s.market.low;
    row.slots = [
      { cardId: 'wheatField', count: 1 }, { cardId: 'bakery', count: 2 }, { cardId: 'cafe', count: 1 },
      { cardId: 'forest', count: 1 }, { cardId: 'vineyard', count: 1 },
    ];
    row.deck = ['bakery', 'cafe', 'sushiBar', 'mine'];
    setPlayer(s, 0, { coins: 10 });
    const next = act(s, { type: 'build', cardId: 'wheatField' });
    expect(next.market.low.slots).toEqual([
      { cardId: 'sushiBar', count: 1 }, { cardId: 'bakery', count: 3 }, { cardId: 'cafe', count: 2 },
      { cardId: 'forest', count: 1 }, { cardId: 'vineyard', count: 1 },
    ]);
    expect(next.market.low.deck).toEqual(['mine']);
    expect(next.players[0].city).toEqual({ wheatField: 1 });
    expect(next.players[0].coins).toBe(9);
  });
});

describe('roll resolution', () => {
  it('pays red cards counter-clockwise from the roller, short payments are lost, then green pays', () => {
    const s = newMatch('mk2', 3, { first: 0 });
    setPlayer(s, 0, { coins: 3, city: { bakery: 1 } });
    setPlayer(s, 1, { coins: 0, city: { cafe: 1 } });
    setPlayer(s, 2, { coins: 0, city: { cafe: 1 } });
    const next = roll(s, [3]);
    // p2 sits on p0's right, so is paid first in full; p1 gets the last coin.
    expect(coins(next)).toEqual([0 + 2, 1, 2]);
    const short = next.log.find((e) => e.kind === 'coins' && e.to === 'p1');
    expect(short).toMatchObject({ amount: 1, owed: 2 });
  });

  it('blue cards pay on anyone’s turn, green only on the owner’s', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 1, { coins: 0, city: { wheatField: 1, bakery: 2 } });
    const next = roll(s, [2]);
    expect(next.players[1].coins).toBe(1);
  });

  it('combo cards count the matching symbol but never themselves', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    // Rulebook example: Winery with 2 Vineyards + 1 Apple Orchard = 9.
    setPlayer(s, 0, { coins: 0, city: { winery: 1, vineyard: 2, appleOrchard: 1 } });
    expect(roll(s, [4, 5]).players[0].coins).toBe(9);
    const t = newMatch('mk2', 2, { first: 0 });
    setPlayer(t, 0, { coins: 0, city: { flowerShop: 2 } });
    expect(roll(t, [6]).players[0].coins).toBe(1); // nothing to count → broke coin only
  });

  it('every copy activates', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 0, { coins: 0, city: { convenienceStore: 3 } });
    expect(roll(s, [4]).players[0].coins).toBe(9);
  });

  it('Stadium takes from each opponent; Shopping District halves only those above 10', () => {
    const s = newMatch('mk2', 3, { first: 0 });
    setPlayer(s, 0, { coins: 0, city: { stadium: 1 } });
    setPlayer(s, 1, { coins: 2 });
    setPlayer(s, 2, { coins: 7 });
    expect(coins(roll(s, [3, 4]))).toEqual([5, 0, 4]);

    const t = newMatch('mk2', 3, { first: 0 });
    setPlayer(t, 0, { coins: 0, city: { shoppingDistrict: 1 } });
    setPlayer(t, 1, { coins: 10 });
    setPlayer(t, 2, { coins: 15 });
    expect(coins(roll(t, [4, 4]))).toEqual([7, 10, 8]);
  });

  it('gives a broke player 1 coin at the build step in MK2, not in MK1', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 0, { coins: 0 });
    const next = roll(s, [1]);
    expect(next.subPhase).toBe('build');
    expect(next.players[0].coins).toBe(1);
    const m = newMatch('mk1', 2, { first: 0 });
    setPlayer(m, 0, { coins: 0, city: {} });
    expect(roll(m, [4]).players[0].coins).toBe(0);
  });
});

describe('MK2 landmarks', () => {
  it('prices landmarks by how many you own; Loan Office and Observatory discount', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    const me = player(s, 0);
    expect(priceOf(s, me, 'museum')).toBe(12);
    me.landmarks = ['forge'];
    expect(priceOf(s, me, 'museum')).toBe(16);
    expect(priceOf(s, me, 'launchPad')).toBe(38);
    me.landmarks = ['forge', 'loanOffice'];
    expect(priceOf(s, me, 'museum')).toBe(20);
    expect(priceOf(s, me, 'launchPad')).toBe(23);
    player(s, 1).landmarks = ['observatory'];
    expect(priceOf(s, me, 'launchPad')).toBe(18);
  });

  it('Loan Office only while you are the only player without a landmark', () => {
    const s = newMatch('mk2', 3, { first: 0 });
    s.subPhase = 'build';
    stock(s, 'landmark', 'loanOffice');
    setPlayer(s, 0, { coins: 20 });
    expect(buildBlocker(s, player(s, 0), 'loanOffice')).toMatch(/only player/);
    player(s, 1).landmarks = ['forge'];
    expect(buildBlocker(s, player(s, 0), 'loanOffice')).toMatch(/only player/);
    player(s, 2).landmarks = ['temple'];
    expect(buildBlocker(s, player(s, 0), 'loanOffice')).toBeNull();
  });

  it('a third landmark wins; so does the Launch Pad', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    s.subPhase = 'build';
    stock(s, 'landmark', 'museum');
    setPlayer(s, 0, { coins: 30, landmarks: ['forge', 'temple'] });
    const won = act(s, { type: 'build', cardId: 'museum' });
    expect(won.phase).toBe('gameOver');
    expect(won.winnerId).toBe('p0');
    expect(won.winReason).toBe('landmarks');
    expect(won.activePlayerId).toBeNull();
    expect(() => applyAction(won, { type: 'pass', playerId: 'p0' })).toThrow();

    const t = newMatch('mk2', 2, { first: 0 });
    t.subPhase = 'build';
    stock(t, 'landmark', 'launchPad');
    setPlayer(t, 0, { coins: 45 });
    const rocket = act(t, { type: 'build', cardId: 'launchPad' });
    expect(rocket.winnerId).toBe('p0');
    expect(rocket.winReason).toBe('launchPad');
  });

  it('"everyone" landmarks apply to every player: Soda Bottling Plant boosts red cups too', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 0, { coins: 10, landmarks: ['sodaBottlingPlant'] });
    setPlayer(s, 1, { coins: 0, city: { sushiBar: 1 } });
    expect(coins(roll(s, [1]))).toEqual([6, 4]);
  });

  it('Airport pays 5 when you pass, nothing when you build', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 1, { landmarks: ['airport'] });
    setPlayer(s, 0, { coins: 3 });
    let next = roll(s, [1]);
    next = act(next, { type: 'pass' });
    expect(next.players[0].coins).toBe(8);
    const built = act(roll(s, [1]), { type: 'build', cardId: s.market.low.slots.find((x) => x.cardId !== 'businessCenter' && x.cardId !== 'forest')!.cardId });
    expect(built.players[0].coins).toBeLessThan(8);
  });

  it('Charterhouse (2 dice) and City Hall (1 die) pay when the roll brings nothing', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 0, { coins: 4, landmarks: ['charterhouse', 'cityHall'] });
    expect(roll(s, [2, 3]).players[0].coins).toBe(7);
    expect(roll(s, [5]).players[0].coins).toBe(6);
    setPlayer(s, 0, { city: { forest: 1 } });
    expect(roll(s, [5]).players[0].coins).toBe(6); // the Forest paid, so no City Hall
  });

  it('Tech Startup pays 8 on a 12; Temple takes 2 from each on doubles', () => {
    const s = newMatch('mk2', 3, { first: 0 });
    setPlayer(s, 0, { coins: 0, landmarks: ['techStartup', 'temple'] });
    setPlayer(s, 1, { coins: 1 });
    setPlayer(s, 2, { coins: 5 });
    expect(coins(roll(s, [6, 6]))).toEqual([8 + 2 + 1, 0, 3]);
  });

  it('Amusement Park gives one extra turn on doubles, even with a Radio Tower too', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 0, { coins: 20, landmarks: ['amusementPark'] });
    stock(s, 'landmark', 'radioTower');
    let next = roll(s, [2, 2]);
    expect(next.turn.extraTurn).toBe(true);
    next = act(next, { type: 'build', cardId: 'radioTower' });
    expect(next.activePlayerId).toBe('p0');
    expect(next.log.filter((e) => e.kind === 'extraTurn')).toHaveLength(1);
    next = roll(next, [1]);
    next = act(next, { type: 'pass' });
    expect(next.activePlayerId).toBe('p1');
  });

  it('Moving Company: doubles → give an establishment to the player on your right', () => {
    const s = newMatch('mk2', 3, { first: 0 });
    setPlayer(s, 1, { landmarks: ['movingCompany'] });
    setPlayer(s, 0, { coins: 5, city: { forest: 1, cafe: 1 } });
    let next = roll(s, [3, 3]);
    expect(next.subPhase).toBe('gift');
    next = act(next, { type: 'gift', cardId: 'cafe' });
    expect(next.players[0].city).toEqual({ forest: 1 });
    expect(next.players[2].city).toEqual({ cafe: 1 }); // p2 is on p0's right
    expect(next.subPhase).toBe('build');
  });

  it('immediate landmarks: Museum, Publisher, Private Club, Park', () => {
    const base = () => {
      const s = newMatch('mk2', 3, { first: 0 });
      s.subPhase = 'build';
      setPlayer(s, 0, { coins: 30 });
      setPlayer(s, 1, { coins: 20, landmarks: ['forge', 'temple'], city: { bakery: 2, convenienceStore: 1 } });
      setPlayer(s, 2, { coins: 5, landmarks: ['airport'] });
      return s;
    };
    let s = base();
    stock(s, 'landmark', 'museum');
    expect(coins(act(s, { type: 'build', cardId: 'museum' }))).toEqual([30 - 12 + 6 + 3, 14, 2]);
    s = base();
    stock(s, 'landmark', 'publisher');
    expect(coins(act(s, { type: 'build', cardId: 'publisher' }))).toEqual([30 - 10 + 3, 17, 5]);
    s = base();
    stock(s, 'landmark', 'privateClub');
    expect(coins(act(s, { type: 'build', cardId: 'privateClub' }))).toEqual([30 - 12 + 5, 15, 5]);
    s = base();
    stock(s, 'landmark', 'park');
    const parked = act(s, { type: 'build', cardId: 'park' });
    expect(coins(parked)).toEqual([15, 15, 15]); // 18 + 20 + 5 = 43 → 15 each, the bank adds 2
    expect(parked.log.at(-2)).toMatchObject({ kind: 'redistribute', each: 15, fromBank: 2 });
  });
});

describe('Business Center', () => {
  it('MK2: optional swap of any establishments, purples included', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 0, { coins: 0, city: { businessCenter: 1 } });
    setPlayer(s, 1, { city: { stadium: 1, mine: 1 } });
    let next = roll(s, [6]);
    expect(next.subPhase).toBe('exchange');
    next = act(next, { type: 'exchange', give: 'businessCenter', targetId: 'p1', take: 'stadium' } as never);
    expect(next.players[0].city).toEqual({ stadium: 1 });
    expect(next.players[1].city).toEqual({ businessCenter: 1, mine: 1 });
    expect(next.subPhase).toBe('build');
    const skipped = act(roll(s, [6]), { type: 'skipExchange' });
    expect(skipped.subPhase).toBe('build');
    expect(skipped.players[0].city).toEqual({ businessCenter: 1 });
  });

  it('is skipped when nobody has anything to swap', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    setPlayer(s, 0, { coins: 1, city: { businessCenter: 1 } });
    expect(roll(s, [6]).subPhase).toBe('build');
  });
});

describe('MK1', () => {
  it('starts on 3 coins with a Wheat Field and a Bakery, every pile face-up', () => {
    const s = newMatch('mk1', 4, { keepSetup: true });
    expect(coins(s)).toEqual([3, 3, 3, 3]);
    expect(s.players[0].city).toEqual({ wheatField: 1, bakery: 1 });
    expect(s.subPhase).toBe('roll');
    const piles = [...s.market.low.slots, ...s.market.high.slots];
    expect(piles.length).toBe(EDITIONS.mk1.establishments.length);
    expect(s.market.landmark.slots).toEqual([]);
  });

  it('needs the Train Station to roll two dice', () => {
    const s = newMatch('mk1', 2, { first: 0 });
    expect(() => act(s, { type: 'roll', dice: 2 } as never)).toThrow(/Train Station/);
    setPlayer(s, 0, { landmarks: ['trainStation'] });
    expect(roll(s, [3, 4]).turn.roll?.total).toBe(7);
  });

  it('allows one copy of each purple, and keeps sold-out piles at 0', () => {
    const s = newMatch('mk1', 2, { first: 0 });
    s.subPhase = 'build';
    setPlayer(s, 0, { coins: 20, city: { stadium: 1 } });
    expect(buildBlocker(s, player(s, 0), 'stadium')).toMatch(/only one/);
    s.market.low.slots.find((x) => x.cardId === 'ranch')!.count = 1;
    const next = act(s, { type: 'build', cardId: 'ranch' });
    expect(next.market.low.slots.find((x) => x.cardId === 'ranch')).toEqual({ cardId: 'ranch', count: 0 });
  });

  it('Shopping Mall boosts only its owner’s cups and shops', () => {
    const s = newMatch('mk1', 2, { first: 0 });
    setPlayer(s, 0, { coins: 5, city: { cafe: 1 }, landmarks: ['shoppingMall'] });
    setPlayer(s, 1, { coins: 5, city: { cafe: 1 } });
    startTurnFor(s, 1);
    expect(coins(roll(s, [3]))).toEqual([7, 3]);
    startTurnFor(s, 0);
    expect(coins(roll(s, [3]))).toEqual([4, 6]);
  });

  it('TV Station takes 5 from the chosen opponent; Business Center can’t trade purples', () => {
    const s = newMatch('mk1', 3, { first: 0 });
    setPlayer(s, 0, { coins: 0, city: { tvStation: 1, businessCenter: 1, bakery: 1 } });
    setPlayer(s, 1, { coins: 9, city: { mine: 1, stadium: 1 } });
    setPlayer(s, 2, { coins: 3 });
    let next = roll(s, [6]);
    expect(next.subPhase).toBe('tvTarget');
    next = act(next, { type: 'tvTarget', targetId: 'p1' } as never);
    expect(coins(next)).toEqual([5, 4, 3]);
    expect(next.subPhase).toBe('exchange');
    expect(() => act(next, { type: 'exchange', give: 'bakery', targetId: 'p1', take: 'stadium' } as never)).toThrow();
    next = act(next, { type: 'exchange', give: 'bakery', targetId: 'p1', take: 'mine' } as never);
    expect(next.players[0].city).toEqual({ tvStation: 1, businessCenter: 1, mine: 1 });
  });

  it('Radio Tower: keep or reroll once', () => {
    const s = newMatch('mk1', 2, { first: 0 });
    setPlayer(s, 0, { coins: 0, landmarks: ['radioTower'] });
    let next = roll(s, [5]);
    expect(next.subPhase).toBe('reroll');
    expect(next.players[0].coins).toBe(0);
    const kept = act(next, { type: 'keepRoll' });
    expect(kept.subPhase).toBe('build');
    // Reroll into a 2: the starting Bakery pays (MK1's Wheat Field is 1 only).
    rigDice(next, [2]);
    next = act(next, { type: 'reroll', dice: 1 } as never);
    expect(next.subPhase).toBe('build');
    expect(next.players[0].coins).toBe(1);
  });

  it('wins by building all four landmarks', () => {
    const s = newMatch('mk1', 2, { first: 0 });
    s.subPhase = 'build';
    setPlayer(s, 0, { coins: 22, landmarks: ['trainStation', 'shoppingMall', 'amusementPark'] });
    const won = act(s, { type: 'build', cardId: 'radioTower' });
    expect(won.winnerId).toBe('p0');
  });
});

describe('purity', () => {
  it('never mutates the previous state', () => {
    const s = newMatch('mk2', 3, { first: 0 });
    setPlayer(s, 0, { coins: 3, city: { bakery: 1 } });
    const before = JSON.stringify(s);
    roll(s, [2]);
    expect(JSON.stringify({ ...s, rngState: JSON.parse(before).rngState })).toBe(before);
  });

  it('rejects moves out of turn', () => {
    const s = newMatch('mk2', 2, { first: 0 });
    expect(() => applyAction(s, { type: 'roll', playerId: 'p1', dice: 1 })).toThrow(/not your turn/);
  });
});
