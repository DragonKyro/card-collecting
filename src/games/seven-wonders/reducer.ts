// 7 Wonders reducer.
//
// Turn flow (per Age, repeats 3 times):
//   1. Expansions' Age start (Leaders' Recruitment phase, a Great Project
//      revealed), then 7 cards per player (8 with Cities) — `handSize`;
//      subPhase = 'picking'.
//   2. Each player submits a pendingPick (build / wonder / sell, or a Babel
//      tile), validated against the table as it stood at the start of the
//      turn. When all have submitted, the turn resolves simultaneously in two
//      passes:
//        - place: every card leaves its hand (into a city, under a wonder
//          stage, or onto the discard pile) and every cost is paid — trade
//          coins go to the neighbours;
//        - activate: on-play income (Tavern, Vineyard, a sale's 3 coins…),
//          counting the cards everyone built this turn, then events.
//      Building rules: no two cards of the same name in a city; a chain card
//      is free (bar Babel taxes); Olympia A builds once per Age for free
//      (`pick.free`); wonder stages go in order.
//   3. End of turn: on the Age's last pick the leftover card is discarded,
//      except by a city with Babylon B's power, which plays it next (one more
//      pick, only that city). Then the end-of-turn steps in order (each may
//      wait on a decision): Leaders' Courtesans' Guild / Rome B (10), a
//      Halicarnassus build from the discard (20), Cities' coin losses (30),
//      Babel tiles onto the tower (40). Then hands pass: to the west (left)
//      in Ages I and III, to the east (right) in Age II.
//   4. After the Age's last turn: expansions' Age-end step (Great Projects),
//      then military: each player vs both neighbours, comparing shields. Each
//      win is a +1 / +3 / +5 token (Ages I/II/III), each loss a −1 token, a
//      draw nothing — adjusted by diplomacy, Babel tiles and Tomyris.
//   5. After Age III military, phase = 'gameOver' with the final scoring
//      breakdown; ties go to the most coins.
//
// Expansion hooks: any action type not in the base switch is routed through
// active expansions' applyAction. Subphases not in the base set are owned by
// expansions. The base reducer never switches on expansion id — it iterates
// getActiveExpansions(state.config).

import type { PlayerId } from '@/core/types';
import { nextSimultaneousSeat } from '@/core/seats';
import { shuffle } from '@/core/rng';
import type {
  SwState, SwAction, SwPlayer, SwPendingPick, SwAge, SwCardEffect,
  SwMilitarySummary, SwLogEntry, SwCard, SwCost, SwWonderStage, SwPayment, SwFreeBuild,
} from './types';
import { buildAgeDeck, buildAgeIIIDeck } from './cards';
import { hasWonderPower, wonderById } from './wonders';
import {
  productionFor, productionCanSupply, canChainBuild, validatePayment, cityEffects,
  shieldsFor, neighborsOf, effectiveCostFor, addCosts,
} from './resources';
import { scoreMatch, countEndVpTargets, rankRows } from './scoring';
import { getActiveExpansions } from './expansions/registry';
import type { SwEvent, SwTurnEndStep } from './expansions/types';

const AGE_MILITARY_WIN_VP: Record<SwAge, number> = { 1: 1, 2: 3, 3: 5 };
const DISCARD_COIN_REWARD = 3;

const BASE_SUBPHASES = new Set(['picking', 'discardBuild', 'militaryEnd', 'finalScoring']);

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<SwLogEntry, 'seq' | 'age' | 'ageRound'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function pushLog(state: SwState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({
    seq: state.logSeq,
    age: state.age,
    ageRound: state.ageRound,
    ...partial,
  } as SwLogEntry);
}

export function playerById(state: SwState, id: PlayerId): SwPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// Sizes

/** Cards in each hand: 7, more with Cities (8 up to 7 players). */
export function handSize(state: Pick<SwState, 'config' | 'players'>): number {
  let extra = 0;
  for (const ext of getActiveExpansions(state.config)) {
    extra = Math.max(extra, ext.extraHandCards?.(state.players.length) ?? 0);
  }
  return 7 + extra;
}

/** Picks in an Age (the last card is discarded). */
export function picksPerAge(state: Pick<SwState, 'config' | 'players'>): number {
  return handSize(state) - 1;
}

