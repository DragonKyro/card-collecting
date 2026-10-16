// Sushi Go! Party — observation → fixed-length feature vector (encoder v1).
//
// Pure function of SushiGoObservation (never SushiGoState), so hidden
// information can't leak in here. The layout is data-independent: every
// segment is written at a fixed size whatever the observation holds (absent
// players, empty tables and so on are zeros), and `featureLayout()` reports
// the segment table for the trainer and for debugging.
//
// Cards are described by FACE (faces.ts: kind + scoring variant, 37). A card
// set is one number per face, the fraction of that face's copies; tables
// count what each card scores as (a special order as its copy, flipped cards
// separately).
//
// Seats are encoded by role rather than one slot per seat, so a network
// trained at 2 players reads the same features at 3–8:
//   me      hand, table, desserts, scores, and what one more card of each
//           face is worth (and what flipping one is worth).
//   left    offset 1 — gets the viewer's hand next: their table, their known
//           hand, and what each face is worth to THEM (what a pass hands over).
//   right   offset n−1 — passes the viewer its next hand: their table and, if
//           known, that hand. At 2 players left and right are the same seat.
//   opps    every opponent pooled: the races that score by rank (maki,
//           temaki, uramaki, pudding), edamame and soy-sauce competition,
//           score margins, and all opponent hands the viewer has seen.
//   unseen  the round's cards the viewer can't place (unseen hands + deck).
//   decision  the viewer's current choice and the cards it is between.
//
// Worth ("marginal") is the change in a player's round score plus projected
// dessert score from one more card, as Δ / MARGINAL_NORM clamped to ±4. It is
// myopic (majorities as they stand now) but exact, and slow to learn.
//
// Bump ENCODER_VERSION whenever a segment is added, removed, reordered or
// rescaled, or the face list changes; trained weights are only valid for the
// version they saw.

import type { SushiGoCard, SushiGoCardKind, SushiGoPlayer } from '../types';
import { ALL_KINDS, KIND_INFO, dessertsForRound, roundCards } from '../cards';
import {
  scoreRound, roundProbe, scoreDesserts, totalRoundScore, effectiveCard, uramakiIcons, distinctColors, biggestColorSet,
} from '../scoring';
import { bonusCard } from '../reducer';
import { FACES, FACE_COUNT, FACE_COPIES, faceIndex, menuFaces } from './faces';
import type { SushiGoDecision, SushiGoObservation, SushiGoObservedPlayer } from './observation';

export const ENCODER_VERSION = 1;

const MAX_PLAYERS = 8;
const SCORE_NORM = 20;
const MATCH_NORM = 60;
const MARGINAL_NORM = 5;
const HAND_NORM = 10;
const POOL_NORM = 60;
const DESSERT_COPIES = 15;

const DECISIONS: readonly SushiGoDecision['type'][] = ['pick', 'copy', 'spoon', 'spoonGive', 'menu', 'takeout'];
const KIND_INDEX = new Map(ALL_KINDS.map((k, i) => [k, i]));

export interface FeatureSegment {
  name: string;
  offset: number;
  size: number;
}

/** A versioned observation encoder; a policy file names the one it was trained with. */
export interface SushiGoEncoder {
  version: number;
  dim: number;
  layout: readonly FeatureSegment[];
  encode(obs: SushiGoObservation, out?: Float32Array): Float32Array;
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
  values(name: string, v: ArrayLike<number>): void {
    const o = this.seg(name, v.length);
    for (let i = 0; i < v.length; i++) this.x[o + i] = v[i];
  }
  /** Per-face counts, each scaled by that face's copies. */
  faces(name: string, cards: readonly SushiGoCard[]): void {
    const o = this.seg(name, FACE_COUNT);
    for (const c of cards) {
      const f = faceIndex(c);
      this.x[o + f] += 1 / FACE_COPIES[f];
    }
  }
  oneHot(name: string, size: number, index: number): void {
    const o = this.seg(name, size);
    if (index >= 0 && index < size) this.x[o + index] = 1;
  }
}

/** A seat in the shape the scoring functions take (hands never matter to scoring). */
function asPlayer(p: SushiGoObservedPlayer): SushiGoPlayer {
  return {
    id: p.id, hand: [], table: p.table, dessertPile: p.dessertPile, pendingPick: null, pendingSpoon: false,
    uramakiPoints: p.uramakiPoints, scoreByRound: p.scoreByRound, dessertScore: 0,
  };
}

const isDessert = (kind: SushiGoCardKind) => KIND_INFO[kind].category === 'dessert';

