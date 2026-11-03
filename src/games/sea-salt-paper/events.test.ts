import { describe, it, expect } from 'vitest';
import { applyAction, scoringOptsFor, _internals } from './reducer';
import { createSspState } from './setup';
import { seatsFor } from './testSupport';
import { tentativeScore } from './scoring';
import { EVENT_BY_ID } from './events';
import type { SspCard, SspCardFamily, SspColor, SspEventId, SspState } from './types';

const card = (id: number, family: SspCardFamily, color: SspColor = 'yellow'): SspCard => ({ id, family, color });

/** A Pepper match with the round event pinned (null = no event this round). */
function pepper(players: number, current: SspEventId | null): SspState {
  const s = createSspState({ targetScore: 200, expansions: { extraSalt: true, extraPepper: true } }, 7, seatsFor(players));
  s.event!.current = current;
  return s;
}

const player = (s: SspState, id: string) => s.players.find((p) => p.id === id)!;
const held = (s: SspState) => s.players.map((p) => p.heldEvents ?? []);

/** Set match scores, then end the round with empty hands (0 points each). */
function endRoundAt(s: SspState, scores: number[]): SspState {
  s.players.forEach((p, i) => { p.matchScore = scores[i]; p.hand = []; p.table = []; });
  s.subPhase = 'awaitingPlayOrEnd';
  _internals.endRound(s, 'deckEmpty', s.activePlayerId);
  return s;
}

/** Start the next round with its event pinned. */
function nextRound(s: SspState, current: SspEventId | null): SspState {
  const t = applyAction(s, { type: 'nextRound' });
  t.event!.current = current;
  return t;
}

/** `id` takes a turn with `hand`, at the play-or-end step. */
function turnOf(s: SspState, id: string, hand: SspCard[]): SspState {
  player(s, id).hand = hand.map((c) => ({ ...c }));
  s.activePlayerId = id;
  s.subPhase = 'awaitingPlayOrEnd';
  return s;
}

const STOP_8 = [card(1, 'octopus'), card(2, 'octopus'), card(3, 'sailor'), card(4, 'sailor')]; // 3 + 5 = 8 pts

describe('Extra Pepper: which side each card goes to', () => {
  it('handicaps go to the leader, boosts to the player in last place', () => {
    const handicaps = (Object.values(EVENT_BY_ID)).filter((e) => e.sign === '+').map((e) => e.id).sort();
    expect(handicaps).toEqual(['diodonFish', 'kraken', 'tornado', 'treasureChest']);
  });
});