// ---------------------------------------------------------------------------
// Coins

/** Coins from the bank. Berenice adds 1, once per turn. */
export function gainFromBank(state: SwState, player: SwPlayer, amount: number): void {
  if (amount <= 0) return;
  let bonus = 0;
  const used = (state.bankBonusUsed ??= []);
  if (!used.includes(player.id) && cityEffects(player).some((e) => e.kind === 'bankBonus')) {
    bonus = 1;
    used.push(player.id);
  }
  player.coins += amount + bonus;
}

/** Queue a coin loss for every city but `from` (settled at the end of the turn). */
function queueLoss(state: SwState, from: SwPlayer, eff: Extract<SwCardEffect, { kind: 'coinLoss' }>): void {
  const losses = (state.pendingLosses ??= {});
  for (const p of state.players) {
    if (p.id === from.id) continue;
    const times = eff.per === 'victoryToken' ? p.militaryTokens.filter((t) => t > 0).length
      : eff.per === 'wonderStage' ? p.wonderStagesBuilt
      : 1;
    const owed = eff.amount * times;
    if (owed > 0) losses[p.id] = (losses[p.id] ?? 0) + owed;
  }
}

/** The immediate part of a card's or stage's effects: coins (flat and per
 *  counted item), the neighbours' share, coin losses for the others,
 *  diplomacy tokens. */
export function applyPlayEffects(state: SwState, player: SwPlayer, effects: readonly SwCardEffect[]): void {
  let coins = 0;
  for (const eff of effects) {
    switch (eff.kind) {
      case 'coins': coins += eff.amount; break;
      case 'endVp':
        if (eff.coinsPerOnPlay) coins += countEndVpTargets(state, player, eff) * eff.coinsPerOnPlay;
        break;
      case 'neighborsGain': {
        const { west, east } = neighborsOf(state, player.id);
        for (const n of west.id === east.id ? [west] : [west, east]) gainFromBank(state, n, eff.amount);
        break;
      }
      case 'coinLoss': queueLoss(state, player, eff); break;
      case 'diplomacy': player.diplomacyTokens = (player.diplomacyTokens ?? 0) + 1; break;
      default: break;
    }
  }
  gainFromBank(state, player, coins);
}

// ---------------------------------------------------------------------------
// Who acts

/** Does this player still owe a pick this turn? (On Babylon B's last-card
 *  turn every other hand is empty.) */
function owesPick(p: SwPlayer): boolean {
  return p.pendingPick === null && p.hand.length > 0;
}

function allPlayersSubmitted(state: SwState): boolean {
  return !state.players.some(owesPick);
}

/** Public helper: set activePlayerId to whichever seat should act next.
 *  Defers to expansions when the subphase is expansion-owned. */
export function setActiveAIIfAny(state: SwState): void {
  if (BASE_SUBPHASES.has(state.subPhase)) {
    if (state.subPhase === 'picking') {
      state.activePlayerId = nextSimultaneousSeat(state.seats, state.players.filter(owesPick).map((p) => p.id));
    } else if (state.subPhase === 'discardBuild') {
      state.activePlayerId = state.discardBuildQueue?.[0] ?? null;
    } else {
      state.activePlayerId = null;
    }
    return;
  }
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.ownsSubPhase?.(state.subPhase) && ext.nextAIPicker) {
      state.activePlayerId = ext.nextAIPicker(state);
      return;
    }
  }
  state.activePlayerId = null;
}

/** Emit an event to all active expansions. */
export function emitEvent(state: SwState, event: SwEvent): void {
  for (const ext of getActiveExpansions(state.config)) {
    ext.onEvent?.(state, event);
  }
}

/** Start a turn's once-per-turn bookkeeping. */
export function beginTurnFlags(state: SwState): void {
  state.bankBonusUsed = [];
  emitEvent(state, { kind: 'tickStart' });
}

// ---------------------------------------------------------------------------
// Ages

/** Deal the Age: the base deck for the table (7-player deck at 8), the
 *  expansions' cards (Cities' black cards), `handSize` cards each. */
