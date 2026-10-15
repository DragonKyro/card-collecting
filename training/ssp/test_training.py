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
import train  # noqa: E402
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


def test_references_resolve():
    assert ev.resolve("random") == "random"
    with pytest.raises(FileNotFoundError):
        ev.resolve("no/such/run@5")


def test_shipped_hard_policy_beats_random():
    assert ev.evaluate("bench:hard-update1000", "random", games=20, workers=2)["aScore"] > 0.8


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
