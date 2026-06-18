import { describe, it, expect } from 'vitest';
import { applyAction, canEndRound } from './reducer';
import { seaSaltPaperModule, attachSeatsAndStart } from './module';
import type { SspState, SspCard, SspCardFamily, SspColor } from './types';
import type { Seat } from '@/core/types';

function makeSeat(id: string, name: string, isAI = false): Seat {
  return { id, name, color: '#ccc', isAI, isLocal: true };
}

function card(id: number, family: SspCardFamily, color: SspColor = 'yellow'): SspCard {
  return { id, family, color };
}

function freshState(): SspState {
  const seats: Seat[] = [makeSeat('a', 'Alice'), makeSeat('b', 'Bob')];
  const s = seaSaltPaperModule.createInitialState({ targetScore: 40 }, 12345, seats);
  // attachSeatsAndStart is idempotently called inside createInitialState, but keep
  // an explicit call here so tests stay readable.
  if (s.players.length === 0) attachSeatsAndStart(s, seats);
  return s;
}

describe('match setup', () => {
  it('creates a deck of 56 cards (58 minus the 2 face-up discards)', () => {
    const s = freshState();
    expect(s.deck.length + s.discards[0].length + s.discards[1].length).toBe(58);
    expect(s.discards[0].length).toBe(1);
    expect(s.discards[1].length).toBe(1);
  });

  it('starts both players with empty hands', () => {
    const s = freshState();
    for (const p of s.players) expect(p.hand.length).toBe(0);
  });

  it('first player is the first seat', () => {
    const s = freshState();
    expect(s.activePlayerId).toBe('a');
    expect(s.subPhase).toBe('awaitingAction');
  });
});

describe('draw-pair flow', () => {
  it('drawPair then keepFromDraw moves one card to hand and one to chosen discard', () => {
    const s = freshState();
    const s1 = applyAction(s, { type: 'drawPair' });
    expect(s1.subPhase).toBe('awaitingKeep');
    expect(s1.pendingDraw.length).toBe(2);

    const s2 = applyAction(s1, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    expect(s2.subPhase).toBe('awaitingPlayOrEnd');
    expect(s2.pendingDraw.length).toBe(0);
    expect(s2.players[0].hand.length).toBe(1);
    expect(s2.players[0].hand[0].id).toBe(s1.pendingDraw[0].id);
    expect(s2.discards[0][s2.discards[0].length - 1].id).toBe(s1.pendingDraw[1].id);
  });

  it('drawFromDiscard top moves it to hand', () => {
    const s = freshState();
    const topId = s.discards[0][s.discards[0].length - 1].id;
    const s1 = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    expect(s1.subPhase).toBe('awaitingPlayOrEnd');
    expect(s1.players[0].hand[0].id).toBe(topId);
    expect(s1.discards[0].length).toBe(0);
  });

  it('throws on invalid sequence', () => {
    const s = freshState();
    expect(() => applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 })).toThrow();
    expect(() => applyAction(s, { type: 'playPair', cardIds: [1, 2] })).toThrow();
  });
});

describe('turn rotation', () => {
  it('passes seat to next player', () => {
    let s = freshState();
    s = applyAction(s, { type: 'drawPair' });
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    expect(s.activePlayerId).toBe('a');
    s = applyAction(s, { type: 'pass' });
    expect(s.activePlayerId).toBe('b');
    expect(s.subPhase).toBe('awaitingAction');
  });
});

