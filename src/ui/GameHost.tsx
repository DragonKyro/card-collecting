// Mounts the active GameModule's GameView. The shell hands the module its
// own state slice + a dispatch function — the module's view never reads from
// the global store directly.

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    if (!module) return;
    module.ui().then((b) => {
      if (!cancelled) setBundle(b as GameUiBundle<GameStateShape, unknown, unknown>);
    });
    return () => { cancelled = true; };
  }, [module]);

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