function dealAge(state: SwState, age: SwAge): void {
  const n = state.players.length;
  const exts = getActiveExpansions(state.config);
  let deck = age === 3
    ? buildAgeIIIDeck(state.rngState, n, exts.flatMap((e) => e.guilds?.() ?? []))
    : buildAgeDeck(age, n);
  for (const ext of exts) {
    const extra = ext.ageDeckCards?.(age, n, state.rngState) ?? [];
    if (extra.length > 0) deck = deck.concat(extra);
  }
  const size = handSize(state);
  deck = shuffle(state.rngState, deck).slice(0, n * size);
  for (const p of state.players) {
    p.hand = deck.splice(0, size);
    p.pendingPick = null;
  }
}

/** Start a new Age: expansions may intercept (Leaders' Recruitment phase). */
export function tryStartAge(state: SwState, age: SwAge): void {
  state.age = age;
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.beforeAgeStart?.(state, age)) return;
  }
  startAge(state, age);
}

/** Actually begin an Age — called after any intercept has run. */
export function startAge(state: SwState, age: SwAge): void {
  state.age = age;
  state.ageRound = 1;
  state.subPhase = 'picking';
  state.turnKind = 'pick';
  state.passDirection = age === 2 ? 'ccw' : 'cw';
  state.discardBuildQueue = [];
  for (const ext of getActiveExpansions(state.config)) ext.onAgeStart?.(state, age);
  dealAge(state, age);
  pushLog(state, { kind: 'ageStart' });
  beginTurnFlags(state);
  setActiveAIIfAny(state);
}

/** Phases before Age I (drafts), in expansion order; then Age I. */
export function beginPregame(state: SwState): void {
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.pregame?.(state)) {
      setActiveAIIfAny(state);
      return;
    }
  }
  tryStartAge(state, 1);
}

/** Pass the hands: 'cw' (Ages I, III) to the left = west neighbour (index − 1),
 *  'ccw' (Age II) to the right = east (index + 1). */
function rotateHands(state: SwState): void {
  const hands = state.players.map((p) => p.hand);
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    state.players[i].hand = state.passDirection === 'cw' ? hands[(i + 1) % n] : hands[(i - 1 + n) % n];
  }
}

// ---------------------------------------------------------------------------
// Picks

/** Olympia A: may this player build for free right now? */
export function canBuildFree(state: SwState, player: SwPlayer): boolean {
  return hasWonderPower(player, 'freeBuildPerAge') && player.freeBuildUsedAge !== state.age;
}

/** Caligula: may this card be built for free this Age? */
export function canBuildColorFree(state: SwState, player: SwPlayer, card: SwCard): boolean {
  return player.freeColorUsedAge !== state.age
    && cityEffects(player).some((e) => e.kind === 'freeColorPerAge' && e.color === card.color);
}

/** The free-build kinds a city could use on this card right now. */
export function freeBuildsFor(state: SwState, player: SwPlayer, card: SwCard): Array<'olympia' | 'color' | 'token'> {
  const out: Array<'olympia' | 'color' | 'token'> = [];
  if (canBuildFree(state, player)) out.push('olympia');
  if (canBuildColorFree(state, player, card)) out.push('color');
  if ((player.projectTokens?.freeBuild ?? 0) > 0) out.push('token');
  return out;
}

/** Which free build a pick's `free` names (`true` is Olympia A's). */
export function freeKind(free: SwFreeBuild | undefined): 'olympia' | 'color' | 'token' | null {
  if (free === undefined) return null;
  return free === true ? 'olympia' : free;
}

/** An expansion's extra cost for this pick (a Great Project participation). */
function extraPickCost(state: SwState, player: SwPlayer, pick: SwPendingPick, card: SwCard): SwCost | null {
  let out: SwCost | null = null;
  for (const ext of getActiveExpansions(state.config)) {
    const c = ext.pickCost?.(state, player, pick, card) ?? null;
    if (c) out = out ? addCosts(out, c) : c;
  }
  return out;
}

