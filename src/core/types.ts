// Cross-game shared types. Anything specific to a particular card-collecting game
// lives in its own module under src/games/<id>/.

export type PlayerId = string;

export type Seat = {
  id: PlayerId;          // stable identity (uuid)
  name: string;
  color: string;         // hex
  isAI: boolean;
  isLocal: boolean;      // a seat on this device's hot-seat table (online seats are never local)
  /** AI seats: one of the module's `aiLevels` ids (absent = the module's default level). */
  aiLevel?: string;
};

export type GamePhase = 'lobby' | 'playing' | 'gameOver';
