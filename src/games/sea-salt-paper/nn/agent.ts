// Adapter from a slot policy to the GameModule-style `(state, playerId) →
// action` shape. The policy only ever receives the seat's observation and
// legal mask — this is the one hop where full state is narrowed down. A crab
// pick takes two policy calls: pile first, then the card once that pile is
// visible. Mask and slot are in the policy's action space (the current one
// unless it was trained on an older layout).

import type { PlayerId } from '@/core/types';
import type { SspAction, SspState } from '../types';
import { observe, type SspObservation } from './observation';
import { SSP_ACTIONS, type SspActionSpace } from './actions';

/** Chooses a slot from an observation and its legal mask. Must return a legal slot. */
export type SlotPolicy = (obs: SspObservation, mask: Uint8Array) => number;

export function actWithPolicy(
  state: SspState, playerId: PlayerId, policy: SlotPolicy, actions: SspActionSpace = SSP_ACTIONS,
): SspAction | null {
  let obs = observe(state, playerId);
  for (;;) {
    const mask = actions.legalMask(obs);
    if (!mask.some((m) => m === 1)) return null;
    const decision = actions.decodeSlot(obs, policy(obs, mask));
    if (decision.type !== 'crabLook') return decision;
    obs = observe(state, playerId, { crabLookPile: decision.pile });
  }
}
