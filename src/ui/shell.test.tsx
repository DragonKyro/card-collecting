import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnyGameModule } from '@/core/module';
import type { Seat } from '@/core/types';
import { GAMES, prepareCalls, type TallyAction, type TallyState } from '@/store/testGames';

// The local shell around a game: the hot-seat pass screen / whose view is
// shown, and the lobby's per-seat AI difficulty. Stand-in games
// (src/store/testGames.ts); Tally is turn-based with levels easy / hard.
vi.mock('@/games/registry', () => import('@/store/testGames'));
vi.setConfig({ testTimeout: 20000 });

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
  vi.stubGlobal('localStorage', memoryStorage());
  prepareCalls.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tally = GAMES.find((g) => g.id === 'tally')!;

/** Tally with a GameView that shows whose view it was handed. */
function withView(module: AnyGameModule): AnyGameModule {
  return {
    ...module,
    ui: async () => ({
      LobbyConfig: () => null,
      GameView: ({ localPlayerId }: { localPlayerId: string | null }) => <div data-testid="view">{localPlayerId ?? 'nobody'}</div>,
    }),
  } as unknown as AnyGameModule;
}

describe('hot-seat with two humans and an AI', () => {
  it("each human gets the pass screen; during the AI's turn the view stays with whoever holds the device", async () => {
    const { GameHost } = await import('./GameHost');
    const { useGameStore } = await import('@/store/gameStore');
    const seats: Seat[] = [
      { id: 'h1', name: 'Ann', color: '#e64a4a', isAI: false, isLocal: true },
      { id: 'h2', name: 'Bob', color: '#3a6ec9', isAI: false, isLocal: true },
      { id: 'ai-1', name: 'Robo', color: '#f37025', isAI: true, isLocal: true },
    ];
    const module = withView(tally);
    act(() => useGameStore.getState().loadGame(module, module.createInitialState({ target: 9 }, 1, seats), 'h1'));
    render(<GameHost onExit={() => {}} onReturnToLobby={() => {}} />);
    const ready = async (name: string) => {
      await screen.findByText('Pass the device');
      expect(screen.getByText(name)).toBeTruthy();
      fireEvent.click(screen.getByText("I'm ready →"));
    };
    const move = (by: string) => act(() => useGameStore.getState().dispatch({ type: 'add', by, n: 1 } satisfies TallyAction));

    await ready('Ann');
    expect((await screen.findByTestId('view')).textContent).toBe('h1');
    move('h1');
    await ready('Bob');
    expect(screen.getByTestId('view').textContent).toBe('h2');
    move('h2');
    // The AI's turn: Bob still holds the device, so the view is Bob's (not seat 0's).
    expect(useGameStore.getState().state!.activePlayerId).toBe('ai-1');
    expect(screen.getByTestId('view').textContent).toBe('h2');
    // The AI driver moves, and the device goes back to Ann.
    await ready('Ann');
    expect((useGameStore.getState().state as TallyState).moves.map((m) => m.by)).toEqual(['h1', 'h2', 'ai-1']);
  });
});

describe('hot-seat pass screen decided per match', () => {
  it('a module whose hiddenInfo is a function of the match shows the pass screen only when it says so', async () => {
    const { GameHost } = await import('./GameHost');
    const { useGameStore } = await import('@/store/gameStore');
    const seats: Seat[] = [
      { id: 'h1', name: 'Ann', color: '#e64a4a', isAI: false, isLocal: true },
      { id: 'h2', name: 'Bob', color: '#3a6ec9', isAI: false, isLocal: true },
    ];
    for (const secret of [false, true]) {
      const asked: number[] = [];
      const module = {
        ...withView(tally),
        // Decided from the match itself (here: its target, which stands in for an expansion option).
        hiddenInfo: (s: TallyState) => { asked.push(s.target); return secret; },
      } as unknown as AnyGameModule;
      act(() => useGameStore.getState().loadGame(module, module.createInitialState({ target: 9 }, 1, seats), 'h1'));
      render(<GameHost onExit={() => {}} onReturnToLobby={() => {}} />);
      if (secret) {
        await screen.findByText('Pass the device');
        fireEvent.click(screen.getByText("I'm ready →"));
        expect((await screen.findByTestId('view')).textContent).toBe('h1');
      } else {
        expect((await screen.findByTestId('view')).textContent).toBe('h1');
        expect(screen.queryByText('Pass the device')).toBeNull();
        act(() => useGameStore.getState().dispatch({ type: 'add', by: 'h1', n: 1 } satisfies TallyAction));
        // Nothing to hide: the next human plays straight on.
        expect(screen.getByTestId('view').textContent).toBe('h2');
        expect(screen.queryByText('Pass the device')).toBeNull();
      }
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((t) => t === 9)).toBe(true);
      cleanup();
    }
  });
});

describe('local lobby: per-seat AI difficulty', () => {
  it('every AI seat has its own level picker (default level shown), and the match starts with them', async () => {
    const { GameLobby } = await import('./GameLobby');
    const { useGameStore } = await import('@/store/gameStore');
    const onStart = vi.fn();
    render(<GameLobby module={tally} onBack={() => {}} onStart={onStart} />);
    const first = (await screen.findByLabelText('Player 2 difficulty')) as HTMLSelectElement;
    expect(first.value).toBe('hard');
    fireEvent.click(screen.getByText('+ Add seat'));
    fireEvent.change(first, { target: { value: 'easy' } });
    expect((screen.getByLabelText('Player 3 difficulty') as HTMLSelectElement).value).toBe('hard');
    // A human seat has no picker.
    expect(screen.queryByLabelText('You difficulty')).toBeNull();
    fireEvent.click(screen.getByText('Start (hot-seat)'));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(useGameStore.getState().state!.seats.map((s) => s.aiLevel)).toEqual([undefined, 'easy', undefined]);
    expect(prepareCalls).toEqual([['tally', 2]]);
  });

  it("a game whose AI has one strength shows no picker", async () => {
    const { GameLobby } = await import('./GameLobby');
    render(<GameLobby module={GAMES.find((g) => g.id === 'duel')!} onBack={() => {}} onStart={() => {}} />);
    await screen.findByDisplayValue('Player 2');
    expect(screen.queryByLabelText('Player 2 difficulty')).toBeNull();
  });
});
