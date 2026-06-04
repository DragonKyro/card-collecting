# card-collecting

A multi-game web app for **card-collecting games** where the objective is to maximize points in your own hand while minimizing points in your opponents'. Hosted on GitHub Pages, no backend, peer-to-peer multiplayer via WebRTC.

Shipping targets:
- **Sushi Go! Party** (incl. menu builder, not just the base set)
- **Sea Salt & Paper**
- **7 Wonders** (with expansion hooks: Leaders, Cities, Babel, Armada, Edifice)
- More to follow.

## Tech stack

| | |
|---|---|
| Build | Vite + TypeScript |
| UI | React 19 |
| State | Zustand |
| Multiplayer | Trystero (WebRTC over BitTorrent trackers — no backend) |
| Tests | Vitest |
| Hosting | GitHub Pages (static) |

## Project structure

```
src/
  core/         GameModule contract, RNG, shared types. Game-agnostic.
  net/          Trystero wrapper, stable identity, wire envelopes.
  store/        Zustand stores (gameStore, networkStore).
  ui/           Shell — App, GameLobby, GameHost, theme.
  games/
    registry.ts                 List of all GameModules.
    sushi-go/                   Sushi Go! Party module.
    sea-salt-paper/             Sea Salt & Paper module.
    seven-wonders/              7 Wonders module (+ expansion folders later).
```

Each game lives in its own folder behind the `GameModule<S, A, C>` contract from `src/core/module.ts`. To add a new game: create `src/games/<id>/`, export a module, add it to `src/games/registry.ts`. **No other file needs to change.**

## Multiplayer model

- Full state replication: every peer holds the full `GameState` and runs the same pure `applyAction` reducer.
- Actions (not diffs) are broadcast over Trystero channels. Randomness is decided by the acting player and folded into the action payload so peers reduce identically.
- Lobby is host-authoritative. Host broadcasts the opening state at start; mid-game joiners get a snapshot addressed to their peer id.
- Stable identity is a `localStorage` UUID exchanged over the `hello` channel. `?fresh` switches to `sessionStorage` for local two-window testing.
- Channels: `hello` (uuid + name), `lobby` (host → all), `start` (host → all), `action` (peer → all), `snap` (host → newcomer), `chat`. Trystero loads as a separate chunk so the solo/hot-seat bundle stays small.
- No accounts, no matchmaking, no anti-cheat — friends-only.

### Online flow

1. **Host online** mints a 6-character room code and joins a Trystero room (app id `card-collecting-v1`, password = room code). The host configures the menu/options and assigns each seat to a connected peer via a dropdown.
2. **Join** by entering the room code on the lobby screen. The host sees you appear in the peer list and can drop you into any open seat.
3. **Start** broadcasts the opening `GameState` + the `seat → uuid` map. Each peer's reducer runs identically off that state; subsequent actions are envelopes `{ byUuid, actionJson }` applied through the same `applyAction`.
4. **Mid-game join**: the host responds to a new arrival's `hello` with a targeted snapshot. If the joiner's uuid matches a seat they become a guest; otherwise they're a spectator.
5. **AI in online**: only the host runs the AI driver. If the host disconnects, AI seats freeze.

## Commands

```bash
npm run dev         # local dev server at /card-collecting/
npm run build       # tsc typecheck + vite build → dist/
npm run typecheck   # tsc no-emit
npm run test        # vitest watch
npm run test:run    # vitest single run
```

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`. Vite `base` is `/card-collecting/` to match the repo name — change it in `vite.config.ts` if you rename the repo.

## Project plan / roadmap

- [x] **Phase 0** — Scaffolding. Vite + React + TS, GameModule contract, Zustand stores, Trystero stub, GitHub Pages workflow, hot-seat lobby, stub modules for all three games.
- [x] **Phase 1** — Sea Salt & Paper (hot-seat reducer + UI + AI complete).
- [x] **Phase 2** — Sushi Go! Party engine (simultaneous-pick + hand-pass loop, menu builder, base party cards + specials).
- [x] **Phase 3** — Online multiplayer wired up for SSP + Sushi Go (Trystero `/torrent` room, lobby sync, action broadcast, snapshot on join, lobby + in-game chat, host-only AI driver, spectator fallback).
- [ ] **Phase 4** — 7 Wonders base game (3-age draft, military resolution, final scoring).
- [ ] **Phase 5** — AI heuristics per game (pure functions in each game's `ai.ts`, optional `chooseAIAction` on the module).
- [ ] **Phase 6** — Sea Salt & Paper expansions:
  - *Extra Salt* — 8 new cards / 5 new effects shuffled into the main deck (jellyfish + swimmer immobilize, lobster + crab top-5 peek, basket of crabs, starfish, seahorse wildcard). Drop-in under `src/games/sea-salt-paper/expansions/extra-salt/`; gated by a lobby config flag.
  - *Extra Pepper* — 12 event cards as a separate deck. Reveal one at round start (rules twist for the round); awarded at round end to the player with the most/fewest points depending on the event. Same expansion-folder pattern; event deck is its own state slice in `SspState`.
- [ ] **Phase 7** — 7 Wonders expansions (Leaders, Cities, Babel, Armada, Edifice — each as a sub-module under `src/games/seven-wonders/expansions/`).
- [ ] **Phase 8** — Additional games as desired.

Game-specific design notes live in each game's `types.ts` and in [CLAUDE.md](CLAUDE.md).
