// 7 Wonders Armada expansion — navy (Armada) cards.
//
// Armada's headline mechanics are the personal shipyard boards (4 fleets ×
// 3 levels each), naval combat at age-end (a parallel military track), island
// cards (separate deck visited via a Naval action), and the pirate track.
// None of those are modeled in v1 — they require parallel central + per-player
// state and an additional action type per turn, pending authoritative rule
// text. The seam can be extended later: give the Armada expansion an
// `applyAction` hook + a custom subPhase (similar to Leaders' `leaderDraft`).
//
// What IS modeled: 15 navy cards (5 per age) dealt into the existing age
// decks via the `ageDeckCards` hook. Card effects use existing kinds (vp,
// shields, produce, science, coins, endVp) plus one Armada-specific scoring
// kind (`armadaScoreExtra`) covering three rules.
//
// Card text is best-effort. Cards with uncertain abilities are tagged with
// placeholder effects + descriptions marked "Not fully modeled in v1" —
// matching the SLS / Cities / Babel pattern.

import type {
  SwAge, SwCard, SwCardColor, SwCardEffect, SwCost, SwResource,
} from '../../types';

interface ArmadaTemplate {
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

// ----- Age I Armada (5 cards) -----
const AGE_I_ARMADA: ArmadaTemplate[] = [
  { name: 'Shipyard', age: 1, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('wood'),
    effects: [coins(3)],
    description: 'Gain 3 coins. (Shipyard board not modeled in v1.)',
    modeled: false },

  { name: 'Dockyard', age: 1, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: free,
    effects: [produce(['wood', 'stone'])],
    description: 'Produces 1 of (wood / stone).', modeled: true },

  { name: 'Coastal Patrol', age: 1, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('clay'),
    effects: [shields(1)],
    description: '+1 shield.', modeled: true },

  { name: 'Sail Maker', age: 1, color: 'navy',
    appearances: [{ minPlayers: 4 }],
    cost: cost('loom'),
    effects: [vp(2)],
    description: '+2 VP.', modeled: true },

  { name: 'Naval Charts', age: 1, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('papyrus'),
    effects: [science('compass')],
    description: '+1 compass science symbol.', modeled: true },
];

// ----- Age II Armada (5 cards) -----
const AGE_II_ARMADA: ArmadaTemplate[] = [
  { name: 'Frigate', age: 2, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('wood', 'wood', 'ore'),
    effects: [shields(2)],
    description: '+2 shields.', modeled: true },

  { name: 'Pier', age: 2, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('stone', 'wood'),
    effects: [coins(4), vp(1)],
    description: 'Gain 4 coins, +1 VP.', modeled: true },

  { name: 'Trading Fleet', age: 2, color: 'navy',
    appearances: [{ minPlayers: 4 }, { minPlayers: 7 }],
    cost: cost('wood', 'loom'),
    effects: [produce(['glass', 'papyrus', 'loom'])],
    description: 'Produces 1 of (glass / papyrus / loom).', modeled: true },

  { name: 'Cartographer', age: 2, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('papyrus', 'glass'),
    effects: [science('gear')],
    description: '+1 gear science symbol.', modeled: true },

  { name: 'Lighthouse Beacon', age: 2, color: 'navy',
    appearances: [{ minPlayers: 5 }],
    cost: cost('stone', 'glass'),
    effects: [],
    description: 'Naval action ability not modeled in v1.', modeled: false },
];

// ----- Age III Armada (5 cards) -----
const AGE_III_ARMADA: ArmadaTemplate[] = [
  { name: 'Flagship', age: 3, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('wood', 'wood', 'ore', 'loom'),
    effects: [shields(3), vp(2)],
    description: '+3 shields, +2 VP.', modeled: true },

  // Pillage-themed: count neighbors' defeat tokens.
  { name: 'Pirates Cove', age: 3, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('clay', 'clay', 'wood'),
    effects: [{
      kind: 'armadaScoreExtra',
      rule: { type: 'vpPerNeighborMilitaryLosses', vpPer: 1 },
    }],
    description: '+1 VP per defeat token across both neighbors.',
    modeled: true },

  // "Great works" scaling: every Age III build in own tableau.
  { name: 'Naval Academy', age: 3, color: 'navy',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('stone', 'stone', 'papyrus'),
    effects: [{
      kind: 'armadaScoreExtra',
      rule: { type: 'vpPerOwnAgeIIIBuilds', vpPer: 1 },
    }],
    description: '+1 VP per Age III card in your tableau.', modeled: true },

  // Naval set: at least one of each of (red, blue, green, yellow) in own tableau.
  { name: 'Admiralty', age: 3, color: 'navy',
    appearances: [{ minPlayers: 4 }, { minPlayers: 6 }],
    cost: cost('ore', 'ore', 'glass'),
    effects: [{
      kind: 'armadaScoreExtra',
      rule: { type: 'vpPerOwnNavalSet', vpPerSet: 5 },
    }],
    description: '+5 VP per complete set of (red+blue+green+yellow) in your tableau.',
    modeled: true },

  { name: 'Naval Yard', age: 3, color: 'navy',
    appearances: [{ minPlayers: 5 }],
    cost: costCoins(3),
    effects: [vp(3)],
    description: '+3 VP. (Shipyard/island/naval combat boards not modeled in v1.)',
    modeled: false },
];

const ALL_ARMADA_TEMPLATES: ArmadaTemplate[] = [
  ...AGE_I_ARMADA, ...AGE_II_ARMADA, ...AGE_III_ARMADA,
];

let _nextId = 40000;
export function resetArmadaCardIdCounter(start: number): void {
  _nextId = start;
}

function instantiate(t: ArmadaTemplate, app: { minPlayers: number; maxPlayers?: number }): SwCard {
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

/** Build the Armada deck contribution for a given age. */
export function buildArmadaDeck(age: SwAge, playerCount: number): SwCard[] {
  const pool = age === 1 ? AGE_I_ARMADA : age === 2 ? AGE_II_ARMADA : AGE_III_ARMADA;
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

export const ARMADA_CARD_TEMPLATES = ALL_ARMADA_TEMPLATES;
export const ARMADA_AGE_I_NAMES = AGE_I_ARMADA.map((t) => t.name);
export const ARMADA_AGE_II_NAMES = AGE_II_ARMADA.map((t) => t.name);
export const ARMADA_AGE_III_NAMES = AGE_III_ARMADA.map((t) => t.name);
