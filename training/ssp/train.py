"""PPO trainer for the Sea Salt & Paper agent (2 players, Extra Salt by default).

    conda activate train
    python training/ssp/train.py --run first-try        # Ctrl+C any time: it checkpoints, then exits
    python training/ssp/train.py --run first-try --resume
    tensorboard --logdir training/runs

    # one network for 2-4 players, continuing from runs/ssp/main's update 10000
    python training/ssp/train.py --run multi --players 2,3,4 \\
        --init training/runs/ssp/main/ckpt/update_010000.pt --updates 13000

`--players 2,3,4` deals the env workers out over those tables (each gets the
same share of self-play and past-checkpoint workers, so the same share of
decisions; repeat one to give it more). A `p` suffix makes it an Extra Pepper
table, a `b` one a base-game table (no Extra Salt): `2,2,2p,2p,3,3p,4,4p`.
Every checkpoint is then also evaluated at each kind of table against
(players - 1) copies of each benchmark. `--init` starts a new
run from another run's checkpoint (weights, optimizer, update count) instead
of from scratch, and exports that starting point as the run's first policy.

To stop a run you can't Ctrl+C (e.g. one started in the background), create
an empty file training/runs/ssp/<run>/STOP: it saves, finishes queued evals and
exits after the current update (the file is removed on the next start).

Each update:
  1. Collect `--rollout` decisions from every env — `--workers` node processes
     × `--envs-per-worker` matches. Self-play workers train on both seats; the
     rest play a past checkpoint drawn from the pool (random play until the
     first checkpoint exists).
  2. PPO on every finished transition. Training starts from scratch (or `--init`).
  3. Every `--save-every`: a resumable checkpoint (ckpt/update_N.pt) and an
     exported policy (policies/update_N.json) the TypeScript side can play —
     `evaluate.py` and the opponent pool use these.
  4. Every `--eval-every`: in the background, a seat-swapped eval of the new
     policy vs random, every benchmark (the game's shipped policies, see
     `evaluate.py freeze`), the checkpoint `--eval-past-gap` saves earlier,
     and (with `--eval-same-update RUN`) that run's policy at the same update
     → tensorboard `eval/*` and evals.jsonl. Once a checkpoint's evals are all
     in, the log prints the latest 10 as a table and progress.md is rewritten
     (latest 10, then every checkpoint).

Outputs go to training/runs/ssp/<run>/: config.json, metrics.jsonl, evals.jsonl,
progress.md, tensorboard events, ckpt/, policies/.
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import queue
import random
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from typing import NamedTuple

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.tensorboard import SummaryWriter

import evaluate as ev
from env_client import Batch, SspEnv
from model import (PolicyValueNet, export_policy, load_checkpoint, masked_logits, net_from_checkpoint,
                   save_checkpoint)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
DEFAULT_RUNS = os.path.join(REPO, "training", "runs", "ssp")


def default_workers() -> int:
    """Leave a few cores for the learner and the background eval."""
    return max(1, min(12, (os.cpu_count() or 4) - 4))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    run = p.add_argument_group("run")
    run.add_argument("--run", default=None, help="run name (default: a timestamp)")
    run.add_argument("--runs-dir", default=DEFAULT_RUNS)
    run.add_argument("--resume", action="store_true", help="continue the run from its latest checkpoint")
    run.add_argument("--updates", type=int, default=2000, help="train until this many updates in total")
    run.add_argument("--seed", type=int, default=1)
    run.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    run.add_argument("--no-build", action="store_true", help="skip rebuilding training/dist")
    run.add_argument("--init", default=None, metavar="CKPT",
                     help="start a new run from this checkpoint (.pt) instead of from scratch")

    game = p.add_argument_group("game / envs")
    game.add_argument("--players", default="2",
                      help="comma-separated tables to train on: a size 2-4, plus `p` for Extra Pepper and/or `b` "
                           "for the base game (no Extra Salt), e.g. 2,3,4,2p; workers are split evenly, and "
                           "repeating a table gives it a bigger share (2,2,3,4 = half the workers on 2p)")
    game.add_argument("--base-game", action="store_true", help="train without Extra Salt")
    game.add_argument("--target", type=int, default=40)
    game.add_argument("--workers", type=int, default=default_workers(), help="node env processes")
    game.add_argument("--envs-per-worker", type=int, default=32)
    game.add_argument("--rollout", type=int, default=64, help="decisions per env per update")
    game.add_argument("--self-play", type=float, default=0.5,
                      help="share of workers in self-play; the rest face past checkpoints")
    game.add_argument("--pool", type=int, default=20, help="newest checkpoints past opponents are drawn from")
    game.add_argument("--pool-refresh", type=int, default=10, help="updates between past-opponent re-draws")
    game.add_argument("--round-reward", type=float, default=0.02,
                      help="shaping per round: this × (own − opponent round points); the match result is ±1")

    learn = p.add_argument_group("learning")
    learn.add_argument("--hidden", type=int, default=256)
    learn.add_argument("--layers", type=int, default=2)
    learn.add_argument("--lr", type=float, default=3e-4)
    learn.add_argument("--anneal-lr", action="store_true", help="decay lr linearly to 0 at --updates")
    learn.add_argument("--epochs", type=int, default=4)
    learn.add_argument("--minibatch", type=int, default=4096)
    learn.add_argument("--gamma", type=float, default=0.995)
    learn.add_argument("--lam", type=float, default=0.95)
    learn.add_argument("--clip", type=float, default=0.2)
    learn.add_argument("--ent-coef", type=float, default=0.01)
    learn.add_argument("--vf-coef", type=float, default=0.5)
    learn.add_argument("--max-grad-norm", type=float, default=0.5)

    save = p.add_argument_group("checkpoints / eval")
    save.add_argument("--save-every", type=int, default=100)
    save.add_argument("--keep-ckpt", type=int, default=5, help="resumable .pt files to keep (policies are all kept)")
    save.add_argument("--eval-every", type=int, default=100, help="0 = no background eval (multiple of --save-every)")
    save.add_argument("--eval-games", type=int, default=1000)
    save.add_argument("--eval-workers", type=int, default=4)
    save.add_argument("--eval-past-gap", type=int, default=5, help="compare with the checkpoint this many saves back")
    save.add_argument("--eval-bench", default="all",
                      help="comma-separated benchmark names to eval against ('all' = every benchmark, 'none')")
    save.add_argument("--eval-same-update", default=None, metavar="RUN_DIR",
                      help="also eval against RUN_DIR's policy at the same update (e.g. an earlier run, to compare "
                           "two setups at equal training)")
    args = p.parse_args(argv)
    try:
        tables = [Table.parse(t, salt=not args.base_game) for t in str(args.players).split(",")]
    except ValueError as e:
        p.error(str(e))
    args.table_mix = {t: tables.count(t) for t in sorted(set(tables))}
    args.player_counts = sorted({t.players for t in tables})
    if any(share == 0 for share in worker_shares(args.workers, args.table_mix).values()):
        p.error("need at least one worker per table")
    return args


class Table(NamedTuple):
    """One kind of match the workers play."""
    players: int
    pepper: bool
    salt: bool

    @staticmethod
    def parse(token: str, salt: bool) -> "Table":
        m = re.fullmatch(r"([234])([pb]*)", token.strip())
        if not m:
            raise ValueError(f"bad table {token!r}: a size 2-4, then p (Extra Pepper) and/or b (base game)")
        return Table(int(m.group(1)), "p" in m.group(2), salt and "b" not in m.group(2))

    @property
    def label(self) -> str:
        """e.g. 2p, 3p+pepper, 2p-base — the suffix of this table's eval tags."""
        return f"{self.players}p" + ("+pepper" if self.pepper else "") + ("" if self.salt else "-base")


