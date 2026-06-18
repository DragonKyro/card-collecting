// Seat builder + game-specific config. Hot-seat and online flows live side by side:
//
//   - Hot-seat: seats are local-only, all isLocal=true. "Start (hot-seat)"
//     loads the game directly into the gameStore.
//   - Online host: opens a Trystero room with a generated code, broadcasts the
//     lobby on every change, and on Start ships the opening state to peers.
//   - Online guest: joins by code, lobby arrives over the wire (rendered
//     read-only), claims a seat by setting that seat's id to their own uuid.
//
// The host stays authoritative — any seat edit on the host's UI broadcasts;
// guests editing their seat is just a "claim a seat" UX (uuid swap on host's
// side, mediated by a `claimSeat` chat-ish trick is overkill — for v1 the host
// arranges seats and guests just connect).

import { useEffect, useMemo, useState } from 'react';
import type { AnyGameModule, GameStateShape, GameUiBundle } from '@/core/module';
import type { Seat } from '@/core/types';
import { randomSeed } from '@/core/rng';
import { useGameStore } from '@/store/gameStore';
import { useNetworkStore } from '@/store/networkStore';
import { getOrCreateUuid } from '@/net/identity';
import type { LobbyState } from '@/net/types';

const COLORS = ['#ff7070', '#6aa0ff', '#7fd47f', '#ffb84d', '#c98aff', '#67d4d4', '#ff90c8', '#e0e0e0'];

interface Props {
  module: AnyGameModule;
  onBack(): void;
  onStart(): void;
}

