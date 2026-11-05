// 7 Wonders — resource production, costs, trading and payment.
//
// A player's "production" is the multiset of resource sources they own.
// Single-resource sources (e.g., Lumber Yard) always produce that one. Choice
// sources (Forum, Caravansery, Alexandria's stages, Secret Warehouse, Black
// Market, a Babel free-resource tile) produce any one of their listed
// resources each turn.
//
// Paying a cost means: pick which production source supplies each required
// resource, OR buy it from a neighbour (2 coins, 1 with a trading post /
// Marketplace, ±1 under some Babel tiles, never below 0; a Clandestine Dock
// takes 1 off the first unit bought from its side each turn). Leaders may let
// a few units go unpaid (`waivable`, the player's choice), and Bilkis buys any
// one resource from the bank for 1 coin.
//
// Neighbours may only buy a city's board resource and what its brown / gray
// cards produce. Effects are generic card effects read here (see types.ts);
// rules that live in an expansion's state come through its hooks
// (`productionRules`, `tradePrice`, `modifyCost`, `chainSources`).

import type {
  SwCard, SwCardEffect, SwCost, SwPayment, SwPlayer, SwProduction,
  SwResource, SwState,
} from './types';
import { ALL_RESOURCES, RAW_RESOURCES } from './types';
import { wonderById, wonderEffects } from './wonders';
import { getActiveExpansions } from './expansions/registry';
import type { SwCostTarget, SwProductionRules } from './expansions/types';

export interface ProductionSet {
  /** Fixed (single-resource) sources: counts per resource. */
  fixed: Map<SwResource, number>;
  /** Choice sources: each entry is the list of resources you may produce. */
  choices: SwProduction[];
  /** Resources available in any amount (Babel tile 20). */
  unlimited: Set<SwResource>;
}

function emptyProduction(): ProductionSet {
  return { fixed: new Map(), choices: [], unlimited: new Set() };
}

function addProduction(prod: ProductionSet, production: readonly SwProduction[]): void {
  for (const opts of production) {
    if (opts.length === 0) continue;
    if (opts.length === 1) prod.fixed.set(opts[0], (prod.fixed.get(opts[0]) ?? 0) + 1);
    else prod.choices.push(opts);
  }
}

/** The production rules in force (merged over the active expansions). */
export function productionRules(state: SwState): SwProductionRules {
  const out: SwProductionRules = {};
  for (const ext of getActiveExpansions(state.config)) {
    const r = ext.productionRules?.(state);
    if (!r) continue;
    if (r.blockMultiBrown) out.blockMultiBrown = true;
    if (r.unlimitedSingleBrown) out.unlimitedSingleBrown = true;
    if (r.disableYellowTrade) out.disableYellowTrade = true;
    if (r.freeChoices?.length) out.freeChoices = [...(out.freeChoices ?? []), ...r.freeChoices];
  }
  return out;
}

/** Every effect in force for a city: its cards, its leaders, its board and
 *  its built stages. */
export function cityEffects(player: SwPlayer): SwCardEffect[] {
  return [
    ...player.tableau.flatMap((c) => c.effects),
    ...(player.leaderTableau ?? []).flatMap((c) => c.effects),
    ...wonderEffects(player),
  ];
}

export function hasCityEffect(player: SwPlayer, kind: SwCardEffect['kind']): boolean {
  return cityEffects(player).some((e) => e.kind === kind);
}

/** Yellow cards whose trade effects a Babel tile can switch off. */
const YELLOW_TRADE_CARDS = new Set(['East Trading Post', 'West Trading Post', 'Marketplace', 'Caravansery', 'Forum']);

/** Production of a brown card under the rules: normal, none, or unlimited. */
function brownProduction(card: SwCard, production: readonly SwProduction[], rules: SwProductionRules): 'normal' | 'none' | 'unlimited' {
  if (card.color !== 'brown') return 'normal';
  const single = production.length === 1 && production[0].length === 1;
  if (!single && rules.blockMultiBrown) return 'none';
  if (single && rules.unlimitedSingleBrown) return 'unlimited';
  return 'normal';
}

