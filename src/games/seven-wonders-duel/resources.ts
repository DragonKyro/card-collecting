// 7 Wonders Duel — production, cost, and opponent-purchase logic.
//
// Production sources: brown/gray cards' produce effects, plus wonder-stage
// produce effects from built wonders. Choice sources (e.g., a card that
// produces wood-or-clay) supply one resource per turn.
//
// Trade: a buyer can purchase one unit of resource X from the opponent's
// production. Cost = 2 + (number of X the opponent produces from
// non-choice sources). A trade discount (yellow card) flattens this to 1
// per unit of that resource KIND (raw or manufactured).
//
// Progress tokens affect costs:
//   - Architecture: wonder construction costs 2 fewer resources of any kind.
//   - Masonry: blue card costs 2 fewer resources of any kind.

import type {
  DuelCard, DuelCost, DuelPlayer, DuelProduction, DuelResource, DuelState,
  DuelWonder,
} from './types';
import { DUEL_RAW_RESOURCES } from './types';
import { wonderById } from './wonders';

export interface ProductionSet {
  fixed: Map<DuelResource, number>;
  choices: DuelProduction[];
}

export function productionFor(player: DuelPlayer): ProductionSet {
  const fixed = new Map<DuelResource, number>();
  const choices: DuelProduction[] = [];
  const add = (prods: DuelProduction[]) => {
    for (const opts of prods) {
      if (opts.length === 1) {
        fixed.set(opts[0], (fixed.get(opts[0]) ?? 0) + 1);
      } else {
        choices.push(opts);
      }
    }
  };
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'produce') add(eff.production);
    }
  }
  // Built wonders: each wonder's produce effect contributes too.
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    const wonder = wonderById(ws.wonderId);
    for (const eff of wonder.effects) {
      if (eff.kind === 'produce' && eff.production) add(eff.production);
    }
  }
  return { fixed, choices };
}

/** True if a multiset of required resources can be supplied from a production set. */
export function productionCanSupply(prod: ProductionSet, required: DuelResource[]): boolean {
  return matchAssignment(prod, required) !== null;
}

function matchAssignment(prod: ProductionSet, required: DuelResource[]): string[] | null {
  const fixedRem = new Map(prod.fixed);
  const choiceUsed = new Array(prod.choices.length).fill(false);
  const assign = new Array(required.length).fill('');
  const tryAssign = (i: number): boolean => {
    if (i === required.length) return true;
    const need = required[i];
    const f = fixedRem.get(need) ?? 0;
    if (f > 0) {
      fixedRem.set(need, f - 1);
      assign[i] = 'fixed';
      if (tryAssign(i + 1)) return true;
      fixedRem.set(need, f);
    }
    for (let j = 0; j < prod.choices.length; j++) {
      if (choiceUsed[j]) continue;
      if (!prod.choices[j].includes(need)) continue;
      choiceUsed[j] = true;
      assign[i] = `choice-${j}`;
      if (tryAssign(i + 1)) return true;
      choiceUsed[j] = false;
    }
    return false;
  };
  return tryAssign(0) ? assign : null;
}

/** Does the player have a trade discount for the given resource kind? */
export function hasTradeDiscount(player: DuelPlayer, kind: 'raw' | 'manufactured'): boolean {
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (kind === 'raw' && eff.kind === 'tradeDiscountRaw') return true;
      if (kind === 'manufactured' && eff.kind === 'tradeDiscountManufactured') return true;
    }
  }
  // Wonder effects can also grant trade discounts.
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    const wonder = wonderById(ws.wonderId);
    for (const eff of wonder.effects) {
      if (kind === 'raw' && eff.kind === 'tradeDiscountRaw') return true;
      if (kind === 'manufactured' && eff.kind === 'tradeDiscountManufactured') return true;
    }
  }
  return false;
}

/** Cost per unit of buying `resource` from the opponent. */
export function priceForResource(
  buyer: DuelPlayer,
  opponent: DuelPlayer,
  resource: DuelResource,
): number {
  const isRaw = (DUEL_RAW_RESOURCES as readonly DuelResource[]).includes(resource);
  const kind = isRaw ? 'raw' : 'manufactured';
  if (hasTradeDiscount(buyer, kind)) return 1;
  // Otherwise 2 + opponent's fixed (non-choice) production count for that resource.
  const oppProd = productionFor(opponent);
  return 2 + (oppProd.fixed.get(resource) ?? 0);
}

/** Total cost in coins to buy a list of resources from the opponent. */
export function purchaseCost(
  buyer: DuelPlayer,
  opponent: DuelPlayer,
  purchase: DuelResource[],
): number {
  let total = 0;
  for (const r of purchase) total += priceForResource(buyer, opponent, r);
  return total;
}

