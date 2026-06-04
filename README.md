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
- Lobby is host-authoritative. Host broadcasts the opening state at start; mid-game joiners get a snapshot.
- Stable identity is a `localStorage` UUID exchanged over the `hello` channel. `?fresh` switches to `sessionStorage` for local two-window testing.
- No accounts, no matchmaking, no anti-cheat — friends-only.

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

- [x] **Phase 0** — Scaffolding (this commit). Vite + React + TS, GameModule contract, Zustand stores, Trystero stub, GitHub Pages workflow, hot-seat lobby, stub modules for all three games.
- [ ] **Phase 1** — Sea Salt & Paper (smallest engine — fewest cards, simplest scoring; good first integration test for the module contract).
- [ ] **Phase 2** — Sushi Go! Party engine (simultaneous-pick + hand-pass loop, menu builder, all party cards + specials).
- [ ] **Phase 3** — Online multiplayer wired up (Trystero room, lobby sync, action broadcast, snapshot on join, in-game chat).
- [ ] **Phase 4** — 7 Wonders base game (3-age draft, military resolution, final scoring).
- [ ] **Phase 5** — AI heuristics per game (pure functions in each game's `ai.ts`, optional `chooseAIAction` on the module).
- [ ] **Phase 6** — 7 Wonders expansions (Leaders, Cities, Babel, Armada, Edifice — each as a sub-module under `src/games/seven-wonders/expansions/`).
- [ ] **Phase 7** — Additional games as desired.

Game-specific design notes live in each game's `types.ts` and in [CLAUDE.md](CLAUDE.md).
