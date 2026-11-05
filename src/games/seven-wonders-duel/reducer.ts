// 7 Wonders Duel — reducer.
//
// Flow:
//   wonderDraft (8 picks in two groups of 4) → turn (Age I, first player)
//   turn: take an accessible card → build it / discard it / build a wonder
//     effects may queue decisions (`state.pending`, resolved in order, each
//     its own sub-phase with the acting seat active):
//       progress     a science pair → progressPick
//       library      the Great Library → libraryPick
//       destroy      Circus Maximus / Statue of Zeus → destroyCard
//       discardBuild the Mausoleum → discardBuild
//   then the turn ends: the same seat again after a play-again effect, else
//   the other seat. When the age's last card is taken the next age is dealt
//   and the weaker seat (the pawn on its side; else whoever took the last
//   card) chooses who starts (chooseStarter) — a pending play-again is lost.
//   Age III's last card → civilian scoring.
//
// Military Supremacy (pawn at a capital) and Scientific Supremacy (six
// different symbols) end the match the moment they happen, mid-effect.

import type { PlayerId } from '@/core/types';
import { rngInt, shuffle } from '@/core/rng';
import type {
  DuelAction, DuelAge, DuelCard, DuelEndReason, DuelLogEntry, DuelPending, DuelProgressTokenId,
  DuelScience, DuelState, DuelSubPhase, DuelWonder,
} from './types';
import { dealAge } from './cards';
import { availableSlots, buildPyramid, flipUncovered, isPyramidEmpty, isSlotAvailable } from './pyramid';
import { MAX_WONDERS_BUILT, WONDERS, wonderById } from './wonders';
import { ALL_PROGRESS_TOKENS } from './progress';
import {
  cardPayment, countFor, discardCoins, distinctScience, guildCount, scienceSymbols, wonderPayment,
  type Payment,
} from './resources';
import { civilianWinner, scoreMatch } from './scoring';

const STARTING_COINS = 7;
const URBANISM_CHAIN_COINS = 4;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<DuelLogEntry, 'seq' | 'age'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: DuelState, partial: LogPartial): void {
  state.logSeq += 1;
  state.log.push({ seq: state.logSeq, age: state.age, ...partial } as DuelLogEntry);
}

export function seatIdxOf(state: DuelState, playerId: PlayerId): 0 | 1 {
  if (state.players[0].id === playerId) return 0;
  if (state.players[1].id === playerId) return 1;
  throw new Error(`Unknown player: ${playerId}`);
}

const other = (idx: 0 | 1): 0 | 1 => (1 - idx) as 0 | 1;

function setActive(state: DuelState, idx: 0 | 1): void {
  state.activeSeatIdx = idx;
  state.activePlayerId = state.players[idx].id;
}

// ---------- Setup ----------

export function setupNewMatch(state: DuelState): void {
  for (const p of state.players) {
    p.coins = STARTING_COINS;
    p.tableau = [];
    p.wonders = [];
    p.progressTokens = [];
  }
  state.cardsById = {};
  state.pyramid = [];
  state.discard = [];
  state.militaryPawn = 0;
  state.militaryAwards = { p1At3: false, p1At6: false, p2At3: false, p2At6: false };
  state.pending = [];
  state.replay = false;
  state.finalScoringBreakdown = null;
  state.finalScores = null;
  state.endReason = null;
  state.winnerSeatIdx = null;
  state.phase = 'playing';
  state.age = 1;
  state.log = [];
  state.logSeq = 0;

  const tokens = shuffle(state.rngState, ALL_PROGRESS_TOKENS.map((t) => t.id));
  state.progressOffer = tokens.slice(0, 5);
  state.progressBox = tokens.slice(5);

  const first = rngInt(state.rngState, 2) as 0 | 1;
  const second = other(first);
  state.firstSeatIdx = first;
  const wonders = shuffle(state.rngState, WONDERS.map((w) => w.id)).slice(0, 8);
  state.wonderDraft = {
    pool: wonders.slice(0, 4),
    next: wonders.slice(4),
    // First group: first player 1, the other 2, first player the last; the
    // second group the other way round.
    pickOrder: [first, second, second, first, second, first, first, second],
    pickIdx: 0,
  };
  state.subPhase = 'wonderDraft';
  setActive(state, first);
}

