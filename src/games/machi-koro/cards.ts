// Card catalogues + edition rules.
//
// MK2 card data cross-checked between two independent MK2 engines (one
// written against the official rulebook PDF): activation numbers, costs,
// effects and landmark price ladders agree everywhere. Copy counts follow the
// rulebook-checked one (Stadium 4, Hamburger Stand 4; 86 establishments total
// — the other has 3 / 5, same total). 20 base landmarks + 3 promo.
//
// MK1 is the base game: 15 establishments (6 copies each, purples 4 — one per
// player), plus a starting Wheat Field and Bakery per player outside the supply.

import type {
  MkEdition, MkEstablishmentDef, MkLandmarkDef, MkRowId, MkSymbol,
} from './types';

// ---------- MK2 ----------

const MK2_ESTABLISHMENTS: MkEstablishmentDef[] = [
  { id: 'wheatField', name: 'Wheat Field', color: 'blue', symbol: 'wheat', activation: [1, 2], cost: 1, copies: 5,
    effect: { kind: 'bank', amount: 1 }, text: 'Get 1 coin from the bank. (anyone’s turn)', art: 'wheatField' },
  { id: 'sushiBar', name: 'Sushi Bar', color: 'red', symbol: 'cup', activation: [1], cost: 2, copies: 5,
    effect: { kind: 'takeFromRoller', amount: 3 }, text: 'Take 3 coins from the player who rolled. (opponents’ turns)', art: 'sushiBar' },
  { id: 'vineyard', name: 'Vineyard', color: 'blue', symbol: 'fruit', activation: [2], cost: 1, copies: 5,
    effect: { kind: 'bank', amount: 2 }, text: 'Get 2 coins from the bank. (anyone’s turn)', art: 'vineyard' },
  { id: 'bakery', name: 'Bakery', color: 'green', symbol: 'shop', activation: [2, 3], cost: 1, copies: 5,
    effect: { kind: 'bank', amount: 2 }, text: 'Get 2 coins from the bank. (your turn only)', art: 'bakery' },
  { id: 'cafe', name: 'Café', color: 'red', symbol: 'cup', activation: [3], cost: 1, copies: 5,
    effect: { kind: 'takeFromRoller', amount: 2 }, text: 'Take 2 coins from the player who rolled. (opponents’ turns)', art: 'cafe' },
  { id: 'convenienceStore', name: 'Convenience Store', color: 'green', symbol: 'shop', activation: [4], cost: 1, copies: 5,
    effect: { kind: 'bank', amount: 3 }, text: 'Get 3 coins from the bank. (your turn only)', art: 'convenienceStore' },
  { id: 'flowerGarden', name: 'Flower Garden', color: 'blue', symbol: 'flower', activation: [4], cost: 2, copies: 5,
    effect: { kind: 'bank', amount: 2 }, text: 'Get 2 coins from the bank. (anyone’s turn)', art: 'flowerGarden' },
  { id: 'forest', name: 'Forest', color: 'blue', symbol: 'gear', activation: [5], cost: 3, copies: 5,
    effect: { kind: 'bank', amount: 2 }, text: 'Get 2 coins from the bank. (anyone’s turn)', art: 'forest' },
  { id: 'flowerShop', name: 'Flower Shop', color: 'green', symbol: 'none', activation: [6], cost: 1, copies: 3,
    effect: { kind: 'bankPerSymbol', amount: 3, symbol: 'flower' },
    text: 'Get 3 coins from the bank for each flower establishment you own. (your turn only)', art: 'flowerShop' },
  { id: 'businessCenter', name: 'Business Center', color: 'purple', symbol: 'major', activation: [6], cost: 3, copies: 3,
    effect: { kind: 'exchange' },
    text: 'You may exchange 1 of your establishments for 1 an opponent owns. (your turn only)', art: 'businessCenter' },
  { id: 'cornField', name: 'Corn Field', color: 'blue', symbol: 'wheat', activation: [7], cost: 2, copies: 5,
    effect: { kind: 'bank', amount: 3 }, text: 'Get 3 coins from the bank. (anyone’s turn)', art: 'cornField' },
  { id: 'stadium', name: 'Stadium', color: 'purple', symbol: 'major', activation: [7], cost: 3, copies: 4,
    effect: { kind: 'takeFromEach', amount: 3 }, text: 'Take 3 coins from each opponent. (your turn only)', art: 'stadium' },
  { id: 'furnitureFactory', name: 'Furniture Factory', color: 'green', symbol: 'none', activation: [8], cost: 4, copies: 3,
    effect: { kind: 'bankPerSymbol', amount: 4, symbol: 'gear' },
    text: 'Get 4 coins from the bank for each gear establishment you own. (your turn only)', art: 'furnitureFactory' },
  { id: 'hamburgerStand', name: 'Hamburger Stand', color: 'red', symbol: 'cup', activation: [8], cost: 1, copies: 4,
    effect: { kind: 'takeFromRoller', amount: 2 }, text: 'Take 2 coins from the player who rolled. (opponents’ turns)', art: 'hamburgerStand' },
  { id: 'shoppingDistrict', name: 'Shopping District', color: 'purple', symbol: 'major', activation: [8, 9], cost: 3, copies: 3,
    effect: { kind: 'takeHalfAbove', threshold: 10 },
    text: 'From each opponent with more than 10 coins, take half (rounded down). (your turn only)', art: 'shoppingDistrict' },
  { id: 'winery', name: 'Winery', color: 'green', symbol: 'none', activation: [9], cost: 3, copies: 3,
    effect: { kind: 'bankPerSymbol', amount: 3, symbol: 'fruit' },
    text: 'Get 3 coins from the bank for each fruit establishment you own. (your turn only)', art: 'winery' },
  { id: 'familyRestaurant', name: 'Family Restaurant', color: 'red', symbol: 'cup', activation: [9, 10], cost: 2, copies: 5,
    effect: { kind: 'takeFromRoller', amount: 2 }, text: 'Take 2 coins from the player who rolled. (opponents’ turns)', art: 'familyRestaurant' },
  { id: 'appleOrchard', name: 'Apple Orchard', color: 'blue', symbol: 'fruit', activation: [10], cost: 1, copies: 5,
    effect: { kind: 'bank', amount: 3 }, text: 'Get 3 coins from the bank. (anyone’s turn)', art: 'appleOrchard' },
  { id: 'foodWarehouse', name: 'Food Warehouse', color: 'green', symbol: 'none', activation: [10, 11], cost: 2, copies: 3,
    effect: { kind: 'bankPerSymbol', amount: 2, symbol: 'cup' },
    text: 'Get 2 coins from the bank for each cup establishment you own. (your turn only)', art: 'foodWarehouse' },
  { id: 'mine', name: 'Mine', color: 'blue', symbol: 'gear', activation: [11, 12], cost: 4, copies: 5,
    effect: { kind: 'bank', amount: 6 }, text: 'Get 6 coins from the bank. (anyone’s turn)', art: 'mine' },
];

