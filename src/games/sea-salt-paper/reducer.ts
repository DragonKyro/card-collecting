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
//          - Water Rodeo (Pepper): two swimmers → awaitingRodeoTarget → rodeoLook →
//            awaitingRodeoSwap → rodeoSwap; two sharks → awaitingPairSteal → stealPair.
//      Then either stop/lastChance/pass to end the turn. A pass or LAST CHANCE
//      under the Angelfish (Pepper) may stop at awaitingAngelfishPick first.
//
// Extra Pepper events are applied through `eventAppliesTo`; at round end
// `settleEvents` hands this round's card on (see events.ts for the rules),
// pausing at awaitingEventChoice when its winner already holds one.
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
  SspState, SspAction, SspCard, SspPlayer,
  SspRoundSummary, SspPlayerRoundScore, SspLogEntry,
} from './types';
import { buildShuffledDeck, isMultiplierFamily, isCollectorFamily } from './cards';
import {
  allCards, categoryBreakdown, isValidDuoPair, isValidStarfishTrio, tablePairs, tentativeScore, totalScore,
} from './scoring';
import {
  EVENT_BY_ID, currentEvent, eventAppliesTo,
} from './events';

const STOP_THRESHOLD = 7;
const STOP_THRESHOLD_TREASURE = 10;  // when Treasure Chest applies

/** Per-player STOP/LAST-CHANCE threshold, raised to 10 if Treasure Chest is in
 *  force (round event) or held by the player. */
export function stopThresholdFor(state: SspState, p: SspPlayer): number {
  if (eventAppliesTo(state, p, 'treasureChest')) return STOP_THRESHOLD_TREASURE;
  return STOP_THRESHOLD;
}

/** Mermaid-win threshold for a player. Reduced to 3 when Dance of the Mermaids
 *  is in force (round event) or held by the player. */
function mermaidWinCountFor(state: SspState, p: SspPlayer): number {
  return eventAppliesTo(state, p, 'danceOfMermaids') ? 3 : 4;
}

/** Build the per-player scoring opts (trios + event scoring overrides). */
export function scoringOptsFor(state: SspState, p: SspPlayer) {
  const trioCancelledIds = new Set<number>();
  for (const trio of p.trios ?? []) for (const id of trio) trioCancelledIds.add(id);
  return {
    trioCancelledIds,
    trios: p.trios?.length ?? 0,
    // Per-event scoring overrides (applied in scoring.cardPoints / totalScore):
    shellPerCard: eventAppliesTo(state, p, 'danceOfShells'),     // each shell = 2 pts, no set
    octopusPerCard: eventAppliesTo(state, p, 'kraken'),          // each octopus = 1 pt, no set
    mermaidsScoreZero: eventAppliesTo(state, p, 'tornado'),      // mermaids contribute 0 pts
    waterRodeo: eventAppliesTo(state, p, 'waterRodeo'),          // two swimmers / two sharks are duos
  };
}

/** Can `attackerId` target `target` with a steal, swap or lock? Not
 *  themselves, not the LAST CHANCE caller (their hand is the bet), and not a
 *  player with a Coral Reef shell face down (immune to all attacks). */
export function canAttack(state: SspState, attackerId: PlayerId, target: SspPlayer): boolean {
  return target.id !== attackerId && state.lastChanceFrom !== target.id && !target.coralShell;
}

/** Opponents the Water Rodeo swimmer pair can look at. */
export function rodeoTargets(state: SspState, attackerId: PlayerId): SspPlayer[] {
  return state.players.filter((q) => canAttack(state, attackerId, q) && q.hand.length > 0);
}

/** Opponents' pairs the Water Rodeo shark pair can steal. */
export function stealablePairs(state: SspState, attackerId: PlayerId): Array<{ target: SspPlayer; cards: [SspCard, SspCard] }> {
  return state.players
    .filter((q) => canAttack(state, attackerId, q))
    .flatMap((q) => tablePairs(q.table, q.trios).map((cards) => ({ target: q, cards })));
}

/** Can `p` place a shell face down now (The Coral Reef)? One per round. */
export function canPlaceCoralShell(state: SspState, p: SspPlayer): boolean {
  return state.subPhase === 'awaitingPlayOrEnd'
    && state.activePlayerId === p.id
    && !p.coralShell
    && eventAppliesTo(state, p, 'coralReef')
    && p.hand.some((c) => c.family === 'shell');
}

