// Air, Land & Sea — types.
//
// Strict 2-player game by Jon Perry (Arcane Wonders). Rules follow the Revised
// Edition rulebook and card text, plus the Spies, Lies & Supplies (SLS) cards,
// key terms and Epic Mode.
//
// Match: first to `config.targetVp` (12) victory points over a series of
// Battles. A Battle: the deck is the 6 cards (strengths 1–6) of each theater in
// play; each player is dealt 6 (10 in Epic Mode) and the rest stay face down as
// the deck. Players alternate single actions — Deploy (face up, to the matching
// theater; its Tactical Ability fires), Improvise (face down to any theater,
// strength 2, no ability) or Withdraw. The battle ends on a withdrawal or once
// both hands are empty; the player controlling more theaters wins (ties and
// empty theaters go to the 1st player). 6 VP for a battle fought out; a
// withdrawal scores the opponent what the withdrawer's Supreme Commander card
// shows for the cards left in their hand. Between battles the theater row
// rotates one step (rightmost to the left end) and the Supreme Commanders swap.
//
// Abilities resolve through a queue: an Instant ability takes effect right
// after its card is played face up or flipped face up, and when several trigger
// at once they resolve in the order they happened, each fully before the next
// (`state.queue`, `state.frame`). A decision an ability needs from either
// player is `state.pending`; `activePlayerId` points at whoever must answer.
//
// Hidden information: hands, face-down cards and the deck. The full state is
// replicated (project standard) — the UI shows only what the viewing seat may
// know, and the AI decides from `knowledge.ts`'s view, never the raw state.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

// ---------- Theaters ----------

export type AlsTheaterId =
  | 'air' | 'land' | 'sea'          // Air, Land & Sea
  | 'intel' | 'diplo' | 'econ';     // Spies, Lies & Supplies

export interface AlsTheaterDef {
  id: AlsTheaterId;
  name: string;
  shortName: string;
  expansion?: 'spiesLiesSupplies';
}

// ---------- Cards ----------

/** One per Tactical Ability. The three 3s of the base game share `maneuver`,
 *  the three SLS 3s `manipulate` (same text). Strength-6 cards have none. */
export type AlsAbilityKind =
  // Air, Land & Sea
  | 'support' | 'airDrop' | 'maneuver' | 'aerodrome' | 'containment'
  | 'reinforce' | 'ambush' | 'coverFire' | 'disrupt'
  | 'transport' | 'escalation' | 'redeploy' | 'blockade'
  // Spies, Lies & Supplies
  | 'relinquish' | 'envoy' | 'manipulate' | 'leverage' | 'giveAndTake'
  | 'incite' | 'spyNetwork' | 'neutralize' | 'surveil'
  | 'retrofit' | 'supplyLines' | 'requisition' | 'armsRace';

export type AlsAbilityTrigger = 'instant' | 'ongoing';

export interface AlsCardTemplate {
  id: number;
  name: string;
  theater: AlsTheaterId;
  strength: number;          // 1..6
  ability: AlsAbilityKind | null;
  trigger: AlsAbilityTrigger | null;
  /** Printed rules text (no "Instant:" lead — the marker says that). */
  text: string;
  expansion?: 'spiesLiesSupplies';
}

/** A card in a theater. Stacks are bottom-first: the last element is the
 *  uncovered card, every earlier one is covered. */
export interface AlsPlacedCard {
  cardId: number;
  faceDown: boolean;
}

// ---------- Player ----------

export interface AlsPlayer {
  id: PlayerId;
  /** Card ids in hand. */
  hand: number[];
  /** Cumulative match VP. */
  vp: number;
  /** Air Drop: the next card this player plays may go to a non-matching theater. */
  airDrop: boolean;
  /** Cards in this hand the opponent has seen (revealed, or handed over by
   *  Give & Take) — public until they leave the hand. */
  known: number[];
  /** Neutralize: cards that must be played face down the next time this
   *  player plays (one per play, in any order). */
  neutralized: number[];
}

// ---------- Config ----------

export interface AlsExpansionConfig {
  spiesLiesSupplies: boolean;
}

