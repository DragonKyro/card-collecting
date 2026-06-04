// 7 Wonders Duel — card data per age.
//
// Duel decks are smaller than base 7W (23 cards × 3 ages plus 5 guilds).
// Each age's deck is drawn into a fixed pyramid layout (see pyramid.ts).
//
// Card fidelity: faithful to the Duel card list where I'm confident; some
// per-card abilities (especially yellow cards with unique conditional bonuses)
// are best-effort. Cards whose ability I'm not fully confident on use
// approximations (e.g., simpler endVp shapes). This mirrors the same
// pattern used for the Cities / Babel / Armada expansions in base 7W.

import type {
  DuelAge, DuelCard, DuelCardColor, DuelCardEffect, DuelCost, DuelResource, DuelScience,
} from './types';
import { shuffle, type RngState } from '@/core/rng';

interface DuelCardTemplate {
  name: string;
  age: DuelAge;
  color: DuelCardColor;
  cost?: DuelCost;
  chainFrom?: string[];
  chainTo?: string[];
  effects: DuelCardEffect[];
}

const free: DuelCost = {};
const cost = (...resources: DuelResource[]): DuelCost => ({ resources });
const costCoins = (n: number): DuelCost => ({ coins: n });
const vp = (n: number): DuelCardEffect => ({ kind: 'vp', vp: n });
const shields = (n: number): DuelCardEffect => ({ kind: 'shields', shields: n });
const coins = (n: number): DuelCardEffect => ({ kind: 'coins', amount: n });
const produce = (...prods: DuelResource[][]): DuelCardEffect =>
  ({ kind: 'produce', production: prods });
const science = (sym: DuelScience): DuelCardEffect => ({ kind: 'science', symbol: sym });

// =====================================================================
// AGE I — 23 cards
// =====================================================================

const AGE_I: DuelCardTemplate[] = [
  // Brown (raw) — 4
  { name: 'Lumber Yard', age: 1, color: 'brown', cost: free, effects: [produce(['wood'])] },
  { name: 'Logging Camp', age: 1, color: 'brown', cost: costCoins(1), effects: [produce(['wood'])] },
  { name: 'Clay Pool', age: 1, color: 'brown', cost: free, effects: [produce(['clay'])] },
  { name: 'Quarry', age: 1, color: 'brown', cost: costCoins(1), effects: [produce(['stone'])] },

  // Gray (manufactured) — 2
  { name: 'Glassworks', age: 1, color: 'gray', cost: free, effects: [produce(['glass'])] },
  { name: 'Press', age: 1, color: 'gray', cost: free, effects: [produce(['papyrus'])] },

  // Yellow — 3
  { name: 'Tavern', age: 1, color: 'yellow', cost: free, effects: [coins(4)] },
  { name: 'Stone Reserve', age: 1, color: 'yellow', cost: costCoins(3),
    effects: [{ kind: 'tradeDiscountRaw' }],
    chainTo: ['Caravansery'] },
  { name: 'Clay Reserve', age: 1, color: 'yellow', cost: costCoins(3),
    effects: [{ kind: 'tradeDiscountRaw' }] },

  // Blue (civilian VP) — 4
  { name: 'Theater', age: 1, color: 'blue', cost: free, effects: [vp(3)], chainTo: ['Statue'] },
  { name: 'Altar', age: 1, color: 'blue', cost: free, effects: [vp(3)], chainTo: ['Temple'] },
  { name: 'Baths', age: 1, color: 'blue', cost: cost('stone'), effects: [vp(3)], chainTo: ['Aqueduct'] },
  { name: 'Pharmacist', age: 1, color: 'blue', cost: cost('glass'), effects: [vp(2)] },

  // Red (military) — 4
  { name: 'Stockade', age: 1, color: 'red', cost: cost('wood'), effects: [shields(1)] },
  { name: 'Barracks', age: 1, color: 'red', cost: cost('clay'), effects: [shields(1)] },
  { name: 'Guard Tower', age: 1, color: 'red', cost: cost('clay'), effects: [shields(1)] },
  { name: 'Palisade', age: 1, color: 'red', cost: cost('stone'), effects: [shields(1)] },

  // Green (science) — 6
  { name: 'Apothecary', age: 1, color: 'green', cost: cost('glass'),
    effects: [science('compass')], chainTo: ['Dispensary'] },
  { name: 'Workshop', age: 1, color: 'green', cost: cost('papyrus'),
    effects: [science('gear')], chainTo: ['Archery Range'] },
  { name: 'Scriptorium', age: 1, color: 'green', cost: cost('papyrus'),
    effects: [science('tablet')], chainTo: ['Library'] },
  { name: 'Stable', age: 1, color: 'green', cost: cost('wood'),
    effects: [science('wheel')], chainTo: ['Horse Breeders'] },
  { name: 'Bottling Plant', age: 1, color: 'green', cost: cost('glass'),
    effects: [science('lyre')], chainTo: ['Brewery'] },
  { name: 'Garrison', age: 1, color: 'green', cost: cost('clay'),
    effects: [science('mortar')], chainTo: ['Walls'] },
];