/** Everything a pick costs (null = nothing to pay). */
export function pickCostFor(state: SwState, player: SwPlayer, pick: SwPendingPick, card: SwCard): SwCost | null {
  const extra = extraPickCost(state, player, pick, card);
  if (pick.kind === 'build') {
    if (pick.free) return extra;
    const target = canChainBuild(state, player, card) ? { kind: 'chain' as const, card } : { kind: 'card' as const, card };
    return addCosts(effectiveCostFor(state, player, target), extra);
  }
  if (pick.kind === 'wonder') {
    if (pick.free === 'token') return extra;
    const stage = wonderById(player.wonderId).stages[pick.stageIndex];
    return addCosts(effectiveCostFor(state, player, { kind: 'wonderStage', stageIndex: pick.stageIndex, stage }), extra);
  }
  return extra;
}

function isEmptyCost(c: SwCost | null): boolean {
  return !c || ((c.coins ?? 0) === 0 && (c.resources?.length ?? 0) === 0);
}

/** Validate a pendingPick against the player's hand + rules. Throws on illegal. */
export function validatePick(state: SwState, player: SwPlayer, pick: SwPendingPick): void {
  const card = player.hand.find((c) => c.id === pick.cardId);
  if (!card) throw new Error(`Card ${pick.cardId} not in hand.`);

  if (pick.kind === 'build') {
    if (player.tableau.some((c) => c.name === card.name)) {
      throw new Error(`You already have ${card.name} in your tableau.`);
    }
    const free = freeKind(pick.free);
    if (free === 'olympia' && !canBuildFree(state, player)) throw new Error('No free build available this Age.');
    if (free === 'color' && !canBuildColorFree(state, player, card)) throw new Error(`No free ${card.color} card available this Age.`);
    if (free === 'token' && (player.projectTokens?.freeBuild ?? 0) <= 0) throw new Error('No free-build token.');
  } else if (pick.kind === 'wonder') {
    const wonder = wonderById(player.wonderId);
    if (pick.stageIndex !== player.wonderStagesBuilt) {
      throw new Error(`Wonder stage ${pick.stageIndex + 1} can only be built when stage ${player.wonderStagesBuilt + 1} is next.`);
    }
    if (pick.stageIndex >= wonder.stages.length) throw new Error('No more wonder stages available.');
    if (pick.free === 'token' && (player.projectTokens?.freeStage ?? 0) <= 0) throw new Error('No free-stage token.');
  } else if (pick.kind !== 'discard') {
    if (!getActiveExpansions(state.config).some((e) => e.pickKinds?.includes(pick.kind))) {
      throw new Error(`No expansion in this game allows a ${pick.kind} pick.`);
    }
  }
  for (const ext of getActiveExpansions(state.config)) ext.validatePick?.(state, player, pick, card);

  if (pick.kind === 'build' || pick.kind === 'wonder') {
    const cost = pickCostFor(state, player, pick, card);
    if (!isEmptyCost(cost)) {
      const v = validatePayment(state, player, cost!, pick.payment);
      if (!v.ok) throw new Error(`Cannot pay for ${pick.kind === 'build' ? card.name : 'the wonder stage'}: ${v.error}`);
    }
  }
}

/** One player's pick, resolved against the table as it stood at the start of
 *  the turn (simultaneous play: nothing built this turn can pay for it). */
interface ResolvedPick {
  player: SwPlayer;
  pick: SwPendingPick;
  card: SwCard;
  viaChain: boolean;
  /** Coins to the bank and to each neighbour. */
  pay: { total: number; toWest: number; toEast: number };
  stage: SwWonderStage | null;
}

function resolvePick(state: SwState, player: SwPlayer, pick: SwPendingPick): ResolvedPick | null {
  const card = player.hand.find((c) => c.id === pick.cardId);
  if (!card) return null;
  const none = { total: 0, toWest: 0, toEast: 0 };
  if (pick.kind === 'discard' || pick.kind === 'babelTile') return { player, pick, card, viaChain: false, pay: none, stage: null };
  const viaChain = pick.kind === 'build' && !pick.free && canChainBuild(state, player, card);
  const stage = pick.kind === 'wonder' ? wonderById(player.wonderId).stages[pick.stageIndex] : null;
  const cost = pickCostFor(state, player, pick, card);
  if (isEmptyCost(cost)) return { player, pick, card, viaChain, pay: none, stage };
  const v = validatePayment(state, player, cost!, pick.payment);
  return { player, pick, card, viaChain, pay: v.ok ? { total: v.totalCoins, toWest: v.toWest, toEast: v.toEast } : none, stage };
}

