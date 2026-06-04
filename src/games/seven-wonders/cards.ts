// 7 Wonders — card database for all 3 Ages.
//
// Each Age, the deck contains (player-count × 7) cards. The base game scales
// player-count-restricted cards in/out via min/maxPlayers.
//
// For Age I/II: cards repeat in 3/4/5/6/7-player variants (some cards have
// duplicates that show up only with more players).
// For Age III: 6 cards per player + 2 guilds per player (drawn from a pool of 10).

import { shuffle, type RngState } from '@/core/rng';
import type {
  SwCard, SwAge, SwCardColor, SwCost, SwCardEffect, SwResource,
} from './types';

interface CardTemplate {
  name: string;
  age: SwAge;
  color: SwCardColor;
  /** One entry per player-count this card appears at. */
  appearances: Array<{ minPlayers: number; maxPlayers?: number }>;
  cost?: SwCost;
  chainFrom?: string[];
  chainTo?: string[];
  effects: SwCardEffect[];
}

// Shortcuts to make the table below dense.
const free: SwCost = {};
const cost = (...resources: SwResource[]): SwCost => ({ resources });
const costCoins = (coins: number): SwCost => ({ coins });

const produce = (...prods: SwResource[][]): SwCardEffect => ({ kind: 'produce', production: prods });
const coins = (amount: number): SwCardEffect => ({ kind: 'coins', amount });
const shields = (n: number): SwCardEffect => ({ kind: 'shields', shields: n });
const vp = (n: number): SwCardEffect => ({ kind: 'vp', vp: n });
const science = (sym: 'compass' | 'gear' | 'tablet'): SwCardEffect => ({ kind: 'science', symbol: sym });
const discountRaw = (sides: ('east' | 'west' | 'both')[]): SwCardEffect =>
  ({ kind: 'tradeDiscountRaw', sides });
const discountManu = (sides: ('east' | 'west' | 'both')[]): SwCardEffect =>
  ({ kind: 'tradeDiscountManufactured', sides });

/** Helper for end-game VP & coin-on-play scoring cards. */
function endVp(opts: {
  from: 'self' | 'neighbors' | 'all';
  countWhat: SwCardEffect & { kind: 'endVp' } extends never ? never :
    | { kind: 'cardColor'; color: SwCardColor }
    | { kind: 'wonderStages' }
    | { kind: 'military' };
  coinsPerOnPlay?: number;
  vpPer?: number;
}): SwCardEffect {
  return {
    kind: 'endVp',
    from: opts.from,
    countWhat: opts.countWhat,
    coinsPerOnPlay: opts.coinsPerOnPlay,
    vpPer: opts.vpPer,
  };
}

// =====================================================================
// AGE I cards (21 unique × player-count multiplicity)
// =====================================================================

