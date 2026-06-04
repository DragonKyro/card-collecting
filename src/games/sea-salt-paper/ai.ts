// Sea Salt & Paper AI — heuristic, single difficulty.
//
// Approach
// --------
// Maintain a per-card "expected point value" estimate. The estimate is
// game-state-aware: as cards are seen (visible on tables, in the player's own
// hand, or face-up on discard piles), the AI updates a "remaining unseen" pool
// and re-estimates the marginal value of acquiring each family.
//
// On each decision, the AI:
//   1. Recomputes marginal values for every family from its own perspective.
//   2. Picks the action with the best expected score gain:
//        - drawFromDiscard if the top of either pile is worth more than the
//          expected value of an unseen deck card.
//        - else drawPair, keep the best of the two, discard the worse to the
//          pile whose top is less useful to OPPONENTS.
//        - play any duo pair available, prioritizing high-impact effects
//          (shark+swimmer steals, crab from a juicy pile, fish thin-draws,
//          boat for repeat turn — only when own hand has potential).
//        - stop / lastChance / pass based on score margin vs target threshold
//          and lead over opponents.

import type { PlayerId } from '@/core/types';
import type { SspState, SspAction, SspCard, SspCardFamily, SspPlayer } from './types';
import { FAMILY, FAMILY_ORDER, duoPartner, isDuoFamily } from './cards';
import {
  cardPoints, collectorPoints, isValidDuoPair, mermaidColorBonus, tentativeScore,
} from './scoring';

const STOP_THRESHOLD = 7;

interface Knowledge {
  /** Cards we can see (own hand + own table + every opponent's table + face-up discard piles). */
  seenIds: Set<number>;
  /** Per-family count of unseen cards (still in deck or in opponents' hands). */
  unseenByFamily: Map<SspCardFamily, number>;
  /** Total unseen cards. */
  unseenTotal: number;
}

function buildKnowledge(state: SspState, meId: PlayerId): Knowledge {
  const me = state.players.find((p) => p.id === meId)!;
  const seen = new Set<number>();
  for (const c of me.hand) seen.add(c.id);
  for (const p of state.players) {
    for (const c of p.table) seen.add(c.id);
  }
  for (const pile of state.discards) {
    for (const c of pile) seen.add(c.id);
  }
  // pendingDraw is visible to the active player; if we're not it, ignore.
  if (state.activePlayerId === meId) {
    for (const c of state.pendingDraw) seen.add(c.id);
  }

  const totalByFamily: Record<SspCardFamily, number> = {} as Record<SspCardFamily, number>;
  for (const f of FAMILY_ORDER) totalByFamily[f] = FAMILY[f].count;

  const seenByFamily: Record<SspCardFamily, number> = {} as Record<SspCardFamily, number>;
  for (const f of FAMILY_ORDER) seenByFamily[f] = 0;

  // count seen cards by family
  const accum = (cards: SspCard[]) => {
    for (const c of cards) seenByFamily[c.family] += 1;
  };
  accum(me.hand);
  for (const p of state.players) accum(p.table);
  for (const pile of state.discards) accum(pile);
  if (state.activePlayerId === meId) accum(state.pendingDraw);

  const unseen = new Map<SspCardFamily, number>();
  let unseenTotal = 0;
  for (const f of FAMILY_ORDER) {
    const u = Math.max(0, totalByFamily[f] - seenByFamily[f]);
    unseen.set(f, u);
    unseenTotal += u;
  }
  return { seenIds: seen, unseenByFamily: unseen, unseenTotal };
}

