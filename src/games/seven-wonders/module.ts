// 7 Wonders module.

import type { GameModule } from '@/core/module';
import type { Seat, PlayerId } from '@/core/types';
import { createRng, shuffle, rngInt } from '@/core/rng';
import type { SwState, SwAction, SwConfig, SwPlayer } from './types';
import { applyAction, setupNewMatch } from './reducer';
import { chooseAIAction } from './ai';
import { WONDERS, availableWonders } from './wonders';
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

  validateConfig(config, seats) {
    const errors: string[] = [];
    if ((seats?.length ?? 0) > 7 && !config.expansions.includes('cities')) {
      errors.push('8 players need the Cities expansion.');
    }
    const pool = availableWonders(config.expansions);
    for (const id of (config.presetWonders ?? []).slice(0, seats?.length)) {
      if (id && !pool.some((w) => w.id === id)) errors.push(`${WONDERS.find((w) => w.id === id)?.name ?? id} needs its expansion.`);
    }
    if (config.wonderAssignment === 'preset') {
      const names = (config.presetWonders ?? []).slice(0, seats?.length)
        .filter((id) => WONDERS.some((w) => w.id === id))
        .map((id) => WONDERS.find((w) => w.id === id)!.name);
      const dup = names.find((n, i) => names.indexOf(n) !== i);
      if (dup) errors.push(`Two seats can't both play ${dup}.`);
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

/** Assign a wonder to each seat per config. Returns array of wonderIds parallel
 *  to seats. With manual assignment a seat may name a wonder (and side); the
 *  rest are dealt from the wonders nobody picked, sided per `wonderSide`. */
function assignWonders(state: SwState, seats: Seat[]): string[] {
  const cfg = state.config;
  const pool = availableWonders(cfg.expansions);
  const byName = new Map<string, { a: string; b: string }>();
  for (const w of pool) {
    const slot = byName.get(w.name) ?? { a: '', b: '' };
    if (w.side === 'A') slot.a = w.id; else slot.b = w.id;
    byName.set(w.name, slot);
  }
  const preset = seats.map((_, i) => {
    const id = cfg.wonderAssignment === 'preset' ? cfg.presetWonders?.[i] : undefined;
    return pool.find((w) => w.id === id) ?? null;
  });
  const taken = new Set(preset.filter((w) => w !== null).map((w) => w!.name));
  // Random: shuffle the wonders nobody picked, then pick a side per config.
  const names = shuffle(state.rngState, Array.from(byName.keys()).filter((n) => !taken.has(n)));
  let next = 0;
  return seats.map((_, i) => {
    const fixed = preset[i];
    if (fixed) return fixed.id;
    const slot = byName.get(names[next++])!;
    if (cfg.wonderSide === 'A') return slot.a;
    if (cfg.wonderSide === 'B') return slot.b;
    // random per seat — use seeded RNG, not Math.random (reducer must be pure)
    return rngInt(state.rngState, 2) === 0 ? slot.a : slot.b;
  });
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
    freeBuildUsedAge: null,
  }));
  setupNewMatch(state);
  return state;
}
