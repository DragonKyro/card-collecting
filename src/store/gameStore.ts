// Holds the active game's state along with the module that knows how to reduce it.
// The store is generic over the module — it never names a specific game.
//
// dispatch() applies the action locally and (if online) broadcasts via the
// networkStore. applyLocal() is the receiver path: silent apply, no broadcast.
// Both paths run the same reducer so peers stay in sync.

import { create } from 'zustand';
import type { AnyGameModule, GameStateShape } from '@/core/module';
import type { PlayerId } from '@/core/types';

type BroadcastHandler = (actionJson: string) => void;

interface GameStore {
  module: AnyGameModule | null;
  state: GameStateShape | null;
  /** Identity of the local human seat (null for spectator / pre-lobby). */
  localPlayerId: PlayerId | null;

  loadGame(module: AnyGameModule, initialState: GameStateShape, localPlayerId: PlayerId | null): void;
  dispatch(action: unknown): void;
  applyLocal(action: unknown): void;
  clear(): void;

  registerBroadcastHandler(fn: BroadcastHandler | null): void;
  _broadcast: BroadcastHandler | null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  module: null,
  state: null,
  localPlayerId: null,
  _broadcast: null,

  loadGame: (module, state, localPlayerId) => set({ module, state, localPlayerId }),

  dispatch: (action) => {
    const { module, state, _broadcast } = get();
    if (!module || !state) throw new Error('dispatch called before loadGame');
    const next = module.applyAction(state, action) as GameStateShape;
    set({ state: next });
    _broadcast?.(JSON.stringify(action));
  },

  applyLocal: (action) => {
    const { module, state } = get();
    if (!module || !state) return;
    const next = module.applyAction(state, action) as GameStateShape;
    set({ state: next });
  },

  clear: () => set({ module: null, state: null, localPlayerId: null }),

  registerBroadcastHandler: (fn) => set({ _broadcast: fn }),
}));
