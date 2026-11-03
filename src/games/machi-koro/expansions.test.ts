import { describe, expect, it } from 'vitest';
import { applyAction, buildBlocker, priceOf } from './reducer';
import { EXPANSIONS, MARKETPLACE_SIZE, estDef, isLandmark, rulesFor } from './cards';
import { machiKoroModule } from './module';
import type { MkExpansion, MkState } from './types';
import { act, newMatch, player, rigDice, roll, seats, setPlayer, startTurnFor } from './testSupport';

const coins = (s: MkState) => s.players.map((p) => p.coins);
const both: MkExpansion[] = ['harbor', 'millionairesRow'];
/** An MK1 match with these expansions and the open supply (every pile buyable). */
const open = (n: number, expansions: MkExpansion[] = both) => newMatch('mk1', n, { first: 0, expansions, supply: 'open' });

describe('MK1 expansion setup', () => {
  it('card ids never clash between the base game and the expansions', () => {
    const ids = rulesFor({ edition: 'mk1', promoLandmarks: false, expansions: both }).establishments.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isLandmark('mk1', id)).toBe(false);
    expect(EXPANSIONS.harbor.establishments).toHaveLength(10);
    expect(EXPANSIONS.millionairesRow.establishments).toHaveLength(14);
  });

  it('Harbor: City Hall starts built, seven landmarks to win, up to 5 players', () => {
    const s = newMatch('mk1', 5, { expansions: ['harbor'], keepSetup: true });
    expect(s.players.every((p) => p.landmarks.join() === 'cityHall')).toBe(true);
    expect(rulesFor(s.config).landmarksToWin).toBe(7);
    expect(machiKoroModule.validateConfig(s.config, seats(5))).toEqual([]);
    expect(machiKoroModule.validateConfig({ edition: 'mk1', promoLandmarks: false }, seats(5))).not.toEqual([]);
    expect(machiKoroModule.validateConfig({ edition: 'mk1', promoLandmarks: false, expansions: ['millionairesRow'] }, seats(5)))
      .not.toEqual([]);
  });

  it('the marketplace shows ten different piles from one deck, one purple per player', () => {
    const s = newMatch('mk1', 3, { expansions: both, keepSetup: true });
    expect(rulesFor(s.config).market).toBe('marketplace');
    const slots = s.market.mixed.slots;
    expect(slots).toHaveLength(MARKETPLACE_SIZE);
    expect(new Set(slots.map((x) => x.cardId)).size).toBe(MARKETPLACE_SIZE);
    const all = [...s.market.mixed.deck, ...slots.flatMap((x) => Array<string>(x.count).fill(x.cardId))];
    const R = rulesFor(s.config);
    for (const d of R.establishments) {
      expect(all.filter((id) => id === d.id)).toHaveLength(d.color === 'purple' ? 3 : d.copies);
    }
    expect(s.market.low.slots).toEqual([]);
  });

  it('a sold-out marketplace pile is refilled in place up to ten', () => {
    const s = newMatch('mk1', 2, { first: 0, expansions: ['harbor'] });
    s.subPhase = 'build';
    const ids = ['wheatField', 'ranch', 'bakery', 'cafe', 'convenienceStore', 'forest', 'mine', 'appleOrchard', 'pizzaJoint', 'flowerShop'];
    s.market.mixed.slots = ids.map((cardId) => ({ cardId, count: 1 }));
    s.market.mixed.deck = ['ranch', 'tunaBoat', 'sushiBar'];
    setPlayer(s, 0, { coins: 30 });
    const next = act(s, { type: 'build', cardId: 'wheatField' });
    expect(next.market.mixed.slots.map((x) => x.cardId)).toEqual(['tunaBoat', ...ids.slice(1)]);
    expect(next.market.mixed.slots[1]).toEqual({ cardId: 'ranch', count: 2 });
    expect(next.market.mixed.deck).toEqual(['sushiBar']);
  });

  it('expansion landmarks are not buildable without the expansion', () => {
    const s = newMatch('mk1', 2, { first: 0 });
    s.subPhase = 'build';
    setPlayer(s, 0, { coins: 40 });
    expect(buildBlocker(s, player(s, 0), 'airport')).toMatch(/Not in this game/);
  });
});

