"""Evaluate Sea Salt & Paper agents against each other.

Runs the seat-swapped TypeScript eval harness (training/dist/ssp-eval.mjs,
built by `npm run train:build`), so every number here comes from the real game
rules, with every seed played from both seats.

Agents are named by reference:
    random | heuristic        built-in baselines
    path/to/update_000120.json  an exported policy file
    path/to/run_dir           that run's latest checkpoint
    path/to/run_dir@120       that run's checkpoint at update 120

    python training/ssp/evaluate.py match RUN@200 heuristic --games 2000
    python training/ssp/evaluate.py baselines RUN            # latest vs random + heuristic
    python training/ssp/evaluate.py ladder RUN --points 8     # past iterations + Elo

Reading results: `score` is wins (+½ draws) per match with a 95% Wilson
interval. A policy is better than an opponent when the interval's LOWER end is
above 50%. At 2000 matches the interval is about ±2 points.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
EVAL_SCRIPT = os.path.join(REPO, "training", "dist", "ssp-eval.mjs")
# Eval seeds start far from the training env seeds so agents are scored on
# deals they never trained on.
EVAL_SEED = 900_000
BASELINES = ("random", "heuristic")
_UPDATE_RE = re.compile(r"update_(\d+)\.json$")


# ---------------------------------------------------------------- references

def list_policies(run_dir: str) -> list[tuple[int, str]]:
    """(update, path) for every exported policy in a run, oldest first."""
    pdir = os.path.join(run_dir, "policies")
    if not os.path.isdir(pdir):
        return []
    out = []
    for name in os.listdir(pdir):
        m = _UPDATE_RE.search(name)
        if m:
            out.append((int(m.group(1)), os.path.join(pdir, name)))
    return sorted(out)


def resolve(ref: str) -> str:
    """Reference → policy file path (or a baseline name)."""
    if ref in BASELINES:
        return ref
    if ref.endswith(".json"):
        if not os.path.isfile(ref):
            raise FileNotFoundError(ref)
        return os.path.abspath(ref)
    run, _, at = ref.rpartition("@") if "@" in os.path.basename(ref) else (ref, "", "")
    policies = list_policies(run)
    if not policies:
        raise FileNotFoundError(f"no policies under {run}/policies")
    if not at:
        return os.path.abspath(policies[-1][1])
    want = int(at)
    for update, path in policies:
        if update == want:
            return os.path.abspath(path)
    raise FileNotFoundError(f"{run} has no policy for update {want} (have {[u for u, _ in policies]})")


def agent_spec(ref: str, sample: bool = False) -> str:
    """Reference → agent spec for the TypeScript side."""
    path = resolve(ref)
    if path in BASELINES:
        return path
    return f"{'nn-sample' if sample else 'nn'}:{path}"


def label(ref: str) -> str:
    path = resolve(ref)
    if path in BASELINES:
        return path
    m = _UPDATE_RE.search(path)
    return f"u{int(m.group(1))}" if m else os.path.basename(path)


# ---------------------------------------------------------------- evaluation

def evaluate(a: str, b: str, games: int = 1000, salt: bool = True, pepper: bool = False,
             target: int = 40, seed: int = EVAL_SEED, workers: int | None = None,
             node: str | None = None) -> dict:
    """Seat-swapped head-to-head: A vs B over `games` matches (rounded up to
    even). Returns the harness summary — `aScore`, `aScoreCi95`, per-side stats
    (`a`, `b`), `seat0WinRate`, … — plus `report` (the printable table)."""
    if not os.path.isfile(EVAL_SCRIPT):
        raise FileNotFoundError(f"{EVAL_SCRIPT} missing -- run `npm run train:build`")
    node = node or shutil.which("node")
    if not node:
        raise FileNotFoundError("node executable not found on PATH")
    fd, out_path = tempfile.mkstemp(suffix=".json", prefix="ssp-eval-")
    os.close(fd)
    try:
        cmd = [node, EVAL_SCRIPT, "--a", agent_spec(a), "--b", agent_spec(b),
               "--games", str(games), "--seed", str(seed), "--target", str(target), "--json", out_path]
        if salt:
            cmd.append("--salt")
        if pepper:
            cmd.append("--pepper")
        if workers:
            cmd += ["--workers", str(workers)]
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        if proc.returncode != 0:
            raise RuntimeError(f"eval failed ({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}")
        with open(out_path, encoding="utf-8") as f:
            summary = json.load(f)["summary"]
    finally:
        os.remove(out_path)
    summary["report"] = proc.stdout.strip()
    return summary


def score_line(name: str, s: dict) -> str:
    lo, hi = s["aScoreCi95"]
    return f"{name:<32} {100 * s['aScore']:5.1f}%  [{100 * lo:4.1f}-{100 * hi:4.1f}]  n={s['matches']}"


# ---------------------------------------------------------------- ratings

def fit_elo(results: list[tuple[str, str, float, int]], anchor: str = "heuristic",
            anchor_rating: float = 1000.0, iters: int = 3000) -> dict[str, float]:
    """Bradley–Terry ratings on the Elo scale from (a, b, a_score, matches)
    results, with `anchor` pinned. Each pairing gets one pseudo-draw so a
    clean sweep doesn't send a rating to infinity."""
    names = sorted({n for r in results for n in r[:2]})
    idx = {n: i for i, n in enumerate(names)}
    r = np.zeros(len(names))
    k = math.log(10) / 400
    played = np.zeros(len(names))
    for a, b, _, n in results:
        played[idx[a]] += n + 1.0
        played[idx[b]] += n + 1.0
    for _ in range(iters):
        grad = np.zeros(len(names))
        for a, b, score, n in results:
            p = 1.0 / (1.0 + math.exp(-k * (r[idx[a]] - r[idx[b]])))
            g = (score * n + 0.5) - (n + 1.0) * p
            grad[idx[a]] += g
            grad[idx[b]] -= g
        # Damped Newton step: the log-likelihood's curvature is ≈ k²·games/4.
        step = (2.0 / k) * grad / played
        r += step
        r -= (r[idx[anchor]] if anchor in idx else r.mean()) - anchor_rating
        if np.abs(step).max() < 1e-3:
            break
    return {n: float(r[i]) for n, i in idx.items()}


