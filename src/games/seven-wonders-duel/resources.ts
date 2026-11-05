// 7 Wonders Duel — production, trading and paying for things.
//
// Production: brown / gray cards make fixed resources; Forum, Caravansery,
// the Great Lighthouse and Piraeus make one of several each turn.
//
// Trading (rulebook): a missing resource is bought from the bank for 2 coins
// + 1 per unit of it the opponent makes with brown and gray cards (yellow
// cards and wonders never raise the price). A Reserve / Customs House fixes
// the price of its resources at 1 coin. With Economy the coins go to its owner.
//
// Masonry (blue cards) and Architecture (wonders) waive 2 resources of the
// owner's choice. `cheapestPayment` finds the best way to pay: fixed
// production first, every assignment of the choice producers tried, then the
// dearest remaining units waived and the rest bought. Actions never carry a
// payment; the reducer always pays this cheapest way.

import type {
  DuelCard, DuelCost, DuelCount, DuelPlayer, DuelProduction, DuelResource, DuelScience, DuelState,
  DuelWonder,
} from './types';
import { DUEL_ALL_RESOURCES } from './types';
import { wonderById } from './wonders';

export interface ProductionSet {
  fixed: Map<DuelResource, number>;
  choices: DuelProduction[];
}

/** Every production source of a player: cards and built wonders. */
export function productionFor(player: DuelPlayer): ProductionSet {
  const fixed = new Map<DuelResource, number>();
  const choices: DuelProduction[] = [];
  const add = (prods: readonly DuelProduction[]) => {
    for (const opts of prods) {
      if (opts.length === 1) fixed.set(opts[0], (fixed.get(opts[0]) ?? 0) + 1);
      else choices.push(opts);
    }
  };
  for (const c of player.tableau) {
    for (const eff of c.effects) if (eff.kind === 'produce') add(eff.production);
  }
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    for (const eff of wonderById(ws.wonderId).effects) if (eff.kind === 'produce') add(eff.production);
  }
  return { fixed, choices };
}

/** Units of `r` a player makes with brown and gray cards — what raises the
 *  opponent's price for it. */
export function tradeSupply(player: DuelPlayer, r: DuelResource): number {
  let n = 0;
  for (const c of player.tableau) {
    if (c.color !== 'brown' && c.color !== 'gray') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'produce') for (const opts of eff.production) if (opts.length === 1 && opts[0] === r) n++;
    }
  }
  return n;
}

/** True when a card in the player's city fixes the price of `r` at 1 coin. */
export function hasFixedPrice(player: DuelPlayer, r: DuelResource): boolean {
  return player.tableau.some((c) => c.effects.some((e) => e.kind === 'tradeFixed' && e.resources.includes(r)));
}

/** Coins `buyer` pays the bank for one unit of `r`. */
export function priceOf(buyer: DuelPlayer, opponent: DuelPlayer, r: DuelResource): number {
  return hasFixedPrice(buyer, r) ? 1 : 2 + tradeSupply(opponent, r);
}

export interface Payment {
  /** Total coins to pay (the printed coin cost + trading). */
  coins: number;
  /** Trading coins — what Economy hands to the opponent. */
  trade: number;
  /** Resources bought, dearest first. */
  bought: DuelResource[];
  /** Resources Masonry / Architecture let the player skip. */
  waived: DuelResource[];
  /** Built free through a chain. */
  chained: boolean;
}

