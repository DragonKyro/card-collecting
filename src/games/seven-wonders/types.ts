// 7 Wonders — types.
//
// Turn structure (pure deterministic state machine):
//   - Each Age (I, II, III) every player is dealt 7 cards (8 with Cities, up to
//     7 players), so an Age is 6 picks (7 with Cities): `picksPerAge`.
//   - Each player submits a pick (build / wonder-stage / sell, or with the
//     Tower of Babel discard for a Babel tile); the reducer reveals + applies
//     in batch, hands pass left = west in I/III ('cw') and right = east in II.
//   - After the last pick the leftover card is discarded — Babylon B plays it
//     instead (an extra pick, only that city).
//   - End of a turn, in this order: Leaders' Courtesans' Guild / Rome B
//     decisions, Halicarnassus' build from the discard, Cities' coin losses
//     (each loser pays or takes debt), then the turn's Babel tiles go on the
//     tower (`SwExpansion.turnEndSteps`).
//   - End of an Age: Great Projects resolve, then military against both
//     neighbours (diplomacy, Babel tiles and Tomyris adjust it).
//   - End of Age III: final scoring across 7 categories plus the expansions'
//     columns; ties go to the most coins.
//
// Expansion hooks: see expansions/<id>/ directories. Each expansion contributes
// cards, sub-phases and rules through `SwExpansion` — no `if (expansion === …)`
// switches in the base reducer. Effect kinds are generic and read where they
// apply (a mask in science scoring, a rebate in trade prices…).

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
  | 'leader'   // expansion: Leaders (white cards)
  | 'black';   // expansion: Cities

/** The seven colours of the base game's Age cards (Plato's set). */
export const AGE_CARD_COLORS: readonly SwCardColor[] = ['brown', 'gray', 'blue', 'yellow', 'red', 'green', 'purple'];

// ---------- Resources ----------

export type SwRawResource = 'wood' | 'stone' | 'ore' | 'clay';
export type SwManufacturedResource = 'glass' | 'papyrus' | 'loom';
export type SwResource = SwRawResource | SwManufacturedResource;

export const RAW_RESOURCES: readonly SwRawResource[] = ['wood', 'stone', 'ore', 'clay'];
export const MANUFACTURED_RESOURCES: readonly SwManufacturedResource[] = ['glass', 'papyrus', 'loom'];
export const ALL_RESOURCES: readonly SwResource[] = [...RAW_RESOURCES, ...MANUFACTURED_RESOURCES];

/** A resource production token. A list of resources means "choose any one each
 *  turn". Single-element list = fixed production. */
export type SwProduction = readonly SwResource[];

/** A scientific symbol. */
export type SwScience = 'compass' | 'gear' | 'tablet';

// ---------- Card effects ----------

export interface SwCost {
  coins?: number;
  resources?: SwResource[]; // each entry is one unit required; duplicates allowed
  /** Leaders (Archimedes, Hammurabi, Leonidas, Imhotep): this many units of
   *  the resource cost may be left unpaid, the player's choice which. */
  waivable?: number;
  /** The units `waivable` may come from (a card's own, when a Great Project
   *  participation is paid with it). Absent = any unit of `resources`. */
  waivableFrom?: SwResource[];
}

/** What an end-of-game count looks at. */
export type SwCountWhat =
  | { kind: 'cardColor'; color: SwCardColor }
  | { kind: 'wonderStages' }
  /** Defeat tokens (Strategists Guild). */
  | { kind: 'military' }
  /** Victory tokens, whatever their value (Mourners Guild, Slave Market). */
  | { kind: 'victoryTokens' }
  /** Recruited leaders (Diplomats' Guild). */
  | { kind: 'leaders' }
  /** Complete sets of 3 coins in the treasury (Gamers' Guild). */
  | { kind: 'coinSets' };

