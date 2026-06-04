# CLAUDE.md

Context for Claude working in this repo.

## What this is

A personal multi-game card-collecting web app, hosted on GitHub Pages, played hot-seat or with friends over WebRTC. Targets Sushi Go! Party, Sea Salt & Paper, and 7 Wonders (with expansion hooks). No backend.

## Tech stack (locked)

TypeScript, Vite, React 19, Zustand for state, Trystero (`/torrent`) for WebRTC P2P, Vitest for tests. No backend — GitHub Pages is static-only.

## Architecture

Five layers, separated by directory:

- **`src/core/`** — `GameModule<S, A, C>` contract, seeded RNG (mulberry32 in `rng.ts`), shared types (`Seat`, `PlayerId`, `GamePhase`). Game-agnostic — never references a specific game.
- **`src/games/<id>/`** — one folder per game. Each folder owns its own types, reducer (`applyAction`), AI, and UI bundle. Registered in `src/games/registry.ts`.
- **`src/net/`** — Trystero wrapper (`room.ts`, stubbed), stable identity (`identity.ts` — localStorage UUID + `?fresh` escape hatch), wire envelopes (`types.ts`).
- **`src/store/`** — Zustand stores (`gameStore`, `networkStore`). `gameStore` holds the active module + state and exposes `dispatch` (broadcasts) and `applyLocal` (silent receiver path).
- **`src/ui/`** — Game-agnostic shell: `App.tsx` (route between picker / lobby / playing), `GameLobby.tsx` (seat builder + game's `LobbyConfig`), `GameHost.tsx` (mounts the active game's `GameView`).

## GameModule contract

The single rule that makes the multi-game design work:

```ts
GameModule<S, A, C> {
  id, name, tagline, minPlayers, maxPlayers
  defaultConfig(seats) → C
  validateConfig(config) → string[]
  createInitialState(config, seed) → S
  applyAction(state, action) → S          // pure, deterministic
  chooseAIAction?(state, playerId) → A | null
  ui() → Promise<{ LobbyConfig, GameView }>   // lazy-loaded
}
```

