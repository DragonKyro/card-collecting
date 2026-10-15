// Sea Salt & Paper AI — heuristic, single difficulty.
//
// Information
// -----------
// Plays fair: it only uses what a person in its seat could know, via
// knowledge.ts — own hand, every table, visible pile tops, a memory of each
// discard pile (uncertain after an opponent's unseen crab dig), and the
// opponent cards it saw them take off a pile top or steal from it. It never
// reads an opponent's hand or the deck; opponent scores are estimates.
//
// From that it keeps:
//
//   - Per-family / per-color unseen counts: total deck − everything it can
//     place (fractional where a remembered buried card may have been dug out).
//     Used for draw expectations and mermaid-bonus prediction.
//   - Per-opponent profile: the cards known to be in their hand plus the
//     families they keep pulling off pile tops (a demand signal).
//
// On each decision the AI:
//   1. Recomputes per-family + per-color marginal values for itself.
//   2. Recomputes per-opponent demand for each family from their profile.
//   3. Picks the action with the best NET gain: my expected gain − opponents'
//      expected gain from any side-effects (e.g. our discarded card).
//
// Specifically:
//   - drawFromDiscard if top is meaningfully better than expected unseen draw
//     AND/OR completes/progresses a collector set we're committed to. Same
//     priority used DEFENSIVELY: if the top would help an opponent more than
//     us, we still take it to deny.
//   - drawPair otherwise. When we have to discard, we bury the pile whose top
//     helps opponents most.
//   - Pair plays: highest expected total value of the pair effect + 1 pt.
//     Boat now looks at concrete next-action options (take an existing top,
//     finish a collector set, complete a hand pair) rather than just expected
//     unseen draw.
//   - Crab: per the rulebook, choose a pile from memory, then look through it
//     and take the card with the highest NET (my gain − best opponent gain).
//   - STOP / LAST CHANCE: card-points bet against an ESTIMATED opponent score
//     (known cards + sampled stand-ins for the unknown ones) + match-lead
//     pressure.

import type { PlayerId } from '@/core/types';
import { createRng, rngInt } from '@/core/rng';
import type { SspState, SspAction, SspCard, SspCardFamily, SspColor, SspPlayer } from './types';
import { FAMILY_ORDER, buildDeck, duoPartner, isCollectorFamily, isDuoFamily } from './cards';
import {
  collectorPoints, isValidDuoPair, mermaidColorBonus, specialColorBonus, tentativeScore, totalScore,
} from './scoring';
import { canEndRound, scoringOptsFor, stopThresholdFor } from './reducer';
import { eventAppliesTo } from './events';
import { buriedStillThere, knowledgeOf, type PileMemory } from './knowledge';

interface Knowledge {
  /** Per-family expected count of cards we can't place (deck + opponents'
   *  unknown hand cards). Fractional when a remembered card may be gone. */
  unseenByFamily: Map<SspCardFamily, number>;
  /** Per-color expected unseen count. */
  unseenByColor: Map<SspColor, number>;
  /** Total unseen cards. */
  unseenTotal: number;
  /** Per-opponent known cards + demand signals. */
  opponentProfiles: Map<PlayerId, OpponentProfile>;
  /** What we remember of each discard pile. */
  piles: [PileMemory, PileMemory];
  /** Concrete cards we can't place — the pool opponents' unknown cards come from. */
  unplaced: SspCard[];
}

interface OpponentProfile {
  /** Cards we know are in their hand (taken off a pile top, or stolen from us). */
  knownCards: SspCard[];
  /** Family counts of `knownCards`. */
  knownTaken: Partial<Record<SspCardFamily, number>>;
  /** Public hand size. */
  handSize: number;
  /** How many times this round they pulled this family off a pile top.
   *  Used for defensive blocking — repeated picks of the same family are a
   *  much stronger signal than a one-off. */
  discardPullsByFamily: Partial<Record<SspCardFamily, number>>;
}

const ALL_COLORS: SspColor[] = [
  'white', 'yellow', 'green', 'pink', 'purple', 'teal', 'darkblue', 'black', 'gray', 'orange', 'tan',
];

/** Build a snapshot of everything this seat can know. `lookingAt` = the pile
 *  it is crab-digging through right now (seen in full). */
