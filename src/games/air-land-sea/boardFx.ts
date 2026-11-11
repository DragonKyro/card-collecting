// Air, Land & Sea — what just happened on the board, for CSS entrance
// animations (there is no FLIP harness: elements that change get a fresh
// `key`, so their animation plays once as they mount).
//
// Read off the log entries written since the view mounted, so a view that
// mounts mid-battle (rejoin, spectating) animates nothing it didn't see
// happen. Nothing here reveals anything the board doesn't already show: a
// flipped or arrived card is marked by id only, and a blast by where it was.

import { useRef } from 'react';
import type { AlsState } from './types';

export type CardFxKind = 'arrive' | 'flip' | 'move';

export interface TheaterFx {
  /** Board cards that arrived / turned over / moved in, with the log seq. */
  cards: Map<number, { kind: CardFxKind; seq: number }>;
  /** Per side, the seq of the latest card destroyed there (a blast plays). */
  blasts: [number | null, number | null];
  /** Per side, the latest supplies gained there. */
  supplies: [{ seq: number; amount: number } | null, { seq: number; amount: number } | null];
}

function emptyFx(): TheaterFx {
  return { cards: new Map(), blasts: [null, null], supplies: [null, null] };
}

/** One `TheaterFx` per theater of the current battle. */
export function useBoardFx(state: AlsState): TheaterFx[] {
  // The log as it stood when the view mounted: older entries never animate.
  // A log that falls below it is a new match (Play again): animate it all.
  const base = useRef<number | null>(null);
  if (base.current === null) base.current = state.logSeq;
  else if (state.logSeq < base.current) base.current = 0;
  const baseSeq = base.current;
  const out = state.theaters.map(emptyFx);
  const cards = new Map<number, { kind: CardFxKind; seq: number; theaterIdx: number }>();
  let i = state.log.length - 1;
  while (i >= 0 && state.log[i].seq > baseSeq && state.log[i].battle === state.battleNumber) i--;
  for (i += 1; i < state.log.length; i++) {
    const e = state.log[i];
    switch (e.kind) {
      case 'deploy':
      case 'improvise':
      case 'forcedPlay':
        cards.set(e.cardId, { kind: 'arrive', seq: e.seq, theaterIdx: e.theaterIdx });
        break;
      case 'move':
        cards.set(e.cardId, { kind: 'move', seq: e.seq, theaterIdx: e.to });
        break;
      case 'flip':
        cards.set(e.cardId, { kind: 'flip', seq: e.seq, theaterIdx: e.theaterIdx });
        break;
      case 'destroy':
        if (out[e.theaterIdx]) out[e.theaterIdx].blasts[e.ownerSeat] = e.seq;
        cards.delete(e.cardId);
        break;
      case 'toHand':
        cards.delete(e.cardId);
        break;
      case 'supply':
        if (out[e.theaterIdx]) out[e.theaterIdx].supplies[e.seat] = { seq: e.seq, amount: e.amount };
        break;
      default:
        break;
    }
  }
  for (const [cardId, f] of cards) out[f.theaterIdx]?.cards.set(cardId, { kind: f.kind, seq: f.seq });
  return out;
}

/**
 * Hand cards that arrived since the view mounted (dealt, drawn, given,
 * returned), each with its arrival order in its batch (for a stagger). A new
 * battle deals the whole hand in; a change of viewer (hot-seat hand-over)
 * starts over without animating, like a fresh mount.
 */
export function useArrivals(ids: readonly number[], viewer: number, battle: number, dealOnMount: boolean): Map<number, number> {
  const ref = useRef<{ viewer: number; battle: number; seen: Set<number>; fresh: Map<number, number> } | null>(null);
  if (ref.current === null || ref.current.viewer !== viewer) {
    ref.current = { viewer, battle, seen: new Set(dealOnMount && ref.current === null ? [] : ids), fresh: new Map() };
  }
  const r = ref.current;
  if (r.battle !== battle) {
    r.battle = battle;
    r.seen = new Set();
    r.fresh = new Map();
  }
  let n = 0;
  for (const c of ids) {
    if (!r.seen.has(c)) {
      r.seen.add(c);
      r.fresh.set(c, n++);
    }
  }
  for (const c of r.seen) {
    if (!ids.includes(c)) {
      r.seen.delete(c);
      r.fresh.delete(c);
    }
  }
  return r.fresh;
}

/** Counts how often `value` has changed since mount (0 = never), for keying
 *  a pop animation on the change. */
export function useBump<T>(value: T): number {
  const ref = useRef({ value, n: 0 });
  if (!Object.is(ref.current.value, value)) ref.current = { value, n: ref.current.n + 1 };
  return ref.current.n;
}