/** What a city's board and brown / gray cards produce: the part neighbours
 *  may buy, and what Secret Warehouse / Black Market look at. */
function boardAndBasicProduction(state: SwState, player: SwPlayer, rules: SwProductionRules): ProductionSet {
  const prod = emptyProduction();
  if (!player.projectTokens?.resourceBlocked) addProduction(prod, wonderById(player.wonderId).initialProduction);
  for (const c of player.tableau) {
    if (c.color !== 'brown' && c.color !== 'gray') continue;
    for (const eff of c.effects) {
      if (eff.kind !== 'produce') continue;
      const mode = brownProduction(c, eff.production, rules);
      if (mode === 'none') continue;
      if (mode === 'unlimited') prod.unlimited.add(eff.production[0][0]);
      else addProduction(prod, eff.production);
    }
  }
  void state;
  return prod;
}

function producedKinds(prod: ProductionSet): Set<SwResource> {
  const out = new Set<SwResource>(prod.unlimited);
  for (const [r, n] of prod.fixed) if (n > 0) out.add(r);
  for (const opts of prod.choices) for (const r of opts) out.add(r);
  return out;
}

/** A player's full production this turn: board, stages, cards, black cards,
 *  free tiles. */
export function productionFor(state: SwState, player: SwPlayer): ProductionSet {
  const rules = productionRules(state);
  const prod = boardAndBasicProduction(state, player, rules);
  const basic = producedKinds(prod);

  // Wonder stages (Alexandria) — for the owner only.
  for (const eff of wonderEffects(player)) {
    if (eff.kind === 'produce') addProduction(prod, eff.production);
  }
  for (const c of [...player.tableau, ...(player.leaderTableau ?? [])]) {
    if (c.color === 'brown' || c.color === 'gray') continue; // counted above
    for (const eff of c.effects) {
      if (eff.kind === 'produce') {
        if (rules.disableYellowTrade && YELLOW_TRADE_CARDS.has(c.name)) continue;
        addProduction(prod, eff.production);
      } else if (eff.kind === 'produceOwned') {
        const opts = ALL_RESOURCES.filter((r) => basic.has(r));
        if (opts.length > 0) prod.choices.push(opts);
      } else if (eff.kind === 'produceMissing') {
        const opts = ALL_RESOURCES.filter((r) => !basic.has(r));
        if (opts.length > 0) prod.choices.push(opts);
      }
    }
  }
  if (rules.freeChoices) addProduction(prod, rules.freeChoices);
  return prod;
}

/** The part of a city's production its neighbours may buy: the wonder's
 *  starting resource and its brown / gray cards (choice cards included — each
 *  buyer picks one of the options). */
export function sellableProductionFor(state: SwState, player: SwPlayer): ProductionSet {
  return boardAndBasicProduction(state, player, productionRules(state));
}

/** Returns true if the given production set can supply EVERY resource in the
 *  cost (allowing choice cards to be assigned). */
export function productionCanSupply(prod: ProductionSet, required: readonly SwResource[]): boolean {
  const need = prod.unlimited.size > 0 ? required.filter((r) => !prod.unlimited.has(r)) : required;
  return matchAssignment(prod, need);
}

/** Try to assign each required resource to a production source (fixed first,
 *  then choice sources, backtracking). */