export function GameLobby({ module, onBack, onStart }: Props) {
  const localUuid = useMemo(() => getOrCreateUuid(), []);
  const role = useNetworkStore((s) => s.role);
  const status = useNetworkStore((s) => s.status);
  const errorMessage = useNetworkStore((s) => s.errorMessage);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const remoteLobby = useNetworkStore((s) => s.lobby);
  const peers = useNetworkStore((s) => s.peers);
  const broadcastLobby = useNetworkStore((s) => s.broadcastLobby);
  const broadcastStart = useNetworkStore((s) => s.broadcastStart);
  const sendChat = useNetworkStore((s) => s.sendChat);
  const chat = useNetworkStore((s) => s.chat);

  const isOnlineHost = role === 'host';
  const isOnlineGuest = role === 'guest' || role === 'spectator';
  const isOnline = isOnlineHost || isOnlineGuest;

  // Local-only seat list for the hot-seat path (and host's initial state before
  // anyone joins). Once online, the host's seats live on networkStore.lobby.
  // Seat 0 defaults to the human local player; seats added beyond default to AI.
  const [hotSeats, setHotSeats] = useState<Seat[]>(() => [
    { id: localUuid, name: 'You', color: COLORS[0], isAI: false, isLocal: true },
    { id: 'seat-1', name: 'Player 2', color: COLORS[1], isAI: true, isLocal: true },
  ]);

  // The "live" seat list: guests read the host's broadcast lobby; everyone else
  // (solo + host) edits their own hotSeats and (if hosting) broadcasts on change.
  const seats: Seat[] = isOnlineGuest && remoteLobby ? remoteLobby.seats : hotSeats;

  const [config, setConfig] = useState<unknown>(() => module.defaultConfig(seats));
  const [bundle, setBundle] = useState<GameUiBundle<GameStateShape, unknown, unknown> | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [localName, setLocalName] = useState('You');
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    let cancelled = false;
    module.ui().then((b) => {
      if (!cancelled) setBundle(b as GameUiBundle<GameStateShape, unknown, unknown>);
    });
    return () => { cancelled = true; };
  }, [module]);

  // When acting as host with the lobby up, every seat-list change rebroadcasts.
  useEffect(() => {
    if (!isOnlineHost) return;
    const lobby: LobbyState = {
      gameId: module.id,
      seats: hotSeats,
      configJson: JSON.stringify(config),
      hostUuid: localUuid,
    };
    broadcastLobby(lobby);
  }, [isOnlineHost, hotSeats, config, module.id, localUuid, broadcastLobby]);

  function addSeat() {
    if (seats.length >= module.maxPlayers) return;
    // Newly added seats beyond the local-player slot default to AI for a
    // friction-free solo start; users can toggle them back to humans for
    // hot-seat play.
    const newSeat: Seat = {
      id: `seat-${seats.length}-${Math.floor(performance.now())}`,
      name: `Player ${seats.length + 1}`,
      color: COLORS[seats.length % COLORS.length],
      isAI: true,
      isLocal: !isOnline,
    };
    setHotSeats([...seats, newSeat]);
  }

  function removeSeat(id: string) {
    if (seats.length <= module.minPlayers) return;
    setHotSeats(seats.filter((s) => s.id !== id));
  }

  function updateSeat(id: string, patch: Partial<Seat>) {
    setHotSeats(seats.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function startLocal() {
    const errors = module.validateConfig(config);
    if (errors.length) { alert(errors.join('\n')); return; }
    const seed = randomSeed();
    const initial = module.createInitialState(config, seed, seats);
    useGameStore.getState().loadGame(module, initial, localUuid, { config, seats });
    onStart();
  }

  async function hostOnline() {
    const initialSeat = hotSeats[0] ?? {
      id: localUuid, name: localName, color: COLORS[0], isAI: false, isLocal: true,
    };
    initialSeat.name = localName || initialSeat.name;
    initialSeat.id = localUuid;
    try {
      await useNetworkStore.getState().hostRoom(module.id, initialSeat);
      // Sync our local seats list to start with the same host seat.
      setHotSeats([{ ...initialSeat, id: localUuid, isLocal: true }]);
    } catch (e) {
      alert('Could not start room: ' + (e as Error).message);
    }
  }

  async function joinOnline() {
    if (!joinCode.trim()) return;
    try {
      await useNetworkStore.getState().joinRoom(joinCode.trim().toUpperCase(), localName || 'Guest');
    } catch (e) {
      alert('Could not join room: ' + (e as Error).message);
    }
  }

  function startOnline() {
    if (!isOnlineHost) return;
    const errors = module.validateConfig(config);
    if (errors.length) { alert(errors.join('\n')); return; }
    const seed = randomSeed();
    const initial = module.createInitialState(config, seed, hotSeats);
    const seatUuids = hotSeats.map((s) => s.id);
    useGameStore.getState().loadGame(module, initial, localUuid, { config, seats: hotSeats });
    broadcastStart(initial, seatUuids);
    onStart();
  }

  // Guests jump to the playing screen once the host starts the game; the start
  // handler in networkStore already loaded gameStore for them.
  const guestGameLoaded = useGameStore((s) => s.state !== null && s.module !== null);
  useEffect(() => {
    if (isOnlineGuest && guestGameLoaded) onStart();
  }, [isOnlineGuest, guestGameLoaded, onStart]);

  const LobbyConfigComponent = bundle?.LobbyConfig;
  const RulesComponent = bundle?.Rules;
  const canStartOnline = isOnlineHost && hotSeats.length >= module.minPlayers;
  const canStartLocal = !isOnline && hotSeats.length >= module.minPlayers;

  return (
    <div className="lobby-single">
      <div className="lobby-topbar">
        <button className="secondary" onClick={onBack}>← Back</button>
        {RulesComponent && (
          <button className="secondary" onClick={() => setShowRules(true)}>📖 Rules</button>
        )}
      </div>

      <section className="lobby-panel">
        <h3>{module.name}</h3>

        {/* ----- seats ----- */}
        <h4 className="lobby-section-h">Seats</h4>
        {isOnlineHost && (
          <p className="lobby-hint">
            Assign each seat to a connected peer (or leave it as AI / unassigned).
          </p>
        )}
        <div className="seat-list">
          {seats.map((s) => {
            const isHostEditable = !isOnline || (isOnlineHost);
            const assignedToConnectedPeer = isOnline && peers[s.id] !== undefined;
            return (
              <div key={s.id} className="seat-row">
                <span className="swatch" style={{ background: s.color }} />
                <input
                  value={s.name}
                  onChange={(e) => updateSeat(s.id, { name: e.target.value })}
                  style={{ flex: 1 }}
                  disabled={!isHostEditable}
                />
                {isOnlineHost && (
                  <select
                    value={assignedToConnectedPeer ? s.id : ''}
                    onChange={(e) => {
                      const newId = e.target.value || `seat-${s.id}-open-${Math.floor(performance.now())}`;
                      const name = e.target.value ? (peers[e.target.value] ?? s.name) : s.name;
                      setHotSeats(seats.map((x) => x.id === s.id ? { ...x, id: newId, name, isAI: false, isLocal: newId === localUuid } : x));
                    }}
                    style={{ width: 140 }}
                    title="Assign seat to peer"
                  >
                    <option value="">— open —</option>
                    {Object.entries(peers).map(([uuid, name]) => {
                      const taken = seats.some((other) => other.id === uuid && other.id !== s.id);
                      return (
                        <option key={uuid} value={uuid} disabled={taken}>
                          {name}{uuid === localUuid ? ' (you)' : ''}{taken ? ' — taken' : ''}
                        </option>
                      );
                    })}
                  </select>
                )}
                <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={s.isAI}
                    onChange={(e) => updateSeat(s.id, { isAI: e.target.checked })}
                    disabled={!isHostEditable}
                  />
                  AI
                </label>
                <button
                  className="secondary"
                  onClick={() => removeSeat(s.id)}
                  disabled={!isHostEditable || seats.length <= module.minPlayers}
                >×</button>
              </div>
            );
          })}
        </div>
        {(!isOnline || isOnlineHost) && (
          <button
            className="secondary"
            onClick={addSeat}
            disabled={seats.length >= module.maxPlayers}
            style={{ marginTop: 8 }}
          >
            + Add seat
          </button>
        )}

        {/* ----- game-specific options ----- */}
        {LobbyConfigComponent && !isOnlineGuest && (
          <>
            <h4 className="lobby-section-h">Options</h4>
            <LobbyConfigComponent config={config} seats={seats} onChange={setConfig} />
          </>
        )}
        {isOnlineGuest && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-hover)', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-muted)' }}>
              Waiting for host to configure and start the match.
            </p>
          </div>
        )}

        {/* ----- launch buttons ----- */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isOnline && (
            <>
              <button onClick={startLocal} disabled={!canStartLocal}>Start (hot-seat)</button>
              <button className="secondary" onClick={hostOnline} disabled={status === 'connecting'}>
                {status === 'connecting' ? 'Connecting…' : 'Host online'}
              </button>
            </>
          )}
          {isOnlineHost && (
            <>
              <button onClick={startOnline} disabled={!canStartOnline}>
                Start match
              </button>
              <button className="secondary" onClick={() => { useNetworkStore.getState().leave(); }}>
                End room
              </button>
            </>
          )}
          {isOnlineGuest && (
            <button className="secondary" onClick={() => { useNetworkStore.getState().leave(); onBack(); }}>
              Leave room
            </button>
          )}
        </div>

        {/* ----- join box (only visible when not yet in a room) ----- */}
        {!isOnline && (
          <div className="online-join">
            <h4>Join a room</h4>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                placeholder="Your name"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                style={{ width: 130 }}
              />
              <input
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                style={{ width: 130, letterSpacing: 2, textAlign: 'center' }}
                maxLength={8}
              />
              <button className="secondary" onClick={joinOnline} disabled={status === 'connecting' || !joinCode.trim()}>
                Join
              </button>
            </div>
            {errorMessage && <div className="online-error">{errorMessage}</div>}
          </div>
        )}

        {/* ----- room info while online ----- */}
        {isOnline && roomCode && (
          <div className="online-info">
            <div>
              <span className="online-label">Room code</span>
              <code className="room-code">{roomCode}</code>
              <button
                className="secondary tiny"
                onClick={() => { void navigator.clipboard?.writeText(roomCode); }}
                title="Copy code"
              >
                Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              Connected as <strong>{role}</strong>. Peers: {Object.keys(peers).length}.
            </div>
            <div className="online-peers">
              <h4>People in room</h4>
              <ul>
                {Object.entries(peers).map(([uuid, name]) => (
                  <li key={uuid}>
                    <span className={`peer-dot ${seats.some((s) => s.id === uuid) ? 'seated' : 'spectator'}`} />
                    {name} {uuid === localUuid && <em>(you)</em>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lobby-chat">
              <h4>Lobby chat</h4>
              <div className="lobby-chat-log">
                {chat.slice(-6).map((m) => (
                  <div key={`${m.byUuid}-${m.ts}`}>
                    <strong>{peers[m.byUuid] ?? 'Player'}:</strong> {m.text}
                  </div>
                ))}
              </div>
              <ChatInput onSend={sendChat} />
            </div>
          </div>
        )}
      </section>

      {showRules && RulesComponent && (
        <div className="rules-modal-backdrop" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-modal-header">
              <h3>{module.name} — Rules</h3>
              <button className="secondary" onClick={() => setShowRules(false)}>Close</button>
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

function ChatInput({ onSend }: { onSend: (s: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onSend(v); setV(''); } }}
      style={{ display: 'flex', gap: 6, marginTop: 4 }}
    >
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Chat…" maxLength={200} style={{ flex: 1 }} />
      <button type="submit" disabled={!v.trim()}>Send</button>
    </form>
  );
}
