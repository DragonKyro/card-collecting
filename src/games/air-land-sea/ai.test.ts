import { describe, it, expect } from 'vitest';
import { createRng, rngInt } from '@/core/rng';
import type { AlsAction, AlsConfig, AlsState } from './types';
import { applyAction } from './reducer';
import { chooseAIAction } from './ai';
import { legalActions } from './moves';
import { newMatch } from './testSupport';

const SLS = { expansions: { spiesLiesSupplies: true } };

type Agent = (s: AlsState, playerId: string) => AlsAction;

const aiAgent: Agent = (s, id) => {
  const a = chooseAIAction(s, id);
  if (!a) throw new Error(`AI returned null in ${s.subPhase}`);
  return a;
};

function randomAgent(seed: number): Agent {
  const rng = createRng(seed);
  return (s, id) => {
    const actions = legalActions(s, id).filter((a) => a.type !== 'withdraw');
    const pool = actions.length ? actions : legalActions(s, id);
    return pool[rngInt(rng, pool.length)];
  };
}

/** Play a match; returns the winning seat. */
function run(config: Partial<AlsConfig>, seed: number, agents: [Agent, Agent]): 0 | 1 {
  let s = newMatch({ randomOrder: true, ...config }, seed);
  for (let step = 0; step < 3000 && s.phase !== 'gameOver'; step++) {
    const id = s.activePlayerId!;
    const seat = s.players[0].id === id ? 0 : 1;
    const action = agents[seat](s, id);
    s = applyAction(s, action);
  }
  expect(s.phase).toBe('gameOver');
  return s.players[0].vp >= s.config.targetVp ? 0 : 1;
}

describe('AI', () => {
  it.each<[string, Partial<AlsConfig>]>([
    ['the base game', {}],
    ['Spies, Lies & Supplies', { theaters: ['intel', 'diplo', 'econ'], ...SLS }],
    ['mixed theaters', { theaters: ['sea', 'diplo', 'intel'], ...SLS }],
    ['Epic Mode', { theaters: ['air', 'land', 'sea', 'diplo', 'econ'], ...SLS, targetVp: 6 }],
  ])('plays %s to the end against itself', (_name, config) => {
    for (const seed of [11, 12]) run(config, seed, [aiAgent, aiAgent]);
  });

  it('beats random play', () => {
    let wins = 0;
    const games = 16;
    for (let g = 0; g < games; g++) {
      const config: Partial<AlsConfig> = g % 2 ? { theaters: ['intel', 'diplo', 'econ'], ...SLS } : {};
      const aiSeat = (g % 4 < 2 ? 0 : 1) as 0 | 1;
      const agents: [Agent, Agent] = aiSeat === 0 ? [aiAgent, randomAgent(g)] : [randomAgent(g), aiAgent];
      if (run(config, 100 + g, agents) === aiSeat) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(13);
  });

  it('continues a finished battle', () => {
    let s = newMatch({}, 3);
    s = applyAction(s, { type: 'withdraw', playerId: s.activePlayerId! });
    expect(chooseAIAction(s, s.activePlayerId!)).toEqual({ type: 'continueBattle' });
  });
});
