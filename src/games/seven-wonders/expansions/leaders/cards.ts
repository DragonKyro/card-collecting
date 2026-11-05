// 7 Wonders Leaders — the 36 leaders, the 4 guilds of the Leaders box, and
// the 6 leaders of the Cities box (dealt only with both expansions).
//
// Costs (coins) are the printed ones, checked against scans of the
// first-edition cards (Croesus takes 6 coins; the Architects' Guild costs
// 3 ore + clay + papyrus + loom). Effects:
//   - flat VP / shields / coins / a science symbol;
//   - VP per card of a colour (or per wonder stage) in the leader's city;
//   - one resource less for a colour / wonder stages (the player's choice of
//     which), guilds and leaders free;
//   - coins whenever something happens from then on (Xenophon, Vitruvius,
//     Nero, Hatshepsut, Diocletian);
//   - Aristotle +3 per science set, Justinian / Plato sets, Midas, Alexander;
//   - Bilkis (buy one resource from the bank for 1 coin a turn), Solomon
//     (build from the discard), Tomyris (defeats go to the victor),
//     Semiramis, Berenice, Caligula, Aspasia (Cities).
// Leaders use colour 'leader' so they never count as Age cards; their VP land
// in the 'leaders' score column.

import type { SwCard, SwCardEffect, SwCardColor, SwResource } from '../../types';

interface LeaderTemplate {
  name: string;
  cost: number;        // in coins
  effects: SwCardEffect[];
  description: string; // human-readable tooltip
  /** Shipped in the Cities box (used only with Leaders + Cities). */
  cities?: boolean;
}

const perColor = (color: SwCardColor, vpPer: number): SwCardEffect =>
  ({ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color }, vpPer });

