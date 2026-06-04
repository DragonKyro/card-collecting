// Air, Land & Sea — types.
//
// Strict 2-player alternating-turn game by Arcane Wonders / Jon Perry.
//
// Match: first to ≥ 12 victory points (VP) across a series of Battles.
//
// Battle: 18-card deck (6 each for Air, Land, Sea — strengths 1–6 per theater),
//   3 Theater columns in play (left-to-right). Each player gets 6 cards in hand.
//   Players alternate single actions: Deploy (face-up to matching theater),
//   Improvise (face-down to any theater; strength 2; no ability), or Withdraw.
//   Battle ends when either player withdraws or both hands are empty.
//   Winner controls 2+ theaters (more total strength on their side; ties go to
//   1st player). 6 VP for a full-hand win, less for early withdrawal — see
//   `WITHDRAW_VP_CHART` in scoring.ts.
//   Between battles: shift theaters right→left (rotate), swap 1st player.
//
// Spies, Lies, & Supplies expansion adds 3 more theaters (Intelligence, Diplomacy,
//   Economics, each with 6 cards strengths 1–6), Supply Tokens that sit on a
//   theater (not on a card) and add raw strength, and Epic Mode (5 theaters
//   instead of 3, each player gets 9 cards instead of 6).
//
// Hidden information: face-down cards are stored in state with `faceDown: true`
//   (and the card identity is known to all peers — full state replication is
//   the project standard). The UI gates rendering — opponent face-down cards
//   are shown as backs to non-owners. Friends-only honor, no anti-cheat.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

// ---------- Theaters ----------

export type AlsTheaterId =
  | 'air' | 'land' | 'sea'         // base game
  | 'intel' | 'diplo' | 'econ';    // Spies, Lies, & Supplies

export interface AlsTheaterDef {
  id: AlsTheaterId;
  name: string;          // display name
  shortName: string;     // 3-4 char label
  expansion?: 'spiesLiesSupplies';
}

// ---------- Cards ----------

/** Ability identifiers — one per unique card in the 36-card combined deck.
 *  The 6-strength card in each theater intentionally has no ability (six-strength
 *  cards are pure raw power, per the official rulebook).
 *
 *  Some ability names not finalized from rulebook are tagged `// TODO`. Cards
 *  with TODO abilities fall back to "no-op" behavior in `abilities.ts` (placed
 *  face-up at full strength but no special effect fires). Hidden-information
 *  and strength-based gameplay still works; only the special effect is missing. */
export type AlsAbilityKind =
  // --- Base game (12 + 3 sixes = 15 unique abilities, 18 cards) ---
  // Air theater (1-6)
  | 'transport'        // Air 1, Instant: move 1 of your cards to a different theater (does not trigger when placed).
  | 'escalation'       // Air 2, Ongoing: your face-down cards are strength 4.
  | 'support'          // Air 3, Ongoing: +3 strength to each adjacent theater (your side).
  | 'aerodrome'        // Air 4, Ongoing: you may deploy strength 1-3 cards into any theater.
  | 'containment'      // Air 5, Ongoing: if a face-down card is played by either player, it is immediately discarded.
  | 'heavyBombers'     // Air 6, no ability.
  // Land theater (1-6)
  | 'maneuver'         // Land 1, Instant: flip 1 Battle card in an adjacent theater.
  | 'ambush'           // Land 2, Instant: flip 1 uncovered Battle card in any theater. (See note in abilities.ts.)
  | 'coverFire'        // Land 3, Ongoing: any card under this is strength 4.
  | 'disrupt'          // Land 4, Instant: opponent flips 1 of their uncovered cards. Then you flip 1 of yours.
  | 'reinforce'        // Land 5, Instant: look at the top card of the deck; you may play it face-down to any theater.
  | 'heavyTanks'       // Land 6, no ability.
  // Sea theater (1-6)
  | 'transportSea'     // Sea 1, Instant: move 1 of your cards to a different theater. (Same effect as Air-Transport — rulebook gives Sea a name like "Maneuver" or own variant; modeled identically.)
  | 'redeploy'         // Sea 2, Instant: return 1 of your face-down cards to your hand. Take another turn.
  | 'blockade'         // Sea 3, Ongoing: if opponent has 3+ cards on their side of an adjacent theater after playing into it, discard the newly played card.
  | 'airDrop'          // Sea 4, Instant: on your next turn, you may deploy a card to a non-matching theater.
  | 'coverFireSea'     // Sea 5, treated identically to Cover Fire — placeholder name; one of the strength-5s holds Cover Fire. See cards.ts mapping notes.
  | 'superBattleship'  // Sea 6, no ability.

  // --- Spies, Lies, & Supplies (3 more theaters × 6 = 18 cards) ---
  // Authoritative card-by-card text was not available at planning time; these
  // are placeholder slots wired to the same dispatch mechanism. Cards exist
  // in state, are dealt and played normally, but their abilities are no-ops
  // until filled in from rulebook. The state machine doesn't care.
  // Intelligence theater
  | 'intel1' | 'intel2' | 'intel3' | 'intel4' | 'intel5' | 'intel6'
  // Diplomacy theater
  | 'diplo1' | 'diplo2' | 'diplo3' | 'diplo4' | 'diplo5' | 'diplo6'
  // Economics theater
  | 'econ1' | 'econ2' | 'econ3' | 'econ4' | 'econ5' | 'econ6';

