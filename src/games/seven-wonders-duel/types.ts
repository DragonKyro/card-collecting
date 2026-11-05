// 7 Wonders Duel — types.
//
// Standalone 2-player variant of 7 Wonders. Shares zero code with the base
// 7 Wonders module: a pyramid draft of face-up and face-down cards, 12 wonders
// (no A/B sides), 5 of 10 Progress tokens on the board, one conflict pawn, and
// three victories (civilian / military supremacy / scientific supremacy).
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
//
// The two expansions (`DuelConfig.pantheon` / `.agora`, both optional, absent =
// off) follow Board Game Arena's official adaptation:
//
// Pantheon — five Mythology decks (3 Divinities each) and a Pantheon board of
// 6 spaces. Age I: 5 Mythology tokens sit on face-down cards of the
// structure; whoever turns such a card up takes the token, draws the top 2
// Divinities of its Mythology, places one face down on an empty space (only
// its Mythology shows to the opponent) and puts the other back on top. Age II
// starts with the Gate on the empty space and every Divinity face up, and 3
// Offering tokens (−2/−3/−4) on face-down Age II cards. From then on a turn
// may invoke a Divinity instead of taking a card: its space costs 3…8 coins
// (from the first player's end the other way round), the Gate twice that,
// minus Offering tokens and the Sanctuary. Grand Temples replace the Guilds
// (free with a Mythology token of their type; 5 / 12 / 21 VP for 1 / 2 / 3).
// New wonders: the Sanctuary, the Divine Theater; new Progress tokens:
// Mysticism, Poliorcetics, Engineering.
//
// Agora — a Senate of 6 Chambers (12 Influence cubes each; most cubes
// controls a Chamber and its Decree), 13 Senators shuffled into the ages (5 /
// 5 / 3, so the structures grow to 25 / 25 / 23 cards). A Politician gives
// 1–3 Senate actions (by blue cards): place a cube in its section or move one
// to the next Chamber. A Conspirator places a cube anywhere or Conspires:
// draw 2 Conspiracies, keep one face down, the other on top or bottom of the
// deck. A turn may prepare a Conspiracy (tuck a structure card under it); a
// prepared one can be triggered at the start of a later turn, before the
// main action. The military tokens give Senate actions instead of looting.
// Controlling all 6 Chambers is Political Supremacy; Chambers score 1/2/3 VP.
// New wonders: Curia Julia, Knossos; new Progress tokens: Corruption,
// Organized Crime.

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
  | 'purple'   // guilds (Age III) — Pantheon's Grand Temples
  | 'senator'; // Agora's Politicians and Conspirators (black)

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
// seventh (the scales) is only on the Law token (and Pantheon's Ishtar). A
// pair takes a Progress token; six different symbols is Scientific Supremacy.

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
  | { kind: 'guild'; what: DuelCount; coinsPer: number; vpPer: number }
  // Agora: a Politician gives Senate actions in its section of the Senate.
  | { kind: 'politician'; section: 1 | 2 | 3 }
  // Agora: a Conspirator places an Influence cube or Conspires.
  | { kind: 'conspirator' }
  // Pantheon: a Grand Temple — free with a Mythology token of its type.
  | { kind: 'grandTemple'; mythology: DuelMythology };

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
  | { kind: 'progressFromBox' }
  /** Agora (Knossos): place an Influence cube in any Chamber. */
  | { kind: 'placeInfluence' }
  /** Agora (Knossos): you may move one of your cubes to the next Chamber. */
  | { kind: 'moveInfluence' }
  /** Agora (Curia Julia): you may trigger one of your unprepared Conspiracies. */
  | { kind: 'triggerUnprepared' }
  /** Pantheon (the Sanctuary): invoking Divinities costs you this much less. */
  | { kind: 'divinityDiscount'; amount: number }
  /** Pantheon (the Divine Theater): look through a Mythology deck, invoke one for free. */
  | { kind: 'divineTheater' };