def worker_shares(n: int, mix: dict) -> dict:
    """Workers per table, in proportion to `mix` (largest remainders get the leftovers)."""
    total = sum(mix.values())
    exact = {size: n * w / total for size, w in mix.items()}
    shares = {size: int(x) for size, x in exact.items()}
    for size in sorted(mix, key=lambda s: exact[s] - shares[s], reverse=True)[: n - sum(shares.values())]:
        shares[size] += 1
    return shares


MAX_SEATS = 4


def multi_tables(a: argparse.Namespace) -> bool:
    return list(a.table_mix) != [Table(2, False, not a.base_game)]


def plain_args(a: argparse.Namespace) -> dict:
    """The arguments as plain data, for config.json and checkpoints."""
    return {**vars(a), "table_mix": {t.label: k for t, k in a.table_mix.items()}}


# ---------------------------------------------------------------- envs

@dataclass
class Worker:
    role: str  # 'self' | 'past'
    env: SspEnv
    opponent: str
    table: Table
    batch: Batch | None = None

    @property
    def tag(self) -> str:
        """Win-rate window key: the role, plus the table unless it's a plain 2-player one."""
        plain = self.table.players == 2 and not self.table.pepper
        return self.role if plain else f"{self.role}{self.table.label}"


def worker_roles(n: int, self_share: float) -> list[str]:
    n_self = min(n, max(0, round(n * self_share)))
    return ["self"] * n_self + ["past"] * (n - n_self)