export interface AlsConfig {
  /** Theaters in play: 3 (standard — any three from either box) or 5 (Epic
   *  Mode). With `randomOrder` the first battle's row is shuffled, otherwise
   *  this is the row left to right. */
  theaters: AlsTheaterId[];
  /** Epic Mode picked in the lobby (5 theaters). */
  epic?: boolean;
  /** Deal the theater row in a random order (rulebook setup). Default true. */
  randomOrder?: boolean;
  expansions?: Partial<AlsExpansionConfig>;
  /** Match-end target VP. 12 per rulebook (18 for a longer game). */
  targetVp: number;
  /** Beginner Mode: each battle won scores 1 VP, whatever the withdrawal. */
  beginner?: boolean;
}

// ---------- Ability resolution ----------

/** An Instant ability (or an Envoy trigger) waiting its turn to resolve. */
export interface AlsQueued {
  ability: AlsAbilityKind;
  /** The seat whose ability it is — "you" on the card. */
  owner: 0 | 1;
  /** The card carrying it. */
  sourceCardId: number;
  /** Envoy trigger: the card just played next to the Envoy. */
  coverCardId?: number;
}

/** The ability currently resolving. `step` and `data` are its progress. */
export interface AlsFrame {
  ability: AlsAbilityKind;
  owner: 0 | 1;
  sourceCardId: number;
  /** Theater the source card stood in when the ability began. */
  theaterIdx: number;
  step: number;
  /** Incite: the ability being used "as if it were on this card". */
  viaIncite?: boolean;
  coverCardId?: number;
  /** Card revealed / drawn / theater chosen in an earlier step. */
  cardId?: number;
  pickedTheaterIdx?: number;
  /** The `ability` log entry this frame opened (marked `noEffect` if it fizzles). */
  logSeq?: number;
}

export type AlsPromptKind =
  | 'flip'            // flip one of `cards`
  | 'transport'       // move one of your cards to a different theater (or skip)
  | 'redeployPick'    // return one of your face-down cards to hand (or skip)
  | 'redeployPlay'    // play a card (Redeploy, after returning one)
  | 'reinforce'       // play the drawn card face down to one of `theaters`
  | 'destroyOwn'      // Relinquish: destroy one of your other cards (or skip)
  | 'destroy'         // Relinquish: destroy one of `cards`
  | 'reveal'          // reveal one of `cards` from your hand (optional per `optional`)
  | 'giveOrKeep'      // Give & Take: give the drawn card away, or keep it
  | 'incite'          // use the instant ability of one of `cards`
  | 'name'            // Neutralize: name a card
  | 'retrofit'        // choose one of your uncovered cards
  | 'supply'          // gain supplies in one of `theaters`
  | 'envoy';          // move the Envoy onto the card just played, or not

/** A decision waiting on one player. */
export interface AlsPending {
  seat: 0 | 1;
  prompt: AlsPromptKind;
  /** The ability asking (the copied one under Incite). */
  ability: AlsAbilityKind;
  sourceCardId: number;
  optional: boolean;
  /** Legal card choices (board or hand, by prompt). */
  cards?: number[];
  /** Legal theater choices. */
  theaters?: number[];
  /** Reinforce / Give & Take: the card just drawn (seen by `seat` only). */
  drawnCardId?: number;
  /** Surveil: the card the enemy revealed. */
  revealedCardId?: number;
}

/** An answer to `state.pending`. */
export type AlsAnswer =
  | { kind: 'skip' }
  | { kind: 'card'; cardId: number }
  | { kind: 'theater'; theaterIdx: number }
  | { kind: 'move'; cardId: number; theaterIdx: number }
  | { kind: 'play'; cardId: number; theaterIdx: number; faceDown: boolean }
  | { kind: 'name'; cardId: number }
  | { kind: 'option'; option: 'give' | 'keep' | 'move' | 'stay' };

// ---------- Battle state ----------

export type AlsSubPhase =
  | 'action'       // the turn player deploys / improvises / withdraws
  | 'resolving'    // abilities resolving; `pending` holds the decision
  | 'battleEnd'    // awaiting continueBattle
  | 'gameOver';

export interface AlsBattleResult {
  battleNumber: number;
  endedBy: 'withdraw' | 'fullPlay';
  withdrawerSeatIdx: 0 | 1 | null;
  /** Cards left in the withdrawer's hand. */
  cardsLeft: number | null;
  winnerSeatIdx: 0 | 1;
  vpAwarded: number;
  firstPlayerSeatIdx: 0 | 1;
  theaters: AlsTheaterId[];
  /** Per theater, who controls it (1st player wins ties). */
  theaterControl: Array<0 | 1>;
  theaterStrengths: Array<[number, number]>;
}

