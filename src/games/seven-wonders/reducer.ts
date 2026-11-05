// 7 Wonders reducer.
//
// Turn flow (per Age, repeats 3 times):
//   1. Deal 7 cards per player; subPhase = 'picking'.
//   2. Each player submits a pendingPick (build / wonder / discard), validated
//      against the table as it stood at the start of the turn. When all have
//      submitted, the turn resolves simultaneously in two passes:
//        - place: every card leaves its hand (into a city, under a wonder
//          stage, or onto the discard pile) and every cost is paid — trade
//          coins go to the neighbours;
//        - activate: on-play income (Tavern, Vineyard, Arena, a discard's 3
//          coins…), counting the cards everyone built this turn, then events.
//      Building rules: no two cards of the same name in a city; a chain card
//      is free; Olympia A builds once per Age for free (`pick.free`); wonder
//      stages go in order.
//   3. End of turn: on the 6th pick the last card is discarded, except by a
//      city with Babylon B's power, which plays it next (ageRound 7, only that
//      city picks). A Halicarnassus stage built this turn → 'discardBuild':
//      that city builds one card from the discard pile for free (the 6th
//      pick's last cards included). Then hands pass: to the west (left) in
//      Ages I and III, to the east (right) in Age II.
//   4. After the Age's last turn, resolve military: each player vs both
//      neighbours, comparing shields. Each win is a +1 / +3 / +5 token (Ages
//      I/II/III), each loss a −1 token, a draw nothing.
//   5. After Age III military, phase = 'gameOver' with the final scoring
//      breakdown; ties go to the most coins.
//
// Expansion hooks: any action type not in the base switch is routed through
// active expansions' applyAction. Subphases not in the base set (e.g.,
// 'leaderDraft', 'leaderPlay') are owned by expansions. The base reducer never
// switches on expansion id — it iterates getActiveExpansions(state.config).

import type { PlayerId } from '@/core/types';
import { shuffle } from '@/core/rng';
import type {
  SwState, SwAction, SwPlayer, SwPendingPick, SwAge,
  SwMilitarySummary, SwLogEntry, SwCard, SwWonderStage,
} from './types';
import {
  buildAgeDeck, buildAgeIIIDeck, ageDeckTargetSize, resetCardIdCounter,
} from './cards';
import { hasWonderPower, wonderById } from './wonders';
import {
  productionFor, productionCanSupply, canChainBuild, validatePayment,
  shieldsFor, sumCoinsOnPlay, neighborsOf, effectiveCostFor,
} from './resources';
import { scoreMatch, coinsOnPlayForEndVp, rankRows } from './scoring';
import { getActiveExpansions } from './expansions/registry';
import type { SwEvent } from './expansions/types';

const AGE_MILITARY_WIN_VP: Record<SwAge, number> = { 1: 1, 2: 3, 3: 5 };
const DISCARD_COIN_REWARD = 3;

const BASE_SUBPHASES = new Set(['picking', 'discardBuild', 'militaryEnd', 'finalScoring']);

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<SwLogEntry, 'seq' | 'age' | 'ageRound'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: SwState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({
    seq: state.logSeq,
    age: state.age,
    ageRound: state.ageRound,
    ...partial,
  } as SwLogEntry);
}

function playerById(state: SwState, id: PlayerId): SwPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

/** Does this player still owe a pick this turn? (On Babylon B's 7th-card
 *  turn every other hand is empty.) */
function owesPick(p: SwPlayer): boolean {
  return p.pendingPick === null && p.hand.length > 0;
}

/** True if every player who holds cards has submitted a pick this tick. */
function allPlayersSubmitted(state: SwState): boolean {
  return !state.players.some(owesPick);
}

/** Who `activePlayerId` should point at while picks are open. The GameHost AI
 *  driver acts for AI seats; a human seat parked here is the one hot-seat
 *  shows (and hands the device to). With one human, the AIs pick first so they
 *  are done while the human thinks; with several humans sharing a device, the
 *  humans go first and the AIs last, so no hand is on screen while an AI
 *  plays. Null once nobody owes a pick. */
function nextPickerBase(state: SwState): PlayerId | null {
  const isAI = (id: PlayerId) => state.seats.find((s) => s.id === id)?.isAI === true;
  const waiting = state.players.filter(owesPick);
  const ai = waiting.find((p) => isAI(p.id));
  const human = waiting.find((p) => !isAI(p.id));
  const humansFirst = state.seats.filter((s) => !s.isAI).length >= 2;
  return (humansFirst ? human ?? ai : ai ?? human)?.id ?? null;
}

