// Sea Salt & Paper — observation → fixed-length feature vector.
//
// Pure function of SspObservation (never SspState), so hidden information
// can't leak in here. Layout is data-independent: every segment is written at
// a fixed size whatever the observation holds (absent opponents, empty piles
// and so on are zeros), and `featureLayout()` reports the segment table for
// the trainer and for debugging.
//
// Besides raw counts the vector carries a few derived signals — score deltas
// for acquiring each family, the unseen-card pool — because they are cheap to
// compute exactly here and slow to learn.
//
// Bump ENCODER_VERSION whenever a segment is added, removed, reordered or
// rescaled; trained weights are only valid for the version they saw.
//
// v3 appended the Extra Pepper segments after all of v2's, leaving v2's
// untouched — so a v2 network is a v3 one with zero weights on the new
// inputs (see training/ssp/upgrade.py). Every `pepper*` input is zero in a
// game without Pepper. The `pepperDecision.*` ones are only written in the
// Pepper decision subphases (Water Rodeo, Angelfish, event choice), where
// only Pepper action slots are legal: weights on them can't change any other
// decision.

import type { SspCard, SspCardFamily, SspColor, SspEventId, SspSubPhase } from '../types';
import { FAMILY_COLORS, FAMILY_ORDER, DUO_PAIRS, PAIR_TYPES, RODEO_PAIRS, buildDeck, pairTypeIndex } from '../cards';
import { specialColorBonus, tablePairs, totalScore, type CardPointsOpts } from '../scoring';
import { ALL_EVENT_IDS } from '../events';
import { buriedStillThere } from '../knowledge';
import { FAMILY_COUNT, FAMILY_INDEX, type SspObservation, type SspObservedPlayer } from './observation';

export const ENCODER_VERSION = 3;

/** Input count of encoder v2 — v3's first inputs, unchanged. */
export const V2_OBS_DIM = 632;

const MAX_OPPONENTS = 3;
const DECK_NORM = 66;
const SCORE_NORM = 20;
const MARGINAL_NORM = 5;

// v2's subphase one-hot. The Pepper decision subphases leave it empty and set
// `pepperDecision.kind` instead.
const SUBPHASE_INDEX: Partial<Record<SspSubPhase, number>> = {
  awaitingAction: 0,
  awaitingKeep: 1,
  awaitingPlayOrEnd: 2,
  awaitingCrabPick: 3,
  awaitingSharkSteal: 4,
  awaitingLobsterPick: 5,
  roundEnd: 6,
  gameOver: 7,
};
const SUBPHASE_COUNT = 8;
const PEPPER_DECISION_INDEX: Partial<Record<SspSubPhase, number>> = {
  awaitingRodeoTarget: 0,
  awaitingRodeoSwap: 1,
  awaitingPairSteal: 2,
  awaitingAngelfishPick: 3,
  awaitingEventChoice: 4,
};
const PEPPER_DECISION_COUNT = 5;

/** Segments only written in the Pepper decision subphases (see header). */
export const isPepperDecisionSegment = (name: string): boolean => name.startsWith('pepperDecision.');

const COLOR_INDEX: Record<SspColor, number> = {
  white: 0, yellow: 1, green: 2, pink: 3, purple: 4, teal: 5,
  darkblue: 6, black: 7, gray: 8, orange: 9, tan: 10,
};
const COLOR_COUNT = Object.keys(COLOR_INDEX).length;

const EVENT_COUNT = ALL_EVENT_IDS.length;
const EVENT_INDEX = new Map(ALL_EVENT_IDS.map((id, i) => [id, i]));

export interface FeatureSegment {
  name: string;
  offset: number;
  size: number;
}

