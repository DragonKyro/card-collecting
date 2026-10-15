# training/

Offline tooling for learned AI agents. Nothing here ships to GitHub Pages:
it runs the real game reducers headlessly (no React, no timers) for evaluation
and for a Python learner to train against.

Currently: **Sea Salt & Paper, 2 players, base game + Extra Salt.**

## Commands

```sh
conda env create -f training/environment.yml && conda activate ssp-train
npm run train:build                     # bundle entry points → training/dist/*.mjs
npm run ssp:eval -- --a heuristic --b random --games 2000 --salt
python training/ssp/env_client.py       # smoke-test the Python bridge (random agent)
```

`ssp:eval` flags: `--a` / `--b` agent specs (`heuristic`, `random`), `--games`
(rounded up to even), `--salt`, `--pepper`, `--target` (default 40), `--seed`,
`--workers` (default cores − 1, max 16), `--max-steps`, `--json <path>`.

Every seed is played twice with seats swapped. Seat 0 wins ~55% of
heuristic mirror matches, so unswapped comparisons would be biased. The
report gives A's score (win = 1, draw = ½) with a Wilson 95% CI. At ~2000
matches the CI is about ±2 points; that's the noise floor to beat.

## Pieces

| File | Role |
|---|---|
| `ssp/sim.ts` | `playMatch(agents, seed, opts)`: one headless match + per-seat stats |
| `ssp/agents.ts` | agent registry; a trained net registers here as a new spec |
| `ssp/evaluate.ts` / `eval.ts` | seat-swapped jobs, summary, report / CLI over worker threads |
| `ssp/vec-env.ts` | `SspVecEnv`: N matches, auto-advance to the learner's decisions, auto-reset |
| `ssp/env-server.ts` | JSON-lines stdio wrapper around `SspVecEnv` (protocol in the file header) |
| `ssp/env_client.py` | Python `SspEnv` client (numpy), plus a random-agent smoke test |

The game-side pieces live in `src/games/sea-salt-paper/`: `knowledge.ts`
(what a seat may know, shared with the heuristic), and in `nn/`:
`observation.ts` (the agent's view), `actions.ts` (66 action slots, legal
mask, decoder), `encode.ts` (632 features). A trained policy is
`(features, mask) → slot`. It never receives `SspState`.

A crab pick takes two decisions, as in the rulebook: first `crabPile:N`
(chosen from memory), then — once the env re-observes with that pile
revealed — `crab:<family>`. The env asks the same seat twice; the first
answer changes no game state.

## Hidden information

Both AIs follow `knowledge.ts`. A seat knows its own hand, all tables, pile
tops and sizes, hand sizes, scores and events. It knows an opponent's cards
only when they took them off a pile's visible top or stole them from this
seat. It remembers each discard pile in full (every card landed face-up),
except that after an opponent's crab digs out a buried card, it knows the pile
is a card short but not which card. Deck order, the rest of opponents' hands,
the RNG and private log fields never reach it.

`observation.test.ts` (agent) and `ai.test.ts` "AI plays fair" (heuristic)
scramble all of that — including which card an unseen crab dig took — and
require identical observations / moves. The fair heuristic beat the earlier
hand-peeking version 52.5% (95% CI 51.0–54.1%) over 4000 seat-swapped
Extra Salt matches, so `heuristic` is an honest baseline.

## Env protocol (summary)

`reset` → batch; `step` with one slot per env → batch. A batch has `seat`,
`obs` (n × obsDim float32), `mask` (n × numSlots), `reward` (n × 2, per seat,
since the previous batch), `done`, `episodes`. Rewards: ±1 at match end, plus
optional `roundReward × (own − opponent round total)` at each round end.
Credit `reward[i][s]` to seat s's latest transition in env i. With
`opponent: 'self'` both seats are the learner.

Throughput is ~4–6k learner decisions/s per env process. Run one process per
core for training.

## Versioning

`ENCODER_VERSION` (`encode.ts`) and `ACTION_SPACE_VERSION` (`actions.ts`) are
pinned by tests together with `OBS_DIM` / `NUM_SLOTS`. Any layout change must
bump the version. Trained weights must record both versions and be refused
on mismatch.
