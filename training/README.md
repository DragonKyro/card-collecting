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
create an empty `training/runs/ssp/<run>/STOP`.

Training is PPO, from scratch or from a copy of an existing policy. Each
update collects `--rollout` (64) decisions from every match: `--workers`
(default cores − 4, max 12) node processes × `--envs-per-worker` (32) matches.
The workers split three ways:

- `--self-play` (default half) play the current network against itself and
  train both seats.
- `--bench-play` (default 0) face the frozen `--bench-opponents`
  (`hard-update10000`), half of them against a benchmark that samples its
  moves (`--bench-sampled`) and half against it playing greedily, as the
  evals do.
- The rest play past checkpoints, sampled from the newest `--pool` (20) and
  re-drawn every `--pool-refresh` (10) updates. They play random moves until
  the first checkpoint exists.

Reward is ±1 for the match, plus `--round-reward` (0.02) × the round point
margin.

### Why mix in the benchmark, and what the update does about it

Pure self-play can stall: the network keeps beating its own latest self by
ways that don't carry over to a fixed opponent, so `train/winrate_vs_past`
looks fine while the eval against the benchmark is flat. The update therefore
treats the opponent as part of the data:

- **Benchmark games** are in the mix (`train/winrate_vs_bench` is their win
  rate, so a stall shows up in training, not only in the evals).
- **Advantages are normalised within each source** (self / past / bench) so
  each source moves the policy with comparable force, however large its
  returns are. `--source-weights self=1,past=1,bench=1.5` scales them
  further; `--no-per-source-norm` restores one normalisation per update.
- **The value head also sees who the opponent is** (a one-hot, training only:
  never exported, never seen by the policy). A benchmark game and a
  self-play game have different expected results, so one baseline per source
  gives lower-variance advantages. `--no-source-critic` turns it off.
- **A KL anchor to a teacher** (`--teacher`, `--kl-coef`, `--kl-anneal`): a
  penalty on KL(teacher ‖ policy) that fades to zero, so the first PPO steps
  can't undo what a copy learned.

### Starting from a copy of an existing policy

`--teacher bench:hard-update10000 --imitate-updates 300` makes the first 300
updates supervised. The network plays (DAgger style: the teacher plays
`--imitate-mix` 50% → 10% of the moves itself, so the states visited include
where the teacher would go) and learns the teacher's whole move distribution
on every state it reaches, at `--imitate-lr` (1e-3). Then PPO takes over at
`--lr`.

