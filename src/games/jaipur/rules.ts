// Jaipur — which moves are legal, as pure functions of card counts.
//
// The reducer validates concrete card ids against these; the AI enumerates
// whole moves with `legalMoves`; the learned agent's mask and the trade
// builder in the UI ask `canCompleteTrade` whether a half-built exchange can
// still be finished, so neither ever offers a dead end.
//
// An exchange takes T goods (t ≥ 2) from the market and gives t cards back:
// goods from hand of types NOT being taken, and/or camels from the herd. With
// h cards in hand, C camels and E hand goods of untaken types, giving k goods
// and t − k camels needs
//     k ≤ E,  t − k ≤ C,  h + t − k ≤ 7 (hand limit)
// so T is payable iff E ≥ max(0, t − C, h + t − 7). Adding a card to T can
// only shrink E and grow the right side, so once a take set is unpayable no
// larger one is either.

import type { JaipurCard, JaipurCardType, JaipurGood } from './types';
import { CARD_TYPES, GOODS, HAND_LIMIT, minSale } from './cards';

export type Counts = Record<JaipurCardType, number>;
export type GoodCounts = Record<JaipurGood, number>;

export function emptyCounts(): Counts {
  return { diamond: 0, gold: 0, silver: 0, cloth: 0, spice: 0, leather: 0, camel: 0 };
}

export function emptyGoodCounts(): GoodCounts {
  return { diamond: 0, gold: 0, silver: 0, cloth: 0, spice: 0, leather: 0 };
}

export function countCards(cards: readonly JaipurCard[]): Counts {
  const c = emptyCounts();
  for (const card of cards) c[card.type]++;
  return c;
}

export const sumGoods = (c: Partial<Record<JaipurCardType, number>>): number =>
  GOODS.reduce((s, g) => s + (c[g] ?? 0), 0);

/** What a seat's trade options depend on. */
export interface TradeContext {
  /** Market cards by type (camels included, though they can't be traded for). */
  market: Counts;
  /** Hand goods by type. */
  hand: Counts;
  /** Camels in the herd. */
  herd: number;
}

/** A half-built exchange: goods picked from the market and cards offered so far. */
export interface TradeDraft {
  take: GoodCounts;
  give: Counts;
}

export function emptyDraft(): TradeDraft {
  return { take: emptyGoodCounts(), give: emptyCounts() };
}

const handSize = (ctx: TradeContext) => sumGoods(ctx.hand);

/** Hand goods that may be given against this take set. */
function eligible(ctx: TradeContext, take: GoodCounts): number {
  return GOODS.reduce((s, g) => s + (take[g] > 0 ? 0 : ctx.hand[g]), 0);
}

/** Can `take` (already ≥ 2 cards or not) be paid for, with `give` offered so far? */
function payable(ctx: TradeContext, d: TradeDraft): boolean {
  const t = sumGoods(d.take);
  const goodsGiven = sumGoods(d.give);
  const camelsGiven = d.give.camel;
  const left = t - goodsGiven - camelsGiven;
  if (left < 0) return false;
  for (const g of GOODS) {
    if (d.give[g] > 0 && (d.take[g] > 0 || d.give[g] > ctx.hand[g])) return false;
    if (d.take[g] > ctx.market[g]) return false;
  }
  if (camelsGiven > ctx.herd) return false;
  const goodsLeft = eligible(ctx, d.take) - goodsGiven;
  const camelsLeft = ctx.herd - camelsGiven;
  const need = Math.max(0, left - camelsLeft, handSize(ctx) + t - HAND_LIMIT - goodsGiven);
  return need <= Math.min(left, goodsLeft);
}

/** Can this draft still end in a legal exchange? While nothing has been given
 *  yet the take set may still grow (it needs 2+ cards). */
export function canCompleteTrade(ctx: TradeContext, d: TradeDraft): boolean {
  if (!payable(ctx, d)) return false;
  const t = sumGoods(d.take);
  if (t >= 2) return true;
  if (sumGoods(d.give) + d.give.camel > 0) return false;
  return GOODS.some((g) => ctx.market[g] > d.take[g] && canCompleteTrade(ctx, addTake(d, g)));
}

/** True when the draft is a finished, legal exchange. */
export function isCompleteTrade(ctx: TradeContext, d: TradeDraft): boolean {
  const t = sumGoods(d.take);
  return t >= 2 && sumGoods(d.give) + d.give.camel === t && payable(ctx, d);
}

