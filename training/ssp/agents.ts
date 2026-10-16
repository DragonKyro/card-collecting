// Agents the simulator, eval harness and env server can seat by spec.
//
//   random               uniform over legal action slots, through the same
//                        observe → mask → decode path a trained policy uses.
//   nn:<policy.json>     a trained policy file, playing its top-scoring slot.
//   nn-sample:<file>     the same, sampling from its distribution (how it played
//                        while training — the sparring mode for past checkpoints).

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { PlayerId } from '@/core/types';
import { createRng, rngNext } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { SspAction, SspState } from '@/games/sea-salt-paper/types';
import { actWithPolicy } from '@/games/sea-salt-paper/nn/agent';
import { greedyPolicy, loadSspPolicy, sampledPolicy, type SspPolicy, type SspPolicyFile } from '@/games/sea-salt-paper/nn/policy';

export interface SspAgent {
  readonly name: string;
  act(state: SspState, playerId: PlayerId): SspAction | null;
}

/** Builds a fresh agent for one seat of one match; `seed` drives any randomness. */
export type AgentFactory = (seed: number) => SspAgent;

export const AGENT_SPECS = ['random', 'nn:<policy.json>', 'nn-sample:<policy.json>'] as const;

const NN = 'nn:';
const NN_SAMPLE = 'nn-sample:';

/** Policy files are parsed once per process (matches reuse the network). Each
 *  plays through the encoder and action space it names, so older benchmarks
 *  still load. */
const networks = new Map<string, SspPolicy>();
function network(path: string): SspPolicy {
  let net = networks.get(path);
  if (!net) {
    net = loadSspPolicy(JSON.parse(readFileSync(path, 'utf8')) as SspPolicyFile);
    networks.set(path, net);
  }
  return net;
}

export function agentFactory(spec: string): AgentFactory {
  if (spec.startsWith(NN) || spec.startsWith(NN_SAMPLE)) {
    const sample = spec.startsWith(NN_SAMPLE);
    const path = spec.slice(sample ? NN_SAMPLE.length : NN.length);
    const net = network(path);
    const name = agentLabel(spec);
    if (!sample) {
      const policy = greedyPolicy(net);
      return () => ({ name, act: (state, playerId) => actWithPolicy(state, playerId, policy, net.actions) });
    }
    return (seed) => {
      const rng = createRng(seed);
      const policy = sampledPolicy(net, () => rngNext(rng));
      return { name, act: (state, playerId) => actWithPolicy(state, playerId, policy, net.actions) };
    };
  }
  switch (spec) {
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

/** Short display name: policy files show as `nn:<file name>`. */
export function agentLabel(spec: string): string {
  for (const prefix of [NN_SAMPLE, NN]) {
    if (spec.startsWith(prefix)) return prefix + basename(spec.slice(prefix.length)).replace(/\.json$/, '');
  }
  return spec;
}

/** Stable per-(match, seat) seed for agent randomness. */
export function agentSeed(matchSeed: number, seat: number): number {
  return (Math.imul(matchSeed ^ 0x9e3779b9, 0x85ebca6b) + seat * 0x27d4eb2f) >>> 0;
}
