// 7 Wonders — resource production, cost validation, neighbor purchase logic.
//
// A player's "production" is the multiset of resource sources they own.
// Single-resource sources (e.g., Lumber Yard) always produce that one. Choice
// sources (e.g., Forum, Caravansery, Alexandria stage 2) produce any one of
// their listed resources each age.
//
// Paying a cost means: pick which production source supplies each required
// resource, OR purchase from a neighbor (default 2 coins, 1 coin with a relevant
// trade discount).
//
// Wonder stages and cards both produce resources via the same mechanism: their
// effects list contains zero or more `{ kind: 'produce' }` entries.

import type {
  SwCard, SwCardEffect, SwCost, SwPayment, SwPlayer, SwProduction,
  SwResource, SwState,
} from './types';
import { RAW_RESOURCES } from './types';
import { builtStageEffects, wonderById } from './wonders';
import { getActiveExpansions } from './expansions/registry';
import type { SwCostTarget } from './expansions/types';

export interface ProductionSet {
  /** Fixed (single-resource) sources: counts per resource. */
  fixed: Map<SwResource, number>;
  /** Choice sources: each entry is the list of resources you may produce. */
  choices: SwProduction[];
}

/** Compute a player's full production: built cards + wonder initial + wonder stages built.
 *  Also folds in transient resources (Bilkis ability) and any leader-tableau produce effects. */
export function productionFor(state: SwState, player: SwPlayer): ProductionSet {
  const fixed = new Map<SwResource, number>();
  const choices: SwProduction[] = [];

  const add = (production: SwProduction[]) => {
    for (const opts of production) {
      if (opts.length === 1) {
        fixed.set(opts[0], (fixed.get(opts[0]) ?? 0) + 1);
      } else {
        choices.push(opts);
      }
    }
  };

  // Wonder initial.
  const wonder = wonderById(player.wonderId);
  add(wonder.initialProduction);

  // Wonder stages built.
  for (const eff of builtStageEffects(player)) {
    if (eff.kind === 'produce') add(eff.production);
  }

  // Tableau cards.
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'produce') add(eff.production);
    }
  }

  // Leader tableau (cards built by Leaders expansion).
  if (player.leaderTableau) {
    for (const c of player.leaderTableau) {
      for (const eff of c.effects) {
        if (eff.kind === 'produce') add(eff.production);
      }
    }
  }

  // Transient resources (Bilkis).
  if (player.transientResources && player.transientResources.length > 0) {
    for (const r of player.transientResources) {
      fixed.set(r, (fixed.get(r) ?? 0) + 1);
    }
  }

  void state;
  return { fixed, choices };
}

/** The part of a city's production its neighbours may buy: the wonder's
 *  starting resource and its brown / gray cards (choice cards included — each
 *  buyer picks one of the options). Yellow cards' and wonder stages' production
 *  is for the owner only. */
export function sellableProductionFor(_state: SwState, player: SwPlayer): ProductionSet {
  const fixed = new Map<SwResource, number>();
  const choices: SwProduction[] = [];

  const add = (production: SwProduction[]) => {
    for (const opts of production) {
      if (opts.length === 1) {
        fixed.set(opts[0], (fixed.get(opts[0]) ?? 0) + 1);
      } else {
        choices.push(opts);
      }
    }
  };

  add(wonderById(player.wonderId).initialProduction);
  for (const c of player.tableau) {
    if (c.color !== 'brown' && c.color !== 'gray') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'produce') add(eff.production);
    }
  }
  return { fixed, choices };
}

/** Returns true if the given production set can supply EVERY resource in the
 *  cost (allowing choice cards to be assigned). Helper for `canBuildFromSelf`. */
export function productionCanSupply(prod: ProductionSet, required: SwResource[]): boolean {
  return matchAssignment(prod, required) !== null;
}

/** Try to assign each required resource to a production source. Returns a list
 *  of indices `assignment[i]` meaning required[i] is supplied by:
 *    - 'fixed': consumes one fixed-resource unit
 *    - 'choice-<idx>': consumes choice source at choices[idx]
 *  Returns null if no assignment satisfies all requirements. */
function matchAssignment(prod: ProductionSet, required: SwResource[]): string[] | null {
  // Greedy with backtracking. Required is small (up to ~7), choices small too.
  const fixedRem = new Map(prod.fixed);
  const choiceUsed = new Array(prod.choices.length).fill(false);
  const assignment = new Array(required.length).fill('');

  const tryAssign = (i: number): boolean => {
    if (i === required.length) return true;
    const need = required[i];
    // Prefer fixed.
    const f = fixedRem.get(need) ?? 0;
    if (f > 0) {
      fixedRem.set(need, f - 1);
      assignment[i] = 'fixed';
      if (tryAssign(i + 1)) return true;
      fixedRem.set(need, f);
    }
    // Choice sources.
    for (let j = 0; j < prod.choices.length; j++) {
      if (choiceUsed[j]) continue;
      if (!prod.choices[j].includes(need)) continue;
      choiceUsed[j] = true;
      assignment[i] = `choice-${j}`;
      if (tryAssign(i + 1)) return true;
      choiceUsed[j] = false;
    }
    return false;
  };

  return tryAssign(0) ? assignment : null;
}

