// 7 Wonders Cities — the 27 black cards (9 per Age) and the 3 Cities guilds.
//
// Costs and effects are the printed ones, read off scans of the first-edition
// cards (the card database's text had Brotherhood's and Capitol's costs
// swapped and Slave Market one ore too many; the rulebook transcript said
// Hideout costs the others 1 coin — the card says 2):
//   - Pigeon Loft, Spy Ring, Torture Chamber: a mask — at the end, copy the
//     science symbol of a green card in a neighbouring city.
//   - Militia, Mercenaries, Contingent: 2 / 3 / 5 shields.
//   - Hideout, Lair, Brotherhood: VP, and every other city loses 2 / 2 / 3 coins.
//   - Residence, Consulate, Embassy: VP and a diplomacy token.
//   - Gambling Den / House: 6 / 9 coins, each neighbour 1 / 2.
//   - Clandestine Dock West / East: the first resource bought each turn from
//     that neighbour costs 1 coin less.
//   - Sepulcher, Cenotaph: VP, and every other city loses 1 coin per victory token.
//   - Builders' Union: VP, and every other city loses 1 coin per wonder stage.
//   - Architect Cabinet: VP, and wonder stages cost no resources from now on.
//   - Secret Warehouse / Black Market: one resource a turn that the city
//     already produces / doesn't produce (brown, gray cards and its board).
//   - Secret Society / Slave Market: 1 coin now and 1 VP at the end per black
//     card / victory token of yours.
// A coin loss is settled at the end of the turn: coins to the bank or a debt
// token (−1 VP) per coin not paid.

import { shuffle, type RngState } from '@/core/rng';
import type { SwAge, SwCard, SwCardEffect, SwCost, SwResource } from '../../types';

interface CityTemplate {
  name: string;
  cost: SwCost;
  effects: SwCardEffect[];
}

const cost = (coins: number, ...resources: SwResource[]): SwCost =>
  ({ ...(coins ? { coins } : {}), ...(resources.length ? { resources } : {}) });
const vp = (n: number): SwCardEffect => ({ kind: 'vp', vp: n });
const shields = (n: number): SwCardEffect => ({ kind: 'shields', shields: n });
const loss = (amount: number, per?: 'victoryToken' | 'wonderStage'): SwCardEffect =>
  ({ kind: 'coinLoss', amount, ...(per ? { per } : {}) });
const diplomacy: SwCardEffect = { kind: 'diplomacy' };
const mask: SwCardEffect = { kind: 'mask' };

const AGE_I: CityTemplate[] = [
  { name: 'Residence', cost: cost(0, 'clay'), effects: [vp(1), diplomacy] },
  { name: 'Hideout', cost: cost(0), effects: [vp(2), loss(2)] },
  { name: 'Gates of the City', cost: cost(1, 'wood'), effects: [vp(4)] },
  { name: 'Militia', cost: cost(3), effects: [shields(2)] },
  { name: 'Gambling Den', cost: cost(0), effects: [{ kind: 'coins', amount: 6 }, { kind: 'neighborsGain', amount: 1 }] },
  { name: 'Clandestine Dock West', cost: cost(1), effects: [{ kind: 'tradeRebate', side: 'west' }] },
  { name: 'Clandestine Dock East', cost: cost(1), effects: [{ kind: 'tradeRebate', side: 'east' }] },
  { name: 'Pigeon Loft', cost: cost(1, 'ore'), effects: [mask] },
  { name: 'Secret Warehouse', cost: cost(2), effects: [{ kind: 'produceOwned' }] },
];

const AGE_II: CityTemplate[] = [
  { name: 'Architect Cabinet', cost: cost(1, 'papyrus'), effects: [vp(2), { kind: 'freeWonderResources' }] },
  { name: 'Black Market', cost: cost(0, 'ore', 'loom'), effects: [{ kind: 'produceMissing' }] },
  { name: 'Consulate', cost: cost(0, 'clay', 'papyrus'), effects: [vp(2), diplomacy] },
  { name: 'Gambling House', cost: cost(1), effects: [{ kind: 'coins', amount: 9 }, { kind: 'neighborsGain', amount: 2 }] },
  { name: 'Lair', cost: cost(0, 'wood', 'glass'), effects: [vp(3), loss(2)] },
  { name: 'Mercenaries', cost: cost(4, 'papyrus'), effects: [shields(3)] },
  { name: 'Sepulcher', cost: cost(0, 'ore', 'glass'), effects: [vp(3), loss(1, 'victoryToken')] },
  { name: 'Spy Ring', cost: cost(2, 'stone', 'clay'), effects: [mask] },
  { name: 'Tabularium', cost: cost(2, 'ore', 'wood', 'loom'), effects: [vp(6)] },
];

