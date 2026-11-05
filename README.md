# card-collecting

**▶ Play it live: <https://dragonkyro.github.io/card-collecting/>**

A multi-game web app for **card-collecting games** where the objective is to maximize points in your own hand while minimizing points in your opponents'. Hosted on GitHub Pages; online play with friends runs through a Firebase Realtime Database (no server code of our own).

Shipping targets:
- **Sushi Go! Party** (incl. menu builder, not just the base set)
- **Sea Salt & Paper**
- **7 Wonders** (with Leaders, Cities and Babel — the Tower of Babel and the Great Projects)
- **7 Wonders Duel** (standalone 2-player variant — pyramid draft + three supremacy paths; with Pantheon and Agora)
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
| Multiplayer | Firebase Realtime Database + anonymous Auth (project `card-collecting-4772c`; security rules only, no server code) |
| Tests | Vitest |
| Hosting | GitHub Pages (static) |

## Project structure

```
src/
  core/         GameModule contract, RNG, shared types. Game-agnostic.
  net/          Room transport (Firebase + an in-memory fake for tests), identity, room links, wire types.
  store/        Zustand stores (gameStore, networkStore) + ActionSync (the online action log).
  ui/           Shell — App, GameLobby (local), OnlineLobby, GameHost, chat, theme.
  games/
    registry.ts                 List of all GameModules.
    sushi-go/                   Sushi Go! Party.
    sea-salt-paper/             Sea Salt & Paper (+ Extra Salt + Extra Pepper).
    seven-wonders/              7 Wonders + Leaders, Cities, Babel (Tower + Great Projects).
    seven-wonders-duel/         7 Wonders Duel (standalone two-player) + Pantheon, Agora.
    air-land-sea/               Air, Land & Sea + Spies, Lies & Supplies (mixed theaters, Epic Mode).
    set/                        Set — cards as vectors, 16 modes off one rule engine.
    machi-koro/                 Machi Koro 2 + the original Machi Koro (+ Harbor, Millionaire's Row), one dice engine.
    jaipur/                     Jaipur — trading duel, trained easy / normal / hard AI.
```

Each game lives in its own folder behind the `GameModule<S, A, C>` contract from `src/core/module.ts`. To add a new game: create `src/games/<id>/`, export a module, add it to `src/games/registry.ts`. **No other file needs to change.**

## Multiplayer model

- **Firebase Realtime Database** (instance `card-collecting-4772c-default-rtdb`), reached with the Firebase JS SDK over one WebSocket on port 443, so it works on cellular and locked-down networks. It replaced peer-to-peer WebRTC (Trystero), which never connected reliably: strict NAT with no TURN server, flaky trackers, phones dropping sockets in the background. The SDK loads as its own chunk (~77 KB gzip) only when someone goes online; solo and hot-seat play never download it or hold a connection.
- **Identity**: each device signs in to Firebase **anonymously and silently** (no account, no prompt) only so the security rules can tie writes to a device. Seats belong to the device's `localStorage` UUID; `?fresh` moves the UUID and the sign-in to `sessionStorage` for two-window local testing.
- **A room** (`rooms/{CODE}`) holds its `meta`, a `lobby` (seats, game, options — edited by transaction), one entry per match under `matches/` (a write-once `start` record + a write-once `actions` log), `chat` and `presence`. The start record carries `createInitialState`'s inputs (game, options, seed, seats), not the state, so it's a few hundred bytes.
- **The action log is the source of truth.** Every device builds the opening state from the start record and applies the logged moves in slot order, so all devices reduce identically (randomness is in `state.rngState` or in the action). Your own moves show at once; if another device's move takes the log slot first (two players acting at the same moment), your device rolls back, applies theirs, and replays yours on top — or drops it with a message if it's no longer legal.
- **Rejoin and spectate for free**: a device that reloads or loses signal replays the current match from the log and is back in its seat; anyone else who joins mid-match watches. The room code rides in the URL (`?room=ABCD`), so a reload or an invite link rejoins.
- Security rules are in `database.rules.json` (deploy with `npx firebase-tools deploy --only database`). Rooms are swept a week after they're made.
- No accounts, no matchmaking, no anti-cheat — friends-only.

### Online flow