/** Desserts a player will score at match end: their pile plus this round's face-up desserts. */
function dessertsOf(p: SushiGoPlayer): SushiGoCard[] {
  return [...p.dessertPile, ...p.table.map(effectiveCard).filter((c) => !c.flipped && isDessert(c.kind))];
}

/** `players[i]`'s projected dessert score. */
function dessertWorth(players: SushiGoPlayer[], i: number): number {
  return scoreDesserts(players.map((p) => ({ ...p, dessertPile: dessertsOf(p) })))[players[i].id];
}

/** What one more card of each menu face adds to `players[i]`'s round score
 *  plus projected dessert score (only a dessert can move the latter). */
function marginals(players: SushiGoPlayer[], nextPlace: number, i: number, faces: number[]): Float32Array {
  const out = new Float32Array(FACE_COUNT);
  const round = roundProbe(players, i, nextPlace);
  const round0 = round(players[i].table);
  const dessert0 = dessertWorth(players, i);
  const probe = players.slice();
  for (const f of faces) {
    const face = FACES[f];
    const card: SushiGoCard = { id: -1, kind: face.kind, ...(face.variant !== undefined ? { variant: face.variant } : {}) };
    const table = [...players[i].table, card];
    probe[i] = { ...players[i], table };
    const gain = round(table) - round0 + (isDessert(face.kind) ? dessertWorth(probe, i) - dessert0 : 0);
    out[f] = clamp(gain / MARGINAL_NORM, -4, 4);
  }
  return out;
}

/** What flipping one face-up card of each face on `players[i]`'s table adds (the 2 included). */
function flipGains(players: SushiGoPlayer[], nextPlace: number, i: number): Float32Array {
  const out = new Float32Array(FACE_COUNT);
  const round = roundProbe(players, i, nextPlace);
  const table = players[i].table;
  const round0 = round(table);
  const dessert0 = dessertWorth(players, i);
  const probe = players.slice();
  const done = new Set<number>();
  for (let k = table.length - 1; k >= 0; k--) {
    const e = effectiveCard(table[k]);
    if (e.flipped) continue;
    const f = faceIndex(e);
    if (done.has(f)) continue;
    done.add(f);
    const flipped = table.slice();
    flipped[k] = { ...table[k], flipped: true };
    probe[i] = { ...players[i], table: flipped };
    const gain = round(flipped) - round0 + (isDessert(e.kind) ? dessertWorth(probe, i) - dessert0 : 0);
    out[f] = clamp(gain / MARGINAL_NORM, -4, 4);
  }
  return out;
}

interface Stats {
  live: SushiGoCard[];
  flipped: number;
  openWasabi: number;
  maki: number;
  uramaki: number;
  temaki: number;
  colors: number;
  biggestColor: number;
  chopsticks: boolean;
  spoon: boolean;
  edamame: boolean;
  pudding: number;
  iceCream: number;
  fruit: [number, number, number];
  roundScore: number;
  dessertScore: number;
  matchScore: number;
}

function statsOf(players: SushiGoPlayer[], nextPlace: number): Stats[] {
  const round = scoreRound(players, nextPlace);
  const desserts = scoreDesserts(players.map((p) => ({ ...p, dessertPile: dessertsOf(p) })));
  return players.map((p) => {
    const table = p.table.map(effectiveCard);
    const live = table.filter((c) => !c.flipped);
    let openWasabi = 0;
    for (const c of table) {
      if (c.kind === 'wasabi' && !c.flipped) openWasabi += 1;
      else if (c.kind === 'nigiri' && openWasabi > 0) openWasabi -= 1;
    }
    const count = (kind: SushiGoCardKind, cards = live) => cards.filter((c) => c.kind === kind).length;
    const sweets = dessertsOf(p).map(effectiveCard);
    const fruit: [number, number, number] = [0, 0, 0];
    for (const c of sweets) {
      if (c.kind !== 'fruit') continue;
      for (const ch of c.variant ?? '') fruit['WPO'.indexOf(ch)] += 1;
    }
    return {
      live,
      flipped: table.length - live.length,
      openWasabi,
      maki: live.filter((c) => c.kind === 'maki').reduce((s, c) => s + Number(c.variant ?? 1), 0),
      uramaki: uramakiIcons(p),
      temaki: count('temaki'),
      colors: distinctColors(live),
      biggestColor: biggestColorSet(live),
      chopsticks: bonusCard(p, 'chopsticks') !== undefined,
      spoon: bonusCard(p, 'spoon') !== undefined,
      edamame: count('edamame') > 0,
      pudding: count('pudding', sweets),
      iceCream: count('greenTeaIceCream', sweets),
      fruit,
      roundScore: totalRoundScore(round[p.id]),
      dessertScore: desserts[p.id],
      matchScore: p.scoreByRound.reduce((s, x) => s + x, 0),
    };
  });
}

