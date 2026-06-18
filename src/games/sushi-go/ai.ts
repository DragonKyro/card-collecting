// Sushi Go! Party AI — heuristic, single difficulty.
//
// Approach
// --------
// For each card in the AI's current hand, estimate the marginal point gain of
// playing it now. Pick the highest. The estimate is *contextual*:
//   - what's already on my table (so a 2nd tempura is worth the +5)
//   - what's on opponents' tables (so a 5th maki is worth less if I'm already
//     in the lead, or a 1st temaki is worth more if I'd lose the trail vote)
//   - how many cards remain in the round (so a single sashimi late is worse
//     than mid-round when I could still finish a set)
//
// We assign a "swing" value per kind that captures the points-on-the-margin —
// what one additional card of that kind would add right now.

import type { PlayerId } from '@/core/types';
import type { SushiGoState, SushiGoAction, SushiGoCard, SushiGoCardKind, SushiGoPlayer } from './types';
import { nigiriPoints, KIND_INFO, handSize as defaultHandSize } from './cards';
import { scoreRound, totalRoundScore, effectiveTable } from './scoring';

// ---------- Knowledge: unseen-card tracking ----------
//
// The Sushi Go round deck is sized by the menu; we see every card on every
// table plus our own hand. The cards we *don't* see are either in another
// player's current hand or still in the deck. As play progresses these
// shrink — which sharpens the value of speculative cards (wasabi waits for an
// unseen nigiri; sashimi banks on more unseen sashimi to complete a set; etc.).

interface Knowledge {
  /** How many cards of each kind have not yet been revealed (anywhere). */
  unseenByKind: Map<SushiGoCardKind, number>;
  /** Total picks left this round across all players (their hands' sum, since
   *  every pick reveals one card per player per tick). */
  picksLeft: number;
  /** Cards each player will see on a single future hand-pass on average — used
   *  as a proxy for "expected to see X more of kind K before round-end". */
  perPlayerPicksLeft: number;
}

function buildKnowledge(state: SushiGoState, me: SushiGoPlayer): Knowledge {
  // Initial deck composition from menu, minus desserts added across rounds.
  const seenByKind = new Map<SushiGoCardKind, number>();
  const tally = (cards: SushiGoCard[]) => {
    for (const c of cards) seenByKind.set(c.kind, (seenByKind.get(c.kind) ?? 0) + 1);
  };
  // Everyone's tables are public. Our own hand is private to us.
  for (const p of state.players) tally(p.table);
  tally(me.hand);
  // Per-kind starting count comes from KIND_INFO; desserts use perRoundDessert.
  const unseen = new Map<SushiGoCardKind, number>();
  for (const kind of state.config.menu) {
    const info = KIND_INFO[kind];
    let total: number;
    if (info.category === 'dessert') {
      const adds = info.perRoundDessert ?? [5, 3, 2];
      // Cumulative desserts added up to and including the current round.
      total = adds.slice(0, state.round).reduce((s, n) => s + n, 0);
    } else {
      total = info.count;
    }
    unseen.set(kind, Math.max(0, total - (seenByKind.get(kind) ?? 0)));
  }
  const picksLeft = state.players.reduce((s, p) => s + p.hand.length, 0);
  const perPlayerPicksLeft = state.players.length > 0 ? me.hand.length : 0;
  return { unseenByKind: unseen, picksLeft, perPlayerPicksLeft };
}

/** Probability that AT LEAST ONE more card of `kind` will reach me this round.
 *  Rough estimate: each future pick has p(seen kind) = unseen[kind] / picksLeft. */
function probSeeKind(know: Knowledge, kind: SushiGoCardKind): number {
  const remaining = know.unseenByKind.get(kind) ?? 0;
  if (remaining <= 0) return 0;
  // Treat per-player picks as independent draws from the unseen pool. Use a
  // simple lower bound: 1 - (1 - p)^n with p = remaining/picksLeft, n = my picks left.
  const p = know.picksLeft > 0 ? remaining / know.picksLeft : 0;
  const n = Math.max(0, know.perPlayerPicksLeft - 1); // exclude this tick's pick
  if (p <= 0 || n <= 0) return 0;
  return 1 - Math.pow(1 - p, n);
}

