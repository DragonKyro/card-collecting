// Babel — AI for the tile draft, building tiles, joining Great Projects and
// choosing a failed project's penalty.
//
// A tile is worth the tower VP it adds (2 → 5 → 10 for the 1st → 3rd) plus
// how much its rule helps this city more than the average rival (a rough
// propensity per rule: the colours it builds, its stages left, what it buys).
// Joining a project is worth the reward (by the chance every token gets taken)
// plus the penalty it avoids.

import type { PlayerId } from '@/core/types';
import type {
  SwAction, SwCard, SwPendingPick, SwPlayer, SwProjectPenalty, SwProjectReward, SwState,
} from '../../types';
import { coinValue, militaryValue, scoreIf } from '../../ai';
import { wonderById } from '../../wonders';
import { greatProjectById, towerVp } from './cards';
import { canParticipate, penaltyChoices } from './projects';

// ----- Tower -----

function colorCount(p: SwPlayer, color: string): number {
  return p.tableau.filter((c) => c.color === color).length;
}

function stagesLeft(p: SwPlayer): number {
  return wonderById(p.wonderId).stages.length - p.wonderStagesBuilt;
}

/** How much a tile's rule favours `p` over the average rival (VP, rough). */
function tileEdge(state: SwState, p: SwPlayer, tileId: number): number {
  const others = state.players.filter((x) => x.id !== p.id);
  const avg = (f: (x: SwPlayer) => number) => others.reduce((s, x) => s + f(x), 0) / Math.max(1, others.length);
  const rel = (f: (x: SwPlayer) => number, weight: number) => (f(p) - avg(f)) * weight;
  const mil = (x: SwPlayer) => colorCount(x, 'red');
  const civ = (x: SwPlayer) => colorCount(x, 'blue');
  const brownMulti = (x: SwPlayer) => x.tableau.filter((c) => c.color === 'brown' && c.effects.some((e) => e.kind === 'produce' && (e.production.length > 1 || e.production[0].length > 1))).length;
  const brownSingle = (x: SwPlayer) => x.tableau.filter((c) => c.color === 'brown' && c.effects.some((e) => e.kind === 'produce' && e.production.length === 1 && e.production[0].length === 1)).length;
  const traders = (x: SwPlayer) => x.tableau.filter((c) => c.color === 'yellow' && c.effects.some((e) => e.kind === 'tradeDiscountRaw' || e.kind === 'tradeDiscountManufactured' || e.kind === 'produce')).length;
  switch (tileId) {
    case 1: return -rel(mil, 0.4);
    case 2: return rel(mil, 0.4) + 0.3;
    case 3: return -rel(brownMulti, 1.2);
    case 4: return -rel(traders, 1);
    case 5: return rel(civ, 0.3);
    case 6: return -rel(civ, 0.3);
    case 8: return -rel(civ, 0.2);
    case 15: return rel(stagesLeft, 0.8);
    case 16: return -rel(stagesLeft, 0.5);
    case 19: return -rel((x) => x.militaryTokens.filter((t) => t > 0).length, 0.5);
    case 20: return rel(brownSingle, 0.8);
    case 22: return rel(mil, 0.6);
    default: return 0;
  }
}

/** Worth of building `tileId` now (tower VP step + its rule's edge). */
export function tileValue(state: SwState, p: SwPlayer, tileId: number): number {
  const built = p.babelBuilt ?? 0;
  return towerVp(built + 1) - towerVp(built) + tileEdge(state, p, tileId);
}

export function towerPickOptions(state: SwState, player: SwPlayer, cardId: number): Array<{ pick: SwPendingPick; value: number }> {
  return (player.babelHand ?? []).map((tileId) => ({
    pick: { kind: 'babelTile', cardId, tileId },
    value: tileValue(state, player, tileId),
  }));
}

