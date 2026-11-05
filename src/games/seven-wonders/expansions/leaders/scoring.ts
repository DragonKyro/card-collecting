// Leaders expansion — the 'leaders' score column: every recruited leader's
// VP (flat, per counted card, the score rules), a Courtesans' Guild copy
// included. Aristotle's bonus is scored with science, Tomyris / Semiramis in
// the conflicts; the Leaders guilds score in the guild column.

import type { SwPlayer, SwState } from '../../types';
import type { SwScoreExtras } from '../types';
import { cardVps } from '../../scoring';

export function scoreExtrasLeaders(state: SwState, player: SwPlayer): SwScoreExtras {
  const leaders = player.leaderTableau ?? [];
  if (leaders.length === 0) return {};
  return { leaders: leaders.reduce((s, c) => s + cardVps(state, player, c), 0) };
}
