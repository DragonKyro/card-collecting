// Machi Koro heuristic AI (both editions).
//
// Everything rests on an expected-income model: `incomeAt` is what a player
// gains (or pays) when a given seat rolls a given total, read straight off the
// card definitions; `roundIncome` sums it over one full round of everyone's
// rolls, each seat rolling the number of dice that suits it best. A card's
// worth is the change in round income it brings, times the rounds the match
// probably has left (`horizon`).
//
//   - Roll: the dice count with the higher expected net income this turn.
//   - Build: establishments score (gain × horizon) − cost, with the cost
//     weighed heavier the closer the player is to affording a landmark (so it
//     saves up). Landmarks score a flat progress value plus their effect, and a
//     landmark that wins is always taken. Passing scores 0 (5 with an Airport).
//   - Business Center: the swap with the best (gain − loss), if any helps.
//   - Moving Company: give away the least valuable card.
//   - MK1 TV Station: the richest opponent. MK1 Radio Tower: reroll when the
//     current roll is clearly below the average fresh roll.

import type { PlayerId } from '@/core/types';
import type { MkAction, MkLandmarkDef, MkPlayer, MkState } from './types';
import { estDef, isEstablishment, lmDef, rollChance } from './cards';
import {
  activePlayer, buildOptions, canRollTwo, countSymbol, exchangeableCards, landmarksInForce,
  priceOf, rulesOf, symbolBonus,
} from './reducer';

export function chooseAIAction(state: MkState, playerId: PlayerId): MkAction | null {
  if (state.phase !== 'playing' || state.activePlayerId !== playerId) return null;
  const me = activePlayer(state);
  const idx = state.currentIdx;
  switch (state.subPhase) {
    case 'roll':
      return { type: 'roll', playerId, dice: bestDice(state, idx).dice };
    case 'reroll': {
      const now = incomeAt(state, idx, idx, state.turn.roll!.total);
      const fresh = bestDice(state, idx);
      return fresh.ev - now > 0.3 ? { type: 'reroll', playerId, dice: fresh.dice } : { type: 'keepRoll', playerId };
    }
    case 'tvTarget': {
      const target = state.players
        .filter((p) => p !== me)
        .sort((a, b) => Math.min(b.coins, 5) - Math.min(a.coins, 5) || b.landmarks.length - a.landmarks.length)[0];
      return { type: 'tvTarget', playerId, targetId: target.id };
    }
    case 'exchange':
      return chooseExchange(state, idx);
    case 'gift': {
      const ids = Object.keys(me.city);
      const loss = (id: string) => cardWorth(state, idx, id, -1);
      ids.sort((a, b) => loss(a) - loss(b));
      return { type: 'gift', playerId, cardId: ids[0] };
    }
    case 'build':
    case 'setupBuild':
      return chooseBuild(state, idx);
  }
}

// ---------- Income model ----------

/** Coins the player at `ownerIdx` gains (negative: pays) when the player at
 *  `rollerIdx` rolls `total`. Ignores doubles and the order payments land in. */
export function incomeAt(state: MkState, ownerIdx: number, rollerIdx: number, total: number): number {
  const ed = state.config.edition;
  const owner = state.players[ownerIdx];
  const roller = state.players[rollerIdx];
  const ownTurn = ownerIdx === rollerIdx;
  let v = 0;
  for (const [id, copies] of Object.entries(owner.city)) {
    const d = estDef(ed, id);
    if (!d.activation.includes(total)) continue;
    const e = d.effect;
    const bonus = symbolBonus(state, owner.id, d);
    if (d.color === 'red') {
      if (!ownTurn && e.kind === 'takeFromRoller') v += Math.min(roller.coins + 2, copies * (e.amount + bonus));
    } else if (d.color === 'blue') {
      if (e.kind === 'bank') v += copies * (e.amount + bonus);
    } else if (d.color === 'green') {
      if (!ownTurn) continue;
      if (e.kind === 'bank') v += copies * (e.amount + bonus);
      else if (e.kind === 'bankPerSymbol') {
        const n = countSymbol(state, owner, e.symbol);
        if (n > 0) v += copies * (e.amount * n + bonus);
      }
    } else if (ownTurn) {
      const opps = state.players.filter((p) => p !== owner);
      if (e.kind === 'takeFromEach') v += copies * opps.reduce((a, o) => a + Math.min(o.coins, e.amount), 0);
      else if (e.kind === 'takeHalfAbove') {
        v += opps.reduce((a, o) => a + (o.coins > e.threshold ? Math.floor(o.coins / 2) : 0), 0);
      } else if (e.kind === 'takeFromOne') v += Math.max(0, ...opps.map((o) => Math.min(o.coins, e.amount)));
      else if (e.kind === 'exchange') v += 1.5;
    }
  }
  if (ownTurn) {
    state.players.forEach((other, i) => {
      if (i === ownerIdx) return;
      for (const [id, copies] of Object.entries(other.city)) {
        const d = estDef(ed, id);
        if (d.color === 'red' && d.activation.includes(total) && d.effect.kind === 'takeFromRoller') {
          v -= copies * (d.effect.amount + symbolBonus(state, other.id, d));
        }
      }
    });
    for (const { def } of landmarksInForce(state, owner.id)) {
      const e = def.effect;
      if (e.kind === 'rollBonus' && e.total === total) v += e.amount;
      if (e.kind === 'rollBonusPerSymbol' && e.total === total) v += e.amount * countSymbol(state, owner, e.symbol);
    }
  }
  return v;
}

