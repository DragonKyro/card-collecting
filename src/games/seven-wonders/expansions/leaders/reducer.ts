// Leaders expansion — reducer ownership for the leader draft + per-age play.
//
// Phases owned by this expansion:
//   - 'leaderDraft' — initial pass-pick of 4 leaders. Rounds 4 → 1. After all
//      players have submitted their pick for the round, leaderDraftHands rotate
//      (CW per rulebook).
//   - 'leaderPlay'  — at the start of each age (and before Age I, after draft).
//      Each player chooses one of their leaders to play (paying coins),
//      bury under wonder, discard for 3 coins, or skip. Submitting from all
//      players triggers the actual age start.
//   - 'solomonAwaitPick' — Solomon recruited; only Solomon's owner acts to
//      pick a card from the discard pile.

import type { PlayerId } from '@/core/types';
import { shuffle } from '@/core/rng';
import type {
  SwAction, SwCard, SwLeaderPlayPick, SwPlayer, SwResource, SwState,
} from '../../types';
import {
  buildLeaderDeck, LEADER_COUNT, resetLeaderIdCounter,
} from './cards';
import {
  buildCardForFree, startAge as baseStartAge, setActiveAIIfAny,
} from '../../reducer';
import {
  canChainBuild, effectiveCostFor, neighborsOf, validatePayment,
  sumCoinsOnPlay,
} from '../../resources';
import { wonderById } from '../../wonders';

