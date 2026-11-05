// 7 Wonders Duel — heuristic AI.
//
// One-ply and deterministic. Every legal action is scored in VP-equivalents
// and the best one played:
//
//   score = what the move gives me − λ · the best card it leaves my opponent
//           (+ μ · the best card it leaves me, when the move plays again)
//
// The second term is the whole of the draft's tactics: taking the card the
// opponent wants (denial), not uncovering a strong one for them, and
// spotting a supremacy threat — a card that would win for the opponent is
// worth WIN to them, so any move that leaves it on the table scores far below
// one that takes it. Cards a move would turn face up count as an unknown
// average: the AI never reads a face-down card.
//
// Values are context-aware: coins are worth more early; production is worth a
// lot in Age I and little at the end; shields by where they take the pawn
// (VP zones, looting tokens, the capital); science by how close it brings six
// different symbols, and a pair by the best Progress token on the board.
//
// Expansions, scored on the same VP scale:
//   - Pantheon: a Divinity is worth its effect in the position (Tanit 12
//     coins, Mars 2 shields, Hades the best discarded card…) less its cost;
//     invoking takes no card, so the opponent faces today's structure.
//     Placing one in Age I puts the best Divinity where it is cheap for us.
//   - Agora: Senate moves are scored by how the Senate's evaluation changes
//     (each Chamber's VP and Decree to its controller, a cushion for
//     margins, Political Supremacy); Conspiracies by their effect now (to
//     trigger) or a forward estimate (to keep or prepare). A prepared
//     Conspiracy is triggered when it is worth enough now.
//   Hidden things are never read: the opponent's Conspiracies, face-down
//   Decrees (valued at the average), the Mythology and Conspiracy decks, the
//   boxed cards and tokens (until a decision shows them to the AI).

import type { PlayerId } from '@/core/types';
import type {
  DuelAction, DuelAgoraState, DuelCard, DuelCardEffect, DuelConspiracyId, DuelDecreeId, DuelDivinityId,
  DuelPlayer, DuelProduction, DuelProgressTokenId, DuelResource, DuelScience, DuelState,
  DuelWonder,
} from './types';
import { DUEL_ALL_RESOURCES } from './types';
import { availableSlots, wouldUncover } from './pyramid';
import { wonderById, MAX_WONDERS_BUILT } from './wonders';
import { ageCards, guildCards, templeCards } from './cards';
import {
  cardPayment, countFor, discardGain, distinctScience, guildCount, hasFixedPrice, priceOf, productionFor, purse,
  scienceSymbols, wonderPayment,
} from './resources';
import { militaryVps, TEMPLE_VP } from './scoring';
import { backRowCards, legalActions, seatIdxOf } from './reducer';
import { divinityCost, spaceCost } from './pantheon';
import { CHAMBER_COUNT, CHAMBER_VP, chamberController, cubesInSenate, senateActionCount } from './agora';

/** A move that wins the match on the spot. */
const WIN = 1000;
/** Weight of the best card a move leaves the opponent. */
const LAMBDA = 0.7;
/** Weight of the best card a play-again move leaves me. */
const MU = 0.7;
/** Value of a card a move turns face up (unknown). */
const UNKNOWN_CARD = 4;

