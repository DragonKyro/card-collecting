// Owns the room lifecycle, role, lobby state, peer roster and chat. Wires the
// room's channels into gameStore via registerBroadcastHandler + applyLocal so
// the two stores stay decoupled (no circular import).
//
// Roles:
//   solo       — no room. Hot-seat or pre-lobby.
//   host       — minted the room, owns lobby state, broadcasts start.
//   guest      — joined a room and matches a seat in the host's lobby.
//   spectator  — joined a room but doesn't match any seat (read-only).

import { create } from 'zustand';
import type { Role, ChatMessage, LobbyState, ActionEnvelope, SnapshotMessage, StartMessage } from '@/net/types';
import type { RoomHandle } from '@/net/room';
import { joinRoom, generateRoomCode } from '@/net/room';
import { getOrCreateUuid } from '@/net/identity';
import { useGameStore } from './gameStore';
import { getGameById } from '@/games/registry';
import type { Seat } from '@/core/types';
import type { GameStateShape } from '@/core/module';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface NetworkStore {
  role: Role;
  status: ConnectionStatus;
  errorMessage: string | null;
  roomCode: string | null;
  room: RoomHandle | null;
  lobby: LobbyState | null;
  chat: ChatMessage[];
  /** uuid → display name (built up from hello messages). */
  peers: Record<string, string>;
  /** Trystero peerId → uuid mapping (set on inbound hello). */
  peerIdToUuid: Record<string, string>;
  /** Local user's display name (sent on hello). Mirrors the host's chosen seat name. */
  localName: string;

  setRole(role: Role): void;
  setLocalName(name: string): void;
  setLobby(lobby: LobbyState | null): void;
  appendChat(msg: ChatMessage): void;
  upsertPeer(uuid: string, name: string): void;
  reset(): void;

  /** Mint a room code, join it, become host. UI then drives the lobby. */
  hostRoom(gameId: string, initialSeat: Seat): Promise<string>;
  /** Join an existing room as guest/spectator. Lobby arrives on the lobby channel. */
  joinRoom(roomCode: string, localName: string): Promise<void>;
  /** Host: broadcast updated lobby state. */
  broadcastLobby(lobby: LobbyState): void;
  /** Host: broadcast game start with opening state + seat→uuid map. */
  broadcastStart(initial: GameStateShape, seatUuids: string[]): void;
  /** Send chat. */
  sendChat(text: string): void;
  /** Leave the room cleanly. */
  leave(): void;
}

const localUuid = (): string => getOrCreateUuid();

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  role: 'solo',
  status: 'idle',
  errorMessage: null,
  roomCode: null,
  room: null,
  lobby: null,
  chat: [],
  peers: {},
  peerIdToUuid: {},
  localName: '',

  setRole: (role) => set({ role }),
  setLocalName: (name) => set({ localName: name }),
  setLobby: (lobby) => set({ lobby }),
  appendChat: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
  upsertPeer: (uuid, name) => set((s) => ({ peers: { ...s.peers, [uuid]: name } })),

  reset: () => {
    const room = get().room;
    if (room) {
      try { room.leave(); } catch { /* room may already be torn down */ }
    }
    useGameStore.getState().registerBroadcastHandler(null);
    set({
      role: 'solo', status: 'idle', errorMessage: null,
      roomCode: null, room: null, lobby: null, chat: [],
      peers: {}, peerIdToUuid: {}, localName: '',
    });
  },

  hostRoom: async (gameId, initialSeat) => {
    set({ status: 'connecting', errorMessage: null });
    const code = generateRoomCode();
    try {
      const room = await joinRoom(code);
      const uuid = localUuid();
      const name = initialSeat.name || 'Host';
      wireRoom(room, set, get);
      const lobby: LobbyState = {
        gameId,
        seats: [{ ...initialSeat, id: uuid, isLocal: true }],
        configJson: '',
        hostUuid: uuid,
      };
      set({
        role: 'host', status: 'connected', roomCode: code, room,
        lobby, localName: name,
        peers: { [uuid]: name },
      });
      // Announce ourselves so anyone already in the room learns our uuid+name.
      room.sendHello({ uuid, name });
      return code;
    } catch (e) {
      set({ status: 'error', errorMessage: (e as Error).message });
      throw e;
    }
  },

  joinRoom: async (roomCode, name) => {
    set({ status: 'connecting', errorMessage: null });
    try {
      const room = await joinRoom(roomCode);
      const uuid = localUuid();
      wireRoom(room, set, get);
      set({
        role: 'guest', status: 'connected', roomCode, room,
        localName: name, peers: { [uuid]: name },
      });
      room.sendHello({ uuid, name });
    } catch (e) {
      set({ status: 'error', errorMessage: (e as Error).message });
      throw e;
    }
  },

  broadcastLobby: (lobby) => {
    const { room } = get();
    set({ lobby });
    room?.sendLobby(lobby);
  },

  broadcastStart: (initial, seatUuids) => {
    const { room } = get();
    if (!room) return;
    const msg: StartMessage = {
      initialStateJson: JSON.stringify(initial),
      seatUuids,
    };
    room.sendStart(msg);
  },

  sendChat: (text) => {
    const { room, localName, appendChat } = get();
    if (!room || !text.trim()) return;
    const uuid = localUuid();
    const msg: ChatMessage = { byUuid: uuid, text: text.trim(), ts: nowMs() };
    appendChat(msg);
    room.sendChat(msg);
    // Also surface sender's name in the peer map so chat renders correctly.
    if (!get().peers[uuid]) set((s) => ({ peers: { ...s.peers, [uuid]: localName } }));
  },

  leave: () => {
    get().reset();
  },
}));