**Hard invariants every module must uphold:**
- `applyAction` is pure. No `Date.now`, no `Math.random`, no I/O. RNG draws from `state.rngState`.
- Randomness chosen by the acting player (deals, draws) is folded into the action payload so all peers reduce identically.
- `S` (game state) is JSON-serializable — sent over the wire, snapshotted on join.
- The full state is replicated; hidden-information rules (other players' hands) are a UI concern. Friends-only honor, no anti-cheat.

The shell, store, and net layer never name a specific game. Adding a new game means: drop a folder, register it, done.

## Multiplayer model

- **Trystero `/torrent`** for WebRTC signaling. No backend. App ID `card-collecting-v1`; room code is both the topic and the encryption password. Lazy-imported in `src/net/room.ts` so the solo bundle stays small.
- **Stable identity**: `localStorage` UUID (`card-collecting.uuid`), exchanged via `hello` channel. `?fresh` flips storage to `sessionStorage` for two-window local testing.
- **Full state replication**: every peer holds full `GameState`.
- **Actions, not diffs**: `{ byUuid, actionJson }` envelopes; receivers verify the UUID owns a seat in `lobby.seats` before applying via `gameStore.applyLocal`.
- **Determinism**: randomness lives in `state.rngState` (mulberry32 seeded at game start), plus per-action payload for player-chosen draws.
- **Host-authoritative lobby**: host owns lobby state, broadcasts on every edit. Seat assignment in the lobby is done by the host via a per-seat peer dropdown (changing `seat.id` from a placeholder to the chosen peer's uuid). Start broadcasts the initial `GameState` + `seatUuids[]`.
- **Rejoin / spectator**: when a peer says hello, the host responds with `sendLobby` (always) and `sendSnapshot(toPeerId)` (if a game is already in flight). Joiner's uuid matching a seat → guest; otherwise spectator (read-only — dispatch is no-op'd in `GameHost`).
- **AI in online**: only the host runs `chooseAIAction`. `GameHost.tsx`'s AI driver early-returns when role is `guest` or `spectator`. If host drops, AI seats freeze.
- **Chat**: in-memory in `networkStore.chat`, not part of `GameState`. `ChatPanel` floats bottom-right in-game; lobby chat is a compact log on the lobby's right column.
- **Channels**: `hello`, `lobby`, `start`, `action`, `snap`, `chat`. Each is a separate `makeAction` namespace.
- **Online wiring**: `networkStore.wireRoom` subscribes to all channels and calls `gameStore.registerBroadcastHandler` so `dispatch()` from any game UI emits an action envelope. The two stores stay decoupled — `gameStore` has no awareness of the network.

## Game-specific design notes (deferred implementation)

Each game's `types.ts` carries detailed notes on the eventual reducer. Short summary:

### Sushi Go! Party (`src/games/sushi-go/`)
Simultaneous pick + pass-hands. Engine waits at `subPhase: 'selecting'` until all live players submit `submitPick`, then batch-applies and rotates hands. Specials (chopsticks/spoon/special-order/menu/takeout-box) enter a `specialResolution` sub-phase for the playing player. Multi-round (default 3); dessert pile persists across rounds, table resets. Menu builder picks 8 card kinds in the lobby; turn structure is identical across menus.

### Sea Salt & Paper (`src/games/sea-salt-paper/`)
Each turn: draw 2 (keep 1 or both), optional play-pair-for-ability, then STOP / LAST CHANCE / pass. "LAST CHANCE" triggers a peer-relative final round — proposer wins bonus only if their score still leads. Multi-round; first to `targetScore` ends the match. Families: mermaid, collector, penguin, sailor, crab, boat, fish, shell, lighthouse, anchor, captain, shark, swimmer, siren.

### 7 Wonders (`src/games/seven-wonders/`)
3 Ages × 6 picks per Age. Simultaneous: each player submits a `pendingPick` (build / wonder-stage / discard); reducer reveals + applies in batch, rotates hands (CW Ages I/III, CCW Age II), resolves military at Age end. Final scoring across 7 categories at Age III end. Expansions (Leaders, Cities, Babel, Armada, Edifice) will live under `src/games/seven-wonders/expansions/` and contribute extra decks + post-action hooks. No `if (expansion === ...)` conditionals — add a module hook instead.

## Conventions

- Strict TypeScript. No `any` unless genuinely necessary.
- Co-locate tests next to code: `reducer.ts` and `reducer.test.ts` side by side.
- The game logic in `src/games/<id>/` must not import from `src/ui`, `src/net`, or `src/store`.
- The net layer may import from `src/core` but not `src/ui`.
- Path alias: `@/` → `src/`.
- Game-specific UI is lazy-loaded via `module.ui()` — keeps the picker bundle tiny.
- Don't introduce game-agnostic code into a game folder. Don't introduce game-specific code into the shell. If you're about to, you probably want a new field on `GameModule` or `GameStateShape` instead.

## Commands

- `npm run dev` — local dev server at `http://localhost:5173/card-collecting/`
- `npm run build` — production build (`tsc` typecheck then `vite build`)
- `npm run typecheck` — `tsc` no-emit
- `npm run test` — Vitest watch
- `npm run test:run` — Vitest single run

## Deployment

`.github/workflows/deploy.yml` deploys `dist/` to GitHub Pages on push to `main`. Vite `base` is `/card-collecting/` — update in `vite.config.ts` if the repo is renamed.

## Non-goals (do not implement)

- Persistent saves between sessions
- User accounts, matchmaking, lobby browser
- Anti-cheat / verifiable randomness
- Monetization, ads, telemetry
- Server-side anything

## Roadmap

See [README.md](README.md#project-plan--roadmap). Current status: **Phases 0–3 complete.** SSP + Sushi Go playable hot-seat and online; Trystero room, lobby sync, action broadcast, snapshot on join, lobby + in-game chat, host-only AI driver, spectator fallback all wired.

## Where to start next

1. **7 Wonders base game** — fill out `src/games/seven-wonders/` reducer (3 ages × 6 picks, simultaneous `pendingPick`, hand rotation CW/CCW by age, military resolution at age end, final scoring across 7 categories).
2. **Sea Salt & Paper expansions** — *Extra Salt* (8 cards shuffled into the deck) and *Extra Pepper* (12 round-event cards in a separate deck). Both drop into `src/games/sea-salt-paper/expansions/<id>/` and are gated by lobby config flags like 7W expansions; Extra Pepper needs an extra state slice for the event deck and per-round event card.
3. **AI heuristics** — improve each game's `ai.ts` beyond "first legal move". Pure functions; no network awareness needed.
4. **7 Wonders expansions** — Leaders, Cities, Babel, Armada, Edifice. Each under `src/games/seven-wonders/expansions/` with module-level hooks; no `if (expansion === ...)` switches.
