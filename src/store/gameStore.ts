// Holds the active game's state along with the module that knows how to reduce it.
// The store is generic over the module — it never names a specific game.
//
// dispatch() applies the action locally and, when online, hands it (with the
// state it was applied to) to the networkStore, which writes it to the
// room's log. applyLocal() is the receiver path: silent apply, no broadcast.
// Both paths run the same reducer so every device stays in step.
// restoreState() rolls back (online, when another device's move took the log
// slot this device's move was headed for). States are immutable, so a
// snapshot is just the state reference.

import { create } from 'zustand';
import type { AnyGameModule, GameStateShape } from '@/core/module';
import type { PlayerId } from '@/core/types';

/** `fromAI`: the AI driver made this move (online, a dropped AI move needs no notice). */
type BroadcastHandler = (action: unknown, before: GameStateShape, fromAI: boolean) => void;
/** Online: true when this device may not move at all (a spectator). */
type DispatchGuard = () => boolean;

interface GameStore {
  module: AnyGameModule | null;
  state: GameStateShape | null;
  /** Identity of the local human seat (null for spectator / pre-lobby). */
  localPlayerId: PlayerId | null;
  /** Original config + seats stashed on game start, so "Play Again" can
   *  recreate a fresh match with the same lineup but a new seed. */
  matchConfig: unknown;
  /** False while this device is still running the module's `prepare` for a
   *  match it didn't start itself (an online host rejoining): the AI driver
   *  waits for it. */
  aiReady: boolean;

  loadGame(module: AnyGameModule, initialState: GameStateShape, localPlayerId: PlayerId | null, matchConfig?: unknown): void;
  /** Apply a move (and log it, online). `{ ai: true }` marks the AI driver's moves. */
  dispatch(action: unknown, opts?: { ai?: boolean }): void;
  /** Apply a move without broadcasting it. False (and nothing changes) when the reducer rejects it. */
  applyLocal(action: unknown): boolean;
  /** Put back an earlier state (online rollback). */
  restoreState(state: GameStateShape): void;
  setAiReady(ready: boolean): void;
  clear(): void;

  registerBroadcastHandler(fn: BroadcastHandler | null): void;
  registerDispatchGuard(fn: DispatchGuard | null): void;
  _broadcast: BroadcastHandler | null;
  _blocked: DispatchGuard | null;
}

export const useGameStore = create<GameStore>((set, get) => ({
  module: null,
  state: null,
  localPlayerId: null,
  matchConfig: undefined,
  aiReady: true,
  _broadcast: null,
  _blocked: null,

  loadGame: (module, state, localPlayerId, matchConfig) =>
    set({ module, state, localPlayerId, matchConfig, aiReady: true }),

  dispatch: (action, opts) => {
    const { module, state, _broadcast, _blocked } = get();
    if (!module || !state) throw new Error('dispatch called before loadGame');
    if (_blocked?.()) return;
    const next = module.applyAction(state, action) as GameStateShape;
    set({ state: next });
    _broadcast?.(action, state, opts?.ai === true);
  },

  applyLocal: (action) => {
    const { module, state } = get();
    if (!module || !state) return false;
    let next: GameStateShape;
    try {
      next = module.applyAction(state, action) as GameStateShape;
    } catch (e) {
      console.warn('[game] move rejected:', (e as Error).message);
      return false;
    }
    set({ state: next });
    return true;
  },

  restoreState: (state) => set({ state }),

  setAiReady: (ready) => set({ aiReady: ready }),

  clear: () => set({ module: null, state: null, localPlayerId: null, matchConfig: undefined, aiReady: true }),

  registerBroadcastHandler: (fn) => set({ _broadcast: fn }),
  registerDispatchGuard: (fn) => set({ _blocked: fn }),
}));
