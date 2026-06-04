// Sea Salt & Paper — types.
//
// Quick-summary of the engine's eventual responsibilities (deferred to the
// game's own phase):
// - Deck of 58 cards across 7 suits/families: Mermaid, Collector, Penguin/Sailor
//   duo, Crab/Boat/Fish/Shell pairs, Lighthouse/Anchor pairs, Captain, Shark,
//   Swimmer-vs-Shark, Sirène/Sailor (canonical list TBD when we implement).
// - Each turn: draw 2 (keep 1 or both), then optionally play a pair for its
//   ability. End-of-turn: call STOP, LAST CHANCE (peer-relative), or pass.
// - "STOP" → score immediately; round ends. "LAST CHANCE" → each other player
//   gets one more turn; if your score still wins, +bonus, else -bonus.
// - Multi-round: first to N (config) ends the match.
// - Mermaid + Collector sets and other scoring patterns drive the "hand collect"
//   loop; this is the "card collecting" identity for this game.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SspCardFamily =
  | 'mermaid' | 'collector' | 'penguin' | 'sailor'
  | 'crab' | 'boat' | 'fish' | 'shell'
  | 'lighthouse' | 'anchor'
  | 'captain' | 'shark' | 'swimmer' | 'siren';

export interface SspCard {
  id: number;
  family: SspCardFamily;
  /** Some families have suit colors (e.g. mermaid has 4 colors). */
  color?: string;
}

export interface SspPlayer {
  id: PlayerId;
  hand: SspCard[];
  /** Cards played face-up (pairs / abilities). */
  table: SspCard[];
  roundScore: number;
  matchScore: number;
}

export interface SspConfig {
  targetScore: number;     // points to end the match (default 35 for 2p, 40 for 3p, etc.)
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
  discard: SspCard[];
  players: SspPlayer[];
  subPhase: 'draw' | 'play' | 'stopVote' | 'lastChance' | 'roundEnd';
  /** When someone calls "LAST CHANCE", track who and the remaining seats to act. */
  lastChanceFrom: PlayerId | null;
  lastChanceRemaining: PlayerId[];
}

export type SspAction =
  | { type: 'drawPair' }
  | { type: 'keepFromDraw'; cardIds: number[]; discardCardId: number | null }
  | { type: 'playPair'; cardIds: [number, number] }
  | { type: 'stop' }
  | { type: 'lastChance' }
  | { type: 'pass' };
