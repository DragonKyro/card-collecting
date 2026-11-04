"""Python-side checks for the SSP trainer. Run from the repo root:

    conda activate train
    python -m pytest training/ssp -q
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np
import pytest
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import evaluate as ev  # noqa: E402
import teach  # noqa: E402
import train  # noqa: E402
import upgrade  # noqa: E402
from env_client import SspEnv  # noqa: E402
from model import PolicyValueNet, export_policy  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def built_bundle():
    train.build_typescript()


def test_exported_policy_matches_the_typescript_forward_pass(tmp_path):
    torch.manual_seed(0)
    with SspEnv() as env:
        net = PolicyValueNet(env.obs_dim, env.num_slots, hidden=64, layers=2)
        for p in net.parameters():  # the default policy head is near zero; make the check meaningful
            p.data.normal_(0, 0.2)
        path = str(tmp_path / "policy.json")
        export_policy(net, path, env.encoder_version, env.action_space_version)
        batch = env.reset(num_envs=4, opponent="random")
        for row in batch.obs:
            ts = env.policy_logits(path, row)
            with torch.no_grad():
                py = net(torch.from_numpy(row[None].copy()))[0][0].numpy()
            np.testing.assert_allclose(ts, py, rtol=1e-4, atol=1e-4)


def test_training_checkpoints_resumes_and_evaluates(tmp_path):
    common = ["--run", "t", "--runs-dir", str(tmp_path), "--workers", "2", "--envs-per-worker", "4",
              "--rollout", "16", "--save-every", "1", "--eval-every", "0",
              "--minibatch", "64", "--no-build", "--device", "cpu"]
    run = train.main(common + ["--updates", "2"])
    assert [u for u, _ in ev.list_policies(run)] == [1, 2]
    with pytest.raises(SystemExit):  # an existing run is never overwritten by accident
        train.main(common + ["--updates", "3"])
    train.main(common + ["--updates", "3", "--resume"])
    assert [u for u, _ in ev.list_policies(run)] == [1, 2, 3]

    vs_random = ev.evaluate(f"{run}@3", "random", games=4, workers=1)
    assert vs_random["matches"] == 4 and vs_random["a"]["errors"] == vs_random["b"]["errors"] == 0
    vs_past = ev.evaluate(run, f"{run}@1", games=2, workers=1)
    assert vs_past["a"]["name"] == "nn:update_000003" and vs_past["b"]["name"] == "nn:update_000001"


def test_multiplayer_run_from_another_runs_checkpoint(tmp_path):
    common = ["--runs-dir", str(tmp_path), "--envs-per-worker", "4", "--rollout", "16", "--save-every", "1",
              "--minibatch", "64", "--no-build", "--device", "cpu"]
    base = train.main(common + ["--run", "base", "--workers", "2", "--updates", "2", "--eval-every", "0"])
    init = os.path.join(base, "ckpt", "update_000002.pt")
    run = train.main(common + ["--run", "multi", "--workers", "3", "--players", "2,3,4p", "--init", init,
                               "--updates", "4", "--eval-every", "2", "--eval-games", "3", "--eval-workers", "1",
                               "--eval-bench", "hard-update10000"])
    # The starting point is the new run's first policy, then training carries the count on.
    assert [u for u, _ in ev.list_policies(run)] == [2, 3, 4]
    with open(os.path.join(run, "metrics.jsonl"), encoding="utf-8") as f:
        lines = [json.loads(line) for line in f]
    assert lines[0]["update"] == 3
    # Update 4's evals ran at every kind of table (4-player with Extra Pepper).
    with open(os.path.join(run, "evals.jsonl"), encoding="utf-8") as f:
        evals = {(r["update"], r["vs"]): r for r in map(json.loads, f)}
    assert {vs for u, vs in evals if u == 4} >= {"random", "bench_hard-update10000",
                                                  "bench_hard-update10000_3p", "bench_hard-update10000_4p+pepper"}
    assert evals[(4, "bench_hard-update10000_4p+pepper")]["players"] == 4
    with open(os.path.join(run, "progress.md"), encoding="utf-8") as f:
        assert "4p Pepper vs 3x hard-update10000 (even 25%)" in f.read()
    with pytest.raises(SystemExit):
        train.main(common + ["--run", "bad", "--workers", "2", "--players", "2,3,4", "--updates", "1"])
    # 4-player self-play carries up to four pending transitions per match between updates.
    four_self = train.main(common + ["--run", "four", "--workers", "2", "--players", "4", "--self-play", "1",
                                     "--updates", "3", "--eval-every", "0"])
    assert [u for u, _ in ev.list_policies(four_self)] == [1, 2, 3]
    four = ev.evaluate(run, "random", games=8, workers=1, players=4)
    assert four["matches"] == 8 and four["players"] == 4 and four["a"]["errors"] == 0


def test_references_resolve():
    assert ev.resolve("random") == "random"
    with pytest.raises(FileNotFoundError):
        ev.resolve("no/such/run@5")


def _mlp_logits(doc: dict, x: np.ndarray) -> np.ndarray:
    h = x
    for layer in doc["layers"]:
        w = upgrade._floats(layer["weight"]).reshape(layer["out"], layer["in"])
        h = h @ w.T + upgrade._floats(layer["bias"])
        if layer["activation"] == "relu":
            h = np.maximum(h, 0)
    return h


def test_upgrade_pads_a_v2_policy_without_changing_it(tmp_path):
    torch.manual_seed(2)
    net = PolicyValueNet(upgrade.V2["inputDim"], upgrade.V2["outputDim"], hidden=16, layers=2)
    for p in net.parameters():
        p.data.normal_(0, 0.3)
    path = str(tmp_path / "v2.json")
    export_policy(net, path, 2, 2)
    with open(path, encoding="utf-8") as f:
        old = json.load(f)
    spec = upgrade.current_spec()
    new = upgrade.upgrade_policy_doc(old, spec)
    assert (new["inputDim"], new["outputDim"]) == (spec["inputDim"], spec["outputDim"])
    assert new["meta"]["upgradedFrom"]["inputDim"] == upgrade.V2["inputDim"]
    rng = np.random.default_rng(0)
    x = rng.normal(size=(5, spec["inputDim"])).astype(np.float32)
    x2 = x.copy()
    x2[:, upgrade.V2["inputDim"]:] = 0
    # The v2 logits are unchanged, whatever the new inputs hold; the new slots start at 0.
    np.testing.assert_allclose(_mlp_logits(new, x)[:, :upgrade.V2["outputDim"]],
                               _mlp_logits(old, x[:, :upgrade.V2["inputDim"]]), rtol=1e-5, atol=1e-5)
    assert np.all(_mlp_logits(new, x2)[:, upgrade.V2["outputDim"]:] == 0)
    assert upgrade.upgrade_policy_doc(new, spec) is new  # already current: left alone


def test_teach_trains_only_the_pepper_weights(tmp_path):
    torch.manual_seed(3)
    with SspEnv() as env:
        net = PolicyValueNet(env.obs_dim, env.num_slots, hidden=32, layers=2)
        layout = env.feature_layout
        path = str(tmp_path / "v3.json")
        export_policy(net, path, env.encoder_version, env.action_space_version)
    teach.main([path, "--out", str(tmp_path / "taught.json"), "--matches", "6", "--epochs", "2"])
    with open(path, encoding="utf-8") as f:
        before = json.load(f)
    with open(tmp_path / "taught.json", encoding="utf-8") as f:
        after = json.load(f)
    assert after["meta"]["taught"]["teacher"] == "nn/fixedChoices.ts"
    v2_slots = 66
    cols = {i for seg in layout if seg["name"].startswith("pepperDecision.")
            for i in range(seg["offset"], seg["offset"] + seg["size"])}
    other = [i for i in range(before["inputDim"]) if i not in cols]
    w0 = upgrade._floats(before["layers"][0]["weight"]).reshape(32, -1)
    w1 = upgrade._floats(after["layers"][0]["weight"]).reshape(32, -1)
    assert np.array_equal(w0[:, other], w1[:, other])
    for l0, l1 in zip(before["layers"][1:-1], after["layers"][1:-1]):
        assert l0["weight"] == l1["weight"] and l0["bias"] == l1["bias"]
    out0 = upgrade._floats(before["layers"][-1]["weight"]).reshape(before["outputDim"], -1)
    out1 = upgrade._floats(after["layers"][-1]["weight"]).reshape(after["outputDim"], -1)
    assert np.array_equal(out0[:v2_slots], out1[:v2_slots])


def test_shipped_hard_policy_beats_random():
    assert ev.evaluate("bench:hard-update10000", "random", games=20, workers=2)["aScore"] > 0.8


def test_elo_fit():
    r = ev.fit_elo([("a", "ref", 0.76, 4000), ("b", "ref", 0.5, 4000)], anchor="ref")
    assert r["ref"] == pytest.approx(1000)
    assert r["a"] == pytest.approx(1200, abs=10)
    assert r["b"] == pytest.approx(1000, abs=10)


def test_freeze_makes_a_named_benchmark(tmp_path, monkeypatch):
    monkeypatch.setattr(ev, "BENCH_DIR", str(tmp_path / "benchmarks"))
    torch.manual_seed(1)
    with SspEnv() as env:
        net = PolicyValueNet(env.obs_dim, env.num_slots, hidden=32, layers=1)
        policy = str(tmp_path / "update_000007.json")
        export_policy(net, policy, env.encoder_version, env.action_space_version)
    path = ev.freeze(policy, "probe", note="test", games=2, workers=1, log=lambda *_: None)
    assert ev.list_benchmarks() == {"probe": path}
    assert ev.label("bench:probe") == "bench:probe"
    with open(path, encoding="utf-8") as f:
        info = json.load(f)["meta"]["benchmark"]
    assert info["note"] == "test" and info["evalAtFreeze"]["random"]["matches"] == 2
    assert ev.evaluate("bench:probe", "random", games=2, workers=1)["b"]["name"] == "random"
    with pytest.raises(FileExistsError):
        ev.freeze(policy, "probe", games=2, workers=1, log=lambda *_: None)
    with pytest.raises(FileNotFoundError):
        ev.resolve("bench:nope")
