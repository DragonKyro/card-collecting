// Extra Pepper event cards (rules: the Extra Pepper rule sheet).
//
//   Setup        the 12 event cards are shuffled face down into an event deck.
//   Round start  the top card is revealed; its rule applies to everyone this
//                round.
//   Round end    after the round's points are added up, the card goes to the
//                player with the most points ('+') or the fewest ('-'). On a
//                tie for that place nobody takes it: it is discarded.
//   Holding      a held card's rule applies only to its holder, in every later
//                round, for as long as they keep that place — the sole leader
//                for a '+' card, the sole laggard for a '-' one. Otherwise it
//                is discarded at the end of a round.
//   One card     a player holds at most one event card. Winning a second, they
//                choose which of the two to keep.
//
// Which sign a card carries follows what it does to its holder: handicaps
// ('+') go to the leader, boosts ('-') to the player in last place.
//
// The reducer applies each rule through `eventAppliesTo`.

import type { SspEventCard, SspEventId, SspPlayer, SspState } from './types';
import { shuffle, type RngState } from '@/core/rng';

export const EVENT_BY_ID: Record<SspEventId, SspEventCard> = {
  hermitCrab: {
    id: 'hermitCrab',
    name: 'The Hermit Crab',
    sign: '-',
    rule: 'When a pair of crabs is played, the player takes one card from each discard pile.',
  },
  sunfish: {
    id: 'sunfish',
    name: 'The Sunfish',
    sign: '-',
    rule: 'When a pair of fish is played, the player adds the first two cards from the deck to their hand.',
  },
  waterRodeo: {
    id: 'waterRodeo',
    name: 'The Water Rodeo',
    sign: '-',
    rule: 'New duos, 1 point each. Two swimmers: look at an opponent\'s hand, then you may swap one of your cards with one of theirs. Two sharks: steal a pair played in front of an opponent and place it in front of you (its effect does not trigger). Shark + swimmer and swimmer + jellyfish still work as usual.',
  },
  danceOfShells: {
    id: 'danceOfShells',
    name: 'The Dance of the Shells',
    sign: '-',
    rule: 'Each shell card scores 2 points.',
  },
  kraken: {
    id: 'kraken',
    name: 'The Kraken',
    sign: '+',
    rule: 'Each octopus card scores 1 point.',
  },
  tornado: {
    id: 'tornado',
    name: 'The Tornado',
    sign: '+',
    rule: 'Mermaid cards do not score points, but a player still wins immediately with all 4 mermaids.',
  },
  danceOfMermaids: {
    id: 'danceOfMermaids',
    name: 'The Dance of the Mermaids',
    sign: '-',
    rule: 'With 3 mermaids (instead of 4), the player immediately wins the game.',
  },
  treasureChest: {
    id: 'treasureChest',
    name: 'The Treasure Chest',
    sign: '+',
    rule: 'A player must reach 10 points (instead of 7) to end the round.',
  },
  diodonFish: {
    id: 'diodonFish',
    name: 'The Diodon Fish',
    sign: '+',
    rule: 'A player cannot end the round by saying STOP; they have to say LAST CHANCE.',
  },
  angelfish: {
    id: 'angelfish',
    name: 'The Angelfish',
    sign: '-',
    rule: 'At the end of a player\'s turn, if the two visible discard cards are the same color, the player chooses one of them to add to their hand.',
  },
  dolphins: {
    id: 'dolphins',
    name: 'The Dolphins',
    sign: '-',
    rule: 'When a player discards a collection card (shell, octopus, penguin, sailor or seahorse), the top card of the deck is added to their hand.',
  },
  coralReef: {
    id: 'coralReef',
    name: 'The Coral Reef',
    sign: '-',
    rule: 'A player may place a shell face down in front of them. If they do, they are immune to all attacks — but that shell is worth no points.',
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