// =====================================================================
// AGE II — 23 cards
// =====================================================================

const AGE_II: DuelCardTemplate[] = [
  // Brown — 3
  { name: 'Sawmill', age: 2, color: 'brown', cost: costCoins(2), effects: [produce(['wood'], ['wood'])] },
  { name: 'Brickyard', age: 2, color: 'brown', cost: costCoins(2), effects: [produce(['clay'], ['clay'])] },
  { name: 'Shelf Quarry', age: 2, color: 'brown', cost: costCoins(2), effects: [produce(['stone'], ['stone'])] },

  // Gray — 2
  { name: 'Glass-Blower', age: 2, color: 'gray', cost: free, effects: [produce(['glass'])] },
  { name: 'Drying Room', age: 2, color: 'gray', cost: free, effects: [produce(['papyrus'])] },

  // Yellow — 4
  { name: 'Forum', age: 2, color: 'yellow', cost: cost('clay', 'clay'),
    effects: [coins(3), { kind: 'tradeDiscountManufactured' }] },
  { name: 'Caravansery', age: 2, color: 'yellow', cost: cost('wood', 'wood'),
    effects: [{ kind: 'tradeDiscountRaw' }], chainFrom: ['Stone Reserve'] },
  { name: 'Customs House', age: 2, color: 'yellow', cost: cost('clay', 'clay'),
    effects: [coins(2), { kind: 'tradeDiscountRaw' }] },
  { name: 'Brewery', age: 2, color: 'yellow', cost: cost('clay'),
    effects: [coins(6)], chainFrom: ['Bottling Plant'] },

  // Blue — 4
  { name: 'Temple', age: 2, color: 'blue', cost: cost('wood', 'papyrus'),
    effects: [vp(4)], chainFrom: ['Altar'], chainTo: ['Pantheon'] },
  { name: 'Statue', age: 2, color: 'blue', cost: cost('clay', 'clay'),
    effects: [vp(4)], chainFrom: ['Theater'], chainTo: ['Gardens'] },
  { name: 'Aqueduct', age: 2, color: 'blue', cost: cost('stone', 'stone', 'stone'),
    effects: [vp(5)], chainFrom: ['Baths'] },
  { name: 'Rostrum', age: 2, color: 'blue', cost: cost('stone'),
    effects: [vp(4)] },

  // Red — 4
  { name: 'Walls', age: 2, color: 'red', cost: cost('stone', 'stone'),
    effects: [shields(2)], chainFrom: ['Garrison'] },
  { name: 'Horse Breeders', age: 2, color: 'red', cost: cost('clay', 'wood'),
    effects: [shields(1)], chainFrom: ['Stable'] },
  { name: 'Archery Range', age: 2, color: 'red', cost: cost('wood', 'wood', 'stone'),
    effects: [shields(2)], chainFrom: ['Workshop'] },
  { name: 'Parade Ground', age: 2, color: 'red', cost: cost('clay', 'clay', 'wood'),
    effects: [shields(2)] },

  // Green — 6
  { name: 'Dispensary', age: 2, color: 'green', cost: cost('glass', 'glass'),
    effects: [science('compass')], chainFrom: ['Apothecary'] },
  { name: 'Library', age: 2, color: 'green', cost: cost('papyrus', 'papyrus'),
    effects: [science('tablet')], chainFrom: ['Scriptorium'] },
  { name: 'School', age: 2, color: 'green', cost: cost('papyrus', 'wood'),
    effects: [science('mortar')] },
  { name: 'Laboratory', age: 2, color: 'green', cost: cost('papyrus', 'glass'),
    effects: [science('gear')] },
  { name: 'Courthouse', age: 2, color: 'green', cost: cost('clay', 'clay', 'papyrus'),
    effects: [science('sundial')] },
  { name: 'Tribunal', age: 2, color: 'green', cost: cost('wood', 'wood', 'glass'),
    effects: [science('lyre')] },
];

