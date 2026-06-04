// 7 Wonders Duel — types.
//
// Standalone 2-player variant of 7 Wonders. Shares zero code with the base
// 7 Wonders module: different draft (pyramid of mixed face-up/face-down
// cards), 12 unique wonders (no A/B sides), 5 of 10 Progress Tokens per
// match, single 9-position military track with two-sided pawn, and three
// victory conditions (Civilian / Military Supremacy / Science Supremacy).
//
// Turn flow:
//   1. setupMatch — deal Age 1 pyramid, draft wonders (4-4 alternating),
//      draw 5 of 10 Progress Tokens.
//   2. Each turn: active player picks an AVAILABLE card from the pyramid
//      (no card on top of it). They then choose: build into tableau,
//      bury under an unbuilt wonder, or discard for coins.
//   3. Some cards/wonders push the military pawn or grant science symbols.
//   4. Matching a 2nd science symbol of the same kind → pick a Progress
//      Token from the central offer.
//   5. 6 different science symbols collected → Science Supremacy victory.
//      Military pawn at ±9 → Military Supremacy victory.
//   6. After 3 ages of pyramid play, Civilian Victory by total VP.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type DuelAge = 1 | 2 | 3;

export type DuelCardColor =
  | 'brown'    // raw materials (Age I/II)
  | 'gray'     // manufactured (Age I/II)
  | 'blue'     // civilian VPs
  | 'yellow'   // commercial (income/discounts/VP)
  | 'red'      // military shields → military pawn advance
  | 'green'    // science symbols
  | 'purple';  // guild (Age III only)

// ---------- Resources ----------

export type DuelRawResource = 'wood' | 'stone' | 'clay';
export type DuelManufacturedResource = 'glass' | 'papyrus';
export type DuelResource = DuelRawResource | DuelManufacturedResource;

export const DUEL_RAW_RESOURCES: readonly DuelRawResource[] = ['wood', 'stone', 'clay'];
export const DUEL_MANU_RESOURCES: readonly DuelManufacturedResource[] = ['glass', 'papyrus'];
export const DUEL_ALL_RESOURCES: readonly DuelResource[] =
  [...DUEL_RAW_RESOURCES, ...DUEL_MANU_RESOURCES];

/** A production source: list of length 1 = fixed; longer = "choose one each turn". */
export type DuelProduction = readonly DuelResource[];

// ---------- Science symbols ----------
//
// Duel has 7 distinct science symbols: the 3 base 7W symbols plus 4 unique
// to Duel. Two matching symbols → pick a Progress Token. 6 DIFFERENT symbols
// → Science Supremacy victory.

export type DuelScience =
  | 'compass' | 'gear' | 'tablet'
  | 'lyre'    | 'wheel' | 'sundial' | 'mortar';

export const DUEL_ALL_SCIENCE: readonly DuelScience[] =
  ['compass', 'gear', 'tablet', 'lyre', 'wheel', 'sundial', 'mortar'];

// ---------- Card effects ----------

export interface DuelCost {
  coins?: number;
  resources?: DuelResource[];
}

export type DuelCardEffect =
  // Resource production. Choice sources can supply any one listed.
  | { kind: 'produce'; production: DuelProduction[] }
  // Immediate coin income.
  | { kind: 'coins'; amount: number }
  // Shields → push military pawn toward opponent's capital.
  | { kind: 'shields'; shields: number }
  // Civilian VPs (blue cards).
  | { kind: 'vp'; vp: number }
  // Science symbol (green cards).
  | { kind: 'science'; symbol: DuelScience }
  // Trade discount: pay 1 (not 2 + opponent production) for the listed resource kind.
  | { kind: 'tradeDiscountRaw' }
  | { kind: 'tradeDiscountManufactured' }
  // End-game VPs based on what you/opponent built.
  | { kind: 'endVp';
      from: 'self' | 'opponent' | 'both';
      countWhat:
        | { kind: 'cardColor'; color: DuelCardColor }
        | { kind: 'wonderStages' }
        | { kind: 'coins' };
      coinsPerOnPlay?: number;
      vpPer?: number;
    }
  // Yellow: force opponent to discard coins on play.
  | { kind: 'forceOpponentDiscardCoins'; amount: number }
  // Yellow: gain coins per matching card color on play (self or opponent).
  | { kind: 'gainCoinsPerCardColor'; from: 'self' | 'opponent'; color: DuelCardColor; per: number }
  ;