/** Expected value of the doubles-only landmark effects for a two-dice roller. */
function doublesValue(state: MkState, idx: number): number {
  const me = state.players[idx];
  let v = 0;
  for (const { def } of landmarksInForce(state, me.id)) {
    const e = def.effect;
    if (e.kind === 'doublesTakeFromEach') {
      v += state.players.reduce((a, o) => a + (o === me ? 0 : Math.min(o.coins, e.amount)), 0);
    } else if (e.kind === 'doublesExtraTurn') v += 4;
    else if (e.kind === 'doublesGiveRight' && Object.keys(me.city).length > 0) v -= 2;
  }
  return v / 6;
}

/** Expected net coins for a seat rolling `dice` dice on its own turn (also the
 *  roll buttons' "avg" hint). */
export function expectedRoll(state: MkState, idx: number, dice: 1 | 2): number {
  let ev = dice === 2 ? doublesValue(state, idx) : 0;
  for (let t = dice; t <= dice * 6; t++) ev += rollChance(t, dice) * incomeAt(state, idx, idx, t);
  return ev;
}

/** The dice count that maximises a seat's expected net income on its own turn. */
export function bestDice(state: MkState, idx: number): { dice: 1 | 2; ev: number } {
  const one = expectedRoll(state, idx, 1);
  if (!canRollTwo(state, state.players[idx].id)) return { dice: 1, ev: one };
  const two = expectedRoll(state, idx, 2);
  return two > one + 0.01 ? { dice: 2, ev: two } : { dice: 1, ev: one };
}

/** Expected coins the seat at `ownerIdx` makes over one round of everyone's rolls. */
export function roundIncome(state: MkState, ownerIdx: number): number {
  let total = 0;
  state.players.forEach((_, r) => {
    const { dice } = bestDice(state, r);
    const lo = dice === 1 ? 1 : 2;
    const hi = dice === 1 ? 6 : 12;
    for (let t = lo; t <= hi; t++) total += rollChance(t, dice) * incomeAt(state, ownerIdx, r, t);
    if (r === ownerIdx && dice === 2) total += doublesValue(state, r);
  });
  return total;
}

function withPlayer(state: MkState, idx: number, patch: Partial<MkPlayer>): MkState {
  return { ...state, players: state.players.map((p, i) => (i === idx ? { ...p, ...patch } : p)) };
}

function withCard(state: MkState, idx: number, cardId: string, delta: number): MkState {
  const city = { ...state.players[idx].city };
  city[cardId] = (city[cardId] ?? 0) + delta;
  if (city[cardId] <= 0) delete city[cardId];
  return withPlayer(state, idx, { city });
}

/** Round-income change for `idx` from gaining (delta +1) / losing (−1) a copy. */
function cardWorth(state: MkState, idx: number, cardId: string, delta: 1 | -1): number {
  return roundIncome(withCard(state, idx, cardId, delta), idx) - roundIncome(state, idx);
}

/** Rounds the match probably has left. */
export function horizon(state: MkState): number {
  const R = rulesOf(state);
  const lead = Math.max(...state.players.map((p) => p.landmarks.length));
  const progress = lead / R.landmarksToWin;
  const h = (R.id === 'mk2' ? 10 : 12) - 0.4 * Math.max(0, state.round) - 7 * progress;
  return Math.max(2, Math.min(12, h));
}

// ---------- Decisions ----------