const AGE_I: CardTemplate[] = [
  // ---- Brown (raw materials) ----
  { name: 'Lumber Yard', age: 1, color: 'brown',
    appearances: [{ minPlayers: 3, maxPlayers: 4 }],
    cost: free, effects: [produce(['wood'])] },
  { name: 'Stone Pit', age: 1, color: 'brown',
    appearances: [{ minPlayers: 3, maxPlayers: 5 }],
    cost: free, effects: [produce(['stone'])] },
  { name: 'Clay Pool', age: 1, color: 'brown',
    appearances: [{ minPlayers: 3, maxPlayers: 5 }],
    cost: free, effects: [produce(['clay'])] },
  { name: 'Ore Vein', age: 1, color: 'brown',
    appearances: [{ minPlayers: 3, maxPlayers: 4 }],
    cost: free, effects: [produce(['ore'])] },
  { name: 'Tree Farm', age: 1, color: 'brown',
    appearances: [{ minPlayers: 6 }],
    cost: costCoins(1), effects: [produce(['wood', 'clay'])] },
  { name: 'Excavation', age: 1, color: 'brown',
    appearances: [{ minPlayers: 4 }],
    cost: costCoins(1), effects: [produce(['stone', 'clay'])] },
  { name: 'Clay Pit', age: 1, color: 'brown',
    appearances: [{ minPlayers: 3 }],
    cost: costCoins(1), effects: [produce(['clay', 'ore'])] },
  { name: 'Timber Yard', age: 1, color: 'brown',
    appearances: [{ minPlayers: 3 }],
    cost: costCoins(1), effects: [produce(['stone', 'wood'])] },
  { name: 'Forest Cave', age: 1, color: 'brown',
    appearances: [{ minPlayers: 5 }],
    cost: costCoins(1), effects: [produce(['wood', 'ore'])] },
  { name: 'Mine', age: 1, color: 'brown',
    appearances: [{ minPlayers: 6 }],
    cost: costCoins(1), effects: [produce(['ore', 'stone'])] },

  // ---- Gray (manufactured) ----
  { name: 'Loom', age: 1, color: 'gray',
    appearances: [{ minPlayers: 3, maxPlayers: 5 }, { minPlayers: 6 }],
    cost: free, effects: [produce(['loom'])] },
  { name: 'Glassworks', age: 1, color: 'gray',
    appearances: [{ minPlayers: 3, maxPlayers: 5 }, { minPlayers: 6 }],
    cost: free, effects: [produce(['glass'])] },
  { name: 'Press', age: 1, color: 'gray',
    appearances: [{ minPlayers: 3, maxPlayers: 5 }, { minPlayers: 6 }],
    cost: free, effects: [produce(['papyrus'])] },

  // ---- Blue (civilian VP) ----
  { name: 'Pawnshop', age: 1, color: 'blue',
    appearances: [{ minPlayers: 4, maxPlayers: 5 }, { minPlayers: 7 }],
    cost: free, effects: [vp(3)] },
  { name: 'Baths', age: 1, color: 'blue',
    appearances: [{ minPlayers: 3, maxPlayers: 6 }],
    cost: cost('stone'),
    chainTo: ['Aqueduct'],
    effects: [vp(3)] },
  { name: 'Altar', age: 1, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: free,
    chainTo: ['Temple'],
    effects: [vp(2)] },
  { name: 'Theater', age: 1, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: free,
    chainTo: ['Statue'],
    effects: [vp(2)] },

  // ---- Yellow (commercial) ----
  { name: 'Tavern', age: 1, color: 'yellow',
    appearances: [{ minPlayers: 4 }, { minPlayers: 5 }, { minPlayers: 7 }],
    cost: free, effects: [coins(5)] },
  { name: 'East Trading Post', age: 1, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: free,
    chainTo: ['Forum'],
    effects: [discountRaw(['east'])] },
  { name: 'West Trading Post', age: 1, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: free,
    chainTo: ['Forum'],
    effects: [discountRaw(['west'])] },
  { name: 'Marketplace', age: 1, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: free,
    chainTo: ['Caravansery'],
    effects: [discountManu(['both'])] },

  // ---- Red (military) ----
  { name: 'Stockade', age: 1, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('wood'),
    effects: [shields(1)] },
  { name: 'Barracks', age: 1, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('ore'),
    effects: [shields(1)] },
  { name: 'Guard Tower', age: 1, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: cost('clay'),
    effects: [shields(1)] },

  // ---- Green (science) ----
  { name: 'Apothecary', age: 1, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('loom'),
    chainTo: ['Stables', 'Dispensary'],
    effects: [science('compass')] },
  { name: 'Workshop', age: 1, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('glass'),
    chainTo: ['Archery Range', 'Laboratory'],
    effects: [science('gear')] },
  { name: 'Scriptorium', age: 1, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: cost('papyrus'),
    chainTo: ['Courthouse', 'Library'],
    effects: [science('tablet')] },
];

// =====================================================================
// AGE II cards
// =====================================================================

