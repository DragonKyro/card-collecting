import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomPolicyFile } from '@/games/sea-salt-paper/testSupport';
import { agentFactory, agentLabel, agentSeed } from './agents';
import { playMatch } from './sim';

function policyOnDisk(seed: number): string {
  const path = join(mkdtempSync(join(tmpdir(), 'ssp-policy-')), `update_${seed}.json`);
  writeFileSync(path, JSON.stringify(randomPolicyFile(seed)));
  return path;
}

describe('policy-file agents', () => {
  it('play legal matches greedily and sampled, against any other agent', () => {
    const path = policyOnDisk(5);
    for (const [a, b] of [[`nn:${path}`, 'random'], [`nn-sample:${path}`, 'random'], [`nn:${path}`, `nn-sample:${path}`]]) {
      const agents = [agentFactory(a)(agentSeed(3, 0)), agentFactory(b)(agentSeed(3, 1))];
      const result = playMatch(agents, 3, { extraSalt: true, targetScore: 40 });
      expect(result.error, `${a} vs ${b}`).toBeUndefined();
      expect(result.outcome).toBe('finished');
    }
  });

  it('labels policy agents by file name', () => {
    expect(agentLabel(String.raw`nn:C:\runs\x\policies\update_000120.json`)).toBe('nn:update_000120');
    expect(agentLabel('nn-sample:/tmp/run/update_7.json')).toBe('nn-sample:update_7');
    expect(agentLabel('random')).toBe('random');
  });

  it('rejects unknown specs and unreadable files', () => {
    expect(() => agentFactory('greedy')).toThrow(/unknown agent/);
    expect(() => agentFactory('nn:does/not/exist.json')).toThrow();
  });
});
