// Adapter from a slot policy to the GameModule-style `(state, playerId) →
// action` shape. The policy only ever receives the seat's observation and
// legal mask — this is the one hop where full state is narrowed down. A
// multi-part answer (pick + chopsticks + spoon, takeout flips) takes one
// policy call per part.

import type { PlayerId } from '@/core/types';
import type { SushiGoAction, SushiGoState } from '../types';
import { observe, type SushiGoDraft, type SushiGoObservation } from './observation';
import { decodeSlot, legalMask } from './actions';

/** Chooses a slot from an observation and its legal mask. Must return a legal slot. */
export type SlotPolicy = (obs: SushiGoObservation, mask: Uint8Array) => number;

export function actWithPolicy(state: SushiGoState, playerId: PlayerId, policy: SlotPolicy): SushiGoAction | null {
  let draft: SushiGoDraft | null = null;
  for (;;) {
    const obs = observe(state, playerId, { draft });
    const mask = legalMask(obs);
    if (!mask.some((m) => m === 1)) return null;
    const decision = decodeSlot(obs, policy(obs, mask));
    if (decision.type !== 'draft') return decision;
    draft = decision.draft;
  }
}