export type AlsAbilityTrigger = 'instant' | 'ongoing';

export interface AlsCardTemplate {
  id: number;
  name: string;
  theater: AlsTheaterId;
  strength: number;          // 1..6
  ability: AlsAbilityKind | null;
  trigger: AlsAbilityTrigger | null;
  abilityText: string;       // human-readable rules text (for tooltips + cheatsheet)
  expansion?: 'spiesLiesSupplies';
}

/** A placed card on a theater stack. Stored as a reference into the deck pool
 *  by `cardId`, plus the face-up/face-down state. Bottom-first ordering — the
 *  last element of the array is the "top" card (the only one eligible to be
 *  flipped by an ability). */
export interface AlsPlacedCard {
  cardId: number;
  faceDown: boolean;
}

// ---------- Player ----------

export interface AlsPlayer {
  id: PlayerId;
  /** Cards in hand by id. The full card objects live in `state.deckPool` indexed by id. */
  hand: number[];
  /** Per-battle: has this player been granted an Air Drop next-turn override?
   *  If true, their NEXT deploy may go to a non-matching theater. Consumed on use. */
  airDropArmed: boolean;
  /** Cumulative match VP. */
  vp: number;
}

// ---------- Config ----------

export interface AlsExpansionConfig {
  spiesLiesSupplies: boolean;
}

export interface AlsConfig {
  /** Which theaters to use this match. Length must be 3 or 5. Order matters —
   *  this is the L→R column order on the board for Battle #1. Subsequent
   *  battles rotate this list one position to the left (front element wraps to
   *  the back) per rulebook. */
  theaters: AlsTheaterId[];
  /** Optional expansions; omitted = base game only. */
  expansions?: Partial<AlsExpansionConfig>;
  /** Match-end target VP. Default 12. */
  targetVp: number;
}

// ---------- Battle state ----------

export type AlsSubPhase =
  | 'awaitingAction'              // active player must deploy/improvise/withdraw
  | 'awaitingFlipTarget'          // Maneuver / Ambush / Disrupt waiting for a card pick
  | 'awaitingTransportTarget'     // Transport waiting for: which card, which destination theater
  | 'awaitingRedeployTarget'      // Redeploy waiting for which face-down card to recall
  | 'awaitingReinforcePlacement'  // Reinforce: which theater to place top-of-deck face-down (or skip)
  | 'awaitingDisruptSelf'         // Disrupt: opponent's flip done, now active player flips one of their own
  | 'battleEnd'                   // battle resolved; awaiting continueBattle
  | 'gameOver';

export type AlsPendingAbility =
  | { kind: 'maneuver'; sourceCardId: number; sourceTheaterIdx: number }
  | { kind: 'ambush'; sourceCardId: number }
  | { kind: 'transport'; sourceCardId: number; chooserSeatIdx: 0 | 1; pickedCardId?: number; pickedFromTheaterIdx?: number }
  | { kind: 'redeploy'; sourceCardId: number }
  | { kind: 'reinforce'; sourceCardId: number; revealedTopCardId: number | null }
  | { kind: 'disrupt'; sourceCardId: number; chooserSeatIdx: 0 | 1; opponentFlippedYet: boolean };

