// Mounts the active GameModule's GameView. The shell hands the module its
// own state slice + a dispatch function — the module's view never reads from
// the global store directly.
//
// Also runs the AI driver: when the active player is an AI seat (or any AI is
// expected to advance the round, e.g. roundEnd), we tick chooseAIAction in a
// small loop with a short delay so the UI shows the move.

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { GameUiBundle, GameStateShape } from '@/core/module';

interface Props {
  onExit(): void;
}

export function GameHost({ onExit }: Props) {
  const module = useGameStore((s) => s.module);
  const state = useGameStore((s) => s.state);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const dispatch = useGameStore((s) => s.dispatch);
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
  // Use a small delay so users can see the AI's move.
  useEffect(() => {
    if (!module || !state || !module.chooseAIAction) return;
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
  }, [module, state]);

  if (!module || !state) {
    return (
      <div>
        <p>No game in progress.</p>
        <button onClick={onExit}>← Back</button>
      </div>
    );
  }

  const GameView = bundle?.GameView;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>{module.name}</strong>
        <button className="secondary" onClick={() => { useGameStore.getState().clear(); onExit(); }}>
          Leave game
        </button>
      </div>
      {GameView ? (
        <GameView state={state} localPlayerId={localPlayerId} dispatch={dispatch} />
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}
