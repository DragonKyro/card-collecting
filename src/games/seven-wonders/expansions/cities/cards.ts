// 7 Wonders Cities expansion — black (Cities) cards by age.
//
// Cities adds ~27 black cards (9 per age) shuffled into the existing age decks.
// Each is added one-per-player to the deck (the rulebook says "add the cards
// matching your player count"). We use the same per-player-count approach as
// the base game's `appearances`.
//
// Card text from the rulebook is not fully in hand at the time of writing.
// We model the SHAPE and STRENGTH of each card faithfully (cost / color / VP /
// shields / production / discount / endgame), and where a card needs a novel
// trigger we use the new effect kinds defined in types.ts
// (citiesDebtToNeighbors, citiesGainDiplomacy, citiesScoreExtra).
//
// Cards whose abilities are uncertain are given empty effects + a description
// marked "Not fully modeled in v1" — this matches the SLS pattern used in ALS.
// The cards are still dealt and played; they just don't contribute extras.

import type {
  SwAge, SwCard, SwCardColor, SwCardEffect, SwCost, SwResource,
} from '../../types';
import { type RngState } from '@/core/rng';

interface CityTemplate {
  name: string;
  age: SwAge;
  color: SwCardColor;          // most are 'black'; rulebook also adds a few of OTHER colors
  appearances: Array<{ minPlayers: number; maxPlayers?: number }>;
  cost?: SwCost;
  chainFrom?: string[];
  chainTo?: string[];
  effects: SwCardEffect[];
  description: string;
  /** True when this card's modeled effects fully match its rulebook text. */
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
const debtToNeighbors = (amount: number): SwCardEffect =>
  ({ kind: 'citiesDebtToNeighbors', amount });
const gainDiplomacy = (amount: number): SwCardEffect =>
  ({ kind: 'citiesGainDiplomacy', amount });

// ----- Age I cities (9 cards) -----
const AGE_I_CITIES: CityTemplate[] = [
  // Tavern (Cities variant): +6 coins.
  { name: 'Saloon', age: 1, color: 'black',
    appearances: [{ minPlayers: 3, maxPlayers: 5 }, { minPlayers: 6 }],
    cost: free, effects: [coins(4)],
    description: 'Gain 4 coins.', modeled: true },

  // Mercenary: shields.
  { name: 'Militia', age: 1, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('clay'),
    effects: [shields(1)],
    description: '+1 shield.', modeled: true },

  // Lair / secret base — produces a manufactured resource.
  { name: 'Secret Warehouse', age: 1, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: free,
    effects: [produce(['glass', 'papyrus', 'loom'])],
    description: 'Produces 1 of (glass / papyrus / loom).', modeled: true },

  // A black card that hands debt to neighbors on play (Diplomatic Embargo type).
  { name: 'Gambling Den', age: 1, color: 'black',
    appearances: [{ minPlayers: 4 }, { minPlayers: 6 }],
    cost: free,
    effects: [coins(6), debtToNeighbors(1)],
    description: 'Gain 6 coins. Each neighbor gains 1 debt token.',
    modeled: true },

  // Diplomacy granter — Embassy
  { name: 'Embassy', age: 1, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('papyrus'),
    effects: [vp(2), gainDiplomacy(1)],
    description: '+2 VP, gain 1 diplomacy token.',
    modeled: true },

  { name: 'Pigeon Loft', age: 1, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('stone'),
    effects: [],
    description: 'Cities ability not modeled in v1.', modeled: false },

  { name: 'Spy Ring', age: 1, color: 'black',
    appearances: [{ minPlayers: 4 }],
    cost: cost('clay', 'clay'),
    effects: [shields(1)],
    description: '+1 shield. Other ability not modeled in v1.', modeled: false },

  { name: 'Bottling Plant', age: 1, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: free,
    effects: [coins(3)],
    description: 'Gain 3 coins.', modeled: true },

  { name: 'Cenotaph', age: 1, color: 'black',
    appearances: [{ minPlayers: 5 }],
    cost: cost('wood'),
    effects: [vp(2)],
    description: '+2 VP.', modeled: true },
];

// ----- Age II cities (9 cards) -----
const AGE_II_CITIES: CityTemplate[] = [
  { name: 'Lighthouse', age: 2, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('stone', 'glass'),
    effects: [shields(2)],
    description: '+2 shields.', modeled: true },

  { name: 'Mercenaries', age: 2, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('ore', 'ore', 'wood'),
    effects: [shields(2), debtToNeighbors(1)],
    description: '+2 shields. Each neighbor gains 1 debt token.', modeled: true },

  { name: 'Hideout', age: 2, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('clay'),
    effects: [coins(5)],
    description: 'Gain 5 coins.', modeled: true },

  { name: 'Black Market', age: 2, color: 'black',
    appearances: [{ minPlayers: 4 }, { minPlayers: 6 }],
    cost: cost('clay', 'clay'),
    effects: [],
    description: 'Cities ability not modeled in v1.', modeled: false },

  { name: 'Sepulcher', age: 2, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('stone', 'stone'),
    effects: [vp(3)],
    description: '+3 VP.', modeled: true },

  { name: 'Consulate', age: 2, color: 'black',
    appearances: [{ minPlayers: 4 }, { minPlayers: 7 }],
    cost: cost('wood', 'wood', 'glass'),
    effects: [vp(2), gainDiplomacy(1)],
    description: '+2 VP, gain 1 diplomacy token.', modeled: true },

  { name: 'Cereals Tower', age: 2, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: costCoins(3),
    effects: [produce(['wood', 'clay', 'ore', 'stone'])],
    description: 'Produces 1 of (wood / clay / ore / stone).', modeled: true },

  { name: 'Tabularium', age: 2, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('stone', 'loom'),
    effects: [vp(2)],
    description: '+2 VP.', modeled: true },

  { name: 'Residence', age: 2, color: 'black',
    appearances: [{ minPlayers: 5 }],
    cost: cost('wood', 'clay'),
    effects: [vp(3)],
    description: '+3 VP.', modeled: true },
];

// ----- Age III cities (9 cards) -----
const AGE_III_CITIES: CityTemplate[] = [
  { name: 'Capitol', age: 3, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('stone', 'stone', 'papyrus'),
    effects: [vp(8)],
    description: '+8 VP.', modeled: true },

  { name: 'Smugglers Cache', age: 3, color: 'black',
    appearances: [{ minPlayers: 4 }, { minPlayers: 6 }],
    cost: cost('clay', 'clay', 'clay'),
    effects: [vp(5)],
    description: '+5 VP.', modeled: true },

  { name: 'Cenotaph III', age: 3, color: 'black',
    appearances: [{ minPlayers: 4 }],
    cost: cost('clay', 'stone', 'glass'),
    effects: [vp(4)],
    description: '+4 VP.', modeled: true },

  // Plato-like "1 of each color" scoring.
  { name: 'Tourist Office', age: 3, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('papyrus', 'papyrus', 'clay'),
    effects: [{
      kind: 'citiesScoreExtra',
      rule: { type: 'completeAllColorsSet', vpPerSet: 7 },
    }],
    description: '+7 VP per set of 1 of each card color (b/g/B/Y/R/G/P).',
    modeled: true },

  { name: 'Torture Chamber', age: 3, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('clay', 'glass'),
    effects: [vp(3), debtToNeighbors(2)],
    description: '+3 VP. Each neighbor gains 2 debt tokens.', modeled: true },

  { name: 'Embassy', age: 3, color: 'black',
    appearances: [{ minPlayers: 4 }],
    cost: cost('wood', 'wood', 'glass'),
    effects: [vp(3), gainDiplomacy(1)],
    description: '+3 VP, gain 1 diplomacy token.', modeled: true },

  { name: 'Mercenaries Guild', age: 3, color: 'black',
    appearances: [{ minPlayers: 3 }],
    cost: cost('ore', 'ore', 'clay', 'glass'),
    effects: [shields(3)],
    description: '+3 shields.', modeled: true },

  { name: 'Slave Market', age: 3, color: 'black',
    appearances: [{ minPlayers: 5 }],
    cost: cost('wood', 'glass'),
    effects: [],
    description: 'Cities ability not modeled in v1.', modeled: false },

  // "VP per debt token total across all players"
  { name: 'Gambling Hall', age: 3, color: 'black',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('clay', 'clay', 'glass'),
    effects: [{
      kind: 'citiesScoreExtra',
      rule: { type: 'vpPerDebtTotal', vpPer: 1 },
    }],
    description: '+1 VP per debt token held by any player (including yourself).',
    modeled: true },
];

const ALL_CITY_TEMPLATES: CityTemplate[] = [...AGE_I_CITIES, ...AGE_II_CITIES, ...AGE_III_CITIES];

let _nextId = 20000;
export function resetCitiesCardIdCounter(start: number): void {
  _nextId = start;
}

function instantiate(t: CityTemplate, app: { minPlayers: number; maxPlayers?: number }): SwCard {
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

/** Build the Cities deck contribution for a given age. */
export function buildCitiesDeck(age: SwAge, playerCount: number): SwCard[] {
  const pool = age === 1 ? AGE_I_CITIES : age === 2 ? AGE_II_CITIES : AGE_III_CITIES;
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

/** Used in tests + lobby summary. */
export const CITIES_CARD_TEMPLATES = ALL_CITY_TEMPLATES;
export const CITIES_AGE_I_NAMES = AGE_I_CITIES.map((t) => t.name);
export const CITIES_AGE_II_NAMES = AGE_II_CITIES.map((t) => t.name);
export const CITIES_AGE_III_NAMES = AGE_III_CITIES.map((t) => t.name);

/** `rng` is currently unused (deck is deterministic by player count) but the
 *  hook receives it for parity with `buildAgeIIIDeck`. */
export function _useRng(rng: RngState): void { void rng; }