export interface AlsBattleResult {
  battleNumber: number;
  endedBy: 'withdraw' | 'fullPlay';
  withdrawerSeatIdx: 0 | 1 | null;     // null when full-play
  winnerSeatIdx: 0 | 1 | null;          // null if tied (can't happen with first-player tiebreak)
  vpAwardedToWinner: number;
  /** Per-theater control by seat index. First-player tiebreak resolves ties. */
  theaterControl: Array<0 | 1>;
  /** Per-theater (idx, seat) total strength snapshot for display. */
  theaterStrengths: Array<[number, number]>;
}

export interface AlsState {
  // --- GameStateShape ---
  phase: GamePhase;
  seats: Seat[];
  /** Whose decision is expected. In ALS this points at the active turn-taker. */
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  // --- ALS-specific ---
  config: AlsConfig;

  /** Static card pool indexed by id (all 18 or 36 cards depending on expansion).
   *  Never mutated mid-match — cards in hand / on stacks / in deck reference by id. */
  deckPool: Record<number, AlsCardTemplate>;
  /** Cards remaining in the draw deck (top of deck = last element). For ALS this
   *  is mostly used for Reinforce's "look at top of deck"; the rest of the deck
   *  isn't drawn during a battle. */
  deck: number[];
  /** Cards discarded mid-battle (Containment, Blockade send improvises here). */
  discard: number[];

  /** Match state. */
  battleNumber: number;                    // 1-indexed
  firstPlayerSeatIdx: 0 | 1;
  players: [AlsPlayer, AlsPlayer];

  /** Per-theater played cards: parallel to `config.theaters`, two stacks (seat 0 / seat 1). */
  playedCards: Array<[AlsPlacedCard[], AlsPlacedCard[]]>;
  /** Per-theater Supply Tokens (SLS): parallel to `config.theaters`, two counts. */
  supplyTokens: Array<[number, number]>;

  subPhase: AlsSubPhase;
  pendingAbility: AlsPendingAbility | null;

  /** Set when a battle ends — drives the battle-summary modal. */
  lastBattleResult: AlsBattleResult | null;

  /** Append-only event log for the sidebar history. */
  log: AlsLogEntry[];
  logSeq: number;
}

// ---------- Logging ----------

export type AlsLogEntry =
  | { seq: number; battle: number; kind: 'deploy'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { seq: number; battle: number; kind: 'improvise'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { seq: number; battle: number; kind: 'withdraw'; playerId: PlayerId; cardsLeftInHand: number }
  | { seq: number; battle: number; kind: 'flip'; playerId: PlayerId; cardId: number; theaterIdx: number; now: 'up' | 'down' }
  | { seq: number; battle: number; kind: 'transport'; playerId: PlayerId; cardId: number; fromTheaterIdx: number; toTheaterIdx: number }
  | { seq: number; battle: number; kind: 'redeploy'; playerId: PlayerId; cardId: number; fromTheaterIdx: number }
  | { seq: number; battle: number; kind: 'reinforce'; playerId: PlayerId; cardId: number; theaterIdx: number | null }
  | { seq: number; battle: number; kind: 'containment'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { seq: number; battle: number; kind: 'blockade'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { seq: number; battle: number; kind: 'supplyTokenPlaced'; playerId: PlayerId; theaterIdx: number; tokens: number }
  | { seq: number; battle: number; kind: 'battleEnd'; result: AlsBattleResult }
  | { seq: number; battle: number; kind: 'matchEnd'; winnerSeatIdx: 0 | 1 | null };

// ---------- Actions ----------

export type AlsAction =
  | { type: 'deploy'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { type: 'improvise'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { type: 'withdraw'; playerId: PlayerId }
  // Ability follow-ups:
  | { type: 'chooseFlipTarget'; playerId: PlayerId; theaterIdx: number; sideIdx: 0 | 1 }
  | { type: 'chooseTransportCard'; playerId: PlayerId; theaterIdx: number; cardId: number }
  | { type: 'chooseTransportDestination'; playerId: PlayerId; theaterIdx: number }
  | { type: 'chooseRedeployTarget'; playerId: PlayerId; theaterIdx: number; cardId: number }
  | { type: 'reinforcePlace'; playerId: PlayerId; theaterIdx: number | null }   // null = skip / decline
  // Bookkeeping:
  | { type: 'continueBattle' }
  | { type: 'continueMatch' };
