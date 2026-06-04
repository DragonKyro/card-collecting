// Air, Land & Sea module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng } from '@/core/rng';
import type { AlsState, AlsAction, AlsConfig, AlsPlayer } from './types';
import { applyAction, setupNewMatch } from './reducer';
import { chooseAIAction } from './ai';
import {
  BASE_THEATER_IDS, DEFAULT_TARGET_VP, MIN_PLAYERS, MAX_PLAYERS, buildDeckPool,
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
      theaters: BASE_THEATER_IDS.slice(),       // [air, land, sea]
      expansions: { spiesLiesSupplies: false },
      targetVp: DEFAULT_TARGET_VP,
    };
  },

  validateConfig(config) {
    const errs: string[] = [];
    if (config.theaters.length !== 3 && config.theaters.length !== 5) {
      errs.push('Pick exactly 3 theaters (or 5 for Epic Mode).');
    }
    const dupes = new Set<string>();
    for (const t of config.theaters) {
      if (dupes.has(t)) { errs.push(`Duplicate theater: ${t}.`); break; }
      dupes.add(t);
    }
    const epicWantsSls = config.theaters.length === 5;
    const slsOn = !!config.expansions?.spiesLiesSupplies;
    if (epicWantsSls && !slsOn) {
      errs.push('Epic Mode (5 theaters) requires the Spies, Lies, & Supplies expansion.');
    }
    if (!slsOn && config.theaters.some((t) => t !== 'air' && t !== 'land' && t !== 'sea')) {
      errs.push('Intelligence / Diplomacy / Economics theaters require the expansion to be enabled.');
    }
    if (config.targetVp < 6 || config.targetVp > 30) {
      errs.push('Target VP must be 6–30.');
    }
    return errs;
  },

  createInitialState(config, seed, seats) {
    const rngState = createRng(seed);
    const state: AlsState = {
      phase: 'playing',
      seats: [],
      activePlayerId: null,
      finalScores: null,
      rngState,
      config,
      deckPool: buildDeckPool(config.theaters),
      deck: [],
      discard: [],
      battleNumber: 1,
      firstPlayerSeatIdx: 0,
      players: [
        { id: '', hand: [], airDropArmed: false, vp: 0 },
        { id: '', hand: [], airDropArmed: false, vp: 0 },
      ],
      playedCards: config.theaters.map(() => [[], []]),
      supplyTokens: config.theaters.map(() => [0, 0]),
      subPhase: 'awaitingAction',
      pendingAbility: null,
      lastBattleResult: null,
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

  Thumbnail: AirLandSeaThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};

/** Helper to attach seats and start the match. Called by createInitialState. */
export function attachSeatsAndStart(state: AlsState, seats: Seat[]): AlsState {
  state.seats = seats;
  if (seats.length < 2) {
    // Shell-level validation should catch this — but be safe.
    return state;
  }
  state.players = [
    { id: seats[0].id, hand: [], airDropArmed: false, vp: 0 },
    { id: seats[1].id, hand: [], airDropArmed: false, vp: 0 },
  ] as [AlsPlayer, AlsPlayer];
  setupNewMatch(state);
  return state;
}
