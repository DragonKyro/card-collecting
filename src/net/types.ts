// Wire envelopes for the Trystero/torrent transport. All payloads are
// JSON-serializable; the engine never holds a function in its state.

import type { Seat } from '@/core/types';

export interface HelloMessage {
  uuid: string;
  name: string;
}

export interface LobbyState {
  gameId: string;            // which GameModule
  seats: Seat[];             // current seat list (host-authoritative)
  configJson: string;        // serialized config (game-specific)
  hostUuid: string;
}

export interface StartMessage {
  initialStateJson: string;  // serialized opening GameState
  seatUuids: string[];       // uuid for each seat index
}

export interface ActionEnvelope {
  byUuid: string;
  actionJson: string;        // serialized game-specific action
}

export interface SnapshotMessage {
  stateJson: string;
  seatUuids: string[];
}

export interface ChatMessage {
  byUuid: string;
  text: string;
  ts: number;
}

export type Role = 'solo' | 'host' | 'guest' | 'spectator';
