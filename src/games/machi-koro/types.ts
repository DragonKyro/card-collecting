// Machi Koro — types + design notes.
//
// One module, two editions (config.edition):
//   - 'mk2' (default) — Machi Koro 2 (Pandasaurus, 2021). Everyone starts with
//     5 coins and no cards. Three opening rounds are build-only (no dice). The
//     market is three rows of five face-up stacks — establishments activating
//     on 1–6, establishments activating on 7+, landmarks — refilled from their
//     shuffled decks (a drawn duplicate stacks on its twin until five different
//     cards show). A landmark costs more the more landmarks you already own
//     (`costs[built]`). Win by building your third landmark, or the Launch Pad.
//     Most landmarks are "everyone" cards: once anyone builds them, their rule
//     applies to every player.
//   - 'mk1' — Machi Koro (base game). Everyone starts with 3 coins, a Wheat
//     Field and a Bakery, and the same four personal landmarks to build (Train
//     Station, Shopping Mall, Amusement Park, Radio Tower). Every establishment
//     pile is face-up (modelled as market rows with no decks), one copy of each
//     purple per player, two dice only with the Train Station. Win by building
//     all four. Harbor / Millionaire's Row expansions are not modelled.
//
// Turn (both editions): roll 1 or 2 dice → resolve every establishment whose
// number came up, in colour order red (others' cards, paid by the roller,
// counter-clockwise from the roller) → blue (everyone's) + green (roller's) →
// purple (roller's) → landmark effects → pending choices (MK1 TV Station
// target, Business Center exchanges, MK2 Moving Company gift) → build one card
// or pass. A player who can't pay in full pays what they have; the bank never
// covers the rest.
//
// Determinism: dice come from `state.rngState` inside the reducer; decks are
// shuffled once at setup. Everything is public, so there is no hidden state.

import type { GameStateShape } from '@/core/module';
import type { PlayerId } from '@/core/types';

export type MkEdition = 'mk2' | 'mk1';

export interface MkConfig {
  edition: MkEdition;
  /** MK2 only: shuffle the 3 promo landmarks (Private Club, City Hall,
   *  Renovation Company) into the landmark deck. */
  promoLandmarks: boolean;
}

export type MkColor = 'blue' | 'green' | 'red' | 'purple';

/** The icon in a card's corner. Combo cards (MK2 Flower Shop, Winery…) carry
 *  'none', so they never count themselves. */
export type MkSymbol =
  | 'wheat' | 'cow' | 'gear' | 'shop' | 'cup' | 'fruit' | 'flower' | 'factory' | 'major' | 'none';

/** Every illustration in art.tsx. Cards of the two editions that show the same
 *  building share an art id. */
export type MkArtId =
  // establishments
  | 'wheatField' | 'ranch' | 'sushiBar' | 'bakery' | 'cafe' | 'vineyard' | 'flowerGarden'
  | 'convenienceStore' | 'forest' | 'flowerShop' | 'businessCenter' | 'stadium' | 'tvStation'
  | 'cornField' | 'cheeseFactory' | 'furnitureFactory' | 'hamburgerStand' | 'shoppingDistrict'
  | 'mine' | 'winery' | 'familyRestaurant' | 'appleOrchard' | 'foodWarehouse' | 'fruitMarket'
  // landmarks
  | 'trainStation' | 'shoppingMall' | 'amusementPark' | 'radioTower' | 'airport' | 'museum'
  | 'exhibitHall' | 'temple' | 'loanOffice' | 'park' | 'techStartup' | 'frenchRestaurant'
  | 'launchPad' | 'sodaPlant' | 'charterhouse' | 'privateClub' | 'forge' | 'cityHall'
  | 'renovationCompany' | 'farmersMarket' | 'movingCompany' | 'observatory' | 'publisher';

export type MkEstEffect =
  /** Blue / green: coins from the bank. */
  | { kind: 'bank'; amount: number }
  /** Green combo: coins from the bank per establishment of `symbol` the owner has. */
  | { kind: 'bankPerSymbol'; amount: number; symbol: MkSymbol }
  /** Red: coins from the roller. */
  | { kind: 'takeFromRoller'; amount: number }
  /** Purple: coins from every opponent. */
  | { kind: 'takeFromEach'; amount: number }
  /** Purple: half (rounded down) of every opponent holding more than `threshold`. */
  | { kind: 'takeHalfAbove'; threshold: number }
  /** Purple (MK1 TV Station): coins from one opponent of the roller's choice. */
  | { kind: 'takeFromOne'; amount: number }
  /** Purple (Business Center): swap one establishment with an opponent. */
  | { kind: 'exchange' };