void defaultHandSize;

/** Hypothetical: re-score the round as if `player` had the given extra card(s) on table.
 *  Returns the marginal point delta for that player.
 *
 *  Important: majority-style scoring (maki, temaki, uramaki, pudding) is
 *  computed FROM CURRENT BOARD STATE — which over-credits cards early in the
 *  round when opponents haven't yet picked their share. The caller should
 *  discount those categories via `majorityRealismDiscount`, which scales
 *  majority-share contributions by how much of the round has actually played
 *  out. Today the AI's pickValue does that. */
function marginalForCard(
  state: SushiGoState,
  me: SushiGoPlayer,
  card: SushiGoCard,
): number {
  const before = scorePlayer(state, me);
  const myCopy = clonePlayer(me);
  myCopy.table = [...myCopy.table, card];
  const others = state.players.filter((p) => p.id !== me.id).map(clonePlayer);
  const simulated = [...others, myCopy];
  const sc = scoreRound(simulated);
  const after = totalRoundScore(sc[myCopy.id]);
  return after - before;
}

/** Fraction of the round that has played out — used to taper down the
 *  rewards of majority-share scoring. 0.0 = first pick of the round (huge
 *  opportunity for opponents to catch up); 1.0 = the round just ended (the
 *  marginal reward is real). */
function roundProgressFraction(me: SushiGoPlayer, state: SushiGoState): number {
  const total = state.players.reduce((sum, p) => sum + p.hand.length + p.table.length, 0);
  if (total <= 0) return 1;
  // Cards already played = table totals. Cards still in hands = picks remaining.
  const inHand = state.players.reduce((sum, p) => sum + p.hand.length, 0);
  const played = total - inHand;
  void me;
  return Math.max(0, Math.min(1, played / total));
}

/** Categories whose marginal is computed via the "you have most icons NOW"
 *  rule. These need to be discounted because opponents WILL still pick more. */
const MAJORITY_KINDS: Set<SushiGoCardKind> = new Set([
  'maki', 'temaki', 'uramaki',
]);

function scorePlayer(state: SushiGoState, me: SushiGoPlayer): number {
  const sc = scoreRound(state.players);
  return totalRoundScore(sc[me.id]);
}

function clonePlayer(p: SushiGoPlayer): SushiGoPlayer {
  return {
    id: p.id,
    hand: p.hand.slice(),
    table: p.table.slice(),
    dessertPile: p.dessertPile.slice(),
    pendingPick: p.pendingPick ? p.pendingPick.slice() : null,
    scoreByRound: p.scoreByRound.slice(),
    dessertScore: p.dessertScore,
  };
}

