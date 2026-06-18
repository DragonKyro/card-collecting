// Sea Salt & Paper — types.
//
// 58-card base deck (66 with Extra Salt):
//   Duo:        crab x9, boat x8, fish x7, shark x5, swimmer x5  (34)
//   Collector:  shell x6, octopus x5, penguin x3, sailor x2      (16)
//   Multiplier: lighthouse, shoal, penguinColony, captain (x1)    (4)
//   Mermaid:    x4                                                (4)
//   Extra Salt: jellyfish x2, lobster x1, starfish x3, seahorse x1, crabBasket x1 (+8)
//
// Each card carries one of 11 colors per the published distribution chart
// (white reserved for the 4 mermaids); the color bonus counts the most-
// frequent color group per mermaid held.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SspCardFamily =
  | 'mermaid'
  | 'crab' | 'boat' | 'fish'
  | 'shark' | 'swimmer'
  | 'shell' | 'octopus' | 'penguin' | 'sailor'
  | 'lighthouse' | 'shoal' | 'penguinColony' | 'captain'
  // Extra Salt expansion families. Only present in the deck when
  // config.expansions.extraSalt is true.
  | 'jellyfish' | 'lobster' | 'starfish' | 'seahorse' | 'crabBasket';

// Color palette taken from the official rulebook chart:
//   Dark Blue, Teal, Black, Yellow, Green, Purple, Grey, White, Orange, Pink, Tan
// (`white` is reserved for mermaids; the others are spread across the deck per
// the published distribution table.)
export type SspColor =
  | 'white' | 'yellow' | 'green' | 'pink' | 'purple'
  | 'teal' | 'darkblue' | 'black' | 'gray'
  | 'orange' | 'tan';

export interface SspCard {
  id: number;
  family: SspCardFamily;
  color: SspColor;
}

export interface SspPlayer {
  id: PlayerId;
  hand: SspCard[];
  /** Duo pairs played face-up. Every two consecutive cards form one scored pair,
   *  EXCEPT cards listed in `trios` below — those are scored as a 3-pt group
   *  and skip the duo ability. */
  table: SspCard[];
  /** Each trio is exactly three card ids: 2 duo cards + 1 starfish (Extra Salt).
   *  Scored as 3 pts for the whole trio; the duo's ability does NOT fire. */
  trios?: Array<[number, number, number]>;
  /** Pepper event cards currently held by this player (Extra Pepper). */
  heldEvents?: SspEventId[];
  roundScore: number;
  matchScore: number;
}

export interface SspExpansionConfig {
  /** Mix Extra Salt's 8 cards (jellyfish×2, lobster×2, starfish×2, seahorse, crabBasket) into the main deck. */
  extraSalt: boolean;
  /** Add the Extra Pepper event deck (12 events, one revealed per round, awarded to leader/laggard at round end). */
  extraPepper: boolean;
}

export interface SspConfig {
  /** Match-ending threshold. Default scales with player count. */
  targetScore: number;
  /** Optional expansions; omitted = base game only. */
  expansions?: Partial<SspExpansionConfig>;
}

export type SspSubPhase =
  | 'awaitingAction'      // active player must acquire a card
  | 'awaitingKeep'        // they drew 2, pick which to keep
  | 'awaitingPlayOrEnd'   // optional pair plays, then end turn
  | 'awaitingCrabPick'    // crab ability: pick any card from a discard pile
  | 'awaitingSharkSteal'  // shark+swimmer ability: choose target to steal from
  | 'awaitingLobsterPick' // lobster+crab ability (Salt): keep 1 of top-5 reveal
  | 'roundEnd'            // round over, scores displayed; awaiting nextRound
  | 'gameOver';

export interface SspPlayerRoundScore {
  playerId: PlayerId;
  cardPoints: number;
  colorBonus: number;
  total: number;
  /** True when this player's card points were forfeit because they lost a LAST CHANCE bet. */
  forfeitCards: boolean;
  /** True when the color bonus is shown for reference but does NOT count
   *  toward the round total. Happens on STOP / deck-empty / mermaid-win,
   *  where the special color bonus is only earned on LAST CHANCE. */
  forfeitBonus: boolean;
}

