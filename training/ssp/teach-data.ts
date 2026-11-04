// CLI: decisions for teach.py, which teaches an upgraded (v2 → v3) policy the
// Extra Pepper decisions by copying the fixed rules (nn/fixedChoices.ts).
//
//   node training/dist/ssp-teach-data.mjs --policy <v3 policy.json> --matches 3000 --out <prefix> [--seed S] [--players 2,3,4]
//
// Plays Extra Salt + Pepper matches with the policy in every seat (players
// cycling through --players). At each decision where a Pepper (v3) slot is
// legal it records the features, the legal mask and the teacher's slot, and
// plays the teacher's move:
//   - in a Pepper decision subphase, and in a play-or-end step where the
//     rules play a Water Rodeo duo or a Coral Reef shell: fixedChoices.ts's
//     answer (a Water Rodeo swap is two rows, one per step);
//   - in a play-or-end step the rules leave to the network: the policy's own
//     choice among the v2 slots — so the new slots learn not to take over
//     decisions the policy already makes.
// Everywhere else the policy plays and nothing is recorded.
//
// Output: <prefix>.features.f32 (rows × OBS_DIM), <prefix>.mask.u8
// (rows × NUM_SLOTS), <prefix>.target.i32, <prefix>.kind.u8 (index into
// `kinds` in <prefix>.json, which also has the dims and counts).

import { readFileSync, writeFileSync } from 'node:fs';
import type { PlayerId, Seat } from '@/core/types';
import type { SspAction, SspState } from '@/games/sea-salt-paper/types';
import { applyAction } from '@/games/sea-salt-paper/reducer';
import { createSspState } from '@/games/sea-salt-paper/setup';
import { observe, type SspObservation } from '@/games/sea-salt-paper/nn/observation';
import { NUM_SLOTS, V2_NUM_SLOTS, decodeSlot, legalMask, slotForAction } from '@/games/sea-salt-paper/nn/actions';
import { OBS_DIM, encodeObservation } from '@/games/sea-salt-paper/nn/encode';
import { actWithPolicy } from '@/games/sea-salt-paper/nn/agent';
import { fixedChoice } from '@/games/sea-salt-paper/nn/fixedChoices';
import { greedyPolicy, loadSspPolicy, type SspPolicyFile } from '@/games/sea-salt-paper/nn/policy';
import { maskedArgmax } from '@/ai/masked';

const KINDS = ['awaitingPlayOrEnd', 'awaitingRodeoTarget', 'awaitingRodeoSwap', 'awaitingPairSteal',
  'awaitingAngelfishPick', 'awaitingEventChoice'] as const;

function flags(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`bad argument ${argv[i]}`);
    out.set(argv[i].slice(2), argv[i + 1]);
  }
  return out;
}

const args = flags(process.argv.slice(2));
const policyPath = args.get('policy');
const outPrefix = args.get('out');
if (!policyPath || !outPrefix) {
  throw new Error('usage: --policy <v3 policy.json> --out <prefix> [--matches N] [--seed S] [--players 2,3,4]');
}
const matches = Number(args.get('matches') ?? 3000);
const seed0 = Number(args.get('seed') ?? 1);
const playerCounts = (args.get('players') ?? '2,3,4').split(',').map(Number);

const net = loadSspPolicy(JSON.parse(readFileSync(policyPath, 'utf8')) as SspPolicyFile);
const greedy = greedyPolicy(net);
const x = new Float32Array(OBS_DIM);

const features: Float32Array[] = [];
const masks: Uint8Array[] = [];
const targets: number[] = [];
const kinds: number[] = [];

function record(obs: SspObservation, mask: Uint8Array, slot: number): void {
  if (slot < 0 || !mask[slot]) throw new Error(`teacher's slot ${slot} is not legal in ${obs.subPhase}`);
  features.push(encodeObservation(obs).slice());
  masks.push(mask.slice());
  targets.push(slot);
  kinds.push(KINDS.indexOf(obs.subPhase as (typeof KINDS)[number]));
}

/** One decision: the teacher's where a Pepper slot is legal (recorded), else the policy's. */
function decide(s: SspState, pid: PlayerId): SspAction {
  const obs = observe(s, pid);
  const mask = legalMask(obs);
  if (!mask.some((m, i) => m && i >= V2_NUM_SLOTS)) return actWithPolicy(s, pid, greedy)!;
  const teacher = fixedChoice(obs);
  if (teacher) {
    record(obs, mask, slotForAction(obs, teacher));
    if (teacher.type === 'rodeoSwap' && teacher.swap) {
      const theirs = obs.rodeoLook!.hand.find((c) => c.id === teacher.swap![1])!;
      const second = observe(s, pid, { rodeoTake: theirs.family });
      record(second, legalMask(second), slotForAction(second, teacher));
    }
    return teacher;
  }
  // The rules leave it to the network: its own choice among the v2 slots.
  const v2 = mask.map((m, i) => (i < V2_NUM_SLOTS ? m : 0));
  const slot = maskedArgmax(net.forward(encodeObservation(obs, x)), v2);
  record(obs, mask, slot);
  return decodeSlot(obs, slot) as SspAction;
}

const t0 = performance.now();
for (let m = 0; m < matches; m++) {
  const players = playerCounts[m % playerCounts.length];
  const seats: Seat[] = Array.from({ length: players }, (_, i) => ({ id: `s${i}`, name: `s${i}`, color: '#888', isAI: true, isLocal: true }));
  let s = createSspState({ targetScore: 40, expansions: { extraSalt: true, extraPepper: true } }, seed0 + m * 7919, seats);
  for (let step = 0; step < 20_000 && s.phase === 'playing'; step++) {
    s = applyAction(s, s.subPhase === 'roundEnd' ? { type: 'nextRound' } : decide(s, s.activePlayerId!));
  }
}

const n = targets.length;
const join = <T extends Float32Array | Uint8Array>(rows: T[], width: number, make: (n: number) => T): T => {
  const out = make(n * width);
  rows.forEach((r, i) => out.set(r, i * width));
  return out;
};
writeFileSync(`${outPrefix}.features.f32`, Buffer.from(join(features, OBS_DIM, (k) => new Float32Array(k)).buffer));
writeFileSync(`${outPrefix}.mask.u8`, Buffer.from(join(masks, NUM_SLOTS, (k) => new Uint8Array(k)).buffer));
writeFileSync(`${outPrefix}.target.i32`, Buffer.from(Int32Array.from(targets).buffer));
writeFileSync(`${outPrefix}.kind.u8`, Buffer.from(Uint8Array.from(kinds).buffer));
const counts = Object.fromEntries(KINDS.map((k, i) => [k, kinds.filter((v) => v === i).length]));
writeFileSync(`${outPrefix}.json`, JSON.stringify({ rows: n, obsDim: OBS_DIM, numSlots: NUM_SLOTS, v2Slots: V2_NUM_SLOTS, kinds: KINDS, counts, matches }, null, 2));
console.log(`${n} decisions from ${matches} matches in ${((performance.now() - t0) / 1000).toFixed(0)}s: ${JSON.stringify(counts)}`);
