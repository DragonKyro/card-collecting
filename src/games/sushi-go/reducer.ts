// Sushi Go! Party reducer.
//
// Turn flow (per round):
//   1. subPhase = 'selecting'. Each player submits a pick (1 card, or 2 with
//      chopsticks on the table). Once all live players have submitted, the
//      reveal happens in a single batch inside the same reducer call.
//   2. Reveal: every player's pendingPick moves to their table (in their chosen
//      order so wasabi-before-nigiri ordering is preserved). Chopsticks that
//      were "spent" return to hand. Hands rotate (cw rounds 1+3, ccw round 2).
//   3. If hands are empty after rotation: score the round, move desserts onto
//      the dessert pile, set subPhase = 'roundEnd'. UI shows summary.
//   4. nextRound advances to the next round or, if this was the final round,
//      tallies desserts and transitions to phase = 'gameOver'.

import type { PlayerId } from '@/core/types';
import { rngInt } from '@/core/rng';
import type {
  SushiGoState, SushiGoAction, SushiGoCard, SushiGoPlayer,
  SushiGoRoundSummary, SushiGoLogEntry,
} from './types';
import { buildRoundDeck, handSize, KIND_INFO } from './cards';
import { scoreRound, scoreDesserts, totalRoundScore } from './scoring';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<SushiGoLogEntry, 'seq' | 'round'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: SushiGoState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({ seq: state.logSeq, round: state.round, ...partial } as SushiGoLogEntry);
}

function playerById(state: SushiGoState, id: PlayerId): SushiGoPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

/** Deal hands for the current round. Mutates state. */
export function dealHands(state: SushiGoState): void {
  const size = handSize(state.players.length);
  for (const p of state.players) {
    p.hand = [];
    for (let i = 0; i < size && state.deck.length > 0; i++) {
      p.hand.push(state.deck.pop()!);
    }
    p.pendingPick = null;
  }
}

/** Begin a new round: shuffle deck (or re-use leftover), deal, reset tables. */
function startRound(state: SushiGoState, roundNumber: number): void {
  state.round = roundNumber;
  state.deck = buildRoundDeck(state.rngState, state.config.menu, roundNumber);
  state.passDirection = roundNumber === 2 ? 'ccw' : 'cw';
  for (const p of state.players) {
    p.table = [];
    p.pendingPick = null;
  }
  dealHands(state);
  state.subPhase = 'selecting';
  state.activePlayerId = null;
  state.lastRoundSummary = null;
}

/** Validate that the cards in `cardIds` are all in the player's hand and that
 *  the pick count is legal (1, or 2 if chopsticks present on table). */
function validatePick(player: SushiGoPlayer, cardIds: number[]): void {
  if (cardIds.length === 0) throw new Error('submitPick: must pick at least 1 card');
  if (cardIds.length > 2) throw new Error('submitPick: max 2 cards');
  const seen = new Set<number>();
  for (const id of cardIds) {
    if (seen.has(id)) throw new Error('submitPick: duplicate cardId');
    seen.add(id);
    if (!player.hand.some((c) => c.id === id)) {
      throw new Error('submitPick: card not in hand');
    }
  }
  if (cardIds.length === 2) {
    const hasChopsticks = player.table.some((c) => c.kind === 'chopsticks' && c.variant !== 'used');
    const hasSpoon = player.table.some((c) => c.kind === 'spoon' && c.variant !== 'used');
    if (!hasChopsticks && !hasSpoon) {
      throw new Error('submitPick: 2-card pick requires chopsticks or spoon on table');
    }
  }
}

/** Move a player's pending pick onto their table. Apply chopsticks return-to-hand. */
function applyPickToTable(player: SushiGoPlayer): void {
  if (!player.pendingPick) return;
  const picked = player.pendingPick;
  // Order matters (wasabi must come before nigiri); we use the order the player
  // submitted the cards in (cardIds[]) so the UI controls placement.
  for (const c of picked) {
    player.table.push(c);
  }
  // Remove picked cards from hand
  const pickedIds = new Set(picked.map((c) => c.id));
  player.hand = player.hand.filter((c) => !pickedIds.has(c.id));

  // If 2-card pick, the chopsticks/spoon on the table is "spent" — return it to hand.
  if (picked.length === 2) {
    // Prefer to return chopsticks first, then spoon if no chopsticks.
    const chopIdx = player.table.findIndex((c) => c.kind === 'chopsticks' && c.variant !== 'used');
    if (chopIdx !== -1) {
      const c = player.table.splice(chopIdx, 1)[0];
      player.hand.push(c);
    } else {
      const spoonIdx = player.table.findIndex((c) => c.kind === 'spoon' && c.variant !== 'used');
      if (spoonIdx !== -1) {
        const c = player.table.splice(spoonIdx, 1)[0];
        player.hand.push(c);
      }
    }
  }

  player.pendingPick = null;
}