/** Landmark price ladders: 1st / 2nd / 3rd landmark you build. */
const STD = [12, 16, 22];
const CHEAP = [10, 14, 22];

const MK2_LANDMARKS: MkLandmarkDef[] = [
  { id: 'airport', name: 'Airport', costs: STD, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'skipBuildBonus', amount: 5 }, text: 'If you don’t build anything on your turn, get 5 coins from the bank.', face: 'Build nothing on your turn: get 5 coins.', art: 'airport' },
  { id: 'amusementPark', name: 'Amusement Park', costs: STD, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'doublesExtraTurn' }, text: 'If you roll doubles, take another turn after this one.', face: 'Roll doubles: take another turn.', art: 'amusementPark' },
  { id: 'charterhouse', name: 'Charterhouse', costs: STD, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'noIncomeBonus', dice: 2, amount: 3 }, text: 'If you roll 2 dice and receive no coins, get 3 coins from the bank.', face: '2 dice, no coins? Take 3 from the bank.', art: 'charterhouse' },
  { id: 'exhibitHall', name: 'Exhibit Hall', costs: STD, timing: 'immediate', scope: 'owner',
    effect: { kind: 'takeHalfAbove', threshold: 10 }, text: 'From each opponent with more than 10 coins, take half (rounded down).', face: 'Take half from each opponent with 11+ coins.', art: 'exhibitHall' },
  { id: 'farmersMarket', name: 'Farmers Market', costs: CHEAP, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'symbolBonus', symbols: ['wheat'], amount: 1 }, text: 'Your wheat establishments earn +1 coin when activated.', face: 'Wheat establishments earn +1.', art: 'farmersMarket' },
  { id: 'forge', name: 'Forge', costs: STD, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'symbolBonus', symbols: ['gear'], amount: 1 }, text: 'Your gear establishments earn +1 coin when activated.', face: 'Gear establishments earn +1.', art: 'forge' },
  { id: 'frenchRestaurant', name: 'French Restaurant', costs: CHEAP, timing: 'immediate', scope: 'owner',
    effect: { kind: 'takeFromEach', amount: 2 }, text: 'Take 2 coins from each opponent.', face: 'Take 2 coins from each opponent.', art: 'frenchRestaurant' },
  { id: 'launchPad', name: 'Launch Pad', costs: [45, 38, 25], timing: 'immediate', scope: 'owner',
    effect: { kind: 'win' }, text: 'You win the game!', face: 'You win the game!', art: 'launchPad' },
  { id: 'loanOffice', name: 'Loan Office', costs: [10], timing: 'ongoing', scope: 'owner', onlyIfSoleWithout: true,
    effect: { kind: 'landmarkDiscount', amount: 2 },
    text: 'Only while you’re the sole player with no landmarks. Your landmarks cost 2 less.', face: 'Your landmarks cost 2 less. Only if you alone have none.', art: 'loanOffice' },
  { id: 'movingCompany', name: 'Moving Company', costs: CHEAP, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'doublesGiveRight' }, text: 'If you roll doubles, give 1 of your establishments to the player on your right.', face: 'Roll doubles: give a card to the player on your right.', art: 'movingCompany' },
  { id: 'museum', name: 'Museum', costs: STD, timing: 'immediate', scope: 'owner',
    effect: { kind: 'takePerLandmark', amount: 3 }, text: 'Take 3 coins from each opponent for each landmark they own.', face: 'Take 3 per landmark from each opponent.', art: 'museum' },
  { id: 'observatory', name: 'Observatory', costs: CHEAP, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'launchPadDiscount', amount: 5 }, text: 'The Launch Pad costs 5 coins less.', face: 'The Launch Pad costs 5 less.', art: 'observatory' },
  { id: 'park', name: 'Park', costs: STD, timing: 'immediate', scope: 'owner',
    effect: { kind: 'redistribute' }, text: 'Share all players’ coins out evenly; the bank makes up any difference.', face: 'Share everyone’s coins out evenly.', art: 'park' },
  { id: 'publisher', name: 'Publisher', costs: CHEAP, timing: 'immediate', scope: 'owner',
    effect: { kind: 'takePerSymbol', amount: 1, symbol: 'shop' }, text: 'Take 1 coin from each opponent for each shop establishment they own.', face: 'Take 1 per shop card from each opponent.', art: 'publisher' },
  { id: 'radioTower', name: 'Radio Tower', costs: STD, timing: 'immediate', scope: 'owner',
    effect: { kind: 'extraTurn' }, text: 'Take another turn after this one.', face: 'Take another turn after this one.', art: 'radioTower' },
  { id: 'shoppingMall', name: 'Shopping Mall', costs: CHEAP, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'symbolBonus', symbols: ['shop'], amount: 1 }, text: 'Your shop establishments earn +1 coin when activated.', face: 'Shop establishments earn +1.', art: 'shoppingMall' },
  { id: 'sodaBottlingPlant', name: 'Soda Bottling Plant', costs: STD, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'symbolBonus', symbols: ['cup'], amount: 1 }, text: 'Your cup establishments earn +1 coin when activated.', face: 'Cup establishments earn +1.', art: 'sodaPlant' },
  { id: 'techStartup', name: 'Tech Startup', costs: CHEAP, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'rollBonus', total: 12, amount: 8 }, text: 'If you roll 12, get 8 coins from the bank.', face: 'Roll 12: get 8 coins from the bank.', art: 'techStartup' },
  { id: 'temple', name: 'Temple', costs: STD, timing: 'ongoing', scope: 'everyone',
    effect: { kind: 'doublesTakeFromEach', amount: 2 }, text: 'If you roll doubles, take 2 coins from each opponent.', face: 'Roll doubles: take 2 from each opponent.', art: 'temple' },
  { id: 'tvStation', name: 'TV Station', costs: STD, timing: 'immediate', scope: 'owner',
    effect: { kind: 'takePerSymbol', amount: 1, symbol: 'cup' }, text: 'Take 1 coin from each opponent for each cup establishment they own.', face: 'Take 1 per cup card from each opponent.', art: 'tvStation' },
  // Promo pack
  { id: 'privateClub', name: 'Private Club', costs: STD, timing: 'immediate', scope: 'owner', promo: true,
    effect: { kind: 'takeIfLandmarks', landmarks: 2, amount: 5 }, text: 'Take 5 coins from each opponent who has 2 landmarks.', face: 'Take 5 from each opponent with 2 landmarks.', art: 'privateClub' },
  { id: 'cityHall', name: 'City Hall', costs: CHEAP, timing: 'ongoing', scope: 'everyone', promo: true,
    effect: { kind: 'noIncomeBonus', dice: 1, amount: 2 }, text: 'If you roll 1 die and receive no coins, get 2 coins from the bank.', face: '1 die, no coins? Take 2 from the bank.', art: 'cityHall' },
  { id: 'renovationCompany', name: 'Renovation Company', costs: CHEAP, timing: 'ongoing', scope: 'everyone', promo: true,
    effect: { kind: 'rollBonusPerSymbol', total: 6, amount: 1, symbol: 'cup' },
    text: 'If you roll 6, get 1 coin from the bank for each cup establishment you own.', face: 'Roll 6: get 1 per cup card you own.', art: 'renovationCompany' },
];

