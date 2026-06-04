// Extra Pepper event cards.
//
// Mechanic: a separate event deck (not shuffled into the main deck). At the
// start of each round, reveal the top event. Its rule applies to all players
// for the round. At round end, the event card is awarded:
//   - sign '+' events go to the round leader (highest matchScore after the
//     round commits). Held by them, applies to them only, until they're no
//     longer leading.
//   - sign '-' events go to the laggard (lowest matchScore). Same persistence.
//   - sign 'global' events are discarded at round end — they applied to
//     everyone only for the round they were revealed.
//
// A player can hold at most one event at a time. If awarded a second, the
// older one is discarded.
//
// Only 6 events are defined here — the published expansion has 12, but we
// don't have authoritative text for all of them. The 6 below cover the
// mechanic shapes (+, -, global, score-modifier, rule-tweak) so the framework
// is fully exercised. Add the remaining events when the official list is in
// hand — `EVENT_BY_ID` and `ALL_EVENT_IDS` are the only places to extend.

import type { SspEventCard, SspEventId, SspPlayer, SspState } from './types';
import { shuffle, type RngState } from '@/core/rng';

export const EVENT_BY_ID: Record<SspEventId, SspEventCard> = {
  threeMermaids: {
    id: 'threeMermaids',
    name: 'Three Mermaids',
    sign: '+',
    rule: 'You win instantly with 3 mermaids (instead of 4).',
  },
  stopAtFive: {
    id: 'stopAtFive',
    name: 'Stop at Five',
    sign: '+',
    rule: 'You can call STOP or LAST CHANCE at 5+ points (instead of 7+).',
  },
  angelfish: {
    id: 'angelfish',
    name: 'Angelfish',
    sign: 'global',
    rule: 'When both discard tops share a color at the end of a turn, that player draws 1 card from the deck for free.',
  },
  stormySeas: {
    id: 'stormySeas',
    name: 'Stormy Seas',
    sign: '-',
    rule: 'You may not call LAST CHANCE.',
  },
  calmWaters: {
    id: 'calmWaters',
    name: 'Calm Waters',
    sign: 'global',
    rule: 'Mermaid color bonus is doubled this round.',
  },
  pepperBurn: {
    id: 'pepperBurn',
    name: 'Pepper Burn',
    sign: '-',
    rule: 'You lose 2 points at the end of each round you hold this.',
  },
};

export const ALL_EVENT_IDS: SspEventId[] = [
  'threeMermaids', 'stopAtFive', 'angelfish',
  'stormySeas', 'calmWaters', 'pepperBurn',
];

/** Build and shuffle a fresh event deck. */
export function buildEventDeck(rng: RngState): SspEventId[] {
  return shuffle(rng, ALL_EVENT_IDS.slice());
}

/** True if a player holds the given event card. */
export function playerHasEvent(p: SspPlayer, id: SspEventId): boolean {
  return (p.heldEvents ?? []).includes(id);
}

/** True if the named event is the round event in force right now (global only). */
export function isRoundEvent(state: SspState, id: SspEventId): boolean {
  return state.event?.current === id;
}

/** Returns the active event (if any), already looked up. */
export function currentEvent(state: SspState): SspEventCard | null {
  const id = state.event?.current;
  return id ? EVENT_BY_ID[id] : null;
}