// =====================================================================
// AGE III — 20 cards + 7 guilds (5 guilds shuffled in)
// =====================================================================

const AGE_III: DuelCardTemplate[] = [
  // Yellow — 4 (Age III has commercial endgame)
  { name: 'Chamber of Commerce', age: 3, color: 'yellow', cost: cost('papyrus', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'gray' }, coinsPerOnPlay: 3, vpPer: 3 }] },
  { name: 'Port', age: 3, color: 'yellow', cost: cost('glass', 'papyrus', 'wood'),
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'brown' }, coinsPerOnPlay: 2, vpPer: 2 }] },
  { name: 'Armory', age: 3, color: 'yellow', cost: cost('stone', 'stone', 'glass'),
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'red' }, coinsPerOnPlay: 1, vpPer: 1 }] },
  { name: 'Lighthouse', age: 3, color: 'yellow', cost: cost('papyrus', 'wood', 'wood'),
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'yellow' }, coinsPerOnPlay: 1, vpPer: 1 }] },

  // Blue — 5
  { name: 'Pantheon', age: 3, color: 'blue', cost: cost('clay', 'papyrus', 'glass', 'wood'),
    effects: [vp(6)], chainFrom: ['Temple'] },
  { name: 'Gardens', age: 3, color: 'blue', cost: cost('wood', 'wood', 'clay', 'clay'),
    effects: [vp(6)], chainFrom: ['Statue'] },
  { name: 'Senate', age: 3, color: 'blue', cost: cost('stone', 'wood', 'glass'),
    effects: [vp(5)] },
  { name: 'Town Hall', age: 3, color: 'blue', cost: cost('stone', 'stone', 'wood', 'glass'),
    effects: [vp(7)] },
  { name: 'Obelisk', age: 3, color: 'blue', cost: cost('stone', 'glass'),
    effects: [vp(5)] },

  // Red — 4
  { name: 'Fortifications', age: 3, color: 'red', cost: cost('stone', 'clay', 'clay'),
    effects: [shields(2)] },
  { name: 'Siege Workshop', age: 3, color: 'red', cost: cost('wood', 'clay', 'clay'),
    effects: [shields(2)], chainFrom: ['Archery Range'] },
  { name: 'Circus', age: 3, color: 'red', cost: cost('stone', 'stone', 'clay'),
    effects: [shields(2)] },
  { name: 'Arsenal', age: 3, color: 'red', cost: cost('wood', 'wood', 'clay'),
    effects: [shields(3)] },

  // Green — 4
  { name: 'University', age: 3, color: 'green', cost: cost('wood', 'glass', 'papyrus'),
    effects: [science('sundial')] },
  { name: 'Observatory', age: 3, color: 'green', cost: cost('papyrus', 'glass'),
    effects: [science('compass')] },
  { name: 'Academy', age: 3, color: 'green', cost: cost('stone', 'glass'),
    effects: [science('lyre')] },
  { name: 'Study', age: 3, color: 'green', cost: cost('wood', 'glass', 'papyrus'),
    effects: [science('wheel')] },

  // Yellow second batch — 3 more
  { name: 'Pretorium', age: 3, color: 'yellow', cost: costCoins(8),
    effects: [vp(7)] },
  { name: 'Arena', age: 3, color: 'yellow', cost: cost('stone', 'stone', 'clay'),
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'wonderStages' }, coinsPerOnPlay: 3, vpPer: 3 }] },
  { name: 'Merchants Guild', age: 3, color: 'purple', cost: cost('wood', 'wood', 'glass', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'cardColor', color: 'yellow' }, vpPer: 1 }] },
];

