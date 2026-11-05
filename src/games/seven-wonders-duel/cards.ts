// 7 Wonders Duel — the card list, per age.
//
// The printed deck: 23 Age I cards, 23 Age II, 20 Age III and 7 Guilds. Each
// age deals 20 (Ages I and II drop 3 unseen; Age III drops 3 of its 20 and
// shuffles in 3 random Guilds), so some cards never appear in a match.
//
// Card ids are fixed (100 + index for Age I, 200+ Age II, 300+ Age III, 400+
// Guilds), so dealing needs no counter and every peer agrees on them.
//
// Chains: a card showing a chain symbol (`chain`) makes the later card with
// that symbol in its cost (`chainCost`, named in `chainFrom`) free.

import type {
  DuelAge, DuelCard, DuelCardColor, DuelCardEffect, DuelChainSymbol, DuelCost, DuelCount,
  DuelResource, DuelScience,
} from './types';
import { shuffle, type RngState } from '@/core/rng';

interface DuelCardTemplate {
  name: string;
  color: DuelCardColor;
  cost?: DuelCost;
  /** [symbol, card that shows it] — builds this card for free. */
  chainCost?: [DuelChainSymbol, string];
  chain?: DuelChainSymbol;
  effects: DuelCardEffect[];
}

const free: DuelCost = {};
const res = (...resources: DuelResource[]): DuelCost => ({ resources });
const coinsCost = (n: number, ...resources: DuelResource[]): DuelCost =>
  resources.length ? { coins: n, resources } : { coins: n };
const vp = (n: number): DuelCardEffect => ({ kind: 'vp', vp: n });
const shields = (n: number): DuelCardEffect => ({ kind: 'shields', shields: n });
const coins = (n: number): DuelCardEffect => ({ kind: 'coins', amount: n });
const produce = (...prods: DuelResource[][]): DuelCardEffect => ({ kind: 'produce', production: prods });
const science = (symbol: DuelScience): DuelCardEffect => ({ kind: 'science', symbol });
const tradeFixed = (...resources: DuelResource[]): DuelCardEffect => ({ kind: 'tradeFixed', resources });
const colors = (...c: DuelCardColor[]): DuelCount => ({ kind: 'color', colors: c });
const coinsPer = (what: DuelCount, per: number): DuelCardEffect => ({ kind: 'coinsPer', what, per });
const guild = (what: DuelCount, vpPer: number, coinsPerCard: number): DuelCardEffect =>
  ({ kind: 'guild', what, vpPer, coinsPer: coinsPerCard });

// =====================================================================
// AGE I — 23 cards
// =====================================================================

const AGE_I: DuelCardTemplate[] = [
  { name: 'Lumber Yard', color: 'brown', cost: free, effects: [produce(['wood'])] },
  { name: 'Logging Camp', color: 'brown', cost: coinsCost(1), effects: [produce(['wood'])] },
  { name: 'Clay Pool', color: 'brown', cost: free, effects: [produce(['clay'])] },
  { name: 'Clay Pit', color: 'brown', cost: coinsCost(1), effects: [produce(['clay'])] },
  { name: 'Quarry', color: 'brown', cost: free, effects: [produce(['stone'])] },
  { name: 'Stone Pit', color: 'brown', cost: coinsCost(1), effects: [produce(['stone'])] },

  { name: 'Glassworks', color: 'gray', cost: coinsCost(1), effects: [produce(['glass'])] },
  { name: 'Press', color: 'gray', cost: coinsCost(1), effects: [produce(['papyrus'])] },

  { name: 'Guard Tower', color: 'red', cost: free, effects: [shields(1)] },
  { name: 'Stable', color: 'red', cost: res('wood'), chain: 'horseshoe', effects: [shields(1)] },
  { name: 'Garrison', color: 'red', cost: res('clay'), chain: 'sword', effects: [shields(1)] },
  { name: 'Palisade', color: 'red', cost: coinsCost(2), chain: 'tower', effects: [shields(1)] },

  { name: 'Workshop', color: 'green', cost: res('papyrus'), effects: [vp(1), science('plumb')] },
  { name: 'Apothecary', color: 'green', cost: res('glass'), effects: [vp(1), science('wheel')] },
  { name: 'Scriptorium', color: 'green', cost: coinsCost(2), chain: 'book', effects: [science('quill')] },
  { name: 'Pharmacist', color: 'green', cost: coinsCost(2), chain: 'gear', effects: [science('mortar')] },

  { name: 'Stone Reserve', color: 'yellow', cost: coinsCost(3), effects: [tradeFixed('stone')] },
  { name: 'Clay Reserve', color: 'yellow', cost: coinsCost(3), effects: [tradeFixed('clay')] },
  { name: 'Wood Reserve', color: 'yellow', cost: coinsCost(3), effects: [tradeFixed('wood')] },
  { name: 'Tavern', color: 'yellow', cost: free, chain: 'jug', effects: [coins(4)] },

  { name: 'Theater', color: 'blue', cost: free, chain: 'mask', effects: [vp(3)] },
  { name: 'Altar', color: 'blue', cost: free, chain: 'moon', effects: [vp(3)] },
  { name: 'Baths', color: 'blue', cost: res('stone'), chain: 'drop', effects: [vp(3)] },
];

