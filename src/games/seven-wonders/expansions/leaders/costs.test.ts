// Leaders expansion — modifyCost tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwState, SwCard, SwCardColor, SwCardEffect, SwCost } from '../../types';
import { modifyCostLeaders } from './costs';
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

function card(id: number, name: string, color: SwCardColor, cost: SwCost): SwCard {
  return { id, name, age: 2, color, minPlayers: 3, maxPlayers: 99, cost, effects: [] };
}

describe('leaders expansion — costs', () => {
  it('Archimedes: removes 1 resource from green card cost', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Archimedes', [{ kind: 'leaderCostModifier', target: 'cardColor', targetColor: 'green', remove: 'oneResource' }])];
    const lab = card(2, 'Lab', 'green', { resources: ['clay', 'clay', 'papyrus'] });
    const after = modifyCostLeaders(s, p, { kind: 'card', card: lab }, lab.cost);
    expect(after.resources?.length).toBe(2);
  });

  it('Archimedes: does NOT affect non-green cards', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Archimedes', [{ kind: 'leaderCostModifier', target: 'cardColor', targetColor: 'green', remove: 'oneResource' }])];
    const baths = card(2, 'Baths', 'blue', { resources: ['stone'] });
    const after = modifyCostLeaders(s, p, { kind: 'card', card: baths }, baths.cost);
    expect(after.resources?.length).toBe(1);
  });

  it('Imhotep: removes 1 resource from wonder stage cost', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Imhotep', [{ kind: 'leaderCostModifier', target: 'wonderStage', remove: 'oneResource' }])];
    const stage = { cost: { resources: ['stone', 'stone'] as ('stone' | 'wood' | 'ore' | 'clay' | 'glass' | 'papyrus' | 'loom')[] }, effects: [], text: 'test' };
    const after = modifyCostLeaders(s, p, { kind: 'wonderStage', stageIndex: 0, stage }, stage.cost);
    expect(after.resources?.length).toBe(1);
  });

  it('Maecenas: future leaders cost 0 coins', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Maecenas', [{ kind: 'leaderCostModifier', target: 'leader', remove: 'allCoins' }])];
    const futureLeader = leader(99, 'Caesar', [{ kind: 'shields', shields: 2 }]);
    futureLeader.cost = { coins: 5 };
    const after = modifyCostLeaders(s, p, { kind: 'leader', card: futureLeader }, futureLeader.cost);
    expect(after.coins).toBe(0);
  });

  it('Ramses: future guilds cost no resources', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [leader(1, 'Ramses', [{ kind: 'leaderCostModifier', target: 'guild', remove: 'allResources' }])];
    const guild = card(2, 'Workers Guild', 'purple', { resources: ['ore', 'ore', 'clay', 'stone', 'wood'] });
    const after = modifyCostLeaders(s, p, { kind: 'card', card: guild }, guild.cost);
    expect(after.resources?.length).toBe(0);
  });

  it('No modifier: cost unchanged', () => {
    const s = freshState();
    const p = s.players[0];
    p.leaderTableau = [];
    const lab = card(2, 'Lab', 'green', { resources: ['clay', 'clay'] });
    const after = modifyCostLeaders(s, p, { kind: 'card', card: lab }, lab.cost);
    expect(after.resources?.length).toBe(2);
  });
});
