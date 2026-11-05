// Jaipur AI levels: the trained policies frozen into ./policies. A policy
// file named `<level>-….json` (level = easy | normal | hard — what
// `training/jaipur/evaluate.py freeze RUN@N --name hard-update8000` writes)
// becomes that level; the build picks the files up by itself, so no code
// changes when one is added. Each file is emitted as a hashed asset URL and
// only fetched by aiLevels.ts on demand.
//
// Small on purpose: module.ts and the lobby import this; the network runtime
// lives in aiLevels.ts, loaded by module.prepare.

import type { Seat } from '@/core/types';
import { aiLevelsInPlay, seatAiLevel } from '@/core/seats';
import type { JaipurAiLevel } from './types';

const FILES = import.meta.glob('./policies/*.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

const LEVELS: readonly JaipurAiLevel[] = ['easy', 'normal', 'hard'];

/** Policy file URL per level (when several match, the last file name wins). */
export const POLICY_URLS: Partial<Record<JaipurAiLevel, string>> = {};
for (const path of Object.keys(FILES).sort()) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const level = LEVELS.find((l) => name.startsWith(`${l}-`));
  if (level) POLICY_URLS[level] = FILES[path];
}

const LABELS: Record<JaipurAiLevel, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

/** The levels on offer, easiest first: one per shipped policy. */
export const AI_LEVELS: ReadonlyArray<{ id: JaipurAiLevel; label: string }> =
  LEVELS.filter((l) => POLICY_URLS[l]).map((id) => ({ id, label: LABELS[id] }));

/** The strongest shipped level. */
export const DEFAULT_AI_LEVEL: JaipurAiLevel = AI_LEVELS.at(-1)?.id ?? 'hard';

export function isAiLevel(id: unknown): id is JaipurAiLevel {
  return AI_LEVELS.some((l) => l.id === id);
}

/** The level an AI seat plays at (`seat.aiLevel`, picked per seat in the
 *  lobby), or the default when it names none this build ships. */
export function aiLevelOfSeat(seat: Pick<Seat, 'aiLevel'> | undefined): JaipurAiLevel {
  return seatAiLevel(AI_LEVELS, DEFAULT_AI_LEVEL, seat);
}

/** Every level the AI seats play at, each once. */
export function aiLevelsOf(seats: readonly Seat[]): JaipurAiLevel[] {
  return aiLevelsInPlay(AI_LEVELS, DEFAULT_AI_LEVEL, seats);
}
