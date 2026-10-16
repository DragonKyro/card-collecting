// Sushi Go! Party reducer.
//
// Turn flow (per round):
//   1. subPhase = 'selecting'. Each player submits a pick: 1 card, or 2 with
//      chopsticks on their table, optionally also calling a spoon from their
//      table. Once all players have submitted, the reveal happens in the same
//      reducer call.
//   2. Reveal: every pick moves to its table (in the submitted order, so a
//      wasabi picked together with a nigiri goes under it); used chopsticks go
//      back into the hand. Cards that need a decision queue up as resolution
//      steps — special orders first, then spoons / menus / takeout boxes by
//      the number in their corner (lowest first). subPhase = 'resolving' while
//      a step waits on its chooser, who is parked on activePlayerId. A card a
//      step puts on a table can queue further steps.
//   3. End of turn: if more than one miso soup was played, they are all
//      discarded; players on 10+ uramaki icons score their place and discard
//      them. Then hands pass left — or, if they're empty, the round is scored,
//      desserts move to the dessert piles, subPhase = 'roundEnd'.
//   4. nextRound advances to the next round or, if this was the final round,
//      tallies desserts and transitions to phase = 'gameOver'.

import type { PlayerId } from '@/core/types';
import { shuffle } from '@/core/rng';
import type {
  SushiGoState, SushiGoAction, SushiGoCard, SushiGoCardKind, SushiGoPlayer,
  SushiGoRoundSummary, SushiGoLogEntry, SushiGoStep, SushiGoResolution,
} from './types';
import {
  roundCards, dessertCards, dessertsForRound, handSize, KIND_INFO, orderNumber, variantsOf,
} from './cards';
import { scoreRound, scoreDesserts, totalRoundScore, claimUramaki, effectiveCard } from './scoring';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<SushiGoLogEntry, 'seq' | 'round'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: SushiGoState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({ seq: state.logSeq, round: state.round, ...partial } as SushiGoLogEntry);
}

function playerById(state: SushiGoState, id: PlayerId): SushiGoPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

function logged(c: SushiGoCard): { kind: SushiGoCardKind; variant?: string } {
  return { kind: c.kind, variant: c.variant };
}

/** Whether a table card currently counts as a face-up `kind`. */
function isLive(c: SushiGoCard, kind: SushiGoCardKind): boolean {
  const e = effectiveCard(c);
  return e.kind === kind && !e.flipped;
}

/** The lowest-numbered face-up chopsticks / spoon on a table (special orders copying one count). */
export function bonusCard(player: SushiGoPlayer, kind: 'chopsticks' | 'spoon'): SushiGoCard | undefined {
  return player.table
    .filter((c) => isLive(c, kind))
    .sort((a, b) => orderNumber(a) - orderNumber(b))[0];
}

/** Cards a special order may copy: the owner's other played cards, except
 *  unresolved special orders and menus / takeout boxes (used up when played). */
export function copyTargets(player: SushiGoPlayer, specialOrderId: number): SushiGoCard[] {
  return player.table.filter((c) => {
    if (c.id === specialOrderId) return false;
    if (c.kind === 'specialOrder' && !c.copyOf) return false;
    const kind = effectiveCard(c).kind;
    return kind !== 'menu' && kind !== 'takeoutBox';
  });
}

/** Cards a takeout box may flip: the owner's face-up cards from earlier turns. */
export function flipTargets(state: SushiGoState, player: SushiGoPlayer): SushiGoCard[] {
  const thisTurn = new Set(state.resolution?.playedThisTurn ?? []);
  return player.table.filter((c) => !c.flipped && !thisTurn.has(c.id));
}

/** Whether a hand card answers a spoon request (a bare kind matches every variant). */
export function matchesRequest(c: SushiGoCard, kind: SushiGoCardKind, variant?: string): boolean {
  return c.kind === kind && (variant === undefined || c.variant === variant);
}

