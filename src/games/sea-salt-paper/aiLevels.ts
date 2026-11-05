// Sea Salt & Paper AI difficulty levels. All three are trained policies
// (./policies, produced by training/ssp/train.py) and load the same way:
//
//   easy    easy-update100.json            update 100 of training/runs/ssp/main
//   normal  normal-update1000.json         update 1000
//   hard    hard-pepper-update17500.json   update 17500 of training/runs/ssp/pepper
//
// Easy and Normal were trained on 2-player Extra Salt matches only. Hard
// descends from main's update 10000 (hard-update10000.json): 4,000 updates on
// 2, 3 and 4-player matches (runs/ssp/multi, hard-multi-update14000.json),
// then 3,500 on 2-4 players with and without Extra Pepper (runs/ssp/pepper).
// Both earlier Hards stay here as training benchmarks but are no longer
// shipped. Head to head (2000 seat-swapped 2-player Extra Salt matches):
// normal beats easy 61%, hard beats easy 76%, normal 67% and the previous
// hard 56%; all three beat random play ~100%. Against the previous hard on
// fresh deals (3000 matches each) it wins 53.5% at 2 players, 35.6% at 3
// (even: 33.3%) and 28.6% at 4 (even: 25%); with Extra Pepper 57.9%, 39.1%
// and 31.2%. (The main run began with 10 updates imitating a since-removed
// heuristic; updates 100 and 1000 predate white counting for mermaid claims.)
//
// Each file is ~1.7 MB. Vite emits it as a hashed asset (never inside a JS
// chunk) and it's fetched once per page, on first use. The shell awaits
// `prepareAiLevel` (via GameModule.prepare) before a match starts, so
// `chooseLeveledAction` can always answer synchronously.
//
// Every level plays every supported setup legally (2–4 players, any
// expansions); none was trained on the base game alone. Easy and Normal never
// saw Extra Pepper: their Pepper-only action slots (Water Rodeo, Coral Reef,
// Angelfish, the event choice) were added when they were upgraded to action
// space v3 and taught to copy nn/fixedChoices.ts (training/ssp/teach.py);
// everything else plays exactly as it was trained. Hard started from the same
// upgrade + teach and was then trained with Pepper.

import type { PlayerId } from '@/core/types';
import type { SspAction, SspAiLevel, SspConfig, SspState } from './types';
import type { SlotPolicy } from './nn/agent';
import { actWithPolicy } from './nn/agent';
import { greedyPolicy, loadSspPolicy, type SspPolicyFile } from './nn/policy';
import easyUrl from './policies/easy-update100.json?url';
import normalUrl from './policies/normal-update1000.json?url';
import hardUrl from './policies/hard-pepper-update17500.json?url';

export const AI_LEVELS: ReadonlyArray<{ id: SspAiLevel; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

export const DEFAULT_AI_LEVEL: SspAiLevel = 'normal';

const POLICY_URLS: Record<SspAiLevel, string> = { easy: easyUrl, normal: normalUrl, hard: hardUrl };

const policies = new Map<SspAiLevel, SlotPolicy>();
const loading = new Map<SspAiLevel, Promise<void>>();

export function aiLevelOf(config: SspConfig): SspAiLevel {
  return config.aiLevel ?? DEFAULT_AI_LEVEL;
}

/** Fetch and load a level's policy (no-op once loaded; concurrent calls share one fetch). */
export function prepareAiLevel(level: SspAiLevel): Promise<void> {
  if (policies.has(level)) return Promise.resolve();
  let pending = loading.get(level);
  if (!pending) {
    pending = fetch(POLICY_URLS[level])
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching the ${level} AI`);
        return res.json() as Promise<SspPolicyFile>;
      })
      .then((file) => installAiPolicy(level, file))
      .finally(() => loading.delete(level)); // a failed fetch can be retried
    loading.set(level, pending);
  }
  return pending;
}

/** Load a policy file for a level directly (tests and tools; the app fetches). */
export function installAiPolicy(level: SspAiLevel, file: SspPolicyFile): void {
  policies.set(level, greedyPolicy(loadSspPolicy(file)));
}

export function chooseLeveledAction(state: SspState, playerId: PlayerId): SspAction | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'roundEnd') {
    // Click through the round summary only when no human needs to read it.
    return state.seats.some((s) => !s.isAI) ? null : { type: 'nextRound' };
  }
  if (state.activePlayerId !== playerId) return null;
  const level = aiLevelOf(state.config);
  const policy = policies.get(level);
  if (!policy) {
    // prepare() should have loaded it; start now so a later call can answer.
    void prepareAiLevel(level).catch(() => {});
    return null;
  }
  return actWithPolicy(state, playerId, policy);
}
