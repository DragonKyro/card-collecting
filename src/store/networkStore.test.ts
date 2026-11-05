import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, releaseWrites, resetFakeServer } from '@/net/fakeTransport';
import type { TallyAction, TallyState } from './testGames';
import * as testGames from './testGames';

// Online play end to end over an in-memory server (src/net/fakeTransport.ts):
// every device is a fresh copy of the stores, as if on its own phone. Games
// come from a stand-in registry (src/store/testGames.ts); real games over the
// same path are in networkStore.games.test.ts.
vi.mock('@/net/firebaseRoom', () => import('@/net/fakeTransport'));
vi.mock('@/games/registry', () => import('@/store/testGames'));

async function device(uuid: string) {
  vi.resetModules();
  localStorage.setItem('card-collecting.uuid', uuid);
  const netModule = await import('@/store/networkStore');
  const { useGameStore } = await import('@/store/gameStore');
  return {
    uuid,
    net: () => netModule.useNetworkStore.getState(),
    game: () => useGameStore.getState(),
    state: () => useGameStore.getState().state as TallyState | null,
    dispatch: (a: TallyAction) => useGameStore.getState().dispatch(a),
  };
}
type Device = Awaited<ReturnType<typeof device>>;

/** Let every write in flight (and the events it triggers) land. */
async function flush() {
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 30; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function hostRoom(name = 'Hana', gameId = 'tally') {
  const host = await device('host-uuid');
  await host.net().createRoom(gameId, name);
  await flush();
  return { host, code: host.net().roomCode! };
}

async function joinAs(uuid: string, name: string, code: string) {
  const d = await device(uuid);
  await d.net().joinRoom(code, name);
  await flush();
  return d;
}

const seatNames = (d: Device) => d.net().lobby!.seats.map((s) => s.name);

/** The active seat's move, made on the device that owns it (the host for AI seats). */
async function playMove(devices: Device[]) {
  const host = devices[0]!;
  const active = host.state()!.activePlayerId!;
  const owner = devices.find((d) => d.uuid === active) ?? host;
  owner.dispatch({ type: 'add', by: active, n: 1 + (owner.state()!.moves.length % 3) });
  await flush();
}

function expectInStep(devices: Device[]) {
  const [first, ...rest] = devices;
  for (const d of rest) expect(d.state()).toEqual(first!.state());
}

// Identity lives in localStorage; give each test its own (newer Node ships a
// global localStorage that shadows jsdom's and doesn't work without a file).
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

/**
 * Every module `prepare` call so far, from any device. (vi.mock factories
 * survive vi.resetModules, so all devices share this test's registry copy.)
 */
async function prepareCalls(): Promise<[string, number][]> {
  const registry = (await import('@/games/registry')) as unknown as typeof testGames;
  return registry.prepareCalls;
}

beforeEach(async () => {
  (await prepareCalls()).length = 0;
  resetFakeServer();
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('joining a room', () => {
  it('a guest finds the room and takes a seat, typed code and all', async () => {
    const { host, code } = await hostRoom();
    expect(host.net().connection).toBe('lobby');
    expect(host.net().role).toBe('host');
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    const guest = await device('guest-uuid');
    const joining = guest.net().joinRoom(` ${code.toLowerCase()} `, 'Gus');
    expect(guest.net().connection).toBe('connecting');
    await joining;
    await flush();
    expect(guest.net().connection).toBe('lobby');
    expect(guest.net().role).toBe('guest');
    expect(seatNames(host)).toEqual(['Hana', 'Gus']);
    expect(host.net().lobby!.seats[1]).toMatchObject({ id: 'guest-uuid', isAI: false });
    expect(guest.net().lobby).toEqual(host.net().lobby);
    expect(host.net().onlineUuids.has('guest-uuid')).toBe(true);
    expect(host.net().people.map((p) => p.name).sort()).toEqual(['Gus', 'Hana']);
    expect(host.net().chat.map((m) => m.text)).toContain('Gus joined');
  });

  it('a code with no room is reported at once, never as an empty lobby', async () => {
    const guest = await device('guest-uuid');
    await guest.net().joinRoom('ZZZZ', 'Gus');
    expect(guest.net().connection).toBe('error');
    expect(guest.net().joinFailure).toMatchObject({ code: 'ZZZZ', reason: 'notFound' });
    expect(guest.net().errorMessage).toMatch(/no room with code ZZZZ/);
  });

  it('an unreachable server is reported as a network problem; retrying once it is back finds the room', async () => {
    const { host, code } = await hostRoom();
    const guest = await device('guest-uuid');
    fakeServer().up = false;
    await guest.net().joinRoom(code, 'Gus');
    expect(guest.net().joinFailure).toMatchObject({ code, reason: 'unreachable' });
    expect(guest.net().errorMessage).toMatch(/Couldn't reach the game server/);

    fakeServer().up = true;
    guest.net().retryJoin();
    await flush();
    expect(guest.net().connection).toBe('lobby');
    expect(guest.net().joinFailure).toBeNull();
    expect(seatNames(host)).toEqual(['Hana', 'Gus']);
  });

  it('cancelling a join stops it', async () => {
    const { code } = await hostRoom();
    const guest = await device('guest-uuid');
    const joining = guest.net().joinRoom(code, 'Gus');
    guest.net().leaveRoom();
    await joining;
    await flush();
    expect(guest.net().connection).toBe('disconnected');
    expect(fakeServer().rooms.get(code)!.listeners.size).toBe(1); // just the host
  });

  it('making a room clears rooms over a week old that nobody is in', async () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const { host: a, code: stale } = await hostRoom('Ann');
    a.net().leaveRoom();
    const { code: busy } = await hostRoom('Bea'); // still connected
    const { host: c, code: fresh } = await hostRoom('Cy');
    c.net().leaveRoom();
    await flush();
    fakeServer().rooms.get(stale)!.meta.createdAt -= week + 1000;
    fakeServer().rooms.get(busy)!.meta.createdAt -= week + 1000;
    await hostRoom('Dee');
    expect(fakeServer().rooms.has(stale)).toBe(false);
    expect(fakeServer().rooms.has(busy)).toBe(true);
    expect(fakeServer().rooms.has(fresh)).toBe(true);
    const late = await device('late-uuid');
    await late.net().joinRoom(stale, 'Lu');
    expect(late.net().errorMessage).toMatch(/cleared a week after/);
  });

  it('an offline-only game cannot be hosted', async () => {
    const host = await device('host-uuid');
    await host.net().createRoom('blitz', 'Hana');
    expect(host.net().connection).toBe('disconnected');
  });
});

describe('the lobby', () => {
  it('a local lobby carries its options and AI seats into the room; hot-seat humans stay behind', async () => {
    const host = await device('host-uuid');
    await host.net().createRoom('tally', 'Hana', {
      config: { target: 9 },
      seats: [
        { id: 'x', name: 'You', color: '#3a6ec9', isAI: false, isLocal: true },
        { id: 'y', name: 'Couch friend', color: '#e64a4a', isAI: false, isLocal: true },
        { id: 'z', name: 'Robo', color: '#e64a4a', isAI: true, isLocal: true },
      ],
    });
    await flush();
    const lobby = host.net().lobby!;
    expect(lobby.seats).toEqual([
      { id: 'host-uuid', name: 'Hana', color: '#3a6ec9', isAI: false, isLocal: false },
      { id: 'ai-1', name: 'Robo', color: '#e64a4a', isAI: true, isLocal: false },
    ]);
    expect(JSON.parse(lobby.configJson)).toEqual({ target: 9 });
  });

  it('a guest leaving the lobby frees their seat; the host adds and removes AI and seats, never its own', async () => {
    const { host, code } = await hostRoom();
    const guest = await joinAs('guest-uuid', 'Gus', code);
    host.net().hostAddAISeat();
    await flush();
    host.net().hostAddAISeat();
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Gus', 'AI 1', 'AI 2']);
    host.net().hostAddAISeat(); // tally seats 4 at most
    await flush();
    expect(seatNames(host)).toHaveLength(4);
    guest.net().leaveRoom();
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'AI 1', 'AI 2']);
    expect(host.net().onlineUuids.has('guest-uuid')).toBe(false);
    host.net().hostRemoveSeat('ai-1');
    host.net().hostRemoveSeat('host-uuid');
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'AI 2']);
  });

  it('only the host edits the game, options and AI seats', async () => {
    const { host, code } = await hostRoom();
    const guest = await joinAs('guest-uuid', 'Gus', code);
    guest.net().hostAddAISeat();
    guest.net().hostSetConfig({ target: 2 });
    guest.net().hostSetGame('duel');
    guest.net().hostRemoveSeat('host-uuid');
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Gus']);
    expect(host.net().lobby!.gameId).toBe('tally');
    expect(JSON.parse(host.net().lobby!.configJson)).toEqual({ target: 6 });

    host.net().hostSetConfig({ target: 3 });
    await flush();
    expect(JSON.parse(guest.net().lobby!.configJson)).toEqual({ target: 3 });
  });

  it('players rename and recolor their own seats (a taken color swaps); the host edits AI seats', async () => {
    const { host, code } = await hostRoom();
    const guest = await joinAs('guest-uuid', 'Gus', code);
    host.net().hostAddAISeat();
    await flush();
    const colors = () => host.net().lobby!.seats.map((s) => s.color);
    const [red, blue, orange] = colors();
    guest.net().editSeat('guest-uuid', { name: 'Gussie', color: '#1abc9c' });
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Gussie', 'AI 1']);
    expect(colors()).toEqual([red, '#1abc9c', orange]);
    expect(guest.net().myDisplayName).toBe('Gussie');
    guest.net().editSeat('guest-uuid', { color: red });
    await flush();
    expect(colors()).toEqual(['#1abc9c', red, orange]);
    // Nobody edits someone else's seat; the host may edit an AI seat.
    guest.net().editSeat('host-uuid', { name: 'Nope' });
    guest.net().editSeat('ai-1', { name: 'Nope' });
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Gussie', 'AI 1']);
    host.net().editSeat('ai-1', { name: 'Robo', color: blue });
    await flush();
    expect(seatNames(guest)).toEqual(['Hana', 'Gussie', 'Robo']);
    expect(colors()).toEqual(['#1abc9c', red, blue]);
  });

  it("switching games resets the options and checks the seat range; offline-only games aren't offered", async () => {
    const { host, code } = await hostRoom();
    const guest = await joinAs('guest-uuid', 'Gus', code);
    const { lobbyStartProblem } = await import('@/store/networkStore');
    host.net().hostSetConfig({ target: 2 });
    host.net().hostAddAISeat();
    await flush();
    host.net().hostSetGame('duel');
    await flush();
    expect(guest.net().lobby!.gameId).toBe('duel');
    expect(JSON.parse(guest.net().lobby!.configJson)).toEqual({ target: 6 });
    expect(lobbyStartProblem(host.net().lobby!)).toMatch(/Duel takes 2 players \(3 seated\)/);
    expect(await host.net().hostStartMatch()).toMatch(/takes 2 players/);
    expect(host.state()).toBeNull();
    host.net().hostSetGame('blitz');
    await flush();
    expect(host.net().lobby!.gameId).toBe('duel');
    host.net().hostRemoveSeat('ai-1');
    await flush();
    expect(lobbyStartProblem(host.net().lobby!)).toBeNull();
  });

  it('a full table makes a joiner a spectator, who can take a seat once one frees up', async () => {
    const { host, code } = await hostRoom('Hana', 'duel');
    await joinAs('b-uuid', 'Bo', code);
    const late = await joinAs('c-uuid', 'Cy', code);
    expect(seatNames(host)).toEqual(['Hana', 'Bo']);
    expect(late.net().role).toBe('spectator');
    late.net().takeSeat();
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Bo']);
    host.net().hostRemoveSeat('b-uuid');
    await flush();
    late.net().takeSeat();
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Cy']);
    expect(late.net().role).toBe('guest');
  });

  it('chat reaches everyone once, and a rejoiner sees the history', async () => {
    const { host, code } = await hostRoom();
    const guest = await joinAs('guest-uuid', 'Gus', code);
    guest.net().sendChat('  hello  ');
    await flush();
    const userLines = (d: Device) => d.net().chat.filter((m) => m.kind === 'user').map((m) => `${m.name}: ${m.text}`);
    expect(userLines(host)).toEqual(['Gus: hello']);
    expect(userLines(guest)).toEqual(['Gus: hello']);
    const later = await joinAs('late-uuid', 'Lu', code);
    expect(userLines(later)).toEqual(['Gus: hello']);
  });
});