/** Marginal score gain to ME if I add one extra card of `family` to my pool. */
function marginalValue(me: SspPlayer, family: SspCardFamily, _know: Knowledge): number {
  // Build "current" family counts then "current+1" counts.
  const before = countMyFamilies(me);
  const after = { ...before };
  after[family] = (after[family] ?? 0) + 1;

  const beforeScore = scoreFromCounts(before, me);
  // Pretend the player has the added card in some color (use most-frequent so we
  // don't overweight the color bonus); we'll separately compute a small bonus
  // for mermaid by hypothetically adding white.
  const afterScore = scoreFromCounts(after, me, family);

  let delta = afterScore - beforeScore;

  // Mermaid swing: each unseen mermaid is genuinely valuable (4 mermaids = instant
  // win). Encourage chase if we already hold ≥1.
  if (family === 'mermaid') {
    const owned = (before.mermaid ?? 0);
    if (owned >= 3) delta += 25; // 4 mermaids → instant win
    else if (owned >= 2) delta += 6;
    else if (owned >= 1) delta += 3;
    else delta += 1;
  }

  // Bonus signal for cards that, if combined with another already in hand,
  // would form a duo pair (1 pt + an ability).
  if (isDuoFamily(family)) {
    const partner = duoPartner(family);
    if (partner) {
      const ownPartners = me.hand.filter((c) => c.family === partner).length
        + (partner === family ? 0 : 0); // partner counted in 'before'
      const ownSelf = me.hand.filter((c) => c.family === family).length;
      if (partner === family && ownSelf >= 1) delta += 0.8;
      if (partner !== family && ownPartners >= 1) delta += 1.2;
    }
  }

  // Penalty if family is already saturated (e.g. 6 shells = max already).
  if (family === 'shell' && (before.shell ?? 0) >= 6) delta -= 1;
  if (family === 'octopus' && (before.octopus ?? 0) >= 5) delta -= 1;
  if (family === 'penguin' && (before.penguin ?? 0) >= 3) delta -= 1;
  if (family === 'sailor' && (before.sailor ?? 0) >= 2) delta -= 1;

  return delta;
}

function countMyFamilies(me: SspPlayer): Partial<Record<SspCardFamily, number>> {
  const out: Partial<Record<SspCardFamily, number>> = {};
  for (const c of [...me.hand, ...me.table]) out[c.family] = (out[c.family] ?? 0) + 1;
  return out;
}

function scoreFromCounts(
  counts: Partial<Record<SspCardFamily, number>>,
  me: SspPlayer,
  addedFamily?: SspCardFamily,
): number {
  // Reconstruct a virtual list of cards to feed cardPoints + mermaid bonus.
  // We pick deterministic colors (each card's actual color) so the color bonus
  // stays sensible. For "added" cards we copy the most-frequent existing color.
  let total = 0;

  // Duo pairs scored as on table (pairs only)
  let crab = counts.crab ?? 0;
  let boat = counts.boat ?? 0;
  let fish = counts.fish ?? 0;
  let shark = counts.shark ?? 0;
  let swimmer = counts.swimmer ?? 0;
  total += Math.floor(crab / 2);
  total += Math.floor(boat / 2);
  total += Math.floor(fish / 2);
  total += Math.min(shark, swimmer);

  // Collectors
  total += collectorPoints('shell', counts.shell ?? 0);
  total += collectorPoints('octopus', counts.octopus ?? 0);
  total += collectorPoints('penguin', counts.penguin ?? 0);
  total += collectorPoints('sailor', counts.sailor ?? 0);

  // Multipliers
  if (counts.lighthouse) total += counts.boat ?? 0;
  if (counts.shoal) total += counts.fish ?? 0;
  if (counts.penguinColony) total += 2 * (counts.penguin ?? 0);
  if (counts.captain) total += 3 * (counts.sailor ?? 0);

  // Mermaid color bonus — use ACTUAL cards owned + a single hypothetical added card.
  const cards: SspCard[] = [...me.hand, ...me.table];
  if (addedFamily) {
    const colorTally = new Map<string, number>();
    for (const c of cards) colorTally.set(c.color, (colorTally.get(c.color) ?? 0) + 1);
    let bestColor = 'yellow';
    let bestN = -1;
    for (const [c, n] of colorTally) {
      if (n > bestN) { bestN = n; bestColor = c; }
    }
    if (addedFamily === 'mermaid') {
      cards.push({ id: -1, family: 'mermaid', color: 'white' });
    } else {
      cards.push({ id: -1, family: addedFamily, color: bestColor as SspCard['color'] });
    }
  }
  total += mermaidColorBonus(cards);

  return total;
}

/** Expected value of a face-down draw, mixing marginal values weighted by probability. */
function expectedUnseenDrawValue(me: SspPlayer, know: Knowledge): number {
  if (know.unseenTotal === 0) return 0;
  let exp = 0;
  for (const f of FAMILY_ORDER) {
    const u = know.unseenByFamily.get(f) ?? 0;
    if (u === 0) continue;
    exp += (u / know.unseenTotal) * marginalValue(me, f, know);
  }
  return exp;
}

