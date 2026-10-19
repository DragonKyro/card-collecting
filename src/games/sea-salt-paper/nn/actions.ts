// Sea Salt & Paper — fixed action slots for a policy network (action space v3).
//
// Every legal SspAction maps to one of NUM_SLOTS slots. A slot names a
// DECISION, not a physical card: "play a crab pair", "keep card 0 and
// discard to pile 1", "take the teal crab". Wherever the choice of card
// changes the game, the slot names it down to the colour:
//
//   crab:<kind>    take a card of that family and colour from the pile being
//                  looked through — a copy beneath the top if there is one
//                  (the deepest, so the cards about to be exposed stay put),
//                  else the top itself;
//   crab:top       take the top even though a twin lies beneath it (taking
//                  the top exposes the next card; digging the twin doesn't);
//   lobster:<kind> keep that card from the lobster reveal.
//
// Pair and trio plays are by family. Which copies go to the table never
// changes the score (colours count the same in hand and on the table), so
// `decodeSlot` plays the copies the opponents already know about first and
// keeps the unknown ones hidden.
//
// A crab pick is TWO decisions, as in the rulebook: choose a pile from
// memory (`crabPile:N` → a CrabLook, not a reducer action), then — observing
// again with `crabLookPile` set, which reveals that pile — choose a card in
// it. Masking crab picks by the real pile contents up front would leak cards
// an opponent dug out unseen.
//
// The mask, decoder and inverse are all functions of SspObservation only.
// actions.test.ts checks them against the reducer: every action the reducer
// accepts lands on masked-in slots, and every masked-in slot decodes to an
// action the reducer accepts.

import type { SspAction, SspCard, SspCardFamily } from '../types';
import { DUO_PAIRS, FAMILY_ORDER } from '../cards';
import { FAMILY_INDEX, type SspObservation } from './observation';
import { KINDS, kindIndex, kindName } from './kinds';

/** Bump when slots are added, removed or reordered — trained weights are tied to it. */
export const ACTION_SPACE_VERSION = 3;

/** First half of a crab pick: look through this pile. Not a reducer action. */
export interface CrabLook {
  type: 'crabLook';
  pile: 0 | 1;
}

export type SlotDecision = SspAction | CrabLook;

/** A versioned slot layout; a policy file names the one it was trained with. */
export interface SspActionSpace {
  version: number;
  numSlots: number;
  slotNames: readonly string[];
  legalMask(obs: SspObservation): Uint8Array;
  /** Turn a masked-in slot into a reducer action (or a CrabLook). */
  decodeSlot(obs: SspObservation, slot: number): SlotDecision;
  /** Inverse of decodeSlot; -1 for decisions about cards the viewer can't see. */
  slotForAction(obs: SspObservation, action: SlotDecision): number;
}

/** Up to 4 players → up to 3 opponents to steal from. */
const MAX_OPPONENTS = 3;

const names: string[] = [];
const slot = (name: string): number => names.push(name) - 1;

export const SLOT_DRAW_PAIR = slot('drawPair');
export const SLOT_DRAW_DISCARD = [slot('drawDiscard:0'), slot('drawDiscard:1')] as const;
/** [keepIndex][discardToPile] */
export const SLOT_KEEP = [
  [slot('keep:0>pile0'), slot('keep:0>pile1')],
  [slot('keep:1>pile0'), slot('keep:1>pile1')],
] as const;
/** Indexed like DUO_PAIRS. */
export const SLOT_PLAY_PAIR = DUO_PAIRS.map(([a, b]) => slot(`pair:${a}+${b}`));
export const SLOT_PLAY_TRIO = DUO_PAIRS.map(([a, b]) => slot(`trio:${a}+${b}+starfish`));
export const SLOT_STOP = slot('stop');
export const SLOT_LAST_CHANCE = slot('lastChance');
export const SLOT_PASS = slot('pass');
/** [pile] — choose which pile to dig through. */
export const SLOT_CRAB_PILE = [slot('crabPile:0'), slot('crabPile:1')] as const;
/** Take the top of the pile being looked through although a twin lies beneath it. */
export const SLOT_CRAB_TOP = slot('crab:top');
/** [kind index] — the card to take from the pile being looked through. */
export const SLOT_CRAB_PICK = KINDS.map((k) => slot(`crab:${kindName(k)}`));
/** [seat offset − 1] */
export const SLOT_SHARK_STEAL = Array.from({ length: MAX_OPPONENTS }, (_, i) => slot(`steal:+${i + 1}`));
/** [kind index] */
export const SLOT_LOBSTER_PICK = KINDS.map((k) => slot(`lobster:${kindName(k)}`));
export const SLOT_NEXT_ROUND = slot('nextRound');

