// Sea Salt & Paper AI — heuristic, single difficulty.
//
// Approach
// --------
// Maintain a perfect-memory model of everything that's publicly observable:
//
//   - Per-family unseen count: total deck − everything currently visible (own
//     hand + every player's table + all cards still in either discard pile,
//     including BURIED cards — buried cards are still in the pile array even
//     though the UI only shows the top).
//   - Per-color unseen count: same accounting, used for mermaid bonus
//     prediction (a color we can see is "spent" toward our top group; a color
//     we still need is more likely to be drawn live).
//   - Per-opponent demand profile: every time an opponent takes a face-up card
//     (drawDiscard / crabPick / sharkSteal / lobsterPick / angelfishDraw) we
//     record the family + ALSO the specific card id (so we know exactly what
//     color they hold and which color groups they're building toward).
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
//   - Crab: pick the card with the highest NET (my gain − best opponent gain
//     if we left it on top).
//   - STOP / LAST CHANCE: based on card-points bet evaluation + match-lead
//     pressure.

import type { PlayerId } from '@/core/types';
import type { SspState, SspAction, SspCard, SspCardFamily, SspColor, SspPlayer, SspLogEntry } from './types';
import { FAMILY, FAMILY_ORDER, FAMILY_COLORS, duoPartner, isCollectorFamily, isDuoFamily } from './cards';
import {
  collectorPoints, isValidDuoPair, mermaidColorBonus, specialColorBonus, tentativeScore, totalScore,
} from './scoring';

const STOP_THRESHOLD = 7;

interface Knowledge {
  /** Cards we can see (own hand + tables + every card still in either discard
   *  pile + pendingDraw if we're acting). */
  seenIds: Set<number>;
  /** Per-family count of unseen cards (still in deck OR in opponents' hands). */
  unseenByFamily: Map<SspCardFamily, number>;
  /** Per-color count of unseen cards. */
  unseenByColor: Map<SspColor, number>;
  /** Total unseen cards. */
  unseenTotal: number;
  /** Per-opponent inferred hand size + observed acquisitions. */
  opponentProfiles: Map<PlayerId, OpponentProfile>;
}

interface OpponentProfile {
  /** Families we've seen them deliberately pick up from face-up sources
   *  (drawFromDiscard, crabPick, sharkSteal, lobsterPick, angelfishDraw).
   *  Strong signal of what they're building. */
  knownTaken: Partial<Record<SspCardFamily, number>>;
  /** Specific card ids we know they hold (from face-up acquisitions where we
   *  can identify the exact card — e.g. drawDiscard tells us they took the
   *  exact card we last saw on the pile top). */
  knownCardIds: Set<number>;
  /** Hand size at the moment we built knowledge. */
  handSize: number;
  /** How many distinct times they pulled this family from a discard pile.
   *  Used for defensive blocking — repeated picks of the same family are a
   *  much stronger signal than a one-off. */
  discardPullsByFamily: Partial<Record<SspCardFamily, number>>;
}

/** Build a snapshot of everything the AI knows publicly. Perfect memory of all
 *  public information: cards still in piles (including buried), every card in
 *  own hand, every card on every table, and per-opponent acquisition history. */
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
  const seenByColor: Record<SspColor, number> = {
    white: 0, yellow: 0, green: 0, pink: 0, purple: 0,
    teal: 0, darkblue: 0, black: 0, gray: 0, orange: 0, tan: 0,
  };

  // Total color distribution of the FULL deck (Salt-aware).
  const extraSalt = !!state.config.expansions?.extraSalt;
  const totalByColor: Record<SspColor, number> = {
    white: 0, yellow: 0, green: 0, pink: 0, purple: 0,
    teal: 0, darkblue: 0, black: 0, gray: 0, orange: 0, tan: 0,
  };
  for (const f of FAMILY_ORDER) {
    if (FAMILY[f].expansion === 'extraSalt' && !extraSalt) continue;
    const palette = FAMILY_COLORS[f];
    const count = FAMILY[f].count;
    for (let i = 0; i < count; i++) {
      const color = palette[i % palette.length] ?? 'darkblue';
      totalByColor[color] += 1;
    }
  }

  const accum = (cards: SspCard[]) => {
    for (const c of cards) {
      seenByFamily[c.family] += 1;
      seenByColor[c.color] += 1;
    }
  };
  accum(me.hand);
  for (const p of state.players) accum(p.table);
  for (const pile of state.discards) accum(pile);
  if (state.activePlayerId === meId) accum(state.pendingDraw);

  // Cards we know specific opponents are holding (face-up acquisitions) — also
  // count those colors as seen even though the card has left the pile and
  // returned to a private hand. They're known facts and shouldn't be double-
  // counted in unseen tallies.
  //
  // IMPORTANT: scope the log walk to the CURRENT round only. Cards acquired
  // in prior rounds were shuffled back into the deck at round start and are
  // no longer in any hand. Walking the full log (a) double-counts those cards
  // (the deck is fresh) and (b) scales with game length, which is the dominant
  // cost of the AI's per-action time by round 5+.
  const currentRound = state.round;
  const currentLog = (state.log ?? []).filter((e) => e.round === currentRound);
  for (const e of currentLog) {
    if (e.kind !== 'drawDiscard' && e.kind !== 'crabPick'
        && e.kind !== 'sharkSteal' && e.kind !== 'lobsterPick'
        && e.kind !== 'angelfishDraw') continue;
    seenByFamily[(e as { family: SspCardFamily }).family] += 1;
  }

  const unseenByFamily = new Map<SspCardFamily, number>();
  let unseenTotal = 0;
  for (const f of FAMILY_ORDER) {
    const u = Math.max(0, totalByFamily[f] - seenByFamily[f]);
    unseenByFamily.set(f, u);
    unseenTotal += u;
  }
  const unseenByColor = new Map<SspColor, number>();
  for (const c of [
    'white', 'yellow', 'green', 'pink', 'purple', 'teal', 'darkblue', 'black', 'gray', 'orange', 'tan',
  ] as SspColor[]) {
    unseenByColor.set(c, Math.max(0, totalByColor[c] - seenByColor[c]));
  }

  const opponentProfiles = new Map<PlayerId, OpponentProfile>();
  for (const p of state.players) {
    if (p.id === meId) continue;
    opponentProfiles.set(p.id, {
      knownTaken: {},
      knownCardIds: new Set<number>(),
      handSize: p.hand.length,
      discardPullsByFamily: {},
    });
  }
  // Same scoping as above — opponent profile reflects what they're holding
  // THIS round, not cumulative cards across the whole match.
  for (const e of currentLog) {
    const fam = familyFromLogEntry(e);
    if (!fam) continue;
    const pid = (e as { playerId?: PlayerId }).playerId;
    if (!pid || pid === meId) continue;
    const prof = opponentProfiles.get(pid);
    if (!prof) continue;
    prof.knownTaken[fam] = (prof.knownTaken[fam] ?? 0) + 1;
    if (e.kind === 'drawDiscard' || e.kind === 'crabPick') {
      prof.discardPullsByFamily[fam] = (prof.discardPullsByFamily[fam] ?? 0) + 1;
    }
  }

  return { seenIds: seen, unseenByFamily, unseenByColor, unseenTotal, opponentProfiles };
}

