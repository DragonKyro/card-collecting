// Sea Salt & Paper AI difficulty levels. All three are trained policies
// (./policies, produced by training/ssp/train.py) and load the same way:
//
//   easy    easy-update10.json     10 updates of imitating a hand-written heuristic
//   normal  normal-update40.json   + 30 reinforcement-learning (PPO) updates
//   hard    hard-update1000.json   + 990 PPO updates
//
// (The heuristic and the imitation warm start were removed after these were
// trained; new runs learn from scratch — see training/README.md.)
//
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
import { greedyPolicy, loadSspPolicy, type SspPolicyFile } from './nn/policy';
import easyUrl from './policies/easy-update10.json?url';
import normalUrl from './policies/normal-update40.json?url';
import hardUrl from './policies/hard-update1000.json?url';

export const AI_LEVELS: ReadonlyArray<{ id: SspAiLevel; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: 'Plays simple pairs and always ends rounds with STOP.' },
  { id: 'normal', label: 'Normal', blurb: 'Races to 7 points, then bets on LAST CHANCE.' },
  { id: 'hard', label: 'Hard', blurb: 'Steals, takes extra turns and wins its LAST CHANCE bets ~90% of the time. Beats Normal in about 72% of matches.' },
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
