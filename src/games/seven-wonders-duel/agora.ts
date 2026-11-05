// 7 Wonders Duel — Agora expansion data and Senate helpers.
//
// The Senate: 6 Chambers in three sections (left 1–2, centre 3–4, right
// 5–6). A Chamber is controlled by whoever has more Influence cubes in it (a
// tie: nobody) and its controller benefits from the Decree(s) in it. Six of
// the 16 Decrees are dealt, one per Chamber; those of Chambers 2, 4 and 6
// lie face down until someone first controls the Chamber. Controlling all 6
// Chambers wins at once (Political Supremacy); at the end a Chamber is worth
// 1 / 2 / 3 / 3 / 2 / 1 VP to its controller.
//
// Rules per Board Game Arena's adaptation (Decree texts from its material).

import type {
  DuelAgoraState, DuelConspiracyId, DuelDecreeId, DuelPlayerAgora, DuelState,
} from './types';

export const CHAMBER_COUNT = 6;
export const CUBES_PER_PLAYER = 12;
/** VP for controlling Chamber 1…6 at the end. */
export const CHAMBER_VP = [1, 2, 3, 3, 2, 1];

export interface DuelDecree { id: DuelDecreeId; name: string; description: string }

export const DECREES: readonly DuelDecree[] = [
  { id: 'blueCoins', name: 'Civic Tax', description: 'Whenever you or your opponent builds a blue card, take as many coins as the current Age.' },
  { id: 'greenCoins', name: 'Scholars\' Tax', description: 'Whenever you or your opponent builds a green card, take as many coins as the current Age.' },
  { id: 'yellowCoins', name: 'Market Tax', description: 'Whenever you or your opponent builds a yellow card, take as many coins as the current Age.' },
  { id: 'redCoins', name: 'War Tax', description: 'Whenever you or your opponent builds a red card, take as many coins as the current Age.' },
  { id: 'yellowRebate', name: 'Trade Charter', description: 'Ignore 1 cost symbol (a resource, or the coins) when you build a yellow card.' },
  { id: 'redRebate', name: 'Arms Charter', description: 'Ignore 1 cost symbol (a resource, or the coins) when you build a red card.' },
  { id: 'greenRebate', name: 'Academy Charter', description: 'Ignore 1 cost symbol (a resource, or the coins) when you build a green card.' },
  { id: 'wonderRebate', name: 'Builders\' Charter', description: 'Your wonders cost 1 resource less (your choice).' },
  { id: 'militaryDecree', name: 'Levy', description: 'Gaining this Chamber moves the conflict pawn a space toward your opponent; losing it moves it a space back.' },
  { id: 'rawTrade', name: 'Quarry Rights', description: 'Each brown resource you buy costs you 1 coin less (never less than 1).' },
  { id: 'goodsTrade', name: 'Workshop Rights', description: 'Each gray resource you buy costs you 1 coin less (never less than 1).' },
  { id: 'senateBoost', name: 'Majority', description: 'Count 2 more blue cards when working out your Senate actions.' },
  { id: 'discardBonus', name: 'Salvage Rights', description: 'Take 2 more coins when you discard a card.' },
  { id: 'wonderCoins', name: 'Monument Tax', description: 'Whenever you or your opponent builds a wonder, take as many coins as the current Age.' },
  { id: 'sharedChains', name: 'Common Heritage', description: "Chains work from your opponent's cards as if they were yours." },
  { id: 'conspiratorReplay', name: 'Secret Society', description: 'When you recruit a Conspirator, play again.' },
];

export interface DuelConspiracy { id: DuelConspiracyId; name: string; description: string }