export interface DuelWonder {
  id: string;       // 'pyramids', 'mausoleum', etc.
  name: string;
  cost: DuelCost;
  effects: DuelWonderEffect[];
  description: string;
  /** The expansion that adds it (absent = the base game). */
  expansion?: 'pantheon' | 'agora';
  /** Agora wonders also act the moment they are drafted. */
  onSelect?: 'conspire' | 'placeInfluence';
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
  | 'urbanism'      // 6 coins now; 4 coins per chain build
  // Agora
  | 'corruption'    // Senators cost you nothing
  | 'organizedCrime' // Conspire: keep both Conspiracies
  // Pantheon
  | 'mysticism'     // 2 VP per Mythology / Offering token kept
  | 'poliorcetics'  // the opponent loses a coin per space you push the pawn
  | 'engineering';  // cards with a chain symbol under their cost cost 1 coin

export interface DuelProgressToken {
  id: DuelProgressTokenId;
  name: string;
  description: string;
  /** The expansion that adds it (absent = the base game). */
  expansion?: 'pantheon' | 'agora';
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
  /** Pantheon: a Mythology (Age I) or Offering (Age II) token lying on this
   *  face-down card, taken by whoever turns the card up. */
  token?: DuelStructureToken;
}

export type DuelStructureToken =
  | { kind: 'mythology'; mythology: DuelMythology }
  | { kind: 'offering'; value: number };

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
  /** Pantheon only. */
  pantheon?: DuelPlayerPantheon;
  /** Agora only. */
  agora?: DuelPlayerAgora;
}

export interface DuelPlayerPantheon {
  /** Divinities invoked, in order. */
  divinities: DuelDivinityId[];
  /** Mythology tokens taken (one per token). */
  mythologyTokens: DuelMythology[];
  /** Offering tokens not used yet (their discount). */
  offeringTokens: number[];
  /** Coins on Astarte: spendable, safe from coin losses, 1 VP each at the end. */
  astarteCoins: number;
  /** Nisaba: the Snake sits on this opponent's green card and lends you its symbol. */
  snake: { cardId: number; symbol: DuelScience } | null;
}

export interface DuelPlayerAgora {
  /** Influence cubes not in the Senate (12 at the start). */
  cubes: number;
  /** Conspiracies kept, face down until triggered. */
  conspiracies: DuelConspiracyState[];
}

export interface DuelConspiracyState {
  id: DuelConspiracyId;
  /** The structure card tucked under it to prepare it (face down). */
  preparedWith: number | null;
  triggered: boolean;
}

// ---------- Pantheon ----------

export type DuelMythology = 'mesopotamian' | 'phoenician' | 'greek' | 'egyptian' | 'roman';

export type DuelDivinityId =
  | 'enki' | 'ishtar' | 'nisaba'      // Mesopotamian
  | 'astarte' | 'baal' | 'tanit'      // Phoenician
  | 'aphrodite' | 'hades' | 'zeus'    // Greek
  | 'anubis' | 'isis' | 'ra'          // Egyptian
  | 'mars' | 'minerva' | 'neptune'    // Roman
  | 'gate';                           // the Gate (Age II, on the empty space)

export interface DuelDivinity {
  id: DuelDivinityId;
  name: string;
  /** Null for the Gate. */
  mythology: DuelMythology | null;
  description: string;
}

export interface DuelPantheonSpace {
  divinity: DuelDivinityId;
  /** Who placed it (they know it during Age I); null for the Gate. */
  placedBy: 0 | 1 | null;
}

export interface DuelPantheonState {
  /** The 6 spaces, index 0 = space 1. */
  spaces: (DuelPantheonSpace | null)[];
  /** Face-down Mythology decks, top = last element. */
  decks: Record<DuelMythology, DuelDivinityId[]>;
  /** From Age II every Divinity on the board is face up (and may be invoked). */
  revealed: boolean;
  /** The 2 Progress tokens on Enki once it is face up. */
  enkiTokens: DuelProgressTokenId[];
  /** Minerva's pawn on the military track (−9 … 9), or null. */
  minerva: number | null;
}

// ---------- Agora ----------

