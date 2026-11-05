// 7 Wonders AI — one-ply heuristic.
//
// Every legal option this turn is valued in victory-point equivalents and the
// best one is played:
//   - build a card: at the cheapest payment plan, free through a chain, or
//     with a free build (Olympia A, Caligula, a Great Project token) — each
//     also with a Great Project participation when the card's colour allows;
//   - build the next wonder stage, tucking the hand's least useful card (paid,
//     or with a free-stage token);
//   - sell the least useful card for 3 coins;
//   - an expansion's own use of a card (a Babel tile), valued by the expansion.
// A card's value = the exact change in our score if it stood in our city now
// (VP, science sets with wilds and masks, counts as the table is now, every
// expansion column) + what it is worth later (resources and trade discounts
// early on; shields as the change in expected tokens from both neighbours at
// every Age end still to come; chains into next-Age cards; science's room to
// grow; guild counts still growing) − its price, coins converted at an
// Age-dependent rate. A stage is valued the same way from its effects.
// Halicarnassus builds the discard card worth the most.
//
// The weights (MILITARY_WEIGHT, production's base value) were tuned in
// seat-alternated matches against the previous build-the-best-card heuristic,
// which this one beats in ~80% of 3–7 player games (+7 to +9 VP per city).

import type { PlayerId } from '@/core/types';
import type {
  SwAction, SwAge, SwCard, SwCardEffect, SwPendingPick, SwPlayer, SwProduction,
  SwResource, SwState, SwWonderStage,
} from './types';
import { MANUFACTURED_RESOURCES, RAW_RESOURCES } from './types';
import { wonderById } from './wonders';
import {
  canChainBuild, neighborsOf, planPayment, productionFor,
  sellableProductionFor, shieldsFor, sumCoinsOnPlay,
} from './resources';
import { coinsOnPlayForEndVp, copyableGuilds, scorePlayer } from './scoring';
import { discardBuildOptions, freeBuildsFor, picksPerAge, pickCostFor } from './reducer';
import { getActiveExpansions } from './expansions/registry';
import { aggregateExtras } from './expansions/types';

const AGE_WIN_VP: Record<SwAge, number> = { 1: 1, 2: 3, 3: 5 };

/** What a coin is worth in VP: more while it can still buy resources, a third
 *  of a VP (treasury) at the very end. */
export function coinValue(state: SwState): number {
  if (state.age === 1) return 0.5;
  if (state.age === 2) return 0.45;
  return state.ageRound >= picksPerAge(state) - 1 ? 1 / 3 : 0.38;
}

/** Picks left in this Age after the current one. */
export function picksLeft(state: SwState): number {
  return Math.max(0, picksPerAge(state) - state.ageRound);
}

/** Ages still to be played after this one. */
function agesAfter(state: SwState): number {
  return 3 - state.age;
}

/** Current score of `virtual` in place of its city (base + expansion extras). */
export function scoreOf(state: SwState, virtual: SwPlayer): number {
  const s: SwState = { ...state, players: state.players.map((x) => (x.id === virtual.id ? virtual : x)) };
  return scorePlayer(s, virtual).total + aggregateExtras(getActiveExpansions(state.config), s, virtual).total;
}

/** Current score of `p`, optionally as if `card` stood in its city, a leader
 *  were recruited or one more wonder stage were built. */
