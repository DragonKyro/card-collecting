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
import type { Seat } from '@/core/types';
import { randomSeed } from '@/core/rng';
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
  const [rulesOpen, setRulesOpen] = useState(false);
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

  const RulesComponent = bundle?.Rules;
  const isGameOver = state.phase === 'gameOver';
  // In online matches only the host re-rolls a new game; guests just wait for
  // the host's `start` broadcast (the existing channel handler reloads the
  // gameStore on their end). In solo / hot-seat anyone can hit Play Again.
  const canPlayAgain = isGameOver && (role === 'solo' || role === 'host');

  function playAgain() {
    if (!canPlayAgain) return;
    const cur = useGameStore.getState();
    if (!cur.module || !cur.matchConfig) {
      alert('Cannot replay — original match config not available.');
      return;
    }
    const cfg = cur.matchConfig as { config: unknown; seats: Seat[] };
    const seed = randomSeed();
    const initial = cur.module.createInitialState(cfg.config, seed, cfg.seats);
    cur.loadGame(cur.module, initial, cur.localPlayerId, cfg);
    if (role === 'host') {
      // Re-broadcast to keep guests in sync.
      const seatUuids = cfg.seats.map((s) => s.id);
      useNetworkStore.getState().broadcastStart(initial, seatUuids);
    }
  }

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
          {canPlayAgain && (
            <button onClick={playAgain}>🔁 Play again</button>
          )}
          {RulesComponent && (
            <button className="secondary" onClick={() => setRulesOpen(true)}>📖 Rules</button>
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
      {rulesOpen && RulesComponent && (
        <div className="rules-modal-backdrop" onClick={() => setRulesOpen(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-modal-header">
              <h3>{module.name} — Rules</h3>
              <button className="secondary" onClick={() => setRulesOpen(false)}>Close</button>
            </div>
            <div className="rules-modal-body">
              <RulesComponent />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
