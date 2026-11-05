// 7 Wonders Duel — trading prices and cheapest payment.

import { describe, it, expect } from 'vitest';
import { cardPayment, cheapestPayment, discardCoins, priceOf, wonderPayment } from './resources';
import { wonderById } from './wonders';
import { cardNamed, giveCard, startedMatch } from './testSupport';

describe('Duel trading and payment', () => {
  it('prices a resource at 2 + the opponent\'s brown / gray production of it', () => {
    const s = startedMatch();
    const [a, b] = s.players;
    expect(priceOf(a, b, 'wood')).toBe(2);
    giveCard(s, 1, 'Lumber Yard', 'Sawmill');
    expect(priceOf(a, b, 'wood')).toBe(5);
    // Yellow choice producers and wonders never raise the price.
    giveCard(s, 1, 'Caravansery', 'Forum');
    s.players[1].wonders[1].built = true; // Piraeus
    expect(priceOf(a, b, 'clay')).toBe(2);
    expect(priceOf(a, b, 'glass')).toBe(2);
  });

  it('fixes the price at 1 with a Reserve or the Customs House', () => {
    const s = startedMatch();
    giveCard(s, 1, 'Sawmill', 'Glassworks');
    giveCard(s, 0, 'Wood Reserve', 'Customs House');
    const [a, b] = s.players;
    expect(priceOf(a, b, 'wood')).toBe(1);
    expect(priceOf(a, b, 'glass')).toBe(1);
    expect(priceOf(a, b, 'papyrus')).toBe(1);
    expect(priceOf(a, b, 'stone')).toBe(2);
  });

  it('uses fixed production first and assigns choice producers to the dearest needs', () => {
    const s = startedMatch();
    giveCard(s, 0, 'Forum', 'Caravansery', 'Glassworks');
    giveCard(s, 1, 'Press', 'Drying Room'); // papyrus costs me 4
    // Palace: clay, stone, wood, glass, glass. Glassworks + Forum make the
    // glass, Caravansery one raw resource; two raw ones are bought at 2.
    const pay = cheapestPayment(s.players[0], s.players[1], cardNamed('Palace').cost);
    expect(pay.bought).toHaveLength(2);
    expect(pay.bought).not.toContain('glass');
    expect(pay.trade).toBe(4);
    // Pantheon: clay, wood, papyrus, papyrus — Forum takes a papyrus (4), not glass.
    const pan = cheapestPayment(s.players[0], s.players[1], cardNamed('Pantheon').cost);
    expect(pan.bought.filter((r) => r === 'papyrus')).toHaveLength(1);
    expect(pan.trade).toBe(4 + 2);
  });

  it('lets Masonry skip the two dearest resources of a blue card', () => {
    const s = startedMatch();
    giveCard(s, 1, 'Shelf Quarry'); // stone costs me 4
    const townHall = cardNamed('Town Hall'); // 3 stone, 2 wood
    expect(cardPayment(s, 0, townHall).coins).toBe(3 * 4 + 2 * 2);
    s.players[0].progressTokens.push('masonry');
    const pay = cardPayment(s, 0, townHall);
    expect(pay.waived).toEqual(['stone', 'stone']);
    expect(pay.coins).toBe(4 + 2 * 2);
  });

  it('lets Architecture skip two resources of a wonder', () => {
    const s = startedMatch();
    const pyramids = wonderById('pyramids'); // 3 stone, papyrus
    expect(wonderPayment(s, 0, pyramids).coins).toBe(8);
    s.players[0].progressTokens.push('architecture');
    expect(wonderPayment(s, 0, pyramids).coins).toBe(4);
  });

  it('builds a chained card for free', () => {
    const s = startedMatch();
    giveCard(s, 0, 'Baths');
    const pay = cardPayment(s, 0, cardNamed('Aqueduct'));
    expect(pay).toMatchObject({ coins: 0, chained: true });
  });

  it('pays 2 coins + 1 per yellow card for a discard', () => {
    const s = startedMatch();
    expect(discardCoins(s.players[0])).toBe(2);
    giveCard(s, 0, 'Tavern', 'Wood Reserve');
    expect(discardCoins(s.players[0])).toBe(4);
  });
});