export const NUM_SLOTS = names.length;
export const SLOT_NAMES: readonly string[] = names;

/** Family multiset of a card list, indexed by FAMILY_ORDER. */
function familyCounts(cards: SspCard[]): number[] {
  const out = new Array<number>(FAMILY_ORDER.length).fill(0);
  for (const c of cards) out[FAMILY_INDEX[c.family]] += 1;
  return out;
}

/** Can a hand with these family counts supply the pair DUO_PAIRS[t]? */
function canFormPair(counts: number[], t: number): boolean {
  const [a, b] = DUO_PAIRS[t];
  const ia = FAMILY_INDEX[a];
  const ib = FAMILY_INDEX[b];
  return a === b ? counts[ia] >= 2 : counts[ia] >= 1 && counts[ib] >= 1;
}

export function legalMask(obs: SspObservation): Uint8Array {
  const mask = new Uint8Array(NUM_SLOTS);
  if (obs.phase !== 'playing') return mask;
  if (obs.subPhase === 'roundEnd') {
    mask[SLOT_NEXT_ROUND] = 1;
    return mask;
  }
  if (obs.activeOffset !== 0) return mask;

  const locked = obs.players[0].locked;
  switch (obs.subPhase) {
    case 'awaitingAction':
      mask[SLOT_DRAW_PAIR] = 1;
      if (!locked) {
        for (const p of [0, 1] as const) {
          if (obs.piles[p].size > 0) mask[SLOT_DRAW_DISCARD[p]] = 1;
        }
      }
      break;

    case 'awaitingKeep': {
      if (obs.pendingDraw.length !== 2) break;
      const forced = forcedDiscardPile(obs);
      for (const k of [0, 1] as const) {
        for (const p of [0, 1] as const) {
          if (forced === null || forced === p) mask[SLOT_KEEP[k][p]] = 1;
        }
      }
      break;
    }

    case 'awaitingPlayOrEnd': {
      if (!locked) {
        const counts = familyCounts(obs.hand);
        const starfish = counts[FAMILY_INDEX.starfish] >= 1;
        for (let t = 0; t < DUO_PAIRS.length; t++) {
          if (!canFormPair(counts, t)) continue;
          mask[SLOT_PLAY_PAIR[t]] = 1;
          if (starfish) mask[SLOT_PLAY_TRIO[t]] = 1;
        }
      }
      if (obs.canStop) mask[SLOT_STOP] = 1;
      if (obs.canLastChance) mask[SLOT_LAST_CHANCE] = 1;
      mask[SLOT_PASS] = 1;
      break;
    }

    case 'awaitingCrabPick':
      if (obs.crabLookPile === null) {
        for (const p of [0, 1] as const) if (obs.piles[p].size > 0) mask[SLOT_CRAB_PILE[p]] = 1;
      } else {
        const pile = obs.piles[obs.crabLookPile];
        for (const c of pile.buried) mask[SLOT_CRAB_PICK[kindIndex(c)]] = 1;
        if (pile.top) {
          const k = kindIndex(pile.top);
          if (mask[SLOT_CRAB_PICK[k]]) mask[SLOT_CRAB_TOP] = 1;
          else mask[SLOT_CRAB_PICK[k]] = 1;
        }
      }
      break;

    case 'awaitingSharkSteal':
      for (let off = 1; off < obs.players.length && off <= MAX_OPPONENTS; off++) {
        if (obs.players[off].handSize > 0 && obs.lastChanceOffset !== off) {
          mask[SLOT_SHARK_STEAL[off - 1]] = 1;
        }
      }
      break;

    case 'awaitingLobsterPick':
      for (const c of obs.lobsterReveal) mask[SLOT_LOBSTER_PICK[kindIndex(c)]] = 1;
      break;

    default:
      break;
  }
  return mask;
}