// =====================================================================
// AGE II — 23 cards
// =====================================================================

const AGE_II: DuelCardTemplate[] = [
  { name: 'Sawmill', color: 'brown', cost: coinsCost(2), effects: [produce(['wood'], ['wood'])] },
  { name: 'Brickyard', color: 'brown', cost: coinsCost(2), effects: [produce(['clay'], ['clay'])] },
  { name: 'Shelf Quarry', color: 'brown', cost: coinsCost(2), effects: [produce(['stone'], ['stone'])] },

  { name: 'Glass-Blower', color: 'gray', cost: free, effects: [produce(['glass'])] },
  { name: 'Drying Room', color: 'gray', cost: free, effects: [produce(['papyrus'])] },

  { name: 'Walls', color: 'red', cost: res('stone', 'stone'), effects: [shields(2)] },
  { name: 'Horse Breeders', color: 'red', cost: res('clay', 'wood'), chainCost: ['horseshoe', 'Stable'], effects: [shields(1)] },
  { name: 'Barracks', color: 'red', cost: coinsCost(3), chainCost: ['sword', 'Garrison'], effects: [shields(1)] },
  { name: 'Archery Range', color: 'red', cost: res('stone', 'wood', 'papyrus'), chain: 'target', effects: [shields(2)] },
  { name: 'Parade Ground', color: 'red', cost: res('clay', 'clay', 'glass'), chain: 'helmet', effects: [shields(2)] },

  { name: 'Library', color: 'green', cost: res('stone', 'wood', 'glass'), chainCost: ['book', 'Scriptorium'], effects: [vp(2), science('quill')] },
  { name: 'Dispensary', color: 'green', cost: res('clay', 'clay', 'stone'), chainCost: ['gear', 'Pharmacist'], effects: [vp(2), science('mortar')] },
  { name: 'School', color: 'green', cost: res('wood', 'papyrus', 'papyrus'), chain: 'lyre', effects: [vp(1), science('wheel')] },
  { name: 'Laboratory', color: 'green', cost: res('wood', 'glass', 'glass'), chain: 'lamp', effects: [vp(1), science('plumb')] },

  { name: 'Forum', color: 'yellow', cost: coinsCost(3, 'clay'), effects: [produce(['glass', 'papyrus'])] },
  { name: 'Caravansery', color: 'yellow', cost: coinsCost(2, 'glass', 'papyrus'), effects: [produce(['wood', 'clay', 'stone'])] },
  { name: 'Customs House', color: 'yellow', cost: coinsCost(4), effects: [tradeFixed('papyrus', 'glass')] },
  { name: 'Brewery', color: 'yellow', cost: free, chain: 'barrel', effects: [coins(6)] },

  { name: 'Courthouse', color: 'blue', cost: res('wood', 'wood', 'glass'), effects: [vp(5)] },
  { name: 'Statue', color: 'blue', cost: res('clay', 'clay'), chainCost: ['mask', 'Theater'], chain: 'column', effects: [vp(4)] },
  { name: 'Temple', color: 'blue', cost: res('wood', 'papyrus'), chainCost: ['moon', 'Altar'], chain: 'sun', effects: [vp(4)] },
  { name: 'Aqueduct', color: 'blue', cost: res('stone', 'stone', 'stone'), chainCost: ['drop', 'Baths'], effects: [vp(5)] },
  { name: 'Rostrum', color: 'blue', cost: res('stone', 'wood'), chain: 'senate', effects: [vp(4)] },
];