/** Public helper: set activePlayerId to whichever seat should act next.
 *  Defers to expansions when the subphase is expansion-owned. */
export function setActiveAIIfAny(state: SwState): void {
  if (BASE_SUBPHASES.has(state.subPhase)) {
    if (state.subPhase === 'picking') {
      state.activePlayerId = nextPickerBase(state);
    } else if (state.subPhase === 'discardBuild') {
      state.activePlayerId = state.discardBuildQueue?.[0] ?? null;
    } else {
      state.activePlayerId = null;
    }
    return;
  }
  // Expansion-owned subphase: ask each expansion.
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.ownsSubPhase?.(state.subPhase) && ext.nextAIPicker) {
      state.activePlayerId = ext.nextAIPicker(state);
      return;
    }
  }
  state.activePlayerId = null;
}

/** Emit an event to all active expansions. */
function emitEvent(state: SwState, event: SwEvent): void {
  for (const ext of getActiveExpansions(state.config)) {
    ext.onEvent?.(state, event);
  }
}

/** Deal 7 cards to each player. The base decks hold exactly 7 per player;
 *  expansions may contribute extra cards via `ageDeckCards` (Cities, e.g.,
 *  adds black cards), in which case the shuffled deck is cut to 7 per player. */
function dealAge(state: SwState, age: SwAge): void {
  const playerCount = state.players.length;
  let deck = age === 3
    ? buildAgeIIIDeck(state.rngState, playerCount)
    : buildAgeDeck(age, playerCount);
  for (const ext of getActiveExpansions(state.config)) {
    if (!ext.ageDeckCards) continue;
    const extra = ext.ageDeckCards(age, playerCount, state.rngState);
    if (extra.length > 0) deck = deck.concat(extra);
  }
  deck = shuffle(state.rngState, deck).slice(0, ageDeckTargetSize(playerCount));
  for (const p of state.players) {
    p.hand = deck.splice(0, 7);
    p.pendingPick = null;
  }
}

/** Start a new Age: deal, set subPhase, pass direction, reset ageRound.
 *  Asks active expansions first if any wants to intercept (e.g., Leaders for
 *  the per-age leader-play step). */
export function tryStartAge(state: SwState, age: SwAge): void {
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.beforeAgeStart?.(state, age)) {
      // Expansion took control — it will dispatch the actual age start later.
      state.age = age;
      return;
    }
  }
  startAge(state, age);
}

/** Actually deal an age — called after expansion intercepts have run. */
export function startAge(state: SwState, age: SwAge): void {
  state.age = age;
  state.ageRound = 1;
  state.subPhase = 'picking';
  state.passDirection = age === 2 ? 'ccw' : 'cw';
  state.discardBuildQueue = [];
  dealAge(state, age);
  pushLog(state, { kind: 'ageStart' });
  // tickStart fires for per-tick housekeeping (e.g., Bilkis once-per-tick reset).
  emitEvent(state, { kind: 'tickStart' });
  setActiveAIIfAny(state);
}

/** Pass the hands: 'cw' (Ages I, III) to the left = west neighbour (index − 1),
 *  'ccw' (Age II) to the right = east (index + 1). */
function rotateHands(state: SwState): void {
  const hands = state.players.map((p) => p.hand);
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    // Player i receives from the neighbour on the other side.
    state.players[i].hand = state.passDirection === 'cw' ? hands[(i + 1) % n] : hands[(i - 1 + n) % n];
  }
}

/** Olympia A: may this player build for free right now? */
export function canBuildFree(state: SwState, player: SwPlayer): boolean {
  return hasWonderPower(player, 'freeBuildPerAge') && player.freeBuildUsedAge !== state.age;
}