/** Deal hands for the current round. Mutates state. */
export function dealHands(state: SushiGoState): void {
  const size = handSize(state.players.length);
  for (const p of state.players) {
    p.hand = [];
    for (let i = 0; i < size && state.deck.length > 0; i++) {
      p.hand.push(state.deck.pop()!);
    }
    p.pendingPick = null;
    p.pendingSpoon = false;
  }
}

/** Find the next AI player without a pendingPick this tick, or null. */
function nextAIPicker(state: SushiGoState): PlayerId | null {
  for (const p of state.players) {
    if (p.pendingPick !== null) continue;
    const seat = state.seats.find((s) => s.id === p.id);
    if (seat?.isAI) return p.id;
  }
  return null;
}

/** Park activePlayerId on whichever AI seat hasn't picked yet this tick, so the
 *  GameHost AI driver can dispatch a submitPick for them. Null = no AI waiting,
 *  which (for simultaneous-pick games) means humans + the AI driver are quiet. */
function setActiveAIIfAny(state: SushiGoState): void {
  state.activePlayerId = nextAIPicker(state);
}

/** Begin a new round: build the deck (non-desserts, the desserts left in last
 *  round's deck, plus this round's new desserts), deal, reset tables. */
function startRound(state: SushiGoState, roundNumber: number): void {
  state.round = roundNumber;
  const carried = state.deck.filter((c) => KIND_INFO[c.kind].category === 'dessert');
  const added = state.dessertSupply.splice(0, dessertsForRound(state.players.length, roundNumber));
  const specialOrdersKept = state.players
    .reduce((n, p) => n + p.dessertPile.filter((c) => c.kind === 'specialOrder').length, 0);
  state.deck = shuffle(state.rngState, [
    ...roundCards(state.config.menu, roundNumber, specialOrdersKept),
    ...carried,
    ...added,
  ]);
  state.discards = [];
  state.uramakiNextPlace = 0;
  state.resolution = null;
  for (const p of state.players) {
    p.table = [];
    p.uramakiPoints = 0;
  }
  dealHands(state);
  state.subPhase = 'selecting';
  state.lastRoundSummary = null;
  setActiveAIIfAny(state);
}

/** Validate that the cards in `cardIds` are all in the player's hand and that
 *  the pick is legal (2 cards need chopsticks, a spoon call needs a spoon). */
function validatePick(player: SushiGoPlayer, cardIds: number[], useSpoon: boolean): void {
  if (cardIds.length === 0) throw new Error('submitPick: must pick at least 1 card');
  if (cardIds.length > 2) throw new Error('submitPick: max 2 cards');
  const seen = new Set<number>();
  for (const id of cardIds) {
    if (seen.has(id)) throw new Error('submitPick: duplicate cardId');
    seen.add(id);
    if (!player.hand.some((c) => c.id === id)) {
      throw new Error('submitPick: card not in hand');
    }
  }
  if (cardIds.length === 2 && !bonusCard(player, 'chopsticks')) {
    throw new Error('submitPick: 2-card pick requires chopsticks on table');
  }
  if (useSpoon && !bonusCard(player, 'spoon')) {
    throw new Error('submitPick: no spoon on table');
  }
}

/** Queue a step: unnumbered steps (copy / spoonGive) ahead of numbered ones,
 *  numbered ones by their corner number. */
function queueStep(res: SushiGoResolution, step: SushiGoStep): void {
  const order = (s: SushiGoStep) => ('order' in s ? s.order : -1);
  let i = 0;
  while (i < res.steps.length && order(res.steps[i]) <= order(step)) i++;
  res.steps.splice(i, 0, step);
}

/** Put a card on `p`'s table this turn and queue the decision it needs, if any. */
function placeCard(state: SushiGoState, p: SushiGoPlayer, card: SushiGoCard): void {
  const res = state.resolution!;
  p.table.push(card);
  res.playedThisTurn.push(card.id);
  if (card.kind === 'specialOrder') {
    queueStep(res, { type: 'copy', playerId: p.id, cardId: card.id });
  } else if (card.kind === 'menu') {
    queueStep(res, { type: 'menu', playerId: p.id, cardId: card.id, order: orderNumber(card), drawn: null });
  } else if (card.kind === 'takeoutBox') {
    queueStep(res, { type: 'takeout', playerId: p.id, cardId: card.id, order: orderNumber(card) });
  }
}