const LEADERS: readonly LeaderTemplate[] = [
  { name: 'Alexander', cost: 3, effects: [{ kind: 'scoreRule', rule: { type: 'vpPerVictoryToken', vpPer: 1 } }],
    description: 'At the end, +1 VP per victory token (1, 3 and 5 become 2, 4 and 6).' },
  { name: 'Amytis', cost: 4, effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'wonderStages' }, vpPer: 2 }],
    description: '2 VP per wonder stage you built.' },
  { name: 'Archimedes', cost: 4, effects: [{ kind: 'costDiscount', target: 'cardColor', color: 'green' }],
    description: 'Green cards cost one resource less (your choice).' },
  { name: 'Aristotle', cost: 3, effects: [{ kind: 'scienceSetBonus', vp: 3 }],
    description: '+3 VP per set of the three science symbols (10 instead of 7).' },
  { name: 'Bilkis', cost: 4, effects: [{ kind: 'buyAnyResource' }],
    description: 'Once a turn, buy any one resource from the bank for 1 coin.' },
  { name: 'Caesar', cost: 5, effects: [{ kind: 'shields', shields: 2 }],
    description: '2 shields.' },
  { name: 'Cleopatra', cost: 4, effects: [{ kind: 'vp', vp: 5 }],
    description: '5 VP.' },
  { name: 'Croesus', cost: 1, effects: [{ kind: 'coins', amount: 6 }],
    description: 'Take 6 coins when recruited.' },
  { name: 'Euclid', cost: 5, effects: [{ kind: 'science', symbol: 'compass' }],
    description: 'A compass science symbol.' },
  { name: 'Hammurabi', cost: 2, effects: [{ kind: 'costDiscount', target: 'cardColor', color: 'blue' }],
    description: 'Blue cards cost one resource less (your choice).' },
  { name: 'Hannibal', cost: 2, effects: [{ kind: 'shields', shields: 1 }],
    description: '1 shield.' },
  { name: 'Hatshepsut', cost: 2, effects: [{ kind: 'trigger', on: { type: 'neighborPurchase' }, coins: 1 }],
    description: 'Each turn you buy from a neighbour, take 1 coin (at most 1 per neighbour per turn).' },
  { name: 'Hiram', cost: 3, effects: [perColor('purple', 2)],
    description: '2 VP per guild (purple card) in your city.' },
  { name: 'Hypatia', cost: 4, effects: [perColor('green', 1)],
    description: '1 VP per green card in your city.' },
  { name: 'Imhotep', cost: 3, effects: [{ kind: 'costDiscount', target: 'wonderStage' }],
    description: 'Wonder stages cost one resource less (your choice).' },
  { name: 'Justinian', cost: 3, effects: [{ kind: 'scoreRule', rule: { type: 'completeRGBSet', vpPerSet: 3 } }],
    description: '3 VP per set of a red, a blue and a green card.' },
  { name: 'Leonidas', cost: 2, effects: [{ kind: 'costDiscount', target: 'cardColor', color: 'red' }],
    description: 'Red cards cost one resource less (your choice).' },
  { name: 'Maecenas', cost: 1, effects: [{ kind: 'freeLeaders' }],
    description: 'Recruit your later leaders for free.' },
  { name: 'Midas', cost: 3, effects: [{ kind: 'scoreRule', rule: { type: 'vpPerCoinSet', vpPer: 1 } }],
    description: '+1 VP per 3 coins at the end (on top of the treasury’s).' },
  { name: 'Nebuchadnezzar', cost: 4, effects: [perColor('blue', 1)],
    description: '1 VP per blue card in your city.' },
  { name: 'Nefertiti', cost: 3, effects: [{ kind: 'vp', vp: 4 }],
    description: '4 VP.' },
  { name: 'Nero', cost: 1, effects: [{ kind: 'trigger', on: { type: 'victoryToken' }, coins: 2 }],
    description: '2 coins for each victory token you take from now on.' },
  { name: 'Pericles', cost: 6, effects: [perColor('red', 2)],
    description: '2 VP per red card in your city.' },
  { name: 'Phidias', cost: 3, effects: [perColor('brown', 1)],
    description: '1 VP per brown card in your city.' },
  { name: 'Plato', cost: 4, effects: [{ kind: 'scoreRule', rule: { type: 'completeAllColorsSet', vpPerSet: 7 } }],
    description: '7 VP per set of the seven Age colours (brown, gray, blue, yellow, red, green, purple).' },
  { name: 'Praxiteles', cost: 3, effects: [perColor('gray', 2)],
    description: '2 VP per gray card in your city.' },
  { name: 'Ptolemy', cost: 5, effects: [{ kind: 'science', symbol: 'tablet' }],
    description: 'A tablet science symbol.' },
  { name: 'Pythagoras', cost: 5, effects: [{ kind: 'science', symbol: 'gear' }],
    description: 'A gear science symbol.' },
  { name: 'Ramses', cost: 5, effects: [{ kind: 'freeGuildResources' }],
    description: 'Build guilds without paying their resources.' },
  { name: 'Sappho', cost: 1, effects: [{ kind: 'vp', vp: 2 }],
    description: '2 VP.' },
  { name: 'Solomon', cost: 3, effects: [{ kind: 'buildFromDiscardOnRecruit' }],
    description: 'When recruited, build a card from the discard pile for free.' },
  { name: 'Tomyris', cost: 4, effects: [{ kind: 'defeatToVictor' }],
    description: 'From now on, the defeat tokens you would take go to the neighbour who beat you.' },
  { name: 'Varro', cost: 3, effects: [perColor('yellow', 1)],
    description: '1 VP per yellow card in your city.' },
  { name: 'Vitruvius', cost: 1, effects: [{ kind: 'trigger', on: { type: 'buildViaChain' }, coins: 2 }],
    description: '2 coins each time you build a card for free through a chain.' },
  { name: 'Xenophon', cost: 2, effects: [{ kind: 'trigger', on: { type: 'buildCardColor', color: 'yellow' }, coins: 2 }],
    description: '2 coins each time you build a yellow card.' },
  { name: 'Zenobia', cost: 2, effects: [{ kind: 'vp', vp: 3 }],
    description: '3 VP.' },

  // ----- Cities' leaders -----
  { name: 'Aspasia', cost: 3, cities: true, effects: [{ kind: 'vp', vp: 2 }, { kind: 'diplomacy' }],
    description: '2 VP, and a diplomacy token when recruited.' },
  { name: 'Berenice', cost: 2, cities: true, effects: [{ kind: 'bankBonus' }],
    description: 'Once a turn, coins you take from the bank are increased by 1.' },
  { name: 'Caligula', cost: 3, cities: true, effects: [{ kind: 'freeColorPerAge', color: 'black' }],
    description: 'Build one black card per Age for free.' },
  { name: 'Darius', cost: 4, cities: true, effects: [perColor('black', 1)],
    description: '1 VP per black card in your city.' },
  { name: 'Diocletian', cost: 2, cities: true, effects: [{ kind: 'trigger', on: { type: 'buildCardColor', color: 'black' }, coins: 2 }],
    description: '2 coins each time you build a black card.' },
  { name: 'Semiramis', cost: 2, cities: true, effects: [{ kind: 'defeatAsShield' }],
    description: 'Each of your defeat tokens counts as a shield in every later conflict.' },
];

