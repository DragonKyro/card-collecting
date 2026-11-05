// Sea Salt & Paper AI difficulty levels: which exist, and which one each AI
// seat plays at (`seat.aiLevel`, picked per seat in the lobby). Small on
// purpose: module.ts and the lobby import it; the policies and the network
// runtime live in aiLevels.ts, loaded by module.prepare.

import type { Seat } from '@/core/types';
import { aiLevelsInPlay, seatAiLevel } from '@/core/seats';
import type { SspAiLevel } from './types';

export const AI_LEVELS: ReadonlyArray<{ id: SspAiLevel; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

export const DEFAULT_AI_LEVEL: SspAiLevel = 'normal';

export function isAiLevel(id: unknown): id is SspAiLevel {
  return AI_LEVELS.some((l) => l.id === id);
}

/** The level a seat plays at (its own, or the default when it names none this build ships). */
export function aiLevelOfSeat(seat: Pick<Seat, 'aiLevel'> | undefined): SspAiLevel {
  return seatAiLevel(AI_LEVELS, DEFAULT_AI_LEVEL, seat);
}

/** Every level the AI seats play at, each once. */
export function aiLevelsOf(seats: readonly Seat[]): SspAiLevel[] {
  return aiLevelsInPlay(AI_LEVELS, DEFAULT_AI_LEVEL, seats);
}