export const CONSPIRACIES: readonly DuelConspiracy[] = [
  { id: 'extortion', name: 'Extortion', description: "Take one of your opponent's unbuilt wonders. Then you may move one of your cubes." },
  { id: 'blackmail', name: 'Blackmail', description: "Take half your opponent's coins (rounded up). Then you may move one of your cubes." },
  { id: 'expropriation', name: 'Expropriation', description: "Put one of your opponent's blue cards on the discard pile. Then you may move one of your cubes." },
  { id: 'swindle', name: 'Swindle', description: "Put one of your opponent's yellow cards on the discard pile. Then you may move one of your cubes." },
  { id: 'obscurantism', name: 'Obscurantism', description: "Lock away a Progress token — from the board, your opponent's or the box — for the rest of the game." },
  { id: 'coup', name: 'Coup', description: '2 shields.' },
  { id: 'propertyFraud', name: 'Property Fraud', description: 'Build for free a card from the back row of the structure (not a Senator).' },
  { id: 'treason', name: 'Treason', description: 'Build for free one of the cards returned to the box unseen (3 per Age so far).' },
  { id: 'politicalManeuver', name: 'Political Maneuver', description: "Place one of your cubes, remove one of your opponent's, then you may move one of yours." },
  { id: 'espionage', name: 'Espionage', description: 'Look at every Progress token in the box and take one.' },
  { id: 'turnOfEvents', name: 'Turn of Events', description: 'Put an accessible card of the structure on the discard pile, and you may do it again. Then you may move one of your cubes.' },
  { id: 'embezzlement', name: 'Embezzlement', description: 'Take a coin per cube you have in the Senate; your opponent loses a coin per cube they have there.' },
  { id: 'foreclosure', name: 'Foreclosure', description: "Take a brown or gray card from your opponent's city into yours." },
  { id: 'coercion', name: 'Coercion', description: "Take one of your opponent's blue or green cards and give them one of yours of the same colour. Then you may move one of your cubes." },
  { id: 'insiderInfluence', name: 'Insider Influence', description: 'Move a Decree to another Chamber, under the Decree there. Then you may move one of your cubes.' },
  { id: 'sabotage', name: 'Sabotage', description: "Return one of your opponent's built wonders to the box (its card goes to the discard pile)." },
];

const DECREE_BY_ID = new Map(DECREES.map((d) => [d.id, d]));
const CONSPIRACY_BY_ID = new Map(CONSPIRACIES.map((c) => [c.id, c]));

export function decreeById(id: DuelDecreeId): DuelDecree {
  const d = DECREE_BY_ID.get(id);
  if (!d) throw new Error(`Unknown decree: ${id}`);
  return d;
}

export function conspiracyById(id: DuelConspiracyId): DuelConspiracy {
  const c = CONSPIRACY_BY_ID.get(id);
  if (!c) throw new Error(`Unknown conspiracy: ${id}`);
  return c;
}

export function emptyPlayerAgora(): DuelPlayerAgora {
  return { cubes: CUBES_PER_PLAYER, conspiracies: [] };
}

/** The two Chambers (0-based) of a Politician's section 1–3. */
export function sectionChambers(section: 1 | 2 | 3): [number, number] {
  return [2 * section - 2, 2 * section - 1];
}

/** The section (1–3) a Chamber (0-based) belongs to. */
export function chamberSection(chamber: number): 1 | 2 | 3 {
  return (Math.floor(chamber / 2) + 1) as 1 | 2 | 3;
}

/** Who controls a Chamber (0-based): more cubes; a tie is nobody. */
export function chamberController(ag: DuelAgoraState, chamber: number): 0 | 1 | null {
  const [a, b] = ag.chambers[chamber];
  return a === b ? null : a > b ? 0 : 1;
}

export function chambersControlled(ag: DuelAgoraState, seat: 0 | 1): number {
  let n = 0;
  for (let c = 0; c < CHAMBER_COUNT; c++) if (chamberController(ag, c) === seat) n++;
  return n;
}

export function cubesInSenate(ag: DuelAgoraState, seat: 0 | 1): number {
  return ag.chambers.reduce((n, ch) => n + ch[seat], 0);
}

/** The Chamber (0-based) holding a Decree, or null when it is not on the board. */
export function decreeChamber(ag: DuelAgoraState, id: DuelDecreeId): number | null {
  const c = ag.decrees.findIndex((ds) => ds.some((d) => d.id === id));
  return c < 0 ? null : c;
}

/** True when the seat controls the Chamber of this Decree. */
export function hasDecree(state: DuelState, seat: 0 | 1, id: DuelDecreeId): boolean {
  const ag = state.agora;
  if (!ag) return false;
  const c = decreeChamber(ag, id);
  return c !== null && chamberController(ag, c) === seat;
}

/** The seat controlling a Decree, or null. */
export function decreeHolder(state: DuelState, id: DuelDecreeId): 0 | 1 | null {
  if (hasDecree(state, 0, id)) return 0;
  if (hasDecree(state, 1, id)) return 1;
  return null;
}

/** Senate actions a Politician gives: 1 for 0–1 blue cards, 2 for 2–3, 3 for 4+
 *  (the Majority Decree counts 2 more). */
export function senateActionCount(state: DuelState, seat: 0 | 1): number {
  const blue = state.players[seat].tableau.filter((c) => c.color === 'blue').length
    + (hasDecree(state, seat, 'senateBoost') ? 2 : 0);
  return blue <= 1 ? 1 : blue <= 3 ? 2 : 3;
}

/** Chamber VP a seat scores now. */
export function senateVps(ag: DuelAgoraState, seat: 0 | 1): number {
  let v = 0;
  for (let c = 0; c < CHAMBER_COUNT; c++) if (chamberController(ag, c) === seat) v += CHAMBER_VP[c];
  return v;
}
