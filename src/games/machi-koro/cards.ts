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
// Its two expansions add to it: Harbor (10 establishments, City Hall / Harbor /
// Airport, a 5th player) and Millionaire's Row (14 establishments). The MK1
// supply puts out one copy of each purple per player (each may own only one;
// Harbor brings the 5th player's), so a purple pile in the marketplace can
// always be bought out rather than sitting in a slot for good.

import type {
  MkConfig, MkEdition, MkEstablishmentDef, MkExpansion, MkLandmarkDef, MkRowId, MkSupply, MkSymbol,
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

// ---------- MK1 expansions ----------

const HARBOR_ESTABLISHMENTS: MkEstablishmentDef[] = [
  // Cost 4 as printed outside Japan (the Japanese card costs 2).
  { id: 'sushiBar', name: 'Sushi Bar', color: 'red', symbol: 'cup', activation: [1], cost: 4, copies: 6,
    condition: { kind: 'ownerHas', landmark: 'harbor' }, effect: { kind: 'takeFromRoller', amount: 3 },
    text: 'If you have a Harbor, take 3 coins from the player who rolled. (opponents’ turns)', art: 'sushiBar' },
  { id: 'flowerOrchard', name: 'Flower Orchard', color: 'blue', symbol: 'wheat', activation: [4], cost: 2, copies: 6,
    effect: { kind: 'bank', amount: 1 }, text: 'Get 1 coin from the bank. (anyone’s turn)', art: 'flowerGarden' },
  { id: 'flowerShop', name: 'Flower Shop', color: 'green', symbol: 'shop', activation: [6], cost: 1, copies: 6,
    effect: { kind: 'bankPerCard', amount: 1, cardId: 'flowerOrchard' },
    text: 'Get 1 coin from the bank for each Flower Orchard you own. (your turn only)', art: 'flowerShop' },
  { id: 'pizzaJoint', name: 'Pizza Joint', color: 'red', symbol: 'cup', activation: [7], cost: 1, copies: 6,
    effect: { kind: 'takeFromRoller', amount: 1 }, text: 'Take 1 coin from the player who rolled. (opponents’ turns)', art: 'pizzaJoint' },
  { id: 'publisher', name: 'Publisher', color: 'purple', symbol: 'major', activation: [7], cost: 5, copies: 5,
    effect: { kind: 'takePerSymbolFromEach', amount: 1, symbols: ['cup', 'shop'] },
    text: 'Take 1 coin from each opponent for each cup and shop establishment they own. (your turn only)', art: 'publisher' },
  { id: 'mackerelBoat', name: 'Mackerel Boat', color: 'blue', symbol: 'boat', activation: [8], cost: 2, copies: 6,
    condition: { kind: 'ownerHas', landmark: 'harbor' }, effect: { kind: 'bank', amount: 3 },
    text: 'If you have a Harbor, get 3 coins from the bank. (anyone’s turn)', art: 'mackerelBoat' },
  { id: 'hamburgerStand', name: 'Hamburger Stand', color: 'red', symbol: 'cup', activation: [8], cost: 1, copies: 6,
    effect: { kind: 'takeFromRoller', amount: 1 }, text: 'Take 1 coin from the player who rolled. (opponents’ turns)', art: 'hamburgerStand' },
  { id: 'taxOffice', name: 'Tax Office', color: 'purple', symbol: 'major', activation: [8, 9], cost: 4, copies: 5,
    effect: { kind: 'takeHalfAbove', threshold: 9 },
    text: 'From each opponent with 10 or more coins, take half (rounded down). (your turn only)', art: 'taxOffice' },
  { id: 'foodWarehouse', name: 'Food Warehouse', color: 'green', symbol: 'factory', activation: [12, 13], cost: 2, copies: 6,
    effect: { kind: 'bankPerSymbol', amount: 2, symbol: 'cup' },
    text: 'Get 2 coins from the bank for each cup establishment you own. (your turn only)', art: 'foodWarehouse' },
  { id: 'tunaBoat', name: 'Tuna Boat', color: 'blue', symbol: 'boat', activation: [12, 13, 14], cost: 5, copies: 6,
    condition: { kind: 'ownerHas', landmark: 'harbor' }, effect: { kind: 'bankRoll' },
    text: 'If you have a Harbor: the player whose turn it is rolls 2 dice, and you get that many coins. (anyone’s turn)', art: 'tunaBoat' },
];

const HARBOR_LANDMARKS: MkLandmarkDef[] = [
  { id: 'cityHall', name: 'City Hall', costs: [0], timing: 'ongoing', scope: 'owner', prebuilt: true,
    effect: { kind: 'brokeCoin', amount: 1 },
    text: 'Everyone starts with it built. Just before you build, if you have no coins, get 1 coin from the bank.',
    face: 'About to build with 0 coins? Get 1.', art: 'cityHall' },
  { id: 'harbor', name: 'Harbor', costs: [2], timing: 'ongoing', scope: 'owner',
    effect: { kind: 'addToRoll', min: 10, amount: 2 },
    text: 'If you roll 10 or more, you may add 2 to the total. Your Sushi Bars and boats only pay once you have it.',
    face: 'Roll 10+: you may add 2.', art: 'harbor' },
  { id: 'airport', name: 'Airport', costs: [30], timing: 'ongoing', scope: 'owner',
    effect: { kind: 'skipBuildBonus', amount: 10 }, text: 'If you build nothing on your turn, get 10 coins from the bank.',
    face: 'Build nothing: get 10 coins.', art: 'airport' },
];

const MILLIONAIRES_ROW_ESTABLISHMENTS: MkEstablishmentDef[] = [
  { id: 'generalStore', name: 'General Store', color: 'green', symbol: 'shop', activation: [2], cost: 0, copies: 6,
    condition: { kind: 'ownerBelow', landmarks: 2 }, effect: { kind: 'bank', amount: 2 },
    text: 'If you have fewer than 2 landmarks built, get 2 coins from the bank. (your turn only)', art: 'generalStore' },
  { id: 'cornField', name: 'Corn Field', color: 'blue', symbol: 'wheat', activation: [3, 4], cost: 2, copies: 6,
    condition: { kind: 'ownerBelow', landmarks: 2 }, effect: { kind: 'bank', amount: 1 },
    text: 'If you have fewer than 2 landmarks built, get 1 coin from the bank. (anyone’s turn)', art: 'cornField' },
  { id: 'demolitionCompany', name: 'Demolition Company', color: 'green', symbol: 'briefcase', activation: [4], cost: 2, copies: 6,
    effect: { kind: 'demolish', amount: 8 },
    text: 'Demolish one of your built landmarks; when you do, get 8 coins from the bank. (your turn only)', art: 'demolitionCompany' },
  { id: 'frenchRestaurant', name: 'French Restaurant', color: 'red', symbol: 'cup', activation: [5], cost: 3, copies: 6,
    condition: { kind: 'rollerAtLeast', landmarks: 2 }, effect: { kind: 'takeFromRoller', amount: 5 },
    text: 'If the player who rolled has 2 or more landmarks built, take 5 coins from them. (opponents’ turns)', art: 'frenchRestaurant' },
  { id: 'loanOffice', name: 'Loan Office', color: 'green', symbol: 'briefcase', activation: [5, 6], cost: -5, copies: 6,
    effect: { kind: 'payBank', amount: 2 },
    text: 'Building it pays you 5 coins from the bank. When it activates, pay 2 coins to the bank. (your turn only)', art: 'loanOffice' },
  { id: 'vineyard', name: 'Vineyard', color: 'blue', symbol: 'wheat', activation: [7], cost: 3, copies: 6,
    effect: { kind: 'bank', amount: 3 }, text: 'Get 3 coins from the bank. (anyone’s turn)', art: 'vineyard' },
  { id: 'renovationCompany', name: 'Renovation Company', color: 'purple', symbol: 'major', activation: [8], cost: 4, copies: 5,
    effect: { kind: 'renovate', amount: 1 },
    text: 'Pick a non-major establishment: every copy of it, anyone’s, closes for renovation. Take 1 coin from each opponent per copy of theirs. (your turn only)', art: 'renovationCompany' },
  { id: 'winery', name: 'Winery', color: 'green', symbol: 'factory', activation: [9], cost: 3, copies: 6, closesAfter: true,
    effect: { kind: 'bankPerCard', amount: 6, cardId: 'vineyard' },
    text: 'Get 6 coins from the bank for each Vineyard you own, then this building closes for renovation. (your turn only)', art: 'winery' },
  { id: 'movingCompany', name: 'Moving Company', color: 'green', symbol: 'briefcase', activation: [9, 10], cost: 2, copies: 6,
    effect: { kind: 'give', amount: 4 },
    text: 'Give one of your non-major establishments to another player; when you do, get 4 coins from the bank. (your turn only)', art: 'movingCompany' },
  { id: 'techStartup', name: 'Tech Startup', color: 'purple', symbol: 'major', activation: [10], cost: 1, copies: 5,
    effect: { kind: 'invested' },
    text: 'At the end of each of your turns you may put 1 coin on this card. When it activates, take your whole investment from each opponent. (your turn only)', art: 'techStartup' },
  { id: 'internationalExhibitHall', name: 'International Exhibit Hall', color: 'purple', symbol: 'major', activation: [10], cost: 7, copies: 5,
    effect: { kind: 'activateOther' },
    text: 'You may activate one of your other non-major establishments instead; if you do, this card goes back to the market. (your turn only)', art: 'exhibitHall' },
  { id: 'sodaBottlingPlant', name: 'Soda Bottling Plant', color: 'green', symbol: 'factory', activation: [11], cost: 5, copies: 6,
    effect: { kind: 'bankPerSymbolAll', amount: 1, symbol: 'cup' },
    text: 'Get 1 coin from the bank for every cup establishment anyone owns. (your turn only)', art: 'sodaPlant' },
  { id: 'park', name: 'Park', color: 'purple', symbol: 'major', activation: [11, 12, 13], cost: 3, copies: 5,
    effect: { kind: 'redistribute' },
    text: 'Share all players’ coins out evenly; the bank makes up any difference. (your turn only)', art: 'park' },
  { id: 'membersOnlyClub', name: 'Members Only Club', color: 'red', symbol: 'cup', activation: [12, 13, 14], cost: 4, copies: 6,
    condition: { kind: 'rollerAtLeast', landmarks: 3 }, effect: { kind: 'takeAllFromRoller' },
    text: 'If the player who rolled has 3 or more landmarks built, take all of their coins. (opponents’ turns)', art: 'privateClub' },
];

export interface MkExpansionRules {
  id: MkExpansion;
  name: string;
  /** Players its components seat. */
  maxPlayers: number;
  establishments: MkEstablishmentDef[];
  landmarkDefs: MkLandmarkDef[];
}

const tag = <T extends { expansion?: MkExpansion }>(expansion: MkExpansion, defs: T[]): T[] =>
  defs.map((d) => ({ ...d, expansion }));

export const EXPANSIONS: Record<MkExpansion, MkExpansionRules> = {
  harbor: {
    id: 'harbor', name: 'Harbor', maxPlayers: 5,
    establishments: tag('harbor', HARBOR_ESTABLISHMENTS), landmarkDefs: tag('harbor', HARBOR_LANDMARKS),
  },
  millionairesRow: {
    id: 'millionairesRow', name: 'Millionaire’s Row', maxPlayers: 4,
    establishments: tag('millionairesRow', MILLIONAIRES_ROW_ESTABLISHMENTS), landmarkDefs: [],
  },
};

/** Canonical order. */
export const ALL_EXPANSIONS: MkExpansion[] = ['harbor', 'millionairesRow'];

// ---------- Editions ----------

export interface MkEditionRules {
  id: MkEdition;
  name: string;
  short: string;
  minPlayers: number;
  maxPlayers: number;
  startCoins: number;
  startCity: Record<string, number>;
  /** Landmarks everyone starts with built (Harbor's City Hall). */
  startLandmarks: string[];
  /** Build-only opening rounds before the first roll. */
  setupRounds: number;
  /** 'rows' = MK2's 5-5-5 market dealt from decks; 'open' = every pile
   *  face-up; 'marketplace' = Harbor's ten piles dealt from one deck;
   *  'hybrid' = the 5-5-2 market (1–6 / 7+ / majors, each from its own deck). */
  market: 'rows' | MkSupply;
  /** 'market' = landmarks are bought from the landmark row (one copy each);
   *  'personal' = every player builds their own copy of each landmark. */
  landmarks: 'market' | 'personal';
  /** Landmarks needed to win (MK1: all of them). */
  landmarksToWin: number;
  /** MK1 expansions in play. */
  expansions: MkExpansion[];
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
    startCoins: 5, startCity: {}, startLandmarks: [], setupRounds: 3, market: 'rows', landmarks: 'market', landmarksToWin: 3,
    expansions: [], coinWhenBroke: true, twoDiceForAll: true, onePurpleEach: false, exchangePurples: true,
    establishments: MK2_ESTABLISHMENTS, landmarkDefs: MK2_LANDMARKS,
  },
  mk1: {
    id: 'mk1', name: 'Machi Koro (base)', short: 'MK1', minPlayers: 2, maxPlayers: 4,
    startCoins: 3, startCity: { wheatField: 1, bakery: 1 }, startLandmarks: [], setupRounds: 0, market: 'open', landmarks: 'personal',
    landmarksToWin: 4, expansions: [], coinWhenBroke: false, twoDiceForAll: false, onePurpleEach: true, exchangePurples: false,
    establishments: MK1_ESTABLISHMENTS, landmarkDefs: MK1_LANDMARKS,
  },
};

