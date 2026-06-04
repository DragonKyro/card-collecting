// Sea Salt & Paper reducer.
//
// Turn flow (per active player):
//   1. subPhase = 'awaitingAction'.
//      Either:
//        - drawPair  → moves top 2 of deck into pendingDraw, subPhase = awaitingKeep
//        - drawFromDiscard pile → adds top of pile to hand, subPhase = awaitingPlayOrEnd
//   2. (if awaitingKeep)
//      keepFromDraw {keepIndex, discardToPile} → keep one card, discard the other to
//      a chosen face-up pile. subPhase = awaitingPlayOrEnd.
//   3. subPhase = 'awaitingPlayOrEnd'.
//      Player may play any number of duo pairs:
//        - playPair: two cards from hand. Both move to table.
//          - boat: same player goes again (subPhase → awaitingAction).
//          - fish: top card of deck → hand.
//          - crab: subPhase → awaitingCrabPick, then crabPick chooses a discard card.
//          - shark+swimmer: subPhase → awaitingSharkSteal, then sharkSteal picks a target.
//      Then either stop/lastChance/pass to end the turn.
//
// Round-end paths:
//   - stop                → score immediately, set roundEnd, populate summary.
//   - lastChance          → every other live player gets one final turn, then score
//                           with bet logic.
//   - deck empties after a draw → round ends (no bonus).
//   - player has 4 mermaids on the table → instant match win.
//
// Score persistence: roundScore is added to matchScore at round-end. Match ends
// when any player's matchScore ≥ targetScore at the moment scoring finishes.

import type { PlayerId } from '@/core/types';
import { rngInt } from '@/core/rng';
import type {
  SspState, SspAction, SspCard, SspPlayer,
  SspRoundSummary, SspPlayerRoundScore,
} from './types';
import { buildShuffledDeck, duoPartner, isMultiplierFamily } from './cards';
import {
  allCards, cardPoints, isValidDuoPair, mermaidColorBonus, tentativeScore,
} from './scoring';

const STOP_THRESHOLD = 7;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function nextSeatId(state: SspState, fromId: PlayerId): PlayerId {
  const idx = state.players.findIndex((p) => p.id === fromId);
  if (idx === -1) return state.players[0].id;
  return state.players[(idx + 1) % state.players.length].id;
}

function playerById(state: SspState, id: PlayerId): SspPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

function requireActivePlayer(state: SspState): SspPlayer {
  if (!state.activePlayerId) throw new Error('no active player');
  return playerById(state, state.activePlayerId);
}

function popDeck(state: SspState): SspCard | null {
  return state.deck.pop() ?? null;
}

/** Count mermaids on a player's table; if 4 → instant win. */
function checkMermaidWin(state: SspState): PlayerId | null {
  for (const p of state.players) {
    const mermaids = p.table.filter((c) => c.family === 'mermaid').length
      + p.hand.filter((c) => c.family === 'mermaid').length;
    if (mermaids >= 4) return p.id;
  }
  return null;
}

