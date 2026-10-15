// Set — state, actions, config.
//
// Design notes for the reducer (see reducer.ts):
//
// * Selection lives in state, not in the view. A click is `toggleCard`, and the
//   reducer resolves the group as soon as the selection reaches the rule's size.
//   That keeps every outcome — score, mistake, timing split, board advance — in
//   one pure place, which is what the drill stats and (eventually) the online
//   race arbitration both need.
// * Set is real-time: there is no turn order, so `activePlayerId` is always null.
//   That also keeps GameHost's AI driver and pass-the-device gate inert.
// * `applyAction` must stay pure, so wall-clock time is folded into the action
//   payload (`atMs`) exactly the way player-chosen randomness is elsewhere in the
//   project. The view reads the clock; the reducer only ever does arithmetic.
// * Multiple human seats are shared-screen scoring: whoever spots the group first
//   makes themselves the claimant (number key / seat chip) and their selection is
//   credited to them. One seat — the normal case — never sees this.
// * Not yet modelled: online racing (two peers claiming overlapping cards needs
//   host-authoritative arbitration the net layer can't do yet) and AI opponents.

import type { GameStateShape } from '@/core/module';
import type { PlayerId } from '@/core/types';
import type { CardId } from './cards';
import type { SetModeId } from './modes';

export interface SetConfig {
  modeId: SetModeId;
  /** Practice mode: enables the hint button (which reveals a real group). */
  enableHints: boolean;
}

export type SetHistoryKind = 'set' | 'mistake' | 'boardDone';

export interface SetHistoryEntry {
  kind: SetHistoryKind;
  /** Seat credited (or blamed). Null for board-advance markers. */
  byPlayerId: PlayerId | null;
  cards: CardId[];
  atMs: number;
  /** Time since the previous scoring event, or match start — the drill metric. */
  splitMs: number;
  /** Groups found on the board that just cleared (boardDone only). */
  count?: number;
  /** Why the claim was rejected (mistake only). */
  message?: string;
}

export interface SetResultFlash {
  kind: 'set' | 'error';
  cards: CardId[];
  message: string;
  atMs: number;
}

export interface SetState extends GameStateShape {
  config: SetConfig;
  /** Remaining cards. The board is `deck.slice(0, boardSize)`. */
  deck: CardId[];
  boardSize: number;
  /** Cards the claimant has picked so far (also the revealed cards in Memory). */
  selection: CardId[];
  /** Seat credited with the next completed group. */
  claimantId: PlayerId;
  /** The previous group. Stays on screen, and is reusable in chain modes. */
  lastSet: CardId[];
  /** Group keys already found on the current board (puzzle modes). */
  foundKeys: string[];
  scores: Record<PlayerId, number>;
  mistakes: Record<PlayerId, number>;
  history: SetHistoryEntry[];
  /** Cards currently given away by the hint button, in reveal order. */
  hintCards: CardId[];
  hintsUsed: number;
  /** Timestamp of the first action; the elapsed clock counts from here. */
  startedAtMs: number | null;
  /** Timestamp of the last scoring event, for the next split. */
  lastEventAtMs: number | null;
  /** Transient banner for the UI: last claim's outcome. */
  lastResult: SetResultFlash | null;
}

export type SetAction =
  | { type: 'toggleCard'; cardId: CardId; byPlayerId: PlayerId; atMs: number }
  | { type: 'clearSelection'; atMs: number }
  | { type: 'setClaimant'; playerId: PlayerId }
  | { type: 'addHint'; atMs: number }
  | { type: 'quit'; atMs: number };
