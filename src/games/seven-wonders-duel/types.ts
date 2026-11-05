// 7 Wonders Duel — types.
//
// Standalone 2-player variant of 7 Wonders (base game, no expansions). Shares
// zero code with the base 7 Wonders module: a pyramid draft of face-up and
// face-down cards, 12 wonders (no A/B sides), 5 of 10 Progress tokens on the
// board, one conflict pawn, and three victories (civilian / military
// supremacy / scientific supremacy).
//
// Setup (rulebook): random first player; wonder draft in two groups of four
// (first player picks 1, the other 2, first player the last; the second group
// starts with the other player); 7 coins each; 5 Progress tokens on the
// board, the other 5 boxed (the Great Library draws from them). Each age deals
// 20 cards: Ages I and II drop 3 of 23 unseen; Age III drops 3 of its 20 and
// adds 3 of the 7 Guilds.
//
// A turn: take an accessible card (nothing overlapping it) and build it,
// discard it for 2 coins + 1 per yellow card, or use it to build a wonder.
// Shields push the conflict pawn (looting tokens on the way, the capital wins);
// each pair of matching science symbols takes a Progress token; six different
// symbols win. Wonders may play again, destroy a card, build from the discard
// or draw boxed Progress tokens. Only seven wonders get built — the eighth goes
// back to the box. Between ages the militarily weaker player (the pawn on their
// side; else whoever took the last card) chooses who starts.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type DuelAge = 1 | 2 | 3;

export type DuelCardColor =
  | 'brown'    // raw materials
  | 'gray'     // manufactured goods
  | 'blue'     // civilian
  | 'yellow'   // commercial
  | 'red'      // military
  | 'green'    // scientific
  | 'purple';  // guilds (Age III)

// ---------- Resources ----------

export type DuelRawResource = 'wood' | 'stone' | 'clay';
export type DuelManufacturedResource = 'glass' | 'papyrus';
export type DuelResource = DuelRawResource | DuelManufacturedResource;

export const DUEL_RAW_RESOURCES: readonly DuelRawResource[] = ['wood', 'stone', 'clay'];
export const DUEL_MANU_RESOURCES: readonly DuelManufacturedResource[] = ['glass', 'papyrus'];
export const DUEL_ALL_RESOURCES: readonly DuelResource[] =
  [...DUEL_RAW_RESOURCES, ...DUEL_MANU_RESOURCES];

/** A production source: length 1 = that resource; longer = one of them each turn. */
export type DuelProduction = readonly DuelResource[];

// ---------- Science symbols ----------
//
// Six symbols sit on the green cards, each on exactly two of them; the
// seventh (the scales) is only on the Law token. A pair takes a Progress
// token; six different symbols is Scientific Supremacy.

export type DuelScience =
  | 'globe'    // armillary sphere
  | 'wheel'
  | 'sundial'
  | 'mortar'   // mortar and pestle
  | 'plumb'    // plumb line and set square
  | 'quill'    // quill and ink
  | 'law';     // scales — the Law token

export const DUEL_CARD_SCIENCE: readonly DuelScience[] =
  ['globe', 'wheel', 'sundial', 'mortar', 'plumb', 'quill'];
export const DUEL_ALL_SCIENCE: readonly DuelScience[] = [...DUEL_CARD_SCIENCE, 'law'];

// ---------- Chain symbols ----------
//
// A card showing a chain symbol (top right) makes the later card with the
// same symbol in its cost free. Each symbol links exactly two cards.

export type DuelChainSymbol =
  | 'horseshoe' | 'sword' | 'tower' | 'target' | 'helmet'   // military
  | 'book' | 'gear' | 'lyre' | 'lamp'                       // scientific
  | 'mask' | 'moon' | 'drop' | 'column' | 'sun' | 'senate'  // civilian
  | 'jug' | 'barrel';                                       // commercial

// ---------- Card effects ----------

export interface DuelCost {
  coins?: number;
  resources?: DuelResource[];
}

/** What a commercial card or a guild counts. */
export type DuelCount =
  | { kind: 'color'; colors: DuelCardColor[] }
  | { kind: 'wonders' }
  | { kind: 'coins' };   // sets of 3 coins

export type DuelCardEffect =
  // Resource production; a multi-resource entry is a choice each turn.
  | { kind: 'produce'; production: DuelProduction[] }
  // Coins once, when built.
  | { kind: 'coins'; amount: number }
  // Shields — the conflict pawn moves that many spaces toward the opponent.
  | { kind: 'shields'; shields: number }
  // Victory points at the end.
  | { kind: 'vp'; vp: number }
  | { kind: 'science'; symbol: DuelScience }
  // Trading: these resources cost you exactly 1 coin each.
  | { kind: 'tradeFixed'; resources: DuelResource[] }
  // Age III commercial: coins once, per matching item in your own city.
  | { kind: 'coinsPer'; what: DuelCount; per: number }
  // Guild: coins once and VP at the end, per matching item in the city that
  // has the most of them.
  | { kind: 'guild'; what: DuelCount; coinsPer: number; vpPer: number };