function scoreRound(state: SspState, summaryKind: SspRoundSummary['endedBy'], endedBy: PlayerId | null): SspRoundSummary {
  let lastChanceWon: boolean | null = null;

  // Compute baseline scores
  const baseScores = state.players.map((p) => {
    const cards = allCards(p.hand, p.table);
    const cp = cardPoints(cards);
    const cb = mermaidColorBonus(cards);
    return { p, cardPoints: cp, colorBonus: cb };
  });

  let forfeitCallerId: PlayerId | null = null;
  if (summaryKind === 'lastChance' && endedBy) {
    const caller = baseScores.find((s) => s.p.id === endedBy)!;
    const others = baseScores.filter((s) => s.p.id !== endedBy);
    const callerCardTotal = caller.cardPoints;
    const opponentMaxCardTotal = others.length
      ? Math.max(...others.map((s) => s.cardPoints))
      : 0;
    if (callerCardTotal >= opponentMaxCardTotal) {
      // Bet won: caller gets cards + bonus, opponents only get color bonus.
      lastChanceWon = true;
      forfeitCallerId = null;
      // we'll mark opponents as cards-forfeit below
    } else {
      // Bet lost: caller forfeits cards (color bonus only). Opponents score normally.
      lastChanceWon = false;
      forfeitCallerId = endedBy;
    }
  }

  const perPlayer: SspPlayerRoundScore[] = baseScores.map(({ p, cardPoints: cp, colorBonus: cb }) => {
    let forfeitCards = false;
    let total: number;
    if (summaryKind === 'lastChance' && endedBy) {
      if (lastChanceWon) {
        if (p.id === endedBy) {
          total = cp + cb;
        } else {
          forfeitCards = true;
          total = cb;
        }
      } else {
        if (p.id === forfeitCallerId) {
          forfeitCards = true;
          total = cb;
        } else {
          total = cp + cb;
        }
      }
    } else {
      total = cp + cb;
    }
    return {
      playerId: p.id,
      cardPoints: cp,
      colorBonus: cb,
      total,
      forfeitCards,
    };
  });

  return {
    round: state.round,
    endedBy: summaryKind,
    endedByPlayerId: endedBy,
    lastChanceWon,
    perPlayer,
  };
}

function commitRoundScores(state: SspState, summary: SspRoundSummary): void {
  for (const row of summary.perPlayer) {
    const p = playerById(state, row.playerId);
    p.roundScore = row.total;
    p.matchScore += row.total;
  }
}

function endRound(state: SspState, endedBy: SspRoundSummary['endedBy'], endedByPlayerId: PlayerId | null): void {
  const summary = scoreRound(state, endedBy, endedByPlayerId);
  commitRoundScores(state, summary);
  state.lastRoundSummary = summary;
  state.subPhase = 'roundEnd';
  state.lastChanceFrom = null;
  state.lastChanceRemaining = [];
}

function startNewRound(state: SspState): void {
  state.round += 1;
  state.deck = buildShuffledDeck(state.rngState);
  // Flip 2 to make new discard piles, hands cleared.
  state.discards = [[], []];
  const top1 = state.deck.pop();
  const top2 = state.deck.pop();
  if (top1) state.discards[0].push(top1);
  if (top2) state.discards[1].push(top2);
  state.pendingDraw = [];
  state.lastRoundSummary = null;
  state.lastChanceFrom = null;
  state.lastChanceRemaining = [];
  state.subPhase = 'awaitingAction';
  for (const p of state.players) {
    p.hand = [];
    p.table = [];
    p.roundScore = 0;
  }
  // First player rotates round to round.
  const lastStarter = state.activePlayerId ?? state.players[0].id;
  state.activePlayerId = nextSeatId(state, lastStarter);
}

function gameOverIfReached(state: SspState): void {
  const winner = state.players.find((p) => p.matchScore >= state.config.targetScore);
  if (!winner) return;
  state.phase = 'gameOver';
  state.subPhase = 'gameOver';
  state.finalScores = {};
  for (const p of state.players) state.finalScores[p.id] = p.matchScore;
}

function advanceTurnAfterEndChoice(state: SspState): void {
  // Either continue rotation, or progress the lastChance counter.
  if (state.lastChanceFrom) {
    // Pop the next remaining player; if empty, score the round.
    while (state.lastChanceRemaining.length) {
      const next = state.lastChanceRemaining.shift()!;
      // Skip the caller if it somehow appears.
      if (next === state.lastChanceFrom) continue;
      state.activePlayerId = next;
      state.subPhase = 'awaitingAction';
      return;
    }
    // No one left → score with lastChance semantics.
    endRound(state, 'lastChance', state.lastChanceFrom);
    return;
  }

  // Normal rotation.
  if (!state.activePlayerId) throw new Error('no active player');
  state.activePlayerId = nextSeatId(state, state.activePlayerId);
  state.subPhase = 'awaitingAction';
}