function buildKnowledge(state: SspState, meId: PlayerId, lookingAt: 0 | 1 | null = null): Knowledge {
  const me = state.players.find((p) => p.id === meId)!;
  const seat = knowledgeOf(state, meId, { lookingAt });
  const extraSalt = !!state.config.expansions?.extraSalt;
  const deck = buildDeck({ extraSalt });

  const seenByFamily = new Map<SspCardFamily, number>();
  const seenByColor = new Map<SspColor, number>();
  const placed = new Set<number>();
  const see = (cards: SspCard[], weight = 1) => {
    for (const c of cards) {
      seenByFamily.set(c.family, (seenByFamily.get(c.family) ?? 0) + weight);
      seenByColor.set(c.color, (seenByColor.get(c.color) ?? 0) + weight);
      placed.add(c.id);
    }
  };
  see(me.hand);
  for (const p of state.players) see(p.table);
  if (state.activePlayerId === meId) {
    see(state.pendingDraw);
    if (state.subPhase === 'awaitingLobsterPick') see(state.pendingLobsterPick ?? []);
  }
  for (const pile of seat.piles) {
    if (pile.top) see([pile.top]);
    see(pile.buried, buriedStillThere(pile));
  }
  seat.knownHands.forEach((cards) => see(cards));

  const unseenByFamily = new Map<SspCardFamily, number>();
  const unseenByColor = new Map<SspColor, number>();
  for (const c of deck) {
    unseenByFamily.set(c.family, (unseenByFamily.get(c.family) ?? 0) + 1);
    unseenByColor.set(c.color, (unseenByColor.get(c.color) ?? 0) + 1);
  }
  let unseenTotal = 0;
  for (const f of FAMILY_ORDER) {
    const u = Math.max(0, (unseenByFamily.get(f) ?? 0) - (seenByFamily.get(f) ?? 0));
    unseenByFamily.set(f, u);
    unseenTotal += u;
  }
  for (const c of ALL_COLORS) {
    unseenByColor.set(c, Math.max(0, (unseenByColor.get(c) ?? 0) - (seenByColor.get(c) ?? 0)));
  }

  const opponentProfiles = new Map<PlayerId, OpponentProfile>();
  state.players.forEach((p, i) => {
    if (p.id === meId) return;
    const knownTaken: Partial<Record<SspCardFamily, number>> = {};
    for (const c of seat.knownHands[i]) knownTaken[c.family] = (knownTaken[c.family] ?? 0) + 1;
    const discardPullsByFamily: Partial<Record<SspCardFamily, number>> = {};
    for (const c of seat.publicPulls[i]) {
      discardPullsByFamily[c.family] = (discardPullsByFamily[c.family] ?? 0) + 1;
    }
    opponentProfiles.set(p.id, {
      knownCards: seat.knownHands[i],
      knownTaken,
      handSize: p.hand.length,
      discardPullsByFamily,
    });
  });

  return {
    unseenByFamily,
    unseenByColor,
    unseenTotal,
    opponentProfiles,
    piles: seat.piles,
    unplaced: deck.filter((c) => !placed.has(c.id)),
  };
}

/** Marginal score gain to ME if I add one extra card of `family` to my pool.
 *  When `addedColor` is provided, uses that color for the new card; otherwise
 *  picks the color most likely to maximize mermaid bonus (the largest existing
 *  group, falling back to a non-white color we haven't seen much). */
