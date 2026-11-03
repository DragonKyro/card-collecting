// Test support for the Jaipur tests.
//
//   seatsFor       two AI seats
//   sampleStates   a spread of states (every turn, round ends) from matches
//                  where both seats pick uniformly random legal slots — or
//                  the heuristic AI — so trades, sales and both round endings
//                  all come up.
//   scrambleHidden rewrites everything one seat must NOT know, so a fair
//                  agent's view has to come out identical.

import type { PlayerId, Seat } from '@/core/types';
import { createRng, rngInt, rngNext, shuffle, type RngState } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { JaipurCard, JaipurConfig, JaipurGood, JaipurState } from './types';
import { BONUS_SIZES, BONUS_VALUES } from './cards';
import { applyAction, createJaipurState } from './reducer';
import { chooseJaipurAction } from './ai';
import { knowledgeOf } from './knowledge';
import { actWithPolicy } from './nn/agent';

export function seatsFor(n = 2): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, color: '#888', isAI: true, isLocal: true,
  }));
}

export const DEFAULT_TEST_CONFIG: JaipurConfig = { sealsToWin: 2 };

export interface SampleOptions {
  matches: number;
  seed: number;
  /** Keep every n-th state. */
  every?: number;
  /** Who plays: uniformly random slots (default) or the heuristic AI. */
  players?: 'random' | 'heuristic' | 'mixed';
  config?: JaipurConfig;
}

export function sampleStates(opts: SampleOptions): JaipurState[] {
  const out: JaipurState[] = [];
  const every = opts.every ?? 1;
  let k = 0;
  for (let m = 0; m < opts.matches; m++) {
    const seed = opts.seed + m * 7919;
    const rng = createRng(seed ^ 0x5bd1e995);
    const random = (_obs: unknown, mask: Uint8Array) => sampleLegal(mask, rngNext(rng));
    let s = createJaipurState(opts.config ?? DEFAULT_TEST_CONFIG, seed, seatsFor());
    for (let step = 0; step < 3000 && s.phase === 'playing'; step++) {
      if (k++ % every === 0) out.push(s);
      if (s.subPhase === 'roundEnd') {
        s = applyAction(s, { type: 'nextRound' });
        continue;
      }
      const pid = s.activePlayerId!;
      const who = opts.players ?? 'random';
      const heuristic = who === 'heuristic' || (who === 'mixed' && pid === s.players[m % 2].id);
      s = applyAction(s, heuristic ? chooseJaipurAction(s, pid)! : actWithPolicy(s, pid, random)!);
    }
    out.push(s);
  }
  return out;
}

interface Slot { arr: JaipurCard[]; i: number }

/** A copy of `state` with everything `viewerId` can't know rewritten: the deck
 *  and the unknown part of the opponent's hand dealt out again, the bonus
 *  piles and the opponent's bonus values reshuffled together (and their sale
 *  log entries rewritten to match), and the RNG. */
export function scrambleHidden(
  state: JaipurState,
  viewerId: PlayerId,
  rng: RngState,
): { s: JaipurState; changes: number } {
  const s = JSON.parse(JSON.stringify(state)) as JaipurState;
  const vi = s.players.findIndex((p) => p.id === viewerId);
  const oi = (vi + 1) % s.players.length;
  const opp = s.players[oi];
  const known = knowledgeOf(state, viewerId).knownHands[oi];

  // The opponent's cards beyond the known ones and the deck's goods are one
  // pool (camels never sit in a hand, so they stay in the deck).
  const slots: Slot[] = s.deck.flatMap((c, i) => (c.type === 'camel' ? [] : [{ arr: s.deck, i }]));
  const keep: Record<JaipurGood, number> = { ...known };
  opp.hand.forEach((c, i) => {
    const g = c.type as JaipurGood;
    if (keep[g] > 0) keep[g]--;
    else slots.push({ arr: opp.hand, i });
  });
  const cards = shuffle(rng, slots.map((sl) => sl.arr[sl.i]));
  let changes = 0;
  slots.forEach((sl, k) => {
    if (sl.arr[sl.i].type !== cards[k].type) changes++;
    sl.arr[sl.i] = cards[k];
  });
  // And the deck's order.
  const order = s.deck.map((c) => c.type).join();
  s.deck = shuffle(rng, s.deck);
  if (s.deck.map((c) => c.type).join() !== order) changes++;

  // Bonus values: the piles and the opponent's tokens share one pool per size.
  for (const size of BONUS_SIZES) {
    const pile = s.bonus[size];
    const theirs = opp.bonusTokens.filter((t) => t.size === size);
    const values = shuffle(rng, [...pile, ...theirs].map((t) => t.value));
    [...pile, ...theirs].forEach((t, k) => {
      if (t.value !== values[k]) changes++;
      t.value = values[k];
    });
  }
  // The opponent's sale log entries name their bonus values.
  for (const e of s.log) {
    if (e.kind === 'sell' && e.playerId === opp.id && e.bonus) {
      const values = BONUS_VALUES[e.bonus.size];
      e.bonus = { size: e.bonus.size, value: values[rngInt(rng, values.length)] };
    }
  }
  s.rngState = createRng(rngInt(rng, 1_000_000_000));
  return { s, changes };
}