/** Validate a pendingPick against the player's hand + rules. Throws on illegal. */
function validatePick(state: SwState, player: SwPlayer, pick: SwPendingPick): void {
  const card = player.hand.find((c) => c.id === pick.cardId);
  if (!card) throw new Error(`Card ${pick.cardId} not in hand.`);

  if (pick.kind === 'build') {
    // No duplicates by name.
    if (player.tableau.some((c) => c.name === card.name)) {
      throw new Error(`You already have ${card.name} in your tableau.`);
    }
    if (pick.free) {
      if (!canBuildFree(state, player)) throw new Error('No free build available this Age.');
      return;
    }
    // Chain-build → free.
    if (!canChainBuild(player, card)) {
      const effCost = effectiveCostFor(state, player, { kind: 'card', card });
      const validation = validatePayment(state, player, effCost, pick.payment);
      if (!validation.ok) throw new Error(`Cannot pay for ${card.name}: ${validation.error}`);
    }
  } else if (pick.kind === 'wonder') {
    const wonder = wonderById(player.wonderId);
    const stageIdx = pick.stageIndex;
    if (stageIdx !== player.wonderStagesBuilt) {
      throw new Error(`Wonder stage ${stageIdx + 1} can only be built when stage ${player.wonderStagesBuilt + 1} is next.`);
    }
    if (stageIdx >= wonder.stages.length) {
      throw new Error('No more wonder stages available.');
    }
    const stage = wonder.stages[stageIdx];
    const effCost = effectiveCostFor(state, player, { kind: 'wonderStage', stageIndex: stageIdx, stage });
    const validation = validatePayment(state, player, effCost, pick.payment);
    if (!validation.ok) throw new Error(`Cannot pay for wonder stage: ${validation.error}`);
  }
  // 'discard' is always legal.
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
  if (pick.kind === 'discard') return { player, pick, card, viaChain: false, pay: none, stage: null };
  if (pick.kind === 'build') {
    const viaChain = !pick.free && canChainBuild(player, card);
    if (pick.free || viaChain) return { player, pick, card, viaChain, pay: none, stage: null };
    const v = validatePayment(state, player, effectiveCostFor(state, player, { kind: 'card', card }), pick.payment);
    return { player, pick, card, viaChain, pay: v.ok ? { total: v.totalCoins, toWest: v.toWest, toEast: v.toEast } : none, stage: null };
  }
  const stage = wonderById(player.wonderId).stages[pick.stageIndex];
  const v = validatePayment(state, player, effectiveCostFor(state, player, { kind: 'wonderStage', stageIndex: pick.stageIndex, stage }), pick.payment);
  return { player, pick, card, viaChain: false, pay: v.ok ? { total: v.totalCoins, toWest: v.toWest, toEast: v.toEast } : none, stage };
}

/** Pass 1: the card leaves the hand and the cost is paid. */
function placePick(state: SwState, r: ResolvedPick): void {
  const { player, pick, card } = r;
  player.hand = player.hand.filter((c) => c.id !== card.id);
  if (pick.kind === 'discard') {
    state.discard.push(card);
    return;
  }
  const free = pick.kind === 'build' && pick.free === true;
  if (pick.kind === 'build') {
    player.tableau.push(card);
    if (free) player.freeBuildUsedAge = state.age;
  } else {
    // The card goes face down under the stage (out of the game).
    player.wonderStagesBuilt += 1;
  }
  if (free || r.viaChain) return;
  const { west, east } = neighborsOf(state, player.id);
  player.coins -= r.pay.total;
  west.coins += r.pay.toWest;
  east.coins += r.pay.toEast;
  if (pick.payment.fromWest.length > 0) {
    emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: west.id, units: pick.payment.fromWest.length });
  }
  if (pick.payment.fromEast.length > 0) {
    emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: east.id, units: pick.payment.fromEast.length });
  }
}

/** Pass 2: on-play effects, which see every card placed this turn. */
function activatePick(state: SwState, r: ResolvedPick): void {
  const { player, pick, card } = r;
  if (pick.kind === 'discard') {
    player.coins += DISCARD_COIN_REWARD;
    return;
  }
  if (pick.kind === 'build') {
    applyOnPlay(state, player, card);
    emitEvent(state, { kind: 'cardBuilt', playerId: player.id, card, viaChain: r.viaChain });
    return;
  }
  const stage = r.stage!;
  player.coins += sumCoinsOnPlay(stage.effects);
  if (stage.effects.some((e) => e.kind === 'buildFromDiscard')) {
    (state.discardBuildQueue ??= []).push(player.id);
  }
  emitEvent(state, { kind: 'wonderStageBuilt', playerId: player.id, stageIndex: pick.stageIndex });
}

/** A built card's immediate income: flat coins and coins per counted card. */
function applyOnPlay(state: SwState, player: SwPlayer, card: SwCard): void {
  player.coins += sumCoinsOnPlay(card.effects);
  for (const eff of card.effects) {
    if (eff.kind === 'endVp') {
      player.coins += coinsOnPlayForEndVp(state, player, eff);
    }
  }
}