export type SwCardEffect =
  // Resource production (a multi-resource entry is a choice each turn).
  | { kind: 'produce'; production: SwProduction[] }
  // Coins from the bank when played.
  | { kind: 'coins'; amount: number }
  // Military shields.
  | { kind: 'shields'; shields: number }
  // Victory points at the end.
  | { kind: 'vp'; vp: number }
  // Science symbol.
  | { kind: 'science'; symbol: SwScience }
  // Buy raw materials / manufactured goods from those neighbours for 1 coin.
  | { kind: 'tradeDiscountRaw'; sides: ('east' | 'west' | 'both')[] }
  | { kind: 'tradeDiscountManufactured'; sides: ('east' | 'west' | 'both')[] }
  // Coins when played and / or VP at the end per counted item in `from`.
  | {
      kind: 'endVp';
      from: 'self' | 'neighbors' | 'all'; // 'all' = self + both neighbors
      countWhat: SwCountWhat;
      coinsPerOnPlay?: number;
      vpPer?: number;
    }
  // A science symbol of the owner's choice, picked at scoring (Scientists
  // Guild, Babylon A stage 2 / B stage 3).
  | { kind: 'scienceWild' }
  // ---------- Wonder powers (base game) ----------
  | { kind: 'buildFromDiscard' }   // Halicarnassus
  | { kind: 'playLastCard' }       // Babylon B
  | { kind: 'freeBuildPerAge' }    // Olympia A
  | { kind: 'copyGuild' }          // Olympia B

  // ---------- Cities ----------
  // Every other city loses `amount` coins (× its victory tokens / wonder
  // stages with `per`) at the end of the turn: paid to the bank, or a debt
  // token for each coin it won't or can't pay.
  | { kind: 'coinLoss'; amount: number; per?: 'victoryToken' | 'wonderStage' }
  // Both neighbours take this many coins from the bank (Gambling Den / House).
  | { kind: 'neighborsGain'; amount: number }
  // A diplomacy token: sit out the next conflict.
  | { kind: 'diplomacy' }
  // At the end, copy the science symbol of a green card in a neighbouring city.
  | { kind: 'mask' }
  // Each turn the first resource bought from that neighbour costs 1 coin less
  // (Clandestine Docks; stacks with the trading posts).
  | { kind: 'tradeRebate'; side: 'west' | 'east' }
  // One resource each turn: one the city already produces (Secret Warehouse) /
  // one it doesn't (Black Market), counting only its brown and gray cards and
  // its board's starting resource. Never sold to neighbours.
  | { kind: 'produceOwned' }
  | { kind: 'produceMissing' }
  // Wonder stages are built without paying their resource cost (Architect Cabinet).
  | { kind: 'freeWonderResources' }

  // ---------- Leaders ----------
  // Cards of this colour / wonder stages cost one resource less (player's choice).
  | { kind: 'costDiscount'; target: 'cardColor' | 'wonderStage'; color?: SwCardColor }
  // Guilds are built without paying their resource cost (Ramses).
  | { kind: 'freeGuildResources' }
  // Leaders are recruited for free (Maecenas, Rome A's board).
  | { kind: 'freeLeaders' }
  // Leaders cost `self` coins less to recruit, and `neighbors` less for both
  // neighbours (Rome B's board).
  | { kind: 'leaderRebate'; self: number; neighbors: number }
  // Coins from the bank whenever the owner does something, from now on.
  | { kind: 'trigger';
      on:
        | { type: 'buildCardColor'; color: SwCardColor }   // Xenophon (yellow), Diocletian (black)
        | { type: 'buildViaChain' }                        // Vitruvius
        | { type: 'victoryToken' }                         // Nero
        | { type: 'neighborPurchase' };                    // Hatshepsut (1 per neighbour per turn)
      coins: number }
  // End-game rules that don't fit endVp.
  | { kind: 'scoreRule';
      rule:
        | { type: 'completeRGBSet'; vpPerSet: number }       // Justinian
        | { type: 'completeAllColorsSet'; vpPerSet: number } // Plato
        | { type: 'vpPerCoinSet'; vpPer: number }            // Midas, Gamers' Guild
        | { type: 'vpPerVictoryToken'; vpPer: number }       // Alexander
      }
  // Each complete set of the three science symbols is worth this much more
  // (Aristotle 3, Babel's science token 3).
  | { kind: 'scienceSetBonus'; vp: number }
  // Once per turn, pay 1 coin to the bank for any one resource (Bilkis).
  | { kind: 'buyAnyResource' }
  // On recruit: build a card from the discard pile for free (Solomon).
  | { kind: 'buildFromDiscardOnRecruit' }
  // The owner's defeat tokens go to the neighbour who beat them (Tomyris).
  | { kind: 'defeatToVictor' }
  // Each of the owner's defeat tokens counts as a shield from now on (Semiramis).
  | { kind: 'defeatAsShield' }
  // Once per turn, coins taken from the bank are increased by 1 (Berenice).
  | { kind: 'bankBonus' }
  // One card of this colour per Age may be built for free (Caligula).
  | { kind: 'freeColorPerAge'; color: SwCardColor }
  // Courtesans' Guild: copy a leader of a neighbouring city.
  | { kind: 'copyLeader' }
  // Rome B, stage 1: draw leaders from the unused ones into your hand.
  | { kind: 'drawLeaders'; count: number }
  // Rome B, stages 2 and 3: recruit a leader from your hand at once.
  | { kind: 'recruitNow' }
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
  /** The box it comes from (for the rule book and card labels). */
  expansion?: 'leaders' | 'cities';
  /** Courtesans' Guild: this leader is a copy of `copyOf`'s, not recruited. */
  copyOf?: { playerId: PlayerId; cardId: number };
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
  name: string;        // "Pyramids of Gizah" / "Pyramids of Gizah"
  side: 'A' | 'B';
  /** Starting resource production. */
  initialProduction: SwProduction[];
  /** A power printed on the board itself, in force from the start (Rome). */
  boardEffects?: SwCardEffect[];
  /** Text for `boardEffects`. */
  boardText?: string;
  stages: SwWonderStage[];
  /** Board from an expansion box: dealt only with that expansion. */
  expansion?: 'leaders' | 'cities';
  flavor?: string;
}

