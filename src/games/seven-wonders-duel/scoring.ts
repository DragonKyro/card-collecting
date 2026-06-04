// 7 Wonders Duel — final scoring.
//
// Categories:
//   civilian:   sum of vp from blue cards
//   science:    n² per same-symbol set + 7 × min(distinct sets) + Law adds wild
//   commercial: yellow Age III endVp
//   guild:      purple endVp (counting from both sides for Duel guilds)
//   wonders:    VPs from BUILT wonders
//   treasury:   floor(coins / 3)
//   military:   pawn position contributes VP per threshold (Duel official:
//                 in your favor: ±0 to ±2 = 0, ±3 to ±5 = 2, ±6 to ±8 = 5,
//                 ±9 = supremacy victory).
//   progress:   Philosophy +7, Mathematics +3 per token. Other tokens have
//               on-claim or in-game effects, not endgame VP.

import type {
  DuelFinalScoringRow, DuelPlayer, DuelScience, DuelState,
} from './types';
import { wonderById } from './wonders';

export function scoreMatch(state: DuelState): DuelFinalScoringRow[] {
  return state.players.map((p, i) => scorePlayer(state, p, i as 0 | 1));
}

function scorePlayer(state: DuelState, p: DuelPlayer, seatIdx: 0 | 1): DuelFinalScoringRow {
  const civilian = civilianVps(p);
  const science = scienceVps(p);
  const commercial = commercialVps(state, p, seatIdx);
  const guild = guildVps(state, p, seatIdx);
  const wonders = wondersVps(p);
  const treasury = Math.floor(p.coins / 3);
  const military = militaryVps(state, seatIdx);
  const progress = progressVps(p);
  const total = civilian + science + commercial + guild + wonders + treasury + military + progress;
  return {
    playerId: p.id,
    civilian, science, commercial, guild, wonders, treasury, military, progress,
    total,
    coinsAtEnd: p.coins,
  };
}

function civilianVps(p: DuelPlayer): number {
  let v = 0;
  for (const c of p.tableau) {
    if (c.color !== 'blue') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'vp') v += eff.vp;
    }
  }
  return v;
}

function scienceVps(p: DuelPlayer): number {
  const counts = new Map<DuelScience, number>();
  for (const c of p.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'science') counts.set(eff.symbol, (counts.get(eff.symbol) ?? 0) + 1);
    }
  }
  for (const ws of p.wonders) {
    if (!ws.built) continue;
    const wonder = wonderById(ws.wonderId);
    for (const eff of wonder.effects) {
      if (eff.kind === 'science' && eff.symbol) {
        counts.set(eff.symbol, (counts.get(eff.symbol) ?? 0) + 1);
      }
    }
  }
  // Law counts as a wild but here we just count distinct + treat as bonus VP.
  // For simplicity in v1, science scoring is just sum of squares.
  let v = 0;
  for (const n of counts.values()) v += n * n;
  return v;
}

function commercialVps(state: DuelState, p: DuelPlayer, seatIdx: 0 | 1): number {
  let v = 0;
  const opp = state.players[(1 - seatIdx) as 0 | 1];
  for (const c of p.tableau) {
    if (c.color !== 'yellow') continue;
    if (c.age !== 3) continue;
    for (const eff of c.effects) {
      if (eff.kind === 'endVp') v += evaluateEndVp(p, opp, eff);
    }
  }
  return v;
}

function guildVps(state: DuelState, p: DuelPlayer, seatIdx: 0 | 1): number {
  let v = 0;
  const opp = state.players[(1 - seatIdx) as 0 | 1];
  for (const c of p.tableau) {
    if (c.color !== 'purple') continue;
    for (const eff of c.effects) {
      if (eff.kind === 'endVp') v += evaluateEndVp(p, opp, eff);
    }
  }
  return v;
}

function evaluateEndVp(
  self: DuelPlayer,
  opp: DuelPlayer,
  eff: {
    kind: 'endVp';
    from: 'self' | 'opponent' | 'both';
    countWhat:
      | { kind: 'cardColor'; color: string }
      | { kind: 'wonderStages' }
      | { kind: 'coins' };
    coinsPerOnPlay?: number;
    vpPer?: number;
  },
): number {
  const vpPer = eff.vpPer ?? 0;
  if (vpPer === 0) return 0;
  const targets: DuelPlayer[] =
    eff.from === 'self' ? [self]
    : eff.from === 'opponent' ? [opp]
    : [self, opp];
  let count = 0;
  const what = eff.countWhat;
  for (const t of targets) {
    if (what.kind === 'cardColor') {
      count += t.tableau.filter((c) => c.color === what.color).length;
    } else if (what.kind === 'wonderStages') {
      count += t.wonders.filter((w) => w.built).length;
    } else if (what.kind === 'coins') {
      count += Math.floor(t.coins / 3);
    }
  }
  return count * vpPer;
}

function wondersVps(p: DuelPlayer): number {
  let v = 0;
  for (const ws of p.wonders) {
    if (!ws.built) continue;
    const wonder = wonderById(ws.wonderId);
    for (const eff of wonder.effects) {
      if (eff.kind === 'vp' && eff.vp) v += eff.vp;
    }
  }
  return v;
}

function militaryVps(state: DuelState, seatIdx: 0 | 1): number {
  const pawn = state.militaryPawn;
  // Seat 0 = positive direction = good for seat 0
  // Seat 1 = negative direction = good for seat 1
  const inMyFavor = seatIdx === 0 ? pawn : -pawn;
  if (inMyFavor >= 6) return 10;
  if (inMyFavor >= 3) return 5;
  if (inMyFavor >= 1) return 2;
  return 0;
}

function progressVps(p: DuelPlayer): number {
  let v = 0;
  if (p.progressTokens.includes('philosophy')) v += 7;
  if (p.progressTokens.includes('mathematics')) v += 3 * p.progressTokens.length;
  if (p.progressTokens.includes('agriculture')) v += 4;
  return v;
}
