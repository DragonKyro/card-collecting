// Leaders expansion — the leader draft, the Recruitment phase before each Age,
// and the decisions leaders and the Leaders box's cards ask for.
//
// Sub-phases owned by this expansion:
//   - 'leaderDraft'      — before Age I: 4 leaders each, keep one, pass the
//                          rest to the right (east), until each has 4.
//   - 'leaderPlay'       — the Recruitment phase at the start of each Age:
//                          every city secretly picks a leader and recruits it
//                          (paying its coins), builds its next wonder stage
//                          with it, discards it for 3 coins, or (Tower of
//                          Babel) builds a tile with it. Revealed together.
//   - 'solomonAwaitPick' — Solomon recruited: build a card from the discard.
//   - 'courtesan'        — Courtesans' Guild built: copy a neighbour's leader.
//   - 'romeRecruit'      — Rome B's 2nd / 3rd stage: recruit a leader now.
// The Recruitment phase is a turn of its own: its end runs the end-of-turn
// steps (these decisions, Halicarnassus, coin losses, Babel tiles) and then the
// Age is dealt. Leaders left in hand stay there (Rome B can still recruit them).

import type { PlayerId } from '@/core/types';
import { nextSimultaneousSeat } from '@/core/seats';
import { shuffle } from '@/core/rng';
import type { SwAction, SwCard, SwLeaderPlayPick, SwPayment, SwPendingPick, SwPlayer, SwState } from '../../types';
import { buildLeaderDeck, COPY_ID_OFFSET } from './cards';
import {
  applyPlayEffects, applyStage, beginPregame, beginTurnFlags, buildFromDiscardPile, continueTurnEnd,
  discardBuildOptions, emitEvent, gainFromBank, playerById, pushLog, setActiveAIIfAny,
} from '../../reducer';
import { effectiveCostFor, neighborsOf, validatePayment } from '../../resources';
import { wonderById } from '../../wonders';
import { getActiveExpansions } from '../registry';
import type { SwEvent, SwTurnEndStep } from '../types';

const DRAFT_HAND_SIZE = 4;
const DISCARD_LEADER_COIN_REWARD = 3;
const START_COINS = 6;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

// ----- Setup -----

/** Match setup: 6 starting coins, empty leader areas. */
export function setupLeaders(state: SwState): void {
  for (const p of state.players) {
    p.coins = START_COINS;
    p.leaderDraftPick = null;
    p.leaderPlayPick = null;
    p.leaderHand = [];
    p.leaderTableau = [];
    p.freeColorUsedAge = null;
  }
  state.leaderDraftHands = {};
  state.leaderDeck = [];
  state.solomonQueue = [];
  state.courtesanQueue = [];
  state.romeRecruitQueue = [];
  delete state.leaderDraftRound;
}

/** Pre-game: deal 4 leaders each and start the draft (once). */
export function pregameLeaders(state: SwState): boolean {
  if (state.leaderDraftRound !== undefined) return false;
  const deck = shuffle(state.rngState, buildLeaderDeck(state.config.expansions.includes('cities')));
  const hands: Record<PlayerId, SwCard[]> = {};
  for (const p of state.players) hands[p.id] = deck.splice(0, DRAFT_HAND_SIZE);
  state.leaderDraftHands = hands;
  state.leaderDeck = deck;
  state.leaderDraftRound = 1;
  state.leaderDraftPassDir = 'cw';
  state.subPhase = 'leaderDraft';
  return true;
}

/** beforeAgeStart: the Recruitment phase, if anyone has a leader to play. */
export function beforeAgeStart(state: SwState): boolean {
  if (!state.players.some((p) => (p.leaderHand?.length ?? 0) > 0)) return false;
  state.subPhase = 'leaderPlay';
  state.ageRound = 0;
  for (const p of state.players) p.leaderPlayPick = null;
  beginTurnFlags(state);
  setActiveAIIfAny(state);
  return true;
}

// ----- Action dispatch -----