export interface SspRoundSummary {
  round: number;
  endedBy: 'stop' | 'lastChance' | 'deckEmpty' | 'mermaid';
  endedByPlayerId: PlayerId | null;
  /** True if the LAST CHANCE caller won the bet. */
  lastChanceWon: boolean | null;
  perPlayer: SspPlayerRoundScore[];
}

/** Stable identifiers for the 12 Extra Pepper event cards from the official
 *  rulebook. Each event applies to ALL players for the round it's revealed,
 *  then at round end is awarded to either the leader (+) or the laggard (-)
 *  who keeps it (and its rule applies only to them) until they no longer
 *  qualify, at which point it's discarded. */
export type SspEventId =
  // CHANGE EFFECTS OF DUO
  | 'hermitCrab'        // -, crab pair takes one card from EACH discard pile
  | 'sunfish'           // -, fish pair adds the first 2 cards from the deck
  | 'waterRodeo'        // -, swimmer pair = swap a card with opponent; shark pair = steal a pair from opponent tableau
  // CHANGE THE POINT VALUE
  | 'danceOfShells'     // -, each shell scores 2 pts (instead of the collector set)
  | 'kraken'            // -, each octopus scores 1 pt (instead of the collector set)
  | 'tornado'           // +, mermaids score 0; instant win at 4 mermaids still applies
  // CHANGE A RULE
  | 'danceOfMermaids'   // -, 3 mermaids = instant win (was: threeMermaids)
  | 'treasureChest'     // +, must reach 10 pts to call STOP / LAST CHANCE (instead of 7)
  | 'diodonFish'        // +, may not call STOP — must call LAST CHANCE to end the round
  // ADD A NEW RULE
  | 'angelfish'         // -, end of turn: if both discard tops share a color, current player takes one
  | 'dolphins'          // -, when player discards a collector card, draw the top of the deck for free
  | 'coralReef';        // -, may stash a shell face-down — immune to attacks but worth 0 pts (NOT modeled in v1)

/** Display-friendly metadata; see events.ts for the canonical table. */
export interface SspEventCard {
  id: SspEventId;
  name: string;
  /** Every event is awarded to a player at round end:
   *   '+' goes to the round leader,
   *   '-' goes to the laggard.
   *  No "global, discarded after the round" sign exists in the rulebook —
   *  every event has a persistent holder. */
  sign: '+' | '-';
  rule: string;
}

export interface SspEventDeckState {
  /** Remaining event deck. Each entry is an event id (not a full card — full
   *  card metadata is static, looked up from EVENT_BY_ID). */
  deck: SspEventId[];
  /** The event in force this round, or null if none drawn yet (round 1 setup). */
  current: SspEventId | null;
}

/** Structured game-log entry. Rendered as text in the history sidebar; kept as
 *  a discriminated union so the renderer can show pretty names + icons. */
