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
Each turn: draw 2 (keep 1 or both), optional play-pair-for-ability, then STOP / LAST CHANCE / pass. "LAST CHANCE" triggers a peer-relative final round — proposer wins bonus only if their score still leads. Multi-round; first to `targetScore` ends the match. Base families: mermaid, shark/swimmer/crab/boat/fish (duos), shell/octopus/penguin/sailor (collectors), lighthouse/shoal/penguinColony/captain (multipliers).

**Expansions** (togglable per match via `config.expansions`):
- *Extra Salt* — adds jellyfish/lobster/starfish/seahorse/crabBasket to the deck (8 cards). New duo pairings (jellyfish+swimmer, lobster+crab) handled in `isValidDuoPair`/`duoPartner`. Starfish trios are a new action type `playTrio` and stored as `player.trios` so scoring can flatly award 3 pts and skip the duo ability. Lobster reveal lives in `subPhase: 'awaitingLobsterPick'` with `pendingLobsterPick` buffer. Jellyfish lock uses `state.nextTurnLockedPlayerId`; the locked player's turn-handlers throw on anything but drawPair → pass.
- *Extra Pepper* — separate event deck (`state.event`). One event revealed per round (`startNewRound`), applied via predicates in `events.ts` (`playerHasEvent`, `isRoundEvent`). At round end (`awardEventCard`), `+` events go to leader, `−` to laggard, `global` events are discarded. Six events implemented in `EVENT_BY_ID` — add more by extending that map + `ALL_EVENT_IDS`; the reducer wiring (threshold lookups, mermaid-count lookup, color-bonus doubling, score-modifier) is already in place.

### 7 Wonders (`src/games/seven-wonders/`)
3 Ages × 6 picks per Age. Simultaneous: each player submits a `pendingPick` (build / wonder-stage / discard); reducer reveals + applies in batch, rotates hands (CW Ages I/III, CCW Age II), resolves military at Age end. Final scoring across 7 categories at Age III end. Expansions (Leaders, Cities, Babel, Armada, Edifice) will live under `src/games/seven-wonders/expansions/` and contribute extra decks + post-action hooks. No `if (expansion === ...)` conditionals — add a module hook instead.

