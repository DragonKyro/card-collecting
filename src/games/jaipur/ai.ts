// Jaipur — hand-written heuristic AI (the "vs AI" opponent until trained
// policies ship, and a fixed training baseline afterwards).
//
// It plays from the seat's observation (nn/observation.ts), so it never sees
// the deck, the opponent's unseen cards or their bonus values. Every distinct
// legal move (rules.legalMoves) is scored one ply deep by the estimated rupee
// margin it leaves:
//
//   rupees     realized now (a sale's bonus at the expected unseen value)
//   potential  each holding at the price it would sell for later — sliding
//              down the pile if the opponent is known to hold the same good —
//              discounted for the risk of never selling it (more so as the
//              round nears its end), plus the camel race and camels as
//              trading stock. The opponent's known cards are valued the same
//              way, unknown ones at a flat rate.
//   exposure   the best single move the resulting market offers the
//              opponent; refills from the deck count at their expected worth.
//
// A move that ends the round (the third empty pile, or a refill the deck
// can't make) is scored on the final margin with a large win / loss bonus,
// so the AI closes rounds it leads and avoids closing rounds it trails.
// Deterministic: ties go to the first move in legalMoves order.

import type { PlayerId } from '@/core/types';
import type { JaipurAction, JaipurBonusSize, JaipurGood, JaipurState } from './types';
import {
  BONUS_MEAN, BONUS_SIZES, CAMEL_TOKEN, CARD_TYPES, EMPTY_PILES_TO_END, GOODS, HAND_LIMIT, PRECIOUS, bonusSizeFor,
} from './cards';
import { countCards, legalMoves, sumGoods, type Counts, type GoodCounts, type JaipurMove } from './rules';
import { observe, obsTradeContext, type JaipurObservation } from './nn/observation';
import { exchangeAction } from './nn/actions';

/** The heuristic's weights (training/jaipur's `heuristic:k=v,...` agent spec overrides them). */
export interface HeuristicParams {
  /** A holding's worth as a fraction of its sale price, mid-round. */
  holdDiscount: number;
  /** Extra discount once the deck is nearly out / two piles are empty. */
  lateDiscount: number;
  /** Chance per known rival card of the same good that they sell first. */
  rivalFirst: number;
  /** How much of the opponent's best next move counts against a move. */
  exposure: number;
  /** Worth of each card of the opponent's the viewer can't name. */
  unknownCard: number;
  fullHandPenalty: number;
  /** Camels as trading stock, each (up to `camelStockCap`). */
  camelStock: number;
  camelStockCap: number;
  /** Bonus / penalty for ending a round ahead / behind. */
  winBonus: number;
}

/** Tuned by seat-swapped self-play (1000 matches per probe): this set beat the
 *  first guess (hold 0.75, late 0.6, camel stock 0.5, full-hand penalty 1.5)
 *  73%, and no single-weight change around it moved the score outside noise
 *  except a higher holdDiscount (0.95: 45%, 1.0: 30%). */
export const DEFAULT_HEURISTIC: HeuristicParams = {
  holdDiscount: 0.9,
  lateDiscount: 0.8,
  rivalFirst: 0.2,
  exposure: 0.6,
  unknownCard: 1.5,
  fullHandPenalty: 0,
  camelStock: 0.25,
  camelStockCap: 6,
  winBonus: 25,
};

interface Side {
  hand: GoodCounts;
  /** Cards not counted in `hand` (the opponent's unknown cards). */
  extra: number;
  herd: number;
  rupees: number;
}

interface World {
  p: HeuristicParams;
  tokens: Record<JaipurGood, number[]>;
  bonusEv: Record<JaipurBonusSize, number>;
  bonusLeft: Record<JaipurBonusSize, number>;
  market: Counts;
  /** Deck refill odds per card type. */
  unseen: Counts;
  deckSize: number;
  emptyPiles: number;
}

const sum = (v: readonly number[]) => v.reduce((a, b) => a + b, 0);
const handSize = (s: Side) => sumGoods(s.hand) + s.extra;