/** Pay a resolved cost: coins out, trade coins to the neighbours. */
function payFor(state: SwState, player: SwPlayer, pay: ResolvedPick['pay'], payment: SwPayment): void {
  if (pay.total === 0) return;
  const { west, east } = neighborsOf(state, player.id);
  player.coins -= pay.total;
  west.coins += pay.toWest;
  east.coins += pay.toEast;
  if (payment.fromWest.length > 0) {
    emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: west.id, units: payment.fromWest.length });
  }
  if (payment.fromEast.length > 0) {
    emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: east.id, units: payment.fromEast.length });
  }
}

/** Pass 1: the card leaves the hand and the cost is paid. */
function placePick(state: SwState, r: ResolvedPick): void {
  const { player, pick, card } = r;
  player.hand = player.hand.filter((c) => c.id !== card.id);
  if (pick.kind === 'discard' || pick.kind === 'babelTile') {
    state.discard.push(card);
  } else if (pick.kind === 'build') {
    player.tableau.push(card);
    const free = freeKind(pick.free);
    if (free === 'olympia') player.freeBuildUsedAge = state.age;
    if (free === 'color') player.freeColorUsedAge = state.age;
    if (free === 'token' && player.projectTokens) player.projectTokens.freeBuild -= 1;
    payFor(state, player, r.pay, pick.payment);
  } else {
    // The card goes face down under the stage (out of the game).
    player.wonderStagesBuilt += 1;
    if (pick.free === 'token' && player.projectTokens) player.projectTokens.freeStage -= 1;
    payFor(state, player, r.pay, pick.payment);
  }
  for (const ext of getActiveExpansions(state.config)) ext.onPickPlaced?.(state, player, pick, card);
}

/** A wonder stage's immediate effects (also used when a leader is buried
 *  under one). */
export function applyStage(state: SwState, player: SwPlayer, stage: SwWonderStage, stageIndex: number): void {
  applyPlayEffects(state, player, stage.effects);
  if (stage.effects.some((e) => e.kind === 'buildFromDiscard')) {
    (state.discardBuildQueue ??= []).push(player.id);
  }
  emitEvent(state, { kind: 'wonderStageBuilt', playerId: player.id, stageIndex });
}

/** Pass 2: on-play effects, which see every card placed this turn. */
function activatePick(state: SwState, r: ResolvedPick): void {
  const { player, pick, card } = r;
  if (pick.kind === 'discard') {
    gainFromBank(state, player, DISCARD_COIN_REWARD);
    return;
  }
  if (pick.kind === 'babelTile') return;
  if (pick.kind === 'build') {
    applyPlayEffects(state, player, card.effects);
    emitEvent(state, { kind: 'cardBuilt', playerId: player.id, card, viaChain: r.viaChain });
    return;
  }
  applyStage(state, player, r.stage!, pick.stageIndex);
}

/** Reveal every pick and resolve the turn simultaneously. Mutates state. */
function revealAndApply(state: SwState): void {
  const resolved: ResolvedPick[] = [];
  for (const p of state.players) {
    if (!p.pendingPick) continue;
    const r = resolvePick(state, p, p.pendingPick);
    pushLog(state, { kind: 'pickRevealed', playerId: p.id, pick: p.pendingPick, cardName: r?.card.name ?? '?' });
    if (r) resolved.push(r);
  }
  for (const r of resolved) placePick(state, r);
  for (const r of resolved) activatePick(state, r);
  for (const p of state.players) p.pendingPick = null;
}

/** Cards a player may take from the discard pile (no duplicate names). */
export function discardBuildOptions(state: SwState, player: SwPlayer): SwCard[] {
  return state.discard.filter((c) => !player.tableau.some((t) => t.name === c.name));
}

/** Build a card from the discard pile for free (Halicarnassus, Solomon),
 *  optionally paying into the Great Project with it. Throws if illegal. */
