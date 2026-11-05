// Spies, Lies & Supplies abilities, and Epic Mode.

import { describe, it, expect } from 'vitest';
import type { AlsAction, AlsAnswer, AlsConfig, AlsState } from './types';
import { applyAction } from './reducer';
import { battleWinner, locate, theaterStrength } from './rules';
import { arrange, card, newMatch, play } from './testSupport';

const SLS = { expansions: { spiesLiesSupplies: true } };
/** Theaters [intel, diplo, econ] = 0, 1, 2. */
const STANDALONE: Partial<AlsConfig> = { theaters: ['intel', 'diplo', 'econ'], ...SLS };

const deploy = (playerId: string, cardId: number, theaterIdx: number): AlsAction => ({ type: 'deploy', playerId, cardId, theaterIdx });
const improvise = (playerId: string, cardId: number, theaterIdx: number): AlsAction => ({ type: 'improvise', playerId, cardId, theaterIdx });
const answer = (playerId: string, a: AlsAnswer): AlsAction => ({ type: 'answer', playerId, answer: a });
const pick = (playerId: string, cardId: number) => answer(playerId, { kind: 'card', cardId });
const theater = (playerId: string, theaterIdx: number) => answer(playerId, { kind: 'theater', theaterIdx });
const faceDown = (s: AlsState, id: number) => locate(s, id)!.placed.faceDown;

describe('Diplomacy', () => {
  it('Relinquish destroys one of your other cards to destroy any uncovered card', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('diplo', 1)], [card('econ', 5)]],
      board: { 2: [[[card('econ', 6), 'd']], []], 0: [[], [[card('intel', 5), 'u'], [card('intel', 6), 'u']]] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('diplo', 1), 1));
    expect(s.pending).toMatchObject({ prompt: 'destroyOwn', optional: true, cards: [card('econ', 6)] });
    s = applyAction(s, pick('p0', card('econ', 6)));
    expect(s.pending).toMatchObject({ prompt: 'destroy' });
    expect(s.pending!.cards).not.toContain(card('intel', 5));   // covered
    s = applyAction(s, pick('p0', card('intel', 6)));
    expect(locate(s, card('econ', 6))).toBeNull();
    expect(locate(s, card('intel', 6))).toBeNull();
    expect(s.deck.slice(0, 2).sort()).toEqual([card('econ', 6), card('intel', 6)].sort());
  });

  it('Envoy may move onto a card its owner plays in an adjacent theater', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('econ', 6), card('intel', 6)], [card('econ', 5), card('econ', 4)]],
      board: { 1: [[[card('diplo', 2), 'u']], []] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('econ', 6), 2));
    expect(s.pending).toMatchObject({ prompt: 'envoy', seat: 0, cards: [card('econ', 6)] });
    s = applyAction(s, answer('p0', { kind: 'option', option: 'move' }));
    expect(locate(s, card('diplo', 2))).toMatchObject({ theaterIdx: 2, uncovered: true });
    // The opponent's plays never trigger it.
    s = applyAction(s, deploy('p1', card('econ', 5), 2));
    expect(s.pending?.prompt).not.toBe('envoy');
  });

  it('Envoy ignores plays to theaters that are not adjacent', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('econ', 6)], [card('econ', 5)]],
      board: { 0: [[[card('diplo', 2), 'u']], []] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('econ', 6), 2));
    expect(s.pending).toBeNull();
    expect(s.activePlayerId).toBe('p1');
  });

  it('Leverage reveals a card to flip an uncovered card no higher than it (face-down cards count 2)', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('diplo', 4), card('intel', 5)], [card('econ', 4)]],
      board: { 2: [[], [[card('econ', 5), 'u']]], 0: [[], [[card('intel', 6), 'd']]] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('diplo', 4), 1));
    expect(s.pending).toMatchObject({ prompt: 'reveal', optional: true, cards: [card('intel', 5)] });
    s = applyAction(s, pick('p0', card('intel', 5)));
    expect(s.players[0].known).toEqual([card('intel', 5)]);
    expect(s.pending!.cards!.sort()).toEqual([card('econ', 5), card('intel', 6), card('diplo', 4)].sort());
    s = applyAction(s, pick('p0', card('econ', 5)));
    expect(faceDown(s, card('econ', 5))).toBe(true);
  });

  it('Give & Take: give the drawn card away and draw another, or keep it and the enemy draws', () => {
    const base = arrange(newMatch(STANDALONE), {
      hands: [[card('diplo', 5)], [card('econ', 5)]],
      deckTop: [card('econ', 1), card('intel', 6)],
      turn: 0,
    });
    let s = applyAction(base, deploy('p0', card('diplo', 5), 1));
    expect(s.pending).toMatchObject({ prompt: 'giveOrKeep', drawnCardId: card('intel', 6) });
    const given = applyAction(s, answer('p0', { kind: 'option', option: 'give' }));
    expect(given.players[1].hand).toContain(card('intel', 6));
    expect(given.players[1].known).toEqual([card('intel', 6)]);
    expect(given.players[0].hand).toEqual([card('econ', 1)]);
    s = applyAction(s, answer('p0', { kind: 'option', option: 'keep' }));
    expect(s.players[0].hand).toEqual([card('intel', 6)]);
    expect(s.players[1].hand.sort()).toEqual([card('econ', 5), card('econ', 1)].sort());
  });
});

