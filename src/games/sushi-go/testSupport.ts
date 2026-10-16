// Test support for the Sushi Go! Party agent tests.
//
//   sampleStates   a spread of states (mid-pick, mid-resolution, round ends)
//                  from matches where seats mix the heuristic AI with random
//                  picks, so special cards, chopsticks and spoons all come up.
//   scrambleHidden rewrites everything one seat must NOT know, so a fair
//                  agent's view has to come out identical.

import type { PlayerId, Seat } from '@/core/types';
import { createRng, rngInt, rngNext, shuffle, type RngState } from '@/core/rng';
import type { SushiGoCard, SushiGoCardKind, SushiGoState } from './types';
import { DEFAULT_MENU, KIND_INFO } from './cards';
import { sushiGoModule } from './module';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { passesThisRound } from './nn/observation';

export interface SampleOptions {
  players: number;
  menu?: SushiGoCardKind[];
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

export function sampleStates(opts: SampleOptions): SushiGoState[] {
  const out: SushiGoState[] = [];
  const every = opts.every ?? 1;
  let k = 0;
  for (let m = 0; m < opts.matches; m++) {
    const seed = opts.seed + m * 7919;
    const rng = createRng(seed ^ 0x5bd1e995);
    let s = sushiGoModule.createInitialState(
      { menu: (opts.menu ?? DEFAULT_MENU).slice(), rounds: 3 }, seed, seatsFor(opts.players),
    );
    for (let step = 0; step < 5000 && s.phase === 'playing'; step++) {
      if (k++ % every === 0) out.push(s);
      if (s.subPhase === 'selecting') {
        const p = s.players.find((q) => q.pendingPick === null)!;
        // A random single pick 40% of the time keeps the AI from walking one line.
        s = rngNext(rng) < 0.4
          ? applyAction(s, { type: 'submitPick', playerId: p.id, cardIds: [p.hand[rngInt(rng, p.hand.length)].id] })
          : applyAction(s, chooseAIAction(s, p.id)!);
      } else {
        s = applyAction(s, chooseAIAction(s, s.activePlayerId ?? s.players[0].id)!);
      }
    }
  }
  return out;
}

interface Slot { arr: SushiGoCard[]; i: number }

/** Deal the cards in `slots` out again in a random order; returns how many moved. */
function reshuffle(slots: Slot[], rng: RngState): number {
  const cards = shuffle(rng, slots.map((sl) => sl.arr[sl.i]));
  let moved = 0;
  slots.forEach((sl, k) => {
    if (sl.arr[sl.i].id !== cards[k].id) moved++;
    sl.arr[sl.i] = cards[k];
  });
  return moved;
}

/** A copy of `state` with everything `viewerId` can't know rewritten: hands it
 *  hasn't held, the deck, the dessert supply, other players' menu draws (all
 *  dealt out again), which card(s) each opponent put face-down and whether
 *  they called a spoon, and the RNG. */
export function scrambleHidden(
  state: SushiGoState,
  viewerId: PlayerId,
  rng: RngState,
): { s: SushiGoState; changes: number } {
  const s = JSON.parse(JSON.stringify(state)) as SushiGoState;
  const n = s.players.length;
  const vi = s.players.findIndex((p) => p.id === viewerId);
  const inRound = s.subPhase === 'selecting' || s.subPhase === 'resolving';
  const passes = inRound ? passesThisRound(s, viewerId) : 0;
  const head = s.subPhase === 'resolving' ? s.resolution?.steps[0] : undefined;

  const hidden: Slot[] = s.deck.map((_, i) => ({ arr: s.deck, i }));
  for (let off = 1; off < n; off++) {
    const p = s.players[(vi + off) % n];
    // A pending spoon hand-over names cards in the giver's hand; leave that hand be.
    if (off <= passes || (head?.type === 'spoonGive' && head.playerId === p.id)) continue;
    p.hand.forEach((_, i) => hidden.push({ arr: p.hand, i }));
  }
  for (const step of s.resolution?.steps ?? []) {
    if (step.type === 'menu' && step.playerId !== viewerId && step.drawn) {
      const drawn = step.drawn;
      drawn.forEach((_, i) => hidden.push({ arr: drawn, i }));
    }
  }
  let changes = reshuffle(hidden, rng);
  // Which desserts are in the round and which still wait in the supply.
  const sweet = [
    ...s.dessertSupply.map((_, i) => ({ arr: s.dessertSupply, i })),
    ...hidden.filter((sl) => KIND_INFO[sl.arr[sl.i].kind].category === 'dessert'),
  ];
  changes += reshuffle(sweet, rng);

  for (let off = 1; off < n; off++) {
    const p = s.players[(vi + off) % n];
    if (!p.pendingPick) continue;
    p.pendingPick = shuffle(rng, p.hand).slice(0, p.pendingPick.length);
    p.pendingSpoon = rngNext(rng) < 0.5;
    changes++;
  }
  s.rngState = createRng(rngInt(rng, 1_000_000_000));
  return { s, changes };
}
