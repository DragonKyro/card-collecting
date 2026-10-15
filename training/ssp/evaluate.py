"""Evaluate Sea Salt & Paper agents against each other.

Runs the seat-swapped TypeScript eval harness (training/dist/ssp-eval.mjs,
built by `npm run train:build`), so every number here comes from the real game
rules, with every seed played from both seats.

Agents are named by reference:
    random                    uniformly random legal moves
    bench:<name>              a policy the game ships (src/games/sea-salt-paper/policies/<name>.json)
    path/to/update_000120.json  an exported policy file
    path/to/run_dir           that run's latest checkpoint
    path/to/run_dir@120       that run's checkpoint at update 120

    python training/ssp/evaluate.py match RUN@200 bench:hard-update1000 --games 2000
    python training/ssp/evaluate.py baselines RUN            # vs random and every benchmark
    python training/ssp/evaluate.py ladder RUN --points 8     # past iterations + benchmarks + Elo
    python training/ssp/evaluate.py freeze RUN@40 --name normal-update40 --note "..."   # pin a policy
    python training/ssp/evaluate.py benchmarks               # list them
    python training/ssp/evaluate.py analyze bench:hard-update1000 --vs bench:easy-update10,bench:normal-update40
                                                             # how they play: decisions tallied per side

Benchmarks are fixed opponents that never change, so scores against them stay
comparable across runs and months — unlike past checkpoints of one run.

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
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
EVAL_SCRIPT = os.path.join(REPO, "training", "dist", "ssp-eval.mjs")
ANALYZE_SCRIPT = os.path.join(REPO, "training", "dist", "ssp-analyze.mjs")
# Eval seeds start far from the training env seeds so agents are scored on
# deals they never trained on.
EVAL_SEED = 900_000
BASELINES = ("random",)
# Elo ratings are pinned to this benchmark (falls back to the field's mean).
ELO_ANCHOR = "bench:easy-update10"
# Benchmarks are the policies the game ships as AI levels (see aiLevels.ts).
BENCH_DIR = os.path.join(REPO, "src", "games", "sea-salt-paper", "policies")
BENCH = "bench:"
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


def list_benchmarks() -> dict[str, str]:
    """Benchmark name → policy file."""
    if not os.path.isdir(BENCH_DIR):
        return {}
    return {f[:-5]: os.path.join(BENCH_DIR, f) for f in sorted(os.listdir(BENCH_DIR)) if f.endswith(".json")}


def resolve(ref: str) -> str:
    """Reference → policy file path (or a baseline name)."""
    if ref in BASELINES:
        return ref
    if ref.startswith(BENCH):
        benches = list_benchmarks()
        name = ref[len(BENCH):]
        if name not in benches:
            raise FileNotFoundError(f"no benchmark {name!r} (have {sorted(benches)})")
        return os.path.abspath(benches[name])
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
    if os.path.dirname(path) == os.path.abspath(BENCH_DIR):
        return BENCH + os.path.basename(path)[:-5]
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

def fit_elo(results: list[tuple[str, str, float, int]], anchor: str | None = ELO_ANCHOR,
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
    played vs random, every benchmark, and the previous checkpoint; plus the
    latest vs each earlier one. Returns results and Elo ratings
    (bench:easy-update10 = 1000 when present)."""
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

    benches = [BENCH + name for name in list_benchmarks()]
    for bench in benches:
        play(bench, "random")
    for a, b in zip(benches, benches[1:]):
        play(a, b)
    for i, ref in enumerate(refs):
        play(ref, "random")
        for bench in benches:
            play(ref, bench)
        if i > 0:
            play(ref, refs[i - 1])
    for ref in refs[:-2]:
        play(refs[-1], ref)
    ratings = fit_elo(results)
    log(f"\nElo ({ELO_ANCHOR} = 1000):" if ELO_ANCHOR in ratings else "\nElo (mean = 1000):")
    for name, rating in sorted(ratings.items(), key=lambda kv: -kv[1]):
        log(f"  {name:<12} {rating:7.0f}")
    return {"results": results, "elo": ratings}


