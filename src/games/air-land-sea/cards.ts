// Air, Land & Sea — card data + theater definitions.
//
// Base game: 18 cards = 3 theaters × 6 strengths (1-6).
// Spies, Lies, & Supplies: +18 cards = 3 more theaters × 6.
//
// Card-text fidelity notes
// ------------------------
// Research at planning time confirmed a handful of canonical assignments:
//   - Air 4 = Aerodrome (Ongoing: deploy 1-3 anywhere)
//   - Air 5 = Containment (Ongoing: face-down cards are immediately discarded)
//   - Air 6 = Heavy Bombers (no ability)
//   - Land 1 = Reinforce
//   - Land 2 = Ambush
//   - Land 6 = Heavy Tanks (no ability)
//   - Sea 6  = Super Battleship (no ability, standard "6 has no ability" rule)
// The remaining 11 strength-1..5 cards across the three theaters are best-effort
// assignments from public review text. The full ability dispatch system doesn't
// care which strength holds which ability — if the rulebook is in hand later,
// swap the assignment in CARD_TEMPLATES without touching anything else.
//
// SLS expansion (3 new theaters, 18 cards): the published rulebook's per-card
// text was not authoritatively available at planning time. Cards exist in the
// pool with strength 1-6 and PLACEHOLDER ability ids (`intel1` … `econ6`).
// Those abilities are NO-OPs in abilities.ts — the cards are otherwise legal
// to play and contribute their raw strength to scoring. Fill in the real
// effects once the rulebook is in hand without restructuring anything.

import type { AlsCardTemplate, AlsTheaterDef, AlsTheaterId } from './types';

// ---------- Theater definitions ----------

export const THEATER_DEFS: Record<AlsTheaterId, AlsTheaterDef> = {
  air:   { id: 'air',   name: 'Air',          shortName: 'AIR' },
  land:  { id: 'land',  name: 'Land',         shortName: 'LAND' },
  sea:   { id: 'sea',   name: 'Sea',          shortName: 'SEA' },
  intel: { id: 'intel', name: 'Intelligence', shortName: 'INTEL', expansion: 'spiesLiesSupplies' },
  diplo: { id: 'diplo', name: 'Diplomacy',    shortName: 'DIPLO', expansion: 'spiesLiesSupplies' },
  econ:  { id: 'econ',  name: 'Economics',    shortName: 'ECON',  expansion: 'spiesLiesSupplies' },
};

/** Stable order used by the lobby picker (base first, then SLS). */
export const ALL_THEATER_IDS: AlsTheaterId[] = ['air', 'land', 'sea', 'intel', 'diplo', 'econ'];

export const BASE_THEATER_IDS: AlsTheaterId[] = ['air', 'land', 'sea'];
export const SLS_THEATER_IDS: AlsTheaterId[]  = ['intel', 'diplo', 'econ'];

// ---------- Card templates ----------
//
// IDs are stable across the lifetime of a process — assigned sequentially below
// so that tests can refer to cards by id. The pool object is the source of truth
// at runtime (`state.deckPool`).

