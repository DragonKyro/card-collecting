# CLAUDE.md

Context for Claude working in this repo.

## What this is

A personal multi-game card-collecting web app, hosted on GitHub Pages, played hot-seat or with friends over WebRTC. Ships with Sushi Go! Party, Sea Salt & Paper, 7 Wonders (base + 5 expansions), 7 Wonders Duel, Air, Land & Sea (base + SLS scaffolding), and Set (all 16 variants, solo / shared-screen). No backend.

## Tech stack (locked)

TypeScript, Vite, React 19, Zustand for state, Trystero (`/torrent`) for WebRTC P2P, Vitest for tests. No backend — GitHub Pages is static-only.

## Architecture

Five layers, separated by directory:

- **`src/core/`** — `GameModule<S, A, C>` contract, seeded RNG (mulberry32 in `rng.ts`), shared types (`Seat`, `PlayerId`, `GamePhase`). Game-agnostic — never references a specific game.
- **`src/games/<id>/`** — one folder per game. Each folder owns its own types, reducer (`applyAction`), AI, and UI bundle. Registered in `src/games/registry.ts`.
- **`src/net/`** — Trystero wrapper (`room.ts`, stubbed), stable identity (`identity.ts` — localStorage UUID + `?fresh` escape hatch), wire envelopes (`types.ts`).
- **`src/store/`** — Zustand stores (`gameStore`, `networkStore`). `gameStore` holds the active module + state and exposes `dispatch` (broadcasts) and `applyLocal` (silent receiver path).
- **`src/ui/`** — Game-agnostic shell: `App.tsx` (route between picker / lobby / playing), `GameLobby.tsx` (seat builder + game's `LobbyConfig`), `GameHost.tsx` (mounts the active game's `GameView`).
- **`src/ai/`** — Game-agnostic pieces for learned agents that act over a fixed action-slot space + legality mask: `masked.ts` (masked argmax / uniform / softmax sampling) and `mlp.ts` (dependency-free dense-network runtime for exported policy files, format `card-collecting/mlp@1`: layers of `act(W·x + b)`, W row-major [out][in] as base64 little-endian float32 — PyTorch `nn.Linear` layout).

Outside `src/`: **`training/`** — offline, never shipped. Headless match simulator, seat-swapped eval harness, a vectorized env server, and the Python (PyTorch) trainer + evaluator that drive it over stdio. Bundled to `training/dist/` (git-ignored) by `npm run train:build`. See `training/README.md`.

## GameModule contract

The single rule that makes the multi-game design work:

```ts
GameModule<S, A, C> {
  id, name, tagline, minPlayers, maxPlayers, onlineSupported?
  defaultConfig(seats) → C
  validateConfig(config) → string[]
  createInitialState(config, seed) → S
  applyAction(state, action) → S          // pure, deterministic
  chooseAIAction?(state, playerId) → A | null
  prepare?(config, seats) → Promise<void>  // async setup before a match (e.g. fetch AI policies)
  ui() → Promise<{ LobbyConfig, GameView }>   // lazy-loaded
}
```

`prepare` runs on the device that drives the AI (local play, online host): the lobby awaits it on Start (the button shows "Loading AI…") and `GameHost` on Play again. After it resolves, `chooseAIAction` must answer synchronously — the AI driver only re-runs on state changes, so returning null while "not ready" would stall the match.

