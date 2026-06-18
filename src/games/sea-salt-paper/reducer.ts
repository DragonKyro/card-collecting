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
import { rngInt, shuffle } from '@/core/rng';
import type {
  SspState, SspAction, SspCard, SspPlayer, SspEventId,
  SspRoundSummary, SspPlayerRoundScore, SspLogEntry,
} from './types';
import { buildShuffledDeck, isMultiplierFamily, isCollectorFamily } from './cards';
import {
  allCards, isValidDuoPair, isValidStarfishTrio, tentativeScore, totalScore,
} from './scoring';
import {
  EVENT_BY_ID, currentEvent, eventAppliesTo,
} from './events';

const STOP_THRESHOLD = 7;
const STOP_THRESHOLD_TREASURE = 10;  // when Treasure Chest applies

/** Per-player STOP/LAST-CHANCE threshold, raised to 10 if Treasure Chest is in
 *  force (round event) or held by the player. */
function stopThresholdFor(state: SspState, p: SspPlayer): number {
  if (eventAppliesTo(state, p, 'treasureChest')) return STOP_THRESHOLD_TREASURE;
  return STOP_THRESHOLD;
}

/** Mermaid-win threshold for a player. Reduced to 3 when Dance of the Mermaids
 *  is in force (round event) or held by the player. */
function mermaidWinCountFor(state: SspState, p: SspPlayer): number {
  return eventAppliesTo(state, p, 'danceOfMermaids') ? 3 : 4;
}

/** Build the per-player scoring opts (trios + event scoring overrides). */
function scoringOptsFor(state: SspState, p: SspPlayer) {
  const trioCancelledIds = new Set<number>();
  for (const trio of p.trios ?? []) for (const id of trio) trioCancelledIds.add(id);
  return {
    trioCancelledIds,
    trios: p.trios?.length ?? 0,
    // Per-event scoring overrides (applied in scoring.cardPoints / totalScore):
    shellPerCard: eventAppliesTo(state, p, 'danceOfShells'),     // each shell = 2 pts, no set
    octopusPerCard: eventAppliesTo(state, p, 'kraken'),          // each octopus = 1 pt, no set
    mermaidsScoreZero: eventAppliesTo(state, p, 'tornado'),      // mermaids contribute 0 pts
  };
}

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

type LogPartial = DistributiveOmit<SspLogEntry, 'seq' | 'round'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: SspState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({ seq: state.logSeq, round: state.round, ...partial } as SspLogEntry);
}

/** Count mermaids on a player's table; if their threshold is met → instant win.
 *  Default threshold is 4 — reduced to 3 if the player holds Three Mermaids (Pepper). */
function checkMermaidWin(state: SspState): PlayerId | null {
  for (const p of state.players) {
    const mermaids = p.table.filter((c) => c.family === 'mermaid').length
      + p.hand.filter((c) => c.family === 'mermaid').length;
    if (mermaids >= mermaidWinCountFor(state, p)) return p.id;
  }
  return null;
}