class Writer {
  pos = 0;
  readonly segments: FeatureSegment[] | null;
  constructor(readonly x: Float32Array, record: boolean) {
    this.segments = record ? [] : null;
  }
  /** Reserve `size` slots and return their start offset. */
  seg(name: string, size: number): number {
    const at = this.pos;
    if (at + size > this.x.length) throw new Error(`encode: buffer too small at ${name}`);
    this.segments?.push({ name, offset: at, size });
    this.pos += size;
    return at;
  }
  scalar(name: string, v: number): void {
    this.x[this.seg(name, 1)] = v;
  }
  /** Per-family counts, each scaled by that family's copies in the deck. */
  families(name: string, cards: SspCard[], weight = 1): void {
    const o = this.seg(name, FAMILY_COUNT);
    for (const c of cards) this.x[o + FAMILY_INDEX[c.family]] += weight / FAMILY_COPIES[FAMILY_INDEX[c.family]];
  }
  colors(name: string, cards: SspCard[], weight = 1): void {
    const o = this.seg(name, COLOR_COUNT);
    for (const c of cards) this.x[o + COLOR_INDEX[c.color]] += weight / 10;
  }
  events(name: string, ids: readonly SspEventId[]): void {
    const o = this.seg(name, EVENT_COUNT);
    for (const id of ids) this.x[o + EVENT_INDEX.get(id)!] = 1;
  }
}

export function scoringOpts(p: SspObservedPlayer): CardPointsOpts {
  return {
    trioCancelledIds: new Set(p.trios.flat()),
    trios: p.trios.length,
    shellPerCard: p.rules.shellPerCard,
    octopusPerCard: p.rules.octopusPerCard,
    mermaidsScoreZero: p.rules.mermaidsScoreZero,
    waterRodeo: p.rules.waterRodeo,
  };
}

/** Score as the STOP threshold sees it (card points + mermaid claims). */
function scoreOf(cards: SspCard[], opts: CardPointsOpts): number {
  return totalScore(cards, opts).total;
}

interface DeckTotals { family: number[]; color: number[] }
const deckTotalsCache = new Map<boolean, DeckTotals>();
function deckTotals(extraSalt: boolean): DeckTotals {
  let t = deckTotalsCache.get(extraSalt);
  if (!t) {
    t = { family: new Array(FAMILY_COUNT).fill(0), color: new Array(COLOR_COUNT).fill(0) };
    for (const c of buildDeck({ extraSalt })) {
      t.family[FAMILY_INDEX[c.family]] += 1;
      t.color[COLOR_INDEX[c.color]] += 1;
    }
    deckTotalsCache.set(extraSalt, t);
  }
  return t;
}

/** Copies of each family in the full (Extra Salt) deck — the count scale. */
const FAMILY_COPIES = deckTotals(true).family;

const DISTINCT_COLORS: Record<SspCardFamily, SspColor[]> = Object.fromEntries(
  FAMILY_ORDER.map((f) => [f, [...new Set(FAMILY_COLORS[f])]]),
) as Record<SspCardFamily, SspColor[]>;

