// Edifice expansion — integration tests.
//
// Verifies that:
//  - setupMatch draws 3 projects (one per age) deterministically from the rng.
//  - wonderStageBuilt events from the base reducer are recorded as
//    contributions for the current age's project.
//  - Repeated wonder-stage builds in the same age don't double-count.
//  - A full AI vs AI match completes to gameOver.

import { describe, it, expect } from 'vitest';
import { sevenWondersModule } from '../../module';
import { applyAction, _internals } from '../../reducer';
import { chooseAIAction as baseAI } from '../../ai';
import type { SwState } from '../../types';
import type { Seat } from '@/core/types';

function aiSeats(n: number): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `p${i}`, name: `AI${i}`, color: '#888', isAI: true, isLocal: true });
  }
  return out;
}

function makeState(n: number, seed = 7): SwState {
  return sevenWondersModule.createInitialState(
    { expansions: ['edifice'], wonderAssignment: 'random', wonderSide: 'A' },
    seed, aiSeats(n));
}

describe('Edifice — reducer integration', () => {
  it('setupMatch draws 3 projects, one per age', () => {
    const s = makeState(4);
    expect(s.edificeProjects).toBeDefined();
    expect(s.edificeProjects!.length).toBe(3);
    expect(s.edificeProjects!.map((p) => p.age)).toEqual([1, 2, 3]);
    expect(s.edificeContributors).toBeDefined();
    expect(s.edificeContributors!.length).toBe(3);
    for (const list of s.edificeContributors!) expect(list).toEqual([]);
  });

  it('wonderStageBuilt event records contributor for current age', () => {
    const s = makeState(3);
    expect(s.age).toBe(1);
    const playerId = s.players[0].id;
    _internals.emitEvent(s, { kind: 'wonderStageBuilt', playerId, stageIndex: 0 });
    expect(s.edificeContributors![0]).toEqual([playerId]);
    // Second build same age = no double-count.
    _internals.emitEvent(s, { kind: 'wonderStageBuilt', playerId, stageIndex: 1 });
    expect(s.edificeContributors![0]).toEqual([playerId]);
  });

  it('contributions tracked per age', () => {
    const s = makeState(3);
    const p0 = s.players[0].id;
    const p1 = s.players[1].id;
    s.age = 1;
    _internals.emitEvent(s, { kind: 'wonderStageBuilt', playerId: p0, stageIndex: 0 });
    s.age = 2;
    _internals.emitEvent(s, { kind: 'wonderStageBuilt', playerId: p1, stageIndex: 0 });
    s.age = 3;
    _internals.emitEvent(s, { kind: 'wonderStageBuilt', playerId: p0, stageIndex: 1 });
    expect(s.edificeContributors![0]).toEqual([p0]);
    expect(s.edificeContributors![1]).toEqual([p1]);
    expect(s.edificeContributors![2]).toEqual([p0]);
  });

  it('AI vs AI Edifice match completes to gameOver', () => {
    let s = makeState(3, 33);
    let safety = 2000;
    while (s.phase === 'playing' && safety-- > 0) {
      let advanced = false;
      if (s.subPhase === 'militaryEnd') {
        s = applyAction(s, { type: 'continue' });
        advanced = true;
      } else if (s.subPhase === 'picking') {
        for (const p of s.players) {
          if (p.pendingPick !== null) continue;
          const a = baseAI(s, p.id);
          if (a) {
            s = applyAction(s, a);
            advanced = true;
            break;
          }
        }
      }
      if (!advanced) break;
    }
    expect(s.phase).toBe('gameOver');
    expect(s.finalScoringBreakdown).not.toBeNull();
  }, 30000);

  it('match without Edifice: edificeProjects/contributors stay undefined', () => {
    const s = sevenWondersModule.createInitialState(
      { expansions: [], wonderAssignment: 'random', wonderSide: 'A' },
      99, aiSeats(3));
    expect(s.edificeProjects).toBeUndefined();
    expect(s.edificeContributors).toBeUndefined();
  });

  it('Edifice + other expansions together: all setup hooks run', () => {
    const s = sevenWondersModule.createInitialState(
      { expansions: ['cities', 'babel', 'armada', 'edifice'], wonderAssignment: 'random', wonderSide: 'A' },
      55, aiSeats(4));
    expect(s.edificeProjects).toBeDefined();
    expect(s.edificeProjects!.length).toBe(3);
    for (const p of s.players) {
      expect(p.debtTokens).toBe(0);
      expect(p.diplomacyTokens).toBe(0);
    }
  });
});
