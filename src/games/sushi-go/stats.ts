// Sushi Go! Party — post-game match stats, derived from a finished match's
// round history and log (nothing extra is recorded during play). The
// game-over panel (StatsPanel.tsx) charts them.
//
// Turns are read off the log: one turn's reveal is a run of consecutive
// `pickRevealed` entries (the reducer logs every seat's pick in one batch),
// and everything up to the next reveal — special orders, spoons, menus,
// takeout boxes, miso clashes, uramaki claims — happened during that turn.

import type { PlayerId } from '@/core/types';
import type { SushiGoCardKind, SushiGoLogEntry, SushiGoState } from './types';
import { KIND_INFO } from './cards';

type LoggedCard = { kind: SushiGoCardKind; variant?: string };

/** Kinds that never score by themselves: what they do shows up under other cards. */
export const ENABLER_KINDS: ReadonlySet<SushiGoCardKind> = new Set(['wasabi', 'chopsticks', 'spoon', 'menu', 'specialOrder']);

export interface SgpPlayerStats {
  playerId: PlayerId;
  /** Running score: 0, after each round, then with desserts. */
  cumulative: number[];
  roundTotals: number[];
  dessertScore: number;
  final: number;
  /** Match points per kind. A flipped card's 2 sit under the takeout box, desserts under the menu's dessert. */
  pointsByKind: Partial<Record<SushiGoCardKind, number>>;
  /** Cards brought to the table, by printed kind: picks, cards played off a menu, cards a spoon fetched. */
  takenByKind: Partial<Record<SushiGoCardKind, number>>;
  /** As `takenByKind`, but a special order counts as the card it copied. */
  scoredAsByKind: Partial<Record<SushiGoCardKind, number>>;
}

/** Something a seat's card did during a turn, after the reveal. */
export type SgpTurnEvent =
  | { type: 'copy'; card: LoggedCard | null }
  | { type: 'spoon'; asked: LoggedCard; fromId: PlayerId | null }
  | { type: 'gaveSpoon'; asked: LoggedCard; toId: PlayerId }
  | { type: 'menu'; card: LoggedCard | null }
  | { type: 'flipped'; count: number }
  | { type: 'misoDiscarded' }
  | { type: 'uramaki'; points: number };

export interface SgpTurn {
  round: number;
  /** 1-based within the round. */
  turn: number;
  /** Cards each seat picked from its hand (two with chopsticks). */
  picks: Record<PlayerId, LoggedCard[]>;
  events: Record<PlayerId, SgpTurnEvent[]>;
}

export interface SgpMatchStats {
  players: SgpPlayerStats[];
  turns: SgpTurn[];
  /** Menu kinds in menu order. */
  menu: SushiGoCardKind[];
  rounds: number;
}

const bump = (rec: Partial<Record<SushiGoCardKind, number>>, kind: SushiGoCardKind, by = 1) => {
  rec[kind] = (rec[kind] ?? 0) + by;
};

export function matchStats(state: SushiGoState): SgpMatchStats {
  const ids = state.players.map((p) => p.id);
  const dessert = state.config.menu.find((k) => KIND_INFO[k].category === 'dessert');
  const turns = turnsOf(state.log, ids);

  const players = state.players.map((p): SgpPlayerStats => {
    const roundTotals = state.roundHistory.map((r) => r.perPlayer.find((x) => x.playerId === p.id)?.total ?? 0);
    const cumulative = [0];
    for (const t of roundTotals) cumulative.push(cumulative[cumulative.length - 1] + t);
    const dessertScore = state.phase === 'gameOver' ? p.dessertScore : 0;
    if (state.phase === 'gameOver') cumulative.push(cumulative[cumulative.length - 1] + dessertScore);

    const pointsByKind: SgpPlayerStats['pointsByKind'] = {};
    for (const r of state.roundHistory) {
      for (const k of r.perPlayer.find((x) => x.playerId === p.id)?.perKind ?? []) bump(pointsByKind, k.kind, k.points);
    }
    if (dessert && state.phase === 'gameOver') bump(pointsByKind, dessert, dessertScore);

    const takenByKind: SgpPlayerStats['takenByKind'] = {};
    const scoredAsByKind: SgpPlayerStats['scoredAsByKind'] = {};
    const take = (kind: SushiGoCardKind) => { bump(takenByKind, kind); bump(scoredAsByKind, kind); };
    for (const t of turns) {
      for (const c of t.picks[p.id] ?? []) take(c.kind);
      for (const e of t.events[p.id] ?? []) {
        if (e.type === 'menu' && e.card) take(e.card.kind);
        if (e.type === 'spoon' && e.fromId) take(e.asked.kind);
        if (e.type === 'copy' && e.card) {
          bump(scoredAsByKind, 'specialOrder', -1);
          bump(scoredAsByKind, e.card.kind);
        }
      }
    }
    return {
      playerId: p.id,
      cumulative,
      roundTotals,
      dessertScore,
      final: state.finalScores?.[p.id] ?? cumulative[cumulative.length - 1],
      pointsByKind,
      takenByKind,
      scoredAsByKind,
    };
  });

  return { players, turns, menu: state.config.menu, rounds: state.roundHistory.length };
}

/** Split the log into turns (see the header). */
export function turnsOf(log: readonly SushiGoLogEntry[], ids: readonly PlayerId[]): SgpTurn[] {
  const turns: SgpTurn[] = [];
  let current: SgpTurn | null = null;
  let inReveal = false;
  const blank = (round: number, turn: number): SgpTurn => ({
    round,
    turn,
    picks: Object.fromEntries(ids.map((id) => [id, []])),
    events: Object.fromEntries(ids.map((id) => [id, []])),
  });
  const add = (id: PlayerId, e: SgpTurnEvent) => { current?.events[id]?.push(e); };
  for (const e of log) {
    if (e.kind === 'pickRevealed') {
      // A seat already revealed in this run can only mean a new turn.
      const again = (current?.picks[e.playerId]?.length ?? 0) > 0;
      if (!inReveal || !current || current.round !== e.round || again) {
        const turn: number = current && current.round === e.round ? current.turn + 1 : 1;
        current = blank(e.round, turn);
        turns.push(current);
      }
      inReveal = true;
      current.picks[e.playerId] = [...(current.picks[e.playerId] ?? []), ...e.cards];
      continue;
    }
    // Anything else (the next turn's pickSubmitted too) ends the reveal run.
    inReveal = false;
    if (e.kind === 'pickSubmitted' || !current || current.round !== e.round) continue;
    switch (e.kind) {
      case 'copied': add(e.playerId, { type: 'copy', card: e.card }); break;
      case 'spoon':
        add(e.playerId, { type: 'spoon', asked: e.asked, fromId: e.fromId });
        if (e.fromId) add(e.fromId, { type: 'gaveSpoon', asked: e.asked, toId: e.playerId });
        break;
      case 'menu': add(e.playerId, { type: 'menu', card: e.card }); break;
      case 'flipped': add(e.playerId, { type: 'flipped', count: e.count }); break;
      case 'misoDiscarded': for (const id of e.playerIds) add(id, { type: 'misoDiscarded' }); break;
      case 'uramaki': add(e.playerId, { type: 'uramaki', points: e.points }); break;
      default: break;
    }
  }
  return turns;
}