export interface DuelCard {
  id: number;
  name: string;
  age: DuelAge;
  color: DuelCardColor;
  cost: DuelCost;
  /** Cards from a previous age whose owner may build this for free. */
  chainFrom?: string[];
  /** Names of cards in a later age this chains TO (informational). */
  chainTo?: string[];
  effects: DuelCardEffect[];
}

// ---------- Wonders ----------

export interface DuelWonderStageEffect {
  /** Effects identical to card effects, plus wonder-only "extra turn" / "destroy"
   *  effects that are deferred to v2. */
  kind:
    | 'vp' | 'coins' | 'shields' | 'produce' | 'science'
    | 'tradeDiscountRaw' | 'tradeDiscountManufactured'
    | 'forceOpponentDiscardCoins' | 'extraTurn' | 'pickFromDiscard';
  vp?: number;
  coins?: number;
  shields?: number;
  production?: DuelProduction[];
  symbol?: DuelScience;
  amount?: number;
}

export interface DuelWonder {
  id: string;       // 'pyramids', 'mausoleum', etc.
  name: string;
  cost: DuelCost;
  effects: DuelWonderStageEffect[];
  description: string;
}

export interface DuelWonderState {
  wonderId: string;
  built: boolean;
  /** id of the card buried under this wonder (UI only — face-down). */
  buriedCardId: number | null;
}

// ---------- Progress tokens ----------
//
// Each Progress Token is one of the 10 base tokens. 5 of 10 are randomly
// drawn at match setup. Tokens are claimed by matching a 2nd science symbol
// (player picks one from the central offer, removed from offer).

export type DuelProgressTokenId =
  | 'agriculture'   // +6 coins, +4 VP on claim
  | 'architecture'  // wonder cost: -2 resources of any kind
  | 'economy'       // gain coins opponent pays for trade
  | 'law'           // counts as a wild science symbol
  | 'masonry'       // blue card cost: -2 resources
  | 'mathematics'   // +3 VP per progress token at endgame
  | 'philosophy'    // +7 VP at endgame
  | 'strategy'      // red cards' shields counted +1 for military
  | 'theology'      // wonders grant an extra turn
  | 'urbanism';     // +6 coins, +chain-free discount on chain builds

export interface DuelProgressToken {
  id: DuelProgressTokenId;
  name: string;
  description: string;
}

// ---------- Pyramid ----------

export interface DuelPyramidSlot {
  /** Index into state.pyramid. */
  index: number;
  cardId: number;
  faceUp: boolean;
  taken: boolean;
  /** Indices of slots covering this slot. This slot becomes face-up when ALL
   *  of its covering slots are taken. (Empty for top-row slots.) */
  coveredBy: number[];
  /** Indices of slots THIS slot covers. (Information only — used for layout.) */
  covers: number[];
  /** Display position. */
  row: number;
  col: number;
}

// ---------- Wonder draft ----------

export interface DuelWonderDraft {
  /** 8 wonders dealt for drafting; ordered list of pickable wonders. */
  pool: string[];        // wonderIds; entries get removed as picked
  /** Pick sequence — array of seatIdx (0 or 1). Length 8 = 4+4. */
  pickOrder: (0 | 1)[];
  /** Index into pickOrder. */
  pickIdx: number;
}

// ---------- Player ----------

export interface DuelPlayer {
  id: PlayerId;
  /** Cards built into the tableau. */
  tableau: DuelCard[];
  /** Wonders owned (and whether each is built). */
  wonders: DuelWonderState[];
  coins: number;
  /** Progress tokens earned. */
  progressTokens: DuelProgressTokenId[];
}

// ---------- Config ----------

export interface DuelConfig {
  /** Random seed for pyramid card placement. */
  variant?: 'base';
}

// ---------- Sub-phase + state ----------

export type DuelSubPhase =
  | 'wonderDraft'        // pre-game, 8 wonders → 4-4 alternating draft
  | 'turn'               // main play, active seat picks pyramid card
  | 'progressPick'       // active seat picks a token after science match
  | 'wonderConstruct'    // active seat is burying a card — must pick which unbuilt wonder
  | 'discardPick'        // (reserved for v2 — Mausoleum-style "pick from discard")
  | 'finalScoring'       // gameOver, final scoring computed
  ;