export type DuelDecreeId =
  | 'blueCoins' | 'greenCoins' | 'yellowCoins' | 'redCoins'   // coins (= the Age) whenever anyone builds that colour
  | 'yellowRebate' | 'redRebate' | 'greenRebate'              // ignore 1 cost symbol of that colour
  | 'wonderRebate'                                            // wonders cost 1 resource less
  | 'militaryDecree'                                          // a shield while you control it
  | 'rawTrade' | 'goodsTrade'                                 // 1 coin off each bought brown / gray resource
  | 'senateBoost'                                             // +2 blue cards for Senate actions
  | 'discardBonus'                                            // +2 coins on a discard
  | 'wonderCoins'                                             // coins (= the Age) whenever anyone builds a wonder
  | 'sharedChains'                                            // chain from your opponent's cards
  | 'conspiratorReplay';                                      // a Conspirator plays again

export type DuelConspiracyId =
  | 'extortion' | 'blackmail' | 'expropriation' | 'swindle' | 'obscurantism' | 'coup'
  | 'propertyFraud' | 'treason' | 'politicalManeuver' | 'espionage' | 'turnOfEvents'
  | 'embezzlement' | 'foreclosure' | 'coercion' | 'insiderInfluence' | 'sabotage';

export interface DuelDecreeSlot {
  id: DuelDecreeId;
  /** Chambers 2, 4 and 6 start face down; a Decree turns up once someone controls its Chamber. */
  faceUp: boolean;
}

export interface DuelAgoraState {
  /** Influence cubes per Chamber (index 0 = Chamber 1), per seat. */
  chambers: [number, number][];
  /** The Decrees in each Chamber, top first. */
  decrees: DuelDecreeSlot[][];
  /** Face-down Conspiracy deck, top = last element. */
  conspiracyDeck: DuelConspiracyId[];
  /** Senator card ids still to be shuffled into the coming ages. */
  senatorPile: number[];
  /** The Progress token Obscurantism locked away. */
  locked: { tokenId: DuelProgressTokenId; from: 'board' | 'opponent' | 'box' } | null;
  /** A Conspiracy was triggered this turn (one per turn). */
  triggeredThisTurn: boolean;
  /** A Conspiracy was triggered at the start of this turn: the main action is still to come. */
  beforeMainAction: boolean;
}

// ---------- Config ----------

export interface DuelConfig {
  variant?: 'base';
  /** The Pantheon expansion (absent = off). */
  pantheon?: boolean;
  /** The Agora expansion (absent = off). */
  agora?: boolean;
}

// ---------- Sub-phase + state ----------

export type DuelSubPhase =
  | 'wonderDraft'    // before Age I: 8 wonders, two groups of 4
  | 'turn'           // the active seat takes a pyramid card
  | 'progressPick'   // a science pair: take a Progress token from the board
  | 'libraryPick'    // The Great Library: keep 1 of 3 boxed tokens
  | 'destroyCard'    // Circus Maximus / Statue of Zeus / Expropriation / Swindle: discard an opponent's card
  | 'discardBuild'   // The Mausoleum / Hades: build a discarded card for free
  | 'chooseStarter'  // between ages: the weaker player picks who starts
  | 'finalScoring'   // game over
  // Pantheon
  | 'placeDivinity'  // a Mythology token: place 1 of 2 Divinities on the Pantheon
  | 'enki'           // keep 1 of the 2 Progress tokens on Enki
  | 'snake'          // Nisaba: the Snake on an opponent's green card
  | 'takeCard'       // Baal / Foreclosure: take an opponent's brown or gray card
  | 'zeus'           // Zeus: discard any card of the structure
  | 'anubis'         // Anubis: un-build a wonder
  | 'isis'           // Isis: build a wonder with a discarded card
  | 'takeWonder'     // Ra / Extortion: take an opponent's unbuilt wonder
  | 'minerva'        // Minerva: place her pawn on the track
  | 'neptuneDiscard' // Neptune: discard a military token…
  | 'neptuneApply'   // …then apply another
  | 'gate'           // the Gate: invoke one of the Mythology decks' top cards
  | 'theaterDeck'    // the Divine Theater: pick a Mythology deck…
  | 'theater'        // …and invoke one of its Divinities
  // Agora
  | 'senate'         // a Politician's Senate actions
  | 'placeInfluence' // place a cube in any Chamber
  | 'moveInfluence'  // optional: move a cube to the next Chamber
  | 'removeInfluence' // remove an opponent's cube
  | 'conspirator'    // a Conspirator: place a cube or Conspire
  | 'conspire'       // keep 1 of 2 Conspiracies
  | 'remnant'        // the other one on top or bottom of the deck
  | 'triggerUnprepared' // Curia Julia: may trigger an unprepared Conspiracy
  | 'lockToken'      // Obscurantism
  | 'backRowBuild'   // Property Fraud
  | 'boxBuild'       // Treason
  | 'espionage'      // Espionage
  | 'discardAvailable' // Turn of Events
  | 'swap'           // Coercion
  | 'moveDecree'     // Insider Influence
  | 'sabotage';      // Sabotage

