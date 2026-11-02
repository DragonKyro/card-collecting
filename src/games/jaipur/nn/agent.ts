// Adapter from a slot policy to the GameModule-style `(state, playerId) →
// action` shape. The policy only ever receives the seat's observation and
// legal mask — this is the one hop where full state is narrowed down. An
// exchange takes one policy call per card taken and given (plus closing the
// take).

import type { PlayerId } from '@/core/types';
import type { JaipurAction, JaipurState } from '../types';
import { observe, type JaipurDraft, type JaipurObservation } from './observation';
import { decodeSlot, legalMask } from './actions';

/** Chooses a slot from an observation and its legal mask. Must return a legal slot. */
export type SlotPolicy = (obs: JaipurObservation, mask: Uint8Array) => number;

export function actWithPolicy(state: JaipurState, playerId: PlayerId, policy: SlotPolicy): JaipurAction | null {
  let draft: JaipurDraft | null = null;
  for (;;) {
    const obs = observe(state, playerId, { draft });
    const mask = legalMask(obs);
    if (!mask.some((m) => m === 1)) return null;
    const decision = decodeSlot(obs, policy(obs, mask));
    if (decision.type !== 'draft') return decision;
    draft = decision.draft;
  }
}
