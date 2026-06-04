// 7 Wonders reducer.
//
// Turn flow (per Age, repeats 3 times):
//   1. Deal 7 cards per player; subPhase = 'picking'.
//   2. Each player submits a pendingPick (build / wonder / discard) — when all
//      have submitted, the reducer reveals + applies in a single batch:
//        - duplicate-name builds: ALLOWED only for FIRST copy (rulebook: cannot
//          build a card with same name as one already in your tableau)
//        - chain-build: free if any chainFrom name matches a tableau card
//        - wonder stages: built in order (next stage = wonderStagesBuilt + 1)
//        - discard: 3 coins gained, card moved to global discard pile
//   3. Hands rotate (CW in I/III, CCW in II); the last card (ageRound=7) is
//      discarded by all per the base 7W rule.
//   4. After 6 picks (the 7th card is auto-discarded), resolve military:
//        each player vs L+R neighbor, compare shields.
//      Win → +1 / +3 / +5 (Ages I/II/III). Loss → -1. Draw → 0.
//   5. After Age III military, transition to phase = 'gameOver' with the final
//      scoring breakdown filled in.
//
// Expansion hooks: any action type not in the base switch is routed through
// active expansions' applyAction. Subphases not in the base set (e.g.,
// 'leaderDraft', 'leaderPlay') are owned by expansions. The base reducer never
// switches on expansion id — it iterates getActiveExpansions(state.config).

import type { PlayerId } from '@/core/types';
import { shuffle } from '@/core/rng';
import type {
  SwState, SwAction, SwPlayer, SwPendingPick, SwAge,
  SwMilitarySummary, SwLogEntry, SwCard,
} from './types';
import {
  buildAgeDeck, buildAgeIIIDeck, ageDeckTargetSize, resetCardIdCounter,
} from './cards';
import { wonderById } from './wonders';
import {
  productionFor, productionCanSupply, canChainBuild, validatePayment,
  shieldsFor, sumCoinsOnPlay, neighborsOf, effectiveCostFor,
} from './resources';
import { scoreMatch, coinsOnPlayForEndVp } from './scoring';
import { getActiveExpansions } from './expansions/registry';
import type { SwEvent } from './expansions/types';

const AGE_MILITARY_WIN_VP: Record<SwAge, number> = { 1: 1, 2: 3, 3: 5 };
const DISCARD_COIN_REWARD = 3;

const BASE_SUBPHASES = new Set(['picking', 'militaryEnd', 'finalScoring']);

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

/** True if every player has submitted a pick this tick. */
function allPlayersSubmitted(state: SwState): boolean {
  return state.players.every((p) => p.pendingPick !== null);
}

/** Find the next AI player without a pendingPick, or null. */
function nextAIPickerBase(state: SwState): PlayerId | null {
  for (const p of state.players) {
    if (p.pendingPick !== null) continue;
    const seat = state.seats.find((s) => s.id === p.id);
    if (seat?.isAI) return p.id;
  }
  return null;
}

/** Public helper: set activePlayerId to whichever AI seat should act next.
 *  Defers to expansions when the subphase is expansion-owned. */