export function addTake(d: TradeDraft, g: JaipurGood): TradeDraft {
  return { take: { ...d.take, [g]: d.take[g] + 1 }, give: d.give };
}

export function addGive(d: TradeDraft, type: JaipurCardType): TradeDraft {
  return { take: d.take, give: { ...d.give, [type]: d.give[type] + 1 } };
}

/** Taking more of `g` keeps the draft completable (only before anything is given). */
export function canTakeMore(ctx: TradeContext, d: TradeDraft, g: JaipurGood): boolean {
  return sumGoods(d.give) + d.give.camel === 0 && ctx.market[g] > d.take[g] && canCompleteTrade(ctx, addTake(d, g));
}

/** Giving one more `type` keeps the draft completable. */
export function canGive(ctx: TradeContext, d: TradeDraft, type: JaipurCardType): boolean {
  if (sumGoods(d.take) < 2) return false;
  return payable(ctx, addGive(d, type));
}

// ---------------------------------------------------------------------------
// Whole moves, by card type. `legalMoves` lists each distinct move once.

export type JaipurMove =
  | { kind: 'takeOne'; good: JaipurGood }
  | { kind: 'takeCamels' }
  | { kind: 'exchange'; take: GoodCounts; give: Counts }
  | { kind: 'sell'; good: JaipurGood; count: number };

export function canTakeOne(ctx: TradeContext, g: JaipurGood): boolean {
  return ctx.market[g] > 0 && handSize(ctx) < HAND_LIMIT;
}

export function canSell(ctx: TradeContext, g: JaipurGood, count: number): boolean {
  return count >= minSale(g) && count <= ctx.hand[g];
}

export function legalMoves(ctx: TradeContext): JaipurMove[] {
  const moves: JaipurMove[] = [];
  for (const g of GOODS) if (canTakeOne(ctx, g)) moves.push({ kind: 'takeOne', good: g });
  if (ctx.market.camel > 0) moves.push({ kind: 'takeCamels' });
  for (const g of GOODS) {
    for (let n = minSale(g); n <= ctx.hand[g]; n++) moves.push({ kind: 'sell', good: g, count: n });
  }
  for (const take of takeSets(ctx)) {
    for (const give of giveSets(ctx, take)) moves.push({ kind: 'exchange', take, give });
  }
  return moves;
}

/** Every payable take set of 2+ goods. */
function takeSets(ctx: TradeContext): GoodCounts[] {
  const out: GoodCounts[] = [];
  const walk = (i: number, take: GoodCounts) => {
    if (i === GOODS.length) {
      if (sumGoods(take) >= 2 && payable(ctx, { take, give: emptyCounts() })) out.push({ ...take });
      return;
    }
    const g = GOODS[i];
    for (let n = 0; n <= ctx.market[g]; n++) {
      take[g] = n;
      walk(i + 1, take);
    }
    take[g] = 0;
  };
  walk(0, emptyGoodCounts());
  return out;
}

/** Every way to pay for `take`. */
function giveSets(ctx: TradeContext, take: GoodCounts): Counts[] {
  const t = sumGoods(take);
  const out: Counts[] = [];
  const types = CARD_TYPES.filter((x) => x === 'camel' || take[x as JaipurGood] === 0);
  const walk = (i: number, give: Counts, left: number) => {
    if (i === types.length) {
      if (left === 0 && payable(ctx, { take, give })) out.push({ ...give });
      return;
    }
    const x = types[i];
    const have = x === 'camel' ? ctx.herd : ctx.hand[x];
    for (let n = 0; n <= Math.min(have, left); n++) {
      give[x] = n;
      walk(i + 1, give, left - n);
    }
    give[x] = 0;
  };
  walk(0, emptyCounts(), t);
  return out;
}

/** Stable text key for a move (dedupe / compare in tests and tools). */
export function moveKey(m: JaipurMove): string {
  switch (m.kind) {
    case 'takeOne': return `take:${m.good}`;
    case 'takeCamels': return 'camels';
    case 'sell': return `sell:${m.good}:${m.count}`;
    case 'exchange': {
      const t = GOODS.filter((g) => m.take[g]).map((g) => `${g}${m.take[g]}`).join(',');
      const v = CARD_TYPES.filter((x) => m.give[x]).map((x) => `${x}${m.give[x]}`).join(',');
      return `trade:${t}>${v}`;
    }
  }
}