function marginalValue(
  me: SspPlayer,
  family: SspCardFamily,
  _know: Knowledge,
  addedColor?: SspColor,
): number {
  const before = countMyFamilies(me);
  const after = { ...before };
  after[family] = (after[family] ?? 0) + 1;

  const beforeScore = scoreFromCounts(before, me);
  const afterScore = scoreFromCounts(after, me, family, addedColor);
  let delta = afterScore - beforeScore;

  // Mermaid swing — each unseen mermaid is genuinely valuable (4 mermaids =
  // instant win). Scale aggressively with how close we already are.
  if (family === 'mermaid') {
    const owned = (before.mermaid ?? 0);
    if (owned >= 3) delta += 25;
    else if (owned >= 2) delta += 8;
    else if (owned >= 1) delta += 4;
    else delta += 1.5;
  }

  // Bonus signal: cards that COMPLETE a duo pair we already partially hold
  // unlock the pair ability + 1 pt. The base scoreFromCounts already credits
  // the +1 pair point — here we add expected ability value.
  if (isDuoFamily(family)) {
    const partner = duoPartner(family);
    if (partner) {
      const ownPartners = me.hand.filter((c) => c.family === partner).length;
      const ownSelf = me.hand.filter((c) => c.family === family).length;
      if (partner === family && ownSelf >= 1) delta += abilityEV(family);
      if (partner !== family && ownPartners >= 1) delta += abilityEV(family);
    }
  }

  // Collector saturation penalty — beyond the cap nothing more helps.
  if (family === 'shell' && (before.shell ?? 0) >= 6) delta -= 1;
  if (family === 'octopus' && (before.octopus ?? 0) >= 5) delta -= 1;
  if (family === 'penguin' && (before.penguin ?? 0) >= 3) delta -= 1;
  if (family === 'sailor' && (before.sailor ?? 0) >= 2) delta -= 1;

  // Multiplier card without its target = wasted slot.
  if (family === 'lighthouse' && (before.boat ?? 0) === 0) delta -= 0.5;
  if (family === 'shoal' && (before.fish ?? 0) === 0) delta -= 0.5;
  if (family === 'penguinColony' && (before.penguin ?? 0) === 0) delta -= 0.5;
  if (family === 'captain' && (before.sailor ?? 0) === 0) delta -= 0.5;

  return delta;
}

/** Lightweight EV estimate for a duo ability — used when we're evaluating the
 *  marginal value of a card that COMPLETES a pair (so the ability becomes
 *  available next turn). Returns roughly the expected number of points the
 *  ability would deliver. Kept to flat constants so the recursive use of
 *  `marginalValue` inside `expectedUnseenDrawValue` doesn't loop. */
function abilityEV(family: SspCardFamily): number {
  if (family === 'crab' || family === 'lobster') return 2.5;
  if (family === 'boat') return 2.0;
  if (family === 'fish') return 1.8; // ≈ a typical face-down draw value
  if (family === 'shark' || family === 'swimmer') return 2.0;
  if (family === 'jellyfish') return 1.2;
  return 0;
}

/** Marginal value the family would have for OPPONENT `op`. Uses the cards we
 *  know they hold as their virtual hand. */
function marginalValueForOpponent(
  op: SspPlayer, profile: OpponentProfile, family: SspCardFamily, know: Knowledge,
): number {
  const virtual: SspPlayer = {
    id: op.id,
    hand: profile.knownCards.slice(),
    table: op.table.slice(),
    roundScore: op.roundScore,
    matchScore: op.matchScore,
  };
  let v = marginalValue(virtual, family, know);
  // Defensive multiplier — if they've REPEATEDLY pulled this family from a
  // discard pile, that's strong evidence they're committed to it. Boost the
  // perceived value so we block harder.
  const pulls = profile.discardPullsByFamily[family] ?? 0;
  if (pulls >= 2) v *= 1.5;
  else if (pulls >= 1) v *= 1.2;
  return v;
}

function countMyFamilies(me: SspPlayer): Partial<Record<SspCardFamily, number>> {
  const out: Partial<Record<SspCardFamily, number>> = {};
  for (const c of [...me.hand, ...me.table]) out[c.family] = (out[c.family] ?? 0) + 1;
  return out;
}

/** Pure scoring from a family-count map. When `addedFamily` is provided we
 *  also predict the mermaid color-bonus contribution of that hypothetical card
 *  using known color frequencies. `addedColor` lets the caller specify the
 *  exact color (used when we're considering a concrete card from a pile). */
