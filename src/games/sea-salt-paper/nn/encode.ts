// Sea Salt & Paper — observation → fixed-length feature vector (encoder v3).
//
// Pure function of SspObservation (never SspState), so hidden information
// can't leak in here. Layout is data-independent: every segment is written at
// a fixed size whatever the observation holds (absent opponents, empty piles
// and so on are zeros), and `featureLayout()` reports the segment table for
// the trainer and for debugging.
//
// Cards are described by KIND (kinds.ts) — family and colour together, so a
// teal crab and a yellow crab differ; the Extra Salt deck has 54. A card set
// is one number per kind, the fraction of that kind's copies; a single card
// is one-hot over the kinds. Family and colour totals are sums of the
// kind counts, but the sets that drive scoring carry them directly too.
//
// What's in it: turn and match state; the viewer's hand and table; per
// opponent their table, the cards the viewer knows they hold, and this
// round's history of what they took off a top, discarded, and passed over to
// draw from the deck; each pile's top three cards in order (taking the top
// exposes the next one) with the rest as a set; the viewer's own draw and
// lobster reveal; and the unseen pool. Plus derived signals that are cheap to
// compute exactly here and slow to learn: what one more card of each kind is
// worth to the viewer and to the next player, and so what each card on offer
// is worth to either.
//
// Bump ENCODER_VERSION whenever a segment is added, removed, reordered or
// rescaled, or the kind list changes; trained weights are only valid for the
// version they saw. Policies on older versions load through policy.ts.

import type { SspCard, SspEventId, SspSubPhase } from '../types';
import { FAMILY_ORDER, DUO_PAIRS, buildDeck } from '../cards';
import { cardPoints, mermaidColorBonus, specialColorBonus, totalScore, type CardPointsOpts } from '../scoring';
import { ALL_EVENT_IDS } from '../events';
import { buriedStillThere } from '../knowledge';
import { FAMILY_COUNT, FAMILY_INDEX, type SspObservation, type SspObservedPlayer } from './observation';
import { COLORS, COLOR_COUNT, COLOR_INDEX, KINDS, KIND_COUNT, kindIndex } from './kinds';

export const ENCODER_VERSION = 3;

export interface FeatureSegment {
  name: string;
  offset: number;
  size: number;
}

/** A versioned observation encoder; a policy file names the one it was trained with. */
export interface SspEncoder {
  version: number;
  dim: number;
  layout: readonly FeatureSegment[];
  encode(obs: SspObservation, out?: Float32Array): Float32Array;
}

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

const EVENT_COUNT = ALL_EVENT_IDS.length;
const EVENT_INDEX = new Map(ALL_EVENT_IDS.map((id, i) => [id, i]));

interface DeckTotals { family: number[]; color: number[]; kind: number[] }
const deckTotalsCache = new Map<boolean, DeckTotals>();
function deckTotals(extraSalt: boolean): DeckTotals {
  let t = deckTotalsCache.get(extraSalt);
  if (!t) {
    t = {
      family: new Array<number>(FAMILY_COUNT).fill(0),
      color: new Array<number>(COLOR_COUNT).fill(0),
      kind: new Array<number>(KIND_COUNT).fill(0),
    };
    for (const c of buildDeck({ extraSalt })) {
      t.family[FAMILY_INDEX[c.family]] += 1;
      t.color[COLOR_INDEX[c.color]] += 1;
      t.kind[kindIndex(c)] += 1;
    }
    deckTotalsCache.set(extraSalt, t);
  }
  return t;
}

