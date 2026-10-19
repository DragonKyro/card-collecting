// Sea Salt & Paper AI difficulty levels. All three are trained policies
// (./policies, produced by training/ssp/train.py) and load the same way:
//
//   easy    easy-update100.json      update 100 of training/runs/ssp/main
//   normal  normal-update1000.json   update 1000
//   hard    hard-update10000.json    update 10000
//
// Head to head (2000 seat-swapped matches): normal beats easy 61%, hard beats
// easy 72% and normal 65%. All three beat random play ~100%. (The run began
// with 10 updates imitating a since-removed heuristic; updates 100 and 1000
// predate white counting for mermaid claims, 10000 was trained with it.)
//
// All three are encoder v2 / action space v2, played through the frozen
// nn/encodeV2.ts and nn/actionsV2.ts until v3 replacements are trained.
// Each file is ~1.3 MB. Vite emits it as a hashed asset (never inside a JS
// chunk) and it's fetched once per page, on first use. The shell awaits
// `prepareAiLevel` (via GameModule.prepare) before a match starts, so
// `chooseLeveledAction` can always answer synchronously.
//
// The policies were trained on 2-player Extra Salt matches. They play every
// supported setup legally (2–4 players, any expansions), just untuned
// outside that one.

import type { PlayerId } from '@/core/types';
import type { SspAction, SspAiLevel, SspConfig, SspState } from './types';
import type { SlotPolicy } from './nn/agent';
import { actWithPolicy } from './nn/agent';
import type { SspActionSpace } from './nn/actions';
import { greedyPolicy, loadSspPolicy, type SspPolicyFile } from './nn/policy';
import easyUrl from './policies/easy-update100.json?url';
import normalUrl from './policies/normal-update1000.json?url';
import hardUrl from './policies/hard-update10000.json?url';

export const AI_LEVELS: ReadonlyArray<{ id: SspAiLevel; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

export const DEFAULT_AI_LEVEL: SspAiLevel = 'normal';

const POLICY_URLS: Record<SspAiLevel, string> = { easy: easyUrl, normal: normalUrl, hard: hardUrl };

const policies = new Map<SspAiLevel, { policy: SlotPolicy; actions: SspActionSpace }>();
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
  const loaded = loadSspPolicy(file);
  policies.set(level, { policy: greedyPolicy(loaded), actions: loaded.actions });
}

export function chooseLeveledAction(state: SspState, playerId: PlayerId): SspAction | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'roundEnd') {
    // Click through the round summary only when no human needs to read it.
    return state.seats.some((s) => !s.isAI) ? null : { type: 'nextRound' };
  }
  if (state.activePlayerId !== playerId) return null;
  const level = aiLevelOf(state.config);
  const loaded = policies.get(level);
  if (!loaded) {
    // prepare() should have loaded it; start now so a later call can answer.
    void prepareAiLevel(level).catch(() => {});
    return null;
  }
  return actWithPolicy(state, playerId, loaded.policy, loaded.actions);
}