function startAge(state: DuelState, age: DuelAge): void {
  state.age = age;
  const deck = dealAge(age, state.rngState);
  for (const c of deck) state.cardsById[c.id] = c;
  state.pyramid = buildPyramid(age, deck.map((c) => c.id));
  pushLog(state, { kind: 'ageStart' });
}

// ---------- Action dispatch ----------

export function applyAction(state: DuelState, action: DuelAction): DuelState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);
  switch (action.type) {
    case 'submitWonderDraft': return handleWonderDraft(s, action.playerId, action.wonderId);
    case 'takeAndBuild': return handleTakeAndBuild(s, action.playerId, action.cardId);
    case 'takeAndWonder': return handleTakeAndWonder(s, action.playerId, action.cardId, action.wonderId);
    case 'takeAndDiscard': return handleTakeAndDiscard(s, action.playerId, action.cardId);
    case 'chooseProgressToken': return handleChooseProgressToken(s, action.playerId, action.tokenId);
    case 'destroyCard': return handleDestroyCard(s, action.playerId, action.cardId);
    case 'buildFromDiscard': return handleBuildFromDiscard(s, action.playerId, action.cardId);
    case 'chooseStarter': return handleChooseStarter(s, action.playerId, action.starterId);
    default:
      throw new Error(`Unhandled action: ${(action as { type: string }).type}`);
  }
}

function requireActive(state: DuelState, playerId: PlayerId, subPhase: DuelSubPhase): 0 | 1 {
  if (state.subPhase !== subPhase) throw new Error(`Not in ${subPhase}.`);
  const seatIdx = seatIdxOf(state, playerId);
  if (seatIdx !== state.activeSeatIdx) throw new Error('Not your turn.');
  return seatIdx;
}

// ---------- Wonder draft ----------

function handleWonderDraft(state: DuelState, playerId: PlayerId, wonderId: string): DuelState {
  const seatIdx = requireActive(state, playerId, 'wonderDraft');
  const draft = state.wonderDraft;
  if (!draft) throw new Error('No wonder draft.');
  if (!draft.pool.includes(wonderId)) throw new Error('Wonder not in the draft.');
  draft.pool = draft.pool.filter((id) => id !== wonderId);
  state.players[seatIdx].wonders.push({ wonderId, built: false, buriedCardId: null });
  pushLog(state, { kind: 'wonderDrafted', playerId, wonderId });
  draft.pickIdx += 1;
  if (draft.pool.length === 0 && draft.next.length > 0) {
    draft.pool = draft.next;
    draft.next = [];
  }
  if (draft.pickIdx >= draft.pickOrder.length) {
    state.wonderDraft = null;
    startAge(state, 1);
    state.subPhase = 'turn';
    setActive(state, state.firstSeatIdx);
    return state;
  }
  setActive(state, draft.pickOrder[draft.pickIdx]);
  return state;
}

// ---------- Taking a card ----------

function takeableCard(state: DuelState, cardId: number): DuelCard {
  const slot = state.pyramid.find((s) => s.cardId === cardId);
  if (!slot || !isSlotAvailable(slot, state.pyramid)) throw new Error(`Card ${cardId} is not accessible.`);
  const card = state.cardsById[cardId];
  if (!card) throw new Error(`Unknown card ${cardId}.`);
  return card;
}

function removeFromPyramid(state: DuelState, cardId: number): void {
  const slot = state.pyramid.find((s) => s.cardId === cardId)!;
  slot.taken = true;
  slot.faceUp = true;
  flipUncovered(state.pyramid);
}

