# training/

Offline tooling for learned AI agents. Nothing here ships to GitHub Pages:
it runs the real game reducers headlessly (no React, no timers) for evaluation
and for a Python learner to train against.

Currently: **Sea Salt & Paper**, trained on 2-player Extra Salt matches. The
game's easy / normal / hard AI levels came from here.

## Setup

```sh
conda env create -f training/environment.yml     # once; creates the `train` env
conda activate train
npm run train:build                              # bundle the TS side → training/dist/*.mjs
python -m pytest training/ssp -q                 # Python-side checks (incl. TS ↔ PyTorch parity)
```

`train.py` rebuilds `training/dist` itself at start (skip with `--no-build`).

## Training

```sh
python training/ssp/train.py --run my-run           # Ctrl+C any time: saves, then exits
python training/ssp/train.py --run my-run --resume  # carry on to --updates (default 2000)
tensorboard --logdir training/runs
```

To stop a run you can't Ctrl+C, for example one started in the background,
create an empty `training/runs/<run>/STOP`.

Training is PPO from scratch. Each update collects `--rollout` (64) decisions
from every match: `--workers` (default cores − 4, max 12) node processes ×
`--envs-per-worker` (32) matches.

- `--self-play` (half) of the workers play the current network against
  itself and train both seats.
- The rest play past checkpoints, sampled from the newest `--pool` (20) and
  re-drawn every `--pool-refresh` (10) updates. They play random moves until
  the first checkpoint exists.
- Reward is ±1 for the match, plus `--round-reward` (0.02) × the round point
  margin.

Everything lands in `training/runs/<run>/` (git-ignored):

| Path | What |
|---|---|
| `policies/update_N.json` | exported policy every `--save-every` (10) updates. Playable by the TS side, all kept |
| `ckpt/update_N.pt` | resumable checkpoint (model + optimizer + counters), newest `--keep-ckpt` (5) kept |
| `metrics.jsonl`, `tb/` | per-update losses, entropy, KL, explained variance, decisions/s, training win rate vs past checkpoints |
| `evals.jsonl` | background evals every `--eval-every` (20) updates: vs random, each benchmark, and the checkpoint `--eval-past-gap` (5) saves back |
| `config.json` | the arguments, feature/action versions, architecture |

The training-time win rate (`train/winrate_vs_past`) comes from the
*sampling* policy against a moving pool. Trust the `eval/*` numbers instead:
greedy play, seat-swapped, on fixed deals the agent never trains on.

**History.** The shipped policies come from `runs/main`, which began with 10
updates of imitating a hand-written heuristic (since removed) before PPO.
Thirty PPO updates (~1M decisions, about 4 minutes) took it from 32% to 72%
against that heuristic. It got there by switching from STOP to LAST CHANCE.
Gains flattened around update 1000 (87.5%).

## Evaluating

`evaluate.py` wraps the seat-swapped TS harness. Agents are:

- `random`
- `bench:<name>`: one of the game's shipped policies
- a policy file
- a run directory (its latest policy)
- `RUN@N`: the policy saved at update N

```sh
python training/ssp/evaluate.py baselines training/runs/my-run          # latest vs random + every benchmark
python training/ssp/evaluate.py match training/runs/my-run@400 bench:hard-update1000 --games 4000
python training/ssp/evaluate.py match training/runs/my-run training/runs/my-run@200
python training/ssp/evaluate.py ladder training/runs/my-run --points 8  # past iterations + benchmarks + Elo
```

How to read the numbers:

- `score` is wins (+½ draws) per match with a 95% Wilson interval. One agent
  is better than another when the **lower** end is above 50%. The interval is
  about ±2 points at 2000 matches and ±1.5 at 4000.
- `ladder` plays sampled checkpoints against random, every benchmark and their
  predecessor, and the latest against each earlier one. It then fits Elo
  ratings with `bench:easy-update10` pinned at 1000. A rising Elo means steady
  progress. If a checkpoint beats its predecessor but loses Elo against the
  rest, training is cycling.
- `match` prints the full report, including behaviour stats: STOP / LAST
  CHANCE calls and bet win rate, mermaid wins, match length.

The TS CLI also works directly:
`npm run ssp:eval -- --a nn:<policy.json> --b random --games 2000 --salt`.
Agent specs there are `random`, `nn:<file>` (greedy) and `nn-sample:<file>`
(sampled).

### Benchmarks = the game's AI levels

The policies the game ships, in `src/games/sea-salt-paper/policies/`, double as
fixed benchmarks: `bench:<file name>`. They never change unless you re-freeze
them, so scores against them stay comparable across runs. Each file records
where it came from and how it scored when frozen.

```sh
python training/ssp/evaluate.py benchmarks
python training/ssp/evaluate.py freeze training/runs/main@1000 --name hard-update1000 --games 4000 --note "..."
```

| Level | Benchmark | Source (`runs/main`) | vs random | vs the old heuristic |
|---|---|---|---|---|
| easy | `bench:easy-update10` | u10: 10 imitation updates | 94.0% | 16.0% |
| normal | `bench:normal-update40` | u40: + 30 PPO | 99.8% | 73.2% |
| hard | `bench:hard-update1000` | u1000: + 990 PPO | 99.9% | 87.5% |

