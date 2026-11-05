// Sushi Go! Party AI difficulty levels: which exist, and which one each AI
// seat plays at (`seat.aiLevel`, picked per seat in the lobby). Small on
// purpose: module.ts and the lobby import it; the policies and the network
// runtime live in aiLevels.ts, loaded by module.prepare.

import type { Seat } from '@/core/types';
import { aiLevelsInPlay, seatAiLevel } from '@/core/seats';
import type { SushiGoAiLevel } from './types';

export const AI_LEVELS: ReadonlyArray<{ id: SushiGoAiLevel; label: string }> = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

export const DEFAULT_AI_LEVEL: SushiGoAiLevel = 'normal';

export function isAiLevel(id: unknown): id is SushiGoAiLevel {
  return AI_LEVELS.some((l) => l.id === id);
}

/** The level a seat plays at (its own, or the default when it names none this build ships). */
export function aiLevelOfSeat(seat: Pick<Seat, 'aiLevel'> | undefined): SushiGoAiLevel {
  return seatAiLevel(AI_LEVELS, DEFAULT_AI_LEVEL, seat);
}

/** Every level the AI seats play at, each once. */
export function aiLevelsOf(seats: readonly Seat[]): SushiGoAiLevel[] {
  return aiLevelsInPlay(AI_LEVELS, DEFAULT_AI_LEVEL, seats);
}
