// Random play through every mode: no legal action is ever rejected, the
// machine never stalls, and every card stays in exactly one place.

import { describe, it, expect } from 'vitest';
import { createRng, rngInt } from '@/core/rng';
import type { AlsConfig, AlsState } from './types';
import { applyAction } from './reducer';
import { legalActions } from './moves';
import { cardIdsForTheaters } from './cards';
import { allCards, newMatch } from './testSupport';

const MODES: Array<[string, Partial<AlsConfig>]> = [
  ['base game', {}],
  ['Spies, Lies & Supplies', { theaters: ['intel', 'diplo', 'econ'], expansions: { spiesLiesSupplies: true } }],
  ['mixed theaters', { theaters: ['air', 'diplo', 'econ'], expansions: { spiesLiesSupplies: true } }],
  ['mixed theaters 2', { theaters: ['intel', 'land', 'sea'], expansions: { spiesLiesSupplies: true } }],
  ['Epic Mode', { theaters: ['intel', 'diplo', 'econ', 'land', 'sea'], expansions: { spiesLiesSupplies: true }, targetVp: 12 }],
  ['beginner', { beginner: true, targetVp: 3 }],
];

function randomMatch(config: Partial<AlsConfig>, seed: number): AlsState {
  let s = newMatch({ randomOrder: true, ...config }, seed);
  const rng = createRng(seed * 7919 + 1);
  const deckSize = cardIdsForTheaters(s.config.theaters).length;
  for (let step = 0; step < 4000 && s.phase !== 'gameOver'; step++) {
    const actions = legalActions(s, s.activePlayerId!);
    expect(actions.length, `stalled in ${s.subPhase}`).toBeGreaterThan(0);
    // Withdraw rarely, so battles mostly run to the end.
    const pool = actions.filter((a) => a.type !== 'withdraw');
    const pick = pool.length > 0 && rngInt(rng, 25) !== 0 ? pool[rngInt(rng, pool.length)] : actions[rngInt(rng, actions.length)];
    s = applyAction(s, pick);
    if (s.subPhase !== 'battleEnd' && s.phase !== 'gameOver') {
      expect(allCards(s)).toEqual(cardIdsForTheaters(s.theaters).sort((a, b) => a - b));
      expect(allCards(s).length).toBe(deckSize);
    }
  }
  return s;
}

describe('random play', () => {
  for (const [name, config] of MODES) {
    it(`finishes ${name} matches`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const s = randomMatch(config, seed);
        expect(s.phase).toBe('gameOver');
        const winner = s.players.find((p) => p.vp >= s.config.targetVp);
        expect(winner).toBeDefined();
      }
    });
  }
});