/** Pick the best of 2 drawn cards: return [keepIndex, otherIndex, keepValue]. */
function chooseKeep(me: SspPlayer, draw: [SspCard, SspCard], know: Knowledge): { keepIndex: 0 | 1; keepValue: number; otherValue: number } {
  const v0 = marginalValue(me, draw[0].family, know);
  const v1 = marginalValue(me, draw[1].family, know);
  if (v0 >= v1) return { keepIndex: 0, keepValue: v0, otherValue: v1 };
  return { keepIndex: 1, keepValue: v1, otherValue: v0 };
}

/** Pick the discard pile that least helps opponents: prefer the pile whose top
 *  has less marginal value to the next player's most likely hand profile.
 *  Simple heuristic: discard onto the pile whose CURRENT top card has the
 *  HIGHEST marginal value to ME (so the opponent grabbing it costs us less in
 *  relative terms), or onto the empty pile if any. */
function chooseDiscardPile(me: SspPlayer, state: SspState, know: Knowledge): 0 | 1 {
  if (state.discards[0].length === 0) return 0;
  if (state.discards[1].length === 0) return 1;
  const top0 = state.discards[0][state.discards[0].length - 1];
  const top1 = state.discards[1][state.discards[1].length - 1];
  const v0 = marginalValue(me, top0.family, know);
  const v1 = marginalValue(me, top1.family, know);
  // Bury the better top under our discard so opponents can't grab it.
  return v0 >= v1 ? 0 : 1;
}