// ---------- MK1 (base game) ----------

const MK1_ESTABLISHMENTS: MkEstablishmentDef[] = [
  { id: 'wheatField', name: 'Wheat Field', color: 'blue', symbol: 'wheat', activation: [1], cost: 1, copies: 6,
    effect: { kind: 'bank', amount: 1 }, text: 'Get 1 coin from the bank. (anyone’s turn)', art: 'wheatField' },
  { id: 'ranch', name: 'Ranch', color: 'blue', symbol: 'cow', activation: [2], cost: 1, copies: 6,
    effect: { kind: 'bank', amount: 1 }, text: 'Get 1 coin from the bank. (anyone’s turn)', art: 'ranch' },
  { id: 'bakery', name: 'Bakery', color: 'green', symbol: 'shop', activation: [2, 3], cost: 1, copies: 6,
    effect: { kind: 'bank', amount: 1 }, text: 'Get 1 coin from the bank. (your turn only)', art: 'bakery' },
  { id: 'cafe', name: 'Café', color: 'red', symbol: 'cup', activation: [3], cost: 2, copies: 6,
    effect: { kind: 'takeFromRoller', amount: 1 }, text: 'Take 1 coin from the player who rolled. (opponents’ turns)', art: 'cafe' },
  { id: 'convenienceStore', name: 'Convenience Store', color: 'green', symbol: 'shop', activation: [4], cost: 2, copies: 6,
    effect: { kind: 'bank', amount: 3 }, text: 'Get 3 coins from the bank. (your turn only)', art: 'convenienceStore' },
  { id: 'forest', name: 'Forest', color: 'blue', symbol: 'gear', activation: [5], cost: 3, copies: 6,
    effect: { kind: 'bank', amount: 1 }, text: 'Get 1 coin from the bank. (anyone’s turn)', art: 'forest' },
  { id: 'stadium', name: 'Stadium', color: 'purple', symbol: 'major', activation: [6], cost: 6, copies: 4,
    effect: { kind: 'takeFromEach', amount: 2 }, text: 'Take 2 coins from each opponent. (your turn only)', art: 'stadium' },
  { id: 'tvStation', name: 'TV Station', color: 'purple', symbol: 'major', activation: [6], cost: 7, copies: 4,
    effect: { kind: 'takeFromOne', amount: 5 }, text: 'Take 5 coins from any one opponent. (your turn only)', art: 'tvStation' },
  { id: 'businessCenter', name: 'Business Center', color: 'purple', symbol: 'major', activation: [6], cost: 8, copies: 4,
    effect: { kind: 'exchange' },
    text: 'You may trade 1 non-purple establishment with an opponent. (your turn only)', art: 'businessCenter' },
  { id: 'cheeseFactory', name: 'Cheese Factory', color: 'green', symbol: 'factory', activation: [7], cost: 5, copies: 6,
    effect: { kind: 'bankPerSymbol', amount: 3, symbol: 'cow' },
    text: 'Get 3 coins from the bank for each cow establishment you own. (your turn only)', art: 'cheeseFactory' },
  { id: 'furnitureFactory', name: 'Furniture Factory', color: 'green', symbol: 'factory', activation: [8], cost: 3, copies: 6,
    effect: { kind: 'bankPerSymbol', amount: 3, symbol: 'gear' },
    text: 'Get 3 coins from the bank for each gear establishment you own. (your turn only)', art: 'furnitureFactory' },
  { id: 'mine', name: 'Mine', color: 'blue', symbol: 'gear', activation: [9], cost: 6, copies: 6,
    effect: { kind: 'bank', amount: 5 }, text: 'Get 5 coins from the bank. (anyone’s turn)', art: 'mine' },
  { id: 'familyRestaurant', name: 'Family Restaurant', color: 'red', symbol: 'cup', activation: [9, 10], cost: 3, copies: 6,
    effect: { kind: 'takeFromRoller', amount: 2 }, text: 'Take 2 coins from the player who rolled. (opponents’ turns)', art: 'familyRestaurant' },
  { id: 'appleOrchard', name: 'Apple Orchard', color: 'blue', symbol: 'wheat', activation: [10], cost: 3, copies: 6,
    effect: { kind: 'bank', amount: 3 }, text: 'Get 3 coins from the bank. (anyone’s turn)', art: 'appleOrchard' },
  { id: 'fruitMarket', name: 'Fruit & Vegetable Market', color: 'green', symbol: 'fruit', activation: [11, 12], cost: 2, copies: 6,
    effect: { kind: 'bankPerSymbol', amount: 2, symbol: 'wheat' },
    text: 'Get 2 coins from the bank for each wheat establishment you own. (your turn only)', art: 'fruitMarket' },
];