/** Charge a payment; with Economy the opponent pockets the trading coins. */
function pay(state: DuelState, seatIdx: 0 | 1, payment: Payment): void {
  const me = state.players[seatIdx];
  if (me.coins < payment.coins) throw new Error(`Not enough coins (have ${me.coins}, need ${payment.coins}).`);
  me.coins -= payment.coins;
  const opp = state.players[other(seatIdx)];
  if (payment.trade > 0 && opp.progressTokens.includes('economy')) opp.coins += payment.trade;
}

function handleTakeAndBuild(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const seatIdx = requireActive(state, playerId, 'turn');
  const card = takeableCard(state, cardId);
  const me = state.players[seatIdx];
  if (me.tableau.some((c) => c.name === card.name)) throw new Error(`Already built ${card.name}.`);
  const payment = cardPayment(state, seatIdx, card);
  pay(state, seatIdx, payment);
  removeFromPyramid(state, cardId);
  if (payment.chained && me.progressTokens.includes('urbanism')) me.coins += URBANISM_CHAIN_COINS;
  buildCard(state, seatIdx, card, { paid: payment.coins, chained: payment.chained });
  return settle(state);
}

function handleTakeAndWonder(state: DuelState, playerId: PlayerId, cardId: number, wonderId: string): DuelState {
  const seatIdx = requireActive(state, playerId, 'turn');
  const card = takeableCard(state, cardId);
  const me = state.players[seatIdx];
  const ws = me.wonders.find((w) => w.wonderId === wonderId);
  if (!ws) throw new Error('Not your wonder.');
  if (ws.built) throw new Error('Wonder already built.');
  const wonder = wonderById(wonderId);
  const payment = wonderPayment(state, seatIdx, wonder);
  pay(state, seatIdx, payment);
  removeFromPyramid(state, cardId);
  ws.built = true;
  ws.buriedCardId = card.id;
  pushLog(state, { kind: 'wonderBuilt', playerId, wonderId, cardId: card.id, paid: payment.coins });
  applyWonderEffects(state, seatIdx, wonder);
  if (state.phase === 'gameOver') return state;
  if (me.progressTokens.includes('theology')) state.replay = true;
  enforceWonderLimit(state);
  return settle(state);
}

function handleTakeAndDiscard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const seatIdx = requireActive(state, playerId, 'turn');
  const card = takeableCard(state, cardId);
  const me = state.players[seatIdx];
  const gained = discardCoins(me);
  removeFromPyramid(state, cardId);
  me.coins += gained;
  state.discard.push(card);
  pushLog(state, { kind: 'cardDiscarded', playerId, cardId: card.id, cardName: card.name, coinsGained: gained });
  return settle(state);
}

// ---------- Effects ----------

function buildCard(state: DuelState, seatIdx: 0 | 1, card: DuelCard, info: { paid: number; chained: boolean; fromDiscard?: boolean }): void {
  const me = state.players[seatIdx];
  me.tableau.push(card);
  pushLog(state, {
    kind: 'cardBuilt', playerId: me.id, cardId: card.id, cardName: card.name,
    paid: info.paid, chained: info.chained, ...(info.fromDiscard ? { fromDiscard: true } : {}),
  });
  // The card is in the city already, so a Lighthouse counts itself.
  for (const eff of card.effects) {
    switch (eff.kind) {
      case 'coins': me.coins += eff.amount; break;
      case 'shields': {
        const bonus = card.color === 'red' && me.progressTokens.includes('strategy') ? 1 : 0;
        advanceMilitary(state, seatIdx, eff.shields + bonus);
        break;
      }
      case 'science': gainScience(state, seatIdx, eff.symbol); break;
      case 'coinsPer': me.coins += countFor(me, eff.what) * eff.per; break;
      case 'guild': me.coins += guildCount(state, eff.what) * eff.coinsPer; break;
      default: break;
    }
    if (state.phase === 'gameOver') return;
  }
}