describe('playPair effects', () => {
  function rigHand(s: SspState, playerId: string, hand: SspCard[]): void {
    const p = s.players.find((q) => q.id === playerId)!;
    p.hand = hand;
  }

  it('boat pair grants another turn', () => {
    let s = freshState();
    // Skip draw mechanism — fake a hand directly.
    rigHand(s, 'a', [card(100, 'boat'), card(101, 'boat')]);
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playPair', cardIds: [100, 101] });
    expect(s.activePlayerId).toBe('a');
    expect(s.subPhase).toBe('awaitingAction');
    expect(s.players[0].table.length).toBe(2);
  });

  it('fish pair gives a top-deck card', () => {
    let s = freshState();
    const topDeckId = s.deck[s.deck.length - 1].id;
    const p = s.players.find((q) => q.id === 'a')!;
    p.hand = [card(100, 'fish'), card(101, 'fish')];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playPair', cardIds: [100, 101] });
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
    // The "drawFromDiscard" added one card to the hand first; the fish then added another.
    expect(s.players[0].hand.some((c) => c.id === topDeckId)).toBe(true);
  });

  it('crab pair enters awaitingCrabPick', () => {
    let s = freshState();
    const p = s.players.find((q) => q.id === 'a')!;
    p.hand = [card(100, 'crab'), card(101, 'crab')];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playPair', cardIds: [100, 101] });
    expect(s.subPhase).toBe('awaitingCrabPick');
    const pickId = s.discards[1][0].id;
    s = applyAction(s, { type: 'crabPick', pile: 1, cardId: pickId });
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
    expect(s.players[0].hand.some((c) => c.id === pickId)).toBe(true);
  });

  it('shark+swimmer pair enables a steal', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    const b = s.players.find((q) => q.id === 'b')!;
    a.hand = [card(200, 'shark'), card(201, 'swimmer')];
    b.hand = [card(300, 'octopus')];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playPair', cardIds: [200, 201] });
    expect(s.subPhase).toBe('awaitingSharkSteal');
    s = applyAction(s, { type: 'sharkSteal', targetPlayerId: 'b' });
    expect(s.players.find((q) => q.id === 'b')!.hand.length).toBe(0);
    expect(s.players.find((q) => q.id === 'a')!.hand.some((c) => c.id === 300)).toBe(true);
  });

  it('rejects invalid pair', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [card(100, 'crab'), card(101, 'boat')];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    expect(() => applyAction(s, { type: 'playPair', cardIds: [100, 101] })).toThrow();
  });
});

describe('stop / lastChance / round end', () => {
  it('stop requires 7+ points', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [card(100, 'shell'), card(101, 'shell')]; // only 4 points
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    expect(() => applyAction(s, { type: 'stop' })).toThrow();
  });

  it('stop ends round and credits scores', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    // 4 shells = 6 pts; + 2 penguins = +3 → 9 total
    a.hand = [
      card(100, 'shell'), card(101, 'shell'), card(102, 'shell'),
      card(103, 'shell'),                                        // 4 shells = 6
      card(104, 'penguin'), card(105, 'penguin'),                // +3
    ];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'stop' });
    expect(s.subPhase).toBe('roundEnd');
    expect(s.lastRoundSummary).toBeTruthy();
    const row = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === 'a')!;
    expect(row.cardPoints).toBeGreaterThanOrEqual(7);
    // a's matchScore got credited
    expect(s.players.find((p) => p.id === 'a')!.matchScore).toBe(row.total);
  });

  it('lastChance: caller wins bet when they have higher card points', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    const b = s.players.find((q) => q.id === 'b')!;
    a.hand = [
      card(100, 'shell'), card(101, 'shell'), card(102, 'shell'),
      card(103, 'shell'), card(104, 'shell'),  // 5 shells = 8 pts
    ];
    b.hand = [card(200, 'crab')]; // 0 pts
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'lastChance' });
    // b takes one final turn — just pass through (use pile 1 to avoid contention).
    expect(s.activePlayerId).toBe('b');
    expect(s.subPhase).toBe('awaitingAction');
    s = applyAction(s, { type: 'drawFromDiscard', pile: 1 });
    s = applyAction(s, { type: 'pass' });
    expect(s.subPhase).toBe('roundEnd');
    expect(s.lastRoundSummary!.lastChanceWon).toBe(true);
    const aRow = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === 'a')!;
    const bRow = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === 'b')!;
    expect(aRow.forfeitCards).toBe(false);
    expect(bRow.forfeitCards).toBe(true);
  });

  it('lastChance: caller loses bet if outscored on cards', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    const b = s.players.find((q) => q.id === 'b')!;
    // a calls with just enough points
    a.hand = [
      card(100, 'shell'), card(101, 'shell'), card(102, 'shell'),
      card(103, 'shell'),  // 4 shells = 6 pts
      card(104, 'sailor'), card(105, 'sailor'),  // +5 = 11 cardpoints; total ≥7
    ];
    // b will outscore a after their last turn (already has 12+ pts)
    b.hand = [
      card(200, 'octopus'), card(201, 'octopus'), card(202, 'octopus'),
      card(203, 'octopus'), card(204, 'octopus'),  // 5 octopus = 12 pts
      card(205, 'shell'), card(206, 'shell'),      // 2 shells = +2 = 14
    ];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'lastChance' });
    s = applyAction(s, { type: 'drawFromDiscard', pile: 1 });
    s = applyAction(s, { type: 'pass' });
    expect(s.subPhase).toBe('roundEnd');
    expect(s.lastRoundSummary!.lastChanceWon).toBe(false);
    const aRow = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === 'a')!;
    const bRow = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === 'b')!;
    expect(aRow.forfeitCards).toBe(true);
    expect(bRow.forfeitCards).toBe(false);
  });
});