The teacher can be an older encoder and action space: both read the same
observation, and `teacher.ts` turns each of the teacher's slots into the move
it stands for and names it in the current action space. For the shipped Hard
(v2, 66 slots) read by the v3 learner (137 slots), that only changes crab and
lobster picks: "take a crab" becomes the exact colour Hard would take. The
log shows `COPY ce-gap` (how far the network is from the teacher) and
`agree` (how often its favourite move is the teacher's).

```sh
python training/ssp/train.py --run v3 \
  --teacher bench:hard-update10000 --imitate-updates 300 \
  --self-play 0.25 --bench-play 0.5 --kl-coef 0.1 --kl-anneal 2000 --lr 1e-4 \
  --updates 10000 --eval-bench hard-update10000,normal-update1000 \
  --eval-same-update training/runs/ssp/main
```

A copy of Hard reaches parity with it in about 80 updates (~6 minutes): 51.0%
over 300 matches at update 80 with encoder v3 and colour-aware crab picks.

Everything lands in `training/runs/ssp/<run>/` (git-ignored). Runs are
grouped by game — `training/runs/<game>/<run>/` — so other games' agents get
their own folder next to `ssp/`:

| Path | What |
|---|---|
| `policies/update_N.json` | exported policy every `--save-every` (100) updates. Playable by the TS side, all kept |
| `ckpt/update_N.pt` | resumable checkpoint (model + optimizer + counters), newest `--keep-ckpt` (5) kept |
| `metrics.jsonl`, `tb/` | per-update losses, entropy, KL, explained variance, decisions/s, training win rate vs past checkpoints and vs the benchmark, and (with a teacher) the gap to it and how often the network's favourite move is the teacher's |
| `evals.jsonl` | background evals every `--eval-every` (100) updates: vs random, each benchmark, the checkpoint `--eval-past-gap` (5) saves back, and with `--eval-same-update RUN` that run's policy at the same update (two setups compared at equal training) |
| `progress.md` | those evals as a table, rewritten once each checkpoint's evals are in: the latest 10 checkpoints, then all of them (copy-phase rows are marked). Under the title: how the run trains (opponent mix, teacher, update settings). The log prints the latest-10 table too |
| `config.json` | the arguments, feature/action versions, architecture |

The training-time win rates (`train/winrate_vs_past`, `_vs_bench`) come from
the *sampling* policy. Trust the `eval/*` numbers instead: greedy play,
seat-swapped, on fixed deals the agent never trains on.

**History.** The shipped policies come from `runs/ssp/main`, which began with 10
updates of imitating a hand-written heuristic (since removed) before PPO.
Thirty PPO updates (~1M decisions, about 4 minutes) took it from 32% to 72%
against that heuristic. It got there by switching from STOP to LAST CHANCE.
It reached 87.5% by update 1000. An overnight continuation to update 10000
(~246M decisions, 6 h 40 min) beat update 1000 by 64.8%, with most of the gain
by update 4000. `runs/ssp/main` keeps every 100th policy.

## Evaluating

`evaluate.py` wraps the seat-swapped TS harness. Agents are:

- `random`
- `bench:<name>`: one of the game's shipped policies
- a policy file
- a run directory (its latest policy)
- `RUN@N`: the policy saved at update N

```sh
python training/ssp/evaluate.py baselines training/runs/ssp/my-run          # latest vs random + every benchmark
python training/ssp/evaluate.py match training/runs/ssp/my-run@400 bench:hard-update10000 --games 4000
python training/ssp/evaluate.py match training/runs/ssp/my-run training/runs/ssp/my-run@200
python training/ssp/evaluate.py ladder training/runs/ssp/my-run --points 8  # past iterations + benchmarks + Elo
```

How to read the numbers:

- `score` is wins (+½ draws) per match with a 95% Wilson interval. One agent
  is better than another when the **lower** end is above 50%. The interval is
  about ±2 points at 2000 matches and ±1.5 at 4000.
- `ladder` plays sampled checkpoints against random, every benchmark and their
  predecessor, and the latest against each earlier one. It then fits Elo
  ratings with `bench:easy-update100` pinned at 1000. A rising Elo means steady
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
python training/ssp/evaluate.py freeze training/runs/ssp/main@10000 --name hard-update10000 --games 2000 --note "..."
```

| Level | Benchmark | Source (`runs/ssp/main`) | vs random | vs easy | vs normal |
|---|---|---|---|---|---|
| easy | `bench:easy-update100` | update 100 | 100.0% | — | — |
| normal | `bench:normal-update1000` | update 1000 | 99.9% | 61.4% | — |
| hard | `bench:hard-update10000` | update 10000 | 100.0% | 71.6% | 64.8% |

2000 seat-swapped matches each. `bench:normal-update1000` doubles as the "1k"
reference that the overnight run was measured against.

`freeze` writes into the game's policy folder, but a new file only becomes a
difficulty once `src/games/sea-salt-paper/aiLevels.ts` points a level at it.
The trainer evaluates every checkpoint against all of them (pick with
`--eval-bench a,b` or `none`) → `eval/score_vs_bench_<name>`. They are policy
files, so a feature or action version change breaks them, and
`aiLevels.test.ts` fails. Retrain and re-freeze then.

### How agents play: `analyze`

```sh
python training/ssp/evaluate.py analyze bench:hard-update10000 --vs bench:easy-update100,bench:normal-update1000,bench:hard-update10000 --games 2000
```

For each matchup it tallies each side's decisions: draw source, pairs played
or held, steals, crab digs, when it ends rounds (own score, opponent's real
score), how those rounds end, and points per category. Per agent it also
reports what crab digs take (share, and rate when the card is in the pile),
whether a boat's bonus turn draws from the deck or takes a discard top, and
how often each pair type is held instead of played.

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
was seen. A second table splits the cards whose worth depends on what's
already held (pair partners, multiplier targets, collectors, mermaids) by that
situation.

`--keep-log keeps.csv` also writes every draw-two keep decision of agent A,
with what it could see about each card. `python training/ssp/keep_model.py
keeps.csv` fits a logistic model to them: each card's base keep value plus
the situational factors (points added now, completes a pair, matching
colours, value to the opponent).

## Sushi Go! Party (`sgp/`)

The same pipeline for Sushi Go: 2 players, PPO from scratch, half the workers
in self-play and half against past checkpoints, reward ±1 for the match plus
`--round-reward` (0.01) × the round point margin. Every match gets a new
random legal menu (drawn from its seed), so the policy has to play any menu;
evals use seeds the env never trains on, so their menus and deals are new too.

```sh
npm run sgp:build                                    # → training/sgp/dist (train.py also builds it)
python training/sgp/train.py --run main --updates 10000
python training/sgp/train.py --run main --resume     # carry on from the latest checkpoint
python training/sgp/evaluate.py match training/runs/sgp/main bench:hard-update10000 --games 2000
python training/sgp/evaluate.py progress training/runs/sgp/main --vs bench:hard-update10000 --every 1000
```

Runs land in `training/runs/sgp/<run>/` with the same files as SSP runs
(policies every 100 updates, all kept; the newest 10 resumable checkpoints).
`progress.md` scores each checkpoint against every shipped level (pick with
`--eval-bench a,b` or `none`), the checkpoint 500 updates earlier, and random.
(`runs/sgp/main` itself was scored against a hand-written heuristic AI,
since removed: its progress.md has that column instead.)

The game's AI levels are frozen checkpoints of `runs/sgp/main`, kept in
`src/games/sushi-go/policies/` and usable as `bench:<name>`:

| Level | Benchmark | Source update | vs random | vs easy | vs normal |
|---|---|---:|---:|---:|---:|
| easy | `bench:easy-update100` | 100 | 99.0% | — | — |
| normal | `bench:normal-update1000` | 1000 | 100.0% | 84.5% | — |
| hard | `bench:hard-update10000` | 10000 | 99.9% | 93.7% | 75.5% |

2000 seat-swapped matches each, random menus. `python training/sgp/evaluate.py freeze RUN@N --name X`
pins another one (it records the source and these scores in the file's `meta.benchmark`);
a new file only becomes a difficulty once `src/games/sushi-go/aiLevels.ts` points a level at it. The Sushi Go bundle has its own output
folder, so rebuilding the SSP bundle never removes it from under a run.

| File | Role |
|---|---|
| `sgp/train.py` | PPO trainer (derived from `ssp/train.py`; shares `ssp/model.py`) |
| `sgp/evaluate.py` | eval API + CLI (`match`, `baselines`, `progress`) |
| `sgp/env_client.py` | Python `SushiGoEnv` client, plus a random-agent smoke test |
| `sgp/agents.ts` | `random`, `nn:`, `nn-sample:` |
| `sgp/sim.ts` | `playMatch`: one headless match, random menu per seed |
| `sgp/vec-env.ts` / `sgp/env-server.ts` | the vectorized env and its stdio bridge (same protocol as SSP's) |
| `sgp/evaluate.ts` / `sgp/eval.ts` | seat-swapped jobs, summary, report / CLI over worker threads |
| `sgp/analyze.ts` | how agents play (`npm run sgp:analyze`): card priority, context pick rates, greedy / invest / deny, points by kind, set waste, specials |

Picks are simultaneous in the rules. The env asks each seat for its pick in
turn; a seat sees that the other has picked, never what. A multi-part answer
(pick + chopsticks + spoon, takeout flips) is one decision per part, like an
SSP crab pick. The game-side pieces live in `src/games/sushi-go/nn/`: see
CLAUDE.md.

## Pieces

| File | Role |
|---|---|
| `ssp/train.py` | PPO trainer, opponent pool, checkpoints, background eval |
| `ssp/model.py` | policy-value MLP (value head can take training-only extra inputs), export to the TS runtime format, checkpoint I/O |
| `ssp/teacher.ts` | a teacher policy's move distribution on a state, translated into the current action space (copying, KL anchor) |
| `ssp/evaluate.py` | Python eval API + CLI (`match`, `baselines`, `ladder`, `freeze`, `benchmarks`, `analyze`, Elo fit) |
| `ssp/env_client.py` | Python `SspEnv` client (numpy), plus a random-agent smoke test |
| `ssp/test_training.py` | pytest: export parity, train → checkpoint → resume → evaluate, freeze, copy phase → PPO with benchmark workers, the update function's pieces |
| `ssp/sim.ts` | `playMatch(agents, seed, opts)`: one headless match + per-seat stats |
| `ssp/agents.ts` | agent registry (`random`, `nn:`, `nn-sample:`) |
| `ssp/evaluate.ts` / `eval.ts` | seat-swapped jobs, summary, report / CLI over worker threads |
| `ssp/analyze.ts` | decision tallies + card-importance ranking (`analyze` / `npm run ssp:analyze`) |
| `ssp/keep_model.py` | which factors drive draw-two keep decisions (reads `analyze --keep-log`) |
| `ssp/vec-env.ts` | `SspVecEnv`: N matches, auto-advance to the learner's decisions, auto-reset; optionally reports a teacher's moves with every decision |
| `ssp/env-server.ts` | JSON-lines stdio wrapper around `SspVecEnv` (protocol in the file header) |

The game-side pieces live in `src/games/sea-salt-paper/`. `knowledge.ts`
defines what a seat may know. In `nn/`:

- `observation.ts`: the agent's view
- `actions.ts`: action space v3, 137 slots (crab / lobster picks name the colour), legal mask, decoder (`actionsV2.ts`: the frozen 66-slot v2 the shipped policies use)
- `encode.ts`: encoder v3, 2030 features (`encodeV2.ts`: the frozen 632-feature v2 the shipped policies use); `kinds.ts` is the 54 family × colour kinds both share
- `policy.ts`: loading policy files (each plays through the encoder and action space it names), greedy / sampled play

`aiLevels.ts` holds the game's difficulty levels, and the network runtime is
`src/ai/mlp.ts`. A trained policy is `(features, mask) → slot`. It never
receives `SspState`.

A crab pick takes two decisions, as in the rulebook: first `crabPile:N`
(chosen from memory), then `crab:<family>/<colour>` (or `crab:top`) once the
env re-observes with that pile revealed. The env asks the same seat twice; the first answer changes no
game state.

## Hidden information

The agent's observation is built on `knowledge.ts`. A seat knows its own hand,
all tables, pile tops and sizes, hand sizes, scores and events. It knows an
opponent's cards only when they took them off a pile's visible top or stole
them from this seat. It remembers each discard pile in full and in order
(every card landed face-up on top), except that after an opponent's crab digs
out a buried card, it knows the pile is a card short but not which card. It
also sees this round's history: what each player took off a top, discarded,
and passed over to draw from the deck, and the score a LAST CHANCE caller
announced. Deck order, the rest of opponents' hands, the RNG and private log
fields never reach it.
`observation.test.ts` scrambles all of that, including which card an unseen
crab dig took, and requires an identical observation, feature vector and mask.

## Env protocol (summary)

`reset` → batch; `step` with one slot per env → batch; `configure` swaps the
fixed opponent for matches that start afterwards and/or switches the teacher
on or off. A batch has:

- `seat`
- `obs` (n × obsDim float32)
- `mask` (n × numSlots)
- `reward` (n × 2, per seat, since the previous batch)
- `done`
- `episodes`
- `teacher` (n × numSlots float32, the teacher's move distribution; null when
  no teacher is set)

Credit `reward[i][s]` to seat s's latest transition in env i. With
`opponent: 'self'` both seats are the learner.

## Versioning

`ENCODER_VERSION` (`encode.ts`) and `ACTION_SPACE_VERSION` (`actions.ts`) are
pinned by tests together with `OBS_DIM` / `NUM_SLOTS`. Any layout change must
bump the version, and the old layout stays as a frozen copy while shipped
policies still use it. Policy files record both versions; loading plays each
file with the encoder and action space it names and refuses an unknown one,
so a mismatched checkpoint can't play nonsense. A new encoder means a new
network: weights don't carry over, but `--teacher` copies the old policy's
play into it.