/** The MK1 expansions a config switches on (none for MK2), in canonical order. */
export function expansionsOf(config: MkConfig): MkExpansion[] {
  if (config.edition !== 'mk1') return [];
  return ALL_EXPANSIONS.filter((x) => config.expansions?.includes(x));
}

/** The MK1 supply a config plays with: the marketplace by default once an expansion is in. */
export function supplyOf(config: MkConfig): MkSupply {
  return config.supply ?? (expansionsOf(config).length > 0 ? 'marketplace' : 'open');
}

const RULES_CACHE = new Map<string, MkEditionRules>();

/** The rules a match plays by: its edition, plus any MK1 expansions and supply. */
export function rulesFor(config: MkConfig): MkEditionRules {
  const base = EDITIONS[config.edition];
  if (base.id !== 'mk1') return base;
  const exps = expansionsOf(config);
  const supply = supplyOf(config);
  const key = `${exps.join('+')}|${supply}`;
  let R = RULES_CACHE.get(key);
  if (!R) {
    const parts = exps.map((x) => EXPANSIONS[x]);
    const landmarkDefs = [...base.landmarkDefs, ...parts.flatMap((p) => p.landmarkDefs)]
      .sort((a, b) => a.costs[0] - b.costs[0]);
    R = {
      ...base,
      maxPlayers: Math.max(base.maxPlayers, ...parts.map((p) => p.maxPlayers)),
      market: supply,
      expansions: exps,
      establishments: [...base.establishments, ...parts.flatMap((p) => p.establishments)],
      landmarkDefs,
      startLandmarks: landmarkDefs.filter((l) => l.prebuilt).map((l) => l.id),
      landmarksToWin: landmarkDefs.length,
    };
    RULES_CACHE.set(key, R);
  }
  return R;
}

