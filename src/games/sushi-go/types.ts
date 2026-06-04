// Sushi Go! Party — types.
//
// A "menu" is the set of 8 card kinds chosen in the lobby:
//   1 nigiri set + 1 roll + 3 appetizers + 3 specials + 1 dessert.
// The chosen menu drives deck composition only; turn flow is identical across
// menus.
//
// Turn structure: every round players are dealt a hand, simultaneously submit
// one pick from their hand, then hands rotate. Engine waits at
// `subPhase: 'selecting'` until all live players have submitted, then
// batch-applies and advances. Three rounds; dessert pile persists across rounds.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SushiGoCategory = 'nigiri' | 'roll' | 'appetizer' | 'special' | 'dessert';

export type SushiGoCardKind =
  // Nigiri set (always one, scored egg/salmon/squid).
  | 'nigiri'
  // Rolls (pick 1).
  | 'maki' | 'temaki' | 'uramaki'
  // Appetizers (pick 3).
  | 'dumpling' | 'tempura' | 'sashimi' | 'mizuOnigiri' | 'tofu' | 'edamame' | 'eel' | 'eggNigiri'
  // Specials (pick 3).
  | 'soySauce' | 'wasabi' | 'tea' | 'specialOrder' | 'takeoutBox' | 'chopsticks' | 'spoon' | 'menu'
  // Desserts (pick 1).
  | 'pudding' | 'greenTeaIceCream' | 'fruit';

/** Some card kinds carry a variant (nigiri = egg/salmon/squid, maki = icon count, fruit = which fruits). */
export interface SushiGoCard {
  id: number;
  kind: SushiGoCardKind;
  /** Free-text discriminator. Documented per-kind in cards.ts. */
  variant?: string;
}

export interface SushiGoConfig {
  /** Exactly 8 unique kinds: 1 nigiri + 1 roll + 3 appetizers + 3 specials + 1 dessert. */
  menu: SushiGoCardKind[];
  /** Number of rounds (party = 3; configurable 1-5 for sanity testing). */
  rounds: number;
}

export interface SushiGoPlayer {
  id: PlayerId;
  hand: SushiGoCard[];
  /** Cards played this round. Order matters for some scoring (wasabi → next nigiri). */
  table: SushiGoCard[];
  /** Cards kept across rounds (dessert only). */
  dessertPile: SushiGoCard[];
  /** This round's submitted pick — set during the selection phase. */
  pendingPick: SushiGoCard[] | null;
  /** Per-round score breakdown; index 0 = round 1 total, etc. */
  scoreByRound: number[];
  /** Dessert score, applied at the end of the match. */
  dessertScore: number;
}

export type SushiGoSubPhase =
  | 'selecting'      // waiting for all players to submit picks
  | 'roundEnd'       // round scored; awaiting next-round confirm
  | 'matchEnd';

export interface SushiGoRoundScore {
  playerId: PlayerId;
  /** Itemized score per kind played this round. */
  perKind: Array<{ kind: SushiGoCardKind; points: number; detail?: string }>;
  /** Sum of perKind. */
  total: number;
}

export interface SushiGoRoundSummary {
  round: number;
  perPlayer: SushiGoRoundScore[];
}

export interface SushiGoState {
  phase: GamePhase;
  seats: Seat[];
  /** Null while in simultaneous selection. */
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: SushiGoConfig;
  round: number;
  subPhase: SushiGoSubPhase;

  /** Whole-round draw deck. Built from the menu. */
  deck: SushiGoCard[];
  players: SushiGoPlayer[];

  /** Last round's score breakdown (shown on the round-end screen). */
  lastRoundSummary: SushiGoRoundSummary | null;
  /** Whether hands rotate clockwise this round (alternates). Default true. */
  passDirection: 'cw' | 'ccw';

  /** Append-only event log for the history sidebar. */
  log: SushiGoLogEntry[];
  logSeq: number;
}

export type SushiGoLogEntry =
  | { seq: number; round: number; kind: 'pickSubmitted'; playerId: PlayerId }
  | { seq: number; round: number; kind: 'pickRevealed'; playerId: PlayerId; cards: { kind: SushiGoCardKind; variant?: string }[] }
  | { seq: number; round: number; kind: 'roundEnd' }
  | { seq: number; round: number; kind: 'matchEnd'; winnerId: PlayerId | null };

export type SushiGoAction =
  /** Player submits their pick (1 card normally; 2 if they have chopsticks/spoon on the table). */
  | { type: 'submitPick'; playerId: PlayerId; cardIds: number[] }
  /** Move from roundEnd to the next round (or to matchEnd if final). */
  | { type: 'nextRound' };
