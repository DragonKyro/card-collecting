import { describe, it, expect } from 'vitest';
import type { AlsAction, AlsAnswer, AlsState } from './types';
import { applyAction } from './reducer';
import { locate, theaterStrength } from './rules';
import { arrange, card, newMatch, play } from './testSupport';

const deploy = (playerId: string, cardId: number, theaterIdx: number): AlsAction => ({ type: 'deploy', playerId, cardId, theaterIdx });
const improvise = (playerId: string, cardId: number, theaterIdx: number): AlsAction => ({ type: 'improvise', playerId, cardId, theaterIdx });
const answer = (playerId: string, a: AlsAnswer): AlsAction => ({ type: 'answer', playerId, answer: a });
const pick = (playerId: string, cardId: number) => answer(playerId, { kind: 'card', cardId });
const skip = (playerId: string) => answer(playerId, { kind: 'skip' });
const faceDown = (s: AlsState, id: number) => locate(s, id)!.placed.faceDown;

// Theaters are [air, land, sea] (index 0, 1, 2) unless a test says otherwise.

describe('setup and battle flow', () => {
  it('deals 6 each, leaves 6 in the deck, and the 1st player starts', () => {
    const s = newMatch({}, 4);
    expect(s.players.map((p) => p.hand.length)).toEqual([6, 6]);
    expect(s.deck).toHaveLength(6);
    expect(s.activePlayerId).toBe(s.players[s.firstPlayerSeatIdx].id);
    expect(s.turnSeatIdx).toBe(s.firstPlayerSeatIdx);
  });

  it('draws the 1st player and (by default) the theater order from the seed', () => {
    const firsts = new Set<number>();
    const orders = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = newMatch({ randomOrder: true }, seed);
      firsts.add(s.firstPlayerSeatIdx);
      orders.add(s.theaters.join());
    }
    expect(firsts.size).toBe(2);
    expect(orders.size).toBeGreaterThan(2);
  });

  it('rejects face-up plays to a non-matching theater and plays out of turn', () => {
    const s = arrange(newMatch(), { hands: [[card('sea', 6)], [card('air', 6)]], turn: 0 });
    expect(() => applyAction(s, deploy('p0', card('sea', 6), 0))).toThrow();
    expect(() => applyAction(s, deploy('p1', card('air', 6), 0))).toThrow();
  });

  it('ends the battle when both hands are empty; the most theaters wins 6 VP', () => {
    let s = arrange(newMatch(), { hands: [[card('air', 6)], [card('land', 6)]], first: 0 });
    s = play(s, deploy('p0', card('air', 6), 0), deploy('p1', card('land', 6), 1));
    // Air to seat 0, Land to seat 1, the empty Sea theater to the 1st player.
    expect(s.subPhase).toBe('battleEnd');
    expect(s.lastBattleResult).toMatchObject({ winnerSeatIdx: 0, vpAwarded: 6, endedBy: 'fullPlay', theaterControl: [0, 1, 0] });
    expect(s.players[0].vp).toBe(6);
  });

  it('scores a withdrawal off the withdrawer’s chart', () => {
    const s = arrange(newMatch(), { hands: [[card('air', 6), card('air', 5)], [card('land', 6), card('sea', 6), card('sea', 5)]], first: 0, turn: 1 });
    const after = applyAction(s, { type: 'withdraw', playerId: 'p1' });
    // 2nd player with 3 cards → 3 VP.
    expect(after.lastBattleResult).toMatchObject({ winnerSeatIdx: 0, vpAwarded: 3, endedBy: 'withdraw', cardsLeft: 3 });
  });

  it('rotates the theaters (rightmost to the left) and swaps the 1st player between battles', () => {
    let s = arrange(newMatch(), { hands: [[], [card('land', 6)]], first: 0, turn: 1 });
    s = applyAction(s, { type: 'withdraw', playerId: 'p1' });
    const first = s.firstPlayerSeatIdx;
    s = applyAction(s, { type: 'continueBattle' });
    expect(s.theaters).toEqual(['sea', 'air', 'land']);
    expect(s.firstPlayerSeatIdx).toBe(first === 0 ? 1 : 0);
    expect(s.battleNumber).toBe(2);
    expect(s.players.map((p) => p.hand.length)).toEqual([6, 6]);
  });

  it('ends the match when the battle winner reaches the target', () => {
    let s = arrange(newMatch({ targetVp: 12 }), { hands: [[card('air', 6)], [card('land', 6)]], first: 0, turn: 1 });
    s.players[0].vp = 10;
    // The 2nd player withdraws with 1 card: 6 VP.
    s = applyAction(s, { type: 'withdraw', playerId: 'p1' });
    expect(s.phase).toBe('gameOver');
    expect(s.finalScores).toEqual({ p0: 16, p1: 0 });
    expect(s.activePlayerId).toBeNull();
  });

  it('skips a player with no cards left while the other still has some', () => {
    let s = arrange(newMatch(), { hands: [[card('air', 6)], [card('land', 6), card('land', 5)]], first: 0 });
    s = play(s, deploy('p0', card('air', 6), 0), deploy('p1', card('land', 6), 1));
    expect(s.activePlayerId).toBe('p1');
    expect(s.log.some((e) => e.kind === 'pass' && e.seat === 0)).toBe(true);
  });

  it('scores 1 VP per battle in Beginner Mode', () => {
    let s = arrange(newMatch({ beginner: true, targetVp: 3 }), { hands: [[card('air', 6)], [card('land', 6)]], first: 0 });
    s = play(s, deploy('p0', card('air', 6), 0), deploy('p1', card('land', 6), 1));
    expect(s.lastBattleResult?.vpAwarded).toBe(1);
  });
});