// ---------- Babel ----------

/** A Tower of Babel tile (numbered 1–24 as printed). */
export interface SwBabelTile {
  id: number;
  name: string;
  text: string;
}

/** A Great Project of Babel. */
export interface SwGreatProject {
  id: string;
  name: string;
  age: SwAge;
  /** Building a card of this colour lets you participate. */
  color: SwCardColor;
  /** Participation cost, paid with the card. */
  cost: SwCost;
  reward: SwProjectReward;
  penalty: SwProjectPenalty;
}

export type SwProjectReward =
  | { kind: 'coins'; amount: number }
  | { kind: 'shield'; shields: number }            // a shield token (counts every conflict)
  | { kind: 'victoryToken'; vp: number }           // a military victory token
  | { kind: 'freeBuild' }                          // build a card for free, later
  | { kind: 'freeStage' }                          // build a wonder stage for free, later
  | { kind: 'anyColor' }                           // participate with a card of any colour, later
  | { kind: 'scienceSets'; vp: number }            // +vp per set of the three symbols
  | { kind: 'guilds'; vp: number }                 // vp per guild in your city and both neighbours'
  | { kind: 'stages'; vp: number };                // vp per wonder stage of yours

export type SwProjectPenalty =
  | { kind: 'discardColor'; color: SwCardColor }   // discard a card of that colour (your choice)
  | { kind: 'allCoins' }                           // lose all your coins
  | { kind: 'victoryTokens'; count: number }       // discard that many victory tokens (your choice)
  | { kind: 'blockResource' };                     // lose your board's starting resource for the game

/** A player's Great Project tokens (Babel). */
export interface SwProjectTokens {
  freeBuild: number;
  freeStage: number;
  anyColor: number;
  shields: number;
  scienceSets: number;   // VP per set of symbols, summed over science tokens
  guilds: number;        // VP per counted guild, summed over guild tokens
  stages: number;        // VP per wonder stage, summed over wonder tokens
  /** Penalty tokens taken when a penalty couldn't be paid (−1/−2/−3). */
  penalties: number[];
  /** Double Walls' penalty: the board's starting resource is gone. */
  resourceBlocked: boolean;
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
  /** Military tokens accumulated (−1 defeats, +1/+3/+5 victories). */
  militaryTokens: number[];
  /** Submitted card pick for the current tick, applied on reveal. null if no submission. */
  pendingPick: SwPendingPick | null;
  /** Olympia A: the Age whose free build was last used. */
  freeBuildUsedAge?: SwAge | null;