describe('Extra Pepper: awarding and holding events', () => {
  it("awards a '+' card to the player with the most points, a '-' card to the fewest", () => {
    expect(held(endRoundAt(pepper(3, 'tornado'), [10, 30, 20]))).toEqual([[], ['tornado'], []]);
    expect(held(endRoundAt(pepper(3, 'sunfish'), [10, 30, 20]))).toEqual([['sunfish'], [], []]);
  });

  it('discards the card when that place is tied', () => {
    const s = endRoundAt(pepper(3, 'tornado'), [30, 30, 10]);
    expect(held(s)).toEqual([[], [], []]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'eventDiscarded', eventId: 'tornado', reason: 'tie' });
    expect(held(endRoundAt(pepper(3, 'sunfish'), [30, 10, 10]))).toEqual([[], [], []]);
    expect(held(endRoundAt(pepper(2, 'sunfish'), [0, 0]))).toEqual([[], []]);
  });

  it('the round event applies to everyone during its round', () => {
    const s = pepper(2, 'diodonFish');
    expect(() => applyAction(turnOf(s, 'p0', STOP_8), { type: 'stop' })).toThrow(/Diodon/);
    expect(() => applyAction(turnOf(s, 'p1', STOP_8), { type: 'stop' })).toThrow(/Diodon/);
  });

  it('a held card applies to its holder in later rounds, and only to them', () => {
    let s = endRoundAt(pepper(2, 'treasureChest'), [30, 10]);
    s = nextRound(s, null);
    expect(() => applyAction(turnOf(s, 'p0', STOP_8), { type: 'stop' })).toThrow(/threshold/);
    expect(() => applyAction(turnOf(s, 'p1', STOP_8), { type: 'stop' })).not.toThrow();
  });

  it('the holder keeps it for as long as they stay alone in that place', () => {
    let s = nextRound(endRoundAt(pepper(2, 'tornado'), [30, 10]), null);
    s = nextRound(endRoundAt(s, [35, 12]), null);
    expect(player(s, 'p0').heldEvents).toEqual(['tornado']);
  });

  it('it is discarded once the holder loses that place — overtaken or tied', () => {
    let s = nextRound(endRoundAt(pepper(2, 'tornado'), [30, 10]), null);
    s = endRoundAt(s, [30, 40]);
    expect(player(s, 'p0').heldEvents).toEqual([]);
    expect(s.log.at(-1)).toMatchObject({ kind: 'eventDiscarded', eventId: 'tornado', playerId: 'p0', reason: 'lostPlace' });

    s = nextRound(endRoundAt(pepper(2, 'sunfish'), [30, 10]), null);
    expect(player(endRoundAt(s, [30, 30]), 'p1').heldEvents).toEqual([]);
  });

  it('winning a second card, the holder chooses which to keep', () => {
    let s = nextRound(endRoundAt(pepper(3, 'tornado'), [30, 10, 20]), 'diodonFish');
    s.activePlayerId = 'p2';
    s = endRoundAt(s, [35, 10, 20]);
    expect(s.subPhase).toBe('awaitingEventChoice');
    expect(s.activePlayerId).toBe('p0');
    expect(s.pendingEventChoice).toMatchObject({ playerId: 'p0', newEventId: 'diodonFish', oldEventId: 'tornado' });
    expect(() => applyAction(s, { type: 'nextRound' })).toThrow();
    expect(() => applyAction(s, { type: 'chooseEvent', keep: 'kraken' })).toThrow();

    const keptOld = applyAction(s, { type: 'chooseEvent', keep: 'tornado' });
    expect(held(keptOld)).toEqual([['tornado'], [], []]);
    expect(keptOld.log.at(-1)).toMatchObject({ kind: 'eventDiscarded', eventId: 'diodonFish', reason: 'choice' });
    expect(keptOld.subPhase).toBe('roundEnd');
    expect(keptOld.activePlayerId).toBe('p2');

    const keptNew = applyAction(s, { type: 'chooseEvent', keep: 'diodonFish' });
    expect(held(keptNew)).toEqual([['diodonFish'], [], []]);
    expect(applyAction(keptNew, { type: 'nextRound' }).round).toBe(3);
  });

  it('a holder who changed place has already lost the old card — no choice to make', () => {
    let s = nextRound(endRoundAt(pepper(2, 'sunfish'), [10, 30]), 'tornado');
    s = endRoundAt(s, [40, 30]);
    expect(s.subPhase).toBe('roundEnd');
    expect(held(s)).toEqual([['tornado'], []]);
  });

  it('awards nothing once the match is decided', () => {
    const s = pepper(2, 'tornado');
    s.config.targetScore = 40;
    const t = endRoundAt(s, [45, 10]);
    expect(t.subPhase).toBe('roundEnd');
    expect(held(t)).toEqual([[], []]);
  });

  it('logs the round-1 event reveal under round 1', () => {
    const s = createSspState({ targetScore: 40, expansions: { extraPepper: true } }, 7, seatsFor(2));
    expect(s.round).toBe(1);
    expect(s.log.find((e) => e.kind === 'eventReveal')?.round).toBe(1);
  });
});

