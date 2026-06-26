// Per-match timing for Sea Salt & Paper. NOT part of the replicated SspState
// (would churn the reducer on every wall-clock tick); lives in a local zustand
// store keyed by playerId. Tracks:
//   - matchStartedAt:   the wall-clock time the current match began (used by
//                       the in-game clock).
//   - playerTimeMs:     cumulative ms spent on each player's "turn" since
//                       the match began. We credit the gap between the
//                       previous tick and the current one to whoever was
//                       active during that gap.
//   - activeSeen:       the seat id we attributed the previous tick to,
//                       so the next tick can compute the gap accurately.
//   - lastTickAt:       last time we observed a state change.
//
// API:
//   - resetForMatch():  zero everything, set matchStartedAt = now.
//   - onActiveChanged(activeSeatId): call whenever state.activePlayerId
//     changes (we update the gap and switch to the new actor).
//   - perPlayer:        snapshot map of accumulated ms per seat id.

import { create } from 'zustand';
import type { PlayerId } from '@/core/types';

interface TimingStore {
  matchStartedAt: number;
  /** Cumulative ms per seat. Indexed by PlayerId. */
  perPlayer: Record<PlayerId, number>;
  /** Active seat at the previous tick (so the NEXT tick credits the gap to it). */
  prevActive: PlayerId | null;
  /** Wall-clock time of the last tick we observed. */
  lastTickAt: number;

  resetForMatch: () => void;
  onActiveChanged: (active: PlayerId | null) => void;
  /** Get a stable snapshot for charts. */
  snapshot: () => { matchStartedAt: number; perPlayer: Record<PlayerId, number> };
}

export const useSspTiming = create<TimingStore>((set, get) => ({
  matchStartedAt: Date.now(),
  perPlayer: {},
  prevActive: null,
  lastTickAt: Date.now(),

  resetForMatch: () => set({
    matchStartedAt: Date.now(),
    perPlayer: {},
    prevActive: null,
    lastTickAt: Date.now(),
  }),

  onActiveChanged: (active) => {
    const now = Date.now();
    const { prevActive, lastTickAt, perPlayer } = get();
    // Credit the elapsed gap to whoever WAS active. Cap at 5 minutes per gap
    // so leaving the tab doesn't blow out one seat's counter.
    if (prevActive != null) {
      const gap = Math.min(Math.max(0, now - lastTickAt), 300_000);
      const next = { ...perPlayer };
      next[prevActive] = (next[prevActive] ?? 0) + gap;
      set({ perPlayer: next, prevActive: active, lastTickAt: now });
    } else {
      set({ prevActive: active, lastTickAt: now });
    }
  },

  snapshot: () => {
    const { matchStartedAt, perPlayer } = get();
    return { matchStartedAt, perPlayer };
  },
}));

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