/** The cheapest way for `buyer` to pay `cost`, skipping up to `waive` resources. */
export function cheapestPayment(buyer: DuelPlayer, opponent: DuelPlayer, cost: DuelCost, waive = 0): Payment {
  const { fixed, choices } = productionFor(buyer);
  const need = new Map<DuelResource, number>();
  for (const r of cost.resources ?? []) need.set(r, (need.get(r) ?? 0) + 1);
  for (const [r, n] of fixed) if (need.has(r)) need.set(r, Math.max(0, need.get(r)! - n));
  const price = new Map(DUEL_ALL_RESOURCES.map((r) => [r, priceOf(buyer, opponent, r)]));

  const best = { trade: Infinity, bought: [] as DuelResource[], waived: [] as DuelResource[] };
  const settle = () => {
    const units: DuelResource[] = [];
    for (const [r, n] of need) for (let i = 0; i < n; i++) units.push(r);
    units.sort((a, b) => price.get(b)! - price.get(a)!);
    const bought = units.slice(waive);
    const trade = bought.reduce((sum, r) => sum + price.get(r)!, 0);
    if (trade < best.trade) Object.assign(best, { trade, bought, waived: units.slice(0, waive) });
  };
  const assign = (i: number) => {
    if (best.trade === 0) return;
    if (i === choices.length) { settle(); return; }
    assign(i + 1);
    for (const r of new Set(choices[i])) {
      const n = need.get(r) ?? 0;
      if (n === 0) continue;
      need.set(r, n - 1);
      assign(i + 1);
      need.set(r, n);
    }
  };
  assign(0);
  return { coins: (cost.coins ?? 0) + best.trade, trade: best.trade, bought: best.bought, waived: best.waived, chained: false };
}

/** True if the player owns the card that makes `card` free. */
export function hasChain(player: DuelPlayer, card: DuelCard): boolean {
  return !!card.chainFrom && player.tableau.some((c) => c.name === card.chainFrom);
}

const opponentOf = (state: DuelState, seatIdx: 0 | 1) => state.players[(1 - seatIdx) as 0 | 1];

/** What building `card` costs the seat (chain, Masonry and trading included). */
export function cardPayment(state: DuelState, seatIdx: 0 | 1, card: DuelCard): Payment {
  const me = state.players[seatIdx];
  if (hasChain(me, card)) return { coins: 0, trade: 0, bought: [], waived: [], chained: true };
  const waive = card.color === 'blue' && me.progressTokens.includes('masonry') ? 2 : 0;
  return cheapestPayment(me, opponentOf(state, seatIdx), card.cost, waive);
}

/** What building `wonder` costs the seat (Architecture and trading included). */
export function wonderPayment(state: DuelState, seatIdx: 0 | 1, wonder: DuelWonder): Payment {
  const me = state.players[seatIdx];
  const waive = me.progressTokens.includes('architecture') ? 2 : 0;
  return cheapestPayment(me, opponentOf(state, seatIdx), wonder.cost, waive);
}

/** Coins for discarding a card: 2 + 1 per yellow card in the city. */
export function discardCoins(player: DuelPlayer): number {
  return 2 + player.tableau.filter((c) => c.color === 'yellow').length;
}

/** Science symbols a player holds, Law's scales included. */
export function scienceSymbols(player: DuelPlayer): Map<DuelScience, number> {
  const counts = new Map<DuelScience, number>();
  for (const c of player.tableau) {
    for (const eff of c.effects) if (eff.kind === 'science') counts.set(eff.symbol, (counts.get(eff.symbol) ?? 0) + 1);
  }
  if (player.progressTokens.includes('law')) counts.set('law', (counts.get('law') ?? 0) + 1);
  return counts;
}

/** Different science symbols held — 6 is Scientific Supremacy. */
export function distinctScience(player: DuelPlayer): number {
  return scienceSymbols(player).size;
}

/** Printed shields on a player's cards and built wonders. */
export function shieldsFor(player: DuelPlayer): number {
  let s = 0;
  for (const c of player.tableau) for (const eff of c.effects) if (eff.kind === 'shields') s += eff.shields;
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    for (const eff of wonderById(ws.wonderId).effects) if (eff.kind === 'shields') s += eff.shields;
  }
  return s;
}

/** How many of `what` a player's city holds. */
export function countFor(player: DuelPlayer, what: DuelCount): number {
  switch (what.kind) {
    case 'color': return player.tableau.filter((c) => what.colors.includes(c.color)).length;
    case 'wonders': return player.wonders.filter((w) => w.built).length;
    case 'coins': return Math.floor(player.coins / 3);
  }
}

/** A guild's count: the city with the most of `what`. */
export function guildCount(state: DuelState, what: DuelCount): number {
  return Math.max(countFor(state.players[0], what), countFor(state.players[1], what));
}