function matchAssignment(prod: ProductionSet, required: readonly SwResource[]): boolean {
  const fixedRem = new Map(prod.fixed);
  const short: SwResource[] = [];
  for (const r of required) {
    const f = fixedRem.get(r) ?? 0;
    if (f > 0) fixedRem.set(r, f - 1);
    else short.push(r);
  }
  if (short.length === 0) return true;
  if (short.length > prod.choices.length) return false;
  const used = new Array(prod.choices.length).fill(false);
  const tryAssign = (i: number): boolean => {
    if (i === short.length) return true;
    for (let j = 0; j < prod.choices.length; j++) {
      if (used[j] || !prod.choices[j].includes(short[i])) continue;
      used[j] = true;
      if (tryAssign(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return tryAssign(0);
}

/** Does the player have an applicable trade discount with the given neighbour? */
export function hasTradeDiscount(
  state: SwState,
  player: SwPlayer,
  side: 'east' | 'west',
  resourceKind: 'raw' | 'manufactured',
): boolean {
  const rules = productionRules(state);
  const want = resourceKind === 'raw' ? 'tradeDiscountRaw' : 'tradeDiscountManufactured';
  const matches = (eff: SwCardEffect) =>
    eff.kind === want && (eff.sides.includes('both') || eff.sides.includes(side));
  for (const c of [...player.tableau, ...(player.leaderTableau ?? [])]) {
    if (rules.disableYellowTrade && YELLOW_TRADE_CARDS.has(c.name)) continue;
    if (c.effects.some(matches)) return true;
  }
  // Olympia B's first stage: raw materials from both sides.
  return wonderEffects(player).some(matches);
}

/** Coin cost per unit of resource bought from the `side` neighbour. */
export function neighborPurchasePrice(
  state: SwState,
  player: SwPlayer,
  side: 'east' | 'west',
  resource: SwResource,
): number {
  const isRaw = (RAW_RESOURCES as readonly SwResource[]).includes(resource);
  let price = hasTradeDiscount(state, player, side, isRaw ? 'raw' : 'manufactured') ? 1 : 2;
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.tradePrice) price = ext.tradePrice(state, player, resource, price);
  }
  return Math.max(0, price);
}

/** Coins paid to each neighbour for these purchases, Clandestine Docks' rebate
 *  (1 off the first unit bought from that side) included. */
export function tradeCoins(
  state: SwState,
  player: SwPlayer,
  fromWest: readonly SwResource[],
  fromEast: readonly SwResource[],
): { toWest: number; toEast: number } {
  const effects = cityEffects(player);
  const rebate = (side: 'west' | 'east') => effects.filter((e) => e.kind === 'tradeRebate' && e.side === side).length;
  const side = (s: 'west' | 'east', units: readonly SwResource[]) => {
    if (units.length === 0) return 0;
    const total = units.reduce((n, r) => n + neighborPurchasePrice(state, player, s, r), 0);
    return Math.max(0, total - rebate(s));
  };
  return { toWest: side('west', fromWest), toEast: side('east', fromEast) };
}

/** Find a player's neighbors in seat order: west = -1, east = +1, wrap. */
export function neighborsOf(state: SwState, playerId: string): { west: SwPlayer; east: SwPlayer } {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) throw new Error(`Unknown player: ${playerId}`);
  const n = state.players.length;
  return {
    west: state.players[(idx - 1 + n) % n],
    east: state.players[(idx + 1) % n],
  };
}

/** Bilkis: may this city buy one resource from the bank (1 coin) this turn? */
export function canBuyFromBank(player: SwPlayer): boolean {
  return (player.leaderTableau ?? []).some((c) => c.effects.some((e) => e.kind === 'buyAnyResource'));
}

export type PaymentCheck =
  | { ok: true; totalCoins: number; toWest: number; toEast: number; toBank: number }
  | { ok: false; error: string };

function removeOne(arr: SwResource[], r: SwResource): boolean {
  const i = arr.indexOf(r);
  if (i === -1) return false;
  arr.splice(i, 1);
  return true;
}

/** Validate a payment: the resources not waived or bought are produced by the
 *  city (plus Bilkis' unit), the neighbours sell what is bought, and the
 *  coins are there (the cost's own coins + trade + 1 for Bilkis). */
export function validatePayment(
  state: SwState,
  player: SwPlayer,
  cost: SwCost,
  payment: SwPayment,
): PaymentCheck {
  const remaining: SwResource[] = cost.resources ? cost.resources.slice() : [];
  const waived = payment.waived ?? [];
  if (waived.length > (cost.waivable ?? 0)) return { ok: false, error: 'Too many resources left unpaid.' };
  const waivableFrom = (cost.waivableFrom ?? cost.resources ?? []).slice();
  for (const r of waived) {
    if (!removeOne(waivableFrom, r) || !removeOne(remaining, r)) {
      return { ok: false, error: `Leaving out ${r}, but it's not part of the cost.` };
    }
  }
  for (const r of [...payment.fromWest, ...payment.fromEast]) {
    if (!removeOne(remaining, r)) return { ok: false, error: `Paying for ${r} but it's not part of the cost.` };
  }
  if (payment.bank) {
    if (!canBuyFromBank(player)) return { ok: false, error: 'Only Bilkis buys resources from the bank.' };
    if (!removeOne(remaining, payment.bank)) return { ok: false, error: `Buying ${payment.bank} from the bank, but it's not needed.` };
  }

  const { west, east } = neighborsOf(state, player.id);
  if (!productionCanSupply(sellableProductionFor(state, west), payment.fromWest)) {
    return { ok: false, error: 'West neighbor cannot supply those resources.' };
  }
  if (!productionCanSupply(sellableProductionFor(state, east), payment.fromEast)) {
    return { ok: false, error: 'East neighbor cannot supply those resources.' };
  }
  if (!productionCanSupply(productionFor(state, player), remaining)) {
    return { ok: false, error: 'You cannot produce the remaining resources from your tableau.' };
  }

  const { toWest, toEast } = tradeCoins(state, player, payment.fromWest, payment.fromEast);
  const toBank = (cost.coins ?? 0) + (payment.bank ? 1 : 0);
  const totalCoins = toBank + toWest + toEast;
  if (player.coins < totalCoins) {
    return { ok: false, error: `Not enough coins (${player.coins} < ${totalCoins}).` };
  }
  return { ok: true, totalCoins, toWest, toEast, toBank };
}

export type PaymentPlan =
  | { ok: true; payment: SwPayment; totalCoins: number; toWest: number; toEast: number; toBank: number }
  /** `resources`: no split of the cost can be supplied. `coins`: the cheapest
   *  one costs `totalCoins`, more than the player has. */
  | { ok: false; reason: 'resources' | 'coins'; totalCoins: number };

/** Distinct multisets of `k` units out of `units`. */
function subsetsOf(units: readonly SwResource[], k: number): SwResource[][] {
  const counts = new Map<SwResource, number>();
  for (const r of units) counts.set(r, (counts.get(r) ?? 0) + 1);
  const types = Array.from(counts.entries());
  const out: SwResource[][] = [];
  const cur: SwResource[] = [];
  const walk = (ti: number, left: number) => {
    if (left === 0) { out.push(cur.slice()); return; }
    if (ti === types.length) return;
    const [r, n] = types[ti];
    for (let take = Math.min(n, left); take >= 0; take--) {
      for (let i = 0; i < take; i++) cur.push(r);
      walk(ti + 1, left - take);
      cur.length -= take;
    }
  };
  walk(0, k);
  return out;
}

/** The cheapest split of `required` between own production and the
 *  neighbours: every split is tried (a cost is at most ~8 units), pruned as
 *  soon as a part can't be supplied or costs more than the best so far.
 *  Equal prices go to the plan that buys the fewest units, then to the west. */
function cheapestSplit(
  state: SwState,
  player: SwPlayer,
  required: readonly SwResource[],
  extraOwn: SwResource | null,
): { fromWest: SwResource[]; fromEast: SwResource[]; toWest: number; toEast: number } | null {
  const counts = new Map<SwResource, number>();
  for (const r of required) counts.set(r, (counts.get(r) ?? 0) + 1);
  const types = Array.from(counts.entries());

  const self = productionFor(state, player);
  if (extraOwn) self.fixed.set(extraOwn, (self.fixed.get(extraOwn) ?? 0) + 1);
  const { west, east } = neighborsOf(state, player.id);
  const westProd = sellableProductionFor(state, west);
  const eastProd = sellableProductionFor(state, east);

  const own: SwResource[] = [];
  const fromWest: SwResource[] = [];
  const fromEast: SwResource[] = [];
  let best: { fromWest: SwResource[]; fromEast: SwResource[]; toWest: number; toEast: number } | null = null;
  const bestCoins = () => (best ? best.toWest + best.toEast : Infinity);

  const pushN = (arr: SwResource[], r: SwResource, n: number) => { for (let i = 0; i < n; i++) arr.push(r); };
  const popN = (arr: SwResource[], n: number) => { arr.length -= n; };

  const search = (ti: number): void => {
    if (ti === types.length) {
      const { toWest, toEast } = tradeCoins(state, player, fromWest, fromEast);
      const coins = toWest + toEast;
      const bought = fromWest.length + fromEast.length;
      if (!best || coins < bestCoins() || (coins === bestCoins() && bought < best.fromWest.length + best.fromEast.length)) {
        best = { fromWest: fromWest.slice(), fromEast: fromEast.slice(), toWest, toEast };
      }
      return;
    }
    const [r, k] = types[ti];
    for (let mine = k; mine >= 0; mine--) {
      pushN(own, r, mine);
      if (productionCanSupply(self, own)) {
        for (let w = k - mine; w >= 0; w--) {
          const e = k - mine - w;
          pushN(fromWest, r, w);
          pushN(fromEast, r, e);
          if (productionCanSupply(westProd, fromWest) && productionCanSupply(eastProd, fromEast)) search(ti + 1);
          popN(fromEast, e);
          popN(fromWest, w);
        }
      }
      popN(own, mine);
    }
  };
  search(0);
  return best;
}

/** The cheapest legal way to pay `cost`: every choice of the units left
 *  unpaid (`waivable`), with and without Bilkis' bank unit, then the cheapest
 *  split with the neighbours. Used by the UI and the AI to build a payment. */
export function planPayment(state: SwState, player: SwPlayer, cost: SwCost): PaymentPlan {
  const baseCoins = cost.coins ?? 0;
  const units = cost.resources ?? [];
  const waivableFrom = cost.waivableFrom ?? units;
  const waiveCount = Math.min(cost.waivable ?? 0, waivableFrom.length);
  const waives = waiveCount > 0 ? subsetsOf(waivableFrom, waiveCount) : [[]];
  const bankOptions: Array<SwResource | null> = [null];
  if (canBuyFromBank(player)) for (const r of new Set(units)) bankOptions.push(r);

  let best: { payment: SwPayment; toWest: number; toEast: number; toBank: number; bought: number } | null = null;
  for (const waived of waives) {
    const left = units.slice();
    for (const r of waived) removeOne(left, r);
    for (const bank of bankOptions) {
      const need = left.slice();
      if (bank && !removeOne(need, bank)) continue;
      const split = cheapestSplit(state, player, need, null);
      if (!split) continue;
      const toBank = baseCoins + (bank ? 1 : 0);
      const total = toBank + split.toWest + split.toEast;
      const bought = split.fromWest.length + split.fromEast.length + (bank ? 1 : 0);
      const bestTotal = best ? best.toBank + best.toWest + best.toEast : Infinity;
      if (!best || total < bestTotal || (total === bestTotal && bought < best.bought)) {
        best = {
          payment: {
            fromWest: split.fromWest, fromEast: split.fromEast, coins: 0,
            ...(waived.length > 0 ? { waived } : {}),
            ...(bank ? { bank } : {}),
          },
          toWest: split.toWest, toEast: split.toEast, toBank, bought,
        };
      }
    }
  }
  if (!best) return { ok: false, reason: 'resources', totalCoins: baseCoins };
  const totalCoins = best.toBank + best.toWest + best.toEast;
  if (player.coins < totalCoins) return { ok: false, reason: 'coins', totalCoins };
  return { ok: true, payment: best.payment, totalCoins, toWest: best.toWest, toEast: best.toEast, toBank: best.toBank };
}

/** Shields: cards, leaders, built stages, Great Project shield tokens, and
 *  (Semiramis) each defeat token. */
export function shieldsFor(player: SwPlayer): number {
  let s = 0;
  let defeatsCount = false;
  for (const eff of cityEffects(player)) {
    if (eff.kind === 'shields') s += eff.shields;
    else if (eff.kind === 'defeatAsShield') defeatsCount = true;
  }
  s += player.projectTokens?.shields ?? 0;
  if (defeatsCount) s += player.militaryTokens.filter((t) => t < 0).length;
  return s;
}

/** Does any city the player may chain from hold this card name? */
export function canChainBuild(state: SwState, player: SwPlayer, card: SwCard): boolean {
  if (!card.chainFrom || card.chainFrom.length === 0) return false;
  const sources = [...player.tableau];
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.chainSources) sources.push(...ext.chainSources(state, player));
  }
  return card.chainFrom.some((n) => sources.some((c) => c.name === n));
}

