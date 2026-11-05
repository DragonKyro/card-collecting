import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SspAction, SspAiLevel, SspState } from './types';
import { applyAction } from './reducer';
import { createSspState } from './setup';
import { seatsFor } from './testSupport';
import type { SspPolicyFile } from './nn/policy';

const LEVEL_FILES: Record<SspAiLevel, string> = {
  easy: 'easy-update100.json',
  normal: 'normal-update1000.json',
  hard: 'hard-pepper-update17500.json',
};
const policyFile = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'policies', name), 'utf8')) as SspPolicyFile;

/** Serve the shipped policy files to `fetch` the way the dev server / Pages would. */
function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    const name = Object.values(LEVEL_FILES).find((f) => String(url).includes(f));
    if (!name) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => policyFile(name) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function playOut(s: SspState, choose: (s: SspState, pid: string) => SspAction | null): SspState {
  for (let i = 0; i < 8000 && s.phase === 'playing'; i++) {
    const pid = s.subPhase === 'roundEnd' ? s.players[0].id : s.activePlayerId!;
    const action = choose(s, pid);
    if (!action) throw new Error(`no action in ${s.subPhase}`);
    s = applyAction(s, action);
  }
  return s;
}

describe('AI difficulty levels', () => {
  it('ships a policy for every level that loads with the current encoder / action space', async () => {
    const { installAiPolicy } = await import('./aiLevels');
    for (const [level, name] of Object.entries(LEVEL_FILES) as [SspAiLevel, string][]) {
      const file = policyFile(name);
      expect(() => installAiPolicy(level, file), name).not.toThrow();
      expect(file.meta?.benchmark).toBeTruthy();
    }
  });

  it('every level plays whole 2-, 3- and 4-player matches legally', async () => {
    const { installAiPolicy, chooseLeveledAction } = await import('./aiLevels');
    for (const [level, name] of Object.entries(LEVEL_FILES) as [SspAiLevel, string][]) {
      installAiPolicy(level, policyFile(name));
      for (const players of [2, 3, 4]) {
        const start = createSspState(
          { targetScore: 40, expansions: { extraSalt: true, extraPepper: true } },
          100 + players,
          seatsFor(players).map((seat) => ({ ...seat, aiLevel: level })),
        );
        const end = playOut(start, chooseLeveledAction);
        expect(end.phase, `${level} ${players}p`).toBe('gameOver');
      }
    }
  });

  it('waits for humans on the round summary, clicks through it in all-AI matches', async () => {
    const { chooseLeveledAction } = await import('./aiLevels');
    const s = createSspState({ targetScore: 40 }, 3, seatsFor(2));
    s.subPhase = 'roundEnd';
    expect(chooseLeveledAction(s, 'p0')).toEqual({ type: 'nextRound' });
    s.seats = s.seats.map((seat, i) => (i === 1 ? { ...seat, isAI: false } : seat));
    expect(chooseLeveledAction(s, 'p0')).toBeNull();
  });

  it('the module fetches the chosen level in prepare(), then answers synchronously', async () => {
    const fetchMock = stubFetch();
    const { seaSaltPaperModule: mod } = await import('./module');
    const seats = seatsFor(2).map((seat) => ({ ...seat, aiLevel: 'hard' }));
    const config = mod.defaultConfig(seats);
    const s = mod.createInitialState(config, 5, seats);
    expect(mod.chooseAIAction!(s, 'p0')).toBeNull(); // nothing loaded yet
    await mod.prepare!(config, seats);
    await mod.prepare!(config, seats); // cached: no second fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('hard-pepper-update17500.json');
    expect(mod.chooseAIAction!(s, 'p0')).not.toBeNull();
  });

  it('prepare() skips the download when no seat is an AI, and surfaces fetch failures', async () => {
    const fetchMock = stubFetch();
    const { seaSaltPaperModule: mod } = await import('./module');
    const humans = seatsFor(2).map((seat) => ({ ...seat, isAI: false }));
    await mod.prepare!(mod.defaultConfig(humans), humans);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(mod.prepare!(mod.defaultConfig(seatsFor(2)), seatsFor(2))).rejects.toThrow(/404/);
  });

  it('each AI seat plays at its own level: prepare() loads every level in play, a seat without one plays the default', async () => {
    const fetchMock = stubFetch();
    const { seaSaltPaperModule: mod } = await import('./module');
    expect(mod.aiLevels!.map((l) => l.id)).toEqual(['easy', 'normal', 'hard']);
    expect(mod.defaultAiLevel).toBe('normal');
    const seats = seatsFor(3).map((seat, i) => (i === 0 ? { ...seat, aiLevel: 'easy' } : i === 1 ? { ...seat, aiLevel: 'hard' } : seat));
    await mod.prepare!(mod.defaultConfig(seats), seats);
    const fetched = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(fetched).toHaveLength(3);
    for (const name of Object.values(LEVEL_FILES)) expect(fetched.some((u) => u.includes(name))).toBe(true);

    // With only Easy loaded, only the Easy seat can answer.
    vi.resetModules();
    const fresh = await import('./aiLevels');
    fresh.installAiPolicy('easy', policyFile(LEVEL_FILES.easy));
    const s = createSspState({ targetScore: 40 }, 9, seats);
    expect(fresh.chooseLeveledAction({ ...s, activePlayerId: 'p0' }, 'p0')).not.toBeNull();
    expect(fresh.chooseLeveledAction({ ...s, activePlayerId: 'p1' }, 'p1')).toBeNull();
    expect(fresh.chooseLeveledAction({ ...s, activePlayerId: 'p2' }, 'p2')).toBeNull();
  });

  it('rejects an unknown difficulty on a seat', async () => {
    const { seaSaltPaperModule: mod } = await import('./module');
    const seats = seatsFor(2).map((seat) => ({ ...seat, aiLevel: 'insane' as unknown as SspAiLevel }));
    expect(mod.validateConfig(mod.defaultConfig(seats), seats)).toContain('Unknown AI difficulty.');
    expect(mod.validateConfig(mod.defaultConfig(seats), seatsFor(2))).toEqual([]);
  });
});
