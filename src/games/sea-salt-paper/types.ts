// Sea Salt & Paper — types.
//
// 58-card deck:
//   Duo:        crab x9, boat x8, fish x7, shark x5, swimmer x5  (34)
//   Collector:  shell x6, octopus x5, penguin x3, sailor x2      (16)
//   Multiplier: lighthouse, shoal, penguinColony, captain (x1)    (4)
//   Mermaid:    x4                                                (4)
//
// Each card carries one of 9 colors (white reserved for mermaids); the color
// bonus counts the most-frequent color group per mermaid held.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SspCardFamily =
  | 'mermaid'
  | 'crab' | 'boat' | 'fish'
  | 'shark' | 'swimmer'
  | 'shell' | 'octopus' | 'penguin' | 'sailor'
  | 'lighthouse' | 'shoal' | 'penguinColony' | 'captain';

export type SspColor =
  | 'white' | 'yellow' | 'green' | 'pink' | 'purple'
  | 'lightblue' | 'darkblue' | 'black' | 'gray';

export interface SspCard {
  id: number;
  family: SspCardFamily;
  color: SspColor;
}

export interface SspPlayer {
  id: PlayerId;
  hand: SspCard[];
  /** Duo pairs played face-up. Every two consecutive cards form one scored pair. */
  table: SspCard[];
  roundScore: number;
  matchScore: number;
}

export interface SspConfig {
  /** Match-ending threshold. Default scales with player count. */
  targetScore: number;
}

export type SspSubPhase =
  | 'awaitingAction'      // active player must acquire a card
  | 'awaitingKeep'        // they drew 2, pick which to keep
  | 'awaitingPlayOrEnd'   // optional pair plays, then end turn
  | 'awaitingCrabPick'    // crab ability: pick any card from a discard pile
  | 'awaitingSharkSteal'  // shark+swimmer ability: choose target to steal from
  | 'roundEnd'            // round over, scores displayed; awaiting nextRound
  | 'gameOver';

export interface SspPlayerRoundScore {
  playerId: PlayerId;
  cardPoints: number;
  colorBonus: number;
  total: number;
  /** True when this player's card points were forfeit because they lost a LAST CHANCE bet. */
  forfeitCards: boolean;
}

export interface SspRoundSummary {
  round: number;
  endedBy: 'stop' | 'lastChance' | 'deckEmpty' | 'mermaid';
  endedByPlayerId: PlayerId | null;
  /** True if the LAST CHANCE caller won the bet. */
  lastChanceWon: boolean | null;
  perPlayer: SspPlayerRoundScore[];
}

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
  /** Set when someone collected 4 mermaids — game ends instantly. */
  mermaidWinnerId: PlayerId | null;
}

export type SspAction =
  // acquire-card phase
  | { type: 'drawPair' }
  | { type: 'keepFromDraw'; keepIndex: 0 | 1; discardToPile: 0 | 1 }
  | { type: 'drawFromDiscard'; pile: 0 | 1 }
  // optional pair plays
  | { type: 'playPair'; cardIds: [number, number] }
  | { type: 'crabPick'; pile: 0 | 1; cardId: number }
  | { type: 'sharkSteal'; targetPlayerId: PlayerId }
  // end-of-turn
  | { type: 'stop' }
  | { type: 'lastChance' }
  | { type: 'pass' }
  // round-end → next round
  | { type: 'nextRound' };
