// 7 Wonders module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng, shuffle, rngInt } from '@/core/rng';
import type { SwState, SwAction, SwConfig, SwPlayer } from './types';
import { applyAction, setupNewMatch } from './reducer';
import { chooseAIAction } from './ai';
import { WONDERS } from './wonders';
import { MIN_PLAYERS, MAX_PLAYERS } from './cards';
import { SevenWondersThumbnail } from './Thumbnail';

export const sevenWondersModule: GameModule<SwState, SwAction, SwConfig> = {
  id: 'seven-wonders',
  name: '7 Wonders',
  tagline: 'Build a civilization in three ages. Draft, pass, build.',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  defaultConfig(_seats: Seat[]): SwConfig {
    return {
      expansions: [],
      wonderAssignment: 'random',
      wonderSide: 'A',
    };
  },

  validateConfig(config) {
    const errors: string[] = [];
    if (config.wonderAssignment === 'preset') {
      if (!config.presetWonders || config.presetWonders.length === 0) {
        errors.push('Preset wonders required when wonder assignment is "preset".');
      }
    }
    return errors;
  },

  createInitialState(config, seed, seats) {
    const state: SwState = {
      phase: 'playing',
      seats: [],
      activePlayerId: null,
      finalScores: null,
      rngState: createRng(seed),
      config,
      age: 1,
      ageRound: 1,
      subPhase: 'picking',
      players: [],
      discard: [],
      passDirection: 'cw',
      lastMilitaryResolution: null,
      finalScoringBreakdown: null,
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

  Thumbnail: SevenWondersThumbnail,

  ui: async () => {
    const mod = await import('./ui');
    return mod.bundle;
  },
};

/** Assign a wonder to each seat per config. Returns array of wonderIds parallel to seats. */
function assignWonders(state: SwState, seats: Seat[]): string[] {
  const cfg = state.config;
  if (cfg.wonderAssignment === 'preset' && cfg.presetWonders && cfg.presetWonders.length === seats.length) {
    return cfg.presetWonders.slice();
  }
  // Random: shuffle all wonders, then for each seat pick side per config.
  const byName = new Map<string, { a: string; b: string }>();
  for (const w of WONDERS) {
    const slot = byName.get(w.name) ?? { a: '', b: '' };
    if (w.side === 'A') slot.a = w.id; else slot.b = w.id;
    byName.set(w.name, slot);
  }
  const names = shuffle(state.rngState, Array.from(byName.keys()));
  const out: string[] = [];
  for (let i = 0; i < seats.length; i++) {
    const slot = byName.get(names[i])!;
    if (cfg.wonderSide === 'A') out.push(slot.a);
    else if (cfg.wonderSide === 'B') out.push(slot.b);
    else {
      // random per seat — use seeded RNG, not Math.random (reducer must be pure)
      out.push(rngInt(state.rngState, 2) === 0 ? slot.a : slot.b);
    }
  }
  return out;
}

/** Helper to attach seats and start the match. Called by the lobby on game start. */
export function attachSeatsAndStart(state: SwState, seats: Seat[]): SwState {
  state.seats = seats;
  const wonderIds = assignWonders(state, seats);
  state.players = seats.map<SwPlayer>((s, i) => ({
    id: s.id,
    wonderId: wonderIds[i] ?? WONDERS[0].id,
    hand: [],
    tableau: [],
    wonderStagesBuilt: 0,
    coins: 3,
    militaryTokens: [],
    pendingPick: null,
  }));
  setupNewMatch(state);
  return state;
}