export function chooseJaipurAction(state: JaipurState, playerId: PlayerId, params = DEFAULT_HEURISTIC): JaipurAction | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'roundEnd') {
    // Click through the round summary only when no human needs to read it.
    return state.seats.every((s) => s.isAI) ? { type: 'nextRound' } : null;
  }
  if (state.activePlayerId !== playerId) return null;
  const obs = observe(state, playerId);
  const move = bestMove(obs, params);
  return move ? moveToAction(obs, move) : null;
}

/** The highest-scoring legal move for the viewer (null if it isn't their turn). */
export function bestMove(obs: JaipurObservation, params = DEFAULT_HEURISTIC): JaipurMove | null {
  if (!obs.decision) return null;
  let best: JaipurMove | null = null;
  let bestScore = -Infinity;
  for (const m of legalMoves(obsTradeContext(obs))) {
    const score = scoreMove(obs, m, params);
    if (score > bestScore + 1e-9) {
      best = m;
      bestScore = score;
    }
  }
  return best;
}

export function moveToAction(obs: JaipurObservation, m: JaipurMove): JaipurAction {
  switch (m.kind) {
    case 'takeOne':
      return { type: 'takeOne', cardId: obs.market.find((c) => c.type === m.good)!.id };
    case 'takeCamels':
      return { type: 'takeCamels' };
    case 'sell':
      return { type: 'sell', cardIds: obs.hand.filter((c) => c.type === m.good).slice(0, m.count).map((c) => c.id) };
    case 'exchange':
      return exchangeAction(obs, { take: m.take, give: m.give, stage: 'give' });
  }
}

/** Estimated rupee margin (viewer − opponent) after the move. */
export function scoreMove(obs: JaipurObservation, m: JaipurMove, p = DEFAULT_HEURISTIC): number {
  const ev = {} as Record<JaipurBonusSize, number>;
  for (const size of BONUS_SIZES) {
    const pool = obs.unseenBonus[size];
    ev[size] = pool.length ? sum(pool) / pool.length : BONUS_MEAN[size];
  }
  const world: World = {
    p,
    tokens: Object.fromEntries(GOODS.map((g) => [g, obs.tokens[g].slice()])) as World['tokens'],
    bonusEv: ev,
    bonusLeft: { ...obs.bonusLeft },
    market: countCards(obs.market),
    unseen: { ...obs.unseen },
    deckSize: obs.deckSize,
    emptyPiles: obs.emptyPiles,
  };
  const hand = countCards(obs.hand);
  const me: Side = {
    hand: Object.fromEntries(GOODS.map((g) => [g, hand[g]])) as GoodCounts,
    extra: 0,
    herd: obs.herd.length,
    rupees: sum(obs.goodsTokens) + sum(obs.bonusTokens.map((t) => t.value)),
  };
  const opp: Side = {
    hand: { ...obs.opponent.known },
    extra: obs.opponent.unknown,
    herd: obs.opponent.herd,
    rupees: sum(obs.opponent.goodsTokens)
      + BONUS_SIZES.reduce((s, size) => s + obs.opponent.bonusCounts[size] * ev[size], 0),
  };

  let refills = 0;
  let endsRound = false;
  switch (m.kind) {
    case 'takeOne':
      me.hand[m.good]++;
      world.market[m.good]--;
      refills = 1;
      break;
    case 'takeCamels':
      refills = world.market.camel;
      me.herd += refills;
      world.market.camel = 0;
      break;
    case 'exchange':
      for (const g of GOODS) {
        me.hand[g] += m.take[g] - m.give[g];
        world.market[g] += m.give[g] - m.take[g];
      }
      me.herd -= m.give.camel;
      world.market.camel += m.give.camel;
      break;
    case 'sell': {
      const toks = world.tokens[m.good];
      me.rupees += sum(toks.slice(0, m.count));
      world.tokens[m.good] = toks.slice(m.count);
      if (toks.length > 0 && world.tokens[m.good].length === 0) world.emptyPiles++;
      const size = bonusSizeFor(m.count);
      if (size && world.bonusLeft[size] > 0) {
        me.rupees += world.bonusEv[size];
        world.bonusLeft[size]--;
      }
      me.hand[m.good] -= m.count;
      endsRound = world.emptyPiles >= EMPTY_PILES_TO_END;
      break;
    }
  }
  if (refills > world.deckSize) endsRound = true;

  if (endsRound) {
    const camel = Math.sign(me.herd - opp.herd) * CAMEL_TOKEN;
    const margin = me.rupees - opp.rupees + camel;
    return margin + Math.sign(margin) * p.winBonus;
  }
  world.deckSize -= refills;
  const margin = me.rupees + potential(me, opp, world) - opp.rupees - potential(opp, me, world);
  return margin - p.exposure * expectedOpportunity(opp, me, world, refills);
}

