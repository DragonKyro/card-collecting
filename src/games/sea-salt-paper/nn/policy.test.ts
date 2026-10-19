import { describe, it, expect } from 'vitest';
import { createRng, rngNext } from '@/core/rng';
import { applyAction } from '../reducer';
import { createSspState } from '../setup';
import { randomPolicyFile, sampleStates, seatsFor } from '../testSupport';
import { ACTION_SPACE_VERSION, legalMask } from './actions';
import { ENCODER_VERSION, OBS_DIM, encodeObservation } from './encode';
import { observe } from './observation';
import { actWithPolicy } from './agent';
import { greedyPolicy, loadSspPolicy, sampledPolicy } from './policy';

describe('trained policy files', () => {
  it('refuses files from another encoder / action space / game', () => {
    const ok = randomPolicyFile(1);
    expect(() => loadSspPolicy(ok)).not.toThrow();
    expect(() => loadSspPolicy({ ...ok, encoderVersion: ENCODER_VERSION - 1 })).toThrow(/encoder/);
    expect(() => loadSspPolicy({ ...ok, actionSpaceVersion: ACTION_SPACE_VERSION + 1 })).toThrow(/action space/);
    expect(() => loadSspPolicy({ ...ok, game: 'set' })).toThrow(/not sea-salt-paper/);
  });

  it('greedy and sampled policies only ever pick legal slots', () => {
    const net = loadSspPolicy(randomPolicyFile(2));
    const rng = createRng(3);
    const policies = [greedyPolicy(net), sampledPolicy(net, () => rngNext(rng))];
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
