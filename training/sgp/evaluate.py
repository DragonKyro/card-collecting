"""Evaluate Sushi Go! Party agents against each other.

Runs the seat-swapped TypeScript eval harness (training/sgp/dist/sgp-eval.mjs,
built by `npm run sgp:build`), so every number here comes from the real game
rules, with every seed — its deal AND its random menu — played from both seats.

Agents are named by reference:
    random                    uniformly random legal moves
    heuristic                 the game's hand-written AI (src/games/sushi-go/ai.ts)
    path/to/update_000120.json  an exported policy file
    path/to/run_dir           that run's latest checkpoint
    path/to/run_dir@120       that run's checkpoint at update 120

    python training/sgp/evaluate.py match RUN@2000 heuristic --games 2000
    python training/sgp/evaluate.py baselines RUN             # vs random and the heuristic
    python training/sgp/evaluate.py progress RUN --vs heuristic --every 1000

Reading results: `score` is wins (+½ draws) per match with a 95% Wilson
interval. A policy is better than an opponent when the interval's LOWER end is
above 50%. At 2000 matches the interval is about ±2 points.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
EVAL_SCRIPT = os.path.join(HERE, "dist", "sgp-eval.mjs")
# Eval seeds start far from the training env seeds so agents are scored on
# deals (and menus) they never trained on.
EVAL_SEED = 900_000
BASELINES = ("random", "heuristic")
_UPDATE_RE = re.compile(r"update_(\d+)\.json$")


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


def evaluate(a: str, b: str, games: int = 1000, seed: int = EVAL_SEED, workers: int | None = None,
             node: str | None = None) -> dict:
    """Seat-swapped head-to-head: A vs B over `games` matches (rounded up to
    even). Returns the harness summary — `aScore`, `aScoreCi95`, `aMargin`,
    per-side stats (`a`, `b`), … — plus `report` (the printable table)."""
    if not os.path.isfile(EVAL_SCRIPT):
        raise FileNotFoundError(f"{EVAL_SCRIPT} missing -- run `npm run sgp:build`")
    node = node or shutil.which("node")
    if not node:
        raise FileNotFoundError("node executable not found on PATH")
    fd, out_path = tempfile.mkstemp(suffix=".json", prefix="sgp-eval-")
    os.close(fd)
    try:
        cmd = [node, EVAL_SCRIPT, "--a", agent_spec(a), "--b", agent_spec(b),
               "--games", str(games), "--seed", str(seed), "--json", out_path]
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
    return (f"{name:<32} {100 * s['aScore']:5.1f}%  [{100 * lo:4.1f}-{100 * hi:4.1f}]  "
            f"margin {s['aMargin']:+5.1f}  n={s['matches']}")


def progress(run_dir: str, vs: str, every: int = 1000, games: int = 2000, workers: int | None = None,
             out: str | None = None, log=print) -> str:
    """Score a run's checkpoints every `every` updates (plus its latest) against
    one fixed opponent. Returns, and optionally writes, a markdown table."""
    policies = dict(list_policies(run_dir))
    if not policies:
        raise FileNotFoundError(f"no policies under {run_dir}/policies")
    picks = sorted({u for u in policies if u % every == 0} | {max(policies)})
    lines = [
        f"Checkpoints of `{os.path.basename(os.path.normpath(run_dir))}` vs `{label(vs)}` "
        f"({games} seat-swapped matches each, random menus)",
        "",
        "| Update | Score | 95% CI | Avg final score | Margin |",
        "|---:|---:|---|---|---:|",
    ]
    for u in picks:
        s = evaluate(policies[u], vs, games=games, workers=workers)
        lo, hi = s["aScoreCi95"]
        lines.append(f"| {u} | {100 * s['aScore']:.1f}% | {100 * lo:.1f}–{100 * hi:.1f}% "
                     f"| {s['a']['avgScore']:.1f} – {s['b']['avgScore']:.1f} | {s['aMargin']:+.1f} |")
        log(score_line(f"u{u} vs {label(vs)}", s))
    table = "\n".join(lines) + "\n"
    if out:
        with open(out, "w", encoding="utf-8") as f:
            f.write(table)
        log(f"wrote {out}")
    return table


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--games", type=int, default=2000)
    common.add_argument("--workers", type=int, default=None)

    m = sub.add_parser("match", parents=[common], help="A vs B")
    m.add_argument("a")
    m.add_argument("b")
    m.add_argument("--seed", type=int, default=EVAL_SEED)

    b = sub.add_parser("baselines", parents=[common], help="a policy vs random and the heuristic")
    b.add_argument("policy")

    pr = sub.add_parser("progress", parents=[common], help="a run's checkpoints over time vs one opponent")
    pr.add_argument("run")
    pr.add_argument("--vs", required=True)
    pr.add_argument("--every", type=int, default=1000)
    pr.add_argument("--out", default=None, help="write the markdown table here")

    args = p.parse_args(argv)
    if args.cmd == "match":
        s = evaluate(args.a, args.b, games=args.games, workers=args.workers, seed=args.seed)
        print(s["report"])
    elif args.cmd == "baselines":
        for opp in BASELINES:
            s = evaluate(args.policy, opp, games=args.games, workers=args.workers)
            print(score_line(f"{label(args.policy)} vs {opp}", s))
    else:
        print(progress(args.run, args.vs, every=args.every, games=args.games, workers=args.workers, out=args.out))


if __name__ == "__main__":
    main()
