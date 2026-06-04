// 7 Wonders — types. Designed up-front to leave room for the major expansions
// (Leaders, Cities, Babel, Armada, Edifice). Each expansion is its own module
// under src/games/seven-wonders/expansions/<id>/ contributing extra decks,
// extra board slots (e.g. armada fleets), and post-action hooks.
//
// Turn structure — pure deterministic state machine:
// - Each Age, 7 cards dealt per player.
// - Simultaneous: each player picks 1 card from hand, then applies
//   (build / wonder-stage / discard for 3 coins). All applied as a batch.
// - Hands rotate (clockwise in Ages I and III, counter-clockwise in Age II).
// - End of Age: military resolution against L/R neighbors.
// - End of Age III: final scoring across 7 categories (military, treasury,
//   wonder, civilian, commercial, guild, science).

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SwAge = 1 | 2 | 3;

export type SwCardColor =
  | 'brown'    // raw materials
  | 'gray'     // manufactured
  | 'blue'     // civilian (VP)
  | 'yellow'   // commercial
  | 'red'      // military
  | 'green'    // science
  | 'purple';  // guild (Age III)

export interface SwCard {
  id: number;
  name: string;
  age: SwAge;
  color: SwCardColor;
  // Cost / production / chain-link data filled in by the engine. Stubbed for now.
}

export type SwWonderId = string;       // e.g. 'gizah-a', 'gizah-b', 'rhodes-a', ...

export interface SwPlayer {
  id: PlayerId;
  wonderId: SwWonderId;
  hand: SwCard[];
  /** Built cards in tableau, by color. */
  tableau: SwCard[];
  /** Wonder stages built (0..N). */
  wonderStagesBuilt: number;
  coins: number;
  /** Military tokens accumulated (-1, +1, +3, +5 from end-of-age battles). */
  militaryTokens: number[];
  /** Submitted card pick for the current tick, applied on reveal. */
  pendingPick: SwPendingPick | null;
}

export type SwPendingPick =
  | { kind: 'build'; cardId: number; paidLeft: number; paidRight: number }
  | { kind: 'wonder'; cardId: number; paidLeft: number; paidRight: number }
  | { kind: 'discard'; cardId: number };

export interface SwConfig {
  /** Which expansion modules are active. Stub for now. */
  expansions: ('leaders' | 'cities' | 'babel' | 'armada' | 'edifice')[];
  /** Wonder assignment: 'random' | 'pickByHost' | 'preset'. */
  wonderAssignment: 'random' | 'pickByHost' | 'preset';
  /** If 'preset', the assigned wonder per seat (in seat order). */
  presetWonders?: SwWonderId[];
}

export interface SwState {
  phase: GamePhase;
  seats: Seat[];
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: SwConfig;
  age: SwAge;
  /** Within an Age, which "round" — 1 through 6 (last card auto-discards in base 7W). */
  ageRound: number;
  subPhase: 'picking' | 'revealing' | 'militaryResolution' | 'ageEnd' | 'finalScoring';
  players: SwPlayer[];
  /** Discard pile (visible) — used by Halicarnassus stage, Solomon, etc. */
  discard: SwCard[];
}

export type SwAction =
  | { type: 'submitPick'; playerId: PlayerId; pick: SwPendingPick }
  | { type: 'advanceTick' };