function writeFeatures(obs: SspObservation, w: Writer): void {
  const x = w.x;
  const me = obs.players[0];
  const myCards = [...obs.hand, ...me.table];
  const myOpts = scoringOpts(me);
  const myScore = scoreOf(myCards, myOpts);
  const heldColors = new Array<number>(COLOR_COUNT).fill(0);
  for (const c of myCards) heldColors[COLOR_INDEX[c.color]] += 1;

  const marginalOf = (card: SspCard): number =>
    clamp((scoreOf([...myCards, card], myOpts) - myScore) / MARGINAL_NORM, -4, 4);
  /** Value of one more `family` card, in the colour of that family the
   *  viewer already holds most of (what they'd chase for mermaid claims). */
  const familyMarginal = FAMILY_ORDER.map((f) => {
    let color: SspColor = DISTINCT_COLORS[f][0];
    for (const c of DISTINCT_COLORS[f]) {
      if (heldColors[COLOR_INDEX[c]] > heldColors[COLOR_INDEX[color]]) color = c;
    }
    return marginalOf({ id: -1, family: f, color });
  });

  // ---- global ----
  let o = w.seg('subPhase', SUBPHASE_COUNT);
  const sub = SUBPHASE_INDEX[obs.subPhase];
  if (sub !== undefined) x[o + sub] = 1;
  w.scalar('isMyTurn', obs.activeOffset === 0 ? 1 : 0);
  o = w.seg('playerCount', 3);
  x[o + clamp(obs.players.length - 2, 0, 2)] = 1;
  o = w.seg('expansions', 2);
  x[o] = obs.extraSalt ? 1 : 0;
  x[o + 1] = obs.extraPepper ? 1 : 0;
  w.scalar('round', Math.min(obs.round, 12) / 12);
  w.scalar('deckSize', obs.deckSize / DECK_NORM);
  w.scalar('deckLow', obs.deckSize < 2 ? 1 : 0);
  w.scalar('targetScore', obs.targetScore / 100);
  w.events('currentEvent', obs.currentEvent ? [obs.currentEvent] : []);

  // ---- me ----
  w.families('me.hand', obs.hand);
  w.colors('me.handColors', obs.hand);
  w.families('me.table', me.table);
  w.colors('me.allColors', myCards);
  w.scalar('me.handSize', obs.hand.length / 15);
  w.scalar('me.trios', me.trios.length / 3);
  w.scalar('me.score', myScore / SCORE_NORM);
  w.scalar('me.colorBonus', specialColorBonus(myCards) / 10);
  w.scalar('me.stopThreshold', me.rules.stopThreshold / 10);
  o = w.seg('me.canEnd', 2);
  x[o] = obs.canStop ? 1 : 0;
  x[o + 1] = obs.canLastChance ? 1 : 0;
  w.scalar('me.matchScore', me.matchScore / obs.targetScore);
  w.scalar('me.reachesTarget', me.matchScore + myScore >= obs.targetScore ? 1 : 0);
  w.scalar('me.locked', me.locked ? 1 : 0);
  w.scalar('me.isRoundStarter', obs.roundStarterOffset === 0 ? 1 : 0);
  w.scalar('me.calledLastChance', obs.lastChanceOffset === 0 ? 1 : 0);
  w.events('me.heldEvents', me.heldEvents);
  const handCounts = new Array<number>(FAMILY_COUNT).fill(0);
  for (const c of obs.hand) handCounts[FAMILY_INDEX[c.family]] += 1;
  o = w.seg('me.pairsInHand', DUO_PAIRS.length);
  const o2 = w.seg('me.triosInHand', DUO_PAIRS.length);
  const hasStarfish = handCounts[FAMILY_INDEX.starfish] > 0;
  DUO_PAIRS.forEach(([a, b], t) => {
    const na = handCounts[FAMILY_INDEX[a]];
    const nb = handCounts[FAMILY_INDEX[b]];
    const pairs = a === b ? Math.floor(na / 2) : Math.min(na, nb);
    x[o + t] = pairs / 3;
    x[o2 + t] = hasStarfish && pairs > 0 ? 1 : 0;
  });
  w.families('me.exposedHand', me.knownCards);
  o = w.seg('me.marginal', FAMILY_COUNT);
  familyMarginal.forEach((v, i) => { x[o + i] = v; });

  // ---- opponents, by seat offset ----
  for (let k = 1; k <= MAX_OPPONENTS; k++) {
    const p: SspObservedPlayer | undefined = obs.players[k];
    const tag = `opp${k}`;
    w.scalar(`${tag}.present`, p ? 1 : 0);
    w.scalar(`${tag}.isActive`, p && obs.activeOffset === k ? 1 : 0);
    w.scalar(`${tag}.handSize`, p ? p.handSize / 15 : 0);
    w.families(`${tag}.table`, p?.table ?? []);
    w.colors(`${tag}.tableColors`, p?.table ?? []);
    w.scalar(`${tag}.trios`, p ? p.trios.length / 3 : 0);
    w.families(`${tag}.knownHand`, p?.knownCards ?? []);
    w.colors(`${tag}.knownColors`, p?.knownCards ?? []);
    // Score of what we can see of them (table + known cards) — a floor on
    // their real score.
    w.scalar(`${tag}.knownScore`, p ? scoreOf([...p.table, ...p.knownCards], scoringOpts(p)) / SCORE_NORM : 0);
    w.scalar(`${tag}.matchScore`, p ? p.matchScore / obs.targetScore : 0);
    w.scalar(`${tag}.matchLead`, p ? (p.matchScore - me.matchScore) / obs.targetScore : 0);
    w.events(`${tag}.heldEvents`, p?.heldEvents ?? []);
    w.scalar(`${tag}.locked`, p?.locked ? 1 : 0);
    w.scalar(`${tag}.calledLastChance`, p && obs.lastChanceOffset === k ? 1 : 0);
    w.scalar(`${tag}.isRoundStarter`, p && obs.roundStarterOffset === k ? 1 : 0);
  }

  // ---- discard piles, as remembered ----
  for (const pi of [0, 1] as const) {
    const pile = obs.piles[pi];
    const stillThere = buriedStillThere(pile);
    w.scalar(`pile${pi}.size`, pile.size / 30);
    w.families(`pile${pi}.top`, pile.top ? [pile.top] : []);
    o = w.seg(`pile${pi}.topColor`, COLOR_COUNT);
    if (pile.top) x[o + COLOR_INDEX[pile.top.color]] = 1;
    w.families(`pile${pi}.buried`, pile.buried);
    w.scalar(`pile${pi}.unknownRemovals`, Math.min(pile.unknownRemovals, 3) / 3);
    w.scalar(`pile${pi}.lookingAt`, obs.crabLookPile === pi ? 1 : 0);
    const topV = pile.top ? marginalOf(pile.top) : 0;
    w.scalar(`pile${pi}.topMarginal`, topV);
    // Best crab target we remember, discounted for unseen digs.
    let best = pile.top ? topV : 0;
    for (const c of pile.buried) best = Math.max(best, stillThere * marginalOf(c));
    w.scalar(`pile${pi}.bestMarginal`, best);
  }

  // ---- own pending draw (ordered: keepIndex refers to it) ----
  for (const di of [0, 1] as const) {
    const c = obs.pendingDraw[di];
    o = w.seg(`draw${di}.family`, FAMILY_COUNT);
    if (c) x[o + FAMILY_INDEX[c.family]] = 1;
    o = w.seg(`draw${di}.color`, COLOR_COUNT);
    if (c) x[o + COLOR_INDEX[c.color]] = 1;
    w.scalar(`draw${di}.marginal`, c ? marginalOf(c) : 0);
  }

  // ---- own lobster reveal ----
  o = w.seg('lobster.families', FAMILY_COUNT);
  for (const c of obs.lobsterReveal) x[o + FAMILY_INDEX[c.family]] += 1 / 5;
  w.scalar('lobster.size', obs.lobsterReveal.length / 5);

  // ---- unseen pool: the deck plus whatever of opponents' hands we can't place ----
  const totals = deckTotals(obs.extraSalt);
  const seenF = new Array<number>(FAMILY_COUNT).fill(0);
  const seenC = new Array<number>(COLOR_COUNT).fill(0);
  const see = (cards: SspCard[], weight = 1) => {
    for (const c of cards) {
      seenF[FAMILY_INDEX[c.family]] += weight;
      seenC[COLOR_INDEX[c.color]] += weight;
    }
  };
  see(obs.hand);
  see(obs.pendingDraw);
  see(obs.lobsterReveal);
  for (const pile of obs.piles) {
    if (pile.top) see([pile.top]);
    see(pile.buried, buriedStillThere(pile));
  }
  for (const p of obs.players) see(p.table);
  for (let k = 1; k < obs.players.length; k++) see(obs.players[k].knownCards);
  const unseenF = totals.family.map((t, i) => Math.max(0, t - seenF[i]));
  const unseenTotal = unseenF.reduce((a, b) => a + b, 0);
  o = w.seg('unseen.families', FAMILY_COUNT);
  unseenF.forEach((u, i) => { x[o + i] = totals.family[i] ? u / totals.family[i] : 0; });
  o = w.seg('unseen.colors', COLOR_COUNT);
  totals.color.forEach((t, i) => { x[o + i] = Math.max(0, t - seenC[i]) / 10; });
  w.scalar('unseen.total', unseenTotal / DECK_NORM);
  let expected = 0;
  if (unseenTotal > 0) unseenF.forEach((u, i) => { expected += (u / unseenTotal) * familyMarginal[i]; });
  w.scalar('unseen.expectedMarginal', expected);

  writePepperFeatures(obs, w, myCards, myOpts, myScore, marginalOf);
}