/** A decision an effect has queued for a seat; resolved in order before the turn ends. */
export type DuelPending =
  | { kind: 'progress'; seatIdx: 0 | 1 }
  | { kind: 'library'; seatIdx: 0 | 1; options: DuelProgressTokenId[] }
  | { kind: 'destroy'; seatIdx: 0 | 1; color: 'brown' | 'gray' | 'blue' | 'yellow' }
  | { kind: 'discardBuild'; seatIdx: 0 | 1 }
  // Pantheon. `options` is drawn when the decision comes up.
  | { kind: 'placeDivinity'; seatIdx: 0 | 1; mythology: DuelMythology; options?: DuelDivinityId[] }
  | { kind: 'enki'; seatIdx: 0 | 1 }
  | { kind: 'snake'; seatIdx: 0 | 1 }
  | { kind: 'takeCard'; seatIdx: 0 | 1 }
  | { kind: 'zeus'; seatIdx: 0 | 1 }
  | { kind: 'anubis'; seatIdx: 0 | 1 }
  | { kind: 'isis'; seatIdx: 0 | 1 }
  | { kind: 'takeWonder'; seatIdx: 0 | 1 }
  | { kind: 'minerva'; seatIdx: 0 | 1 }
  | { kind: 'neptuneDiscard'; seatIdx: 0 | 1 }
  | { kind: 'neptuneApply'; seatIdx: 0 | 1 }
  | { kind: 'gate'; seatIdx: 0 | 1 }
  | { kind: 'theaterDeck'; seatIdx: 0 | 1 }
  | { kind: 'theater'; seatIdx: 0 | 1; mythology: DuelMythology }
  // Agora
  | { kind: 'senate'; seatIdx: 0 | 1; section: 1 | 2 | 3; left: number }
  | { kind: 'placeInfluence'; seatIdx: 0 | 1 }
  | { kind: 'moveInfluence'; seatIdx: 0 | 1 }
  | { kind: 'removeInfluence'; seatIdx: 0 | 1 }
  | { kind: 'conspirator'; seatIdx: 0 | 1 }
  | { kind: 'conspire'; seatIdx: 0 | 1; options?: DuelConspiracyId[] }
  | { kind: 'remnant'; seatIdx: 0 | 1; conspiracy: DuelConspiracyId }
  | { kind: 'triggerUnprepared'; seatIdx: 0 | 1 }
  | { kind: 'lockToken'; seatIdx: 0 | 1 }
  | { kind: 'backRowBuild'; seatIdx: 0 | 1 }
  | { kind: 'boxBuild'; seatIdx: 0 | 1 }
  | { kind: 'espionage'; seatIdx: 0 | 1 }
  | { kind: 'discardAvailable'; seatIdx: 0 | 1; optional: boolean }
  | { kind: 'swap'; seatIdx: 0 | 1 }
  | { kind: 'moveDecree'; seatIdx: 0 | 1 }
  | { kind: 'sabotage'; seatIdx: 0 | 1 };

