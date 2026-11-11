// Air, Land & Sea module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng } from '@/core/rng';
import type { AlsState, AlsAction, AlsConfig } from './types';
import { applyAction, freshPlayer, setupNewMatch } from './reducer';
import { chooseAIAction } from './ai';
import {
  BASE_THEATER_IDS, DEFAULT_TARGET_VP, MIN_PLAYERS, MAX_PLAYERS, THEATER_DEFS,
} from './cards';
import { AirLandSeaThumbnail } from './Thumbnail';

export const airLandSeaModule: GameModule<AlsState, AlsAction, AlsConfig> = {
  id: 'air-land-sea',
  name: 'Air, Land & Sea',
  tagline: 'Two commanders. Three theaters. Bluff, deploy, withdraw.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  defaultConfig(_seats: Seat[]): AlsConfig {
    return {
      theaters: BASE_THEATER_IDS.slice(),
      randomOrder: true,
      expansions: { spiesLiesSupplies: false },
      targetVp: DEFAULT_TARGET_VP,
    };
  },

  validateConfig(config) {
    const errs: string[] = [];
    const want = config.epic || config.theaters.length > 3 ? 5 : 3;
    if (config.theaters.length !== want) {
      errs.push(want === 5 ? 'Pick 5 theaters for Epic Mode.' : 'Pick exactly 3 theaters.');
    }
    if (new Set(config.theaters).size !== config.theaters.length) errs.push('Each theater can only be used once.');
    const sls = !!config.expansions?.spiesLiesSupplies;
    if (!sls && config.theaters.some((t) => THEATER_DEFS[t].expansion)) {
      errs.push('Intelligence, Diplomacy and Economics need Spies, Lies & Supplies.');
    }
    if (config.theaters.length === 5 && !sls) errs.push('Epic Mode (5 theaters) needs Spies, Lies & Supplies.');
    if (!Number.isInteger(config.targetVp) || config.targetVp < 1 || config.targetVp > 30) {
      errs.push('Target VP must be 1–30.');
    }
    return errs;
  },

  createInitialState(config, seed, seats) {
    const state: AlsState = {
      phase: 'playing',
      seats,
      activePlayerId: null,
      finalScores: null,
      rngState: createRng(seed),
      config,
      theaters: config.theaters.slice(),
      deck: [],
      battleNumber: 1,
      firstPlayerSeatIdx: 0,
      turnSeatIdx: 0,
      players: [freshPlayer(seats[0]?.id ?? ''), freshPlayer(seats[1]?.id ?? '')],
      board: [],
      supplies: [],
      subPhase: 'action',
      queue: [],
      frame: null,
      pending: null,
      lastBattleResult: null,
      log: [],
      logSeq: 0,
    };
    if (seats.length >= 2) setupNewMatch(state);
    return state;
  },

  applyAction(state, action) {
    return applyAction(state, action);
  },

  chooseAIAction(state, playerId: PlayerId) {
    return chooseAIAction(state, playerId);
  },

  // Long enough to follow the AI's card landing and any flips it sets off.
  aiDelayMs: () => 650,

  // The shell's look around this game (lobby banner, game bar, page).
  theme: {
    accent: '#e9c46a',
    accentInk: '#231a00',
    titleFont: 'var(--font-stencil)',
    backdrop: 'radial-gradient(1000px 560px at 50% -6%, rgba(255, 214, 140, 0.13), transparent 70%), radial-gradient(1500px 1000px at 50% 35%, transparent 50%, rgba(0, 0, 0, 0.42) 100%), repeating-linear-gradient(0deg, rgba(160, 220, 180, 0.05) 0 1px, transparent 1px 48px), repeating-linear-gradient(90deg, rgba(160, 220, 180, 0.05) 0 1px, transparent 1px 48px), repeating-linear-gradient(0deg, rgba(160, 220, 180, 0.04) 0 1px, transparent 1px 240px), repeating-linear-gradient(90deg, rgba(160, 220, 180, 0.04) 0 1px, transparent 1px 240px), linear-gradient(180deg, #1b2a26 0%, #121c1a 60%, #0c1312 100%)',
  },

  Thumbnail: AirLandSeaThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};
