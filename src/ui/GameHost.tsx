// Mounts the active GameModule's GameView. The shell hands the module its
// own state slice + a dispatch function — the module's view never reads from
// the global store directly.
//
// Also runs the AI driver: when the active player is an AI seat (or any AI is
// expected to advance the round, e.g. roundEnd), we tick chooseAIAction in a
// small loop with a short delay so the UI shows the move. In online matches
// only the host runs the AI driver — guests would double-dispatch otherwise.

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import type { GameUiBundle, GameStateShape } from '@/core/module';
import { ChatPanel } from './ChatPanel';

interface Props {
  onExit(): void;
}

export function GameHost({ onExit }: Props) {
  const module = useGameStore((s) => s.module);
  const state = useGameStore((s) => s.state);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const dispatch = useGameStore((s) => s.dispatch);
  const role = useNetworkStore((s) => s.role);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const [bundle, setBundle] = useState<GameUiBundle<GameStateShape, unknown, unknown> | null>(null);
  const tickingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!module) return;
    module.ui().then((b) => {
      if (!cancelled) setBundle(b as GameUiBundle<GameStateShape, unknown, unknown>);
    });
    return () => { cancelled = true; };
  }, [module]);

  // AI driver: if the active player is an AI seat, run its chooseAIAction.
  // In online matches only the host drives AI — otherwise multiple peers would
  // each dispatch the same AI action.
  useEffect(() => {
    if (!module || !state || !module.chooseAIAction) return;
    if (role === 'guest' || role === 'spectator') return;
    if (tickingRef.current) return;
    const active = state.activePlayerId;
    const seat = active ? state.seats.find((s) => s.id === active) : null;
    const isAITurn = seat?.isAI === true && state.phase === 'playing';
    if (!isAITurn) return;

    tickingRef.current = true;
    const timer = setTimeout(() => {
      tickingRef.current = false;
      const cur = useGameStore.getState();
      if (!cur.module || !cur.state || !cur.module.chooseAIAction) return;
      const a = cur.module.chooseAIAction(cur.state, active!);
      if (a) {
        try {
          cur.dispatch(a);
        } catch (e) {
          console.error('AI dispatch failed', e);
        }
      }
    }, 650);
    return () => { clearTimeout(timer); tickingRef.current = false; };
  }, [module, state, role]);

  if (!module || !state) {
    return (
      <div>
        <p>No game in progress.</p>
        <button onClick={onExit}>← Back</button>
      </div>
    );
  }

  const GameView = bundle?.GameView;
  // Spectators see the game but can't act; nuke dispatch to a no-op so an
  // accidental click can't mutate local-only state.
  const effectiveDispatch = role === 'spectator' ? () => {} : dispatch;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <strong>{module.name}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {role !== 'solo' && roomCode && (
            <span className="net-pill">
              <span className={`net-dot net-dot-${role}`} />
              {role} · room <code>{roomCode}</code>
            </span>
          )}
          <button
            className="secondary"
            onClick={() => {
              useNetworkStore.getState().leave();
              useGameStore.getState().clear();
              onExit();
            }}
          >
            Leave game
          </button>
        </div>
      </div>
      {GameView ? (
        <GameView state={state} localPlayerId={localPlayerId} dispatch={effectiveDispatch} />
      ) : (
        <p>Loading…</p>
      )}
      {role !== 'solo' && <ChatPanel />}
    </div>
  );
}
