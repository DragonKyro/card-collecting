// Sea Salt & Paper — types.
//
// 58-card base deck (66 with Extra Salt):
//   Duo:        crab x9, boat x8, fish x7, shark x5, swimmer x5  (34)
//   Collector:  shell x6, octopus x5, penguin x3, sailor x2      (16)
//   Multiplier: lighthouse, shoal, penguinColony, captain (x1)    (4)
//   Mermaid:    x4                                                (4)
//   Extra Salt: jellyfish x2, lobster x1, starfish x3, seahorse x1, crabBasket x1 (+8)
//
// Each card carries one of 11 colors per the distribution chart (white: the
// 4 mermaids and the Extra Salt seahorse); the color bonus counts the most-
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
// (`white` is the mermaids and the seahorse; the others are spread across the
// deck per the distribution table.)
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
  /** Pepper event cards currently held by this player (Extra Pepper) — at
   *  most one. */
  heldEvents?: SspEventId[];
  /** The Coral Reef (Pepper): a shell placed face down in front of the
   *  player. Worth no points; while it's there the player is immune to
   *  attacks. Cleared with the table at round start. */
  coralShell?: SspCard | null;
  roundScore: number;
  matchScore: number;
}

export interface SspExpansionConfig {
  /** Mix Extra Salt's 8 cards (jellyfish×2, lobster×1, starfish×3, seahorse, crabBasket) into the main deck. */
  extraSalt: boolean;
  /** Add the Extra Pepper event deck (12 events, one revealed per round, awarded to leader/laggard at round end). */
  extraPepper: boolean;
}

/** Difficulty of the AI seats — each is a trained policy (see aiLevels.ts). */
export type SspAiLevel = 'easy' | 'normal' | 'hard';

export interface SspConfig {
  /** Match-ending threshold. Default scales with player count. */
  targetScore: number;
  /** Optional expansions; omitted = base game only. */
  expansions?: Partial<SspExpansionConfig>;
  /** Difficulty of every AI seat in the match; omitted = 'normal'. */
  aiLevel?: SspAiLevel;
}

export type SspSubPhase =
  | 'awaitingAction'      // active player must acquire a card
  | 'awaitingKeep'        // they drew 2, pick which to keep
  | 'awaitingPlayOrEnd'   // optional pair plays, then end turn
  | 'awaitingCrabPick'    // crab ability: pick any card from a discard pile (Hermit Crab: from each)
  | 'awaitingSharkSteal'  // shark+swimmer ability: choose target to steal from
  | 'awaitingLobsterPick' // lobster+crab ability (Salt): keep 1 of top-5 reveal
  | 'awaitingRodeoTarget' // swimmer pair (Water Rodeo): choose whose hand to look at
  | 'awaitingRodeoSwap'   // …then swap one card with them, or not
  | 'awaitingPairSteal'   // shark pair (Water Rodeo): take a pair from an opponent's table
  | 'awaitingAngelfishPick' // end of turn (Angelfish): take one of the two same-colour tops
  | 'roundEnd'            // round over, scores displayed; awaiting nextRound
  | 'awaitingEventChoice' // round over; the event winner already holds one — keep which?
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
  /** Per-category point breakdown for analytics. The sum of the categories
   *  equals cardPoints + colorBonus (before any forfeit). Optional for legacy
   *  matches that pre-date this field. */
  breakdown?: {
    duos: number;
    sets: number;
    multipliers: number;
    trios: number;
    mermaidClaim: number;
    colorBonus: number;
  };
  /** Number of cards on the player's hand+table at scoring time. Used for
   *  cumulative-cards / avg-pts-per-card analytics. Optional for legacy. */
  cardCount?: number;
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
 *  then at round end is awarded to the sole leader (+) or the sole laggard
 *  (-) — discarded on a tie — who keeps it (its rule now applies only to
 *  them) until they no longer hold that place. See events.ts. */
