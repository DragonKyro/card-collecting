// Sea Salt & Paper — fixed action slots for a policy network.
//
// Every legal SspAction maps to one of NUM_SLOTS slots. A slot names a
// DECISION, not a physical card: "play a crab pair", "keep card 0 and
// discard to pile 1". Which physical card carries out the decision is a
// deterministic tie-break in `decodeSlot` (pairs take the first matching
// cards in hand; crab / lobster / Water Rodeo takes take the copy whose
// colour the viewer already holds most of, so mermaid claims and the colour
// bonus never lose; cards given away are the copy of the colour held least).
//
// Two decisions come in two steps, each step a policy call:
//   - a crab pick: choose a pile from memory (`crabPile:N` → a CrabLook, not a
//     reducer action), then — observing again with `crabLookPile` set, which
//     reveals that pile — a family in it (`crab:<family>` → crabPick). Masking
//     crab picks by the real pile contents up front would leak cards an
//     opponent dug out unseen.
//   - a Water Rodeo swap: choose the kind of card to take from the hand being
//     looked at (`rodeoTake:<family>` → a RodeoTake), then — observing again
//     with `rodeoTake` set — the kind to give (`rodeoGive:<family>` →
//     rodeoSwap). `rodeoSwap:none` keeps both hands as they are.
//
// v3 appended the Extra Pepper slots after all of v2's, leaving v2's in
// place: a v2 network is a v3 one with new output rows (training/ssp/upgrade.py).
//
// The mask, decoder and inverse are all functions of SspObservation only.
// actions.test.ts checks them against the reducer: every action the reducer
// accepts lands on masked-in slots, and every masked-in slot decodes to an
// action the reducer accepts.

import type { SspAction, SspCard, SspCardFamily } from '../types';
import { DUO_PAIRS, FAMILY_ORDER, PAIR_TYPES, RODEO_PAIRS, pairTypeIndex } from '../cards';
import { tablePairs } from '../scoring';
import { FAMILY_INDEX, pileCards, type SspObservation } from './observation';

/** Bump when slots are added, removed or reordered — trained weights are tied to it. */
export const ACTION_SPACE_VERSION = 3;

/** Slot count of action space v2 — v3's first slots, unchanged. */
export const V2_NUM_SLOTS = 66;

/** First half of a crab pick: look through this pile. Not a reducer action. */
export interface CrabLook {
  type: 'crabLook';
  pile: 0 | 1;
}

/** First half of a Water Rodeo swap: take a card of this kind. Not a reducer action. */
export interface RodeoTake {
  type: 'rodeoTake';
  family: SspCardFamily;
}

export type SlotDecision = SspAction | CrabLook | RodeoTake;

/** Up to 4 players → up to 3 opponents to steal from. */
const MAX_OPPONENTS = 3;

const names: string[] = [];
const slot = (name: string): number => names.push(name) - 1;
const perOpponent = <T>(make: (off: number) => T): T[] => Array.from({ length: MAX_OPPONENTS }, (_, i) => make(i + 1));

// ---- action space v2 ----
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
/** [family index] — the card to take from the pile being looked through. */
export const SLOT_CRAB_PICK = FAMILY_ORDER.map((f) => slot(`crab:${f}`));
/** [seat offset − 1] */
export const SLOT_SHARK_STEAL = perOpponent((off) => slot(`steal:+${off}`));
/** [family index] */
export const SLOT_LOBSTER_PICK = FAMILY_ORDER.map((f) => slot(`lobster:${f}`));
export const SLOT_NEXT_ROUND = slot('nextRound');