export function applyAction(state: SwState, action: SwAction): SwState | undefined {
  switch (action.type) {
    case 'submitLeaderDraft': return handleDraftSubmit(state, action.playerId, action.cardId);
    case 'submitLeaderPlay': return handlePlaySubmit(state, action.playerId, action.pick);
    case 'solomonPick': return handleSolomonPick(state, action.playerId, action.cardId, action.participate, action.payment);
    case 'courtesanPick': return handleCourtesan(state, action.playerId, action.leaderId);
    case 'romeRecruit': return handleRomeRecruit(state, action.playerId, action.cardId);
    default: return undefined;
  }
}

// ----- Draft -----

function handleDraftSubmit(state: SwState, playerId: PlayerId, cardId: number): SwState {
  if (state.subPhase !== 'leaderDraft') throw new Error('submitLeaderDraft: not in leaderDraft');
  const s = clone(state);
  const p = playerById(s, playerId);
  if (p.leaderDraftPick != null) throw new Error('Already submitted this draft round.');
  if (!(s.leaderDraftHands?.[playerId] ?? []).some((c) => c.id === cardId)) {
    throw new Error(`Card ${cardId} not in your draft hand.`);
  }
  p.leaderDraftPick = { cardId };
  if (s.players.every((pp) => pp.leaderDraftPick != null)) finishDraftRound(s);
  else setActiveAIIfAny(s);
  return s;
}

function finishDraftRound(state: SwState): void {
  const hands = state.leaderDraftHands ?? {};
  for (const p of state.players) {
    const pick = p.leaderDraftPick;
    const hand = hands[p.id] ?? [];
    const idx = hand.findIndex((c) => c.id === pick?.cardId);
    if (idx >= 0) (p.leaderHand ??= []).push(...hand.splice(idx, 1));
    p.leaderDraftPick = null;
  }
  state.leaderDraftRound = (state.leaderDraftRound ?? 1) + 1;
  if (state.leaderDraftRound > DRAFT_HAND_SIZE) {
    state.leaderDraftHands = {};
    state.leaderDraftRound = 0;
    beginPregame(state);
    return;
  }
  // Pass to the right: player i gets the hand of the player on its left (i − 1).
  const n = state.players.length;
  const byIdx = state.players.map((p) => hands[p.id] ?? []);
  for (let i = 0; i < n; i++) hands[state.players[i].id] = byIdx[(i - 1 + n) % n];
  setActiveAIIfAny(state);
}

// ----- Recruitment phase -----

function handlePlaySubmit(state: SwState, playerId: PlayerId, pick: SwLeaderPlayPick): SwState {
  if (state.subPhase !== 'leaderPlay') throw new Error('submitLeaderPlay: not in leaderPlay');
  const s = clone(state);
  const p = playerById(s, playerId);
  if (p.leaderPlayPick != null) throw new Error('Already submitted this leader play.');
  if ((p.leaderHand ?? []).length === 0) throw new Error('You have no leader to play.');
  validateLeaderPlay(s, p, pick);
  p.leaderPlayPick = pick;
  if (s.players.every((pp) => pp.leaderPlayPick != null || (pp.leaderHand ?? []).length === 0)) finishLeaderPlay(s);
  else setActiveAIIfAny(s);
  return s;
}

/** The coins it costs this city to recruit `card` now. */
export function recruitCost(state: SwState, player: SwPlayer, card: SwCard): number {
  return effectiveCostFor(state, player, { kind: 'leader', card }).coins ?? 0;
}

