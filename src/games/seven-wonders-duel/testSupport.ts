// 7 Wonders Duel — helpers for tests: start a match, skip the draft, and
// stage cards, wonders and tokens exactly where a test needs them.

import type { Seat } from '@/core/types';
import type { DuelAction, DuelCard, DuelState } from './types';
import { sevenWondersDuelModule } from './module';
import { applyAction } from './reducer';
import { allCards } from './cards';
import { availableSlots } from './pyramid';

export const SEATS: Seat[] = [
  { id: 'p0', name: 'Ann', color: '#3d6da0', isAI: true, isLocal: true },
  { id: 'p1', name: 'Bob', color: '#b73c3c', isAI: true, isLocal: true },
];

export function newMatch(seed = 1, seats: Seat[] = SEATS): DuelState {
  return sevenWondersDuelModule.createInitialState({ variant: 'base' }, seed, seats);
}

/** A match at Age I's first turn, each seat holding the given wonders. */
export function startedMatch(seed = 1, wonders: [string[], string[]] = [['pyramids', 'colossus', 'sphinx', 'mausoleum'], ['appian-way', 'piraeus', 'statue-of-zeus', 'great-library']]): DuelState {
  let s = newMatch(seed);
  while (s.subPhase === 'wonderDraft') {
    s = applyAction(s, { type: 'submitWonderDraft', playerId: s.activePlayerId!, wonderId: s.wonderDraft!.pool[0] });
  }
  s.players[0].wonders = wonders[0].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  s.players[1].wonders = wonders[1].map((wonderId) => ({ wonderId, built: false, buriedCardId: null }));
  return s;
}

export function cardNamed(name: string): DuelCard {
  const c = allCards().find((x) => x.name === name);
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

export function act(s: DuelState, a: DuelAction): DuelState {
  return applyAction(s, a);
}
