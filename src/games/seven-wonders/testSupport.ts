// Test helpers for the base game: matches with chosen wonders, quick turns,
// injected cards, and an AI driver that plays every seat. Test-only.

import type { Seat } from '@/core/types';
import { sevenWondersModule } from './module';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { baseGuilds, buildAgeDeck } from './cards';
import { blackCards, citiesGuilds } from './expansions/cities/cards';
import { buildLeaderDeck, leadersGuilds } from './expansions/leaders/cards';
import type { SwCard, SwCardEffect, SwConfig, SwResource, SwState } from './types';

export function seats(n: number, humans: number[] = []): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, color: '#888', isAI: !humans.includes(i), isLocal: true,
  }));
}

export function newMatch(
  n: number,
  opts: { seed?: number; wonders?: string[]; side?: 'A' | 'B' | 'random'; humans?: number[]; expansions?: SwConfig['expansions'] } = {},
): SwState {
  const config: SwConfig = {
    expansions: opts.expansions ?? [],
    wonderAssignment: opts.wonders ? 'preset' : 'random',
    wonderSide: opts.side ?? 'A',
    presetWonders: opts.wonders,
  };
  return sevenWondersModule.createInitialState(config, opts.seed ?? 1, seats(n, opts.humans));
}

let nextId = 90000;

/** A made-up card (fresh id) for injecting into hands and cities. */
export function testCard(name: string, color: SwCard['color'], effects: SwCardEffect[], cost: SwCard['cost'] = {}): SwCard {
  return { id: nextId++, name, age: 1, color, minPlayers: 3, maxPlayers: 99, cost, effects };
}

/** A brown card producing each listed unit (fixed). */
export function producer(...units: SwResource[]): SwCard {
  return testCard(`Test ${units.join('+')}`, 'brown', [{ kind: 'produce', production: units.map((u) => [u]) }]);
}

/** A copy of a real card by name (fresh id): every Age card, guild, black
 *  card and leader. */
export function realCard(name: string): SwCard {
  const all = [
    ...buildAgeDeck(1, 7), ...buildAgeDeck(2, 7), ...buildAgeDeck(3, 7), ...baseGuilds(),
    ...blackCards(1), ...blackCards(2), ...blackCards(3), ...citiesGuilds(),
    ...leadersGuilds(), ...buildLeaderDeck(true),
  ];
  const c = all.find((x) => x.name === name);
  if (!c) throw new Error(`no card ${name}`);
  return { ...c, id: nextId++ };
}

/** Every player who still owes a pick sells their first card. */
export function discardAll(s: SwState): SwState {
  for (const id of s.players.map((p) => p.id)) {
    const p = s.players.find((x) => x.id === id)!;
    if (s.subPhase !== 'picking' || p.pendingPick !== null || p.hand.length === 0) continue;
    s = applyAction(s, { type: 'submitPick', playerId: id, pick: { kind: 'discard', cardId: p.hand[0].id } });
  }
  return s;
}

/** Drive every seat with the AI until the match ends (or `stop` holds).
 *  Throws if the AI ever has nothing to say while a seat owes a move. */
export function playOut(s: SwState, stop?: (s: SwState) => boolean): SwState {
  for (let i = 0; i < 5000 && s.phase === 'playing' && !stop?.(s); i++) {
    if (s.subPhase === 'militaryEnd') {
      s = applyAction(s, { type: 'continue' });
      continue;
    }
    const pid = s.activePlayerId;
    if (!pid) throw new Error(`stalled in ${s.subPhase}`);
    const a = chooseAIAction(s, pid);
    if (!a) throw new Error(`AI has no move for ${pid} in ${s.subPhase}`);
    s = applyAction(s, a);
  }
  return s;
}
