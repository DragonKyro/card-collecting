// Air, Land & Sea — heuristic AI.
//
// One-ply search over sampled worlds. The AI never reads hidden cards: it
// builds a few `determinize`d copies of the state (unseen cards shuffled among
// the unseen places, knowledge.ts), plays each candidate move in each copy
// through the real reducer, lets the follow-up ability decisions resolve
// greedily (each chooser — either side — takes the answer that looks best to
// it right away), and scores the result. Withdrawing is scored exactly.
//
// The score: the chance of winning the battle (per-theater margins, softened
// by the cards still to come, combined into "controls a majority") weighs
// what winning and losing it are worth, clamped between what withdrawing next
// turn would cost and what the opponent would concede by withdrawing. Every
// outcome is valued by how it moves a race-model match equity (so a trailing
// AI takes more risks, a leading one fewer), plus small terms for lingering
// effects (Air Drop, Neutralize obligations, revealed cards, Aerodrome /
// Supply Lines / Envoy flexibility).

import type { PlayerId } from '@/core/types';
import { createRng } from '@/core/rng';
import type { AlsAction, AlsState } from './types';
import { cardById } from './cards';
import { applyAction, seatIdxOf } from './reducer';
import { legalActions, legalAnswers } from './moves';
import { determinize, unseenCards, type World } from './knowledge';
import { fullBattleVp, ongoingSources, otherSeat, theaterStrength, vpForWithdraw } from './rules';

/** Match equity (0..1) to VP-like units: winning a 6-VP battle at 0–0 of a 12-VP match ≈ 7.5. */
const EQUITY_SCALE = 25;
/** Race-model exponent (1–2 all played alike in self-play; 1.5 edged it). */
const EQUITY_EXPONENT = 1.5;
/** Sampled worlds per decision (fewer when there are many moves, as in Epic Mode). */
const SAMPLES = 6;
const SETTLE_BUDGET = 6;

export function chooseAIAction(state: AlsState, playerId: PlayerId): AlsAction | null {
  if (state.phase === 'gameOver' || state.activePlayerId !== playerId) return null;
  if (state.subPhase === 'battleEnd') return { type: 'continueBattle' };
  const actions = legalActions(state, playerId);
  if (actions.length === 0) return null;
  if (actions.length === 1) return actions[0];
  const seat = seatIdxOf(state, playerId);

  const samples = actions.length > 40 ? SAMPLES / 2 : SAMPLES;
  const rng = createRng(((state.rngState.seed ^ Math.imul(state.logSeq + 1, 2654435761)) + seat * 97) >>> 0);
  const worlds = Array.from({ length: samples }, () => determinize(state, seat, rng));

  let best = actions[0];
  let bestValue = -Infinity;
  for (const action of actions) {
    let value: number;
    if (action.type === 'withdraw') {
      value = outcomeUtility(state, seat, otherSeat(seat), vpForWithdraw(state, seat)) - 0.05;
    } else {
      value = 0;
      for (const w of worlds) value += simulate(w, action, seat);
      value /= worlds.length;
    }
    if (value > bestValue + 1e-9) {
      best = action;
      bestValue = value;
    }
  }
  return best;
}

function simulate(world: World, action: AlsAction, seat: 0 | 1): number {
  let s: AlsState;
  try {
    s = applyAction(world.state, inWorld(action, world));
  } catch {
    return -Infinity;
  }
  return evaluate(settle(s), seat);
}

/** The same move in a sampled world: a card picked by its place (a board card,
 *  e.g. an opponent's face-down one) is whatever card sits there now. A named
 *  card (Neutralize) is an identity, not a place. */
function inWorld(action: AlsAction, world: World): AlsAction {
  if (action.type !== 'answer') return action;
  const a = action.answer;
  if (a.kind === 'card' || a.kind === 'move') return { ...action, answer: { ...a, cardId: world.map(a.cardId) } };
  return action;
}

/** Answer pending decisions greedily, each by its own chooser. */
function settle(state: AlsState): AlsState {
  let s = state;
  for (let i = 0; i < SETTLE_BUDGET && s.subPhase === 'resolving' && s.pending; i++) {
    const chooser = s.pending.seat;
    const playerId = s.players[chooser].id;
    let next: AlsState | null = null;
    let nextValue = -Infinity;
    for (const answer of legalAnswers(s)) {
      let after: AlsState;
      try {
        after = applyAction(s, { type: 'answer', playerId, answer });
      } catch {
        continue;
      }
      const v = evaluate(after, chooser);
      if (v > nextValue) { next = after; nextValue = v; }
    }
    if (!next) break;
    s = next;
  }
  return s;
}