export function validateLeaderPlay(state: SwState, player: SwPlayer, pick: SwLeaderPlayPick): void {
  const card = (player.leaderHand ?? []).find((c) => c.id === pick.cardId);
  if (!card) throw new Error(`Leader ${pick.cardId} not in your leader hand.`);
  if (pick.kind === 'play') {
    const coins = recruitCost(state, player, card);
    if (player.coins < coins) throw new Error(`Cannot recruit ${card.name}: need ${coins} coins, have ${player.coins}.`);
  } else if (pick.kind === 'bury') {
    const wonder = wonderById(player.wonderId);
    const stageIdx = player.wonderStagesBuilt;
    if (stageIdx >= wonder.stages.length) throw new Error('No more wonder stages available.');
    const stage = wonder.stages[stageIdx];
    const v = validatePayment(state, player, effectiveCostFor(state, player, { kind: 'wonderStage', stageIndex: stageIdx, stage }), pick.payment);
    if (!v.ok) throw new Error(`Cannot pay for wonder stage: ${v.error}`);
  } else if (pick.kind === 'babelTile') {
    const exts = getActiveExpansions(state.config);
    if (!exts.some((e) => e.pickKinds?.includes('babelTile'))) throw new Error('No Tower of Babel in this game.');
    const asPick: SwPendingPick = { kind: 'babelTile', cardId: card.id, tileId: pick.tileId };
    for (const ext of exts) ext.validatePick?.(state, player, asPick, card);
  }
}

/** Recruit `card` from the hand: pay, put it in the city, its immediate
 *  effects (Croesus, Aspasia), Solomon's build. */
function recruit(_state: SwState, player: SwPlayer, card: SwCard, coins: number): void {
  player.leaderHand = (player.leaderHand ?? []).filter((c) => c.id !== card.id);
  player.coins -= coins;
  (player.leaderTableau ??= []).push(card);
}

function afterRecruit(state: SwState, player: SwPlayer, card: SwCard): void {
  applyPlayEffects(state, player, card.effects);
  if (card.effects.some((e) => e.kind === 'buildFromDiscardOnRecruit')) (state.solomonQueue ??= []).push(player.id);
  emitEvent(state, { kind: 'leaderRecruited', playerId: player.id, card });
}

function finishLeaderPlay(state: SwState): void {
  type Played = { player: SwPlayer; pick: SwLeaderPlayPick; card: SwCard; pay: { total: number; toWest: number; toEast: number } };
  const played: Played[] = [];
  // Pass 1: every leader leaves its hand and every cost is paid.
  for (const p of state.players) {
    const pick = p.leaderPlayPick;
    p.leaderPlayPick = null;
    if (!pick) continue;
    const card = (p.leaderHand ?? []).find((c) => c.id === pick.cardId);
    if (!card) continue;
    pushLog(state, { kind: 'leaderPlayed', playerId: p.id, pick: pick.kind, cardName: card.name });
    let pay = { total: 0, toWest: 0, toEast: 0 };
    if (pick.kind === 'play') {
      recruit(state, p, card, recruitCost(state, p, card));
    } else {
      p.leaderHand = (p.leaderHand ?? []).filter((c) => c.id !== card.id);
      if (pick.kind === 'bury') {
        const stage = wonderById(p.wonderId).stages[p.wonderStagesBuilt];
        const v = validatePayment(state, p, effectiveCostFor(state, p, { kind: 'wonderStage', stageIndex: p.wonderStagesBuilt, stage }), pick.payment);
        if (v.ok) pay = { total: v.totalCoins, toWest: v.toWest, toEast: v.toEast };
        const { west, east } = neighborsOf(state, p.id);
        p.coins -= pay.total;
        west.coins += pay.toWest;
        east.coins += pay.toEast;
        if (pick.payment.fromWest.length > 0) emitEvent(state, { kind: 'neighborPurchase', buyerId: p.id, sellerId: west.id, units: pick.payment.fromWest.length });
        if (pick.payment.fromEast.length > 0) emitEvent(state, { kind: 'neighborPurchase', buyerId: p.id, sellerId: east.id, units: pick.payment.fromEast.length });
        p.wonderStagesBuilt += 1;
      } else if (pick.kind === 'babelTile') {
        const asPick: SwPendingPick = { kind: 'babelTile', cardId: card.id, tileId: pick.tileId };
        for (const ext of getActiveExpansions(state.config)) ext.onPickPlaced?.(state, p, asPick, card);
      }
    }
    played.push({ player: p, pick, card, pay });
  }
  // Pass 2: effects.
  for (const { player, pick, card } of played) {
    if (pick.kind === 'play') afterRecruit(state, player, card);
    else if (pick.kind === 'discard') gainFromBank(state, player, DISCARD_LEADER_COIN_REWARD);
    else if (pick.kind === 'bury') {
      const idx = player.wonderStagesBuilt - 1;
      applyStage(state, player, wonderById(player.wonderId).stages[idx], idx);
    }
  }
  state.turnKind = 'leader';
  continueTurnEnd(state);
}