export interface DuelCard {
  id: number;
  name: string;
  age: DuelAge;
  color: DuelCardColor;
  cost: DuelCost;
  /** Name of the earlier card that makes this one free. */
  chainFrom?: string;
  /** Chain symbol printed in the cost column (needs a card showing it). */
  chainCost?: DuelChainSymbol;
  /** Chain symbol this card shows (makes a later card free). */
  chain?: DuelChainSymbol;
  effects: DuelCardEffect[];
}

// ---------- Wonders ----------

export type DuelWonderEffect =
  | { kind: 'vp'; vp: number }
  | { kind: 'coins'; amount: number }
  | { kind: 'shields'; shields: number }
  | { kind: 'produce'; production: DuelProduction[] }
  | { kind: 'opponentLosesCoins'; amount: number }
  /** Take another turn straight away. */
  | { kind: 'playAgain' }
  /** Put a card of this colour from the opponent's city on the discard pile. */
  | { kind: 'destroy'; color: 'brown' | 'gray' }
  /** Build any discarded card for free. */
  | { kind: 'buildFromDiscard' }
  /** Draw 3 of the boxed Progress tokens, keep one. */
  | { kind: 'progressFromBox' };

export interface DuelWonder {
  id: string;       // 'pyramids', 'mausoleum', etc.
  name: string;
  cost: DuelCost;
  effects: DuelWonderEffect[];
  description: string;
}

export interface DuelWonderState {
  wonderId: string;
  built: boolean;
  /** Card tucked under the built wonder (face down). */
  buriedCardId: number | null;
}

// ---------- Progress tokens ----------

export type DuelProgressTokenId =
  | 'agriculture'   // 6 coins now, 4 VP
  | 'architecture'  // wonders cost 2 fewer resources
  | 'economy'       // the opponent's trading coins come to you
  | 'law'           // a science symbol (the scales)
  | 'masonry'       // blue cards cost 2 fewer resources
  | 'mathematics'   // 3 VP per Progress token owned
  | 'philosophy'    // 7 VP
  | 'strategy'      // each new red card: +1 shield
  | 'theology'      // every wonder you build plays again
  | 'urbanism';     // 6 coins now; 4 coins per chain build

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
  /** Slots overlapping this one (in the next row toward the players). It can
   *  be taken — and a face-down card turns up — once all of them are gone. */
  coveredBy: number[];
  /** Row, 0 = farthest from the players (taken last); the last row starts accessible. */
  row: number;
  /** Horizontal position in half-card steps, 0 = the centre line. */
  x: number;
}

// ---------- Wonder draft ----------

export interface DuelWonderDraft {
  /** The revealed group of 4 still to pick from. */
  pool: string[];
  /** The second group, face down until the first is gone. */
  next: string[];
  /** Picking seat for each of the 8 picks. */
  pickOrder: (0 | 1)[];
  /** Index into pickOrder. */
  pickIdx: number;
}

// ---------- Player ----------

export interface DuelPlayer {
  id: PlayerId;
  /** Cards built into the city. */
  tableau: DuelCard[];
  /** Wonders owned, built or not (the 8th is removed once 7 are built). */
  wonders: DuelWonderState[];
  coins: number;
  progressTokens: DuelProgressTokenId[];
}

// ---------- Config ----------

export interface DuelConfig {
  variant?: 'base';
}

// ---------- Sub-phase + state ----------

export type DuelSubPhase =
  | 'wonderDraft'    // before Age I: 8 wonders, two groups of 4
  | 'turn'           // the active seat takes a pyramid card
  | 'progressPick'   // a science pair: take a Progress token from the board
  | 'libraryPick'    // The Great Library: keep 1 of 3 boxed tokens
  | 'destroyCard'    // Circus Maximus / Statue of Zeus: discard an opponent's card
  | 'discardBuild'   // The Mausoleum: build a discarded card for free
  | 'chooseStarter'  // between ages: the weaker player picks who starts
  | 'finalScoring';  // game over

/** A decision an effect has queued for a seat; resolved in order before the turn ends. */
export type DuelPending =
  | { kind: 'progress'; seatIdx: 0 | 1 }
  | { kind: 'library'; seatIdx: 0 | 1; options: DuelProgressTokenId[] }
  | { kind: 'destroy'; seatIdx: 0 | 1; color: 'brown' | 'gray' }
  | { kind: 'discardBuild'; seatIdx: 0 | 1 };