/** Find all valid duo pairs in hand. */
function findHandPairs(me: SspPlayer): Array<[SspCard, SspCard]> {
  const pairs: Array<[SspCard, SspCard]> = [];
  const seen = new Set<string>();
  for (let i = 0; i < me.hand.length; i++) {
    for (let j = i + 1; j < me.hand.length; j++) {
      const a = me.hand[i]; const b = me.hand[j];
      if (!isValidDuoPair(a, b)) continue;
      const key = [a.family, b.family].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
  }
  return pairs;
}

/** Score a duo pair play by expected value of its effect + the +1 pair point. */
function valueDuoPair(state: SspState, me: SspPlayer, pair: [SspCard, SspCard], know: Knowledge): number {
  const families = new Set([pair[0].family, pair[1].family]);
  let v = 1; // pair scores 1 point
  if (families.has('boat')) {
    // extra turn ≈ expected value of next draw + chance of free pair
    v += 0.6 * expectedUnseenDrawValue(me, know);
  }
  if (families.has('fish')) {
    // free top-of-deck card
    v += expectedUnseenDrawValue(me, know);
  }
  if (families.has('crab')) {
    // pick from a discard pile — value the BEST card visible across piles
    let bestVis = 0;
    for (const pile of state.discards) {
      for (const c of pile) {
        bestVis = Math.max(bestVis, marginalValue(me, c.family, know));
      }
    }
    v += bestVis;
  }
  if (families.has('shark') && families.has('swimmer')) {
    // steal random from another player — average their hand value
    let bestOpponentAvg = 0;
    for (const op of state.players) {
      if (op.id === me.id || op.hand.length === 0) continue;
      // We don't know opponents' hands. Use weighted unseen pool as estimate.
      const avg = expectedUnseenDrawValue(me, know);
      if (avg > bestOpponentAvg) bestOpponentAvg = avg;
    }
    v += bestOpponentAvg;
  }
  return v;
}

function biggestOpponentScore(state: SspState, meId: PlayerId): number {
  let max = 0;
  for (const p of state.players) {
    if (p.id === meId) continue;
    max = Math.max(max, tentativeScore(p.hand, p.table));
  }
  return max;
}

/** AI entry point — return next legal action for `playerId`, or null. */
export function chooseAIAction(state: SspState, playerId: PlayerId): SspAction | null {
  if (state.phase !== 'playing') return null;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;

  // Only the active player acts (except round-end advance, which any player can trigger).
  if (state.subPhase === 'roundEnd') {
    return { type: 'nextRound' };
  }

  if (state.activePlayerId !== playerId) return null;

  const know = buildKnowledge(state, playerId);

  switch (state.subPhase) {
    case 'awaitingAction': {
      // Inspect both discard tops and the expected face-down draw.
      const expDraw = expectedUnseenDrawValue(me, know);
      let bestPile: -1 | 0 | 1 = -1;
      let bestPileV = -Infinity;
      for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
        const pile = state.discards[i];
        if (pile.length === 0) continue;
        const top = pile[pile.length - 1];
        const v = marginalValue(me, top.family, know);
        if (v > bestPileV) { bestPileV = v; bestPile = i; }
      }
      // Discard pile draw also avoids the "discard one card to opponents" downside.
      // Estimate that downside as ~50% of the expected unseen value (opponent likely benefits).
      const drawPairNet = expDraw - 0.4 * expDraw; // keep best of two roughly offsets discard cost
      if (bestPile !== -1 && bestPileV >= drawPairNet) {
        return { type: 'drawFromDiscard', pile: bestPile };
      }
      return { type: 'drawPair' };
    }

    case 'awaitingKeep': {
      const pair = state.pendingDraw as [SspCard, SspCard];
      if (pair.length !== 2) return null;
      const { keepIndex } = chooseKeep(me, pair, know);
      const discardToPile = chooseDiscardPile(me, state, know);
      return { type: 'keepFromDraw', keepIndex, discardToPile };
    }

    case 'awaitingPlayOrEnd': {
      // 1. Play any valuable pair we can — pick the highest-value one.
      const pairs = findHandPairs(me);
      if (pairs.length > 0) {
        let best = pairs[0];
        let bestV = valueDuoPair(state, me, best, know);
        for (let i = 1; i < pairs.length; i++) {
          const v = valueDuoPair(state, me, pairs[i], know);
          if (v > bestV) { best = pairs[i]; bestV = v; }
        }
        // Only play the pair if it's positive value (always true: pair point ≥ 1).
        return { type: 'playPair', cardIds: [best[0].id, best[1].id] };
      }

      // 2. Decide stop / lastChance / pass.
      const myScore = tentativeScore(me.hand, me.table);
      const oppMax = biggestOpponentScore(state, me.id);
      const matchTarget = state.config.targetScore;
      const myLeadAfter = (me.matchScore + myScore) - Math.max(...state.players.filter((p) => p.id !== me.id).map((p) => p.matchScore));

      // If reaching 4 mermaids is impossible but we already have great pile of points, stop.
      if (myScore >= STOP_THRESHOLD) {
        const wouldFinishMatch = (me.matchScore + myScore) >= matchTarget;
        const safeLead = myScore - oppMax >= 4;
        if (wouldFinishMatch || safeLead) {
          return { type: 'stop' };
        }
        // LAST CHANCE bet: only if we have clearly better cards than the next-best opponent.
        const cardsOnly = cardPoints([...me.hand, ...me.table]);
        const opponentCards = Math.max(
          0,
          ...state.players.filter((p) => p.id !== me.id).map((p) => cardPoints([...p.hand, ...p.table])),
        );
        if (cardsOnly - opponentCards >= 6 && myLeadAfter >= 0) {
          return { type: 'lastChance' };
        }
        // Otherwise pass — risk being beaten if opponents catch up.
        // But if we're way behind on matchScore, take any positive STOP rather than stagnate.
        const trailing = state.players.some((p) => p.id !== me.id && p.matchScore > me.matchScore + 5);
        if (trailing && myScore >= STOP_THRESHOLD + 2) {
          return { type: 'stop' };
        }
        return { type: 'pass' };
      }

      return { type: 'pass' };
    }

    case 'awaitingCrabPick': {
      // Choose the highest-value visible card from either pile.
      let bestPile: 0 | 1 = 0;
      let bestCard: SspCard | null = null;
      let bestV = -Infinity;
      for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
        const pile = state.discards[i];
        for (const c of pile) {
          const v = marginalValue(me, c.family, know);
          if (v > bestV) { bestV = v; bestCard = c; bestPile = i; }
        }
      }
      if (!bestCard) {
        // No visible card → effectively no choice; the engine will still expect a crabPick.
        // Skip via pass-through: pick the first card we can find. But if both piles empty,
        // engine shouldn't be in this state. Defensive: act as no-op style.
        return null;
      }
      return { type: 'crabPick', pile: bestPile, cardId: bestCard.id };
    }

    case 'awaitingSharkSteal': {
      // Steal from the opponent with the largest hand (most cards = highest expected value).
      let best: PlayerId | null = null;
      let bestSize = -1;
      for (const op of state.players) {
        if (op.id === me.id) continue;
        if (op.hand.length > bestSize) {
          bestSize = op.hand.length;
          best = op.id;
        }
      }
      if (!best || bestSize <= 0) return null;
      return { type: 'sharkSteal', targetPlayerId: best };
    }

    default:
      return null;
  }
}