export interface MkEstablishmentDef {
  id: string;
  name: string;
  color: MkColor;
  symbol: MkSymbol;
  activation: number[];
  cost: number;
  /** Copies in the supply / deck. */
  copies: number;
  effect: MkEstEffect;
  /** Card text, as printed (shortened). */
  text: string;
  art: MkArtId;
}

export type MkLandmarkEffect =
  // Immediate — resolved once, for the builder, when built.
  | { kind: 'takeHalfAbove'; threshold: number }            // Exhibit Hall
  | { kind: 'takeFromEach'; amount: number }                 // French Restaurant
  | { kind: 'takePerLandmark'; amount: number }              // Museum
  | { kind: 'takePerSymbol'; amount: number; symbol: MkSymbol } // Publisher, TV Station
  | { kind: 'takeIfLandmarks'; landmarks: number; amount: number } // Private Club
  | { kind: 'redistribute' }                                 // Park
  | { kind: 'extraTurn' }                                    // MK2 Radio Tower
  | { kind: 'win' }                                          // Launch Pad
  // Ongoing — in force while built.
  | { kind: 'symbolBonus'; symbols: MkSymbol[]; amount: number } // Forge, Soda Plant, Malls, Farmers Market
  | { kind: 'skipBuildBonus'; amount: number }               // Airport
  | { kind: 'noIncomeBonus'; dice: 1 | 2; amount: number }   // City Hall (1), Charterhouse (2)
  | { kind: 'doublesExtraTurn' }                             // Amusement Park
  | { kind: 'doublesTakeFromEach'; amount: number }          // Temple
  | { kind: 'rollBonus'; total: number; amount: number }     // Tech Startup
  | { kind: 'rollBonusPerSymbol'; total: number; amount: number; symbol: MkSymbol } // Renovation Company
  | { kind: 'doublesGiveRight' }                             // Moving Company
  | { kind: 'launchPadDiscount'; amount: number }            // Observatory
  | { kind: 'landmarkDiscount'; amount: number }             // Loan Office
  | { kind: 'twoDice' }                                      // MK1 Train Station
  | { kind: 'reroll' };                                      // MK1 Radio Tower

export interface MkLandmarkDef {
  id: string;
  name: string;
  /** Price by how many landmarks the builder already owns (last entry repeats). */
  costs: number[];
  /** 'immediate' fires once on build; 'ongoing' stays in force. */
  timing: 'immediate' | 'ongoing';
  /** Ongoing landmarks: 'everyone' = applies to every player once anyone has
   *  built it (MK2's orange cards); 'owner' = only its builder. */
  scope: 'everyone' | 'owner';
  /** MK2 promo-pack landmark (lobby toggle). */
  promo?: boolean;
  /** Loan Office: buildable only while you are the only player with no landmarks. */
  onlyIfSoleWithout?: boolean;
  effect: MkLandmarkEffect;
  text: string;
  /** Shorter wording that fits on the card face. */
  face: string;
  art: MkArtId;
}

export interface MkPlayer {
  id: PlayerId;
  coins: number;
  /** Establishment id → copies owned (entries are never 0). */
  city: Record<string, number>;
  /** Built landmark ids, in build order. */
  landmarks: string[];
}

export interface MkMarketSlot {
  cardId: string;
  /** Copies stacked here. MK1's open supply keeps a sold-out pile at 0. */
  count: number;
}

export type MkRowId = 'low' | 'high' | 'landmark';

export interface MkMarketRow {
  /** Face-down deck; next card at index 0. Empty in MK1. */
  deck: string[];
  slots: MkMarketSlot[];
}

export type MkSubPhase =
  /** MK2 opening: three build-only rounds (establishments only, no dice). */
  | 'setupBuild'
  /** Waiting for the active player to roll. */
  | 'roll'
  /** MK1 Radio Tower: keep the roll or reroll once. */
  | 'reroll'
  /** MK1 TV Station: pick the opponent who pays. */
  | 'tvTarget'
  /** Business Center: swap establishments, or skip. */
  | 'exchange'
  /** MK2 Moving Company: give an establishment to the player on your right. */
  | 'gift'
  /** Build one card or pass. */
  | 'build';

