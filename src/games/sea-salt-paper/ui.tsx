// Stub UI — to be filled out in the game-specific implementation phase.

import type { GameUiBundle } from '@/core/module';
import type { SspState, SspAction, SspConfig } from './types';

function LobbyConfig({ config }: { config: SspConfig; seats: unknown; onChange: (c: SspConfig) => void }) {
  return (
    <div className="game-config">
      <p>Target score: {config.targetScore}</p>
      <p className="todo">Config UI — TBD</p>
    </div>
  );
}

function GameView({ state }: { state: SspState; localPlayerId: string | null; dispatch: (a: SspAction) => void }) {
  return (
    <div className="game-view">
      <h2>Sea Salt & Paper</h2>
      <p>Round {state.round} — {state.subPhase}</p>
      <p className="todo">Hand / play area / scoring UI — TBD</p>
    </div>
  );
}

export const bundle: GameUiBundle<SspState, SspAction, SspConfig> = {
  LobbyConfig,
  GameView,
};