export function buildFromDiscardPile(
  state: SwState,
  player: SwPlayer,
  cardId: number,
  participate = false,
  payment: SwPayment = { fromWest: [], fromEast: [], coins: 0 },
): SwCard {
  const card = discardBuildOptions(state, player).find((c) => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} can't be built from the discard pile.`);
  const pick: SwPendingPick = { kind: 'build', cardId, payment, free: 'olympia', ...(participate ? { participate: true } : {}) };
  // Validate the participation (the card itself is free).
  if (participate) {
    const probe: SwPlayer = { ...player, hand: [...player.hand, card] };
    for (const ext of getActiveExpansions(state.config)) ext.validatePick?.(state, probe, pick, card);
  }
  const cost = participate ? extraPickCost(state, player, pick, card) : null;
  let pay = { total: 0, toWest: 0, toEast: 0 };
  if (!isEmptyCost(cost)) {
    const v = validatePayment(state, player, cost!, payment);
    if (!v.ok) throw new Error(`Cannot pay the participation: ${v.error}`);
    pay = { total: v.totalCoins, toWest: v.toWest, toEast: v.toEast };
  }
  state.discard = state.discard.filter((c) => c.id !== card.id);
  player.tableau.push(card);
  payFor(state, player, pay, payment);
  if (participate) for (const ext of getActiveExpansions(state.config)) ext.onPickPlaced?.(state, player, pick, card);
  applyPlayEffects(state, player, card.effects);
  emitEvent(state, { kind: 'cardBuilt', playerId: player.id, card, viaChain: false });
  return card;
}

// ---------------------------------------------------------------------------
// End of turn

/** Halicarnassus' build from the discard pile. */
const DISCARD_BUILD_STEP: SwTurnEndStep = {
  order: 20,
  run(state) {
    const queue = (state.discardBuildQueue ??= []);
    while (queue.length > 0) {
      if (discardBuildOptions(state, playerById(state, queue[0])).length > 0) {
        state.subPhase = 'discardBuild';
        state.activePlayerId = queue[0];
        return true;
      }
      queue.shift(); // nothing buildable: the power is lost
    }
    return false;
  },
};

function turnEndSteps(state: SwState): SwTurnEndStep[] {
  const steps: SwTurnEndStep[] = [DISCARD_BUILD_STEP];
  for (const ext of getActiveExpansions(state.config)) steps.push(...(ext.turnEndSteps ?? []));
  return steps.sort((a, b) => a.order - b.order);
}

/** Run the end-of-turn steps until one waits on a decision; when all are
 *  done, move on (next pick, Babylon's last card, the Age's end — or, after
 *  the Recruitment phase, the Age's deal). Re-entered after every decision. */
export function continueTurnEnd(state: SwState): void {
  for (const step of turnEndSteps(state)) {
    if (step.run(state)) return;
  }
  // Losses nobody settled (no Cities rules in play) are simply paid.
  if (state.pendingLosses) {
    for (const [id, owed] of Object.entries(state.pendingLosses)) {
      const p = playerById(state, id);
      p.coins = Math.max(0, p.coins - owed);
    }
    state.pendingLosses = {};
  }
  if (state.turnKind === 'leader') {
    startAge(state, state.age);
    return;
  }
  const last = picksPerAge(state);
  if (state.ageRound < last) {
    rotateHands(state);
    startTurn(state, state.ageRound + 1);
    return;
  }
  if (state.ageRound === last && state.players.some((p) => p.hand.length > 0)) {
    // Babylon B keeps its last card and plays it as a turn of its own.
    startTurn(state, last + 1);
    return;
  }
  endAge(state);
}

function startTurn(state: SwState, round: number): void {
  state.ageRound = round;
  state.subPhase = 'picking';
  beginTurnFlags(state);
  setActiveAIIfAny(state);
}

/** Discard everyone's leftover cards. */
function discardLastCards(state: SwState, keep: (p: SwPlayer) => boolean = () => false): void {
  for (const p of state.players) {
    if (p.hand.length > 0 && !keep(p)) {
      state.discard.push(...p.hand);
      p.hand = [];
    }
  }
}

// ---------------------------------------------------------------------------
// Military

/** Resolve the Age's conflicts. Cities sitting out (diplomacy) are skipped
 *  and their neighbours face each other across the gap; with only two cities
 *  left they fight once. One token per battle: a victory (+1/+3/+5, or what a
 *  Babel tile makes of it) and defeat token(s) (a Babel tile doubles them;
 *  Tomyris hands the loser's to the victor). */
