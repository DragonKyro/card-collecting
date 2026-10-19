import { describe, it, expect } from 'vitest';
import { createRng, rngNext } from '@/core/rng';
import { applyAction } from '../reducer';
import { createSspState } from '../setup';
import { randomPolicyFile, sampleStates, seatsFor } from '../testSupport';
import { SSP_ACTIONS, legalMask } from './actions';
import { ACTIONS_V2 } from './actionsV2';
import { OBS_DIM, encodeObservation } from './encode';
import { ENCODER_V2 } from './encodeV2';
import { observe } from './observation';
import { actWithPolicy } from './agent';
import { greedyPolicy, loadSspPolicy, sampledPolicy } from './policy';

describe('trained policy files', () => {
  it('refuses files from an unknown encoder / action space / game', () => {
    const ok = randomPolicyFile(1);
    expect(() => loadSspPolicy(ok)).not.toThrow();
    expect(() => loadSspPolicy({ ...ok, encoderVersion: 99 })).toThrow(/encoder/);
    expect(() => loadSspPolicy({ ...ok, encoderVersion: ENCODER_V2.version })).toThrow(/expected 632/);
    expect(() => loadSspPolicy({ ...ok, actionSpaceVersion: 99 })).toThrow(/action space/);
    expect(() => loadSspPolicy({ ...ok, actionSpaceVersion: ACTIONS_V2.version })).toThrow(/→ 66/);
    expect(() => loadSspPolicy({ ...ok, game: 'set' })).toThrow(/not sea-salt-paper/);
  });

  it('plays each file with the encoder and action space it names', () => {
    const current = loadSspPolicy(randomPolicyFile(1));
    expect([current.encoder.dim, current.actions]).toEqual([OBS_DIM, SSP_ACTIONS]);
    const old = loadSspPolicy(randomPolicyFile(1, ENCODER_V2, ACTIONS_V2));
    expect([old.encoder, old.actions]).toEqual([ENCODER_V2, ACTIONS_V2]);
  });

  it('a v2 policy (the shipped layout) drives a whole match through its own slots', () => {
    const p = loadSspPolicy(randomPolicyFile(5, ENCODER_V2, ACTIONS_V2));
    const policy = greedyPolicy(p);
    let s = createSspState({ targetScore: 40, expansions: { extraSalt: true } }, 10, seatsFor(2));
    for (let i = 0; i < 6000 && s.phase === 'playing'; i++) {
      if (s.subPhase === 'roundEnd') { s = applyAction(s, { type: 'nextRound' }); continue; }
      s = applyAction(s, actWithPolicy(s, s.activePlayerId!, policy, p.actions)!);
    }
    expect(s.phase).toBe('gameOver');
  });

  it('greedy and sampled policies only ever pick legal slots (current and v2 encoders)', () => {
    const rng = createRng(3);
    const policies = [randomPolicyFile(2), randomPolicyFile(2, ENCODER_V2)].flatMap((file) => {
      const net = loadSspPolicy(file);
      return [greedyPolicy(net), sampledPolicy(net, () => rngNext(rng))];
    });
    for (const state of sampleStates({ players: 2, extraSalt: true, matches: 3, seed: 21, every: 2 })) {
      const actor = state.subPhase === 'roundEnd' ? state.players[0].id : state.activePlayerId!;
      const obs = observe(state, actor);
      const mask = legalMask(obs);
      for (const policy of policies) expect(mask[policy(obs, mask)]).toBe(1);
    }
  });

  it('greedy play is deterministic and drives a whole match', () => {
    const policy = greedyPolicy(loadSspPolicy(randomPolicyFile(4)));
    let s = createSspState({ targetScore: 40, expansions: { extraSalt: true } }, 9, seatsFor(2));
    const obs = observe(s, 'p0');
    const mask = legalMask(obs);
    expect(policy(obs, mask)).toBe(policy(observe(s, 'p0'), mask));
    expect(encodeObservation(obs).length).toBe(OBS_DIM);
    for (let i = 0; i < 6000 && s.phase === 'playing'; i++) {
      if (s.subPhase === 'roundEnd') { s = applyAction(s, { type: 'nextRound' }); continue; }
      s = applyAction(s, actWithPolicy(s, s.activePlayerId!, policy)!);
    }
    expect(s.phase).toBe('gameOver');
  });
});
