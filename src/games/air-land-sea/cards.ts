// Air, Land & Sea — card data, theaters, Supreme Commander charts.
//
// Text is the Revised Edition's (Air, Land & Sea) and Spies, Lies & Supplies'
// card text. Each theater holds strengths 1–6: the 3 is the same flip in every
// theater (Maneuver in the base game, Manipulate in SLS), the 6 has no ability.
// A card is named by theater and strength ("Name a card" on Neutralize).

import type { AlsCardTemplate, AlsTheaterDef, AlsTheaterId } from './types';

// ---------- Theaters ----------

export const THEATER_DEFS: Record<AlsTheaterId, AlsTheaterDef> = {
  air: { id: 'air', name: 'Air', shortName: 'AIR' },
  land: { id: 'land', name: 'Land', shortName: 'LAND' },
  sea: { id: 'sea', name: 'Sea', shortName: 'SEA' },
  intel: { id: 'intel', name: 'Intelligence', shortName: 'INTEL', expansion: 'spiesLiesSupplies' },
  diplo: { id: 'diplo', name: 'Diplomacy', shortName: 'DIPLO', expansion: 'spiesLiesSupplies' },
  econ: { id: 'econ', name: 'Economics', shortName: 'ECON', expansion: 'spiesLiesSupplies' },
};

/** Lobby order: base first, then SLS. */
export const ALL_THEATER_IDS: AlsTheaterId[] = ['air', 'land', 'sea', 'intel', 'diplo', 'econ'];
export const BASE_THEATER_IDS: AlsTheaterId[] = ['air', 'land', 'sea'];
export const SLS_THEATER_IDS: AlsTheaterId[] = ['intel', 'diplo', 'econ'];

// ---------- Cards ----------

const MANEUVER_TEXT = 'Flip an uncovered card in an adjacent theater.';

type Row = Omit<AlsCardTemplate, 'id' | 'theater' | 'strength' | 'expansion'>;

/** Six rows per theater, strength 1..6 in order. */
const ROWS: Record<AlsTheaterId, Row[]> = {
  air: [
    { name: 'Support', ability: 'support', trigger: 'ongoing', text: 'You gain +3 strength in each adjacent theater.' },
    { name: 'Air Drop', ability: 'airDrop', trigger: 'instant', text: 'The next time you play a card, you may play it to a non-matching theater.' },
    { name: 'Maneuver', ability: 'maneuver', trigger: 'instant', text: MANEUVER_TEXT },
    { name: 'Aerodrome', ability: 'aerodrome', trigger: 'ongoing', text: 'You may play cards of strength 3 or less to non-matching theaters.' },
    { name: 'Containment', ability: 'containment', trigger: 'ongoing', text: 'If any player plays a facedown card, destroy that card.' },
    { name: 'Heavy Bombers', ability: null, trigger: null, text: '' },
  ],
  land: [
    { name: 'Reinforce', ability: 'reinforce', trigger: 'instant', text: 'Draw 1 card and play it facedown to an adjacent theater.' },
    { name: 'Ambush', ability: 'ambush', trigger: 'instant', text: 'Flip any uncovered card.' },
    { name: 'Maneuver', ability: 'maneuver', trigger: 'instant', text: MANEUVER_TEXT },
    { name: 'Cover Fire', ability: 'coverFire', trigger: 'ongoing', text: 'All cards covered by this card are now strength 4.' },
    { name: 'Disrupt', ability: 'disrupt', trigger: 'instant', text: 'Starting with you, both players choose and flip 1 of their uncovered cards.' },
    { name: 'Heavy Tanks', ability: null, trigger: null, text: '' },
  ],
  sea: [
    { name: 'Transport', ability: 'transport', trigger: 'instant', text: 'You may move 1 of your cards to a different theater.' },
    { name: 'Escalation', ability: 'escalation', trigger: 'ongoing', text: 'All of your facedown cards are now strength 4.' },
    { name: 'Maneuver', ability: 'maneuver', trigger: 'instant', text: MANEUVER_TEXT },
    { name: 'Redeploy', ability: 'redeploy', trigger: 'instant', text: 'You may return 1 of your facedown cards to your hand. If you do, play a card.' },
    { name: 'Blockade', ability: 'blockade', trigger: 'ongoing', text: 'If any player plays a card to an adjacent theater occupied by at least 3 other cards, destroy that card.' },
    { name: 'Super Battleship', ability: null, trigger: null, text: '' },
  ],
  intel: [
    { name: 'Incite', ability: 'incite', trigger: 'instant', text: "Use any uncovered card's instant ability as if it were on this card." },
    { name: 'Spy Network', ability: 'spyNetwork', trigger: 'ongoing', text: 'For each of your facedown cards in adjacent theaters, gain +3 strength in this theater.' },
    { name: 'Manipulate', ability: 'manipulate', trigger: 'instant', text: MANEUVER_TEXT },
    { name: 'Neutralize', ability: 'neutralize', trigger: 'instant', text: "Name a card. If it's in your enemy's hand, they must reveal it and play it facedown next time they play." },
    { name: 'Surveil', ability: 'surveil', trigger: 'instant', text: 'Your enemy must reveal a card. You may reveal a lower card to flip any uncovered faceup card.' },
    { name: 'Covert Operations', ability: null, trigger: null, text: '' },
  ],
  diplo: [
    { name: 'Relinquish', ability: 'relinquish', trigger: 'instant', text: 'You may destroy 1 of your other cards to destroy any uncovered card.' },
    { name: 'Envoy', ability: 'envoy', trigger: 'ongoing', text: 'After you play a card in an adjacent theater, you may move this card so that it covers that card.' },
    { name: 'Manipulate', ability: 'manipulate', trigger: 'instant', text: MANEUVER_TEXT },
    { name: 'Leverage', ability: 'leverage', trigger: 'instant', text: 'You may reveal a card to flip an uncovered card lower than or equal to your revealed card.' },
    { name: 'Give & Take', ability: 'giveAndTake', trigger: 'instant', text: 'Draw 1 card. Either give it to your enemy and draw another, or keep it and your enemy draws 1.' },
    { name: 'Grand Betrayal', ability: null, trigger: null, text: '' },
  ],
  econ: [
    { name: 'Retrofit', ability: 'retrofit', trigger: 'instant', text: "Choose 1 of your uncovered cards in any theater. Gain supplies in that theater equal to the chosen card's strength. Then, flip the card." },
    { name: 'Supply Lines', ability: 'supplyLines', trigger: 'ongoing', text: 'On your turn, you may play to a non-matching theater. If you do, your enemy gains 1 supply in that theater.' },
    { name: 'Manipulate', ability: 'manipulate', trigger: 'instant', text: MANEUVER_TEXT },
    { name: 'Requisition', ability: 'requisition', trigger: 'instant', text: "You may reveal a card to gain 2 supplies in that card's theater." },
    { name: 'Arms Race', ability: 'armsRace', trigger: 'instant', text: 'Gain 2 supplies in any theater. Then your enemy chooses a different theater and gains 2 supplies there.' },
    { name: 'Production Surge', ability: null, trigger: null, text: '' },
  ],
};