function scoreFromCounts(
  counts: Partial<Record<SspCardFamily, number>>,
  me: SspPlayer,
  addedFamily?: SspCardFamily,
  addedColor?: SspColor,
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

  const cards: SspCard[] = [...me.hand, ...me.table];
  if (addedFamily) {
    // Determine the added card's color. If the caller specified one, use it.
    // Otherwise pick the most likely color — for mermaid that's white; for
    // anything else we pick our LARGEST EXISTING non-white color group so the
    // mermaid bonus prediction is optimistic (and matches what we'd actually
    // chase given the chance).
    let color: SspColor;
    if (addedColor) {
      color = addedColor;
    } else if (addedFamily === 'mermaid') {
      color = 'white';
    } else {
      const colorTally = new Map<SspColor, number>();
      for (const c of cards) {
        if (c.color === 'white') continue;
        colorTally.set(c.color, (colorTally.get(c.color) ?? 0) + 1);
      }
      let bestColor: SspColor = 'yellow';
      let bestN = -1;
      for (const [col, n] of colorTally) {
        if (n > bestN) { bestN = n; bestColor = col; }
      }
      color = bestColor;
    }
    cards.push({ id: -1, family: addedFamily, color });
  }
  total += mermaidColorBonus(cards);

  // Partial credit for the LAST CHANCE special color bonus (1 pt per card of
  // the largest color group, including white). Counts at face value only when
  // the round ends via LAST CHANCE — we discount to ~30% to reflect the
  // probabilistic nature, but it's still meaningful: it means MERMAIDS (which
  // are white) contribute to the bonus column, not just to the mermaid claim.
  total += 0.3 * specialColorBonus(cards);

  return total;
}

/** Expected value of a face-down draw, weighted by per-family unseen counts. */
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

/** Value of a SPECIFIC card (family + color known) given my current state. */
function valueOfConcreteCard(me: SspPlayer, card: SspCard, know: Knowledge): number {
  return marginalValue(me, card.family, know, card.color);
}

/** Pick the best of 2 drawn cards. */
function chooseKeep(me: SspPlayer, draw: [SspCard, SspCard], know: Knowledge): { keepIndex: 0 | 1 } {
  const v0 = valueOfConcreteCard(me, draw[0], know);
  const v1 = valueOfConcreteCard(me, draw[1], know);
  return { keepIndex: v0 >= v1 ? 0 : 1 };
}

/** Pick the discard pile so opponents gain as little as possible. We balance:
 *    - our discarded card becomes the new top → opponents may grab it.
 *    - the buried top is now ALSO inaccessible to opponents (good for us).
 *  Pick the pile with the smallest "harm".
 */
function chooseDiscardPile(
  me: SspPlayer, discardCard: SspCard, state: SspState, know: Knowledge,
): 0 | 1 {
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
  if (Math.abs(h0 - h1) < 0.001) return tieBreakHash(state, me, discardCard);
  return h0 < h1 ? 0 : 1;
}