/** One seat's public state. Absent seats (`p` null) write zeros of the same size. */
function writePlayer(w: Writer, tag: string, p: SushiGoObservedPlayer | null, s: Stats | null): void {
  w.scalar(`${tag}.present`, p ? 1 : 0);
  w.faces(`${tag}.table`, s?.live ?? []);
  w.scalar(`${tag}.flipped`, s ? s.flipped / 6 : 0);
  w.scalar(`${tag}.openWasabi`, s ? s.openWasabi / 3 : 0);
  w.scalar(`${tag}.makiIcons`, s ? s.maki / 12 : 0);
  w.scalar(`${tag}.uramakiIcons`, s ? s.uramaki / 10 : 0);
  w.scalar(`${tag}.uramakiPoints`, p ? p.uramakiPoints / 8 : 0);
  w.scalar(`${tag}.temaki`, s ? s.temaki / 6 : 0);
  w.scalar(`${tag}.colors`, s ? s.colors / 10 : 0);
  w.scalar(`${tag}.biggestColorSet`, s ? s.biggestColor / 10 : 0);
  w.scalar(`${tag}.chopsticks`, s?.chopsticks ? 1 : 0);
  w.scalar(`${tag}.spoon`, s?.spoon ? 1 : 0);
  w.scalar(`${tag}.pudding`, s ? s.pudding / 10 : 0);
  w.scalar(`${tag}.iceCream`, s ? s.iceCream / 8 : 0);
  w.scalar(`${tag}.iceCreamTowardSet`, s ? (s.iceCream % 4) / 3 : 0);
  w.values(`${tag}.fruitIcons`, s ? s.fruit.map((n) => n / 10) : [0, 0, 0]);
  w.scalar(`${tag}.roundScore`, s ? clamp(s.roundScore / SCORE_NORM, -4, 4) : 0);
  w.scalar(`${tag}.dessertScore`, s ? clamp(s.dessertScore / SCORE_NORM, -4, 4) : 0);
  w.scalar(`${tag}.matchScore`, s ? s.matchScore / MATCH_NORM : 0);
  w.scalar(`${tag}.handSize`, p ? p.handSize / HAND_NORM : 0);
  w.scalar(`${tag}.submitted`, p?.submitted ? 1 : 0);
}

/** Non-dessert cards of a round, per face (the same every round of a match). */
const poolCache = new Map<string, readonly number[]>();
function roundPool(menu: readonly SushiGoCardKind[], specialOrdersKept: number): readonly number[] {
  const key = `${menu.join(',')}|${specialOrdersKept}`;
  let pool = poolCache.get(key);
  if (!pool) {
    const counts = new Array<number>(FACE_COUNT).fill(0);
    for (const c of roundCards([...menu], 1, specialOrdersKept)) counts[faceIndex(c)] += 1;
    pool = counts;
    if (poolCache.size > 256) poolCache.clear();
    poolCache.set(key, pool);
  }
  return pool;
}

/** Cards of the round the viewer can't place, per face, in fractions of that face's copies.
 *  Desserts: the round's dessert count is public (schedule minus dessert
 *  piles), but which fruit pairs went in isn't, so those are spread pro rata. */
