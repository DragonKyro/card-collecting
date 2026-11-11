// The local lobby: seat builder + game-specific config for hot-seat / AI
// play, plus "Host online", which opens a room carrying these options and AI
// seats over (the online lobby itself is OnlineLobby, routed by App while
// this device is in a room).

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AnyGameModule, GameStateShape, GameUiBundle } from '@/core/module';
import type { Seat } from '@/core/types';
import { randomSeed } from '@/core/rng';
import { SEAT_COLORS } from '@/core/seatColors';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore, warmUpNetwork } from '@/store/networkStore';
import { getOrCreateUuid } from '@/net/identity';
import { AiLevelSelect, ColorSwatchPicker, RulesModal } from './lobbyParts';
import { LobbyBanner } from './LobbyBanner';
import { playerRange } from './gameTheme';

interface Props {
  module: AnyGameModule;
  /** Seats + config to start from instead of the defaults — set when a
   *  finished match returns here (`GameModule.replayInLobby`). */
  initial?: { config: unknown; seats: Seat[] };
  onBack(): void;
  onStart(): void;
}

/** "You vs 2 AIs", "3 players, pass and play", … (AI seats count only in a
 *  game that has an AI; one without drops them at the start). */
function lineupSummary(seats: Seat[], hasAI: boolean): string {
  if (!hasAI) seats = seats.filter((s) => !s.isAI);
  const humans = seats.filter((s) => !s.isAI).length;
  const ais = seats.length - humans;
  if (humans === 0) return `${ais} AIs play it out — sit back and watch`;
  if (ais === 0) return humans === 1 ? 'Solo' : `${humans} players, pass and play on this device`;
  const vs = `${ais} AI${ais === 1 ? '' : 's'}`;
  return humans === 1 ? `You vs ${vs}` : `${humans} players + ${vs}, pass and play`;
}