function resolveMilitary(state: SwState): SwMilitarySummary {
  const exts = getActiveExpansions(state.config);
  const ageVp = AGE_MILITARY_WIN_VP[state.age];
  const skipped = new Set<PlayerId>();
  for (const ext of exts) for (const id of ext.conflictSkips?.(state) ?? []) skipped.add(id);
  let victory = ageVp;
  for (const ext of exts) if (ext.victoryToken) victory = ext.victoryToken(state, victory);
  let defeats = 1;
  for (const ext of exts) if (ext.defeatTokens) defeats = Math.max(defeats, ext.defeatTokens(state));

  const shields = new Map(state.players.map((p) => [p.id, shieldsFor(p)]));
  const active = state.players.filter((p) => !skipped.has(p.id));
  const rows = new Map<PlayerId, SwMilitarySummary['perPlayer'][number]>();
  for (const p of state.players) {
    rows.set(p.id, {
      playerId: p.id, vsWest: 'draw', vsEast: 'draw', tokenGained: 0,
      shields: shields.get(p.id), ...(skipped.has(p.id) ? { diplomacy: true } : {}),
    });
  }
  // Tokens per city and side, taken west battle first, then east.
  const tokens = new Map<PlayerId, { vsWest: number[]; vsEast: number[] }>(state.players.map((p) => [p.id, { vsWest: [], vsEast: [] }]));

  const fight = (a: SwPlayer, b: SwPlayer, aSide: 'vsWest' | 'vsEast', bSide: 'vsWest' | 'vsEast') => {
    const sa = shields.get(a.id) ?? 0;
    const sb = shields.get(b.id) ?? 0;
    if (sa === sb) return;
    const [win, lose] = sa > sb ? [a, b] : [b, a];
    const winSide = win === a ? aSide : bSide;
    const loseSide = lose === a ? aSide : bSide;
    rows.get(win.id)![winSide] = 'win';
    rows.get(lose.id)![loseSide] = 'loss';
    if (victory > 0) tokens.get(win.id)![winSide].push(victory);
    const toVictor = cityEffects(lose).some((e) => e.kind === 'defeatToVictor');
    for (let i = 0; i < defeats; i++) {
      if (toVictor) tokens.get(win.id)![winSide].push(-1);
      else tokens.get(lose.id)![loseSide].push(-1);
    }
  };

  if (active.length === 2) {
    fight(active[0], active[1], 'vsEast', 'vsWest');
  } else if (active.length > 2) {
    // Each city against the next active one to its east.
    for (let i = 0; i < active.length; i++) fight(active[i], active[(i + 1) % active.length], 'vsEast', 'vsWest');
  }

  for (const p of state.players) {
    const got = [...tokens.get(p.id)!.vsWest, ...tokens.get(p.id)!.vsEast];
    const row = rows.get(p.id)!;
    row.tokenGained = got.reduce((s, t) => s + t, 0);
    for (const t of got) {
      p.militaryTokens.push(t);
      if (t > 0) emitEvent(state, { kind: 'militaryTokenGained', playerId: p.id, vp: t, age: state.age });
    }
  }
  return { age: state.age, perPlayer: state.players.map((p) => rows.get(p.id)!) };
}

/** Transition to the next age, or finalize the match if Age III is done. */
function advanceAfterMilitary(state: SwState): void {
  if (state.age === 3) {
    const breakdown = scoreMatch(state);
    state.finalScoringBreakdown = breakdown;
    state.finalScores = {};
    for (const row of breakdown) state.finalScores[row.playerId] = row.total;
    const { winnerIds } = rankRows(state, breakdown);
    state.phase = 'gameOver';
    state.subPhase = 'finalScoring';
    pushLog(state, { kind: 'matchEnd', winnerId: winnerIds.length === 1 ? winnerIds[0] : null });
    return;
  }
  state.subPhase = 'militaryEnd';
}

/** Tick: after every pick is in, reveal/apply, then end the turn. */
function tick(state: SwState): void {
  revealAndApply(state);
  // The last pick's leftover cards are discarded now — before any discard
  // build, which may take one — except Babylon B's, which it plays next.
  if (state.ageRound === picksPerAge(state)) discardLastCards(state, (p) => hasWonderPower(p, 'playLastCard'));
  continueTurnEnd(state);
}

