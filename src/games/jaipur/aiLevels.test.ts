import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JaipurAction, JaipurAiLevel, JaipurState } from './types';
import { applyAction, createJaipurState } from './reducer';
import { AI_LEVELS, DEFAULT_AI_LEVEL, POLICY_URLS, aiLevelOf } from './levels';
import { seatsFor } from './testSupport';
import type { JaipurPolicyFile } from './nn/policy';

const DIR = join(__dirname, 'policies');
const SHIPPED = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort() : [];
const levelOfFile = (f: string) => (['easy', 'normal', 'hard'] as const).find((l) => f.startsWith(`${l}-`));

afterEach(() => {
  vi.resetModules();
});

function playOut(s: JaipurState, choose: (s: JaipurState, pid: string) => JaipurAction | null): JaipurState {
  for (let i = 0; i < 3000 && s.phase === 'playing'; i++) {
    const pid = s.activePlayerId ?? s.players[0].id;
    const action = choose(s, pid);
    if (!action) throw new Error(`no action in ${s.subPhase}`);
    s = applyAction(s, action);
  }
  return s;
}

describe('Jaipur AI levels', () => {
  it('offers every shipped policy as its level, plus the heuristic, defaulting to the strongest', () => {
    const levels = new Set(SHIPPED.map(levelOfFile).filter(Boolean));
    expect(new Set(Object.keys(POLICY_URLS))).toEqual(levels);
    expect(AI_LEVELS.at(-1)!.id).toBe('heuristic');
    const strongest = (['hard', 'normal', 'easy'] as const).find((l) => levels.has(l)) ?? 'heuristic';
    expect(DEFAULT_AI_LEVEL).toBe(strongest);
    expect(aiLevelOf({ sealsToWin: 2, aiLevel: 'bogus' as JaipurAiLevel })).toBe(DEFAULT_AI_LEVEL);
    expect(aiLevelOf({ sealsToWin: 2, aiLevel: 'heuristic' })).toBe('heuristic');
  });

  it('the heuristic level plays whole matches with no loading', async () => {
    const { chooseLeveledAction } = await import('./aiLevels');
    const s = playOut(createJaipurState({ sealsToWin: 2, aiLevel: 'heuristic' }, 3, seatsFor()), chooseLeveledAction);
    expect(s.phase).toBe('gameOver');
  });

  it('every shipped policy loads with this encoder / action space and plays legally', async () => {
    const { installAiPolicy, chooseLeveledAction } = await import('./aiLevels');
    for (const f of SHIPPED) {
      const level = levelOfFile(f);
      if (!level) continue;
      const file = JSON.parse(readFileSync(join(DIR, f), 'utf8')) as JaipurPolicyFile;
      expect(() => installAiPolicy(level, file), f).not.toThrow();
      expect(file.meta?.benchmark, `${f} was frozen with evaluate.py freeze`).toBeTruthy();
      for (const seed of [1, 2]) {
        const s = playOut(createJaipurState({ sealsToWin: 2, aiLevel: level }, seed, seatsFor()), chooseLeveledAction);
        expect(s.phase, f).toBe('gameOver');
      }
    }
  });
});