/** The four military tokens: p1 = on seat 1's side (pushed there by seat 0), p2 = on seat 0's. */
export type DuelMilitaryToken = 'p1At3' | 'p1At6' | 'p2At3' | 'p2At6';

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
  /** Guilds — or, with Pantheon, the Grand Temples. */
  guild: number;
  wonders: number;
  progress: number;
  treasury: number;
  military: number;
  /** Pantheon: Aphrodite's 9 VP and the coins left on Astarte. */
  divinities: number;
  /** Agora: the Chambers controlled. */
  senate: number;
  total: number;
  coinsAtEnd: number;
}

export type DuelEndReason = 'civilian' | 'military' | 'science' | 'political';

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
  /** Seat whose turn it is (a decision may belong to the other seat meanwhile). */
  turnSeatIdx?: 0 | 1;

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
  /** The tokens left in the box at setup (hidden; the Great Library draws here). */
  progressBox: DuelProgressTokenId[];

  /** Queued decisions; the head one is the current sub-phase. */
  pending: DuelPending[];
  /** The active seat plays again once this turn's decisions are done. */
  replay: boolean;

  wonderDraft: DuelWonderDraft | null;

  /** The 3 cards of each age dealt so far that went back to the box unseen (Treason). */
  boxedCards?: DuelCard[];
  /** Pantheon only. */
  pantheon?: DuelPantheonState;
  /** Agora only. */
  agora?: DuelAgoraState;

  finalScoringBreakdown: DuelFinalScoringRow[] | null;
  endReason: DuelEndReason | null;
  /** Winning seat; null on a shared victory (or both reaching Scientific Supremacy at once). */
  winnerSeatIdx: 0 | 1 | null;

  log: DuelLogEntry[];
  logSeq: number;
}

// ---------- Log ----------
//
// Entries are public: nothing face down (a placed Divinity during Age I, a
// kept Conspiracy, a token locked from the box) is ever named in one.