function unseenPool(obs: SushiGoObservation): { faces: Float32Array; total: number } {
  const n = obs.playerCount;
  const pool = new Array<number>(FACE_COUNT).fill(0);
  const seen = new Array<number>(FACE_COUNT).fill(0);
  const piles = obs.players.flatMap((p) => p.dessertPile);
  const specialOrdersKept = piles.filter((c) => c.kind === 'specialOrder').length;
  roundPool(obs.menu, specialOrdersKept).forEach((k, i) => { pool[i] = k; });

  const roundSeen: SushiGoCard[] = [
    ...obs.hand,
    ...obs.players.slice(1).flatMap((p) => p.knownHand ?? []),
    ...obs.players.flatMap((p) => p.table),
    ...obs.discards,
    ...(obs.decision?.type === 'menu' ? obs.decision.drawn : []),
  ];
  for (const c of roundSeen) seen[faceIndex(c)] += 1;

  const dessert = obs.menu.find(isDessert);
  if (dessert) {
    let added = 0;
    for (let r = 1; r <= obs.round; r++) added += dessertsForRound(n, r);
    const pileDesserts = piles.filter((c) => isDessert(c.kind));
    const inRound = Math.min(DESSERT_COPIES, added) - pileDesserts.length;
    const seenInRound = roundSeen.filter((c) => isDessert(c.kind)).length;
    const unseenInRound = Math.max(0, inRound - seenInRound);
    // Copies of each dessert face not seen anywhere this match.
    const gone = new Array<number>(FACE_COUNT).fill(0);
    for (const c of pileDesserts) gone[faceIndex(c)] += 1;
    const left = FACES.map((f, i) => (f.kind === dessert ? Math.max(0, FACE_COPIES[i] - gone[i] - seen[i]) : 0));
    const leftTotal = left.reduce((a, b) => a + b, 0);
    left.forEach((l, i) => {
      if (l > 0) pool[i] = seen[i] + (leftTotal > 0 ? (l * unseenInRound) / leftTotal : 0);
    });
  }

  const faces = new Float32Array(FACE_COUNT);
  let total = 0;
  for (let i = 0; i < FACE_COUNT; i++) {
    const u = Math.max(0, pool[i] - seen[i]);
    faces[i] = u / FACE_COPIES[i];
    total += u;
  }
  return { faces, total };
}

