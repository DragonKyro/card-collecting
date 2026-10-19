// A teacher is an existing policy whose play a new network learns to copy
// (distillation), and stays anchored to while it improves.
//
// The teacher may have been trained on an older encoder and action space —
// the shipped Hard is encoder v2 / 66 slots, the learner v3 / 137. Both read
// the same observation, so the teacher scores the state in its own layout and
// each of its legal slots is turned into the concrete move it stands for
// (its action space's own `decodeSlot`), which is then named in the current
// action space (`slotForAction`). For Hard that only changes the crab and
// lobster picks: "take a crab" becomes the exact colour Hard would have taken.
//
// Targets are the teacher's full softmax over its legal moves, not just its
// favourite — the shape of its preferences is most of what there is to learn.

import type { SspObservation } from '@/games/sea-salt-paper/nn/observation';
import { NUM_SLOTS, SSP_ACTIONS } from '@/games/sea-salt-paper/nn/actions';
import { loadPolicyAt } from './agents';
import type { SspPolicy } from '@/games/sea-salt-paper/nn/policy';

/** Moves the teacher gives less than this probability are dropped (and the rest renormalised). */
const MIN_PROB = 1e-6;

export class Teacher {
  readonly policy: SspPolicy;
  private readonly x: Float32Array;

  constructor(readonly path: string) {
    this.policy = loadPolicyAt(path);
    this.x = new Float32Array(this.policy.encoder.dim);
  }

  /** Fill `out` (NUM_SLOTS long) with the teacher's move distribution for
   *  this observation, in the current action space. All zeros when the seat
   *  has no legal move. */
  targets(obs: SspObservation, out: Float32Array): void {
    if (out.length !== NUM_SLOTS) throw new Error(`teacher: expected a ${NUM_SLOTS}-slot buffer, got ${out.length}`);
    out.fill(0);
    const { net, encoder, actions } = this.policy;
    const mask = actions.legalMask(obs);
    const logits = net.forward(encoder.encode(obs, this.x));
    let max = -Infinity;
    for (let s = 0; s < mask.length; s++) if (mask[s] && logits[s] > max) max = logits[s];
    if (max === -Infinity) return;
    let z = 0;
    for (let s = 0; s < mask.length; s++) if (mask[s]) z += Math.exp(logits[s] - max);

    let kept = 0;
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s]) continue;
      const p = Math.exp(logits[s] - max) / z;
      if (p < MIN_PROB) continue;
      const slot = SSP_ACTIONS.slotForAction(obs, actions.decodeSlot(obs, s));
      if (slot < 0) throw new Error(`teacher: slot ${actions.slotNames[s]} has no counterpart in the current action space`);
      out[slot] += p;
      kept += p;
    }
    for (let s = 0; s < NUM_SLOTS; s++) out[s] /= kept;
  }
}