/** Encoder v3's Extra Pepper segments (see the header). */
function writePepperFeatures(
  obs: SspObservation, w: Writer, mine: SspCard[], myOpts: CardPointsOpts, myScore: number,
  marginalOf: (card: SspCard) => number,
): void {
  const x = w.x;
  const me = obs.players[0];
  const scoreWithout = (ids: number[], add: SspCard[] = []) =>
    scoreOf([...mine.filter((c) => !ids.includes(c.id)), ...add], myOpts);

  // ---- every state of a Pepper game ----
  w.events('pepper.eventsLeft', obs.eventsLeft);
  let o = w.seg('pepper.coralShell', 1 + MAX_OPPONENTS);
  obs.players.forEach((p, k) => { if (k <= MAX_OPPONENTS && p.coralShell) x[o + k] = 1; });
  o = w.seg('pepper.threeMermaidsWin', 1 + MAX_OPPONENTS);
  obs.players.forEach((p, k) => { if (k <= MAX_OPPONENTS && p.rules.mermaidsToWin < 4) x[o + k] = 1; });
  w.scalar('pepper.canPlaceCoral', obs.canPlaceCoral ? 1 : 0);
  o = w.seg('pepper.rodeoPairsInHand', RODEO_PAIRS.length);
  const o2 = w.seg('pepper.rodeoTriosInHand', RODEO_PAIRS.length);
  if (me.rules.waterRodeo) {
    const hasStarfish = obs.hand.some((c) => c.family === 'starfish');
    RODEO_PAIRS.forEach(([f], t) => {
      const pairs = Math.floor(obs.hand.filter((c) => c.family === f).length / 2);
      x[o + t] = pairs / 3;
      x[o2 + t] = hasStarfish && pairs > 0 ? 1 : 0;
    });
  }

  // ---- only in the Pepper decision subphases ----
  o = w.seg('pepperDecision.kind', PEPPER_DECISION_COUNT);
  const kind = PEPPER_DECISION_INDEX[obs.subPhase];
  if (kind !== undefined && obs.activeOffset === 0) x[o + kind] = 1;

  // Water Rodeo, choosing whose hand to look at: each opponent's match lead
  // over the viewer, hand size, and whether they're the match leader.
  o = w.seg('pepperDecision.target.matchLead', MAX_OPPONENTS);
  const o4 = w.seg('pepperDecision.target.handSize', MAX_OPPONENTS);
  const o5 = w.seg('pepperDecision.target.leader', MAX_OPPONENTS);
  if (obs.subPhase === 'awaitingRodeoTarget' && obs.activeOffset === 0) {
    const opps = obs.players.slice(1, 1 + MAX_OPPONENTS);
    const top = Math.max(...opps.map((p) => p.matchScore));
    opps.forEach((p, i) => {
      x[o + i] = (p.matchScore - me.matchScore) / obs.targetScore;
      x[o4 + i] = p.handSize / 15;
      x[o5 + i] = p.matchScore === top ? 1 : 0;
    });
  }

  // Water Rodeo swap: the hand being looked at, what each kind would add,
  // the kind chosen to take (second step) and what giving each kind costs.
  const look = obs.rodeoLook;
  w.families('pepperDecision.look.families', look?.hand ?? []);
  w.colors('pepperDecision.look.colors', look?.hand ?? []);
  o = w.seg('pepperDecision.look.offset', MAX_OPPONENTS);
  if (look && look.offset >= 1 && look.offset <= MAX_OPPONENTS) x[o + look.offset - 1] = 1;
  o = w.seg('pepperDecision.look.takeGain', FAMILY_COUNT);
  bestPerFamily(look?.hand ?? [], marginalOf, Math.max).forEach((v, i) => { x[o + i] = v; });
  o = w.seg('pepperDecision.swap.take', FAMILY_COUNT);
  if (look && obs.rodeoTake) x[o + FAMILY_INDEX[obs.rodeoTake]] = 1;
  o = w.seg('pepperDecision.swap.giveLoss', FAMILY_COUNT);
  if (look) {
    const taken = look.hand.filter((c) => c.family === obs.rodeoTake).slice(0, 1);
    const loss = (c: SspCard) => clamp((myScore - scoreWithout([c.id], taken)) / MARGINAL_NORM, -4, 4);
    bestPerFamily(obs.hand, loss, Math.min).forEach((v, i) => { x[o + i] = v; });
  }

  // Water Rodeo shark pair: each opponent's pairs by type, and what the best
  // of each would add to the viewer's score.
  o = w.seg('pepperDecision.steal.pairs', MAX_OPPONENTS * PAIR_TYPES.length);
  const o3 = w.seg('pepperDecision.steal.gain', MAX_OPPONENTS * PAIR_TYPES.length);
  if (obs.subPhase === 'awaitingPairSteal' && obs.activeOffset === 0) {
    for (let k = 1; k <= MAX_OPPONENTS && k < obs.players.length; k++) {
      const p = obs.players[k];
      for (const pair of tablePairs(p.table, p.trios)) {
        const t = pairTypeIndex(pair[0].family, pair[1].family);
        if (t === -1) continue;
        const at = (k - 1) * PAIR_TYPES.length + t;
        x[o + at] += 1 / 2;
        x[o3 + at] = Math.max(x[o3 + at], clamp((scoreWithout([], pair) - myScore) / MARGINAL_NORM, -4, 4));
      }
    }
  }

  // Event choice: the card just won and the one already held.
  w.events('pepperDecision.choice.new', obs.eventChoice ? [obs.eventChoice.newEventId] : []);
  w.events('pepperDecision.choice.old', obs.eventChoice ? [obs.eventChoice.oldEventId] : []);
}