/** Heuristic "swing" component: cards that are situationally great. */
function swingValue(state: SushiGoState, me: SushiGoPlayer, card: SushiGoCard, know: Knowledge): number {
  const kind = card.kind;
  let v = 0;
  const myKindCount = (k: SushiGoCardKind) => me.table.filter((c) => c.kind === k).length;

  switch (kind) {
    case 'wasabi': {
      // Expected value ~ P(I see at least one more nigiri) × E[nigiri value × 2].
      // (×2 because the wasabi adds 2× the nigiri's base on top of its normal score.)
      // Avg nigiri base in the squid/salmon/egg mix is ~2; wasabi adds +2×2 = +4.
      // Decay sharply if no nigiri can possibly come.
      const pNigiri = probSeeKind(know, 'nigiri') + probSeeKind(know, 'eggNigiri') * 0.5;
      v += 4 * pNigiri;
      break;
    }
    case 'nigiri': {
      const base = nigiriPoints(card.variant);
      // Nigiri scores its raw value immediately AND is the highest guaranteed
      // per-card score in the menu. Give it a small extra preference so the
      // AI takes a squid (3 pts) over a maki-3 of similar marginal value.
      // Squid → +0.8, salmon → +0.3, egg → +0.1.
      v += Math.max(0, base - 1) * 0.4;
      const pendingWasabi = me.table.filter(
        (c, i, arr) => c.kind === 'wasabi' && !arr.slice(i + 1).some((d) => d.kind === 'nigiri'),
      ).length;
      if (pendingWasabi > 0) v += base * 2;
      break;
    }
    case 'tempura': {
      // If we already have an odd number, completing the pair is worth +5.
      // Otherwise weight starting a new pair by P(see another tempura).
      const cur = myKindCount('tempura');
      if (cur % 2 === 1) v += 5;
      else {
        const pPartner = probSeeKind(know, 'tempura');
        v += 5 * pPartner;
      }
      break;
    }
    case 'sashimi': {
      // Sashimi sets of 3 → 10 pts; partial sets score 0. Use P(see enough more)
      // to discount, so an early single sashimi is only valuable if it's likely
      // we'll see 1-2 more.
      const cur = myKindCount('sashimi');
      const target = 3 - (cur % 3);
      const pNextSashimi = probSeeKind(know, 'sashimi');
      if (target === 1) v += 9; // completing a set right now
      else if (target === 2) v += 10 * pNextSashimi * 0.5;
      else /* target === 3 */ v += 10 * pNextSashimi * pNextSashimi * 0.3;
      break;
    }
    case 'dumpling': {
      const cur = myKindCount('dumpling');
      // Marginal: 1→1, 2→2, 3→3, 4→4, 5→5 (cap)
      const delta = [1, 2, 3, 4, 5, 0][Math.min(cur, 5)];
      v += delta - 1;
      break;
    }
    case 'maki': {
      // Maki marginal scoring is computed in pickValue via marginalForCard
      // and discounted by round progress. The remaining swing component is
      // ONLY the "are we close to a tie-break" bonus, which is small.
      const myIcons = me.table
        .filter((c) => c.kind === 'maki')
        .reduce((s, c) => s + Number(c.variant ?? 1), 0);
      const oppMax = Math.max(
        0,
        ...state.players
          .filter((p) => p.id !== me.id)
          .map((p) =>
            p.table.filter((c) => c.kind === 'maki').reduce((s, c) => s + Number(c.variant ?? 1), 0),
          ),
      );
      const icons = Number(card.variant ?? 1);
      // Light boost ONLY when this card flips us from behind into lead.
      if (myIcons < oppMax && myIcons + icons >= oppMax) v += 1.0;
      break;
    }
    case 'temaki': {
      const myCount = myKindCount('temaki');
      const oppCounts = state.players
        .filter((p) => p.id !== me.id)
        .map((p) => p.table.filter((c) => c.kind === 'temaki').length);
      const maxOther = oppCounts.length ? Math.max(...oppCounts) : 0;
      const minOther = oppCounts.length ? Math.min(...oppCounts) : 0;
      if (myCount < maxOther) v += 1.5; // need to catch the leader
      if (state.players.length >= 3 && myCount <= minOther) v += 2; // avoid −4
      break;
    }
    case 'uramaki': {
      const myIcons = me.table
        .filter((c) => c.kind === 'uramaki')
        .reduce((s, c) => s + Number(c.variant ?? 0), 0);
      const icons = Number(card.variant ?? 0);
      if (myIcons + icons >= 10 && myIcons < 10) v += 5; // about to hit the bonus
      else if (myIcons < 10) v += icons * 0.5;
      break;
    }
    case 'mizuOnigiri': {
      const shapes = new Set(
        me.table.filter((c) => c.kind === 'mizuOnigiri').map((c) => c.variant ?? ''),
      );
      if (!shapes.has(card.variant ?? '')) {
        // unique shape — substantial swing
        const newCount = shapes.size + 1;
        const table = [0, 1, 4, 9, 16];
        v += table[Math.min(newCount, 4)] - table[Math.min(shapes.size, 4)] - 1;
      } else {
        v -= 1;
      }
      break;
    }
    case 'tofu': {
      const cur = myKindCount('tofu');
      if (cur === 0) v += 2;
      else if (cur === 1) v += 4;
      else v -= 6; // would bust
      break;
    }
    case 'edamame': {
      // Value scales with how many opponents have edamame.
      const withEdamame = state.players.filter((p) => p.id !== me.id
        && p.table.some((c) => c.kind === 'edamame')).length;
      v += Math.min(withEdamame, 4);
      break;
    }
    case 'eel': {
      const cur = myKindCount('eel');
      if (cur === 0) {
        // First eel is -3 unless we'll see a second. Discount by P(see another eel).
        const pSecond = probSeeKind(know, 'eel');
        v += -3 + 10 * pSecond; // -3 if alone, +7 if we expect another
      } else if (cur === 1) v += 10; // 2nd eel turns -3 into +7 (+10 swing)
      break;
    }
    case 'eggNigiri': {
      v += 1;
      break;
    }
    case 'pudding': {
      // 2-player: +6 for most, NO −6 penalty. So pudding is purely upside —
      // we want to be the leader. 3+ player: also avoid being the fewest.
      const mine = me.dessertPile.filter((c) => c.kind === 'pudding').length;
      const oppPuddings = state.players
        .filter((p) => p.id !== me.id)
        .map((p) => p.dessertPile.filter((c) => c.kind === 'pudding').length);
      const oppMax = oppPuddings.length ? Math.max(...oppPuddings) : 0;
      const oppMin = oppPuddings.length ? Math.min(...oppPuddings) : 0;
      if (state.players.length >= 3) {
        if (mine <= oppMin) v += 2;
        else if (mine < oppMax) v += 1.5;
        else v += 0.8;
      } else {
        // 2-player: lead = +6, behind = 0. Always worth a point or two.
        if (mine <= oppMax) v += 1.5; // catching up matters
        else v += 0.5;                 // already leading
      }
      break;
    }
    case 'greenTeaIceCream': {
      // Sets of 4. Closer to a multiple of 4 is better.
      const mine = me.dessertPile.filter((c) => c.kind === 'greenTeaIceCream').length;
      const off = mine % 4;
      if (off === 3) v += 8; // about to complete a set of 4 (12 pts)
      else if (off === 0) v += 1;
      else v += 2;
      break;
    }
    case 'fruit': {
      // Each pile has a tier; rough heuristic: ~1.5 pts average per fruit icon.
      v += 1.5;
      break;
    }
    case 'soySauce': {
      // Counts colors in our table. Worth ~+4 if we're tied/leading in distinct colors.
      const myColors = new Set(me.table.map((c) => c.kind));
      const oppMax = Math.max(0, ...state.players.filter((p) => p.id !== me.id)
        .map((p) => new Set(p.table.map((c) => c.kind)).size));
      if (myColors.size >= oppMax) v += 3;
      else v += 0.5;
      break;
    }
    case 'tea': {
      // Tea multiplies your most-frequent kind. Value scales with how many
      // future picks remain (where you might extend that set).
      const mine = myKindCount('tea');
      const remainingPicks = know.perPlayerPicksLeft;
      v += mine === 0 ? Math.min(6, remainingPicks * 0.8) : Math.min(3, remainingPicks * 0.4);
      break;
    }
    case 'specialOrder': {
      // Worth roughly the value of our best already-played card.
      let best = 0;
      for (const c of effectiveTable(me)) {
        if (c.kind === 'specialOrder') continue;
        const guess = approxCardValue(c);
        if (guess > best) best = guess;
      }
      v += best;
      break;
    }
    case 'takeoutBox': {
      // Worth ~2 pts each — usable once per remaining turn roughly.
      v += 2;
      break;
    }
    case 'chopsticks': {
      // Worth a future double pick. Each remaining pick is one more chance to
      // exploit it; useless on the very last pick.
      v += Math.min(4, Math.max(0, know.perPlayerPicksLeft - 1) * 0.8);
      break;
    }
    case 'spoon': {
      v += Math.min(3, Math.max(0, know.perPlayerPicksLeft - 1) * 0.6);
      break;
    }
    case 'menu': {
      v += Math.min(3, Math.max(0, know.perPlayerPicksLeft - 1) * 0.6);
      break;
    }
  }
  return v;
}