function writeFeatures(obs: SushiGoObservation, w: Writer): void {
  const n = obs.playerCount;
  const players = obs.players.map(asPlayer);
  const stats = statsOf(players, obs.uramakiNextPlace);
  const faces = menuFaces(obs.menu);
  const me = obs.players[0];
  const leftIdx = n > 1 ? 1 : -1;
  const rightIdx = n > 1 ? n - 1 : -1;
  const decision = obs.decision;

  // ---- global ----
  w.oneHot('decision', DECISIONS.length, decision ? DECISIONS.indexOf(decision.type) : -1);
  w.oneHot('playerCount', MAX_PLAYERS - 1, n - 2);
  w.scalar('round', obs.round / obs.rounds);
  w.scalar('roundsLeft', (obs.rounds - obs.round) / 4);
  w.scalar('lastRound', obs.round >= obs.rounds ? 1 : 0);
  w.scalar('passes', obs.dealtHandSize > 0 ? obs.passes / obs.dealtHandSize : 0);
  w.scalar('dealtHandSize', obs.dealtHandSize / HAND_NORM);
  w.scalar('picksLeft', obs.hand.length / HAND_NORM);
  w.scalar('deckSize', obs.deckSize / POOL_NORM);
  const menu = w.seg('menu', ALL_KINDS.length);
  for (const k of obs.menu) w.x[menu + KIND_INDEX.get(k)!] = 1;
  w.oneHot('uramakiNextPlace', 4, obs.uramakiNextPlace);
  let added = 0;
  let coming = 0;
  for (let r = 1; r <= obs.rounds; r++) {
    if (r <= obs.round) added += dessertsForRound(n, r);
    else coming += dessertsForRound(n, r);
  }
  w.scalar('dessertsToCome', Math.max(0, Math.min(coming, DESSERT_COPIES - added)) / DESSERT_COPIES);
  w.scalar('canChopsticks', decision?.type === 'pick' && decision.canChopsticks ? 1 : 0);
  w.scalar('canSpoon', decision?.type === 'pick' && decision.canSpoon ? 1 : 0);

  // ---- me ----
  w.faces('me.hand', obs.hand);
  writePlayer(w, 'me', me, stats[0]);
  w.values('me.marginal', marginals(players, obs.uramakiNextPlace, 0, faces));
  w.values('me.flipGain', flipGains(players, obs.uramakiNextPlace, 0));

  // ---- left neighbour: gets my hand next ----
  const left = leftIdx >= 0 ? obs.players[leftIdx] : null;
  writePlayer(w, 'left', left, leftIdx >= 0 ? stats[leftIdx] : null);
  w.scalar('left.handKnown', left?.knownHand ? 1 : 0);
  w.faces('left.knownHand', left?.knownHand ?? []);
  w.values('left.marginal', leftIdx >= 0
    ? marginals(players, obs.uramakiNextPlace, leftIdx, faces) : new Float32Array(FACE_COUNT));

  // ---- right neighbour: passes me my next hand ----
  const right = rightIdx >= 0 ? obs.players[rightIdx] : null;
  writePlayer(w, 'right', right, rightIdx >= 0 ? stats[rightIdx] : null);
  w.scalar('right.handKnown', right?.knownHand ? 1 : 0);
  w.faces('right.knownHand', right?.knownHand ?? []);

  // ---- every opponent, pooled ----
  const opps = stats.slice(1);
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const min = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);
  const maki = opps.map((s) => s.maki).sort((a, b) => b - a);
  w.scalar('opps.count', (n - 1) / (MAX_PLAYERS - 1));
  w.scalar('opps.maxMaki', (maki[0] ?? 0) / 12);
  w.scalar('opps.secondMaki', (maki[1] ?? 0) / 12);
  w.scalar('opps.maxUramaki', max(opps.map((s) => s.uramaki)) / 10);
  w.scalar('opps.maxTemaki', max(opps.map((s) => s.temaki)) / 6);
  w.scalar('opps.minTemaki', min(opps.map((s) => s.temaki)) / 6);
  w.scalar('opps.maxPudding', max(opps.map((s) => s.pudding)) / 10);
  w.scalar('opps.minPudding', min(opps.map((s) => s.pudding)) / 10);
  w.scalar('opps.withEdamame', Math.min(4, opps.filter((s) => s.edamame).length) / 4);
  w.scalar('opps.maxColors', max(opps.map((s) => s.colors)) / 10);
  const total = (s: Stats) => s.matchScore + s.roundScore + s.dessertScore;
  const mine = total(stats[0]);
  const oppTotals = opps.map(total);
  w.scalar('opps.bestLead', oppTotals.length ? clamp((max(oppTotals) - mine) / MATCH_NORM, -2, 2) : 0);
  w.scalar('opps.meanLead', oppTotals.length
    ? clamp((oppTotals.reduce((a, b) => a + b, 0) / oppTotals.length - mine) / MATCH_NORM, -2, 2) : 0);
  const knownOpps = obs.players.slice(1).filter((p) => p.knownHand);
  w.scalar('opps.handsKnown', n > 1 ? knownOpps.length / (n - 1) : 0);
  w.faces('opps.knownHands', knownOpps.flatMap((p) => p.knownHand!));

  // ---- the round's cards the viewer can't place ----
  const unseen = unseenPool(obs);
  w.values('unseen.faces', unseen.faces);
  w.scalar('unseen.total', unseen.total / POOL_NORM);
  w.scalar('unseen.inHands', obs.players.slice(1).reduce((s, p) => s + (p.knownHand ? 0 : p.handSize), 0) / POOL_NORM);

  // ---- the decision at hand ----
  const options: SushiGoCard[] =
    decision?.type === 'copy' || decision?.type === 'takeout' ? decision.targets.map(effectiveCard)
      : decision?.type === 'menu' ? decision.drawn
        : decision?.type === 'spoonGive' ? decision.options
          : [];
  w.faces('decision.options', options);
  w.scalar('decision.optionCount', options.length / HAND_NORM);
  w.values('decision.askerMarginal', decision?.type === 'spoonGive'
    ? marginals(players, obs.uramakiNextPlace, decision.askerOffset, faces) : new Float32Array(FACE_COUNT));
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const PLACEHOLDER_OBS: SushiGoObservation = {
  viewerId: 'a', playerCount: 2, menu: [], rounds: 3, round: 1, subPhase: 'selecting',
  dealtHandSize: 10, passes: 0, deckSize: 0, uramakiNextPlace: 0, discards: [], hand: [],
  decision: null, waitingOn: null,
  players: ['a', 'b'].map((id) => ({
    id, handSize: 0, knownHand: null, table: [], dessertPile: [], uramakiPoints: 0, scoreByRound: [], submitted: false,
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
export function encodeObservation(obs: SushiGoObservation, out?: Float32Array): Float32Array {
  const x = out ?? new Float32Array(OBS_DIM);
  if (x.length !== OBS_DIM) throw new Error(`encode: expected buffer of ${OBS_DIM}, got ${x.length}`);
  x.fill(0);
  const w = new Writer(x, false);
  writeFeatures(obs, w);
  if (w.pos !== OBS_DIM) throw new Error(`encode: wrote ${w.pos} features, layout has ${OBS_DIM}`);
  return x;
}

export const SUSHI_GO_ENCODER: SushiGoEncoder = {
  version: ENCODER_VERSION, dim: OBS_DIM, layout: LAYOUT, encode: encodeObservation,
};

/** Exposed for tests. */
export const _internals = { marginals, flipGains, unseenPool, asPlayer };