function applyWonderEffects(state: DuelState, seatIdx: 0 | 1, wonder: DuelWonder): void {
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  for (const eff of wonder.effects) {
    switch (eff.kind) {
      case 'coins': me.coins += eff.amount; break;
      case 'opponentLosesCoins': {
        const lost = Math.min(opp.coins, eff.amount);
        opp.coins -= lost;
        pushLog(state, { kind: 'coinsLost', playerId: opp.id, coins: lost });
        break;
      }
      case 'shields': advanceMilitary(state, seatIdx, eff.shields); break;
      case 'playAgain': state.replay = true; break;
      case 'destroy': state.pending.push({ kind: 'destroy', seatIdx, color: eff.color }); break;
      case 'buildFromDiscard': state.pending.push({ kind: 'discardBuild', seatIdx }); break;
      case 'progressFromBox': {
        const options = shuffle(state.rngState, state.progressBox).slice(0, 3);
        state.pending.push({ kind: 'library', seatIdx, options });
        break;
      }
      default: break;
    }
    if (state.phase === 'gameOver') return;
  }
}

/** A new science symbol: six different wins at once; a matching pair takes a Progress token. */
function gainScience(state: DuelState, seatIdx: 0 | 1, symbol: DuelScience): void {
  const me = state.players[seatIdx];
  if (distinctScience(me) >= 6) {
    endMatch(state, 'science', seatIdx);
    return;
  }
  if (scienceSymbols(me).get(symbol) === 2) state.pending.push({ kind: 'progress', seatIdx });
}

/** Move the conflict pawn `shields` spaces toward the opponent's capital,
 *  taking any looting token it reaches; the capital wins. */
function advanceMilitary(state: DuelState, seatIdx: 0 | 1, shields: number): void {
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  const dir = seatIdx === 0 ? 1 : -1;
  state.militaryPawn = Math.max(-9, Math.min(9, state.militaryPawn + dir * shields));
  pushLog(state, { kind: 'militaryAdvance', playerId: me.id, amount: shields, newPawn: state.militaryPawn });
  const ahead = dir * state.militaryPawn;
  const awards = state.militaryAwards;
  const loot = (coins: number) => {
    const lost = Math.min(opp.coins, coins);
    opp.coins -= lost;
    pushLog(state, { kind: 'looted', playerId: opp.id, coins: lost });
  };
  if (seatIdx === 0) {
    if (ahead >= 3 && !awards.p1At3) { awards.p1At3 = true; loot(2); }
    if (ahead >= 6 && !awards.p1At6) { awards.p1At6 = true; loot(5); }
  } else {
    if (ahead >= 3 && !awards.p2At3) { awards.p2At3 = true; loot(2); }
    if (ahead >= 6 && !awards.p2At6) { awards.p2At6 = true; loot(5); }
  }
  if (ahead >= 9) endMatch(state, 'military', seatIdx);
}

/** Once 7 wonders stand, the unbuilt one goes back to the box. */
function enforceWonderLimit(state: DuelState): void {
  const built = state.players.reduce((n, p) => n + p.wonders.filter((w) => w.built).length, 0);
  if (built < MAX_WONDERS_BUILT) return;
  for (const p of state.players) {
    for (const w of p.wonders.filter((x) => !x.built)) pushLog(state, { kind: 'wonderRemoved', playerId: p.id, wonderId: w.wonderId });
    p.wonders = p.wonders.filter((w) => w.built);
  }
}

function takeProgressToken(state: DuelState, seatIdx: 0 | 1, tokenId: DuelProgressTokenId, fromBox: boolean): void {
  const me = state.players[seatIdx];
  me.progressTokens.push(tokenId);
  pushLog(state, { kind: 'progressTaken', playerId: me.id, tokenId, fromBox });
  if (tokenId === 'agriculture' || tokenId === 'urbanism') me.coins += 6;
  if (tokenId === 'law' && distinctScience(me) >= 6) endMatch(state, 'science', seatIdx);
}

// ---------- Queued decisions ----------