function applyDuoEffect(state: SspState, p: SspPlayer, family: 'crab' | 'boat' | 'fish' | 'shark' | 'swimmer', other: 'crab' | 'boat' | 'fish' | 'shark' | 'swimmer'): void {
  // Family is one of the two in the played pair; we react to the pair as a unit.
  if (family === 'boat' || other === 'boat') {
    // Take another turn after the pair sequence resolves: jump back to awaitingAction.
    state.subPhase = 'awaitingAction';
    return;
  }
  if (family === 'fish' || other === 'fish') {
    const c = popDeck(state);
    if (c) p.hand.push(c);
    state.subPhase = 'awaitingPlayOrEnd';
    return;
  }
  if (family === 'crab' || other === 'crab') {
    state.subPhase = 'awaitingCrabPick';
    return;
  }
  // shark + swimmer
  if (otherPlayersHaveCards(state, p.id)) {
    state.subPhase = 'awaitingSharkSteal';
  } else {
    state.subPhase = 'awaitingPlayOrEnd';
  }
}

function otherPlayersHaveCards(state: SspState, exceptId: PlayerId): boolean {
  return state.players.some((q) => q.id !== exceptId && q.hand.length > 0);
}

export function applyAction(state: SspState, action: SspAction): SspState {
  if (state.phase === 'gameOver') return state;

  const s = clone(state);

  switch (action.type) {
    case 'drawPair': {
      if (s.subPhase !== 'awaitingAction') throw new Error('drawPair: wrong subPhase');
      const a = popDeck(s);
      const b = popDeck(s);
      if (!a || !b) {
        // Not enough cards to draw two → end round w/o scoring penalty.
        if (a) s.deck.push(a); // restore so deck pile is intact
        endRound(s, 'deckEmpty', s.activePlayerId);
        return s;
      }
      s.pendingDraw = [a, b];
      s.subPhase = 'awaitingKeep';
      return s;
    }

    case 'keepFromDraw': {
      if (s.subPhase !== 'awaitingKeep') throw new Error('keepFromDraw: wrong subPhase');
      if (s.pendingDraw.length !== 2) throw new Error('keepFromDraw: no pending draw');
      const p = requireActivePlayer(s);
      const keep = s.pendingDraw[action.keepIndex];
      const discard = s.pendingDraw[action.keepIndex === 0 ? 1 : 0];
      p.hand.push(keep);
      s.discards[action.discardToPile].push(discard);
      s.pendingDraw = [];

      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        s.phase = 'gameOver';
        s.subPhase = 'gameOver';
        s.finalScores = {};
        for (const player of s.players) s.finalScores[player.id] = player.matchScore;
        return s;
      }

      // Deck-empty special case: if deck is empty at end-of-turn we'll trigger
      // round-end when player passes. Otherwise just go to play/end.
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'drawFromDiscard': {
      if (s.subPhase !== 'awaitingAction') throw new Error('drawFromDiscard: wrong subPhase');
      const pile = s.discards[action.pile];
      if (pile.length === 0) throw new Error('drawFromDiscard: pile empty');
      const c = pile.pop()!;
      const p = requireActivePlayer(s);
      p.hand.push(c);
      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        s.phase = 'gameOver';
        s.subPhase = 'gameOver';
        s.finalScores = {};
        for (const player of s.players) s.finalScores[player.id] = player.matchScore;
        return s;
      }
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'playPair': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('playPair: wrong subPhase');
      const p = requireActivePlayer(s);
      const [idA, idB] = action.cardIds;
      const a = p.hand.find((c) => c.id === idA);
      const b = p.hand.find((c) => c.id === idB);
      if (!a || !b) throw new Error('playPair: card not in hand');
      if (!isValidDuoPair(a, b)) throw new Error('playPair: not a valid pair');
      p.hand = p.hand.filter((c) => c.id !== idA && c.id !== idB);
      p.table.push(a, b);
      const partner = duoPartner(a.family)!;
      applyDuoEffect(
        s, p,
        a.family as 'crab' | 'boat' | 'fish' | 'shark' | 'swimmer',
        partner as 'crab' | 'boat' | 'fish' | 'shark' | 'swimmer',
      );
      return s;
    }

    case 'crabPick': {
      if (s.subPhase !== 'awaitingCrabPick') throw new Error('crabPick: wrong subPhase');
      const pile = s.discards[action.pile];
      const idx = pile.findIndex((c) => c.id === action.cardId);
      if (idx === -1) throw new Error('crabPick: card not in pile');
      const card = pile.splice(idx, 1)[0];
      const p = requireActivePlayer(s);
      p.hand.push(card);
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'sharkSteal': {
      if (s.subPhase !== 'awaitingSharkSteal') throw new Error('sharkSteal: wrong subPhase');
      const target = playerById(s, action.targetPlayerId);
      if (target.id === s.activePlayerId) throw new Error('sharkSteal: cannot target self');
      if (target.hand.length === 0) throw new Error('sharkSteal: target has empty hand');
      // Random steal per rulebook.
      const idx = rngInt(s.rngState, target.hand.length);
      const stolen = target.hand.splice(idx, 1)[0];
      const p = requireActivePlayer(s);
      p.hand.push(stolen);

      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        s.phase = 'gameOver';
        s.subPhase = 'gameOver';
        s.finalScores = {};
        for (const player of s.players) s.finalScores[player.id] = player.matchScore;
        return s;
      }
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'stop': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('stop: wrong subPhase');
      const p = requireActivePlayer(s);
      const score = tentativeScore(p.hand, p.table);
      if (score < STOP_THRESHOLD) throw new Error('stop: below 7-point threshold');
      endRound(s, 'stop', p.id);
      return s;
    }

    case 'lastChance': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('lastChance: wrong subPhase');
      const p = requireActivePlayer(s);
      const score = tentativeScore(p.hand, p.table);
      if (score < STOP_THRESHOLD) throw new Error('lastChance: below 7-point threshold');
      s.lastChanceFrom = p.id;
      // Build queue of remaining players (everyone else, in seat order starting next).
      const idx = s.players.findIndex((x) => x.id === p.id);
      s.lastChanceRemaining = [];
      for (let i = 1; i < s.players.length; i++) {
        s.lastChanceRemaining.push(s.players[(idx + i) % s.players.length].id);
      }
      advanceTurnAfterEndChoice(s);
      return s;
    }

    case 'pass': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('pass: wrong subPhase');
      // If the deck is empty after the player's turn, end the round (no scoring penalty).
      if (s.deck.length === 0 && s.pendingDraw.length === 0 && s.lastChanceFrom === null) {
        endRound(s, 'deckEmpty', s.activePlayerId);
        return s;
      }
      advanceTurnAfterEndChoice(s);
      return s;
    }

    case 'nextRound': {
      if (s.subPhase !== 'roundEnd') throw new Error('nextRound: wrong subPhase');
      // Match end check first.
      if (s.players.some((p) => p.matchScore >= s.config.targetScore)) {
        gameOverIfReached(s);
        return s;
      }
      startNewRound(s);
      return s;
    }
  }
}

/** Used at game-start to set up the opening hand. Mutates passed state. */
export function setupNewMatch(state: SspState): void {
  startNewRound(state);
  // startNewRound increments round to 2 on top of round 1 setup; reset to 1.
  state.round = 1;
  // Active player should be the first seat at match start.
  state.activePlayerId = state.players[0]?.id ?? null;
}

/** Returns true if the active player has reached the 7+ stop threshold. */
export function canEndRound(state: SspState): boolean {
  if (!state.activePlayerId) return false;
  if (state.subPhase !== 'awaitingPlayOrEnd') return false;
  if (state.lastChanceFrom) return false; // lastChance window — opponents can't re-trigger
  const p = playerById(state, state.activePlayerId);
  return tentativeScore(p.hand, p.table) >= STOP_THRESHOLD;
}

/** Exposed for tests + AI heuristics. */
export const _internals = {
  STOP_THRESHOLD,
  scoreRound,
  startNewRound,
  endRound,
  isMultiplierFamily,
};