/** Sum coin income from a list of effects (used during build + wonder-stage apply). */
export function sumCoinsOnPlay(effects: readonly SwCardEffect[]): number {
  let coins = 0;
  for (const eff of effects) {
    if (eff.kind === 'coins') coins += eff.amount;
  }
  return coins;
}

/** Effective cost of building something: the printed cost, the city's own
 *  discounts (Leaders' one-resource-less, Ramses, Architect Cabinet,
 *  Maecenas / Rome), then active expansions' `modifyCost` (Babel tiles). A
 *  chain build starts from nothing. */
export function effectiveCostFor(
  state: SwState,
  player: SwPlayer,
  target: SwCostTarget,
): SwCost {
  const printed: SwCost =
    target.kind === 'chain' ? {}
    : target.kind === 'wonderStage' ? target.stage.cost
    : target.card.cost;
  let cost: SwCost = {
    coins: printed.coins,
    resources: printed.resources ? printed.resources.slice() : undefined,
  };

  for (const eff of cityEffects(player)) {
    switch (eff.kind) {
      case 'costDiscount':
        if ((eff.target === 'wonderStage' && target.kind === 'wonderStage')
          || (eff.target === 'cardColor' && target.kind === 'card' && target.card.color === eff.color)) {
          cost.waivable = (cost.waivable ?? 0) + 1;
        }
        break;
      case 'freeGuildResources':
        if (target.kind === 'card' && target.card.color === 'purple') cost.resources = [];
        break;
      case 'freeWonderResources':
        if (target.kind === 'wonderStage') cost.resources = [];
        break;
      case 'freeLeaders':
        if (target.kind === 'leader') cost.coins = 0;
        break;
      case 'leaderRebate':
        if (target.kind === 'leader') cost.coins = Math.max(0, (cost.coins ?? 0) - eff.self);
        break;
      default: break;
    }
  }
  // Rome B's board: the neighbours' leaders cost them 1 coin less.
  if (target.kind === 'leader') {
    const { west, east } = neighborsOf(state, player.id);
    for (const n of west.id === east.id ? [west] : [west, east]) {
      if (n.id === player.id) continue;
      for (const eff of wonderEffects(n)) {
        if (eff.kind === 'leaderRebate') cost.coins = Math.max(0, (cost.coins ?? 0) - eff.neighbors);
      }
    }
  }
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.modifyCost) cost = ext.modifyCost(state, player, target, cost);
  }
  return cost;
}

/** Combine two costs (a card and a Great Project participation). */
export function addCosts(a: SwCost, b: SwCost | null): SwCost {
  if (!b) return a;
  return {
    coins: (a.coins ?? 0) + (b.coins ?? 0),
    resources: [...(a.resources ?? []), ...(b.resources ?? [])],
    ...(a.waivable ? { waivable: a.waivable, waivableFrom: a.waivableFrom ?? a.resources ?? [] } : {}),
  };
}