def ladder(run_dir: str, points: int = 8, games: int = 1000, salt: bool = True,
           workers: int | None = None, log=print) -> dict:
    """Evenly spaced checkpoints from a run (always incl. the latest), each
    played vs the heuristic, vs random, and vs the previous checkpoint; plus
    the latest vs each earlier one. Returns results and Elo ratings."""
    policies = list_policies(run_dir)
    if not policies:
        raise FileNotFoundError(f"no policies under {run_dir}/policies")
    pick = sorted({policies[round(i * (len(policies) - 1) / max(1, points - 1))] for i in range(points)})
    refs = [path for _, path in pick]
    results: list[tuple[str, str, float, int]] = []

    def play(a: str, b: str) -> dict:
        s = evaluate(a, b, games=games, salt=salt, workers=workers)
        results.append((label(a), label(b), s["aScore"], s["matches"]))
        log(score_line(f"{label(a)} vs {label(b)}", s))
        return s

    play("heuristic", "random")
    for i, ref in enumerate(refs):
        play(ref, "heuristic")
        play(ref, "random")
        if i > 0:
            play(ref, refs[i - 1])
    for ref in refs[:-2]:
        play(refs[-1], ref)
    ratings = fit_elo(results)
    log("\nElo (heuristic = 1000):")
    for name, rating in sorted(ratings.items(), key=lambda kv: -kv[1]):
        log(f"  {name:<12} {rating:7.0f}")
    return {"results": results, "elo": ratings}


# ---------------------------------------------------------------- CLI

def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--games", type=int, default=2000)
    common.add_argument("--base-game", action="store_true", help="without Extra Salt (default: Salt on)")
    common.add_argument("--workers", type=int, default=None)

    m = sub.add_parser("match", parents=[common], help="A vs B")
    m.add_argument("a")
    m.add_argument("b")
    m.add_argument("--seed", type=int, default=EVAL_SEED)

    b = sub.add_parser("baselines", parents=[common], help="a policy vs random and vs the heuristic")
    b.add_argument("policy")

    lad = sub.add_parser("ladder", parents=[common], help="a run's checkpoints vs baselines and each other, with Elo")
    lad.add_argument("run")
    lad.add_argument("--points", type=int, default=8, help="checkpoints to sample (incl. the latest)")

    args = p.parse_args(argv)
    salt = not args.base_game
    if args.cmd == "match":
        s = evaluate(args.a, args.b, games=args.games, salt=salt, workers=args.workers, seed=args.seed)
        print(s["report"])
    elif args.cmd == "baselines":
        for opp in BASELINES:
            s = evaluate(args.policy, opp, games=args.games, salt=salt, workers=args.workers)
            print(score_line(f"{label(args.policy)} vs {opp}", s))
    else:
        ladder(args.run, points=args.points, games=args.games, salt=salt, workers=args.workers)


if __name__ == "__main__":
    main()
