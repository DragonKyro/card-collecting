// Expansion module contract for 7 Wonders.
//
// Each expansion owns a folder under `expansions/<id>/` and exports a
// `SwExpansion`. The base reducer is expansion-agnostic — it calls the hooks
// listed here without ever switching on a specific expansion id.
//
// Hooks fall into three buckets:
//   1. Setup hooks (setupMatch / beforeAgeStart) — let the expansion insert
//      pre-game and between-age phases (e.g., Leaders draft).
//   2. Reducer hooks (applyAction / nextAIPicker / chooseAIAction) — let the
//      expansion own its own subPhase + action types. The base reducer routes
//      unknown action types here.
//   3. Mutation hooks (modifyCost / onEvent / scoreExtras) — let the expansion
//      observe and modify base game behavior at well-defined seams.
//
// The expansion is also free to introduce new SwCardEffect kinds and new
// SwAction variants; these are part of the base type unions but ONLY read by
// the expansion's hooks. The base reducer ignores effect kinds it doesn't know.

import type { ComponentType } from 'react';
import type { PlayerId } from '@/core/types';
import type { RngState } from '@/core/rng';
import type {
  SwAction, SwAge, SwCard, SwConfig, SwCost, SwExpansionId,
  SwFinalScoringRow, SwPlayer, SwState, SwWonderStage,
} from '../types';

/** Where a cost is being paid (used by modifyCost). */
export type SwCostTarget =
  | { kind: 'card'; card: SwCard }
  | { kind: 'wonderStage'; stageIndex: number; stage: SwWonderStage }
  | { kind: 'leader'; card: SwCard };

/** Events emitted by the base reducer at well-defined seams. */
export type SwEvent =
  | { kind: 'cardBuilt'; playerId: PlayerId; card: SwCard; viaChain: boolean }
  | { kind: 'wonderStageBuilt'; playerId: PlayerId; stageIndex: number }
  | { kind: 'neighborPurchase'; buyerId: PlayerId; sellerId: PlayerId; units: number }
  | { kind: 'militaryTokenGained'; playerId: PlayerId; vp: number; age: SwAge }
  | { kind: 'leaderRecruited'; playerId: PlayerId; card: SwCard }
  | { kind: 'tickStart' /* start of a new pick tick: clear once-per-turn flags */ };

/** Extras column for the end-game scoring row. Keyed by category label. */
export type SwScoreExtras = Record<string, number>;

/** Props passed to expansion UI overlays. */
export interface SwOverlayProps {
  state: SwState;
  localPlayerId: PlayerId | null;
  dispatch: (a: SwAction) => void;
}

/** Props passed to expansion lobby sections. */
export interface SwLobbySectionProps {
  config: SwConfig;
  onChange: (c: SwConfig) => void;
}

export interface SwExpansion {
  id: SwExpansionId;
  /** Human-readable name, for the lobby header. */
  label: string;

  /** Card pools contributed to a given Age's deck (Cities, Armada, etc.). */
  ageDeckCards?(age: SwAge, playerCount: number, rng: RngState): SwCard[];

  /** Set up state at match start (after base setup, before Age 1 starts).
   *  May set state.subPhase to take control before normal age start. */
  setupMatch?(state: SwState): void;

  /** Called before each age's normal deal. Return true to take control (the
   *  base reducer will not deal until the expansion explicitly starts the age
   *  via transitions in its applyAction). */
  beforeAgeStart?(state: SwState, age: SwAge): boolean;

  /** Handle an action — return new state, or undefined if not this expansion's. */
  applyAction?(state: SwState, action: SwAction): SwState | undefined;

  /** When state.subPhase is expansion-owned, return the next AI player that
   *  needs to act (so GameHost AI driver can tick them). Return null when no
   *  AI seat is waiting on its action. */
  nextAIPicker?(state: SwState): PlayerId | null;

  /** AI move selection during expansion-owned subphases. */
  chooseAIAction?(state: SwState, playerId: PlayerId): SwAction | null;

  /** Modify the effective cost of a card / wonder stage / leader. Returns the
   *  new cost. Multiple modifiers stack (later modifiers see earlier outputs). */
  modifyCost?(state: SwState, player: SwPlayer, target: SwCostTarget, cost: SwCost): SwCost;

  /** React to a base-reducer event. The expansion may mutate state.
   *  Triggered events: cardBuilt, wonderStageBuilt, neighborPurchase,
   *  militaryTokenGained, leaderRecruited, tickStart. */
  onEvent?(state: SwState, event: SwEvent): void;

  /** Contribute additional end-game score values. Keyed by category label
   *  (e.g., "leaders"). Each value is added to row.extras and to row.total. */
  scoreExtras?(state: SwState, player: SwPlayer): SwScoreExtras;

  /** Score column labels this expansion contributes. Order matters for the UI. */
  scoreCategories?: readonly string[];

  /** Lobby UI section (rendered under the main config panel). */
  LobbySection?: ComponentType<SwLobbySectionProps>;

  /** GameView overlay (replaces the HandPanel when subPhase is expansion-owned). */
  GameOverlay?: ComponentType<SwOverlayProps>;

  /** Returns true if the given subPhase string is owned by this expansion. */
  ownsSubPhase?(subPhase: string): boolean;
}

/** Compute extras totals for a player across all active expansions. */
export function aggregateExtras(
  expansions: readonly SwExpansion[],
  state: SwState,
  player: SwPlayer,
): { perCategory: SwScoreExtras; total: number } {
  const perCategory: SwScoreExtras = {};
  let total = 0;
  for (const ext of expansions) {
    if (!ext.scoreExtras) continue;
    const got = ext.scoreExtras(state, player);
    for (const k of Object.keys(got)) {
      perCategory[k] = (perCategory[k] ?? 0) + got[k];
      total += got[k];
    }
  }
  return { perCategory, total };
}

/** Merge expansion scoreExtras INTO an existing scoring row. */
export function applyExtrasToRow(
  expansions: readonly SwExpansion[],
  state: SwState,
  player: SwPlayer,
  row: SwFinalScoringRow,
): void {
  const { perCategory, total } = aggregateExtras(expansions, state, player);
  row.extras = perCategory;
  row.total += total;
}