function chooseBuild(state: MkState, idx: number): MkAction {
  const me = state.players[idx];
  const R = rulesOf(state);
  const ed = state.config.edition;
  const options = buildOptions(state, me);
  const H = state.subPhase === 'setupBuild' ? 12 : horizon(state);
  const base = roundIncome(state, idx);

  // The cheapest landmark we're working towards (to decide whether to save).
  let target: number | null = null;
  if (state.subPhase === 'build') {
    const lmIds = R.landmarks === 'personal'
      ? R.landmarkDefs.map((l) => l.id).filter((id) => !me.landmarks.includes(id))
      : state.market.landmark.slots.map((s) => s.cardId);
    for (const id of lmIds) {
      const def = lmDef(ed, id);
      if (def.onlyIfSoleWithout && !state.players.every((p) => p === me || p.landmarks.length > 0)) continue;
      if (def.onlyIfSoleWithout && me.landmarks.length > 0) continue;
      const price = priceOf(state, me, id);
      if (target === null || price < target) target = price;
    }
  }
  const saveWeight = target ? Math.min(1, me.coins / target) : 0;

  const passValue = state.subPhase === 'build'
    && landmarksInForce(state, me.id).some((l) => l.def.effect.kind === 'skipBuildBonus') ? 5 : 0;
  let best: { score: number; action: MkAction } = { score: passValue, action: { type: 'pass', playerId: me.id } };

  for (const { cardId, cost } of options) {
    let score: number;
    if (isEstablishment(ed, cardId)) {
      const gain = roundIncome(withCard(state, idx, cardId, 1), idx) - base;
      score = gain * H - cost * (1 + 1.5 * saveWeight);
    } else {
      const def = lmDef(ed, cardId);
      if (def.effect.kind === 'win' || me.landmarks.length + 1 >= R.landmarksToWin) {
        return { type: 'build', playerId: me.id, cardId };
      }
      score = 22 + landmarkEffectValue(state, idx, def, cost, H) - 0.35 * cost;
    }
    if (score > best.score) best = { score, action: { type: 'build', playerId: me.id, cardId } };
  }
  return best.action;
}

function landmarkEffectValue(state: MkState, idx: number, def: MkLandmarkDef, cost: number, H: number): number {
  const me = state.players[idx];
  const opps = state.players.filter((p) => p !== me);
  const e = def.effect;
  switch (e.kind) {
    case 'takeFromEach': return opps.reduce((a, o) => a + Math.min(o.coins, e.amount), 0);
    case 'takePerLandmark': return opps.reduce((a, o) => a + Math.min(o.coins, e.amount * o.landmarks.length), 0);
    case 'takePerSymbol':
      return opps.reduce((a, o) => a + Math.min(o.coins, e.amount * countSymbol(state, o, e.symbol)), 0);
    case 'takeHalfAbove':
      return opps.reduce((a, o) => a + (o.coins > e.threshold ? Math.floor(o.coins / 2) : 0), 0);
    case 'takeIfLandmarks':
      return opps.reduce((a, o) => a + (o.landmarks.length === e.landmarks ? Math.min(o.coins, e.amount) : 0), 0);
    case 'redistribute': {
      const total = state.players.reduce((a, p) => a + p.coins, 0) - cost;
      return Math.ceil(total / state.players.length) - (me.coins - cost);
    }
    case 'extraTurn': return 6;
    case 'landmarkDiscount': return 2 * Math.max(0, rulesOf(state).landmarksToWin - 1 - me.landmarks.length);
    case 'reroll': return 1.2 * H;
    case 'doublesExtraTurn':
      return def.scope === 'owner' && canRollTwo(state, me.id) ? (bestDice(state, idx).ev / 6) * H : 0;
    case 'skipBuildBonus': return 1;
    case 'noIncomeBonus': return 0.5;
    default: break;
  }
  // Everything else changes round income — for us, and (for "everyone"
  // landmarks) for the opponents too. Only the edge over them counts.
  const after = withPlayer(state, idx, { landmarks: [...me.landmarks, def.id] });
  const mine = roundIncome(after, idx) - roundIncome(state, idx);
  if (def.scope === 'owner') return mine * H;
  let theirs = 0;
  state.players.forEach((_, i) => {
    if (i !== idx) theirs += roundIncome(after, i) - roundIncome(state, i);
  });
  return (mine - theirs / Math.max(1, opps.length)) * H;
}

function chooseExchange(state: MkState, idx: number): MkAction {
  const me = state.players[idx];
  const H = horizon(state);
  const giveLoss = new Map<string, number>();
  for (const id of exchangeableCards(state, me)) giveLoss.set(id, -cardWorth(state, idx, id, -1));
  let best: { score: number; action: MkAction } = { score: 0.5, action: { type: 'skipExchange', playerId: me.id } };
  state.players.forEach((opp, oi) => {
    if (oi === idx) return;
    for (const take of exchangeableCards(state, opp)) {
      const gain = cardWorth(state, idx, take, 1);
      const theirLoss = -cardWorth(state, oi, take, -1);
      for (const [give, loss] of giveLoss) {
        if (give === take) continue;
        const score = (gain - loss) * H + 0.3 * theirLoss * H;
        if (score > best.score) {
          best = { score, action: { type: 'exchange', playerId: me.id, give, targetId: opp.id, take } };
        }
      }
    }
  });
  return best.action;
}