function discardFromTable(state: SushiGoState, p: SushiGoPlayer, cardId: number): void {
  const i = p.table.findIndex((c) => c.id === cardId);
  if (i === -1) return;
  state.discards.push(...p.table.splice(i, 1));
}

/** Take a used chopsticks / spoon off a table; a special order copying one goes back to being a special order. */
function takeOffTable(p: SushiGoPlayer, card: SushiGoCard): SushiGoCard {
  p.table = p.table.filter((c) => c.id !== card.id);
  delete card.copyOf;
  return card;
}

/** Pass hands to the left: player i receives player i-1's hand. */
function rotateHands(state: SushiGoState): void {
  const hands = state.players.map((p) => p.hand);
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    state.players[i].hand = hands[(i - 1 + n) % n];
  }
}

function commitRoundScore(state: SushiGoState): SushiGoRoundSummary {
  const perPlayerScores = scoreRound(state.players, state.uramakiNextPlace);
  const summary: SushiGoRoundSummary = {
    round: state.round,
    perPlayer: state.players.map((p) => {
      const sc = perPlayerScores[p.id];
      const total = totalRoundScore(sc);
      return { playerId: p.id, perKind: sc, total };
    }),
  };
  for (const row of summary.perPlayer) {
    const p = playerById(state, row.playerId);
    // Pad scoreByRound to current round
    while (p.scoreByRound.length < state.round) p.scoreByRound.push(0);
    p.scoreByRound[state.round - 1] = row.total;
  }
  return summary;
}

/** Move dessert cards (and special orders copying one) from each player's
 *  table to their dessert pile, and clear the table. Everything else goes back
 *  into next round's deck, which `startRound` rebuilds — except flipped
 *  desserts, which are no longer desserts but are still dessert cards, so they
 *  rejoin the deck's dessert mix here. */
function harvestDesserts(state: SushiGoState): void {
  for (const p of state.players) {
    for (const c of p.table) {
      if (KIND_INFO[c.kind].category === 'dessert' && c.flipped) {
        state.deck.push({ id: c.id, kind: c.kind, variant: c.variant });
        continue;
      }
      const e = effectiveCard(c);
      if (KIND_INFO[e.kind].category === 'dessert' && !e.flipped) p.dessertPile.push(c);
    }
    p.table = [];
  }
}

/** End-of-match: compute dessert bonuses, set finalScores, transition to gameOver. */
function endMatch(state: SushiGoState): void {
  const dessertScores = scoreDesserts(state.players);
  for (const p of state.players) {
    p.dessertScore = dessertScores[p.id] ?? 0;
  }
  state.finalScores = {};
  for (const p of state.players) {
    const total = p.scoreByRound.reduce((s, x) => s + x, 0) + p.dessertScore;
    state.finalScores[p.id] = total;
  }
  state.subPhase = 'matchEnd';
  state.phase = 'gameOver';
  // Ties go to the player with the most dessert cards.
  let winner: SushiGoPlayer | null = null;
  for (const p of state.players) {
    if (!winner) { winner = p; continue; }
    const diff = state.finalScores[p.id] - state.finalScores[winner.id];
    if (diff > 0 || (diff === 0 && p.dessertPile.length > winner.dessertPile.length)) winner = p;
  }
  pushLog(state, { kind: 'matchEnd', winnerId: winner?.id ?? null });
}

/** Returns true if every player has submitted a pick. */
function allPlayersSubmitted(state: SushiGoState): boolean {
  return state.players.every((p) => p.pendingPick !== null);
}

