// Stub UI — to be filled out in the game-specific implementation phase.

import type { GameUiBundle } from '@/core/module';
import type { SushiGoState, SushiGoAction, SushiGoConfig } from './types';

function LobbyConfig({ config }: { config: SushiGoConfig; seats: unknown; onChange: (c: SushiGoConfig) => void }) {
  return (
    <div className="game-config">
      <p>Menu: {config.menu.join(', ')}</p>
      <p>Rounds: {config.rounds}</p>
      <p className="todo">Menu builder UI — TBD</p>
    </div>
  );
}

function GameView({ state }: { state: SushiGoState; localPlayerId: string | null; dispatch: (a: SushiGoAction) => void }) {
  return (
    <div className="game-view">
      <h2>Sushi Go! Party</h2>
      <p>Round {state.round} / {state.config.rounds} — {state.subPhase}</p>
      <p className="todo">Hand / table / scoring UI — TBD</p>
    </div>
  );
}

export const bundle: GameUiBundle<SushiGoState, SushiGoAction, SushiGoConfig> = {
  LobbyConfig,
  GameView,
};
