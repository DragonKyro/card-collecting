"""Evaluate Sushi Go! Party agents against each other.

Runs the seat-swapped TypeScript eval harness (training/sgp/dist/sgp-eval.mjs,
built by `npm run sgp:build`), so every number here comes from the real game
rules, with every seed — its deal AND its random menu — played from both seats.

Agents are named by reference:
    random                    uniformly random legal moves
    bench:<name>              a policy the game ships (src/games/sushi-go/policies/<name>.json)
    path/to/update_000120.json  an exported policy file
    path/to/run_dir           that run's latest checkpoint
    path/to/run_dir@120       that run's checkpoint at update 120

    python training/sgp/evaluate.py match RUN@2000 bench:hard-update10000 --games 2000
    python training/sgp/evaluate.py baselines RUN             # vs random and every benchmark
    python training/sgp/evaluate.py progress RUN --vs bench:hard-update10000 --every 1000
    python training/sgp/evaluate.py freeze RUN@1000 --name normal-update1000 --note "..."   # pin a policy
    python training/sgp/evaluate.py benchmarks               # list them

Benchmarks are the policies the game ships as AI levels (aiLevels.ts): fixed
opponents that never change, so scores against them stay comparable across
runs. `freeze` copies a policy into the game's policy folder and records where
it came from and how it scored vs the baselines and the other benchmarks.

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
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
EVAL_SCRIPT = os.path.join(HERE, "dist", "sgp-eval.mjs")
# Eval seeds start far from the training env seeds so agents are scored on
# deals (and menus) they never trained on.
EVAL_SEED = 900_000
BASELINES = ("random",)
# Benchmarks are the policies the game ships as AI levels (see aiLevels.ts).
BENCH_DIR = os.path.join(REPO, "src", "games", "sushi-go", "policies")
BENCH = "bench:"
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


def freeze(ref: str, name: str, note: str = "", games: int = 2000, workers: int | None = None,
           force: bool = False, log=print) -> str:
    """Copy a policy into the game's policy folder as <name>.json, recording where
    it came from and how it scored vs the baselines and the other benchmarks when frozen."""
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
    others = [BENCH + n for n, p in list_benchmarks().items() if os.path.abspath(p) != os.path.abspath(dest)]
    for opp in [*BASELINES, *others]:
        s = evaluate(src, opp, games=games, workers=workers)
        scores[opp] = {"score": s["aScore"], "ci95": s["aScoreCi95"], "margin": s["aMargin"], "matches": s["matches"]}
        log(score_line(f"{name} vs {opp}", s))
    doc.setdefault("meta", {})["benchmark"] = {
        "name": name,
        "source": os.path.relpath(src, REPO).replace(os.sep, "/"),
        "frozen": time.strftime("%Y-%m-%d"),
        "note": note,
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
        log(f"{BENCH}{name:<20} from {info.get('source', '?')} ({info.get('frozen', '?')})  {scores}")
        if info.get("note"):
            log(f"    {info['note']}")


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

    b = sub.add_parser("baselines", parents=[common], help="a policy vs random and every benchmark")
    b.add_argument("policy")

    fr = sub.add_parser("freeze", parents=[common], help="save a policy as a named benchmark")
    fr.add_argument("ref")
    fr.add_argument("--name", required=True)
    fr.add_argument("--note", default="")
    fr.add_argument("--force", action="store_true", help="replace an existing benchmark of that name")

    sub.add_parser("benchmarks", help="list the benchmarks")

    pr = sub.add_parser("progress", parents=[common], help="a run's checkpoints over time vs one opponent")
    pr.add_argument("run")
    pr.add_argument("--vs", required=True)
    pr.add_argument("--every", type=int, default=1000)
    pr.add_argument("--out", default=None, help="write the markdown table here")

    args = p.parse_args(argv)
    if args.cmd == "match":
        s = evaluate(args.a, args.b, games=args.games, workers=args.workers, seed=args.seed)
        print(s["report"])
    elif args.cmd == "freeze":
        freeze(args.ref, args.name, note=args.note, games=args.games, workers=args.workers, force=args.force)
    elif args.cmd == "benchmarks":
        describe_benchmarks()
    elif args.cmd == "baselines":
        for opp in [*BASELINES, *(BENCH + n for n in list_benchmarks())]:
            s = evaluate(args.policy, opp, games=args.games, workers=args.workers)
            print(score_line(f"{label(args.policy)} vs {opp}", s))
    else:
        print(progress(args.run, args.vs, every=args.every, games=args.games, workers=args.workers, out=args.out))


if __name__ == "__main__":
    main()
