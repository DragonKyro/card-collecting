// Sea Salt & Paper — trained policy files and the slot policies built from them.
//
// A policy file is an MlpFile (src/ai/mlp.ts) mapping the encoded
// observation to one logit per action slot (actions.ts), plus the versions it
// was trained against. Each file is played with the encoder and action space
// it names (current: encode.ts / actions.ts; older ones are kept frozen while
// shipped policies still use them). A file for a version this build doesn't
// have would silently play nonsense, so loading refuses it.

import { Mlp, type MlpFile } from '@/ai/mlp';
import { maskedArgmax, sampleMaskedSoftmax } from '@/ai/masked';
import { SSP_ACTIONS, type SspActionSpace } from './actions';
import { ACTIONS_V2 } from './actionsV2';
import { SSP_ENCODER, type SspEncoder } from './encode';
import { ENCODER_V2 } from './encodeV2';
import type { SlotPolicy } from './agent';

export const SSP_POLICY_GAME = 'sea-salt-paper';

/** Encoders a policy file may name, by version. */
export const SSP_ENCODERS: ReadonlyMap<number, SspEncoder> = new Map(
  [ENCODER_V2, SSP_ENCODER].map((e) => [e.version, e]),
);

/** Action spaces a policy file may name, by version. */
export const SSP_ACTION_SPACES: ReadonlyMap<number, SspActionSpace> = new Map(
  [ACTIONS_V2, SSP_ACTIONS].map((a) => [a.version, a]),
);

export interface SspPolicyFile extends MlpFile {
  game: string;
  encoderVersion: number;
  actionSpaceVersion: number;
  /** Free-form training info (run, update, decisions seen, …). */
  meta?: Record<string, unknown>;
}

/** A loaded network, the encoder that feeds it and the slots it scores.
 *  Play it with `actWithPolicy(state, pid, greedyPolicy(p), p.actions)`. */
export interface SspPolicy {
  net: Mlp;
  encoder: SspEncoder;
  actions: SspActionSpace;
}

export function loadSspPolicy(file: SspPolicyFile): SspPolicy {
  if (file.game !== SSP_POLICY_GAME) throw new Error(`policy is for "${file.game}", not ${SSP_POLICY_GAME}`);
  const encoder = SSP_ENCODERS.get(file.encoderVersion);
  if (!encoder) {
    throw new Error(
      `policy was trained for encoder v${file.encoderVersion}; this build has v${[...SSP_ENCODERS.keys()].join(', v')}`,
    );
  }
  const actions = SSP_ACTION_SPACES.get(file.actionSpaceVersion);
  if (!actions) {
    throw new Error(
      `policy was trained for action space v${file.actionSpaceVersion}; this build has v${[...SSP_ACTION_SPACES.keys()].join(', v')}`,
    );
  }
  if (file.inputDim !== encoder.dim || file.outputDim !== actions.numSlots) {
    throw new Error(`policy maps ${file.inputDim} → ${file.outputDim}; expected ${encoder.dim} → ${actions.numSlots}`);
  }
  return { net: new Mlp(file), encoder, actions };
}

/** Always the highest-scoring legal slot — for evaluation and real play. */
export function greedyPolicy({ net, encoder }: SspPolicy): SlotPolicy {
  const x = new Float32Array(encoder.dim);
  return (obs, mask) => maskedArgmax(net.forward(encoder.encode(obs, x)), mask);
}

/** Samples from the policy's distribution over legal slots — how it played
 *  during training, so a better sparring partner than greedy play. */
export function sampledPolicy({ net, encoder }: SspPolicy, random: () => number, temperature = 1): SlotPolicy {
  const x = new Float32Array(encoder.dim);
  return (obs, mask) => sampleMaskedSoftmax(net.forward(encoder.encode(obs, x)), mask, random(), temperature);
}
