import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { boardCards, findBoardSize, removeFromBoard, shufflePrefix } from './board';
import { engineFor } from './modes';

const normal = engineFor('normal');

describe('findBoardSize', () => {
  it('deals the mode minimum when the minimum already holds a set', () => {
    const deck = normal.freshDeck(); // odometer order — 0000/0001/0002 is a set
    expect(findBoardSize(normal, deck, 12)).toBe(12);
  });

  it('grows in rows of three until a group exists', () => {
    // Three cards differing in one feature only, plus the card that completes
    // the first two. No set in the first 3; there is one in all 4.
    const deck = ['0000', '0001', '1000', '2000'];
    expect(findBoardSize(normal, deck, 3)).toBe(4); // clamped to the deck
    expect(normal.hasSet(boardCards(deck, 4))).toBe(true);
  });

  it('never exceeds the remaining deck', () => {
    const deck = ['0000', '0001', '1000'];
    expect(findBoardSize(normal, deck, 12)).toBe(3);
  });

  it('respects the chain anchor when sizing', () => {
    const chain = engineFor('setchain');
    // No card here pairs with the anchor to a set present on the board, so the
    // board grows to the whole (tiny) deck.
    const deck = ['0001', '0002', '1001'];
    const size = findBoardSize(chain, deck, 3, ['0000', '1000', '2000']);
    expect(size).toBe(3);
  });
});

describe('removeFromBoard', () => {
  const deck15 = () => Array.from({ length: 15 }, (_, i) => `c${i}`);

  it('back-fills holes inside the protected prefix from beyond it', () => {
    const deck = deck15();
    removeFromBoard(deck, 12, ['c0', 'c5', 'c11'], 12);
    expect(deck).toHaveLength(12);
    // Survivors keep their slots; the three holes take the next undealt cards.
    expect(deck[0]).toBe('c12');
    expect(deck[5]).toBe('c13');
    expect(deck[11]).toBe('c14');
    expect(deck[1]).toBe('c1');
    expect(deck[10]).toBe('c10');
  });

  it('lets the board shrink when the deck is out of replacements', () => {
    const deck = deck15().slice(0, 12);
    removeFromBoard(deck, 12, ['c0', 'c5', 'c11'], 12);
    expect(deck).toHaveLength(9);
    // c11 sat past the new cutoff (9), so it just vanished; c0 and c5 were
    // back-filled from the tail.
    expect(deck).toEqual(['c9', 'c1', 'c2', 'c3', 'c4', 'c10', 'c6', 'c7', 'c8']);
  });

  it('clears the whole board when every face-up card is taken', () => {
    const deck = deck15();
    removeFromBoard(deck, 12, deck.slice(0, 12), 12);
    expect(deck).toEqual(['c12', 'c13', 'c14']);
  });

  it('ignores cards that are no longer in the deck', () => {
    const deck = deck15();
    removeFromBoard(deck, 12, ['c0', 'gone'], 12);
    expect(deck).toHaveLength(14);
    expect(deck[0]).toBe('c12');
  });
});

describe('shufflePrefix', () => {
  it('permutes only the face-up cards and is seed-deterministic', () => {
    const a = Array.from({ length: 15 }, (_, i) => `c${i}`);
    const b = a.slice();
    shufflePrefix(createRng(7), a, 12);
    shufflePrefix(createRng(7), b, 12);
    expect(a).toEqual(b);
    expect(a.slice(12)).toEqual(['c12', 'c13', 'c14']);
    expect(a.slice(0, 12).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => `c${i}`).sort(),
    );
  });
});
