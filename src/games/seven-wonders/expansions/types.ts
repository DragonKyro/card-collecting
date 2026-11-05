// Expansion module contract for 7 Wonders.
//
// Each expansion owns a folder under `expansions/<id>/` and exports a
// `SwExpansion`. The base reducer is expansion-agnostic — it calls the hooks
// listed here without ever switching on a specific expansion id.
//
// Hooks fall into these buckets:
//   1. Setup (setupMatch / beforeAgeStart / onAgeStart / deck contributions).
//   2. Reducer ownership (applyAction / ownsSubPhase / nextAIPicker /
//      chooseAIAction): an expansion owns its sub-phases and action types;
//      the base reducer routes unknown action types here.
//   3. Rules the base consults where they apply: costs (modifyCost), trade
//      prices (tradePrice), production (productionRules), chains
//      (chainSources), picks (validatePick / pickCost / onPickPlaced),
//      end-of-turn and end-of-Age steps, military, scoring.
//
// Effect kinds on cards are generic (types.ts) and read by the base where they
// apply; these hooks are for rules that live in an expansion's own state (the
// Tower of Babel, a Great Project, the Leaders draft).

import type { ComponentType } from 'react';
import type { PlayerId } from '@/core/types';
import type { RngState } from '@/core/rng';
import type {
  SwAction, SwAge, SwCard, SwConfig, SwCost, SwExpansionId,
  SwFinalScoringRow, SwPendingPick, SwPlayer, SwProduction, SwResource, SwState, SwWonderStage,
} from '../types';

/** Where a cost is being paid (used by modifyCost). */
export type SwCostTarget =
  | { kind: 'card'; card: SwCard }
  /** A free build through a chain: the cost starts empty (taxes may add coins). */
  | { kind: 'chain'; card: SwCard }
  | { kind: 'wonderStage'; stageIndex: number; stage: SwWonderStage }
  | { kind: 'leader'; card: SwCard };

/** Events emitted by the base reducer at well-defined seams. */
export type SwEvent =
  | { kind: 'cardBuilt'; playerId: PlayerId; card: SwCard; viaChain: boolean }
  | { kind: 'wonderStageBuilt'; playerId: PlayerId; stageIndex: number }
  | { kind: 'neighborPurchase'; buyerId: PlayerId; sellerId: PlayerId; units: number }
  | { kind: 'militaryTokenGained'; playerId: PlayerId; vp: number; age: SwAge }
  | { kind: 'leaderRecruited'; playerId: PlayerId; card: SwCard }
  | { kind: 'tickStart' /* start of a new turn: clear once-per-turn flags */ };

/** Rules that change what cities produce (Tower of Babel). */
export interface SwProductionRules {
  /** Brown cards producing two units or a choice produce nothing. */
  blockMultiBrown?: boolean;
  /** Brown cards producing a single unit produce any number of it. */
  unlimitedSingleBrown?: boolean;
  /** The trading posts', Marketplace's, Caravansery's and Forum's effects are off. */
  disableYellowTrade?: boolean;
  /** Extra choice sources every city has (not sold to neighbours). */
  freeChoices?: SwProduction[];
}

/** Extra science scoring for a city. */
export interface SwScienceExtras {
  /** VP added to each complete set of the three symbols. */
  setBonus?: number;
}

/** An end-of-turn step. `run` resolves what it can; it returns true when it
 *  is waiting on a decision (it has set `state.subPhase` and the waiting
 *  seat), false when there is nothing (left) for it to do. Steps run in
 *  `order` (Halicarnassus' build from the discard is 20). */
export interface SwTurnEndStep {
  order: number;
  run(state: SwState): boolean;
}

/** Extra score columns. Keyed by category label. */
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

/** Props for a panel shown on the table (the tower, the current project). */
export interface SwTablePanelProps {
  state: SwState;
  localPlayerId: PlayerId | null;
}

export interface SwExpansion {
  id: SwExpansionId;
  /** Human-readable name, for the lobby header. */
  label: string;

  // ---------- Setup ----------

  /** Cards added to an Age's deck (Cities' black cards). */
  ageDeckCards?(age: SwAge, playerCount: number, rng: RngState): SwCard[];
  /** Guilds added to the pool the Age III guilds are drawn from. */
  guilds?(): SwCard[];
  /** Cards added to each hand (Cities: 8 instead of 7). The largest wins. */
  extraHandCards?(playerCount: number): number;
  /** Set up this expansion's state at match start (after base setup). */
  setupMatch?(state: SwState): void;
  /** A phase before Age I (Leaders' draft, then Babel's tile draft): start it
   *  and return true, or return false once it is done / not needed. When the
   *  phase ends the expansion calls `beginPregame` again. */
  pregame?(state: SwState): boolean;
  /** Called before each age's deal. Return true to take control (the base
   *  will not deal until the expansion starts the age via `startAge`). */
  beforeAgeStart?(state: SwState, age: SwAge): boolean;
  /** Called as an Age begins, before the hands are dealt (Great Projects). */
  onAgeStart?(state: SwState, age: SwAge): void;