/** Reveal every pick and resolve the turn simultaneously. Mutates state. */
function revealAndApply(state: SwState): void {
  const resolved: ResolvedPick[] = [];
  for (const p of state.players) {
    if (!p.pendingPick) continue;
    const r = resolvePick(state, p, p.pendingPick);
    pushLog(state, {
      kind: 'pickRevealed',
      playerId: p.id,
      pick: p.pendingPick,
      cardName: r?.card.name ?? '?',
    });
    if (r) resolved.push(r);
  }
  for (const r of resolved) placePick(state, r);
  for (const r of resolved) activatePick(state, r);
  for (const p of state.players) {
    p.pendingPick = null;
    p.transientResources = [];
    p.bilkisUsedThisTick = false;
  }
}

/** Cards a player may take from the discard pile (no duplicate names). */
export function discardBuildOptions(state: SwState, player: SwPlayer): SwCard[] {
  return state.discard.filter((c) => !player.tableau.some((t) => t.name === c.name));
}

/** After a turn's picks (and any discard build) are resolved: hand off to the
 *  next Halicarnassus pick, the next turn, Babylon's 7th card, or the Age's
 *  military. Re-entered after each 'buildFromDiscard'. */
function continueTurnEnd(state: SwState): void {
  const queue = (state.discardBuildQueue ??= []);
  while (queue.length > 0) {
    if (discardBuildOptions(state, playerById(state, queue[0])).length > 0) {
      state.subPhase = 'discardBuild';
      state.activePlayerId = queue[0];
      return;
    }
    queue.shift(); // nothing buildable: the power is lost
  }
  if (state.ageRound < 6) {
    rotateHands(state);
    startTurn(state, state.ageRound + 1);
    return;
  }
  if (state.ageRound === 6 && state.players.some((p) => p.hand.length > 0)) {
    // Babylon B keeps its last card and plays it as a turn of its own.
    startTurn(state, 7);
    return;
  }
  endAge(state);
}

function startTurn(state: SwState, round: number): void {
  state.ageRound = round;
  state.subPhase = 'picking';
  emitEvent(state, { kind: 'tickStart' });
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

/** Compute military resolution at age end. Mutates each player's militaryTokens:
 *  one token per battle won (+1/+3/+5) and one −1 token per battle lost.
 *  Cities: a player with ≥1 diplomacy token auto-spends one this age and is
 *  skipped from military comparison (counts as draws on both sides). Their
 *  neighbors are then compared against each OTHER across the gap. */
function resolveMilitary(state: SwState): SwMilitarySummary {
  const ageVp = AGE_MILITARY_WIN_VP[state.age];
  const perPlayer: SwMilitarySummary['perPlayer'] = [];
  const shieldsByPlayer = new Map<PlayerId, number>();
  for (const p of state.players) shieldsByPlayer.set(p.id, shieldsFor(p));

  const n = state.players.length;
  // Auto-spend one diplomacy token per holder, mark skipped.
  const skipped = new Set<PlayerId>();
  for (const p of state.players) {
    if ((p.diplomacyTokens ?? 0) > 0) {
      p.diplomacyTokens! -= 1;
      skipped.add(p.id);
    }
  }
  // Resolve neighbors by walking past skipped players.
  const neighborOf = (i: number, dir: -1 | 1): SwPlayer | null => {
    let j = i;
    for (let step = 0; step < n; step++) {
      j = (j + dir + n) % n;
      if (j === i) return null;
      const cand = state.players[j];
      if (!skipped.has(cand.id)) return cand;
    }
    return null;
  };
  const battle = (mine: number, other: SwPlayer | null): 'win' | 'loss' | 'draw' => {
    if (!other) return 'draw';
    const theirs = shieldsByPlayer.get(other.id) ?? 0;
    return mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
  };
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    if (skipped.has(p.id)) {
      // Skipped: draws on both sides, no tokens.
      perPlayer.push({ playerId: p.id, vsWest: 'draw', vsEast: 'draw', tokenGained: 0 });
      continue;
    }
    const myS = shieldsByPlayer.get(p.id) ?? 0;
    const vsWest = battle(myS, neighborOf(i, -1));
    const vsEast = battle(myS, neighborOf(i, 1));
    const value = (r: 'win' | 'loss' | 'draw') => (r === 'win' ? ageVp : r === 'loss' ? -1 : 0);
    perPlayer.push({ playerId: p.id, vsWest, vsEast, tokenGained: value(vsWest) + value(vsEast) });
  }
  // Apply: one token per battle, so defeat tokens are never netted away
  // (the Strategists Guild counts them).
  for (const row of perPlayer) {
    const p = playerById(state, row.playerId);
    for (const result of [row.vsWest, row.vsEast]) {
      if (result === 'win') {
        p.militaryTokens.push(ageVp);
        emitEvent(state, { kind: 'militaryTokenGained', playerId: p.id, vp: ageVp, age: state.age });
      } else if (result === 'loss') {
        p.militaryTokens.push(-1);
      }
    }
  }
  return { age: state.age, perPlayer };
}

