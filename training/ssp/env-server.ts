// stdio bridge from SspVecEnv to an out-of-process learner (Python).
// One JSON object per line in, one per line out, strictly request/response.
//
//   → {"cmd":"spec"}
//   ← {"ok":true,"obsDim":…,"numSlots":…,"slotNames":[…],"featureLayout":[…],
//      "encoderVersion":…,"actionSpaceVersion":…}
//   → {"cmd":"reset","options":{numEnvs, seed, extraSalt, extraPepper,
//      targetScore, opponent, learnerSeat, roundReward, maxSteps}}
//   → {"cmd":"step","actions":[slot, …]}          (one per env)
//   ← {"ok":true,"n":…,"seat":[…],"obs":"<base64 f32 n×obsDim>",
//      "mask":"<base64 u8 n×numSlots>","reward":[r00,r01,r10,…],
//      "done":[…],"episodes":[…]}
//   → {"cmd":"close"}
//   ← {"ok":false,"error":"…"}                       (on any failure)
//
// Nothing else is written to stdout; diagnostics go to stderr.

import { createInterface } from 'node:readline';
import { NUM_SLOTS, SLOT_NAMES, ACTION_SPACE_VERSION } from '@/games/sea-salt-paper/nn/actions';
import { ENCODER_VERSION, OBS_DIM, featureLayout } from '@/games/sea-salt-paper/nn/encode';
import { SspVecEnv, type VecBatch, type VecEnvOptions } from './vec-env';

const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

function batchReply(b: VecBatch) {
  return {
    ok: true,
    n: b.seat.length,
    seat: Array.from(b.seat),
    obs: b64(b.obs),
    mask: b64(b.mask),
    reward: Array.from(b.reward),
    done: Array.from(b.done),
    episodes: b.episodes,
  };
}

let env: SspVecEnv | null = null;

function handle(msg: { cmd?: string; options?: Partial<VecEnvOptions>; actions?: number[] }): object {
  switch (msg.cmd) {
    case 'spec':
      return {
        ok: true,
        obsDim: OBS_DIM,
        numSlots: NUM_SLOTS,
        slotNames: SLOT_NAMES,
        featureLayout: featureLayout(),
        encoderVersion: ENCODER_VERSION,
        actionSpaceVersion: ACTION_SPACE_VERSION,
      };
    case 'reset':
      env = new SspVecEnv(msg.options ?? {});
      return batchReply(env.reset());
    case 'step':
      if (!env) throw new Error('step before reset');
      if (!Array.isArray(msg.actions)) throw new Error('step needs "actions": number[]');
      return batchReply(env.step(msg.actions));
    case 'close':
      process.exit(0);
    default:
      throw new Error(`unknown cmd ${JSON.stringify(msg.cmd)}`);
  }
}

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  let reply: object;
  try {
    reply = handle(JSON.parse(line));
  } catch (e) {
    reply = { ok: false, error: (e as Error).message };
  }
  process.stdout.write(JSON.stringify(reply) + '\n');
});
