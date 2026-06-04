// 7 Wonders Duel — reducer.
//
// Sub-phase flow:
//   wonderDraft → turn (age 1)
//   turn (active picks card → build/bury/discard) → turn (other) | progressPick
//   progressPick → turn
//   wonderConstruct → turn
//   age 3 pyramid empty → finalScoring
//   any time pawn at ±9 → military supremacy, finalScoring
//   any time 6 distinct sciences collected → science supremacy, finalScoring

import type { PlayerId } from '@/core/types';
import { shuffle } from '@/core/rng';
import type {
  DuelAction, DuelAge, DuelCard, DuelPlayer, DuelProgressTokenId, DuelResource,
  DuelScience, DuelState, DuelLogEntry, DuelWonder,
} from './types';
import { buildDuelAgeDeck, resetDuelCardIdCounter } from './cards';
import { buildPyramid, flipUncovered, isPyramidEmpty, isSlotAvailable } from './pyramid';
import { WONDERS, wonderById } from './wonders';
import { ALL_PROGRESS_TOKENS } from './progress';
import {
  canChainBuild, productionFor, purchaseCost, shieldsFor,
  validatePayWonder, validatePurchase,
} from './resources';
import { scoreMatch } from './scoring';

const STARTING_COINS = 7;
const DISCARD_BASE_COINS = 2;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<DuelLogEntry, 'seq' | 'age'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: DuelState, partial: LogPartial): void {
  state.logSeq = (state.logSeq ?? 0) + 1;
  if (!state.log) state.log = [];
  state.log.push({ seq: state.logSeq, age: state.age, ...partial } as DuelLogEntry);
}

function seatIdxOf(state: DuelState, playerId: PlayerId): 0 | 1 {
  if (state.players[0].id === playerId) return 0;
  if (state.players[1].id === playerId) return 1;
  throw new Error(`Unknown player: ${playerId}`);
}

function opponentSeatIdx(idx: 0 | 1): 0 | 1 {
  return (1 - idx) as 0 | 1;
}

function setActiveFromSeat(state: DuelState, idx: 0 | 1): void {
  state.activeSeatIdx = idx;
  state.activePlayerId = state.players[idx].id;
}

// ---------- Setup ----------

export function setupNewMatch(state: DuelState): void {
  resetDuelCardIdCounter(1);
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
  state.pendingProgressPick = null;
  state.pendingWonderBury = null;
  state.finalScoringBreakdown = null;
  state.endReason = null;
  state.winnerSeatIdx = null;
  state.phase = 'playing';
  state.age = 1;
  state.log = [];
  state.logSeq = 0;

  // Draw 5 of 10 progress tokens.
  const allTokenIds: DuelProgressTokenId[] = ALL_PROGRESS_TOKENS.map((t) => t.id);
  state.progressOffer = shuffle(state.rngState, allTokenIds).slice(0, 5);

  // Wonder draft: deal 8 of 12 wonders.
  const allWonderIds = WONDERS.map((w) => w.id);
  const pool = shuffle(state.rngState, allWonderIds).slice(0, 8);
  // Duel draft order: 1-2-2-2-1 over 8 picks → p1, p2, p2, p1, p1, p2, p2, p1
  // Actually the canonical order is: A, B, B, A, A, B, B, A (one pick each, then 2-2-2-1
  // alternating). For simplicity: alternate single picks, but with 8 picks the order is
  // [0,1,1,0,0,1,1,0] = "A B B A A B B A" (= 4 picks each).
  const pickOrder: (0 | 1)[] = [0, 1, 1, 0, 0, 1, 1, 0];
  state.wonderDraft = { pool, pickOrder, pickIdx: 0 };
  state.subPhase = 'wonderDraft';
  setActiveFromSeat(state, pickOrder[0]);
}

/** Start a new age — build the pyramid for it and transition to 'turn'. */
function startAge(state: DuelState, age: DuelAge): void {
  state.age = age;
  const deck = buildDuelAgeDeck(age, state.rngState);
  const shuffled = shuffle(state.rngState, deck);
  for (const c of shuffled) state.cardsById[c.id] = c;
  state.pyramid = buildPyramid(age, shuffled.map((c) => c.id));
  state.subPhase = 'turn';
  pushLog(state, { kind: 'ageStart' });
}

// ---------- Action dispatch ----------

