// 7 Wonders Duel — helpers for tests: start a match, skip the draft, and
// stage cards, wonders and tokens exactly where a test needs them.

import type { Seat } from '@/core/types';
import type { DuelAction, DuelCard, DuelConfig, DuelConspiracyId, DuelState } from './types';
import { sevenWondersDuelModule } from './module';
import { applyAction } from './reducer';
import { allCards, expansionCards } from './cards';
import { availableSlots } from './pyramid';

export const SEATS: Seat[] = [
  { id: 'p0', name: 'Ann', color: '#3d6da0', isAI: true, isLocal: true },
  { id: 'p1', name: 'Bob', color: '#b73c3c', isAI: true, isLocal: true },
];

export function newMatch(seed = 1, seats: Seat[] = SEATS, config: DuelConfig = { variant: 'base' }): DuelState {
  return sevenWondersDuelModule.createInitialState(config, seed, seats);
}

/** A match at Age I's first turn, each seat holding the given wonders. With
 *  expansions, any decision the draft raised (Agora's wonders) is answered
 *  with its first legal choice. */
export function startedMatch(seed = 1, wonders: [string[], string[]] = [['pyramids', 'colossus', 'sphinx', 'mausoleum'], ['appian-way', 'piraeus', 'statue-of-zeus', 'great-library']], config: DuelConfig = { variant: 'base' }): DuelState {
  let s = newMatch(seed, SEATS, config);
  while (s.wonderDraft) {
    // Skip Agora's draft-time wonders so the draft raises no decisions.
    const plain = s.wonderDraft.pool.find((w) => w !== 'curia-julia' && w !== 'knossos') ?? s.wonderDraft.pool[0];
    s = applyAction(s, { type: 'submitWonderDraft', playerId: s.activePlayerId!, wonderId: plain });
  }
  s.players[0].wonders = wonders[0].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  s.players[1].wonders = wonders[1].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  return s;
}

export function cardNamed(name: string): DuelCard {
  const c = [...allCards(), ...expansionCards()].find((x) => x.name === name);
  if (!c) throw new Error(`No card named ${name}`);
  return JSON.parse(JSON.stringify(c));
}

/** Put the named card into the city of `seat` (outside the pyramid). */
export function giveCard(s: DuelState, seat: 0 | 1, ...names: string[]): void {
  for (const name of names) {
    const c = cardNamed(name);
    s.cardsById[c.id] = c;
    s.players[seat].tableau.push(c);
  }
}

/** Make the named card accessible (it replaces an accessible card) and return its id. */
export function stage(s: DuelState, name: string, nth = 0): number {
  const c = cardNamed(name);
  s.cardsById[c.id] = c;
  const existing = s.pyramid.find((x) => x.cardId === c.id);
  const target = availableSlots(s.pyramid)[nth];
  if (existing && existing !== target) existing.cardId = target.cardId;
  target.cardId = c.id;
  target.faceUp = true;
  return c.id;
}

/** Leave only the card `keep` in the pyramid (accessible, face up). */
export function emptyPyramidBut(s: DuelState, keep: number): void {
  for (const slot of s.pyramid) {
    if (slot.cardId === keep) slot.faceUp = true;
    else slot.taken = true;
  }
}

/** Give a seat a Conspiracy (Agora), prepared or not. */
export function giveConspiracy(s: DuelState, seat: 0 | 1, id: DuelConspiracyId, prepared = true): void {
  const ag = s.players[seat].agora!;
  s.agora!.conspiracyDeck = s.agora!.conspiracyDeck.filter((c) => c !== id);
  ag.conspiracies.push({ id, preparedWith: prepared ? 100 : null, triggered: false });
}

/** Make it `seat`'s turn (the 'turn' sub-phase, nothing pending). */
export function turnOf(s: DuelState, seat: 0 | 1): DuelState {
  s.subPhase = 'turn';
  s.pending = [];
  s.activeSeatIdx = seat;
  s.activePlayerId = s.players[seat].id;
  s.turnSeatIdx = seat;
  if (s.agora) { s.agora.triggeredThisTurn = false; s.agora.beforeMainAction = false; }
  return s;
}

export function act(s: DuelState, a: DuelAction): DuelState {
  return applyAction(s, a);
}
