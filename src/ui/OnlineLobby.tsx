// The lobby of an online room. Everything shown comes from the room
// (networkStore.lobby); edits are lobby transactions. Guests seat themselves
// on joining (while there's room) and edit their own seat's name and color;
// the host picks the game and its options, adds / removes AI seats, removes
// seats, and starts the match. Guests see the options read-only.

import { useEffect, useMemo, useState } from 'react';
import type { GameStateShape, GameUiBundle } from '@/core/module';
import { GAMES, getGameById } from '@/games/registry';
import { lobbyStartProblem, useNetworkStore } from '@/store/networkStore';
import { roomLink } from '@/net/roomLink';
import { AiLevelSelect, ChatInput, ColorSwatchPicker, NameInput, RulesModal } from './lobbyParts';

const ONLINE_GAMES = GAMES.filter((g) => g.onlineSupported !== false);

export function OnlineLobby() {
  const lobby = useNetworkStore((s) => s.lobby);
  const role = useNetworkStore((s) => s.role);
  const myUuid = useNetworkStore((s) => s.myUuid);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const people = useNetworkStore((s) => s.people);
  const onlineUuids = useNetworkStore((s) => s.onlineUuids);
  const chat = useNetworkStore((s) => s.chat);
  const net = useNetworkStore.getState;

  const module = lobby ? getGameById(lobby.gameId) : undefined;
  const [bundle, setBundle] = useState<GameUiBundle<GameStateShape, unknown, unknown> | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    module?.ui().then((b) => {
      if (!cancelled) setBundle(b as GameUiBundle<GameStateShape, unknown, unknown>);
    });
    return () => { cancelled = true; };
  }, [module]);

  const configJson = lobby?.configJson ?? 'null';
  const config = useMemo<unknown>(() => {
    try { return JSON.parse(configJson); } catch { return null; }
  }, [configJson]);

  useEffect(() => { setStartError(null); }, [configJson, lobby?.seats.length, lobby?.gameId]);

  if (!lobby) return <p>Loading the room…</p>;
  if (!module) {
    return (
      <div className="lobby-single">
        <section className="lobby-panel">
          <p>This room is set to a game this version of the app doesn't have ({lobby.gameId}). Reload the page.</p>
          <button className="secondary" onClick={() => net().leaveRoom()}>Leave room</button>
        </section>
      </div>
    );
  }

  const isHost = role === 'host';
  const seats = lobby.seats;
  const mySeat = seats.find((s) => s.id === myUuid) ?? null;
  const hostSeat = seats.find((s) => s.id === lobby.hostUuid);
  const hostOnline = onlineUuids.has(lobby.hostUuid);
  const problem = lobbyStartProblem(lobby);
  const roomFull = seats.length >= module.maxPlayers;
  const LobbyConfigComponent = bundle?.LobbyConfig;
  const RulesComponent = bundle?.Rules;

  async function start() {
    setStarting(true);
    setStartError(null);
    const err = await net().hostStartMatch();
    setStarting(false);
    if (err) setStartError(err);
  }

  function copy(what: 'code' | 'link') {
    if (!roomCode) return;
    void navigator.clipboard?.writeText(what === 'code' ? roomCode : roomLink(roomCode));
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="lobby-single">
      <div className="lobby-topbar">
        <button className="secondary" onClick={() => net().leaveRoom()}>← Leave room</button>
        {RulesComponent && (
          <button className="secondary" onClick={() => setShowRules(true)}>📖 Rules</button>
        )}
      </div>

      <section className="lobby-panel">
        <div className="online-lobby-head">
          {isHost ? (
            <select
              className="online-game-select"
              aria-label="Game"
              value={lobby.gameId}
              onChange={(e) => net().hostSetGame(e.target.value)}
            >
              {ONLINE_GAMES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          ) : (
            <h3>{module.name}</h3>
          )}
          {roomCode && (
            <div className="online-room">
              <span className="online-label">Room</span>
              <code className="room-code">{roomCode}</code>
              <button className="secondary tiny" onClick={() => copy('code')}>{copied === 'code' ? 'Copied' : 'Copy code'}</button>
              <button className="secondary tiny" onClick={() => copy('link')}>{copied === 'link' ? 'Copied' : 'Copy invite link'}</button>
            </div>
          )}
        </div>

        {/* ----- seats ----- */}
        <h4 className="lobby-section-h">Seats · {seats.length} of {module.minPlayers === module.maxPlayers ? module.maxPlayers : `${module.minPlayers}–${module.maxPlayers}`}</h4>
        <div className="seat-list">
          {seats.map((s) => {
            const mine = s.id === myUuid;
            const editable = mine || (isHost && s.isAI);
            const offline = !s.isAI && !onlineUuids.has(s.id);
            return (
              <div key={s.id} className="seat-row">
                <ColorSwatchPicker
                  value={s.color}
                  takenBy={Object.fromEntries(seats.filter((x) => x.id !== s.id).map((x) => [x.color, x.name]))}
                  disabled={!editable}
                  onChange={(color) => net().editSeat(s.id, { color })}
                />
                {editable ? (
                  <NameInput className="seat-name" value={s.name} onCommit={(name) => net().editSeat(s.id, { name })} />
                ) : (
                  <span className="seat-name online-seat-name">{s.name}</span>
                )}
                <span className="online-seat-tags">
                  {mine && <span className="online-tag">you</span>}
                  {s.id === lobby.hostUuid && <span className="online-tag">host</span>}
                  {s.isAI && <span className="online-tag">AI</span>}
                  <AiLevelSelect
                    module={module}
                    seat={s}
                    disabled={!isHost}
                    onChange={(aiLevel) => net().editSeat(s.id, { aiLevel })}
                  />
                  {offline && <span className="online-tag offline">offline</span>}
                </span>
                {isHost && s.id !== lobby.hostUuid && (
                  <button className="secondary" title="Remove seat" onClick={() => net().hostRemoveSeat(s.id)}>×</button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isHost && (
            <button className="secondary" onClick={() => net().hostAddAISeat()} disabled={roomFull}>+ Add AI</button>
          )}
          {!mySeat && (
            <button className="secondary" onClick={() => net().takeSeat()} disabled={roomFull}>
              {roomFull ? 'Table full — watching' : 'Take a seat'}
            </button>
          )}
        </div>

        {/* ----- game-specific options ----- */}
        {LobbyConfigComponent && (
          <>
            <h4 className="lobby-section-h">Options{isHost ? '' : ' (set by the host)'}</h4>
            <fieldset className="online-options" disabled={!isHost}>
              <LobbyConfigComponent
                key={lobby.gameId}
                config={config}
                seats={seats}
                readOnly={!isHost}
                onChange={(c) => { if (isHost) net().hostSetConfig(c); }}
              />
            </fieldset>
          </>
        )}

        {/* ----- start ----- */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {isHost ? (
            <button onClick={start} disabled={!!problem || starting}>
              {starting ? 'Starting…' : 'Start match'}
            </button>
          ) : (
            <span className="lobby-hint" style={{ margin: 0 }}>
              {hostOnline
                ? `Waiting for ${hostSeat?.name ?? 'the host'} to start the match.`
                : `${hostSeat?.name ?? 'The host'} is offline; the match starts when they're back.`}
            </span>
          )}
        </div>
        {isHost && (startError ?? problem) && <div className="online-error">{startError ?? problem}</div>}

        {/* ----- people + chat ----- */}
        <div className="online-peers">
          <h4>In the room</h4>
          <ul>
            {people.map((p) => {
              const seated = seats.some((s) => s.id === p.uuid);
              return (
                <li key={p.uuid}>
                  <span className={`peer-dot ${seated ? 'seated' : 'spectator'}`} />
                  {seats.find((s) => s.id === p.uuid)?.name ?? p.name}
                  {p.uuid === myUuid && <em>(you)</em>}
                  {!seated && <span className="online-tag">watching</span>}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="lobby-chat">
          <h4>Chat</h4>
          <div className="lobby-chat-log">
            {chat.slice(-8).map((m) => (
              <div key={m.id} className={m.kind === 'system' ? 'chat-system' : undefined}>
                {m.kind === 'system' ? m.text : <><strong>{m.name}:</strong> {m.text}</>}
              </div>
            ))}
          </div>
          <ChatInput onSend={(t) => net().sendChat(t)} />
        </div>
      </section>

      {showRules && RulesComponent && (
        <RulesModal title={module.name} Rules={RulesComponent} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}