1. **Host online** from a game's lobby (enter your name): opens a room with a 4-character code, carrying the lobby's options and AI seats over. Share the code or the invite link.
2. **Join** from the game picker with your name and the code. You take a free seat (or watch, if the table is full). Everyone sets their own seat's name and color; the host picks the game and options (guests see them read-only), adds / removes AI seats, and starts.
3. **Start**: everyone's device builds the same opening and plays through the shared action log.
4. **Play again** starts a fresh match for the whole room; **Lobby** takes everyone back to change the game, options or seats (Sushi Go always goes back to the lobby so the menu can change).
5. **AI in online**: the host's device runs the AI seats. If the host drops, the next connected seated player's device takes them over (it loads the AI first), and hands them back when the host returns, so the match goes on. Starting the next match still needs the host.

## Commands

```bash
npm run dev         # local dev server at /card-collecting/
npm run build       # tsc typecheck + vite build → dist/
npm run typecheck   # tsc no-emit
npm run test        # vitest watch
npm run test:run    # vitest single run
FIREBASE_LIVE=1 npx vitest run src/store/networkStore.live.test.ts   # online play against the real Firebase project
npx firebase-tools deploy --only database                            # deploy database.rules.json
```

`npm run test:run` covers online play against an in-memory server (`src/net/fakeTransport.ts`), including whole matches of the heuristic-AI games. The live test prints the room codes it used; remove them with `MSYS_NO_PATHCONV=1 npx firebase-tools database:remove /rooms/<CODE> --force` (Git Bash needs `MSYS_NO_PATHCONV=1` for database paths).

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main`. Vite `base` is `/card-collecting/` to match the repo name — change it in `vite.config.ts` if you rename the repo.

## Checklist

`[x]` done · `[ ]` still to do. Each game lists its base game, then its expansions, then what's open.

### Platform

- [x] Vite + React 19 + TypeScript scaffold, `GameModule` contract, Zustand stores, seeded RNG
- [x] GitHub Pages deploy on every push to `main`
- [x] Game picker, lobby (seat builder + each game's options) and hot-seat play with a pass-the-device screen
- [x] Online play over Firebase Realtime Database: room codes + invite links, self-seating lobby (the host sets game, options, AI seats), write-once action log with rollback on races, rejoin after a reload or dropped signal, spectators, play again / back to the lobby
- [x] Lobby chat and in-game chat (kept in the room, so rejoiners see it)
- [x] Host-only AI driver, so AI seats play in online matches too
- [x] A rules book for every game (the in-game Rules button)
- [x] Hot-seat with two or more humans: every simultaneous pick (Sushi Go, 7 Wonders, the Leaders draft and leader play) hands the device to each human, then the AIs; while an AI plays, the screen stays with whoever holds the device
- [x] Host hand-off: if the online host drops, a seated player's device runs the AI seats until the host is back
- [x] Per-seat AI difficulty: every AI seat picks its own level (Sushi Go, Sea Salt & Paper, Jaipur)

### Sushi Go! Party

- [x] Engine: simultaneous pick and pass, hand size by player count, desserts carried across rounds, 2–8 players
- [x] Every party card: nigiri + wasabi, maki / temaki / uramaki, all appetizers, all specials (chopsticks, spoon, menu, special order, takeout box, soy sauce, tea), all desserts
- [x] Menu builder (8 kinds, player-count limits) and random menu
- [x] Hand-drawn card art
- [x] Hot-seat and online
- [x] Trained AI: easy / normal / hard (PPO, trained at 2 players, plays 2–8)
- [x] Post-game match stats: score by round, points per card, cards taken, turn-by-turn pick timeline
- [x] Timing: chopsticks' second card is chosen with the face-down pick; spoons are used (or kept) and special orders copy at the reveal
- [ ] Multi-human hot-seat (see Platform)

### Sea Salt & Paper

- [x] Base game: draw two keep one, duo effects, collectors, multipliers, mermaids, STOP / LAST CHANCE, rounds to the target score
- [x] Hidden-information model (what each seat may know) and card-flight animations
- [x] Hot-seat and online
- [x] Expansion: Extra Salt (jellyfish, lobster, starfish trio, seahorse, crab basket)
- [x] Expansion: Extra Pepper (all 12 events, per the official rule sheet)
- [x] Trained AI: easy / normal / hard (Hard also trained on 3–4 players and with Extra Pepper)

### 7 Wonders

- [x] Base game: 3 Ages, 3–7 players (8 with Cities), simultaneous picks, hands pass left / right / left, exact rulebook deck per player count
- [x] Building: costs, chains, no duplicates, trading (a neighbour's wonder resource + brown / gray cards; trading-post and Marketplace discounts), cheapest payment found for you
- [x] Military (one token per battle) and final scoring: 7 categories, wild science symbols, ties to the most coins
- [x] All 14 wonder boards with every power: Babylon's science symbol and 7th card, Halicarnassus' build from the discard, Olympia's free build per Age and guild copy
- [x] Heuristic AI scoring every build / stage / sale (beats the previous heuristic in ~80% of games)
- [x] Hand-drawn art for every card and wonder board; each neighbour's last turn shown, new cards pop in
- [x] Hot-seat and online
- [x] Expansion: Leaders (rebuilt 2026-11-05 from the printed card list): 36 leaders at their printed costs, 6 starting coins, the draft (pass right), the Recruitment phase (recruit / build a stage / 3 coins / a Babel tile), Rome A and B, the 4 Leaders guilds (Gamers', Courtesans', Diplomats', Architects'); Tomyris, Semiramis, Bilkis, Solomon, the one-resource-less leaders (your choice of resource)
- [x] Expansion: Cities (rebuilt from the printed card list): the 27 real black cards, 3 guilds, Petra and Byzantium, hands of 8, coin losses paid or taken as debt (your choice), diplomacy (neighbours fight across the gap), masks, Clandestine Docks, Secret Warehouse / Black Market, Architect Cabinet; the 6 Cities leaders with Leaders; 8 players
- [ ] Cities: the team variant and the 3-player ghost city
- [x] Expansion: Babel — Tower of Babel: all 24 tiles, the tile draft, building a tile instead of building or selling (also with a leader), the tower (3 / 4 spaces, tiles covering the oldest), 2 / 5 / 10 VP
- [x] Expansion: Babel — Great Projects: all 15 projects, participation (free builds and Halicarnassus / Solomon too), rewards per token, penalties and penalty tokens
- [ ] Expansion: Armada — rules known, card data missing (dockyard boards, Armada cards, islands)
- [ ] Expansion: Edifice — rules known, card data missing (the 15 Edifice cards, Ur, Carthage)
- [ ] Expansion: Wonder Pack (Great Wall, Stonehenge, Abu Simbel, Manneken Pis), not started

### 7 Wonders Duel

- [x] Base game, checked against the printed deck and rulebook: pyramid draft, wonder draft, Progress tokens (Great Library included), chains, trading, play-again, destroy wonders, the Mausoleum, 7-wonder limit, all three victories
- [x] Heuristic AI (gain minus the best card it leaves the opponent)
- [x] Hand-drawn art and card / wonder / token flights
- [x] Hot-seat and online
- [x] Expansion: Pantheon (per Board Game Arena's adaptation): the Pantheon board, 15 Divinities + the Gate, Mythology and Offering tokens, Grand Temples, the Sanctuary, the Divine Theater, Mysticism / Poliorcetics / Engineering
- [x] Expansion: Agora (per Board Game Arena's adaptation): the Senate with 6 Chambers, Influence cubes and 16 Decrees, Politicians and Conspirators, 16 Conspiracies, Curia Julia, Knossos, Corruption / Organized Crime, Political Supremacy
- [x] Pantheon and Agora together; hidden Conspiracies and Divinities stay hidden (hot-seat pass screen with either expansion), AI for every new decision, online play
- [ ] BGA's automatic last wonder pick (the draft still asks for it)

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
- [x] 5-5-2 market (the "hybrid supply": 1–6 / 7+ / majors, a third supply option)
- [x] Rulings checked against the wiki's card pages: Renovation Company paid per copy, Vineyard's wheat symbol, one purple per player in the supply; Sushi Bar now costs 4 (the non-Japanese printing)
- [ ] Rulings still unverified: Tuna Boat rolled once for all boats
- [ ] AI: commit to a two-dice economy (it favours cheap 1–6 cards; committing to two dice only paid off against one-die bots — see CLAUDE.md)

### Jaipur

- [x] Full game: market of five, take / camels / trade / sell, bonus tokens, camel token, Seals of Excellence, best of 1 / 3 / 5
- [x] Hand-drawn cards and tokens; card and token flights
- [x] Hot-seat and online
- [x] Trained AI: easy / normal / hard (PPO self-play, plays only from what its seat may know)
- [x] Post-game match stats: each round's race (rupees / camels / hand by move), round scores by source, goods, sale sizes, move mix
- [ ] An `analyze` tool like `sgp:analyze`

### More games

- [ ] Additional games as desired

Game-specific design notes live in each game's `types.ts` and in [CLAUDE.md](CLAUDE.md).



