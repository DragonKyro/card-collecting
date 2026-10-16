// Top-level shell. Three screens — game picker, lobby, in-game — selected by
// a local route state. The shell is game-agnostic; everything game-specific
// loads via GameModule.ui().

import { useState } from 'react';
import { GAMES, getGameById } from '@/games/registry';
import { GameLobby } from './GameLobby';
import { GameHost } from './GameHost';
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

  return (
    <div className="app-shell">
      <header>
        <strong onClick={() => setScreen({ kind: 'pick' })} style={{ cursor: 'pointer' }}>
          🃏 Card Collecting
        </strong>
      </header>
      <main>
        {screen.kind === 'pick' && (
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
        )}
        {screen.kind === 'lobby' && (() => {
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
        {screen.kind === 'playing' && (
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