const AGE_II: CardTemplate[] = [
  // ---- Brown ----
  { name: 'Sawmill', age: 2, color: 'brown',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: costCoins(1), effects: [produce(['wood'], ['wood'])] },
  { name: 'Quarry', age: 2, color: 'brown',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: costCoins(1), effects: [produce(['stone'], ['stone'])] },
  { name: 'Brickyard', age: 2, color: 'brown',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: costCoins(1), effects: [produce(['clay'], ['clay'])] },
  { name: 'Foundry', age: 2, color: 'brown',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: costCoins(1), effects: [produce(['ore'], ['ore'])] },

  // ---- Gray ----
  { name: 'Loom', age: 2, color: 'gray',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: free, effects: [produce(['loom'])] },
  { name: 'Glassworks', age: 2, color: 'gray',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: free, effects: [produce(['glass'])] },
  { name: 'Press', age: 2, color: 'gray',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: free, effects: [produce(['papyrus'])] },

  // ---- Blue ----
  { name: 'Aqueduct', age: 2, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('stone', 'stone', 'stone'),
    chainFrom: ['Baths'],
    effects: [vp(5)] },
  { name: 'Temple', age: 2, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('wood', 'clay', 'glass'),
    chainFrom: ['Altar'],
    chainTo: ['Pantheon'],
    effects: [vp(3)] },
  { name: 'Statue', age: 2, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('wood', 'ore', 'ore'),
    chainFrom: ['Theater'],
    chainTo: ['Gardens'],
    effects: [vp(4)] },
  { name: 'Courthouse', age: 2, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('clay', 'clay', 'loom'),
    chainFrom: ['Scriptorium'],
    effects: [vp(4)] },

  // ---- Yellow ----
  { name: 'Forum', age: 2, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }, { minPlayers: 7 }],
    cost: cost('clay', 'clay'),
    chainFrom: ['East Trading Post', 'West Trading Post'],
    chainTo: ['Haven'],
    effects: [produce(['glass', 'papyrus', 'loom'])] },
  { name: 'Caravansery', age: 2, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }, { minPlayers: 6 }],
    cost: cost('wood', 'wood'),
    chainFrom: ['Marketplace'],
    chainTo: ['Lighthouse'],
    effects: [produce(['wood', 'stone', 'ore', 'clay'])] },
  { name: 'Vineyard', age: 2, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: free,
    effects: [endVp({
      from: 'all', countWhat: { kind: 'cardColor', color: 'brown' }, coinsPerOnPlay: 1,
    })] },
  { name: 'Bazaar', age: 2, color: 'yellow',
    appearances: [{ minPlayers: 4 }, { minPlayers: 7 }],
    cost: free,
    effects: [endVp({
      from: 'all', countWhat: { kind: 'cardColor', color: 'gray' }, coinsPerOnPlay: 2,
    })] },

  // ---- Red ----
  { name: 'Walls', age: 2, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('stone', 'stone', 'stone'),
    chainTo: ['Fortifications'],
    effects: [shields(2)] },
  { name: 'Training Ground', age: 2, color: 'red',
    appearances: [{ minPlayers: 4 }, { minPlayers: 6 }, { minPlayers: 7 }],
    cost: cost('wood', 'ore', 'ore'),
    chainTo: ['Circus'],
    effects: [shields(2)] },
  { name: 'Stables', age: 2, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('ore', 'clay', 'wood'),
    chainFrom: ['Apothecary'],
    effects: [shields(2)] },
  { name: 'Archery Range', age: 2, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('wood', 'wood', 'ore'),
    chainFrom: ['Workshop'],
    effects: [shields(2)] },

  // ---- Green ----
  { name: 'Dispensary', age: 2, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: cost('ore', 'ore', 'glass'),
    chainFrom: ['Apothecary'],
    chainTo: ['Arena', 'Lodge'],
    effects: [science('compass')] },
  { name: 'Laboratory', age: 2, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('clay', 'clay', 'papyrus'),
    chainFrom: ['Workshop'],
    chainTo: ['Siege Workshop', 'Observatory'],
    effects: [science('gear')] },
  { name: 'Library', age: 2, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('stone', 'stone', 'loom'),
    chainFrom: ['Scriptorium'],
    chainTo: ['Senate', 'University'],
    effects: [science('tablet')] },
  { name: 'School', age: 2, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('wood', 'papyrus'),
    chainTo: ['Academy', 'Study'],
    effects: [science('tablet')] },
];

// =====================================================================
// AGE III cards (NO brown / gray / yellow producers — but lots of purple)
// =====================================================================