const MK1_LANDMARKS: MkLandmarkDef[] = [
  { id: 'trainStation', name: 'Train Station', costs: [4], timing: 'ongoing', scope: 'owner',
    effect: { kind: 'twoDice' }, text: 'You may roll 1 or 2 dice.', face: 'You may roll 1 or 2 dice.', art: 'trainStation' },
  { id: 'shoppingMall', name: 'Shopping Mall', costs: [10], timing: 'ongoing', scope: 'owner',
    effect: { kind: 'symbolBonus', symbols: ['cup', 'shop'], amount: 1 }, text: 'Your cup and shop establishments earn +1 coin.', face: 'Your cup and shop cards earn +1.', art: 'shoppingMall' },
  { id: 'amusementPark', name: 'Amusement Park', costs: [16], timing: 'ongoing', scope: 'owner',
    effect: { kind: 'doublesExtraTurn' }, text: 'If you roll doubles, take another turn after this one.', face: 'Roll doubles: take another turn.', art: 'amusementPark' },
  { id: 'radioTower', name: 'Radio Tower', costs: [22], timing: 'ongoing', scope: 'owner',
    effect: { kind: 'reroll' }, text: 'Once each turn, you may reroll your dice.', face: 'Once a turn, you may reroll.', art: 'radioTower' },
];