  // ---------- Leaders ----------
  /** Leaders currently in the player's reserve (drafted, not yet played). */
  leaderHand?: SwCard[];
  /** Pending leader-draft pick for the current draft tick. */
  leaderDraftPick?: { cardId: number } | null;
  /** Pending leader pick for the Recruitment phase. */
  leaderPlayPick?: SwLeaderPlayPick | null;
  /** Leaders recruited (and a Courtesans' Guild copy, `copyOf` set). */
  leaderTableau?: SwCard[];
  /** Caligula: the Age whose free black card was last used. */
  freeColorUsedAge?: SwAge | null;

  // ---------- Cities ----------
  /** Debt tokens: −1 VP each at the end. */
  debtTokens?: number;
  /** Diplomacy tokens: each sits out one conflict. */
  diplomacyTokens?: number;

  // ---------- Babel ----------
  /** Tower of Babel tiles still in hand (ids). */
  babelHand?: number[];
  /** Pending pick in the tile draft. */
  babelDraftPick?: number | null;
  /** Tiles this city has put on the tower. */
  babelBuilt?: number;
  /** Great Project participation tokens held this Age. */
  participations?: number;
  /** Great Project rewards and penalties. */
  projectTokens?: SwProjectTokens;
}

/** How a build is made free (`free` on a build pick). `true` is Olympia A. */
export type SwFreeBuild = true | 'olympia' | 'color' | 'token';

/** What a player has chosen to do with the picked card this tick. */
export type SwPendingPick =
  /** `free`: built without paying its cost — Olympia A's once-per-Age build
   *  (`true` / 'olympia'), Caligula's black card ('color') or a Great Project
   *  free-build token ('token'). `participate`: also pay into the Great Project. */
  | { kind: 'build'; cardId: number; payment: SwPayment; free?: SwFreeBuild; participate?: boolean }
  /** `free`: a Great Project free-stage token. */
  | { kind: 'wonder'; cardId: number; stageIndex: number; payment: SwPayment; free?: 'token' }
  | { kind: 'discard'; cardId: number }
  /** Tower of Babel: discard the card to build one of your tiles. */
  | { kind: 'babelTile'; cardId: number; tileId: number };

/** How a cost is paid: what is bought from each neighbour, and the extras. */
export interface SwPayment {
  /** Resources bought from neighbours. Empty if none needed / all self-produced. */
  fromWest: SwResource[];
  fromEast: SwResource[];
  /** Unused (kept for older logs); coin costs are computed. */
  coins: number;
  /** Resources left unpaid through a `waivable` discount (Leaders). */
  waived?: SwResource[];
  /** Bilkis: one resource bought from the bank for 1 coin. */
  bank?: SwResource;
}

// ---------- Config ----------

export type SwExpansionId = 'leaders' | 'cities' | 'babelTower' | 'babelProjects';