def worker_layout(n: int, self_share: float, mix: dict) -> list[tuple[str, "Table"]]:
    """(role, table) per worker: each table gets its share of the workers
    (see `worker_shares`), split into self-play and past-opponent workers like
    the whole run."""
    layout = []
    for table, share in sorted(worker_shares(n, mix).items()):
        layout += [(role, table) for role in worker_roles(share, self_share)]
    return layout


def build_typescript() -> None:
    vite = os.path.join(REPO, "node_modules", "vite", "bin", "vite.js")
    node = shutil.which("node")
    if not node or not os.path.isfile(vite):
        raise FileNotFoundError("need node on PATH and `npm install` run in the repo")
    subprocess.run([node, vite, "build", "--config", os.path.join("training", "vite.config.ts")],
                   cwd=REPO, check=True)


# ---------------------------------------------------------------- rollout storage

class Rollout:
    """Transitions for one update, in chronological order. Each env seat is a
    stream: `next[i]` links a transition to that seat's following decision in
    the same match, so rewards and GAE follow the seat that earned them. A
    seat's newest transition is still collecting reward when the rollout ends
    — it is carried into the next update instead of being trained on."""

    def __init__(self, capacity: int, obs_dim: int, num_slots: int):
        self.obs = np.zeros((capacity, obs_dim), np.float32)
        self.mask = np.zeros((capacity, num_slots), bool)
        self.action = np.zeros(capacity, np.int64)
        self.logp = np.zeros(capacity, np.float32)
        self.value = np.zeros(capacity, np.float32)
        self.reward = np.zeros(capacity, np.float32)
        self.done = np.zeros(capacity, bool)
        self.next = np.full(capacity, -1, np.int64)
        self.n = 0

    FIELDS = ("obs", "mask", "action", "logp", "value", "reward", "done")

    def clear(self) -> None:
        self.reward[: self.n] = 0
        self.done[: self.n] = False
        self.next[: self.n] = -1
        self.n = 0

    def add(self, **rows: np.ndarray) -> np.ndarray:
        k = len(rows["obs"])
        at = np.arange(self.n, self.n + k)
        for name, values in rows.items():
            getattr(self, name)[at] = values
        self.n += k
        return at

    def take(self, idx: np.ndarray) -> dict:
        return {name: getattr(self, name)[idx].copy() for name in self.FIELDS}


# ---------------------------------------------------------------- background eval

class Evaluator:
    """Runs evaluate.evaluate() jobs one at a time on a thread (each is a
    node process), so training never waits for an eval."""

    def __init__(self, games: int, workers: int):
        self.games, self.workers = games, workers
        self.jobs: queue.Queue = queue.Queue()
        self.results: queue.Queue = queue.Queue()
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def _loop(self) -> None:
        while True:
            job = self.jobs.get()
            if job is None:
                return
            update, tag, a, b, games, table = job
            try:
                summary = ev.evaluate(a, b, games=games, salt=table.salt, pepper=table.pepper,
                                      workers=self.workers, players=table.players)
                self.results.put((update, tag, b, summary, None))
            except Exception as e:  # noqa: BLE001 — reported, training carries on
                self.results.put((update, tag, b, None, str(e)))

    def submit(self, update: int, policy: str, jobs: list[tuple[str, str, int, "Table"]]) -> bool:
        """Queue one eval cycle of (tag, opponent, games, table) jobs; refuse
        while the previous cycle hasn't fully started."""
        if self.jobs.qsize() > 0:
            return False
        for tag, opponent, games, table in jobs:
            self.jobs.put((update, tag, policy, opponent, games, table))
        return True

    def drain(self) -> list[tuple]:
        out = []
        while True:
            try:
                out.append(self.results.get_nowait())
            except queue.Empty:
                return out

    def close(self, drop_queued: bool) -> None:
        """Wait for the running eval, and for queued ones unless `drop_queued`."""
        while drop_queued:
            try:
                self.jobs.get_nowait()
            except queue.Empty:
                break
        self.jobs.put(None)
        self.thread.join()


# ---------------------------------------------------------------- trainer

