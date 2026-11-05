// 7 Wonders Duel — random legal play with the expansions: every action
// `legalActions` offers must apply, and every match must end.

import { describe, it, expect } from 'vitest';
import { createRng, rngInt } from '@/core/rng';
import type { DuelConfig, DuelState } from './types';
import { applyAction, legalActions } from './reducer';
import { chooseAIAction } from './ai';
import { newMatch, SEATS } from './testSupport';

const CONFIGS: [string, DuelConfig][] = [
  ['Pantheon', { pantheon: true }],
  ['Agora', { agora: true }],
  ['Pantheon + Agora', { pantheon: true, agora: true }],
];

function totalCards(s: DuelState): number {
  return s.players.reduce((n, p) => n + p.tableau.length, 0);
}

describe('Duel expansions: random legal play', () => {
  for (const [label, config] of CONFIGS) {
    it(`${label}: random legal actions (and a mix with the AI) always apply and end the match`, () => {
      const reasons = new Set<string>();
      const phases = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) {
        const rng = createRng(seed * 31);
        let s = newMatch(seed, SEATS, config);
        for (let i = 0; i < 900 && s.phase === 'playing'; i++) {
          phases.add(s.subPhase);
          const legal = legalActions(s);
          expect(legal.length, `no legal action in ${s.subPhase}`).toBeGreaterThan(0);
          const useAi = seed % 2 === 0 && i % 3 === 0;
          const a = useAi ? chooseAIAction(s, s.activePlayerId!)! : legal[rngInt(rng, legal.length)];
          s = applyAction(s, a);
          expect(JSON.parse(JSON.stringify(s))).toEqual(s);
        }
        expect(s.phase).toBe('gameOver');
        expect(totalCards(s)).toBeGreaterThan(0);
        reasons.add(s.endReason!);
      }
      expect(reasons.size).toBeGreaterThan(0);
      expect(phases.size).toBeGreaterThan(5);
    }, 120_000);
  }
});
