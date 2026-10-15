// Sea Salt & Paper — observation → fixed-length feature vector.
//
// Pure function of SspObservation (never SspState), so hidden information
// can't leak in here. Layout is data-independent: every segment is written at
// a fixed size whatever the observation holds (absent opponents, empty piles
// and so on are zeros), and `featureLayout()` reports the segment table for
// the trainer and for debugging.
//
// Besides raw counts the vector carries a few derived signals the heuristic
// AI also leans on — score deltas for acquiring each family, the unseen-card
// pool — because they are cheap to compute exactly here and slow to learn.
//
// Bump ENCODER_VERSION whenever a segment is added, removed, reordered or
// rescaled; trained weights are only valid for the version they saw.

import type { SspCard, SspCardFamily, SspColor, SspEventId, SspSubPhase } from '../types';
import { FAMILY_COLORS, FAMILY_ORDER, DUO_PAIRS, buildDeck } from '../cards';
import { specialColorBonus, totalScore, type CardPointsOpts } from '../scoring';
import { ALL_EVENT_IDS } from '../events';
import { buriedStillThere } from '../knowledge';
import { FAMILY_COUNT, FAMILY_INDEX, type SspObservation, type SspObservedPlayer } from './observation';

export const ENCODER_VERSION = 2;

const MAX_OPPONENTS = 3;
const DECK_NORM = 66;
const SCORE_NORM = 20;
const MARGINAL_NORM = 5;

const SUBPHASE_INDEX: Record<SspSubPhase, number> = {
  awaitingAction: 0,
  awaitingKeep: 1,
  awaitingPlayOrEnd: 2,
  awaitingCrabPick: 3,
  awaitingSharkSteal: 4,
  awaitingLobsterPick: 5,
  roundEnd: 6,
  gameOver: 7,
};
const SUBPHASE_COUNT = Object.keys(SUBPHASE_INDEX).length;

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

function scoringOpts(p: SspObservedPlayer): CardPointsOpts {
  return {
    trioCancelledIds: new Set(p.trios.flat()),
    trios: p.trios.length,
    shellPerCard: p.rules.shellPerCard,
    octopusPerCard: p.rules.octopusPerCard,
    mermaidsScoreZero: p.rules.mermaidsScoreZero,
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
  x[o + SUBPHASE_INDEX[obs.subPhase]] = 1;
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
  players: ['a', 'b'].map((id) => ({
    id, handSize: 0, table: [], trios: [], heldEvents: [], matchScore: 0, knownCards: [],
    rules: { shellPerCard: false, octopusPerCard: false, mermaidsScoreZero: false, stopThreshold: 7 },
    locked: false,
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
