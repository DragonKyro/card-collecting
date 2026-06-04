// Connection state, role, lobby, chat. Registers with gameStore via
// registerBroadcastHandler so the two stores stay decoupled (no circular import).

import { create } from 'zustand';
import type { Role, ChatMessage, LobbyState } from '@/net/types';
import type { RoomHandle } from '@/net/room';

interface NetworkStore {
  role: Role;
  roomCode: string | null;
  room: RoomHandle | null;
  lobby: LobbyState | null;
  chat: ChatMessage[];
  /** uuid → display name (built up from hello messages). */
  peers: Record<string, string>;

  setRole(role: Role): void;
  setRoom(room: RoomHandle | null, code: string | null): void;
  setLobby(lobby: LobbyState | null): void;
  appendChat(msg: ChatMessage): void;
  upsertPeer(uuid: string, name: string): void;
  reset(): void;
}

export const useNetworkStore = create<NetworkStore>((set) => ({
  role: 'solo',
  roomCode: null,
  room: null,
  lobby: null,
  chat: [],
  peers: {},

  setRole: (role) => set({ role }),
  setRoom: (room, roomCode) => set({ room, roomCode }),
  setLobby: (lobby) => set({ lobby }),
  appendChat: (msg) => set((s) => ({ chat: [...s.chat, msg] })),
  upsertPeer: (uuid, name) => set((s) => ({ peers: { ...s.peers, [uuid]: name } })),
  reset: () => set({ role: 'solo', roomCode: null, room: null, lobby: null, chat: [], peers: {} }),
}));