// ----- Guilds (purple) — 7 total, 5 shuffled into Age III deck -----
const GUILDS: DuelCardTemplate[] = [
  { name: 'Merchants Guild', age: 3, color: 'purple', cost: cost('clay', 'wood', 'glass', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'cardColor', color: 'yellow' }, vpPer: 1 }] },
  { name: 'Shipowners Guild', age: 3, color: 'purple', cost: cost('clay', 'stone', 'glass', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'cardColor', color: 'brown' }, vpPer: 1 }] },
  { name: 'Builders Guild', age: 3, color: 'purple', cost: cost('stone', 'stone', 'clay', 'wood', 'glass'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'wonderStages' }, vpPer: 2 }] },
  { name: 'Magistrates Guild', age: 3, color: 'purple', cost: cost('wood', 'wood', 'clay', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'cardColor', color: 'blue' }, vpPer: 1 }] },
  { name: 'Scientists Guild', age: 3, color: 'purple', cost: cost('clay', 'clay', 'wood', 'wood'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'cardColor', color: 'green' }, vpPer: 1 }] },
  { name: 'Tacticians Guild', age: 3, color: 'purple', cost: cost('stone', 'stone', 'clay', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'cardColor', color: 'red' }, vpPer: 1 }] },
  { name: 'Moneylenders Guild', age: 3, color: 'purple', cost: cost('stone', 'stone', 'wood', 'wood'),
    effects: [{ kind: 'endVp', from: 'both', countWhat: { kind: 'coins' }, vpPer: 1 }] },
];

// Strip the second Merchants Guild from AGE_III (duplicates the guild pool one).
const AGE_III_NO_DUP: DuelCardTemplate[] = AGE_III.filter((c) => c.color !== 'purple');

let _nextId = 1;
export function resetDuelCardIdCounter(start = 1): void { _nextId = start; }

function instantiate(t: DuelCardTemplate): DuelCard {
  return {
    id: _nextId++,
    name: t.name,
    age: t.age,
    color: t.color,
    cost: t.cost ?? {},
    chainFrom: t.chainFrom,
    chainTo: t.chainTo,
    effects: t.effects,
  };
}

/** Returns a fresh array of card OBJECTS for the given age. Includes 3 randomly
 *  drawn guilds for age 3. The caller should shuffle for pyramid placement. */
export function buildDuelAgeDeck(age: DuelAge, rng: RngState): DuelCard[] {
  if (age === 1) return AGE_I.map(instantiate);
  if (age === 2) return AGE_II.map(instantiate);
  // Age 3: base + 3 random guilds.
  const base = AGE_III_NO_DUP.map(instantiate);
  const guildPool = shuffle(rng, GUILDS).map(instantiate);
  return base.concat(guildPool.slice(0, 3));
}

export const DUEL_AGE_I_NAMES = AGE_I.map((t) => t.name);
export const DUEL_AGE_II_NAMES = AGE_II.map((t) => t.name);
export const DUEL_AGE_III_NAMES = AGE_III_NO_DUP.map((t) => t.name);
export const DUEL_GUILD_NAMES = GUILDS.map((t) => t.name);

export const DUEL_AGE_I_COUNT = AGE_I.length;
export const DUEL_AGE_II_COUNT = AGE_II.length;
export const DUEL_AGE_III_COUNT = AGE_III_NO_DUP.length + 3; // 3 random guilds added per match
