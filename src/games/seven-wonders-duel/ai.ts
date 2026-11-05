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

import type { PlayerId } from '@/core/types';
import type {
  DuelAction, DuelCard, DuelCardEffect, DuelPlayer, DuelProduction, DuelProgressTokenId, DuelResource,
  DuelState, DuelWonder,
} from './types';
import { DUEL_ALL_RESOURCES } from './types';
import { availableSlots, wouldUncover } from './pyramid';
import { wonderById, MAX_WONDERS_BUILT } from './wonders';
import { ageCards, guildCards } from './cards';
import {
  cardPayment, countFor, discardCoins, guildCount, hasFixedPrice, priceOf, productionFor,
  scienceSymbols, wonderPayment,
} from './resources';
import { militaryVps } from './scoring';
import { legalActions, seatIdxOf } from './reducer';

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
  const legal = legalActions(state);
  if (legal.length === 0) return null;
  const ctx = makeCtx(state, seatIdxOf(state, playerId));
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
    progress: state.subPhase === 'wonderDraft' ? 0 : ((state.age - 1) * size + taken) / (3 * size),
    leftInAge: size - taken,
    demand: [null, null],
  };
}

const other = (s: 0 | 1): 0 | 1 => (1 - s) as 0 | 1;
const player = (ctx: Ctx, s: 0 | 1): DuelPlayer => ctx.state.players[s];

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

function militaryGain(ctx: Ctx, s: 0 | 1, shields: number): number {
  const dir = s === 0 ? 1 : -1;
  const ahead = dir * ctx.state.militaryPawn;
  const after = Math.min(9, ahead + shields);
  if (after >= 9) return WIN;
  let v = pawnValue(after) - pawnValue(ahead);
  const aw = ctx.state.militaryAwards;
  const [at3, at6] = s === 0 ? [aw.p1At3, aw.p1At6] : [aw.p2At3, aw.p2At6];
  let oppCoins = player(ctx, other(s)).coins;
  const cv = coinValue(ctx, other(s));
  for (const [reached, taken, coins] of [[after >= 3, at3, 2], [after >= 6, at6, 5]] as const) {
    if (!reached || taken) continue;
    const lost = Math.min(coins, oppCoins);
    oppCoins -= lost;
    v += lost * cv;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Science

/** Worth of reaching `distinct` different symbols (6 wins). */
function symbolProgressValue(distinct: number): number {
  if (distinct >= 6) return WIN;
  return [0, 1.5, 1.5, 2.5, 4, 8][distinct];
}

function scienceGain(ctx: Ctx, s: 0 | 1, eff: Extract<DuelCardEffect, { kind: 'science' }>): number {
  const counts = scienceSymbols(player(ctx, s));
  const have = counts.get(eff.symbol) ?? 0;
  if (have === 0) return symbolProgressValue(counts.size + 1);
  if (have === 1 && ctx.state.progressOffer.length > 0) {
    return Math.max(...ctx.state.progressOffer.map((t) => tokenValue(ctx, s, t)));
  }
  return 0;
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
    const pool = (state.age === 3 ? [...ageCards(3), ...guildCards()] : ageCards(state.age)).filter((c) => !seen.has(c.id));
    for (const c of pool) addDemand(d, c.cost.resources, (P_BUILD * hidden) / pool.length);
  }
  // Later ages: 20 of each deck get dealt.
  const fromAge = state.subPhase === 'wonderDraft' ? 1 : state.age + 1;
  for (let age = fromAge; age <= 3; age++) {
    const deck = ageCards(age as 1 | 2 | 3);
    const kept = age === 3 ? 17 / 20 : 20 / 23;
    for (const c of deck) addDemand(d, c.cost.resources, P_BUILD * kept);
    if (age === 3) for (const c of guildCards()) addDemand(d, c.cost.resources, (P_BUILD * 3) / 7);
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
  let best = discardCoins(me) * cv;
  if (!me.tableau.some((c) => c.name === card.name)) {
    const pay = cardPayment(ctx.state, s, card);
    if (pay.coins <= me.coins) best = Math.max(best, cardGain(ctx, s, card) - pay.coins * cv);
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

/** What the opponent loses with this card (Circus Maximus / Statue of Zeus). */
function destroyValue(ctx: Ctx, s: 0 | 1, card: DuelCard): number {
  const o = other(s);
  const me = player(ctx, s);
  const opp = player(ctx, o);
  let v = 0;
  for (const eff of card.effects) {
    if (eff.kind !== 'produce') continue;
    for (const opts of eff.production) {
      const r = opts[0];
      // What they will now have to buy, and my price for it drops a coin a unit.
      const lost = unitsToBuy(ctx, o, r, -1) - unitsToBuy(ctx, o, r);
      v += lost * priceOf(opp, me, r) * savingValue(ctx);
      if (!hasFixedPrice(me, r)) v += unitsToBuy(ctx, s, r) * savingValue(ctx);
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
      return symbolProgressValue(counts.size + 1) + 1;
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

function scoreTurn(ctx: Ctx, action: DuelAction & { cardId: number }): number {
  const { state, seat } = ctx;
  const me = player(ctx, seat);
  const card = state.cardsById[action.cardId];
  const cv = coinValue(ctx, seat);
  let gain: number;
  let again = false;
  if (action.type === 'takeAndBuild') {
    gain = cardGain(ctx, seat, card);
    if (gain < WIN) gain -= cardPayment(state, seat, card).coins * cv;
  } else if (action.type === 'takeAndWonder') {
    const wonder = wonderById(action.wonderId);
    gain = wonderGain(ctx, seat, wonder);
    if (gain < WIN) gain -= wonderPayment(state, seat, wonder).coins * cv;
    again = playsAgain(state, seat, action.wonderId);
  } else {
    gain = discardCoins(me) * cv;
  }
  if (gain >= WIN) return WIN * 10;
  if (ctx.leftInAge <= 1) return gain; // the age ends; the next starter is chosen
  const after = cardsAfter(state, action.cardId);
  return again
    ? gain + MU * bestTake(ctx, seat, after) + 1
    : gain - LAMBDA * bestTake(ctx, other(seat), after);
}

// ---------------------------------------------------------------------------
// Every decision

function scoreAction(ctx: Ctx, a: DuelAction): number {
  const { state, seat } = ctx;
  switch (a.type) {
    case 'takeAndBuild':
    case 'takeAndWonder':
    case 'takeAndDiscard':
      return scoreTurn(ctx, a);
    case 'submitWonderDraft':
      return draftValue(a.wonderId);
    case 'chooseProgressToken':
      return tokenValue(ctx, seat, a.tokenId);
    case 'destroyCard': {
      const card = player(ctx, other(seat)).tableau.find((c) => c.id === a.cardId);
      return card ? destroyValue(ctx, seat, card) : 0;
    }
    case 'buildFromDiscard': {
      const card = state.discard.find((c) => c.id === a.cardId);
      return card ? cardGain(ctx, seat, card) : 0;
    }
    case 'chooseStarter':
      // Taking the first card of the age is usually worth more than reacting.
      return a.starterId === player(ctx, seat).id ? 1 : 0;
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
};

function draftValue(wonderId: string): number {
  return DRAFT_RANK[wonderId] ?? 5;
}
