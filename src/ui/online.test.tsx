import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeServer, resetFakeServer } from '@/net/fakeTransport';

// The shell's online screens over the in-memory server, with stand-in games
// (src/store/testGames.ts): host from a game's lobby, start, play again, back
// to the lobby, leave; and the picker's join box.
vi.mock('@/net/firebaseRoom', () => import('@/net/fakeTransport'));
vi.mock('@/games/registry', () => import('@/store/testGames'));
// The real AI driver waits 380 ms per move; slower still when the full suite runs in parallel.
vi.setConfig({ testTimeout: 30000 });

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

async function loadApp() {
  vi.resetModules();
  const { default: App } = await import('./App');
  const { useNetworkStore } = await import('@/store/networkStore');
  const { useGameStore } = await import('@/store/gameStore');
  render(<App />);
  return { net: () => useNetworkStore.getState(), game: () => useGameStore.getState() };
}

beforeEach(() => {
  resetFakeServer();
  vi.stubGlobal('localStorage', memoryStorage());
  localStorage.setItem('card-collecting.uuid', 'host-uuid');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('online screens', () => {
  it('host online from a lobby, start, play again, back to the lobby, leave', async () => {
    const { net, game } = await loadApp();
    fireEvent.click(screen.getByText('Tally'));
    const nameBox = screen.getByPlaceholderText('Your name') as HTMLInputElement;
    fireEvent.change(nameBox, { target: { value: 'Hana' } });
    fireEvent.click(screen.getByText('Host online'));
    await screen.findByText('Copy invite link');
    const code = net().roomCode!;
    expect(screen.getByText(code)).toBeTruthy();
    expect(window.location.search).toContain(`room=${code}`);
    // The local lobby's AI seat came along.
    expect(net().lobby!.seats.map((s) => s.name)).toEqual(['Hana', 'Player 2']);
    expect(fakeServer().rooms.get(code)).toBeTruthy();

    fireEvent.click(screen.getByText('Start match'));
    await screen.findByRole('button', { name: /Leave\s+room/ });
    expect(net().connection).toBe('in-game');
    expect(screen.getByText(code)).toBeTruthy();

    // Play to the end (the host's own seat, then the AI's via the driver).
    for (let i = 0; i < 6 && game().state!.phase !== 'gameOver'; i++) {
      const s = game().state!;
      if (s.activePlayerId === 'host-uuid') act(() => game().dispatch({ type: 'add', by: 'host-uuid', n: 1 }));
      await waitFor(() => expect(game().state!.activePlayerId).not.toBe(s.activePlayerId), { timeout: 3000 });
    }
    expect(game().state!.phase).toBe('gameOver');
    fireEvent.click(await screen.findByText('🔁 Play again'));
    await waitFor(() => expect(game().state!.phase).toBe('playing'));
    expect(net().lobby!.match).toBe(1);

    // Back to the lobby from a finished match.
    for (let i = 0; i < 6 && game().state!.phase !== 'gameOver'; i++) {
      const s = game().state!;
      if (s.activePlayerId === 'host-uuid') act(() => game().dispatch({ type: 'add', by: 'host-uuid', n: 1 }));
      await waitFor(() => expect(game().state!.activePlayerId).not.toBe(s.activePlayerId), { timeout: 3000 });
    }
    fireEvent.click(await screen.findByText('Lobby'));
    await screen.findByText('Start match');
    expect(game().state).toBeNull();

    fireEvent.click(screen.getByText('← Leave room'));
    await screen.findByText("Join a friend's room");
    expect(net().connection).toBe('disconnected');
    expect(window.location.search).not.toContain('room=');
  });

  it('the join box reports a code with no room, and Back returns to the picker', async () => {
    await loadApp();
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Gus' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'zzzz' } });
    fireEvent.click(screen.getByText('Join'));
    await screen.findByText(/no room with code ZZZZ/);
    fireEvent.click(screen.getByText('Back'));
    await screen.findByText("Join a friend's room");
  });

  it('a room code in the URL rejoins it when a name is saved', async () => {
    // Someone else's room.
    localStorage.setItem('card-collecting.uuid', 'other-uuid');
    const other = await loadApp();
    fireEvent.click(screen.getByText('Tally'));
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Olga' } });
    fireEvent.click(screen.getByText('Host online'));
    await screen.findByText('Copy invite link');
    const code = other.net().roomCode!;
    cleanup();

    localStorage.setItem('card-collecting.uuid', 'guest-uuid');
    localStorage.setItem('card-collecting.displayName', 'Gus');
    window.history.replaceState(null, '', `/?room=${code}`);
    const guest = await loadApp();
    await waitFor(() => expect(guest.net().connection).toBe('lobby'));
    await screen.findByText(/Waiting for Olga to start/);
    expect(guest.net().lobby!.seats.map((s) => s.name)).toContain('Gus');
  });
});