describe('Intelligence', () => {
  it("Incite uses an uncovered card's instant ability as if it were on Incite", () => {
    let s = arrange(newMatch({ theaters: ['intel', 'land', 'sea'], ...SLS }), {
      hands: [[card('intel', 1)], [card('land', 6)]],
      board: {
        1: [[], [[card('land', 3), 'u']]],
        2: [[[card('sea', 6), 'd']], [[card('sea', 4), 'd']]],
      },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('intel', 1), 0));
    expect(s.pending).toMatchObject({ prompt: 'incite', cards: [card('land', 3)] });
    s = applyAction(s, pick('p0', card('land', 3)));
    // Maneuver from Incite's theater (0): only theater 1 is adjacent.
    expect(s.pending).toMatchObject({ prompt: 'flip', ability: 'maneuver', seat: 0, cards: [card('land', 3)] });
    expect(s.log.some((e) => e.kind === 'ability' && e.viaIncite && e.ability === 'maneuver')).toBe(true);
  });

  it('Incite on Arms Race: the Incite player gains first, the enemy picks a different theater', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('intel', 1)], [card('diplo', 6)]],
      board: { 2: [[], [[card('econ', 5), 'u']]] },
      turn: 0,
    });
    s = play(s, deploy('p0', card('intel', 1), 0), pick('p0', card('econ', 5)), theater('p0', 1));
    expect(s.pending).toMatchObject({ seat: 1, prompt: 'supply', theaters: [0, 2] });
    expect(() => applyAction(s, theater('p1', 1))).toThrow();
    s = applyAction(s, theater('p1', 2));
    expect(s.supplies).toEqual([[0, 0], [2, 0], [0, 2]]);
  });

  it('Neutralize: a named card in the enemy’s hand is revealed and must be played face down next', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('intel', 4), card('diplo', 6)], [card('econ', 6), card('econ', 5)]],
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('intel', 4), 0));
    expect(s.pending).toMatchObject({ prompt: 'name' });
    expect(s.pending!.cards).toHaveLength(18);
    s = applyAction(s, answer('p0', { kind: 'name', cardId: card('econ', 6) }));
    expect(s.players[1].known).toEqual([card('econ', 6)]);
    expect(s.players[1].neutralized).toEqual([card('econ', 6)]);
    expect(() => applyAction(s, deploy('p1', card('econ', 6), 2))).toThrow();
    expect(() => applyAction(s, improvise('p1', card('econ', 5), 2))).toThrow();
    s = applyAction(s, improvise('p1', card('econ', 6), 0));
    expect(s.players[1].neutralized).toEqual([]);
    expect(faceDown(s, card('econ', 6))).toBe(true);
  });

  it('Neutralize naming a card the enemy does not hold does nothing', () => {
    let s = arrange(newMatch(STANDALONE), { hands: [[card('intel', 4)], [card('econ', 5)]], turn: 0 });
    s = play(s, deploy('p0', card('intel', 4), 0), answer('p0', { kind: 'name', cardId: card('econ', 6) }));
    expect(s.players[1].neutralized).toEqual([]);
    expect(s.log.find((e) => e.kind === 'name')).toMatchObject({ hit: false });
  });

  it('Surveil: the enemy reveals; reveal a lower card to flip an uncovered face-up card', () => {
    const base = arrange(newMatch(STANDALONE), {
      hands: [[card('intel', 5), card('econ', 1), card('diplo', 6)], [card('econ', 4), card('diplo', 1)]],
      board: { 2: [[], [[card('econ', 6), 'u']]] },
      turn: 0,
    });
    let s = applyAction(base, deploy('p0', card('intel', 5), 0));
    expect(s.pending).toMatchObject({ seat: 1, prompt: 'reveal', optional: false });
    s = applyAction(s, pick('p1', card('econ', 4)));
    expect(s.pending).toMatchObject({ seat: 0, prompt: 'reveal', optional: true, cards: [card('econ', 1)], revealedCardId: card('econ', 4) });
    s = applyAction(s, pick('p0', card('econ', 1)));
    expect(s.pending!.cards!.sort()).toEqual([card('econ', 6), card('intel', 5)].sort());
    s = applyAction(s, pick('p0', card('econ', 6)));
    expect(faceDown(s, card('econ', 6))).toBe(true);
    // Revealing a 1 leaves nothing lower.
    s = play(base, deploy('p0', card('intel', 5), 0), pick('p1', card('diplo', 1)));
    expect(s.pending).toBeNull();
    expect(s.activePlayerId).toBe('p1');
  });
});

