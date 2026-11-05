// Air, Land & Sea — what a seat may know.
//
// A seat sees its own hand and face-down cards, every face-up card, and the
// cards in the opponent's hand it has been shown (`player.known`: revealed by
// Leverage / Requisition / Surveil / Neutralize, or handed over by Give &
// Take). Unseen: the rest of the opponent's hand, the opponent's face-down
// cards and the deck. The AI decides on `determinize`d copies — the unseen
// cards shuffled among the unseen slots — so it never reads hidden cards.

import { shuffle, type RngState } from '@/core/rng';
import type { AlsState } from './types';
import { otherSeat } from './rules';

/** Card ids `viewer` cannot see, wherever they are. */
export function unseenCards(state: AlsState, viewer: 0 | 1): number[] {
  const opp = state.players[otherSeat(viewer)];
  const out = opp.hand.filter((c) => !opp.known.includes(c));
  for (const stacks of state.board) {
    for (const p of stacks[otherSeat(viewer)]) if (p.faceDown) out.push(p.cardId);
  }
  out.push(...state.deck);
  return out;
}

export interface World {
  state: AlsState;
  /** Where a real card id's place went: the card now in that hand / board slot / deck position. */
  map: (cardId: number) => number;
}

/** A copy of `state` in which the cards `viewer` can't see are shuffled among
 *  the places it can't see (opponent's hand, opponent's face-down cards, the
 *  deck). Everything `viewer` knows is unchanged; the log is dropped. */
export function determinize(state: AlsState, viewer: 0 | 1, rng: RngState): World {
  const unseen = unseenCards(state, viewer);
  const shuffled = shuffle(rng, unseen);
  const map = new Map<number, number>();
  unseen.forEach((id, i) => map.set(id, shuffled[i]));
  const m = (id: number) => map.get(id) ?? id;

  const s: AlsState = JSON.parse(JSON.stringify({ ...state, log: [] }));
  const oppSeat = otherSeat(viewer);
  s.players[oppSeat].hand = s.players[oppSeat].hand.map(m);
  for (const stacks of s.board) {
    for (const p of stacks[oppSeat]) if (p.faceDown) p.cardId = m(p.cardId);
  }
  s.deck = s.deck.map(m);
  if (s.pending) {
    if (s.pending.cards) s.pending.cards = s.pending.cards.map(m);
    if (s.pending.drawnCardId !== undefined) s.pending.drawnCardId = m(s.pending.drawnCardId);
  }
  if (s.frame?.cardId !== undefined) s.frame.cardId = m(s.frame.cardId);
  if (s.frame?.coverCardId !== undefined) s.frame.coverCardId = m(s.frame.coverCardId);
  for (const q of s.queue) if (q.coverCardId !== undefined) q.coverCardId = m(q.coverCardId);
  return { state: s, map: m };
}