// Helper: build a card with the next id and return it. Local closure over `nextId`.
const CARDS: AlsCardTemplate[] = (() => {
  let nextId = 0;
  const out: AlsCardTemplate[] = [];
  const add = (c: Omit<AlsCardTemplate, 'id'>) => {
    out.push({ id: nextId++, ...c });
  };

  // --- Air (base) ---
  add({
    name: 'Support', theater: 'air', strength: 1,
    ability: 'support', trigger: 'ongoing',
    abilityText: 'Ongoing: each adjacent theater on your side gains +3 strength.',
  });
  add({
    name: 'Air Drop', theater: 'air', strength: 2,
    ability: 'airDrop', trigger: 'instant',
    abilityText: 'Instant: on your next turn, you may deploy a Battle card to a theater that doesn\'t match its type.',
  });
  add({
    name: 'Maneuver', theater: 'air', strength: 3,
    ability: 'maneuver', trigger: 'instant',
    abilityText: 'Instant: flip 1 Battle card in an adjacent theater.',
  });
  add({
    name: 'Aerodrome', theater: 'air', strength: 4,
    ability: 'aerodrome', trigger: 'ongoing',
    abilityText: 'Ongoing: you may deploy strength-1 to strength-3 Battle cards to any theater.',
  });
  add({
    name: 'Containment', theater: 'air', strength: 5,
    ability: 'containment', trigger: 'ongoing',
    abilityText: 'Ongoing: any face-down Battle card played by either player is immediately discarded.',
  });
  add({
    name: 'Heavy Bombers', theater: 'air', strength: 6,
    ability: 'heavyBombers', trigger: null,
    abilityText: 'No tactical ability.',
  });

  // --- Land (base) ---
  add({
    name: 'Reinforce', theater: 'land', strength: 1,
    ability: 'reinforce', trigger: 'instant',
    abilityText: 'Instant: look at the top card of the deck. You may play it face-down to any theater (becomes a wild strength-2 card).',
  });
  add({
    name: 'Ambush', theater: 'land', strength: 2,
    ability: 'ambush', trigger: 'instant',
    abilityText: 'Instant: flip 1 uncovered Battle card in any theater.',
  });
  add({
    name: 'Cover Fire', theater: 'land', strength: 3,
    ability: 'coverFire', trigger: 'ongoing',
    abilityText: 'Ongoing: each card beneath this card has strength 4.',
  });
  add({
    name: 'Disrupt', theater: 'land', strength: 4,
    ability: 'disrupt', trigger: 'instant',
    abilityText: 'Instant: your opponent flips 1 of their uncovered cards. Then you flip 1 of yours.',
  });
  add({
    name: 'Escalation', theater: 'land', strength: 5,
    ability: 'escalation', trigger: 'ongoing',
    abilityText: 'Ongoing: your face-down Battle cards have strength 4.',
  });
  add({
    name: 'Heavy Tanks', theater: 'land', strength: 6,
    ability: 'heavyTanks', trigger: null,
    abilityText: 'No tactical ability.',
  });

  // --- Sea (base) ---
  add({
    name: 'Transport', theater: 'sea', strength: 1,
    ability: 'transport', trigger: 'instant',
    abilityText: 'Instant: move 1 of your Battle cards to a different theater. (Does not trigger when placed.)',
  });
  add({
    name: 'Redeploy', theater: 'sea', strength: 2,
    ability: 'redeploy', trigger: 'instant',
    abilityText: 'Instant: return 1 of your face-down Battle cards to your hand. Take another turn.',
  });
  add({
    name: 'Blockade', theater: 'sea', strength: 3,
    ability: 'blockade', trigger: 'ongoing',
    abilityText: 'Ongoing: if your opponent plays a Battle card to a theater adjacent to this one which then contains 3+ of their cards, that newly played card is discarded.',
  });
  add({
    name: 'Investigation', theater: 'sea', strength: 4,
    ability: 'transportSea', trigger: 'instant',
    abilityText: 'Instant: move 1 of your Battle cards to a different theater. (Sea variant — same effect as Transport.)',
  });
  add({
    name: 'Salvage', theater: 'sea', strength: 5,
    ability: 'coverFireSea', trigger: 'ongoing',
    abilityText: 'Ongoing: each card beneath this card has strength 4. (Sea variant — same effect as Cover Fire.)',
  });
  add({
    name: 'Super Battleship', theater: 'sea', strength: 6,
    ability: 'superBattleship', trigger: null,
    abilityText: 'No tactical ability.',
  });

  // --- Spies, Lies, & Supplies — Intelligence ---
  add({
    name: 'Intel 1', theater: 'intel', strength: 1, ability: 'intel1', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 1.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Intel 2', theater: 'intel', strength: 2, ability: 'intel2', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 2.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Intel 3', theater: 'intel', strength: 3, ability: 'intel3', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 3.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Intel 4', theater: 'intel', strength: 4, ability: 'intel4', trigger: 'ongoing',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 4.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Intel 5', theater: 'intel', strength: 5, ability: 'intel5', trigger: 'ongoing',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 5.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Intel 6', theater: 'intel', strength: 6, ability: 'intel6', trigger: null,
    abilityText: 'Spies, Lies, & Supplies — no ability (six-strength card).',
    expansion: 'spiesLiesSupplies',
  });

  // --- Diplomacy ---
  add({
    name: 'Diplo 1', theater: 'diplo', strength: 1, ability: 'diplo1', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 1.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Diplo 2', theater: 'diplo', strength: 2, ability: 'diplo2', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 2.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Diplo 3', theater: 'diplo', strength: 3, ability: 'diplo3', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 3.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Diplo 4', theater: 'diplo', strength: 4, ability: 'diplo4', trigger: 'ongoing',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 4.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Diplo 5', theater: 'diplo', strength: 5, ability: 'diplo5', trigger: 'ongoing',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 5.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Diplo 6', theater: 'diplo', strength: 6, ability: 'diplo6', trigger: null,
    abilityText: 'Spies, Lies, & Supplies — no ability (six-strength card).',
    expansion: 'spiesLiesSupplies',
  });

  // --- Economics ---
  add({
    name: 'Econ 1', theater: 'econ', strength: 1, ability: 'econ1', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 1.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Econ 2', theater: 'econ', strength: 2, ability: 'econ2', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 2.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Econ 3', theater: 'econ', strength: 3, ability: 'econ3', trigger: 'instant',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 3.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Econ 4', theater: 'econ', strength: 4, ability: 'econ4', trigger: 'ongoing',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 4.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Econ 5', theater: 'econ', strength: 5, ability: 'econ5', trigger: 'ongoing',
    abilityText: 'Spies, Lies, & Supplies — not yet modeled. Card plays normally with strength 5.',
    expansion: 'spiesLiesSupplies',
  });
  add({
    name: 'Econ 6', theater: 'econ', strength: 6, ability: 'econ6', trigger: null,
    abilityText: 'Spies, Lies, & Supplies — no ability (six-strength card).',
    expansion: 'spiesLiesSupplies',
  });

  return out;
})();

export const CARD_TEMPLATES: readonly AlsCardTemplate[] = CARDS;

/** Lookup pool indexed by id. */
export const CARDS_BY_ID: Record<number, AlsCardTemplate> = Object.fromEntries(
  CARDS.map((c) => [c.id, c]),
);

/** All card ids whose theater is in `theaters`. */
export function cardIdsForTheaters(theaters: AlsTheaterId[]): number[] {
  const set = new Set(theaters);
  return CARDS.filter((c) => set.has(c.theater)).map((c) => c.id);
}

/** Build the card pool object that `state.deckPool` references. The pool
 *  contains ONLY the cards for the chosen theaters — saves memory on the wire
 *  and avoids accidentally pulling an SLS card into a base-only deck. */
export function buildDeckPool(theaters: AlsTheaterId[]): Record<number, AlsCardTemplate> {
  const ids = cardIdsForTheaters(theaters);
  const pool: Record<number, AlsCardTemplate> = {};
  for (const id of ids) pool[id] = CARDS_BY_ID[id];
  return pool;
}

// ---------- Constants ----------

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 2;

/** Hand size per battle. Base game = 6; Epic (5 theaters) = 9 per rulebook. */
export function handSizeFor(theaterCount: number): number {
  return theaterCount === 5 ? 9 : 6;
}

/** Match target VP. 12 per rulebook. */
export const DEFAULT_TARGET_VP = 12;