describe('playing online', () => {
  async function startMatch(guests: [string, string][], aiSeats: number, gameId = 'tally') {
    const { host, code } = await hostRoom('Hana', gameId);
    const devices: Device[] = [host];
    for (const [uuid, name] of guests) devices.push(await joinAs(uuid, name, code));
    for (let i = 0; i < aiSeats; i++) {
      host.net().hostAddAISeat();
      await flush();
    }
    expect(await host.net().hostStartMatch()).toBeNull();
    await flush();
    return { host, code, devices };
  }

  it('the host starts the match for everyone, and moves reach every device in order', async () => {
    const { host, devices } = await startMatch([['guest-uuid', 'Gus']], 1);
    const guest = devices[1]!;
    expect(guest.net().connection).toBe('in-game');
    expect(guest.net().role).toBe('guest');
    expect(host.net().role).toBe('host');
    expect(guest.game().localPlayerId).toBe('guest-uuid');
    expect(guest.state()!.seats.map((s) => s.name)).toEqual(['Hana', 'Gus', 'AI 1']);
    // Prepared once, before the start (not again when the start record lands).
    expect(await prepareCalls()).toEqual([['tally', 1]]);
    expectInStep(devices);
    for (let i = 0; i < 6; i++) {
      await playMove(devices);
      expectInStep(devices);
    }
    expect(host.state()!.phase).toBe('gameOver');
    expect(host.state()!.moves.map((m) => m.by)).toEqual(['host-uuid', 'guest-uuid', 'ai-1', 'host-uuid', 'guest-uuid', 'ai-1']);
  });

  it("the room stores createInitialState's inputs, not the state, and compact moves", async () => {
    const { code, devices } = await startMatch([['guest-uuid', 'Gus']], 1);
    for (let i = 0; i < 4; i++) await playMove(devices);
    const match = fakeServer().rooms.get(code)!.matches.get(0)!;
    const start = JSON.parse(match.start!);
    expect(Object.keys(start).sort()).toEqual(['check', 'configJson', 'gameId', 'hostUuid', 'seats', 'seed', 'startedAt']);
    expect(match.actions.size).toBe(4);
    expect(Math.max(...[...match.actions.values()].map((v) => v.length))).toBeLessThan(100);
  });

  it("a spectator's device never moves, and an illegal move is refused before it reaches the room", async () => {
    const { code, devices } = await startMatch([['guest-uuid', 'Gus']], 0);
    const stranger = await joinAs('stranger-uuid', 'Sam', code);
    expect(stranger.net().role).toBe('spectator');
    expect(stranger.game().localPlayerId).toBeNull();
    stranger.dispatch({ type: 'claim', by: 'stranger-uuid' });
    expect(() => devices[1]!.dispatch({ type: 'add', by: 'guest-uuid', n: 1 })).toThrow(/Not your turn/);
    await flush();
    expect(fakeServer().rooms.get(code)!.matches.get(0)!.actions.size).toBe(0);
    expectInStep([...devices, stranger]);
  });

  it('two devices making the same move at once: the first into the log stands, the other is taken back', async () => {
    const { host, code, devices } = await startMatch([['guest-uuid', 'Gus']], 0);
    const guest = devices[1]!;
    fakeServer().holdWrites = true;
    guest.dispatch({ type: 'claim', by: 'guest-uuid' });
    host.dispatch({ type: 'claim', by: 'host-uuid' });
    host.dispatch({ type: 'add', by: 'host-uuid', n: 2 });
    // Each device shows its own claim straight away…
    expect(guest.state()!.claimedBy).toBe('guest-uuid');
    expect(host.state()!.claimedBy).toBe('host-uuid');
    releaseWrites();
    await flush();
    // …but only the first one into the log stands, and the host's later move is replayed on top.
    expectInStep(devices);
    expect(host.state()!.claimedBy).toBe('guest-uuid');
    expect(host.state()!.moves).toEqual([{ by: 'host-uuid', n: 2 }]);
    expect(host.net().notice).toMatch(/went through first/);
    expect(guest.net().notice).toBeNull();
    expect(fakeServer().rooms.get(code)!.matches.get(0)!.actions.size).toBe(2);
  });

  it('a player who drops out mid-match gets it back on rejoining; anyone else spectates', async () => {
    const { host, code, devices } = await startMatch([['guest-uuid', 'Gus']], 1);
    for (let i = 0; i < 2; i++) await playMove(devices);
    devices[1]!.net().leaveRoom();
    await flush();
    expect(host.net().onlineUuids.has('guest-uuid')).toBe(false);
    // The guest's seat stays theirs during the match.
    expect(seatNames(host)).toEqual(['Hana', 'Gus', 'AI 1']);

    await playMove([host]); // the AI's turn goes on without them
    const back = await joinAs('guest-uuid', 'Gus', code);
    expect(back.net().connection).toBe('in-game');
    expect(back.net().role).toBe('guest');
    expect(back.net().chat.map((m) => m.text)).toContain('Rejoined the match');
    expectInStep([host, back]);
    expect(back.state()!.moves).toHaveLength(3);

    const stranger = await joinAs('stranger-uuid', 'Sam', code);
    expect(stranger.net().role).toBe('spectator');
    expect(seatNames(host)).toHaveLength(3); // no seat taken mid-match
    for (let i = 0; i < 3; i++) await playMove([host, back]);
    expectInStep([host, back, stranger]);
    expect(host.state()!.phase).toBe('gameOver');
  });

  it('the host reloading mid-match is the host again: it prepares the AI before driving it', async () => {
    const { host, code, devices } = await startMatch([['guest-uuid', 'Gus']], 1);
    for (let i = 0; i < 2; i++) await playMove(devices);
    host.net().leaveRoom();
    await flush();
    const reloaded = await joinAs('host-uuid', 'Hana', code);
    expect(reloaded.net().role).toBe('host');
    expect(await prepareCalls()).toEqual([['tally', 1], ['tally', 1]]);
    expect(reloaded.game().aiReady).toBe(true);
    for (let i = 0; i < 4; i++) await playMove([reloaded, devices[1]!]);
    expectInStep([reloaded, devices[1]!]);
    expect(reloaded.state()!.phase).toBe('gameOver');
  });

  it('play again: a new match with a fresh deal on every device', async () => {
    const { host, code, devices } = await startMatch([['guest-uuid', 'Gus']], 0, 'duel');
    for (let i = 0; i < 6; i++) await playMove(devices);
    expect(devices[1]!.state()!.phase).toBe('gameOver');
    expect(await devices[1]!.net().hostPlayAgain()).toBeNull(); // guests can't
    await flush();
    expect(devices[1]!.state()!.phase).toBe('gameOver');

    expect(await host.net().hostPlayAgain()).toBeNull();
    await flush();
    expect(host.net().lobby!.match).toBe(1);
    for (const d of devices) {
      expect(d.state()!.phase).toBe('playing');
      expect(d.state()!.moves).toEqual([]);
    }
    await playMove(devices);
    expectInStep(devices);
    expect(fakeServer().rooms.get(code)!.matches.get(1)!.actions.size).toBe(1);
    // A late joiner rebuilds the current match only.
    const late = await joinAs('late-uuid', 'Lu', code);
    expectInStep([host, late]);
  });

  it('back to the lobby: everyone follows, the options can change, and the next match starts from there', async () => {
    const { host, code, devices } = await startMatch([['guest-uuid', 'Gus']], 0);
    for (let i = 0; i < 6; i++) await playMove(devices);
    const late = await joinAs('late-uuid', 'Lu', code); // watching
    host.net().hostReturnToLobby();
    await flush();
    for (const d of [...devices, late]) {
      expect(d.net().connection).toBe('lobby');
      expect(d.state()).toBeNull();
    }
    expect(late.net().role).toBe('spectator');
    late.net().takeSeat();
    host.net().hostSetConfig({ target: 3 });
    await flush();
    expect(seatNames(host)).toEqual(['Hana', 'Gus', 'Lu']);
    expect(await host.net().hostStartMatch()).toBeNull();
    await flush();
    for (const d of [...devices, late]) {
      expect(d.net().connection).toBe('in-game');
      expect(d.state()!.target).toBe(3);
    }
    expect(late.net().role).toBe('guest');
  });
});