// ---- action space v3: Extra Pepper ----
/** Indexed like RODEO_PAIRS (The Water Rodeo's two swimmers / two sharks). */
export const SLOT_RODEO_PAIR = RODEO_PAIRS.map(([a, b]) => slot(`pair:${a}+${b}`));
export const SLOT_RODEO_TRIO = RODEO_PAIRS.map(([a, b]) => slot(`trio:${a}+${b}+starfish`));
/** The Coral Reef: place a shell face down. */
export const SLOT_CORAL = slot('coral:place');
/** [seat offset − 1] — whose hand the swimmer pair looks at. */
export const SLOT_RODEO_LOOK = perOpponent((off) => slot(`rodeoLook:+${off}`));
/** [family index] — the kind of card to take from the hand looked at. */
export const SLOT_RODEO_TAKE = FAMILY_ORDER.map((f) => slot(`rodeoTake:${f}`));
export const SLOT_RODEO_NO_SWAP = slot('rodeoSwap:none');
/** [family index] — the kind of card to give for it. */
export const SLOT_RODEO_GIVE = FAMILY_ORDER.map((f) => slot(`rodeoGive:${f}`));
/** [seat offset − 1][PAIR_TYPES index] — the pair the shark pair takes. */
export const SLOT_PAIR_STEAL = perOpponent((off) => PAIR_TYPES.map(([a, b]) => slot(`pairSteal:+${off}:${a}+${b}`)));
/** [pile] — The Angelfish: the top to take. */
export const SLOT_ANGELFISH = [slot('angelfish:0'), slot('angelfish:1')] as const;
export const SLOT_KEEP_NEW_EVENT = slot('event:keepNew');
export const SLOT_KEEP_OLD_EVENT = slot('event:keepOld');

export const NUM_SLOTS = names.length;
export const SLOT_NAMES: readonly string[] = names;

/** Family multiset of a card list, indexed by FAMILY_ORDER. */
function familyCounts(cards: SspCard[]): number[] {
  const out = new Array<number>(FAMILY_ORDER.length).fill(0);
  for (const c of cards) out[FAMILY_INDEX[c.family]] += 1;
  return out;
}

/** Can a hand with these family counts supply the pair [a, b]? */
function canFormPair(counts: number[], [a, b]: readonly [SspCardFamily, SspCardFamily]): boolean {
  const ia = FAMILY_INDEX[a];
  const ib = FAMILY_INDEX[b];
  return a === b ? counts[ia] >= 2 : counts[ia] >= 1 && counts[ib] >= 1;
}

/** Can the viewer attack the opponent at this seat offset (steal, swap, lock)? */
function attackable(obs: SspObservation, off: number): boolean {
  return obs.lastChanceOffset !== off && !obs.players[off].coralShell;
}

const opponentOffsets = (obs: SspObservation) =>
  Array.from({ length: Math.min(obs.players.length - 1, MAX_OPPONENTS) }, (_, i) => i + 1);