/** Rotate hands among the players according to passDirection. */
function rotateHands(state: SushiGoState): void {
  const hands = state.players.map((p) => p.hand);
  const n = state.players.length;
  if (state.passDirection === 'cw') {
    // Player i receives player (i-1+n) % n's hand
    for (let i = 0; i < n; i++) {
      state.players[i].hand = hands[(i - 1 + n) % n];
    }
  } else {
    for (let i = 0; i < n; i++) {
      state.players[i].hand = hands[(i + 1) % n];
    }
  }
}

function commitRoundScore(state: SushiGoState): SushiGoRoundSummary {
  const perPlayerScores = scoreRound(state.players);
  const summary: SushiGoRoundSummary = {
    round: state.round,
    perPlayer: state.players.map((p) => {
      const sc = perPlayerScores[p.id];
      const total = totalRoundScore(sc);
      return { playerId: p.id, perKind: sc, total };
    }),
  };
  for (const row of summary.perPlayer) {
    const p = playerById(state, row.playerId);
    // Pad scoreByRound to current round
    while (p.scoreByRound.length < state.round) p.scoreByRound.push(0);
    p.scoreByRound[state.round - 1] = row.total;
  }
  return summary;
}

/** Move dessert cards from each player's table to their dessert pile, and clear
 *  the rest of the table for the next round. */
function harvestDesserts(state: SushiGoState): void {
  for (const p of state.players) {
    const kept: SushiGoCard[] = [];
    const cleared: SushiGoCard[] = [];
    for (const c of p.table) {
      if (KIND_INFO[c.kind].category === 'dessert') kept.push(c);
      else cleared.push(c);
    }
    p.dessertPile.push(...kept);
    p.table = [];
    // Note: cleared cards are simply removed from play (they don't go back to deck).
    void cleared;
  }
}

/** End-of-match: compute dessert bonuses, set finalScores, transition to gameOver. */
function endMatch(state: SushiGoState): void {
  const dessertScores = scoreDesserts(state.players);
  for (const p of state.players) {
    p.dessertScore = dessertScores[p.id] ?? 0;
  }
  state.finalScores = {};
  for (const p of state.players) {
    const total = p.scoreByRound.reduce((s, x) => s + x, 0) + p.dessertScore;
    state.finalScores[p.id] = total;
  }
  state.subPhase = 'matchEnd';
  state.phase = 'gameOver';
  let winnerId: PlayerId | null = null;
  let best = -Infinity;
  for (const p of state.players) {
    const tot = state.finalScores[p.id];
    if (tot > best) { best = tot; winnerId = p.id; }
  }
  pushLog(state, { kind: 'matchEnd', winnerId });
}

/** Returns true if every player has submitted a pick. */
function allPlayersSubmitted(state: SushiGoState): boolean {
  return state.players.every((p) => p.pendingPick !== null);
}

/** Reveal phase: apply picks, log them, rotate hands, then either continue
 *  selecting or score the round. */
function revealAndAdvance(state: SushiGoState): void {
  // Log + apply each pick.
  for (const p of state.players) {
    if (!p.pendingPick) continue;
    pushLog(state, {
      kind: 'pickRevealed',
      playerId: p.id,
      cards: p.pendingPick.map((c) => ({ kind: c.kind, variant: c.variant })),
    });
    applyPickToTable(p);
  }

  // If hands are now empty, the round ends.
  const handsEmpty = state.players.every((p) => p.hand.length === 0);
  if (handsEmpty) {
    const summary = commitRoundScore(state);
    state.lastRoundSummary = summary;
    pushLog(state, { kind: 'roundEnd' });
    harvestDesserts(state);
    state.subPhase = 'roundEnd';
    return;
  }

  // Otherwise rotate hands and continue.
  rotateHands(state);
  state.subPhase = 'selecting';
}

export function applyAction(state: SushiGoState, action: SushiGoAction): SushiGoState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);

  switch (action.type) {
    case 'submitPick': {
      if (s.subPhase !== 'selecting') throw new Error('submitPick: not in selecting phase');
      const p = playerById(s, action.playerId);
      if (p.pendingPick !== null) throw new Error('submitPick: already submitted');
      validatePick(p, action.cardIds);
      const cards = action.cardIds.map((id) => p.hand.find((c) => c.id === id)!);
      p.pendingPick = cards;
      pushLog(s, { kind: 'pickSubmitted', playerId: p.id });

      if (allPlayersSubmitted(s)) {
        revealAndAdvance(s);
      }
      return s;
    }

    case 'nextRound': {
      if (s.subPhase !== 'roundEnd') throw new Error('nextRound: not in roundEnd');
      if (s.round >= s.config.rounds) {
        endMatch(s);
      } else {
        startRound(s, s.round + 1);
      }
      return s;
    }
  }
}

/** Used by module.ts at game start. Mutates state. */
export function setupNewMatch(state: SushiGoState): void {
  for (const p of state.players) {
    p.hand = [];
    p.table = [];
    p.dessertPile = [];
    p.pendingPick = null;
    p.scoreByRound = [];
    p.dessertScore = 0;
  }
  startRound(state, 1);
}

/** Tests + AI may need a peek under the hood. */
export const _internals = {
  rotateHands,
  applyPickToTable,
  commitRoundScore,
  revealAndAdvance,
  rngInt, // re-exported for tests that want to drive the RNG
};