def freeze(ref: str, name: str, note: str = "", games: int = 2000, salt: bool = True,
           workers: int | None = None, force: bool = False, log=print) -> str:
    """Copy a policy into the game's policy folder as <name>.json, recording where
    it came from and how it scored vs random and the other benchmarks when frozen."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name):
        raise ValueError("benchmark names use letters, digits, '.', '_' and '-'")
    src = resolve(ref)
    if src in BASELINES:
        raise ValueError("baselines are built in; freeze a policy file or run checkpoint")
    dest = os.path.join(BENCH_DIR, f"{name}.json")
    if os.path.exists(dest) and not force:
        raise FileExistsError(f"benchmark {name!r} exists (pass --force to replace it)")
    with open(src, encoding="utf-8") as f:
        doc = json.load(f)
    scores = {}
    others = [BENCH + n for n, path in list_benchmarks().items() if os.path.abspath(path) != os.path.abspath(dest)]
    for opp in [*BASELINES, *others]:
        s = evaluate(src, opp, games=games, salt=salt, workers=workers)
        scores[opp] = {"score": s["aScore"], "ci95": s["aScoreCi95"], "matches": s["matches"]}
        log(score_line(f"{name} vs {opp}", s))
    doc.setdefault("meta", {})["benchmark"] = {
        "name": name,
        "source": os.path.relpath(src, REPO).replace(os.sep, "/"),
        "frozen": time.strftime("%Y-%m-%d"),
        "note": note,
        "extraSalt": salt,
        "evalAtFreeze": scores,
    }
    os.makedirs(BENCH_DIR, exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(doc, f)
    log(f"froze {label(ref)} as {BENCH}{name} -> {os.path.relpath(dest, REPO)}")
    return dest


def describe_benchmarks(log=print) -> None:
    benches = list_benchmarks()
    if not benches:
        log(f"no benchmarks yet in {os.path.relpath(BENCH_DIR, REPO)}")
    for name, path in benches.items():
        with open(path, encoding="utf-8") as f:
            info = json.load(f).get("meta", {}).get("benchmark", {})
        at = info.get("evalAtFreeze", {})
        scores = "  ".join(f"vs {opp} {100 * v['score']:.1f}%" for opp, v in at.items())
        log(f"{BENCH}{name:<16} from {info.get('source', '?')} ({info.get('frozen', '?')})  {scores}")
        if info.get("note"):
            log(f"    {info['note']}")


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

    b = sub.add_parser("baselines", parents=[common], help="a policy vs random and every benchmark")
    b.add_argument("policy")

    fr = sub.add_parser("freeze", parents=[common], help="save a policy as a named benchmark")
    fr.add_argument("ref")
    fr.add_argument("--name", required=True)
    fr.add_argument("--note", default="")
    fr.add_argument("--force", action="store_true", help="replace an existing benchmark of that name")

    sub.add_parser("benchmarks", help="list the benchmarks")

    an = sub.add_parser("analyze", parents=[common], help="decision-level comparison of A against each --vs agent")
    an.add_argument("a")
    an.add_argument("--vs", required=True, help="comma-separated agents")
    an.add_argument("--json", default=None)
    an.add_argument("--keep-log", default=None, help="CSV of A's draw-two keep decisions with the features it could see")

    lad = sub.add_parser("ladder", parents=[common], help="a run's checkpoints vs baselines and each other, with Elo")
    lad.add_argument("run")
    lad.add_argument("--points", type=int, default=8, help="checkpoints to sample (incl. the latest)")

    args = p.parse_args(argv)
    salt = not getattr(args, "base_game", False)
    if args.cmd == "match":
        s = evaluate(args.a, args.b, games=args.games, salt=salt, workers=args.workers, seed=args.seed)
        print(s["report"])
    elif args.cmd == "baselines":
        for opp in [*BASELINES, *(BENCH + n for n in list_benchmarks())]:
            s = evaluate(args.policy, opp, games=args.games, salt=salt, workers=args.workers)
            print(score_line(f"{label(args.policy)} vs {label(opp)}", s))
    elif args.cmd == "freeze":
        freeze(args.ref, args.name, note=args.note, games=args.games, salt=salt, workers=args.workers,
               force=args.force)
    elif args.cmd == "benchmarks":
        describe_benchmarks()
    elif args.cmd == "analyze":
        cmd = [shutil.which("node") or "node", ANALYZE_SCRIPT, "--a", agent_spec(args.a),
               "--vs", ",".join(agent_spec(r) for r in args.vs.split(",")), "--games", str(args.games)]
        if salt:
            cmd.append("--salt")
        if args.workers:
            cmd += ["--workers", str(args.workers)]
        if args.json:
            cmd += ["--json", args.json]
        if args.keep_log:
            cmd += ["--keep-log", args.keep_log]
        subprocess.run(cmd, check=True)
    else:
        ladder(args.run, points=args.points, games=args.games, salt=salt, workers=args.workers)


if __name__ == "__main__":
    main()
