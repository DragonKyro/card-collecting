// Sushi Go! Party — fixed action slots for a policy network (action space v1).
//
// A slot names a DECISION, not a physical card. The 37 face slots (faces.ts)
// mean "this kind of card" in whatever decision is being made: play it, take
// it as the chopsticks' second card, copy it, play it off a menu, hand it
// over to a spoon, flip it, or ask a spoon for exactly it. Which copy carries
// it out is a tie-break in `decodeSlot` (copies of a face are identical, bar
// a flipped one, which copy / flip choices avoid).
//
// Multi-part answers are asked one part at a time, carrying a SushiGoDraft
// between policy calls (it changes no game state): a pick is first card →
// chopsticks' second card or `done` (when it applies); a spoon, after the
// reveal, is `spoon:yes` (then the card to name) / `spoon:no` (keep it); a
// takeout box flips one face at a time until `done`.
//
// The mask and decoder are functions of SushiGoObservation only.
// actions.test.ts plays every legal slot sequence against the reducer.

import type { SushiGoAction, SushiGoCard, SushiGoCardKind } from '../types';
import { ALL_KINDS, variantsOf } from '../cards';
import { effectiveCard } from '../scoring';
import { FACES, FACE_COUNT, faceIndex } from './faces';
import type { SushiGoDraft, SushiGoObservation } from './observation';

/** Bump when slots are added, removed or reordered — trained weights are tied to it. */
export const ACTION_SPACE_VERSION = 1;

const names: string[] = [];
const slot = (name: string): number => names.push(name) - 1;

/** [face index] — face slots come first, so slot = face index. */
export const SLOT_FACE = FACES.map((f) => slot(`face:${f.kind}${f.variant ? `:${f.variant}` : ''}`));
/** Kinds a spoon can ask for in general ("any nigiri"); the giver picks the variant. */
export const ASK_ANY_KINDS: readonly SushiGoCardKind[] = ALL_KINDS.filter((k) => variantsOf(k).length > 0);
export const SLOT_ASK_ANY = ASK_ANY_KINDS.map((k) => slot(`askAny:${k}`));
/** No chopsticks second card / no more flips. */
export const SLOT_DONE = slot('done');
/** Use the spoon this turn / keep it. */
export const SLOT_SPOON_YES = slot('spoon:yes');
export const SLOT_SPOON_NO = slot('spoon:no');

export const NUM_SLOTS = names.length;
export const SLOT_NAMES: readonly string[] = names;

/** Next part of a multi-part answer: ask the same seat again with this draft. */
export interface DraftStep {
  type: 'draft';
  draft: SushiGoDraft;
}

export type SlotDecision = SushiGoAction | DraftStep;

/** Cards in `pool` not among `taken` (by id). */
const without = (pool: SushiGoCard[], taken: SushiGoCard[]) => pool.filter((c) => !taken.some((t) => t.id === c.id));

/** The first card of face `f`, preferring a face-up one. */
function cardOfFace(cards: SushiGoCard[], f: number, asCounted = false): SushiGoCard | undefined {
  const matches = cards.filter((c) => faceIndex(asCounted ? effectiveCard(c) : c) === f);
  return matches.find((c) => !effectiveCard(c).flipped) ?? matches[0];
}

export function legalMask(obs: SushiGoObservation): Uint8Array {
  const mask = new Uint8Array(NUM_SLOTS);
  const d = obs.decision;
  if (!d) return mask;
  const faces = (cards: SushiGoCard[]) => {
    for (const c of cards) mask[SLOT_FACE[faceIndex(c)]] = 1;
  };
  switch (d.type) {
    case 'pick':
      faces(without(obs.hand, d.chosen));
      if (d.stage === 'second') mask[SLOT_DONE] = 1;
      break;
    case 'copy':
      faces(d.targets.map(effectiveCard));
      break;
    case 'spoon': {
      if (d.stage === 'use') {
        mask[SLOT_SPOON_YES] = 1;
        mask[SLOT_SPOON_NO] = 1;
        break;
      }
      const onMenu = new Set(obs.menu);
      FACES.forEach((f, i) => { if (onMenu.has(f.kind)) mask[SLOT_FACE[i]] = 1; });
      ASK_ANY_KINDS.forEach((k, i) => { if (onMenu.has(k)) mask[SLOT_ASK_ANY[i]] = 1; });
      break;
    }
    case 'spoonGive':
      faces(d.options);
      break;
    case 'menu':
      faces(d.drawn.filter((c) => c.kind !== 'menu'));
      break;
    case 'takeout':
      faces(d.targets.map(effectiveCard));
      mask[SLOT_DONE] = 1;
      break;
  }
  return mask;
}

/** The reducer action (or the next draft) a legal slot stands for. */
export function decodeSlot(obs: SushiGoObservation, slotIndex: number): SlotDecision {
  const d = obs.decision;
  if (!d) throw new Error('decodeSlot: no decision to make');
  if (!legalMask(obs)[slotIndex]) throw new Error(`decodeSlot: ${SLOT_NAMES[slotIndex] ?? slotIndex} is not legal now`);
  const playerId = obs.viewerId;
  const f = slotIndex < FACE_COUNT ? slotIndex : -1;
  switch (d.type) {
    case 'pick': {
      const chosen = d.chosen.map((c) => c.id);
      if (slotIndex === SLOT_DONE) return submit(obs, chosen);
      const card = cardOfFace(without(obs.hand, d.chosen), f)!;
      const cards = [...chosen, card.id];
      return d.stage === 'first' && d.canChopsticks ? { type: 'draft', draft: { cards } } : submit(obs, cards);
    }
    case 'copy':
      return { type: 'copyCard', playerId, targetId: cardOfFace(d.targets, f, true)!.id };
    case 'spoon': {
      if (d.stage === 'use') {
        return slotIndex === SLOT_SPOON_YES
          ? { type: 'draft', draft: { cards: [], spoonUsed: true } }
          : { type: 'keepSpoon', playerId };
      }
      if (f >= 0) {
        const face = FACES[f];
        return { type: 'askSpoon', playerId, kind: face.kind, ...(face.variant !== undefined ? { variant: face.variant } : {}) };
      }
      return { type: 'askSpoon', playerId, kind: ASK_ANY_KINDS[SLOT_ASK_ANY.indexOf(slotIndex)] };
    }
    case 'spoonGive':
      return { type: 'giveSpoon', playerId, cardId: cardOfFace(d.options, f)!.id };
    case 'menu':
      return { type: 'pickMenu', playerId, cardId: cardOfFace(d.drawn.filter((c) => c.kind !== 'menu'), f)!.id };
    case 'takeout': {
      const flips = d.chosen.map((c) => c.id);
      if (slotIndex === SLOT_DONE) return { type: 'flipCards', playerId, cardIds: flips };
      const target = cardOfFace(d.targets, f, true)!;
      const next = [...flips, target.id];
      return d.targets.length === 1
        ? { type: 'flipCards', playerId, cardIds: next }
        : { type: 'draft', draft: { cards: next } };
    }
  }
}

function submit(obs: SushiGoObservation, cardIds: number[]): SushiGoAction {
  let ids = cardIds;
  // Wasabi picked with a nigiri goes down first, so the nigiri lands on it.
  if (ids.length === 2) {
    const [a, b] = ids.map((id) => obs.hand.find((c) => c.id === id)!);
    if (a.kind === 'nigiri' && b.kind === 'wasabi') ids = [ids[1], ids[0]];
  }
  return { type: 'submitPick', playerId: obs.viewerId, cardIds: ids };
}