describe('mermaid instant win', () => {
  it('triggers when a player ends a turn holding 4 mermaids', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [
      card(900, 'mermaid', 'white'),
      card(901, 'mermaid', 'white'),
      card(902, 'mermaid', 'white'),
    ];
    // Place a mermaid on top of discard pile 0 and grab it.
    s.discards[0].push(card(903, 'mermaid', 'white'));
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    expect(s.phase).toBe('gameOver');
    expect(s.mermaidWinnerId).toBe('a');
  });
});

describe('canEndRound', () => {
  it('false when below threshold', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [card(100, 'crab'), card(101, 'crab')]; // 0 pts (in hand can't pair-score)
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    // hand-only pair counts toward cardPoints for the can-end check; 1pt < 7
    expect(canEndRound(s)).toBe(false);
  });

  it('true when ≥7', () => {
    let s = freshState();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [
      card(100, 'octopus'), card(101, 'octopus'), card(102, 'octopus'),  // 6
      card(103, 'sailor'), card(104, 'sailor'),                          // +5
    ];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    expect(canEndRound(s)).toBe(true);
  });
});

// ============================================================
// Extra Salt — expansion mechanics
// ============================================================

function freshStateWithSalt(): SspState {
  const seats: Seat[] = [makeSeat('a', 'Alice'), makeSeat('b', 'Bob')];
  const s = seaSaltPaperModule.createInitialState(
    { targetScore: 40, expansions: { extraSalt: true } },
    12345, seats,
  );
  if (s.players.length === 0) attachSeatsAndStart(s, seats);
  return s;
}

describe('Extra Salt: lobster + crab ability', () => {
  it('reveals 5 cards on play; subPhase becomes awaitingLobsterPick', () => {
    let s = freshStateWithSalt();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [card(700, 'lobster'), card(701, 'crab')];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playPair', cardIds: [700, 701] });
    expect(s.subPhase).toBe('awaitingLobsterPick');
    expect(s.pendingLobsterPick?.length).toBe(5);
  });

  it('lobsterPick: keeps one, reshuffles the others back into the deck', () => {
    let s = freshStateWithSalt();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [card(700, 'lobster'), card(701, 'crab')];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playPair', cardIds: [700, 701] });
    const beforeDeck = s.deck.length;
    const pickId = s.pendingLobsterPick![2].id;
    s = applyAction(s, { type: 'lobsterPick', cardId: pickId });
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
    expect(s.pendingLobsterPick?.length).toBe(0);
    expect(s.players.find((q) => q.id === 'a')!.hand.some((c) => c.id === pickId)).toBe(true);
    // 5 revealed - 1 kept = 4 returned to deck.
    expect(s.deck.length).toBe(beforeDeck + 4);
  });
});

describe('Extra Salt: jellyfish + swimmer ability', () => {
  it('locks the next player so they can only drawPair and pass', () => {
    let s = freshStateWithSalt();
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [card(800, 'jellyfish'), card(801, 'swimmer')];
    // a plays jellyfish+swimmer, then passes.
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playPair', cardIds: [800, 801] });
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
    expect(s.nextTurnLockedPlayerId).toBe('b');
    s = applyAction(s, { type: 'pass' });
    expect(s.activePlayerId).toBe('b');
    // b is locked: drawFromDiscard, playPair, playTrio, stop, lastChance all throw.
    expect(() => applyAction(s, { type: 'drawFromDiscard', pile: 0 })).toThrow();
    // b's only legal action is drawPair → keep → pass.
    s = applyAction(s, { type: 'drawPair' });
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    // Lock should clear when b's turn ends (advanceTurnAfterEndChoice).
    s = applyAction(s, { type: 'pass' });
    expect(s.nextTurnLockedPlayerId).toBeNull();
  });
});

describe('Extra Salt: starfish trio', () => {
  it('playTrio with 2 duo + starfish: trio recorded, ability skipped', () => {
    let s = freshStateWithSalt();
    const a = s.players.find((q) => q.id === 'a')!;
    // crab+crab+starfish — base ability would be crabPick (awaitingCrabPick); trio cancels it.
    a.hand = [card(600, 'crab'), card(601, 'crab'), card(602, 'starfish')];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'playTrio', cardIds: [600, 601, 602] });
    expect(s.subPhase).toBe('awaitingPlayOrEnd');
    expect(s.players.find((q) => q.id === 'a')!.trios?.length).toBe(1);
    expect(s.players.find((q) => q.id === 'a')!.table).toHaveLength(3);
  });
});