// ----- Decisions at the end of a turn -----

/** Leaders a Courtesans' Guild may copy: recruited ones of either neighbour. */
export function courtesanOptions(state: SwState, player: SwPlayer): SwCard[] {
  const { west, east } = neighborsOf(state, player.id);
  return [west, east].filter((n) => n.id !== player.id).flatMap((n) => (n.leaderTableau ?? []).filter((c) => !c.copyOf));
}

/** Leaders a Rome B city can afford to recruit now. */
export function romeOptions(state: SwState, player: SwPlayer): SwCard[] {
  return (player.leaderHand ?? []).filter((c) => player.coins >= recruitCost(state, player, c));
}

export const LEADERS_TURN_END_STEPS: readonly SwTurnEndStep[] = [
  {
    order: 10,
    run(state) {
      const q = (state.courtesanQueue ??= []);
      while (q.length > 0) {
        if (courtesanOptions(state, playerById(state, q[0])).length > 0) {
          state.subPhase = 'courtesan';
          state.activePlayerId = q[0];
          return true;
        }
        q.shift();
      }
      const r = (state.romeRecruitQueue ??= []);
      while (r.length > 0) {
        if (romeOptions(state, playerById(state, r[0])).length > 0) {
          state.subPhase = 'romeRecruit';
          state.activePlayerId = r[0];
          return true;
        }
        r.shift();
      }
      return false;
    },
  },
  {
    order: 15,
    run(state) {
      const q = (state.solomonQueue ??= []);
      while (q.length > 0) {
        if (discardBuildOptions(state, playerById(state, q[0])).length > 0) {
          state.subPhase = 'solomonAwaitPick';
          state.activePlayerId = q[0];
          return true;
        }
        q.shift();
      }
      return false;
    },
  },
];

function handleSolomonPick(state: SwState, playerId: PlayerId, cardId: number | null, participate?: boolean, payment?: SwPayment): SwState {
  if (state.subPhase !== 'solomonAwaitPick') throw new Error('solomonPick: not in solomonAwaitPick');
  if (state.solomonQueue?.[0] !== playerId) throw new Error('Not your Solomon pick.');
  const s = clone(state);
  const p = playerById(s, playerId);
  let built: SwCard | null = null;
  if (cardId !== null) built = buildFromDiscardPile(s, p, cardId, participate ?? false, payment);
  pushLog(s, { kind: 'discardBuilt', playerId, cardId: built?.id ?? null, cardName: built?.name ?? null });
  s.solomonQueue!.shift();
  continueTurnEnd(s);
  return s;
}

function handleCourtesan(state: SwState, playerId: PlayerId, leaderId: number | null): SwState {
  if (state.subPhase !== 'courtesan') throw new Error('courtesanPick: not in courtesan');
  if (state.courtesanQueue?.[0] !== playerId) throw new Error('Not your Courtesans’ Guild.');
  const s = clone(state);
  const p = playerById(s, playerId);
  const options = courtesanOptions(s, p);
  let name: string | null = null;
  if (leaderId !== null) {
    const leader = options.find((c) => c.id === leaderId);
    if (!leader) throw new Error('That leader is not in a neighbouring city.');
    const owner = s.players.find((x) => (x.leaderTableau ?? []).some((c) => c.id === leaderId))!;
    const copy: SwCard = { ...clone(leader), id: leader.id + COPY_ID_OFFSET, copyOf: { playerId: owner.id, cardId: leader.id } };
    (p.leaderTableau ??= []).push(copy);
    afterRecruit(s, p, copy);
    name = leader.name;
  } else if (options.length > 0) {
    throw new Error('The Courtesan must be placed on a leader.');
  }
  pushLog(s, { kind: 'courtesan', playerId, cardName: name });
  s.courtesanQueue!.shift();
  continueTurnEnd(s);
  return s;
}

