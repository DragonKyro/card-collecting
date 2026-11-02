// Jaipur — observation → fixed-length feature vector (encoder v2).
//
// Pure function of JaipurObservation (never JaipurState), so hidden
// information can't leak in here. The layout is data-independent: every
// segment is written at a fixed size whatever the observation holds, and
// `featureLayout()` reports the segment table for the trainer and for
// debugging. Per-good segments list the goods in GOODS order.
//
//   match     round, seals, who started the round
//   clock     deck size, empty goods piles (3 end the round)
//   hands     own hand; the opponent's hand size, the cards they're known to
//             hold (taken from the market) and how many are unknown; what
//             the opponent knows of the viewer's hand
//   camels    herds, the camel-token race, camels in the market and in the
//             deck (exact: camels never stay in a hand)
//   cards     per good: in the market, not yet sold, unseen (deck + the
//             opponent's unknown cards); the deck's expected make-up and the
//             odds of each type being the next card turned up — the unseen
//             goods split pro rata between the deck and the opponent's
//             unknown cards, since the viewer can't tell them apart
//   tokens    each goods pile: size, the full remaining price ladder (next
//             token first), what's left in it
//   sales     what selling 1..7 of each good pays right now (bonus at its
//             expected value)
//   bonus     tokens left per pile, and the bonus values the viewer hasn't
//             seen (piles + the opponent's tokens) as counts per value
//   score     rupees on both sides (the opponent's bonus tokens at the
//             expected value of those unseen values), margins, tiebreak leads
//   decision  main decision or an exchange in progress (taken / given so far)
//
// Never encoded (and not in the observation): the deck's order or exact
// contents, the opponent's unknown cards, which bonus values are in the
// piles and which the opponent holds.
//
// v2 (from v1): full price ladders instead of the top three values; unsold
// cards instead of sold; expected deck make-up and next-card odds; unseen
// bonus values per value instead of only their mean; sale values for every
// count instead of selling everything.
//
// Bump ENCODER_VERSION whenever a segment is added, removed, reordered or
// rescaled; trained weights are only valid for the version they saw.

import type { JaipurBonusSize, JaipurCardType, JaipurGood } from '../types';
import {
  BONUS_MEAN, BONUS_SIZES, BONUS_VALUES, CARD_COUNTS, CARD_TYPES, CAMEL_TOKEN, GOODS, HAND_LIMIT, TOKEN_VALUES,
  bonusSizeFor, minSale,
} from '../cards';
import { countCards, emptyCounts, emptyGoodCounts, sumGoods } from '../rules';
import type { JaipurObservation } from './observation';

export const ENCODER_VERSION = 2;

const DECK_NORM = 40;
const HERD_NORM = 11;
const SCORE_NORM = 60;
const MARGIN_NORM = 30;
const SALE_NORM = 30;
const TOKEN_NORM = 7;
const EXPECTED_NORM = 10;
const ROUNDS = 5;
const MAX_SALE = HAND_LIMIT;

/** The distinct values of each bonus pile, highest first, and how many of each it starts with. */
const BONUS_FACES: Record<JaipurBonusSize, Array<{ value: number; copies: number }>> = Object.fromEntries(
  BONUS_SIZES.map((size) => {
    const values = [...new Set(BONUS_VALUES[size])].sort((a, b) => b - a);
    return [size, values.map((value) => ({ value, copies: BONUS_VALUES[size].filter((v) => v === value).length }))];
  }),
) as Record<JaipurBonusSize, Array<{ value: number; copies: number }>>;

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
  values(name: string, v: ArrayLike<number>): void {
    const o = this.seg(name, v.length);
    for (let i = 0; i < v.length; i++) this.x[o + i] = v[i];
  }
  oneHot(name: string, size: number, index: number): void {
    const o = this.seg(name, size);
    this.x[o + Math.max(0, Math.min(size - 1, index))] = 1;
  }
  /** One value per good. */
  goods(name: string, f: (g: JaipurGood) => number): void {
    this.values(name, GOODS.map(f));
  }
  /** One one-hot block per good (count clamped to the block). */
  goodsOneHot(name: string, size: number, f: (g: JaipurGood) => number): void {
    const o = this.seg(name, size * GOODS.length);
    GOODS.forEach((g, i) => { this.x[o + i * size + Math.max(0, Math.min(size - 1, f(g)))] = 1; });
  }
}

const sum = (v: readonly number[]) => v.reduce((a, b) => a + b, 0);
const mean = (v: readonly number[], fallback: number) => (v.length ? sum(v) / v.length : fallback);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Expected value of one unseen bonus token of each size. */
function bonusExpectation(obs: JaipurObservation): Record<JaipurBonusSize, number> {
  const out = {} as Record<JaipurBonusSize, number>;
  for (const size of BONUS_SIZES) out[size] = mean(obs.unseenBonus[size], BONUS_MEAN[size]);
  return out;
}