/** How much a holding is still worth, as a fraction of its sale price. */
function holdDiscount(world: World): number {
  const { holdDiscount, lateDiscount } = world.p;
  let d = holdDiscount;
  if (world.deckSize <= 4) d *= lateDiscount;
  else if (world.deckSize <= 10) d *= (1 + lateDiscount) / 2;
  if (world.emptyPiles >= EMPTY_PILES_TO_END - 1) d *= (1 + lateDiscount) / 2;
  return d;
}

/** Sale price of `k` cards of `g`, `skip` tokens down the pile. */
function salePrice(world: World, g: JaipurGood, k: number, skip: number): number {
  const toks = world.tokens[g];
  let v = sum(toks.slice(skip, skip + k));
  const size = bonusSizeFor(k);
  if (size && world.bonusLeft[size] > 0) v += world.bonusEv[size];
  return v;
}

/** What holding `k` of `g` is worth to a player whose rival holds `rivalK`. */
function holdValue(world: World, g: JaipurGood, k: number, rivalK: number): number {
  if (k <= 0) return 0;
  const toks = world.tokens[g];
  if (PRECIOUS.has(g) && k === 1) return 0.4 * (toks[0] ?? 0) * holdDiscount(world);
  // The rival may well sell first and take the top of the pile.
  const pFirst = Math.min(0.6, world.p.rivalFirst * rivalK);
  const value = (1 - pFirst) * salePrice(world, g, k, 0) + pFirst * salePrice(world, g, k, Math.min(rivalK, toks.length));
  return value * holdDiscount(world);
}

function camelValue(world: World, herd: number, rivalHerd: number): number {
  const share = Math.max(0, Math.min(1, 0.5 + 0.12 * (herd - rivalHerd)));
  return CAMEL_TOKEN * share + world.p.camelStock * Math.min(herd, world.p.camelStockCap);
}

function potential(side: Side, rival: Side, world: World): number {
  let v = 0;
  for (const g of GOODS) v += holdValue(world, g, side.hand[g], rival.hand[g]);
  v += camelValue(world, side.herd, rival.herd);
  v += side.extra * world.p.unknownCard * holdDiscount(world);
  if (handSize(side) >= HAND_LIMIT) v -= world.p.fullHandPenalty;
  return v;
}

/** The best single gain the market offers `side` next turn. */
function opportunity(side: Side, rival: Side, world: World): number {
  let best = 0;
  const size = handSize(side);
  for (const g of GOODS) {
    const m = world.market[g];
    if (m === 0) continue;
    const have = side.hand[g];
    const base = holdValue(world, g, have, rival.hand[g]);
    if (size < HAND_LIMIT) best = Math.max(best, holdValue(world, g, have + 1, rival.hand[g]) - base);
    // Several of a good: an exchange for camels.
    if (m >= 2 && side.herd >= m && size + m <= HAND_LIMIT) {
      const cost = camelValue(world, side.herd, rival.herd) - camelValue(world, side.herd - m, rival.herd);
      best = Math.max(best, holdValue(world, g, have + m, rival.hand[g]) - base - cost);
    }
  }
  if (world.market.camel > 0) {
    best = Math.max(best, camelValue(world, side.herd + world.market.camel, rival.herd) - camelValue(world, side.herd, rival.herd));
  }
  return best;
}

/** `opportunity`, averaging over what the deck may put into `refills` slots. */
function expectedOpportunity(side: Side, rival: Side, world: World, refills: number): number {
  if (refills === 0) return opportunity(side, rival, world);
  const total = CARD_TYPES.reduce((s, t) => s + world.unseen[t], 0);
  if (total === 0) return opportunity(side, rival, world);
  let e = 0;
  for (const t of CARD_TYPES) {
    if (world.unseen[t] === 0) continue;
    world.market[t]++;
    e += (world.unseen[t] / total) * opportunity(side, rival, world);
    world.market[t]--;
  }
  return e + (refills - 1) * 0.6;
}