describe('Air abilities', () => {
  it('Air Drop: the next card played may go anywhere, once', () => {
    let s = arrange(newMatch(), {
      hands: [[card('air', 2), card('sea', 6), card('sea', 5)], [card('land', 6), card('land', 5)]], turn: 0,
    });
    s = play(s, deploy('p0', card('air', 2), 0), deploy('p1', card('land', 6), 1));
    expect(s.players[0].airDrop).toBe(true);
    s = applyAction(s, deploy('p0', card('sea', 6), 0));
    expect(s.players[0].airDrop).toBe(false);
    s = applyAction(s, deploy('p1', card('land', 5), 1));
    expect(() => applyAction(s, deploy('p0', card('sea', 5), 0))).toThrow();
  });

  it('Maneuver flips an uncovered card in an adjacent theater; a card flipped face up uses its ability', () => {
    let s = arrange(newMatch(), {
      hands: [[card('land', 3), card('air', 6)], [card('sea', 6)]],
      board: { 0: [[], [[card('air', 5), 'u'], [card('land', 2), 'd']]], 2: [[[card('sea', 1), 'u']], []] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('land', 3), 1));
    expect(s.pending).toMatchObject({ seat: 0, prompt: 'flip' });
    // Air 5 is covered; the uncovered cards next to Land are the face-down Ambush and Transport.
    expect(s.pending!.cards!.sort()).toEqual([card('sea', 1), card('land', 2)].sort());
    s = applyAction(s, pick('p0', card('land', 2)));
    // Ambush is face up now and its owner (p1) resolves it.
    expect(faceDown(s, card('land', 2))).toBe(false);
    expect(s.pending).toMatchObject({ seat: 1, prompt: 'flip', ability: 'ambush' });
    expect(s.activePlayerId).toBe('p1');
    s = applyAction(s, pick('p1', card('land', 3)));
    expect(faceDown(s, card('land', 3))).toBe(true);
    expect(s.subPhase).toBe('action');
    expect(s.activePlayerId).toBe('p1');
  });

  it('Containment destroys face-down plays, both players’, to the bottom of the deck', () => {
    let s = arrange(newMatch(), {
      hands: [[card('air', 5), card('land', 6)], [card('sea', 6), card('sea', 4)]], turn: 0,
    });
    s = play(s, deploy('p0', card('air', 5), 0), improvise('p1', card('sea', 4), 1));
    expect(locate(s, card('sea', 4))).toBeNull();
    expect(s.deck[0]).toBe(card('sea', 4));
    s = applyAction(s, improvise('p0', card('land', 6), 2));
    expect(s.deck[0]).toBe(card('land', 6));
    expect(s.log.filter((e) => e.kind === 'destroy' && e.reason === 'containment')).toHaveLength(2);
  });
});

describe('Land abilities', () => {
  it('Reinforce draws the top card and plays it face down to an adjacent theater', () => {
    let s = arrange(newMatch(), { hands: [[card('land', 1)], [card('air', 6)]], deckTop: [card('sea', 6)], turn: 0 });
    s = applyAction(s, deploy('p0', card('land', 1), 1));
    expect(s.pending).toMatchObject({ prompt: 'reinforce', drawnCardId: card('sea', 6), theaters: [0, 2] });
    expect(() => applyAction(s, answer('p0', { kind: 'theater', theaterIdx: 1 }))).toThrow();
    s = applyAction(s, answer('p0', { kind: 'theater', theaterIdx: 0 }));
    expect(locate(s, card('sea', 6))).toMatchObject({ theaterIdx: 0, side: 0 });
    expect(faceDown(s, card('sea', 6))).toBe(true);
    expect(s.activePlayerId).toBe('p1');
  });

  it('Disrupt: you flip one of yours, then your opponent flips one of theirs; triggered abilities wait', () => {
    let s = arrange(newMatch(), {
      hands: [[card('land', 5), card('air', 6)], [card('sea', 6)]],
      board: { 0: [[[card('land', 2), 'd']], []], 2: [[], [[card('sea', 3), 'd']]] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('land', 5), 1));
    expect(s.pending).toMatchObject({ seat: 0, prompt: 'flip' });
    expect(s.pending!.cards!.sort()).toEqual([card('land', 2), card('land', 5)].sort());
    s = applyAction(s, pick('p0', card('land', 2)));      // own Ambush up (queued)
    expect(s.pending).toMatchObject({ seat: 1, prompt: 'flip', cards: [card('sea', 3)] });
    s = applyAction(s, pick('p1', card('sea', 3)));       // their Maneuver up (queued)
    // Ambush resolves first: flip their Maneuver back down — it never starts.
    expect(s.pending).toMatchObject({ seat: 0, ability: 'ambush' });
    s = applyAction(s, pick('p0', card('sea', 3)));
    expect(faceDown(s, card('sea', 3))).toBe(true);
    expect(s.pending).toBeNull();
    expect(s.log.some((e) => e.kind === 'ability' && e.ability === 'maneuver')).toBe(false);
    expect(s.activePlayerId).toBe('p1');
  });

  it('an instant that has begun resolves fully even if its card is flipped face down', () => {
    let s = arrange(newMatch(), {
      hands: [[card('land', 5), card('air', 6)], [card('sea', 6)]],
      board: { 2: [[], [[card('sea', 5), 'u']]] },
      turn: 0,
    });
    s = play(s, deploy('p0', card('land', 5), 1), pick('p0', card('land', 5)));
    expect(faceDown(s, card('land', 5))).toBe(true);
    expect(s.pending).toMatchObject({ seat: 1, cards: [card('sea', 5)] });
  });

  it('Cover Fire makes the cards it covers strength 4', () => {
    let s = arrange(newMatch(), {
      hands: [[card('land', 4)], [card('air', 6)]],
      board: { 1: [[[card('land', 6), 'u'], [card('land', 2), 'd']], []] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('land', 4), 1));
    expect(theaterStrength(s, 1, 0)).toBe(12);
  });
});

describe('Sea abilities', () => {
  it('Transport may move any of your cards, covered ones too — moving is not playing', () => {
    let s = arrange(newMatch(), {
      hands: [[card('sea', 1)], [card('land', 6)]],
      board: {
        0: [[[card('air', 6), 'u'], [card('air', 2), 'd']], [[card('air', 3), 'u'], [card('air', 4), 'u']]],
        1: [[], [[card('sea', 5), 'u']]],
      },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('sea', 1), 2));
    expect(s.pending).toMatchObject({ prompt: 'transport', optional: true });
    // Air 6 is covered; theater 0 holds 4 cards and is next to Blockade, but a move isn't a play.
    s = applyAction(s, answer('p0', { kind: 'move', cardId: card('air', 6), theaterIdx: 1 }));
    expect(locate(s, card('air', 6))).toMatchObject({ theaterIdx: 1, uncovered: true });
    expect(s.activePlayerId).toBe('p1');
  });

  it('Transport can be declined', () => {
    let s = arrange(newMatch(), { hands: [[card('sea', 1)], [card('air', 6)]], turn: 0 });
    s = play(s, deploy('p0', card('sea', 1), 2), skip('p0'));
    expect(s.activePlayerId).toBe('p1');
  });

  it('Escalation makes its owner’s face-down cards 4', () => {
    let s = arrange(newMatch(), {
      hands: [[card('sea', 2)], [card('air', 6)]],
      board: { 0: [[[card('land', 6), 'd']], [[card('land', 5), 'd']]] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('sea', 2), 2));
    expect(theaterStrength(s, 0, 0)).toBe(4);
    expect(theaterStrength(s, 0, 1)).toBe(2);
  });

  it('Redeploy returns a face-down card (covered or not); then you must play a card', () => {
    let s = arrange(newMatch(), {
      hands: [[card('sea', 4), card('air', 6)], [card('land', 6)]],
      board: { 0: [[[card('land', 2), 'd'], [card('air', 5), 'u']], []] },
      turn: 0,
    });
    s = applyAction(s, deploy('p0', card('sea', 4), 2));
    expect(s.pending).toMatchObject({ prompt: 'redeployPick', cards: [card('land', 2)], optional: true });
    s = applyAction(s, pick('p0', card('land', 2)));
    expect(s.players[0].hand.sort()).toEqual([card('air', 6), card('land', 2)].sort());
    expect(s.pending).toMatchObject({ prompt: 'redeployPlay', optional: false });
    expect(() => applyAction(s, skip('p0'))).toThrow();
    // Playing Ambush face up uses its ability.
    s = applyAction(s, answer('p0', { kind: 'play', cardId: card('land', 2), theaterIdx: 1, faceDown: false }));
    expect(s.pending).toMatchObject({ ability: 'ambush', seat: 0 });
  });

  it('Blockade destroys a card played next to it into a theater with 3+ cards — either player’s', () => {
    const base = arrange(newMatch(), {
      hands: [[card('land', 6), card('air', 6)], [card('land', 4), card('air', 1)]],
      board: {
        1: [[[card('land', 1), 'u'], [card('land', 2), 'u']], [[card('land', 3), 'u']]],
        2: [[], [[card('sea', 5), 'u']]],
      },
      turn: 0,
    });
    let s = applyAction(base, deploy('p0', card('land', 6), 1));
    expect(locate(s, card('land', 6))).toBeNull();
    expect(s.deck[0]).toBe(card('land', 6));
    // Its own controller is caught too — and the destroyed card's ability never fires.
    s = applyAction(s, deploy('p1', card('land', 4), 1));
    expect(locate(s, card('land', 4))).toBeNull();
    // Air isn't adjacent to Sea: no Blockade there.
    s = applyAction(s, deploy('p0', card('air', 6), 0));
    expect(locate(s, card('air', 6))).not.toBeNull();
  });
});