/** Rupees a sale of `n` cards of `g` brings now (bonus at its expected value). */
export function saleValue(obs: JaipurObservation, g: JaipurGood, n: number): number {
  if (n < minSale(g)) return 0;
  const size = bonusSizeFor(n);
  const bonus = size && obs.bonusLeft[size] > 0 ? bonusExpectation(obs)[size] : 0;
  return sum(obs.tokens[g].slice(0, n)) + bonus;
}

/** The opponent's rupees as far as the viewer can tell. */
export function opponentRupeesEstimate(obs: JaipurObservation): number {
  const ev = bonusExpectation(obs);
  return sum(obs.opponent.goodsTokens) + BONUS_SIZES.reduce((s, size) => s + obs.opponent.bonusCounts[size] * ev[size], 0);
}

export function myRupees(obs: JaipurObservation): number {
  return sum(obs.goodsTokens) + sum(obs.bonusTokens.map((t) => t.value));
}

/** Expected count of each card type in the deck. Unseen camels are all in the
 *  deck; unseen goods are split between the deck and the opponent's unknown
 *  cards in proportion to their sizes. */
export function expectedDeck(obs: JaipurObservation): Record<JaipurCardType, number> {
  const out = emptyCounts();
  out.camel = obs.unseen.camel;
  const unseenGoods = sumGoods(obs.unseen);
  const deckGoods = Math.max(0, obs.deckSize - obs.unseen.camel);
  for (const g of GOODS) out[g] = unseenGoods > 0 ? (obs.unseen[g] * deckGoods) / unseenGoods : 0;
  return out;
}