export function setActiveAIIfAny(state: SwState): void {
  if (BASE_SUBPHASES.has(state.subPhase)) {
    if (state.subPhase === 'picking') {
      state.activePlayerId = nextAIPickerBase(state);
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

/** Deal 7 cards to each player, sized to player count.
 *  Expansions may contribute extra cards via `ageDeckCards`. Cities, e.g., adds
 *  black cards proportional to player count. */
function dealAge(state: SwState, age: SwAge): void {
  const playerCount = state.players.length;
  let deck = age === 3
    ? buildAgeIIIDeck(state.rngState, playerCount)
    : buildAgeDeck(age, playerCount);
  // Fold in expansion-contributed cards (Cities, future Babel/Armada/Edifice).
  for (const ext of getActiveExpansions(state.config)) {
    if (!ext.ageDeckCards) continue;
    const extra = ext.ageDeckCards(age, playerCount, state.rngState);
    if (extra.length > 0) deck = deck.concat(extra);
  }
  const target = ageDeckTargetSize(playerCount);
  deck = shuffle(state.rngState, deck);
  // The card-data table doesn't perfectly track the rulebook's per-player
  // copy counts. Pad with duplicates (cycle, fresh ids) to reach (n × 7).
  if (deck.length < target && deck.length > 0) {
    const original = deck.slice();
    let nextId = (original[original.length - 1]?.id ?? 0) + 1;
    let i = 0;
    while (deck.length < target) {
      const src = original[i % original.length];
      deck.push({ ...src, id: nextId++ });
      i += 1;
    }
    deck = shuffle(state.rngState, deck);
  }
  if (deck.length > target) deck = deck.slice(0, target);
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
  dealAge(state, age);
  pushLog(state, { kind: 'ageStart' });
  // tickStart fires for per-tick housekeeping (e.g., Bilkis once-per-tick reset).
  emitEvent(state, { kind: 'tickStart' });
  setActiveAIIfAny(state);
}

/** Rotate hands among the players per state.passDirection. */
function rotateHands(state: SwState): void {
  const hands = state.players.map((p) => p.hand);
  const n = state.players.length;
  if (state.passDirection === 'cw') {
    // CW = player i sends their hand to (i+1) — i.e. player i receives from (i-1).
    for (let i = 0; i < n; i++) {
      state.players[i].hand = hands[(i - 1 + n) % n];
    }
  } else {
    for (let i = 0; i < n; i++) {
      state.players[i].hand = hands[(i + 1) % n];
    }
  }
}

/** Validate a pendingPick against the player's hand + rules. Throws on illegal. */
function validatePick(state: SwState, player: SwPlayer, pick: SwPendingPick): void {
  const cardId =
    pick.kind === 'build' ? pick.cardId
    : pick.kind === 'wonder' ? pick.cardId
    : pick.kind === 'discard' ? pick.cardId
    : -1;
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} not in hand.`);

  if (pick.kind === 'build') {
    // No duplicates by name.
    if (player.tableau.some((c) => c.name === card.name)) {
      throw new Error(`You already have ${card.name} in your tableau.`);
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

/** Apply a player's pendingPick to their tableau. Mutates state.players[i].
 *  Removes the card from hand, charges coins, pays neighbors, etc. */
function applyPick(state: SwState, player: SwPlayer): void {
  if (!player.pendingPick) return;
  const pick = player.pendingPick;

  if (pick.kind === 'discard') {
    const card = player.hand.find((c) => c.id === pick.cardId);
    if (!card) return;
    player.hand = player.hand.filter((c) => c.id !== pick.cardId);
    player.coins += DISCARD_COIN_REWARD;
    state.discard.push(card);
    return;
  }

  if (pick.kind === 'build') {
    const card = player.hand.find((c) => c.id === pick.cardId);
    if (!card) return;
    player.hand = player.hand.filter((c) => c.id !== pick.cardId);
    const viaChain = canChainBuild(player, card);
    // Apply payment.
    if (!viaChain) {
      const effCost = effectiveCostFor(state, player, { kind: 'card', card });
      const v = validatePayment(state, player, effCost, pick.payment);
      if (v.ok) {
        player.coins -= v.totalCoins;
        const { west, east } = neighborsOf(state, player.id);
        west.coins += v.toWest;
        east.coins += v.toEast;
        if (pick.payment.fromWest.length > 0) {
          emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: west.id, units: pick.payment.fromWest.length });
        }
        if (pick.payment.fromEast.length > 0) {
          emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: east.id, units: pick.payment.fromEast.length });
        }
      }
    }
    // Add to tableau.
    player.tableau.push(card);
    // Apply immediate effects: coins, coins-on-play from endVp.
    player.coins += sumCoinsOnPlay(card.effects);
    for (const eff of card.effects) {
      if (eff.kind === 'endVp') {
        player.coins += coinsOnPlayForEndVp(state, player, eff);
      }
    }
    emitEvent(state, { kind: 'cardBuilt', playerId: player.id, card, viaChain });
    return;
  }

  if (pick.kind === 'wonder') {
    const card = player.hand.find((c) => c.id === pick.cardId);
    if (!card) return;
    // Remove from hand — card goes face-down under the wonder (effectively gone).
    player.hand = player.hand.filter((c) => c.id !== pick.cardId);
    const wonder = wonderById(player.wonderId);
    const stage = wonder.stages[pick.stageIndex];
    const effCost = effectiveCostFor(state, player, { kind: 'wonderStage', stageIndex: pick.stageIndex, stage });
    const v = validatePayment(state, player, effCost, pick.payment);
    if (v.ok) {
      player.coins -= v.totalCoins;
      const { west, east } = neighborsOf(state, player.id);
      west.coins += v.toWest;
      east.coins += v.toEast;
      if (pick.payment.fromWest.length > 0) {
        emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: west.id, units: pick.payment.fromWest.length });
      }
      if (pick.payment.fromEast.length > 0) {
        emitEvent(state, { kind: 'neighborPurchase', buyerId: player.id, sellerId: east.id, units: pick.payment.fromEast.length });
      }
    }
    player.wonderStagesBuilt += 1;
    // Apply stage effects: coins immediately.
    player.coins += sumCoinsOnPlay(stage.effects);
    emitEvent(state, { kind: 'wonderStageBuilt', playerId: player.id, stageIndex: pick.stageIndex });
    return;
  }
}

/** Run reveal + apply for all players. Mutates state. */
function revealAndApply(state: SwState): void {
  // Apply in seat order; one player's purchase affects neighbors' coins.
  for (const p of state.players) {
    if (!p.pendingPick) continue;
    const card = p.hand.find((c) =>
      c.id === (p.pendingPick!.kind === 'build' ? p.pendingPick!.cardId
        : p.pendingPick!.kind === 'wonder' ? p.pendingPick!.cardId
        : p.pendingPick!.cardId)
    );
    pushLog(state, {
      kind: 'pickRevealed',
      playerId: p.id,
      pick: p.pendingPick,
      cardName: card?.name ?? '?',
    });
    applyPick(state, p);
  }
  for (const p of state.players) {
    p.pendingPick = null;
    p.transientResources = [];
    p.bilkisUsedThisTick = false;
  }
}

/** Discard everyone's last card (after 6 picks). */
function discardLastCards(state: SwState): void {
  for (const p of state.players) {
    if (p.hand.length > 0) {
      state.discard.push(...p.hand);
      p.hand = [];
    }
  }
}

/** Compute military resolution at age end. Mutates each player's militaryTokens.
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
  for (let i = 0; i < n; i++) {
    const p = state.players[i];
    if (skipped.has(p.id)) {
      // Skipped: draws on both sides, no tokens.
      perPlayer.push({ playerId: p.id, vsWest: 'draw', vsEast: 'draw', tokenGained: 0 });
      continue;
    }
    const west = neighborOf(i, -1);
    const east = neighborOf(i, 1);
    const myS = shieldsByPlayer.get(p.id) ?? 0;
    const wS = west ? (shieldsByPlayer.get(west.id) ?? 0) : myS;
    const eS = east ? (shieldsByPlayer.get(east.id) ?? 0) : myS;
    const vsWest: 'win' | 'loss' | 'draw' = west
      ? (myS > wS ? 'win' : myS < wS ? 'loss' : 'draw')
      : 'draw';
    const vsEast: 'win' | 'loss' | 'draw' = east
      ? (myS > eS ? 'win' : myS < eS ? 'loss' : 'draw')
      : 'draw';
    let gained = 0;
    if (vsWest === 'win') gained += ageVp;
    else if (vsWest === 'loss') gained -= 1;
    if (vsEast === 'win') gained += ageVp;
    else if (vsEast === 'loss') gained -= 1;
    perPlayer.push({ playerId: p.id, vsWest, vsEast, tokenGained: gained });
  }
  // Apply.
  for (const row of perPlayer) {
    const p = playerById(state, row.playerId);
    if (row.tokenGained === 0) {
      // Even a "0" outcome from two draws still appends nothing.
    } else if (row.tokenGained > 0) {
      p.militaryTokens.push(row.tokenGained);
      emitEvent(state, { kind: 'militaryTokenGained', playerId: p.id, vp: row.tokenGained, age: state.age });
    } else {
      // A loss appends -1 per loss. We track per-loss tokens for guild counting.
      // Each loss = 1 token of -1.
      let losses = 0;
      if (row.vsWest === 'loss') losses += 1;
      if (row.vsEast === 'loss') losses += 1;
      for (let k = 0; k < losses; k++) p.militaryTokens.push(-1);
      // Wins, if any, also recorded separately.
      const wins =
        (row.vsWest === 'win' ? ageVp : 0) +
        (row.vsEast === 'win' ? ageVp : 0);
      if (wins > 0) {
        p.militaryTokens.push(wins);
        emitEvent(state, { kind: 'militaryTokenGained', playerId: p.id, vp: wins, age: state.age });
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
    let winnerId: PlayerId | null = null;
    let best = -Infinity;
    for (const row of breakdown) {
      if (row.total > best) { best = row.total; winnerId = row.playerId; }
    }
    state.phase = 'gameOver';
    state.subPhase = 'finalScoring';
    pushLog(state, { kind: 'matchEnd', winnerId });
    return;
  }
  // Otherwise, just stay in 'militaryEnd' until the user clicks continue.
  state.subPhase = 'militaryEnd';
}

/** Tick: after every pick is in, reveal/apply/rotate/possibly end age. */
function tick(state: SwState): void {
  revealAndApply(state);
  // ageRound increments after applying.
  if (state.ageRound < 6) {
    rotateHands(state);
    state.ageRound += 1;
    state.subPhase = 'picking';
    emitEvent(state, { kind: 'tickStart' });
    setActiveAIIfAny(state);
    return;
  }
  // After the 6th pick: rotate, discard last cards (the unplayed 7th), resolve military.
  rotateHands(state);
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

/** Build a card into a player's tableau as a side-effect (used by Solomon).
 *  Does not charge coins or resources. */
export function buildCardForFree(state: SwState, player: SwPlayer, card: SwCard): void {
  player.tableau.push(card);
  player.coins += sumCoinsOnPlay(card.effects);
  for (const eff of card.effects) {
    if (eff.kind === 'endVp') {
      player.coins += coinsOnPlayForEndVp(state, player, eff);
    }
  }
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
  }
  state.discard = [];
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
