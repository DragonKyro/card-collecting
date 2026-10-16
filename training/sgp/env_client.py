"""Python side of the Sushi Go! Party training bridge.

Spawns `node training/sgp/dist/sgp-env.mjs` (build it with `npm run sgp:build`)
and drives the vectorized env over stdin/stdout. The game rules, the
hidden-information boundary and the feature encoder all live in TypeScript;
this side only ever sees encoded observations, legal masks and rewards.

    with SushiGoEnv() as env:
        batch = env.reset(num_envs=32, opponent="self")
        while training:
            actions = policy(batch.obs, batch.mask)      # one slot per row
            batch = env.step(actions)

For many env processes in parallel, split each step into `send_step` (all
workers) then `recv_batch` (all workers).

Run this file directly for a random-agent smoke test of the bridge:

    python training/sgp/env_client.py --episodes 200 --envs 32
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import time
from dataclasses import dataclass

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SCRIPT = os.path.join(HERE, "dist", "sgp-env.mjs")


@dataclass
class Batch:
    seat: np.ndarray  # (n,) int8 -- seat whose decision row i is
    obs: np.ndarray  # (n, obs_dim) float32
    mask: np.ndarray  # (n, num_slots) bool -- True = legal
    reward: np.ndarray  # (n, 2) float32 -- per-seat reward since the previous batch
    done: np.ndarray  # (n,) bool -- an episode ended; obs is already the next episode's first decision
    episodes: list  # summaries of the episodes that ended


class SushiGoEnv:
    def __init__(self, script: str = DEFAULT_SCRIPT, node: str | None = None):
        if not os.path.exists(script):
            raise FileNotFoundError(f"{script} not found -- run `npm run sgp:build` first")
        node = node or shutil.which("node")
        if not node:
            raise FileNotFoundError("node executable not found on PATH")
        self._proc = subprocess.Popen(
            [node, script],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        spec = self._call({"cmd": "spec"})
        self.obs_dim: int = spec["obsDim"]
        self.num_slots: int = spec["numSlots"]
        self.slot_names: list[str] = spec["slotNames"]
        self.feature_layout: list[dict] = spec["featureLayout"]
        self.encoder_version: int = spec["encoderVersion"]
        self.action_space_version: int = spec["actionSpaceVersion"]

    def _send(self, msg: dict) -> None:
        assert self._proc.stdin
        self._proc.stdin.write(json.dumps(msg) + "\n")
        self._proc.stdin.flush()

    def _recv(self) -> dict:
        assert self._proc.stdout
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError(f"env server exited (code {self._proc.poll()})")
        reply = json.loads(line)
        if not reply.get("ok"):
            raise RuntimeError(f"env server: {reply.get('error')}")
        return reply

    def _call(self, msg: dict) -> dict:
        self._send(msg)
        return self._recv()

    def _batch(self, r: dict) -> Batch:
        n = r["n"]
        return Batch(
            seat=np.asarray(r["seat"], dtype=np.int8),
            obs=np.frombuffer(base64.b64decode(r["obs"]), dtype="<f4").reshape(n, self.obs_dim),
            mask=np.frombuffer(base64.b64decode(r["mask"]), dtype=np.uint8).reshape(n, self.num_slots).astype(bool),
            reward=np.asarray(r["reward"], dtype=np.float32).reshape(n, 2),
            done=np.asarray(r["done"], dtype=bool),
            episodes=r["episodes"],
        )

    def reset(
        self,
        num_envs: int = 16,
        seed: int = 1,
        opponent: str = "random",
        learner_seat: str | int = "alternate",
        round_reward: float = 0.0,
        max_steps: int = 5_000,
        menu: str | list[str] = "random",
    ) -> Batch:
        """opponent: 'self' (both seats are the learner), 'random', 'heuristic',
        'nn:<policy.json>' or 'nn-sample:<policy.json>'. menu: 'random' (a new
        random legal menu every match) or a fixed list of 8 card kinds."""
        options = {
            "numEnvs": num_envs,
            "seed": seed,
            "opponent": opponent,
            "learnerSeat": learner_seat,
            "roundReward": round_reward,
            "maxSteps": max_steps,
            "menu": menu,
        }
        return self._batch(self._call({"cmd": "reset", "options": options}))

    def step(self, actions) -> Batch:
        self.send_step(actions)
        return self.recv_batch()

    def send_step(self, actions) -> None:
        self._send({"cmd": "step", "actions": [int(a) for a in actions]})

    def recv_batch(self) -> Batch:
        return self._batch(self._recv())

    def configure(self, opponent: str) -> None:
        """New fixed opponent for matches that start from now on."""
        self._call({"cmd": "configure", "options": {"opponent": opponent}})

    def policy_logits(self, policy_path: str, obs: np.ndarray) -> np.ndarray:
        """Logits from the TypeScript forward pass of an exported policy (parity checks)."""
        payload = base64.b64encode(np.ascontiguousarray(obs, dtype="<f4").tobytes()).decode()
        reply = self._call({"cmd": "policyLogits", "path": os.path.abspath(policy_path), "obs": payload})
        return np.asarray(reply["logits"], dtype=np.float32)

    def close(self) -> None:
        if self._proc.poll() is None:
            try:
                assert self._proc.stdin
                self._proc.stdin.write(json.dumps({"cmd": "close"}) + "\n")
                self._proc.stdin.flush()
                self._proc.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                self._proc.kill()

    def __enter__(self) -> "SushiGoEnv":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


def _smoke(args: argparse.Namespace) -> None:
    rng = np.random.default_rng(args.seed)
    with SushiGoEnv() as env:
        print(f"obs_dim={env.obs_dim} num_slots={env.num_slots} "
              f"encoder v{env.encoder_version} action space v{env.action_space_version}")
        batch = env.reset(num_envs=args.envs, seed=args.seed, opponent=args.opponent)
        episodes: list = []
        decisions = 0
        reward_total = np.zeros(2)
        t0 = time.perf_counter()
        while len(episodes) < args.episodes:
            assert np.isfinite(batch.obs).all(), "non-finite features"
            assert batch.mask.any(axis=1).all(), "a decision row has no legal slot"
            actions = [rng.choice(np.flatnonzero(m)) for m in batch.mask]
            batch = env.step(actions)
            decisions += len(actions)
            reward_total += batch.reward.sum(axis=0)
            episodes.extend(batch.episodes)
        dt = time.perf_counter() - t0

    learner_wins = sum(1 for e in episodes if e["winnerSeat"] in e["learnerSeats"])
    print(f"{len(episodes)} episodes vs {args.opponent}, {decisions} learner decisions in {dt:.1f}s "
          f"({decisions / dt:,.0f} decisions/s)")
    print(f"random learner won {learner_wins}/{len(episodes)}; "
          f"truncated {sum(e['truncated'] for e in episodes)}; "
          f"mean actions/episode {np.mean([e['steps'] for e in episodes]):.0f}")
    if args.opponent == "self":
        print(f"self-play rewards per seat {reward_total.round(3).tolist()} "
              f"(zero-sum check: total {reward_total.sum():.3f})")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Random-agent smoke test for the Sushi Go env bridge.")
    p.add_argument("--envs", type=int, default=32)
    p.add_argument("--episodes", type=int, default=200)
    p.add_argument("--opponent", default="random")
    p.add_argument("--seed", type=int, default=1)
    _smoke(p.parse_args())
