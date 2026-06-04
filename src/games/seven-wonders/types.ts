// 7 Wonders — types.
//
// Turn structure (pure deterministic state machine):
//   - Each Age (I, II, III) every player is dealt 7 cards.
//   - 6 picks per Age: each player submits a pick (build / wonder-stage / discard),
//     reducer reveals + applies in batch, hands rotate (CW in I/III, CCW in II).
//   - After the 6th pick the last card is discarded (base 7W).
//   - End of Age: military resolution against L+R neighbors (-1/+1/+3/+5 tokens).
//   - End of Age III: final scoring across 7 categories.
//
// Expansion hooks: see expansions/<id>/ directories. Each expansion contributes
// extra decks and post-action hooks via a module — no `if (expansion === ...)`
// switches in the base reducer.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SwAge = 1 | 2 | 3;

export type SwCardColor =
  | 'brown'    // raw materials (Age I/II)
  | 'gray'     // manufactured (Age I/II)
  | 'blue'     // civilian VPs
  | 'yellow'   // commercial (income/discounts/VP)
  | 'red'      // military shields
  | 'green'    // science (compass/gear/tablet)
  | 'purple'   // guild (Age III only)
  | 'leader';  // expansion: Leaders

// ---------- Resources ----------

export type SwRawResource = 'wood' | 'stone' | 'ore' | 'clay';
export type SwManufacturedResource = 'glass' | 'papyrus' | 'loom';
export type SwResource = SwRawResource | SwManufacturedResource;

export const RAW_RESOURCES: readonly SwRawResource[] = ['wood', 'stone', 'ore', 'clay'];
export const MANUFACTURED_RESOURCES: readonly SwManufacturedResource[] = ['glass', 'papyrus', 'loom'];
export const ALL_RESOURCES: readonly SwResource[] = [...RAW_RESOURCES, ...MANUFACTURED_RESOURCES];

/** A resource production token. A list of resources means "choose any one each
 *  age". Single-element list = fixed production. */
export type SwProduction = readonly SwResource[];

/** A scientific symbol. */
export type SwScience = 'compass' | 'gear' | 'tablet';

// ---------- Card effects ----------

export interface SwCost {
  coins?: number;
  resources?: SwResource[]; // each entry is one unit required; duplicates allowed
}

export type SwCardEffect =
  // Single fixed resource production (brown w/ 1 type, or gray manufactured).
  | { kind: 'produce'; production: SwProduction[] }
  // Income on play (yellow cards like Tavern: +5 coins).
  | { kind: 'coins'; amount: number }
  // Military shields (red).
  | { kind: 'shields'; shields: number }
  // Civilian victory points (blue).
  | { kind: 'vp'; vp: number }
  // Science symbol (green).
  | { kind: 'science'; symbol: SwScience }
  // Discount on raw resources from neighbors (1 coin instead of 2). Yellow.
  | { kind: 'tradeDiscountRaw'; sides: ('east' | 'west' | 'both')[] }
  // Discount on manufactured resources from neighbors (1 coin instead of 2). Yellow.
  | { kind: 'tradeDiscountManufactured'; sides: ('east' | 'west' | 'both')[] }
  // End-of-game VPs based on what you/neighbors built. Yellow + purple.
  // `from` indicates whose tableau to count from; each match awards `coinsPer`
  // (commercial yellows) and/or `vpPer`. `wonderStagesPer` counts wonder stages
  // built. coinsPer applies immediately when played (Haven, Lighthouse).
  | {
      kind: 'endVp';
      from: 'self' | 'neighbors' | 'all'; // 'all' = self + both neighbors
      countWhat:
        | { kind: 'cardColor'; color: SwCardColor }
        | { kind: 'wonderStages' }
        | { kind: 'military' };          // count military tokens (not used yet but reserved)
      coinsPerOnPlay?: number;            // immediate coins per match (Haven, Lighthouse, Chamber of Commerce)
      vpPer?: number;                     // end-of-game VPs per match
    }
  // ---------- Expansion-owned effect kinds ----------
  // The base reducer ignores these; the relevant expansion's hooks read them.

  // LEADERS: cost modifier — reduce one resource from cards of `targetColor`,
  // wonder stages, leaders, or guilds.
  | { kind: 'leaderCostModifier';
      target: 'cardColor' | 'wonderStage' | 'leader' | 'guild';
      targetColor?: SwCardColor;
      remove: 'oneResource' | 'allResources' | 'allCoins' }

  // LEADERS: on-play trigger — fires when this leader's owner does something
  // AFTER the leader was recruited. Each fire grants the listed reward.
  | { kind: 'leaderTrigger';
      on:
        | { type: 'buildCardColor'; color: SwCardColor }
        | { type: 'buildViaChain' }
        | { type: 'militaryWin' }
        | { type: 'neighborPurchase' };
      reward: { coins?: number } }

  // LEADERS: end-game scoring rule that doesn't fit the existing endVp shape.
  | { kind: 'leaderScoreExtra';
      rule:
        | { type: 'completeScienceSet'; vpPerSet: number }     // Aristotle: +3 per {compass,gear,tablet}
        | { type: 'completeRGBSet'; vpPerSet: number }          // Justinian: +3 per {red,blue,green}
        | { type: 'completeAllColorsSet'; vpPerSet: number }    // Plato: +7 per {b,g,B,Y,R,G,P}
        | { type: 'midasCoinBonus' }                            // Midas: +1 VP per 3 coins (stacks)
        | { type: 'alexanderTokenBonus' }                       // Alexander: +1 per existing victory token
      }

  // LEADERS: marks a card as having an activated ability.
  | { kind: 'leaderActivated'; ability: 'bilkis' }

  // LEADERS: marks a card as triggering a recruit-time deck pull.
  | { kind: 'leaderOnRecruit'; effect: 'solomonBuildFromDiscard' }
  ;