const PENDING_PHASE: Record<DuelPending['kind'], DuelSubPhase> = {
  progress: 'progressPick',
  library: 'libraryPick',
  destroy: 'destroyCard',
  discardBuild: 'discardBuild',
};

/** Whether a queued decision has anything to choose from (else it is skipped). */
function pendingPossible(state: DuelState, p: DuelPending): boolean {
  switch (p.kind) {
    case 'progress': return state.progressOffer.length > 0;
    case 'library': return p.options.length > 0;
    case 'destroy': return state.players[other(p.seatIdx)].tableau.some((c) => c.color === p.color);
    case 'discardBuild': return state.discard.length > 0;
  }
}

function headPending<K extends DuelPending['kind']>(state: DuelState, seatIdx: 0 | 1, kind: K): Extract<DuelPending, { kind: K }> {
  const p = state.pending[0];
  if (!p || p.kind !== kind || p.seatIdx !== seatIdx) throw new Error('Nothing to choose.');
  return p as Extract<DuelPending, { kind: K }>;
}

function handleChooseProgressToken(state: DuelState, playerId: PlayerId, tokenId: DuelProgressTokenId): DuelState {
  const seatIdx = seatIdxOf(state, playerId);
  if (state.subPhase === 'progressPick') {
    requireActive(state, playerId, 'progressPick');
    headPending(state, seatIdx, 'progress');
    if (!state.progressOffer.includes(tokenId)) throw new Error('Token not on the board.');
    state.pending.shift();
    state.progressOffer = state.progressOffer.filter((t) => t !== tokenId);
    takeProgressToken(state, seatIdx, tokenId, false);
  } else {
    requireActive(state, playerId, 'libraryPick');
    const p = headPending(state, seatIdx, 'library');
    if (!p.options.includes(tokenId)) throw new Error('Token not drawn.');
    state.pending.shift();
    // The other two drawn tokens go back to the box for good.
    state.progressBox = state.progressBox.filter((t) => !p.options.includes(t));
    takeProgressToken(state, seatIdx, tokenId, true);
  }
  return settle(state);
}

function handleDestroyCard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const seatIdx = requireActive(state, playerId, 'destroyCard');
  const p = headPending(state, seatIdx, 'destroy');
  const opp = state.players[other(seatIdx)];
  const card = opp.tableau.find((c) => c.id === cardId);
  if (!card || card.color !== p.color) throw new Error(`Pick a ${p.color} card of your opponent's.`);
  state.pending.shift();
  opp.tableau = opp.tableau.filter((c) => c.id !== cardId);
  state.discard.push(card);
  pushLog(state, { kind: 'cardDestroyed', playerId, ownerId: opp.id, cardId: card.id, cardName: card.name });
  return settle(state);
}

function handleBuildFromDiscard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const seatIdx = requireActive(state, playerId, 'discardBuild');
  headPending(state, seatIdx, 'discardBuild');
  const card = state.discard.find((c) => c.id === cardId);
  if (!card) throw new Error('Card not in the discard pile.');
  state.pending.shift();
  state.discard = state.discard.filter((c) => c.id !== cardId);
  buildCard(state, seatIdx, card, { paid: 0, chained: false, fromDiscard: true });
  return settle(state);
}

function handleChooseStarter(state: DuelState, playerId: PlayerId, starterId: PlayerId): DuelState {
  requireActive(state, playerId, 'chooseStarter');
  const starter = seatIdxOf(state, starterId);
  pushLog(state, { kind: 'starterChosen', playerId, starterId });
  state.subPhase = 'turn';
  setActive(state, starter);
  return state;
}

// ---------- End of turn ----------

