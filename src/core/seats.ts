// Game-agnostic seat helpers modules share: who a simultaneous decision waits
// on next, and which AI level a seat plays at.

import type { PlayerId, Seat } from './types';

/** Human seats sharing this device (hot-seat). Online seats are never `isLocal`. */
export function sharedDeviceHumans(seats: readonly Seat[]): number {
  return seats.filter((s) => !s.isAI && s.isLocal).length;
}

/**
 * Who `activePlayerId` should park on during a simultaneous decision
 * (everyone picks at once), given the seats still owing one, in seat order.
 * The GameHost AI driver acts for an AI seat; a human seat parked here is the
 * one hot-seat hands the device to. AIs go first — done while the humans
 * think — unless two or more humans share this device: then the humans go
 * first, one after another, and the AIs last, so no hand is on screen while
 * an AI plays and every human gets the device. Null once nobody owes one.
 */
export function nextSimultaneousSeat(seats: readonly Seat[], waiting: readonly PlayerId[]): PlayerId | null {
  const isAI = (id: PlayerId) => seats.find((s) => s.id === id)?.isAI === true;
  const ai = waiting.find(isAI);
  const human = waiting.find((id) => !isAI(id));
  const humansFirst = sharedDeviceHumans(seats) >= 2;
  return (humansFirst ? human ?? ai : ai ?? human) ?? null;
}

/** The level an AI seat plays at: its own `aiLevel` when the module offers it, else `defaultLevel`. */
export function seatAiLevel<L extends string>(
  levels: ReadonlyArray<{ id: L }>,
  defaultLevel: L,
  seat: Pick<Seat, 'aiLevel'> | undefined,
): L {
  const id = seat?.aiLevel;
  return id !== undefined && levels.some((l) => l.id === id) ? (id as L) : defaultLevel;
}

/** Every level the AI seats among `seats` play at, each once (what `prepare` must load). */
export function aiLevelsInPlay<L extends string>(
  levels: ReadonlyArray<{ id: L }>,
  defaultLevel: L,
  seats: readonly Seat[],
): L[] {
  return [...new Set(seats.filter((s) => s.isAI).map((s) => seatAiLevel(levels, defaultLevel, s)))];
}