Hard beats normal 71.8% and easy 97.0% (2000 matches each). The heuristic
column is historical; that opponent no longer exists.

`freeze` writes into the game's policy folder, but a new file only becomes a
difficulty once `src/games/sea-salt-paper/aiLevels.ts` points a level at it.
The trainer evaluates every checkpoint against all of them (pick with
`--eval-bench a,b` or `none`) → `eval/score_vs_bench_<name>`. They are policy
files, so a feature or action version change breaks them, and
`aiLevels.test.ts` fails. Retrain and re-freeze then.

### How agents play: `analyze`

```sh
python training/ssp/evaluate.py analyze bench:hard-update1000 --vs bench:easy-update10,bench:normal-update40,bench:hard-update1000 --games 2000
```

For each matchup it tallies each side's decisions: draw source, pairs played
or held, steals, crab digs, when it ends rounds (own score, opponent's real
score), how those rounds end, and points per category.

It then ranks **card importance** for every agent, pooled over its matchups.
This is normalised for availability, so a boat isn't "important" just because
there are eight of them. Every card choice becomes head-to-head comparisons:

- a discard top taken beats a blind deck draw and the other top;
- a deck draw beats both tops;
- the kept card of a drawn pair beats the other;
- a crab or lobster pick beats every other card it could have taken.

A Bradley–Terry fit turns those into one strength per family, shown as how
often the agent would take that card over a blind draw. Next to it are the
plain rates (taken ÷ offered as a top, kept ÷ drawn) and how often each card
was seen.

## Pieces

| File | Role |
|---|---|
| `ssp/train.py` | PPO trainer, opponent pool, checkpoints, background eval |
| `ssp/model.py` | policy-value MLP, export to the TS runtime format, checkpoint I/O |
| `ssp/evaluate.py` | Python eval API + CLI (`match`, `baselines`, `ladder`, `freeze`, `benchmarks`, `analyze`, Elo fit) |
| `ssp/env_client.py` | Python `SspEnv` client (numpy), plus a random-agent smoke test |
| `ssp/test_training.py` | pytest: export parity, train → checkpoint → resume → evaluate, freeze |
| `ssp/sim.ts` | `playMatch(agents, seed, opts)`: one headless match + per-seat stats |
| `ssp/agents.ts` | agent registry (`random`, `nn:`, `nn-sample:`) |
| `ssp/evaluate.ts` / `eval.ts` | seat-swapped jobs, summary, report / CLI over worker threads |
| `ssp/analyze.ts` | decision tallies + card-importance ranking (`analyze` / `npm run ssp:analyze`) |
| `ssp/vec-env.ts` | `SspVecEnv`: N matches, auto-advance to the learner's decisions, auto-reset |
| `ssp/env-server.ts` | JSON-lines stdio wrapper around `SspVecEnv` (protocol in the file header) |

The game-side pieces live in `src/games/sea-salt-paper/`. `knowledge.ts`
defines what a seat may know. In `nn/`:

- `observation.ts`: the agent's view
- `actions.ts`: 66 action slots, legal mask, decoder
- `encode.ts`: 632 features
- `policy.ts`: loading policy files, greedy / sampled play

`aiLevels.ts` holds the game's difficulty levels, and the network runtime is
`src/ai/mlp.ts`. A trained policy is `(features, mask) → slot`. It never
receives `SspState`.

A crab pick takes two decisions, as in the rulebook: first `crabPile:N`
(chosen from memory), then `crab:<family>` once the env re-observes with that
pile revealed. The env asks the same seat twice; the first answer changes no
game state.

## Hidden information

The agent's observation is built on `knowledge.ts`. A seat knows its own hand,
all tables, pile tops and sizes, hand sizes, scores and events. It knows an
opponent's cards only when they took them off a pile's visible top or stole
them from this seat. It remembers each discard pile in full (every card landed
face-up), except that after an opponent's crab digs out a buried card, it
knows the pile is a card short but not which card. Deck order, the rest of
opponents' hands, the RNG and private log fields never reach it.
`observation.test.ts` scrambles all of that, including which card an unseen
crab dig took, and requires an identical observation, feature vector and mask.

## Env protocol (summary)

`reset` → batch; `step` with one slot per env → batch; `configure` swaps the
fixed opponent for matches that start afterwards. A batch has:

- `seat`
- `obs` (n × obsDim float32)
- `mask` (n × numSlots)
- `reward` (n × 2, per seat, since the previous batch)
- `done`
- `episodes`

Credit `reward[i][s]` to seat s's latest transition in env i. With
`opponent: 'self'` both seats are the learner.

## Versioning

`ENCODER_VERSION` (`encode.ts`) and `ACTION_SPACE_VERSION` (`actions.ts`) are
pinned by tests together with `OBS_DIM` / `NUM_SLOTS`. Any layout change must
bump the version. Policy files record both, and loading refuses a mismatch,
so old checkpoints stop loading rather than playing nonsense. Retrain after
an encoder change.