  // ---------- Reducer ownership ----------

  /** Handle an action — return new state, or undefined if not this expansion's. */
  applyAction?(state: SwState, action: SwAction): SwState | undefined;
  /** Returns true if the given subPhase string is owned by this expansion. */
  ownsSubPhase?(subPhase: string): boolean;
  /** When state.subPhase is expansion-owned, the seat the table waits on next. */
  nextAIPicker?(state: SwState): PlayerId | null;
  /** AI move selection during expansion-owned subphases. */
  chooseAIAction?(state: SwState, playerId: PlayerId): SwAction | null;
  /** AI: extra things this expansion lets a city do with a card it gives up
   *  (a Babel tile), with their worth in VP. `cardId` is the card spent. */
  extraPickOptions?(state: SwState, player: SwPlayer, cardId: number): Array<{ pick: SwPendingPick; value: number }>;
  /** AI: the worth (VP) of this expansion's part of a pick (joining a Great
   *  Project with it); 0 when it has none. */
  aiPickValue?(state: SwState, player: SwPlayer, pick: SwPendingPick, card: SwCard): number;

  // ---------- Rules ----------

  /** Modify the effective cost of a card / chain / wonder stage / leader.
   *  Modifiers stack in registry order. */
  modifyCost?(state: SwState, player: SwPlayer, target: SwCostTarget, cost: SwCost): SwCost;
  /** Adjust the price of one unit bought from a neighbour (floored at 0). */
  tradePrice?(state: SwState, buyer: SwPlayer, resource: SwResource, price: number): number;
  /** Production rules in force right now. */
  productionRules?(state: SwState): SwProductionRules;
  /** Cards a city may chain from besides its own (Tower of Babel). */
  chainSources?(state: SwState, player: SwPlayer): SwCard[];
  /** Pick kinds beyond build / wonder / sell that this expansion handles
   *  ('babelTile'); the base refuses them otherwise. */
  pickKinds?: readonly SwPendingPick['kind'][];
  /** Throw if this expansion's part of a pick is illegal (a Babel tile, a
   *  Great Project participation). Called after the base checks. */
  validatePick?(state: SwState, player: SwPlayer, pick: SwPendingPick, card: SwCard): void;
  /** A cost paid on top of the pick's own (a Great Project participation). */
  pickCost?(state: SwState, player: SwPlayer, pick: SwPendingPick, card: SwCard): SwCost | null;
  /** After a pick is placed and paid (take a participation token, queue a tile). */
  onPickPlaced?(state: SwState, player: SwPlayer, pick: SwPendingPick, card: SwCard): void;
  /** React to a base-reducer event. The expansion may mutate state. */
  onEvent?(state: SwState, event: SwEvent): void;
  /** End-of-turn steps (see SwTurnEndStep). */
  turnEndSteps?: readonly SwTurnEndStep[];
  /** Before the Age's conflicts: true while waiting on a decision. */
  ageEndStep?(state: SwState): boolean;
  /** Military: cities sitting this conflict out (Cities' diplomacy). Called
   *  once per conflict; may spend tokens. */
  conflictSkips?(state: SwState): Set<PlayerId>;
  /** Military: the value of a victory token actually taken (0 = none). */
  victoryToken?(state: SwState, vp: number): number;
  /** Military: how many defeat tokens one lost battle gives. */
  defeatTokens?(state: SwState): number;

  // ---------- Scoring ----------

  /** Contribute additional end-game score values. */
  scoreExtras?(state: SwState, player: SwPlayer): SwScoreExtras;
  /** Score column labels this expansion contributes. Order matters for the UI. */
  scoreCategories?: readonly string[];
  /** Extra science scoring (Babel's science token). */
  scienceExtras?(state: SwState, player: SwPlayer): SwScienceExtras;

  // ---------- UI ----------

  /** Lobby UI section (rendered under the expansion's checkbox). */
  LobbySection?: ComponentType<SwLobbySectionProps>;
  /** GameView overlay (replaces the HandPanel when subPhase is expansion-owned). */
  GameOverlay?: ComponentType<SwOverlayProps>;
  /** Shown on the table while playing (the tower, the current project). */
  TablePanel?: ComponentType<SwTablePanelProps>;
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
