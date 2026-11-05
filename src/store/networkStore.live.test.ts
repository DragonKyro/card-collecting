// @vitest-environment node
//
// Online play against the real Firebase project (github-games-e7c7d, shared
// with other apps; everything here lives under /card-collecting), each
// "device" with its own Firebase app and anonymous sign-in. Skipped unless
// FIREBASE_LIVE=1:
//
//   FIREBASE_LIVE=1 npx vitest run src/store/networkStore.live.test.ts
//
// The rules don't let clients delete fresh rooms, so it prints the room codes
// it used; remove them afterwards with
// `MSYS_NO_PATHCONV=1 npx firebase-tools database:remove /card-collecting/rooms/<CODE> --force`
// (their index entries go a week later, with the next sweep of their day).
// Each run also leaves a few anonymous users in Firebase Auth (harmless). The
// sweep test plants week-old rooms with the Firebase CLI (logged in as an
// admin). Games come from the stand-in registry (src/store/testGames.ts).

import { afterAll, describe, expect, it, vi } from 'vitest';
import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, ref, remove, set } from 'firebase/database';
import { execSync } from 'node:child_process';
import { unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TallyAction, TallyState } from './testGames';

const LIVE = process.env.FIREBASE_LIVE === '1';

vi.mock('@/games/registry', () => import('@/store/testGames'));
vi.mock('@/net/firebaseRoom', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/net/firebaseRoom')>();
  let transport: ReturnType<typeof real.createFirebaseTransport> | null = null;
  return {
    ...real,
    getTransport: () =>
      (transport ??= real.createFirebaseTransport({
        appName: `device-${Math.random().toString(36).slice(2)}`,
        persistence: 'memory',
      })),
  };
});

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
vi.stubGlobal('localStorage', memoryStorage());

const run = Date.now().toString(36);
const rooms: string[] = [];

async function device(name: string) {
  vi.resetModules();
  const uuid = `live-${run}-${name}`;
  localStorage.setItem('card-collecting.uuid', uuid);
  const netModule = await import('@/store/networkStore');
  const { useGameStore } = await import('@/store/gameStore');
  return {
    uuid,
    name,
    net: () => netModule.useNetworkStore.getState(),
    state: () => useGameStore.getState().state as TallyState | null,
    dispatch: (a: TallyAction) => useGameStore.getState().dispatch(a),
  };
}
type Device = Awaited<ReturnType<typeof device>>;

const until = (f: () => void, timeout = 20000) => vi.waitFor(f, { timeout, interval: 50 });

async function playMove(devices: Device[]) {
  const host = devices[0]!;
  const s = host.state()!;
  const active = s.activePlayerId!;
  const owner = devices.find((d) => d.uuid === active) ?? host;
  owner.dispatch({ type: 'add', by: active, n: 1 });
  const target = s.moves.length + 1;
  await until(() => devices.forEach((d) => expect(d.state()!.moves.length).toBe(target)));
}

