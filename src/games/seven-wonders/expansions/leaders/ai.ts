// Leaders expansion — AI for the draft, the Recruitment phase, Solomon, the
// Courtesans' Guild and Rome B.
//
// A leader's worth = the change in our score if it stood in our city now
// (flat VP, counts and sets as the city is today, a science symbol) + what it
// should still earn: more cards of its colour, coins from its trigger, cost
// savings, the shields' expected tokens — over the turns left. Recruiting
// costs its coins at the Age's coin rate; the alternatives are building the
// next wonder stage with it, 3 coins, or (Tower of Babel) a tile.

import type { PlayerId } from '@/core/types';
import type { SwAction, SwCard, SwLeaderPlayPick, SwPlayer, SwState } from '../../types';
import { cardValue, coinValue, militaryValue, scoreIf, stageValue } from '../../ai';
import { discardBuildOptions } from '../../reducer';
import { effectiveCostFor, planPayment } from '../../resources';
import { wonderById } from '../../wonders';
import { getActiveExpansions } from '../registry';
import { courtesanOptions, recruitCost, romeOptions } from './reducer';

/** Picks still to come in the game (this Age's included). */
function picksToCome(state: SwState): number {
  const per = state.players.length <= 7 && state.config.expansions.includes('cities') ? 7 : 6;
  const thisAge = state.subPhase === 'leaderPlay' || state.subPhase === 'leaderDraft' ? per : Math.max(0, per - state.ageRound);
  return thisAge + per * (3 - state.age);
}

function agesToCome(state: SwState): number {
  return 3 - state.age + (state.subPhase === 'leaderDraft' || state.subPhase === 'leaderPlay' ? 1 : 0.5);
}

/** Expected worth of `card` to `p` if recruited now. */
export function leaderValue(state: SwState, p: SwPlayer, card: SwCard): number {
  const cv = coinValue(state);
  let v = scoreIf(state, p, { leader: card }) - scoreIf(state, p);
  const picks = picksToCome(state);
  const ages = agesToCome(state);
  for (const eff of card.effects) {
    switch (eff.kind) {
      case 'coins': v += eff.amount * cv; break;
      case 'shields': v += militaryValue(state, p, eff.shields); break;
      case 'science': v += state.age === 3 ? 0.5 : 1.5; break;
      case 'diplomacy': v += 1; break;
      case 'endVp':
        if (eff.countWhat.kind === 'cardColor') v += (eff.vpPer ?? 0) * picks * (eff.countWhat.color === 'black' ? 0.08 : 0.14);
        else if (eff.countWhat.kind === 'wonderStages') {
          const left = wonderById(p.wonderId).stages.length - p.wonderStagesBuilt;
          v += (eff.vpPer ?? 0) * Math.min(left, ages * 0.9);
        }
        break;
      case 'scoreRule':
        switch (eff.rule.type) {
          case 'vpPerVictoryToken': v += eff.rule.vpPer * ages * 0.9; break;
          case 'vpPerCoinSet': v += eff.rule.vpPer * ages * 1.2; break;
          case 'completeRGBSet': v += eff.rule.vpPerSet * ages * 0.6; break;
          case 'completeAllColorsSet': v += eff.rule.vpPerSet * (state.age === 1 ? 0.7 : 0.4); break;
        }
        break;
      case 'scienceSetBonus': v += eff.vp * ages * 0.4; break;
      case 'costDiscount': v += 1.1 * ages; break;
      case 'freeGuildResources': v += state.age < 3 || state.subPhase === 'leaderPlay' ? 3 : 1.5; break;
      case 'freeLeaders': {
        const later = (p.leaderHand ?? []).filter((c) => c.id !== card.id).slice(0, Math.max(0, 3 - state.age));
        v += later.reduce((s, c) => s + (c.cost.coins ?? 0), 0) * cv;
        break;
      }
      case 'trigger': {
        const per = eff.on.type === 'neighborPurchase' ? 0.35 : eff.on.type === 'victoryToken' ? 0.15
          : eff.on.type === 'buildViaChain' ? 0.12 : eff.on.type === 'buildCardColor' && eff.on.color === 'black' ? 0.08 : 0.1;
        v += eff.coins * cv * per * picks;
        break;
      }
      case 'buyAnyResource': v += 0.9 * ages; break;
      case 'buildFromDiscardOnRecruit':
        v += Math.max(0, ...discardBuildOptions(state, p).map((c) => cardValue(state, p, c)));
        break;
      case 'defeatToVictor': v += 1.2 * ages; break;
      case 'defeatAsShield': v += militaryValue(state, p, p.militaryTokens.filter((t) => t < 0).length + ages * 0.5); break;
      case 'bankBonus': v += cv * picks * 0.5; break;
      case 'freeColorPerAge': v += 1.8 * ages; break;
      default: break;
    }
  }
  return v;
}