describe('Extra Pepper: changed duo effects', () => {
  it('The Hermit Crab: look through each discard pile and take one card from each', () => {
    let s = pepper(2, 'hermitCrab');
    s.discards = [[card(50, 'shell'), card(51, 'penguin')], [card(52, 'sailor'), card(53, 'octopus')]];
    s = applyAction(turnOf(s, 'p0', [card(1, 'crab'), card(2, 'crab')]), { type: 'playPair', cardIds: [1, 2] });
    expect(s.subPhase).toBe('awaitingCrabPick');
    s = applyAction(s, { type: 'crabPick', pile: 1, cardId: 52 });
    expect(s.subPhase).toBe('awaitingCrabPick');
    expect(() => applyAction(s, { type: 'crabPick', pile: 1, cardId: 53 })).toThrow(/Hermit/);
    s = applyAction(s, { type: 'crabPick', pile: 0, cardId: 50 });
    expect(player(s, 'p0').hand.map((c) => c.id)).toEqual([52, 50]);
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
  });

  it('The Hermit Crab with one pile empty: one card', () => {
    let s = pepper(2, 'hermitCrab');
    s.discards = [[card(50, 'shell')], []];
    s = applyAction(turnOf(s, 'p0', [card(1, 'crab'), card(2, 'crab')]), { type: 'playPair', cardIds: [1, 2] });
    s = applyAction(s, { type: 'crabPick', pile: 0, cardId: 50 });
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
  });

  it('The Sunfish: a fish pair draws two cards, one log entry each', () => {
    const s = turnOf(pepper(2, 'sunfish'), 'p0', [card(1, 'fish'), card(2, 'fish')]);
    const before = s.log.length;
    const t = applyAction(s, { type: 'playPair', cardIds: [1, 2] });
    expect(player(t, 'p0').hand).toHaveLength(2);
    expect(t.log.slice(before).filter((e) => e.kind === 'fishDraw')).toHaveLength(2);
  });

  it('a plain fish pair draws one card and logs it once', () => {
    const s = turnOf(pepper(2, null), 'p0', [card(1, 'fish'), card(2, 'fish')]);
    const before = s.log.length;
    const t = applyAction(s, { type: 'playPair', cardIds: [1, 2] });
    expect(player(t, 'p0').hand).toHaveLength(1);
    expect(t.log.slice(before).filter((e) => e.kind === 'fishDraw')).toHaveLength(1);
  });

  it('The Water Rodeo: two swimmers or two sharks are duos only while it applies', () => {
    const swimmers = [card(1, 'swimmer'), card(2, 'swimmer')];
    expect(() => applyAction(turnOf(pepper(2, null), 'p0', swimmers), { type: 'playPair', cardIds: [1, 2] })).toThrow(/valid pair/);
    const s = pepper(2, 'waterRodeo');
    expect(() => applyAction(turnOf(s, 'p0', swimmers), { type: 'playPair', cardIds: [1, 2] })).not.toThrow();
    const sharks = [card(3, 'shark'), card(4, 'shark')];
    expect(() => applyAction(turnOf(s, 'p0', sharks), { type: 'playPair', cardIds: [3, 4] })).not.toThrow();
    // …and score 1 point a pair, in hand too.
    const opts = scoringOptsFor(s, player(s, 'p0'));
    expect([tentativeScore(swimmers, [], opts), tentativeScore(swimmers, [], {})]).toEqual([1, 0]);
    expect([tentativeScore(sharks, [], opts), tentativeScore(sharks, [], {})]).toEqual([1, 0]);
    const mixed = [...swimmers, card(5, 'swimmer'), card(3, 'shark')]; // 3 swimmers + 1 shark
    expect([tentativeScore(mixed, [], opts), tentativeScore(mixed, [], {})]).toEqual([2, 1]);
  });

  it('two swimmers: look at an opponent\'s hand, then swap one card each way', () => {
    let s = pepper(2, 'waterRodeo');
    player(s, 'p1').hand = [card(60, 'mermaid', 'white'), card(61, 'crab')];
    s = applyAction(turnOf(s, 'p0', [card(1, 'swimmer'), card(2, 'swimmer'), card(3, 'boat')]), { type: 'playPair', cardIds: [1, 2] });
    expect(s.subPhase).toBe('awaitingRodeoTarget');
    s = applyAction(s, { type: 'rodeoLook', targetPlayerId: 'p1' });
    expect(s.subPhase).toBe('awaitingRodeoSwap');
    expect(s.log.at(-1)).toMatchObject({ kind: 'rodeoLook', targetPlayerId: 'p1', hand: [{ id: 60 }, { id: 61 }] });

    const swapped = applyAction(s, { type: 'rodeoSwap', swap: [3, 60] });
    expect(player(swapped, 'p0').hand.map((c) => c.id)).toEqual([60]);
    expect(player(swapped, 'p1').hand.map((c) => c.id)).toEqual([3, 61]);
    expect(swapped.subPhase).toBe('awaitingPlayOrEnd');

    const kept = applyAction(s, { type: 'rodeoSwap', swap: null });
    expect(player(kept, 'p1').hand.map((c) => c.id)).toEqual([60, 61]);
  });

  it('two sharks: take a pair from in front of an opponent, its effect not triggered', () => {
    let s = pepper(2, 'waterRodeo');
    player(s, 'p1').table = [card(70, 'boat'), card(71, 'boat'), card(72, 'crab'), card(73, 'crab')];
    s = applyAction(turnOf(s, 'p0', [card(1, 'shark'), card(2, 'shark')]), { type: 'playPair', cardIds: [1, 2] });
    expect(s.subPhase).toBe('awaitingPairSteal');
    expect(() => applyAction(s, { type: 'stealPair', targetPlayerId: 'p1', cardIds: [71, 72] })).toThrow();
    s = applyAction(s, { type: 'stealPair', targetPlayerId: 'p1', cardIds: [72, 73] });
    expect(player(s, 'p0').table.map((c) => c.id)).toEqual([1, 2, 72, 73]);
    expect(player(s, 'p1').table.map((c) => c.id)).toEqual([70, 71]);
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
  });
});