/** Per family (FAMILY_ORDER), the best of `value` over the cards of that family; 0 where there are none. */
function bestPerFamily(cards: SspCard[], value: (c: SspCard) => number, pick: (a: number, b: number) => number): number[] {
  const out = new Array<number | undefined>(FAMILY_COUNT);
  for (const c of cards) {
    const i = FAMILY_INDEX[c.family];
    const v = value(c);
    out[i] = out[i] === undefined ? v : pick(out[i]!, v);
  }
  return Array.from(out, (v) => v ?? 0);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const PLACEHOLDER_OBS: SspObservation = {
  viewerId: 'a', targetScore: 40, extraSalt: false, extraPepper: false, round: 1,
  phase: 'playing', subPhase: 'awaitingAction', activeOffset: 0, roundStarterOffset: 0,
  lastChanceOffset: null, deckSize: 0, hand: [], pendingDraw: [],
  piles: [{ top: null, size: 0, buried: [], unknownRemovals: 0 }, { top: null, size: 0, buried: [], unknownRemovals: 0 }],
  crabLookPile: null, lobsterReveal: [], currentEvent: null, canStop: false, canLastChance: false,
  crabPiles: [], canPlaceCoral: false, eventChoice: null, rodeoLook: null, rodeoTake: null, eventsLeft: [],
  players: ['a', 'b'].map((id) => ({
    id, handSize: 0, table: [], trios: [], heldEvents: [], matchScore: 0, knownCards: [],
    rules: { shellPerCard: false, octopusPerCard: false, mermaidsScoreZero: false, waterRodeo: false, stopThreshold: 7, mermaidsToWin: 4 },
    locked: false, coralShell: false,
  })),
};

const LAYOUT: FeatureSegment[] = (() => {
  const w = new Writer(new Float32Array(4096), true);
  writeFeatures(PLACEHOLDER_OBS, w);
  return w.segments!;
})();

export const OBS_DIM = LAYOUT.reduce((n, s) => n + s.size, 0);

export function featureLayout(): readonly FeatureSegment[] {
  return LAYOUT;
}

/** Encode into `out` (reused if given; must be OBS_DIM long). */
export function encodeObservation(obs: SspObservation, out?: Float32Array): Float32Array {
  const x = out ?? new Float32Array(OBS_DIM);
  if (x.length !== OBS_DIM) throw new Error(`encode: expected buffer of ${OBS_DIM}, got ${x.length}`);
  x.fill(0);
  const w = new Writer(x, false);
  writeFeatures(obs, w);
  if (w.pos !== OBS_DIM) throw new Error(`encode: wrote ${w.pos} features, layout has ${OBS_DIM}`);
  return x;
}
