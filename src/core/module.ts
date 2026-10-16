// The contract every game implements. The engine, store, netcode, and UI shell
// are all written against this — they never name a specific game. To add a new
// game, drop a folder under src/games/<id>/ that exports a GameModule and
// register it in src/games/registry.ts.
//
// Game-specific types are parameterized as <S, A, C>:
//   S — full GameState for this game (must be JSON-serializable for netcode/save)
//   A — Action union for this game (must be JSON-serializable for netcode)
//   C — Config / setup options chosen in the lobby (seat list, expansions, etc.)
//
// Invariants every module must uphold:
//   - applyAction must be PURE: same (state, action) → same next state. No I/O,
//     no Date.now(), no Math.random(). RNG comes from state.rngState (seeded
//     mulberry32 in src/core/rng.ts). Randomness chosen by the acting player
//     (deal, draw) must be folded into the action payload so all peers reduce
//     identically.
//   - createInitialState must accept a seed so peers agree on opening state.
//   - Player visibility (hidden hands) is a UI concern: the full GameState is
//     replicated to every peer. We rely on friends-only honor, no anti-cheat.

import type { PlayerId, Seat, GamePhase } from './types';
export type { Seat };
import type { RngState } from './rng';

// All game states must expose these top-level fields so the shell can render
// turn UI, end-screen, etc., without knowing the game's internals.
export interface GameStateShape {
  phase: GamePhase;
  seats: Seat[];
  /** id of the player whose decision is currently expected, or null if simultaneous / between rounds. */
  activePlayerId: PlayerId | null;
  /** final scores keyed by PlayerId, only populated when phase === 'gameOver'. */
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;
}

export interface GameModule<
  S extends GameStateShape,
  A,
  C,
> {
  /** Stable id used in URLs, lobby messages, registry keys. */
  readonly id: string;
  /** Human-readable name shown in the lobby. */
  readonly name: string;
  /** Short blurb shown in the lobby card. */
  readonly tagline: string;
  /** Allowed player counts (inclusive). */
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Set false for games whose action model can't survive the action-broadcast
   *  net layer (real-time races need host-authoritative arbitration). The lobby
   *  then hides "Host online" for this game. Defaults to true. */
  readonly onlineSupported?: boolean;
  /** Set true to have the game-over "Play again" button return to the lobby
   *  with the finished match's config and seats pre-filled (so options can be
   *  changed before re-dealing) instead of re-dealing immediately. Defaults to
   *  false. */
  readonly replayInLobby?: boolean;

  /** Build the lobby config component's initial value. Pure. */
  defaultConfig(seats: Seat[]): C;

  /** Validate a chosen config — return a list of human-readable errors, [] if OK.
   *  `seats` are the ones the match would start with (omitted when unknown), so
   *  a module can reject settings that depend on player count. */
  validateConfig(config: C, seats?: Seat[]): string[];

  /** Build the opening GameState. Pure given (config, seed, seats). Seats are
   *  passed in so the module can size hands, set the first turn, etc. */
  createInitialState(config: C, seed: number, seats: Seat[]): S;

  /** Reducer. Throws on invalid actions. Must be pure. */
  applyAction(state: S, action: A): S;

  /** Optional AI hook — return next action for `playerId`, or null to pass/end. */
  chooseAIAction?(state: S, playerId: PlayerId): A | null;

  /** Optional async setup the shell awaits before starting a match on the
   *  device that drives the AI (local play, or the online host) — e.g.
   *  fetching trained policy files. Once it resolves, `chooseAIAction` must be
   *  able to answer synchronously. Rejecting aborts the start with the error. */
  prepare?(config: C, seats: Seat[]): Promise<void>;

  /** Optional thumbnail rendered on the game picker. Game-agnostic shell never imports
   *  game art directly — modules render their own SVG inline. */
  Thumbnail?: React.ComponentType;

  /** Lazy-loaded UI bundle: lobby config form + in-game view. */
  ui: () => Promise<GameUiBundle<S, A, C>>;
}

// Loaded on demand so the lobby doesn't pay the React-tree cost for every game.
export interface GameUiBundle<S, A, C> {
  LobbyConfig: React.ComponentType<{
    config: C;
    seats: Seat[];
    onChange: (config: C) => void;
  }>;
  GameView: React.ComponentType<{
    state: S;
    localPlayerId: PlayerId | null;
    dispatch: (action: A) => void;
  }>;
  /** Optional rules-and-references panel. When present, the lobby renders a
   *  "Rules" button that opens this in a modal. Should cover gameplay summary
   *  and any reference tables (card frequencies, scoring tables, etc.). */
  Rules?: React.ComponentType;
}

export type AnyGameModule = GameModule<GameStateShape, unknown, unknown>;
