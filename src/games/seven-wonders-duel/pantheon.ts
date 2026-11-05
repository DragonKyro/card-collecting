// 7 Wonders Duel — Pantheon expansion data and helpers.
//
// Five Mythologies, three Divinities each, in face-down decks; the Gate is a
// sixteenth card that joins the Pantheon at the start of Age II, on the space
// left empty. Rules (per Board Game Arena's adaptation):
//
//   - Age I: 5 of the 10 Mythology tokens (2 per Mythology) lie on face-down
//     cards of the structure. Turning such a card up takes the token: draw the
//     top 2 Divinities of its Mythology, place one face down on an empty space
//     of the Pantheon (the opponent sees only its Mythology), the other back
//     on top of its deck.
//   - Age II: the Gate fills the empty space, every Divinity turns face up,
//     and the 3 Offering tokens (−2, −3, −4) lie on face-down Age II cards.
//   - From Age II, instead of taking a card a player may invoke a Divinity:
//     space 1…6 costs the first player 8…3 coins and the other player 3…8;
//     the Gate costs twice its space; Offering tokens (single use) and the
//     Sanctuary (−2) come off. Astarte's coins may be spent.

import type {
  DuelDivinity, DuelDivinityId, DuelMythology, DuelPlayer, DuelPlayerPantheon, DuelState,
} from './types';

export const MYTHOLOGIES: readonly { id: DuelMythology; name: string; color: string }[] = [
  { id: 'mesopotamian', name: 'Mesopotamian', color: '#3f8a4c' },
  { id: 'phoenician', name: 'Phoenician', color: '#d29a22' },
  { id: 'greek', name: 'Greek', color: '#3d70b0' },
  { id: 'egyptian', name: 'Egyptian', color: '#7d848a' },
  { id: 'roman', name: 'Roman', color: '#b23c32' },
];

export const MYTHOLOGY_IDS: readonly DuelMythology[] = MYTHOLOGIES.map((m) => m.id);

export function mythologyInfo(id: DuelMythology): { id: DuelMythology; name: string; color: string } {
  return MYTHOLOGIES.find((m) => m.id === id)!;
}

export const DIVINITIES: readonly DuelDivinity[] = [
  { id: 'enki', name: 'Enki', mythology: 'mesopotamian', description: 'When Enki turns face up, 2 Progress tokens from the box are put on it. Invoke: keep one; the other goes back to the box.' },
  { id: 'ishtar', name: 'Ishtar', mythology: 'mesopotamian', description: 'A science symbol: the scales, as on the Law token.' },
  { id: 'nisaba', name: 'Nisaba', mythology: 'mesopotamian', description: "Put the Snake on one of your opponent's green cards: Nisaba is worth that card's science symbol." },
  { id: 'astarte', name: 'Astarte', mythology: 'phoenician', description: 'Put 7 coins on Astarte: you may spend them, coin losses never touch them, and each one left is 1 VP at the end.' },
  { id: 'baal', name: 'Baal', mythology: 'phoenician', description: "Take a brown or gray card from your opponent's city into yours." },
  { id: 'tanit', name: 'Tanit', mythology: 'phoenician', description: 'Take 12 coins.' },
  { id: 'aphrodite', name: 'Aphrodite', mythology: 'greek', description: '9 VP.' },
  { id: 'hades', name: 'Hades', mythology: 'greek', description: 'Build any card from the discard pile for free.' },
  { id: 'zeus', name: 'Zeus', mythology: 'greek', description: 'Put any card of the structure (face up or face down) on the discard pile; you take any token on it.' },
  { id: 'anubis', name: 'Anubis', mythology: 'egyptian', description: 'Put the card under a built wonder (yours or your opponent\'s) on the discard pile: the wonder is unbuilt again (its instant effects stay) and can be rebuilt.' },
  { id: 'isis', name: 'Isis', mythology: 'egyptian', description: 'Build one of your wonders for free with a card from the discard pile.' },
  { id: 'ra', name: 'Ra', mythology: 'egyptian', description: "Take one of your opponent's unbuilt wonders." },
  { id: 'mars', name: 'Mars', mythology: 'roman', description: '2 shields.' },
  { id: 'minerva', name: 'Minerva', mythology: 'roman', description: "Put Minerva's pawn on a space of the military track: the conflict pawn stops before entering it, then Minerva leaves the game." },
  { id: 'neptune', name: 'Neptune', mythology: 'roman', description: 'Discard a military token without its effect, then apply the effect of another one.' },
  { id: 'gate', name: 'The Gate', mythology: null, description: 'Costs twice its space. Reveal the top Divinity of each Mythology deck and invoke one of them for free; the others go back on top.' },
];

const BY_ID = new Map(DIVINITIES.map((d) => [d.id, d]));

export function divinityById(id: DuelDivinityId): DuelDivinity {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown divinity: ${id}`);
  return d;
}

/** The three Divinities of a Mythology, in printed order. */
export function divinitiesOf(m: DuelMythology): DuelDivinityId[] {
  return DIVINITIES.filter((d) => d.mythology === m).map((d) => d.id);
}

/** Space 1…6 for the first player; the other player pays them the other way round. */
const SPACE_COSTS_FIRST = [8, 7, 6, 5, 4, 3];

/** Slots (index into the structure) holding the Age I Mythology / Age II
 *  Offering tokens, for the base and the Agora-sized structures. */
export const STRUCTURE_TOKEN_SLOTS: Record<'base' | 'agora', { 1: number[]; 2: number[] }> = {
  base: { 1: [2, 4, 9, 11, 13], 2: [6, 8, 10] },
  agora: { 1: [4, 6, 12, 14, 17], 2: [7, 9, 12] },
};

/** The Offering tokens' discounts. */
export const OFFERING_VALUES = [2, 3, 4];

export function emptyPlayerPantheon(): DuelPlayerPantheon {
  return { divinities: [], mythologyTokens: [], offeringTokens: [], astarteCoins: 0, snake: null };
}

/** True when the player's Sanctuary is built. */
export function hasSanctuary(p: DuelPlayer): boolean {
  return p.wonders.some((w) => w.built && w.wonderId === 'sanctuary');
}

/** A space's printed cost for a seat (the Gate's doubled), before discounts. */
export function spaceCost(state: DuelState, seat: 0 | 1, space: number): number {
  const base = seat === state.firstSeatIdx ? SPACE_COSTS_FIRST[space] : SPACE_COSTS_FIRST[5 - space];
  return state.pantheon?.spaces[space]?.divinity === 'gate' ? base * 2 : base;
}

/** What invoking the Divinity on `space` costs a seat with these Offering tokens. */
export function divinityCost(state: DuelState, seat: 0 | 1, space: number, offerings: readonly number[] = []): number {
  const p = state.players[seat];
  const off = offerings.reduce((a, b) => a + b, 0);
  return Math.max(0, spaceCost(state, seat, space) - (hasSanctuary(p) ? 2 : 0) - off);
}

/** Every distinct sub-multiset of the player's Offering tokens (the empty one first). */
export function offeringChoices(tokens: readonly number[]): number[][] {
  const sorted = tokens.slice().sort((a, b) => a - b);
  const out: number[][] = [[]];
  const seen = new Set<string>(['']);
  for (let mask = 1; mask < 1 << sorted.length; mask++) {
    const pick = sorted.filter((_, i) => mask & (1 << i));
    const key = pick.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pick);
  }
  return out;
}
