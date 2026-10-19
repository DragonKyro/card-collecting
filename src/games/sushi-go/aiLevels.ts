// Sushi Go! Party AI difficulty levels. All three are trained policies
// (./policies, produced by training/sgp/train.py) and load the same way:
//
//   easy    easy-update100.json      update 100 of training/runs/sgp/main
//   normal  normal-update1000.json   update 1000
//   hard    hard-update10000.json    update 10000 (the end of the run)
//
// Head to head over 2000 seat-swapped 2-player matches on random menus:
// normal beats easy 84.5%, hard beats normal 75.5% and easy 93.7%; all three
// beat random play ~99–100%. Each file's `meta.benchmark` records its own
// numbers from when it was frozen (incl. vs a since-removed hand-written
// heuristic, the run's original baseline).
//
// Each file is ~1.3 MB. Vite emits it as a hashed asset (never inside a JS
// chunk) and it's fetched once per page, on first use. The shell awaits
// `prepareAiLevel` (via GameModule.prepare) before a match starts, so
// `chooseLeveledAction` can always answer synchronously.
//
// The policies were trained on 2-player matches with a random legal menu every
// game. They play every supported setup legally (2–8 players, any menu), just
// untuned outside the 2-player case.

import type { PlayerId } from '@/core/types';
import type { SushiGoAction, SushiGoAiLevel, SushiGoConfig, SushiGoState } from './types';
import type { SlotPolicy } from './nn/agent';
import { actWithPolicy } from './nn/agent';
import { greedyPolicy, loadSushiGoPolicy, type SushiGoPolicyFile } from './nn/policy';
import easyUrl from './policies/easy-update100.json?url';
import normalUrl from './policies/normal-update1000.json?url';
import hardUrl from './policies/hard-update10000.json?url';

export const AI_LEVELS: ReadonlyArray<{ id: SushiGoAiLevel; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

export const DEFAULT_AI_LEVEL: SushiGoAiLevel = 'normal';

const POLICY_URLS: Record<SushiGoAiLevel, string> = { easy: easyUrl, normal: normalUrl, hard: hardUrl };

const policies = new Map<SushiGoAiLevel, SlotPolicy>();
const loading = new Map<SushiGoAiLevel, Promise<void>>();

export function aiLevelOf(config: SushiGoConfig): SushiGoAiLevel {
  return config.aiLevel ?? DEFAULT_AI_LEVEL;
}

/** Fetch and load a level's policy (no-op once loaded; concurrent calls share one fetch). */
export function prepareAiLevel(level: SushiGoAiLevel): Promise<void> {
  if (policies.has(level)) return Promise.resolve();
  let pending = loading.get(level);
  if (!pending) {
    pending = fetch(POLICY_URLS[level])
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching the ${level} AI`);
        return res.json() as Promise<SushiGoPolicyFile>;
      })
      .then((file) => installAiPolicy(level, file))
      .finally(() => loading.delete(level)); // a failed fetch can be retried
    loading.set(level, pending);
  }
  return pending;
}

/** Load a policy file for a level directly (tests and tools; the app fetches). */
export function installAiPolicy(level: SushiGoAiLevel, file: SushiGoPolicyFile): void {
  policies.set(level, greedyPolicy(loadSushiGoPolicy(file)));
}

export function chooseLeveledAction(state: SushiGoState, playerId: PlayerId): SushiGoAction | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'roundEnd') {
    // Click through the round summary only when no human needs to read it.
    return state.seats.some((s) => !s.isAI) ? null : { type: 'nextRound' };
  }
  const level = aiLevelOf(state.config);
  const policy = policies.get(level);
  if (!policy) {
    // prepare() should have loaded it; start now so a later call can answer.
    void prepareAiLevel(level).catch(() => {});
    return null;
  }
  // Null when it isn't this seat's decision (already picked, or someone else's
  // special card is being resolved): the observation then has nothing to ask.
  return actWithPolicy(state, playerId, policy);
}