/** Rulebook: while exactly one discard pile is empty, the un-kept card must
 *  go there. Returns that pile, or null when the player may choose. */
function forcedDiscardPile(obs: SspObservation): 0 | 1 | null {
  const [n0, n1] = [obs.piles[0].size, obs.piles[1].size];
  if (n0 === 0 && n1 > 0) return 0;
  if (n1 === 0 && n0 > 0) return 1;
  return null;
}

/** Turn a masked-in slot into a reducer action (or a CrabLook). Throws on a
 *  slot that isn't legal for this observation. */
export function decodeSlot(obs: SspObservation, s: number): SlotDecision {
  const mask = legalMask(obs);
  if (!(s >= 0 && s < NUM_SLOTS) || !mask[s]) {
    throw new Error(`decodeSlot: slot ${s} (${SLOT_NAMES[s] ?? '?'}) is not legal in ${obs.subPhase}`);
  }

  if (s === SLOT_DRAW_PAIR) return { type: 'drawPair' };
  if (s === SLOT_STOP) return { type: 'stop' };
  if (s === SLOT_LAST_CHANCE) return { type: 'lastChance' };
  if (s === SLOT_PASS) return { type: 'pass' };
  if (s === SLOT_NEXT_ROUND) return { type: 'nextRound' };

  for (const p of [0, 1] as const) {
    if (s === SLOT_DRAW_DISCARD[p]) return { type: 'drawFromDiscard', pile: p };
  }
  for (const k of [0, 1] as const) {
    for (const p of [0, 1] as const) {
      if (s === SLOT_KEEP[k][p]) return { type: 'keepFromDraw', keepIndex: k, discardToPile: p };
    }
  }

  const pairT = SLOT_PLAY_PAIR.indexOf(s);
  if (pairT !== -1) {
    const [a, b] = pickPairCards(obs, pairT);
    return { type: 'playPair', cardIds: [a.id, b.id] };
  }
  const trioT = SLOT_PLAY_TRIO.indexOf(s);
  if (trioT !== -1) {
    const [a, b] = pickPairCards(obs, trioT);
    const star = exposedFirst(obs).find((c) => c.family === 'starfish')!;
    return { type: 'playTrio', cardIds: [a.id, b.id, star.id] };
  }

  for (const p of [0, 1] as const) {
    if (s === SLOT_CRAB_PILE[p]) return { type: 'crabLook', pile: p };
  }
  if (obs.crabLookPile !== null) {
    const pile = obs.piles[obs.crabLookPile];
    if (s === SLOT_CRAB_TOP) return { type: 'crabPick', pile: obs.crabLookPile, cardId: pile.top!.id };
    const k = SLOT_CRAB_PICK.indexOf(s);
    if (k !== -1) {
      // `buried` is bottom first, so this is the deepest copy beneath the top.
      const card = pile.buried.find((c) => kindIndex(c) === k) ?? pile.top!;
      return { type: 'crabPick', pile: obs.crabLookPile, cardId: card.id };
    }
  }

  const stealOff = SLOT_SHARK_STEAL.indexOf(s);
  if (stealOff !== -1) {
    return { type: 'sharkSteal', targetPlayerId: obs.players[stealOff + 1].id };
  }

  const lobsterK = SLOT_LOBSTER_PICK.indexOf(s);
  if (lobsterK !== -1) {
    const card = obs.lobsterReveal.find((c) => kindIndex(c) === lobsterK)!;
    return { type: 'lobsterPick', cardId: card.id };
  }

  throw new Error(`decodeSlot: unhandled slot ${s}`);
}