export function chooseAIAction(state: DuelState, playerId: PlayerId): DuelAction | null {
  if (state.phase !== 'playing' || state.activePlayerId !== playerId) return null;
  let legal = legalActions(state);
  if (legal.length === 0) return null;
  const ctx = makeCtx(state, seatIdxOf(state, playerId));
  if (state.subPhase === 'turn') {
    // A prepared Conspiracy is triggered (before the main action) when it is worth it now.
    const triggers = legal.filter((a): a is Extract<DuelAction, { type: 'triggerConspiracy' }> => a.type === 'triggerConspiracy');
    let bestTrigger: DuelAction | null = null;
    let bestValue = triggerThreshold(ctx);
    for (const t of triggers) {
      const v = conspiracyNow(ctx, ctx.seat, t.conspiracy);
      if (v > bestValue) { bestValue = v; bestTrigger = t; }
    }
    if (bestTrigger) return bestTrigger;
    legal = legal.filter((a) => a.type !== 'triggerConspiracy');
  }
  let best = legal[0];
  let bestScore = -Infinity;
  for (const a of legal) {
    const v = scoreAction(ctx, a);
    if (v > bestScore) { bestScore = v; best = a; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Context

interface Ctx {
  state: DuelState;
  seat: 0 | 1;
  /** 0 at the first card of Age I, 1 after the last of Age III. */
  progress: number;
  /** Cards left in the current age's pyramid. */
  leftInAge: number;
  /** Future resource demand per seat (lazily built). */
  demand: [Demand | null, Demand | null];
}

function makeCtx(state: DuelState, seat: 0 | 1): Ctx {
  const taken = state.pyramid.filter((s) => s.taken).length;
  const size = state.pyramid.length || 20;
  return {
    state, seat,
    progress: state.subPhase === 'wonderDraft' || state.wonderDraft ? 0 : ((state.age - 1) * size + taken) / (3 * size),
    leftInAge: size - taken,
    demand: [null, null],
  };
}

const other = (s: 0 | 1): 0 | 1 => (1 - s) as 0 | 1;
const player = (ctx: Ctx, s: 0 | 1): DuelPlayer => ctx.state.players[s];
const remaining = (ctx: Ctx) => 1 - ctx.progress;

/** VP per coin: a third at the end, more while coins still buy cards. */
function coinValue(ctx: Ctx, s: 0 | 1): number {
  const poor = player(ctx, s).coins < 4 ? 0.12 : 0;
  return 0.33 + 0.45 * (1 - ctx.progress) + poor;
}

/** VP per coin saved over the rest of the game (between now and the end). */
function savingValue(ctx: Ctx): number {
  return 0.36 + 0.18 * (1 - ctx.progress);
}

// ---------------------------------------------------------------------------
// Military

/** Value of the pawn `ahead` spaces toward the opponent (negative: toward me):
 *  the zone's VP blurred over the neighbouring spaces (the pawn still moves,
 *  so a step inside a zone brings the next one closer), plus the threat of
 *  the capital growing over the last spaces. */
function pawnValue(ahead: number): number {
  const a = Math.abs(ahead);
  const vp = (x: number) => militaryVps(Math.min(8, x), 0);
  const v = (vp(a - 1) + 2 * vp(a) + vp(a + 1)) / 4 + 0.6 * a + Math.max(0, a - 5) * 3;
  return ahead < 0 ? -v : v;
}

/** Spaces `shields` really move the pawn for seat `s` (Minerva stops it). */
function stepsFor(ctx: Ctx, s: 0 | 1, shields: number): number {
  const dir = s === 0 ? 1 : -1;
  const minerva = ctx.state.pantheon?.minerva ?? null;
  let pos = ctx.state.militaryPawn;
  let n = 0;
  for (let i = 0; i < shields; i++) {
    const next = pos + dir;
    if (Math.abs(next) > 9 || next === minerva) break;
    pos = next;
    n++;
  }
  return n;
}

function militaryGain(ctx: Ctx, s: 0 | 1, shields: number): number {
  const dir = s === 0 ? 1 : -1;
  const ahead = dir * ctx.state.militaryPawn;
  const steps = stepsFor(ctx, s, shields);
  const after = Math.min(9, ahead + steps);
  if (after >= 9) return WIN;
  let v = pawnValue(after) - pawnValue(ahead);
  const aw = ctx.state.militaryAwards;
  const [at3, at6] = s === 0 ? [aw.p1At3, aw.p1At6] : [aw.p2At3, aw.p2At6];
  let oppCoins = player(ctx, other(s)).coins;
  const cv = coinValue(ctx, other(s));
  for (const [reached, taken, coins] of [[after >= 3, at3, 2], [after >= 6, at6, 5]] as const) {
    if (!reached || taken) continue;
    if (ctx.state.agora) { v += coins === 2 ? 2 : 3.5; continue; }
    const lost = Math.min(coins, oppCoins);
    oppCoins -= lost;
    v += lost * cv;
  }
  if (player(ctx, s).progressTokens.includes('poliorcetics')) v += Math.min(steps, oppCoins) * cv;
  return v;
}

// ---------------------------------------------------------------------------
// Science

/** Worth of reaching `distinct` different symbols (6 wins). */
function symbolProgressValue(distinct: number): number {
  if (distinct >= 6) return WIN;
  return [0, 1.5, 1.5, 2.5, 4, 8][distinct];
}

/** What gaining one `symbol` is worth to seat `s`. */
function symbolGain(ctx: Ctx, s: 0 | 1, symbol: DuelScience): number {
  const counts = scienceSymbols(player(ctx, s));
  const have = counts.get(symbol) ?? 0;
  if (have === 0) return symbolProgressValue(counts.size + 1);
  if (have === 1 && ctx.state.progressOffer.length > 0) {
    return Math.max(...ctx.state.progressOffer.map((t) => tokenValue(ctx, s, t)));
  }
  return 0;
}

function scienceGain(ctx: Ctx, s: 0 | 1, eff: Extract<DuelCardEffect, { kind: 'science' }>): number {
  return symbolGain(ctx, s, eff.symbol);
}

// ---------------------------------------------------------------------------
// Production and trading
//
// A unit of production is worth the coins it will save: for every card still
// to come (this age's pyramid — face-down ones only as the age's unseen
// average — and the later ages' decks) and every unbuilt wonder, the chance
// the seat builds it times whether it needs that many of the resource, at the
// price the seat would pay the bank.

/** Demand[r][k]: expected future builds needing at least k units of r (k = 1..5). */
type Demand = Record<DuelResource, number[]>;

/** Chance a given card still to come ends up built by a given seat. */
const P_BUILD = 0.3;
/** Chance an unbuilt wonder of the seat's gets built. */
const P_WONDER = 0.7;

function addDemand(d: Demand, resources: readonly DuelResource[] | undefined, weight: number): void {
  const need = new Map<DuelResource, number>();
  for (const r of resources ?? []) need.set(r, (need.get(r) ?? 0) + 1);
  for (const [r, n] of need) for (let k = 1; k <= n && k <= 5; k++) d[r][k] += weight;
}

/** Age III's extra cards: the Guilds — or Pantheon's Grand Temples. */
const age3Extras = (ctx: Ctx) => (ctx.state.pantheon ? templeCards() : guildCards());

function demandFor(ctx: Ctx, s: 0 | 1): Demand {
  const cached = ctx.demand[s];
  if (cached) return cached;
  const { state } = ctx;
  const d = Object.fromEntries(DUEL_ALL_RESOURCES.map((r) => [r, [0, 0, 0, 0, 0, 0]])) as Demand;
  // This age: the cards still in the pyramid. Face-down ones are unknown: each
  // stands for the age's cards not seen yet, on average.
  const seen = new Set<number>();
  let hidden = 0;
  for (const slot of state.pyramid) {
    if (slot.faceUp || slot.taken) seen.add(slot.cardId);
    if (slot.taken) continue;
    if (slot.faceUp) addDemand(d, state.cardsById[slot.cardId].cost.resources, P_BUILD);
    else hidden++;
  }
  if (hidden > 0 && state.subPhase !== 'wonderDraft') {
    const pool = (state.age === 3 ? [...ageCards(3), ...age3Extras(ctx)] : ageCards(state.age)).filter((c) => !seen.has(c.id));
    for (const c of pool) addDemand(d, c.cost.resources, (P_BUILD * hidden) / Math.max(1, pool.length));
  }
  // Later ages: 20 of each deck get dealt.
  const fromAge = state.subPhase === 'wonderDraft' ? 1 : state.age + 1;
  for (let age = fromAge; age <= 3; age++) {
    const deck = ageCards(age as 1 | 2 | 3);
    const kept = age === 3 ? 17 / 20 : 20 / 23;
    for (const c of deck) addDemand(d, c.cost.resources, P_BUILD * kept);
    if (age === 3) {
      const extras = age3Extras(ctx);
      for (const c of extras) addDemand(d, c.cost.resources, (P_BUILD * 3) / extras.length);
    }
  }
  for (const ws of player(ctx, s).wonders) {
    if (!ws.built) addDemand(d, wonderById(ws.wonderId).cost.resources, P_WONDER);
  }
  ctx.demand[s] = d;
  return d;
}

/** Fixed units of r the seat makes, plus a share of its choice producers. */
function producedUnits(p: DuelPlayer, r: DuelResource): number {
  const prod = productionFor(p);
  return (prod.fixed.get(r) ?? 0) + prod.choices.filter((c) => c.includes(r)).length * 0.6;
}

/** Expected future units of r the seat will still have to buy. */
function unitsToBuy(ctx: Ctx, s: 0 | 1, r: DuelResource, extra = 0): number {
  const d = demandFor(ctx, s)[r];
  const have = producedUnits(player(ctx, s), r) + extra;
  let n = 0;
  for (let k = 1; k <= 5; k++) n += d[k] * Math.max(0, Math.min(1, k - have));
  return n;
}

/** VP-worth of one more unit of r for the seat. */
function resourceValue(ctx: Ctx, s: 0 | 1, r: DuelResource): number {
  const me = player(ctx, s);
  const price = priceOf(me, player(ctx, other(s)), r);
  const saved = unitsToBuy(ctx, s, r) - unitsToBuy(ctx, s, r, 1);
  return saved * price * savingValue(ctx);
}

function productionGain(ctx: Ctx, s: 0 | 1, prods: readonly DuelProduction[], denies: boolean): number {
  let v = 0;
  for (const opts of prods) {
    if (opts.length === 1) {
      v += resourceValue(ctx, s, opts[0]);
      // Brown / gray production also raises the opponent's price by a coin.
      if (denies) v += unitsToBuy(ctx, other(s), opts[0]) * savingValue(ctx) * (hasFixedPrice(player(ctx, other(s)), opts[0]) ? 0 : 1);
    } else {
      v += 0.85 * Math.max(...opts.map((r) => resourceValue(ctx, s, r)));
    }
  }
  return v;
}

function tradeGain(ctx: Ctx, s: 0 | 1, resources: readonly DuelResource[]): number {
  const me = player(ctx, s);
  const opp = player(ctx, other(s));
  let v = 0;
  for (const r of resources) {
    if (hasFixedPrice(me, r)) continue;
    // Today's price, and opponents tend to add production as the game goes.
    const saving = priceOf(me, opp, r) - 1 + 0.5 * (1 - ctx.progress);
    v += unitsToBuy(ctx, s, r) * saving * savingValue(ctx);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Card and wonder values

/** True if the card this one chains to may still turn up. */
function chainLive(ctx: Ctx, card: DuelCard): boolean {
  if (!card.chain || card.age >= 3) return false;
  const later = ([2, 3] as const).filter((a) => a > card.age && a >= ctx.state.age);
  return later.some((a) => ageCards(a).some((c) => c.chainCost === card.chain
    && !ctx.state.players.some((p) => p.tableau.some((t) => t.name === c.name))
    && !ctx.state.discard.some((d) => d.name === c.name)));
}

function effectGain(ctx: Ctx, s: 0 | 1, card: DuelCard, eff: DuelCardEffect): number {
  const me = player(ctx, s);
  const cv = coinValue(ctx, s);
  switch (eff.kind) {
    case 'vp': return eff.vp;
    case 'coins': return eff.amount * cv;
    case 'shields': {
      const bonus = card.color === 'red' && me.progressTokens.includes('strategy') ? 1 : 0;
      return militaryGain(ctx, s, eff.shields + bonus);
    }
    case 'science': return scienceGain(ctx, s, eff);
    case 'produce': return productionGain(ctx, s, eff.production, card.color === 'brown' || card.color === 'gray');
    case 'tradeFixed': return tradeGain(ctx, s, eff.resources);
    case 'coinsPer': {
      const self = eff.what.kind === 'color' && eff.what.colors.includes(card.color) ? 1 : 0;
      return (countFor(me, eff.what) + self) * eff.per * cv;
    }
    case 'guild': {
      const n = guildCount(ctx.state, eff.what);
      const growth = eff.what.kind === 'coins' ? 0 : 1 - ctx.progress;
      return eff.vpPer * (n + growth) + eff.coinsPer * n * cv;
    }
    case 'politician': return senateGainEstimate(ctx, s, senateActionCount(ctx.state, s));
    case 'conspirator': return 2.6 + 0.6 * remaining(ctx);
    case 'grandTemple': {
      const n = me.tableau.filter((c) => c.effects.some((e) => e.kind === 'grandTemple')).length;
      return TEMPLE_VP[Math.min(3, n + 1)] - TEMPLE_VP[Math.min(3, n)];
    }
  }
}

/** What building `card` gives seat `s`, before paying for it. */
export function cardGain(ctx: Ctx, s: 0 | 1, card: DuelCard): number {
  let v = 0;
  for (const eff of card.effects) {
    const g = effectGain(ctx, s, card, eff);
    if (g >= WIN) return WIN;
    v += g;
  }
  // Yellow cards raise every later discard by a coin.
  if (card.color === 'yellow') v += 0.25 * (1 - ctx.progress) * 3;
  if (chainLive(ctx, card)) {
    v += 1.4;
    if (player(ctx, s).progressTokens.includes('urbanism')) v += 4 * coinValue(ctx, s);
  }
  return v;
}

/** Best a seat can make of taking `card`: build it (paid) or discard it. */
function takeValue(ctx: Ctx, s: 0 | 1, card: DuelCard): number {
  const me = player(ctx, s);
  const cv = coinValue(ctx, s);
  let best = discardGain(ctx.state, s) * cv;
  if (card.color === 'senator' || !me.tableau.some((c) => c.name === card.name)) {
    const pay = cardPayment(ctx.state, s, card);
    if (pay.coins <= purse(me)) best = Math.max(best, cardGain(ctx, s, card) - pay.coins * cv);
  }
  return best;
}

function wonderGain(ctx: Ctx, s: 0 | 1, wonder: DuelWonder): number {
  const me = player(ctx, s);
  const opp = player(ctx, other(s));
  const cv = coinValue(ctx, s);
  let v = 0;
  for (const eff of wonder.effects) {
    switch (eff.kind) {
      case 'vp': v += eff.vp; break;
      case 'coins': v += eff.amount * cv; break;
      case 'opponentLosesCoins': v += Math.min(eff.amount, opp.coins) * coinValue(ctx, other(s)); break;
      case 'shields': {
        const g = militaryGain(ctx, s, eff.shields);
        if (g >= WIN) return WIN;
        v += g;
        break;
      }
      case 'produce': v += productionGain(ctx, s, eff.production, false); break;
      case 'destroy': {
        const targets = opp.tableau.filter((c) => c.color === eff.color);
        if (targets.length) v += Math.max(...targets.map((c) => destroyValue(ctx, s, c)));
        break;
      }
      case 'buildFromDiscard':
        if (ctx.state.discard.length) v += Math.max(0, ...ctx.state.discard.map((c) => cardGain(ctx, s, c)));
        break;
      case 'progressFromBox': v += 4; break;
      case 'playAgain': break; // scored in scoreAction (the next pick is mine)
      case 'placeInfluence': v += ctx.state.agora ? bestSenatePlace(ctx, s) + 0.5 : 0; break;
      case 'moveInfluence': v += ctx.state.agora ? 0.5 : 0; break;
      case 'triggerUnprepared': {
        const mine = (me.agora?.conspiracies ?? []).filter((c) => !c.triggered && c.preparedWith === null);
        if (mine.length) v += Math.max(...mine.map((c) => conspiracyNow(ctx, s, c.id)));
        break;
      }
      case 'divinityDiscount': v += 2.2 * remaining(ctx) + (ctx.state.pantheon ? 0.5 : 0); break;
      case 'divineTheater': v += 5.5; break;
    }
  }
  // The 7th wonder sends the last unbuilt one back to the box.
  const built = ctx.state.players.reduce((n, p) => n + p.wonders.filter((w) => w.built).length, 0);
  if (built + 1 >= MAX_WONDERS_BUILT) {
    v += 3 * opp.wonders.filter((w) => !w.built).length;
    v -= 3 * (me.wonders.filter((w) => !w.built).length - 1);
  }
  return v;
}

function playsAgain(state: DuelState, s: 0 | 1, wonderId: string): boolean {
  return state.players[s].progressTokens.includes('theology')
    || wonderById(wonderId).effects.some((e) => e.kind === 'playAgain');
}

/** What the opponent loses with this card (Circus Maximus / Statue of Zeus,
 *  Expropriation / Swindle, Baal / Foreclosure). */
function destroyValue(ctx: Ctx, s: 0 | 1, card: DuelCard): number {
  const o = other(s);
  const me = player(ctx, s);
  const opp = player(ctx, o);
  let v = 0;
  for (const eff of card.effects) {
    if (eff.kind === 'vp') v += eff.vp;
    if (eff.kind !== 'produce') continue;
    for (const opts of eff.production) {
      const r = opts[0];
      // What they will now have to buy, and my price for it drops a coin a unit.
      const lost = unitsToBuy(ctx, o, r, -1) - unitsToBuy(ctx, o, r);
      v += lost * priceOf(opp, me, r) * savingValue(ctx);
      if (!hasFixedPrice(me, r) && (card.color === 'brown' || card.color === 'gray')) v += unitsToBuy(ctx, s, r) * savingValue(ctx);
    }
  }
  return v;
}

function tokenValue(ctx: Ctx, s: 0 | 1, id: DuelProgressTokenId): number {
  const me = player(ctx, s);
  const rem = 1 - ctx.progress;
  const cv = coinValue(ctx, s);
  const unbuilt = me.wonders.filter((w) => !w.built);
  switch (id) {
    case 'agriculture': return 4 + 6 * cv;
    case 'architecture': return 2 * unbuilt.length;
    case 'economy': return 6 * rem;
    case 'law': {
      const counts = scienceSymbols(me);
      return (counts.has('law') ? 0 : symbolProgressValue(counts.size + 1)) + 1;
    }
    case 'masonry': return 1 + 6 * rem;
    case 'mathematics': return 3 * (me.progressTokens.length + 1) + 1.5 * rem;
    case 'philosophy': return 7;
    case 'strategy': return 1 + 6 * rem + (Math.abs(ctx.state.militaryPawn) >= 3 ? 1.5 : 0);
    case 'theology': return 2.5 * unbuilt.filter((w) => !wonderById(w.wonderId).effects.some((e) => e.kind === 'playAgain')).length;
    case 'urbanism': {
      const chains = me.tableau.filter((c) => chainLive(ctx, c)).length;
      return 6 * cv + (chains + 2 * rem) * 4 * cv;
    }
    case 'corruption': return 1 + 5 * rem * cv * 2;
    case 'organizedCrime': return 1 + 4 * rem;
    case 'mysticism': return 1 + 2 * ((me.pantheon?.mythologyTokens.length ?? 0) + (me.pantheon?.offeringTokens.length ?? 0)) + 2 * rem;
    case 'poliorcetics': return 1 + 4 * rem;
    case 'engineering': return 1.5 + 5 * rem;
  }
}

// ---------------------------------------------------------------------------
// Draft-wide tactics

/** Best value a seat can take from these slots (face-down ones are unknown). */
function bestTake(ctx: Ctx, s: 0 | 1, cards: { card: DuelCard | null }[]): number {
  let best = 0;
  for (const { card } of cards) best = Math.max(best, card ? takeValue(ctx, s, card) : UNKNOWN_CARD);
  return best;
}

/** The cards accessible after the slot holding `cardId` is taken. */
function cardsAfter(state: DuelState, cardId: number): { card: DuelCard | null }[] {
  const slot = state.pyramid.find((x) => x.cardId === cardId)!;
  const still: { card: DuelCard | null }[] = availableSlots(state.pyramid).filter((x) => x.cardId !== cardId)
    .map((x) => ({ card: state.cardsById[x.cardId] }));
  const opened = wouldUncover(slot, state.pyramid)
    .map((x) => ({ card: x.faceUp ? state.cardsById[x.cardId] : null }));
  return still.concat(opened);
}

/** The cards accessible now. */
function cardsNow(state: DuelState): { card: DuelCard | null }[] {
  return availableSlots(state.pyramid).map((x) => ({ card: state.cardsById[x.cardId] }));
}

function scoreTurn(ctx: Ctx, action: DuelAction & { cardId: number }): number {
  const { state, seat } = ctx;
  const card = state.cardsById[action.cardId];
  const cv = coinValue(ctx, seat);
  let gain: number;
  let again = false;
  if (action.type === 'takeAndBuild') {
    gain = cardGain(ctx, seat, card);
    if (gain < WIN) gain -= cardPayment(state, seat, card).coins * cv;
    if (card.color === 'senator' && state.agora && hasDecreeAi(ctx, seat, 'conspiratorReplay') && card.effects.some((e) => e.kind === 'conspirator')) again = true;
  } else if (action.type === 'takeAndWonder') {
    const wonder = wonderById(action.wonderId);
    gain = wonderGain(ctx, seat, wonder);
    if (gain < WIN) gain -= wonderPayment(state, seat, wonder).coins * cv;
    again = playsAgain(state, seat, action.wonderId);
  } else if (action.type === 'takeAndPrepare') {
    gain = 0.6 * conspiracyForward(ctx, seat, action.conspiracy);
  } else {
    gain = discardGain(state, seat) * cv;
  }
  if (gain >= WIN) return WIN * 10;
  if (ctx.leftInAge <= 1) return gain; // the age ends; the next starter is chosen
  const after = cardsAfter(state, action.cardId);
  return again
    ? gain + MU * bestTake(ctx, seat, after) + 1
    : gain - LAMBDA * bestTake(ctx, other(seat), after);
}

// ---------------------------------------------------------------------------
// Pantheon

/** A Divinity's rough worth before the position is known (Age I placement). */
const DIVINITY_RANK: Record<DuelDivinityId, number> = {
  enki: 5, ishtar: 4, nisaba: 4, astarte: 6, baal: 5, tanit: 6, aphrodite: 8, hades: 4.5, zeus: 3,
  anubis: 3, isis: 5, ra: 4, mars: 4.5, minerva: 2.5, neptune: 3.5, gate: 5,
};

/** What invoking a Divinity gives seat `s` now (before paying). */
function divinityGain(ctx: Ctx, s: 0 | 1, id: DuelDivinityId): number {
  const { state } = ctx;
  const me = player(ctx, s);
  const opp = player(ctx, other(s));
  const cv = coinValue(ctx, s);
  switch (id) {
    case 'enki': {
      const toks = state.pantheon?.enkiTokens ?? [];
      return toks.length ? Math.max(...toks.map((t) => tokenValue(ctx, s, t))) : 3;
    }
    case 'ishtar': return symbolGain(ctx, s, 'law');
    case 'nisaba': {
      const greens = opp.tableau.flatMap((c) => c.effects.filter((e) => e.kind === 'science'));
      return greens.length ? Math.max(...greens.map((e) => (e.kind === 'science' ? symbolGain(ctx, s, e.symbol) : 0))) : 0;
    }
    case 'astarte': return 7 * Math.max(1, cv);
    case 'baal': {
      const cards = opp.tableau.filter((c) => c.color === 'brown' || c.color === 'gray');
      return cards.length ? Math.max(...cards.map((c) => stealValue(ctx, s, c))) : 0;
    }
    case 'tanit': return 12 * cv;
    case 'aphrodite': return 9;
    case 'hades': return state.discard.length ? Math.max(0, ...state.discard.map((c) => cardGain(ctx, s, c))) : 0;
    case 'zeus': return 1 + 0.5 * bestTake(ctx, other(s), cardsNow(state));
    case 'anubis': {
      const theirs = opp.wonders.filter((w) => w.built).map((w) => lostWonderValue(ctx, wonderById(w.wonderId)));
      return theirs.length ? Math.max(...theirs) : 0;
    }
    case 'isis': {
      const unbuilt = me.wonders.filter((w) => !w.built);
      return state.discard.length && unbuilt.length ? Math.max(...unbuilt.map((w) => wonderGain(ctx, s, wonderById(w.wonderId)))) : 0;
    }
    case 'ra': {
      const theirs = opp.wonders.filter((w) => !w.built);
      return theirs.length ? Math.max(...theirs.map((w) => 0.8 * wonderGain(ctx, s, wonderById(w.wonderId)) + 1)) : 0;
    }
    case 'mars': return militaryGain(ctx, s, 2);
    case 'minerva': {
      const dir = s === 0 ? 1 : -1;
      return dir * state.militaryPawn < 0 ? 3 : 1.5;
    }
    case 'neptune': return state.agora ? 3 : 1 + Math.min(5, opp.coins) * coinValue(ctx, other(s));
    case 'gate': return 6;
  }
}

/** A Divinity in the Pantheon: its gain less what invoking it costs. */
function scoreInvoke(ctx: Ctx, a: Extract<DuelAction, { type: 'invokeDivinity' }>): number {
  const { state, seat } = ctx;
  const slot = state.pantheon?.spaces[a.space];
  if (!slot) return -Infinity;
  const cv = coinValue(ctx, seat);
  const offerings = a.offerings ?? [];
  const cost = divinityCost(state, seat, a.space, offerings);
  const gain = divinityGain(ctx, seat, slot.divinity);
  if (gain >= WIN) return WIN * 10;
  // Offering tokens kept have a use later (and Mysticism VP).
  const kept = offerings.reduce((n, v) => n + v, 0) * cv * 0.4 + (player(ctx, seat).progressTokens.includes('mysticism') ? 2 * offerings.length : 0);
  return gain - cost * cv - kept - LAMBDA * bestTake(ctx, other(seat), cardsNow(state)) - 0.5;
}

/** Placing a Divinity in Age I: the best one where it is cheap for us. */
function scorePlaceDivinity(ctx: Ctx, a: Extract<DuelAction, { type: 'placeDivinity' }>): number {
  const myCost = spaceCost(ctx.state, ctx.seat, a.space);
  return DIVINITY_RANK[a.divinity] * (1 + 0.08 * (8 - myCost));
}

/** VP and production an owner loses with a wonder. */
function lostWonderValue(ctx: Ctx, w: DuelWonder): number {
  let v = 0;
  for (const e of w.effects) {
    if (e.kind === 'vp') v += e.vp;
    if (e.kind === 'produce') v += 1.5 * remaining(ctx) * 2;
  }
  return v;
}

/** Taking a brown / gray card from the opponent. */
function stealValue(ctx: Ctx, s: 0 | 1, card: DuelCard): number {
  let v = destroyValue(ctx, s, card);
  for (const e of card.effects) if (e.kind === 'produce') v += productionGain(ctx, s, e.production, true);
  return v;
}

// ---------------------------------------------------------------------------
// Agora: the Senate

const DECREE_VALUE: Record<DuelDecreeId, number> = {
  blueCoins: 2, greenCoins: 1.5, yellowCoins: 1.5, redCoins: 1.5,
  yellowRebate: 1.3, redRebate: 1.8, greenRebate: 1.8, wonderRebate: 2,
  militaryDecree: 2.5, rawTrade: 2, goodsTrade: 1.8, senateBoost: 1.2,
  discardBonus: 1.2, wonderCoins: 1.5, sharedChains: 1.4, conspiratorReplay: 1,
};
const AVERAGE_DECREE = 1.7;

function hasDecreeAi(ctx: Ctx, s: 0 | 1, id: DuelDecreeId): boolean {
  const ag = ctx.state.agora;
  if (!ag) return false;
  const c = ag.decrees.findIndex((ds) => ds.some((d) => d.id === id && d.faceUp));
  return c >= 0 && chamberController(ag, c) === s;
}

/** The Senate seen by seat `s`: each Chamber's VP and Decrees to its
 *  controller (face-down Decrees at the average), a cushion for margins,
 *  and Political Supremacy. */
function senateEval(ctx: Ctx, s: 0 | 1, ag: DuelAgoraState): number {
  const ongoing = 0.45 + 0.55 * remaining(ctx);
  let v = 0;
  let mine = 0;
  let theirs = 0;
  for (let c = 0; c < CHAMBER_COUNT; c++) {
    const ctrl = chamberController(ag, c);
    const decrees = ag.decrees[c].reduce((n, d) => n + (d.faceUp ? DECREE_VALUE[d.id] : AVERAGE_DECREE), 0);
    const w = CHAMBER_VP[c] + decrees * ongoing;
    if (ctrl === s) { v += w; mine++; } else if (ctrl === other(s)) { v -= w; theirs++; }
    const margin = ag.chambers[c][s] - ag.chambers[c][other(s)];
    v += 0.35 * Math.max(-2, Math.min(2, margin));
  }
  if (mine === CHAMBER_COUNT) return WIN;
  if (theirs === CHAMBER_COUNT) return -WIN;
  if (mine === 5) v += 3;
  if (theirs === 5) v -= 6;
  return v;
}

function withCubes(ag: DuelAgoraState, changes: [number, 0 | 1, number][]): DuelAgoraState {
  const chambers = ag.chambers.map((c) => [c[0], c[1]] as [number, number]);
  for (const [c, seat, d] of changes) chambers[c][seat] += d;
  return { ...ag, chambers };
}

/** Senate move value: how the evaluation changes, less the cube spent, plus the Levy's push. */
function senateDelta(ctx: Ctx, s: 0 | 1, changes: [number, 0 | 1, number][], cubesSpent: number): number {
  const ag = ctx.state.agora!;
  const after = withCubes(ag, changes);
  const before = senateEval(ctx, s, ag);
  const now = senateEval(ctx, s, after);
  if (now >= WIN) return WIN;
  let v = now - before - 0.25 * cubesSpent;
  // The Levy moves the pawn when its Chamber changes hands (only if face up: we know where it is).
  const levy = ag.decrees.findIndex((ds) => ds.some((d) => d.id === 'militaryDecree' && d.faceUp));
  if (levy >= 0) {
    const was = chamberController(ag, levy);
    const is = chamberController(after, levy);
    if (was !== is) {
      if (was === other(s) || is === s) v += Math.min(WIN / 10, militaryGain(ctx, s, (was === other(s) ? 1 : 0) + (is === s ? 1 : 0)));
      if (was === s) v -= 2;
    }
  }
  return v;
}

/** The best single cube placement for seat `s` (any Chamber). */
function bestSenatePlace(ctx: Ctx, s: 0 | 1): number {
  if (!ctx.state.agora || (player(ctx, s).agora?.cubes ?? 0) <= 0) return 0;
  let best = -Infinity;
  for (let c = 0; c < CHAMBER_COUNT; c++) best = Math.max(best, senateDelta(ctx, s, [[c, s, 1]], 1));
  return Math.max(0, best);
}

/** A Politician's worth: about a placement and a half per action. */
function senateGainEstimate(ctx: Ctx, s: 0 | 1, actions: number): number {
  if (!ctx.state.agora) return 0;
  return actions * (0.8 + 0.5 * Math.min(3, bestSenatePlace(ctx, s)));
}

// ---------------------------------------------------------------------------
// Agora: Conspiracies

/** What triggering a Conspiracy gives seat `s` now. */
function conspiracyNow(ctx: Ctx, s: 0 | 1, id: DuelConspiracyId): number {
  const { state } = ctx;
  const opp = player(ctx, other(s));
  const cv = coinValue(ctx, s);
  const move = cubesInSenate(state.agora!, s) > 0 ? 0.5 : 0;
  switch (id) {
    case 'extortion': {
      const theirs = opp.wonders.filter((w) => !w.built);
      return (theirs.length ? Math.max(...theirs.map((w) => 0.8 * wonderGain(ctx, s, wonderById(w.wonderId)) + 1)) : 0) + move;
    }
    case 'blackmail': return Math.ceil(opp.coins / 2) * (cv + coinValue(ctx, other(s))) + move;
    case 'expropriation': {
      const blues = opp.tableau.filter((c) => c.color === 'blue');
      return (blues.length ? Math.max(...blues.map((c) => destroyValue(ctx, s, c))) : 0) + move;
    }
    case 'swindle': {
      const ys = opp.tableau.filter((c) => c.color === 'yellow');
      return (ys.length ? Math.max(...ys.map((c) => destroyValue(ctx, s, c) + 1)) : 0) + move;
    }
    case 'obscurantism': {
      const theirs = opp.progressTokens.map((t) => tokenValue(ctx, other(s), t));
      const board = state.progressOffer.map((t) => 0.4 * tokenValue(ctx, other(s), t));
      return Math.max(0.5, ...theirs, ...board);
    }
    case 'coup': return militaryGain(ctx, s, 2);
    case 'propertyFraud': {
      const cards = backRowCards(state);
      return cards.length ? Math.max(0, ...cards.map((c) => cardGain(ctx, s, c))) : 0;
    }
    case 'treason': return 3.5 + state.age * 0.5; // the boxed cards are unseen until it is triggered
    case 'politicalManeuver': return 1 + bestSenatePlace(ctx, s) + (cubesInSenate(state.agora!, other(s)) > 0 ? 1.5 : 0);
    case 'espionage': return state.progressBox.length > 0 ? 4.5 : 0; // the box is unseen until it is triggered
    case 'turnOfEvents': return 0.8 + 0.6 * bestTake(ctx, other(s), cardsNow(state)) + move;
    case 'embezzlement': return cubesInSenate(state.agora!, s) * cv + Math.min(opp.coins, cubesInSenate(state.agora!, other(s))) * coinValue(ctx, other(s));
    case 'foreclosure': {
      const cards = opp.tableau.filter((c) => c.color === 'brown' || c.color === 'gray');
      return cards.length ? Math.max(...cards.map((c) => stealValue(ctx, s, c))) : 0;
    }
    case 'coercion': {
      const opts = swapScores(ctx, s);
      return (opts.length ? Math.max(0, ...opts) : 0) + move;
    }
    case 'insiderInfluence': return 1.5 + move;
    case 'sabotage': {
      const theirs = opp.wonders.filter((w) => w.built).map((w) => lostWonderValue(ctx, wonderById(w.wonderId)));
      return theirs.length ? Math.max(...theirs) : 0;
    }
  }
}

/** A Conspiracy kept for later: what it is worth now, raised toward a typical value. */
function conspiracyForward(ctx: Ctx, s: 0 | 1, id: DuelConspiracyId): number {
  const typical: Partial<Record<DuelConspiracyId, number>> = {
    extortion: 5, expropriation: 4, swindle: 3, sabotage: 5, coercion: 3, foreclosure: 3.5, propertyFraud: 4,
  };
  return Math.max(conspiracyNow(ctx, s, id), (typical[id] ?? 0) * remaining(ctx));
}

/** How much a Conspiracy has to be worth to trigger it now (less as the game runs out). */
function triggerThreshold(ctx: Ctx): number {
  if (ctx.state.age === 3 && ctx.leftInAge <= 6) return 0.3;
  return 2.5 - ctx.progress;
}

function swapScores(ctx: Ctx, s: 0 | 1): number[] {
  const me = player(ctx, s);
  const opp = player(ctx, other(s));
  const out: number[] = [];
  for (const t of opp.tableau) {
    if (t.color !== 'blue' && t.color !== 'green') continue;
    for (const g of me.tableau) if (g.color === t.color) out.push(swapValue(ctx, s, t, g));
  }
  return out;
}

const printedVp = (c: DuelCard) => c.effects.reduce((n, e) => n + (e.kind === 'vp' ? e.vp : 0), 0);

/** Taking `take` from the opponent for `give`: VP both ways, and the science symbols. */
function swapValue(ctx: Ctx, s: 0 | 1, take: DuelCard, give: DuelCard): number {
  const me = player(ctx, s);
  const opp = player(ctx, other(s));
  let v = 2 * (printedVp(take) - printedVp(give));
  if (take.color === 'green') {
    const after = (p: DuelPlayer, plus: DuelCard, minus: DuelCard) => {
      const t = { ...p, tableau: [...p.tableau.filter((c) => c.id !== minus.id), plus] };
      return distinctScience(t);
    };
    const mine = after(me, take, give) - distinctScience(me);
    const theirs = after(opp, give, take) - distinctScience(opp);
    if (after(me, take, give) >= 6) return WIN;
    v += 3 * mine - 3 * theirs;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Every decision

function scoreAction(ctx: Ctx, a: DuelAction): number {
  const { state, seat } = ctx;
  const me = player(ctx, seat);
  const opp = player(ctx, other(seat));
  const cv = coinValue(ctx, seat);
  switch (a.type) {
    case 'takeAndBuild':
    case 'takeAndWonder':
    case 'takeAndDiscard':
    case 'takeAndPrepare':
      return scoreTurn(ctx, a);
    case 'submitWonderDraft':
      return draftValue(a.wonderId);
    case 'chooseProgressToken':
      return tokenValue(ctx, seat, a.tokenId);
    case 'destroyCard': {
      const card = opp.tableau.find((c) => c.id === a.cardId);
      return card ? destroyValue(ctx, seat, card) : 0;
    }
    case 'buildFromDiscard': {
      const card = state.discard.find((c) => c.id === a.cardId);
      return card ? cardGain(ctx, seat, card) : 0;
    }
    case 'chooseStarter':
      // Taking the first card of the age is usually worth more than reacting.
      return a.starterId === me.id ? 1 : 0;
    case 'skip':
      return 0;
    // ----- Pantheon -----
    case 'invokeDivinity':
      return scoreInvoke(ctx, a);
    case 'placeDivinity':
      return scorePlaceDivinity(ctx, a);
    case 'chooseDivinity':
      return divinityGain(ctx, seat, a.divinity) - (a.top ? 0.05 * DIVINITY_RANK[a.top] : 0);
    case 'chooseMythology':
      return state.pantheon?.decks[a.mythology].length ?? 0;
    case 'placeSnake': {
      const card = opp.tableau.find((c) => c.id === a.cardId);
      const sci = card?.effects.find((e) => e.kind === 'science');
      return sci && sci.kind === 'science' ? symbolGain(ctx, seat, sci.symbol) : 0;
    }
    case 'takeCard': {
      const card = opp.tableau.find((c) => c.id === a.cardId);
      return card ? stealValue(ctx, seat, card) : 0;
    }
    case 'discardStructureCard': {
      const slot = state.pyramid.find((x) => x.cardId === a.cardId);
      if (!slot) return 0;
      let v = 0.3;
      if (slot.token) v += slot.token.kind === 'offering' ? slot.token.value * cv : 2;
      if (slot.faceUp) {
        const card = state.cardsById[a.cardId];
        v += takeValue(ctx, other(seat), card) - 0.5 * takeValue(ctx, seat, card);
      }
      return v;
    }
    case 'chooseWonder': {
      const w = wonderById(a.wonderId);
      if (state.subPhase === 'takeWonder') return 0.8 * wonderGain(ctx, seat, w) + 1;
      const theirs = opp.wonders.some((x) => x.wonderId === a.wonderId);
      return theirs ? lostWonderValue(ctx, w) : -lostWonderValue(ctx, w);
    }
    case 'wonderFromDiscard':
      return wonderGain(ctx, seat, wonderById(a.wonderId));
    case 'placeMinerva': {
      // Right in front of the pawn on our side blocks the opponent's next push.
      const dir = seat === 0 ? 1 : -1;
      const toward = (state.militaryPawn - a.position) * dir; // > 0: on our side of the pawn
      return toward > 0 ? 3 - 0.5 * toward : -1 + 0.01 * toward;
    }
    case 'chooseMilitaryToken': {
      const value = a.token.endsWith('6') ? 5 : 2;
      const onMySide = seat === 0 ? a.token.startsWith('p2') : a.token.startsWith('p1');
      if (state.subPhase === 'neptuneDiscard') return onMySide ? value : 0.1 * value;
      return state.agora ? (value === 5 ? 3.5 : 2) : Math.min(value, opp.coins) * coinValue(ctx, other(seat));
    }
    // ----- Agora -----
    case 'triggerConspiracy':
      return conspiracyNow(ctx, seat, a.conspiracy);
    case 'placeInfluence':
      return senateDelta(ctx, seat, [[a.chamber - 1, seat, 1]], 1);
    case 'moveInfluence':
      return senateDelta(ctx, seat, [[a.from - 1, seat, -1], [a.to - 1, seat, 1]], 0) - 0.05;
    case 'removeInfluence':
      return senateDelta(ctx, seat, [[a.chamber - 1, other(seat), -1]], 0);
    case 'conspiratorChoice':
      return a.choice === 'conspire' ? 2.5 + 1.5 * remaining(ctx) : bestSenatePlace(ctx, seat);
    case 'chooseConspiracy':
      return conspiracyForward(ctx, seat, a.conspiracy);
    case 'placeRemnant': {
      // A strong one goes to the bottom, out of the opponent's reach.
      const p = state.pending[0];
      const strong = p?.kind === 'remnant' && conspiracyForward(ctx, other(seat), p.conspiracy) >= 3;
      return a.top === !strong ? 1 : 0;
    }
    case 'lockProgressToken': {
      if (opp.progressTokens.includes(a.tokenId)) return tokenValue(ctx, other(seat), a.tokenId);
      if (state.progressOffer.includes(a.tokenId)) return 0.4 * Math.max(tokenValue(ctx, other(seat), a.tokenId), tokenValue(ctx, seat, a.tokenId));
      return 0.1;
    }
    case 'buildCard': {
      const card = state.subPhase === 'boxBuild'
        ? (state.boxedCards ?? []).find((c) => c.id === a.cardId)
        : state.cardsById[a.cardId];
      return card ? cardGain(ctx, seat, card) : 0;
    }
    case 'swapCards': {
      const take = opp.tableau.find((c) => c.id === a.takeId);
      const give = me.tableau.find((c) => c.id === a.giveId);
      return take && give ? swapValue(ctx, seat, take, give) : 0;
    }
    case 'moveDecree': {
      const ag = state.agora!;
      const decrees = ag.decrees.map((d) => d.slice());
      const moved = decrees[a.from - 1].shift();
      if (moved) decrees[a.to - 1].push(moved);
      return senateEval(ctx, seat, { ...ag, decrees }) - senateEval(ctx, seat, ag);
    }
  }
}

/** Draft order of the wonders (play-again, a Progress token or a second
 *  manufactured source first; the plain VP / shield wonders after). */
const DRAFT_RANK: Record<string, number> = {
  'piraeus': 9.5,
  'appian-way': 9,
  'great-library': 8.5,
  'sphinx': 8.5,
  'hanging-gardens': 8.5,
  'temple-of-artemis': 8,
  'statue-of-zeus': 7.5,
  'circus-maximus': 7.5,
  'pyramids': 7,
  'great-lighthouse': 7,
  'colossus': 6.5,
  'mausoleum': 6,
  'curia-julia': 8.5,
  'knossos': 7.5,
  'sanctuary': 8,
  'divine-theater': 7.5,
};

function draftValue(wonderId: string): number {
  return DRAFT_RANK[wonderId] ?? 5;
}