export function applyAction(state: DuelState, action: DuelAction): DuelState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);
  switch (action.type) {
    case 'submitWonderDraft':       return handleWonderDraft(s, action);
    case 'takeAndBuild':            return handleTakeAndBuild(s, action);
    case 'takeAndBury':             return handleTakeAndBury(s, action);
    case 'takeAndDiscard':          return handleTakeAndDiscard(s, action);
    case 'chooseWonderToBury':      return handleChooseWonderToBury(s, action);
    case 'chooseProgressToken':     return handleChooseProgressToken(s, action);
    default:
      throw new Error(`Unhandled action: ${(action as { type: string }).type}`);
  }
}

// ---------- Wonder draft ----------

function handleWonderDraft(
  state: DuelState,
  action: { type: 'submitWonderDraft'; playerId: PlayerId; wonderId: string },
): DuelState {
  if (state.subPhase !== 'wonderDraft') throw new Error('Not in wonderDraft.');
  if (!state.wonderDraft) throw new Error('No wonder draft state.');
  const seatIdx = seatIdxOf(state, action.playerId);
  if (seatIdx !== state.activeSeatIdx) throw new Error('Not your draft pick.');
  const draft = state.wonderDraft;
  if (!draft.pool.includes(action.wonderId)) throw new Error('Wonder not in pool.');
  // Remove from pool, add to player.
  draft.pool = draft.pool.filter((id) => id !== action.wonderId);
  state.players[seatIdx].wonders.push({ wonderId: action.wonderId, built: false, buriedCardId: null });
  pushLog(state, { kind: 'wonderDrafted', playerId: action.playerId, wonderId: action.wonderId });
  draft.pickIdx += 1;
  if (draft.pickIdx >= draft.pickOrder.length) {
    // Draft complete. Start age 1.
    state.wonderDraft = null;
    startAge(state, 1);
    // First age starts with seat 0 (P1 goes first); rule of thumb in Duel is
    // first player has fewer wonders draft picks initially but starts first.
    setActiveFromSeat(state, 0);
    return state;
  }
  setActiveFromSeat(state, draft.pickOrder[draft.pickIdx]);
  return state;
}

// ---------- Card pick ----------

function pickAndRemove(state: DuelState, cardId: number): DuelCard {
  const slot = state.pyramid.find((s) => s.cardId === cardId);
  if (!slot) throw new Error(`Card ${cardId} not in pyramid.`);
  if (!isSlotAvailable(slot, state.pyramid)) {
    throw new Error(`Card ${cardId} is not available (covered).`);
  }
  slot.taken = true;
  slot.faceUp = true; // it's been picked, definitely visible
  flipUncovered(state.pyramid);
  const card = state.cardsById[cardId];
  if (!card) throw new Error(`Unknown card id ${cardId}.`);
  return card;
}

function handleTakeAndBuild(
  state: DuelState,
  action: { type: 'takeAndBuild'; playerId: PlayerId; cardId: number; purchase: DuelResource[] },
): DuelState {
  if (state.subPhase !== 'turn') throw new Error('Not in turn.');
  const seatIdx = seatIdxOf(state, action.playerId);
  if (seatIdx !== state.activeSeatIdx) throw new Error('Not your turn.');
  const me = state.players[seatIdx];
  const opp = state.players[opponentSeatIdx(seatIdx)];
  // Look up the card while still in pyramid (don't take yet — validate first).
  const card = state.cardsById[action.cardId];
  if (!card) throw new Error(`Unknown card ${action.cardId}.`);
  // Duplicate check (Duel rule: cannot build same-name card twice).
  if (me.tableau.some((c) => c.name === card.name)) {
    throw new Error(`Already have ${card.name}.`);
  }
  // Validate cost.
  const v = validatePurchase(state, me, card, action.purchase);
  if (!v.ok) throw new Error(v.error);
  if (me.coins < v.coinsToPay) throw new Error(`Not enough coins (have ${me.coins}, need ${v.coinsToPay}).`);
  // Remove from pyramid.
  pickAndRemove(state, action.cardId);
  // Charge buyer, pay opponent.
  me.coins -= v.coinsToPay;
  // Economy progress: if opponent has Economy and we just paid them for resources,
  // those coins instead go to opponent's coffer — but baseline goes to opponent
  // anyway, so Economy is a no-op for the buyer's side. Effectively Economy adds
  // the FULL TRADE COST to the OPPONENT'S coin pool (instead of nothing). Implemented
  // via the seller side below.
  if (opp.progressTokens.includes('economy')) {
    opp.coins += v.coinsToOpponent;
  } else {
    // Baseline rule: when opponent sells resources to you, opponent DOES NOT gain
    // the coins — they go to the bank. Duel rule. So no transfer.
  }
  // Apply card effects.
  applyCardOnPlay(state, seatIdx, card);
  me.tableau.push(card);
  pushLog(state, { kind: 'cardBuilt', playerId: action.playerId, cardName: card.name });
  // Check end-of-turn conditions.
  return finishTurn(state, seatIdx);
}

