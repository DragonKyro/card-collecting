// Jaipur AI levels: the hand-written heuristic (ai.ts) plus whichever trained
// policies are frozen into ./policies. A policy file named `<level>-….json`
// (level = easy | normal | hard — what `training/jaipur/evaluate.py freeze
// RUN@N --name hard-update8000` writes) becomes that level; the build picks
// the files up by itself, so no code changes when one is added. Each file is
// emitted as a hashed asset URL and only fetched by aiLevels.ts on demand.
//
// Small on purpose: module.ts and the lobby import this; the network runtime
// lives in aiLevels.ts, loaded by module.prepare.

import type { JaipurAiLevel, JaipurConfig } from './types';

const FILES = import.meta.glob('./policies/*.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const TRAINED: readonly JaipurAiLevel[] = ['easy', 'normal', 'hard'];

/** Policy file URL per trained level (when several match, the last file name wins). */
export const POLICY_URLS: Partial<Record<JaipurAiLevel, string>> = {};
for (const path of Object.keys(FILES).sort()) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const level = TRAINED.find((l) => name.startsWith(`${l}-`));
  if (level) POLICY_URLS[level] = FILES[path];
}

const LABELS: Record<JaipurAiLevel, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard', heuristic: 'Classic' };

/** The levels on offer: trained ones (easiest first) then the heuristic. */
export const AI_LEVELS: ReadonlyArray<{ id: JaipurAiLevel; label: string; trained: boolean }> = [
  ...TRAINED.filter((l) => POLICY_URLS[l]).map((id) => ({ id, label: LABELS[id], trained: true })),
  { id: 'heuristic', label: LABELS.heuristic, trained: false },
];

/** The strongest trained level if there is one, else the heuristic. */
export const DEFAULT_AI_LEVEL: JaipurAiLevel = [...TRAINED].reverse().find((l) => POLICY_URLS[l]) ?? 'heuristic';

export function isAiLevel(id: unknown): id is JaipurAiLevel {
  return AI_LEVELS.some((l) => l.id === id);
}

/** The config's level, or the default when it names one this build doesn't ship. */
export function aiLevelOf(config: JaipurConfig): JaipurAiLevel {
  return isAiLevel(config.aiLevel) ? config.aiLevel : DEFAULT_AI_LEVEL;
}