/** Leader ids: 10000 + position in the list (fixed, so any device agrees). */
const LEADER_ID_BASE = 10000;
/** Courtesans' Guild copies: the copied leader's id + this. */
export const COPY_ID_OFFSET = 500;

/** The leader deck for a match (Cities' leaders only with Cities). */
export function buildLeaderDeck(withCities: boolean): SwCard[] {
  return LEADERS.flatMap<SwCard>((t, i) => (t.cities && !withCities) ? [] : [{
    id: LEADER_ID_BASE + i,
    name: t.name,
    age: 1, // leaders aren't tied to an age
    color: 'leader',
    minPlayers: 3,
    maxPlayers: 8,
    cost: { coins: t.cost },
    effects: t.effects,
    expansion: t.cities ? 'cities' : 'leaders',
  }]);
}

export function leaderDescription(name: string): string {
  return LEADERS.find((t) => t.name === name)?.description ?? '';
}

export const ALL_LEADER_NAMES = LEADERS.map((t) => t.name);
export const LEADER_COUNT = LEADERS.filter((t) => !t.cities).length;

// ----- The Leaders box's guilds (Age III, mixed into the guild pool) -----

const r = (...rs: SwResource[]): SwResource[] => rs;

const GUILDS: Array<{ name: string; cost: SwResource[]; effects: SwCardEffect[]; description: string }> = [
  { name: 'Gamers Guild', cost: r('stone', 'clay', 'wood', 'ore'),
    effects: [{ kind: 'scoreRule', rule: { type: 'vpPerCoinSet', vpPer: 1 } }],
    description: '1 VP per 3 coins in your treasury (on top of the treasury’s).' },
  { name: 'Courtesans Guild', cost: r('wood', 'clay', 'glass', 'loom'),
    effects: [{ kind: 'copyLeader' }],
    description: 'Place the Courtesan on a leader of a neighbour: you have its power too.' },
  { name: 'Diplomats Guild', cost: r('stone', 'wood', 'glass', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'neighbors', countWhat: { kind: 'leaders' }, vpPer: 1 }],
    description: '1 VP per leader recruited in the neighbouring cities.' },
  { name: 'Architects Guild', cost: r('ore', 'ore', 'ore', 'clay', 'papyrus', 'loom'),
    effects: [{ kind: 'endVp', from: 'neighbors', countWhat: { kind: 'cardColor', color: 'purple' }, vpPer: 3 }],
    description: '3 VP per guild in the neighbouring cities.' },
];

export function leadersGuilds(): SwCard[] {
  return GUILDS.map((g, i) => ({
    id: 3400 + i, name: g.name, age: 3, color: 'purple', minPlayers: 3, maxPlayers: 99,
    cost: { resources: g.cost }, effects: g.effects, expansion: 'leaders',
  }));
}

export function leadersGuildDescription(name: string): string | undefined {
  return GUILDS.find((g) => g.name === name)?.description;
}
