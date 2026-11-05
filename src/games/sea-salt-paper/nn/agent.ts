// Adapter from a slot policy to the GameModule-style `(state, playerId) →
// action` shape. The policy only ever receives the seat's observation and
// legal mask — this is the one hop where full state is narrowed down. Two
// decisions take two policy calls (see actions.ts): a crab pick (pile first,
// then the card once that pile is visible) and a Water Rodeo swap (the kind
// of card to take, then the one to give).

import type { PlayerId } from '@/core/types';
import type { SspAction, SspState } from '../types';
import { observe, type ObserveOptions, type SspObservation } from './observation';
import { decodeSlot, legalMask, type SlotDecision } from './actions';

/** Chooses a slot from an observation and its legal mask. Must return a legal slot. */
export type SlotPolicy = (obs: SspObservation, mask: Uint8Array) => number;

/** How a first-step decision changes the next observation; null for a real action. */
export function nextStep(decision: SlotDecision): ObserveOptions | null {
  if (decision.type === 'crabLook') return { crabLookPile: decision.pile };
  if (decision.type === 'rodeoTake') return { rodeoTake: decision.family };
  return null;
}

export function actWithPolicy(state: SspState, playerId: PlayerId, policy: SlotPolicy): SspAction | null {
  let obs = observe(state, playerId);
  for (;;) {
    const mask = legalMask(obs);
    if (!mask.some((m) => m === 1)) return null;
    const decision = decodeSlot(obs, policy(obs, mask));
    const step = nextStep(decision);
    if (!step) return decision as SspAction;
    obs = observe(state, playerId, step);
  }
}
