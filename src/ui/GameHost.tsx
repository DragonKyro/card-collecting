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
import { offlineSeats, useNetworkStore } from '@/store/networkStore';
import type { GameUiBundle, GameStateShape } from '@/core/module';
import type { Seat } from '@/core/types';
import { randomSeed } from '@/core/rng';
import { ChatPanel } from './ChatPanel';
import { RulesModal } from './lobbyParts';

interface Props {
  onExit(): void;
  /** "Play again" for modules with `replayInLobby`: back to that game's lobby
   *  with the finished match's config + seats pre-filled. (Local play only;
   *  online, the room's lobby keeps the options.) */
  onReturnToLobby(gameId: string, initial: { config: unknown; seats: Seat[] }): void;
}

/** How long this device's link may be down before the "Reconnecting…" banner shows. */
const RECONNECT_BANNER_MS = 2000;

export function GameHost({ onExit, onReturnToLobby }: Props) {
  const module = useGameStore((s) => s.module);
  const state = useGameStore((s) => s.state);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const aiReady = useGameStore((s) => s.aiReady);
  const dispatch = useGameStore((s) => s.dispatch);
  const role = useNetworkStore((s) => s.role);
  const roomCode = useNetworkStore((s) => s.roomCode);
  const onlineUuids = useNetworkStore((s) => s.onlineUuids);
  const serverConnected = useNetworkStore((s) => s.serverConnected);
  const notice = useNetworkStore((s) => s.notice);
  const aiDriver = useNetworkStore((s) => s.aiDriver);
  const [bundle, setBundle] = useState<GameUiBundle<GameStateShape, unknown, unknown> | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkDownLong, setLinkDownLong] = useState(false);
  const tickingRef = useRef(false);
  // Hot-seat "pass the device" gate. When the active human seat changes,
  // we cover the board until the new player explicitly hits Ready, so the
  // previous player doesn't see their hand. Tracks the last seat we cleared.
  const [passShownFor, setPassShownFor] = useState<string | null>(null);
  const lastClearedSeat = useRef<string | null>(null);
  const online = role !== 'solo';

  useEffect(() => {
    let cancelled = false;
    if (!module) return;
    module.ui().then((b) => {
      if (!cancelled) setBundle(b as GameUiBundle<GameStateShape, unknown, unknown>);
    });
    return () => { cancelled = true; };
  }, [module]);

  useEffect(() => {
    if (serverConnected) { setLinkDownLong(false); return; }
    const t = setTimeout(() => setLinkDownLong(true), RECONNECT_BANNER_MS);
    return () => clearTimeout(t);
  }, [serverConnected]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useNetworkStore.getState().dismissNotice(), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // AI driver: if the active player is an AI seat, run its chooseAIAction.
  // Online, one device drives the AI (networkStore.aiDriver: the host while
  // it's connected, else a seated stand-in) — otherwise every device would
  // dispatch the same AI action. A device that takes the AI on mid-match
  // waits for the module's `prepare` (aiReady) first.
  //
  // Tick delay is tuned to the audience:
  //   - All-AI matches (no humans): 80ms — basically as fast as React can
  //     render. The user is watching a demo, not following individual moves.
  //   - At least one human seat present: 380ms — slow enough to follow the
  //     AI's move + animation, fast enough not to feel laggy.
  useEffect(() => {
    if (!module || !state || !module.chooseAIAction || !aiReady) return;
    if (role !== 'solo' && !aiDriver) return;
    if (tickingRef.current) return;
    const active = state.activePlayerId;
    const seat = active ? state.seats.find((s) => s.id === active) : null;
    const isAITurn = seat?.isAI === true && state.phase === 'playing';
    if (!isAITurn) return;

    const anyHuman = state.seats.some((s) => !s.isAI);
    const delay = anyHuman ? (module.aiDelayMs?.(state) ?? 380) : 80;

    tickingRef.current = true;
    const timer = setTimeout(() => {
      tickingRef.current = false;
      const cur = useGameStore.getState();
      if (!cur.module || !cur.state || !cur.module.chooseAIAction) return;
      const a = cur.module.chooseAIAction(cur.state, active!);
      if (a) {
        try {
          cur.dispatch(a, { ai: true });
        } catch (e) {
          console.error('AI dispatch failed', e);
        }
      }
    }, delay);
    return () => { clearTimeout(timer); tickingRef.current = false; };
  }, [module, state, role, aiReady, aiDriver]);

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
  // accidental click can't change the local copy.
  const effectiveDispatch = role === 'spectator' ? () => {} : dispatch;

  // In hot-seat (solo), every human seat shares the same device. The store's
  // `localPlayerId` is fixed at lobby time (= the device UUID assigned to
  // seat 0), so a naive "is the active player == localPlayerId" check would
  // lock seats 1+ out forever. Instead, treat WHICHEVER seat is currently
  // active as "the local player" — provided it's a non-AI seat. AI seats are
  // driven by the AI driver above and never need a human input gate.
  const activeSeat = state.activePlayerId
    ? state.seats.find((s) => s.id === state.activePlayerId)
    : null;
  const hotSeatLocal = role === 'solo' && activeSeat && !activeSeat.isAI
    ? activeSeat.id
    : null;
  // While an AI (or nobody) is to act, the device is still in the hands of
  // the last human who took it ("I'm ready"), so the view stays theirs rather
  // than falling back to seat 0 — whose hand they mustn't see.
  const humanSeatCount = state.seats.filter((s) => !s.isAI).length;
  const deviceHolder = role === 'solo' && humanSeatCount >= 2 ? lastClearedSeat.current : null;
  const effectiveLocalPlayerId = hotSeatLocal ?? deviceHolder ?? localPlayerId;

  // Hot-seat pass screen: show whenever the active human seat differs from
  // the last seat the player explicitly acknowledged via "Ready". We only
  // gate when there are 2+ human seats (otherwise there's no one to pass to
  // — single-human-vs-AI matches don't need a hand-off), and only for games
  // with something to hide.
  const needsPassGate =
    role === 'solo'
    && module.hiddenInfo !== false
    && state.phase === 'playing'
    && humanSeatCount >= 2
    && hotSeatLocal !== null
    && lastClearedSeat.current !== hotSeatLocal;
  useEffect(() => {
    if (needsPassGate && passShownFor !== hotSeatLocal) {
      setPassShownFor(hotSeatLocal);
    }
    if (!needsPassGate && passShownFor !== null) {
      setPassShownFor(null);
    }
  }, [needsPassGate, hotSeatLocal, passShownFor]);
  const passSeat = passShownFor
    ? state.seats.find((s) => s.id === passShownFor)
    : null;

  const RulesComponent = bundle?.Rules;
  const isGameOver = state.phase === 'gameOver';
  // Online, only the host starts the next match; everyone else follows it
  // (the room's lobby says which match is on). Solo, anyone can.
  const canPlayAgain = isGameOver && (role === 'solo' || role === 'host');
  const away = online ? offlineSeats(state.seats, onlineUuids) : [];

  async function playAgain() {
    if (!canPlayAgain || busy) return;
    const cur = useGameStore.getState();
    if (!cur.module) return;
    if (role === 'host') {
      const net = useNetworkStore.getState();
      // A replayInLobby game re-deals from the lobby so options can change first.
      if (cur.module.replayInLobby) {
        net.hostReturnToLobby();
        return;
      }
      setBusy(true);
      const err = await net.hostPlayAgain();
      setBusy(false);
      if (err) alert(err);
      return;
    }
    if (!cur.matchConfig) {
      alert('Cannot replay — original match config not available.');
      return;
    }
    const cfg = cur.matchConfig as { config: unknown; seats: Seat[] };
    if (cur.module.replayInLobby) {
      useGameStore.getState().clear();
      onReturnToLobby(cur.module.id, cfg);
      return;
    }
    try {
      await cur.module.prepare?.(cfg.config, cfg.seats);
    } catch (e) {
      alert('Could not load the AI: ' + (e as Error).message);
      return;
    }
    const seed = randomSeed();
    const initial = cur.module.createInitialState(cfg.config, seed, cfg.seats);
    cur.loadGame(cur.module, initial, cur.localPlayerId, cfg);
  }

  function leave() {
    if (online) {
      useNetworkStore.getState().leaveRoom();
      return;
    }
    useGameStore.getState().clear();
    onExit();
  }

  return (
    <div>
      <div className="game-host-bar">
        <strong className="game-host-title">{module.name}</strong>
        <div className="game-host-actions">
          {online && roomCode && (
            <span className="net-pill" title={role === 'spectator' ? 'Watching: you have no seat in this match' : undefined}>
              <span className={`net-dot net-dot-${role}`} />
              <span className="net-pill-role">{role === 'spectator' ? 'watching' : role} · room</span> <code>{roomCode}</code>
            </span>
          )}
          {aiDriver && role !== 'host' && !isGameOver && (
            <span className="net-pill" title="The host is away: this device plays the AI seats until they're back">
              running the AI
            </span>
          )}
          {away.length > 0 && !isGameOver && (
            <span className="net-pill net-pill-warn" title="Their moves wait until they reconnect">
              {away.map((s) => s.name).join(', ')} offline
            </span>
          )}
          {canPlayAgain && (
            <button onClick={playAgain} disabled={busy}>🔁 Play again</button>
          )}
          {isGameOver && role === 'host' && !module.replayInLobby && (
            <button className="secondary" onClick={() => useNetworkStore.getState().hostReturnToLobby()}>Lobby</button>
          )}
          {isGameOver && (role === 'guest' || role === 'spectator') && (
            <span className="net-pill">Waiting for the host…</span>
          )}
          {RulesComponent && (
            <button className="secondary" onClick={() => setRulesOpen(true)}>📖 Rules</button>
          )}
          <button className="secondary" onClick={leave}>
            Leave<span className="game-host-wide"> {online ? 'room' : 'game'}</span>
          </button>
        </div>
      </div>
      {online && linkDownLong && (
        <div className="net-banner">Reconnecting to the game server… your moves will go through once it's back.</div>
      )}
      {notice && (
        <div className="net-banner net-banner-notice" role="status" onClick={() => useNetworkStore.getState().dismissNotice()}>
          {notice}
        </div>
      )}
      {GameView ? (
        <GameView state={state} localPlayerId={effectiveLocalPlayerId} dispatch={effectiveDispatch} />
      ) : (
        <p>Loading…</p>
      )}
      {online && <ChatPanel />}
      {rulesOpen && RulesComponent && (
        <RulesModal title={module.name} Rules={RulesComponent} onClose={() => setRulesOpen(false)} />
      )}
      {passSeat && (
        <div className="hotseat-pass-backdrop">
          <div className="hotseat-pass-card">
            <div className="hotseat-pass-eyebrow">Pass the device</div>
            <div className="hotseat-pass-name" style={{ color: passSeat.color }}>
              {passSeat.name}
            </div>
            <div className="hotseat-pass-sub">It's your turn — make sure others can't see.</div>
            <button
              className="hotseat-pass-ready"
              onClick={() => {
                lastClearedSeat.current = passSeat.id;
                setPassShownFor(null);
              }}
            >
              I'm ready →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
