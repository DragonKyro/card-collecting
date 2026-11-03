// Jaipur — fixed action slots for a policy network (action space v1).
//
// A slot names a DECISION by card type, never a card id: cards of one type
// are interchangeable, and `decodeSlot` picks which copies carry it out.
//
//   take:<good>       take one good from the market
//   camels            take every camel in the market
//   sell:<good>:<n>   sell n of a good (n = 1..7)
//   trade:<good>      exchange: take one (more) of this good from the market —
//                     at the main decision it starts an exchange
//   trade:done        stop taking (2+ taken) and start paying
//   give:<type>       pay with one hand good of this type, or a camel; the
//                     exchange is submitted once as many cards are given as
//                     were taken
//
// The parts of an exchange before the last change no game state; they carry
// a JaipurDraft to the next policy call (see agent.ts). The mask only admits a
// part when the exchange can still be finished legally (rules.ts), so a
// sequence of legal slots never dead-ends.
//
// The mask and decoder are functions of JaipurObservation only.
// actions.test.ts checks them against the reducer and against rules.legalMoves.

import type { JaipurAction, JaipurCard, JaipurCardType, JaipurGood } from '../types';
import { CARD_TYPES, GOODS, HAND_LIMIT } from '../cards';
import {
  addGive, addTake, canGive, canSell, canTakeMore, canTakeOne, emptyDraft, sumGoods,
} from '../rules';
import { obsTradeContext, type JaipurDraft, type JaipurObservation } from './observation';

/** Bump when slots are added, removed or reordered — trained weights are tied to it. */
export const ACTION_SPACE_VERSION = 1;

const names: string[] = [];
const slot = (name: string): number => names.push(name) - 1;

export const MAX_SELL = HAND_LIMIT;

export const SLOT_TAKE: Record<JaipurGood, number> = Object.fromEntries(
  GOODS.map((g) => [g, slot(`take:${g}`)]),
) as Record<JaipurGood, number>;
export const SLOT_CAMELS = slot('camels');
/** [good][n − 1] */
export const SLOT_SELL: Record<JaipurGood, number[]> = Object.fromEntries(
  GOODS.map((g) => [g, Array.from({ length: MAX_SELL }, (_, i) => slot(`sell:${g}:${i + 1}`))]),
) as Record<JaipurGood, number[]>;
export const SLOT_TRADE: Record<JaipurGood, number> = Object.fromEntries(
  GOODS.map((g) => [g, slot(`trade:${g}`)]),
) as Record<JaipurGood, number>;
export const SLOT_TRADE_DONE = slot('trade:done');
export const SLOT_GIVE: Record<JaipurCardType, number> = Object.fromEntries(
  CARD_TYPES.map((t) => [t, slot(`give:${t}`)]),
) as Record<JaipurCardType, number>;

export const NUM_SLOTS = names.length;
export const SLOT_NAMES: readonly string[] = names;

/** Next part of an exchange: ask the same seat again with this draft. */
export interface DraftStep {
  type: 'draft';
  draft: JaipurDraft;
}

export type SlotDecision = JaipurAction | DraftStep;

export function legalMask(obs: JaipurObservation): Uint8Array {
  const mask = new Uint8Array(NUM_SLOTS);
  const d = obs.decision;
  if (!d) return mask;
  const ctx = obsTradeContext(obs);
  switch (d.stage) {
    case 'main': {
      const none = emptyDraft();
      for (const g of GOODS) {
        if (canTakeOne(ctx, g)) mask[SLOT_TAKE[g]] = 1;
        if (canTakeMore(ctx, none, g)) mask[SLOT_TRADE[g]] = 1;
        for (let n = 1; n <= MAX_SELL; n++) if (canSell(ctx, g, n)) mask[SLOT_SELL[g][n - 1]] = 1;
      }
      if (ctx.market.camel > 0) mask[SLOT_CAMELS] = 1;
      break;
    }
    case 'take':
      for (const g of GOODS) if (canTakeMore(ctx, d.draft, g)) mask[SLOT_TRADE[g]] = 1;
      if (sumGoods(d.draft.take) >= 2) mask[SLOT_TRADE_DONE] = 1;
      break;
    case 'give':
      for (const t of CARD_TYPES) if (canGive(ctx, d.draft, t)) mask[SLOT_GIVE[t]] = 1;
      break;
  }
  return mask;
}

const firstOf = (cards: readonly JaipurCard[], type: JaipurCardType, n: number): number[] =>
  cards.filter((c) => c.type === type).slice(0, n).map((c) => c.id);

/** The reducer action (or the next draft) a legal slot stands for. */
export function decodeSlot(obs: JaipurObservation, slotIndex: number): SlotDecision {
  const d = obs.decision;
  if (!d) throw new Error('decodeSlot: no decision to make');
  if (!legalMask(obs)[slotIndex]) throw new Error(`decodeSlot: ${SLOT_NAMES[slotIndex] ?? slotIndex} is not legal now`);
  const name = SLOT_NAMES[slotIndex];
  const [kind, arg, count] = name.split(':');
  switch (kind) {
    case 'take':
      return { type: 'takeOne', cardId: firstOf(obs.market, arg as JaipurGood, 1)[0] };
    case 'camels':
      return { type: 'takeCamels' };
    case 'sell':
      return { type: 'sell', cardIds: firstOf(obs.hand, arg as JaipurGood, Number(count)) };
    case 'trade': {
      const base: JaipurDraft = d.stage === 'main' ? { ...emptyDraft(), stage: 'take' } : d.draft;
      if (arg === 'done') return { type: 'draft', draft: { ...base, stage: 'give' } };
      return { type: 'draft', draft: { ...addTake(base, arg as JaipurGood), stage: 'take' } };
    }
    case 'give': {
      if (d.stage !== 'give') throw new Error('decodeSlot: give outside the give stage');
      const next: JaipurDraft = { ...addGive(d.draft, arg as JaipurCardType), stage: 'give' };
      const t = sumGoods(next.take);
      if (sumGoods(next.give) + next.give.camel < t) return { type: 'draft', draft: next };
      return exchangeAction(obs, next);
    }
  }
  throw new Error(`decodeSlot: unknown slot ${name}`);
}

/** The concrete exchange a finished draft describes. */
export function exchangeAction(obs: Pick<JaipurObservation, 'market' | 'hand' | 'herd'>, d: JaipurDraft): JaipurAction {
  const takeIds = GOODS.flatMap((g) => firstOf(obs.market, g, d.take[g]));
  const giveIds = [
    ...GOODS.flatMap((g) => firstOf(obs.hand, g, d.give[g])),
    ...obs.herd.slice(0, d.give.camel).map((c) => c.id),
  ];
  return { type: 'exchange', takeIds, giveIds };
}