function writeFeatures(obs: JaipurObservation, w: Writer): void {
  const hand = countCards(obs.hand);
  const market = countCards(obs.market);
  const opp = obs.opponent;
  const herd = obs.herd.length;

  // ---- match ----
  w.oneHot('match.round', ROUNDS, obs.round - 1);
  w.oneHot('match.seals', 3, obs.seals);
  w.oneHot('match.oppSeals', 3, opp.seals);
  w.scalar('match.sealsToWin', obs.sealsToWin / 3);
  w.scalar('match.sealsNeeded', Math.max(0, obs.sealsToWin - obs.seals) / 3);
  w.scalar('match.oppSealsNeeded', Math.max(0, obs.sealsToWin - opp.seals) / 3);
  w.scalar('match.startedRound', obs.startedRound ? 1 : 0);

  // ---- clock ----
  w.scalar('clock.deck', obs.deckSize / DECK_NORM);
  w.values('clock.deckLow', [obs.deckSize <= 6 ? 1 : 0, obs.deckSize <= 3 ? 1 : 0, obs.deckSize === 0 ? 1 : 0]);
  w.oneHot('clock.emptyPiles', 4, obs.emptyPiles);

  // ---- hands ----
  w.oneHot('hand.size', HAND_LIMIT + 1, obs.hand.length);
  w.goodsOneHot('hand.count', HAND_LIMIT + 1, (g) => hand[g]);
  w.oneHot('opp.handSize', HAND_LIMIT + 1, opp.handSize);
  w.scalar('opp.unknown', opp.unknown / HAND_LIMIT);
  w.goodsOneHot('opp.known', 5, (g) => opp.known[g]);
  w.goods('hand.exposed', (g) => obs.exposed[g] / HAND_LIMIT);

  // ---- camels ----
  w.scalar('camels.herd', herd / HERD_NORM);
  w.scalar('camels.oppHerd', opp.herd / HERD_NORM);
  w.scalar('camels.lead', clamp((herd - opp.herd) / 5, -2, 2));
  w.oneHot('camels.race', 3, Math.sign(herd - opp.herd) + 1);
  w.oneHot('camels.market', 6, market.camel);
  w.scalar('camels.inDeck', obs.unseen.camel / HERD_NORM);

  // ---- where the cards are ----
  w.goods('cards.market', (g) => market[g] / 5);
  w.goods('cards.unsold', (g) => (CARD_COUNTS[g] - obs.discard[g]) / CARD_COUNTS[g]);
  w.goods('cards.unseen', (g) => obs.unseen[g] / CARD_COUNTS[g]);
  w.scalar('cards.unseenTotal', sumGoods(obs.unseen) / DECK_NORM);
  const deck = expectedDeck(obs);
  w.values('deck.expected', CARD_TYPES.map((t) => deck[t] / EXPECTED_NORM));
  w.values('deck.nextOdds', CARD_TYPES.map((t) => (obs.deckSize > 0 ? deck[t] / obs.deckSize : 0)));

  // ---- price ladders ----
  w.goods('tokens.left', (g) => obs.tokens[g].length / TOKEN_VALUES[g].length);
  for (const g of GOODS) {
    w.values(`tokens.ladder.${g}`, TOKEN_VALUES[g].map((_, k) => (obs.tokens[g][k] ?? 0) / TOKEN_NORM));
  }
  w.goods('tokens.sum', (g) => sum(obs.tokens[g]) / sum(TOKEN_VALUES[g]));

  // ---- what selling pays now ----
  for (const g of GOODS) {
    w.values(`sell.value.${g}`, Array.from({ length: MAX_SALE }, (_, i) =>
      (i + 1 <= hand[g] ? saleValue(obs, g, i + 1) / SALE_NORM : 0)));
  }
  w.goods('sell.legal', (g) => (hand[g] >= minSale(g) ? 1 : 0));

  // ---- bonus piles ----
  w.values('bonus.left', BONUS_SIZES.map((s) => obs.bonusLeft[s] / BONUS_VALUES[s].length));
  const ev = bonusExpectation(obs);
  w.values('bonus.unseenMean', BONUS_SIZES.map((s) => ev[s] / 10));
  for (const s of BONUS_SIZES) {
    w.values(`bonus.unseenValues.${s}`, BONUS_FACES[s].map((f) =>
      obs.unseenBonus[s].filter((v) => v === f.value).length / f.copies));
  }

  // ---- score ----
  const mine = myRupees(obs);
  const theirs = opponentRupeesEstimate(obs);
  const camelSwing = Math.sign(herd - opp.herd) * CAMEL_TOKEN;
  w.scalar('score.goods', sum(obs.goodsTokens) / SCORE_NORM);
  w.scalar('score.bonus', sum(obs.bonusTokens.map((t) => t.value)) / MARGIN_NORM);
  w.scalar('score.oppGoods', sum(opp.goodsTokens) / SCORE_NORM);
  w.values('score.oppBonusCount', BONUS_SIZES.map((s) => opp.bonusCounts[s] / BONUS_VALUES[s].length));
  w.scalar('score.margin', clamp((mine - theirs) / MARGIN_NORM, -2, 2));
  w.scalar('score.marginWithCamels', clamp((mine - theirs + camelSwing) / MARGIN_NORM, -2, 2));
  w.scalar('score.bonusTokenLead', clamp((obs.bonusTokens.length - sum(BONUS_SIZES.map((s) => opp.bonusCounts[s]))) / 5, -2, 2));
  w.scalar('score.goodsTokenLead', clamp((obs.goodsTokens.length - opp.goodsTokens.length) / 10, -2, 2));

  // ---- decision ----
  const d = obs.decision;
  w.oneHot('decision.stage', 3, !d ? 0 : d.stage === 'main' ? 0 : d.stage === 'take' ? 1 : 2);
  const take = d && d.stage !== 'main' ? d.draft.take : emptyGoodCounts();
  const give = d && d.stage !== 'main' ? d.draft.give : emptyCounts();
  w.goods('draft.take', (g) => take[g] / 5);
  w.values('draft.give', CARD_TYPES.map((t: JaipurCardType) => give[t] / 5));
  w.scalar('draft.left', (sumGoods(take) - sumGoods(give) - give.camel) / 5);
}

const PLACEHOLDER_OBS: JaipurObservation = {
  viewerId: 'a', sealsToWin: 2, round: 1, phase: 'playing', subPhase: 'turn', startedRound: true,
  deckSize: 0, market: [], discard: emptyCounts(),
  tokens: Object.fromEntries(GOODS.map((g) => [g, []])) as unknown as JaipurObservation['tokens'],
  bonusLeft: { 3: 0, 4: 0, 5: 0 }, emptyPiles: 0, hand: [], herd: [], goodsTokens: [], bonusTokens: [], seals: 0,
  exposed: emptyGoodCounts(),
  opponent: {
    id: 'b', handSize: 0, known: emptyGoodCounts(), unknown: 0, herd: 0, goodsTokens: [],
    bonusCounts: { 3: 0, 4: 0, 5: 0 }, seals: 0,
  },
  unseen: emptyCounts(), unseenBonus: { 3: [], 4: [], 5: [] }, decision: null,
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
export function encodeObservation(obs: JaipurObservation, out?: Float32Array): Float32Array {
  const x = out ?? new Float32Array(OBS_DIM);
  if (x.length !== OBS_DIM) throw new Error(`encode: expected buffer of ${OBS_DIM}, got ${x.length}`);
  x.fill(0);
  const w = new Writer(x, false);
  writeFeatures(obs, w);
  if (w.pos !== OBS_DIM) throw new Error(`encode: wrote ${w.pos} features, layout has ${OBS_DIM}`);
  return x;
}