function approxCardValue(c: SushiGoCard): number {
  switch (c.kind) {
    case 'nigiri': return nigiriPoints(c.variant);
    case 'tempura': return 2.5;
    case 'sashimi': return 3.3;
    case 'dumpling': return 2;
    case 'maki': return Number(c.variant ?? 1) * 0.5;
    case 'temaki': return 2;
    case 'uramaki': return Number(c.variant ?? 0) * 0.5;
    case 'mizuOnigiri': return 2;
    case 'tofu': return 2;
    case 'edamame': return 1;
    case 'eel': return 2;
    case 'eggNigiri': return 1;
    default: return 0;
  }
}

/** Compute the total expected value of picking `card` from the AI's hand.
 *
 *  Maki / temaki / uramaki are majority-share scoring — playing them is only
 *  worth the FRACTION of the round we've already pinned down, because
 *  opponents will still pick competing icons. We linearly discount the
 *  marginal-from-scoring for those kinds by round progress.
 *
 *  Nigiri (esp. squid) and sashimi/tempura/dumpling are flat-rate scoring —
 *  no opponent can undo a played squad nigiri's 3 pts. Those get their full
 *  marginal value AND their swing component. */
function pickValue(state: SushiGoState, me: SushiGoPlayer, card: SushiGoCard, know: Knowledge): number {
  const marg = marginalForCard(state, me, card);
  const sw = swingValue(state, me, card, know);
  let adjustedMarg = marg;
  if (MAJORITY_KINDS.has(card.kind)) {
    const progress = roundProgressFraction(me, state);
    // Discount majority-share by what's NOT yet locked in. At the start of the
    // round we count only 30% of the apparent marginal; once we're 80% through
    // we count 86% of it. Floor at 0.2 so we don't completely ignore them.
    const factor = 0.2 + 0.8 * progress;
    adjustedMarg = marg * factor;
  }
  return adjustedMarg + sw;
}