describe.skipIf(!LIVE)('online play on the real Firebase project', () => {
  const all: Device[] = [];

  afterAll(() => {
    all.forEach((d) => d.net().leaveRoom());
    console.log(`[live] rooms used: ${rooms.join(', ')}`);
  });

  it('create, join, start, play, race, rejoin, spectate, play again', async () => {
    const host = await device('host');
    all.push(host);
    await host.net().createRoom('tally', 'Hana');
    await until(() => expect(host.net().connection).toBe('lobby'));
    const code = host.net().roomCode!;
    rooms.push(code);

    const guest = await device('guest');
    all.push(guest);
    await guest.net().joinRoom(code, 'Gus');
    await until(() => expect(host.net().lobby!.seats.map((s) => s.name)).toEqual(['Hana', 'Gus']));
    await until(() => expect(guest.net().connection).toBe('lobby'));
    await until(() => expect(host.net().onlineUuids.has(guest.uuid)).toBe(true));

    // Unknown code: an immediate, definite answer.
    const lost = await device('lost');
    await lost.net().joinRoom('Q9Q9', 'Lo');
    expect(lost.net().joinFailure).toMatchObject({ reason: 'notFound' });

    host.net().hostAddAISeat();
    await until(() => expect(guest.net().lobby!.seats).toHaveLength(3));
    host.net().hostSetConfig({ target: 30 });
    await until(() => expect(JSON.parse(guest.net().lobby!.configJson)).toEqual({ target: 30 }));

    expect(await host.net().hostStartMatch()).toBeNull();
    await until(() => expect(guest.net().connection).toBe('in-game'));
    expect(guest.net().role).toBe('guest');
    expect(guest.state()).toEqual(host.state());

    for (let i = 0; i < 9; i++) await playMove([host, guest]);
    expect(guest.state()).toEqual(host.state());

    // Both claim at once: one stands, everyone agrees which.
    guest.dispatch({ type: 'claim', by: guest.uuid });
    host.dispatch({ type: 'claim', by: host.uuid });
    await until(() => {
      expect(host.state()!.claimedBy).toBe(guest.state()!.claimedBy);
      expect(host.net().notice ?? guest.net().notice).toMatch(/went through first/);
    });

    // The guest drops out and comes back: the whole match.
    guest.net().leaveRoom();
    await until(() => expect(host.net().onlineUuids.has(guest.uuid)).toBe(false));
    const back = await device('guest');
    all.push(back);
    await back.net().joinRoom(code, 'Gus');
    await until(() => expect(back.net().connection).toBe('in-game'));
    await until(() => expect(back.state()).toEqual(host.state()));
    expect(back.net().role).toBe('guest');
    for (let i = 0; i < 3; i++) await playMove([host, back]);

    // A stranger spectates.
    const stranger = await device('stranger');
    all.push(stranger);
    await stranger.net().joinRoom(code, 'Sam');
    await until(() => expect(stranger.state()).toEqual(host.state()));
    expect(stranger.net().role).toBe('spectator');

    // Back to the lobby, then a second match.
    host.net().hostReturnToLobby();
    await until(() => expect(back.net().connection).toBe('lobby'));
    expect(await host.net().hostStartMatch()).toBeNull();
    await until(() => expect(back.state()?.moves).toEqual([]));
    await playMove([host, back]);
    expect(back.state()).toEqual(host.state());
  }, 180000);

  it('the rules: write-once slots, host-only start, no moves before the start, no overwriting a live room', async () => {
    const { createFirebaseTransport } = await vi.importActual<typeof import('@/net/firebaseRoom')>('@/net/firebaseRoom');
    const a = createFirebaseTransport({ appName: `rules-a-${run}`, persistence: 'memory' });
    const b = createFirebaseTransport({ appName: `rules-b-${run}`, persistence: 'memory' });
    const noop = { lobby: () => {}, chat: () => {}, presence: () => {}, connected: () => {} };
    const code = `T${run.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    rooms.push(code);
    const lobby = { hostUuid: 'ua', gameId: 'tally', configJson: '{}', seats: [], match: null, matchCount: 0 };
    const meta = (hostUuid: string) => ({ hostUuid, createdAt: Date.now(), build: 'live-test' });
    const ca = (await a.createRoom(code, meta('ua'), lobby, { uuid: 'ua', name: 'A' }, noop))!;
    expect(ca).not.toBeNull();
    // Someone else can't take over the code.
    expect(await b.createRoom(code, meta('ub'), lobby, { uuid: 'ub', name: 'B' }, noop)).toBeNull();
    const cb = (await b.joinRoom(code, { uuid: 'ub', name: 'B' }, noop))!;
    expect(cb).not.toBeNull();
    // Anyone in the room edits the lobby.
    expect(await cb.updateLobby((l) => ({ ...l, matchCount: 0, seats: [] }))).not.toBeNull();
    // Only the host starts; nobody writes moves before the start.
    const entry = { action: { type: 'add', by: 'ua', n: 1 }, nonce: 'n1' };
    await expect(ca.appendAction(0, 0, entry)).rejects.toThrow(/permission/i);
    const start = { gameId: 'tally', configJson: '{}', seed: 1, seats: [], hostUuid: 'ua', startedAt: Date.now(), check: 'x' };
    await expect(cb.startMatch(0, start)).rejects.toThrow(/permission/i);
    await ca.startMatch(0, start);
    await expect(ca.startMatch(0, start)).rejects.toThrow(/permission/i); // once
    // A slot is written once: the second writer finds it taken.
    expect(await cb.appendAction(0, 0, entry)).toBe(true);
    expect(await ca.appendAction(0, 0, { ...entry, nonce: 'n2' })).toBe(false);
    expect(await ca.appendAction(0, 1, { ...entry, nonce: 'n3' })).toBe(true);
    // Another match's log stays closed until its own start.
    await expect(cb.appendAction(1, 0, entry)).rejects.toThrow(/permission/i);
    ca.leave();
    cb.leave();
  }, 60000);

  it('week-old rooms are swept unless someone is still in them; younger codes stay private', async () => {
    const real = await vi.importActual<typeof import('@/net/firebaseRoom')>('@/net/firebaseRoom');
    const app = initializeApp(real.FIREBASE_CONFIG, `sweep-raw-${run}`);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    const uid = (await signInAnonymously(auth)).user.uid;
    const db = getDatabase(app);
    const at = (path: string) => ref(db, `${real.DB_ROOT}/${path}`);
    const DAY = 24 * 60 * 60 * 1000;
    const tag = run.slice(-3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
    const [idle, busy, code] = [`O${tag}`, `P${tag}`, `S${tag}`];
    rooms.push(code);
    // Clients can't plant an old day (that's the point), so plant it as admin
    // with the CLI (paths relative to DB_ROOT).
    const oldDay = Math.floor(Date.now() / DAY) - 9;
    const room = { meta: { hostUuid: 'raw', hostUid: uid, createdAt: oldDay * DAY + 3_600_000, build: 'live-test', v: 2 }, lobby: '{}' };
    const plant = {
      [`roomDays/${oldDay}`]: (oldDay + 1) * DAY,
      [`roomIndex/${oldDay}/${idle}`]: true,
      [`roomIndex/${oldDay}/${busy}`]: true,
      [`rooms/${idle}`]: room,
      [`rooms/${busy}`]: { ...room, presence: { raw: { uid, uuid: 'raw', name: 'Still here' } } },
    };
    const file = join(tmpdir(), `card-collecting-plant-${run}.json`);
    writeFileSync(file, JSON.stringify(plant));
    try {
      execSync(
        `npx -y firebase-tools@latest database:update /${real.DB_ROOT} "${file}" --project ${real.FIREBASE_CONFIG.projectId} --force`,
        { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
      );
    } finally {
      unlinkSync(file);
    }

    // Anyone can see which days have rooms, but not a recent day's codes.
    expect((await get(at(`roomDays/${oldDay}`))).val()).toBe((oldDay + 1) * DAY);
    // Making a room sweeps: the idle week-old room goes, the busy one (and its day) stay.
    const host = real.createFirebaseTransport({ appName: `sweep-host-${run}`, persistence: 'memory' });
    const noop = { lobby: () => {}, chat: () => {}, presence: () => {}, connected: () => {} };
    const lobby = { hostUuid: 'h', gameId: 'tally', configJson: '{}', seats: [], match: null, matchCount: 0 };
    const c = await host.createRoom(code, { hostUuid: 'h', createdAt: Date.now(), build: 'live-test' }, lobby, { uuid: 'h', name: 'H' }, noop);
    expect(c).not.toBeNull();
    await vi.waitFor(async () => expect((await get(at(`rooms/${idle}/meta`))).exists()).toBe(false), { timeout: 15000 });
    expect((await get(at(`rooms/${busy}/meta`))).exists()).toBe(true);
    expect((await get(at(`roomDays/${oldDay}`))).exists()).toBe(true);
    await expect(get(at(`roomIndex/${Math.floor(Date.now() / DAY)}`))).rejects.toThrow(/permission/i);
    await expect(get(at('roomIndex'))).rejects.toThrow(/permission/i);
    // A fresh day can't be backdated to expose its codes, nor a fresh room deleted.
    await expect(set(at(`roomDays/${Math.floor(Date.now() / DAY)}`), Date.now() - 8 * DAY)).rejects.toThrow(/permission/i);
    await expect(remove(at(`rooms/${code}`))).rejects.toThrow(/permission/i);
    // Nothing outside this app's key is open to it (other apps share the database).
    await expect(get(ref(db, `notCardCollecting${tag}`))).rejects.toThrow(/permission/i);
    await expect(set(ref(db, `notCardCollecting${tag}`), 1)).rejects.toThrow(/permission/i);

    // Once the last device leaves, the next sweep clears it and its day.
    await remove(at(`rooms/${busy}/presence/raw`));
    expect(await real.sweepStaleRooms(db)).toContain(busy);
    expect((await get(at(`rooms/${busy}/meta`))).exists()).toBe(false);
    expect((await get(at(`roomDays/${oldDay}`))).exists()).toBe(false);
    c!.leave();
  }, 90000);
});