export function towerAI(state: SwState, playerId: PlayerId): SwAction | null {
  if (state.subPhase !== 'babelDraft') return null;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.babelDraftPick != null) return null;
  const hand = state.babelDraftHands?.[playerId] ?? [];
  if (hand.length === 0) return null;
  // Keep the tile whose rule suits us best (all are worth the same VP).
  const best = [...hand].sort((a, b) => tileEdge(state, p, b) - tileEdge(state, p, a))[0];
  return { type: 'submitBabelDraft', playerId, tileId: best };
}

// ----- Great Projects -----

/** Worth of a Great Project reward to `p`, per token. */
export function projectRewardValue(state: SwState, p: SwPlayer, r: SwProjectReward): number {
  switch (r.kind) {
    case 'coins': return r.amount * coinValue(state);
    case 'shield': return militaryValue(state, p, r.shields);
    case 'victoryToken': return r.vp;
    case 'freeBuild': case 'freeStage': return state.age === 3 ? 2 : 3.5;
    case 'anyColor': return state.age === 3 ? 0 : 1;
    case 'scienceSets': {
      const count = (s: string) => p.tableau.filter((c) => c.effects.some((e) => e.kind === 'science' && e.symbol === s)).length;
      return r.vp * (Math.min(count('compass'), count('gear'), count('tablet')) + 0.3);
    }
    case 'guilds': return r.vp * 4;
    case 'stages': return r.vp * (p.wonderStagesBuilt + 1);
  }
}

/** What a failed project's penalty would cost `p`. */
export function projectPenaltyValue(state: SwState, p: SwPlayer, pen: SwProjectPenalty): number {
  switch (pen.kind) {
    case 'discardColor': {
      const cards = p.tableau.filter((c) => c.color === pen.color);
      if (cards.length === 0) return state.age;
      const loss = Math.min(...cards.map((c) => scoreIf(state, p) - scoreIf(state, p, { remove: c })));
      return loss + (pen.color === 'brown' || pen.color === 'gray' ? 1.5 : 0);
    }
    case 'allCoins': return p.coins > 0 ? p.coins * coinValue(state) : state.age;
    case 'victoryTokens': {
      const wins = p.militaryTokens.filter((t) => t > 0).sort((a, b) => a - b);
      return wins.length < pen.count ? state.age : wins[0] + wins[1];
    }
    case 'blockResource': return wonderById(p.wonderId).initialProduction.length > 0 ? 2 : state.age;
  }
}

/** The worth of joining the project with this pick. */
export function participationValue(state: SwState, p: SwPlayer, pick: SwPendingPick, card: SwCard): number {
  if (pick.kind !== 'build' || !pick.participate) return 0;
  const pr = state.project;
  if (!pr || pr.outcome !== null || !canParticipate(state, p, card.color)) return 0;
  const project = greatProjectById(pr.projectId);
  const success = pr.tokensLeft <= 1 ? 0.75 : pr.tokensLeft <= 2 ? 0.55 : 0.4;
  let v = success * projectRewardValue(state, p, project.reward);
  if ((p.participations ?? 0) === 0) v += (1 - success) * projectPenaltyValue(state, p, project.penalty);
  // Spending the any-colour token on a mismatched card has a price.
  if (project.color !== card.color) v -= 1;
  return v;
}

export function projectsAI(state: SwState, playerId: PlayerId): SwAction | null {
  if (state.subPhase !== 'projectPenalty' || !(state.projectPenaltyQueue ?? []).includes(playerId)) return null;
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return null;
  const choices = penaltyChoices(state, p);
  if (choices.length === 0) return null;
  // Give up the card we'd miss least.
  const loss = (id: number) => {
    const card = p.tableau.find((c) => c.id === id)!;
    return scoreIf(state, p) - scoreIf(state, p, { remove: card }) + (card.color === 'brown' || card.color === 'gray' ? 1 : 0);
  };
  const best = [...choices].sort((a, b) => loss(a) - loss(b))[0];
  return { type: 'projectPenalty', playerId, cardId: best };
}