### Air, Land & Sea (`src/games/air-land-sea/`)
Strict 2-player; alternating single-action turns. Each turn: **Deploy** (face-up to the matching theater; Instant abilities fire on placement, Ongoing abilities persist while face-up), **Improvise** (face-down to any theater, strength 2, no ability), or **Withdraw** (battle ends; opponent scores VP per the withdrawing player's hand-size chart: 6→2, 4-5→3, 2-3→4, 0-1→6; full-play loss = 6). Battle ends when either player withdraws or both hands are empty. Winner controls more than half the theaters (2/3 or 3/5); ties go to the 1st player. Match ends at 12 VP. Between battles the theater row rotates one step (rightmost→front) and 1st player swaps.

State machine lives in `subPhase`: `awaitingAction` (the main loop), then per Instant ability one of `awaitingFlipTarget` / `awaitingTransportTarget` / `awaitingRedeployTarget` / `awaitingReinforcePlacement`, then `battleEnd` (Continue button) → `gameOver`. `state.pendingAbility` carries the in-flight Instant's source and the chooser seat, so Disrupt's two-flip dance (opponent flips → source flips) stays consistent. `activePlayerId` is repurposed during follow-ups to point at the chooser seat, so the existing `GameHost` AI driver ticks ability follow-ups one at a time.

Ongoing abilities are computed passively from face-up cards on the board — never stored as flags. `scoring.ts` walks the board for Cover Fire (covered card → 4), Escalation (owner's face-down → 4), Air Support (+3 to adjacent theaters on the same side), and Aerodrome (1-3 strength relax in `validateDeploy`). Containment (face-down plays are immediately discarded) and Blockade (a new card making opponent's adjacent stack ≥3 is discarded) are checked post-placement in `abilities.ts`. Per BGG FAQ, ongoing abilities still emit while COVERED — only being flipped face-down silences them.

Hidden info follows the project's "full state replication + UI gating" pattern — face-down cards are stored with `faceDown: true` in state; the UI hides text from non-owners (and from the inactive seat in hot-seat).

**Spies, Lies, & Supplies expansion** is wired in but partially modeled. The lobby toggles 3 new theaters (Intelligence / Diplomacy / Economics) and Epic Mode (5 theaters, 9-card hands). The 18 new cards exist in `deckPool` with proper strengths and theaters — they are dealt, played, and contribute their raw strength to scoring normally. Their tactical abilities are placeholder no-ops in `abilities.ts` (`intel1` … `econ6`), pending authoritative rulebook text. To fill in: replace the `case 'intel1':` etc. branches with real handlers; no other file needs to change. Supply Tokens are storage is already in `state.supplyTokens` (parallel to theaters, [seat0, seat1]) and contribute to `theaterStrength` — Economics cards just need to dispatch `placeSupplyToken` once their abilities are known. Also several base-game ability assignments (Sea 4/5 in particular) need confirmation; see `cards.ts` notes.

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

See [README.md](README.md#project-plan--roadmap). Current status: **Phases 0–4 + 6 (partial) + 7 (partial) + 8 (partial) complete.** SSP + Sushi Go + 7 Wonders (base + Leaders + Cities + Babel) + Air, Land & Sea (base with all abilities + SLS scaffolding) playable hot-seat and online. Trystero room, lobby sync, action broadcast, snapshot on join, lobby + in-game chat, host-only AI driver, spectator fallback all wired. SSP has both Extra Salt (full) and Extra Pepper (6/12 events) togglable in the lobby. 7 Wonders has the Leaders expansion (all 36 leaders, draft + per-age play + Bilkis activated ability + Solomon recruit-from-discard, all effect categories modeled), the Cities expansion (27 black cards + debt tokens + diplomacy mechanic + Tourist Office / Gambling Hall scoring extras), and a partial Babel expansion (15 orange cards + 3 Babel-themed scoring rules; central Tower of Babel and Great Projects boards NOT modeled in v1) implemented. Armada/Edifice toggles exist but are no-ops. ALS has the Spies, Lies, & Supplies expansion togglable (theater swap + Epic Mode wired) but its per-card abilities are no-ops until rulebook text is in hand.

### 7 Wonders implementation notes

- Cards: `src/games/seven-wonders/cards.ts` — templates for Ages I/II/III + Age III guilds. Per-player-count copy fidelity is approximate; the reducer's `dealAge` pads with duplicate ids when the deck is short of `playerCount × 7`.
- Wonders: `wonders.ts` — all 7 wonders × A/B sides. A few stage effects ("build from discard", "play your last card free", "copy a guild") are deliberately not modeled — they have empty effect lists and a "not modeled" label in the stage text.
- Resources: `resources.ts` — production set, neighbor purchase (`suggestCheapestPurchase`), trade discounts (raw/manufactured, per side), chain-builds. `effectiveCostFor` folds in active expansions' `modifyCost` hooks.
- Scoring: `scoring.ts` — 7 categories. Scientists Guild adds a wild science symbol via `bestScienceScore`. Olympia A's "build free per age" / Halicarnassus / Babylon B / Olympia B "copy guild" are NOT scored. `scoreMatch` calls active expansions' `scoreExtras(state, player)` to populate `row.extras` (e.g., `{ leaders: 12 }`).
- Reducer: `reducer.ts` — simultaneous picks via `pendingPick`; reveal tick when all submit. Cards purchased from neighbors transfer coins via seat-order pass through `applyPick`. Active player is repurposed during `picking` to point at the next un-submitted AI seat so the existing `GameHost` AI driver ticks them one at a time. Unknown action types are routed through `getActiveExpansions(config)` so each expansion owns its own subphases + actions.

### 7 Wonders expansion architecture

- Contract: `src/games/seven-wonders/expansions/types.ts` — `SwExpansion` interface with hooks for `setupMatch`, `beforeAgeStart`, `applyAction`, `nextAIPicker`, `chooseAIAction`, `modifyCost`, `onEvent`, `scoreExtras`, `LobbySection`, `GameOverlay`, `ownsSubPhase`. Events emitted by the base reducer: `cardBuilt`, `wonderStageBuilt`, `neighborPurchase`, `militaryTokenGained`, `tickStart`.
- Registry: `expansions/registry.ts` — `getActiveExpansions(config)` filters by `config.expansions`. **No `if (expansion === ...)` switches anywhere in the base.**
- New `SwCardEffect` kinds for expansion-owned effects (`leaderCostModifier`, `leaderTrigger`, `leaderScoreExtra`, `leaderActivated`, `leaderOnRecruit`) live on the base union but are only read by the relevant expansion's hooks.

### 7 Wonders Leaders expansion notes

- All 36 leaders modeled in `expansions/leaders/cards.ts`, classified by hook tier (pure on-play, end-game endVp, cost modifier, on-play trigger, activated ability, set-completion scoring, on-recruit). Tomyris (defeat-token redirect) is in the deck but flagged not-modeled.
- Subphases owned by the expansion: `'leaderDraft'` (pick-and-pass 4→1), `'leaderPlay'` (per-age leader play), `'solomonAwaitPick'` (Solomon's build-from-discard).
- New actions: `submitLeaderDraft`, `submitLeaderPlay`, `useBilkis`, `solomonPick`. The base reducer routes them through the expansion's `applyAction` via the unknown-action fallback.
- Bilkis is modeled as a transient resource buffer (`player.transientResources`) that's consumed at the end of each pick tick. Once-per-turn enforced by `bilkisUsedThisTick`. UI button rendered inline in HandPanel.
- Hatshepsut's once-per-turn refund tracked via `hatshepsutPaidThisTick` (declared inline by the triggers module — not in the base types). Cleared on `tickStart` events.
- Effects that need new behavior (Aristotle, Plato, Justinian, Midas, Alexander) use a `leaderScoreExtra` effect; the Leaders expansion's `scoreExtras` evaluates them.
- Leader cards have `color: 'leader'` so the base color-counting scoring (civilian/commercial/guild) doesn't double-count their VP — leader VPs land in `row.extras.leaders`. Science symbols from leader cards (Euclid/Ptolemy/Pythagoras) DO count toward base science scoring because `scienceVps` was extended to walk `leaderTableau`.

### 7 Wonders Cities expansion notes

- 27 black cards (9 per age) modeled in `expansions/cities/cards.ts` using player-count `appearances` like the base deck. Cards are added to each age via the `ageDeckCards` hook on `SwExpansion`; the base `dealAge` concatenates expansion contributions before shuffle. Card ids start at 20000 (distinct from base cards at 1+ and leaders at 10000+).
- New `SwPlayer` fields: `debtTokens` and `diplomacyTokens` (both optional; only populated when Cities is active). `setupMatch` zero-inits both.
- **Debt tokens**: accrued via the `citiesDebtToNeighbors` effect kind, applied in the `onEvent` hook on `cardBuilt`. Each debt token = −1 VP at endgame (`scoreExtrasCities`). Cards with this effect (Gambling Den, Mercenaries, Torture Chamber) hand `amount` debt tokens to BOTH seat neighbors on play.
- **Diplomacy tokens**: granted via the `citiesGainDiplomacy` effect. Modeled in `resolveMilitary` in the BASE reducer: at age-end, any player with ≥1 diplomacy token auto-spends one and is skipped from the military comparison (draws both sides, gains 0 tokens). Their neighbors then compare against each OTHER across the gap. This is the simpler v1 reading of the rulebook's "Diplomacy makes you count as having no neighbors this age" rule.
- **Scoring**: black cards' pure `vp` effects are NOT counted by the base `civilianVps`/`commercialVps`/`guildVps` (those scope to specific colors). Instead they land in `scoreExtras` as the `cities` column. Two `citiesScoreExtra` rules are implemented: `completeAllColorsSet` (Tourist Office: +7 per set of {brown,gray,blue,yellow,red,green,purple}) and `vpPerDebtTotal` (Gambling Hall: +1 VP per debt token held by ANY player).
- **Card text fidelity**: cost / shields / production / VP effects are modeled faithfully on every Cities card. A few cards (Pigeon Loft, Spy Ring's secondary, Black Market, Slave Market) have placeholder no-op effects with descriptions marked "Not fully modeled in v1" pending authoritative rulebook text — matching the SLS pattern in ALS. These cards still take a hand slot and (where applicable) contribute their VP/shields; only their unique ability is the no-op.
- Cities does NOT own any subphases. It's a pure deck-contribution + onEvent observer + scoreExtras provider. Diplomacy is implemented as a base-reducer modification to `resolveMilitary`; this is the one piece of Cities-aware code in the base, but it's keyed off the optional `diplomacyTokens` field rather than a config switch (when no expansion populates it, it stays undefined and is a no-op).
- 3-player Cities "ghost city" variant is NOT modeled. The current implementation works at 3–7 players using Cities cards' normal `minPlayers/maxPlayers` ranges.

### 7 Wonders Babel expansion notes

- **Modeled (v1 partial):** 15 orange cards (5 per age) under `expansions/babel/cards.ts`, dealt via the same `ageDeckCards` hook Cities uses. Card ids start at 30000 (distinct from base/leaders/cities). Per-card effects use the existing kinds (vp, shields, produce, science, coins) plus one Babel-specific effect kind `babelScoreExtra` with three rules:
  - `vpPerScienceSet` — Tower of Babel: +V per complete {compass,gear,tablet} set, counting symbols from base tableau AND leaderTableau (mirrors base `scienceVps`).
  - `vpPerNeighborCards` — Court of Babylon: +V per matching-color card across BOTH seat neighbors.
  - `vpPerOwnColors` — Ziggurat of Etemenanki: +V per card whose color is in a listed set.
- **NOT modeled (deferred):** the central Tower of Babel board (shared law tiles placed by all players to mutate rules round-by-round) and the Great Projects of Babylon (cooperative central goals with milestone rewards). Both require shared central state coordinated across all picks; the seam can be added later by giving the Babel expansion an `applyAction` hook + a custom subPhase (similar to Leaders' `leaderDraft`), but the rule text was not in hand at implementation time. Marked in lobby copy ("Central Tower of Babel / Great Projects boards NOT modeled in v1") and in the two `modeled: false` cards (Tower Workers, Great Project Worksite) whose effects are placeholder.
- Orange-card pure VP lands in `row.extras.babel` (not in any base color bucket), via `scoreExtrasBabel`. Babel does NOT own any subphases, emits no events, and contributes nothing besides the deck + scoring.

## Where to start next

1. **7 Wonders expansions (remaining)** — Armada, Edifice. Each under `src/games/seven-wonders/expansions/` using the existing `SwExpansion` contract from `expansions/types.ts`; no `if (expansion === ...)` switches. Lobby UI already toggles them (no-op today).
2. **7 Wonders polish** — model the deferred wonder stage effects (Olympia A "free per age", Halicarnassus "build from discard" — likely sharable with Solomon's `solomonAwaitPick` flow, Babylon A "play last card", Olympia B "copy guild", Babylon B "choose science"). Also: Tomyris (defeat-token redirect) needs a hook into `resolveMilitary`.
3. **Finish Pepper** — add the remaining 6 event cards to `events.ts` once authoritative rule text is in hand. Each new event needs an id in `SspEventId`, an entry in `EVENT_BY_ID`/`ALL_EVENT_IDS`, and (if it has a per-player rule effect) a hook into the reducer.
4. **AI heuristics** — improve each game's `ai.ts` beyond "first legal move". The 7W AI is intentionally simple — should weigh military/science/civilian more dynamically against the round.
5. **ALS card text from rulebook** — confirm Sea 4 / Sea 5 ability assignments against the authoritative rulebook (Investigation, Salvage in `cards.ts` are best-guess assignments) and fill in the 18 SLS abilities. The dispatch in `abilities.ts` (`intel1` … `econ6`) is already wired; each branch just needs its real effect (or a follow-up sub-phase + pending-ability shape if it needs a target).