export interface SwConfig {
  /** Which expansion modules are active. */
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
  | 'discardBuild'      // Halicarnassus: discardBuildQueue[0] builds a card from the discard
  | 'militaryEnd'       // post-age military resolution shown briefly
  | 'finalScoring'      // game over; finalScores populated
  | 'leaderDraft'       // Leaders: initial pass-pick of 4 leaders
  | 'leaderPlay'        // Leaders: Recruitment phase (one leader per Age)
  | 'solomonAwaitPick'  // Leaders: Solomon recruited — owner picks from discard
  | 'courtesan'         // Leaders: Courtesans' Guild built — owner picks a leader to copy
  | 'romeRecruit'       // Leaders: Rome B stage built — owner may recruit a leader now
  | 'debt'              // Cities: coin losses — each loser pays coins or takes debt
  | 'babelDraft'        // Babel: initial pass-pick of 3 tiles
  | 'projectPenalty'    // Babel: failed Great Project — losers pick what they discard
  ;

/** Leaders: what a player does with a leader in the Recruitment phase. */
export type SwLeaderPlayPick =
  | { kind: 'play'; cardId: number; payment: SwPayment }   // recruit it
  | { kind: 'bury'; cardId: number; payment: SwPayment }   // build the next wonder stage with it
  | { kind: 'discard'; cardId: number }                    // → 3 coins
  | { kind: 'babelTile'; cardId: number; tileId: number }; // Babel: build a tile with it

/** The Great Project of the current Age (Babel). */
export interface SwProjectState {
  projectId: string;
  /** Participation tokens still on the card. */
  tokensLeft: number;
  /** Set once the project has been resolved at the end of its Age. */
  outcome: 'success' | 'failure' | null;
}

export interface SwState {
  phase: GamePhase;
  seats: Seat[];
  /** The seat the table waits on next (AI driver / hot-seat hand-off). */
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: SwConfig;
  age: SwAge;
  /** Within an Age, which pick — 1 to `picksPerAge`; one more while Babylon B
   *  plays its last card. */
  ageRound: number;
  subPhase: SwSubPhase;
  players: SwPlayer[];
  /** Discard pile (visible across all ages). */
  discard: SwCard[];
  /** Pass direction this age — 'cw' (to the west / left neighbour) in I/III,
   *  'ccw' (east / right) in II. */
  passDirection: 'cw' | 'ccw';
  /** Halicarnassus: cities owed a free build from the discard pile at the end
   *  of this turn. The head picks while subPhase is 'discardBuild'. */
  discardBuildQueue?: PlayerId[];
  /** What the end-of-turn steps lead into: the next pick, or (after the
   *  Recruitment phase) dealing the Age. */
  turnKind?: 'pick' | 'leader';
  /** Berenice: cities whose +1 on bank coins was used this turn. */
  bankBonusUsed?: PlayerId[];
  /** Coins each city loses at the end of this turn (Cities' coin losses),
   *  settled in the 'debt' sub-phase. */
  pendingLosses?: Record<PlayerId, number>;

  /** Summary of last military age resolution. Populated after each age. */
  lastMilitaryResolution: SwMilitarySummary | null;
  /** Final scoring breakdown when phase === 'gameOver'. */
  finalScoringBreakdown: SwFinalScoringRow[] | null;

  /** Append-only event log for the sidebar history. */
  log: SwLogEntry[];
  logSeq: number;

  // ---------- Leaders ----------
  /** Leader hands being passed during the initial draft. */
  leaderDraftHands?: Record<PlayerId, SwCard[]>;
  /** Draft round (1–4); 0 once the draft is over. */
  leaderDraftRound?: number;
  /** Pass direction during the draft ('cw' here = to the right). */
  leaderDraftPassDir?: 'cw' | 'ccw';
  /** Leaders nobody was dealt (Rome B draws from them). */
  leaderDeck?: SwCard[];
  /** Solomon recruited (or copied): cities still to build from the discard. */
  solomonQueue?: PlayerId[];
  /** Courtesans' Guild builders still to choose a leader to copy. */
  courtesanQueue?: PlayerId[];
  /** Rome B builders who may recruit a leader now. */
  romeRecruitQueue?: PlayerId[];