export interface MkRoll {
  dice: number[];
  total: number;
  doubles: boolean;
}

export interface MkTurn {
  roll: MkRoll | null;
  /** MK1 Radio Tower already used this turn. */
  rerolled: boolean;
  /** Coins the active player received while their roll resolved (gross, any
   *  source) — City Hall / Charterhouse pay out when this stays 0. */
  received: number;
  /** Card built this turn, if any (Airport pays when nothing was). */
  built: string | null;
  /** This player takes another turn after this one. */
  extraTurn: boolean;
  /** Business Center activations still to resolve. */
  exchangesLeft: number;
  /** MK1 TV Station activations still to resolve. */
  tvLeft: number;
  /** MK2 Moving Company gift owed. */
  giftOwed: boolean;
}

export interface MkState extends GameStateShape {
  config: MkConfig;
  players: MkPlayer[];
  /** Index into players of whoever took the first turn. */
  firstIdx: number;
  /** Index into players of the active player. */
  currentIdx: number;
  /** MK2 opening build round (1..3) while subPhase is 'setupBuild', else 0. */
  setupRound: number;
  /** Full rounds of rolling turns so far (1-based). */
  round: number;
  /** Turns taken (incl. setup turns and extra turns). */
  turnNumber: number;
  subPhase: MkSubPhase;
  market: Record<MkRowId, MkMarketRow>;
  turn: MkTurn;
  winnerId: PlayerId | null;
  winReason: 'landmarks' | 'launchPad' | null;
  log: MkLogEntry[];
  logSeq: number;
}

/** Where coins came from / went for a log line: an establishment or a landmark. */
export interface MkSource {
  type: 'est' | 'lm' | 'rule';
  /** Card id, or for 'rule': 'broke' (1 coin when you have none). */
  id: string;
  /** Who owns the card (for establishments: the activated copy's owner). */
  ownerId: PlayerId | null;
  /** Copies that activated together. */
  copies?: number;
}

type MkLogBody =
  | { kind: 'firstPlayer'; playerId: PlayerId }
  | { kind: 'setupDone' }
  | { kind: 'turnStart'; playerId: PlayerId; extra: boolean }
  | { kind: 'roll'; playerId: PlayerId; dice: number[]; total: number; doubles: boolean; reroll: boolean }
  | { kind: 'keepRoll'; playerId: PlayerId }
  /** Coins moved. `from` null = the bank. `owed` > `amount` when the payer ran short. */
  | { kind: 'coins'; to: PlayerId; from: PlayerId | null; amount: number; owed: number; source: MkSource }
  | { kind: 'redistribute'; each: number; fromBank: number; source: MkSource }
  | { kind: 'exchange'; playerId: PlayerId; withId: PlayerId; gave: string; took: string }
  | { kind: 'skipExchange'; playerId: PlayerId }
  | { kind: 'gift'; playerId: PlayerId; toId: PlayerId; cardId: string }
  | { kind: 'build'; playerId: PlayerId; cardId: string; landmark: boolean; cost: number }
  | { kind: 'pass'; playerId: PlayerId }
  | { kind: 'extraTurn'; playerId: PlayerId; source: MkSource }
  | { kind: 'win'; playerId: PlayerId; reason: 'landmarks' | 'launchPad' };

export type MkLogEntry = MkLogBody & { seq: number; turn: number };
export type MkLogKind = MkLogEntry['kind'];

export type MkAction =
  | { type: 'roll'; playerId: PlayerId; dice: 1 | 2 }
  /** MK1 Radio Tower. */
  | { type: 'keepRoll'; playerId: PlayerId }
  | { type: 'reroll'; playerId: PlayerId; dice: 1 | 2 }
  /** MK1 TV Station. */
  | { type: 'tvTarget'; playerId: PlayerId; targetId: PlayerId }
  /** Business Center: give `give` (yours) to `targetId` for their `take`. */
  | { type: 'exchange'; playerId: PlayerId; give: string; targetId: PlayerId; take: string }
  | { type: 'skipExchange'; playerId: PlayerId }
  /** MK2 Moving Company. */
  | { type: 'gift'; playerId: PlayerId; cardId: string }
  | { type: 'build'; playerId: PlayerId; cardId: string }
  | { type: 'pass'; playerId: PlayerId };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An action without its `playerId` (the UI / tests fill it in). */
export type MkMove = DistributiveOmit<MkAction, 'playerId'>;
