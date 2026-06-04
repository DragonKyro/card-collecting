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
import { RAW_RESOURCES, MANUFACTURED_RESOURCES } from './types';
import { wonderById } from './wonders';

export interface ProductionSet {
  /** Fixed (single-resource) sources: counts per resource. */
  fixed: Map<SwResource, number>;
  /** Choice sources: each entry is the list of resources you may produce. */
  choices: SwProduction[];
}

/** Compute a player's full production: built cards + wonder initial + wonder stages built. */
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
  for (let i = 0; i < player.wonderStagesBuilt; i++) {
    for (const eff of wonder.stages[i].effects) {
      if (eff.kind === 'produce') add(eff.production);
    }
  }

  // Tableau cards.
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'produce') add(eff.production);
    }
  }

  void state;
  return { fixed, choices };
}

/** Same as productionFor, but only the part that can be SOLD to neighbors —
 *  excludes the player's own wonder initial production AND excludes any
 *  resources from yellow commercial choice cards (Forum/Caravansery).
 *  Per the rulebook: only brown/gray production cards (single-resource AND
 *  multi-resource "choice" brown/gray) can be sold to neighbors; the wonder's
 *  starting resource cannot be sold, and yellow cards' choice resources are
 *  for personal use only. */
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

  // Brown + gray cards in tableau are the sellable producers.
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

/** Can the player afford the cost entirely from self-production (no neighbor
 *  purchases)? Coin part of the cost is ignored — the caller checks coins. */
export function canBuildFromSelf(state: SwState, player: SwPlayer, cost: SwCost): boolean {
  if (!cost.resources || cost.resources.length === 0) return true;
  const prod = productionFor(state, player);
  return productionCanSupply(prod, cost.resources);
}

/** Does the player have an applicable trade discount with the given neighbor? */
export function hasTradeDiscount(
  player: SwPlayer,
  side: 'east' | 'west',
  resourceKind: 'raw' | 'manufactured',
): boolean {
  for (const c of player.tableau) {
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
  const wonder = wonderById(player.wonderId);
  for (let i = 0; i < player.wonderStagesBuilt; i++) {
    for (const eff of wonder.stages[i].effects) {
      if (resourceKind === 'raw' && eff.kind === 'tradeDiscountRaw') {
        if (eff.sides.includes('both') || eff.sides.includes(side)) return true;
      }
      if (resourceKind === 'manufactured' && eff.kind === 'tradeDiscountManufactured') {
        if (eff.sides.includes('both') || eff.sides.includes(side)) return true;
      }
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
  const totalCoins = baseCoins + toWest + toEast + (payment.coins ?? 0) - (payment.coins ?? 0);

  if (player.coins < totalCoins) {
    return { ok: false, error: `Not enough coins (${player.coins} < ${totalCoins}).` };
  }
  return { ok: true, totalCoins, toWest, toEast };
}

/** Cheapest neighbor-purchase plan to fill a multiset of resources, OR null
 *  if neighbors can't between them supply enough. Used by the UI to suggest a
 *  default payment when the player can't self-produce. */
export function suggestCheapestPurchase(
  state: SwState,
  player: SwPlayer,
  needed: SwResource[],
): { fromWest: SwResource[]; fromEast: SwResource[]; coins: number } | null {
  const { west, east } = neighborsOf(state, player.id);
  const westProd = sellableProductionFor(state, west);
  const eastProd = sellableProductionFor(state, east);

  // Naive: assign each resource to whichever side is cheaper AND can supply.
  // For ties, prefer the side with FEWER existing assignments to balance.
  // Backtrack on failure.
  const fromWest: SwResource[] = [];
  const fromEast: SwResource[] = [];
  let coins = 0;

  // Track remaining capacity by simulating allocation against productionCanSupply.
  const tryAssign = (i: number, westAssigned: SwResource[], eastAssigned: SwResource[]): boolean => {
    if (i === needed.length) return true;
    const r = needed[i];
    const westPrice = neighborPurchasePrice(player, 'west', r);
    const eastPrice = neighborPurchasePrice(player, 'east', r);

    const orderedSides: Array<'west' | 'east'> = westPrice <= eastPrice
      ? ['west', 'east']
      : ['east', 'west'];
    for (const side of orderedSides) {
      const trialWest = side === 'west' ? [...westAssigned, r] : westAssigned;
      const trialEast = side === 'east' ? [...eastAssigned, r] : eastAssigned;
      if (!productionCanSupply(westProd, trialWest)) continue;
      if (!productionCanSupply(eastProd, trialEast)) continue;
      const price = side === 'west' ? westPrice : eastPrice;
      coins += price;
      if (side === 'west') fromWest.push(r); else fromEast.push(r);
      if (tryAssign(i + 1, trialWest, trialEast)) return true;
      coins -= price;
      if (side === 'west') fromWest.pop(); else fromEast.pop();
    }
    return false;
  };

  if (!tryAssign(0, [], [])) return null;
  return { fromWest, fromEast, coins };
}

/** Compute resources still needed after self-production assignments are taken
 *  greedily. Used by AI/UI: take the resources you DO produce off the cost,
 *  return what's left that must be bought. */
export function shortfall(
  state: SwState,
  player: SwPlayer,
  cost: SwCost,
): { stillNeed: SwResource[]; selfCovers: boolean } {
  const required = cost.resources ? cost.resources.slice() : [];
  if (required.length === 0) return { stillNeed: [], selfCovers: true };
  const prod = productionFor(state, player);
  // Find an assignment that covers AS MUCH as possible. Try a quick pass: for
  // each required resource, deduct one fixed; if not, try a choice. Anything
  // unassigned is shortfall.
  const fixedRem = new Map(prod.fixed);
  const choices = prod.choices.map((c) => c.slice());
  const stillNeed: SwResource[] = [];
  for (const r of required) {
    if ((fixedRem.get(r) ?? 0) > 0) {
      fixedRem.set(r, (fixedRem.get(r) ?? 0) - 1);
      continue;
    }
    // Pick the first choice source that includes this resource.
    const idx = choices.findIndex((c) => c.includes(r));
    if (idx !== -1) {
      // Lock that choice to this resource (remove it from pool).
      choices.splice(idx, 1);
      continue;
    }
    stillNeed.push(r);
  }
  return { stillNeed, selfCovers: stillNeed.length === 0 };
}

/** Convenience: compute the resources a card or wonder stage costs. */
export function costOfBuild(state: SwState, player: SwPlayer, card: SwCard): SwCost {
  void state; void player;
  return card.cost;
}

/** Convenience: shields total for a player from cards + wonder stages built. */
export function shieldsFor(player: SwPlayer): number {
  let s = 0;
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'shields') s += eff.shields;
    }
  }
  const wonder = wonderById(player.wonderId);
  for (let i = 0; i < player.wonderStagesBuilt; i++) {
    for (const eff of wonder.stages[i].effects) {
      if (eff.kind === 'shields') s += eff.shields;
    }
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

/** True if a player has a wonder stage that supplies a "build from discard" effect.
 *  We don't model this yet — exported as a hook for future expansion. */
export function hasBuildFromDiscard(_player: SwPlayer): boolean {
  return false;
}

/** A player may build a card for free if they have any of its chain-from prereqs in their tableau. */
export function canChainBuild(player: SwPlayer, card: SwCard): boolean {
  if (!card.chainFrom || card.chainFrom.length === 0) return false;
  return card.chainFrom.some((n) => tableauHasChain(player, n));
}

void MANUFACTURED_RESOURCES;
