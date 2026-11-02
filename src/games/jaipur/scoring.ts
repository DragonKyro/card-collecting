// Jaipur — scoring a finished round (and the running totals the UI shows).

import type { PlayerId } from '@/core/types';
import type { JaipurPlayer, JaipurRoundScore, JaipurRoundSummary } from './types';
import { CAMEL_TOKEN } from './cards';

export const goodsPoints = (p: JaipurPlayer): number => p.goodsTokens.reduce((s, t) => s + t.value, 0);
export const bonusPoints = (p: JaipurPlayer): number => p.bonusTokens.reduce((s, t) => s + t.value, 0);

/** Rupees so far, before the camel token. */
export const rupees = (p: JaipurPlayer): number => goodsPoints(p) + bonusPoints(p);

/** The player with strictly the most camels, or null on a tie. */
export function camelMajority(players: readonly JaipurPlayer[]): PlayerId | null {
  let best: JaipurPlayer | null = null;
  let tied = false;
  for (const p of players) {
    if (!best || p.herd.length > best.herd.length) { best = p; tied = false; }
    else if (p.herd.length === best.herd.length) tied = true;
  }
  return tied || !best ? null : best.id;
}

/** Score the round as it stands: camel token, totals, and who wins the seal
 *  (most rupees; ties → more bonus tokens; then more goods tokens). */
export function scoreRound(
  players: readonly JaipurPlayer[],
  round: number,
  endedBy: JaipurRoundSummary['endedBy'],
): JaipurRoundSummary {
  const camelTokenTo = camelMajority(players);
  const perPlayer: JaipurRoundScore[] = players.map((p) => {
    const goods = goodsPoints(p);
    const bonus = bonusPoints(p);
    const camel = p.id === camelTokenTo ? CAMEL_TOKEN : 0;
    return {
      playerId: p.id, goods, bonus, camel, total: goods + bonus + camel,
      goodsCount: p.goodsTokens.length, bonusCount: p.bonusTokens.length, herd: p.herd.length,
    };
  });
  const keys: Array<[JaipurRoundSummary['decidedBy'], (r: JaipurRoundScore) => number]> = [
    ['rupees', (r) => r.total],
    ['bonusTokens', (r) => r.bonusCount],
    ['goodsTokens', (r) => r.goodsCount],
  ];
  let field = perPlayer;
  for (const [decidedBy, key] of keys) {
    const top = Math.max(...field.map(key));
    const leaders = field.filter((r) => key(r) === top);
    if (leaders.length === 1) {
      return { round, endedBy, camelTokenTo, winnerId: leaders[0].playerId, decidedBy, perPlayer };
    }
    field = leaders;
  }
  return { round, endedBy, camelTokenTo, winnerId: null, decidedBy: 'tie', perPlayer };
}