function handleTakeAndBury(
  state: DuelState,
  action: { type: 'takeAndBury'; playerId: PlayerId; cardId: number },
): DuelState {
  if (state.subPhase !== 'turn') throw new Error('Not in turn.');
  const seatIdx = seatIdxOf(state, action.playerId);
  if (seatIdx !== state.activeSeatIdx) throw new Error('Not your turn.');
  const me = state.players[seatIdx];
  const card = state.cardsById[action.cardId];
  if (!card) throw new Error(`Unknown card ${action.cardId}.`);
  // Check there's at least one unbuilt wonder.
  const unbuilt = me.wonders.filter((w) => !w.built);
  if (unbuilt.length === 0) throw new Error('No unbuilt wonders to bury under.');
  // Verify the slot is available.
  const slot = state.pyramid.find((s) => s.cardId === action.cardId);
  if (!slot) throw new Error('Card not in pyramid.');
  if (!isSlotAvailable(slot, state.pyramid)) throw new Error('Card not available.');
  // Save pending bury and transition.
  state.pendingWonderBury = { cardId: action.cardId, seatIdx };
  state.subPhase = 'wonderConstruct';
  setActiveFromSeat(state, seatIdx); // already active
  return state;
}

function handleChooseWonderToBury(
  state: DuelState,
  action: { type: 'chooseWonderToBury'; playerId: PlayerId; wonderId: string; purchase: DuelResource[] },
): DuelState {
  if (state.subPhase !== 'wonderConstruct') throw new Error('Not in wonderConstruct.');
  const seatIdx = seatIdxOf(state, action.playerId);
  if (!state.pendingWonderBury || state.pendingWonderBury.seatIdx !== seatIdx) {
    throw new Error('No pending bury or not yours.');
  }
  const me = state.players[seatIdx];
  const ws = me.wonders.find((w) => w.wonderId === action.wonderId);
  if (!ws) throw new Error('Wonder not yours.');
  if (ws.built) throw new Error('Wonder already built.');
  const wonder = wonderById(action.wonderId);
  // Validate payment.
  const v = validatePayWonder(state, me, wonder, action.purchase);
  if (!v.ok) throw new Error(v.error);
  if (me.coins < v.coinsToPay) {
    throw new Error(`Not enough coins for wonder (have ${me.coins}, need ${v.coinsToPay}).`);
  }
  const opp = state.players[opponentSeatIdx(seatIdx)];
  // Now remove the card from pyramid.
  const card = pickAndRemove(state, state.pendingWonderBury.cardId);
  // Charge.
  me.coins -= v.coinsToPay;
  if (opp.progressTokens.includes('economy')) {
    opp.coins += v.coinsToOpponent;
  }
  // Mark wonder built + buried card.
  ws.built = true;
  ws.buriedCardId = card.id;
  // Apply wonder effects on play.
  applyWonderOnPlay(state, seatIdx, wonder);
  pushLog(state, { kind: 'cardBuried', playerId: action.playerId, wonderName: wonder.name, buriedCardName: card.name });
  state.pendingWonderBury = null;
  state.subPhase = 'turn';
  return finishTurn(state, seatIdx);
}

function handleTakeAndDiscard(
  state: DuelState,
  action: { type: 'takeAndDiscard'; playerId: PlayerId; cardId: number },
): DuelState {
  if (state.subPhase !== 'turn') throw new Error('Not in turn.');
  const seatIdx = seatIdxOf(state, action.playerId);
  if (seatIdx !== state.activeSeatIdx) throw new Error('Not your turn.');
  const me = state.players[seatIdx];
  const card = pickAndRemove(state, action.cardId);
  // Discard reward: 2 + number of own yellow cards.
  const yellowCount = me.tableau.filter((c) => c.color === 'yellow').length;
  const reward = DISCARD_BASE_COINS + yellowCount;
  me.coins += reward;
  state.discard.push(card);
  pushLog(state, { kind: 'cardDiscarded', playerId: action.playerId, cardName: card.name, coinsGained: reward });
  return finishTurn(state, seatIdx);
}

// ---------- On-play effects ----------

