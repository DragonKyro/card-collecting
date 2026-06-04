// Leaders expansion — onEvent trigger tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwState, SwCard, SwCardEffect } from '../../types';
import { onEventLeaders } from './triggers';
import type { Seat } from '@/core/types';

function aiSeats(n: number): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `p${i}`, name: `AI${i}`, color: '#888', isAI: true, isLocal: true });
  }
  return out;
}

function freshState(n = 3): SwState {
  return sevenWondersModule.createInitialState(
    { expansions: ['leaders'], wonderAssignment: 'random', wonderSide: 'A' },
    1, aiSeats(n));
}

function leader(id: number, name: string, effects: SwCardEffect[]): SwCard {
  return { id, name, age: 1, color: 'leader', minPlayers: 3, maxPlayers: 7, cost: { coins: 0 }, effects };
}

const yellowCard: SwCard = { id: 99, name: 'Tavern', age: 1, color: 'yellow', minPlayers: 3, maxPlayers: 99, cost: {}, effects: [] };
const blueCard: SwCard = { id: 98, name: 'Baths', age: 1, color: 'blue', minPlayers: 3, maxPlayers: 99, cost: {}, effects: [] };

describe('leaders expansion — triggers', () => {
  it('Xenophon: +2 coins when player builds a yellow card', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Xenophon', [
      { kind: 'leaderTrigger', on: { type: 'buildCardColor', color: 'yellow' }, reward: { coins: 2 } },
    ])];
    const before = p.coins;
    onEventLeaders(s, { kind: 'cardBuilt', playerId: p.id, card: yellowCard, viaChain: false });
    expect(p.coins).toBe(before + 2);
  });

  it('Xenophon: does NOT fire for blue card', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Xenophon', [
      { kind: 'leaderTrigger', on: { type: 'buildCardColor', color: 'yellow' }, reward: { coins: 2 } },
    ])];
    const before = p.coins;
    onEventLeaders(s, { kind: 'cardBuilt', playerId: p.id, card: blueCard, viaChain: false });
    expect(p.coins).toBe(before);
  });

  it('Vitruvius: +2 coins on chain build', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Vitruvius', [
      { kind: 'leaderTrigger', on: { type: 'buildViaChain' }, reward: { coins: 2 } },
    ])];
    const before = p.coins;
    onEventLeaders(s, { kind: 'cardBuilt', playerId: p.id, card: blueCard, viaChain: true });
    expect(p.coins).toBe(before + 2);
    // Non-chain build doesn't fire.
    const after = p.coins;
    onEventLeaders(s, { kind: 'cardBuilt', playerId: p.id, card: blueCard, viaChain: false });
    expect(p.coins).toBe(after);
  });

  it('Nero: +2 coins on military win (positive token only)', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Nero', [
      { kind: 'leaderTrigger', on: { type: 'militaryWin' }, reward: { coins: 2 } },
    ])];
    const before = p.coins;
    onEventLeaders(s, { kind: 'militaryTokenGained', playerId: p.id, vp: 3, age: 2 });
    expect(p.coins).toBe(before + 2);
  });

  it('Hatshepsut: +1 coin on neighbor purchase, max 1/tick', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Hatshepsut', [
      { kind: 'leaderTrigger', on: { type: 'neighborPurchase' }, reward: { coins: 1 } },
    ])];
    // Tick start clears the once-per-turn flag.
    onEventLeaders(s, { kind: 'tickStart' });
    const before = p.coins;
    onEventLeaders(s, { kind: 'neighborPurchase', buyerId: p.id, sellerId: s.players[1].id, units: 1 });
    expect(p.coins).toBe(before + 1);
    // Second purchase same tick: no payout.
    onEventLeaders(s, { kind: 'neighborPurchase', buyerId: p.id, sellerId: s.players[2].id, units: 1 });
    expect(p.coins).toBe(before + 1);
    // tickStart resets.
    onEventLeaders(s, { kind: 'tickStart' });
    onEventLeaders(s, { kind: 'neighborPurchase', buyerId: p.id, sellerId: s.players[1].id, units: 1 });
    expect(p.coins).toBe(before + 2);
  });

  it('triggers fire only for the leader owner, not other players', () => {
    const s = freshState();
    const p0 = s.players[0];
    const p1 = s.players[1];
    p0.leaderTableau = [leader(1, 'Xenophon', [
      { kind: 'leaderTrigger', on: { type: 'buildCardColor', color: 'yellow' }, reward: { coins: 2 } },
    ])];
    const before = p0.coins;
    // Event from p1's build — p0 should NOT get coins.
    onEventLeaders(s, { kind: 'cardBuilt', playerId: p1.id, card: yellowCard, viaChain: false });
    expect(p0.coins).toBe(before);
  });
});