export function GameLobby({ module, initial, onBack, onStart }: Props) {
  const localUuid = useMemo(() => getOrCreateUuid(), []);
  const savedName = useNetworkStore((s) => s.myDisplayName);
  const hasAI = !!module.chooseAIAction;

  // Seat 0 defaults to the human local player; seats added beyond default to
  // AI (to humans in a game with no AI, which seats just "You" when it can be
  // played alone). Returning from a match re-seeds from that match's lineup.
  const [seats, setSeats] = useState<Seat[]>(() => {
    if (initial?.seats) return initial.seats;
    const you: Seat = { id: localUuid, name: 'You', color: SEAT_COLORS[0]!, isAI: false, isLocal: true };
    if (!hasAI && module.minPlayers <= 1) return [you];
    return [you, { id: 'seat-1', name: 'Player 2', color: SEAT_COLORS[1]!, isAI: hasAI, isLocal: true }];
  });
  const [config, setConfig] = useState<unknown>(() =>
    initial ? initial.config : module.defaultConfig(seats));
  const [bundle, setBundle] = useState<GameUiBundle<GameStateShape, unknown, unknown> | null>(null);
  /** True while module.prepare (e.g. loading AI policy files) runs before a start. */
  const [preparing, setPreparing] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [hostName, setHostName] = useState(savedName);

  useEffect(() => {
    let cancelled = false;
    module.ui().then((b) => {
      if (!cancelled) setBundle(b as GameUiBundle<GameStateShape, unknown, unknown>);
    });
    return () => { cancelled = true; };
  }, [module]);

  function addSeat() {
    if (seats.length >= module.maxPlayers) return;
    // Newly added seats default to AI for a friction-free solo start; users
    // can toggle them back to humans for hot-seat play.
    const newSeat: Seat = {
      id: `seat-${seats.length}-${Math.floor(performance.now())}`,
      name: `Player ${seats.length + 1}`,
      color: SEAT_COLORS[seats.length % SEAT_COLORS.length]!,
      isAI: hasAI,
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

  async function startLocal() {
    const errors = module.validateConfig(config, seats);
    if (errors.length) { alert(errors.join('\n')); return; }
    if (module.prepare) {
      setPreparing(true);
      try {
        await module.prepare(config, seats);
      } catch (e) {
        alert('Could not load the AI: ' + (e as Error).message);
        return;
      } finally {
        setPreparing(false);
      }
    }
    const seed = randomSeed();
    const initialState = module.createInitialState(config, seed, seats);
    useGameStore.getState().loadGame(module, initialState, localUuid, { config, seats });
    onStart();
  }

  function hostOnline() {
    const name = hostName.trim();
    if (name) void useNetworkStore.getState().createRoom(module.id, name, { config, seats });
  }

  const LobbyConfigComponent = bundle?.LobbyConfig;
  const RulesComponent = bundle?.Rules;
  const canStart = seats.length >= module.minPlayers;

  return (
    <div className="lobby-single">
      <div className="lobby-topbar cc-chrome">
        <button className="secondary" onClick={onBack}>← Back</button>
        {RulesComponent && (
          <button className="secondary" onClick={() => setShowRules(true)}>📖 Rules</button>
        )}
      </div>

      <LobbyBanner module={module} />

      {/* ----- seats ----- */}
      <section className="lobby-panel cc-chrome">
        <h4 className="lobby-section-h">
          Seats <span className="lobby-section-count">{seats.length} of {playerRange(module)}</span>
        </h4>
        <div className="seat-list">
          {seats.map((s, i) => (
            <div key={s.id} className="seat-row" style={{ '--seat': s.color, animationDelay: `${i * 40}ms` } as CSSProperties}>
              <ColorSwatchPicker
                value={s.color}
                takenBy={Object.fromEntries(seats.filter((x) => x.id !== s.id).map((x) => [x.color, x.name]))}
                onChange={(newColor) => updateSeat(s.id, { color: newColor })}
              />
              <input
                className="seat-name"
                value={s.name}
                onChange={(e) => updateSeat(s.id, { name: e.target.value })}
              />
              {hasAI && (
                <label className="seat-ai" title={s.isAI ? 'Played by the computer' : 'Played by a person'}>
                  <input
                    type="checkbox"
                    checked={s.isAI}
                    onChange={(e) => updateSeat(s.id, { isAI: e.target.checked })}
                  />
                  AI
                </label>
              )}
              <AiLevelSelect module={module} seat={s} onChange={(aiLevel) => updateSeat(s.id, { aiLevel })} />
              <button
                className="secondary seat-remove"
                onClick={() => removeSeat(s.id)}
                disabled={seats.length <= module.minPlayers}
                title="Remove seat"
              >×</button>
            </div>
          ))}
        </div>
        <button
          className="secondary"
          onClick={addSeat}
          disabled={seats.length >= module.maxPlayers}
          style={{ marginTop: 10 }}
        >
          + Add seat
        </button>
      </section>

      {/* ----- game-specific options ----- */}
      {LobbyConfigComponent && (
        <section className="lobby-panel lobby-options">
          <h4 className="lobby-section-h">Options</h4>
          <LobbyConfigComponent config={config} seats={seats} onChange={setConfig} />
        </section>
      )}

      {/* ----- launch ----- */}
      <section className="lobby-panel lobby-launch-panel cc-chrome">
        <div className="lobby-launch">
          <button className="lobby-start" onClick={startLocal} disabled={!canStart || preparing}>
            {preparing ? 'Loading AI…' : 'Start (hot-seat)'}
          </button>
          <span className="lobby-hint lobby-lineup">{lineupSummary(seats, hasAI)}</span>
        </div>

        {/* ----- host online ----- */}
        {module.onlineSupported !== false && (
          <div className="online-join">
            <h4>Play online</h4>
            <p className="lobby-hint">
              Open a room with these options and AI seats; friends join from their own devices with the room code.
            </p>
            <div className="online-join-row" onPointerEnter={warmUpNetwork} onFocus={warmUpNetwork}>
              <input
                placeholder="Your name"
                value={hostName}
                maxLength={24}
                onChange={(e) => setHostName(e.target.value)}
              />
              <button className="secondary" onClick={hostOnline} disabled={!hostName.trim()} title={hostName.trim() ? undefined : 'Enter the name friends will see'}>
                Host online
              </button>
            </div>
          </div>
        )}
      </section>

      {showRules && RulesComponent && (
        <RulesModal title={module.name} Rules={RulesComponent} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}
