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
//     all four. Two expansions can be switched on (config.expansions):
//       - Harbor: 10 establishments (boats that need the Harbor, the Tuna
//         Boat's extra roll, Tax Office…), three more personal landmarks (City
//         Hall, built from the start; Harbor, +2 to a roll of 10+; Airport) and
//         a 5th player. Win by building all seven.
//       - Millionaire's Row: 14 establishments — cards that care how many
//         landmarks someone has built, buildings closed for renovation
//         (Winery, Renovation Company), demolishing landmarks, a Loan Office
//         that pays you to build it, a Tech Startup you invest in, and the
//         International Exhibit Hall.
//     The supply is either every pile face-up (base rules) or Harbor's
//     marketplace: one shuffled deck, dealt until ten different piles show.
//
// Turn (both editions): roll 1 or 2 dice → [MK1 Radio Tower reroll] →
// [Harbor +2] → resolve every establishment whose number came up, in colour
// order red (others' cards, paid by the roller, counter-clockwise from the
// roller) → blue (everyone's) + green (roller's) → purple (roller's) →
// landmark effects → pending choices (demolish, give away, TV Station target,
// renovation, Exhibit Hall, Business Center exchanges, MK2 Moving Company
// gift) → build one card or pass [→ Tech Startup investment]. A player who
// can't pay in full pays what they have; the bank never covers the rest.
//
// Determinism: dice come from `state.rngState` inside the reducer; decks are
// shuffled once at setup. Everything is public, so there is no hidden state.

import type { GameStateShape } from '@/core/module';
import type { PlayerId } from '@/core/types';

export type MkEdition = 'mk2' | 'mk1';

/** MK1 expansions. */
export type MkExpansion = 'harbor' | 'millionairesRow';

/** MK1 supply: every pile face-up (base rules), or Harbor's marketplace — one
 *  shuffled deck dealt until ten different piles show. */
export type MkSupply = 'open' | 'marketplace';

export interface MkConfig {
  edition: MkEdition;
  /** MK2 only: shuffle the 3 promo landmarks (Private Club, City Hall,
   *  Renovation Company) into the landmark deck. */
  promoLandmarks: boolean;
  /** MK1 only: expansions in play (absent = none). */
  expansions?: MkExpansion[];
  /** MK1 only (absent = the marketplace with an expansion, open without). */
  supply?: MkSupply;
}

export type MkColor = 'blue' | 'green' | 'red' | 'purple';

/** The icon in a card's corner. Combo cards (MK2 Flower Shop, Winery…) carry
 *  'none', so they never count themselves. */
export type MkSymbol =
  | 'wheat' | 'cow' | 'gear' | 'shop' | 'cup' | 'fruit' | 'flower' | 'factory' | 'major'
  | 'boat' | 'briefcase' | 'none';

/** Every illustration in art.tsx. Cards of the two editions that show the same
 *  building share an art id. */
export type MkArtId =
  // establishments
  | 'wheatField' | 'ranch' | 'sushiBar' | 'bakery' | 'cafe' | 'vineyard' | 'flowerGarden'
  | 'convenienceStore' | 'forest' | 'flowerShop' | 'businessCenter' | 'stadium' | 'tvStation'
  | 'cornField' | 'cheeseFactory' | 'furnitureFactory' | 'hamburgerStand' | 'shoppingDistrict'
  | 'mine' | 'winery' | 'familyRestaurant' | 'appleOrchard' | 'foodWarehouse' | 'fruitMarket'
  | 'pizzaJoint' | 'mackerelBoat' | 'tunaBoat' | 'taxOffice' | 'generalStore' | 'demolitionCompany'
  // landmarks
  | 'trainStation' | 'shoppingMall' | 'amusementPark' | 'radioTower' | 'airport' | 'museum'
  | 'exhibitHall' | 'temple' | 'loanOffice' | 'park' | 'techStartup' | 'frenchRestaurant'
  | 'launchPad' | 'sodaPlant' | 'charterhouse' | 'privateClub' | 'forge' | 'cityHall'
  | 'renovationCompany' | 'farmersMarket' | 'movingCompany' | 'observatory' | 'publisher' | 'harbor';