export type DuelLogEntry =
  | { seq: number; age: DuelAge; kind: 'wonderDrafted'; playerId: PlayerId; wonderId: string }
  | { seq: number; age: DuelAge; kind: 'ageStart' }
  | { seq: number; age: DuelAge; kind: 'starterChosen'; playerId: PlayerId; starterId: PlayerId }
  | { seq: number; age: DuelAge; kind: 'cardBuilt'; playerId: PlayerId; cardId: number; cardName: string; paid: number; chained: boolean; fromDiscard?: boolean; free?: boolean }
  | { seq: number; age: DuelAge; kind: 'wonderBuilt'; playerId: PlayerId; wonderId: string; cardId: number; paid: number }
  | { seq: number; age: DuelAge; kind: 'cardDiscarded'; playerId: PlayerId; cardId: number; cardName: string; coinsGained: number }
  | { seq: number; age: DuelAge; kind: 'cardDestroyed'; playerId: PlayerId; ownerId: PlayerId; cardId: number; cardName: string }
  | { seq: number; age: DuelAge; kind: 'militaryAdvance'; playerId: PlayerId; amount: number; newPawn: number }
  | { seq: number; age: DuelAge; kind: 'looted'; playerId: PlayerId; coins: number }
  | { seq: number; age: DuelAge; kind: 'coinsLost'; playerId: PlayerId; coins: number }
  | { seq: number; age: DuelAge; kind: 'progressTaken'; playerId: PlayerId; tokenId: DuelProgressTokenId; fromBox: boolean }
  | { seq: number; age: DuelAge; kind: 'wonderRemoved'; playerId: PlayerId; wonderId: string }
  | { seq: number; age: DuelAge; kind: 'playAgain'; playerId: PlayerId }
  | { seq: number; age: DuelAge; kind: 'gameEnd'; reason: DuelEndReason; winnerId: PlayerId | null }
  // Pantheon
  | { seq: number; age: DuelAge; kind: 'tokenTaken'; playerId: PlayerId; token: DuelStructureToken }
  | { seq: number; age: DuelAge; kind: 'divinityPlaced'; playerId: PlayerId; mythology: DuelMythology; space: number }
  | { seq: number; age: DuelAge; kind: 'divinityInvoked'; playerId: PlayerId; divinity: DuelDivinityId; paid: number; free: boolean }
  | { seq: number; age: DuelAge; kind: 'gatePlaced'; space: number }
  | { seq: number; age: DuelAge; kind: 'snakePlaced'; playerId: PlayerId; cardId: number; cardName: string }
  | { seq: number; age: DuelAge; kind: 'cardTaken'; playerId: PlayerId; ownerId: PlayerId; cardId: number; cardName: string }
  | { seq: number; age: DuelAge; kind: 'structureDiscard'; playerId: PlayerId; cardId: number; cardName: string }
  | { seq: number; age: DuelAge; kind: 'wonderUnbuilt'; playerId: PlayerId; ownerId: PlayerId; wonderId: string; cardName: string }
  | { seq: number; age: DuelAge; kind: 'wonderTaken'; playerId: PlayerId; ownerId: PlayerId; wonderId: string }
  | { seq: number; age: DuelAge; kind: 'wonderSabotaged'; playerId: PlayerId; ownerId: PlayerId; wonderId: string }
  | { seq: number; age: DuelAge; kind: 'minervaPlaced'; playerId: PlayerId; position: number }
  | { seq: number; age: DuelAge; kind: 'minervaStop'; position: number }
  | { seq: number; age: DuelAge; kind: 'militaryToken'; playerId: PlayerId; token: DuelMilitaryToken; applied: boolean }
  // Agora
  | { seq: number; age: DuelAge; kind: 'influence'; playerId: PlayerId; action: 'place' | 'move' | 'remove'; chamber: number; from?: number }
  | { seq: number; age: DuelAge; kind: 'chamberControl'; playerId: PlayerId; chamber: number; gained: boolean }
  | { seq: number; age: DuelAge; kind: 'decreeRevealed'; chamber: number; decree: DuelDecreeId }
  | { seq: number; age: DuelAge; kind: 'decreeMoved'; playerId: PlayerId; from: number; to: number }
  | { seq: number; age: DuelAge; kind: 'decreeCoins'; playerId: PlayerId; decree: DuelDecreeId; coins: number }
  | { seq: number; age: DuelAge; kind: 'conspired'; playerId: PlayerId; kept: number }
  | { seq: number; age: DuelAge; kind: 'remnantPlaced'; playerId: PlayerId; top: boolean }
  | { seq: number; age: DuelAge; kind: 'conspiracyPrepared'; playerId: PlayerId; cardAge: DuelAge }
  | { seq: number; age: DuelAge; kind: 'conspiracyTriggered'; playerId: PlayerId; conspiracy: DuelConspiracyId }
  | { seq: number; age: DuelAge; kind: 'coinsTaken'; playerId: PlayerId; fromId: PlayerId; coins: number }
  | { seq: number; age: DuelAge; kind: 'tokenLocked'; playerId: PlayerId; tokenId: DuelProgressTokenId | null; from: 'board' | 'opponent' | 'box' }
  | { seq: number; age: DuelAge; kind: 'cardsSwapped'; playerId: PlayerId; took: string; gave: string };

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
  /** 'progressPick' / 'libraryPick' / 'enki' / 'espionage'. */
  | { type: 'chooseProgressToken'; playerId: PlayerId; tokenId: DuelProgressTokenId }
  /** 'destroyCard' — a card in the opponent's city. */
  | { type: 'destroyCard'; playerId: PlayerId; cardId: number }
  /** 'discardBuild' — a card from the discard pile. */
  | { type: 'buildFromDiscard'; playerId: PlayerId; cardId: number }
  /** 'chooseStarter' — who takes the first card of the new age. */
  | { type: 'chooseStarter'; playerId: PlayerId; starterId: PlayerId }
  /** Decline an optional decision (a cube move, the second Turn of Events
   *  discard, Curia Julia's trigger, the rest of a Politician's actions). */
  | { type: 'skip'; playerId: PlayerId }
  // ----- Pantheon -----
  /** 'turn' (Age II on): invoke the Divinity on a space (0–5), using some Offering tokens (their values). */
  | { type: 'invokeDivinity'; playerId: PlayerId; space: number; offerings?: number[] }
  /** 'placeDivinity' — one of the two drawn, on an empty space (0–5). */
  | { type: 'placeDivinity'; playerId: PlayerId; divinity: DuelDivinityId; space: number }
  /** 'gate' / 'theater' — invoke one for free; `top` = which of the two left goes back on top. */
  | { type: 'chooseDivinity'; playerId: PlayerId; divinity: DuelDivinityId; top?: DuelDivinityId }
  /** 'theaterDeck' — the Mythology deck to look through. */
  | { type: 'chooseMythology'; playerId: PlayerId; mythology: DuelMythology }
  /** 'snake' — an opponent's green card. */
  | { type: 'placeSnake'; playerId: PlayerId; cardId: number }
  /** 'takeCard' — an opponent's brown / gray card. */
  | { type: 'takeCard'; playerId: PlayerId; cardId: number }
  /** 'zeus' (any card) / 'discardAvailable' (an accessible one) — to the discard pile. */
  | { type: 'discardStructureCard'; playerId: PlayerId; cardId: number }
  /** 'anubis' (a built wonder), 'takeWonder' (the opponent's unbuilt), 'sabotage' (the opponent's built). */
  | { type: 'chooseWonder'; playerId: PlayerId; wonderId: string }
  /** 'isis' — a discarded card under one of your unbuilt wonders. */
  | { type: 'wonderFromDiscard'; playerId: PlayerId; cardId: number; wonderId: string }
  /** 'minerva' — a space of the track (−9 … 9) other than the pawn's. */
  | { type: 'placeMinerva'; playerId: PlayerId; position: number }
  /** 'neptuneDiscard' / 'neptuneApply'. */
  | { type: 'chooseMilitaryToken'; playerId: PlayerId; token: DuelMilitaryToken }
  // ----- Agora -----
  /** 'turn': tuck an accessible card under one of your unprepared Conspiracies. */
  | { type: 'takeAndPrepare'; playerId: PlayerId; cardId: number; conspiracy: DuelConspiracyId }
  /** 'turn' (before the main action): a prepared Conspiracy; 'triggerUnprepared': an unprepared one. */
  | { type: 'triggerConspiracy'; playerId: PlayerId; conspiracy: DuelConspiracyId }
  /** 'senate' / 'placeInfluence' — Chamber 1–6. */
  | { type: 'placeInfluence'; playerId: PlayerId; chamber: number }
  /** 'senate' / 'moveInfluence' — one of your cubes to the next Chamber. */
  | { type: 'moveInfluence'; playerId: PlayerId; from: number; to: number }
  /** 'removeInfluence' — one of your opponent's cubes. */
  | { type: 'removeInfluence'; playerId: PlayerId; chamber: number }
  /** 'conspirator'. */
  | { type: 'conspiratorChoice'; playerId: PlayerId; choice: 'influence' | 'conspire' }
  /** 'conspire' — the Conspiracy to keep. */
  | { type: 'chooseConspiracy'; playerId: PlayerId; conspiracy: DuelConspiracyId }
  /** 'remnant'. */
  | { type: 'placeRemnant'; playerId: PlayerId; top: boolean }
  /** 'lockToken' — from the board, the opponent or the box. */
  | { type: 'lockProgressToken'; playerId: PlayerId; tokenId: DuelProgressTokenId }
  /** 'backRowBuild' (the structure's back row) / 'boxBuild' (a boxed card) — built for free. */
  | { type: 'buildCard'; playerId: PlayerId; cardId: number }
  /** 'swap' — take their card, give yours of the same colour. */
  | { type: 'swapCards'; playerId: PlayerId; takeId: number; giveId: number }
  /** 'moveDecree' — the top Decree of `from` under the one in `to` (Chambers 1–6). */
  | { type: 'moveDecree'; playerId: PlayerId; from: number; to: number };