describe('Economics', () => {
  it('Retrofit gains supplies equal to the chosen card’s strength, then flips it', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('econ', 1)], [card('intel', 6)]],
      board: { 1: [[[card('diplo', 6), 'u']], []] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('econ', 1), 2));
    expect(s.pending!.cards!.sort()).toEqual([card('diplo', 6), card('econ', 1)].sort());
    s = applyAction(s, pick('p0', card('diplo', 6)));
    expect(s.supplies[1]).toEqual([6, 0]);
    expect(faceDown(s, card('diplo', 6))).toBe(true);
    expect(theaterStrength(s, 1, 0)).toBe(8);
  });

  it('Retrofit flipping a face-down card face up sets off its ability', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('econ', 1)], [card('intel', 6)]],
      board: { 1: [[[card('diplo', 3), 'd']], []] },
      turn: 0,
    });
    s = play(s, deploy('p0', card('econ', 1), 2), pick('p0', card('diplo', 3)));
    expect(s.supplies[1]).toEqual([2, 0]);
    expect(s.pending).toMatchObject({ ability: 'manipulate', seat: 0 });
  });

  it('Supply Lines: on your turn you may deploy to a non-matching theater; the enemy gains 1 supply there', () => {
    let s = arrange(newMatch(STANDALONE), {
      hands: [[card('diplo', 6), card('diplo', 5)], [card('intel', 6)]],
      board: { 2: [[[card('econ', 2), 'u']], []] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('diplo', 6), 0));
    expect(s.supplies[0]).toEqual([0, 1]);
    expect(s.log.find((e) => e.kind === 'deploy')).toMatchObject({ via: 'supplyLines' });
    // Only its owner may use it.
    expect(() => applyAction(s, deploy('p1', card('intel', 6), 2))).toThrow();
  });

  it("Requisition reveals a card to gain 2 supplies in that card's theater", () => {
    let s = arrange(newMatch(STANDALONE), { hands: [[card('econ', 4), card('diplo', 6)], [card('intel', 6)]], turn: 0 });
    s = applyAction(s, deploy('p0', card('econ', 4), 2));
    expect(s.pending).toMatchObject({ prompt: 'reveal', optional: true });
    s = applyAction(s, pick('p0', card('diplo', 6)));
    expect(s.supplies[1]).toEqual([2, 0]);
    expect(s.players[0].known).toEqual([card('diplo', 6)]);
  });
});

describe('Epic Mode', () => {
  it('needs three of five theaters to win a battle', () => {
    const s = arrange(newMatch({ theaters: ['air', 'land', 'sea', 'intel', 'diplo'], ...SLS }), {
      first: 1,
      board: {
        0: [[[card('air', 6), 'u']], []],
        1: [[[card('land', 6), 'u']], []],
      },
    });
    expect(battleWinner(s)).toBe(1);
    s.board[2][0].push({ cardId: card('sea', 6), faceDown: false });
    expect(battleWinner(s)).toBe(0);
  });

  it('limits Containment to its own and the adjacent theaters', () => {
    let s = arrange(newMatch({ theaters: ['air', 'land', 'sea', 'intel', 'diplo'], ...SLS }), {
      hands: [[card('air', 5), card('land', 6)], [card('sea', 6), card('sea', 5)]],
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('air', 5), 0));
    s = applyAction(s, improvise('p1', card('sea', 6), 4));
    expect(locate(s, card('sea', 6))).not.toBeNull();
    s = applyAction(s, improvise('p0', card('land', 6), 1));
    expect(locate(s, card('land', 6))).toBeNull();
  });
});
