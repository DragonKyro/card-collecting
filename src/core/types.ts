// Cross-game shared types. Anything specific to a particular card-collecting game
// lives in its own module under src/games/<id>/.

export type PlayerId = string;

export type Seat = {
  id: PlayerId;          // stable identity (uuid)
  name: string;
  color: string;         // hex
  isAI: boolean;
  isLocal: boolean;      // device-bound human seat (for hot-seat reveal gating)
};

export type GamePhase = 'lobby' | 'playing' | 'gameOver';