/** Pick the best card(s) from the AI's hand. Returns array of 1 or 2 cardIds. */
function chooseBestPick(state: SushiGoState, me: SushiGoPlayer): number[] {
  if (me.hand.length === 0) return [];

  const know = buildKnowledge(state, me);

  // Score every card.
  const ranked = me.hand
    .map((c) => ({ card: c, value: pickValue(state, me, c, know) }))
    .sort((a, b) => b.value - a.value);

  const hasChopsticks = me.table.some((c) => c.kind === 'chopsticks' && c.variant !== 'used');
  const hasSpoon = me.table.some((c) => c.kind === 'spoon' && c.variant !== 'used');
  const canDouble = (hasChopsticks || hasSpoon) && me.hand.length >= 2;

  if (canDouble && ranked.length >= 2) {
    // Pick chopsticks only if the combined value of top-2 exceeds the value of
    // top-1 by a meaningful margin (>3) — otherwise it's better to save the
    // chopsticks for a future turn.
    const topTwo = ranked[0].value + ranked[1].value;
    const topOne = ranked[0].value;
    // Going from "1 card" to "2 cards" sacrifices the chopsticks utility too;
    // if hand is large, future use is more valuable.
    const chopsticksSaveValue = me.hand.length > 4 ? 4 : 1;
    if (topTwo - topOne > chopsticksSaveValue) {
      // Order: wasabi before nigiri if both selected.
      const [a, b] = [ranked[0].card, ranked[1].card];
      const aFirst = (a.kind === 'wasabi' && b.kind === 'nigiri') || a.kind !== 'nigiri';
      return aFirst ? [a.id, b.id] : [b.id, a.id];
    }
  }

  // If we'd want to play wasabi before a nigiri together, we can't (only 1
  // card normally) — just play the best single card. The reducer doesn't
  // care about order for 1-card picks.
  return [ranked[0].card.id];
}

export function chooseAIAction(state: SushiGoState, playerId: PlayerId): SushiGoAction | null {
  if (state.phase !== 'playing') return null;
  // Round-end pause: when at least one human seat exists, leave the
  // "Next round →" click to them so they have time to read the score. In
  // all-AI matches, any AI advances after a tick so the demo keeps moving.
  if (state.subPhase === 'roundEnd') {
    const hasHuman = state.seats.some((s) => !s.isAI);
    if (hasHuman) return null;
    return { type: 'nextRound' };
  }
  if (state.subPhase !== 'selecting') return null;
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  // If we've already submitted this round, do nothing.
  if (me.pendingPick !== null) return null;
  if (me.hand.length === 0) return null;
  const ids = chooseBestPick(state, me);
  if (ids.length === 0) return null;
  return { type: 'submitPick', playerId, cardIds: ids };
}
