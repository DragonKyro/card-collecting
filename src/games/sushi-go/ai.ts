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
import { nigiriPoints } from './cards';
import { scoreRound, totalRoundScore, effectiveTable } from './scoring';

/** Hypothetical: re-score the round as if `player` had the given extra card(s) on table.
 *  Returns the marginal point delta for that player. */
function marginalForCard(
  state: SushiGoState,
  me: SushiGoPlayer,
  card: SushiGoCard,
): number {
  const before = scorePlayer(state, me);
  // Simulate adding the card to the END of my table (preserves wasabi-before-nigiri).
  const myCopy = clonePlayer(me);
  myCopy.table = [...myCopy.table, card];
  const others = state.players.filter((p) => p.id !== me.id).map(clonePlayer);
  const simulated = [...others, myCopy];
  const sc = scoreRound(simulated);
  const after = totalRoundScore(sc[myCopy.id]);
  return after - before;
}

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
function swingValue(state: SushiGoState, me: SushiGoPlayer, card: SushiGoCard): number {
  const kind = card.kind;
  let v = 0;
  const handSize = me.hand.length;
  const myKindCount = (k: SushiGoCardKind) => me.table.filter((c) => c.kind === k).length;

  switch (kind) {
    case 'wasabi': {
      // Worth ~6 expected pts if we'll see a nigiri later; less near round end.
      // Bonus if our hand or future hands likely contain nigiri.
      v += handSize > 2 ? 4 : 1;
      break;
    }
    case 'nigiri': {
      const base = nigiriPoints(card.variant);
      const pendingWasabi = me.table.filter(
        (c, i, arr) => c.kind === 'wasabi' && !arr.slice(i + 1).some((d) => d.kind === 'nigiri'),
      ).length;
      if (pendingWasabi > 0) v += base * 2;
      break;
    }
    case 'tempura': {
      // If we already have an odd number, completing the pair is worth +5.
      const cur = myKindCount('tempura');
      if (cur % 2 === 1) v += 5;
      else if (handSize > 3) v += 1; // start a new pair early
      break;
    }
    case 'sashimi': {
      const cur = myKindCount('sashimi');
      const target = 3 - (cur % 3);
      if (target === 1) v += 9; // very close to a set
      else if (target === 2 && handSize >= 2) v += 3;
      else if (handSize < 2) v -= 4; // unlikely to complete
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
      // Higher icon cards are stronger in the maki race.
      if (myIcons < oppMax) v += icons * 0.7; // catching up
      else if (myIcons - oppMax < icons) v += icons * 0.4; // about to grab lead
      else v += icons * 0.2;
      break;
    }
    case 'temaki': {
      const myCount = myKindCount('temaki');
      const oppCounts = state.players
        .filter((p) => p.id !== me.id)
        .map((p) => p.table.filter((c) => c.kind === 'temaki').length);
      const maxOther = Math.max(0, ...oppCounts);
      const minOther = Math.min(0, ...oppCounts);
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
      if (cur === 0) v -= 2;
      else if (cur === 1) v += 10; // 2nd eel turns -3 into +7 (+10 swing)
      break;
    }
    case 'eggNigiri': {
      v += 1;
      break;
    }
    case 'pudding': {
      // 3+ players only — fight for most and avoid fewest.
      if (state.players.length >= 3) {
        const mine = me.dessertPile.filter((c) => c.kind === 'pudding').length;
        const oppMax = Math.max(
          0,
          ...state.players.filter((p) => p.id !== me.id).map((p) =>
            p.dessertPile.filter((c) => c.kind === 'pudding').length),
        );
        const oppMin = Math.min(
          0,
          ...state.players.filter((p) => p.id !== me.id).map((p) =>
            p.dessertPile.filter((c) => c.kind === 'pudding').length),
        );
        if (mine <= oppMin) v += 2;
        else if (mine < oppMax) v += 1.5;
        else v += 0.8;
      } else {
        v -= 2; // 2-player: pudding is dead weight
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
      // Late-round, weaker; mid-round, strong.
      const mine = myKindCount('tea');
      v += handSize > 3 ? (mine === 0 ? 5 : 2) : 1;
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
      // Worth a future double pick; ~+2 expected if hand is plentiful.
      v += handSize > 4 ? 3 : 1;
      break;
    }
    case 'spoon': {
      v += handSize > 4 ? 2 : 1;
      break;
    }
    case 'menu': {
      v += 2;
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

/** Compute the total expected value of picking `card` from the AI's hand. */
function pickValue(state: SushiGoState, me: SushiGoPlayer, card: SushiGoCard): number {
  const marg = marginalForCard(state, me, card);
  const sw = swingValue(state, me, card);
  // Combine: marginal-from-scoring + heuristic swing (forward-looking).
  return marg + sw;
}

/** Pick the best card(s) from the AI's hand. Returns array of 1 or 2 cardIds. */
function chooseBestPick(state: SushiGoState, me: SushiGoPlayer): number[] {
  if (me.hand.length === 0) return [];

  // Score every card.
  const ranked = me.hand
    .map((c) => ({ card: c, value: pickValue(state, me, c) }))
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
  if (state.subPhase === 'roundEnd') {
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