export type SspEventId =
  // CHANGE EFFECTS OF DUO
  | 'hermitCrab'        // -, crab pair takes one card from EACH discard pile
  | 'sunfish'           // -, fish pair adds the first 2 cards from the deck
  | 'waterRodeo'        // -, swimmer pair = look at a hand, swap a card; shark pair = steal a pair from a table
  // CHANGE THE POINT VALUE
  | 'danceOfShells'     // -, each shell scores 2 pts (instead of the collector set)
  | 'kraken'            // +, each octopus scores 1 pt (instead of the collector set)
  | 'tornado'           // +, mermaids score 0; instant win at 4 mermaids still applies
  // CHANGE A RULE
  | 'danceOfMermaids'   // -, 3 mermaids = instant win
  | 'treasureChest'     // +, must reach 10 pts to call STOP / LAST CHANCE (instead of 7)
  | 'diodonFish'        // +, may not call STOP — must call LAST CHANCE to end the round
  // ADD A NEW RULE
  | 'angelfish'         // -, end of turn: if both discard tops share a color, take one of them
  | 'dolphins'          // -, when player discards a collector card, draw the top of the deck for free
  | 'coralReef';        // -, may place a shell face down — immune to attacks, the shell scores 0

/** Display-friendly metadata; see events.ts for the canonical table. */
export interface SspEventCard {
  id: SspEventId;
  name: string;
  /** Who the card goes to at round end — chosen to even the match out:
   *   '+' (a handicap) goes to the player with the most points,
   *   '-' (a boost) to the player with the fewest. */
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
 *  a discriminated union so the renderer can show pretty names + icons.
 *
 *  `card` on card-movement entries is the exact card moved (optional only so
 *  hand-built test logs and pre-existing states stay valid). Visibility is a
 *  reader concern — see knowledge.ts for what each seat may learn from an entry.
 *  `fromTop` on crabPick: the card was the pile's visible top, so everyone saw
 *  it go; a card dug from lower in the pile is seen only by the picker.
 *  `auto` on crabPick: taken without looking through the pile (legacy Hermit
 *  Crab logs; Hermit Crab picks now look through each pile like any crab).
 *  Water Rodeo: `hand` on rodeoLook is seen by the looker only; `given` /
 *  `taken` on rodeoSwap by the two players involved — everyone else only
 *  sees whether cards changed hands. `card` on coralShell is face down. */
export type SspLogEntry =
  | { seq: number; round: number; kind: 'drawDeck';        playerId: PlayerId; keptFamily: SspCardFamily; discardedFamily: SspCardFamily; toPile: 0 | 1 }
  | { seq: number; round: number; kind: 'drawDiscard';     playerId: PlayerId; pile: 0 | 1; family: SspCardFamily; card?: SspCard }
  | { seq: number; round: number; kind: 'playPair';        playerId: PlayerId; families: [SspCardFamily, SspCardFamily] }
  | { seq: number; round: number; kind: 'playTrio';        playerId: PlayerId; families: [SspCardFamily, SspCardFamily, SspCardFamily] }
  | { seq: number; round: number; kind: 'crabPick';        playerId: PlayerId; pile: 0 | 1; family: SspCardFamily; card?: SspCard; fromTop?: boolean; auto?: boolean }
  | { seq: number; round: number; kind: 'sharkSteal';      playerId: PlayerId; targetPlayerId: PlayerId; family: SspCardFamily; card?: SspCard }
  | { seq: number; round: number; kind: 'fishDraw';        playerId: PlayerId; family: SspCardFamily }
  | { seq: number; round: number; kind: 'lobsterPick';     playerId: PlayerId; family: SspCardFamily }
  | { seq: number; round: number; kind: 'jellyfishLock';   playerId: PlayerId; targetPlayerId: PlayerId }
  | { seq: number; round: number; kind: 'jellyfishDraw';   playerId: PlayerId; family: SspCardFamily }
  | { seq: number; round: number; kind: 'angelfishDraw';   playerId: PlayerId; family: SspCardFamily; card?: SspCard; pile?: 0 | 1 }
  | { seq: number; round: number; kind: 'rodeoLook';       playerId: PlayerId; targetPlayerId: PlayerId; hand?: SspCard[] }
  | { seq: number; round: number; kind: 'rodeoSwap';       playerId: PlayerId; targetPlayerId: PlayerId; swapped: boolean; given?: SspCard; taken?: SspCard }
  | { seq: number; round: number; kind: 'pairSteal';       playerId: PlayerId; targetPlayerId: PlayerId; cards: [SspCard, SspCard] }
  | { seq: number; round: number; kind: 'coralShell';      playerId: PlayerId; card?: SspCard }
  | { seq: number; round: number; kind: 'eventReveal';     eventId: SspEventId }
  /** playerId null only in legacy logs (the card was discarded). */
  | { seq: number; round: number; kind: 'eventAwarded';    eventId: SspEventId; playerId: PlayerId | null }
  /** 'tie' — nobody was alone in first / last place to take it; 'lostPlace' —
   *  its holder is no longer in that place; 'choice' — its holder kept the
   *  other card. */
  | { seq: number; round: number; kind: 'eventDiscarded';  eventId: SspEventId; playerId: PlayerId | null; reason: 'tie' | 'lostPlace' | 'choice' }
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
  /** Seat that STARTED the current round (i.e. the player who took the first
   *  turn). Rotates round-to-round per rulebook ("dealer passes to the left"):
   *  starter(round N+1) = nextSeat(starter(round N)). Tracked separately from
   *  activePlayerId so the rotation isn't biased by who ENDED the round.
   *  Optional for legacy state. */
  currentRoundStarterId?: PlayerId | null;
  /** Seats still to take their final turn after LAST CHANCE was called (in order). */
  lastChanceRemaining: PlayerId[];
  /** Last round's score breakdown, shown on the round-end screen. */
  lastRoundSummary: SspRoundSummary | null;
  /** Per-round summary history for the entire match, used by the post-match
   *  stats screen (cumulative score graph, STOP/LAST CHANCE history, etc.).
   *  Appended every time a round ends. */
  roundHistory: SspRoundSummary[];
  /** Set when someone collected 4 mermaids (3 under Dance of the Mermaids) — game ends instantly. */
  mermaidWinnerId: PlayerId | null;
  /** Buffer of 5 cards while the lobster+crab ability is being resolved (Salt). */
  pendingLobsterPick?: SspCard[];
  /** Players locked by a jellyfish + swimmer pair (every opponent of whoever
   *  played it). A locked player's next turn is only "take the top card of
   *  the deck" — no discard pile, no pairs, no STOP / LAST CHANCE — so the
   *  game plays it for them as it comes up and removes them from the list. */
  lockedPlayerIds?: PlayerId[];
  /** Extra Pepper event-deck state, null when expansion disabled. */
  event?: SspEventDeckState | null;
  /** The Hermit Crab (Pepper): piles the active player still takes a card
   *  from during this crab pick. Null for an ordinary crab (one pile, any). */
  crabPilesLeft?: Array<0 | 1> | null;
  /** The Angelfish (Pepper): set while the active player picks a top; `via`
   *  is how their turn ended, so play resumes the same way afterwards. */
  pendingAngelfish?: { via: 'pass' | 'lastChance' } | null;
  /** Water Rodeo (Pepper): whose hand the active player is looking at. */
  pendingRodeo?: { targetId: PlayerId } | null;
  /** Round end (Pepper): `playerId` won `newEventId` while holding
   *  `oldEventId` and must keep one. `resumeActiveId` is restored after. */
  pendingEventChoice?: {
    playerId: PlayerId;
    newEventId: SspEventId;
    oldEventId: SspEventId;
    resumeActiveId: PlayerId | null;
  } | null;
  /** When 2+ players reach the target score in the same round AND tie on
   *  every tiebreaker (score, then mermaid count), the rulebook calls for
   *  another round. Set on the round-end transition; cleared when the tie
   *  is broken in a subsequent round. */
  tieBreakerPlayers?: PlayerId[];
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
  // Extra Pepper
  /** Water Rodeo swimmer pair: look at this opponent's hand. */
  | { type: 'rodeoLook'; targetPlayerId: PlayerId }
  /** …then swap [one of yours, one of theirs], or null to swap nothing. */
  | { type: 'rodeoSwap'; swap: [number, number] | null }
  /** Water Rodeo shark pair: move one of the opponent's played pairs to your table. */
  | { type: 'stealPair'; targetPlayerId: PlayerId; cardIds: [number, number] }
  /** The Coral Reef: place a shell from your hand face down. */
  | { type: 'placeCoralShell'; cardId: number }
  /** The Angelfish: take the top card of this pile. */
  | { type: 'angelfishPick'; pile: 0 | 1 }
  /** Round end: keep this event card (the new one or the one already held). */
  | { type: 'chooseEvent'; keep: SspEventId }
  // end-of-turn
  | { type: 'stop' }
  | { type: 'lastChance' }
  | { type: 'pass' }
  // round-end → next round
  | { type: 'nextRound' };
