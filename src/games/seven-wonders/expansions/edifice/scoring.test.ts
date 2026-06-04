// Edifice expansion — scoreExtras tests.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import type { SwEdificeProject, SwState } from '../../types';
import { scoreExtrasEdifice } from './scoring';
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
    { expansions: ['edifice'], wonderAssignment: 'random', wonderSide: 'A' },
    1, aiSeats(n));
}

const ageVpProject: SwEdificeProject = {
  id: 'test-vp', name: 'Test', age: 1, threshold: 2,
  reward: { kind: 'vp', vp: 5 },
  penalty: { kind: 'vp', vp: -3 },
  description: '',
};

describe('Edifice scoring', () => {
  it('threshold NOT met: no extras', () => {
    const s = freshState(3);
    s.edificeProjects = [ageVpProject];
    s.edificeContributors = [[s.players[0].id]]; // only 1 < 2
    const ex = scoreExtrasEdifice(s, s.players[0]);
    expect(ex.edifice).toBeUndefined();
  });

  it('threshold MET: contributors get reward, non-contributors get penalty', () => {
    const s = freshState(3);
    s.edificeProjects = [ageVpProject];
    s.edificeContributors = [[s.players[0].id, s.players[1].id]];
    const exContrib = scoreExtrasEdifice(s, s.players[0]);
    const exNon = scoreExtrasEdifice(s, s.players[2]);
    expect(exContrib.edifice).toBe(5);
    expect(exNon.edifice).toBe(-3);
  });

  it('multiple completed projects stack', () => {
    const s = freshState(3);
    s.edificeProjects = [
      { ...ageVpProject, age: 1 },
      { ...ageVpProject, age: 2 },
      { ...ageVpProject, age: 3 },
    ];
    // p0 contributes to all 3 (everyone else contributes too).
    s.edificeContributors = [
      [s.players[0].id, s.players[1].id],
      [s.players[0].id, s.players[2].id],
      [s.players[0].id, s.players[1].id],
    ];
    const ex = scoreExtrasEdifice(s, s.players[0]);
    expect(ex.edifice).toBe(15); // 3 × 5
  });

  it('shields outcome → VP approximation', () => {
    const s = freshState(3);
    s.edificeProjects = [{
      ...ageVpProject,
      reward: { kind: 'shields', shields: 3 },
      penalty: { kind: 'shields', shields: -1 },
    }];
    s.edificeContributors = [[s.players[0].id, s.players[1].id]];
    const ex = scoreExtrasEdifice(s, s.players[0]);
    expect(ex.edifice).toBe(6); // 3 shields × 2 = 6 VP
  });

  it('debt tokens outcome → -1 VP each', () => {
    const s = freshState(3);
    s.edificeProjects = [{
      ...ageVpProject,
      reward: { kind: 'vp', vp: 2 },
      penalty: { kind: 'debtTokens', amount: 3 },
    }];
    s.edificeContributors = [[s.players[0].id, s.players[1].id]];
    const exNonContrib = scoreExtrasEdifice(s, s.players[2]);
    expect(exNonContrib.edifice).toBe(-3);
  });

  it('no edifice config → no extras', () => {
    const s = freshState(3);
    // explicitly clear (some tests above set them).
    s.edificeProjects = undefined;
    s.edificeContributors = undefined;
    const ex = scoreExtrasEdifice(s, s.players[0]);
    expect(ex.edifice).toBeUndefined();
  });
});