/** Does the player have an applicable trade discount with the given neighbor? */
export function hasTradeDiscount(
  player: SwPlayer,
  side: 'east' | 'west',
  resourceKind: 'raw' | 'manufactured',
): boolean {
  const sourcesToCheck = [
    ...player.tableau,
    ...(player.leaderTableau ?? []),
  ];
  for (const c of sourcesToCheck) {
    for (const eff of c.effects) {
      if (resourceKind === 'raw' && eff.kind === 'tradeDiscountRaw') {
        if (eff.sides.includes('both') || eff.sides.includes(side)) return true;
      }
      if (resourceKind === 'manufactured' && eff.kind === 'tradeDiscountManufactured') {
        if (eff.sides.includes('both') || eff.sides.includes(side)) return true;
      }
    }
  }
  // Olympia B stage 1 grants raw discount on both sides.
  for (const eff of builtStageEffects(player)) {
    if (resourceKind === 'raw' && eff.kind === 'tradeDiscountRaw') {
      if (eff.sides.includes('both') || eff.sides.includes(side)) return true;
    }
    if (resourceKind === 'manufactured' && eff.kind === 'tradeDiscountManufactured') {
      if (eff.sides.includes('both') || eff.sides.includes(side)) return true;
    }
  }
  return false;
}

/** Coin cost per unit of resource bought from `side` neighbor. */
export function neighborPurchasePrice(
  player: SwPlayer,
  side: 'east' | 'west',
  resource: SwResource,
): number {
  const isRaw = (RAW_RESOURCES as readonly SwResource[]).includes(resource);
  const kind = isRaw ? 'raw' : 'manufactured';
  return hasTradeDiscount(player, side, kind) ? 1 : 2;
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

/** Given a candidate payment, validate that:
 *   - the player owns the coins (cost.coins + sum of neighbor prices)
 *   - the resources NOT covered by neighbor purchases can be supplied by self-production
 *   - the resources bought from each neighbor are actually produced (sellable) by that neighbor
 *  Returns the total coin cost on success, or an error string on failure. */
export function validatePayment(
  state: SwState,
  player: SwPlayer,
  cost: SwCost,
  payment: SwPayment,
): { ok: true; totalCoins: number; toWest: number; toEast: number } | { ok: false; error: string } {
  const required = cost.resources ? cost.resources.slice() : [];
  const fromWest = payment.fromWest.slice();
  const fromEast = payment.fromEast.slice();

  // Remove neighbor-paid resources from required pool.
  const remaining: SwResource[] = required.slice();
  function removeOne(arr: SwResource[], r: SwResource): boolean {
    const i = arr.indexOf(r);
    if (i === -1) return false;
    arr.splice(i, 1);
    return true;
  }
  for (const r of [...fromWest, ...fromEast]) {
    if (!removeOne(remaining, r)) {
      return { ok: false, error: `Paying for ${r} but it's not part of the cost.` };
    }
  }

  // Check neighbors can produce what's being bought.
  const { west, east } = neighborsOf(state, player.id);
  const westProd = sellableProductionFor(state, west);
  const eastProd = sellableProductionFor(state, east);
  if (!productionCanSupply(westProd, fromWest)) {
    return { ok: false, error: 'West neighbor cannot supply those resources.' };
  }
  if (!productionCanSupply(eastProd, fromEast)) {
    return { ok: false, error: 'East neighbor cannot supply those resources.' };
  }

  // Check self-production for remaining.
  const selfProd = productionFor(state, player);
  if (!productionCanSupply(selfProd, remaining)) {
    return { ok: false, error: 'You cannot produce the remaining resources from your tableau.' };
  }

  // Compute total coin cost.
  const baseCoins = cost.coins ?? 0;
  let toWest = 0;
  for (const r of fromWest) toWest += neighborPurchasePrice(player, 'west', r);
  let toEast = 0;
  for (const r of fromEast) toEast += neighborPurchasePrice(player, 'east', r);
  const totalCoins = baseCoins + toWest + toEast;

  if (player.coins < totalCoins) {
    return { ok: false, error: `Not enough coins (${player.coins} < ${totalCoins}).` };
  }
  return { ok: true, totalCoins, toWest, toEast };
}

export type PaymentPlan =
  | { ok: true; payment: SwPayment; totalCoins: number; toWest: number; toEast: number }
  /** `resources`: no split of the cost can be supplied. `coins`: the cheapest
   *  one costs `totalCoins`, more than the player has. */
  | { ok: false; reason: 'resources' | 'coins'; totalCoins: number };

/** The cheapest legal way to pay `cost`: every split of its resources between
 *  your own production and what each neighbour may sell is tried (a cost is at
 *  most 7 units), pruned as soon as a part can't be supplied or costs more than
 *  the best so far. Equal prices go to the plan that buys the fewest units,
 *  then to the west neighbour. Used by the UI and the AI to build a payment. */
export function planPayment(state: SwState, player: SwPlayer, cost: SwCost): PaymentPlan {
  const baseCoins = cost.coins ?? 0;
  const counts = new Map<SwResource, number>();
  for (const r of cost.resources ?? []) counts.set(r, (counts.get(r) ?? 0) + 1);
  const types = Array.from(counts.entries());

  const self = productionFor(state, player);
  const { west, east } = neighborsOf(state, player.id);
  const westProd = sellableProductionFor(state, west);
  const eastProd = sellableProductionFor(state, east);

  const own: SwResource[] = [];
  const fromWest: SwResource[] = [];
  const fromEast: SwResource[] = [];
  let best: { fromWest: SwResource[]; fromEast: SwResource[]; coins: number } | null = null;

  const pushN = (arr: SwResource[], r: SwResource, n: number) => { for (let i = 0; i < n; i++) arr.push(r); };
  const popN = (arr: SwResource[], n: number) => { arr.length -= n; };

  const search = (ti: number, coins: number): void => {
    if (best && coins > best.coins) return;
    if (ti === types.length) {
      const bought = fromWest.length + fromEast.length;
      if (!best || coins < best.coins || bought < best.fromWest.length + best.fromEast.length) {
        best = { fromWest: fromWest.slice(), fromEast: fromEast.slice(), coins };
      }
      return;
    }
    const [r, k] = types[ti];
    const pw = neighborPurchasePrice(player, 'west', r);
    const pe = neighborPurchasePrice(player, 'east', r);
    for (let mine = k; mine >= 0; mine--) {
      pushN(own, r, mine);
      if (productionCanSupply(self, own)) {
        for (let w = k - mine; w >= 0; w--) {
          const e = k - mine - w;
          pushN(fromWest, r, w);
          pushN(fromEast, r, e);
          if (productionCanSupply(westProd, fromWest) && productionCanSupply(eastProd, fromEast)) {
            search(ti + 1, coins + w * pw + e * pe);
          }
          popN(fromEast, e);
          popN(fromWest, w);
        }
      }
      popN(own, mine);
    }
  };
  search(0, 0);

  const found = best as { fromWest: SwResource[]; fromEast: SwResource[]; coins: number } | null;
  if (!found) return { ok: false, reason: 'resources', totalCoins: baseCoins };
  const payment: SwPayment = { fromWest: found.fromWest, fromEast: found.fromEast, coins: 0 };
  const v = validatePayment(state, player, cost, payment);
  if (!v.ok) return { ok: false, reason: 'coins', totalCoins: baseCoins + found.coins };
  return { ok: true, payment, totalCoins: v.totalCoins, toWest: v.toWest, toEast: v.toEast };
}

/** Convenience: shields total for a player from cards + wonder stages + leaders. */
export function shieldsFor(player: SwPlayer): number {
  let s = 0;
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'shields') s += eff.shields;
    }
  }
  if (player.leaderTableau) {
    for (const c of player.leaderTableau) {
      for (const eff of c.effects) {
        if (eff.kind === 'shields') s += eff.shields;
      }
    }
  }
  for (const eff of builtStageEffects(player)) {
    if (eff.kind === 'shields') s += eff.shields;
  }
  return s;
}