const DRAFT_HAND_SIZE = 4;
const DISCARD_LEADER_COIN_REWARD = 3;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function playerById(state: SwState, id: PlayerId): SwPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown player: ${id}`);
  return p;
}

// ----- Setup -----

/** Called at match setup. Deals 4 leaders to each player's draft hand. */
export function setupLeaders(state: SwState): void {
  resetLeaderIdCounter(10000);
  // Build full leader deck + shuffle.
  let deck = buildLeaderDeck();
  deck = shuffle(state.rngState, deck);
  // Deal 4 to each player's draft hand.
  const n = state.players.length;
  if (deck.length < n * DRAFT_HAND_SIZE) {
    throw new Error(`Not enough leaders (${LEADER_COUNT}) for ${n} players × ${DRAFT_HAND_SIZE}.`);
  }
  state.leaderDraftHands = {};
  for (const p of state.players) {
    const hand = deck.splice(0, DRAFT_HAND_SIZE);
    state.leaderDraftHands[p.id] = hand;
    p.leaderDraftPick = null;
    p.leaderHand = [];
    p.leaderTableau = [];
  }
  state.leaderDraftRound = 1;          // round 1 of 4
  state.leaderDraftPassDir = 'cw';
  state.subPhase = 'leaderDraft';
}

// ----- Hooks -----

/** beforeAgeStart hook: between ages, redirect into leaderPlay. */
export function beforeAgeStart(state: SwState, _age: number): boolean {
  // Only insert leaderPlay if any player still has a leader.
  const anyHasLeader = state.players.some((p) => (p.leaderHand?.length ?? 0) > 0);
  if (!anyHasLeader) return false;
  state.subPhase = 'leaderPlay';
  for (const p of state.players) p.leaderPlayPick = null;
  return true;
}

// ----- Action dispatch -----

export function applyAction(state: SwState, action: SwAction): SwState | undefined {
  if (action.type === 'submitLeaderDraft') {
    return handleDraftSubmit(state, action.playerId, action.cardId);
  }
  if (action.type === 'submitLeaderPlay') {
    return handlePlaySubmit(state, action.playerId, action.pick);
  }
  if (action.type === 'useBilkis') {
    return handleBilkis(state, action.playerId, action.resource);
  }
  if (action.type === 'solomonPick') {
    return handleSolomonPick(state, action.playerId, action.cardId);
  }
  return undefined;
}

// ----- Draft -----

function handleDraftSubmit(state: SwState, playerId: PlayerId, cardId: number): SwState {
  if (state.subPhase !== 'leaderDraft') throw new Error('submitLeaderDraft: not in leaderDraft');
  const s = clone(state);
  const p = playerById(s, playerId);
  if (p.leaderDraftPick !== null) throw new Error('Already submitted this draft round.');
  const hand = s.leaderDraftHands?.[playerId] ?? [];
  if (!hand.find((c) => c.id === cardId)) {
    throw new Error(`Card ${cardId} not in your draft hand.`);
  }
  p.leaderDraftPick = { cardId };
  if (s.players.every((pp) => pp.leaderDraftPick !== null)) {
    // Round complete: move each player's pick into their leaderHand, then pass remaining cards.
    finishDraftRound(s);
  } else {
    setActiveAIIfAny(s);
  }
  return s;
}

function finishDraftRound(state: SwState): void {
  // Move each player's pick to their leaderHand.
  if (!state.leaderDraftHands) return;
  for (const p of state.players) {
    const pick = p.leaderDraftPick;
    if (!pick) continue;
    const hand = state.leaderDraftHands[p.id] ?? [];
    const idx = hand.findIndex((c) => c.id === pick.cardId);
    if (idx === -1) continue;
    const card = hand[idx];
    hand.splice(idx, 1);
    (p.leaderHand ??= []).push(card);
    p.leaderDraftPick = null;
  }
  // Next round.
  state.leaderDraftRound = (state.leaderDraftRound ?? 1) + 1;
  if (state.leaderDraftRound > DRAFT_HAND_SIZE) {
    // Draft complete. Any leftover cards in draft hands are discarded (shouldn't happen
    // with 4 rounds × 4 cards = exactly 4 picks per player).
    state.leaderDraftHands = {};
    state.leaderDraftRound = 0;
    // Move into leaderPlay before Age 1 starts.
    state.subPhase = 'leaderPlay';
    for (const p of state.players) p.leaderPlayPick = null;
    setActiveAIIfAny(state);
    return;
  }
  // Rotate remaining hands CW (player i sends their hand → player (i+1)).
  const handsByIdx = state.players.map((p) => state.leaderDraftHands![p.id] ?? []);
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    const fromIdx = state.leaderDraftPassDir === 'cw' ? (i - 1 + n) % n : (i + 1) % n;
    state.leaderDraftHands![state.players[i].id] = handsByIdx[fromIdx];
  }
  setActiveAIIfAny(state);
}

// ----- Per-age leader play -----

function handlePlaySubmit(state: SwState, playerId: PlayerId, pick: SwLeaderPlayPick): SwState {
  if (state.subPhase !== 'leaderPlay') throw new Error('submitLeaderPlay: not in leaderPlay');
  const s = clone(state);
  const p = playerById(s, playerId);
  if (p.leaderPlayPick != null) throw new Error('Already submitted this leader play.');
  validateLeaderPlay(s, p, pick);
  p.leaderPlayPick = pick;
  if (s.players.every((pp) => pp.leaderPlayPick !== null)) {
    finishLeaderPlay(s);
  } else {
    setActiveAIIfAny(s);
  }
  return s;
}

function validateLeaderPlay(state: SwState, player: SwPlayer, pick: SwLeaderPlayPick): void {
  if (pick.kind === 'skip') return;
  const hand = player.leaderHand ?? [];
  const card = hand.find((c) => c.id === pick.cardId);
  if (!card) throw new Error(`Leader ${pick.cardId} not in your leader hand.`);
  if (pick.kind === 'discard') return;
  if (pick.kind === 'play') {
    const effCost = effectiveCostFor(state, player, { kind: 'leader', card });
    const coinCost = effCost.coins ?? 0;
    if (player.coins < coinCost) {
      throw new Error(`Cannot play ${card.name}: need ${coinCost} coins, have ${player.coins}.`);
    }
    // Leaders don't usually have resource cost — but if expansion adds it, validate.
    if (effCost.resources && effCost.resources.length > 0) {
      const v = validatePayment(state, player, effCost, pick.payment);
      if (!v.ok) throw new Error(`Cannot pay for ${card.name}: ${v.error}`);
    }
    return;
  }
  if (pick.kind === 'bury') {
    const wonder = wonderById(player.wonderId);
    const stageIdx = player.wonderStagesBuilt;
    if (stageIdx >= wonder.stages.length) throw new Error('No more wonder stages available.');
    const stage = wonder.stages[stageIdx];
    const effCost = effectiveCostFor(state, player, { kind: 'wonderStage', stageIndex: stageIdx, stage });
    const v = validatePayment(state, player, effCost, pick.payment);
    if (!v.ok) throw new Error(`Cannot pay for wonder stage: ${v.error}`);
  }
}

function applyLeaderPlay(state: SwState, player: SwPlayer): void {
  const pick = player.leaderPlayPick;
  if (!pick || pick.kind === 'skip') {
    player.leaderPlayPick = null;
    return;
  }
  const hand = player.leaderHand ?? [];
  const card = hand.find((c) => c.id === pick.cardId);
  if (!card) {
    player.leaderPlayPick = null;
    return;
  }
  // Remove from leader hand.
  player.leaderHand = hand.filter((c) => c.id !== pick.cardId);
  if (pick.kind === 'discard') {
    player.coins += DISCARD_LEADER_COIN_REWARD;
    player.leaderPlayPick = null;
    return;
  }
  if (pick.kind === 'play') {
    // Pay coin cost (folded through modifyCost — Maecenas → 0).
    const effCost = effectiveCostFor(state, player, { kind: 'leader', card });
    const coinCost = effCost.coins ?? 0;
    player.coins -= coinCost;
    // If resources are in the leader's cost (none in base), validate + charge.
    if (effCost.resources && effCost.resources.length > 0) {
      const v = validatePayment(state, player, effCost, pick.payment);
      if (v.ok) {
        const { west, east } = neighborsOf(state, player.id);
        west.coins += v.toWest;
        east.coins += v.toEast;
      }
    }
    // Add to leader tableau.
    (player.leaderTableau ??= []).push(card);
    // Apply immediate effects: coins, science (already accumulated), shields, etc.
    player.coins += sumCoinsOnPlay(card.effects);
    // Solomon-on-recruit: enter solomonAwaitPick before the play phase resumes.
    const solomon = card.effects.some(
      (e) => e.kind === 'leaderOnRecruit' && e.effect === 'solomonBuildFromDiscard',
    );
    if (solomon && state.discard.length > 0) {
      state.subPhase = 'solomonAwaitPick';
      state.solomonPickerId = player.id;
    }
    player.leaderPlayPick = null;
    return;
  }
  if (pick.kind === 'bury') {
    const wonder = wonderById(player.wonderId);
    const stage = wonder.stages[player.wonderStagesBuilt];
    const effCost = effectiveCostFor(state, player, { kind: 'wonderStage', stageIndex: player.wonderStagesBuilt, stage });
    const v = validatePayment(state, player, effCost, pick.payment);
    if (v.ok) {
      player.coins -= v.totalCoins;
      const { west, east } = neighborsOf(state, player.id);
      west.coins += v.toWest;
      east.coins += v.toEast;
    }
    player.wonderStagesBuilt += 1;
    player.coins += sumCoinsOnPlay(stage.effects);
    player.leaderPlayPick = null;
    return;
  }
}

function finishLeaderPlay(state: SwState): void {
  // Apply in seat order (neighbor coin transfers ordered like base).
  for (const p of state.players) applyLeaderPlay(state, p);

  // If Solomon entered solomonAwaitPick during this loop, freeze here — the
  // owner of Solomon will pick a card from the discard before age starts.
  if (state.subPhase === 'solomonAwaitPick') {
    state.activePlayerId = state.solomonPickerId ?? null;
    return;
  }
  // state.age was set to the target age by tryStartAge (or is 1 if from setup).
  // Default-initialized SwState has age=1, so we start age 1.
  baseStartAge(state, (state.age || 1) as 1 | 2 | 3);
}

// ----- Bilkis -----

function handleBilkis(state: SwState, playerId: PlayerId, resource: SwResource): SwState {
  if (state.subPhase !== 'picking') throw new Error('useBilkis: not during picking');
  const s = clone(state);
  const p = playerById(s, playerId);
  // Player must have Bilkis in their leaderTableau.
  if (!(p.leaderTableau ?? []).some((c) => c.name === 'Bilkis')) {
    throw new Error('You do not have Bilkis.');
  }
  if (p.bilkisUsedThisTick) throw new Error('Bilkis already used this turn.');
  if (p.coins < 1) throw new Error('Need 1 coin to use Bilkis.');
  p.coins -= 1;
  (p.transientResources ??= []).push(resource);
  p.bilkisUsedThisTick = true;
  return s;
}

// ----- Solomon -----

function handleSolomonPick(state: SwState, playerId: PlayerId, cardId: number): SwState {
  if (state.subPhase !== 'solomonAwaitPick') throw new Error('solomonPick: not in solomonAwaitPick');
  if (state.solomonPickerId !== playerId) throw new Error('Not your Solomon pick.');
  const s = clone(state);
  const p = playerById(s, playerId);
  const idx = s.discard.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new Error(`Card ${cardId} not in discard pile.`);
  const card = s.discard[idx];
  s.discard.splice(idx, 1);
  buildCardForFree(s, p, card);
  s.solomonPickerId = null;
  // Resume leader play if anyone else still has picks pending (shouldn't),
  // else proceed to age start.
  s.subPhase = 'leaderPlay';
  // Now finish if all done.
  const allDone = s.players.every((pp) => pp.leaderPlayPick === null);
  if (allDone) {
    // Start the next age.
    baseStartAge(s, (s.age || 1) as 1 | 2 | 3);
  } else {
    setActiveAIIfAny(s);
  }
  return s;
}

// ----- AI / next-picker -----

export function nextAIPicker(state: SwState): PlayerId | null {
  if (state.subPhase === 'leaderDraft') {
    for (const p of state.players) {
      if (p.leaderDraftPick !== null) continue;
      const seat = state.seats.find((s) => s.id === p.id);
      if (seat?.isAI) return p.id;
    }
    return null;
  }
  if (state.subPhase === 'leaderPlay') {
    for (const p of state.players) {
      if (p.leaderPlayPick !== null) continue;
      const seat = state.seats.find((s) => s.id === p.id);
      if (seat?.isAI) return p.id;
    }
    return null;
  }
  if (state.subPhase === 'solomonAwaitPick') {
    const id = state.solomonPickerId;
    if (!id) return null;
    const seat = state.seats.find((s) => s.id === id);
    return seat?.isAI ? id : null;
  }
  return null;
}

// Helpers for the AI selection (used by ai.ts).
export function leaderDraftHandFor(state: SwState, playerId: PlayerId): SwCard[] {
  return state.leaderDraftHands?.[playerId] ?? [];
}