/** The hand with the cards the opponents already know about first (hand
 *  order otherwise) — the order pair and trio plays take cards in. */
function exposedFirst(obs: SspObservation): SspCard[] {
  const known = new Set(obs.players[0].knownCards.map((c) => c.id));
  return [...obs.hand].sort((a, b) => Number(known.has(b.id)) - Number(known.has(a.id)));
}

/** Cards forming DUO_PAIRS[t]. Caller has checked the mask. */
function pickPairCards(obs: SspObservation, t: number): [SspCard, SspCard] {
  const [fa, fb] = DUO_PAIRS[t];
  const hand = exposedFirst(obs);
  const a = hand.find((c) => c.family === fa)!;
  const b = hand.find((c) => c.family === fb && c.id !== a.id)!;
  return [a, b];
}

/** Inverse of decodeSlot: which slot does this decision belong to? A
 *  crabPick maps to its pile slot until the observation is looking through
 *  that pile, then to its card slot. Returns -1 for decisions that don't
 *  refer to cards the viewer can see. Used by tests and for labelling another
 *  agent's moves (behaviour cloning). */
export function slotForAction(obs: SspObservation, action: SlotDecision): number {
  switch (action.type) {
    case 'drawPair': return SLOT_DRAW_PAIR;
    case 'drawFromDiscard': return SLOT_DRAW_DISCARD[action.pile];
    case 'keepFromDraw': return SLOT_KEEP[action.keepIndex][action.discardToPile];
    case 'stop': return SLOT_STOP;
    case 'lastChance': return SLOT_LAST_CHANCE;
    case 'pass': return SLOT_PASS;
    case 'nextRound': return SLOT_NEXT_ROUND;
    case 'playPair': {
      const cards = action.cardIds.map((id) => obs.hand.find((c) => c.id === id));
      if (cards.some((c) => !c)) return -1;
      const t = pairTypeOf(cards[0]!.family, cards[1]!.family);
      return t === -1 ? -1 : SLOT_PLAY_PAIR[t];
    }
    case 'playTrio': {
      const cards = action.cardIds.map((id) => obs.hand.find((c) => c.id === id));
      if (cards.some((c) => !c)) return -1;
      const starAt = cards.findIndex((c) => c!.family === 'starfish');
      if (starAt === -1) return -1;
      const rest = cards.filter((_, i) => i !== starAt);
      const t = pairTypeOf(rest[0]!.family, rest[1]!.family);
      return t === -1 ? -1 : SLOT_PLAY_TRIO[t];
    }
    case 'crabLook':
      return SLOT_CRAB_PILE[action.pile];
    case 'crabPick': {
      if (obs.crabLookPile === null) return SLOT_CRAB_PILE[action.pile];
      if (obs.crabLookPile !== action.pile) return -1;
      const pile = obs.piles[action.pile];
      if (pile.top?.id === action.cardId) {
        const k = kindIndex(pile.top);
        return pile.buried.some((c) => kindIndex(c) === k) ? SLOT_CRAB_TOP : SLOT_CRAB_PICK[k];
      }
      const card = pile.buried.find((c) => c.id === action.cardId);
      return card ? SLOT_CRAB_PICK[kindIndex(card)] : -1;
    }
    case 'sharkSteal': {
      const off = obs.players.findIndex((p) => p.id === action.targetPlayerId);
      return off >= 1 && off <= MAX_OPPONENTS ? SLOT_SHARK_STEAL[off - 1] : -1;
    }
    case 'lobsterPick': {
      const card = obs.lobsterReveal.find((c) => c.id === action.cardId);
      return card ? SLOT_LOBSTER_PICK[kindIndex(card)] : -1;
    }
  }
}

function pairTypeOf(a: SspCardFamily, b: SspCardFamily): number {
  return DUO_PAIRS.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** The current action space, in the shape policy.ts dispatches on. */
export const SSP_ACTIONS: SspActionSpace = {
  version: ACTION_SPACE_VERSION, numSlots: NUM_SLOTS, slotNames: SLOT_NAMES, legalMask, decodeSlot, slotForAction,
};
