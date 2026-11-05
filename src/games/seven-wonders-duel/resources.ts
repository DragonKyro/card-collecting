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
//
// Expansions:
//   - Agora Decrees: ignore 1 cost symbol of a yellow / red / green card or a
//     wonder (a resource, or all of the coins); 1 coin off each brown / gray
//     resource bought (never under 1); chains from the opponent's cards.
//     Senators cost a coin per Senator already in the city (Corruption: 0).
//   - Pantheon: a Grand Temple is free with a Mythology token of its type;
//     Engineering makes any card with a chain symbol under its cost (temples
//     included) cost at most 1 coin; Astarte's coins can be spent (`purse`).

import type {
  DuelCard, DuelCost, DuelCount, DuelMythology, DuelPlayer, DuelProduction, DuelResource, DuelScience,
  DuelState, DuelWonder,
} from './types';
import { DUEL_ALL_RESOURCES, DUEL_RAW_RESOURCES } from './types';
import { wonderById } from './wonders';
import { hasDecree } from './agora';

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

/** Coins a player can spend: the treasury plus whatever is left on Astarte. */
export function purse(player: DuelPlayer): number {
  return player.coins + (player.pantheon?.astarteCoins ?? 0);
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

/** Agora's trade Decrees: a coin off each bought raw / manufactured resource. */
export interface TradeDiscount {
  raw?: boolean;
  goods?: boolean;
}

/** Coins `buyer` pays the bank for one unit of `r`. */
export function priceOf(buyer: DuelPlayer, opponent: DuelPlayer, r: DuelResource, discount: TradeDiscount = {}): number {
  if (hasFixedPrice(buyer, r)) return 1;
  const raw = (DUEL_RAW_RESOURCES as readonly DuelResource[]).includes(r);
  const off = (raw ? discount.raw : discount.goods) ? 1 : 0;
  return Math.max(1, 2 + tradeSupply(opponent, r) - off);
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
  /** The cost symbol an Agora Decree let the player ignore. */
  ignored?: DuelResource | 'coins';
  /** Engineering capped the cost at 1 coin. */
  engineering?: boolean;
}

export interface PayOptions extends TradeDiscount {
  /** Ignore 1 cost symbol: a resource unit, or the coin part (an Agora Decree). */
  ignoreOne?: boolean;
}

/** The cheapest way for `buyer` to pay `cost`, skipping up to `waive` resources. */
export function cheapestPayment(buyer: DuelPlayer, opponent: DuelPlayer, cost: DuelCost, waive = 0, opts: PayOptions = {}): Payment {
  if (opts.ignoreOne) {
    const candidates: { cost: DuelCost; ignored: DuelResource | 'coins' }[] = [];
    if (cost.coins) candidates.push({ cost: { resources: cost.resources }, ignored: 'coins' });
    for (const r of new Set(cost.resources ?? [])) {
      const rest = (cost.resources ?? []).slice();
      rest.splice(rest.indexOf(r), 1);
      candidates.push({ cost: { coins: cost.coins, resources: rest }, ignored: r });
    }
    let best: Payment | null = null;
    for (const c of candidates) {
      const p = cheapestPayment(buyer, opponent, c.cost, waive, { ...opts, ignoreOne: false });
      if (!best || p.coins < best.coins) best = { ...p, ignored: c.ignored };
    }
    if (best) return best;
  }
  const { fixed, choices } = productionFor(buyer);
  const need = new Map<DuelResource, number>();
  for (const r of cost.resources ?? []) need.set(r, (need.get(r) ?? 0) + 1);
  for (const [r, n] of fixed) if (need.has(r)) need.set(r, Math.max(0, need.get(r)! - n));
  const price = new Map(DUEL_ALL_RESOURCES.map((r) => [r, priceOf(buyer, opponent, r, opts)]));

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

/** The Mythology a Grand Temple needs a token of, or null. */
export function templeMythology(card: DuelCard): DuelMythology | null {
  const eff = card.effects.find((e) => e.kind === 'grandTemple');
  return eff && eff.kind === 'grandTemple' ? eff.mythology : null;
}

/** True if the player owns what makes `card` free: the earlier card of its
 *  chain, or — a Grand Temple — a Mythology token of its type. With the
 *  Common Heritage Decree, the opponent's city counts too (`also`). */
export function hasChain(player: DuelPlayer, card: DuelCard, also?: DuelPlayer): boolean {
  const owners = also ? [player, also] : [player];
  if (card.chainFrom) return owners.some((p) => p.tableau.some((c) => c.name === card.chainFrom));
  const m = templeMythology(card);
  return !!m && owners.some((p) => (p.pantheon?.mythologyTokens ?? []).includes(m));
}

const opponentOf = (state: DuelState, seatIdx: 0 | 1) => state.players[(1 - seatIdx) as 0 | 1];

function tradeDiscount(state: DuelState, seatIdx: 0 | 1): TradeDiscount {
  return { raw: hasDecree(state, seatIdx, 'rawTrade'), goods: hasDecree(state, seatIdx, 'goodsTrade') };
}

const REBATE = { yellow: 'yellowRebate', red: 'redRebate', green: 'greenRebate' } as const;

/** What building `card` costs the seat (chain, Masonry, Decrees, Engineering and trading included). */
export function cardPayment(state: DuelState, seatIdx: 0 | 1, card: DuelCard): Payment {
  const me = state.players[seatIdx];
  const opp = opponentOf(state, seatIdx);
  if (card.color === 'senator') {
    const coins = me.progressTokens.includes('corruption') ? 0 : me.tableau.filter((c) => c.color === 'senator').length;
    return { coins, trade: 0, bought: [], waived: [], chained: false };
  }
  const shared = hasDecree(state, seatIdx, 'sharedChains') ? opp : undefined;
  if (hasChain(me, card, shared)) return { coins: 0, trade: 0, bought: [], waived: [], chained: true };
  const waive = card.color === 'blue' && me.progressTokens.includes('masonry') ? 2 : 0;
  const rebate = card.color in REBATE ? REBATE[card.color as keyof typeof REBATE] : null;
  const pay = cheapestPayment(me, opp, card.cost, waive, { ...tradeDiscount(state, seatIdx), ignoreOne: !!rebate && hasDecree(state, seatIdx, rebate) });
  if (pay.coins > 1 && (card.chainFrom || templeMythology(card)) && me.progressTokens.includes('engineering')) {
    return { coins: 1, trade: 0, bought: [], waived: [], chained: false, engineering: true };
  }
  return pay;
}

/** What building `wonder` costs the seat (Architecture, the Builders' Charter and trading included). */
export function wonderPayment(state: DuelState, seatIdx: 0 | 1, wonder: DuelWonder): Payment {
  const me = state.players[seatIdx];
  const waive = me.progressTokens.includes('architecture') ? 2 : 0;
  return cheapestPayment(me, opponentOf(state, seatIdx), wonder.cost, waive, {
    ...tradeDiscount(state, seatIdx),
    ignoreOne: hasDecree(state, seatIdx, 'wonderRebate'),
  });
}

/** Coins for discarding a card: 2 + 1 per yellow card in the city. */
export function discardCoins(player: DuelPlayer): number {
  return 2 + player.tableau.filter((c) => c.color === 'yellow').length;
}

/** Coins the seat gets for a discard (Agora's Salvage Rights add 2). */
export function discardGain(state: DuelState, seatIdx: 0 | 1): number {
  return discardCoins(state.players[seatIdx]) + (hasDecree(state, seatIdx, 'discardBonus') ? 2 : 0);
}

/** Science symbols a player holds: green cards, Law's scales, Ishtar's
 *  scales and the symbol under Nisaba's Snake. */
export function scienceSymbols(player: DuelPlayer): Map<DuelScience, number> {
  const counts = new Map<DuelScience, number>();
  const add = (s: DuelScience) => counts.set(s, (counts.get(s) ?? 0) + 1);
  for (const c of player.tableau) {
    for (const eff of c.effects) if (eff.kind === 'science') add(eff.symbol);
  }
  if (player.progressTokens.includes('law')) add('law');
  if (player.pantheon?.divinities.includes('ishtar')) add('law');
  if (player.pantheon?.snake) add(player.pantheon.snake.symbol);
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