const AGE_III: CityTemplate[] = [
  { name: 'Brotherhood', cost: cost(0, 'wood', 'wood', 'ore', 'loom'), effects: [vp(4), loss(3)] },
  { name: 'Builders Union', cost: cost(0, 'clay', 'wood', 'papyrus', 'glass'), effects: [vp(4), loss(1, 'wonderStage')] },
  { name: 'Capitol', cost: cost(2, 'clay', 'clay', 'stone', 'stone', 'glass', 'papyrus'), effects: [vp(8)] },
  { name: 'Cenotaph', cost: cost(0, 'clay', 'clay', 'stone', 'loom', 'glass'), effects: [vp(5), loss(1, 'victoryToken')] },
  { name: 'Contingent', cost: cost(5, 'loom'), effects: [shields(5)] },
  { name: 'Embassy', cost: cost(0, 'stone', 'loom', 'papyrus'), effects: [vp(3), diplomacy] },
  { name: 'Secret Society', cost: cost(0, 'stone', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'black' }, coinsPerOnPlay: 1, vpPer: 1 }] },
  { name: 'Slave Market', cost: cost(0, 'ore', 'ore', 'wood', 'wood'),
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'victoryTokens' }, coinsPerOnPlay: 1, vpPer: 1 }] },
  { name: 'Torture Chamber', cost: cost(3, 'ore', 'ore', 'glass'), effects: [mask] },
];

const GUILDS: CityTemplate[] = [
  { name: 'Counterfeiters Guild', cost: cost(0, 'ore', 'ore', 'ore', 'glass', 'loom'), effects: [vp(5), loss(3)] },
  { name: 'Guild of Shadows', cost: cost(0, 'stone', 'stone', 'wood', 'papyrus'),
    effects: [{ kind: 'endVp', from: 'neighbors', countWhat: { kind: 'cardColor', color: 'black' }, vpPer: 1 }] },
  { name: 'Mourners Guild', cost: cost(0, 'clay', 'clay', 'wood', 'glass', 'loom'),
    effects: [{ kind: 'endVp', from: 'neighbors', countWhat: { kind: 'victoryTokens' }, vpPer: 1 }] },
];

const TEMPLATES: Record<SwAge, CityTemplate[]> = { 1: AGE_I, 2: AGE_II, 3: AGE_III };

/** Every black card of an Age (ids Age × 1000 + 500 + position). */
export function blackCards(age: SwAge): SwCard[] {
  return TEMPLATES[age].map((t, i) => ({
    id: age * 1000 + 500 + i, name: t.name, age, color: 'black', minPlayers: 3, maxPlayers: 99,
    cost: t.cost, effects: t.effects, expansion: 'cities',
  }));
}

/** The black cards added to an Age's deck: as many as there are players
 *  (7 at 8 players), drawn at random; the rest stay unseen. */
export function citiesDeckCards(age: SwAge, playerCount: number, rng: RngState): SwCard[] {
  return shuffle(rng, blackCards(age)).slice(0, Math.min(playerCount, 7));
}

/** The Cities guilds (added to the Age III guild pool). */
export function citiesGuilds(): SwCard[] {
  return GUILDS.map((t, i) => ({
    id: 3450 + i, name: t.name, age: 3, color: 'purple', minPlayers: 3, maxPlayers: 99,
    cost: t.cost, effects: t.effects, expansion: 'cities',
  }));
}

export const CITIES_CARD_NAMES: Record<SwAge, string[]> = {
  1: AGE_I.map((t) => t.name), 2: AGE_II.map((t) => t.name), 3: AGE_III.map((t) => t.name),
};
export const CITIES_GUILD_NAMES = GUILDS.map((t) => t.name);
