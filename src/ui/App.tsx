// Top-level shell. Three screens — game picker, lobby, in-game — selected by
// a local route state. The shell is game-agnostic; everything game-specific
// loads via GameModule.ui().

import { useState } from 'react';
import { GAMES, getGameById } from '@/games/registry';
import { GameLobby } from './GameLobby';
import { GameHost } from './GameHost';

type Screen =
  | { kind: 'pick' }
  | { kind: 'lobby'; gameId: string }
  | { kind: 'playing' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'pick' });

  return (
    <div className="app-shell">
      <header>
        <strong onClick={() => setScreen({ kind: 'pick' })} style={{ cursor: 'pointer' }}>
          🃏 Card Collecting
        </strong>
        <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
          Hot-seat & WebRTC multiplayer
        </span>
      </header>
      <main>
        {screen.kind === 'pick' && (
          <div className="game-list">
            {GAMES.map((g) => (
              <div key={g.id} className="game-card" onClick={() => setScreen({ kind: 'lobby', gameId: g.id })}>
                <h3>{g.name}</h3>
                <p>{g.tagline}</p>
                <div className="player-range">{g.minPlayers}–{g.maxPlayers} players</div>
              </div>
            ))}
          </div>
        )}
        {screen.kind === 'lobby' && (() => {
          const module = getGameById(screen.gameId);
          if (!module) return <p>Unknown game.</p>;
          return (
            <GameLobby
              module={module}
              onBack={() => setScreen({ kind: 'pick' })}
              onStart={() => setScreen({ kind: 'playing' })}
            />
          );
        })()}
        {screen.kind === 'playing' && <GameHost onExit={() => setScreen({ kind: 'pick' })} />}
      </main>
    </div>
  );
}