// =====================================================================
// AGE III — 20 cards
// =====================================================================

const AGE_III: DuelCardTemplate[] = [
  { name: 'Arsenal', color: 'red', cost: res('clay', 'clay', 'clay', 'wood', 'wood'), effects: [shields(3)] },
  { name: 'Pretorium', color: 'red', cost: coinsCost(8), effects: [shields(3)] },
  { name: 'Fortifications', color: 'red', cost: res('stone', 'stone', 'clay', 'papyrus'), chainCost: ['tower', 'Palisade'], effects: [shields(2)] },
  { name: 'Siege Workshop', color: 'red', cost: res('wood', 'wood', 'wood', 'glass'), chainCost: ['target', 'Archery Range'], effects: [shields(2)] },
  { name: 'Circus', color: 'red', cost: res('clay', 'clay', 'stone', 'stone'), chainCost: ['helmet', 'Parade Ground'], effects: [shields(2)] },

  { name: 'Academy', color: 'green', cost: res('stone', 'wood', 'glass', 'glass'), effects: [vp(3), science('sundial')] },
  { name: 'Study', color: 'green', cost: res('wood', 'wood', 'glass', 'papyrus'), effects: [vp(3), science('sundial')] },
  { name: 'University', color: 'green', cost: res('clay', 'glass', 'papyrus'), chainCost: ['lyre', 'School'], effects: [vp(2), science('globe')] },
  { name: 'Observatory', color: 'green', cost: res('stone', 'papyrus', 'papyrus'), chainCost: ['lamp', 'Laboratory'], effects: [vp(2), science('globe')] },

  { name: 'Chamber of Commerce', color: 'yellow', cost: res('papyrus', 'papyrus'), effects: [vp(3), coinsPer(colors('gray'), 3)] },
  { name: 'Port', color: 'yellow', cost: res('wood', 'glass', 'papyrus'), effects: [vp(3), coinsPer(colors('brown'), 2)] },
  { name: 'Armory', color: 'yellow', cost: res('stone', 'stone', 'glass'), effects: [vp(3), coinsPer(colors('red'), 1)] },
  { name: 'Lighthouse', color: 'yellow', cost: res('clay', 'clay', 'glass'), chainCost: ['jug', 'Tavern'], effects: [vp(3), coinsPer(colors('yellow'), 1)] },
  { name: 'Arena', color: 'yellow', cost: res('clay', 'stone', 'wood'), chainCost: ['barrel', 'Brewery'], effects: [vp(3), coinsPer({ kind: 'wonders' }, 2)] },

  { name: 'Palace', color: 'blue', cost: res('clay', 'stone', 'wood', 'glass', 'glass'), effects: [vp(7)] },
  { name: 'Town Hall', color: 'blue', cost: res('stone', 'stone', 'stone', 'wood', 'wood'), effects: [vp(7)] },
  { name: 'Obelisk', color: 'blue', cost: res('stone', 'stone', 'glass'), effects: [vp(5)] },
  { name: 'Gardens', color: 'blue', cost: res('clay', 'clay', 'wood', 'wood'), chainCost: ['column', 'Statue'], effects: [vp(6)] },
  { name: 'Pantheon', color: 'blue', cost: res('clay', 'wood', 'papyrus', 'papyrus'), chainCost: ['sun', 'Temple'], effects: [vp(6)] },
  { name: 'Senate', color: 'blue', cost: res('clay', 'clay', 'stone', 'papyrus'), chainCost: ['senate', 'Rostrum'], effects: [vp(5)] },
];