  // ---------- Babel ----------
  /** Tile hands being passed during the tile draft. */
  babelDraftHands?: Record<PlayerId, number[]>;
  /** Draft round (1–3); 0 once the draft is over. */
  babelDraftRound?: number;
  /** The tower: one stack of tile ids per space (top = last). */
  babelTower?: number[][];
  /** The space the next tile goes on. */
  babelNextSpace?: number;
  /** Tiles built this turn, placed once the turn is resolved. */
  babelPending?: Array<{ playerId: PlayerId; tileId: number }>;
  /** The current Age's Great Project. */
  project?: SwProjectState | null;
  /** Great Projects already used (never drawn twice). */
  projectsUsed?: string[];
  /** Players who participated this turn (once per turn). */
  participatedThisTurn?: PlayerId[];
  /** Losers of a failed project still to choose the card they discard. */
  projectPenaltyQueue?: PlayerId[];
}

// ---------- Summaries ----------

export interface SwMilitarySummary {
  age: SwAge;
  perPlayer: Array<{
    playerId: PlayerId;
    /** Wins / losses / draws against each neighbor ('draw' when absent). */
    vsWest: 'win' | 'loss' | 'draw';
    vsEast: 'win' | 'loss' | 'draw';
    /** Net VP of the tokens taken this Age. */
    tokenGained: number;
    /** Cities: sat this conflict out on a diplomacy token. */
    diplomacy?: boolean;
    /** Shields counted. */
    shields?: number;
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
  /** Olympia B: the neighbour's guild copied (scored in `guild` / `science`). */
  copiedGuild?: string;
}

// ---------- Log ----------

export type SwLogEntry =
  | { seq: number; age: SwAge; ageRound: number; kind: 'pickSubmitted'; playerId: PlayerId }
  | { seq: number; age: SwAge; ageRound: number; kind: 'pickRevealed'; playerId: PlayerId; pick: SwPendingPick; cardName: string }
  /** Halicarnassus / Solomon: the card built from the discard pile (null = passed). */
  | { seq: number; age: SwAge; ageRound: number; kind: 'discardBuilt'; playerId: PlayerId; cardId: number | null; cardName: string | null }
  | { seq: number; age: SwAge; ageRound: number; kind: 'militaryResolution'; summary: SwMilitarySummary }
  | { seq: number; age: SwAge; ageRound: number; kind: 'ageStart' }
  | { seq: number; age: SwAge; ageRound: number; kind: 'matchEnd'; winnerId: PlayerId | null }
  /** Leaders: what a city did in the Recruitment phase. */
  | { seq: number; age: SwAge; ageRound: number; kind: 'leaderPlayed'; playerId: PlayerId; pick: SwLeaderPlayPick['kind']; cardName: string }
  /** Leaders: the Courtesans' Guild copies a leader. */
  | { seq: number; age: SwAge; ageRound: number; kind: 'courtesan'; playerId: PlayerId; cardName: string | null }
  /** Cities: a coin loss settled. */
  | { seq: number; age: SwAge; ageRound: number; kind: 'debtSettled'; playerId: PlayerId; coins: number; debt: number }
  /** Babel: a tile went on the tower (covering `covered`). */
  | { seq: number; age: SwAge; ageRound: number; kind: 'babelPlaced'; playerId: PlayerId; tileId: number; covered: number | null }
  /** Babel: a Great Project revealed / resolved. */
  | { seq: number; age: SwAge; ageRound: number; kind: 'projectRevealed'; projectId: string }
  | { seq: number; age: SwAge; ageRound: number; kind: 'projectResolved'; projectId: string; success: boolean };

// ---------- Actions ----------

export type SwAction =
  | { type: 'submitPick'; playerId: PlayerId; pick: SwPendingPick }
  /** Advance from a between-age pause (military summary shown) into the next age. */
  | { type: 'continue' }
  /** Halicarnassus: build `cardId` from the discard pile for free (null = pass).
   *  `participate` (+ `payment`): also pay into the Great Project. */
  | { type: 'buildFromDiscard'; playerId: PlayerId; cardId: number | null; participate?: boolean; payment?: SwPayment }
  // ---------- Leaders ----------
  /** Submit a pick during the initial leader-draft phase. */
  | { type: 'submitLeaderDraft'; playerId: PlayerId; cardId: number }
  /** Submit a Recruitment-phase decision. */
  | { type: 'submitLeaderPlay'; playerId: PlayerId; pick: SwLeaderPlayPick }
  /** Solomon recruited: pick a card from the discard pile to build for free (null = none). */
  | { type: 'solomonPick'; playerId: PlayerId; cardId: number | null; participate?: boolean; payment?: SwPayment }
  /** Courtesans' Guild: copy this leader of a neighbour (null = none to copy). */
  | { type: 'courtesanPick'; playerId: PlayerId; leaderId: number | null }
  /** Rome B: recruit this leader from your hand now (null = don't). */
  | { type: 'romeRecruit'; playerId: PlayerId; cardId: number | null }
  // ---------- Cities ----------
  /** Settle this turn's coin loss: pay `coins` (the rest becomes debt tokens). */
  | { type: 'settleDebt'; playerId: PlayerId; coins: number }
  // ---------- Babel ----------
  /** Submit a pick during the Babel tile draft. */
  | { type: 'submitBabelDraft'; playerId: PlayerId; tileId: number }
  /** Failed Great Project: discard this card of the penalty's colour. */
  | { type: 'projectPenalty'; playerId: PlayerId; cardId: number };