const AGE_III: CardTemplate[] = [
  // ---- Blue ----
  { name: 'Pantheon', age: 3, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('clay', 'clay', 'ore', 'papyrus', 'loom', 'glass'),
    chainFrom: ['Temple'],
    effects: [vp(7)] },
  { name: 'Gardens', age: 3, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: cost('clay', 'clay', 'wood'),
    chainFrom: ['Statue'],
    effects: [vp(5)] },
  { name: 'Town Hall', age: 3, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }, { minPlayers: 6 }],
    cost: cost('stone', 'stone', 'ore', 'glass'),
    effects: [vp(6)] },
  { name: 'Palace', age: 3, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('glass', 'papyrus', 'loom', 'clay', 'wood', 'ore', 'stone'),
    effects: [vp(8)] },
  { name: 'Senate', age: 3, color: 'blue',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('wood', 'wood', 'stone', 'ore'),
    chainFrom: ['Library'],
    effects: [vp(6)] },

  // ---- Yellow ----
  { name: 'Haven', age: 3, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: cost('loom', 'ore', 'wood'),
    chainFrom: ['Forum'],
    effects: [endVp({
      from: 'self', countWhat: { kind: 'cardColor', color: 'brown' }, coinsPerOnPlay: 1, vpPer: 1,
    })] },
  { name: 'Lighthouse', age: 3, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('stone', 'glass'),
    chainFrom: ['Caravansery'],
    effects: [endVp({
      from: 'self', countWhat: { kind: 'cardColor', color: 'yellow' }, coinsPerOnPlay: 1, vpPer: 1,
    })] },
  { name: 'Chamber of Commerce', age: 3, color: 'yellow',
    appearances: [{ minPlayers: 4 }, { minPlayers: 6 }],
    cost: cost('clay', 'clay', 'papyrus'),
    effects: [endVp({
      from: 'self', countWhat: { kind: 'cardColor', color: 'gray' }, coinsPerOnPlay: 2, vpPer: 2,
    })] },
  { name: 'Arena', age: 3, color: 'yellow',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }, { minPlayers: 7 }],
    cost: cost('stone', 'stone', 'ore'),
    chainFrom: ['Dispensary'],
    effects: [endVp({
      from: 'self', countWhat: { kind: 'wonderStages' }, coinsPerOnPlay: 3, vpPer: 1,
    })] },

  // ---- Red ----
  { name: 'Fortifications', age: 3, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('ore', 'ore', 'ore', 'stone'),
    chainFrom: ['Walls'],
    effects: [shields(3)] },
  { name: 'Circus', age: 3, color: 'red',
    appearances: [{ minPlayers: 4 }, { minPlayers: 5 }, { minPlayers: 6 }],
    cost: cost('stone', 'stone', 'stone', 'ore'),
    chainFrom: ['Training Ground'],
    effects: [shields(3)] },
  { name: 'Arsenal', age: 3, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }, { minPlayers: 7 }],
    cost: cost('wood', 'wood', 'ore', 'loom'),
    effects: [shields(3)] },
  { name: 'Siege Workshop', age: 3, color: 'red',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('clay', 'clay', 'clay', 'wood'),
    chainFrom: ['Laboratory'],
    effects: [shields(3)] },

  // ---- Green ----
  { name: 'Lodge', age: 3, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 6 }],
    cost: cost('clay', 'clay', 'loom', 'papyrus'),
    chainFrom: ['Dispensary'],
    effects: [science('compass')] },
  { name: 'Observatory', age: 3, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('ore', 'ore', 'glass', 'loom'),
    chainFrom: ['Laboratory'],
    effects: [science('gear')] },
  { name: 'University', age: 3, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 4 }],
    cost: cost('wood', 'wood', 'papyrus', 'glass'),
    chainFrom: ['Library'],
    effects: [science('tablet')] },
  { name: 'Academy', age: 3, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 7 }],
    cost: cost('stone', 'stone', 'stone', 'glass'),
    chainFrom: ['School'],
    effects: [science('compass')] },
  { name: 'Study', age: 3, color: 'green',
    appearances: [{ minPlayers: 3 }, { minPlayers: 5 }],
    cost: cost('wood', 'papyrus', 'loom'),
    chainFrom: ['School'],
    effects: [science('gear')] },
];

// =====================================================================
// AGE III guilds (purple) — exactly (players+2) random guilds from this list
// =====================================================================

