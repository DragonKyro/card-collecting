import { describe, expect, it } from 'vitest';
import type { Seat } from '@/core/types';
import { sushiGoModule as mod } from './module';
import type { SushiGoState } from './types';

// Hot-seat with several humans: simultaneous picks hand the device to every
// human in turn (activePlayerId parks on each), then the AIs pick. Online
// (no seat is local) the AIs pick first.

const seats = (humans: number[], local = true): Seat[] =>
  Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#888', isAI: !humans.includes(i), isLocal: local }));

function pick(s: SushiGoState, playerId: string): SushiGoState {
  const p = s.players.find((x) => x.id === playerId)!;
  return mod.applyAction(s, { type: 'submitPick', playerId, cardIds: [p.hand[0]!.id] });
}

describe('Sushi Go simultaneous picks: who gets the turn', () => {
  it('two humans sharing the device: each human, then the AIs', () => {
    let s = mod.createInitialState(mod.defaultConfig(seats([1, 3])), 11, seats([1, 3]));
    expect(s.subPhase).toBe('selecting');
    const order: string[] = [];
    while (s.subPhase === 'selecting' && s.players.some((p) => p.pendingPick === null)) {
      const next = s.activePlayerId!;
      order.push(next);
      s = pick(s, next);
      if (s.players.every((p) => p.pendingPick === null)) break; // revealed: a new turn began
    }
    expect(order).toEqual(['p1', 'p3', 'p0', 'p2']);
  });

  it('one human: the AIs pick first, then the human is parked (not left at null)', () => {
    let s = mod.createInitialState(mod.defaultConfig(seats([2])), 12, seats([2]));
    expect(s.activePlayerId).toBe('p0');
    s = pick(s, 'p0');
    s = pick(s, 'p1');
    s = pick(s, 'p3');
    expect(s.activePlayerId).toBe('p2');
  });

  it('online (no seat is local): the AIs pick first even with two humans', () => {
    const online = seats([1, 3], false);
    const s = mod.createInitialState(mod.defaultConfig(online), 13, online);
    expect(s.activePlayerId).toBe('p0');
  });
});