/** Open the next queued decision, or end the turn. */
function settle(state: DuelState): DuelState {
  if (state.phase === 'gameOver') return state;
  while (state.pending.length > 0) {
    const p = state.pending[0];
    if (pendingPossible(state, p)) {
      state.subPhase = PENDING_PHASE[p.kind];
      setActive(state, p.seatIdx);
      return state;
    }
    state.pending.shift();
  }
  const seat = state.activeSeatIdx;
  if (isPyramidEmpty(state.pyramid)) {
    // A play-again earned with the age's last card is lost.
    state.replay = false;
    if (state.age === 3) return endMatch(state, 'civilian', null);
    const chooser: 0 | 1 = state.militaryPawn > 0 ? 1 : state.militaryPawn < 0 ? 0 : seat;
    startAge(state, (state.age + 1) as DuelAge);
    state.subPhase = 'chooseStarter';
    setActive(state, chooser);
    return state;
  }
  state.subPhase = 'turn';
  if (state.replay) {
    state.replay = false;
    pushLog(state, { kind: 'playAgain', playerId: state.players[seat].id });
    setActive(state, seat);
  } else {
    setActive(state, other(seat));
  }
  return state;
}

function endMatch(state: DuelState, reason: DuelEndReason, winner: 0 | 1 | null): DuelState {
  state.phase = 'gameOver';
  state.subPhase = 'finalScoring';
  state.endReason = reason;
  state.pending = [];
  state.replay = false;
  const breakdown = scoreMatch(state);
  state.finalScoringBreakdown = breakdown;
  state.winnerSeatIdx = reason === 'civilian' ? civilianWinner(breakdown) : winner;
  state.finalScores = {};
  for (const row of breakdown) state.finalScores[row.playerId] = row.total;
  pushLog(state, {
    kind: 'gameEnd', reason,
    winnerId: state.winnerSeatIdx !== null ? state.players[state.winnerSeatIdx].id : null,
  });
  state.activePlayerId = null;
  return state;
}

// ---------- Legal moves ----------

/** Every legal action for the seat that has to act (empty when none). */
export function legalActions(state: DuelState): DuelAction[] {
  if (state.phase !== 'playing' || state.activePlayerId === null) return [];
  const seatIdx = state.activeSeatIdx;
  const me = state.players[seatIdx];
  const playerId = me.id;
  switch (state.subPhase) {
    case 'wonderDraft':
      return (state.wonderDraft?.pool ?? []).map((wonderId) => ({ type: 'submitWonderDraft', playerId, wonderId }));
    case 'turn': {
      const out: DuelAction[] = [];
      const wonders = me.wonders.filter((w) => !w.built)
        .filter((w) => wonderPayment(state, seatIdx, wonderById(w.wonderId)).coins <= me.coins);
      for (const slot of availableSlots(state.pyramid)) {
        const card = state.cardsById[slot.cardId];
        if (cardPayment(state, seatIdx, card).coins <= me.coins && !me.tableau.some((c) => c.name === card.name)) {
          out.push({ type: 'takeAndBuild', playerId, cardId: card.id });
        }
        for (const w of wonders) out.push({ type: 'takeAndWonder', playerId, cardId: card.id, wonderId: w.wonderId });
        out.push({ type: 'takeAndDiscard', playerId, cardId: card.id });
      }
      return out;
    }
    case 'progressPick':
      return state.progressOffer.map((tokenId) => ({ type: 'chooseProgressToken', playerId, tokenId }));
    case 'libraryPick': {
      const p = state.pending[0];
      return p?.kind === 'library' ? p.options.map((tokenId) => ({ type: 'chooseProgressToken', playerId, tokenId })) : [];
    }
    case 'destroyCard': {
      const p = state.pending[0];
      if (p?.kind !== 'destroy') return [];
      return state.players[other(seatIdx)].tableau.filter((c) => c.color === p.color)
        .map((c) => ({ type: 'destroyCard', playerId, cardId: c.id }));
    }
    case 'discardBuild':
      return state.discard.map((c) => ({ type: 'buildFromDiscard', playerId, cardId: c.id }));
    case 'chooseStarter':
      return state.players.map((p) => ({ type: 'chooseStarter', playerId, starterId: p.id }));
    default:
      return [];
  }
}

// Exports for tests.
export const _internals = { startAge, advanceMilitary, settle, endMatch };