// ============================================================
// Extra Pepper — event-deck mechanics
// ============================================================

function freshStateWithPepper(): SspState {
  const seats: Seat[] = [makeSeat('a', 'Alice'), makeSeat('b', 'Bob')];
  const s = seaSaltPaperModule.createInitialState(
    { targetScore: 40, expansions: { extraPepper: true } },
    12345, seats,
  );
  if (s.players.length === 0) attachSeatsAndStart(s, seats);
  return s;
}

describe('Extra Pepper: event deck', () => {
  it('initial state has an event deck and a current event after setup', () => {
    const s = freshStateWithPepper();
    expect(s.event).not.toBeNull();
    expect(s.event!.deck.length).toBeGreaterThan(0);
    expect(s.event!.current).not.toBeNull();
  });

  it('Dance of the Mermaids reduces the holder\'s mermaid-win threshold to 3', () => {
    let s = freshStateWithPepper();
    const a = s.players.find((q) => q.id === 'a')!;
    a.heldEvents = ['danceOfMermaids'];
    a.hand = [
      card(900, 'mermaid', 'white'),
      card(901, 'mermaid', 'white'),
    ];
    s.discards[0].push(card(902, 'mermaid', 'white'));
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    expect(s.phase).toBe('gameOver');
    expect(s.mermaidWinnerId).toBe('a');
  });

  it('Treasure Chest raises the holder\'s STOP threshold to 10', () => {
    let s = freshStateWithPepper();
    // Disable the random round event so only the held one applies.
    if (s.event) s.event.current = null;
    const a = s.players.find((q) => q.id === 'a')!;
    a.heldEvents = ['treasureChest'];
    a.hand = [
      card(100, 'octopus'), card(101, 'octopus'),
      card(103, 'sailor'), card(104, 'sailor'),
    ];
    s.subPhase = 'awaitingPlayOrEnd';
    // Score = octopus(2)→3 + sailor(2)→5 = 8. Without Treasure Chest this >=7
    // would allow STOP; with Treasure Chest threshold is 10, so it must throw.
    expect(() => applyAction(s, { type: 'stop' })).toThrow();
  });

  it('Diodon Fish blocks the holder from calling STOP', () => {
    let s = freshStateWithPepper();
    if (s.event) s.event.current = null;
    const a = s.players.find((q) => q.id === 'a')!;
    a.heldEvents = ['diodonFish'];
    a.hand = [
      card(100, 'octopus'), card(101, 'octopus'), card(102, 'octopus'),
      card(103, 'sailor'), card(104, 'sailor'),
    ];
    s.subPhase = 'awaitingPlayOrEnd';
    expect(() => applyAction(s, { type: 'stop' })).toThrow();
  });

  it('Tornado zeroes mermaid color bonus at round end', () => {
    let s = freshStateWithPepper();
    if (s.event) s.event.current = 'tornado';
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [
      card(100, 'shell', 'yellow'), card(101, 'shell', 'yellow'),
      card(102, 'mermaid', 'white'), card(103, 'sailor'), card(104, 'sailor'),
    ];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'stop' });
    const aRow = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === 'a')!;
    expect(aRow.colorBonus).toBe(0);
  });

  it('Dance of the Shells scores 2 pts per shell (overriding the set)', () => {
    let s = freshStateWithPepper();
    if (s.event) s.event.current = 'danceOfShells';
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [
      card(100, 'shell'), card(101, 'shell'), card(102, 'shell'),
      card(103, 'sailor'), card(104, 'sailor'),
    ];
    s.subPhase = 'awaitingPlayOrEnd';
    // Force STOP path — score with Dance: 3 shells × 2 = 6, + sailor(2)→5 = 11.
    s = applyAction(s, { type: 'stop' });
    const aRow = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === 'a')!;
    expect(aRow.cardPoints).toBe(11);
  });
});

describe('match end', () => {
  it('declares gameOver when target reached', () => {
    let s = freshState();
    s.config.targetScore = 5;
    const a = s.players.find((q) => q.id === 'a')!;
    a.hand = [
      card(100, 'shell'), card(101, 'shell'), card(102, 'shell'), card(103, 'shell'),  // 4 shells = 6
      card(104, 'sailor'), card(105, 'sailor'),                                         // +5
    ];
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 });
    s = applyAction(s, { type: 'stop' });
    expect(s.subPhase).toBe('roundEnd');
    s = applyAction(s, { type: 'nextRound' });
    expect(s.phase).toBe('gameOver');
    expect(s.finalScores!['a']).toBeGreaterThanOrEqual(5);
  });
});