// ---------- Editions ----------

export interface MkEditionRules {
  id: MkEdition;
  name: string;
  short: string;
  minPlayers: number;
  maxPlayers: number;
  startCoins: number;
  startCity: Record<string, number>;
  /** Build-only opening rounds before the first roll. */
  setupRounds: number;
  /** 'rows' = MK2's 5-5-5 market dealt from decks; 'open' = every pile face-up. */
  market: 'rows' | 'open';
  /** 'market' = landmarks are bought from the landmark row (one copy each);
   *  'personal' = every player builds their own copy of each landmark. */
  landmarks: 'market' | 'personal';
  /** Landmarks needed to win (MK1: all of them). */
  landmarksToWin: number;
  /** MK2: a player with 0 coins at the start of their build step takes 1. */
  coinWhenBroke: boolean;
  /** MK2: anyone may roll two dice; MK1 needs the Train Station. */
  twoDiceForAll: boolean;
  /** MK1: at most one copy of each purple establishment per player. */
  onePurpleEach: boolean;
  /** MK2's Business Center may swap purples; MK1's may not. */
  exchangePurples: boolean;
  establishments: MkEstablishmentDef[];
  landmarkDefs: MkLandmarkDef[];
}

export const EDITIONS: Record<MkEdition, MkEditionRules> = {
  mk2: {
    id: 'mk2', name: 'Machi Koro 2', short: 'MK2', minPlayers: 2, maxPlayers: 5,
    startCoins: 5, startCity: {}, setupRounds: 3, market: 'rows', landmarks: 'market', landmarksToWin: 3,
    coinWhenBroke: true, twoDiceForAll: true, onePurpleEach: false, exchangePurples: true,
    establishments: MK2_ESTABLISHMENTS, landmarkDefs: MK2_LANDMARKS,
  },
  mk1: {
    id: 'mk1', name: 'Machi Koro (base)', short: 'MK1', minPlayers: 2, maxPlayers: 4,
    startCoins: 3, startCity: { wheatField: 1, bakery: 1 }, setupRounds: 0, market: 'open', landmarks: 'personal',
    landmarksToWin: 4, coinWhenBroke: false, twoDiceForAll: false, onePurpleEach: true, exchangePurples: false,
    establishments: MK1_ESTABLISHMENTS, landmarkDefs: MK1_LANDMARKS,
  },
};