export const MARKET_ROW_SIZE = 5;
/** Different piles Harbor's marketplace shows. */
export const MARKETPLACE_SIZE = 10;
/** Different majors the 5-5-2 market shows. */
export const MAJOR_ROW_SIZE = 2;

export function rowSize(row: MkRowId): number {
  return row === 'mixed' ? MARKETPLACE_SIZE : row === 'major' ? MAJOR_ROW_SIZE : MARKET_ROW_SIZE;
}

// MK1's indexes hold the expansion cards too (their ids never clash with the
// base game's); `rulesFor` decides which of them a match uses.
const MK1_ALL_ESTABLISHMENTS = [...MK1_ESTABLISHMENTS, ...ALL_EXPANSIONS.flatMap((x) => EXPANSIONS[x].establishments)];
const MK1_ALL_LANDMARKS = [...MK1_LANDMARKS, ...ALL_EXPANSIONS.flatMap((x) => EXPANSIONS[x].landmarkDefs)];

const EST_INDEX: Record<MkEdition, Record<string, MkEstablishmentDef>> = {
  mk2: Object.fromEntries(MK2_ESTABLISHMENTS.map((c) => [c.id, c])),
  mk1: Object.fromEntries(MK1_ALL_ESTABLISHMENTS.map((c) => [c.id, c])),
};
const LM_INDEX: Record<MkEdition, Record<string, MkLandmarkDef>> = {
  mk2: Object.fromEntries(MK2_LANDMARKS.map((c) => [c.id, c])),
  mk1: Object.fromEntries(MK1_ALL_LANDMARKS.map((c) => [c.id, c])),
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
export function rowOf(R: MkEditionRules, id: string): MkRowId | null {
  if (isEstablishment(R.id, id)) {
    if (R.market === 'marketplace') return 'mixed';
    const d = estDef(R.id, id);
    if (R.market === 'hybrid' && d.color === 'purple') return 'major';
    return d.activation[0] <= 6 ? 'low' : 'high';
  }
  return R.landmarks === 'market' && isLandmark(R.id, id) ? 'landmark' : null;
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
  flower: 'flower', factory: 'factory', major: 'major', boat: 'boat', briefcase: 'briefcase', none: 'no symbol',
};

/** Copies of `def` a match's supply holds: MK1 puts out one of each purple per player. */
export function supplyCopies(R: MkEditionRules, def: MkEstablishmentDef, players: number): number {
  return R.onePurpleEach && def.color === 'purple' ? players : def.copies;
}

/** "1–2", "6", "11–12". */
export function activationLabel(nums: number[]): string {
  return nums.length === 1 ? String(nums[0]) : `${nums[0]}–${nums[nums.length - 1]}`;
}

/** Chance (0..1) that a single roll of `dice` dice totals `n`. */
export function rollChance(n: number, dice: 1 | 2): number {
  if (dice === 1) return n >= 1 && n <= 6 ? 1 / 6 : 0;
  return n >= 2 && n <= 12 ? (6 - Math.abs(7 - n)) / 36 : 0;
}
