// 7 Wonders Babel expansion — orange (Babel) cards.
//
// Babel's headline mechanic is the central Tower of Babel board (shared
// law-tile placements that change rules round-by-round) and the Great Projects
// of Babylon (cooperative central goals). Neither is modeled in v1 — they
// require central-state systems I don't have authoritative rule text for.
//
// What IS modeled: a contributed card pool. Babel adds ~5 orange cards per age,
// dealt into the existing age decks. Effects use the existing kinds where
// possible (vp, shields, science, produce, endVp). One Babel-specific scoring
// rule (`babelScoreExtra`) covers card effects that don't fit the existing
// endVp shape (e.g., "VP per science set including leaders", "VP per matching
// card across both neighbors").
//
// Card text from the rulebook is not fully in hand. Cards with uncertain
// abilities are tagged with placeholder effects + descriptions marked
// "Not fully modeled in v1". This matches the SLS / Cities pattern.

import type {
  SwAge, SwCard, SwCardColor, SwCardEffect, SwCost, SwResource,
} from '../../types';

interface BabelTemplate {
  name: string;
  age: SwAge;
  color: SwCardColor;
  appearances: Array<{ minPlayers: number; maxPlayers?: number }>;
  cost?: SwCost;
  chainFrom?: string[];
  chainTo?: string[];
  effects: SwCardEffect[];
  description: string;
  modeled: boolean;
}

const free: SwCost = {};
const cost = (...resources: SwResource[]): SwCost => ({ resources });
const costCoins = (n: number): SwCost => ({ coins: n });
const vp = (n: number): SwCardEffect => ({ kind: 'vp', vp: n });
const shields = (n: number): SwCardEffect => ({ kind: 'shields', shields: n });
const coins = (n: number): SwCardEffect => ({ kind: 'coins', amount: n });
const produce = (...prods: SwResource[][]): SwCardEffect =>
  ({ kind: 'produce', production: prods });
const science = (sym: 'compass' | 'gear' | 'tablet'): SwCardEffect =>
  ({ kind: 'science', symbol: sym });

// ----- Age I Babel (5 cards) -----
const AGE_I_BABEL: BabelTemplate[] = [
  { name: 'Ziggurat', age: 1, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('stone'),
    effects: [vp(3)],
    description: '+3 VP.', modeled: true },

  { name: 'Mason Workshop', age: 1, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: free,
    effects: [produce(['stone', 'wood', 'clay', 'ore'])],
    description: 'Produces 1 of (stone / wood / clay / ore).', modeled: true },

  { name: 'Cuneiform Tablet', age: 1, color: 'orange',
    appearances: [{ minPlayers: 4 }, { minPlayers: 7 }],
    cost: cost('papyrus'),
    effects: [science('tablet')],
    description: '+1 tablet science symbol.', modeled: true },

  { name: 'Babel Garrison', age: 1, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('clay', 'ore'),
    effects: [shields(2)],
    description: '+2 shields.', modeled: true },

  { name: 'Hanging Gardens (small)', age: 1, color: 'orange',
    appearances: [{ minPlayers: 4 }],
    cost: costCoins(2),
    effects: [coins(4), vp(1)],
    description: 'Gain 4 coins. +1 VP.', modeled: true },
];

// ----- Age II Babel (5 cards) -----
const AGE_II_BABEL: BabelTemplate[] = [
  { name: 'Hanging Gardens', age: 2, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('wood', 'clay', 'loom'),
    effects: [vp(5)],
    description: '+5 VP.', modeled: true },

  { name: 'Ishtar Gate', age: 2, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('clay', 'clay', 'glass'),
    effects: [shields(3)],
    description: '+3 shields.', modeled: true },

  { name: 'Royal Workshop', age: 2, color: 'orange',
    appearances: [{ minPlayers: 4 }, { minPlayers: 7 }],
    cost: cost('wood', 'wood'),
    effects: [produce(['glass', 'papyrus', 'loom'])],
    description: 'Produces 1 of (glass / papyrus / loom).', modeled: true },

  { name: 'Babel Library', age: 2, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('stone', 'stone', 'papyrus'),
    effects: [science('compass')],
    description: '+1 compass science symbol.', modeled: true },

  { name: 'Tower Workers', age: 2, color: 'orange',
    appearances: [{ minPlayers: 5 }],
    cost: cost('clay', 'wood'),
    effects: [],
    description: 'Babel central-board ability not modeled in v1.',
    modeled: false },
];

