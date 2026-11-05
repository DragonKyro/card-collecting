# card-collecting

**▶ Play it live: <https://dragonkyro.github.io/card-collecting/>**

A multi-game web app for **card-collecting games** where the objective is to maximize points in your own hand while minimizing points in your opponents'. Hosted on GitHub Pages, no backend, peer-to-peer multiplayer via WebRTC.

Shipping targets:
- **Sushi Go! Party** (incl. menu builder, not just the base set)
- **Sea Salt & Paper**
- **7 Wonders** (with all 5 expansions: Leaders, Cities, Babel, Armada, Edifice)
- **7 Wonders Duel** (standalone 2-player variant — pyramid draft + three supremacy paths)
- **Air, Land & Sea** (Revised Edition + Spies, Lies & Supplies — mixed theaters and Epic Mode; heuristic AI)
- **Set** (all 16 variants: Junior, Set-Chain, UltraSet, GhostSet, 4Set, MegaSet, Puzzle, Shuffle, Memory, …)
- **Machi Koro** (Machi Koro 2 by default, incl. the landmark promo pack; the original base game as an edition option, with its Harbor and Millionaire's Row expansions)
- **Jaipur** (2-player trading duel — hot-seat, online, or vs AI)
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
    air-land-sea/               Air, Land & Sea + Spies, Lies & Supplies (mixed theaters, Epic Mode).
    set/                        Set — cards as vectors, 16 modes off one rule engine.
    machi-koro/                 Machi Koro 2 + the original Machi Koro (+ Harbor, Millionaire's Row), one dice engine.
    jaipur/                     Jaipur — trading duel, trained easy / normal / hard AI.
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

## Checklist

`[x]` done · `[ ]` still to do. Each game lists its base game, then its expansions, then what's open.

### Platform

- [x] Vite + React 19 + TypeScript scaffold, `GameModule` contract, Zustand stores, seeded RNG
- [x] GitHub Pages deploy on every push to `main`
- [x] Game picker, lobby (seat builder + each game's options) and hot-seat play with a pass-the-device screen
- [x] Online play over Trystero: room codes, host-authoritative lobby, action broadcast, snapshot on join, spectators
- [x] Lobby chat and in-game chat
- [x] Host-only AI driver, so AI seats play in online matches too
- [x] A rules book for every game (the in-game Rules button)
- [ ] Hot-seat with two or more human seats in Sushi Go, and in the 7 Wonders Leaders draft / leader play: only AI seats are handed the turn, so the second human never gets the device and the match stalls (fixed for base 7 Wonders)
- [ ] Host hand-off: if the online host disconnects, AI seats freeze
- [ ] Per-seat AI difficulty (today one level covers every AI seat; needs a game-agnostic seat field)

### Sushi Go! Party

- [x] Engine: simultaneous pick and pass, hand size by player count, desserts carried across rounds, 2–8 players
- [x] Every party card: nigiri + wasabi, maki / temaki / uramaki, all appetizers, all specials (chopsticks, spoon, menu, special order, takeout box, soy sauce, tea), all desserts
- [x] Menu builder (8 kinds, player-count limits) and random menu
- [x] Hand-drawn card art
- [x] Hot-seat and online
- [x] Trained AI: easy / normal / hard (PPO, trained at 2 players, plays 2–8)
- [ ] Rulebook timing: chopsticks' second card and the spoon call are chosen with the pick (the rulebook calls them during the reveal); a special order picks its copy after the reveal
- [ ] Multi-human hot-seat (see Platform)

### Sea Salt & Paper

- [x] Base game: draw two keep one, duo effects, collectors, multipliers, mermaids, STOP / LAST CHANCE, rounds to the target score
- [x] Hidden-information model (what each seat may know) and card-flight animations
- [x] Hot-seat and online
- [x] Expansion: Extra Salt (jellyfish, lobster, starfish trio, seahorse, crab basket)
- [x] Expansion: Extra Pepper (all 12 events, per the official rule sheet)
- [x] Trained AI: easy / normal / hard (Hard also trained on 3–4 players and with Extra Pepper)
- [ ] Easy and Normal trained at 3–4 players and with Extra Pepper (only Hard is today)
- [ ] Check LAST CHANCE scoring against the rulebook (the AI's whole edge is LAST CHANCE bets)
- [ ] Smaller policy files (fp16 / int8; each is ~1.7 MB)
- [ ] A stronger policy: training plateaus, so try capacity (`--hidden 512 --layers 3`) or `--anneal-lr`

### 7 Wonders

- [x] Base game: 3 Ages, 3–7 players, simultaneous picks, hands pass left / right / left, exact rulebook deck per player count
- [x] Building: costs, chains, no duplicates, trading (a neighbour's wonder resource + brown / gray cards; trading-post and Marketplace discounts), cheapest payment found for you
- [x] Military (one token per battle) and final scoring: 7 categories, wild science symbols, ties to the most coins
- [x] All 14 wonder boards with every power: Babylon's science symbol and 7th card, Halicarnassus' build from the discard, Olympia's free build per Age and guild copy
- [x] Heuristic AI scoring every build / stage / sale (beats the previous heuristic in ~80% of games)
- [x] Hand-drawn art for every card and wonder board; each neighbour's last turn shown, new cards pop in
- [x] Hot-seat and online
- [x] Expansion: Leaders: draft of 4, one leader per Age (play / bury / discard / skip), Bilkis, Solomon; 35 of 36 leaders
- [ ] Leaders: Tomyris (defeat tokens go to the victor) needs a hook into military resolution
- [ ] Leaders: burying a leader under a stage skips the stage's power (Halicarnassus) and the Edifice contribution
- [ ] Leaders: multi-human hot-seat (see Platform)
- [x] Expansion: Cities: 27 black cards, debt tokens, diplomacy, Tourist Office and Gambling Hall scoring
- [ ] Cities: Pigeon Loft, Spy Ring (second ability), Black Market and Slave Market abilities are placeholders (need the rulebook text)
- [ ] Cities: check the hand size against the rulebook (black cards are cut into a 7-card deal here; the box rules may deal 8 per Age)
- [ ] Cities: the 3-player "ghost city" variant
- [x] Expansion: Edifice: 3 projects (one per Age), contributing by building a wonder stage, rewards and penalties at the end
- [x] Expansion: Babel, partial: 15 orange cards and 3 scoring rules, written without the rulebook
- [ ] Babel: the Tower of Babel (law tiles) and the Great Projects; Tower Workers and Great Project Worksite are placeholders
- [x] Expansion: Armada, partial: 15 navy cards and 3 scoring rules, written without the rulebook
- [ ] Armada: shipyards, naval combat, islands and the pirate track; Shipyard, Lighthouse Beacon and Naval Yard are placeholders
- [ ] Expansion: Wonder Pack (Great Wall, Stonehenge, Abu Simbel, Manneken Pis), not started

### 7 Wonders Duel

- [x] Base game, checked against the printed deck and rulebook: pyramid draft, wonder draft, Progress tokens (Great Library included), chains, trading, play-again, destroy wonders, the Mausoleum, 7-wonder limit, all three victories
- [x] Heuristic AI (gain minus the best card it leaves the opponent)
- [x] Hand-drawn art and card / wonder / token flights
- [x] Hot-seat and online
- [ ] Expansion: Pantheon, not started
- [ ] Expansion: Agora, not started

### Air, Land & Sea

- [x] Revised Edition: all 18 cards with their printed abilities (ordered ability queue), both withdraw charts, theater rotation, Beginner Mode
- [x] Heuristic AI that samples the hidden cards rather than reading them
- [x] Hand-drawn art for every card, theater banners, a decision panel for every ability prompt
- [x] Hot-seat and online
- [x] Expansion: Spies, Lies & Supplies: all 18 cards, supply tokens and reveals; any three theaters from either box, or Epic Mode

### Set

- [x] All 16 variants (Junior, Set-Chain, UltraSet, GhostSet, 4Set, MegaSet, Puzzle, Shuffle, Memory, …) off one rule engine
- [x] Own card art; session split-time stats
- [x] Solo and shared-screen (1–4 players on one device)
- [ ] Custom drill modes (sprint to N, blitz clock, streak / sudden death, metronome, flashcard boards, complete-the-set, near-miss decoys); `set/modes.ts` is the seam
- [ ] Online racing: needs host-authoritative claim arbitration (then flip `onlineSupported`)
- [ ] AI opponent / pace-setter bot (needs its own timer driver in the view)

### Machi Koro

- [x] Machi Koro 2 (default): 5-5-5 market, landmark price ladders, "everyone" landmarks, all 20 establishments + 20 landmarks + 3 promo landmarks
- [x] Machi Koro (original) base game as an edition option
- [x] Heuristic AI over an expected-income model
- [x] Hand-drawn art for every building; dice, coin and card animations
- [x] Hot-seat and online
- [x] Expansion: Harbor (original edition): City Hall, Harbor, Airport, 10 establishments, a 5th player, the 10-pile marketplace
- [x] Expansion: Millionaire's Row (original edition): 14 establishments incl. renovation, demolition, Tech Startup, Exhibit Hall
- [ ] Deluxe / 5th-anniversary 5-5-2 market (a third supply option)
- [ ] Check rulings against the printed rulebooks: Tuna Boat rolled once for all boats, Renovation Company paid per copy, Vineyard's wheat symbol, one purple per player in the supply
- [ ] AI: commit to a two-dice economy (it favours cheap 1–6 cards until they sell out)

### Jaipur

- [x] Full game: market of five, take / camels / trade / sell, bonus tokens, camel token, Seals of Excellence, best of 1 / 3 / 5
- [x] Hand-drawn cards and tokens; card and token flights
- [x] Hot-seat and online
- [x] Trained AI: easy / normal / hard (PPO self-play, plays only from what its seat may know)
- [ ] A stronger policy past the plateau (capacity `--hidden 512 --layers 3` or `--anneal-lr`)
- [ ] An `analyze` tool like `sgp:analyze`

### More games

- [ ] Additional games as desired

Game-specific design notes live in each game's `types.ts` and in [CLAUDE.md](CLAUDE.md).