// =====================================================================
// GUILDS — 7, three shuffled into each Age III deck
// =====================================================================
//
// A guild counts in the city that has the most of its kind (yours or your
// opponent's): coins when built, VP at the end (counted again then).

const GUILDS: DuelCardTemplate[] = [
  { name: 'Merchants Guild', color: 'purple', cost: res('clay', 'wood', 'glass', 'papyrus'), effects: [guild(colors('yellow'), 1, 1)] },
  { name: 'Shipowners Guild', color: 'purple', cost: res('clay', 'stone', 'glass', 'papyrus'), effects: [guild(colors('brown', 'gray'), 1, 1)] },
  { name: 'Builders Guild', color: 'purple', cost: res('stone', 'stone', 'clay', 'wood', 'glass'), effects: [guild({ kind: 'wonders' }, 2, 0)] },
  { name: 'Magistrates Guild', color: 'purple', cost: res('wood', 'wood', 'clay', 'papyrus'), effects: [guild(colors('blue'), 1, 1)] },
  { name: 'Scientists Guild', color: 'purple', cost: res('clay', 'clay', 'wood', 'wood'), effects: [guild(colors('green'), 1, 1)] },
  { name: 'Moneylenders Guild', color: 'purple', cost: res('stone', 'stone', 'wood', 'wood'), effects: [guild({ kind: 'coins' }, 1, 0)] },
  { name: 'Tacticians Guild', color: 'purple', cost: res('stone', 'stone', 'clay', 'papyrus'), effects: [guild(colors('red'), 1, 1)] },
];

// =====================================================================
// PANTHEON — 5 Grand Temples, three shuffled into Age III instead of Guilds
// =====================================================================
//
// Free with a Mythology token of the temple's type (the symbol under its
// cost); scored together: 5 / 12 / 21 VP for 1 / 2 / 3 temples.

const TEMPLES: DuelCardTemplate[] = [
  { name: 'Mesopotamian Grand Temple', color: 'purple', cost: res('wood', 'wood', 'wood', 'glass', 'papyrus'), effects: [{ kind: 'grandTemple', mythology: 'mesopotamian' }] },
  { name: 'Phoenician Grand Temple', color: 'purple', cost: res('wood', 'stone', 'glass', 'papyrus', 'papyrus'), effects: [{ kind: 'grandTemple', mythology: 'phoenician' }] },
  { name: 'Greek Grand Temple', color: 'purple', cost: res('stone', 'stone', 'stone', 'glass', 'papyrus'), effects: [{ kind: 'grandTemple', mythology: 'greek' }] },
  { name: 'Egyptian Grand Temple', color: 'purple', cost: res('clay', 'clay', 'clay', 'glass', 'papyrus'), effects: [{ kind: 'grandTemple', mythology: 'egyptian' }] },
  { name: 'Roman Grand Temple', color: 'purple', cost: res('clay', 'stone', 'glass', 'glass', 'papyrus'), effects: [{ kind: 'grandTemple', mythology: 'roman' }] },
];

// =====================================================================
// AGORA — 13 Senators: 7 Politicians (2 left, 3 centre, 2 right) and 6
// Conspirators, shuffled into the ages 5 / 5 / 3
// =====================================================================
//
// A Senator costs a coin per Senator already in your city (nothing with
// Corruption); the age it is dealt into is set when it is dealt.

const politician = (section: 1 | 2 | 3): DuelCardTemplate => ({
  name: `Politician (${section === 1 ? 'left' : section === 2 ? 'centre' : 'right'})`,
  color: 'senator',
  effects: [{ kind: 'politician', section }],
});
const SENATORS: DuelCardTemplate[] = [
  politician(1), politician(1),
  politician(2), politician(2), politician(2),
  politician(3), politician(3),
  ...Array.from({ length: 6 }, (): DuelCardTemplate => ({ name: 'Conspirator', color: 'senator', effects: [{ kind: 'conspirator' }] })),
];

