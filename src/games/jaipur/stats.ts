// Jaipur — post-game match stats, derived from a finished match's log and
// round history (the log keeps every move in full, so nothing extra is
// recorded during play). The game-over panel (StatsPanel.tsx) charts them. Read
// only once the match is over: a sale's bonus value is private until then.
//
// Per round, every seat's rupees, herd and hand size are tracked move by
// move. Rupees and the herd are on the log directly; the opening herd isn't
// (the deal isn't logged), so it is worked back from the herd the round
// ended with, and the opening hand is the rest of the five dealt cards.

import type { PlayerId } from '@/core/types';
import type { JaipurGood, JaipurLogEntry, JaipurRoundSummary, JaipurState } from './types';
import { GOODS, HAND_DEAL } from './cards';

export type JaipurMoveEntry = Extract<JaipurLogEntry, { kind: 'takeOne' | 'takeCamels' | 'exchange' | 'sell' }>;
export type JaipurMoveKind = JaipurMoveEntry['kind'];
export const MOVE_KINDS: readonly JaipurMoveKind[] = ['takeOne', 'takeCamels', 'exchange', 'sell'];

/** One round, sampled at the start, after each move, and once scored (camel token in). */
export interface JaipurRoundTrack {
  round: number;
  summary: JaipurRoundSummary;
  moves: JaipurMoveEntry[];
  /** Length moves + 2: start, after each move, end. */
  rupees: Record<PlayerId, number[]>;
  herd: Record<PlayerId, number[]>;
  hand: Record<PlayerId, number[]>;
}

export interface JaipurGoodStats {
  /** Goods tokens plus the bonus tokens those sales earned. */
  rupees: number;
  bonus: number;
  cards: number;
  sales: number;
}

export interface JaipurPlayerStats {
  playerId: PlayerId;
  moves: Record<JaipurMoveKind, number>;
  byGood: Record<JaipurGood, JaipurGoodStats>;
  /** Sales by size: index 0 = 1 card … index 4 = 5 or more. */
  saleSizes: number[];
  /** Rupees (tokens + bonus) from the sales of each size, same indexing. */
  saleSizeRupees: number[];
  cardsSold: number;
  salesRupees: number;
  bonusTokens: number;
  bonusRupees: number;
  /** Goods taken from the market (one at a time or in trades). */
  goodsTaken: number;
  camelsTaken: number;
  /** Camels paid into the market in trades. */
  camelsTraded: number;
  camelTokens: number;
  roundsWon: number;
}

export interface JaipurMatchStats {
  rounds: JaipurRoundTrack[];
  players: JaipurPlayerStats[];
}

export const saleSizeIndex = (count: number): number => Math.min(count, 5) - 1;

export function matchStats(state: JaipurState): JaipurMatchStats {
  const ids = state.players.map((p) => p.id);
  const movesByRound = new Map<number, JaipurMoveEntry[]>();
  for (const e of state.log) {
    if (e.kind === 'roundEnd' || e.kind === 'matchEnd') continue;
    const list = movesByRound.get(e.round) ?? [];
    list.push(e);
    movesByRound.set(e.round, list);
  }
  const rounds = state.roundHistory.map((summary) => trackRound(summary, movesByRound.get(summary.round) ?? [], ids));

  const players = ids.map((id): JaipurPlayerStats => {
    const s: JaipurPlayerStats = {
      playerId: id,
      moves: { takeOne: 0, takeCamels: 0, exchange: 0, sell: 0 },
      byGood: Object.fromEntries(GOODS.map((g) => [g, { rupees: 0, bonus: 0, cards: 0, sales: 0 }])) as Record<JaipurGood, JaipurGoodStats>,
      saleSizes: [0, 0, 0, 0, 0],
      saleSizeRupees: [0, 0, 0, 0, 0],
      cardsSold: 0,
      salesRupees: 0,
      bonusTokens: 0,
      bonusRupees: 0,
      goodsTaken: 0,
      camelsTaken: 0,
      camelsTraded: 0,
      camelTokens: 0,
      roundsWon: 0,
    };
    for (const r of rounds) {
      for (const m of r.moves) {
        if (m.playerId !== id) continue;
        s.moves[m.kind]++;
        switch (m.kind) {
          case 'takeOne': s.goodsTaken++; break;
          case 'takeCamels': s.camelsTaken += m.count; break;
          case 'exchange':
            s.goodsTaken += m.took.length;
            s.camelsTraded += m.gave.filter((t) => t === 'camel').length;
            break;
          case 'sell': {
            const tokens = m.tokens.reduce((a, v) => a + v, 0);
            const bonus = m.bonus?.value ?? 0;
            const g = s.byGood[m.good];
            g.rupees += tokens + bonus;
            g.bonus += bonus;
            g.cards += m.count;
            g.sales++;
            s.saleSizes[saleSizeIndex(m.count)]++;
            s.saleSizeRupees[saleSizeIndex(m.count)] += tokens + bonus;
            s.cardsSold += m.count;
            s.salesRupees += tokens + bonus;
            if (m.bonus) { s.bonusTokens++; s.bonusRupees += bonus; }
            break;
          }
        }
      }
      if (r.summary.camelTokenTo === id) s.camelTokens++;
      if (r.summary.winnerId === id) s.roundsWon++;
    }
    return s;
  });
  return { rounds, players };
}

function trackRound(summary: JaipurRoundSummary, moves: JaipurMoveEntry[], ids: PlayerId[]): JaipurRoundTrack {
  const herdDelta = (m: JaipurMoveEntry): number => {
    if (m.kind === 'takeCamels') return m.count;
    if (m.kind === 'exchange') return -m.gave.filter((t) => t === 'camel').length;
    return 0;
  };
  const handDelta = (m: JaipurMoveEntry): number => {
    switch (m.kind) {
      case 'takeOne': return 1;
      case 'takeCamels': return 0;
      case 'exchange': return m.took.length - m.gave.filter((t) => t !== 'camel').length;
      case 'sell': return -m.count;
    }
  };
  const rupeeDelta = (m: JaipurMoveEntry): number =>
    (m.kind === 'sell' ? m.tokens.reduce((a, v) => a + v, 0) + (m.bonus?.value ?? 0) : 0);

  const rupees: Record<PlayerId, number[]> = {};
  const herd: Record<PlayerId, number[]> = {};
  const hand: Record<PlayerId, number[]> = {};
  for (const id of ids) {
    const row = summary.perPlayer.find((r) => r.playerId === id);
    const mine = moves.filter((m) => m.playerId === id);
    const herd0 = (row?.herd ?? 0) - mine.reduce((a, m) => a + herdDelta(m), 0);
    let r = 0;
    let h = herd0;
    let c = HAND_DEAL - herd0;
    rupees[id] = [r];
    herd[id] = [h];
    hand[id] = [c];
    for (const m of moves) {
      if (m.playerId === id) {
        r += rupeeDelta(m);
        h += herdDelta(m);
        c += handDelta(m);
      }
      rupees[id].push(r);
      herd[id].push(h);
      hand[id].push(c);
    }
    rupees[id].push(r + (row?.camel ?? 0));
    herd[id].push(h);
    hand[id].push(c);
  }
  return { round: summary.round, summary, moves, rupees, herd, hand };
}
