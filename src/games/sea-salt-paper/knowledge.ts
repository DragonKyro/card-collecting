// Sea Salt & Paper — what one seat can know about cards it can't see.
//
// The learned agent's observation (nn/observation.ts) is built on this, so
// the AI plays by the same information rules a person at the table would:
//
//   Opponents' hands. Known only through cards taken off a pile's visible
//   top (discard draws, crab picks of the top card, Angelfish) and cards an
//   opponent stole from this seat. Each stays known until it shows up on a
//   table or this seat steals it back. Cards kept from the deck, fish draws,
//   lobster picks, a crab dig below the top, and steals between two OTHER
//   players are all hidden.
//
//   Discard piles. Every card landed face-up, so the seat remembers each pile
//   in full — until an opponent's crab digs out a card from under the top.
//   Then the seat knows the pile is one card short but not which card. That
//   stays uncertain until the card appears on a table, the seat steals it, or
//   the seat crab-digs through that pile itself (and learns exactly what's
//   gone — and so what the digger holds).
//
// Reading `entry.card` on a log entry is only allowed where the rules above
// say this seat saw the card.

import type { PlayerId } from '@/core/types';
import type { SspCard, SspLogEntry, SspState } from './types';

export interface PileMemory {
  /** The visible top card. */
  top: SspCard | null;
  /** Cards in the pile now (the stack is in plain sight). */
  size: number;
  /** Cards the seat remembers under the top, sorted by id. Exact unless
   *  `unknownRemovals` > 0 — that many of them were dug out unseen. */
  buried: SspCard[];
  unknownRemovals: number;
}

export interface SeatKnowledge {
  /** Indexed like state.players: cards the seat is sure that player holds.
   *  Empty for the seat itself (it sees its own hand). */
  knownHands: SspCard[][];
  /** Indexed like state.players: cards each player took off a visible pile
   *  top this round — a signal of what they're collecting. */
  publicPulls: SspCard[][];
  piles: [PileMemory, PileMemory];
}

export interface KnowledgeOptions {
  /** The seat is mid-crab and looking through this pile right now. */
  lookingAt?: 0 | 1 | null;
}

/** This round's log entries (hands and piles reset between rounds). */
export function roundLog(state: SspState): SspLogEntry[] {
  const log = state.log ?? [];
  let start = log.length;
  while (start > 0 && log[start - 1].round === state.round) start--;
  return log.slice(start);
}

const byId = (a: SspCard, b: SspCard) => a.id - b.id;

export function knowledgeOf(state: SspState, seatId: PlayerId, opts: KnowledgeOptions = {}): SeatKnowledge {
  const players = state.players;
  const me = players.findIndex((p) => p.id === seatId);
  if (me === -1) throw new Error(`knowledgeOf: ${seatId} is not seated`);
  const seatOf = (id: PlayerId) => players.findIndex((p) => p.id === id);

  const known = players.map(() => new Map<number, SspCard>());
  const pulls = players.map((): SspCard[] => []);
  /** Cards dug out of each pile below the top, unseen by this seat. */
  let ghosts: Array<Array<{ card: SspCard; taker: number }>> = [[], []];

  const look = (pile: 0 | 1) => {
    // Comparing the pile with memory shows exactly what's missing. Who holds
    // it is only certain when a single player did all the digging.
    const g = ghosts[pile];
    if (new Set(g.map((x) => x.taker)).size === 1) {
      for (const x of g) known[x.taker].set(x.card.id, x.card);
    }
    ghosts = pile === 0 ? [[], ghosts[1]] : [ghosts[0], []];
  };

  for (const e of roundLog(state)) {
    switch (e.kind) {
      case 'drawDiscard':
      case 'angelfishDraw': {
        const who = seatOf(e.playerId);
        if (who === -1 || !e.card) break;
        if (who !== me) known[who].set(e.card.id, e.card);
        if (e.kind === 'drawDiscard') pulls[who].push(e.card);
        break;
      }
      case 'crabPick': {
        const who = seatOf(e.playerId);
        if (who === -1) break;
        if (who === me) {
          if (!e.auto) look(e.pile);
          break;
        }
        if (!e.card) break;
        if (e.fromTop) {
          known[who].set(e.card.id, e.card);
          pulls[who].push(e.card);
        } else {
          ghosts[e.pile].push({ card: e.card, taker: who });
        }
        break;
      }
      case 'sharkSteal': {
        const thief = seatOf(e.playerId);
        const target = seatOf(e.targetPlayerId);
        if (thief === -1 || target === -1) break;
        if (target === me) {
          if (e.card) known[thief].set(e.card.id, e.card);
        } else if (thief === me) {
          if (e.card) {
            const id = e.card.id;
            known[target].delete(id);
            ghosts = ghosts.map((g) => g.filter((x) => x.card.id !== id));
          }
        } else {
          // A random card this seat didn't see changed hands — any of the
          // victim's known cards may be the one that left.
          known[target].clear();
        }
        break;
      }
      default:
        break;
    }
  }
  if (opts.lookingAt != null) look(opts.lookingAt);

  const onTable = new Set<number>();
  for (const p of players) for (const c of p.table) onTable.add(c.id);

  const pileMemory = (p: 0 | 1): PileMemory => {
    const pile = state.discards[p];
    const unresolved = ghosts[p].filter((g) => !onTable.has(g.card.id)).map((g) => g.card);
    return {
      top: pile.length ? { ...pile[pile.length - 1] } : null,
      size: pile.length,
      buried: [...pile.slice(0, -1).map((c) => ({ ...c })), ...unresolved.map((c) => ({ ...c }))].sort(byId),
      unknownRemovals: unresolved.length,
    };
  };

  return {
    knownHands: known.map((m, i) =>
      i === me ? [] : [...m.values()].filter((c) => !onTable.has(c.id)).map((c) => ({ ...c })).sort(byId)),
    publicPulls: pulls.map((cards) => cards.map((c) => ({ ...c }))),
    piles: [pileMemory(0), pileMemory(1)],
  };
}

/** Probability that any one remembered buried card is still in the pile. */
export function buriedStillThere(pile: PileMemory): number {
  return pile.buried.length ? 1 - pile.unknownRemovals / pile.buried.length : 1;
}
