// Top-level shell. Offline, three screens — game picker, lobby, in-game —
// selected by a local route state. While this device is in an online room the
// room decides instead: connecting / error card, the room's lobby, or its
// match. The shell is game-agnostic; everything game-specific loads via
// GameModule.ui().

import { useEffect, useRef, useState } from 'react';
import { GAMES, getGameById } from '@/games/registry';
import { useNetworkStore } from '@/store/networkStore';
import { GameLobby } from './GameLobby';
import { GameHost } from './GameHost';
import { OnlineLobby } from './OnlineLobby';
import { JoinRoomBox, OnlineStatusCard, useRejoinFromUrl } from './OnlineStatus';
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

  return (
    <div className="app-shell">
      <header>
        <strong onClick={() => { if (!online) setScreen({ kind: 'pick' }); }} style={{ cursor: online ? 'default' : 'pointer' }}>
          🃏 Card Collecting
        </strong>
      </header>
      <main>
        {online && (connection === 'connecting' || connection === 'error') && <OnlineStatusCard />}
        {online && connection === 'lobby' && <OnlineLobby />}
        {online && connection === 'in-game' && (
          <GameHost onExit={() => {}} onReturnToLobby={() => {}} />
        )}
        {!online && screen.kind === 'pick' && (
          <>
            <JoinRoomBox initialCode={urlCode} />
            <div className="game-list">
              {GAMES.map((g) => {
                const Thumb = g.Thumbnail;
                return (
                  <div
                    key={g.id}
                    className="game-card"
                    onClick={() => setScreen({ kind: 'lobby', gameId: g.id })}
                    title={g.tagline}
                  >
                    {Thumb && (
                      <div className="game-card-art">
                        <Thumb />
                      </div>
                    )}
                    <div className="game-card-meta">
                      <h3>{g.name}</h3>
                      <span className="player-range">
                        {g.minPlayers === g.maxPlayers
                          ? `${g.minPlayers}p`
                          : `${g.minPlayers}–${g.maxPlayers}p`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
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