function bestDiscardCard(state: SwState, p: SwPlayer): SwCard | null {
  const ranked = discardBuildOptions(state, p).map((c) => ({ c, v: cardValue(state, p, c) })).sort((a, b) => b.v - a.v);
  return ranked[0]?.c ?? null;
}

export function chooseAIAction(state: SwState, playerId: PlayerId): SwAction | null {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const cv = coinValue(state);

  if (state.subPhase === 'leaderDraft') {
    if (me.leaderDraftPick != null) return null;
    const hand = state.leaderDraftHands?.[playerId] ?? [];
    if (hand.length === 0) return null;
    const best = [...hand].sort((a, b) => (leaderValue(state, me, b) - (b.cost.coins ?? 0) * cv) - (leaderValue(state, me, a) - (a.cost.coins ?? 0) * cv))[0];
    return { type: 'submitLeaderDraft', playerId, cardId: best.id };
  }

  if (state.subPhase === 'leaderPlay') {
    if (me.leaderPlayPick != null) return null;
    const hand = me.leaderHand ?? [];
    if (hand.length === 0) return null;
    const options: Array<{ value: number; pick: SwLeaderPlayPick }> = [];
    // The leader we'd miss least is the one spent on anything but recruiting.
    let spare = hand[0];
    let spareKeep = Infinity;
    for (const card of hand) {
      const coins = recruitCost(state, me, card);
      const value = leaderValue(state, me, card) - coins * cv;
      if (me.coins >= coins) options.push({ value, pick: { kind: 'play', cardId: card.id, payment: { fromWest: [], fromEast: [], coins: 0 } } });
      const keep = me.coins >= coins ? value : -100;
      if (keep < spareKeep) { spare = card; spareKeep = keep; }
    }
    // Before Age III a leader not recruited now still has a later chance.
    const wonder = wonderById(me.wonderId);
    const idx = me.wonderStagesBuilt;
    if (idx < wonder.stages.length) {
      const stage = wonder.stages[idx];
      const plan = planPayment(state, me, effectiveCostFor(state, me, { kind: 'wonderStage', stageIndex: idx, stage }));
      if (plan.ok) {
        options.push({
          value: stageValue(state, me, stage, idx) - plan.totalCoins * cv,
          pick: { kind: 'bury', cardId: spare.id, payment: plan.payment },
        });
      }
    }
    options.push({ value: 3 * cv, pick: { kind: 'discard', cardId: spare.id } });
    for (const ext of getActiveExpansions(state.config)) {
      for (const o of ext.extraPickOptions?.(state, me, spare.id) ?? []) {
        if (o.pick.kind === 'babelTile') options.push({ value: o.value, pick: { kind: 'babelTile', cardId: spare.id, tileId: o.pick.tileId } });
      }
    }
    let best = options[0];
    for (const o of options) if (o.value > best.value) best = o;
    return { type: 'submitLeaderPlay', playerId, pick: best.pick };
  }

  if (state.subPhase === 'solomonAwaitPick') {
    if (state.solomonQueue?.[0] !== playerId) return null;
    return { type: 'solomonPick', playerId, cardId: bestDiscardCard(state, me)?.id ?? null };
  }

  if (state.subPhase === 'courtesan') {
    if (state.courtesanQueue?.[0] !== playerId) return null;
    const options = courtesanOptions(state, me);
    const best = [...options].sort((a, b) => leaderValue(state, me, b) - leaderValue(state, me, a))[0];
    return { type: 'courtesanPick', playerId, leaderId: best?.id ?? null };
  }

  if (state.subPhase === 'romeRecruit') {
    if (state.romeRecruitQueue?.[0] !== playerId) return null;
    const ranked = romeOptions(state, me)
      .map((c) => ({ c, v: leaderValue(state, me, c) - recruitCost(state, me, c) * cv }))
      .sort((a, b) => b.v - a.v);
    const best = ranked[0];
    return { type: 'romeRecruit', playerId, cardId: best && best.v > 0 ? best.c.id : null };
  }
  return null;
}