/** Pull the family out of a log entry if it represents a card acquisition by a
 *  specific player from a public source (so we know exactly what they took). */
function familyFromLogEntry(e: SspLogEntry): SspCardFamily | null {
  switch (e.kind) {
    case 'drawDiscard':    return e.family;
    case 'crabPick':       return e.family;
    case 'sharkSteal':     return e.family;
    case 'lobsterPick':    return e.family;
    case 'angelfishDraw':  return e.family;
    default: return null;
  }
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

/** Marginal value the family would have for OPPONENT `op`. Uses their
 *  knownTaken profile as their virtual hand. */
function marginalValueForOpponent(
  op: SspPlayer, profile: OpponentProfile, family: SspCardFamily, know: Knowledge,
): number {
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
    // Crab/lobster lets us reach into a discard pile. Find the SPECIFIC card
    // (across all visible cards in both piles) with the highest value to us.
    let bestVis = 0;
    for (const pile of state.discards) {
      for (const c of pile) {
        bestVis = Math.max(bestVis, valueOfConcreteCard(me, c, know));
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

function biggestOpponentScore(state: SspState, meId: PlayerId): number {
  let max = 0;
  for (const p of state.players) {
    if (p.id === meId) continue;
    max = Math.max(max, tentativeScore(p.hand, p.table));
  }
  return max;
}

function biggestOpponentCardScore(state: SspState, meId: PlayerId): number {
  let max = 0;
  for (const p of state.players) {
    if (p.id === meId) continue;
    const sc = totalScore([...p.hand, ...p.table]);
    max = Math.max(max, sc.cardPoints);
  }
  return max;
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

  switch (state.subPhase) {
    case 'awaitingAction': {
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

      // 2. End-turn decisions.
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
        const myCards = totalScore([...me.hand, ...me.table]).cardPoints;
        const oppMaxCards = biggestOpponentCardScore(state, me.id);
        // Be MILDLY pessimistic about the opponent's next turn — they could
        // gain 1 expected unseen draw worth of card value. We don't multiply
        // by 1.2 anymore; that was overly cautious.
        const expectedOpponentCardsAfter = oppMaxCards + 0.9 * expectedUnseenDrawValue(me, know);
        const betWinMargin = myCards - expectedOpponentCardsAfter;

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
      // Pick the visible card whose NET value (my gain + denial bonus) is
      // highest. Crab digs into ANY visible card in either pile, so we have
      // perfect choice — we use concrete card identity (family + color), not
      // just family aggregates.
      type Cand = { card: SspCard; pile: 0 | 1; net: number };
      const candidates: Cand[] = [];
      for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
        const pile = state.discards[i];
        for (const c of pile) {
          const myV = valueOfConcreteCard(me, c, know);
          const denyV = bestOpponentValueForFamily(state, me, c.family, know);
          const net = myV + 0.4 * denyV;
          candidates.push({ card: c, pile: i, net });
        }
      }
      if (candidates.length === 0) return null;
      let bestNet = -Infinity;
      for (const c of candidates) if (c.net > bestNet) bestNet = c.net;
      const top = candidates.filter((x) => Math.abs(x.net - bestNet) < 0.001);
      const pick = top[tieBreakHash(state, me) % top.length];
      return { type: 'crabPick', pile: pick.pile, cardId: pick.card.id };
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
  valueOfConcreteCard, bestOpponentValueForFamily,
};
