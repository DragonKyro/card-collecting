"""Python-side checks for the SSP trainer. Run from the repo root:

    conda activate train
    python -m pytest training/ssp -q
"""

from __future__ import annotations

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
        batch = env.reset(num_envs=4, opponent="heuristic")
        for row in batch.obs:
            ts = env.policy_logits(path, row)
            with torch.no_grad():
                py = net(torch.from_numpy(row[None].copy()))[0][0].numpy()
            np.testing.assert_allclose(ts, py, rtol=1e-4, atol=1e-4)


def test_training_checkpoints_resumes_and_evaluates(tmp_path):
    common = ["--run", "t", "--runs-dir", str(tmp_path), "--workers", "2", "--envs-per-worker", "4",
              "--rollout", "16", "--bc-updates", "1", "--save-every", "1", "--eval-every", "0",
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
    assert ev.resolve("heuristic") == "heuristic"
    with pytest.raises(FileNotFoundError):
        ev.resolve("no/such/run@5")


def test_heuristic_beats_random():
    assert ev.evaluate("heuristic", "random", games=20, workers=2)["aScore"] > 0.8


def test_elo_fit():
    r = ev.fit_elo([("a", "heuristic", 0.76, 4000), ("b", "heuristic", 0.5, 4000)])
    assert r["heuristic"] == pytest.approx(1000)
    assert r["a"] == pytest.approx(1200, abs=10)
    assert r["b"] == pytest.approx(1000, abs=10)
