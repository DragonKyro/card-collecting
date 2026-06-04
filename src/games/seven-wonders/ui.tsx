// Stub UI — to be filled out in the game-specific implementation phase.

import type { GameUiBundle } from '@/core/module';
import type { SwState, SwAction, SwConfig } from './types';

function LobbyConfig({ config }: { config: SwConfig; seats: unknown; onChange: (c: SwConfig) => void }) {
  return (
    <div className="game-config">
      <p>Expansions: {config.expansions.length ? config.expansions.join(', ') : '(none — base game)'}</p>
      <p>Wonders: {config.wonderAssignment}</p>
      <p className="todo">Expansion toggles + wonder picker — TBD</p>
    </div>
  );
}

function GameView({ state }: { state: SwState; localPlayerId: string | null; dispatch: (a: SwAction) => void }) {
  return (
    <div className="game-view">
      <h2>7 Wonders</h2>
      <p>Age {state.age} · Round {state.ageRound} — {state.subPhase}</p>
      <p className="todo">Tableau / hand / wonder UI — TBD</p>
    </div>
  );
}

export const bundle: GameUiBundle<SwState, SwAction, SwConfig> = {
  LobbyConfig,
  GameView,
};
