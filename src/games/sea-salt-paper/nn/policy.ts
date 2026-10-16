// Sea Salt & Paper — trained policy files and the slot policies built from them.
//
// A policy file is an MlpFile (src/ai/mlp.ts) mapping the encoded
// observation (encode.ts) to one logit per action slot (actions.ts), plus the
// versions it was trained against. A file from a different encoder or action
// space would silently play nonsense, so loading refuses it.

import { Mlp, type MlpFile } from '@/ai/mlp';
import { maskedArgmax, sampleMaskedSoftmax } from '@/ai/masked';
import { ACTION_SPACE_VERSION, NUM_SLOTS } from './actions';
import { ENCODER_VERSION, OBS_DIM, encodeObservation } from './encode';
import type { SlotPolicy } from './agent';

export const SSP_POLICY_GAME = 'sea-salt-paper';

export interface SspPolicyFile extends MlpFile {
  game: string;
  encoderVersion: number;
  actionSpaceVersion: number;
  /** Free-form training info (run, update, decisions seen, …). */
  meta?: Record<string, unknown>;
}

export function loadSspPolicy(file: SspPolicyFile): Mlp {
  if (file.game !== SSP_POLICY_GAME) throw new Error(`policy is for "${file.game}", not ${SSP_POLICY_GAME}`);
  if (file.encoderVersion !== ENCODER_VERSION || file.actionSpaceVersion !== ACTION_SPACE_VERSION) {
    throw new Error(
      `policy was trained for encoder v${file.encoderVersion} / action space v${file.actionSpaceVersion}; `
      + `this build is v${ENCODER_VERSION} / v${ACTION_SPACE_VERSION}`,
    );
  }
  if (file.inputDim !== OBS_DIM || file.outputDim !== NUM_SLOTS) {
    throw new Error(`policy maps ${file.inputDim} → ${file.outputDim}; expected ${OBS_DIM} → ${NUM_SLOTS}`);
  }
  return new Mlp(file);
}

/** Always the highest-scoring legal slot — for evaluation and real play. */
export function greedyPolicy(net: Mlp): SlotPolicy {
  const x = new Float32Array(OBS_DIM);
  return (obs, mask) => maskedArgmax(net.forward(encodeObservation(obs, x)), mask);
}

/** Samples from the policy's distribution over legal slots — how it played
 *  during training, so a better sparring partner than greedy play. */
export function sampledPolicy(net: Mlp, random: () => number, temperature = 1): SlotPolicy {
  const x = new Float32Array(OBS_DIM);
  return (obs, mask) => sampleMaskedSoftmax(net.forward(encodeObservation(obs, x)), mask, random(), temperature);
}
