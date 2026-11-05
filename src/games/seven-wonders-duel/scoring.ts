// 7 Wonders Duel — civilian victory scoring (the score pad's columns).
//
//   civilian    VP printed on blue cards
//   science     VP printed on green cards (symbols only matter for pairs and
//               Scientific Supremacy — there is no set scoring in Duel)
//   commercial  VP printed on yellow cards (the Age III ones, 3 each)
//   guild       per guild: its kind counted in the city with the most of it
//   wonders     VP printed on built wonders
//   progress    Agriculture 4, Philosophy 7, Mathematics 3 per token owned
//   treasury    1 VP per 3 coins
//   military    the pawn on the opponent's side: 2 (1–2 spaces), 5 (3–5), 10 (6–8)
//
// Pantheon: Grand Temples score together in the guild column (5 / 12 / 21
// VP for 1 / 2 / 3); Mysticism 2 VP per Mythology / Offering token kept;
// divinities = Aphrodite's 9 + the coins left on Astarte. Agora: senate = 1 /
// 2 / 3 / 3 / 2 / 1 VP for each Chamber controlled.
//
// Highest total wins; a tie goes to the most civilian VP, then it is shared.

import type { DuelCardColor, DuelFinalScoringRow, DuelPlayer, DuelState } from './types';
import { wonderById } from './wonders';
import { guildCount } from './resources';
import { senateVps } from './agora';

export function scoreMatch(state: DuelState): DuelFinalScoringRow[] {
  return state.players.map((p, i) => scorePlayer(state, p, i as 0 | 1));
}

/** Grand Temples: 5 / 12 / 21 VP for 1 / 2 / 3. */
export const TEMPLE_VP = [0, 5, 12, 21];

export function scorePlayer(state: DuelState, p: DuelPlayer, seatIdx: 0 | 1): DuelFinalScoringRow {
  const civilian = printedVps(p, 'blue');
  const science = printedVps(p, 'green');
  const commercial = printedVps(p, 'yellow');
  const guild = guildVps(state, p) + templeVps(p);
  const wonders = wondersVps(p);
  const progress = progressVps(p);
  const treasury = Math.floor(p.coins / 3);
  const military = militaryVps(state.militaryPawn, seatIdx);
  const divinities = divinityVps(p);
  const senate = state.agora ? senateVps(state.agora, seatIdx) : 0;
  return {
    playerId: p.id,
    civilian, science, commercial, guild, wonders, progress, treasury, military, divinities, senate,
    total: civilian + science + commercial + guild + wonders + progress + treasury + military + divinities + senate,
    coinsAtEnd: p.coins,
  };
}

export function templeVps(p: DuelPlayer): number {
  const n = p.tableau.filter((c) => c.effects.some((e) => e.kind === 'grandTemple')).length;
  return TEMPLE_VP[Math.min(3, n)];
}

/** Aphrodite's 9 VP and 1 VP per coin still on Astarte. */
export function divinityVps(p: DuelPlayer): number {
  const pan = p.pantheon;
  if (!pan) return 0;
  return (pan.divinities.includes('aphrodite') ? 9 : 0) + (pan.divinities.includes('astarte') ? pan.astarteCoins : 0);
}

function printedVps(p: DuelPlayer, color: DuelCardColor): number {
  let v = 0;
  for (const c of p.tableau) {
    if (c.color !== color) continue;
    for (const eff of c.effects) if (eff.kind === 'vp') v += eff.vp;
  }
  return v;
}

export function guildVps(state: DuelState, p: DuelPlayer): number {
  let v = 0;
  for (const c of p.tableau) {
    for (const eff of c.effects) if (eff.kind === 'guild') v += eff.vpPer * guildCount(state, eff.what);
  }
  return v;
}

function wondersVps(p: DuelPlayer): number {
  let v = 0;
  for (const ws of p.wonders) {
    if (!ws.built) continue;
    for (const eff of wonderById(ws.wonderId).effects) if (eff.kind === 'vp') v += eff.vp;
  }
  return v;
}

export function progressVps(p: DuelPlayer): number {
  let v = 0;
  if (p.progressTokens.includes('agriculture')) v += 4;
  if (p.progressTokens.includes('philosophy')) v += 7;
  if (p.progressTokens.includes('mathematics')) v += 3 * p.progressTokens.length;
  if (p.progressTokens.includes('mysticism')) {
    v += 2 * ((p.pantheon?.mythologyTokens.length ?? 0) + (p.pantheon?.offeringTokens.length ?? 0));
  }
  return v;
}

/** Military VP for a seat with the pawn at `pawn` (positive = toward seat 1's capital). */
export function militaryVps(pawn: number, seatIdx: 0 | 1): number {
  const ahead = seatIdx === 0 ? pawn : -pawn;
  if (ahead >= 6) return 10;
  if (ahead >= 3) return 5;
  if (ahead >= 1) return 2;
  return 0;
}

/** The civilian winner: most VP, then most civilian VP; null = shared victory. */
export function civilianWinner(rows: readonly DuelFinalScoringRow[]): 0 | 1 | null {
  const [a, b] = rows;
  if (a.total !== b.total) return a.total > b.total ? 0 : 1;
  if (a.civilian !== b.civilian) return a.civilian > b.civilian ? 0 : 1;
  return null;
}