function instantiate(t: DuelCardTemplate, age: DuelAge, id: number): DuelCard {
  const card: DuelCard = { id, name: t.name, age, color: t.color, cost: t.cost ?? {}, effects: t.effects };
  if (t.chainCost) { card.chainCost = t.chainCost[0]; card.chainFrom = t.chainCost[1]; }
  if (t.chain) card.chain = t.chain;
  return card;
}

const DECKS: Record<DuelAge, DuelCard[]> = {
  1: AGE_I.map((t, i) => instantiate(t, 1, 100 + i)),
  2: AGE_II.map((t, i) => instantiate(t, 2, 200 + i)),
  3: AGE_III.map((t, i) => instantiate(t, 3, 300 + i)),
};
const GUILD_CARDS: DuelCard[] = GUILDS.map((t, i) => instantiate(t, 3, 400 + i));
const TEMPLE_CARDS: DuelCard[] = TEMPLES.map((t, i) => instantiate(t, 3, 420 + i));
const SENATOR_CARDS: DuelCard[] = SENATORS.map((t, i) => instantiate(t, 1, 500 + i));

/** Every card of an age as printed (Age III without the guilds). Read-only. */
export function ageCards(age: DuelAge): readonly DuelCard[] {
  return DECKS[age];
}

/** The seven guilds. Read-only. */
export function guildCards(): readonly DuelCard[] {
  return GUILD_CARDS;
}

/** Pantheon's five Grand Temples. Read-only. */
export function templeCards(): readonly DuelCard[] {
  return TEMPLE_CARDS;
}

/** Agora's thirteen Senators (age 1 here; a dealt copy carries its age). Read-only. */
export function senatorCards(): readonly DuelCard[] {
  return SENATOR_CARDS;
}

/** Every card of the base game, Guilds included. */
export function allCards(): readonly DuelCard[] {
  return [...DECKS[1], ...DECKS[2], ...DECKS[3], ...GUILD_CARDS];
}

/** The expansions' cards: Grand Temples, then Senators. */
export function expansionCards(): readonly DuelCard[] {
  return [...TEMPLE_CARDS, ...SENATOR_CARDS];
}

const copy = (c: DuelCard): DuelCard => JSON.parse(JSON.stringify(c));

export interface DealOptions {
  /** Pantheon: Grand Temples take the Guilds' place in Age III. */
  temples?: boolean;
  /** Agora: the Senators shuffled into this age. */
  senators?: readonly DuelCard[];
}

/** An age's cards, shuffled for the pyramid, and the 3 that go back to the
 *  box unseen. Age III shuffles in 3 of the 7 Guilds (or 3 of the 5 Grand
 *  Temples); Agora adds its Senators. Without expansions the draws are the
 *  same as they always were. */
export function dealAgeFull(age: DuelAge, rng: RngState, opts: DealOptions = {}): { deck: DuelCard[]; boxed: DuelCard[] } {
  const shuffled = shuffle(rng, DECKS[age]);
  const keep = DECKS[age].length - 3;
  let cards = shuffled.slice(0, keep);
  if (age === 3) cards = cards.concat(shuffle(rng, opts.temples ? TEMPLE_CARDS : GUILD_CARDS).slice(0, 3));
  if (opts.senators?.length) cards = cards.concat(opts.senators.map((c) => ({ ...copy(c), age })));
  return { deck: shuffle(rng, cards).map(copy), boxed: shuffled.slice(keep).map(copy) };
}

/** The 20 cards an age deals, shuffled for the pyramid: 3 of the age's cards
 *  go back to the box unseen; Age III shuffles in 3 of the 7 Guilds. */
export function dealAge(age: DuelAge, rng: RngState): DuelCard[] {
  return dealAgeFull(age, rng).deck;
}

/** True for Agora's Politicians and Conspirators. */
export const isSenator = (c: DuelCard): boolean => c.color === 'senator';

export const DUEL_AGE_COUNTS: Record<DuelAge, number> = { 1: AGE_I.length, 2: AGE_II.length, 3: AGE_III.length };
export const DUEL_GUILD_COUNT = GUILDS.length;
/** Senators shuffled into each age with Agora. */
export const SENATORS_PER_AGE: Record<DuelAge, number> = { 1: 5, 2: 5, 3: 3 };