/** Transition to the next age, or finalize the match if Age III is done. */
function advanceAfterMilitary(state: SwState): void {
  if (state.age === 3) {
    // Final scoring.
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
  // Otherwise, just stay in 'militaryEnd' until the user clicks continue.
  state.subPhase = 'militaryEnd';
}

/** Tick: after every pick is in, reveal/apply, then end the turn. */
function tick(state: SwState): void {
  revealAndApply(state);
  // The 6th pick's leftover cards are discarded now — before any discard
  // build, which may take one — except Babylon B's, which it plays next.
  if (state.ageRound === 6) discardLastCards(state, (p) => hasWonderPower(p, 'playLastCard'));
  continueTurnEnd(state);
}

/** End of an Age: discard what's left, resolve military, pause or finish. */
function endAge(state: SwState): void {
  discardLastCards(state);
  const summary = resolveMilitary(state);
  state.lastMilitaryResolution = summary;
  pushLog(state, { kind: 'militaryResolution', summary });
  advanceAfterMilitary(state);
  // At militaryEnd, in an all-AI match park activePlayerId on the first AI seat
  // so the GameHost AI driver dispatches 'continue' automatically (otherwise the
  // match would freeze waiting for a click that no one makes). When humans are
  // playing, leave it null so the human can read the summary and click through.
  if (state.subPhase === 'militaryEnd') {
    const allAI = state.seats.length > 0 && state.seats.every((s) => s.isAI);
    state.activePlayerId = allAI ? (state.seats[0]?.id ?? null) : null;
  } else {
    state.activePlayerId = null;
  }
}

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
        card = discardBuildOptions(s, player).find((c) => c.id === action.cardId) ?? null;
        if (!card) throw new Error(`Card ${action.cardId} can't be built from the discard pile.`);
        s.discard = s.discard.filter((c) => c.id !== card!.id);
        buildCardForFree(s, player, card);
      }
      pushLog(s, { kind: 'discardBuilt', playerId: player.id, cardId: card?.id ?? null, cardName: card?.name ?? null });
      s.discardBuildQueue!.shift();
      continueTurnEnd(s);
      return s;
    }

    case 'continue': {
      if (s.subPhase !== 'militaryEnd') throw new Error('continue: not in militaryEnd');
      const nextAge: SwAge = (s.age + 1) as SwAge;
      tryStartAge(s, nextAge);
      return s;
    }

    default: {
      // Route to active expansions.
      for (const ext of getActiveExpansions(s.config)) {
        if (!ext.applyAction) continue;
        const result = ext.applyAction(s, action);
        if (result !== undefined) return result;
      }
      throw new Error(`Unhandled action type: ${(action as { type: string }).type}`);
    }
  }
}

/** Build a card into a player's tableau as a side-effect (Halicarnassus,
 *  Solomon). Does not charge coins or resources. */
export function buildCardForFree(state: SwState, player: SwPlayer, card: SwCard): void {
  player.tableau.push(card);
  applyOnPlay(state, player, card);
  emitEvent(state, { kind: 'cardBuilt', playerId: player.id, card, viaChain: false });
}

/** Initial setup hook: build state, assign wonders, place starting coins. */
export function setupNewMatch(state: SwState): void {
  // Reset id counter so card ids are deterministic per match.
  resetCardIdCounter(1);
  // Starting coins: 3 per player.
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
  state.subPhase = 'picking'; // default; expansion setupMatch may override

  // Let expansions set up their pre-game state (e.g., Leaders' draft).
  let expansionTookControl = false;
  for (const ext of getActiveExpansions(state.config)) {
    const before: string = state.subPhase;
    ext.setupMatch?.(state);
    const after: string = state.subPhase;
    if (after !== before && !BASE_SUBPHASES.has(after)) {
      expansionTookControl = true;
    }
  }
  // If no expansion took control, start Age 1 directly.
  if (!expansionTookControl) {
    tryStartAge(state, 1);
  } else {
    setActiveAIIfAny(state);
  }
}

export { validatePick };

/** Re-exported for tests. */
export const _internals = {
  rotateHands, revealAndApply, resolveMilitary, advanceAfterMilitary,
  productionFor, productionCanSupply, dealAge, emitEvent,
};
