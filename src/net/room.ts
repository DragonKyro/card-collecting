// Thin wrapper around Trystero's torrent strategy. The store is the only
// consumer — keep API surface tight so we can swap signaling strategies later.
//
// Implementation note: Trystero is dynamically imported to keep it out of the
// initial bundle for solo / hot-seat players who never go online.

import type {
  HelloMessage,
  LobbyState,
  StartMessage,
  ActionEnvelope,
  SnapshotMessage,
  ChatMessage,
} from './types';

export interface RoomHandle {
  roomCode: string;
  leave(): void;

  // Channels — sender side
  sendHello(msg: HelloMessage): void;
  sendLobby(state: LobbyState): void;
  sendStart(msg: StartMessage): void;
  sendAction(msg: ActionEnvelope): void;
  sendSnapshot(msg: SnapshotMessage, toPeerId?: string): void;
  sendChat(msg: ChatMessage): void;

  // Channels — receiver side
  onHello(cb: (msg: HelloMessage, peerId: string) => void): void;
  onLobby(cb: (msg: LobbyState) => void): void;
  onStart(cb: (msg: StartMessage) => void): void;
  onAction(cb: (msg: ActionEnvelope) => void): void;
  onSnapshot(cb: (msg: SnapshotMessage) => void): void;
  onChat(cb: (msg: ChatMessage) => void): void;

  onPeerJoin(cb: (peerId: string) => void): void;
  onPeerLeave(cb: (peerId: string) => void): void;
}

export async function joinRoom(_roomCode: string): Promise<RoomHandle> {
  // TODO: wire up to trystero/torrent. Stubbed so the rest of the app builds.
  throw new Error('joinRoom not yet implemented — see src/net/room.ts');
}