**Hard invariants every module must uphold:**
- `applyAction` is pure. No `Date.now`, no `Math.random`, no I/O. RNG draws from `state.rngState`.
- Randomness chosen by the acting player (deals, draws) is folded into the action payload so all peers reduce identically.
- `S` (game state) is JSON-serializable — sent over the wire, snapshotted on join.
- The full state is replicated; hidden-information rules (other players' hands) are a UI concern. Friends-only honor, no anti-cheat.

The shell, store, and net layer never name a specific game. Adding a new game means: drop a folder, register it, done.

`onlineSupported: false` opts a module out of the online path — the lobby hides "Host online" for it. Only Set sets it (real-time claims need arbitration the action-broadcast net layer can't do). Default is `true`/absent.

## Multiplayer model

- **Trystero `/torrent`** for WebRTC signaling. No backend. App ID `card-collecting-v1`; room code is both the topic and the encryption password. Lazy-imported in `src/net/room.ts` so the solo bundle stays small.
- **Stable identity**: `localStorage` UUID (`card-collecting.uuid`), exchanged via `hello` channel. `?fresh` flips storage to `sessionStorage` for two-window local testing.
- **Full state replication**: every peer holds full `GameState`.
- **Actions, not diffs**: `{ byUuid, actionJson }` envelopes; receivers verify the UUID owns a seat in `lobby.seats` before applying via `gameStore.applyLocal`.
- **Determinism**: randomness lives in `state.rngState` (mulberry32 seeded at game start), plus per-action payload for player-chosen draws.
- **Host-authoritative lobby**: host owns lobby state, broadcasts on every edit. Seat assignment in the lobby is done by the host via a per-seat peer dropdown (changing `seat.id` from a placeholder to the chosen peer's uuid). Start broadcasts the initial `GameState` + `seatUuids[]`.
- **Rejoin / spectator**: when a peer says hello, the host responds with `sendLobby` (always) and `sendSnapshot(toPeerId)` (if a game is already in flight). Joiner's uuid matching a seat → guest; otherwise spectator (read-only — dispatch is no-op'd in `GameHost`).
- **AI in online**: only the host runs `chooseAIAction`. `GameHost.tsx`'s AI driver fires when `state.activePlayerId` resolves to an AI seat; reducers park `activePlayerId` on the next un-acted AI seat during simultaneous-pick subphases (Sushi Go `selecting`, 7 Wonders `picking`) and on a click-through screen in all-AI matches (Sushi Go `roundEnd`, 7 Wonders `militaryEnd`) so the driver self-advances. Driver early-returns when role is `guest` or `spectator`. If host drops, AI seats freeze.
- **Chat**: in-memory in `networkStore.chat`, not part of `GameState`. `ChatPanel` floats bottom-right in-game; lobby chat is a compact log on the lobby's right column.
- **Channels**: `hello`, `lobby`, `start`, `action`, `snap`, `chat`. Each is a separate `makeAction` namespace.
- **Online wiring**: `networkStore.wireRoom` subscribes to all channels and calls `gameStore.registerBroadcastHandler` so `dispatch()` from any game UI emits an action envelope. The two stores stay decoupled — `gameStore` has no awareness of the network.

## AI heuristics

Every module exports a `chooseAIAction(state, playerId) → action | null`. Except for Sea Salt & Paper (trained policies, below), all AIs are deterministic, single-difficulty heuristics — no search, no MCTS. They score the legal moves available to `playerId` and return the highest scorer. Smoke tests under `<game>/ai.test.ts` drive end-to-end AI vs AI matches to make sure no AI returns illegal actions or stalls the state machine.

Key contextual signals each AI consumes:

- **Sushi Go!** — builds a `Knowledge` snapshot every pick: per-kind unseen cards (deck composition − everything visible on tables and in own hand), picks remaining this round, and own picks remaining. Wasabi value scales with `P(see another nigiri)`, sashimi with `P(see 1 / 2 more sashimi)`, eel with `P(see a second eel)`, chopsticks/spoon/menu with future-picks remaining, tea with how much room is left to grow the most-played kind. Tempura discounts a new pair start by partner probability. Combined with a from-scratch round re-score that adds the card to the table (so wasabi-before-nigiri ordering, edamame neighbors, soy-sauce color count, etc. all factor in). Chopsticks/spoon double-pick triggers only when top-2 value exceeds top-1 by `chopsticksSaveValue`.
- **Sea Salt & Paper** — the exception: no hand-written AI. Every difficulty is a trained neural-network policy (`aiLevels.ts`; see the SSP notes below). The old heuristic was removed after the shipped policies were trained; new training runs learn from scratch.
- **7 Wonders** — scores each card in hand: vp/shields/coins/science/produce, end-VP cards by counting matching targets, neighbor-purchase cost via `suggestCheapestPurchase`. Strong negative when a duplicate name is already in tableau or no plan can pay. If no build is positive, picks the lowest-value card for a wonder stage (if affordable) or discards. The base AI now dispatches to `getActiveExpansions(config)`'s `chooseAIAction` for expansion-owned subphases — Leaders' `leaderDraft`, `leaderPlay`, `solomonAwaitPick` — so the host driver can drive AI through the leader draft + per-age leader play.
- **7 Wonders Duel** — for each available pyramid card, scores build/bury/discard outcomes against opponent production (price per unit = `2 + opponent's fixed production`, flattened to 1 with the matching trade-discount card). Wonder draft ranks each wonder by approximate VP + shields + coins/science/produce; bury value uses the best unbuilt wonder's value. Progress-token pick uses a static preference list (Philosophy → Mathematics → Agriculture → Masonry → Architecture → Law → Urbanism → Strategy → Economy → Theology).
- **Set** — no AI. Set is real-time with no turn order, so there is nothing for the `activePlayerId`-driven AI loop to hook into; `chooseAIAction` is deliberately absent and AI seats are filtered out at match setup. A pace-setter bot would need its own timer driver inside the game's view.
- **Air, Land & Sea** — `controlMargin` per seat across all theaters; deploy/improvise scored by raw strength swing, threshold-crossing bonus (going from "behind" to "ahead" in a theater), per-ability value (instants 2–4 pts, ongoings 3–4 pts). Burning a 5-6 strength card on a full hand penalty. Improvise heavy penalty if any Containment is in play. Withdraws when control margin is below half-theaters and `vpForWithdraw(handSize) < FULL_BATTLE_VP`. Ability follow-up subphases (flip / transport / redeploy / reinforce) score by maximizing strength swung onto our losing theaters.

## Game-specific design notes (deferred implementation)

Each game's `types.ts` carries detailed notes on the eventual reducer. Short summary:

### Sushi Go! Party (`src/games/sushi-go/`)
Simultaneous pick + pass-hands. Engine waits at `subPhase: 'selecting'` until all live players submit `submitPick`, then batch-applies and rotates hands. Specials (chopsticks/spoon/special-order/menu/takeout-box) enter a `specialResolution` sub-phase for the playing player. Multi-round (default 3); dessert pile persists across rounds, table resets. Menu builder picks 8 card kinds in the lobby; turn structure is identical across menus. `activePlayerId` is parked on whichever AI seat hasn't picked yet this tick (mirrors 7W's `picking` setup) so the GameHost AI driver wakes up for each AI in turn — without this, simultaneous-pick games would freeze when no human is around to dispatch.

### Sea Salt & Paper (`src/games/sea-salt-paper/`)
Each turn: draw 2 (keep 1 or both), optional play-pair-for-ability, then STOP / LAST CHANCE / pass. "LAST CHANCE" triggers a peer-relative final round — proposer wins bonus only if their score still leads. Multi-round; first to `targetScore` ends the match. Base families: mermaid, shark/swimmer/crab/boat/fish (duos), shell/octopus/penguin/sailor (collectors), lighthouse/shoal/penguinColony/captain (multipliers).

**Expansions** (togglable per match via `config.expansions`):
- *Extra Salt* — adds jellyfish/lobster/starfish/seahorse/crabBasket to the deck (8 cards). New duo pairings (jellyfish+swimmer, lobster+crab) handled in `isValidDuoPair`/`duoPartner`. Starfish trios are a new action type `playTrio` and stored as `player.trios` so scoring can flatly award 3 pts and skip the duo ability. Lobster reveal lives in `subPhase: 'awaitingLobsterPick'` with `pendingLobsterPick` buffer. Jellyfish lock uses `state.nextTurnLockedPlayerId`; the locked player's turn-handlers throw on anything but drawPair → pass.
- *Extra Pepper* — separate event deck (`state.event`). One event revealed per round (`startNewRound`), applied via predicates in `events.ts` (`playerHasEvent`, `isRoundEvent`). At round end (`awardEventCard`), `+` events go to leader, `−` to laggard, `global` events are discarded. Six events implemented in `EVENT_BY_ID` — add more by extending that map + `ALL_EVENT_IDS`; the reducer wiring (threshold lookups, mermaid-count lookup, color-bonus doubling, score-modifier) is already in place.

**Hidden-information rules** (`src/games/sea-salt-paper/knowledge.ts`, under the learned agent's observation — the single source of truth for what a seat may know). `knowledgeOf(state, seatId, { lookingAt })` replays this round's log:
- *Opponents' hands*: known only via cards taken off a pile's visible top (discard draws, crab picks of the top card, Angelfish) and cards they stole from this seat — tracked by card id until played to a table or stolen back. Deck keeps, fish draws, lobster picks, crab digs below the top, and steals between two other players are hidden.
- *Discard piles*: remembered in full and in landing order (every card landed face-up on top; `landingSeqs` dates each landing from the log) until an opponent's crab digs out a buried card. The seat then knows the pile is a card short (`unknownRemovals`, and `hiddenDigs` per digger) but not which one, until that card shows up on a table, the seat steals it, the seat digs through that pile itself (and learns what's gone — and so what the digger holds), or the pile is taken down below where the card landed (a card that landed after the visible top can't still be in the stack).
- *History*: per player this round, cards taken off a top (`publicPulls`), cards discarded from a deck draw (`discards`), and distinct pile tops passed over by drawing from the deck (`passedTops`; not on jellyfish-locked turns, where the deck is forced).
- Log entries carry the exact `card` moved, `fromTop` on crab picks, `auto` on Hermit Crab picks; `drawDeck` carries the discarded `card` and the `passed` tops (its `keptFamily` is private). Reading `entry.card` is only legitimate where the rules above say the seat saw it.

**AI difficulty levels** (`aiLevels.ts`, `SspConfig.aiLevel`, default `normal`; one level for every AI seat in the match, picked in the SSP lobby): easy / normal / hard = `policies/easy-update100.json` / `normal-update1000.json` / `hard-update10000.json`, all checkpoints of `training/runs/main` (updates 100 / 1000 / 10000). Head to head over 2000 seat-swapped Extra Salt matches: normal beats easy 61%, hard beats easy 72% and normal 65%; all beat random ~100%. Updates 100 and 1000 predate white counting for mermaid claims; 10000 was trained with it. Every level loads the same way: Vite emits each JSON (~1.3 MB at encoder v2, ~3.3 MB at v3) as a hashed asset (`?url` import, never in a JS chunk), `module.prepare` dynamic-imports `aiLevels` (keeping the network code out of the picker bundle) and fetches the chosen level once per page; the lobby starts that fetch as soon as a level is picked. Trained on 2-player Extra Salt; plays 2–4 players and any expansions legally (`aiLevels.test.ts` plays full 2/3/4-player matches on every level). The policy files are also the eval tools' benchmarks (`bench:hard-update10000` etc.; `bench:normal-update1000` is the "1k" reference). The shipped files are **encoder v2 / action space v2** and play through the frozen `nn/encodeV2.ts` and `nn/actionsV2.ts`; retrain on v3 and re-freeze them, then delete both frozen files.

**Learned-agent pipeline** (`src/games/sea-salt-paper/nn/`, 2-player base + Extra Salt; Pepper is legal but untested strategically):
- `observation.ts` — `observe(state, viewerId, { crabLookPile })` is the **only** place the agent pipeline reads `SspState`. It returns a seat-relative `SspObservation` built on `knowledgeOf`: own hand, every table, pile views (top, size, remembered buried cards bottom-first, `unknownRemovals`), deck size, hand sizes, scores, events, the announced LAST CHANCE score, own pending draw / lobster reveal, per player `knownCards` (for the viewer: what the opponents know about its hand), `pulls` / `discards` / `passedTops` / `hiddenDigs`, and `finalTurnPending` after a LAST CHANCE call. `observation.test.ts` scrambles everything hidden (incl. which card an unseen crab dig took) and asserts observation / features / mask are unchanged. Keep that test passing when adding fields.
- `actions.ts` — action space v3, 137 slots (decisions, not physical cards: "play a crab pair", "keep card 0 and discard to pile 1", "take the teal crab"), `legalMask(obs)`, `decodeSlot(obs, slot)`, inverse `slotForAction`, bundled as `SSP_ACTIONS`. Wherever the card choice changes the game the slot names its colour: `crab:<kind>` / `lobster:<kind>` per family × colour (`nn/kinds.ts`, shared with the encoder), plus `crab:top` when the top's twin lies beneath it (taking the top exposes the next card; `crab:<kind>` digs out the deepest twin instead). Pair / trio plays stay per family — which copies go to the table never changes the score — and play the copies the opponents already know about first. A crab pick is two decisions: `crabPile:N` (decodes to a `CrabLook`, not a reducer action), then — re-observing with `crabLookPile` set, which reveals that pile — a card slot. `actWithPolicy(state, pid, policy, actions = SSP_ACTIONS)` and the vec env drive both steps. `actions.test.ts` is a two-way oracle against the reducer for v3 and frozen v2 (everything the reducer accepts is masked in; everything masked in decodes to something the reducer accepts).
- `actionsV2.ts` — the previous 66-slot layout (crab / lobster picks per family), frozen for the shipped policies. Never edit it.
- `encode.ts` — encoder v3: 2030-float feature vector from the observation only. Cards are counted by **kind** (family × colour, the 54 `KINDS` of the Salt deck): card sets are per-kind fractions of that kind's copies, single cards one-hot. Holds own hand / table, per opponent table + known hand + this round's pulls / discards / passed tops, each pile's top, second and third card in order plus the rest as a set, own draw and lobster reveal, the unseen pool, and per-kind score deltas for the viewer and for the next player (`marginalTable`: 19 + 12 rescorings, pinned against a direct per-kind rescore). Layout comes from the writer itself (`featureLayout()`), so it can't drift. Opponent slots for seats 2–3 are ~2/3 of the vector and all zero at 2 players.
- `encodeV2.ts` — the previous 632-float encoder, frozen for the shipped policies. Never edit it.
- `ENCODER_VERSION` / `ACTION_SPACE_VERSION` are pinned in tests next to `OBS_DIM` / `NUM_SLOTS` (and the kind list). Bump on any layout change; policy files carry both, and loading refuses an unknown encoder or another action space.
- `agent.ts` — `actWithPolicy(state, pid, (obs, mask) → slot)` adapts any slot policy to the `chooseAIAction` shape (and runs the crab two-step).
- `policy.ts` — `loadSspPolicy(file)` validates a trained policy file (game, `encoderVersion`, `actionSpaceVersion`, dims), picks the encoder and action space it names from `SSP_ENCODERS` / `SSP_ACTION_SPACES` and returns `{ net, encoder, actions }`; `greedyPolicy` / `sampledPolicy` turn that into a slot policy, played with `actWithPolicy(..., p.actions)`. So v2 benchmarks still play in evals against v3 checkpoints.
- `src/ai/mlp.ts` sums each layer over its non-zero inputs only (bit-identical to the dense sum): ~160 of the 2030 v3 features are non-zero, so a v3 forward pass (~125 µs) is cheaper than v2's dense one was (~225 µs).
- Training lives in `training/ssp/` (`train.py`: PPO from scratch, self-play + past-checkpoint opponents; `evaluate.py` for match / baselines / ladder + Elo / analyze). See `training/README.md`.

### 7 Wonders (`src/games/seven-wonders/`)
3 Ages × 6 picks per Age. Simultaneous: each player submits a `pendingPick` (build / wonder-stage / discard); reducer reveals + applies in batch, rotates hands (CW Ages I/III, CCW Age II), resolves military at Age end. Final scoring across 7 categories at Age III end. Expansions (Leaders, Cities, Babel, Armada, Edifice) will live under `src/games/seven-wonders/expansions/` and contribute extra decks + post-action hooks. No `if (expansion === ...)` conditionals — add a module hook instead.

### Set (`src/games/set/`)
Real-time pattern-finding, currently **solo / shared-screen only**. All 16 variants of the classic game come from one algebra plus four orthogonal twists — see the dedicated section below.

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
- `npm run train:build` — bundle `training/` entry points to `training/dist/*.mjs`
- `npm run ssp:eval -- --a nn:<policy.json> --b random --games 2000 --salt` — seat-swapped SSP head-to-head over worker threads
- `python training/ssp/env_client.py` — random-agent smoke test of the Python ↔ Node env bridge (needs `train:build` first)
- `conda env create -f training/environment.yml` — Python training env (`train`: PyTorch CUDA from conda-forge, numpy, tensorboard, pytest)
- `python training/ssp/train.py --run <name> [--resume]` — train the SSP agent (outputs in `training/runs/<name>/`, git-ignored)
- `python training/ssp/evaluate.py {match A B | baselines RUN | ladder RUN | freeze RUN@N --name X | benchmarks | analyze A --vs B,C}` — seat-swapped evals; agents are `random`, `bench:<name>` (the game's shipped policies in `src/games/sea-salt-paper/policies/`), a policy `.json`, a run dir, or `RUN@N`. `analyze` tallies decisions per side (draw sources, pairs, steals, when/how rounds end, point sources) — also `npm run ssp:analyze`.
- `python -m pytest training/ssp -q` — Python-side tests (TS ↔ PyTorch export parity, train → checkpoint → resume → evaluate)

## Deployment

`.github/workflows/deploy.yml` deploys `dist/` to GitHub Pages on push to `main`. Vite `base` is `/card-collecting/` — update in `vite.config.ts` if the repo is renamed.

## Non-goals (do not implement)

- Persistent saves between sessions
- User accounts, matchmaking, lobby browser
- Anti-cheat / verifiable randomness
- Monetization, ads, telemetry
- Server-side anything

## Roadmap

See [README.md](README.md#project-plan--roadmap). Current status: **Phases 0–5 + 6 (partial) + 7 (5/5 expansions) + 8 (partial) + 9 (Duel, Set) complete.** SSP + Sushi Go + 7 Wonders (base + all 5 expansions togglable) + 7 Wonders Duel (standalone) + Air, Land & Sea (base with all abilities + SLS scaffolding) playable hot-seat and online. Trystero room, lobby sync, action broadcast, snapshot on join, lobby + in-game chat, host-only AI driver, spectator fallback all wired. SSP has both Extra Salt (full) and Extra Pepper (6/12 events) togglable in the lobby. 7 Wonders has the Leaders expansion (all 36 leaders, draft + per-age play + Bilkis activated ability + Solomon recruit-from-discard, all effect categories modeled), the Cities expansion (27 black cards + debt tokens + diplomacy mechanic + Tourist Office / Gambling Hall scoring extras), partial Babel (15 orange cards + 3 themed scoring rules) and Armada (15 navy cards + 3 themed scoring rules) expansions, and the Edifice expansion (3 central project tiles with contributor-tracking via wonder-stage builds; reward/penalty resolved at endgame). Babel's central Tower / Great Projects boards and Armada's shipyards / naval combat / island cards / pirate track are NOT modeled in v1. 7 Wonders Duel ships as a separate top-level game module (`src/games/seven-wonders-duel/`) with no shared code — pyramid draft, 12 wonders, 5/10 Progress Tokens, three supremacy paths. ALS has the Spies, Lies, & Supplies expansion togglable (theater swap + Epic Mode wired) but its per-card abilities are no-ops until rulebook text is in hand. Set ships all 16 classic variants for solo / shared-screen play off a single vector-algebra rule engine; it is the one module with `onlineSupported: false` (real-time races need claim arbitration) and the one with no AI.

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

### 7 Wonders Armada expansion notes

- **Modeled (v1 partial):** 15 navy cards (5 per age) under `expansions/armada/cards.ts`, dealt via `ageDeckCards`. Card ids start at 40000 (distinct from base/leaders/cities/babel). Per-card effects use the existing kinds plus one Armada-specific effect kind `armadaScoreExtra` with three rules:
  - `vpPerNeighborMilitaryLosses` — Pirates Cove: +V per defeat token (negative military token) across BOTH neighbors. Pillage-themed.
  - `vpPerOwnAgeIIIBuilds` — Naval Academy: +V per Age III card in own tableau (count includes the Naval Academy itself).
  - `vpPerOwnNavalSet` — Admiralty: +V per complete set of (red+blue+green+yellow) in own tableau.
- **NOT modeled (deferred):** the personal shipyard boards (4 fleets × 3 levels each), naval combat at age-end (parallel military track), island cards (separate deck visited via a Naval action), and the pirate track. These require parallel central + per-player state plus a new action type per turn — pending authoritative rule text. The seam supports adding them later: give the Armada expansion an `applyAction` hook + a custom subPhase, similar to Leaders' `leaderDraft`. Marked in lobby copy and in the two `modeled: false` cards (Shipyard, Lighthouse Beacon, Naval Yard) whose effects are placeholder.
- Navy-card pure VP lands in `row.extras.armada` (not in any base color bucket), via `scoreExtrasArmada`. Armada does NOT own any subphases, emits no events.

### 7 Wonders Edifice expansion notes

- **Modeled (v1):** the full cooperative-project mechanic — at match setup, three project tiles are drawn (one per age) from a pool of 8 in `expansions/edifice/projects.ts`. A player contributes to age N's project by building any wonder stage during that age (`wonderStageBuilt` event observed in `onEvent`). Multi-stage builds in one age count as one contribution.
- **State**: `SwState.edificeProjects` (length 3, indexed by age-1) and `SwState.edificeContributors` (parallel array of PlayerId lists). Both optional — undefined when Edifice is off.
- **Scoring**: applied at endgame via `scoreExtrasEdifice`. For each project: if `contributors.length >= project.threshold`, every contributor gets the reward; every non-contributor gets the penalty. Outcomes are converted to VP equivalents (`shields × 2`, `science = 5`, `coins / 2`, `debtTokens → -1 each`) so they all land in a single `edifice` extras column.
- **Mechanic simplification**: in the full rulebook, players deposit a Pawn token on a project to contribute; here we fold that into the existing wonder-stage build (a player "contributes" if they built any wonder stage during the matching age). This is the simplest faithful mapping — no new action type, deterministic, and matches the cooperative spirit.
- **Caveat**: the Leaders 'bury' path (burying a leader under a wonder stage) advances `wonderStagesBuilt` but does NOT emit `wonderStageBuilt` and so does NOT count as an Edifice contribution. Documented; would need a 1-line change to leaders/reducer.ts to fix.
- Edifice does NOT own any subphases, contributes no cards, and has no UI overlay beyond the lobby section. It's a pure observer + scoreExtras provider.

### 7 Wonders Duel module notes

- Lives in `src/games/seven-wonders-duel/` as a separate top-level `GameModule`. Registered in `src/games/registry.ts`. **Shares no code with base 7 Wonders** — different types (`DuelState`/`DuelAction`/`DuelConfig`), reducer, AI, UI, card pool, wonder list. The picker shows it as its own tile next to base 7W.
- **Pyramid draft**: `pyramid.ts` defines fixed slot layouts per age (each 20 slots) — `coveredBy` indices encode the dependency graph. `isSlotAvailable(slot, pyramid)` = `!slot.taken && all coveredBy taken`. `flipUncovered` runs after each take to convert newly-uncovered face-down slots to face-up.
- **State machine**:
  - `wonderDraft` (8 wonders, alternating-pick order `[0,1,1,0,0,1,1,0]` — each player ends with 4)
  - `turn` (active seat picks an available card → build / bury / discard)
  - `wonderConstruct` (after `takeAndBury`, active seat chooses which unbuilt wonder)
  - `progressPick` (after a science-symbol pair, active seat picks from `progressOffer`)
  - `finalScoring` (gameOver with `endReason: 'civilian' | 'military' | 'science'`)
- **Military track**: `state.militaryPawn` in [-9, +9]. Positive favors seat 0; negative favors seat 1. Crossing ±3 / ±6 drains opponent's coins (2 / 5). Hitting ±9 = Military Supremacy victory.
- **Science Supremacy**: a player collecting 6 distinct science symbols (out of 7) wins immediately. `Law` progress token adds a wild +1 toward that count.
- **Progress tokens**: 10 in pool, 5 drawn deterministically from `state.rngState` at setup. Each token's mechanic is documented in `progress.ts`. On-claim (Agriculture, Urbanism) coins are applied directly in `reducer.handleChooseProgressToken`. Endgame VP (Philosophy, Mathematics, Agriculture) in `scoring.progressVps`. Ongoing rule modifications (Architecture, Masonry, Strategy, Law) in the relevant code path. **Theology (extra turn) is NOT modeled in v1** — flagged in progress.ts.
- **Wonder-only effects not modeled in v1**: `extraTurn` and `pickFromDiscard` are recognized effect kinds but their interactive sub-phase isn't implemented. The numerical components (VP, coins, shields, science, produce) DO apply. Affected wonders: Hanging Gardens, Piraeus, Sphinx, Appian Way (extra turn); Mausoleum, Great Library (pick from discard). Documented in `wonders.ts` descriptions.
- **AI**: `ai.ts` ranks each available card by (build value − total cost), considers bury (only if any unbuilt wonder is affordable) + discard, picks the best. Wonder draft AI ranks by approximate VP value. Progress pick AI has a static preference order (Philosophy > Mathematics > Agriculture > Masonry > Architecture > Law > Urbanism > Strategy > Economy > Theology).
- **Resource purchase**: in Duel there's only one opponent. Price per unit = `2 + opponent's fixed production of that resource`, flattened to `1` if buyer has the appropriate trade-discount card. Opponent's coins gained via trade are routed through the Economy progress token check (with Economy: opponent gets the coins; without: coins go to the bank, Duel rule).

### Set module notes

Rebuilt from scratch (reference implementation: the local `../setwithfriends/` project, which is React + Firebase; no code was ported) so that custom drilling modes can be added and the whole thing hosts statically.

- **Cards are vectors.** `traits.ts` defines `TraitAxis` and two implementations: `Mod3Axis` (3 variants → 1 coordinate mod 3) and `Klein4Axis` (4 variants → 2 coordinates mod 2, i.e. the Klein four-group). `cards.ts`'s `CardSpace` concatenates the axes into a coordinate vector, and `CardId` is the digit string (`"1202"`) — compact, JSON-safe, usable as a map key. Axis order is fixed: colour, shape, shading, border, count (count always last; traits drop from the middle as `traitCount` shrinks).
- **Rules are linear algebra.** `rules.ts`: `ZeroSumRule(n)` = n cards whose vectors sum to zero — `n=3` over Z_3 is Set ("all the same or all different" ⟺ `a+b+c ≡ 0 mod 3`), `n=6` is GhostSet, `n=4` over Z_2 is 4Set (AAAA / ABCD / AABB ⟺ XOR = 0). `PairSumRule(2)` = four cards splittable into two pairs with equal sums = UltraSet. `CardSpace.completion()` (solve for the missing card) replaces the reference's two separate conjugate helpers and makes searches cheap: a zero-sum search picks `size-1` cards and looks the last one up; UltraSet buckets pairs by completion for O(board²) instead of O(board³).
- **Modes are data.** `modes.ts` holds all 16 specs (`family`, `traitCount`, `variants`, `chain`, `puzzle`, `shuffle`, `faceDown`, `minBoardSize`) and `ModeEngine` compiles a spec into space + rule + the anchored/excluded searches. `engineFor(id)` is memoised. **This registry is the seam for new drill modes** — a drill should be a new spec (plus, if it needs one, an objective field the reducer reads), not a new reducer branch. Adding a 6th feature or a `Mod5Axis` is likewise data-only.
- **Board model.** `board.ts`: the board is a window on the deck (`deck.slice(0, boardSize)`). `findBoardSize` grows by rows of three until a legal group exists; `removeFromBoard` back-fills holes inside the protected prefix from beyond it so surviving cards keep their on-screen position. `shufflePrefix` reshuffles only the face-up cards (Shuffle mode), drawing from `state.rngState`.
- **Selection lives in state.** A click is `toggleCard`, and the reducer resolves the group the moment the selection reaches `rule.size` — score / mistake / timing split / board advance all in one pure place. `activePlayerId` is always `null`. Wall-clock time is folded into the action payload (`atMs`), the same way player-chosen randomness is elsewhere, so `applyAction` stays pure.
- **Stats are session-only** (`stats.ts`, derived from `state.history`): split times per find, accuracy, best/median, plus a split-time bar chart on the game-over panel. Nothing is persisted — the "no saves between sessions" non-goal stands.
- **Art is hand-drawn** in `art.tsx`: four shape paths (squiggle / oval / diamond / hourglass), stripe + checker fills via masks (so the ink colour stays a plain `fill`), three border styles for MegaSet's fifth feature, four inks. A single hidden `<defs>` block is mounted by `SetArtDefs` and every card `<use>`s it. Note: symbols are sized inside an absolutely-positioned row (`inset` on `.set-card-symbols`) — an in-flow percentage height would depend on the card's content height, which is the symbols, and collapses them.
- **Shared screen:** 1–4 seats, all human. With more than one seat, the finder picks their name (or presses its number) so the claim is credited to them; `claimantId` tracks it and a mid-selection switch resets the selection. Single-seat play never shows any of this.
- **NOT modelled:** online play (see `onlineSupported: false` — two peers claiming overlapping cards would diverge under action-broadcast; the fix is host-authoritative claim arbitration plus reconcile snapshots), AI/bot opponents, and Kyle's own drill modes.

## Where to start next

0. **SSP trained AI** — shipped: easy / normal / hard levels (see the SSP notes). `runs/main` was trained to update 10000 (gains flattened after ~4000; see `training/runs/main/progress.md`). Next: train a fresh run on encoder v3 (2030 features; ~9k decisions/s, about the same as v2) and re-freeze the levels from it. Possible follow-ups: fp16 / int8 policy files (~1.3 MB each at v2, ~3.3 MB at v3), per-seat difficulty (would need a game-agnostic seat field), retraining with 3–4 player matches, and checking the LAST CHANCE scoring against the rulebook — the trained AI's whole edge is LAST CHANCE bets.
1. **Set custom drill modes** — Kyle's reason for rebuilding. Add specs to `set/modes.ts`; anything with an objective or failure condition (sprint to N, blitz clock, streak/sudden-death, metronome) wants one new optional field on `SetModeSpec` plus a check in the reducer's resolution path. Board-generating drills (flashcard boards containing exactly one group, complete-the-set, near-miss decoys) can be built on `CardSpace.completion()` + rejection sampling from `state.rngState`.
2. **Set online racing** — needs host-authoritative claim arbitration: guests' claims are requests, the host reduces and rebroadcasts (the `snap` channel already supports broadcast; `gameStore` would want a light `replaceState` next to `applyLocal`). Then flip `onlineSupported`.
3. **7 Wonders central-board expansion mechanics** — Babel's Tower of Babel + Great Projects, Armada's shipyards + naval combat + island cards + pirate track. Currently those expansions contribute only a card pool + scoring rules. Adding the central boards is a self-contained next step (`applyAction` hook + new subPhase + UI overlay per expansion).
2. **7 Wonders Duel polish** — model the wonder-only `extraTurn` and `pickFromDiscard` effects (currently stubbed). Adding `extraTurn` would skip the seat swap after a wonder build; `pickFromDiscard` would introduce a new `discardPick` subphase (the type is already in the SwSubPhase union for future use).
3. **7 Wonders polish** — model the deferred wonder stage effects (Olympia A "free per age", Halicarnassus "build from discard" — likely sharable with Solomon's `solomonAwaitPick` flow, Babylon A "play last card", Olympia B "copy guild", Babylon B "choose science"). Also: Tomyris (defeat-token redirect) needs a hook into `resolveMilitary`.
4. **Finish Pepper** — add the remaining 6 event cards to `events.ts` once authoritative rule text is in hand. Each new event needs an id in `SspEventId`, an entry in `EVENT_BY_ID`/`ALL_EVENT_IDS`, and (if it has a per-player rule effect) a hook into the reducer.
5. **AI heuristics polish** — each game except SSP now has a working heuristic AI with smoke tests (see the **AI heuristics** section above). Possible follow-ups: round-aware weighting in 7W (early-Age military matters less than late-Age; science snowballs late), opponent-modelling in SSP (currently treats opponents as "average unseen hand"), look-ahead for Sushi Go's pass direction (cards we play this tick are seen by neighbors before they pick).
6. **ALS card text from rulebook** — confirm Sea 4 / Sea 5 ability assignments against the authoritative rulebook (Investigation, Salvage in `cards.ts` are best-guess assignments) and fill in the 18 SLS abilities. The dispatch in `abilities.ts` (`intel1` … `econ6`) is already wired; each branch just needs its real effect (or a follow-up sub-phase + pending-ability shape if it needs a target).