describe('Harbor', () => {
  it('City Hall gives a broke player 1 coin before building', () => {
    const s = open(2, ['harbor']);
    setPlayer(s, 0, { coins: 0, city: {} });
    const next = roll(s, [4]);
    expect(next.players[0].coins).toBe(1);
    expect(next.log.at(-1)).toMatchObject({ kind: 'coins', source: { type: 'lm', id: 'cityHall' } });
  });

  it('on 10+ the Harbor may add 2, which reaches 13–14; one Tuna Boat roll pays every boat', () => {
    const s = open(2, ['harbor']);
    setPlayer(s, 0, { coins: 0, city: { tunaBoat: 2 }, landmarks: ['cityHall', 'harbor', 'trainStation'] });
    setPlayer(s, 1, { coins: 0, city: { tunaBoat: 1 }, landmarks: ['cityHall', 'harbor'] });
    let next = roll(s, [5, 6]);
    expect(next.subPhase).toBe('harbor');
    rigDice(next, [3, 4]);
    next = act(next, { type: 'harbor', add: true });
    expect(next.turn.roll).toMatchObject({ total: 13, added: 2 });
    expect(coins(next)).toEqual([14, 7]);
    expect(next.log.filter((e) => e.kind === 'bonusRoll')).toHaveLength(1);
    const kept = act(roll(s, [5, 6]), { type: 'harbor', add: false });
    expect(kept.turn.roll?.total).toBe(11);
    expect(coins(kept)).toEqual([1, 0]); // nothing on 11 — City Hall's broke coin
  });

  it('Sushi Bars and Mackerel Boats pay only with a Harbor', () => {
    const s = open(2, ['harbor']);
    setPlayer(s, 0, { coins: 10, city: {}, landmarks: ['cityHall'] });
    setPlayer(s, 1, { coins: 0, city: { sushiBar: 1 }, landmarks: ['cityHall'] });
    expect(coins(roll(s, [1]))).toEqual([10, 0]);
    setPlayer(s, 1, { landmarks: ['cityHall', 'harbor'] });
    expect(coins(roll(s, [1]))).toEqual([7, 3]);
    setPlayer(s, 0, { landmarks: ['cityHall', 'trainStation'] });
    setPlayer(s, 1, { coins: 0, city: { mackerelBoat: 2 }, landmarks: ['cityHall'] });
    expect(roll(s, [4, 4]).players[1].coins).toBe(0);
    setPlayer(s, 1, { landmarks: ['cityHall', 'harbor'] });
    expect(roll(s, [4, 4]).players[1].coins).toBe(6);
  });

  it('Flower Shop counts Flower Orchards (+1 Shopping Mall); Tax Office takes from 10 or more', () => {
    const s = open(3, ['harbor']);
    setPlayer(s, 0, { coins: 0, city: { flowerShop: 1, flowerOrchard: 3 }, landmarks: ['cityHall', 'shoppingMall'] });
    expect(roll(s, [6]).players[0].coins).toBe(4);
    const t = open(3, ['harbor']);
    setPlayer(t, 0, { coins: 0, city: { taxOffice: 1 }, landmarks: ['cityHall', 'trainStation'] });
    setPlayer(t, 1, { coins: 10 });
    setPlayer(t, 2, { coins: 9 });
    expect(coins(roll(t, [4, 4]))).toEqual([5, 5, 9]);
  });

  it('Publisher takes 1 per cup and shop card from each opponent', () => {
    const s = open(2, ['harbor']);
    setPlayer(s, 0, { coins: 0, city: { publisher: 1 }, landmarks: ['cityHall', 'trainStation'] });
    setPlayer(s, 1, { coins: 10, city: { cafe: 2, bakery: 1, wheatField: 1 } });
    expect(coins(roll(s, [3, 4]))).toEqual([3, 7]);
  });

  it('the Airport pays 10 when you build nothing', () => {
    const s = open(2, ['harbor']);
    setPlayer(s, 0, { coins: 2, city: {}, landmarks: ['cityHall', 'airport'] });
    expect(act(roll(s, [4]), { type: 'pass' }).players[0].coins).toBe(12);
  });
});