/** The Angelfish: true when `p` ends a turn with two same-colour pile tops. */
function angelfishOffered(state: SspState, p: SspPlayer): boolean {
  if (!eventAppliesTo(state, p, 'angelfish')) return false;
  const top0 = state.discards[0][state.discards[0].length - 1];
  const top1 = state.discards[1][state.discards[1].length - 1];
  return !!top0 && !!top1 && top0.color === top1.color;
}

/** Deep-clone the state for an action. We detach `state.log` first because
 *  it's append-only and grows linearly with the match — deep-cloning it on
 *  every reducer call dominated CPU by late rounds (round 5+ noticeably
 *  slowed the AI driver). The clone gets a SHALLOW-copied log array so
 *  pushes against the returned state don't mutate the input's log either. */
function clone(x: SspState): SspState {
  const log = x.log;
  // Temporarily null out the log so JSON serialization skips it.
  (x as { log: SspLogEntry[] | undefined }).log = undefined as unknown as SspLogEntry[];
  const out = JSON.parse(JSON.stringify(x)) as SspState;
  (x as { log: SspLogEntry[] }).log = log;
  // Shallow-copy the log: entry objects are immutable (only ever pushed, never
  // mutated), so sharing the entry references is safe; the array itself must
  // be a new instance so pushLog on `out` doesn't append to the input array.
  out.log = log ? log.slice() : [];
  return out;
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
 *  Default threshold is 4 — 3 while Dance of the Mermaids applies to the player (Pepper). */
function checkMermaidWin(state: SspState): PlayerId | null {
  for (const p of state.players) {
    const mermaids = p.table.filter((c) => c.family === 'mermaid').length
      + p.hand.filter((c) => c.family === 'mermaid').length;
    if (mermaids >= mermaidWinCountFor(state, p)) return p.id;
  }
  return null;
}

/** Run after anything that puts a card in a hand: a completed mermaid set
 *  ends the match on the spot. Returns true when it did. */
function endIfMermaidWin(state: SspState): boolean {
  const mm = checkMermaidWin(state);
  if (!mm) return false;
  state.mermaidWinnerId = mm;
  pushLog(state, { kind: 'mermaidWin', playerId: mm });
  pushLog(state, { kind: 'matchEnd', winnerId: mm });
  state.phase = 'gameOver';
  state.subPhase = 'gameOver';
  state.finalScores = {};
  for (const player of state.players) state.finalScores[player.id] = player.matchScore;
  return true;
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
  //   colorBonus column = cards in the player's largest single colour group
  //                       (scoring.specialColorBonus) — counted on LAST CHANCE only
  const isLastChance = summaryKind === 'lastChance';
  const baseScores = state.players.map((p) => {
    const cards = allCards(p.hand, p.table);
    const opts = { ...scoringOptsFor(state, p), lastChanceColorBonus: isLastChance };
    const breakdown = totalScore(cards, opts);
    const cats = categoryBreakdown(cards, opts);
    return {
      p,
      cardPoints: breakdown.cardPoints,
      colorBonus: breakdown.colorBonus,
      breakdown: cats,
      cardCount: cards.length,
    };
  });

  let forfeitCallerId: PlayerId | null = null;
  if (summaryKind === 'lastChance' && endedBy) {
    const caller = baseScores.find((s) => s.p.id === endedBy)!;
    const others = baseScores.filter((s) => s.p.id !== endedBy);
    // Rulebook: the LAST CHANCE bet compares CARD POINTS only (including
    // mermaid claims). The special color bonus is independent — every player
    // earns it on LAST CHANCE regardless of who wins the bet.
    // Ties go to the caller (caller wins if their card total >= every
    // opponent's card total).
    const callerCards = caller.cardPoints;
    const opponentMaxCards = others.length
      ? Math.max(...others.map((s) => s.cardPoints))
      : 0;
    if (callerCards >= opponentMaxCards) {
      lastChanceWon = true;
      forfeitCallerId = null;
    } else {
      lastChanceWon = false;
      forfeitCallerId = endedBy;
    }
  }

  const perPlayer: SspPlayerRoundScore[] = baseScores.map(({ p, cardPoints: cp, colorBonus: cb, breakdown: cats, cardCount }) => {
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
      breakdown: cats,
      cardCount,
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
  if (!state.roundHistory) state.roundHistory = [];
  state.roundHistory.push(summary);
  state.subPhase = 'roundEnd';
  state.lastChanceFrom = null;
  state.lastChanceRemaining = [];
  pushLog(state, {
    kind: 'roundEnd',
    endedBy,
    endedByPlayerId,
    lastChanceWon: summary.lastChanceWon,
  });
  settleEvents(state);
}

/** The player alone in first ('+') or last ('-') place by match score; null
 *  when that place is shared. */
function soleHolderOf(state: SspState, sign: '+' | '-'): SspPlayer | null {
  const scores = state.players.map((p) => p.matchScore);
  const target = sign === '+' ? Math.max(...scores) : Math.min(...scores);
  const at = state.players.filter((p) => p.matchScore === target);
  return at.length === 1 ? at[0] : null;
}

/** True when the round just scored ends the match (no tie-breaker round). */
function matchDecided(state: SspState): boolean {
  return state.players.some((p) => p.matchScore >= state.config.targetScore)
    && decideWinner(state).winnerId !== null;
}

/** Extra Pepper, after the round's points are in (rules in events.ts):
 *   1. a held card whose holder no longer has its place is discarded;
 *   2. this round's card goes to the sole leader ('+') or laggard ('-'), or is
 *      discarded on a tie. A winner already holding a card chooses which to
 *      keep (awaitingEventChoice, played as `chooseEvent`).
 *  Skipped once the match is decided — no later round would use the cards. */
function settleEvents(state: SspState): void {
  if (!state.event) return;
  const event = currentEvent(state);
  state.event.current = null;
  if (matchDecided(state)) return;

  for (const p of state.players) {
    const held = p.heldEvents ?? [];
    p.heldEvents = held.filter((id) => soleHolderOf(state, EVENT_BY_ID[id].sign)?.id === p.id);
    for (const id of held) {
      if (!p.heldEvents.includes(id)) pushLog(state, { kind: 'eventDiscarded', eventId: id, playerId: p.id, reason: 'lostPlace' });
    }
  }

  if (!event) return;
  const winner = soleHolderOf(state, event.sign);
  if (!winner) {
    pushLog(state, { kind: 'eventDiscarded', eventId: event.id, playerId: null, reason: 'tie' });
    return;
  }
  pushLog(state, { kind: 'eventAwarded', eventId: event.id, playerId: winner.id });
  const old = winner.heldEvents?.[0];
  if (!old) {
    winner.heldEvents = [event.id];
    return;
  }
  state.pendingEventChoice = {
    playerId: winner.id, newEventId: event.id, oldEventId: old, resumeActiveId: state.activePlayerId,
  };
  state.subPhase = 'awaitingEventChoice';
  state.activePlayerId = winner.id;
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
  state.lockedPlayerIds = [];
  state.crabPilesLeft = null;
  state.pendingAngelfish = null;
  state.pendingRodeo = null;
  state.pendingEventChoice = null;
  state.subPhase = 'awaitingAction';
  for (const p of state.players) {
    p.hand = [];
    p.table = [];
    p.trios = [];
    p.coralShell = null;
    p.roundScore = 0;
  }
  // First player rotates round to round per rulebook ("the starting player
  // passes the deck to their left"). Rotation is from LAST ROUND'S STARTER
  // — NOT whoever happened to end the round — so an efficient AI doesn't
  // keep stealing the first-player slot.
  const lastStarter = state.currentRoundStarterId ?? state.activePlayerId ?? state.players[0].id;
  const newStarter = nextSeatId(state, lastStarter);
  state.currentRoundStarterId = newStarter;
  state.activePlayerId = newStarter;

  // Pepper: reveal the next event card. If the deck is empty (12 rounds used —
  // unlikely in a match), the round simply has no event.
  if (state.event) {
    const nextId = state.event.deck.pop();
    state.event.current = nextId ?? null;
    if (nextId) pushLog(state, { kind: 'eventReveal', eventId: nextId });
  }
}

/** Decide the match winner among everyone who crossed the target.
 *  Returns null when the result is a TRUE tie — same matchScore AND same
 *  mermaid count — so the caller can play an extra round. Otherwise returns
 *  the winning player id.
 *
 *  Tiebreakers (in order):
 *    1. Highest matchScore.
 *    2. Most mermaids on the table at end of the deciding round.
 *  If both are equal, return null → another round is played.
 */
function decideWinner(state: SspState): { winnerId: PlayerId | null; tied: PlayerId[] } {
  // All candidates who hit the target — others are eliminated from the final
  // race (the rulebook's "first to target" is a trigger, but anyone else who
  // ALSO crossed in the same round is still in the running).
  const candidates = state.players.filter((p) => p.matchScore >= state.config.targetScore);
  if (candidates.length === 0) return { winnerId: null, tied: [] };

  // Tier 1: top matchScore.
  const topScore = Math.max(...candidates.map((p) => p.matchScore));
  const topByScore = candidates.filter((p) => p.matchScore === topScore);
  if (topByScore.length === 1) return { winnerId: topByScore[0].id, tied: [] };

  // Tier 2: most mermaids (count from the player's tableau at this moment).
  const mermaidsOf = (p: SspPlayer): number =>
    p.table.filter((c) => c.family === 'mermaid').length
    + p.hand.filter((c) => c.family === 'mermaid').length;
  const topMermaids = Math.max(...topByScore.map(mermaidsOf));
  const topByMermaids = topByScore.filter((p) => mermaidsOf(p) === topMermaids);
  if (topByMermaids.length === 1) return { winnerId: topByMermaids[0].id, tied: [] };

  // True tie — both score and mermaid count equal across multiple players.
  return { winnerId: null, tied: topByMermaids.map((p) => p.id) };
}

function gameOverIfReached(state: SspState): void {
  const { winnerId, tied } = decideWinner(state);
  if (winnerId) {
    state.phase = 'gameOver';
    state.subPhase = 'gameOver';
    state.finalScores = {};
    for (const p of state.players) state.finalScores[p.id] = p.matchScore;
    pushLog(state, { kind: 'matchEnd', winnerId });
    return;
  }
  if (tied.length >= 2) {
    // Per rulebook: play another round to break the tie. Stay in 'roundEnd'
    // (the round summary view) but flag the tie so the UI can announce it,
    // and DO NOT mark phase=gameOver — nextRound will fall through to
    // startNewRound on the next dispatch.
    state.tieBreakerPlayers = tied;
  }
}

function advanceTurnAfterEndChoice(state: SspState): void {
  // Either continue rotation, or progress the lastChance counter.
  if (state.lastChanceFrom) {
    // Pop the next remaining player; if empty, score the round.
    while (state.lastChanceRemaining.length) {
      const next = state.lastChanceRemaining.shift()!;
      // Skip the caller if it somehow appears.
      if (next === state.lastChanceFrom) continue;
      startTurn(state, next);
      return;
    }
    // No one left → score with lastChance semantics.
    endRound(state, 'lastChance', state.lastChanceFrom);
    return;
  }

  // Normal rotation.
  if (!state.activePlayerId) throw new Error('no active player');
  startTurn(state, nextSeatId(state, state.activePlayerId));
}

/** Hand the turn to `playerId`. A player locked by an opponent's jellyfish +
 *  swimmer pair can only take the top card of the deck — no discard pile, no
 *  pairs, no STOP or LAST CHANCE — so the game plays that turn for them and
 *  moves on (an empty deck ends the round, as when a player can't draw). */
function startTurn(state: SspState, playerId: PlayerId): void {
  state.activePlayerId = playerId;
  state.subPhase = 'awaitingAction';
  const locked = state.lockedPlayerIds ?? [];
  if (!locked.includes(playerId)) return;
  state.lockedPlayerIds = locked.filter((id) => id !== playerId);
  const card = popDeck(state);
  if (!card) {
    endRound(state, 'deckEmpty', playerId);
    return;
  }
  const p = playerById(state, playerId);
  p.hand.push(card);
  pushLog(state, { kind: 'jellyfishDraw', playerId, family: card.family });
  if (endIfMermaidWin(state)) return;
  state.subPhase = 'awaitingPlayOrEnd';
  endTurn(state, p);
}

/** The active player's turn is over without ending the round — a pass, or a
 *  LAST CHANCE call. The Angelfish (Pepper) may first offer them a pile top
 *  (awaitingAngelfishPick, answered by `angelfishPick`, which resumes here). */
function endTurn(state: SspState, p: SspPlayer, via: 'pass' | 'lastChance' = 'pass'): void {
  if (angelfishOffered(state, p)) {
    state.pendingAngelfish = { via };
    state.subPhase = 'awaitingAngelfishPick';
    return;
  }
  continueAfterTurn(state, p, via);
}

/** Next turn — or, after a pass that emptied the deck, the end of the round. */
function continueAfterTurn(state: SspState, p: SspPlayer, via: 'pass' | 'lastChance'): void {
  if (via === 'lastChance') {
    advanceTurnAfterEndChoice(state);
    return;
  }
  pushLog(state, { kind: 'pass', playerId: p.id });
  // If the deck is empty after the player's turn, end the round (no scoring penalty).
  if (state.deck.length === 0 && state.pendingDraw.length === 0 && state.lastChanceFrom === null) {
    endRound(state, 'deckEmpty', state.activePlayerId);
    return;
  }
  advanceTurnAfterEndChoice(state);
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
    // Base crab: look through one discard pile and take any card. The Hermit
    // Crab (Pepper): do that for each discard pile, in either order.
    const nonEmpty = ([0, 1] as const).filter((i) => state.discards[i].length > 0);
    state.crabPilesLeft = eventAppliesTo(state, p, 'hermitCrab') ? [...nonEmpty] : null;
    state.subPhase = nonEmpty.length ? 'awaitingCrabPick' : 'awaitingPlayOrEnd';
    return;
  }
  if (family === 'jellyfish' || other === 'jellyfish') {
    // Salt: every opponent's next turn is only "take the top card of the
    // deck" (played for them when it comes up — see startTurn).
    const opponents = state.players.filter((q) => canAttack(state, p.id, q)).map((q) => q.id);
    state.lockedPlayerIds = [...new Set([...(state.lockedPlayerIds ?? []), ...opponents])];
    for (const id of opponents) pushLog(state, { kind: 'jellyfishLock', playerId: p.id, targetPlayerId: id });
    state.subPhase = 'awaitingPlayOrEnd';
    return;
  }
  if (family === 'swimmer' && other === 'swimmer') {
    // Water Rodeo: look at an opponent's hand, then maybe swap a card.
    state.subPhase = rodeoTargets(state, p.id).length ? 'awaitingRodeoTarget' : 'awaitingPlayOrEnd';
    return;
  }
  if (family === 'shark' && other === 'shark') {
    // Water Rodeo: take a pair from in front of an opponent.
    state.subPhase = stealablePairs(state, p.id).length ? 'awaitingPairSteal' : 'awaitingPlayOrEnd';
    return;
  }
  // shark + swimmer
  if (stealableTargetExists(state, p.id)) {
    state.subPhase = 'awaitingSharkSteal';
  } else {
    state.subPhase = 'awaitingPlayOrEnd';
  }
}

/** True when at least one opponent with cards can be attacked (see
 *  `canAttack`). When false, the shark+swimmer pair still scores 1 pt but its
 *  steal step is skipped. */
function stealableTargetExists(state: SspState, exceptId: PlayerId): boolean {
  return state.players.some((q) => canAttack(state, exceptId, q) && q.hand.length > 0);
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

      if (endIfMermaidWin(s)) return s;

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
      pushLog(s, { kind: 'drawDiscard', playerId: p.id, pile: action.pile, family: c.family, card: { ...c } });
      if (endIfMermaidWin(s)) return s;
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
      if (!isValidDuoPair(a, b, { waterRodeo: eventAppliesTo(s, p, 'waterRodeo') })) throw new Error('playPair: not a valid pair');
      p.hand = p.hand.filter((c) => c.id !== idA && c.id !== idB);
      p.table.push(a, b);
      pushLog(s, { kind: 'playPair', playerId: p.id, families: [a.family, b.family] });
      // For ambiguous-partner cases (swimmer can pair with shark OR jellyfish),
      // pass both actual families to applyDuoEffect — it dispatches on either.
      // Fish (and Sunfish / Hermit Crab) put cards straight into the hand.
      applyDuoEffect(s, p, a.family as DuoFamily, b.family as DuoFamily);
      endIfMermaidWin(s);
      return s;
    }

    case 'playTrio': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('playTrio: wrong subPhase');
      const p = requireActivePlayer(s);
      const [idA, idB, idC] = action.cardIds;
      const a = p.hand.find((c) => c.id === idA);
      const b = p.hand.find((c) => c.id === idB);
      const c = p.hand.find((c2) => c2.id === idC);
      if (!a || !b || !c) throw new Error('playTrio: card not in hand');
      if (!isValidStarfishTrio(a, b, c, { waterRodeo: eventAppliesTo(s, p, 'waterRodeo') })) {
        throw new Error('playTrio: not a valid starfish trio');
      }
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
      if (endIfMermaidWin(s)) return s;
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'crabPick': {
      if (s.subPhase !== 'awaitingCrabPick') throw new Error('crabPick: wrong subPhase');
      if (s.crabPilesLeft && !s.crabPilesLeft.includes(action.pile)) {
        throw new Error('crabPick: already took a card from that pile (Hermit Crab)');
      }
      const pile = s.discards[action.pile];
      const idx = pile.findIndex((c) => c.id === action.cardId);
      if (idx === -1) throw new Error('crabPick: card not in pile');
      const fromTop = idx === pile.length - 1;
      const card = pile.splice(idx, 1)[0];
      const p = requireActivePlayer(s);
      p.hand.push(card);
      pushLog(s, { kind: 'crabPick', playerId: p.id, pile: action.pile, family: card.family, card: { ...card }, fromTop });
      if (endIfMermaidWin(s)) return s;
      // The Hermit Crab: on to the other pile, if it has cards.
      const left = (s.crabPilesLeft ?? []).filter((i) => i !== action.pile && s.discards[i].length > 0);
      s.crabPilesLeft = left.length ? left : null;
      s.subPhase = left.length ? 'awaitingCrabPick' : 'awaitingPlayOrEnd';
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
      if (target.coralShell) throw new Error('sharkSteal: target is immune (Coral Reef)');
      // Random steal per rulebook.
      const idx = rngInt(s.rngState, target.hand.length);
      const stolen = target.hand.splice(idx, 1)[0];
      const p = requireActivePlayer(s);
      p.hand.push(stolen);
      pushLog(s, { kind: 'sharkSteal', playerId: p.id, targetPlayerId: target.id, family: stolen.family, card: { ...stolen } });

      if (endIfMermaidWin(s)) return s;
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'rodeoLook': {
      if (s.subPhase !== 'awaitingRodeoTarget') throw new Error('rodeoLook: wrong subPhase');
      const p = requireActivePlayer(s);
      const target = rodeoTargets(s, p.id).find((q) => q.id === action.targetPlayerId);
      if (!target) throw new Error('rodeoLook: not a valid target');
      s.pendingRodeo = { targetId: target.id };
      pushLog(s, { kind: 'rodeoLook', playerId: p.id, targetPlayerId: target.id, hand: target.hand.map((c) => ({ ...c })) });
      s.subPhase = 'awaitingRodeoSwap';
      return s;
    }

    case 'rodeoSwap': {
      if (s.subPhase !== 'awaitingRodeoSwap' || !s.pendingRodeo) throw new Error('rodeoSwap: wrong subPhase');
      const p = requireActivePlayer(s);
      const target = playerById(s, s.pendingRodeo.targetId);
      s.pendingRodeo = null;
      if (!action.swap) {
        pushLog(s, { kind: 'rodeoSwap', playerId: p.id, targetPlayerId: target.id, swapped: false });
        s.subPhase = 'awaitingPlayOrEnd';
        return s;
      }
      const [mineId, theirsId] = action.swap;
      const mine = p.hand.findIndex((c) => c.id === mineId);
      const theirs = target.hand.findIndex((c) => c.id === theirsId);
      if (mine === -1 || theirs === -1) throw new Error('rodeoSwap: card not in hand');
      const given = p.hand[mine];
      const taken = target.hand[theirs];
      p.hand[mine] = taken;
      target.hand[theirs] = given;
      pushLog(s, { kind: 'rodeoSwap', playerId: p.id, targetPlayerId: target.id, swapped: true, given: { ...given }, taken: { ...taken } });
      if (endIfMermaidWin(s)) return s;
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'stealPair': {
      if (s.subPhase !== 'awaitingPairSteal') throw new Error('stealPair: wrong subPhase');
      const p = requireActivePlayer(s);
      const [idA, idB] = action.cardIds;
      const pick = stealablePairs(s, p.id).find(({ target, cards }) =>
        target.id === action.targetPlayerId
        && cards.some((c) => c.id === idA) && cards.some((c) => c.id === idB) && idA !== idB);
      if (!pick) throw new Error('stealPair: not a pair in front of an attackable opponent');
      pick.target.table = pick.target.table.filter((c) => c.id !== idA && c.id !== idB);
      p.table.push(...pick.cards);
      pushLog(s, {
        kind: 'pairSteal', playerId: p.id, targetPlayerId: pick.target.id,
        cards: [{ ...pick.cards[0] }, { ...pick.cards[1] }],
      });
      s.subPhase = 'awaitingPlayOrEnd';
      return s;
    }

    case 'placeCoralShell': {
      const p = requireActivePlayer(s);
      if (!canPlaceCoralShell(s, p)) throw new Error('placeCoralShell: not allowed now');
      const idx = p.hand.findIndex((c) => c.id === action.cardId && c.family === 'shell');
      if (idx === -1) throw new Error('placeCoralShell: not a shell in hand');
      const [shell] = p.hand.splice(idx, 1);
      p.coralShell = shell;
      pushLog(s, { kind: 'coralShell', playerId: p.id, card: { ...shell } });
      return s;
    }

    case 'angelfishPick': {
      if (s.subPhase !== 'awaitingAngelfishPick' || !s.pendingAngelfish) throw new Error('angelfishPick: wrong subPhase');
      const pile = s.discards[action.pile];
      if (pile.length === 0) throw new Error('angelfishPick: pile empty');
      const p = requireActivePlayer(s);
      const taken = pile.pop()!;
      p.hand.push(taken);
      pushLog(s, { kind: 'angelfishDraw', playerId: p.id, family: taken.family, card: { ...taken }, pile: action.pile });
      const { via } = s.pendingAngelfish;
      s.pendingAngelfish = null;
      if (endIfMermaidWin(s)) return s;
      continueAfterTurn(s, p, via);
      return s;
    }

    case 'chooseEvent': {
      const choice = s.pendingEventChoice;
      if (s.subPhase !== 'awaitingEventChoice' || !choice) throw new Error('chooseEvent: wrong subPhase');
      if (action.keep !== choice.newEventId && action.keep !== choice.oldEventId) {
        throw new Error('chooseEvent: not one of the two cards');
      }
      const p = playerById(s, choice.playerId);
      p.heldEvents = [action.keep];
      const dropped = action.keep === choice.newEventId ? choice.oldEventId : choice.newEventId;
      pushLog(s, { kind: 'eventDiscarded', eventId: dropped, playerId: p.id, reason: 'choice' });
      s.pendingEventChoice = null;
      s.activePlayerId = choice.resumeActiveId;
      s.subPhase = 'roundEnd';
      return s;
    }

    case 'stop': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('stop: wrong subPhase');
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
      endTurn(s, p, 'lastChance');
      return s;
    }

    case 'pass': {
      if (s.subPhase !== 'awaitingPlayOrEnd') throw new Error('pass: wrong subPhase');
      endTurn(s, requireActivePlayer(s));
      return s;
    }

    case 'nextRound': {
      if (s.subPhase !== 'roundEnd') throw new Error('nextRound: wrong subPhase');
      // If anyone hit the target, try to decide a winner. Two outcomes:
      //   - clean winner → gameOverIfReached flips phase to 'gameOver'.
      //   - true tie → it sets tieBreakerPlayers; we fall through to start
      //                 another round.
      if (s.players.some((p) => p.matchScore >= s.config.targetScore)) {
        gameOverIfReached(s);
        if (s.phase === 'gameOver') return s;
        // tie → continue to startNewRound below.
      } else {
        // No tie pending — clear the flag in case it lingered from a prior tie.
        s.tieBreakerPlayers = undefined;
      }
      startNewRound(s);
      return s;
    }
  }
}

/** Used at game-start to set up the opening hand. Mutates passed state. */
export function setupNewMatch(state: SspState): void {
  // startNewRound counts the round up, so start from 0 — the round-1 event
  // reveal is then logged under round 1.
  state.round = 0;
  startNewRound(state);
  // Active player should be the first seat at match start.
  state.activePlayerId = state.players[0]?.id ?? null;
  state.currentRoundStarterId = state.players[0]?.id ?? null;
}

/** Returns true if the active player can call STOP / LAST CHANCE. */
export function canEndRound(state: SspState): boolean {
  if (!state.activePlayerId) return false;
  if (state.subPhase !== 'awaitingPlayOrEnd') return false;
  if (state.lastChanceFrom) return false; // lastChance window — opponents can't re-trigger
  const p = playerById(state, state.activePlayerId);
  const opts = scoringOptsFor(state, p);
  return tentativeScore(p.hand, p.table, opts) >= stopThresholdFor(state, p);
}

/** Exposed for tests. */
export const _internals = {
  STOP_THRESHOLD,
  scoreRound,
  startNewRound,
  endRound,
  isMultiplierFamily,
};
