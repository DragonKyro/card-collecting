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
  it('offers exactly the shipped policies as levels, easiest first, defaulting to the strongest', () => {
    const levels = new Set(SHIPPED.map(levelOfFile).filter(Boolean));
    expect(new Set(Object.keys(POLICY_URLS))).toEqual(levels);
    expect(AI_LEVELS.map((l) => l.id)).toEqual((['easy', 'normal', 'hard'] as const).filter((l) => levels.has(l)));
    expect(DEFAULT_AI_LEVEL).toBe(AI_LEVELS.at(-1)!.id);
    // An unknown level — including the removed 'heuristic' — falls back to the default.
    expect(aiLevelOf({ sealsToWin: 2, aiLevel: 'heuristic' as JaipurAiLevel })).toBe(DEFAULT_AI_LEVEL);
  });

  it('clicks through the round summary in all-AI matches and waits for humans', async () => {
    const { chooseLeveledAction } = await import('./aiLevels');
    const s = createJaipurState({ sealsToWin: 2 }, 3, seatsFor());
    s.subPhase = 'roundEnd';
    expect(chooseLeveledAction(s, s.players[0].id)).toEqual({ type: 'nextRound' });
    s.seats = s.seats.map((seat, i) => (i === 1 ? { ...seat, isAI: false } : seat));
    expect(chooseLeveledAction(s, s.players[0].id)).toBeNull();
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