export function scoreIf(state: SwState, p: SwPlayer, change?: { card?: SwCard; leader?: SwCard; stage?: boolean; remove?: SwCard }): number {
  const virtual: SwPlayer = {
    ...p,
    tableau: change?.card ? [...p.tableau, change.card]
      : change?.remove ? p.tableau.filter((c) => c.id !== change.remove!.id) : p.tableau,
    leaderTableau: change?.leader ? [...(p.leaderTableau ?? []), change.leader] : p.leaderTableau,
    wonderStagesBuilt: p.wonderStagesBuilt + (change?.stage ? 1 : 0),
  };
  return scoreOf(state, virtual);
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
function normCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Expected token from one battle when we lead by `d` shields today and the
 *  gap still moves by about ±sigma before it is fought. */
function battleEv(d: number, sigma: number, ageVp: number): number {
  return ageVp * normCdf((d - 0.5) / sigma) - normCdf((-d - 0.5) / sigma);
}

/** What `shields` more are worth: the change in expected tokens from both
 *  neighbours at every Age end still to come (shields keep counting), each
 *  battle the less certain the more picks stand between now and it. Scaled up
 *  because rivals answer an arms race rather than move at random. */
export function militaryValue(state: SwState, p: SwPlayer, shields: number): number {
  const my = shieldsFor(p);
  const { west, east } = neighborsOf(state, p.id);
  const per = picksPerAge(state);
  let v = 0;
  for (let age = state.age; age <= 3; age++) {
    const picks = per + 1 - state.ageRound + per * (age - state.age); // this one included
    const sigma = 0.35 + 0.45 * picks;
    for (const n of [west, east]) {
      const d = my - shieldsFor(n);
      v += battleEv(d + shields, sigma, AGE_WIN_VP[age as SwAge]) - battleEv(d, sigma, AGE_WIN_VP[age as SwAge]);
    }
  }
  return v * MILITARY_WEIGHT;
}

const MILITARY_WEIGHT = 3;

/** Value of new production: a resource we lack is worth most, early on —
 *  every later card's cost depends on it. */
function produceValue(state: SwState, p: SwPlayer, production: readonly SwProduction[], sellable: boolean): number {
  if (state.age === 3) return 0.2 * production.length;
  const base = state.age === 1 ? 4 : 2.6;
  const own = productionFor(state, p);
  const { west, east } = neighborsOf(state, p.id);
  const westSells = sellableProductionFor(state, west);
  const eastSells = sellableProductionFor(state, east);
  const have = (r: SwResource) => (own.unlimited.has(r) ? 9 : 0) + (own.fixed.get(r) ?? 0) + 0.5 * own.choices.filter((c) => c.includes(r)).length;
  const sold = (r: SwResource) => (westSells.fixed.get(r) ?? 0) + (eastSells.fixed.get(r) ?? 0)
    + westSells.choices.filter((c) => c.includes(r)).length + eastSells.choices.filter((c) => c.includes(r)).length;
  const need = (r: SwResource) => {
    const h = have(r);
    const manufactured = (MANUFACTURED_RESOURCES as readonly SwResource[]).includes(r);
    let n = h === 0 ? 1 : h < 1.5 ? (manufactured ? 0.25 : 0.55) : 0.2;
    if (sold(r) === 0) n += 0.3;
    return n;
  };
  let v = 0;
  for (const opts of production) {
    if (opts.length === 0) continue;
    const best = Math.max(...opts.map(need));
    v += base * (best + (opts.length > 1 ? 0.15 : 0));
  }
  // Brown / gray producers also earn coins from the neighbours.
  return v + (sellable ? 0.3 : 0);
}

/** Value of a trade discount: worth what the relevant neighbours sell. */
function tradeValue(state: SwState, p: SwPlayer, sides: readonly ('east' | 'west' | 'both')[], goods: readonly SwResource[]): number {
  const base = state.age === 1 ? 1.8 : state.age === 2 ? 1.0 : 0.3;
  const { west, east } = neighborsOf(state, p.id);
  const sellers = [
    ...(sides.some((s) => s === 'west' || s === 'both') ? [west] : []),
    ...(sides.some((s) => s === 'east' || s === 'both') ? [east] : []),
  ];
  let v = 0;
  for (const n of sellers) {
    const prod = sellableProductionFor(state, n);
    const sells = goods.some((r) => (prod.fixed.get(r) ?? 0) > 0 || prod.choices.some((c) => c.includes(r)));
    v += base * (sells ? 0.6 : 0.25);
  }
  return v;
}

/** Forward-looking worth of the effects that the score delta doesn't see. */
function effectsFutureValue(state: SwState, p: SwPlayer, effects: readonly SwCardEffect[], sellable: boolean): number {
  let v = 0;
  const others = state.players.length - 1;
  for (const eff of effects) {
    switch (eff.kind) {
      case 'shields': v += militaryValue(state, p, eff.shields); break;
      case 'produce': v += produceValue(state, p, eff.production, sellable); break;
      case 'produceOwned': case 'produceMissing':
        v += state.age === 3 ? 0.3 : state.age === 1 ? 2.6 : 1.6;
        break;
      case 'tradeDiscountRaw': v += tradeValue(state, p, eff.sides, RAW_RESOURCES); break;
      case 'tradeDiscountManufactured': v += tradeValue(state, p, eff.sides, MANUFACTURED_RESOURCES); break;
      case 'tradeRebate': v += tradeValue(state, p, [eff.side], [...RAW_RESOURCES, ...MANUFACTURED_RESOURCES]) * 0.8; break;
      case 'science': case 'scienceWild': case 'mask':
        // A symbol is worth more than its points today: sets and squares grow.
        v += state.age === 1 ? 2 : state.age === 2 ? 1.2 : 0;
        break;
      case 'endVp':
        // Counts that the neighbours can still raise this Age.
        if (eff.vpPer && eff.from !== 'self') v += 0.2 * eff.vpPer * picksLeft(state);
        break;
      case 'diplomacy':
        // Sitting a conflict out is worth what we'd lose in it.
        v += 0.6 + Math.max(0, -militaryValue(state, p, -2) / MILITARY_WEIGHT);
        break;
      case 'freeWonderResources': {
        const left = wonderById(p.wonderId).stages.length - p.wonderStagesBuilt;
        v += 1.4 * Math.max(0, left);
        break;
      }
      case 'coinLoss':
        // What it costs the others is a little worth to us.
        v += 0.12 * eff.amount * others * (eff.per ? 1.5 : 1);
        break;
      case 'neighborsGain': v -= 0.1 * eff.amount * 2; break;
      default: break;
    }
  }
  return v;
}

/** Coins a card pays out when built now (flat + per counted card). */
function onPlayCoins(state: SwState, p: SwPlayer, card: SwCard): number {
  let coins = sumCoinsOnPlay(card.effects);
  const virtual: SwPlayer = { ...p, tableau: [...p.tableau, card] };
  const s: SwState = { ...state, players: state.players.map((x) => (x.id === p.id ? virtual : x)) };
  for (const eff of card.effects) if (eff.kind === 'endVp') coins += coinsOnPlayForEndVp(s, virtual, eff);
  return coins;
}

/** What a card is worth to `p` once built, before its price. */
export function cardValue(state: SwState, p: SwPlayer, card: SwCard): number {
  if (p.tableau.some((c) => c.name === card.name)) return -Infinity;
  let v = scoreIf(state, p, { card }) - scoreIf(state, p);
  v += onPlayCoins(state, p, card) * coinValue(state);
  v += effectsFutureValue(state, p, card.effects, card.color === 'brown' || card.color === 'gray');
  // Chains: the next-Age card it makes free.
  if (state.age < 3) {
    const open = (card.chainTo ?? []).filter((n) => !p.tableau.some((c) => c.name === n));
    v += Math.min(open.length, 2) * (state.age === 1 ? 1.2 : 1);
  }
  return v;
}

/** What building the next stage is worth (effects + power), before its price. */
export function stageValue(state: SwState, p: SwPlayer, stage: SwWonderStage, stageIdx: number): number {
  let v = scoreIf(state, p, { stage: true }) - scoreIf(state, p);
  v += sumCoinsOnPlay(stage.effects) * coinValue(state);
  v += effectsFutureValue(state, p, stage.effects, false);
  const agesLeft = agesAfter(state);
  for (const eff of stage.effects) {
    switch (eff.kind) {
      case 'buildFromDiscard': {
        const best = Math.max(0, ...discardBuildOptions(state, p).map((c) => cardValue(state, p, c)));
        v += Math.max(best, state.ageRound >= picksPerAge(state) ? 2 : 1);
        break;
      }
      case 'playLastCard': v += 2.5 * (agesLeft + (state.ageRound <= picksPerAge(state) ? 1 : 0)); break;
      case 'freeBuildPerAge': v += 3 * (agesLeft + (state.ageRound < picksPerAge(state) ? 1 : 0)); break;
      case 'copyGuild': {
        const best = Math.max(0, ...copyableGuilds(state, p).map((g) => scoreIf(state, p, { card: g }) - scoreIf(state, p)));
        v += state.age === 3 ? Math.max(best, 2 * picksLeft(state) / 6 * 4) : 4;
        break;
      }
      case 'drawLeaders': v += 1.2 * Math.min(eff.count, state.leaderDeck?.length ?? 0) * (agesLeft + 0.5) / 3; break;
      case 'recruitNow': v += (p.leaderHand?.length ?? 0) > 0 ? 2.5 : 0; break;
      default: break;
    }
  }
  // Later stages are built on this one.
  if (stageIdx + 1 < wonderById(p.wonderId).stages.length) v += 0.8;
  return v;
}

// ---------------------------------------------------------------------------
// Options

interface Option { value: number; pick: SwPendingPick }

const NO_PAYMENT = { fromWest: [], fromEast: [], coins: 0 };

/** Price a pick: null if it can't be paid. */
function price(state: SwState, p: SwPlayer, pick: SwPendingPick, card: SwCard): { pick: SwPendingPick; coins: number; trade: number } | null {
  const cost = pickCostFor(state, p, pick, card);
  if (!cost || ((cost.coins ?? 0) === 0 && (cost.resources?.length ?? 0) === 0)) return { pick, coins: 0, trade: 0 };
  const plan = planPayment(state, p, cost);
  if (!plan.ok) return null;
  return { pick: { ...pick, payment: plan.payment } as SwPendingPick, coins: plan.totalCoins, trade: plan.toWest + plan.toEast };
}

/** Every way to play `card` as a build, with its net value. */
function buildOptions(state: SwState, p: SwPlayer, card: SwCard, worth: number): Option[] {
  if (!Number.isFinite(worth)) return [];
  const cv = coinValue(state);
  const out: Option[] = [];
  const exts = getActiveExpansions(state.config);
  const canJoin = exts.some((e) => e.pickCost);
  const variants: SwPendingPick[] = [{ kind: 'build', cardId: card.id, payment: NO_PAYMENT }];
  const chain = canChainBuild(state, p, card);
  for (const free of freeBuildsFor(state, p, card)) {
    // Spend a free build on a card that would cost something.
    if (chain) continue;
    variants.push({ kind: 'build', cardId: card.id, payment: NO_PAYMENT, free });
  }
  for (const base of variants) {
    for (const participate of canJoin ? [false, true] : [false]) {
      const pick: SwPendingPick = participate ? { ...base, participate: true } as SwPendingPick : base;
      if (participate) {
        try {
          // Validation of the participation (colour, tokens, once a turn).
          for (const ext of exts) ext.validatePick?.(state, p, pick, card);
        } catch { continue; }
      }
      const priced = price(state, p, pick, card);
      if (!priced) continue;
      let value = worth - priced.coins * cv - priced.trade * 0.1;
      for (const ext of exts) value += ext.aiPickValue?.(state, p, pick, card) ?? 0;
      if (pick.kind === 'build' && pick.free) {
        const kind = pick.free === true ? 'olympia' : pick.free;
        const token = kind === 'olympia' ? (state.ageRound <= 4 ? 1.5 : state.ageRound === 5 ? 0.8 : 0)
          : kind === 'token' ? (state.age === 3 && picksLeft(state) <= 1 ? 0 : 2.5)
          : 0.5;
        value -= token;
      }
      out.push({ value, pick: priced.pick });
    }
  }
  return out;
}

/** Heuristic top-level: pick best action this tick. */
export function chooseAIAction(state: SwState, playerId: PlayerId): SwAction | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'militaryEnd') {
    // Pause for humans to read the military results; only auto-advance in
    // all-AI matches.
    const hasHuman = state.seats.some((s) => !s.isAI);
    if (hasHuman) return null;
    return { type: 'continue' };
  }
  if (state.subPhase === 'discardBuild') {
    if (state.discardBuildQueue?.[0] !== playerId) return null;
    const me = state.players.find((p) => p.id === playerId);
    if (!me) return null;
    const ranked = discardBuildOptions(state, me)
      .map((c) => ({ c, v: cardValue(state, me, c) }))
      .sort((a, b) => b.v - a.v);
    return { type: 'buildFromDiscard', playerId, cardId: ranked[0]?.c.id ?? null };
  }
  // Expansion-owned subphase — delegate to whichever expansion owns it.
  if (state.subPhase !== 'picking') {
    for (const ext of getActiveExpansions(state.config)) {
      if (!ext.ownsSubPhase?.(state.subPhase) || !ext.chooseAIAction) continue;
      const a = ext.chooseAIAction(state, playerId);
      if (a) return a;
    }
    return null;
  }
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  if (me.pendingPick !== null) return null;
  if (me.hand.length === 0) return null;

  const cv = coinValue(state);
  const options: Option[] = [];
  // The card we'd miss least (unbuildable ones first) is the one tucked
  // under a stage or sold.
  let spare = me.hand[0];
  let spareKeep = Infinity;
  for (const c of me.hand) {
    const builds = buildOptions(state, me, c, cardValue(state, me, c));
    options.push(...builds);
    const keep = builds.length > 0 ? Math.max(...builds.map((o) => o.value)) : -100;
    if (keep < spareKeep) { spare = c; spareKeep = keep; }
  }

  const wonder = wonderById(me.wonderId);
  const stageIdx = me.wonderStagesBuilt;
  if (stageIdx < wonder.stages.length) {
    const stage = wonder.stages[stageIdx];
    const worth = stageValue(state, me, stage, stageIdx);
    const picks: SwPendingPick[] = [{ kind: 'wonder', cardId: spare.id, stageIndex: stageIdx, payment: NO_PAYMENT }];
    if ((me.projectTokens?.freeStage ?? 0) > 0) picks.push({ kind: 'wonder', cardId: spare.id, stageIndex: stageIdx, payment: NO_PAYMENT, free: 'token' });
    for (const pick of picks) {
      const priced = price(state, me, pick, spare);
      if (!priced) continue;
      const token = pick.kind === 'wonder' && pick.free ? 2.5 : 0;
      options.push({ value: worth - priced.coins * cv - priced.trade * 0.1 - token, pick: priced.pick });
    }
  }

  options.push({ value: 3 * cv, pick: { kind: 'discard', cardId: spare.id } });
  for (const ext of getActiveExpansions(state.config)) {
    for (const o of ext.extraPickOptions?.(state, me, spare.id) ?? []) options.push(o);
  }

  let best = options[0];
  for (const o of options) if (o.value > best.value) best = o;
  return { type: 'submitPick', playerId, pick: best.pick };
}
