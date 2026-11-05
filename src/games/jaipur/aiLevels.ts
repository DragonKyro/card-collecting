// Jaipur trained AI levels: fetching, loading and playing the policy files
// that levels.ts found in ./policies (produced by training/jaipur/train.py
// and frozen with `evaluate.py freeze`). Loaded on demand by module.prepare,
// keeping the network runtime out of the game-picker bundle. The shell awaits
// `prepareAiLevel` before a match starts, so `chooseLeveledAction` can always
// answer synchronously.

import type { PlayerId } from '@/core/types';
import type { JaipurAction, JaipurAiLevel, JaipurState } from './types';
import { POLICY_URLS, aiLevelOfSeat } from './levels';
import type { SlotPolicy } from './nn/agent';
import { actWithPolicy } from './nn/agent';
import { greedyPolicy, loadJaipurPolicy, type JaipurPolicyFile } from './nn/policy';

const policies = new Map<JaipurAiLevel, SlotPolicy>();
const loading = new Map<JaipurAiLevel, Promise<void>>();

/** Fetch and load a level's policy (no-op once loaded; concurrent calls share one fetch). */
export function prepareAiLevel(level: JaipurAiLevel): Promise<void> {
  if (policies.has(level)) return Promise.resolve();
  const url = POLICY_URLS[level];
  if (!url) return Promise.reject(new Error(`no ${level} AI in this build`));
  let pending = loading.get(level);
  if (!pending) {
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching the ${level} AI`);
        return res.json() as Promise<JaipurPolicyFile>;
      })
      .then((file) => installAiPolicy(level, file))
      .finally(() => loading.delete(level)); // a failed fetch can be retried
    loading.set(level, pending);
  }
  return pending;
}

/** Load a policy file for a level directly (tests and tools; the app fetches). */
export function installAiPolicy(level: JaipurAiLevel, file: JaipurPolicyFile): void {
  policies.set(level, greedyPolicy(loadJaipurPolicy(file)));
}

export function chooseLeveledAction(state: JaipurState, playerId: PlayerId): JaipurAction | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'roundEnd') {
    // Click through the round summary only when no human needs to read it.
    return state.seats.every((s) => s.isAI) ? { type: 'nextRound' } : null;
  }
  if (state.activePlayerId !== playerId) return null;
  // Each AI seat plays at its own level.
  const level = aiLevelOfSeat(state.seats.find((s) => s.id === playerId));
  const policy = policies.get(level);
  if (!policy) {
    // prepare() should have loaded it; start now so a later call can answer.
    void prepareAiLevel(level).catch(() => {});
    return null;
  }
  return actWithPolicy(state, playerId, policy);
}
