# training/

Offline tooling for learned AI agents. Nothing here ships to GitHub Pages:
it runs the real game reducers headlessly (no React, no timers) for evaluation
and for a Python learner to train against.

Currently: **Sea Salt & Paper, 2 players, base game + Extra Salt.**

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
python training/ssp/train.py --run first-try           # Ctrl+C any time: saves, then exits
python training/ssp/train.py --run first-try --resume  # carry on to --updates (default 2000)
tensorboard --logdir training/runs
```

Each update collects `--rollout` (64) decisions from every match:
`--workers` (default cores − 4, max 12) node processes × `--envs-per-worker`
(32) matches. Half the workers are self-play and train both seats. The rest
play fixed opponents: the heuristic, or past checkpoints. Past opponents are
sampled from the newest `--pool` (20) and re-drawn every `--pool-refresh` (10)
updates. The first `--bc-updates` (20) imitate the heuristic, which
warm-starts the policy and value estimate. After that it's PPO. Reward is ±1
for the match, plus `--round-reward` (0.02) × the round point margin.

Everything lands in `training/runs/<run>/`:

| Path | What |
|---|---|
| `policies/update_N.json` | exported policy every `--save-every` (10) updates. Playable by the TS side, all kept |
| `ckpt/update_N.pt` | resumable checkpoint (model + optimizer + counters), newest `--keep-ckpt` (5) kept |
| `metrics.jsonl`, `tb/` | per-update losses, entropy, KL, explained variance, decisions/s, training win rates |
| `evals.jsonl` | background evals, every `--eval-every` (20) updates |
| `config.json` | the arguments, feature/action versions, architecture |

The training-time win rates (`train/winrate_vs_*`) come from the *sampling*
policy and drift with the opponent pool. The `eval/*` numbers are the ones to
trust: greedy play, seat-swapped, on fixed deals the agent never trains on.

A first short run went from 36% (imitation only) to **72% vs the heuristic
after ~1M decisions**. It learned to skip STOP and end rounds with LAST CHANCE
(about 3 calls per match, 91% of bets won), which the heuristic almost never
does.

## Evaluating

`evaluate.py` wraps the seat-swapped TS harness. Agents are `random`,
`heuristic`, a policy file, a run directory (its latest policy), or `RUN@N`
(the policy saved at update N).

```sh
python training/ssp/evaluate.py baselines training/runs/first-try            # latest vs random + heuristic
python training/ssp/evaluate.py match training/runs/first-try@400 heuristic --games 4000
python training/ssp/evaluate.py match training/runs/first-try training/runs/first-try@200
python training/ssp/evaluate.py ladder training/runs/first-try --points 8    # past iterations + Elo
```

How to read the numbers:

- `score` is wins (+½ draws) per match with a 95% Wilson interval. One agent
  is better than another when the **lower** end is above 50%. The interval is
  about ±2 points at 2000 matches and ±1.5 at 4000.
- `ladder` plays sampled checkpoints against the heuristic, random and their
  predecessor, and the latest against each earlier one. It then fits Elo
  ratings with the heuristic pinned at 1000. A rising Elo means steady
  progress. If a checkpoint beats its predecessor but loses Elo against the
  rest, training is cycling.
- `match` prints the full report. Watch the behaviour stats: STOP / LAST CHANCE
  calls and bet win rate, mermaid wins, match length. They show *how* an agent
  wins. A sudden shift often means it found an opponent's blind spot.

The underlying TS CLI also works directly:
`npm run ssp:eval -- --a nn:<policy.json> --b heuristic --games 2000 --salt`.
Agent specs there are `heuristic`, `random`, `nn:<file>` (greedy) and
`nn-sample:<file>` (sampled).

## Pieces

| File | Role |
|---|---|
| `ssp/train.py` | PPO / imitation trainer, opponent pool, checkpoints, background eval |
| `ssp/model.py` | policy-value MLP, export to the TS runtime format, checkpoint I/O |
| `ssp/evaluate.py` | Python eval API + CLI (`match`, `baselines`, `ladder`, Elo fit) |
| `ssp/env_client.py` | Python `SspEnv` client (numpy), plus a random-agent smoke test |
| `ssp/test_training.py` | pytest: export parity, train → checkpoint → resume → evaluate |
| `ssp/sim.ts` | `playMatch(agents, seed, opts)`: one headless match + per-seat stats |
| `ssp/agents.ts` | agent registry (`heuristic`, `random`, `nn:`, `nn-sample:`) |
| `ssp/evaluate.ts` / `eval.ts` | seat-swapped jobs, summary, report / CLI over worker threads |
| `ssp/vec-env.ts` | `SspVecEnv`: N matches, auto-advance to the learner's decisions, auto-reset, teacher labels |
| `ssp/env-server.ts` | JSON-lines stdio wrapper around `SspVecEnv` (protocol in the file header) |

The game-side pieces live in `src/games/sea-salt-paper/`. `knowledge.ts`
defines what a seat may know and is shared with the heuristic. In `nn/`:

- `observation.ts`: the agent's view
- `actions.ts`: 66 action slots, legal mask, decoder
- `encode.ts`: 632 features
- `policy.ts`: loading policy files, greedy / sampled play

The network runtime is `src/ai/mlp.ts`. A trained policy is
`(features, mask) → slot`. It never receives `SspState`.

A crab pick takes two decisions, as in the rulebook: first `crabPile:N`
(chosen from memory), then `crab:<family>` once the env re-observes with that
pile revealed. The env asks the same seat twice; the first answer changes no
game state.

## Hidden information

Both AIs follow `knowledge.ts`. A seat knows its own hand, all tables, pile
tops and sizes, hand sizes, scores and events. It knows an opponent's cards
only when they took them off a pile's visible top or stole them from this
seat. It remembers each discard pile in full (every card landed face-up),
except that after an opponent's crab digs out a buried card, it knows the pile
is a card short but not which card. Deck order, the rest of opponents' hands,
the RNG and private log fields never reach it.

`observation.test.ts` (agent) and `ai.test.ts` "AI plays fair" (heuristic)
scramble all of that, including which card an unseen crab dig took, and
require identical observations / moves. The fair heuristic beat the earlier
hand-peeking version 52.5% (95% CI 51.0–54.1%) over 4000 seat-swapped
Extra Salt matches, so `heuristic` is an honest baseline.

## Env protocol (summary)

`reset` → batch; `step` with one slot per env → batch; `configure` swaps the
fixed opponent (for matches that start afterwards) or toggles teacher labels.
A batch has `seat`, `obs` (n × obsDim float32), `mask` (n × numSlots),
`reward` (n × 2, per seat, since the previous batch), `done`, `teacher` (the
heuristic's slot or −1) and `episodes`. Credit `reward[i][s]` to seat s's
latest transition in env i. With `opponent: 'self'` both seats are the
learner.

## Versioning

`ENCODER_VERSION` (`encode.ts`) and `ACTION_SPACE_VERSION` (`actions.ts`) are
pinned by tests together with `OBS_DIM` / `NUM_SLOTS`. Any layout change must
bump the version. Policy files record both, and loading refuses a mismatch,
so old checkpoints stop loading rather than playing nonsense. Retrain after
an encoder change.