function applyCardOnPlay(state: DuelState, seatIdx: 0 | 1, card: DuelCard): void {
  const me = state.players[seatIdx];
  const opp = state.players[opponentSeatIdx(seatIdx)];
  for (const eff of card.effects) {
    if (eff.kind === 'coins') me.coins += eff.amount;
    else if (eff.kind === 'shields') {
      advanceMilitary(state, seatIdx, eff.shields);
    }
    else if (eff.kind === 'forceOpponentDiscardCoins') {
      opp.coins = Math.max(0, opp.coins - eff.amount);
    }
    else if (eff.kind === 'gainCoinsPerCardColor') {
      const source = eff.from === 'opponent' ? opp : me;
      const count = source.tableau.filter((c) => c.color === eff.color).length;
      me.coins += count * eff.per;
    }
    else if (eff.kind === 'endVp') {
      // coinsPerOnPlay applied immediately
      if (eff.coinsPerOnPlay) {
        const targets = eff.from === 'self' ? [me] : eff.from === 'opponent' ? [opp] : [me, opp];
        let count = 0;
        const what = eff.countWhat;
        for (const tgt of targets) {
          if (what.kind === 'cardColor') {
            count += tgt.tableau.filter((c) => c.color === what.color).length;
          } else if (what.kind === 'wonderStages') {
            count += tgt.wonders.filter((w) => w.built).length;
          } else if (what.kind === 'coins') {
            count += Math.floor(tgt.coins / 3);
          }
        }
        me.coins += count * eff.coinsPerOnPlay;
      }
    }
    else if (eff.kind === 'science') {
      // Check if this completes a matching pair → trigger progress token pick.
      const symbol: DuelScience = eff.symbol;
      const sciences = collectScienceSymbols(me);
      // me.tableau hasn't been updated yet (caller pushes after); count incoming.
      const count = (sciences.get(symbol) ?? 0) + 1;
      if (count >= 2 && state.progressOffer.length > 0) {
        state.pendingProgressPick = { seatIdx };
      }
    }
  }
}

function applyWonderOnPlay(state: DuelState, seatIdx: 0 | 1, wonder: DuelWonder): void {
  const me = state.players[seatIdx];
  const opp = state.players[opponentSeatIdx(seatIdx)];
  for (const eff of wonder.effects) {
    if (eff.kind === 'coins' && eff.coins) me.coins += eff.coins;
    else if (eff.kind === 'shields' && eff.shields) {
      advanceMilitary(state, seatIdx, eff.shields);
    }
    else if (eff.kind === 'forceOpponentDiscardCoins' && eff.amount) {
      opp.coins = Math.max(0, opp.coins - eff.amount);
    }
    else if (eff.kind === 'science' && eff.symbol) {
      const sciences = collectScienceSymbols(me);
      const count = (sciences.get(eff.symbol) ?? 0) + 1;
      if (count >= 2 && state.progressOffer.length > 0) {
        state.pendingProgressPick = { seatIdx };
      }
    }
    // extraTurn / pickFromDiscard not modeled in v1.
  }
}

