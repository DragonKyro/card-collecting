// Top-level shell. Offline, three screens — game picker, lobby, in-game —
// selected by a local route state. While this device is in an online room the
// room decides instead: connecting / error card, the room's lobby, or its
// match. The shell is game-agnostic; everything game-specific loads via
// GameModule.ui(), and the game's GameModule.theme dresses the shell around
// it (accent, title font, page backdrop).

import { useEffect, useRef, useState } from 'react';
import { getGameById } from '@/games/registry';
import { useNetworkStore } from '@/store/networkStore';
import { useGameStore } from '@/store/gameStore';
import { GameLobby } from './GameLobby';
import { GameHost } from './GameHost';
import { OnlineLobby } from './OnlineLobby';
import { OnlineStatusCard, useRejoinFromUrl } from './OnlineStatus';
import { GamePicker } from './Home';
import { BrandMark } from './Brand';
import { themeVars } from './gameTheme';
import type { Seat } from '@/core/types';

type Screen =
  | { kind: 'pick' }
  /** `initial` pre-fills the lobby when a finished match returns to it. */
  | { kind: 'lobby'; gameId: string; initial?: { config: unknown; seats: Seat[] } }
  | { kind: 'playing' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'pick' });
  // Bumped on every return from a match so the lobby remounts and re-seeds
  // its state from the new `initial`.
  const [lobbyVisit, setLobbyVisit] = useState(0);
  const connection = useNetworkStore((s) => s.connection);
  const roomGameId = useNetworkStore((s) => s.lobby?.gameId ?? null);
  const playingId = useGameStore((s) => s.module?.id ?? null);
  const urlCode = useRejoinFromUrl();

  // Leaving a room lands on the game picker.
  const wasOnline = useRef(false);
  useEffect(() => {
    if (connection !== 'disconnected') wasOnline.current = true;
    else if (wasOnline.current) {
      wasOnline.current = false;
      setScreen({ kind: 'pick' });
    }
  }, [connection]);

  const online = connection !== 'disconnected';

  // The game the screen is about (its lobby or its match).
  const activeId = online
    ? (connection === 'in-game' ? playingId : connection === 'lobby' ? roomGameId : null)
    : screen.kind === 'lobby' ? screen.gameId : screen.kind === 'playing' ? playingId : null;
  const activeModule = activeId ? getGameById(activeId) : undefined;
  const backdrop = activeModule?.theme?.backdrop;

  return (
    <div className="app-shell" style={themeVars(activeModule)} data-game={activeModule?.id}>
      {backdrop && <div className="cc-backdrop" key={activeModule!.id} aria-hidden="true" />}
      <header className="app-bar cc-chrome">
        <button
          type="button"
          className="app-brand"
          disabled={online}
          title={online ? undefined : 'All games'}
          onClick={() => { if (!online) setScreen({ kind: 'pick' }); }}
        >
          <BrandMark />
          <span className="app-brand-name">Card Collecting</span>
        </button>
        {activeModule && (
          <span className="app-bar-game">
            <span className="dot" />
            {online ? 'Online room' : screen.kind === 'playing' ? 'In play' : 'Setting up'}
          </span>
        )}
      </header>
      {/* Keyed by route, so each screen fades in. */}
      <main key={online ? `room-${connection}` : screen.kind}>
        {online && (connection === 'connecting' || connection === 'error') && <OnlineStatusCard />}
        {online && connection === 'lobby' && <OnlineLobby />}
        {online && connection === 'in-game' && (
          <GameHost onExit={() => {}} onReturnToLobby={() => {}} />
        )}
        {!online && screen.kind === 'pick' && (
          <GamePicker urlCode={urlCode} onPick={(gameId) => setScreen({ kind: 'lobby', gameId })} />
        )}
        {!online && screen.kind === 'lobby' && (() => {
          const module = getGameById(screen.gameId);
          if (!module) return <p>Unknown game.</p>;
          return (
            <GameLobby
              key={lobbyVisit}
              module={module}
              initial={screen.initial}
              onBack={() => setScreen({ kind: 'pick' })}
              onStart={() => setScreen({ kind: 'playing' })}
            />
          );
        })()}
        {!online && screen.kind === 'playing' && (
          <GameHost
            onExit={() => setScreen({ kind: 'pick' })}
            onReturnToLobby={(gameId, initial) => {
              setLobbyVisit((n) => n + 1);
              setScreen({ kind: 'lobby', gameId, initial });
            }}
          />
        )}
      </main>
    </div>
  );
}