/** Reveal phase: apply picks, queue the decisions they need, then resolve. */
function revealAndAdvance(state: SushiGoState): void {
  state.resolution = { steps: [], playedThisTurn: [] };
  for (const p of state.players) {
    const picked = p.pendingPick!;
    pushLog(state, { kind: 'pickRevealed', playerId: p.id, cards: picked.map(logged) });
    // Bonus cards come from the table as it was before this turn.
    const chopsticks = picked.length === 2 ? bonusCard(p, 'chopsticks') : undefined;
    const spoon = p.pendingSpoon ? bonusCard(p, 'spoon') : undefined;
    const pickedIds = new Set(picked.map((c) => c.id));
    p.hand = p.hand.filter((c) => !pickedIds.has(c.id));
    // Order matters (wasabi must come before nigiri); we use the order the
    // player submitted the cards in, so the UI controls placement.
    for (const c of picked) placeCard(state, p, c);
    if (chopsticks) p.hand.push(takeOffTable(p, chopsticks));
    if (spoon) {
      queueStep(state.resolution, { type: 'spoon', playerId: p.id, cardId: spoon.id, order: orderNumber(spoon) });
    }
    p.pendingPick = null;
    p.pendingSpoon = false;
  }
  advance(state);
}

/** Get a step ready for its chooser. Returns false when there is nothing to
 *  choose and the step has already been settled (and removed). */
function activate(state: SushiGoState, step: SushiGoStep): boolean {
  const res = state.resolution!;
  const p = playerById(state, step.playerId);
  switch (step.type) {
    case 'copy':
      if (copyTargets(p, step.cardId).length > 0) return true;
      // Nothing to copy: the special order is discarded.
      res.steps.shift();
      discardFromTable(state, p, step.cardId);
      pushLog(state, { kind: 'copied', playerId: p.id, card: null });
      return false;
    case 'menu': {
      if (step.drawn === null) step.drawn = state.deck.splice(Math.max(0, state.deck.length - 4));
      if (step.drawn.some((c) => c.kind !== 'menu')) return true;
      // Nothing playable drawn (another menu can't be played off a menu).
      res.steps.shift();
      state.deck = shuffle(state.rngState, [...state.deck, ...step.drawn]);
      discardFromTable(state, p, step.cardId);
      pushLog(state, { kind: 'menu', playerId: p.id, card: null });
      return false;
    }
    case 'takeout':
      if (flipTargets(state, p).length > 0) return true;
      res.steps.shift();
      discardFromTable(state, p, step.cardId);
      return false;
    case 'spoon':
    case 'spoonGive':
      return true;
  }
}

/** Work through the step queue until one needs a decision, else end the turn. */
function advance(state: SushiGoState): void {
  const res = state.resolution!;
  while (res.steps.length > 0) {
    const step = res.steps[0];
    if (activate(state, step)) {
      state.subPhase = 'resolving';
      state.activePlayerId = step.playerId;
      return;
    }
  }
  finishTurn(state);
}

/** Miso soup clashes, uramaki claims, then pass hands or end the round. */
function finishTurn(state: SushiGoState): void {
  const thisTurn = new Set(state.resolution!.playedThisTurn);
  const misoPlayers: PlayerId[] = [];
  const soups: [SushiGoPlayer, SushiGoCard][] = [];
  for (const p of state.players) {
    for (const c of p.table) {
      if (thisTurn.has(c.id) && isLive(c, 'misoSoup')) {
        soups.push([p, c]);
        if (!misoPlayers.includes(p.id)) misoPlayers.push(p.id);
      }
    }
  }
  if (soups.length > 1) {
    for (const [p, c] of soups) discardFromTable(state, p, c.id);
    pushLog(state, { kind: 'misoDiscarded', playerIds: misoPlayers });
  }

  const claim = claimUramaki(state.players, state.uramakiNextPlace);
  for (const [id, points] of Object.entries(claim.awards)) {
    const p = playerById(state, id);
    p.uramakiPoints += points;
    for (const c of p.table.filter((x) => isLive(x, 'uramaki'))) discardFromTable(state, p, c.id);
    pushLog(state, { kind: 'uramaki', playerId: id, points });
  }
  state.uramakiNextPlace = claim.nextPlace;
  state.resolution = null;

  // If hands are now empty, the round ends.
  const handsEmpty = state.players.every((p) => p.hand.length === 0);
  if (handsEmpty) {
    const summary = commitRoundScore(state);
    state.lastRoundSummary = summary;
    pushLog(state, { kind: 'roundEnd' });
    harvestDesserts(state);
    state.subPhase = 'roundEnd';
    // Park activePlayerId on an AI seat (if any) so the GameHost AI driver
    // can dispatch 'nextRound' automatically in all-AI matches. Same logic as
    // 7W's militaryEnd handling.
    const allAI = state.seats.length > 0 && state.seats.every((s) => s.isAI);
    state.activePlayerId = allAI ? (state.seats[0]?.id ?? null) : null;
    return;
  }

  // Otherwise pass hands and continue.
  rotateHands(state);
  state.subPhase = 'selecting';
  setActiveAIIfAny(state);
}