function scoreRound(state: SspState, summaryKind: SspRoundSummary['endedBy'], endedBy: PlayerId | null): SspRoundSummary {
  let lastChanceWon: boolean | null = null;

  // Compute baseline scores. Per-player scoring opts pull in starfish trios
  // and any active event-driven scoring overrides (Dance of Shells, Kraken,
  // Tornado). LAST CHANCE: every player gets at least one largest-color-group
  // claim regardless of mermaid count.
  //
  // Display split:
  //   cardPoints column = duo/collector/multiplier/trio scoring + mermaid claims
  //   colorBonus column = number of WHITE cards held (== mermaid count)
  // The two together equal the round's total points.
  const isLastChance = summaryKind === 'lastChance';
  const baseScores = state.players.map((p) => {
    const cards = allCards(p.hand, p.table);
    const opts = { ...scoringOptsFor(state, p), lastChanceColorBonus: isLastChance };
    const breakdown = totalScore(cards, opts);
    return { p, cardPoints: breakdown.cardPoints, colorBonus: breakdown.colorBonus };
  });

  let forfeitCallerId: PlayerId | null = null;
  if (summaryKind === 'lastChance' && endedBy) {
    const caller = baseScores.find((s) => s.p.id === endedBy)!;
    const others = baseScores.filter((s) => s.p.id !== endedBy);
    // Rulebook: the LAST CHANCE bet compares TOTAL round points (cards + the
    // mermaid color bonus), not card points in isolation. The bonus is part
    // of the score the caller is betting will still lead after the last
    // go-around — so the comparison has to include it.
    const callerTotal = caller.cardPoints + caller.colorBonus;
    const opponentMaxTotal = others.length
      ? Math.max(...others.map((s) => s.cardPoints + s.colorBonus))
      : 0;
    if (callerTotal >= opponentMaxTotal) {
      // Bet won: caller gets cards + bonus, opponents only get color bonus.
      lastChanceWon = true;
      forfeitCallerId = null;
    } else {
      // Bet lost: caller forfeits cards (color bonus only). Opponents score normally.
      lastChanceWon = false;
      forfeitCallerId = endedBy;
    }
  }

  const perPlayer: SspPlayerRoundScore[] = baseScores.map(({ p, cardPoints: cp, colorBonus: cb }) => {
    let forfeitCards = false;
    let forfeitBonus = false;
    let total: number;
    if (summaryKind === 'lastChance' && endedBy) {
      // LAST CHANCE: bonus column always counts (both bet winner and loser).
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
      // STOP / deck-empty / mermaid-win: the special color bonus is shown for
      // reference (so the player can see what they would have got) but does
      // NOT contribute to the round total.
      forfeitBonus = true;
      total = cp;
    }
    return {
      playerId: p.id,
      cardPoints: cp,
      colorBonus: cb,
      total,
      forfeitCards,
      forfeitBonus,
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
  pushLog(state, {
    kind: 'roundEnd',
    endedBy,
    endedByPlayerId,
    lastChanceWon: summary.lastChanceWon,
  });
  // Pepper: award/discard the round's event based on its sign.
  awardEventCard(state);
}

/** At round end (after scoring), award the current event card:
 *   - '+'      → goes to the leader (highest matchScore; ties → seat order)
 *   - '-'      → goes to the laggard (lowest matchScore; ties → seat order)
 *  A player can only hold one event at a time — older one is dropped if so. */
function awardEventCard(state: SspState): void {
  const event = currentEvent(state);
  if (!state.event || !event) return;
  // Find leader / laggard. With ties, take the first in seat order.
  const sortedDesc = [...state.players].sort((a, b) => b.matchScore - a.matchScore);
  const sortedAsc = [...state.players].sort((a, b) => a.matchScore - b.matchScore);
  const target = event.sign === '+' ? sortedDesc[0] : sortedAsc[0];
  if (!target) {
    state.event.current = null;
    return;
  }
  // Remove this event from any prior holder; then assign.
  for (const p of state.players) {
    if (p.heldEvents) p.heldEvents = p.heldEvents.filter((id) => id !== event.id);
  }
  if (!target.heldEvents) target.heldEvents = [];
  // One-event-per-player rule: drop the older one if needed.
  if (target.heldEvents.length >= 1) target.heldEvents = [];
  target.heldEvents.push(event.id);
  pushLog(state, { kind: 'eventAwarded', eventId: event.id, playerId: target.id });
  state.event.current = null;
}

function startNewRound(state: SspState): void {
  state.round += 1;
  const extraSalt = !!state.config.expansions?.extraSalt;
  state.deck = buildShuffledDeck(state.rngState, { extraSalt });
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
  state.pendingLobsterPick = [];
  state.nextTurnLockedPlayerId = null;
  state.subPhase = 'awaitingAction';
  for (const p of state.players) {
    p.hand = [];
    p.table = [];
    p.trios = [];
    p.roundScore = 0;
  }
  // First player rotates round to round.
  const lastStarter = state.activePlayerId ?? state.players[0].id;
  state.activePlayerId = nextSeatId(state, lastStarter);

  // Pepper: reveal the next event card. If the deck is empty (12 rounds used —
  // unlikely in a match), the round simply has no event.
  if (state.event) {
    const nextId = state.event.deck.pop();
    state.event.current = nextId ?? null;
    if (nextId) pushLog(state, { kind: 'eventReveal', eventId: nextId });
    // Drop any held event no longer applicable (player must still be leader/
    // laggard). Since we just rotated, recompute who qualifies.
    reconcileHeldEvents(state);
  }
}

/** Walk every player's held events; discard those whose holder no longer
 *  meets the position requirement (leader for '+', laggard for '-'). */
function reconcileHeldEvents(state: SspState): void {
  if (!state.event) return;
  const sortedDesc = [...state.players].sort((a, b) => b.matchScore - a.matchScore);
  const sortedAsc = [...state.players].sort((a, b) => a.matchScore - b.matchScore);
  const leaderId = sortedDesc[0]?.id;
  const laggardId = sortedAsc[0]?.id;
  for (const p of state.players) {
    if (!p.heldEvents) continue;
    p.heldEvents = p.heldEvents.filter((id) => {
      const sign = lookupEventSign(id);
      if (sign === '+') return p.id === leaderId;
      return p.id === laggardId;
    });
  }
}

function lookupEventSign(id: SspEventId): '+' | '-' {
  return EVENT_BY_ID[id].sign;
}

function gameOverIfReached(state: SspState): void {
  // Pick the player with the highest matchScore among any that have crossed the
  // target — ties go to the first player in seat order.
  let winner: SspPlayer | null = null;
  for (const p of state.players) {
    if (p.matchScore >= state.config.targetScore) {
      if (!winner || p.matchScore > winner.matchScore) winner = p;
    }
  }
  if (!winner) return;
  state.phase = 'gameOver';
  state.subPhase = 'gameOver';
  state.finalScores = {};
  for (const p of state.players) state.finalScores[p.id] = p.matchScore;
  pushLog(state, { kind: 'matchEnd', winnerId: winner.id });
}

function advanceTurnAfterEndChoice(state: SspState): void {
  // Clear the jellyfish lock now that the locked player's turn is ending
  // (we only lock for a single turn).
  if (state.activePlayerId && state.activePlayerId === state.nextTurnLockedPlayerId) {
    state.nextTurnLockedPlayerId = null;
  }

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

/** True if the active player is currently locked by a jellyfish ability. */
function isActiveLocked(state: SspState): boolean {
  return state.nextTurnLockedPlayerId != null
    && state.activePlayerId === state.nextTurnLockedPlayerId;
}

type DuoFamily = 'crab' | 'boat' | 'fish' | 'shark' | 'swimmer' | 'jellyfish' | 'lobster';

function applyDuoEffect(state: SspState, p: SspPlayer, family: DuoFamily, other: DuoFamily): void {
  // Family is one of the two in the played pair; we react to the pair as a unit.
  if (family === 'boat' || other === 'boat') {
    // Take another turn after the pair sequence resolves: jump back to awaitingAction.
    state.subPhase = 'awaitingAction';
    return;
  }
  if (family === 'fish' || other === 'fish') {
    // The Sunfish (Pepper): fish pairs draw 2 instead of 1.
    const drawCount = eventAppliesTo(state, p, 'sunfish') ? 2 : 1;
    for (let i = 0; i < drawCount; i++) {
      const c = popDeck(state);
      if (!c) break;
      p.hand.push(c);
      pushLog(state, { kind: 'fishDraw', playerId: p.id, family: c.family });
    }
    state.subPhase = 'awaitingPlayOrEnd';
    return;
  }
  if (family === 'lobster' || other === 'lobster') {
    // Salt: reveal top 5 of deck, player picks 1, rest go back and reshuffle.
    const reveal: SspCard[] = [];
    for (let i = 0; i < 5; i++) {
      const c = popDeck(state);
      if (c) reveal.push(c);
    }
    if (reveal.length === 0) {
      state.subPhase = 'awaitingPlayOrEnd';
      return;
    }
    state.pendingLobsterPick = reveal;
    state.subPhase = 'awaitingLobsterPick';
    return;
  }
  if (family === 'crab' || other === 'crab') {
    // The Hermit Crab (Pepper): crab pair takes ONE card from EACH discard
    // pile (auto, no choice — the rulebook doesn't say "pick from anywhere",
    // it says "one card from each pile"). With base rules: pick one card
    // from EITHER pile via the awaitingCrabPick subphase.
    if (eventAppliesTo(state, p, 'hermitCrab')) {
      for (const pileIdx of [0, 1] as const) {
        const pile = state.discards[pileIdx];
        if (pile.length === 0) continue;
        // Take the TOP of each pile (deterministic, no UI choice needed).
        const taken = pile.pop()!;
        p.hand.push(taken);
        pushLog(state, { kind: 'crabPick', playerId: p.id, pile: pileIdx, family: taken.family });
      }
      state.subPhase = 'awaitingPlayOrEnd';
      return;
    }
    // Base crab: pick one card from any pile.
    if (state.discards[0].length === 0 && state.discards[1].length === 0) {
      state.subPhase = 'awaitingPlayOrEnd';
    } else {
      state.subPhase = 'awaitingCrabPick';
    }
    return;
  }
  if (family === 'jellyfish' || other === 'jellyfish') {
    // Salt: lock the next player. Stealing logic identical: nobody is stolen
    // from, just record the lock and move on.
    const idx = state.players.findIndex((q) => q.id === p.id);
    const nextId = state.players[(idx + 1) % state.players.length]?.id ?? null;
    if (nextId && nextId !== p.id) {
      state.nextTurnLockedPlayerId = nextId;
      pushLog(state, { kind: 'jellyfishLock', playerId: p.id, targetPlayerId: nextId });
    }
    state.subPhase = 'awaitingPlayOrEnd';
    return;
  }
  // shark + swimmer
  if (stealableTargetExists(state, p.id)) {
    state.subPhase = 'awaitingSharkSteal';
  } else {
    state.subPhase = 'awaitingPlayOrEnd';
  }
}

/** True when at least one other player has cards AND is not the LAST CHANCE
 *  caller (whose hand is protected by the bet). When false, the shark+swimmer
 *  pair still scores 1 pt but its steal step is skipped. */
function stealableTargetExists(state: SspState, exceptId: PlayerId): boolean {
  return state.players.some((q) =>
    q.id !== exceptId
    && q.hand.length > 0
    && state.lastChanceFrom !== q.id
  );
}

/** If the Angelfish (Pepper) event applies to `p` and both discard tops share
 *  a color, the player takes one of those tops into their hand (per the
 *  rulebook — pick one of the two visible discards). For simplicity we pick
 *  the higher-value top, which gives the AI a deterministic choice.
 *  Triggered at end of every turn (whether normal pass or via pair plays). */
function maybeAngelfishDraw(state: SspState, p: SspPlayer): void {
  if (!eventAppliesTo(state, p, 'angelfish')) return;
  const top0 = state.discards[0][state.discards[0].length - 1];
  const top1 = state.discards[1][state.discards[1].length - 1];
  if (!top0 || !top1 || top0.color !== top1.color) return;
  // Take the top of pile 0 by default (deterministic for AI / replay).
  const taken = state.discards[0].pop()!;
  p.hand.push(taken);
  pushLog(state, { kind: 'angelfishDraw', playerId: p.id, family: taken.family });
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
      // Rulebook: if one discard pile is empty, the un-kept card MUST go there
      // (both piles must be seeded as soon as possible). If both are empty,
      // either is legal; if both have at least 1 card, the player chooses.
      const emptyPile = s.discards[0].length === 0 ? 0 : s.discards[1].length === 0 ? 1 : -1;
      if (emptyPile !== -1 && s.discards[1 - emptyPile].length > 0 && action.discardToPile !== emptyPile) {
        throw new Error('keepFromDraw: an empty discard pile must be filled first');
      }
      p.hand.push(keep);
      s.discards[action.discardToPile].push(discard);
      s.pendingDraw = [];
      pushLog(s, {
        kind: 'drawDeck',
        playerId: p.id,
        keptFamily: keep.family,
        discardedFamily: discard.family,
        toPile: action.discardToPile,
      });

      // The Dolphins (Pepper): when a player discards a collector card
      // (shell, octopus, penguin, sailor, seahorse), draw the top of the deck
      // as a freebie. Triggered only on the discarded card, not the kept one.
      if (eventAppliesTo(s, p, 'dolphins') && isCollectorFamily(discard.family)) {
        const bonus = popDeck(s);
        if (bonus) {
          p.hand.push(bonus);
          pushLog(s, { kind: 'fishDraw', playerId: p.id, family: bonus.family });
        }
      }

      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        pushLog(s, { kind: 'mermaidWin', playerId: mm });
        pushLog(s, { kind: 'matchEnd', winnerId: mm });
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
      if (isActiveLocked(s)) throw new Error('drawFromDiscard: locked by jellyfish');
      const pile = s.discards[action.pile];
      if (pile.length === 0) throw new Error('drawFromDiscard: pile empty');
      const c = pile.pop()!;
      const p = requireActivePlayer(s);
      p.hand.push(c);
      pushLog(s, { kind: 'drawDiscard', playerId: p.id, pile: action.pile, family: c.family });
      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        pushLog(s, { kind: 'mermaidWin', playerId: mm });
        pushLog(s, { kind: 'matchEnd', winnerId: mm });
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
      if (isActiveLocked(s)) throw new Error('playPair: locked by jellyfish');
      const p = requireActivePlayer(s);
      const [idA, idB] = action.cardIds;
      const a = p.hand.find((c) => c.id === idA);
      const b = p.hand.find((c) => c.id === idB);
      if (!a || !b) throw new Error('playPair: card not in hand');
      if (!isValidDuoPair(a, b)) throw new Error('playPair: not a valid pair');
      p.hand = p.hand.filter((c) => c.id !== idA && c.id !== idB);
      p.table.push(a, b);
      pushLog(s, { kind: 'playPair', playerId: p.id, families: [a.family, b.family] });
      const deckTopBefore = s.deck[s.deck.length - 1];
      // For ambiguous-partner cases (swimmer can pair with shark OR jellyfish),
      // pass both actual families to applyDuoEffect — it dispatches on either.
      applyDuoEffect(s, p, a.family as DuoFamily, b.family as DuoFamily);
      // Fish drew one card from deck top into the active player's hand.
      if ((a.family === 'fish' || b.family === 'fish') && deckTopBefore && p.hand.some((c) => c.id === deckTopBefore.id)) {
        pushLog(s, { kind: 'fishDraw', playerId: p.id, family: deckTopBefore.family });
      }
      return s;
    }

    case 'playTrio': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('playTrio: wrong subPhase');
      if (isActiveLocked(s)) throw new Error('playTrio: locked by jellyfish');
      const p = requireActivePlayer(s);
      const [idA, idB, idC] = action.cardIds;
      const a = p.hand.find((c) => c.id === idA);
      const b = p.hand.find((c) => c.id === idB);
      const c = p.hand.find((c2) => c2.id === idC);
      if (!a || !b || !c) throw new Error('playTrio: card not in hand');
      if (!isValidStarfishTrio(a, b, c)) throw new Error('playTrio: not a valid starfish trio');
      p.hand = p.hand.filter((x) => x.id !== idA && x.id !== idB && x.id !== idC);
      p.table.push(a, b, c);
      if (!p.trios) p.trios = [];
      p.trios.push([idA, idB, idC]);
      pushLog(s, {
        kind: 'playTrio',
        playerId: p.id,
        families: [a.family, b.family, c.family],
      });
      // Trio skips the duo ability — go straight to play-or-end.
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'lobsterPick': {
      if (s.subPhase !== 'awaitingLobsterPick') throw new Error('lobsterPick: wrong subPhase');
      const pool = s.pendingLobsterPick ?? [];
      const idx = pool.findIndex((c) => c.id === action.cardId);
      if (idx === -1) throw new Error('lobsterPick: card not in reveal');
      const picked = pool.splice(idx, 1)[0];
      const p = requireActivePlayer(s);
      p.hand.push(picked);
      // Return the rest to the deck and reshuffle.
      s.deck.push(...pool);
      s.pendingLobsterPick = [];
      s.deck = shuffle(s.rngState, s.deck);
      pushLog(s, { kind: 'lobsterPick', playerId: p.id, family: picked.family });
      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        pushLog(s, { kind: 'mermaidWin', playerId: mm });
        pushLog(s, { kind: 'matchEnd', winnerId: mm });
        s.phase = 'gameOver';
        s.subPhase = 'gameOver';
        s.finalScores = {};
        for (const player of s.players) s.finalScores[player.id] = player.matchScore;
        return s;
      }
      s.subPhase = 'awaitingPlayOrEnd';
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
      pushLog(s, { kind: 'crabPick', playerId: p.id, pile: action.pile, family: card.family });
      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        pushLog(s, { kind: 'mermaidWin', playerId: mm });
        pushLog(s, { kind: 'matchEnd', winnerId: mm });
        s.phase = 'gameOver';
        s.subPhase = 'gameOver';
        s.finalScores = {};
        for (const player of s.players) s.finalScores[player.id] = player.matchScore;
        return s;
      }
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'sharkSteal': {
      if (s.subPhase !== 'awaitingSharkSteal') throw new Error('sharkSteal: wrong subPhase');
      const target = playerById(s, action.targetPlayerId);
      if (target.id === s.activePlayerId) throw new Error('sharkSteal: cannot target self');
      if (target.hand.length === 0) throw new Error('sharkSteal: target has empty hand');
      // Rulebook: the player who called LAST CHANCE is protected from steals
      // for the remainder of the round (their hand is locked-in for the bet).
      if (s.lastChanceFrom === target.id) {
        throw new Error('sharkSteal: target called LAST CHANCE and is protected');
      }
      // Random steal per rulebook.
      const idx = rngInt(s.rngState, target.hand.length);
      const stolen = target.hand.splice(idx, 1)[0];
      const p = requireActivePlayer(s);
      p.hand.push(stolen);
      pushLog(s, { kind: 'sharkSteal', playerId: p.id, targetPlayerId: target.id, family: stolen.family });

      const mm = checkMermaidWin(s);
      if (mm) {
        s.mermaidWinnerId = mm;
        pushLog(s, { kind: 'mermaidWin', playerId: mm });
        pushLog(s, { kind: 'matchEnd', winnerId: mm });
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
      if (isActiveLocked(s)) throw new Error('stop: locked by jellyfish');
      // Rulebook: once LAST CHANCE has been called, the remaining players take
      // their final turn but cannot themselves call STOP / LAST CHANCE.
      if (s.lastChanceFrom !== null) throw new Error('stop: LAST CHANCE already called');
      const p = requireActivePlayer(s);
      // The Diodon Fish (Pepper): may not call STOP, must use LAST CHANCE.
      if (eventAppliesTo(s, p, 'diodonFish')) throw new Error('stop: blocked by Diodon Fish');
      const opts = scoringOptsFor(s, p);
      const score = tentativeScore(p.hand, p.table, opts);
      if (score < stopThresholdFor(s, p)) throw new Error('stop: below threshold');
      pushLog(s, { kind: 'stop', playerId: p.id, score });
      endRound(s, 'stop', p.id);
      return s;
    }

    case 'lastChance': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('lastChance: wrong subPhase');
      if (isActiveLocked(s)) throw new Error('lastChance: locked by jellyfish');
      if (s.lastChanceFrom !== null) throw new Error('lastChance: already called this round');
      const p = requireActivePlayer(s);
      const opts = scoringOptsFor(s, p);
      const score = tentativeScore(p.hand, p.table, opts);
      if (score < stopThresholdFor(s, p)) throw new Error('lastChance: below threshold');
      pushLog(s, { kind: 'lastChance', playerId: p.id, score });
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
      const p = requireActivePlayer(s);
      // Angelfish (Pepper, global): if both discard tops share a color at end
      // of turn, current player gets a free draw from the deck.
      maybeAngelfishDraw(s, p);
      pushLog(s, { kind: 'pass', playerId: p.id });
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

/** Returns true if the active player can call STOP / LAST CHANCE. */
export function canEndRound(state: SspState): boolean {
  if (!state.activePlayerId) return false;
  if (state.subPhase !== 'awaitingPlayOrEnd') return false;
  if (state.lastChanceFrom) return false; // lastChance window — opponents can't re-trigger
  if (isActiveLocked(state)) return false;
  const p = playerById(state, state.activePlayerId);
  const opts = scoringOptsFor(state, p);
  return tentativeScore(p.hand, p.table, opts) >= stopThresholdFor(state, p);
}

/** Exposed for tests + AI heuristics. */
export const _internals = {
  STOP_THRESHOLD,
  scoreRound,
  startNewRound,
  endRound,
  isMultiplierFamily,
};