export type MkEstEffect =
  /** Blue / green: coins from the bank. */
  | { kind: 'bank'; amount: number }
  /** Green combo: coins from the bank per establishment of `symbol` the owner has. */
  | { kind: 'bankPerSymbol'; amount: number; symbol: MkSymbol }
  /** Green (MK1 Soda Bottling Plant): per establishment of `symbol` anyone has. */
  | { kind: 'bankPerSymbolAll'; amount: number; symbol: MkSymbol }
  /** Green (MK1 Flower Shop, MK1 Winery): per copy of `cardId` the owner has. */
  | { kind: 'bankPerCard'; amount: number; cardId: string }
  /** Blue (Tuna Boat): the roller rolls 2 dice once; every copy earns the total. */
  | { kind: 'bankRoll' }
  /** Green (MK1 Loan Office): pay coins to the bank. */
  | { kind: 'payBank'; amount: number }
  /** Red: coins from the roller. */
  | { kind: 'takeFromRoller'; amount: number }
  /** Red (Members Only Club): every coin the roller has. */
  | { kind: 'takeAllFromRoller' }
  /** Green (Demolition Company): demolish one of your landmarks for coins. */
  | { kind: 'demolish'; amount: number }
  /** Green (MK1 Moving Company): give a non-major establishment to any
   *  opponent for coins. */
  | { kind: 'give'; amount: number }
  /** Purple: coins from every opponent. */
  | { kind: 'takeFromEach'; amount: number }
  /** Purple: half (rounded down) of every opponent holding more than `threshold`. */
  | { kind: 'takeHalfAbove'; threshold: number }
  /** Purple (MK1 TV Station): coins from one opponent of the roller's choice. */
  | { kind: 'takeFromOne'; amount: number }
  /** Purple (MK1 Publisher): from each opponent, per establishment of `symbols`. */
  | { kind: 'takePerSymbolFromEach'; amount: number; symbols: MkSymbol[] }
  /** Purple (MK1 Tech Startup): the owner's investment, from each opponent. */
  | { kind: 'invested' }
  /** Purple (MK1 Park): share every player's coins out evenly. */
  | { kind: 'redistribute' }
  /** Purple (MK1 Renovation Company): close every copy of a non-major type;
   *  coins from each opponent per copy of theirs closed. */
  | { kind: 'renovate'; amount: number }
  /** Purple (International Exhibit Hall): activate another of your cards
   *  instead, and the Hall goes back to the market. */
  | { kind: 'activateOther' }
  /** Purple (Business Center): swap one establishment with an opponent. */
  | { kind: 'exchange' };

/** A card with a condition activates as usual but pays only while it holds. */
export type MkCondition =
  /** Harbor's boats and Sushi Bar: the owner has built this landmark. */
  | { kind: 'ownerHas'; landmark: string }
  /** General Store, MK1 Corn Field: the owner has built fewer landmarks. */
  | { kind: 'ownerBelow'; landmarks: number }
  /** MK1 French Restaurant, Members Only Club: the roller has built at least this many. */
  | { kind: 'rollerAtLeast'; landmarks: number };

export interface MkEstablishmentDef {
  id: string;
  name: string;
  color: MkColor;
  symbol: MkSymbol;
  activation: number[];
  /** Negative for the MK1 Loan Office: building it pays you. */
  cost: number;
  /** Copies in the supply / deck (MK1 purples: one per player instead). */
  copies: number;
  effect: MkEstEffect;
  condition?: MkCondition;
  /** MK1 Winery: closes for renovation after it activates. */
  closesAfter?: boolean;
  /** MK1 expansion the card comes from. */
  expansion?: MkExpansion;
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
  | { kind: 'reroll' }                                       // MK1 Radio Tower
  | { kind: 'addToRoll'; min: number; amount: number }      // Harbor
  | { kind: 'brokeCoin'; amount: number };                   // MK1 City Hall

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
  /** MK1 City Hall: everyone starts with it built. It can't be demolished and
   *  doesn't count towards "landmarks built" conditions. */
  prebuilt?: boolean;
  /** MK1 expansion the card comes from. */
  expansion?: MkExpansion;
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
  /** Establishment id → how many of those copies are closed for renovation
   *  (never more than owned; entries are never 0). */
  closed: Record<string, number>;
  /** Built landmark ids, in build order. */
  landmarks: string[];
  /** Coins on the player's Tech Startup. */
  invested: number;
}

export interface MkMarketSlot {
  cardId: string;
  /** Copies stacked here. MK1's open supply keeps a sold-out pile at 0. */
  count: number;
}

/** MK2: 'low' / 'high' / 'landmark'. MK1 open supply: 'low' / 'high'. MK1
 *  marketplace: 'mixed' (every establishment in one deck). */
export type MkRowId = 'low' | 'high' | 'landmark' | 'mixed';