/** Returns a cost-modified copy after applying progress tokens (Masonry,
 *  Architecture). Costs are reduced by REMOVING resources from the cost
 *  (regardless of kind), up to `amount`. */
export function effectiveCostForCard(player: DuelPlayer, card: DuelCard): DuelCost {
  const baseCost: DuelCost = {
    coins: card.cost.coins,
    resources: card.cost.resources ? card.cost.resources.slice() : undefined,
  };
  if (card.color === 'blue' && player.progressTokens.includes('masonry')) {
    return stripResources(baseCost, 2);
  }
  return baseCost;
}

export function effectiveCostForWonder(player: DuelPlayer, wonder: DuelWonder): DuelCost {
  const baseCost: DuelCost = {
    coins: wonder.cost.coins,
    resources: wonder.cost.resources ? wonder.cost.resources.slice() : undefined,
  };
  if (player.progressTokens.includes('architecture')) {
    return stripResources(baseCost, 2);
  }
  return baseCost;
}

function stripResources(cost: DuelCost, n: number): DuelCost {
  const next: DuelCost = { coins: cost.coins };
  if (!cost.resources) return next;
  const rem = cost.resources.slice();
  for (let i = 0; i < n && rem.length > 0; i++) rem.pop();
  next.resources = rem;
  return next;
}

/** True if the player can build the card for FREE via chain. */
export function canChainBuild(player: DuelPlayer, card: DuelCard): boolean {
  if (!card.chainFrom || card.chainFrom.length === 0) return false;
  return card.chainFrom.some((n) => player.tableau.some((c) => c.name === n));
}

/** Validate a purchase + check ability to pay. Returns either { ok: true,
 *  coinsToPay } or { ok: false, error }. coinsToPay = card.coins + purchase cost. */
export function validatePurchase(
  state: DuelState,
  buyer: DuelPlayer,
  card: DuelCard,
  purchase: DuelResource[],
): { ok: true; coinsToPay: number; coinsToOpponent: number } | { ok: false; error: string } {
  if (canChainBuild(buyer, card)) {
    return { ok: true, coinsToPay: 0, coinsToOpponent: 0 };
  }
  const opponent = state.players[1 - state.players.indexOf(buyer) as 0 | 1] ?? state.players[0];
  const effCost = effectiveCostForCard(buyer, card);
  return validatePay(buyer, opponent, effCost, purchase);
}

export function validatePayWonder(
  state: DuelState,
  buyer: DuelPlayer,
  wonder: DuelWonder,
  purchase: DuelResource[],
): { ok: true; coinsToPay: number; coinsToOpponent: number } | { ok: false; error: string } {
  const opponent = state.players[1 - state.players.indexOf(buyer) as 0 | 1] ?? state.players[0];
  const effCost = effectiveCostForWonder(buyer, wonder);
  return validatePay(buyer, opponent, effCost, purchase);
}

function validatePay(
  buyer: DuelPlayer,
  opponent: DuelPlayer,
  cost: DuelCost,
  purchase: DuelResource[],
): { ok: true; coinsToPay: number; coinsToOpponent: number } | { ok: false; error: string } {
  const required = cost.resources ? cost.resources.slice() : [];
  const remaining: DuelResource[] = required.slice();
  // Remove each purchased resource from remaining.
  for (const r of purchase) {
    const idx = remaining.indexOf(r);
    if (idx === -1) {
      return { ok: false, error: `Paying for ${r} but it isn't required by the cost.` };
    }
    remaining.splice(idx, 1);
  }
  // Remaining must come from self-production.
  const buyerProd = productionFor(buyer);
  if (!productionCanSupply(buyerProd, remaining)) {
    return { ok: false, error: 'Cannot self-produce the remaining resources.' };
  }
  const coinsToOpponent = purchaseCost(buyer, opponent, purchase);
  const baseCoinCost = cost.coins ?? 0;
  return {
    ok: true,
    coinsToPay: baseCoinCost + coinsToOpponent,
    coinsToOpponent,
  };
}

/** Sum of `kind: 'coins'` effects in a list (used when a card / wonder grants
 *  coins on play). */
export function sumCoinsOnPlay(effects: { kind: string; amount?: number; coins?: number }[]): number {
  let total = 0;
  for (const eff of effects) {
    if (eff.kind === 'coins') total += eff.amount ?? eff.coins ?? 0;
  }
  return total;
}

/** Total shields a player has from tableau + built wonders. */
export function shieldsFor(player: DuelPlayer): number {
  let s = 0;
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'shields') s += eff.shields;
    }
  }
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    const wonder = wonderById(ws.wonderId);
    for (const eff of wonder.effects) {
      if (eff.kind === 'shields' && eff.shields) s += eff.shields;
    }
  }
  return s;
}