/** Copies of each family / kind in the full (Extra Salt) deck — the count scales. */
const FAMILY_COPIES = deckTotals(true).family;
const KIND_COPIES = deckTotals(true).kind;

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
  /** Per-kind counts, each scaled by that kind's copies in the deck. */
  kinds(name: string, cards: readonly SspCard[], weight = 1): void {
    const o = this.seg(name, KIND_COUNT);
    for (const c of cards) {
      const k = kindIndex(c);
      this.x[o + k] += weight / KIND_COPIES[k];
    }
  }
  /** One card, one-hot over the kinds (all zero when absent). */
  kind(name: string, card: SspCard | null | undefined, weight = 1): void {
    const o = this.seg(name, KIND_COUNT);
    if (card) this.x[o + kindIndex(card)] = weight;
  }
  /** Per-family counts, each scaled by that family's copies in the deck. */
  families(name: string, cards: readonly SspCard[]): void {
    const o = this.seg(name, FAMILY_COUNT);
    for (const c of cards) this.x[o + FAMILY_INDEX[c.family]] += 1 / FAMILY_COPIES[FAMILY_INDEX[c.family]];
  }
  colors(name: string, cards: readonly SspCard[]): void {
    const o = this.seg(name, COLOR_COUNT);
    for (const c of cards) this.x[o + COLOR_INDEX[c.color]] += 1 / 10;
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

/** What one more card of each kind adds to `cards`' score, as Δ / MARGINAL_NORM
 *  clamped to ±4. That score is card points (which depend only on family) plus
 *  mermaid claims (only on colour and the mermaid count), so 19 + 12
 *  rescorings cover all 54 kinds. Pinned against a direct rescore per kind. */
function marginalTable(cards: SspCard[], opts: CardPointsOpts): Float32Array {
  const claims = (cs: SspCard[]) => (opts.mermaidsScoreZero ? 0 : mermaidColorBonus(cs, { forceMinMermaids: 0 }));
  const n = cards.length;
  const probe = cards.slice();
  const points0 = cardPoints(cards, opts);
  const claims0 = claims(cards);
  const dPoints = FAMILY_ORDER.map((family) => {
    probe[n] = { id: -1, family, color: 'white' };
    return cardPoints(probe, opts) - points0;
  });
  const dClaims = COLORS.map((color) => {
    probe[n] = { id: -1, family: 'shell', color };
    return claims(probe) - claims0;
  });
  probe[n] = { id: -1, family: 'mermaid', color: 'white' };
  const dMermaid = claims(probe) - claims0;
  const out = new Float32Array(KIND_COUNT);
  KINDS.forEach((k, i) => {
    const d = dPoints[FAMILY_INDEX[k.family]] + (k.family === 'mermaid' ? dMermaid : dClaims[COLOR_INDEX[k.color]]);
    out[i] = clamp(d / MARGINAL_NORM, -4, 4);
  });
  return out;
}

function writeFeatures(obs: SspObservation, w: Writer): void {
  const x = w.x;
  const me = obs.players[0];
  const next: SspObservedPlayer | undefined = obs.players[1];
  const myCards = [...obs.hand, ...me.table];
  const myOpts = scoringOpts(me);
  const myScore = scoreOf(myCards, myOpts);
  // Worth of each kind to the viewer, and to the next player as far as the
  // viewer can see them (table + known hand) — what a discard hands over.
  const mine = marginalTable(myCards, myOpts);
  const theirs = next
    ? marginalTable([...next.table, ...next.knownCards], scoringOpts(next))
    : new Float32Array(KIND_COUNT);
  const mineOf = (c: SspCard | null | undefined) => (c ? mine[kindIndex(c)] : 0);
  const theirsOf = (c: SspCard | null | undefined) => (c ? theirs[kindIndex(c)] : 0);

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
  // The announced LAST CHANCE score is the number everyone else must beat.
  const lcScore = obs.lastChanceScore;
  w.scalar('lastChance.score', lcScore !== null ? lcScore / SCORE_NORM : 0);
  w.scalar('lastChance.myMargin', lcScore !== null && obs.lastChanceOffset !== 0
    ? clamp((myScore - lcScore) / SCORE_NORM, -2, 2) : 0);

  // ---- me ----
  w.kinds('me.hand', obs.hand);
  w.families('me.handFamilies', obs.hand);
  w.kinds('me.table', me.table);
  w.families('me.tableFamilies', me.table);
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
  w.kinds('me.exposedHand', me.knownCards);
  w.values('me.marginal', mine);

  // ---- opponents, by seat offset ----
  for (let k = 1; k <= MAX_OPPONENTS; k++) {
    const p: SspObservedPlayer | undefined = obs.players[k];
    const tag = `opp${k}`;
    w.scalar(`${tag}.present`, p ? 1 : 0);
    w.scalar(`${tag}.isActive`, p && obs.activeOffset === k ? 1 : 0);
    w.scalar(`${tag}.handSize`, p ? p.handSize / 15 : 0);
    w.scalar(`${tag}.trios`, p ? p.trios.length / 3 : 0);
    // Score of what we can see of them (table + known cards) — a floor on
    // their real score.
    w.scalar(`${tag}.knownScore`, p ? scoreOf([...p.table, ...p.knownCards], scoringOpts(p)) / SCORE_NORM : 0);
    w.scalar(`${tag}.matchScore`, p ? p.matchScore / obs.targetScore : 0);
    w.scalar(`${tag}.matchLead`, p ? (p.matchScore - me.matchScore) / obs.targetScore : 0);
    w.scalar(`${tag}.stopThreshold`, p ? p.rules.stopThreshold / 10 : 0);
    w.scalar(`${tag}.locked`, p?.locked ? 1 : 0);
    w.scalar(`${tag}.calledLastChance`, p && obs.lastChanceOffset === k ? 1 : 0);
    w.scalar(`${tag}.finalTurnPending`, p?.finalTurnPending ? 1 : 0);
    w.scalar(`${tag}.isRoundStarter`, p && obs.roundStarterOffset === k ? 1 : 0);
    w.scalar(`${tag}.hiddenDigs`, p ? Math.min(p.hiddenDigs, 3) / 3 : 0);
    w.events(`${tag}.heldEvents`, p?.heldEvents ?? []);
    w.kinds(`${tag}.table`, p?.table ?? []);
    w.families(`${tag}.tableFamilies`, p?.table ?? []);
    w.kinds(`${tag}.knownHand`, p?.knownCards ?? []);
    // This round's history: what they went for, and what they turned down.
    w.kinds(`${tag}.pulls`, p?.pulls ?? []);
    w.kinds(`${tag}.discards`, p?.discards ?? []);
    w.kinds(`${tag}.passedTops`, p?.passedTops ?? []);
  }
  w.values('next.marginal', theirs);

  // ---- discard piles, as remembered ----
  for (const pi of [0, 1] as const) {
    const pile = obs.piles[pi];
    const stillThere = buriedStillThere(pile);
    const buried = pile.buried; // bottom first: the last one is exposed next
    const second = buried[buried.length - 1];
    const third = buried[buried.length - 2];
    w.scalar(`pile${pi}.size`, pile.size / 30);
    w.scalar(`pile${pi}.unknownRemovals`, Math.min(pile.unknownRemovals, 3) / 3);
    w.scalar(`pile${pi}.lookingAt`, obs.crabLookPile === pi ? 1 : 0);
    w.kind(`pile${pi}.top`, pile.top);
    w.kind(`pile${pi}.second`, second, stillThere);
    w.kind(`pile${pi}.third`, third, stillThere);
    w.kinds(`pile${pi}.rest`, buried.slice(0, Math.max(0, buried.length - 2)), stillThere);
    w.scalar(`pile${pi}.topMarginal`, mineOf(pile.top));
    w.scalar(`pile${pi}.topNextMarginal`, theirsOf(pile.top));
    w.scalar(`pile${pi}.secondMarginal`, stillThere * mineOf(second));
    w.scalar(`pile${pi}.secondNextMarginal`, stillThere * theirsOf(second));
    // Best crab target we remember, discounted for unseen digs.
    let best = mineOf(pile.top);
    for (const c of buried) best = Math.max(best, stillThere * mineOf(c));
    w.scalar(`pile${pi}.bestMarginal`, best);
  }

  // ---- own pending draw (ordered: keepIndex refers to it) ----
  for (const di of [0, 1] as const) {
    const c = obs.pendingDraw[di];
    w.kind(`draw${di}.card`, c);
    w.scalar(`draw${di}.marginal`, mineOf(c));
    w.scalar(`draw${di}.nextMarginal`, theirsOf(c));
  }

  // ---- own lobster reveal ----
  w.kinds('lobster.cards', obs.lobsterReveal);
  w.scalar('lobster.size', obs.lobsterReveal.length / 5);

  // ---- unseen pool: the deck plus whatever of opponents' hands we can't place ----
  const totals = deckTotals(obs.extraSalt);
  const seen = new Array<number>(KIND_COUNT).fill(0);
  const see = (cards: SspCard[], weight = 1) => {
    for (const c of cards) seen[kindIndex(c)] += weight;
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
  const unseen = totals.kind.map((t, i) => Math.max(0, t - seen[i]));
  const unseenF = new Array<number>(FAMILY_COUNT).fill(0);
  const unseenC = new Array<number>(COLOR_COUNT).fill(0);
  let unseenTotal = 0;
  let expected = 0;
  KINDS.forEach((kd, i) => {
    unseenF[FAMILY_INDEX[kd.family]] += unseen[i];
    unseenC[COLOR_INDEX[kd.color]] += unseen[i];
    unseenTotal += unseen[i];
    expected += unseen[i] * mine[i];
  });
  w.values('unseen.kinds', unseen.map((u, i) => (totals.kind[i] ? u / totals.kind[i] : 0)));
  w.values('unseen.families', unseenF.map((u, i) => (totals.family[i] ? u / totals.family[i] : 0)));
  w.values('unseen.colors', unseenC.map((u) => u / 10));
  w.scalar('unseen.total', unseenTotal / DECK_NORM);
  w.scalar('unseen.expectedMarginal', unseenTotal > 0 ? expected / unseenTotal : 0);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const PLACEHOLDER_OBS: SspObservation = {
  viewerId: 'a', targetScore: 40, extraSalt: false, extraPepper: false, round: 1,
  phase: 'playing', subPhase: 'awaitingAction', activeOffset: 0, roundStarterOffset: 0,
  lastChanceOffset: null, lastChanceScore: null, deckSize: 0, hand: [], pendingDraw: [],
  piles: [{ top: null, size: 0, buried: [], unknownRemovals: 0 }, { top: null, size: 0, buried: [], unknownRemovals: 0 }],
  crabLookPile: null, lobsterReveal: [], currentEvent: null, canStop: false, canLastChance: false,
  players: ['a', 'b'].map((id) => ({
    id, handSize: 0, table: [], trios: [], heldEvents: [], matchScore: 0, knownCards: [],
    rules: { shellPerCard: false, octopusPerCard: false, mermaidsScoreZero: false, stopThreshold: 7 },
    locked: false, pulls: [], discards: [], passedTops: [], hiddenDigs: 0, finalTurnPending: false,
  })),
};

const LAYOUT: FeatureSegment[] = (() => {
  const w = new Writer(new Float32Array(8192), true);
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

/** The current encoder, in the shape policy.ts dispatches on. */
export const SSP_ENCODER: SspEncoder = {
  version: ENCODER_VERSION, dim: OBS_DIM, layout: LAYOUT, encode: encodeObservation,
};

/** Exposed for tests. */
export const _internals = { marginalTable, scoreOf };