export interface MkMarketRow {
  /** Face-down deck; next card at index 0. Empty in MK1's open supply. */
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
  /** Harbor: add 2 to a roll of 10 or more, or not. */
  | 'harbor'
  /** Demolition Company: pick one of your landmarks to demolish. */
  | 'demolish'
  /** MK1 Moving Company: give a non-major establishment to any opponent. */
  | 'give'
  /** MK1 TV Station: pick the opponent who pays. */
  | 'tvTarget'
  /** Renovation Company: pick the establishment type to close. */
  | 'renovate'
  /** International Exhibit Hall: activate another of your cards instead, or not. */
  | 'exhibit'
  /** Business Center: swap establishments, or skip. */
  | 'exchange'
  /** MK2 Moving Company: give an establishment to the player on your right. */
  | 'gift'
  /** Build one card or pass. */
  | 'build';

export interface MkRoll {
  dice: number[];
  /** Includes `added`. */
  total: number;
  doubles: boolean;
  /** Added by the Harbor. */
  added: number;
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
  /** Demolition Company activations still to resolve. */
  demolishLeft: number;
  /** MK1 Moving Company activations still to resolve. */
  givesLeft: number;
  /** Renovation Company activations still to resolve. */
  renovateLeft: number;
  /** International Exhibit Hall activations still to resolve. */
  exhibitLeft: number;
  /** This turn's Tuna Boat roll (rolled once, shared by every Tuna Boat). */
  bonusRoll: number | null;
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
  /** Harbor: the roll's new total. */
  | { kind: 'addToRoll'; playerId: PlayerId; amount: number; total: number; source: MkSource }
  /** Tuna Boat: the active player's extra roll. */
  | { kind: 'bonusRoll'; playerId: PlayerId; dice: number[]; total: number; source: MkSource }
  /** Coins moved. `from` null = the bank. `owed` > `amount` when the payer ran short. */
  | { kind: 'coins'; to: PlayerId; from: PlayerId | null; amount: number; owed: number; source: MkSource }
  /** Coins paid to the bank (MK1 Loan Office). */
  | { kind: 'payBank'; from: PlayerId; amount: number; owed: number; source: MkSource }
  | { kind: 'redistribute'; each: number; fromBank: number; source: MkSource }
  /** Renovation Company: `cardId` is picked (the closings follow). */
  | { kind: 'renovate'; playerId: PlayerId; cardId: string }
  /** Copies of `cardId` in `playerId`'s town close for renovation… */
  | { kind: 'closed'; playerId: PlayerId; cardId: string; copies: number }
  /** …and reopen instead of activating. */
  | { kind: 'reopened'; playerId: PlayerId; cardId: string; copies: number }
  | { kind: 'demolish'; playerId: PlayerId; landmarkId: string }
  /** MK1 Moving Company. */
  | { kind: 'give'; playerId: PlayerId; toId: PlayerId; cardId: string }
  | { kind: 'invest'; playerId: PlayerId; total: number }
  /** International Exhibit Hall: `cardId` activated instead and `hallId` went
   *  back to the market — or (null) the Hall stays. */
  | { kind: 'exhibit'; playerId: PlayerId; cardId: string | null; hallId: string }
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
  /** Harbor: add 2 to the roll, or keep it. */
  | { type: 'harbor'; playerId: PlayerId; add: boolean }
  /** Demolition Company. */
  | { type: 'demolish'; playerId: PlayerId; landmarkId: string }
  /** MK1 Moving Company. */
  | { type: 'give'; playerId: PlayerId; cardId: string; targetId: PlayerId }
  /** MK1 TV Station. */
  | { type: 'tvTarget'; playerId: PlayerId; targetId: PlayerId }
  /** Renovation Company. */
  | { type: 'renovate'; playerId: PlayerId; cardId: string }
  /** International Exhibit Hall: activate `cardId` instead, or (null) don't. */
  | { type: 'exhibit'; playerId: PlayerId; cardId: string | null }
  /** Business Center: give `give` (yours) to `targetId` for their `take`. */
  | { type: 'exchange'; playerId: PlayerId; give: string; targetId: PlayerId; take: string }
  | { type: 'skipExchange'; playerId: PlayerId }
  /** MK2 Moving Company. */
  | { type: 'gift'; playerId: PlayerId; cardId: string }
  /** `invest`: put 1 coin on your Tech Startup as the turn ends (if you can). */
  | { type: 'build'; playerId: PlayerId; cardId: string; invest?: boolean }
  | { type: 'pass'; playerId: PlayerId; invest?: boolean };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An action without its `playerId` (the UI / tests fill it in). */
export type MkMove = DistributiveOmit<MkAction, 'playerId'>;
