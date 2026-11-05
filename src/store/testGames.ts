// Test-only: a stand-in game registry for the online-play tests
// (vi.mock('@/games/registry', () => import('@/store/testGames'))), so they
// exercise the GameModule contract rather than one real game's rules.
//
//   tally  — 2–4 players take turns adding numbers; `target` moves end it.
//            Anyone may `claim` once (a move two devices can race for).
//            AI levels easy / hard (default hard).
//   duel   — the same rules for exactly 2 players.
//   blitz  — offline only (onlineSupported: false).

import type { AnyGameModule, GameStateShape } from '@/core/module';
import type { Seat } from '@/core/types';

export interface TallyConfig {
  target: number;
}

export interface TallyState extends GameStateShape {
  moves: { by: string; n: number }[];
  claimedBy: string | null;
  target: number;
}

export type TallyAction = { type: 'add'; by: string; n: number } | { type: 'claim'; by: string };

/** Every call to any module's prepare, as [gameId, AI seat count]. */
export const prepareCalls: [string, number][] = [];

function makeModule(id: string, name: string, minPlayers: number, maxPlayers: number, extra: Partial<AnyGameModule> = {}): AnyGameModule {
  const module = {
    id,
    name,
    tagline: `${name} (test game)`,
    minPlayers,
    maxPlayers,
    defaultConfig: (): TallyConfig => ({ target: 6 }),
    validateConfig: (c: TallyConfig) => (c.target > 0 ? [] : ['The target must be at least 1.']),
    createInitialState: (c: TallyConfig, seed: number, seats: Seat[]): TallyState => ({
      phase: 'playing',
      seats,
      activePlayerId: seats[0]!.id,
      finalScores: null,
      rngState: { seed },
      moves: [],
      claimedBy: null,
      target: c.target,
    }),
    applyAction: (s: TallyState, a: TallyAction): TallyState => {
      if (a.type === 'claim') {
        if (s.claimedBy) throw new Error('Already claimed.');
        return { ...s, claimedBy: a.by };
      }
      if (s.phase !== 'playing' || a.by !== s.activePlayerId) throw new Error('Not your turn.');
      const moves = [...s.moves, { by: a.by, n: a.n }];
      const over = moves.length >= s.target;
      const finalScores: Record<string, number> = {};
      for (const seat of s.seats) finalScores[seat.id] = moves.filter((m) => m.by === seat.id).reduce((t, m) => t + m.n, 0);
      return {
        ...s,
        moves,
        phase: over ? 'gameOver' : 'playing',
        activePlayerId: over ? null : s.seats[moves.length % s.seats.length]!.id,
        finalScores: over ? finalScores : null,
      };
    },
    chooseAIAction: (s: TallyState, playerId: string): TallyAction | null =>
      s.phase === 'playing' && s.activePlayerId === playerId ? { type: 'add', by: playerId, n: 1 } : null,
    prepare: async (_c: TallyConfig, seats: Seat[]) => {
      prepareCalls.push([id, seats.filter((x) => x.isAI).length]);
    },
    ui: async () => ({ LobbyConfig: () => null, GameView: () => null }),
    ...extra,
  };
  return module as unknown as AnyGameModule;
}

export const GAMES: AnyGameModule[] = [
  makeModule('tally', 'Tally', 2, 4, {
    aiLevels: [{ id: 'easy', label: 'Easy' }, { id: 'hard', label: 'Hard' }],
    defaultAiLevel: 'hard',
  }),
  makeModule('duel', 'Duel', 2, 2),
  makeModule('blitz', 'Blitz', 1, 4, { onlineSupported: false }),
];

export function getGameById(id: string): AnyGameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
