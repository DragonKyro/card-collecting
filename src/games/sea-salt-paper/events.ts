// Extra Pepper event cards.
//
// Mechanic: a separate event deck (not shuffled into the main deck). At the
// start of each round, reveal the top event. Its rule applies to ALL players
// for the round it's revealed. At round end, the event is awarded:
//   - sign '+' events go to the round leader (highest matchScore after the
//     round commits). The holder keeps it (and its rule applies only to them)
//     until they're no longer leading, at which point the event is discarded.
//   - sign '-' events go to the laggard (lowest matchScore). Same persistence
//     rule.
//
// A player can hold at most one event card. If awarded a second, the older
// one is discarded.
//
// Per the rulebook signing convention (encoded here for the AI):
//   events that make scoring EASIER  →  '-' (laggard)
//   events that make scoring HARDER  →  '+' (leader)
//
// All 12 official events are modeled. Coral Reef is recognized but its
// face-down-shell mechanic is a placeholder no-op in v1 (no UI for stashing
// shells); the shell still counts normally.

import type { SspEventCard, SspEventId, SspPlayer, SspState } from './types';
import { shuffle, type RngState } from '@/core/rng';

export const EVENT_BY_ID: Record<SspEventId, SspEventCard> = {
  hermitCrab: {
    id: 'hermitCrab',
    name: 'The Hermit Crab',
    sign: '-',
    rule: 'When you play a Crab pair, take ONE card from EACH discard pile (2 cards total).',
  },
  sunfish: {
    id: 'sunfish',
    name: 'The Sunfish',
    sign: '-',
    rule: 'When you play a Fish pair, add the first TWO cards from the deck to your hand.',
  },
  waterRodeo: {
    id: 'waterRodeo',
    name: 'The Water Rodeo',
    sign: '-',
    rule: 'New pairs: swimmer+swimmer lets you look at an opponent\'s hand and swap one card with theirs; shark+shark steals a pair from an opponent\'s tableau (ability not triggered). The usual shark+swimmer and swimmer+jellyfish combos still work. (Interactive effects not modeled in v1 — the new pair shapes don\'t register; held effect is dormant.)',
  },
  danceOfShells: {
    id: 'danceOfShells',
    name: 'The Dance of the Shells',
    sign: '-',
    rule: 'Each Shell card scores 2 points (instead of the collector set).',
  },
  kraken: {
    id: 'kraken',
    name: 'The Kraken',
    sign: '-',
    rule: 'Each Octopus card scores 1 point (instead of the collector set).',
  },
  tornado: {
    id: 'tornado',
    name: 'The Tornado',
    sign: '+',
    rule: 'Mermaid cards score 0 points (the instant win at 4 mermaids still applies).',
  },
  danceOfMermaids: {
    id: 'danceOfMermaids',
    name: 'The Dance of the Mermaids',
    sign: '-',
    rule: '3 mermaids (instead of 4) trigger the instant win.',
  },
  treasureChest: {
    id: 'treasureChest',
    name: 'The Treasure Chest',
    sign: '+',
    rule: 'You must reach 10 points (instead of 7) to call STOP or LAST CHANCE.',
  },
  diodonFish: {
    id: 'diodonFish',
    name: 'The Diodon Fish',
    sign: '+',
    rule: 'You may not call STOP. You must call LAST CHANCE to end the round.',
  },
  angelfish: {
    id: 'angelfish',
    name: 'The Angelfish',
    sign: '-',
    rule: 'At the end of your turn, if both visible discard tops share a color, take one of them into your hand.',
  },
  dolphins: {
    id: 'dolphins',
    name: 'The Dolphins',
    sign: '-',
    rule: 'When you discard a collector card (shell, octopus, penguin, sailor, seahorse), the top card of the deck is added to your hand.',
  },
  coralReef: {
    id: 'coralReef',
    name: 'The Coral Reef',
    sign: '-',
    rule: 'You may place a Shell face-down in front of you. It is immune to Shark steals — but worth 0 points. (Face-down stash not modeled in v1; shell still counts normally.)',
  },
};

export const ALL_EVENT_IDS: SspEventId[] = [
  'hermitCrab', 'sunfish', 'waterRodeo',
  'danceOfShells', 'kraken', 'tornado',
  'danceOfMermaids', 'treasureChest', 'diodonFish',
  'angelfish', 'dolphins', 'coralReef',
];

/** Build and shuffle a fresh event deck. */
export function buildEventDeck(rng: RngState): SspEventId[] {
  return shuffle(rng, ALL_EVENT_IDS.slice());
}

/** True if a player holds the given event card. */
export function playerHasEvent(p: SspPlayer, id: SspEventId): boolean {
  return (p.heldEvents ?? []).includes(id);
}

/** True if the named event is the round event in force right now (applies to
 *  every player during the round it was revealed). */
export function isRoundEvent(state: SspState, id: SspEventId): boolean {
  return state.event?.current === id;
}

/** True if `id` applies to player `p` right now: either it's the active
 *  round-event (applies to everyone) OR the player holds it as their kept
 *  event from a prior round. */
export function eventAppliesTo(state: SspState, p: SspPlayer, id: SspEventId): boolean {
  return isRoundEvent(state, id) || playerHasEvent(p, id);
}

/** Returns the active event (if any), already looked up. */
export function currentEvent(state: SspState): SspEventCard | null {
  const id = state.event?.current;
  return id ? EVENT_BY_ID[id] : null;
}