export type SspLogEntry =
  | { seq: number; round: number; kind: 'drawDeck';        playerId: PlayerId; keptFamily: SspCardFamily; discardedFamily: SspCardFamily; toPile: 0 | 1 }
  | { seq: number; round: number; kind: 'drawDiscard';     playerId: PlayerId; pile: 0 | 1; family: SspCardFamily }
  | { seq: number; round: number; kind: 'playPair';        playerId: PlayerId; families: [SspCardFamily, SspCardFamily] }
  | { seq: number; round: number; kind: 'playTrio';        playerId: PlayerId; families: [SspCardFamily, SspCardFamily, SspCardFamily] }
  | { seq: number; round: number; kind: 'crabPick';        playerId: PlayerId; pile: 0 | 1; family: SspCardFamily }
  | { seq: number; round: number; kind: 'sharkSteal';      playerId: PlayerId; targetPlayerId: PlayerId; family: SspCardFamily }
  | { seq: number; round: number; kind: 'fishDraw';        playerId: PlayerId; family: SspCardFamily }
  | { seq: number; round: number; kind: 'lobsterPick';     playerId: PlayerId; family: SspCardFamily }
  | { seq: number; round: number; kind: 'jellyfishLock';   playerId: PlayerId; targetPlayerId: PlayerId }
  | { seq: number; round: number; kind: 'angelfishDraw';   playerId: PlayerId; family: SspCardFamily }
  | { seq: number; round: number; kind: 'eventReveal';     eventId: SspEventId }
  | { seq: number; round: number; kind: 'eventAwarded';    eventId: SspEventId; playerId: PlayerId | null }
  | { seq: number; round: number; kind: 'stop';            playerId: PlayerId; score: number }
  | { seq: number; round: number; kind: 'lastChance';      playerId: PlayerId; score: number }
  | { seq: number; round: number; kind: 'pass';            playerId: PlayerId }
  | { seq: number; round: number; kind: 'roundEnd';        endedBy: SspRoundSummary['endedBy']; endedByPlayerId: PlayerId | null; lastChanceWon: boolean | null }
  | { seq: number; round: number; kind: 'mermaidWin';      playerId: PlayerId }
  | { seq: number; round: number; kind: 'matchEnd';        winnerId: PlayerId | null };

export interface SspState {
  phase: GamePhase;
  seats: Seat[];
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: SspConfig;
  round: number;
  deck: SspCard[];
  /** Two face-up discard piles. Top of pile = last element. */
  discards: [SspCard[], SspCard[]];
  /** Buffer of 2 cards while in awaitingKeep. */
  pendingDraw: SspCard[];
  players: SspPlayer[];
  subPhase: SspSubPhase;
  /** Who called LAST CHANCE this round, if anyone. */
  lastChanceFrom: PlayerId | null;
  /** Seats still to take their final turn after LAST CHANCE was called (in order). */
  lastChanceRemaining: PlayerId[];
  /** Last round's score breakdown, shown on the round-end screen. */
  lastRoundSummary: SspRoundSummary | null;
  /** Set when someone collected 4 mermaids (or 3 with Three Mermaids event) — game ends instantly. */
  mermaidWinnerId: PlayerId | null;
  /** Buffer of 5 cards while the lobster+crab ability is being resolved (Salt). */
  pendingLobsterPick?: SspCard[];
  /** Set when jellyfish+swimmer was just played; the named player is locked
   *  on their next turn (drawPair only, no playPair, must pass). Cleared after
   *  that player takes their next turn. */
  nextTurnLockedPlayerId?: PlayerId | null;
  /** Extra Pepper event-deck state, null when expansion disabled. */
  event?: SspEventDeckState | null;
  /** Append-only game log shown in the history sidebar. */
  log: SspLogEntry[];
  /** Monotonic sequence used as the key for log entries. */
  logSeq: number;
}

export type SspAction =
  // acquire-card phase
  | { type: 'drawPair' }
  | { type: 'keepFromDraw'; keepIndex: 0 | 1; discardToPile: 0 | 1 }
  | { type: 'drawFromDiscard'; pile: 0 | 1 }
  // optional pair plays
  | { type: 'playPair'; cardIds: [number, number] }
  /** Extra Salt: trio play — two duo cards + one starfish, scored as a 3-pt trio,
   *  duo ability skipped. */
  | { type: 'playTrio'; cardIds: [number, number, number] }
  | { type: 'crabPick'; pile: 0 | 1; cardId: number }
  | { type: 'sharkSteal'; targetPlayerId: PlayerId }
  /** Extra Salt: pick one card from the 5-card lobster reveal. */
  | { type: 'lobsterPick'; cardId: number }
  // end-of-turn
  | { type: 'stop' }
  | { type: 'lastChance' }
  | { type: 'pass' }
  // round-end → next round
  | { type: 'nextRound' };
