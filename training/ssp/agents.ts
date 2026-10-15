// Agents the simulator, eval harness and env server can seat by name.
//
//   heuristic  the shipped `chooseAIAction` (plays fair — same information
//              rules as a trained agent, see knowledge.ts).
//   random     uniform over legal action slots, through the same
//              observe → mask → decode path a trained policy will use.
//
// A trained network will register here as another spec (e.g. `nn:<weights>`).

import type { PlayerId } from '@/core/types';
import { createRng, rngNext } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { SspAction, SspState } from '@/games/sea-salt-paper/types';
import { chooseAIAction } from '@/games/sea-salt-paper/ai';
import { actWithPolicy } from '@/games/sea-salt-paper/nn/agent';

export interface SspAgent {
  readonly name: string;
  act(state: SspState, playerId: PlayerId): SspAction | null;
}

/** Builds a fresh agent for one seat of one match; `seed` drives any randomness. */
export type AgentFactory = (seed: number) => SspAgent;

export const AGENT_SPECS = ['heuristic', 'random'] as const;

export function agentFactory(spec: string): AgentFactory {
  switch (spec) {
    case 'heuristic':
      return () => ({ name: 'heuristic', act: chooseAIAction });
    case 'random':
      return (seed) => {
        const rng = createRng(seed);
        return {
          name: 'random',
          act: (state, playerId) => actWithPolicy(state, playerId, (_obs, mask) => sampleLegal(mask, rngNext(rng))),
        };
      };
    default:
      throw new Error(`unknown agent "${spec}" (known: ${AGENT_SPECS.join(', ')})`);
  }
}

/** Stable per-(match, seat) seed for agent randomness. */
export function agentSeed(matchSeed: number, seat: number): number {
  return (Math.imul(matchSeed ^ 0x9e3779b9, 0x85ebca6b) + seat * 0x27d4eb2f) >>> 0;
}