// Counter avoids Date.now() colliding when chat messages are bursted in the same ms.
let chatTickCounter = 0;
function nowMs(): number {
  chatTickCounter = (chatTickCounter + 1) & 0xffff;
  return Date.now() * 0x10000 + chatTickCounter;
}

type Setter = (partial: Partial<NetworkStore> | ((s: NetworkStore) => Partial<NetworkStore>)) => void;
type Getter = () => NetworkStore;

/** Bind a fresh RoomHandle's receivers + register the broadcast bridge. */
function wireRoom(room: RoomHandle, set: Setter, get: Getter) {
  // ----- inbound channels -----

  room.onHello((msg, peerId) => {
    set((s) => ({
      peers: { ...s.peers, [msg.uuid]: msg.name },
      peerIdToUuid: { ...s.peerIdToUuid, [peerId]: msg.uuid },
    }));
    // Host responds to new arrivals: send our lobby + (if game in flight) a snapshot.
    const { role, lobby, room: r } = get();
    if (role === 'host' && r) {
      if (lobby) r.sendLobby(lobby);
      const gs = useGameStore.getState();
      if (gs.module && gs.state && lobby) {
        const seatUuids = lobby.seats.map((seat) => seat.id);
        const snap: SnapshotMessage = {
          stateJson: JSON.stringify(gs.state),
          seatUuids,
        };
        r.sendSnapshot(snap, peerId);
      }
    }
  });

  room.onLobby((lobby) => {
    // Guests/spectators trust whatever the host broadcasts.
    if (get().role === 'host') return;
    set({ lobby });
  });

  room.onStart((msg) => {
    // Everyone (host included will receive their own broadcast back from peers? no — Trystero sends only to others).
    // Hosts call loadGame locally separately. This handles guests + spectators.
    const { role, lobby } = get();
    if (role === 'host') return;
    if (!lobby) return;
    loadFromWire(lobby.gameId, msg.initialStateJson, msg.seatUuids, set, get);
  });

  room.onAction((env) => {
    // Receivers verify the byUuid owns a seat in the lobby. Cheating is not
    // defended-against (full state replication, friends-only honor), but a
    // mismatched envelope is almost certainly a bug.
    const { lobby } = get();
    if (lobby && !lobby.seats.some((s) => s.id === env.byUuid)) {
      console.warn('net: action from non-seated uuid ignored', env.byUuid);
      return;
    }
    try {
      const action = JSON.parse(env.actionJson);
      useGameStore.getState().applyLocal(action);
    } catch (e) {
      console.error('net: failed to apply remote action', e);
    }
  });

  room.onSnapshot((snap) => {
    const { lobby, role } = get();
    if (role === 'host') return;
    if (!lobby) return;
    loadFromWire(lobby.gameId, snap.stateJson, snap.seatUuids, set, get);
  });

  room.onChat((msg) => {
    set((s) => ({ chat: [...s.chat, msg] }));
  });

  room.onPeerJoin((peerId) => {
    // Send a hello so the newcomer learns our uuid+name.
    const uuid = localUuid();
    const name = get().localName || 'Player';
    room.sendHello({ uuid, name });
    // Host-side response (lobby + snapshot) happens once we receive *their* hello, since
    // we need their uuid to decide guest vs spectator and address the snapshot back to peerId.
    void peerId;
  });

  room.onPeerLeave((peerId) => {
    set((s) => {
      const uuid = s.peerIdToUuid[peerId];
      if (!uuid) return s;
      const peers = { ...s.peers };
      delete peers[uuid];
      const peerIdToUuid = { ...s.peerIdToUuid };
      delete peerIdToUuid[peerId];
      return { ...s, peers, peerIdToUuid };
    });
  });

  // ----- outbound bridge: gameStore.dispatch → action envelope -----
  useGameStore.getState().registerBroadcastHandler((actionJson) => {
    const uuid = localUuid();
    const envelope: ActionEnvelope = { byUuid: uuid, actionJson };
    room.sendAction(envelope);
  });
}

/** Used by guests/spectators when start or a fresh snapshot arrives. */
function loadFromWire(gameId: string, stateJson: string, seatUuids: string[], set: Setter, get: Getter) {
  const mod = getGameById(gameId);
  if (!mod) {
    console.error('net: unknown gameId from host', gameId);
    return;
  }
  let state: GameStateShape;
  try {
    state = JSON.parse(stateJson) as GameStateShape;
  } catch (e) {
    console.error('net: bad state json', e);
    return;
  }
  const myUuid = localUuid();
  const isSeated = seatUuids.includes(myUuid);
  set({ role: isSeated ? 'guest' : 'spectator' });
  useGameStore.getState().loadGame(mod, state, isSeated ? myUuid : null);
  void get; // satisfy noUnused
}

/** Surface a tiny presence helper for the UI shell. */
export function isOnline(role: Role): boolean {
  return role === 'host' || role === 'guest' || role === 'spectator';
}
