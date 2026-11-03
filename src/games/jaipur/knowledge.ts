// Jaipur — what one seat may know (the learned agent's observation and the
// heuristic AI are built on this; the UI's memory aid shows the same thing).
//
//   public   the market, the discard pile (every sold card was shown), both
//            herds, hand sizes, every goods pile and the goods tokens each
//            player took, how many bonus tokens of each size each player
//            holds and how many are left, seals, the deck's size.
//   private  the viewer's own hand and the values of its own bonus tokens.
//   inferred an opponent's cards that were taken from the market this round
//            and not yet given back or sold.
//   hidden   the deck order and contents, the rest of an opponent's hand (the
//            five cards dealt, minus camels, are never shown), the bonus
//            piles, an opponent's bonus values, the RNG — and `bonus.value`
//            on an opponent's sale log entry.
//
// Cards of one good are interchangeable, so knowledge is kept by type. When
// an opponent plays a good the viewer knew they held, the known count drops;
// otherwise the card came from the unknown part of their hand. Either way the
// rest of the unknown part is what it was, so this loses nothing.

import type { PlayerId } from '@/core/types';
import type { JaipurBonusSize, JaipurState } from './types';
import { BONUS_SIZES, BONUS_VALUES, CARD_COUNTS, CARD_TYPES, GOODS } from './cards';
import { countCards, emptyCounts, emptyGoodCounts, sumGoods, type Counts, type GoodCounts } from './rules';

export interface JaipurKnowledge {
  /** Per player, in seat order: the hand goods the viewer knows about. The
   *  viewer's own entry is its whole hand. */
  knownHands: GoodCounts[];
  /** Per player: hand cards the viewer can't name. */
  unknownCounts: number[];
  /** Cards the viewer can't place: the deck plus every unknown hand card. */
  unseen: Counts;
  /** Values of bonus tokens the viewer hasn't seen, per size: the piles plus
   *  other players' tokens. Sorted descending. */
  unseenBonus: Record<JaipurBonusSize, number[]>;
}

export function knowledgeOf(state: JaipurState, viewerId: PlayerId): JaipurKnowledge {
  const viewerIdx = state.players.findIndex((p) => p.id === viewerId);
  if (viewerIdx === -1) throw new Error(`knowledgeOf: ${viewerId} is not seated`);
  const idx = new Map(state.players.map((p, i) => [p.id, i]));
  const known = state.players.map(() => emptyGoodCounts());

  const play = (k: GoodCounts, g: keyof GoodCounts, n: number) => { k[g] = Math.max(0, k[g] - n); };
  // The log is in order: replay only this round's tail.
  let from = state.log.length;
  while (from > 0 && state.log[from - 1].round === state.round) from--;
  for (let li = from; li < state.log.length; li++) {
    const e = state.log[li];
    if (!('playerId' in e)) continue;
    const i = idx.get(e.playerId);
    if (i === undefined || i === viewerIdx) continue;
    const k = known[i];
    switch (e.kind) {
      case 'takeOne':
        k[e.good]++;
        break;
      case 'exchange':
        for (const g of e.took) k[g]++;
        for (const x of e.gave) if (x !== 'camel') play(k, x, 1);
        break;
      case 'sell':
        play(k, e.good, e.count);
        break;
    }
  }
  const viewer = state.players[viewerIdx];
  known[viewerIdx] = { ...emptyGoodCounts(), ...pickGoods(countCards(viewer.hand)) };

  const unknownCounts = state.players.map((p, i) => p.hand.length - sumGoods(known[i]));

  // Unseen = everything minus what the viewer can see or name.
  const unseen = { ...CARD_COUNTS } as Counts;
  const seen = [
    countCards(state.market),
    countCards(state.discard),
    ...state.players.map((p) => countCards(p.herd)),
    ...known.map((k) => ({ ...emptyCounts(), ...k })),
  ];
  for (const c of seen) for (const t of CARD_TYPES) unseen[t] -= c[t];

  const unseenBonus = {} as Record<JaipurBonusSize, number[]>;
  for (const size of BONUS_SIZES) {
    const pool = BONUS_VALUES[size].slice();
    for (const t of viewer.bonusTokens) {
      if (t.size !== size) continue;
      const j = pool.indexOf(t.value);
      if (j !== -1) pool.splice(j, 1);
    }
    unseenBonus[size] = pool.sort((a, b) => b - a);
  }

  return { knownHands: known, unknownCounts, unseen, unseenBonus };
}

function pickGoods(c: Counts): GoodCounts {
  const out = emptyGoodCounts();
  for (const g of GOODS) out[g] = c[g];
  return out;
}
