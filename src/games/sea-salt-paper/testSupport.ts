// Test support for the Sea Salt & Paper AI / agent tests.
//
//   sampleStates   a spread of realistic mid-game states. Seat 0 plays the
//                  heuristic, the rest pick uniformly random legal slots
//                  (every fifth match is random-vs-random) — the heuristic
//                  produces sensible boards, the random seats reach the odd
//                  corners (lobster picks, trios, locked turns, deep crab digs).
//   scrambleHidden rewrites everything one seat must NOT know, so a fair AI's
//                  view (and choice) has to come out identical.

import type { PlayerId, Seat } from '@/core/types';
import { createRng, rngInt, rngNext, shuffle, type RngState } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { SspCard, SspCardFamily, SspState } from './types';
import { FAMILY_ORDER } from './cards';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { createSspState } from './setup';
import { roundLog } from './knowledge';
import { actWithPolicy } from './nn/agent';

export interface SampleOptions {
  players?: number;
  extraSalt?: boolean;
  extraPepper?: boolean;
  matches: number;
  seed: number;
  /** Keep every n-th state. */
  every?: number;
}

export function seatsFor(n: number): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, color: '#888', isAI: true, isLocal: true,
  }));
}

export function sampleStates(opts: SampleOptions): SspState[] {
  const out: SspState[] = [];
  const every = opts.every ?? 1;
  let k = 0;
  for (let m = 0; m < opts.matches; m++) {
    const seed = opts.seed + m * 7919;
    const rng = createRng(seed ^ 0x5bd1e995);
    const allRandom = m % 5 === 4;
    let s = createSspState(
      {
        targetScore: 40,
        expansions: { extraSalt: !!opts.extraSalt, extraPepper: !!opts.extraPepper },
      },
      seed,
      seatsFor(opts.players ?? 2),
    );
    for (let step = 0; step < 4000 && s.phase === 'playing'; step++) {
      if (k++ % every === 0) out.push(s);
      if (s.subPhase === 'roundEnd') {
        s = applyAction(s, { type: 'nextRound' });
        continue;
      }
      const pid = s.activePlayerId!;
      const heuristic = !allRandom && pid === s.players[0].id;
      const action = (heuristic ? chooseAIAction(s, pid) : null)
        ?? actWithPolicy(s, pid, (_obs, mask) => sampleLegal(mask, rngNext(rng)));
      if (!action) throw new Error(`no action for ${pid} in ${s.subPhase}`);
      s = applyAction(s, action);
    }
  }
  return out;
}

export interface ScrambleOptions {
  /** Leave the discard piles exactly as they are (the seat is about to look
   *  through one and is entitled to its real contents). */
  keepPiles?: boolean;
  /** The seat is looking through this pile right now. */
  lookingAt?: 0 | 1 | null;
}

/** Copy of `state` with everything `viewerId` must not know rewritten, and
 *  the number of hidden facts that actually changed (to catch a vacuous test):
 *   - which buried card each unseen opponent crab dig took (swapped with
 *     another buried card of the same pile, log entry rewritten to match);
 *   - opponents' hand contents (swapped with deck cards);
 *   - an opponent's pending draw / lobster reveal;
 *   - deck order and the RNG state;
 *   - private log fields (deck keeps, fish draws, lobster picks, and steals
 *     the viewer wasn't party to). */
export function scrambleHidden(
  state: SspState, viewerId: PlayerId, rng: RngState, opts: ScrambleOptions = {},
): { s: SspState; changes: number } {
  const s = JSON.parse(JSON.stringify(state)) as SspState;
  let changes = 0;
  const handOf = (id: PlayerId) => s.players.find((p) => p.id === id)!.hand;
  const entries = roundLog(s);

  if (!opts.keepPiles) {
    const lastLook = [-1, -1];
    entries.forEach((e, i) => {
      if (e.kind === 'crabPick' && e.playerId === viewerId && !e.auto) lastLook[e.pile] = i;
    });
    if (opts.lookingAt != null) lastLook[opts.lookingAt] = Infinity;
    entries.forEach((e, i) => {
      if (e.kind !== 'crabPick' || e.playerId === viewerId || e.fromTop || !e.card) return;
      if (i < lastLook[e.pile]) return;
      const hand = handOf(e.playerId);
      const hi = hand.findIndex((c) => c.id === e.card!.id);
      const pile = s.discards[e.pile];
      if (hi === -1 || pile.length < 2) return;
      const j = rngInt(rng, pile.length - 1); // buried slots only — the top is in plain sight
      const swapIn = pile[j];
      pile[j] = hand[hi];
      hand[hi] = swapIn;
      if (swapIn.family !== e.card.family) changes++;
      e.card = { ...swapIn };
      e.family = swapIn.family;
    });
  }

  const swapWithDeck = (cards: SspCard[]) => {
    for (let i = 0; i < cards.length && s.deck.length > 0; i++) {
      const j = rngInt(rng, s.deck.length);
      if (s.deck[j].family !== cards[i].family) changes++;
      [cards[i], s.deck[j]] = [s.deck[j], cards[i]];
    }
  };
  for (const p of s.players) if (p.id !== viewerId) swapWithDeck(p.hand);
  if (s.activePlayerId !== viewerId) {
    swapWithDeck(s.pendingDraw);
    if (s.pendingLobsterPick) swapWithDeck(s.pendingLobsterPick);
  }
  const before = s.deck.map((c) => c.id).join();
  s.deck = shuffle(rng, s.deck);
  if (s.deck.map((c) => c.id).join() !== before) changes++;
  s.rngState = { seed: (rngNext(rng) * 0x100000000) >>> 0 };

  const randomFamily = (): SspCardFamily => FAMILY_ORDER[rngInt(rng, FAMILY_ORDER.length)];
  for (const e of s.log) {
    if (e.kind === 'drawDeck' && e.playerId !== viewerId) { e.keptFamily = randomFamily(); changes++; }
    if (e.kind === 'fishDraw' && e.playerId !== viewerId) { e.family = randomFamily(); changes++; }
    if (e.kind === 'lobsterPick' && e.playerId !== viewerId) { e.family = randomFamily(); changes++; }
    if (e.kind === 'sharkSteal' && e.playerId !== viewerId && e.targetPlayerId !== viewerId) {
      e.family = randomFamily();
      e.card = { id: 100_000 + rngInt(rng, 1000), family: e.family, color: 'tan' };
      changes++;
    }
  }
  return { s, changes };
}