export interface SwCard {
  id: number;
  name: string;
  age: SwAge;
  color: SwCardColor;
  /** Player-count restriction. Card is in the deck only when minPlayers <= seats <= maxPlayers. */
  minPlayers: number;
  maxPlayers: number;
  cost: SwCost;
  /** Cards from a previous age whose owner may build this card for free. */
  chainFrom?: string[];
  /** Names of cards in a *later* age this card chains TO (informational only). */
  chainTo?: string[];
  effects: SwCardEffect[];
}

// ---------- Wonders ----------

export interface SwWonderStage {
  cost: SwCost;
  effects: SwCardEffect[];
  /** Short human-readable description (e.g., "+3 VP"). */
  text: string;
}

export interface SwWonder {
  id: string;          // 'gizah-a', 'gizah-b', etc.
  name: string;        // "Gizah" / "Pyramids of Gizah"
  side: 'A' | 'B';
  /** Starting resource production. */
  initialProduction: SwProduction[];
  stages: SwWonderStage[];
  flavor?: string;
}

// ---------- Player state ----------

export interface SwPlayer {
  id: PlayerId;
  wonderId: string;
  /** Current hand for this Age's draft. Empty between Ages. */
  hand: SwCard[];
  /** Built cards in tableau. */
  tableau: SwCard[];
  /** Wonder stages built (0..N), in order. */
  wonderStagesBuilt: number;
  coins: number;
  /** Military tokens accumulated (-1, +1, +3, +5). Order = Age 1, 2, 3 outcomes. */
  militaryTokens: number[];
  /** Submitted card pick for the current tick, applied on reveal. null if no submission. */
  pendingPick: SwPendingPick | null;

  // ---------- Leaders expansion fields (only set when Leaders is active) ----------

  /** Leaders currently in the player's reserve (drafted, not yet played). */
  leaderHand?: SwCard[];
  /** Pending leader-draft pick for the current draft tick. */
  leaderDraftPick?: { cardId: number } | null;
  /** Pending leader-play pick for the current age's pre-play step. */
  leaderPlayPick?: SwLeaderPlayPick | null;
  /** Whether Bilkis has been used THIS pick tick (resets per tick). */
  bilkisUsedThisTick?: boolean;
  /** Transient resources granted for this build (e.g., Bilkis). Cleared on apply. */
  transientResources?: SwResource[];
  /** Leaders played into the tableau. */
  leaderTableau?: SwCard[];
}

/** What a player has chosen to do with the picked card this tick. */
export type SwPendingPick =
  | { kind: 'build'; cardId: number; payment: SwPayment }
  | { kind: 'wonder'; cardId: number; stageIndex: number; payment: SwPayment }
  | { kind: 'discard'; cardId: number };

/** Resources purchased from neighbors (1-element-per-unit lists like cost). */
export interface SwPayment {
  /** Resources you pay neighbors for. Empty if none needed / all self-produced. */
  fromWest: SwResource[];
  fromEast: SwResource[];
  /** Coins paid in card cost (excludes coins to neighbors which are computed). */
  coins: number;
}

// ---------- Config ----------

export type SwExpansionId = 'leaders' | 'cities' | 'babel' | 'armada' | 'edifice';

export interface SwConfig {
  /** Which expansion modules are active (none implemented yet — toggles only). */
  expansions: SwExpansionId[];
  /** Wonder assignment strategy. */
  wonderAssignment: 'random' | 'preset';
  /** Wonder side selection. */
  wonderSide: 'random' | 'A' | 'B';
  /** When wonderAssignment === 'preset', the wonder per seat (in seat order). */
  presetWonders?: string[];
}

// ---------- Game state ----------