describe('Extra Pepper: changed point values', () => {
  it('The Dance of the Shells / The Kraken: shells 2 pts each, octopuses 1 pt each', () => {
    const shells = pepper(2, 'danceOfShells');
    player(shells, 'p0').hand = [card(1, 'shell'), card(2, 'shell'), card(3, 'shell')];
    expect(_internals.scoreRound(shells, 'stop', 'p0').perPlayer[0].cardPoints).toBe(6);
    const kraken = pepper(2, 'kraken');
    player(kraken, 'p0').hand = [card(1, 'octopus'), card(2, 'octopus'), card(3, 'octopus')];
    expect(_internals.scoreRound(kraken, 'stop', 'p0').perPlayer[0].cardPoints).toBe(3);
  });

  it('The Tornado: mermaids score nothing; the LAST CHANCE colour bonus still counts', () => {
    const s = pepper(2, 'tornado');
    player(s, 'p0').hand = [
      card(1, 'shell', 'pink'), card(2, 'shell', 'pink'), card(3, 'sailor', 'pink'), card(4, 'sailor', 'pink'),
      card(5, 'mermaid', 'white'),
    ];
    const row = _internals.scoreRound(s, 'lastChance', 'p0').perPlayer[0];
    expect(row.cardPoints).toBe(2 + 5);
    expect(row.colorBonus).toBe(4);
    expect(row.total).toBe(11);
  });
});