/** End of an Age: discard what's left, the expansions' Age-end step, military. */
function endAge(state: SwState): void {
  discardLastCards(state);
  continueAgeEnd(state);
}

/** Re-entered after each Age-end decision (a Great Project's penalty). */
export function continueAgeEnd(state: SwState): void {
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.ageEndStep?.(state)) {
      setActiveAIIfAny(state);
      return;
    }
  }
  const summary = resolveMilitary(state);
  state.lastMilitaryResolution = summary;
  pushLog(state, { kind: 'militaryResolution', summary });
  advanceAfterMilitary(state);
  // At militaryEnd, in an all-AI match park activePlayerId on the first AI seat
  // so the GameHost AI driver dispatches 'continue' automatically. When humans
  // are playing, leave it null so a human can read the summary and click on.
  if (state.subPhase === 'militaryEnd') {
    const allAI = state.seats.length > 0 && state.seats.every((s) => s.isAI);
    state.activePlayerId = allAI ? (state.seats[0]?.id ?? null) : null;
  } else {
    state.activePlayerId = null;
  }
}

// ---------------------------------------------------------------------------
// Actions

export function applyAction(state: SwState, action: SwAction): SwState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);

  switch (action.type) {
    case 'submitPick': {
      if (s.subPhase !== 'picking') throw new Error('submitPick: not in picking subPhase');
      const player = playerById(s, action.playerId);
      if (player.pendingPick !== null) throw new Error('submitPick: already submitted');
      validatePick(s, player, action.pick);
      player.pendingPick = action.pick;
      pushLog(s, { kind: 'pickSubmitted', playerId: player.id });
      if (allPlayersSubmitted(s)) {
        tick(s);
      } else {
        setActiveAIIfAny(s);
      }
      return s;
    }

    case 'buildFromDiscard': {
      if (s.subPhase !== 'discardBuild') throw new Error('buildFromDiscard: not in discardBuild');
      if (s.discardBuildQueue?.[0] !== action.playerId) throw new Error('buildFromDiscard: not your pick');
      const player = playerById(s, action.playerId);
      let card: SwCard | null = null;
      if (action.cardId !== null) {
        card = buildFromDiscardPile(s, player, action.cardId, action.participate ?? false, action.payment);
      }
      pushLog(s, { kind: 'discardBuilt', playerId: player.id, cardId: card?.id ?? null, cardName: card?.name ?? null });
      s.discardBuildQueue!.shift();
      continueTurnEnd(s);
      return s;
    }

    case 'continue': {
      if (s.subPhase !== 'militaryEnd') throw new Error('continue: not in militaryEnd');
      tryStartAge(s, (s.age + 1) as SwAge);
      return s;
    }

    default: {
      for (const ext of getActiveExpansions(s.config)) {
        if (!ext.applyAction) continue;
        const result = ext.applyAction(s, action);
        if (result !== undefined) return result;
      }
      throw new Error(`Unhandled action type: ${(action as { type: string }).type}`);
    }
  }
}

/** Initial setup: starting coins, empty cities, expansions' setup, then the
 *  pre-game phases and Age I. */
export function setupNewMatch(state: SwState): void {
  for (const p of state.players) {
    p.coins = 3;
    p.tableau = [];
    p.hand = [];
    p.pendingPick = null;
    p.wonderStagesBuilt = 0;
    p.militaryTokens = [];
    p.freeBuildUsedAge = null;
  }
  state.discard = [];
  state.discardBuildQueue = [];
  state.lastMilitaryResolution = null;
  state.finalScoringBreakdown = null;
  state.finalScores = null;
  state.phase = 'playing';
  state.subPhase = 'picking';
  state.turnKind = 'pick';
  state.pendingLosses = {};
  for (const ext of getActiveExpansions(state.config)) ext.setupMatch?.(state);
  beginPregame(state);
}

/** Re-exported for tests. */
export const _internals = {
  rotateHands, revealAndApply, resolveMilitary, advanceAfterMilitary,
  productionFor, productionCanSupply, dealAge, emitEvent,
};