/** Every card, ids 0..35 in `ALL_THEATER_IDS` × strength order. */
export const CARD_TEMPLATES: readonly AlsCardTemplate[] = ALL_THEATER_IDS.flatMap((theater, t) =>
  ROWS[theater].map((row, i): AlsCardTemplate => ({
    id: t * 6 + i,
    theater,
    strength: i + 1,
    ...row,
    ...(THEATER_DEFS[theater].expansion ? { expansion: THEATER_DEFS[theater].expansion } : {}),
  })),
);

export function cardById(id: number): AlsCardTemplate {
  const c = CARD_TEMPLATES[id];
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
}

/** The card ids of the given theaters — a battle's deck. */
export function cardIdsForTheaters(theaters: readonly AlsTheaterId[]): number[] {
  const set = new Set(theaters);
  return CARD_TEMPLATES.filter((c) => set.has(c.theater)).map((c) => c.id);
}

/** "Air 4", "Diplomacy 2" — how a card is named. */
export function cardLabel(id: number): string {
  const c = cardById(id);
  return `${THEATER_DEFS[c.theater].name} ${c.strength}`;
}

// ---------- Constants ----------

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 2;
export const DEFAULT_TARGET_VP = 12;
export const FULL_BATTLE_VP = 6;

/** Hand size per battle: 6, or 10 in Epic Mode (5 theaters). */
export function handSizeFor(theaterCount: number): number {
  return theaterCount === 5 ? 10 : 6;
}

/** Supreme Commander withdraw charts: the withdrawing player's card, by cards
 *  left in their hand → VP the opponent scores. Rows are `minCards` thresholds,
 *  highest first. The Epic column is printed on the same cards. */
export interface WithdrawRow { minCards: number; vp: number }
export const WITHDRAW_CHARTS: Record<'standard' | 'epic', Record<'first' | 'second', WithdrawRow[]>> = {
  standard: {
    first: [{ minCards: 4, vp: 2 }, { minCards: 2, vp: 3 }, { minCards: 1, vp: 4 }, { minCards: 0, vp: 6 }],
    second: [{ minCards: 5, vp: 2 }, { minCards: 3, vp: 3 }, { minCards: 2, vp: 4 }, { minCards: 0, vp: 6 }],
  },
  epic: {
    first: [{ minCards: 6, vp: 2 }, { minCards: 3, vp: 3 }, { minCards: 1, vp: 4 }, { minCards: 0, vp: 6 }],
    second: [{ minCards: 7, vp: 2 }, { minCards: 4, vp: 3 }, { minCards: 2, vp: 4 }, { minCards: 0, vp: 6 }],
  },
};