/** The step at the head of the queue, checked to be `type` and owed by `playerId`. */
function headStep<T extends SushiGoStep['type']>(
  state: SushiGoState,
  playerId: PlayerId,
  type: T,
): Extract<SushiGoStep, { type: T }> {
  const step = state.subPhase === 'resolving' ? state.resolution?.steps[0] : undefined;
  if (!step || step.type !== type || step.playerId !== playerId) {
    throw new Error(`${type}: not ${playerId}'s decision`);
  }
  return step as Extract<SushiGoStep, { type: T }>;
}

/** Spoon hand-over: the giver's card goes to the spoon's owner (played at once),
 *  the spoon into the giver's hand. */
function giveCard(state: SushiGoState, giver: SushiGoPlayer, to: SushiGoPlayer, cardId: number, spoonId: number): void {
  const card = giver.hand.find((c) => c.id === cardId)!;
  giver.hand = giver.hand.filter((c) => c.id !== cardId);
  giver.hand.push(takeOffTable(to, to.table.find((c) => c.id === spoonId)!));
  placeCard(state, to, card);
}

export function applyAction(state: SushiGoState, action: SushiGoAction): SushiGoState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);

  switch (action.type) {
    case 'submitPick': {
      if (s.subPhase !== 'selecting') throw new Error('submitPick: not in selecting phase');
      const p = playerById(s, action.playerId);
      if (p.pendingPick !== null) throw new Error('submitPick: already submitted');
      const useSpoon = action.useSpoon === true;
      validatePick(p, action.cardIds, useSpoon);
      p.pendingPick = action.cardIds.map((id) => p.hand.find((c) => c.id === id)!);
      p.pendingSpoon = useSpoon;
      pushLog(s, { kind: 'pickSubmitted', playerId: p.id });

      if (allPlayersSubmitted(s)) {
        revealAndAdvance(s);
      } else {
        // Re-park activePlayerId on the next AI seat so the driver keeps ticking
        // remaining AI seats in this round.
        setActiveAIIfAny(s);
      }
      return s;
    }

    case 'copyCard': {
      const step = headStep(s, action.playerId, 'copy');
      const p = playerById(s, step.playerId);
      const target = copyTargets(p, step.cardId).find((c) => c.id === action.targetId);
      if (!target) throw new Error('copyCard: not a card you can copy');
      s.resolution!.steps.shift();
      const e = effectiveCard(target);
      p.table.find((c) => c.id === step.cardId)!.copyOf = {
        kind: e.kind,
        ...(e.variant !== undefined ? { variant: e.variant } : {}),
        ...(e.flipped ? { flipped: true } : {}),
      };
      pushLog(s, { kind: 'copied', playerId: p.id, card: logged(e) });
      advance(s);
      return s;
    }

    case 'askSpoon': {
      const step = headStep(s, action.playerId, 'spoon');
      if (!s.config.menu.includes(action.kind)) throw new Error('askSpoon: that card is not on the menu');
      if (action.variant !== undefined && !variantsOf(action.kind).includes(action.variant)) {
        throw new Error('askSpoon: unknown variant');
      }
      s.resolution!.steps.shift();
      const p = playerById(s, step.playerId);
      // The first player to the left (where hands pass) holding the card answers.
      const n = s.players.length;
      const i = s.players.indexOf(p);
      let giver: SushiGoPlayer | null = null;
      for (let k = 1; k < n && !giver; k++) {
        const q = s.players[(i + k) % n];
        if (q.hand.some((c) => matchesRequest(c, action.kind, action.variant))) giver = q;
      }
      pushLog(s, {
        kind: 'spoon',
        playerId: p.id,
        asked: { kind: action.kind, variant: action.variant },
        fromId: giver?.id ?? null,
      });
      if (!giver) {
        discardFromTable(s, p, step.cardId);
      } else {
        const matches = giver.hand.filter((c) => matchesRequest(c, action.kind, action.variant));
        if (variantsOf(action.kind).length > 0 && new Set(matches.map((c) => c.variant)).size > 1) {
          // Asked for a kind in general: the giver picks which one to hand over.
          queueStep(s.resolution!, {
            type: 'spoonGive', playerId: giver.id, toId: p.id, spoonId: step.cardId, options: matches.map((c) => c.id),
          });
        } else {
          giveCard(s, giver, p, matches[0].id, step.cardId);
        }
      }
      advance(s);
      return s;
    }

    case 'giveSpoon': {
      const step = headStep(s, action.playerId, 'spoonGive');
      if (!step.options.includes(action.cardId)) throw new Error('giveSpoon: not one of the asked cards');
      s.resolution!.steps.shift();
      giveCard(s, playerById(s, step.playerId), playerById(s, step.toId), action.cardId, step.spoonId);
      advance(s);
      return s;
    }

    case 'pickMenu': {
      const step = headStep(s, action.playerId, 'menu');
      const card = step.drawn?.find((c) => c.id === action.cardId);
      if (!card || card.kind === 'menu') throw new Error('pickMenu: not a playable drawn card');
      s.resolution!.steps.shift();
      const p = playerById(s, step.playerId);
      s.deck = shuffle(s.rngState, [...s.deck, ...step.drawn!.filter((c) => c.id !== card.id)]);
      discardFromTable(s, p, step.cardId);
      pushLog(s, { kind: 'menu', playerId: p.id, card: logged(card) });
      placeCard(s, p, card);
      advance(s);
      return s;
    }

    case 'flipCards': {
      const step = headStep(s, action.playerId, 'takeout');
      const p = playerById(s, step.playerId);
      const allowed = new Set(flipTargets(s, p).map((c) => c.id));
      const ids = new Set(action.cardIds);
      for (const id of ids) if (!allowed.has(id)) throw new Error('flipCards: cannot flip that card');
      s.resolution!.steps.shift();
      for (const c of p.table) if (ids.has(c.id)) c.flipped = true;
      discardFromTable(s, p, step.cardId);
      pushLog(s, { kind: 'flipped', playerId: p.id, count: ids.size });
      advance(s);
      return s;
    }

    case 'nextRound': {
      if (s.subPhase !== 'roundEnd') throw new Error('nextRound: not in roundEnd');
      if (s.round >= s.config.rounds) {
        endMatch(s);
      } else {
        startRound(s, s.round + 1);
      }
      return s;
    }
  }
}

/** Used by module.ts at game start. Mutates state. */
export function setupNewMatch(state: SushiGoState): void {
  for (const p of state.players) {
    p.hand = [];
    p.table = [];
    p.dessertPile = [];
    p.pendingPick = null;
    p.pendingSpoon = false;
    p.uramakiPoints = 0;
    p.scoreByRound = [];
    p.dessertScore = 0;
  }
  state.deck = [];
  state.dessertSupply = shuffle(state.rngState, dessertCards(state.config.menu));
  startRound(state, 1);
}