describe('Millionaire’s Row', () => {
  it('General Store and Corn Field pay below 2 landmarks built (a starting City Hall doesn’t count)', () => {
    const s = open(2);
    setPlayer(s, 0, { coins: 0, city: { generalStore: 1, cornField: 1 }, landmarks: ['cityHall', 'harbor'] });
    expect(roll(s, [2]).players[0].coins).toBe(2);
    expect(roll(s, [3]).players[0].coins).toBe(1);
    setPlayer(s, 0, { landmarks: ['cityHall', 'harbor', 'trainStation'] });
    expect(roll(s, [2]).players[0].coins).toBe(1); // only City Hall's broke coin
  });

  it('French Restaurant needs a roller with 2+ landmarks; Members Only Club takes everything from 3+', () => {
    const s = open(2);
    setPlayer(s, 0, { coins: 20, city: {}, landmarks: ['trainStation'] });
    setPlayer(s, 1, { coins: 0, city: { frenchRestaurant: 1, membersOnlyClub: 1 } });
    expect(coins(roll(s, [5]))).toEqual([20, 0]);
    setPlayer(s, 0, { landmarks: ['trainStation', 'shoppingMall'] });
    expect(coins(roll(s, [5]))).toEqual([15, 5]);
    setPlayer(s, 0, { landmarks: ['trainStation', 'shoppingMall', 'amusementPark'] });
    expect(coins(roll(s, [6, 6]))).toEqual([0, 20]);
  });

  it('the Loan Office pays 5 to build and costs 2 whenever it activates', () => {
    const s = open(2);
    s.subPhase = 'build';
    setPlayer(s, 0, { coins: 0 });
    expect(priceOf(s, player(s, 0), 'loanOffice')).toBe(-5);
    let next = act(s, { type: 'build', cardId: 'loanOffice' });
    expect(next.players[0].coins).toBe(5);
    startTurnFor(next, 0);
    setPlayer(next, 0, { city: { loanOffice: 1 } });
    next = roll(next, [5]);
    expect(next.players[0].coins).toBe(3);
    expect(next.log.find((e) => e.kind === 'payBank')).toMatchObject({ amount: 2, owed: 2 });
  });

  it('the Winery pays 6 per Vineyard, closes, and reopens instead of paying next time', () => {
    const s = open(2);
    setPlayer(s, 0, { coins: 0, city: { winery: 1, vineyard: 2 }, landmarks: ['trainStation'] });
    let next = roll(s, [4, 5]);
    expect(next.players[0].coins).toBe(12);
    expect(next.players[0].closed).toEqual({ winery: 1 });
    startTurnFor(next, 0);
    next = roll(next, [4, 5]);
    expect(next.players[0].coins).toBe(12);
    expect(next.players[0].closed).toEqual({});
    expect(next.log.some((e) => e.kind === 'reopened' && e.cardId === 'winery')).toBe(true);
  });

  it('Renovation Company closes a type everywhere and collects 1 per opponent copy', () => {
    const s = open(3);
    setPlayer(s, 0, { coins: 0, city: { renovationCompany: 1, bakery: 1 }, landmarks: ['trainStation'] });
    setPlayer(s, 1, { coins: 1, city: { bakery: 3 } });
    setPlayer(s, 2, { coins: 5, city: { bakery: 2 } });
    let next = roll(s, [4, 4]);
    expect(next.subPhase).toBe('renovate');
    next = act(next, { type: 'renovate', cardId: 'bakery' });
    expect(coins(next)).toEqual([3, 0, 3]);
    expect(next.players.map((p) => p.closed.bakery)).toEqual([1, 3, 2]);
    expect(next.subPhase).toBe('build');
    // P1's closed Bakeries reopen on their next 2–3 instead of paying.
    startTurnFor(next, 1);
    next = roll(next, [2]);
    expect(next.players[1].coins).toBe(1); // City Hall's broke coin, not the Bakeries
    expect(next.players[1].closed).toEqual({});
  });

  it('Demolition Company: demolish a landmark you built for 8; City Hall can’t go', () => {
    const s = open(2);
    setPlayer(s, 0, { coins: 0, city: { demolitionCompany: 1 }, landmarks: ['cityHall', 'harbor', 'trainStation'] });
    let next = roll(s, [4]);
    expect(next.subPhase).toBe('demolish');
    expect(() => act(next, { type: 'demolish', landmarkId: 'cityHall' })).toThrow();
    next = act(next, { type: 'demolish', landmarkId: 'harbor' });
    expect(next.players[0].landmarks).toEqual(['cityHall', 'trainStation']);
    expect(next.players[0].coins).toBe(8);
    expect(buildBlocker(next, next.players[0], 'harbor')).toBeNull();
    // Nothing to demolish: nothing happens.
    setPlayer(s, 0, { landmarks: ['cityHall'] });
    expect(roll(s, [4]).subPhase).toBe('build');
  });

  it('Moving Company: give a non-major card to anyone for 4; a closed copy goes first', () => {
    const s = open(3);
    setPlayer(s, 0, {
      coins: 0, city: { movingCompany: 1, cafe: 2, stadium: 1 }, closed: { cafe: 1 }, landmarks: ['trainStation'],
    });
    let next = roll(s, [4, 5]);
    expect(next.subPhase).toBe('give');
    expect(() => act(next, { type: 'give', cardId: 'stadium', targetId: 'p2' } as never)).toThrow();
    next = act(next, { type: 'give', cardId: 'cafe', targetId: 'p2' } as never);
    expect(next.players[0].city.cafe).toBe(1);
    expect(next.players[0].closed).toEqual({});
    expect(next.players[2].closed).toEqual({ cafe: 1 });
    expect(next.players[0].coins).toBe(4);
  });

  it('Tech Startup: invest at the end of your turn, collect it from each opponent on a 10', () => {
    const s = open(3);
    setPlayer(s, 0, { coins: 3, city: { techStartup: 1 }, landmarks: ['trainStation'] });
    let next = act(roll(s, [1, 2]), { type: 'pass', invest: true });
    expect(next.players[0]).toMatchObject({ coins: 2, invested: 1 });
    startTurnFor(next, 0);
    next = act(roll(next, [1, 2]), { type: 'pass', invest: true });
    expect(next.players[0]).toMatchObject({ coins: 1, invested: 2 });
    startTurnFor(next, 0);
    setPlayer(next, 1, { coins: 5 });
    setPlayer(next, 2, { coins: 1 });
    next = roll(next, [4, 6]);
    expect(coins(next)).toEqual([1 + 2 + 1, 3, 0]);
  });

  it('International Exhibit Hall activates another card instead and goes back to the market', () => {
    const s = open(2);
    setPlayer(s, 0, {
      coins: 0, city: { internationalExhibitHall: 1, mine: 1, cafe: 1 }, landmarks: ['trainStation'],
    });
    let next = roll(s, [5, 5]);
    expect(next.subPhase).toBe('exhibit');
    expect(() => act(next, { type: 'exhibit', cardId: 'cafe' })).toThrow();
    const before = next.market.high.slots.find((x) => x.cardId === 'internationalExhibitHall')!.count;
    next = act(next, { type: 'exhibit', cardId: 'mine' });
    expect(next.players[0].coins).toBe(5);
    expect(next.players[0].city.internationalExhibitHall).toBeUndefined();
    expect(next.market.high.slots.find((x) => x.cardId === 'internationalExhibitHall')!.count).toBe(before + 1);
    const kept = act(roll(s, [5, 5]), { type: 'exhibit', cardId: null });
    expect(kept.players[0].city.internationalExhibitHall).toBe(1);
  });

  it('Soda Bottling Plant counts everyone’s cups; Park shares coins out evenly', () => {
    const s = open(2);
    setPlayer(s, 0, { coins: 0, city: { sodaBottlingPlant: 1, cafe: 1 }, landmarks: ['trainStation'] });
    setPlayer(s, 1, { coins: 0, city: { familyRestaurant: 2 } });
    expect(roll(s, [5, 6]).players[0].coins).toBe(3);
    const t = open(3);
    setPlayer(t, 0, { coins: 1, city: { park: 1 }, landmarks: ['trainStation'] });
    setPlayer(t, 1, { coins: 10 });
    setPlayer(t, 2, { coins: 4 });
    expect(coins(roll(t, [5, 6]))).toEqual([5, 5, 5]);
  });

  it('Business Center: the giver hands over a closed copy, the taker gets an open one', () => {
    const s = open(2);
    setPlayer(s, 0, { coins: 0, city: { businessCenter: 1, ranch: 2 }, closed: { ranch: 1 } });
    setPlayer(s, 1, { city: { forest: 2 }, closed: { forest: 1 } });
    let next = roll(s, [6]);
    next = act(next, { type: 'exchange', give: 'ranch', targetId: 'p1', take: 'forest' } as never);
    expect(next.players[0].closed).toEqual({});
    expect(next.players[0].city).toMatchObject({ ranch: 1, forest: 1 });
    expect(next.players[1].closed).toEqual({ forest: 1, ranch: 1 });
  });
});

describe('MK1 expansions purity', () => {
  it('never mutates the previous state', () => {
    const s = open(3);
    setPlayer(s, 0, { coins: 3, city: { winery: 1, vineyard: 1 }, landmarks: ['trainStation'] });
    const before = JSON.stringify(s);
    roll(s, [4, 5]);
    expect(JSON.stringify({ ...s, rngState: JSON.parse(before).rngState })).toBe(before);
  });

  it('every expansion card has a name, text and art', () => {
    for (const x of Object.values(EXPANSIONS)) {
      for (const d of x.establishments) {
        expect(estDef('mk1', d.id).expansion).toBe(x.id);
        expect(d.text.length).toBeGreaterThan(10);
        expect(d.art).toBeTruthy();
      }
    }
    expect(() => applyAction(open(2), { type: 'harbor', playerId: 'p0', add: true })).toThrow(/not allowed/);
  });
});