/** Convenience: does the player have a card whose name matches the given chain name? */
export function tableauHasChain(player: SwPlayer, chainName: string): boolean {
  return player.tableau.some((c) => c.name === chainName);
}

/** Sum coin income from a list of effects (used during build + wonder-stage apply). */
export function sumCoinsOnPlay(effects: SwCardEffect[]): number {
  let coins = 0;
  for (const eff of effects) {
    if (eff.kind === 'coins') coins += eff.amount;
  }
  return coins;
}

/** A player may build a card for free if they have any of its chain-from prereqs in their tableau. */
export function canChainBuild(player: SwPlayer, card: SwCard): boolean {
  if (!card.chainFrom || card.chainFrom.length === 0) return false;
  return card.chainFrom.some((n) => tableauHasChain(player, n));
}

/** Effective cost of building something — folds in active expansions' modifyCost hooks.
 *  E.g., Leaders' Archimedes removes one resource from green cards' cost. */
export function effectiveCostFor(
  state: SwState,
  player: SwPlayer,
  target: SwCostTarget,
): SwCost {
  // Start from the raw cost.
  const baseCost: SwCost =
    target.kind === 'card' ? target.card.cost
    : target.kind === 'leader' ? target.card.cost
    : target.stage.cost;
  // Clone so modifiers don't mutate the underlying card.
  let cost: SwCost = {
    coins: baseCost.coins,
    resources: baseCost.resources ? baseCost.resources.slice() : undefined,
  };
  for (const ext of getActiveExpansions(state.config)) {
    if (!ext.modifyCost) continue;
    cost = ext.modifyCost(state, player, target, cost);
  }
  return cost;
}