const GUILDS: CardTemplate[] = [
  { name: 'Workers Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('ore', 'ore', 'clay', 'stone', 'wood'),
    effects: [endVp({ from: 'neighbors', countWhat: { kind: 'cardColor', color: 'brown' }, vpPer: 1 })] },
  { name: 'Craftsmens Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('ore', 'ore', 'stone', 'stone'),
    effects: [endVp({ from: 'neighbors', countWhat: { kind: 'cardColor', color: 'gray' }, vpPer: 2 })] },
  { name: 'Traders Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('loom', 'papyrus', 'glass'),
    effects: [endVp({ from: 'neighbors', countWhat: { kind: 'cardColor', color: 'yellow' }, vpPer: 1 })] },
  { name: 'Philosophers Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('clay', 'clay', 'clay', 'loom', 'papyrus'),
    effects: [endVp({ from: 'neighbors', countWhat: { kind: 'cardColor', color: 'green' }, vpPer: 1 })] },
  { name: 'Spies Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('clay', 'clay', 'clay', 'glass'),
    effects: [endVp({ from: 'neighbors', countWhat: { kind: 'cardColor', color: 'red' }, vpPer: 1 })] },
  { name: 'Strategists Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('ore', 'ore', 'stone', 'loom'),
    // Special: 1 VP per defeat token among neighbors. We approximate by counting
    // "military" (each defeat token = -1). Implementation will award 1 VP per
    // neighbor's military *defeat* token (negative tokens). Reuse 'military' here.
    effects: [endVp({ from: 'neighbors', countWhat: { kind: 'military' }, vpPer: 1 })] },
  { name: 'Shipowners Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('wood', 'wood', 'wood', 'glass', 'papyrus'),
    // 1 VP per brown + gray + purple in OWN tableau. We model this as three
    // separate endVp effects on the same card (the engine sums them).
    effects: [
      endVp({ from: 'self', countWhat: { kind: 'cardColor', color: 'brown' }, vpPer: 1 }),
      endVp({ from: 'self', countWhat: { kind: 'cardColor', color: 'gray' }, vpPer: 1 }),
      endVp({ from: 'self', countWhat: { kind: 'cardColor', color: 'purple' }, vpPer: 1 }),
    ] },
  { name: 'Scientists Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('wood', 'wood', 'ore', 'ore', 'papyrus'),
    // Adds an extra free-choice science symbol at scoring. Modeled by giving
    // this card a 'science' effect with a special "any" symbol — but our science
    // type doesn't have "any". We'll handle it as a special-case in scoring by
    // detecting the Scientists Guild card by name. Effects list left empty; the
    // scoring code adds +1 to the player's best of (compass, gear, tablet).
    effects: [] },
  { name: 'Magistrates Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('wood', 'wood', 'wood', 'stone', 'loom'),
    effects: [endVp({ from: 'neighbors', countWhat: { kind: 'cardColor', color: 'blue' }, vpPer: 1 })] },
  { name: 'Builders Guild', age: 3, color: 'purple',
    appearances: [{ minPlayers: 3 }],
    cost: cost('stone', 'stone', 'clay', 'clay', 'glass'),
    effects: [endVp({ from: 'all', countWhat: { kind: 'wonderStages' }, vpPer: 1 })] },
];

let _nextId = 1;
/** Convert a template to a card with a fresh id, scoped to the player-count appearance. */
function instantiate(t: CardTemplate, app: { minPlayers: number; maxPlayers?: number }): SwCard {
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

/** Build the deck for one age and the given player count. Returns an unshuffled list. */
export function buildAgeDeck(age: SwAge, playerCount: number): SwCard[] {
  const pool = age === 1 ? AGE_I : age === 2 ? AGE_II : AGE_III;
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

/** Build the Age III deck including (playerCount + 2) randomly drawn guilds. */
export function buildAgeIIIDeck(rng: RngState, playerCount: number): SwCard[] {
  const base = buildAgeDeck(3, playerCount);
  // Pad with guilds.
  const guildPool: SwCard[] = GUILDS.map((t) => instantiate(t, { minPlayers: 3 }));
  const shuffled = shuffle(rng, guildPool);
  const drawn = shuffled.slice(0, playerCount + 2);
  return base.concat(drawn);
}

/** Per the rulebook: each Age dealt 7 cards per player. */
export function ageDeckTargetSize(playerCount: number): number {
  return playerCount * 7;
}

/** Verify and trim a deck to exactly target size. We sample down if it's larger
 *  (some min/max ranges can produce extras at edge counts) and pad with nothing
 *  if smaller (engineer choice: leave shorter — should not happen for valid counts). */
export function trimAndShuffleDeck(rng: RngState, deck: SwCard[], playerCount: number): SwCard[] {
  const target = ageDeckTargetSize(playerCount);
  const shuffled = shuffle(rng, deck);
  return shuffled.slice(0, target);
}

/** Look up a card by name in a tableau (used for chain-from cost waivers). */
export function tableauHasChain(tableau: SwCard[], chainName: string): boolean {
  return tableau.some((c) => c.name === chainName);
}

/** Player-count range allowed by the deck construction (3–7 per rulebook). */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;

/** All card name → template, for lookup. */
export const CARD_NAMES_AGE_1 = AGE_I.map((t) => t.name);
export const CARD_NAMES_AGE_2 = AGE_II.map((t) => t.name);
export const CARD_NAMES_AGE_3 = AGE_III.map((t) => t.name);
export const GUILD_NAMES = GUILDS.map((t) => t.name);

/** Reset the id counter (called by createInitialState so deck ids are stable per match). */
export function resetCardIdCounter(start: number): void {
  _nextId = start;
}