// ---------- Evaluation ----------

/** Chance `me` wins the match from these scores — a race model on the VP
 *  each side still needs. */
function matchEquity(state: AlsState, myVp: number, oppVp: number): number {
  const needMe = Math.max(0, state.config.targetVp - myVp);
  const needOpp = Math.max(0, state.config.targetVp - oppVp);
  if (needMe === 0) return 1;
  if (needOpp === 0) return 0;
  return needOpp ** EQUITY_EXPONENT / (needMe ** EQUITY_EXPONENT + needOpp ** EQUITY_EXPONENT);
}

/** Value for `me` of `winner` scoring `vp` now: the change in match equity,
 *  scaled to read like VP at the start of a 12-VP match. */
function outcomeUtility(state: AlsState, me: 0 | 1, winner: 0 | 1, vp: number): number {
  const mine = state.players[me].vp;
  const theirs = state.players[otherSeat(me)].vp;
  const after = winner === me ? matchEquity(state, mine + vp, theirs) : matchEquity(state, mine, theirs + vp);
  return EQUITY_SCALE * (after - matchEquity(state, mine, theirs));
}

/** What a hand card is worth for the rest of the battle. */
const future = (strength: number) => 1.2 + 0.45 * strength;

/** Chance that `me` wins the battle from here. */
export function winProbability(state: AlsState, me: 0 | 1): number {
  const opp = otherSeat(me);
  const n = state.theaters.length;
  const myHand = state.players[me].hand;
  const oppPlayer = state.players[opp];
  const pool = unseenCards(state, me);
  const poolMean = pool.length ? pool.reduce((a, c) => a + future(cardById(c).strength), 0) / pool.length : 2.8;
  const oppKnown = oppPlayer.known.filter((c) => oppPlayer.hand.includes(c));
  const myFuture = myHand.reduce((a, c) => a + future(cardById(c).strength), 0);
  const oppFuture = oppKnown.reduce((a, c) => a + future(cardById(c).strength), 0)
    + (oppPlayer.hand.length - oppKnown.length) * poolMean;
  const edge = (myFuture - oppFuture) / n;
  const spread = 0.8 + 0.9 * Math.sqrt(myHand.length + oppPlayer.hand.length);
  const tie = state.firstPlayerSeatIdx === me ? 0.5 : -0.5;

  // dist[k] = chance of holding exactly k theaters so far.
  let dist = [1];
  for (let t = 0; t < n; t++) {
    const margin = theaterStrength(state, t, me) - theaterStrength(state, t, opp) + edge + tie;
    const p = 1 / (1 + Math.exp((-1.7 * margin) / spread));
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }
  return dist.reduce((a, q, k) => (k * 2 > n ? a + q : a), 0);
}

export function evaluate(state: AlsState, me: 0 | 1): number {
  const opp = otherSeat(me);
  if (state.subPhase === 'battleEnd' || state.phase === 'gameOver') {
    const r = state.lastBattleResult;
    if (!r) return 0;
    // Score it from before the battle's VP were added.
    const before: AlsState = { ...state, players: [{ ...state.players[0] }, { ...state.players[1] }] };
    before.players[r.winnerSeatIdx].vp -= r.vpAwarded;
    return outcomeUtility(before, me, r.winnerSeatIdx, r.vpAwarded);
  }
  const p = winProbability(state, me);
  const vp = fullBattleVp(state);
  const fight = p * outcomeUtility(state, me, me, vp) + (1 - p) * outcomeUtility(state, me, opp, vp);
  // Either side can still withdraw: I needn't lose more than withdrawing would
  // cost me, and the opponent won't concede more than their withdrawal gives.
  const floor = outcomeUtility(state, me, opp, vpForWithdraw(state, me));
  const ceiling = outcomeUtility(state, me, me, vpForWithdraw(state, opp));
  let v = Math.max(Math.min(fight, ceiling), floor) + 0.1 * fight;

  for (const side of [me, opp] as const) {
    const sign = side === me ? 1 : -1;
    const pl = state.players[side];
    if (pl.airDrop) v += sign * 0.4;
    for (const c of pl.neutralized) v -= sign * (0.3 + 0.2 * cardById(c).strength);
    v -= sign * 0.12 * pl.known.length;
    v += sign * 0.35 * ongoingSources(state, 'aerodrome', side).length;
    v += sign * 0.25 * ongoingSources(state, 'supplyLines', side).length;
    v += sign * 0.15 * ongoingSources(state, 'envoy', side).length;
  }
  return v;
}
