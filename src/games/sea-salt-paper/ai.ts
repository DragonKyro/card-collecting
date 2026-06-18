// Sea Salt & Paper AI — heuristic, single difficulty.
//
// Approach
// --------
// Maintain a per-card "expected point value" estimate. The estimate is
// game-state-aware: as cards are seen (visible on tables, in the player's own
// hand, or face-up on discard piles), the AI updates a "remaining unseen" pool
// and re-estimates the marginal value of acquiring each family.
//
// Per opponent we track what families they've taken from face-up discard piles
// (the log entries are public). That gives us a "demand profile" per opponent,
// which strongly informs:
//   - which pile to discard to (don't gift cards opponents are building)
//   - whether shark+swimmer is worth playing (opponent hand value estimate)
//   - whether to take from a discard pile NOW or save the family for later
//
// On each decision, the AI:
//   1. Recomputes marginal values for every family from its own perspective.
//   2. Recomputes per-opponent "demand value" for each family (how much that
//      opponent gains from acquiring one more of it).
//   3. Picks the action with the best NET score gain: my gain − opponents' gain.
//      drawFromDiscard if a face-up top is significantly better than the unseen
//      draw. drawPair otherwise. Discard to the pile that hurts opponents the
//      least.
//   4. Plays a duo pair when its expected value (effect + 1 pt) > pass value
//      AND it doesn't trigger a useless effect (e.g. shark+swimmer with no
//      stealable target).
//   5. STOPs / LAST CHANCEs based on whether we'd actually win the bet
//      (total points, not card points) AND match-level lead vs target.

import type { PlayerId } from '@/core/types';
import type { SspState, SspAction, SspCard, SspCardFamily, SspPlayer, SspLogEntry } from './types';
import { FAMILY, FAMILY_ORDER, duoPartner, isCollectorFamily, isDuoFamily } from './cards';
import {
  collectorPoints, isValidDuoPair, mermaidColorBonus, tentativeScore, totalScore,
} from './scoring';

const STOP_THRESHOLD = 7;

interface Knowledge {
  /** Cards we can see (own hand + tables + face-up discard piles + pendingDraw if we're acting). */
  seenIds: Set<number>;
  /** Per-family count of unseen cards (still in deck or in opponents' hands). */
  unseenByFamily: Map<SspCardFamily, number>;
  /** Total unseen cards. */
  unseenTotal: number;
  /** Per-opponent inferred hand size (from state) + the families we've seen
   *  them DRAW from discard piles (those almost-certainly remain in hand). */
  opponentProfiles: Map<PlayerId, OpponentProfile>;
}

interface OpponentProfile {
  /** Families we've seen them deliberately pick up from face-up sources
   *  (drawFromDiscard, crabPick, sharkSteal, lobsterPick, angelfishDraw).
   *  Strong signal of what they're building. */
  knownTaken: Partial<Record<SspCardFamily, number>>;
  /** Hand size at the moment we built knowledge. */
  handSize: number;
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
  if (state.activePlayerId === meId) {
    for (const c of state.pendingDraw) seen.add(c.id);
  }

  const totalByFamily: Record<SspCardFamily, number> = {} as Record<SspCardFamily, number>;
  for (const f of FAMILY_ORDER) totalByFamily[f] = FAMILY[f].count;

  const seenByFamily: Record<SspCardFamily, number> = {} as Record<SspCardFamily, number>;
  for (const f of FAMILY_ORDER) seenByFamily[f] = 0;

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

  // Per-opponent profile: walk the log, tally families taken from face-up sources.
  const opponentProfiles = new Map<PlayerId, OpponentProfile>();
  for (const p of state.players) {
    if (p.id === meId) continue;
    opponentProfiles.set(p.id, { knownTaken: {}, handSize: p.hand.length });
  }
  for (const e of state.log ?? []) {
    const fam = familyFromLogEntry(e);
    if (!fam) continue;
    const pid = (e as { playerId?: PlayerId }).playerId;
    if (!pid || pid === meId) continue;
    const prof = opponentProfiles.get(pid);
    if (!prof) continue;
    prof.knownTaken[fam] = (prof.knownTaken[fam] ?? 0) + 1;
  }