@dataclass
class Trainer:
    args: argparse.Namespace
    run_dir: str = ""
    workers: list[Worker] = field(default_factory=list)
    update: int = 0
    decisions: int = 0
    episodes: int = 0

    def setup(self) -> None:
        a = self.args
        name = a.run or time.strftime("%Y%m%d-%H%M%S")
        self.run_dir = os.path.join(a.runs_dir, name)
        if os.path.isdir(os.path.join(self.run_dir, "ckpt")) and not a.resume:
            raise SystemExit(f"{self.run_dir} already has checkpoints — pass --resume or pick another --run")
        os.makedirs(self.run_dir, exist_ok=True)
        if not a.no_build:
            build_typescript()
        random.seed(a.seed)
        np.random.seed(a.seed)
        torch.manual_seed(a.seed)
        if a.device == "cpu":
            torch.set_num_threads(min(4, os.cpu_count() or 1))
        self.device = torch.device(a.device)

        probe = SspEnv()
        self.obs_dim, self.num_slots = probe.obs_dim, probe.num_slots
        self.versions = {"encoderVersion": probe.encoder_version, "actionSpaceVersion": probe.action_space_version}
        probe.close()

        ckpt_dir = os.path.join(self.run_dir, "ckpt")
        ckpts = sorted(f for f in os.listdir(ckpt_dir) if f.endswith(".pt")) if a.resume and os.path.isdir(ckpt_dir) else []
        start = os.path.join(self.run_dir, "ckpt", ckpts[-1]) if ckpts else a.init
        if start:
            ck = load_checkpoint(start, self.device)
            if ck["versions"] != self.versions:
                raise SystemExit(f"checkpoint was trained on {ck['versions']}, this build is {self.versions}"
                                 " (a v2 one can be upgraded with training/ssp/upgrade.py)")
            self.net = net_from_checkpoint(ck, self.device)
            self.opt = torch.optim.Adam(self.net.parameters(), lr=a.lr, eps=1e-5)
            if ck.get("optimizer"):  # (an upgraded checkpoint starts a fresh optimizer)
                self.opt.load_state_dict(ck["optimizer"])
            for g in self.opt.param_groups:
                g["lr"] = a.lr
            self.update, self.decisions, self.episodes = ck["update"], ck["decisions"], ck["episodes"]
            if ckpts:
                print(f"resumed {name} at update {self.update} ({self.decisions:,} decisions)")
            else:
                print(f"started {name} from {start} (update {self.update}, {self.decisions:,} decisions)")
                # The starting point is the run's first policy: past opponents and
                # the `past` eval have it from update one.
                self.save(checkpoint=False)
        else:
            self.net = PolicyValueNet(self.obs_dim, self.num_slots, a.hidden, a.layers).to(self.device)
            self.opt = torch.optim.Adam(self.net.parameters(), lr=a.lr, eps=1e-5)

        with open(os.path.join(self.run_dir, "config.json"), "w", encoding="utf-8") as f:
            json.dump({**plain_args(a), **self.versions, "obsDim": self.obs_dim, "numSlots": self.num_slots,
                       "arch": {"hidden": self.net.hidden, "layers": self.net.layers}}, f, indent=2)

        layout = worker_layout(a.workers, a.self_play, a.table_mix)
        for w, (role, table) in enumerate(layout):
            env = SspEnv()
            seed = a.seed * 10_007 + w * 7_919 + self.update * 104_729
            opponent = "self" if role == "self" else "random"  # past workers get a checkpoint once one exists
            worker = Worker(role, env, opponent, table)
            worker.batch = env.reset(num_envs=a.envs_per_worker, seed=seed, players=table.players,
                                     extra_salt=table.salt, extra_pepper=table.pepper, target_score=a.target,
                                     opponent=opponent, round_reward=a.round_reward)
            self.workers.append(worker)
        self.n_envs = a.workers * a.envs_per_worker
        self.slices = [slice(i * a.envs_per_worker, (i + 1) * a.envs_per_worker) for i in range(a.workers)]
        mix = ", ".join(f"{layout.count(k)} {k[0]} {k[1].label}" for k in dict.fromkeys(layout))
        print(f"run {self.run_dir}\n  {a.workers} workers ({mix})"
              f" x {a.envs_per_worker} envs | obs {self.obs_dim} | slots {self.num_slots} | device {self.device}")

        # Room for the rollout plus the carried-in pending transitions: one per seat per match.
        self.buf = Rollout(self.n_envs * (a.rollout + MAX_SEATS), self.obs_dim, self.num_slots)
        self.last = np.full((self.n_envs, MAX_SEATS), -1, np.int64)
        self.carry: dict | None = None
        self.carry_streams: np.ndarray | None = None
        self.writer = SummaryWriter(os.path.join(self.run_dir, "tb"))
        self.evaluator = Evaluator(a.eval_games, a.eval_workers) if a.eval_every > 0 else None
        available = list(ev.list_benchmarks())
        wanted = available if a.eval_bench == "all" else [] if a.eval_bench == "none" else a.eval_bench.split(",")
        missing = [b for b in wanted if b not in available]
        if missing:
            raise SystemExit(f"unknown benchmark(s) {missing}; have {available}")
        self.benches = wanted
        if self.evaluator and wanted:
            print(f"  evaluating against benchmarks: {', '.join(wanted)}")
        self.win_window: dict[str, collections.deque] = collections.defaultdict(lambda: collections.deque(maxlen=400))
        # Per checkpoint: the eval tags queued and the results in so far (for the progress table).
        self.eval_expected: dict[int, list[str]] = {}
        self.eval_results: dict[int, dict[str, tuple[float, float, float]]] = {}
        self.progress_shown: set[int] = set()
        evals_path = os.path.join(self.run_dir, "evals.jsonl")
        if a.resume and os.path.isfile(evals_path):
            with open(evals_path, encoding="utf-8") as f:
                for line in f:
                    r = json.loads(line)
                    lo, hi = r["aScoreCi95"]
                    self.eval_results.setdefault(r["update"], {})[r["vs"]] = (r["aScore"], lo, hi)
            for u, res in self.eval_results.items():
                self.eval_expected[u] = list(res)
                self.progress_shown.add(u)

    # ------------------------------------------------------------ collection

    def collect(self) -> np.ndarray:
        """Fill the rollout; returns a mask of the transitions that are still
        pending (carried to the next update, not trained on now)."""
        a, buf, last = self.args, self.buf, self.last
        buf.clear()
        last[:] = -1
        if self.carry is not None:
            rows = buf.add(**self.carry)
            last[self.carry_streams[:, 0], self.carry_streams[:, 1]] = rows
        envs = np.arange(self.n_envs)

        for _ in range(a.rollout):
            batches = [w.batch for w in self.workers]
            obs = np.concatenate([b.obs for b in batches])
            mask = np.concatenate([b.mask for b in batches])
            seat = np.concatenate([b.seat for b in batches]).astype(np.int64)
            with torch.no_grad():
                logits, value = self.net(torch.from_numpy(obs).to(self.device))
                logits = masked_logits(logits, torch.from_numpy(mask).to(self.device))
                dist = torch.distributions.Categorical(logits=logits)
                action = dist.sample()
                logp = dist.log_prob(action)
            action_np = action.cpu().numpy()
            rows = buf.add(obs=obs, mask=mask, action=action_np, logp=logp.cpu().numpy(),
                           value=value.cpu().numpy())
            prev = last[envs, seat]
            linked = prev >= 0
            buf.next[prev[linked]] = rows[linked]
            last[envs, seat] = rows

            for w, sl in zip(self.workers, self.slices):
                w.env.send_step(action_np[sl])
            for w in self.workers:
                w.batch = w.env.recv_batch()
            # Per-seat rewards, padded to MAX_SEATS (a worker's table size sets its width).
            reward = np.zeros((self.n_envs, MAX_SEATS), np.float32)
            for w, sl in zip(self.workers, self.slices):
                reward[sl, : w.batch.reward.shape[1]] = w.batch.reward
            done = np.concatenate([w.batch.done for w in self.workers])
            for s in range(MAX_SEATS):
                ok = last[:, s] >= 0
                buf.reward[last[ok, s]] += reward[ok, s]
                buf.done[last[ok & done, s]] = True
            last[done] = -1
            for w in self.workers:
                for ep in w.batch.episodes:
                    self.episodes += 1
                    if w.role != "self" and ep["winnerSeat"] is not None:
                        self.win_window[w.tag].append(float(ep["winnerSeat"] in ep["learnerSeats"]))
            self.decisions += self.n_envs

        pending = np.zeros(buf.n, bool)
        streams = np.argwhere(last >= 0)
        pending[last[streams[:, 0], streams[:, 1]]] = True
        self.carry = buf.take(last[streams[:, 0], streams[:, 1]])
        self.carry_streams = streams
        return pending

    def advantages(self, pending: np.ndarray) -> np.ndarray:
        a, buf = self.args, self.buf
        adv = np.zeros(buf.n, np.float32)
        for i in range(buf.n - 1, -1, -1):
            if pending[i]:
                continue
            if buf.done[i]:
                next_value = next_adv = 0.0
            else:
                j = buf.next[i]
                next_value = buf.value[j]
                next_adv = 0.0 if pending[j] else adv[j]
            delta = buf.reward[i] + a.gamma * next_value - buf.value[i]
            adv[i] = delta + a.gamma * a.lam * next_adv
        return adv

    # ------------------------------------------------------------ learning

    def learn(self, pending: np.ndarray, adv: np.ndarray) -> dict:
        a, buf, dev = self.args, self.buf, self.device
        idx = np.flatnonzero(~pending)
        obs = torch.from_numpy(buf.obs[idx]).to(dev)
        mask = torch.from_numpy(buf.mask[idx]).to(dev)
        action = torch.from_numpy(buf.action[idx]).to(dev)
        old_logp = torch.from_numpy(buf.logp[idx]).to(dev)
        advantage = torch.from_numpy(adv[idx]).to(dev)
        returns = advantage + torch.from_numpy(buf.value[idx]).to(dev)
        # Normalised once over the whole update (a tiny last minibatch has no usable std).
        norm_adv = (advantage - advantage.mean()) / (advantage.std() + 1e-8)
        n = len(idx)
        stats = collections.defaultdict(list)
        for _ in range(a.epochs):
            perm = torch.randperm(n, device=dev)
            for start in range(0, n, a.minibatch):
                b = perm[start:start + a.minibatch]
                logits, value = self.net(obs[b])
                logp_all = F.log_softmax(masked_logits(logits, mask[b]), dim=-1)
                entropy = -(logp_all.exp() * logp_all).sum(-1).mean()
                new_logp = logp_all.gather(1, action[b, None]).squeeze(1)
                log_ratio = new_logp - old_logp[b]
                ratio = log_ratio.exp()
                adv_b = norm_adv[b]
                pi_loss = -torch.min(ratio * adv_b, ratio.clamp(1 - a.clip, 1 + a.clip) * adv_b).mean()
                stats["approx_kl"].append(((ratio - 1) - log_ratio).mean().item())
                stats["clipfrac"].append(((ratio - 1).abs() > a.clip).float().mean().item())
                v_loss = 0.5 * (value - returns[b]).pow(2).mean()
                loss = pi_loss + a.vf_coef * v_loss - a.ent_coef * entropy
                if not torch.isfinite(loss):
                    stats["skipped_steps"].append(1.0)
                    continue
                self.opt.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.net.parameters(), a.max_grad_norm)
                self.opt.step()
                stats["policy_loss"].append(pi_loss.item())
                stats["value_loss"].append(v_loss.item())
                stats["entropy"].append(entropy.item())
        out = {k: float(np.sum(v) if k == "skipped_steps" else np.mean(v)) for k, v in stats.items()}
        ret_np, val_np = returns.cpu().numpy(), buf.value[idx]
        out["explained_variance"] = float(1 - np.var(ret_np - val_np) / (np.var(ret_np) + 1e-8))
        out["transitions"] = n
        return out

    # ------------------------------------------------------------ checkpoints

    def save(self, checkpoint: bool = True) -> str:
        a, u = self.args, self.update
        if checkpoint:
            state = {"update": u, "decisions": self.decisions, "episodes": self.episodes,
                     "versions": self.versions, "args": plain_args(a)}
            ckpt_dir = os.path.join(self.run_dir, "ckpt")
            save_checkpoint(os.path.join(ckpt_dir, f"update_{u:06d}.pt"), self.net, self.opt, state)
            for old in sorted(f for f in os.listdir(ckpt_dir) if f.endswith(".pt"))[:-a.keep_ckpt]:
                os.remove(os.path.join(ckpt_dir, old))
        path = os.path.join(self.run_dir, "policies", f"update_{u:06d}.json")
        export_policy(self.net, path, self.versions["encoderVersion"], self.versions["actionSpaceVersion"],
                      meta={"run": os.path.basename(self.run_dir), "update": u, "decisions": self.decisions,
                            "tables": [t.label for t in a.table_mix]})
        return path

    def eval_jobs(self) -> list[tuple[str, str, int, Table]]:
        """(tag, opponent, games, table) for the checkpoint just saved. The
        plain 2-player set as always; at every other kind of table the run
        plays, vs a table of each benchmark."""
        a = self.args
        plain = Table(2, False, not a.base_game)
        jobs = [("random", "random", min(200, a.eval_games), plain)]
        jobs += [(f"bench_{name}", ev.BENCH + name, a.eval_games, plain) for name in self.benches]
        if a.eval_same_update:
            same = os.path.join(a.eval_same_update, "policies", f"update_{self.update:06d}.json")
            if os.path.isfile(same):
                jobs.append(("same", same, a.eval_games, plain))
        past = ev.list_policies(self.run_dir)
        if len(past) > a.eval_past_gap:
            jobs.append(("past", past[-1 - a.eval_past_gap][1], a.eval_games, plain))
        for table in (t for t in a.table_mix if t != plain):
            jobs += [(f"bench_{name}_{table.label}", ev.BENCH + name, a.eval_games, table) for name in self.benches]
        return jobs

    def refresh_past_opponents(self) -> None:
        pool = [p for _, p in ev.list_policies(self.run_dir)][-self.args.pool:]
        if not pool:
            return
        for w in self.workers:
            if w.role == "past":
                w.opponent = "nn-sample:" + os.path.abspath(random.choice(pool))
                w.env.configure(opponent=w.opponent)

    # ------------------------------------------------------------ logging

    def log_update(self, stats: dict, seconds: float) -> None:
        u, w = self.update, self.writer
        rate = self.args.rollout * self.n_envs / max(seconds, 1e-9)
        for k, v in stats.items():
            w.add_scalar(f"learn/{k}", v, u)
        w.add_scalar("perf/decisions_per_sec", rate, u)
        w.add_scalar("progress/decisions", self.decisions, u)
        w.add_scalar("progress/episodes", self.episodes, u)
        line = {"update": u, "decisions": self.decisions, "episodes": self.episodes, "seconds": seconds, **stats}
        for role, window in self.win_window.items():
            if window:
                w.add_scalar(f"train/winrate_vs_{role}", float(np.mean(window)), u)
                line[f"train_winrate_vs_{role}"] = float(np.mean(window))
        with open(os.path.join(self.run_dir, "metrics.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(line) + "\n")
        wins = " ".join(f"vs {r} {100 * np.mean(d):.0f}%" for r, d in self.win_window.items() if d)
        head = f"pi {stats['policy_loss']:+.3f} kl {stats['approx_kl']:.4f} clip {stats['clipfrac']:.2f}"
        print(f"u {u:5d} | {self.decisions / 1e6:6.2f}M dec | {rate / 1e3:5.1f}k/s | {head} "
              f"v {stats['value_loss']:.3f} ent {stats['entropy']:.2f} ev {stats['explained_variance']:+.2f} | {wins}",
              flush=True)

    def log_evals(self) -> None:
        if not self.evaluator:
            return
        for update, tag, opponent, s, err in self.evaluator.drain():
            if err:
                print(f"  eval u{update} vs {tag} failed: {err}")
                continue
            w = self.writer
            lo, hi = s["aScoreCi95"]
            w.add_scalar(f"eval/score_vs_{tag}", s["aScore"], update)
            w.add_scalar(f"eval/score_vs_{tag}_ci_low", lo, update)
            if tag.startswith("bench_"):
                # How it plays against a fixed opponent: margin and round-ending habits.
                w.add_scalar(f"eval_play/score_margin_vs_{tag}", s["a"]["avgScore"] - s["b"]["avgScore"], update)
                w.add_scalar(f"eval_play/stop_per_match_vs_{tag}", s["a"]["stopsPerMatch"], update)
                w.add_scalar(f"eval_play/lastchance_per_match_vs_{tag}", s["a"]["lastChancesPerMatch"], update)
                if s["a"]["lastChanceWinRate"] is not None:
                    w.add_scalar(f"eval_play/lastchance_won_vs_{tag}", s["a"]["lastChanceWinRate"], update)
            with open(os.path.join(self.run_dir, "evals.jsonl"), "a", encoding="utf-8") as f:
                f.write(json.dumps({"update": update, "vs": tag, "opponent": opponent,
                                    **{k: v for k, v in s.items() if k != "report"}}) + "\n")
            print(f"  eval u{update} vs {tag}: {100 * s['aScore']:.1f}% "
                  f"[{100 * lo:.1f}-{100 * hi:.1f}] over {s['matches']} matches", flush=True)
            self.eval_results.setdefault(update, {})[tag] = (s["aScore"], lo, hi)
        complete = [u for u, tags in self.eval_expected.items()
                    if u not in self.progress_shown and all(t in self.eval_results.get(u, {}) for t in tags)]
        if complete:
            self.progress_shown.update(complete)
            print(self.progress_table(last=10), flush=True)
            self.write_progress()

    # ------------------------------------------------------------ progress table

    def eval_columns(self) -> list[tuple[str, str]]:
        """(tag, header) for every eval tag seen, benchmarks first."""
        a = self.args
        tags = {t for res in self.eval_results.values() for t in res}
        multi = len(a.table_mix) > 1

        def bench_header(tag: str) -> str:
            m = re.fullmatch(r"bench_(.+)_([234])p(\+pepper)?(-base)?", tag)
            if not m:
                return f"{'2p ' if multi else ''}vs {tag[len('bench_'):]}"
            name, n = m.group(1), int(m.group(2))
            kind = f"{n}p" + (" Pepper" if m.group(3) else "") + (" base" if m.group(4) else "")
            return f"{kind} vs {name}" if n == 2 else f"{kind} vs {n - 1}x {name} (even {100 / n:.0f}%)"

        cols = [(t, bench_header(t)) for t in sorted(tags) if t.startswith("bench_")]
        if "same" in tags:
            cols.append(("same", f"vs {os.path.basename(os.path.normpath(a.eval_same_update or 'other run'))} @ same update"))
        if "past" in tags:
            cols.append(("past", f"vs {a.eval_past_gap * a.save_every} updates earlier"))
        if "random" in tags:
            cols.append(("random", "vs random"))
        return cols

    def progress_table(self, last: int | None = None) -> str:
        """Markdown table of the evaluated checkpoints (the newest `last` of them).
        Each cell is this checkpoint's score (wins + half draws) with its 95% CI."""
        done = sorted(u for u in self.eval_results if u in self.progress_shown)
        rows = done[-last:] if last else done
        cols = self.eval_columns()
        lines = ["| update | " + " | ".join(h for _, h in cols) + " |",
                 "|---:|" + "---:|" * len(cols)]
        for u in rows:
            cells = []
            for tag, _ in cols:
                r = self.eval_results[u].get(tag)
                if r is None:
                    cells.append("")
                elif tag == "random":
                    cells.append(f"{100 * r[0]:.1f}%")
                else:
                    cells.append(f"{100 * r[0]:.1f}% ({100 * r[1]:.1f}-{100 * r[2]:.1f})")
            lines.append(f"| {u} | " + " | ".join(cells) + " |")
        head = cols[0][0] if cols else None
        if head and done:
            best = max(done, key=lambda u: self.eval_results[u].get(head, (-1, 0, 0))[0])
            lines.append(f"\nbest {cols[0][1]} so far: update {best} at {100 * self.eval_results[best][head][0]:.1f}%")
        return "\n".join(lines)

    def write_progress(self) -> None:
        a = self.args
        v = self.versions
        doc = [f"# {os.path.basename(self.run_dir)} progress",
               "",
               f"Encoder v{v['encoderVersion']} ({self.obs_dim} features), action space v{v['actionSpaceVersion']} "
               f"({self.num_slots} slots), {self.net.hidden}x{self.net.layers} MLP. Seat-swapped evals, {a.eval_games} matches "
               f"each ({min(200, a.eval_games)} vs random); score = wins + half draws, 95% CI in brackets. "
               + (f"Trained on {', '.join(f'{t.label} x{k}' for t, k in a.table_mix.items())}"
                  + (f" from {a.init}" if a.init else "") + "; an Np column seats this checkpoint at a table of "
                  "N - 1 copies of the benchmark, in every seat — an even match there is 1/N. "
                  if multi_tables(a) or a.init else "")
               + f"Updated {time.strftime('%Y-%m-%d %H:%M')}, update {self.update}.",
               "",
               "## Latest 10 checkpoints",
               "",
               self.progress_table(last=10),
               "",
               "## Every checkpoint",
               "",
               self.progress_table()]
        path = os.path.join(self.run_dir, "progress.md")
        with open(path + ".tmp", "w", encoding="utf-8") as f:
            f.write("\n".join(doc) + "\n")
        os.replace(path + ".tmp", path)

    # ------------------------------------------------------------ main loop

    def train(self) -> None:
        a = self.args
        stop_file = os.path.join(self.run_dir, "STOP")
        if os.path.exists(stop_file):
            os.remove(stop_file)
        self.refresh_past_opponents()
        try:
            while self.update < a.updates:
                if os.path.exists(stop_file):
                    print(f"STOP file found - saving update {self.update} and exiting", flush=True)
                    if self.update % a.save_every:
                        self.save()
                    break
                if a.anneal_lr:
                    for g in self.opt.param_groups:
                        g["lr"] = a.lr * (1 - self.update / a.updates)
                t0 = time.perf_counter()
                pending = self.collect()
                t1 = time.perf_counter()
                stats = self.learn(pending, self.advantages(pending))
                t2 = time.perf_counter()
                self.update += 1
                stats["collect_seconds"], stats["learn_seconds"] = t1 - t0, t2 - t1
                self.log_update(stats, t2 - t0)
                if self.update % a.save_every == 0 or self.update == a.updates:
                    policy = self.save()
                    if self.evaluator and self.update % a.eval_every == 0:
                        jobs = self.eval_jobs()
                        if self.evaluator.submit(self.update, policy, jobs):
                            self.eval_expected[self.update] = [job[0] for job in jobs]
                        else:
                            print("  (eval skipped - previous evals still running)")
                if self.update % a.pool_refresh == 0 or self.update == a.save_every:
                    self.refresh_past_opponents()  # (also right after the first checkpoint lands)
                self.log_evals()
        except KeyboardInterrupt:
            print(f"\ninterrupted - saving update {self.update}")
            self.save()
            self.close(finish_evals=False)
            return
        except BaseException:
            self.close(finish_evals=False)
            raise
        self.close(finish_evals=True)

    def close(self, finish_evals: bool) -> None:
        for w in self.workers:
            w.env.close()
        if self.evaluator:
            print("finishing queued evals..." if finish_evals else "finishing the running eval...", flush=True)
            self.evaluator.close(drop_queued=not finish_evals)
            self.log_evals()
        self.writer.close()


def main(argv: list[str] | None = None) -> str:
    trainer = Trainer(parse_args(argv))
    trainer.setup()
    trainer.train()
    return trainer.run_dir


if __name__ == "__main__":
    main()
