// Seat builder + game-specific config. Spawns hot-seat or online game.
// Online flow (WebRTC join / host / room code) is stubbed pending net/room.ts.

import { useEffect, useMemo, useState } from 'react';
import type { AnyGameModule, GameStateShape, GameUiBundle } from '@/core/module';
import type { Seat } from '@/core/types';
import { randomSeed } from '@/core/rng';
import { useGameStore } from '@/store/gameStore';
import { getOrCreateUuid } from '@/net/identity';

const COLORS = ['#ff7070', '#6aa0ff', '#7fd47f', '#ffb84d', '#c98aff', '#67d4d4', '#ff90c8', '#e0e0e0'];

interface Props {
  module: AnyGameModule;
  onBack(): void;
  onStart(): void;
}

export function GameLobby({ module, onBack, onStart }: Props) {
  const localUuid = useMemo(() => getOrCreateUuid(), []);
  const [seats, setSeats] = useState<Seat[]>(() => [
    { id: localUuid, name: 'You', color: COLORS[0], isAI: false, isLocal: true },
    { id: 'seat-1', name: 'Player 2', color: COLORS[1], isAI: false, isLocal: true },
  ]);
  const [config, setConfig] = useState<unknown>(() => module.defaultConfig(seats));
  const [bundle, setBundle] = useState<GameUiBundle<GameStateShape, unknown, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    module.ui().then((b) => {
      if (!cancelled) setBundle(b as GameUiBundle<GameStateShape, unknown, unknown>);
    });
    return () => { cancelled = true; };
  }, [module]);

  function addSeat() {
    if (seats.length >= module.maxPlayers) return;
    const newSeat: Seat = {
      id: `seat-${seats.length}`,
      name: `Player ${seats.length + 1}`,
      color: COLORS[seats.length % COLORS.length],
      isAI: false,
      isLocal: true,
    };
    setSeats([...seats, newSeat]);
  }

  function removeSeat(id: string) {
    if (seats.length <= module.minPlayers) return;
    setSeats(seats.filter((s) => s.id !== id));
  }

  function updateSeat(id: string, patch: Partial<Seat>) {
    setSeats(seats.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function start() {
    const errors = module.validateConfig(config);
    if (errors.length) { alert(errors.join('\n')); return; }
    const seed = randomSeed();
    const initial = module.createInitialState(config, seed);
    initial.seats = seats;
    initial.activePlayerId = seats[0]?.id ?? null;
    // Local-only for now; hot-seat reveals the active player's hand to whichever
    // device they're sitting at. Online flow will swap localPlayerId per peer.
    useGameStore.getState().loadGame(module, initial, localUuid);
    onStart();
  }

  const LobbyConfigComponent = bundle?.LobbyConfig;

  return (
    <div className="lobby">
      <section>
        <h3>{module.name}</h3>
        <p style={{ color: 'var(--fg-muted)' }}>{module.tagline}</p>
        {LobbyConfigComponent && (
          <LobbyConfigComponent config={config} seats={seats} onChange={setConfig} />
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button onClick={start}>Start (hot-seat)</button>
          <button className="secondary" disabled title="Online multiplayer — TBD">
            Host online
          </button>
          <button className="secondary" disabled title="Online multiplayer — TBD">
            Join online
          </button>
          <button className="secondary" onClick={onBack}>← Back</button>
        </div>
      </section>
      <section>
        <h3>Seats</h3>
        {seats.map((s) => (
          <div key={s.id} className="seat-row">
            <span className="swatch" style={{ background: s.color }} />
            <input
              value={s.name}
              onChange={(e) => updateSeat(s.id, { name: e.target.value })}
              style={{ flex: 1 }}
            />
            <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={s.isAI}
                onChange={(e) => updateSeat(s.id, { isAI: e.target.checked })}
              />
              AI
            </label>
            <button className="secondary" onClick={() => removeSeat(s.id)} disabled={seats.length <= module.minPlayers}>×</button>
          </div>
        ))}
        <button
          className="secondary"
          onClick={addSeat}
          disabled={seats.length >= module.maxPlayers}
          style={{ marginTop: 8 }}
        >
          + Add seat
        </button>
      </section>
    </div>
  );
}