  return { seenIds: seen, unseenByFamily: unseen, unseenTotal, opponentProfiles };
}

/** Pull the family out of a log entry if it represents a card-acquisition by a
 *  specific player from a public source (so we know exactly what they took). */
function familyFromLogEntry(e: SspLogEntry): SspCardFamily | null {
  switch (e.kind) {
    case 'drawDiscard':    return e.family;
    case 'crabPick':       return e.family;
    case 'sharkSteal':     return e.family;
    case 'lobsterPick':    return e.family;
    case 'angelfishDraw':  return e.family;
    // 'drawDeck' (kept face-down draw), 'fishDraw' (drawn from face-down deck)
    // are hidden info if the player isn't the local viewer.
    default: return null;
  }
}

/** Marginal score gain to ME if I add one extra card of `family` to my pool. */
function marginalValue(me: SspPlayer, family: SspCardFamily, _know: Knowledge): number {
  const before = countMyFamilies(me);
  const after = { ...before };
  after[family] = (after[family] ?? 0) + 1;

  const beforeScore = scoreFromCounts(before, me);
  const afterScore = scoreFromCounts(after, me, family);

  let delta = afterScore - beforeScore;

  // Mermaid swing: each unseen mermaid is genuinely valuable (4 mermaids = instant
  // win). Encourage chase if we already hold ≥1.
  if (family === 'mermaid') {
    const owned = (before.mermaid ?? 0);
    if (owned >= 3) delta += 25;
    else if (owned >= 2) delta += 8;
    else if (owned >= 1) delta += 4;
    else delta += 1.5;
  }

  // Bonus signal for cards that form a duo pair with something we already hold.
  // The base scoreFromCounts already credits the +1 from the pair when it
  // becomes possible, but the duo ABILITY is also worth ~1 pt of expected
  // future value (crab pull, boat extra turn, etc.).
  if (isDuoFamily(family)) {
    const partner = duoPartner(family);
    if (partner) {
      const ownPartners = me.hand.filter((c) => c.family === partner).length;
      const ownSelf = me.hand.filter((c) => c.family === family).length;
      if (partner === family && ownSelf >= 1) delta += 1.0;       // base ability ~1 EV
      if (partner !== family && ownPartners >= 1) delta += 1.5;   // shark+swimmer steal worth more
    }
  }

  // Penalty if family is already saturated (e.g. 6 shells = max already).
  if (family === 'shell' && (before.shell ?? 0) >= 6) delta -= 1;
  if (family === 'octopus' && (before.octopus ?? 0) >= 5) delta -= 1;
  if (family === 'penguin' && (before.penguin ?? 0) >= 3) delta -= 1;
  if (family === 'sailor' && (before.sailor ?? 0) >= 2) delta -= 1;

  return delta;
}

/** Marginal value the family would have for OPPONENT `op` — based on what we
 *  know they've taken from public sources. We treat their inferred hand as
 *  a virtual `SspPlayer` and run the same marginal scoring. */