export interface DuelMilitaryAwards {
  /** Set to true when the corresponding threshold has been awarded. */
  p1At3: boolean; p1At6: boolean;
  p2At3: boolean; p2At6: boolean;
}

export interface DuelFinalScoringRow {
  playerId: PlayerId;
  civilian: number;
  science: number;
  commercial: number;
  guild: number;
  wonders: number;
  treasury: number;
  military: number;
  progress: number;
  total: number;
  /** Tiebreak data: coins held at game end. */
  coinsAtEnd: number;
}

export interface DuelState {
  phase: GamePhase;
  seats: Seat[];
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: DuelConfig;
  age: DuelAge;
  subPhase: DuelSubPhase;
  players: [DuelPlayer, DuelPlayer];
  /** Seat index of the active player. */
  activeSeatIdx: 0 | 1;

  /** Current age's pyramid. Empty between ages / before game starts. */
  pyramid: DuelPyramidSlot[];
  /** Card data for cards in the pyramid + already-taken cards. */
  cardsById: Record<number, DuelCard>;
  /** Cards discarded (visible to all players). */
  discard: DuelCard[];

  /** Military track: -9 (p1 capital, p2 wins) … +9 (p2 capital, p1 wins). */
  militaryPawn: number;
  militaryAwards: DuelMilitaryAwards;

  /** Progress tokens currently available in the central offer. */
  progressOffer: DuelProgressTokenId[];
  /** When set, the active seat must pick a progress token before continuing. */
  pendingProgressPick: { seatIdx: 0 | 1 } | null;

  /** Wonder draft state when subPhase === 'wonderDraft'. */
  wonderDraft: DuelWonderDraft | null;

  /** When set (subPhase 'wonderConstruct'), the active seat is burying this card. */
  pendingWonderBury: { cardId: number; seatIdx: 0 | 1 } | null;

  finalScoringBreakdown: DuelFinalScoringRow[] | null;
  endReason: 'civilian' | 'military' | 'science' | null;
  /** The seat index that won. -1 if civilian-tied (winner = highest coins; if tied → first). */
  winnerSeatIdx: 0 | 1 | null;

  log: DuelLogEntry[];
  logSeq: number;
}

// ---------- Log ----------

export type DuelLogEntry =
  | { seq: number; age: DuelAge; kind: 'wonderDrafted'; playerId: PlayerId; wonderId: string }
  | { seq: number; age: DuelAge; kind: 'ageStart' }
  | { seq: number; age: DuelAge; kind: 'cardBuilt'; playerId: PlayerId; cardName: string }
  | { seq: number; age: DuelAge; kind: 'cardBuried'; playerId: PlayerId; wonderName: string; buriedCardName: string }
  | { seq: number; age: DuelAge; kind: 'cardDiscarded'; playerId: PlayerId; cardName: string; coinsGained: number }
  | { seq: number; age: DuelAge; kind: 'militaryAdvance'; playerId: PlayerId; amount: number; newPawn: number }
  | { seq: number; age: DuelAge; kind: 'progressTaken'; playerId: PlayerId; tokenId: DuelProgressTokenId }
  | { seq: number; age: DuelAge; kind: 'gameEnd'; reason: 'civilian' | 'military' | 'science'; winnerId: PlayerId | null };

// ---------- Actions ----------

export type DuelAction =
  /** Wonder draft pick during 'wonderDraft' subphase. */
  | { type: 'submitWonderDraft'; playerId: PlayerId; wonderId: string }
  /** Take a card from the pyramid AND build it into the tableau. */
  | { type: 'takeAndBuild'; playerId: PlayerId; cardId: number;
      /** Resources paid via opponent purchase (each unit = 2 + opp.production of that resource). */
      purchase: DuelResource[]; }
  /** Take a card from the pyramid AND bury it under a wonder (later picks the wonder). */
  | { type: 'takeAndBury'; playerId: PlayerId; cardId: number }
  /** Take a card from the pyramid AND discard it for coins. */
  | { type: 'takeAndDiscard'; playerId: PlayerId; cardId: number }
  /** During 'wonderConstruct' — pick which unbuilt wonder to bury the card under. */
  | { type: 'chooseWonderToBury'; playerId: PlayerId; wonderId: string;
      purchase: DuelResource[]; }
  /** During 'progressPick' — pick a token from the offer. */
  | { type: 'chooseProgressToken'; playerId: PlayerId; tokenId: DuelProgressTokenId }
  ;