export type SwSubPhase =
  | 'picking'           // each player submits a pick this tick
  | 'militaryEnd'       // post-age military resolution shown briefly
  | 'finalScoring'      // game over; finalScores populated
  | 'leaderDraft'       // Leaders: initial pass-pick of 4 leaders
  | 'leaderPlay'        // Leaders: pre-age leader play (one per age)
  | 'solomonAwaitPick'  // Leaders: Solomon recruited — owner picks from discard
  ;

/** Leaders expansion: per-age leader play pick. */
export type SwLeaderPlayPick =
  | { kind: 'play'; cardId: number; payment: SwPayment }   // build into leaderTableau
  | { kind: 'bury'; cardId: number; payment: SwPayment }   // under next wonder stage
  | { kind: 'discard'; cardId: number }                    // → 3 coins
  | { kind: 'skip' };                                      // play no leader this age

export interface SwState {
  phase: GamePhase;
  seats: Seat[];
  /** Set to the next unpicked AI player during 'picking' so the host AI driver
   *  can tick through them. Null when waiting on humans. */
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: SwConfig;
  age: SwAge;
  /** Within an Age, which pick — 1 through 6. */
  ageRound: number;
  subPhase: SwSubPhase;
  players: SwPlayer[];
  /** Discard pile (visible across all ages). */
  discard: SwCard[];
  /** Pass direction this age — 'cw' in I/III, 'ccw' in II. */
  passDirection: 'cw' | 'ccw';

  /** Summary of last military age resolution. Populated after each age. */
  lastMilitaryResolution: SwMilitarySummary | null;
  /** Final scoring breakdown when phase === 'gameOver'. */
  finalScoringBreakdown: SwFinalScoringRow[] | null;

  /** Append-only event log for the sidebar history. */
  log: SwLogEntry[];
  logSeq: number;

  // ---------- Leaders expansion fields (only set when Leaders is active) ----------

  /** Pool of leaders being passed during initial draft. Empty after draft ends. */
  leaderDraftHands?: Record<PlayerId, SwCard[]>;
  /** Draft round (4 → 1). When 0, draft is done. */
  leaderDraftRound?: number;
  /** Pass direction during draft (CW per rulebook). */
  leaderDraftPassDir?: 'cw' | 'ccw';
  /** Solomon's owner if we're in solomonAwaitPick subphase. */
  solomonPickerId?: PlayerId | null;
}

// ---------- Summaries ----------

export interface SwMilitarySummary {
  age: SwAge;
  perPlayer: Array<{
    playerId: PlayerId;
    /** Wins / losses / draws against each neighbor. */
    vsWest: 'win' | 'loss' | 'draw';
    vsEast: 'win' | 'loss' | 'draw';
    tokenGained: number; // 1, 3, or 5 for wins; -1 per loss; 0 for draw
  }>;
}

export interface SwFinalScoringRow {
  playerId: PlayerId;
  military: number;
  treasury: number;
  wonder: number;
  civilian: number;
  commercial: number;
  guild: number;
  science: number;
  total: number;
  /** Expansion-contributed scoring categories (e.g., { leaders: 12 }). */
  extras?: Record<string, number>;
}

// ---------- Log ----------

export type SwLogEntry =
  | { seq: number; age: SwAge; ageRound: number; kind: 'pickSubmitted'; playerId: PlayerId }
  | { seq: number; age: SwAge; ageRound: number; kind: 'pickRevealed'; playerId: PlayerId; pick: SwPendingPick; cardName: string }
  | { seq: number; age: SwAge; ageRound: number; kind: 'militaryResolution'; summary: SwMilitarySummary }
  | { seq: number; age: SwAge; ageRound: number; kind: 'ageStart' }
  | { seq: number; age: SwAge; ageRound: number; kind: 'matchEnd'; winnerId: PlayerId | null };

// ---------- Actions ----------

export type SwAction =
  | { type: 'submitPick'; playerId: PlayerId; pick: SwPendingPick }
  /** Advance from a between-age pause (military summary shown) into the next age. */
  | { type: 'continue' }
  // ---------- Leaders expansion actions ----------
  /** Submit a pick during the initial leader-draft phase. */
  | { type: 'submitLeaderDraft'; playerId: PlayerId; cardId: number }
  /** Submit a leader-play decision before an age begins. */
  | { type: 'submitLeaderPlay'; playerId: PlayerId; pick: SwLeaderPlayPick }
  /** Use Bilkis' once-per-tick ability: pay 1 coin, gain 1 resource for this build. */
  | { type: 'useBilkis'; playerId: PlayerId; resource: SwResource }
  /** Solomon recruited: pick a card from the discard pile to build for free. */
  | { type: 'solomonPick'; playerId: PlayerId; cardId: number };