/** Deterministic per-turn hash → 0 or 1, used as a tiebreaker. */
function tieBreakHash(state: SspState, me: SspPlayer, extra?: SspCard): 0 | 1 {
  let h = (state.logSeq ?? 0) >>> 0;
  h = (h * 2654435761) >>> 0;
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

/** Value of a duo pair play, looking at the concrete next-action options
 *  enabled by the ability rather than averaging EV. */
function valueDuoPair(state: SspState, me: SspPlayer, pair: [SspCard, SspCard], know: Knowledge): number {
  const families = new Set([pair[0].family, pair[1].family]);
  let v = 1; // pair scores 1 point

  if (families.has('boat')) {
    // Boat gives us a free extra turn. Value = the best concrete action we
    // could take next: drawDiscard the best top, OR drawPair (best of 2 unseen
    // → expected value). We DON'T add a follow-up pair play because the boat
    // pair itself has already used up our pair budget for this play — but the
    // EXTRA draw might land us into a new pair, so we credit a small follow-on
    // pair-completion EV (≈ probability of drawing a duo partner × 1).
    let bestDiscardV = 0;
    for (const pile of state.discards) {
      const top = pile[pile.length - 1];
      if (top) bestDiscardV = Math.max(bestDiscardV, valueOfConcreteCard(me, top, know));
    }
    const drawPairKeep = 1.3 * expectedUnseenDrawValue(me, know);
    // Take the better of the two concrete next-action options.
    const bestNext = Math.max(bestDiscardV, drawPairKeep);
    // Cap at a sensible ceiling — the next turn isn't infinitely valuable, and
    // boat doesn't give the play-a-pair step (we already played our pair).
    v += bestNext;
  }

  if (families.has('fish')) {
    // Fish gives a free face-down draw — straight EV.
    v += expectedUnseenDrawValue(me, know);
  }

  if (families.has('crab') || families.has('lobster')) {
    // Crab lets us dig through a discard pile. Value = the best card we
    // remember there, discounted when an unseen dig may have taken it.
    let bestVis = 0;
    for (const pile of know.piles) {
      if (pile.top) bestVis = Math.max(bestVis, valueOfConcreteCard(me, pile.top, know));
      const stillThere = buriedStillThere(pile);
      for (const c of pile.buried) {
        bestVis = Math.max(bestVis, stillThere * valueOfConcreteCard(me, c, know));
      }
    }
    v += bestVis;
  }

  if (families.has('shark') && families.has('swimmer')) {
    // Steal from highest-expected-value opponent.
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

/** Stand-in hands drawn per opponent when estimating their score. (Crediting
 *  the stand-ins extra for opponents keeping the better of each two draws
 *  made no measurable difference in eval, so they're plain random draws.) */
const OPPONENT_SAMPLES = 24;

/** Expected round score (card points + mermaid claims) of `op`: their table
 *  and the cards we know they hold, plus their unknown cards filled in with
 *  random draws from the cards we can't place. Deterministic for a given
 *  public position. */
function estimateOpponentScore(state: SspState, me: SspPlayer, op: SspPlayer, know: Knowledge): number {
  const prof = know.opponentProfiles.get(op.id);
  if (!prof) return 0;
  const opts = scoringOptsFor(state, op);
  const unknown = Math.max(0, prof.handSize - prof.knownCards.length);
  const base = [...prof.knownCards, ...op.table];
  const pool = know.unplaced;
  if (unknown === 0 || pool.length === 0) return totalScore(base, opts).total;

  const take = Math.min(unknown, pool.length);
  const rng = createRng(publicSeed(state, me, op));
  const scratch = pool.slice();
  let sum = 0;
  for (let s = 0; s < OPPONENT_SAMPLES; s++) {
    // Partial Fisher–Yates: the first `take` slots become the sample.
    for (let i = 0; i < take; i++) {
      const j = i + rngInt(rng, scratch.length - i);
      [scratch[i], scratch[j]] = [scratch[j], scratch[i]];
    }
    sum += totalScore([...base, ...scratch.slice(0, take)], opts).total;
  }
  return sum / OPPONENT_SAMPLES;
}

function estimatedOpponentMax(state: SspState, me: SspPlayer, know: Knowledge): number {
  let max = 0;
  for (const op of state.players) {
    if (op.id !== me.id) max = Math.max(max, estimateOpponentScore(state, me, op, know));
  }
  return max;
}

/** Seed from public facts only, so the estimate never depends on hidden cards. */
function publicSeed(state: SspState, me: SspPlayer, op: SspPlayer): number {
  let h = Math.imul((state.logSeq ?? 0) ^ 0x9e3779b9, 0x85ebca6b) ^ state.round;
  for (const ch of me.id + '|' + op.id) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

/** Crab target value: my gain plus a share of what leaving it would give an opponent. */
function crabNet(state: SspState, me: SspPlayer, card: SspCard, know: Knowledge): number {
  return valueOfConcreteCard(me, card, know) + 0.4 * bestOpponentValueForFamily(state, me, card.family, know);
}

/** Which pile to dig through, judged on what we remember of each: the top
 *  is certain, a buried card is discounted by the chance it was dug out
 *  unseen. Null when both piles are empty. */
function chooseCrabPile(state: SspState, me: SspPlayer, know: Knowledge): 0 | 1 | null {
  const values = know.piles.map((pile) => {
    if (pile.size === 0) return -Infinity;
    let best = pile.top ? crabNet(state, me, pile.top, know) : -Infinity;
    const stillThere = buriedStillThere(pile);
    for (const c of pile.buried) best = Math.max(best, stillThere * crabNet(state, me, c, know));
    return best;
  });
  if (values[0] === -Infinity && values[1] === -Infinity) return null;
  if (Math.abs(values[0] - values[1]) < 0.001) return tieBreakHash(state, me);
  return values[0] > values[1] ? 0 : 1;
}

/** Maximum across opponents of the marginal value `family` has for THEM. Used
 *  to bias drawFromDiscard defensively — if leaving a card on top would
 *  significantly help an opponent, we may want to take it anyway. */
function bestOpponentValueForFamily(
  state: SspState, me: SspPlayer, family: SspCardFamily, know: Knowledge,
): number {
  let best = 0;
  for (const op of state.players) {
    if (op.id === me.id) continue;
    const prof = know.opponentProfiles.get(op.id);
    if (!prof) continue;
    const v = marginalValueForOpponent(op, prof, family, know);
    best = Math.max(best, v);
  }
  return best;
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
  // Extra Salt jellyfish lock: this turn is deck-draw → keep → pass, nothing else.
  const locked = state.nextTurnLockedPlayerId === playerId;

  switch (state.subPhase) {
    case 'awaitingAction': {
      if (locked) return { type: 'drawPair' };
      // Inspect both discard tops AND each option's NET value (my gain MINUS
      // opportunity cost from leaving the card for opponents). Combine that
      // with expected unseen-draw value for the deck.
      const expDraw = expectedUnseenDrawValue(me, know);

      let bestPile: -1 | 0 | 1 = -1;
      let bestPileV = -Infinity;
      const pileValues: [number, number] = [-Infinity, -Infinity];
      for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
        const pile = state.discards[i];
        if (pile.length === 0) continue;
        const top = pile[pile.length - 1];
        // My value of taking this concrete card.
        const myV = valueOfConcreteCard(me, top, know);
        // Defensive bonus: if leaving it helps an opponent more than us, the
        // pure my-value undervalues the move. Add a fraction of the opponent's
        // gain as our gain-from-denying.
        const denyV = bestOpponentValueForFamily(state, me, top.family, know);
        const netV = myV + 0.4 * denyV;
        pileValues[i] = netV;
        if (netV > bestPileV) { bestPileV = netV; bestPile = i; }
      }
      if (bestPile !== -1
          && Math.abs(pileValues[0] - pileValues[1]) < 0.001
          && state.discards[0].length > 0
          && state.discards[1].length > 0) {
        bestPile = tieBreakHash(state, me);
      }

      // drawPair: keep best of 2 unseen ≈ 1.3 × expDraw, minus opponent demand
      // for the average forced discard. The forced discard's color matters
      // for mermaid prediction, but at the average-case level the family is
      // the dominant driver, so we estimate via expDraw × demand factor.
      const drawPairKeep = 1.3 * expDraw;
      const drawPairOpponentCost = 0.4 * expDraw;
      const drawPairNet = drawPairKeep - drawPairOpponentCost;

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
      if (locked) return { type: 'pass' };
      // 1. Play any valuable pair we can — pick the highest-value one. A pair
      // always scores ≥ 1 point so it's always worth playing.
      const pairs = findHandPairs(me);
      if (pairs.length > 0) {
        let best = pairs[0];
        let bestV = valueDuoPair(state, me, best, know);
        for (let i = 1; i < pairs.length; i++) {
          const v = valueDuoPair(state, me, pairs[i], know);
          if (v > bestV) { best = pairs[i]; bestV = v; }
        }
        return { type: 'playPair', cardIds: [best[0].id, best[1].id] };
      }

      // 2. End-turn decisions. Eligibility comes from the reducer's own rules
      // (LAST CHANCE window, lock, event-adjusted score vs threshold).
      if (!canEndRound(state)) {
        return { type: 'pass' };
      }

      const myScore = tentativeScore(me.hand, me.table, scoringOptsFor(state, me));
      const oppMax = estimatedOpponentMax(state, me, know);
      const matchTarget = state.config.targetScore;
      const myMatchLeadAfter = (me.matchScore + myScore) - Math.max(...state.players.filter((p) => p.id !== me.id).map((p) => p.matchScore));

      const stopThreshold = stopThresholdFor(state, me);
      const canStop = !eventAppliesTo(state, me, 'diodonFish');

      // End-round decision tree.
      //
      // STOP behavior (per user intent):
      //   - Ahead on ROUND points (myScore > oppMax): we want to lock in our
      //     lead and end the round before opponents catch up.
      //   - Wins the match outright (matchScore + myScore >= target): always
      //     STOP if legal.
      //   - Behind in MATCH but ahead in ROUND by a lot: still STOP to bank
      //     points.
      //
      // LAST CHANCE behavior (per user intent):
      //   - Behind on ROUND points but card-points bet is winnable (we hit
      //     threshold first; opp hasn't reached it; our color bonus would push
      //     us ahead).
      //   - Behind in MATCH and need a swing — color bonus on LAST CHANCE
      //     gives every player a bonus, but only the bet winner keeps both
      //     halves of their score, so when we have a STRONG card-points
      //     advantage but are losing the match by a lot, betting is correct.
      //
      // PASS only when we're far below threshold or all options look losing
      // and we'd rather draw another card.
      if (myScore >= stopThreshold) {
        const wouldFinishMatch = (me.matchScore + myScore) >= matchTarget;
        // STOP threshold: even a 1-point lead on the round is enough to lock in
        // (we don't want opponents getting another turn).
        const aheadOnRound = myScore > oppMax;
        const safeLead = myScore - oppMax >= 3;

        if (canStop && (wouldFinishMatch || safeLead)) {
          return { type: 'stop' };
        }

        // LAST CHANCE evaluation. The bet compares CARD POINTS only — the
        // special color bonus is paid to everyone regardless of who wins. So
        // LAST CHANCE is profitable when:
        //   - Our card-points lead AFTER opponents take their last turn is
        //     positive (we win the bet → we keep all our points + bonus,
        //     opps keep ONLY their bonus). Ties go to the caller.
        //   - OR we trail in MATCH and need to swing — even a borderline bet
        //     is justified because passing won't close the gap.
        // Be MILDLY pessimistic about the opponent's next turn — they could
        // gain 1 expected unseen draw worth of card value. We don't multiply
        // by 1.2 anymore; that was overly cautious.
        const expectedOpponentCardsAfter = oppMax + 0.9 * expectedUnseenDrawValue(me, know);
        const betWinMargin = myScore - expectedOpponentCardsAfter;

        // Adjust threshold by match-lead pressure: trailing in match → lower
        // bar; ahead in match → raise the bar (don't risk a lost bet).
        let lcThreshold = 1.5;
        if (myMatchLeadAfter < -8) lcThreshold = -2;     // way behind: gamble
        else if (myMatchLeadAfter < 0) lcThreshold = 0;  // behind: lower bar
        else if (myMatchLeadAfter > 8) lcThreshold = 4;  // way ahead: only call on clear wins

        if (betWinMargin >= lcThreshold) {
          return { type: 'lastChance' };
        }

        // STOP fallback: ahead on round but not safe-lead. Still locking in
        // is better than letting opponents continue.
        if (canStop && aheadOnRound) {
          return { type: 'stop' };
        }

        // Trailing on round AND can't win the bet → continue drawing in hope
        // of improving our position before opp ends the round.
        return { type: 'pass' };
      }

      return { type: 'pass' };
    }

    case 'awaitingCrabPick': {
      // Rulebook: choose a pile, look through it, take any card. The pile is
      // chosen from memory; only then do we see that pile as it really is.
      const pileIdx = chooseCrabPile(state, me, know);
      if (pileIdx === null) return null;
      const looking = buildKnowledge(state, playerId, pileIdx);
      let best: SspCard | null = null;
      let bestNet = -Infinity;
      for (const c of state.discards[pileIdx]) {
        const net = crabNet(state, me, c, looking);
        if (net > bestNet + 0.001) { best = c; bestNet = net; }
      }
      return best ? { type: 'crabPick', pile: pileIdx, cardId: best.id } : null;
    }

    case 'awaitingSharkSteal': {
      // Steal from the opponent whose hand has the highest expected value to
      // us. Repeat profile logic.
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
      let bestV = valueOfConcreteCard(me, best, know);
      for (let i = 1; i < pool.length; i++) {
        const v = valueOfConcreteCard(me, pool[i], know);
        if (v > bestV) { bestV = v; best = pool[i]; }
      }
      return { type: 'lobsterPick', cardId: best.id };
    }

    default:
      return null;
  }
}

// Reference exports for tests + future debugging.
export const __test__ = {
  buildKnowledge, marginalValue, chooseDiscardPile, valueDuoPair, isCollectorFamily,
  valueOfConcreteCard, bestOpponentValueForFamily, chooseCrabPile, estimateOpponentScore,
};
