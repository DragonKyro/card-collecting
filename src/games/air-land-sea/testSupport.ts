// Test helpers: start a match, then arrange hands and theaters exactly.

import type { Seat } from '@/core/types';
import type { AlsConfig, AlsState, AlsTheaterId } from './types';
import { airLandSeaModule } from './module';
import { CARD_TEMPLATES } from './cards';
import { applyAction } from './reducer';

export const SEATS: Seat[] = [
  { id: 'p0', name: 'Ann', color: '#6aa0ff', isAI: false, isLocal: true },
  { id: 'p1', name: 'Bob', color: '#ff8a65', isAI: false, isLocal: true },
];

export function newMatch(config: Partial<AlsConfig> = {}, seed = 1): AlsState {
  const base = airLandSeaModule.defaultConfig(SEATS);
  return airLandSeaModule.createInitialState({ ...base, randomOrder: false, ...config }, seed, SEATS);
}

/** Card id by theater and strength. */
export function card(theater: AlsTheaterId, strength: number): number {
  const c = CARD_TEMPLATES.find((x) => x.theater === theater && x.strength === strength);
  if (!c) throw new Error(`no ${theater} ${strength}`);
  return c.id;
}

/** "u" face up, "d" face down — a stack spec, bottom first. */
export type StackSpec = Array<[number, 'u' | 'd']>;

export interface Arrangement {
  hands?: [number[], number[]];
  /** Per theater index: [seat 0 stack, seat 1 stack]. Omitted theaters are emptied. */
  board?: Record<number, [StackSpec, StackSpec]>;
  /** Cards to put on top of the deck, top last. */
  deckTop?: number[];
  turn?: 0 | 1;
  first?: 0 | 1;
}

/** Rearrange a fresh battle: every listed card is taken from wherever it was;
 *  the battle's other cards go to the deck (below `deckTop`). */
export function arrange(state: AlsState, a: Arrangement): AlsState {
  const s: AlsState = structuredClone(state);
  const listed = new Set<number>([
    ...(a.hands?.[0] ?? []), ...(a.hands?.[1] ?? []),
    ...Object.values(a.board ?? {}).flatMap(([x, y]) => [...x, ...y].map(([id]) => id)),
    ...(a.deckTop ?? []),
  ]);
  const everything = [
    ...s.players[0].hand, ...s.players[1].hand, ...s.deck,
    ...s.board.flatMap(([x, y]) => [...x, ...y].map((p) => p.cardId)),
  ];
  for (const id of listed) if (!everything.includes(id)) throw new Error(`card ${id} is not in this battle`);
  const rest = everything.filter((id) => !listed.has(id));
  s.players[0].hand = a.hands ? a.hands[0].slice() : [];
  s.players[1].hand = a.hands ? a.hands[1].slice() : [];
  s.board = s.theaters.map((_, t) => {
    const spec = a.board?.[t];
    return [
      (spec?.[0] ?? []).map(([cardId, f]) => ({ cardId, faceDown: f === 'd' })),
      (spec?.[1] ?? []).map(([cardId, f]) => ({ cardId, faceDown: f === 'd' })),
    ];
  });
  s.deck = [...rest, ...(a.deckTop ?? [])];
  if (a.first !== undefined) s.firstPlayerSeatIdx = a.first;
  s.turnSeatIdx = a.turn ?? s.firstPlayerSeatIdx;
  s.activePlayerId = s.players[s.turnSeatIdx].id;
  s.subPhase = 'action';
  s.queue = [];
  s.frame = null;
  s.pending = null;
  return s;
}

/** Apply a sequence of actions given as `(state) => action`. */
export function play(state: AlsState, ...steps: Array<Parameters<typeof applyAction>[1]>): AlsState {
  return steps.reduce((s, a) => applyAction(s, a), state);
}

/** Every card of the battle, wherever it is — for conservation checks. */
export function allCards(s: AlsState): number[] {
  return [
    ...s.players[0].hand, ...s.players[1].hand, ...s.deck,
    ...s.board.flatMap(([x, y]) => [...x, ...y].map((p) => p.cardId)),
  ].sort((x, y) => x - y);
}
