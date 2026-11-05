import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { GameStateShape } from '@/core/module';
import { resetFakeServer } from '@/net/fakeTransport';

// Real games over the online path (in-memory server): every device builds the
// opening from the start record and applies the same JSON-logged moves, so all
// end in exactly the same state, and a device joining afterwards rebuilds it.
// Games whose AI is a trained policy (fetched files) are left out: their
// online path is the same contract.
vi.mock('@/net/firebaseRoom', () => import('@/net/fakeTransport'));
vi.setConfig({ testTimeout: 120000 });

async function device(uuid: string) {
  vi.resetModules();
  localStorage.setItem('card-collecting.uuid', uuid);
  const netModule = await import('@/store/networkStore');
  const { useGameStore } = await import('@/store/gameStore');
  const registry = await import('@/games/registry');
  return {
    uuid,
    net: () => netModule.useNetworkStore.getState(),
    state: () => useGameStore.getState().state as GameStateShape,
    dispatch: (a: unknown) => useGameStore.getState().dispatch(a),
    module: (id: string) => registry.getGameById(id)!,
  };
}
type Device = Awaited<ReturnType<typeof device>>;

async function flush() {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (k) => items.get(k) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (k) => void items.delete(k),
    setItem: (k, v) => void items.set(k, String(v)),
  };
}

beforeEach(() => {
  resetFakeServer();
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** A screen the AI leaves for a human to click through when humans are seated. */
type ClickThrough = (state: GameStateShape) => unknown;

const CASES: { gameId: string; aiSeats: number; maxMoves: number; clickThrough?: ClickThrough; config?: unknown; label?: string }[] = [
  { gameId: 'machi-koro', aiSeats: 1, maxMoves: 600 },
  {
    gameId: 'seven-wonders',
    aiSeats: 1,
    maxMoves: 400,
    // The military summary waits for a human's Continue.
    clickThrough: (s) => ((s as unknown as { subPhase: string }).subPhase === 'militaryEnd' ? { type: 'continue' } : null),
  },
  {
    gameId: 'seven-wonders',
    label: ' (Leaders, Cities, Babel)',
    aiSeats: 1,
    maxMoves: 900,
    config: { expansions: ['leaders', 'cities', 'babelTower', 'babelProjects'], wonderAssignment: 'random', wonderSide: 'random' },
    // The military summary waits for a human's Continue.
    clickThrough: (s) => ((s as unknown as { subPhase: string }).subPhase === 'militaryEnd' ? { type: 'continue' } : null),
  },
  { gameId: 'seven-wonders-duel', aiSeats: 0, maxMoves: 400 },
  // Both expansions: hidden Conspiracies and Divinities, decisions for either seat.
  { gameId: 'seven-wonders-duel', aiSeats: 0, maxMoves: 900, config: { variant: 'base', pantheon: true, agora: true }, label: ' (Pantheon + Agora)' },
  { gameId: 'air-land-sea', aiSeats: 0, maxMoves: 600 },
];

describe('real games online', () => {
  for (const { gameId, aiSeats, maxMoves, clickThrough, config, label = '' } of CASES) {
    it(`${gameId}${label}: host + guest${aiSeats ? ` + ${aiSeats} AI` : ''} stay in step to the end; a late joiner rebuilds the match`, async () => {
      const host = await device('host-uuid');
      await host.net().createRoom(gameId, 'Hana');
      await flush();
      const code = host.net().roomCode!;
      const guest = await device('guest-uuid');
      await guest.net().joinRoom(code, 'Gus');
      await flush();
      for (let i = 0; i < aiSeats; i++) {
        host.net().hostAddAISeat();
        await flush();
      }
      if (config) {
        host.net().hostSetConfig(config);
        await flush();
      }
      expect(await host.net().hostStartMatch()).toBeNull();
      await flush();
      const devices: Device[] = [host, guest];
      expect(guest.net().connection).toBe('in-game');
      expect(guest.state()).toEqual(host.state());
      // The room really started with the options asked for.
      if (config) expect((host.state() as unknown as { config: unknown }).config).toEqual(config);

      // Every seat plays its own AI move on the device that owns it.
      let moves = 0;
      for (; moves < maxMoves && host.state().phase !== 'gameOver'; moves++) {
        const s = host.state();
        const candidates = s.activePlayerId ? [s.activePlayerId] : s.seats.map((x) => x.id);
        let moved = false;
        for (const pid of candidates) {
          const owner = devices.find((d) => d.uuid === pid) ?? host;
          const action = owner.module(gameId).chooseAIAction!(owner.state(), pid);
          if (action) {
            owner.dispatch(action);
            moved = true;
            break;
          }
        }
        const click = moved ? null : clickThrough?.(s);
        if (click) host.dispatch(click);
        expect(moved || !!click).toBe(true);
        await flush();
      }
      expect(host.state().phase).toBe('gameOver');
      expect(guest.state()).toEqual(host.state());
      expect(moves).toBeGreaterThan(5);

      const late = await device('late-uuid');
      await late.net().joinRoom(code, 'Lu');
      await flush();
      expect(late.net().role).toBe('spectator');
      expect(late.state()).toEqual(host.state());
      for (const d of [...devices, late]) {
        expect(d.net().chat.map((m) => m.text).join('\n')).not.toMatch(/different opening|didn't fit/);
      }
    });
  }
});