function collectScienceSymbols(player: DuelPlayer): Map<DuelScience, number> {
  const counts = new Map<DuelScience, number>();
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'science') counts.set(eff.symbol, (counts.get(eff.symbol) ?? 0) + 1);
    }
  }
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    const wonder = wonderById(ws.wonderId);
    for (const eff of wonder.effects) {
      if (eff.kind === 'science' && eff.symbol) {
        counts.set(eff.symbol, (counts.get(eff.symbol) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Advance the military pawn by `amount` shields toward the opponent's
 *  capital (positive for seat 0, negative for seat 1). Strategy progress
 *  token adds +1 per advance. Triggers thresholds. */
function advanceMilitary(state: DuelState, seatIdx: 0 | 1, shields: number): void {
  const me = state.players[seatIdx];
  let effective = shields;
  if (me.progressTokens.includes('strategy')) effective += 1;
  const direction = seatIdx === 0 ? +1 : -1;
  state.militaryPawn += direction * effective;
  // Clamp to ±9 (anything past = at capital).
  if (state.militaryPawn > 9) state.militaryPawn = 9;
  if (state.militaryPawn < -9) state.militaryPawn = -9;
  pushLog(state, { kind: 'militaryAdvance', playerId: me.id, amount: effective, newPawn: state.militaryPawn });
  // Trigger thresholds.
  const opp = state.players[opponentSeatIdx(seatIdx)];
  if (state.militaryPawn >= 3 && !state.militaryAwards.p1At3) {
    state.militaryAwards.p1At3 = true;
    opp.coins = Math.max(0, opp.coins - 2);
  }
  if (state.militaryPawn >= 6 && !state.militaryAwards.p1At6) {
    state.militaryAwards.p1At6 = true;
    opp.coins = Math.max(0, opp.coins - 5);
  }
  if (state.militaryPawn <= -3 && !state.militaryAwards.p2At3) {
    state.militaryAwards.p2At3 = true;
    opp.coins = Math.max(0, opp.coins - 2);
  }
  if (state.militaryPawn <= -6 && !state.militaryAwards.p2At6) {
    state.militaryAwards.p2At6 = true;
    opp.coins = Math.max(0, opp.coins - 5);
  }
  // Cap negatives at zero.
  if (opp.coins < 0) opp.coins = 0;
}

// ---------- End-of-turn ----------

function finishTurn(state: DuelState, seatIdx: 0 | 1): DuelState {
  // 1. Pending progress pick has priority — active stays the same seat.
  if (state.pendingProgressPick) {
    state.subPhase = 'progressPick';
    setActiveFromSeat(state, state.pendingProgressPick.seatIdx);
    return state;
  }
  // 2. Check military supremacy.
  if (state.militaryPawn >= 9 || state.militaryPawn <= -9) {
    return endMatch(state, 'military', state.militaryPawn > 0 ? 0 : 1);
  }
  // 3. Check science supremacy (6 distinct symbols, +1 if Law).
  const me = state.players[seatIdx];
  const sciences = collectScienceSymbols(me);
  const distinct = sciences.size + (me.progressTokens.includes('law') ? 1 : 0);
  if (distinct >= 6) {
    return endMatch(state, 'science', seatIdx);
  }
  // 4. Check pyramid empty → next age or final.
  if (isPyramidEmpty(state.pyramid)) {
    if (state.age === 3) {
      return endMatch(state, 'civilian', null);
    }
    startAge(state, (state.age + 1) as DuelAge);
    // Next age begins: military behind player goes first (Duel rule).
    // Approximation: whoever is behind on the pawn starts. If pawn at 0, opposite seat starts.
    const behindSeat: 0 | 1 = state.militaryPawn > 0 ? 1 : state.militaryPawn < 0 ? 0 : (seatIdxOf(state, state.activePlayerId ?? state.players[0].id) === 0 ? 1 : 0);
    setActiveFromSeat(state, behindSeat);
    return state;
  }
  // 5. Pass to opponent.
  state.subPhase = 'turn';
  setActiveFromSeat(state, opponentSeatIdx(seatIdx));
  return state;
}

function endMatch(state: DuelState, reason: 'civilian' | 'military' | 'science', winnerSeatIdx: 0 | 1 | null): DuelState {
  state.phase = 'gameOver';
  state.subPhase = 'finalScoring';
  state.endReason = reason;
  const breakdown = scoreMatch(state);
  state.finalScoringBreakdown = breakdown;
  let winSeat: 0 | 1 | null = winnerSeatIdx;
  if (reason === 'civilian') {
    // Highest total VP wins. Tiebreak: most coins.
    const a = breakdown[0], b = breakdown[1];
    if (a.total > b.total) winSeat = 0;
    else if (b.total > a.total) winSeat = 1;
    else winSeat = a.coinsAtEnd >= b.coinsAtEnd ? 0 : 1;
  }
  state.winnerSeatIdx = winSeat;
  state.finalScores = {};
  for (const row of breakdown) state.finalScores[row.playerId] = row.total;
  pushLog(state, {
    kind: 'gameEnd', reason,
    winnerId: winSeat !== null ? state.players[winSeat].id : null,
  });
  state.activePlayerId = null;
  return state;
}

// ---------- Progress token pick ----------

function handleChooseProgressToken(
  state: DuelState,
  action: { type: 'chooseProgressToken'; playerId: PlayerId; tokenId: DuelProgressTokenId },
): DuelState {
  if (state.subPhase !== 'progressPick') throw new Error('Not in progressPick.');
  if (!state.pendingProgressPick) throw new Error('No pending pick.');
  const seatIdx = seatIdxOf(state, action.playerId);
  if (seatIdx !== state.pendingProgressPick.seatIdx) throw new Error('Not your pick.');
  if (!state.progressOffer.includes(action.tokenId)) throw new Error('Token not in offer.');
  const me = state.players[seatIdx];
  state.progressOffer = state.progressOffer.filter((t) => t !== action.tokenId);
  me.progressTokens.push(action.tokenId);
  pushLog(state, { kind: 'progressTaken', playerId: action.playerId, tokenId: action.tokenId });
  // Apply on-claim effects.
  if (action.tokenId === 'agriculture') me.coins += 6;
  if (action.tokenId === 'urbanism') me.coins += 6;
  state.pendingProgressPick = null;
  // Continue: same flow as if we had just finished a turn.
  return finishTurn(state, seatIdx);
}

// Exports for tests.
export const _internals = {
  startAge,
  advanceMilitary,
  collectScienceSymbols,
  finishTurn,
  productionFor,
  purchaseCost,
  shieldsFor,
  canChainBuild,
};