export const MARKET_ROW_SIZE = 5;

const EST_INDEX: Record<MkEdition, Record<string, MkEstablishmentDef>> = {
  mk2: Object.fromEntries(MK2_ESTABLISHMENTS.map((c) => [c.id, c])),
  mk1: Object.fromEntries(MK1_ESTABLISHMENTS.map((c) => [c.id, c])),
};
const LM_INDEX: Record<MkEdition, Record<string, MkLandmarkDef>> = {
  mk2: Object.fromEntries(MK2_LANDMARKS.map((c) => [c.id, c])),
  mk1: Object.fromEntries(MK1_LANDMARKS.map((c) => [c.id, c])),
};

export function estDef(edition: MkEdition, id: string): MkEstablishmentDef {
  const d = EST_INDEX[edition][id];
  if (!d) throw new Error(`unknown ${edition} establishment ${id}`);
  return d;
}

export function lmDef(edition: MkEdition, id: string): MkLandmarkDef {
  const d = LM_INDEX[edition][id];
  if (!d) throw new Error(`unknown ${edition} landmark ${id}`);
  return d;
}

export function isEstablishment(edition: MkEdition, id: string): boolean {
  return id in EST_INDEX[edition];
}

export function isLandmark(edition: MkEdition, id: string): boolean {
  return id in LM_INDEX[edition];
}

/** Market row a card is sold from. MK1 landmarks aren't sold from the market (null). */
export function rowOf(edition: MkEdition, id: string): MkRowId | null {
  if (isEstablishment(edition, id)) return estDef(edition, id).activation[0] <= 6 ? 'low' : 'high';
  return EDITIONS[edition].landmarks === 'market' && isLandmark(edition, id) ? 'landmark' : null;
}

/** Landmarks a match deals: MK2 drops the promo pack unless it's switched on. */
export function landmarkPool(edition: MkEdition, promo: boolean): MkLandmarkDef[] {
  return EDITIONS[edition].landmarkDefs.filter((l) => promo || !l.promo);
}

export const COLOR_LABEL: Record<MkEstablishmentDef['color'], string> = {
  blue: 'Primary industry', green: 'Secondary industry', red: 'Restaurant', purple: 'Major establishment',
};

export const SYMBOL_LABEL: Record<MkSymbol, string> = {
  wheat: 'wheat', cow: 'cow', gear: 'gear', shop: 'shop', cup: 'cup', fruit: 'fruit',
  flower: 'flower', factory: 'factory', major: 'major', none: 'no symbol',
};

/** "1–2", "6", "11–12". */
export function activationLabel(nums: number[]): string {
  return nums.length === 1 ? String(nums[0]) : `${nums[0]}–${nums[nums.length - 1]}`;
}

/** Chance (0..1) that a single roll of `dice` dice totals `n`. */
export function rollChance(n: number, dice: 1 | 2): number {
  if (dice === 1) return n >= 1 && n <= 6 ? 1 / 6 : 0;
  return n >= 2 && n <= 12 ? (6 - Math.abs(7 - n)) / 36 : 0;
}
