// 7 Wonders Duel — GameModule.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng } from '@/core/rng';
import type { DuelState, DuelAction, DuelConfig, DuelPlayer } from './types';
import { applyAction, setupNewMatch } from './reducer';
import { chooseAIAction } from './ai';
import { SevenWondersDuelThumbnail } from './Thumbnail';

export const sevenWondersDuelModule: GameModule<DuelState, DuelAction, DuelConfig> = {
  id: 'seven-wonders-duel',
  name: '7 Wonders Duel',
  tagline: 'Standalone 2-player 7 Wonders. Pyramid draft, three paths to victory.',
  minPlayers: 2,
  maxPlayers: 2,

  defaultConfig(_seats: Seat[]): DuelConfig {
    return { variant: 'base' };
  },

  validateConfig(_config) {
    return [];
  },

  createInitialState(config, seed, seats) {
    const state: DuelState = {
      phase: 'playing',
      seats: [],
      activePlayerId: null,
      finalScores: null,
      rngState: createRng(seed),
      config,
      age: 1,
      subPhase: 'wonderDraft',
      players: [makeEmptyPlayer(''), makeEmptyPlayer('')],
      activeSeatIdx: 0,
      pyramid: [],
      cardsById: {},
      discard: [],
      militaryPawn: 0,
      militaryAwards: { p1At3: false, p1At6: false, p2At3: false, p2At6: false },
      progressOffer: [],
      pendingProgressPick: null,
      wonderDraft: null,
      pendingWonderBury: null,
      finalScoringBreakdown: null,
      endReason: null,
      winnerSeatIdx: null,
      log: [],
      logSeq: 0,
    };
    return attachSeatsAndStart(state, seats ?? []);
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return chooseAIAction(state, playerId);
  },

  Thumbnail: SevenWondersDuelThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};

function makeEmptyPlayer(id: PlayerId): DuelPlayer {
  return {
    id, tableau: [], wonders: [], coins: 0, progressTokens: [],
  };
}

export function attachSeatsAndStart(state: DuelState, seats: Seat[]): DuelState {
  // Duel requires exactly 2 seats.
  const used = seats.slice(0, 2);
  while (used.length < 2) {
    used.push({ id: `placeholder-${used.length}`, name: `Player ${used.length + 1}`, color: '#888', isAI: true, isLocal: true });
  }
  state.seats = used;
  state.players = [
    { ...makeEmptyPlayer(used[0].id) },
    { ...makeEmptyPlayer(used[1].id) },
  ];
  setupNewMatch(state);
  return state;
}