// ----- Age III Babel (5 cards) -----
const AGE_III_BABEL: BabelTemplate[] = [
  // Babel-themed "wild science" effect: +V VP per {compass,gear,tablet} set
  // INCLUDING leader symbols. Reuses base science scoring's leaderTableau
  // walking — this card just adds a parallel set bonus.
  { name: 'Tower of Babel', age: 3, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('clay', 'clay', 'stone', 'glass'),
    effects: [{
      kind: 'babelScoreExtra',
      rule: { type: 'vpPerScienceSet', vpPerSet: 4 },
    }],
    description: '+4 VP per complete science set (compass+gear+tablet) you own.',
    modeled: true },

  { name: 'Babylon Palace', age: 3, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('wood', 'ore', 'glass', 'papyrus'),
    effects: [vp(7)],
    description: '+7 VP.', modeled: true },

  // "VP per blue card across both neighbors" — Babel-style spy/scout card.
  { name: 'Court of Babylon', age: 3, color: 'orange',
    appearances: [{ minPlayers: 4 }, { minPlayers: 6 }],
    cost: cost('clay', 'clay', 'clay'),
    effects: [{
      kind: 'babelScoreExtra',
      rule: { type: 'vpPerNeighborCards', color: 'blue', vpPer: 1 },
    }],
    description: '+1 VP per blue card across both neighbors.',
    modeled: true },

  // "VP per (red OR green) card in own tableau" — Babel-style fortified academy.
  { name: 'Ziggurat of Etemenanki', age: 3, color: 'orange',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('stone', 'stone', 'ore'),
    effects: [{
      kind: 'babelScoreExtra',
      rule: { type: 'vpPerOwnColors', colors: ['red', 'green'], vpPer: 1 },
    }],
    description: '+1 VP per red or green card in your tableau.',
    modeled: true },

  { name: 'Great Project Worksite', age: 3, color: 'orange',
    appearances: [{ minPlayers: 5 }],
    cost: cost('wood', 'wood', 'clay'),
    effects: [vp(3)],
    description: '+3 VP. (Great Projects central board not modeled in v1.)',
    modeled: false },
];

const ALL_BABEL_TEMPLATES: BabelTemplate[] = [
  ...AGE_I_BABEL, ...AGE_II_BABEL, ...AGE_III_BABEL,
];

let _nextId = 30000;
export function resetBabelCardIdCounter(start: number): void {
  _nextId = start;
}

function instantiate(t: BabelTemplate, app: { minPlayers: number; maxPlayers?: number }): SwCard {
  return {
    id: _nextId++,
    name: t.name,
    age: t.age,
    color: t.color,
    minPlayers: app.minPlayers,
    maxPlayers: app.maxPlayers ?? 99,
    cost: t.cost ?? {},
    chainFrom: t.chainFrom,
    chainTo: t.chainTo,
    effects: t.effects,
  };
}

/** Build the Babel deck contribution for a given age. */
export function buildBabelDeck(age: SwAge, playerCount: number): SwCard[] {
  const pool = age === 1 ? AGE_I_BABEL : age === 2 ? AGE_II_BABEL : AGE_III_BABEL;
  const out: SwCard[] = [];
  for (const t of pool) {
    for (const app of t.appearances) {
      if (playerCount >= app.minPlayers && playerCount <= (app.maxPlayers ?? 99)) {
        out.push(instantiate(t, app));
      }
    }
  }
  return out;
}

export const BABEL_CARD_TEMPLATES = ALL_BABEL_TEMPLATES;
export const BABEL_AGE_I_NAMES = AGE_I_BABEL.map((t) => t.name);
export const BABEL_AGE_II_NAMES = AGE_II_BABEL.map((t) => t.name);
export const BABEL_AGE_III_NAMES = AGE_III_BABEL.map((t) => t.name);