function marginalValueForOpponent(
  op: SspPlayer, profile: OpponentProfile, family: SspCardFamily, know: Knowledge,
): number {
  // Build a virtual "opponent player" with only the cards we can prove they
  // hold (knownTaken). It's a partial view — missing cards we never saw —
  // but it captures their stated demand much better than treating the
  // opponent's hand as uniformly average.
  const virtual: SspPlayer = {
    id: op.id,
    hand: [],
    table: op.table.slice(),
    roundScore: op.roundScore,
    matchScore: op.matchScore,
  };
  let pid = -1;
  for (const fam of FAMILY_ORDER) {
    const n = profile.knownTaken[fam] ?? 0;
    for (let i = 0; i < n; i++) {
      virtual.hand.push({ id: pid--, family: fam, color: 'yellow' });
    }
  }
  return marginalValue(virtual, family, know);
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
  let total = 0;
  const crab = counts.crab ?? 0;
  const boat = counts.boat ?? 0;
  const fish = counts.fish ?? 0;
  const shark = counts.shark ?? 0;
  const swimmer = counts.swimmer ?? 0;
  total += Math.floor(crab / 2);
  total += Math.floor(boat / 2);
  total += Math.floor(fish / 2);
  total += Math.min(shark, swimmer);

  total += collectorPoints('shell', counts.shell ?? 0);
  total += collectorPoints('octopus', counts.octopus ?? 0);
  total += collectorPoints('penguin', counts.penguin ?? 0);
  total += collectorPoints('sailor', counts.sailor ?? 0);

  if (counts.lighthouse) total += counts.boat ?? 0;
  if (counts.shoal) total += counts.fish ?? 0;
  if (counts.penguinColony) total += 2 * (counts.penguin ?? 0);
  if (counts.captain) total += 3 * (counts.sailor ?? 0);

  // Mermaid color bonus — use ACTUAL cards owned + hypothetical added card.
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

/** Expected value of a face-down draw. */
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

/** Pick the discard pile so that, after our card is placed on top, the worst
 *  case for opponents is minimized. We consider:
 *    - Which top is most useful to opponents now (we want to bury it).
 *    - But ALSO: our discarded card becomes the new top, so we should weight
 *      how much opponents would gain from our discard itself.
 *  Algorithm:
 *    score(pile_i) = harmGain(pile_i) where
 *      harmGain = max-over-opponents marginal value of the NEW top (our card)
 *               − max-over-opponents marginal value of the buried top (their
 *                  potential gain we just denied them)
 *    pick the pile with the SMALLEST harmGain. Ties are broken via a
 *    deterministic per-turn hash so the AI doesn't always favour pile 0.
 */
function chooseDiscardPile(
  me: SspPlayer, discardCard: SspCard, state: SspState, know: Knowledge,
): 0 | 1 {
  // Empty-pile rule (enforced by reducer): fill the empty pile first.
  if (state.discards[0].length === 0 && state.discards[1].length > 0) return 0;
  if (state.discards[1].length === 0 && state.discards[0].length > 0) return 1;
  if (state.discards[0].length === 0 && state.discards[1].length === 0) return 0;

  const tops: [SspCard, SspCard] = [
    state.discards[0][state.discards[0].length - 1],
    state.discards[1][state.discards[1].length - 1],
  ];

  const opponents = state.players.filter((p) => p.id !== me.id);
  const opMarginalForDiscard = opponents.map((op) => {
    const prof = know.opponentProfiles.get(op.id);
    return prof ? marginalValueForOpponent(op, prof, discardCard.family, know) : 0;
  });
  const opMaxForDiscard = Math.max(0, ...opMarginalForDiscard);

  const harm = (pileIdx: 0 | 1): number => {
    const buriedTop = tops[pileIdx];
    const opMaxForBuried = Math.max(0, ...opponents.map((op) => {
      const prof = know.opponentProfiles.get(op.id);
      return prof ? marginalValueForOpponent(op, prof, buriedTop.family, know) : 0;
    }));
    return opMaxForDiscard - opMaxForBuried;
  };

  const h0 = harm(0);
  const h1 = harm(1);
  // Only treat truly-equal harm as a tie; otherwise pick the smaller harm.
  if (Math.abs(h0 - h1) < 0.001) return tieBreakHash(state, me, discardCard);
  return h0 < h1 ? 0 : 1;
}

/** Deterministic per-turn hash → 0 or 1. Used as a tie-breaker for choices
 *  that would otherwise always go to the same option. Mixes several
 *  state-derived signals so the answer varies turn-to-turn even when the
 *  numerical scores are identical. */
function tieBreakHash(state: SspState, me: SspPlayer, extra?: SspCard): 0 | 1 {
  let h = (state.logSeq ?? 0) >>> 0;
  h = (h * 2654435761) >>> 0;          // Knuth multiplicative hash
  h ^= state.round;
  h ^= state.deck.length;
  h ^= me.hand.length << 4;
  h ^= me.table.length << 8;
  if (extra) h ^= extra.id;
  return (h & 1) as 0 | 1;
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
    // Boat: extra turn ≈ best of (best discard top, expected face-down draw).
    let bestDiscardV = 0;
    for (const pile of state.discards) {
      const top = pile[pile.length - 1];
      if (top) bestDiscardV = Math.max(bestDiscardV, marginalValue(me, top.family, know));
    }
    const exp = expectedUnseenDrawValue(me, know);
    v += Math.max(bestDiscardV, exp) * 0.85; // small discount for "we still have to choose well"
  }

  if (families.has('fish')) {
    v += expectedUnseenDrawValue(me, know);
  }

  if (families.has('crab')) {
    // Pick from a discard pile — value the BEST card visible across piles.
    let bestVis = 0;
    for (const pile of state.discards) {
      for (const c of pile) {
        bestVis = Math.max(bestVis, marginalValue(me, c.family, know));
      }
    }
    v += bestVis;
  }

  if (families.has('shark') && families.has('swimmer')) {
    // Steal a RANDOM card from an opponent. Use our per-opponent profile to
    // estimate the average value of cards in their hand (the known-taken
    // families weighted by hand fraction; remaining slots use expected unseen).
    let best = 0;
    for (const op of state.players) {
      if (op.id === me.id || op.hand.length === 0) continue;
      if (state.lastChanceFrom === op.id) continue;
      const prof = know.opponentProfiles.get(op.id);
      if (!prof) continue;
      let knownCount = 0;
      let knownValue = 0;
      for (const fam of Object.keys(prof.knownTaken) as SspCardFamily[]) {
        const n = prof.knownTaken[fam] ?? 0;
        knownCount += n;
        knownValue += n * marginalValue(me, fam, know);
      }
      const unknownCount = Math.max(0, op.hand.length - knownCount);
      const avgUnknown = expectedUnseenDrawValue(me, know);
      const expValue = (knownValue + unknownCount * avgUnknown) / Math.max(1, op.hand.length);
      best = Math.max(best, expValue);
    }
    v += best;
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

/** Biggest opponent CARD-POINTS score (including mermaid claims, excluding
 *  the special color bonus). Used for LAST CHANCE bet evaluation since the
 *  bet compares card points only — the color bonus is paid to everyone. */
function biggestOpponentCardScore(state: SspState, meId: PlayerId): number {
  let max = 0;
  for (const p of state.players) {
    if (p.id === meId) continue;
    const sc = totalScore([...p.hand, ...p.table]);
    max = Math.max(max, sc.cardPoints);
  }
  return max;
}

/** AI entry point — return next legal action for `playerId`, or null. */
export function chooseAIAction(state: SspState, playerId: PlayerId): SspAction | null {
  if (state.phase !== 'playing') return null;

  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;

  if (state.subPhase === 'roundEnd') {
    const hasHuman = state.seats.some((s) => !s.isAI);
    if (hasHuman) return null;
    return { type: 'nextRound' };
  }

  if (state.activePlayerId !== playerId) return null;

  const know = buildKnowledge(state, playerId);

  switch (state.subPhase) {
    case 'awaitingAction': {
      // Inspect both discard tops + expected face-down draw value, AND each
      // option's opportunity cost (do we give opponents free cards if we draw
      // from the deck?). We pick the option with the best NET EV.
      const expDraw = expectedUnseenDrawValue(me, know);

      let bestPile: -1 | 0 | 1 = -1;
      let bestPileV = -Infinity;
      const pileValues: [number, number] = [-Infinity, -Infinity];
      for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
        const pile = state.discards[i];
        if (pile.length === 0) continue;
        const top = pile[pile.length - 1];
        const v = marginalValue(me, top.family, know);
        pileValues[i] = v;
        if (v > bestPileV) { bestPileV = v; bestPile = i; }
      }
      // Tie-break: if both tops are equally valuable, vary pile choice each turn.
      if (bestPile !== -1
          && Math.abs(pileValues[0] - pileValues[1]) < 0.001
          && state.discards[0].length > 0
          && state.discards[1].length > 0) {
        bestPile = tieBreakHash(state, me);
      }

      // drawPair: we keep the BETTER of two unseen draws + discard the other.
      // Approximate as max(2 i.i.d. samples of expDraw) ≈ 1.3× expDraw, minus
      // the opponent's average gain from our forced discard (estimated as the
      // expected unseen value × opponents-care factor).
      const drawPairKeep = 1.3 * expDraw;
      // Estimate opponent "demand" for the average discarded card: roughly
      // expDraw weighted by how much they engage with discards. Use a fixed
      // 0.4 multiplier to reflect "some of the time they grab it, some they
      // don't" — same shape as the original code.
      const drawPairOpponentCost = 0.4 * expDraw;
      const drawPairNet = drawPairKeep - drawPairOpponentCost;

      // Threshold: only prefer the discard pile if it's better than the
      // net of drawing a pair (which gives us choice).
      if (bestPile !== -1 && bestPileV >= drawPairNet) {
        return { type: 'drawFromDiscard', pile: bestPile };
      }
      return { type: 'drawPair' };
    }

    case 'awaitingKeep': {
      const pair = state.pendingDraw as [SspCard, SspCard];
      if (pair.length !== 2) return null;
      const { keepIndex } = chooseKeep(me, pair, know);
      const otherIndex = keepIndex === 0 ? 1 : 0;
      const discardCard = pair[otherIndex];
      const discardToPile = chooseDiscardPile(me, discardCard, state, know);
      return { type: 'keepFromDraw', keepIndex, discardToPile };
    }

    case 'awaitingPlayOrEnd': {
      // 1. Play any valuable pair we can — pick the highest-value one, but
      // only if its EV strictly beats just passing.
      const pairs = findHandPairs(me);
      if (pairs.length > 0) {
        let best = pairs[0];
        let bestV = valueDuoPair(state, me, best, know);
        for (let i = 1; i < pairs.length; i++) {
          const v = valueDuoPair(state, me, pairs[i], know);
          if (v > bestV) { best = pairs[i]; bestV = v; }
        }
        // Always >= 1 point, always worth playing.
        return { type: 'playPair', cardIds: [best[0].id, best[1].id] };
      }

      // 2. End-turn decisions.
      // If another player has already called LAST CHANCE, we're on the final
      // forced go-around: stop/lastChance are illegal, only pass is allowed.
      if (state.lastChanceFrom !== null) {
        return { type: 'pass' };
      }

      const myScore = tentativeScore(me.hand, me.table);
      const oppMax = biggestOpponentScore(state, me.id);
      const matchTarget = state.config.targetScore;
      const myMatchLeadAfter = (me.matchScore + myScore) - Math.max(...state.players.filter((p) => p.id !== me.id).map((p) => p.matchScore));

      const myEvent = state.event?.current;
      const hasEvent = (id: 'treasureChest' | 'diodonFish') =>
        (me.heldEvents ?? []).includes(id) || myEvent === id;
      const stopThreshold = hasEvent('treasureChest') ? 10 : STOP_THRESHOLD;
      const canStop = !hasEvent('diodonFish');

      if (myScore >= stopThreshold) {
        const wouldFinishMatch = (me.matchScore + myScore) >= matchTarget;
        const safeLead = myScore - oppMax >= 4;
        if (canStop && (wouldFinishMatch || safeLead)) {
          return { type: 'stop' };
        }

        // LAST CHANCE bet evaluation: the bet compares CARD POINTS only (the
        // special color bonus is paid to every player regardless of the bet).
        // We win the bet if our card total stays ≥ every opponent's card
        // total after they take one more turn. Ties go to the caller.
        const myCards = totalScore([...me.hand, ...me.table]).cardPoints;
        const oppMaxCards = biggestOpponentCardScore(state, me.id);
        // After their last turn each opponent could gain ~expectedUnseenDraw
        // worth of card value. Be moderately pessimistic: 1.2× expected draw.
        const expectedOpponentCardsAfter = oppMaxCards + 1.2 * expectedUnseenDrawValue(me, know);
        const betWinMargin = myCards - expectedOpponentCardsAfter;
        const aggressionBoost = myMatchLeadAfter < 0 ? 2 : 0;
        if (betWinMargin + aggressionBoost >= 2 && myMatchLeadAfter > -10) {
          return { type: 'lastChance' };
        }

        const trailing = state.players.some((p) => p.id !== me.id && p.matchScore > me.matchScore + 5);
        if (canStop && trailing && myScore >= stopThreshold + 2) {
          return { type: 'stop' };
        }
        return { type: 'pass' };
      }

      return { type: 'pass' };
    }

    case 'awaitingCrabPick': {
      // Choose the highest-value visible card from either pile. When several
      // cards tie at the same top value, vary which one we take across turns.
      const candidates: Array<{ card: SspCard; pile: 0 | 1; v: number }> = [];
      let bestV = -Infinity;
      for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
        const pile = state.discards[i];
        for (const c of pile) {
          const v = marginalValue(me, c.family, know);
          candidates.push({ card: c, pile: i, v });
          if (v > bestV) bestV = v;
        }
      }
      const top = candidates.filter((x) => Math.abs(x.v - bestV) < 0.001);
      let bestPile: 0 | 1 = 0;
      let bestCard: SspCard | null = null;
      if (top.length > 0) {
        const pick = top[tieBreakHash(state, me) === 0
          ? 0
          : Math.min(top.length - 1, 1)];
        bestCard = pick.card;
        bestPile = pick.pile;
      }
      if (!bestCard) return null;
      return { type: 'crabPick', pile: bestPile, cardId: bestCard.id };
    }

    case 'awaitingSharkSteal': {
      // Use the per-opponent profile to pick the target whose average hand
      // value is highest. Skip the LAST CHANCE caller (protected) and empty
      // hands.
      let best: PlayerId | null = null;
      let bestV = -Infinity;
      for (const op of state.players) {
        if (op.id === me.id || op.hand.length === 0) continue;
        if (state.lastChanceFrom === op.id) continue;
        const prof = know.opponentProfiles.get(op.id);
        if (!prof) continue;
        let knownCount = 0;
        let knownValue = 0;
        for (const fam of Object.keys(prof.knownTaken) as SspCardFamily[]) {
          const n = prof.knownTaken[fam] ?? 0;
          knownCount += n;
          knownValue += n * marginalValue(me, fam, know);
        }
        const unknownCount = Math.max(0, op.hand.length - knownCount);
        const avgUnknown = expectedUnseenDrawValue(me, know);
        const expValue = (knownValue + unknownCount * avgUnknown) / Math.max(1, op.hand.length);
        if (expValue > bestV) { bestV = expValue; best = op.id; }
      }
      if (!best) return null;
      return { type: 'sharkSteal', targetPlayerId: best };
    }

    case 'awaitingLobsterPick': {
      const pool = state.pendingLobsterPick ?? [];
      if (pool.length === 0) return null;
      let best = pool[0];
      let bestV = marginalValue(me, best.family, know);
      for (let i = 1; i < pool.length; i++) {
        const v = marginalValue(me, pool[i].family, know);
        if (v > bestV) { bestV = v; best = pool[i]; }
      }
      return { type: 'lobsterPick', cardId: best.id };
    }

    default:
      return null;
  }
}

// Re-export for tests (lets test code peek at heuristics without exporting
// every helper).
export const __test__ = {
  buildKnowledge, marginalValue, chooseDiscardPile, valueDuoPair, isCollectorFamily,
};