export interface AlsState {
  // --- GameStateShape ---
  phase: GamePhase;
  seats: Seat[];
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  // --- ALS ---
  config: AlsConfig;
  /** This battle's theater row, left to right. */
  theaters: AlsTheaterId[];
  /** Face-down deck; the top card is the last element, destroyed cards go to index 0. */
  deck: number[];

  battleNumber: number;
  firstPlayerSeatIdx: 0 | 1;
  /** Whose turn it is (`activePlayerId` may point elsewhere while an ability asks the opponent). */
  turnSeatIdx: 0 | 1;
  players: [AlsPlayer, AlsPlayer];

  /** Per theater (parallel to `theaters`): seat 0's stack, seat 1's stack. */
  board: Array<[AlsPlacedCard[], AlsPlacedCard[]]>;
  /** Per theater: supply tokens on seat 0's and seat 1's side (+1 strength each). */
  supplies: Array<[number, number]>;

  subPhase: AlsSubPhase;
  queue: AlsQueued[];
  frame: AlsFrame | null;
  pending: AlsPending | null;

  lastBattleResult: AlsBattleResult | null;
  log: AlsLogEntry[];
  logSeq: number;
}

// ---------- Log ----------
//
// Entries carry exact card ids. Some are private to one seat — an improvised
// card, a drawn card, a card returned to hand, a face-down card destroyed —
// and the UI shows those to their owner only (`private` names the seat).

export type AlsLogEntry = { seq: number; battle: number } & AlsLogBody;

export type AlsLogBody =
  | { kind: 'battleStart'; firstSeat: 0 | 1; theaters: AlsTheaterId[] }
  | { kind: 'deploy'; seat: 0 | 1; cardId: number; theaterIdx: number; via?: 'airDrop' | 'aerodrome' | 'supplyLines' }
  | { kind: 'improvise'; seat: 0 | 1; cardId: number; theaterIdx: number; private: 0 | 1 }
  | { kind: 'forcedPlay'; seat: 0 | 1; cardId: number; theaterIdx: number; ability: AlsAbilityKind; private: 0 | 1 }
  | { kind: 'withdraw'; seat: 0 | 1; cardsLeft: number }
  | { kind: 'pass'; seat: 0 | 1 }
  | { kind: 'ability'; seat: 0 | 1; cardId: number; ability: AlsAbilityKind; viaIncite?: boolean; noEffect?: boolean }
  | { kind: 'flip'; seat: 0 | 1; cardId: number; ownerSeat: 0 | 1; theaterIdx: number; now: 'up' | 'down' }
  | { kind: 'move'; seat: 0 | 1; cardId: number; faceDown: boolean; from: number; to: number; ability: 'transport' | 'envoy' }
  | { kind: 'toHand'; seat: 0 | 1; cardId: number; from: number; private: 0 | 1 }
  | { kind: 'draw'; seat: 0 | 1; cardId: number; ability: AlsAbilityKind; private: 0 | 1 }
  | { kind: 'give'; seat: 0 | 1; cardId: number }
  | { kind: 'keep'; seat: 0 | 1 }
  | { kind: 'destroy'; seat: 0 | 1 | null; cardId: number; ownerSeat: 0 | 1; theaterIdx: number; faceDown: boolean; reason: 'containment' | 'blockade' | 'relinquish' }
  | { kind: 'reveal'; seat: 0 | 1; cardId: number; ability: AlsAbilityKind }
  | { kind: 'supply'; seat: 0 | 1; theaterIdx: number; amount: number; ability: AlsAbilityKind }
  | { kind: 'name'; seat: 0 | 1; cardId: number; hit: boolean }
  | { kind: 'battleEnd'; result: AlsBattleResult }
  | { kind: 'matchEnd'; winnerSeatIdx: 0 | 1 };

// ---------- Actions ----------

export type AlsAction =
  | { type: 'deploy'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { type: 'improvise'; playerId: PlayerId; cardId: number; theaterIdx: number }
  | { type: 'withdraw'; playerId: PlayerId }
  | { type: 'answer'; playerId: PlayerId; answer: AlsAnswer }
  | { type: 'continueBattle' };
