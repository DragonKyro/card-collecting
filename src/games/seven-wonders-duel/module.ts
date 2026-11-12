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
  // Base game: face-down pyramid cards are hidden from both players alike;
  // everything else (cities, coins, wonders, tokens) is on the table. The
  // expansions add what only one player knows — Pantheon's Divinities placed
  // face down in Age I, Agora's Conspiracies — so hot-seat play passes the
  // device again.
  hiddenInfo: (state) => !!(state.config.pantheon || state.config.agora),

  defaultConfig(_seats: Seat[]): DuelConfig {
    return { variant: 'base' };
  },

  validateConfig(config) {
    const errors: string[] = [];
    if (config.pantheon !== undefined && typeof config.pantheon !== 'boolean') errors.push('Pantheon must be on or off.');
    if (config.agora !== undefined && typeof config.agora !== 'boolean') errors.push('Agora must be on or off.');
    return errors;
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
      firstSeatIdx: 0,
      pyramid: [],
      cardsById: {},
      discard: [],
      militaryPawn: 0,
      militaryAwards: { p1At3: false, p1At6: false, p2At3: false, p2At6: false },
      progressOffer: [],
      progressBox: [],
      pending: [],
      replay: false,
      wonderDraft: null,
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

  // Long enough for the previous move's card to land before the AI answers.
  aiDelayMs(state) {
    return state.subPhase === 'turn' ? 900 : 650;
  },

  // The shell's look around this game (lobby banner, game bar, page).
  theme: {
    accent: '#d9a441',
    accentInk: '#241500',
    titleFont: 'var(--font-classical)',
    backdrop: 'radial-gradient(800px 700px at -6% 50%, rgba(220, 70, 60, 0.24), transparent 70%), radial-gradient(800px 700px at 106% 50%, rgba(70, 120, 230, 0.24), transparent 70%), linear-gradient(180deg, #2d2016 0%, #1c140d 100%)',
  },

  Thumbnail: SevenWondersDuelThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};

function makeEmptyPlayer(id: PlayerId): DuelPlayer {
  return { id, tableau: [], wonders: [], coins: 0, progressTokens: [] };
}

export function attachSeatsAndStart(state: DuelState, seats: Seat[]): DuelState {
  // Duel requires exactly 2 seats.
  const used = seats.slice(0, 2);
  while (used.length < 2) {
    used.push({ id: `placeholder-${used.length}`, name: `Player ${used.length + 1}`, color: '#888', isAI: true, isLocal: true });
  }
  state.seats = used;
  state.players = [makeEmptyPlayer(used[0].id), makeEmptyPlayer(used[1].id)];
  setupNewMatch(state);
  return state;
}