export function legalMask(obs: SspObservation): Uint8Array {
  const mask = new Uint8Array(NUM_SLOTS);
  if (obs.phase !== 'playing') return mask;
  if (obs.subPhase === 'roundEnd') {
    mask[SLOT_NEXT_ROUND] = 1;
    return mask;
  }
  if (obs.activeOffset !== 0) return mask;

  // A jellyfish-locked player never decides anything during the locked turn
  // itself: the reducer plays it (top card of the deck, then pass) for them.
  switch (obs.subPhase) {
    case 'awaitingAction':
      mask[SLOT_DRAW_PAIR] = 1;
      for (const p of [0, 1] as const) {
        if (obs.piles[p].size > 0) mask[SLOT_DRAW_DISCARD[p]] = 1;
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
      const counts = familyCounts(obs.hand);
      const starfish = counts[FAMILY_INDEX.starfish] >= 1;
      DUO_PAIRS.forEach((pair, t) => {
        if (!canFormPair(counts, pair)) return;
        mask[SLOT_PLAY_PAIR[t]] = 1;
        if (starfish) mask[SLOT_PLAY_TRIO[t]] = 1;
      });
      if (obs.players[0].rules.waterRodeo) {
        RODEO_PAIRS.forEach((pair, t) => {
          if (!canFormPair(counts, pair)) return;
          mask[SLOT_RODEO_PAIR[t]] = 1;
          if (starfish) mask[SLOT_RODEO_TRIO[t]] = 1;
        });
      }
      if (obs.canPlaceCoral) mask[SLOT_CORAL] = 1;
      if (obs.canStop) mask[SLOT_STOP] = 1;
      if (obs.canLastChance) mask[SLOT_LAST_CHANCE] = 1;
      mask[SLOT_PASS] = 1;
      break;
    }

    case 'awaitingCrabPick':
      if (obs.crabLookPile === null) {
        for (const p of obs.crabPiles) mask[SLOT_CRAB_PILE[p]] = 1;
      } else {
        for (const c of pileCards(obs.piles[obs.crabLookPile])) mask[SLOT_CRAB_PICK[FAMILY_INDEX[c.family]]] = 1;
      }
      break;

    case 'awaitingSharkSteal':
      for (const off of opponentOffsets(obs)) {
        if (obs.players[off].handSize > 0 && attackable(obs, off)) mask[SLOT_SHARK_STEAL[off - 1]] = 1;
      }
      break;

    case 'awaitingLobsterPick':
      for (const c of obs.lobsterReveal) mask[SLOT_LOBSTER_PICK[FAMILY_INDEX[c.family]]] = 1;
      break;

    case 'awaitingRodeoTarget':
      for (const off of opponentOffsets(obs)) {
        if (obs.players[off].handSize > 0 && attackable(obs, off)) mask[SLOT_RODEO_LOOK[off - 1]] = 1;
      }
      break;

    case 'awaitingRodeoSwap':
      if (!obs.rodeoLook) break;
      if (obs.rodeoTake === null) {
        mask[SLOT_RODEO_NO_SWAP] = 1;
        if (obs.hand.length > 0) {
          for (const c of obs.rodeoLook.hand) mask[SLOT_RODEO_TAKE[FAMILY_INDEX[c.family]]] = 1;
        }
      } else {
        for (const c of obs.hand) mask[SLOT_RODEO_GIVE[FAMILY_INDEX[c.family]]] = 1;
      }
      break;

    case 'awaitingPairSteal':
      for (const off of opponentOffsets(obs)) {
        if (!attackable(obs, off)) continue;
        const p = obs.players[off];
        for (const [a, b] of tablePairs(p.table, p.trios)) {
          const t = pairTypeIndex(a.family, b.family);
          if (t !== -1) mask[SLOT_PAIR_STEAL[off - 1][t]] = 1;
        }
      }
      break;

    case 'awaitingAngelfishPick':
      for (const p of [0, 1] as const) if (obs.piles[p].top) mask[SLOT_ANGELFISH[p]] = 1;
      break;

    case 'awaitingEventChoice':
      if (obs.eventChoice) {
        mask[SLOT_KEEP_NEW_EVENT] = 1;
        mask[SLOT_KEEP_OLD_EVENT] = 1;
      }
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

/** Turn a masked-in slot into a reducer action (or the first step of a
 *  two-step decision). Throws on a slot that isn't legal for this observation. */
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

  for (const [slots, pairs, trio] of [
    [SLOT_PLAY_PAIR, DUO_PAIRS, false], [SLOT_PLAY_TRIO, DUO_PAIRS, true],
    [SLOT_RODEO_PAIR, RODEO_PAIRS, false], [SLOT_RODEO_TRIO, RODEO_PAIRS, true],
  ] as const) {
    const t = slots.indexOf(s);
    if (t === -1) continue;
    const [a, b] = pickPairCards(obs.hand, pairs[t]);
    if (!trio) return { type: 'playPair', cardIds: [a.id, b.id] };
    const star = obs.hand.find((c) => c.family === 'starfish')!;
    return { type: 'playTrio', cardIds: [a.id, b.id, star.id] };
  }

  for (const p of [0, 1] as const) {
    if (s === SLOT_CRAB_PILE[p]) return { type: 'crabLook', pile: p };
  }
  const crabF = SLOT_CRAB_PICK.indexOf(s);
  if (crabF !== -1 && obs.crabLookPile !== null) {
    const pile = obs.crabLookPile;
    const card = preferredCopy(obs, pileCards(obs.piles[pile]), FAMILY_ORDER[crabF]);
    return { type: 'crabPick', pile, cardId: card.id };
  }

  const stealOff = SLOT_SHARK_STEAL.indexOf(s);
  if (stealOff !== -1) {
    return { type: 'sharkSteal', targetPlayerId: obs.players[stealOff + 1].id };
  }

  const lobsterF = SLOT_LOBSTER_PICK.indexOf(s);
  if (lobsterF !== -1) {
    const card = preferredCopy(obs, obs.lobsterReveal, FAMILY_ORDER[lobsterF]);
    return { type: 'lobsterPick', cardId: card.id };
  }

  if (s === SLOT_CORAL) {
    return { type: 'placeCoralShell', cardId: leastWantedCopy(obs, obs.hand, 'shell').id };
  }
  const lookOff = SLOT_RODEO_LOOK.indexOf(s);
  if (lookOff !== -1) return { type: 'rodeoLook', targetPlayerId: obs.players[lookOff + 1].id };
  if (s === SLOT_RODEO_NO_SWAP) return { type: 'rodeoSwap', swap: null };
  const takeF = SLOT_RODEO_TAKE.indexOf(s);
  if (takeF !== -1) return { type: 'rodeoTake', family: FAMILY_ORDER[takeF] };
  const giveF = SLOT_RODEO_GIVE.indexOf(s);
  if (giveF !== -1 && obs.rodeoLook && obs.rodeoTake) {
    const mine = leastWantedCopy(obs, obs.hand, FAMILY_ORDER[giveF]);
    const theirs = preferredCopy(obs, obs.rodeoLook.hand, obs.rodeoTake);
    return { type: 'rodeoSwap', swap: [mine.id, theirs.id] };
  }

  for (let k = 0; k < SLOT_PAIR_STEAL.length; k++) {
    const t = SLOT_PAIR_STEAL[k].indexOf(s);
    if (t === -1) continue;
    const target = obs.players[k + 1];
    const pair = tablePairs(target.table, target.trios).find(([a, b]) => pairTypeIndex(a.family, b.family) === t)!;
    return { type: 'stealPair', targetPlayerId: target.id, cardIds: [pair[0].id, pair[1].id] };
  }

  for (const p of [0, 1] as const) {
    if (s === SLOT_ANGELFISH[p]) return { type: 'angelfishPick', pile: p };
  }
  if ((s === SLOT_KEEP_NEW_EVENT || s === SLOT_KEEP_OLD_EVENT) && obs.eventChoice) {
    return { type: 'chooseEvent', keep: s === SLOT_KEEP_NEW_EVENT ? obs.eventChoice.newEventId : obs.eventChoice.oldEventId };
  }

  throw new Error(`decodeSlot: unhandled slot ${s}`);
}

/** First cards in hand order that form the pair [fa, fb]. Caller has checked the mask. */
function pickPairCards(hand: SspCard[], [fa, fb]: readonly [SspCardFamily, SspCardFamily]): [SspCard, SspCard] {
  const a = hand.find((c) => c.family === fa)!;
  const b = hand.find((c) => c.family === fb && c.id !== a.id)!;
  return [a, b];
}

/** How many cards of each colour the viewer holds (hand + table). */
function heldColours(obs: SspObservation): Map<string, number> {
  const held = new Map<string, number>();
  for (const c of [...obs.hand, ...obs.players[0].table]) held.set(c.color, (held.get(c.color) ?? 0) + 1);
  return held;
}

/** Among copies of `family` in `pool`, the one whose colour the viewer holds
 *  most of; ties go to the later card in `pool` (the top, for a pile). */
function preferredCopy(obs: SspObservation, pool: SspCard[], family: SspCardFamily): SspCard {
  const held = heldColours(obs);
  let best: SspCard | null = null;
  let bestN = -1;
  for (const c of pool) {
    if (c.family !== family) continue;
    const n = held.get(c.color) ?? 0;
    if (n >= bestN) { best = c; bestN = n; }
  }
  if (!best) throw new Error(`preferredCopy: no ${family} in pool`);
  return best;
}

/** Among the viewer's copies of `family` in `pool`, the one whose colour they
 *  hold least of (giving it away costs the colour groups least); ties go to
 *  the earlier card. */
function leastWantedCopy(obs: SspObservation, pool: SspCard[], family: SspCardFamily): SspCard {
  const held = heldColours(obs);
  let best: SspCard | null = null;
  let bestN = Infinity;
  for (const c of pool) {
    if (c.family !== family) continue;
    const n = held.get(c.color) ?? 0;
    if (n < bestN) { best = c; bestN = n; }
  }
  if (!best) throw new Error(`leastWantedCopy: no ${family} in pool`);
  return best;
}

/** Inverse of decodeSlot: which slot does this decision belong to? A
 *  crabPick maps to its pile slot until the observation is looking through
 *  that pile, then to its family slot; a rodeoSwap to its take slot until the
 *  observation has `rodeoTake` set, then to its give slot. Returns -1 for
 *  decisions that don't refer to cards the viewer can see. Used by tests and
 *  for labelling another agent's moves (behaviour cloning). */
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
      return pairSlot(cards[0]!.family, cards[1]!.family, false);
    }
    case 'playTrio': {
      const cards = action.cardIds.map((id) => obs.hand.find((c) => c.id === id));
      if (cards.some((c) => !c)) return -1;
      const starAt = cards.findIndex((c) => c!.family === 'starfish');
      if (starAt === -1) return -1;
      const rest = cards.filter((_, i) => i !== starAt);
      return pairSlot(rest[0]!.family, rest[1]!.family, true);
    }
    case 'crabLook':
      return SLOT_CRAB_PILE[action.pile];
    case 'crabPick': {
      if (obs.crabLookPile === null) return SLOT_CRAB_PILE[action.pile];
      if (obs.crabLookPile !== action.pile) return -1;
      const card = pileCards(obs.piles[action.pile]).find((c) => c.id === action.cardId);
      return card ? SLOT_CRAB_PICK[FAMILY_INDEX[card.family]] : -1;
    }
    case 'sharkSteal': {
      const off = obs.players.findIndex((p) => p.id === action.targetPlayerId);
      return off >= 1 && off <= MAX_OPPONENTS ? SLOT_SHARK_STEAL[off - 1] : -1;
    }
    case 'lobsterPick': {
      const card = obs.lobsterReveal.find((c) => c.id === action.cardId);
      return card ? SLOT_LOBSTER_PICK[FAMILY_INDEX[card.family]] : -1;
    }
    case 'placeCoralShell':
      return SLOT_CORAL;
    case 'rodeoLook': {
      const off = obs.players.findIndex((p) => p.id === action.targetPlayerId);
      return off >= 1 && off <= MAX_OPPONENTS ? SLOT_RODEO_LOOK[off - 1] : -1;
    }
    case 'rodeoTake':
      return SLOT_RODEO_TAKE[FAMILY_INDEX[action.family]];
    case 'rodeoSwap': {
      if (!action.swap) return SLOT_RODEO_NO_SWAP;
      const theirs = obs.rodeoLook?.hand.find((c) => c.id === action.swap![1]);
      const mine = obs.hand.find((c) => c.id === action.swap![0]);
      if (!theirs || !mine) return -1;
      if (obs.rodeoTake === null) return SLOT_RODEO_TAKE[FAMILY_INDEX[theirs.family]];
      return obs.rodeoTake === theirs.family ? SLOT_RODEO_GIVE[FAMILY_INDEX[mine.family]] : -1;
    }
    case 'stealPair': {
      const off = obs.players.findIndex((p) => p.id === action.targetPlayerId);
      if (!(off >= 1 && off <= MAX_OPPONENTS)) return -1;
      const cards = action.cardIds.map((id) => obs.players[off].table.find((c) => c.id === id));
      if (cards.some((c) => !c)) return -1;
      const t = pairTypeIndex(cards[0]!.family, cards[1]!.family);
      return t === -1 ? -1 : SLOT_PAIR_STEAL[off - 1][t];
    }
    case 'angelfishPick':
      return SLOT_ANGELFISH[action.pile];
    case 'chooseEvent':
      if (!obs.eventChoice) return -1;
      return action.keep === obs.eventChoice.newEventId ? SLOT_KEEP_NEW_EVENT
        : action.keep === obs.eventChoice.oldEventId ? SLOT_KEEP_OLD_EVENT : -1;
  }
}

/** The pair (or trio) slot for a duo of these two families, base or Water Rodeo; -1 if neither. */
function pairSlot(a: SspCardFamily, b: SspCardFamily, trio: boolean): number {
  const same = (x: SspCardFamily, y: SspCardFamily) => (x === a && y === b) || (x === b && y === a);
  const base = DUO_PAIRS.findIndex(([x, y]) => same(x, y));
  if (base !== -1) return (trio ? SLOT_PLAY_TRIO : SLOT_PLAY_PAIR)[base];
  const rodeo = RODEO_PAIRS.findIndex(([x, y]) => same(x, y));
  return rodeo === -1 ? -1 : (trio ? SLOT_RODEO_TRIO : SLOT_RODEO_PAIR)[rodeo];
}
