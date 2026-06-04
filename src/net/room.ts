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

const APP_ID = 'card-collecting-v1';

export interface RoomHandle {
  roomCode: string;
  /** Trystero's volatile per-tab peer id — useful for targeted snapshot sends. */
  selfPeerId: string;
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

export async function joinRoom(roomCode: string): Promise<RoomHandle> {
  // Trystero is loaded lazily so the picker / hot-seat bundle doesn't pay for it.
  const trystero = await import('trystero/torrent');
  const room = trystero.joinRoom({ appId: APP_ID, password: roomCode }, roomCode);
  const selfPeerId = (trystero as unknown as { selfId: string }).selfId ?? '';

  // Each makeAction call gives us a [send, receive, progress] triple. We only
  // register one receiver per channel — fan-out is handled by the caller.
  // Trystero's DataPayload requires an index signature; our envelopes don't
  // declare one, so we cast through `as any`. The schemas are still type-safe
  // at our API boundary.
  type Send<T> = (data: T, targetPeers?: string | string[] | null) => Promise<void[]>;
  type Recv<T> = (cb: (data: T, peerId: string) => void) => void;
  const makeChan = <T>(ns: string): [Send<T>, Recv<T>] => {
    const triple = room.makeAction(ns) as unknown as [Send<T>, Recv<T>, unknown];
    return [triple[0], triple[1]];
  };
  const [sendHello, recvHello] = makeChan<HelloMessage>('hello');
  const [sendLobby, recvLobby] = makeChan<LobbyState>('lobby');
  const [sendStart, recvStart] = makeChan<StartMessage>('start');
  const [sendAction, recvAction] = makeChan<ActionEnvelope>('action');
  const [sendSnap, recvSnap] = makeChan<SnapshotMessage>('snap');
  const [sendChat, recvChat] = makeChan<ChatMessage>('chat');

  return {
    roomCode,
    selfPeerId,
    leave: () => { void room.leave(); },

    sendHello: (m) => { void sendHello(m); },
    sendLobby: (m) => { void sendLobby(m); },
    sendStart: (m) => { void sendStart(m); },
    sendAction: (m) => { void sendAction(m); },
    sendSnapshot: (m, toPeerId) => { void sendSnap(m, toPeerId); },
    sendChat: (m) => { void sendChat(m); },

    onHello: (cb) => recvHello((data, peerId) => cb(data, peerId)),
    onLobby: (cb) => recvLobby((data) => cb(data)),
    onStart: (cb) => recvStart((data) => cb(data)),
    onAction: (cb) => recvAction((data) => cb(data)),
    onSnapshot: (cb) => recvSnap((data) => cb(data)),
    onChat: (cb) => recvChat((data) => cb(data)),

    onPeerJoin: (cb) => room.onPeerJoin(cb),
    onPeerLeave: (cb) => room.onPeerLeave(cb),
  };
}

/** Six-character room code, A-Z and 0-9 sans confusing glyphs. Pretty enough to read aloud. */
export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
