# card-collecting

**▶ Play it live: <https://dragonkyro.github.io/card-collecting/>**

A multi-game web app for **card-collecting games** where the objective is to maximize points in your own hand while minimizing points in your opponents'. Hosted on GitHub Pages, no backend, peer-to-peer multiplayer via WebRTC.

Shipping targets:
- **Sushi Go! Party** (incl. menu builder, not just the base set)
- **Sea Salt & Paper**
- **7 Wonders** (with all 5 expansions: Leaders, Cities, Babel, Armada, Edifice)
- **7 Wonders Duel** (standalone 2-player variant — pyramid draft + three supremacy paths)
- **Air, Land & Sea**
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
    sushi-go/                   Sushi Go! Party.
    sea-salt-paper/             Sea Salt & Paper (+ Extra Salt + Extra Pepper).
    seven-wonders/              7 Wonders + 5 expansions (Leaders, Cities, Babel, Armada, Edifice).
    seven-wonders-duel/         7 Wonders Duel (standalone two-player).
    air-land-sea/               Air, Land & Sea (+ Spies, Lies, & Supplies scaffolding).
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
5. **AI in online**: only the host runs the AI driver. The driver fires whenever `state.activePlayerId` resolves to an AI seat — reducers park `activePlayerId` on the next un-acted AI seat during simultaneous-pick or "click-through" phases (e.g. Sushi Go selection, 7 Wonders military summary in all-AI matches) so the driver picks up without a human click. If the host disconnects, AI seats freeze.

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
- [x] **Phase 4** — 7 Wonders base game (3-age draft, simultaneous pick, hand rotation CW/CCW by age, payment to neighbors with discounts, military resolution between ages, final scoring across 7 categories).
- [x] **Phase 5** — AI heuristics per game (`chooseAIAction` on every module). Each AI scores legal moves with context-aware values — Sushi Go tracks unseen cards by kind so the marginal value of wasabi / sashimi / eel updates as picks reveal information; Sea Salt & Paper builds per-family unseen pools to value drawing from the discard pile vs. a face-down draw; 7 Wonders weighs cards on resources gained, military shields when behind a neighbor, and science set completion; 7 Wonders Duel ranks each available pyramid card across build/bury/discard outcomes against opponent production; Air, Land & Sea scores every legal deploy/improvise by control-margin swing + per-ability value. The host runs the AI driver and dispatches actions on a small delay so moves remain visible.
- [x] **Phase 6** — Sea Salt & Paper expansions, togglable per match in the lobby:
  - *Extra Salt* — 8 new cards / 5 new effects shuffled into the main deck (jellyfish + swimmer next-turn lock, lobster + crab top-5 peek, basket of crabs multiplier, starfish trio, seahorse collector wildcard).
  - *Extra Pepper* — separate event deck. One event flipped at round start applies to all (or the current holder); awarded at round end to the leader (`+`) or laggard (`−`). Six event cards implemented (Three Mermaids, Stop at Five, Angelfish, Stormy Seas, Calm Waters, Pepper Burn) — the framework supports the remaining six pending authoritative text.
- [ ] **Phase 7** — 7 Wonders expansions (each as a sub-module under `src/games/seven-wonders/expansions/`).
  - [x] *Leaders* — pick-and-pass draft of 4 leaders at match start, then one leader per Age (play / bury / discard / skip). All 36 leaders modeled across 7 hook tiers (pure on-play, end-game per-X, cost modifier, on-play trigger, activated ability, set-completion, on-recruit). Bilkis once-per-turn ability and Solomon "build from discard" sub-phase wired.
  - [x] *Cities* — 27 black cards (9 per age) shuffled into existing age decks. Debt tokens (−1 VP each) handed to neighbors via the `citiesDebtToNeighbors` effect. Diplomacy tokens auto-spent at age-end military (holder is skipped, neighbors compare across the gap). Tourist Office (+7 per 7-color set) and Gambling Hall (+1 VP per debt token across all players) scoring extras implemented. A few card abilities still placeholder no-ops pending authoritative rulebook text.
  - [x] *Babel* (partial) — 15 orange cards (5 per age) shuffled into existing age decks. Three Babel-themed scoring rules implemented (`vpPerScienceSet`, `vpPerNeighborCards`, `vpPerOwnColors`). Central Tower of Babel (shared law tiles) and Great Projects of Babylon (cooperative goals) NOT modeled in v1 — they require shared central state coordinated across all picks, pending authoritative rule text.
  - [x] *Armada* (partial) — 15 navy cards (5 per age) shuffled into existing age decks. Three Armada-themed scoring rules implemented (`vpPerNeighborMilitaryLosses`, `vpPerOwnAgeIIIBuilds`, `vpPerOwnNavalSet`). Personal shipyards (4 fleets × 3 levels), naval combat at age-end, island cards (separate deck via Naval action), and the pirate track are NOT modeled in v1.
  - [x] *Edifice* — 3 central project tiles (one per age) drawn from a pool of 8 at match setup. A player contributes to age N's project by building any wonder stage during that age. At endgame, projects whose threshold of contributors is met reward each contributor and penalize each non-contributor. Outcomes (VP, shields, science, coins, debt tokens) are surfaced as an "edifice" column in final scoring.
- [x] **Phase 8** — Air, Land & Sea (2-player; 3-theater battles; Deploy / Improvise (face-down) / Withdraw; instant + ongoing abilities; best-to-12 across rotating battles). Spies, Lies, & Supplies expansion scaffolded — its 3 new theaters (Intel/Diplo/Econ) and 18 cards are playable with raw strengths; per-card abilities are placeholder no-ops pending authoritative rulebook text. Epic Mode (5 theaters, 9-card hands) wired through the lobby toggle.
- [ ] **Phase 9** — Additional games as desired.
  - [x] *7 Wonders Duel* — standalone 2-player variant. Separate game module under `src/games/seven-wonders-duel/`; shares zero state with the base 7 Wonders module. Pyramid draft (face-up + face-down rows of cards, "available when uncovered"), 12 unique wonders (8 drafted per match, 4 each), 5 of 10 Progress Tokens (claimed by matching a 2nd science symbol), single-line two-sided military track. Three victory conditions: Civilian Victory (most VP at endgame), Military Supremacy (pawn at ±9), Science Supremacy (6 different science symbols). Effects modeled v1; the wonder-only "extra turn" and "pick from discard" mechanics are stubbed pending follow-up.

Game-specific design notes live in each game's `types.ts` and in [CLAUDE.md](CLAUDE.md).