export interface DuelMilitaryAwards {
  /** Looting tokens already taken: p1 = pushed by seat 0 (toward seat 1), p2 = by seat 1. */
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
  progress: number;
  treasury: number;
  military: number;
  total: number;
  coinsAtEnd: number;
}

export type DuelEndReason = 'civilian' | 'military' | 'science';

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
  /** Seat drawn to draft first and start Age I. */
  firstSeatIdx: 0 | 1;

  /** Current age's pyramid. */
  pyramid: DuelPyramidSlot[];
  /** Every card dealt so far, by id. */
  cardsById: Record<number, DuelCard>;
  /** Discarded and destroyed cards, oldest first (public). */
  discard: DuelCard[];

  /** Conflict pawn: −9 (seat 0's capital) … +9 (seat 1's capital). */
  militaryPawn: number;
  militaryAwards: DuelMilitaryAwards;

  /** Progress tokens on the board. */
  progressOffer: DuelProgressTokenId[];
  /** The 5 tokens left in the box at setup (hidden; the Great Library draws here). */
  progressBox: DuelProgressTokenId[];

  /** Queued decisions; the head one is the current sub-phase. */
  pending: DuelPending[];
  /** The active seat plays again once this turn's decisions are done. */
  replay: boolean;

  wonderDraft: DuelWonderDraft | null;

  finalScoringBreakdown: DuelFinalScoringRow[] | null;
  endReason: DuelEndReason | null;
  /** Winning seat; null on a shared civilian victory. */
  winnerSeatIdx: 0 | 1 | null;

  log: DuelLogEntry[];
  logSeq: number;
}

// ---------- Log ----------

export type DuelLogEntry =
  | { seq: number; age: DuelAge; kind: 'wonderDrafted'; playerId: PlayerId; wonderId: string }
  | { seq: number; age: DuelAge; kind: 'ageStart' }
  | { seq: number; age: DuelAge; kind: 'starterChosen'; playerId: PlayerId; starterId: PlayerId }
  | { seq: number; age: DuelAge; kind: 'cardBuilt'; playerId: PlayerId; cardId: number; cardName: string; paid: number; chained: boolean; fromDiscard?: boolean }
  | { seq: number; age: DuelAge; kind: 'wonderBuilt'; playerId: PlayerId; wonderId: string; cardId: number; paid: number }
  | { seq: number; age: DuelAge; kind: 'cardDiscarded'; playerId: PlayerId; cardId: number; cardName: string; coinsGained: number }
  | { seq: number; age: DuelAge; kind: 'cardDestroyed'; playerId: PlayerId; ownerId: PlayerId; cardId: number; cardName: string }
  | { seq: number; age: DuelAge; kind: 'militaryAdvance'; playerId: PlayerId; amount: number; newPawn: number }
  | { seq: number; age: DuelAge; kind: 'looted'; playerId: PlayerId; coins: number }
  | { seq: number; age: DuelAge; kind: 'coinsLost'; playerId: PlayerId; coins: number }
  | { seq: number; age: DuelAge; kind: 'progressTaken'; playerId: PlayerId; tokenId: DuelProgressTokenId; fromBox: boolean }
  | { seq: number; age: DuelAge; kind: 'wonderRemoved'; playerId: PlayerId; wonderId: string }
  | { seq: number; age: DuelAge; kind: 'playAgain'; playerId: PlayerId }
  | { seq: number; age: DuelAge; kind: 'gameEnd'; reason: DuelEndReason; winnerId: PlayerId | null };

// ---------- Actions ----------
//
// Payment is never part of an action: the reducer pays the cheapest way
// (own production first, the two cheapest-to-skip resources under Masonry /
// Architecture, the rest bought at 2 + the opponent's brown/gray production).

export type DuelAction =
  | { type: 'submitWonderDraft'; playerId: PlayerId; wonderId: string }
  /** Take an accessible card and build it into your city. */
  | { type: 'takeAndBuild'; playerId: PlayerId; cardId: number }
  /** Take an accessible card and tuck it under one of your wonders to build it. */
  | { type: 'takeAndWonder'; playerId: PlayerId; cardId: number; wonderId: string }
  /** Take an accessible card and discard it for coins. */
  | { type: 'takeAndDiscard'; playerId: PlayerId; cardId: number }
  /** 'progressPick' / 'libraryPick'. */
  | { type: 'chooseProgressToken'; playerId: PlayerId; tokenId: DuelProgressTokenId }
  /** 'destroyCard' — a card in the opponent's city. */
  | { type: 'destroyCard'; playerId: PlayerId; cardId: number }
  /** 'discardBuild' — a card from the discard pile. */
  | { type: 'buildFromDiscard'; playerId: PlayerId; cardId: number }
  /** 'chooseStarter' — who takes the first card of the new age. */
  | { type: 'chooseStarter'; playerId: PlayerId; starterId: PlayerId };