describe('Extra Pepper: new rules', () => {
  it('The Dolphins: discarding a collector card draws the top of the deck', () => {
    const s = pepper(2, 'dolphins');
    const top = s.deck[s.deck.length - 1];
    s.subPhase = 'awaitingKeep';
    s.pendingDraw = [card(1, 'crab'), card(2, 'shell')];
    const t = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    expect(player(t, 'p0').hand.map((c) => c.id)).toEqual([1, top.id]);
    const u = applyAction({ ...s, pendingDraw: [card(1, 'shell'), card(2, 'crab')] }, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    expect(player(u, 'p0').hand.map((c) => c.id)).toEqual([1]);
  });

  function angelfishTurn(): SspState {
    const s = turnOf(pepper(2, 'angelfish'), 'p0', STOP_8);
    s.discards = [[card(50, 'shell', 'pink')], [card(51, 'crab', 'pink')]];
    return s;
  }

  it('The Angelfish: same-colour tops at the end of a turn — the player picks one', () => {
    let s = applyAction(angelfishTurn(), { type: 'pass' });
    expect(s.subPhase).toBe('awaitingAngelfishPick');
    expect(s.activePlayerId).toBe('p0');
    s = applyAction(s, { type: 'angelfishPick', pile: 1 });
    expect(player(s, 'p0').hand.map((c) => c.id)).toContain(51);
    expect(s.activePlayerId).toBe('p1');
    expect(s.subPhase).toBe('awaitingAction');
  });

  it('The Angelfish also fires after LAST CHANCE (play goes on), not after STOP', () => {
    let s = applyAction(angelfishTurn(), { type: 'lastChance' });
    expect(s.subPhase).toBe('awaitingAngelfishPick');
    s = applyAction(s, { type: 'angelfishPick', pile: 0 });
    expect(s.activePlayerId).toBe('p1');
    expect(s.lastChanceFrom).toBe('p0');
    expect(applyAction(angelfishTurn(), { type: 'stop' }).subPhase).toBe('roundEnd');
  });

  it('The Coral Reef: a shell face down scores nothing and makes its owner immune', () => {
    let s = pepper(2, 'coralReef');
    s = turnOf(s, 'p1', [card(1, 'shell'), card(2, 'shell'), card(3, 'crab')]);
    expect(() => applyAction(s, { type: 'placeCoralShell', cardId: 3 })).toThrow();
    s = applyAction(s, { type: 'placeCoralShell', cardId: 1 });
    expect(player(s, 'p1').coralShell?.id).toBe(1);
    expect(player(s, 'p1').hand.map((c) => c.id)).toEqual([2, 3]);
    expect(() => applyAction(s, { type: 'placeCoralShell', cardId: 2 })).toThrow(); // one per round
    expect(_internals.scoreRound(s, 'stop', 'p1').perPlayer[1].cardPoints).toBe(0);

    // Shark + swimmer: no one to steal from.
    const shark = applyAction(turnOf(s, 'p0', [card(4, 'shark'), card(5, 'swimmer')]), { type: 'playPair', cardIds: [4, 5] });
    expect(shark.subPhase).toBe('awaitingPlayOrEnd');
    // Jellyfish: not locked.
    const jelly = applyAction(turnOf(s, 'p0', [card(6, 'jellyfish'), card(7, 'swimmer')]), { type: 'playPair', cardIds: [6, 7] });
    expect(jelly.lockedPlayerIds).toEqual([]);
    // Water Rodeo too.
    s.event!.current = 'waterRodeo';
    const look = applyAction(turnOf(s, 'p0', [card(8, 'swimmer'), card(9, 'swimmer')]), { type: 'playPair', cardIds: [8, 9] });
    expect(look.subPhase).toBe('awaitingPlayOrEnd');
  });

  it('the Coral Reef shell is gone at the next round', () => {
    let s = turnOf(pepper(2, 'coralReef'), 'p0', [card(1, 'shell')]);
    s = applyAction(s, { type: 'placeCoralShell', cardId: 1 });
    s = nextRound(endRoundAt(s, [0, 5]), null);
    expect(player(s, 'p0').coralShell).toBeNull();
  });
});

describe('Extra Pepper: instant mermaid win from event draws', () => {
  const twoMermaids = () => [card(3, 'mermaid', 'white'), card(4, 'mermaid', 'white')];

  it('a fish-pair draw that completes the set wins on the spot', () => {
    const s = turnOf(pepper(2, 'danceOfMermaids'), 'p0', [card(1, 'fish'), card(2, 'fish'), ...twoMermaids()]);
    s.deck.push(card(5, 'mermaid', 'white'));
    const t = applyAction(s, { type: 'playPair', cardIds: [1, 2] });
    expect(t.phase).toBe('gameOver');
    expect(t.mermaidWinnerId).toBe('p0');
  });

  it('a Hermit Crab pick that completes the set wins on the spot', () => {
    let s = turnOf(pepper(2, 'hermitCrab'), 'p0', [card(1, 'crab'), card(2, 'crab'), ...twoMermaids()]);
    player(s, 'p0').heldEvents = ['danceOfMermaids'];
    s.discards = [[card(50, 'shell')], [card(51, 'mermaid', 'white')]];
    s = applyAction(s, { type: 'playPair', cardIds: [1, 2] });
    s = applyAction(s, { type: 'crabPick', pile: 1, cardId: 51 });
    expect(s.mermaidWinnerId).toBe('p0');
  });

  it('an Angelfish pick that completes the set wins on the spot', () => {
    let s = turnOf(pepper(2, 'angelfish'), 'p0', twoMermaids());
    player(s, 'p0').heldEvents = ['danceOfMermaids'];
    s.discards = [[card(50, 'mermaid', 'white')], [card(51, 'mermaid', 'white')]];
    s = applyAction(applyAction(s, { type: 'pass' }), { type: 'angelfishPick', pile: 0 });
    expect(s.phase).toBe('gameOver');
    expect(s.mermaidWinnerId).toBe('p0');
  });

  it('a Water Rodeo swap that completes the set wins on the spot', () => {
    let s = turnOf(pepper(2, 'waterRodeo'), 'p0', [card(1, 'swimmer'), card(2, 'swimmer'), card(5, 'crab'), ...twoMermaids()]);
    player(s, 'p0').heldEvents = ['danceOfMermaids'];
    player(s, 'p1').hand = [card(60, 'mermaid', 'white')];
    s = applyAction(s, { type: 'playPair', cardIds: [1, 2] });
    s = applyAction(s, { type: 'rodeoLook', targetPlayerId: 'p1' });
    s = applyAction(s, { type: 'rodeoSwap', swap: [5, 60] });
    expect(s.mermaidWinnerId).toBe('p0');
  });
});