function handleRomeRecruit(state: SwState, playerId: PlayerId, cardId: number | null): SwState {
  if (state.subPhase !== 'romeRecruit') throw new Error('romeRecruit: not in romeRecruit');
  if (state.romeRecruitQueue?.[0] !== playerId) throw new Error('Not your recruit.');
  const s = clone(state);
  const p = playerById(s, playerId);
  if (cardId !== null) {
    const card = romeOptions(s, p).find((c) => c.id === cardId);
    if (!card) throw new Error('You can’t recruit that leader now.');
    recruit(s, p, card, recruitCost(s, p, card));
    pushLog(s, { kind: 'leaderPlayed', playerId, pick: 'play', cardName: card.name });
    afterRecruit(s, p, card);
  }
  s.romeRecruitQueue!.shift();
  continueTurnEnd(s);
  return s;
}

// ----- Events -----

/** Rome B's stages and the Courtesans' Guild queue their decisions; the
 *  leaders' "from now on" coins pay out. */
export function onEventLeaders(state: SwState, event: SwEvent): void {
  if (event.kind === 'wonderStageBuilt') {
    const p = playerById(state, event.playerId);
    const stage = wonderById(p.wonderId).stages[event.stageIndex];
    for (const eff of stage?.effects ?? []) {
      if (eff.kind === 'drawLeaders') {
        (p.leaderHand ??= []).push(...(state.leaderDeck ?? []).splice(0, eff.count));
      } else if (eff.kind === 'recruitNow') {
        (state.romeRecruitQueue ??= []).push(p.id);
      }
    }
  }
  if (event.kind === 'cardBuilt' && event.card.effects.some((e) => e.kind === 'copyLeader')) {
    (state.courtesanQueue ??= []).push(event.playerId);
  }
  const who = event.kind === 'cardBuilt' || event.kind === 'militaryTokenGained' ? event.playerId
    : event.kind === 'neighborPurchase' ? event.buyerId : null;
  if (!who) return;
  const p = playerById(state, who);
  for (const leader of p.leaderTableau ?? []) {
    for (const eff of leader.effects) {
      if (eff.kind !== 'trigger') continue;
      const on = eff.on;
      const fires =
        (on.type === 'buildCardColor' && event.kind === 'cardBuilt' && event.card.color === on.color)
        || (on.type === 'buildViaChain' && event.kind === 'cardBuilt' && event.viaChain)
        || (on.type === 'victoryToken' && event.kind === 'militaryTokenGained')
        || (on.type === 'neighborPurchase' && event.kind === 'neighborPurchase');
      if (fires) gainFromBank(state, p, eff.coins);
    }
  }
}

// ----- Who acts -----

/** Who the leader sub-phases wait on next. Draft and Recruitment are
 *  simultaneous: AIs first, or the humans first when several share this
 *  device (nextSimultaneousSeat). The decisions wait on their chooser. */
export function nextAIPicker(state: SwState): PlayerId | null {
  switch (state.subPhase) {
    case 'leaderDraft':
      return nextSimultaneousSeat(state.seats, state.players.filter((p) => p.leaderDraftPick == null).map((p) => p.id));
    case 'leaderPlay':
      return nextSimultaneousSeat(state.seats, state.players
        .filter((p) => p.leaderPlayPick == null && (p.leaderHand ?? []).length > 0).map((p) => p.id));
    case 'solomonAwaitPick': return state.solomonQueue?.[0] ?? null;
    case 'courtesan': return state.courtesanQueue?.[0] ?? null;
    case 'romeRecruit': return state.romeRecruitQueue?.[0] ?? null;
    default: return null;
  }
}

export function leaderDraftHandFor(state: SwState, playerId: PlayerId): SwCard[] {
  return state.leaderDraftHands?.[playerId] ?? [];
}
