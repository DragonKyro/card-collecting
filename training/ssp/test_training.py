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


# ------------------------------------------------ copying a teacher, mixed opponents, the update function

def test_workers_split_between_self_play_the_benchmark_and_past_checkpoints():
    roles = train.worker_roles(12, 0.25, 0.5)
    assert (roles.count("self"), roles.count("bench"), roles.count("past")) == (3, 6, 3)
    assert train.worker_roles(4, 0.5) == ["self", "self", "past", "past"]  # the old two-way split
    assert train.worker_roles(3, 0.9, 0.9).count("bench") == 0  # self-play takes what it asks for first


def test_advantages_are_normalised_within_each_source():
    adv = torch.tensor([1.0, 2.0, 3.0, 10.0, 20.0, 30.0, 100.0, 200.0, 300.0])
    src = torch.tensor([0, 0, 0, 1, 1, 1, 2, 2, 2])
    per = train.normalise_advantages(adv, src, per_source=True)
    for k in range(3):
        group = per[src == k]
        assert group.mean().item() == pytest.approx(0, abs=1e-5)
        assert group.std().item() == pytest.approx(1, abs=1e-4)
    whole = train.normalise_advantages(adv, src, per_source=False)
    assert whole[src == 0].abs().max() < 0.7  # the big-return source drowns the small one
    # A source with one sample is centred, not divided by a nonexistent spread.
    assert train.normalise_advantages(torch.tensor([5.0, 1.0, 3.0]), torch.tensor([0, 0, 1]), True)[2] == 0


def test_source_weights_parse():
    assert train.parse_source_weights("self=1,bench=2.5").tolist() == [1.0, 1.0, 2.5]
    with pytest.raises(SystemExit):
        train.parse_source_weights("moon=1")


def test_the_value_heads_extra_input_never_reaches_the_exported_policy(tmp_path):
    torch.manual_seed(2)
    with SspEnv() as env:
        plain = PolicyValueNet(env.obs_dim, env.num_slots, hidden=32, layers=1)
        aux = PolicyValueNet(env.obs_dim, env.num_slots, hidden=32, layers=1, aux_dim=3)
        aux.load_state_dict({**plain.state_dict(), "value.weight": aux.value.weight, "value.bias": aux.value.bias})
        obs = torch.from_numpy(env.reset(num_envs=4, opponent="random").obs.copy())
        with pytest.raises(ValueError):
            aux(obs)
        for k in range(3):  # the policy logits don't depend on who the opponent is
            one_hot = torch.zeros(4, 3)
            one_hot[:, k] = 1
            assert torch.equal(aux(obs, one_hot)[0], plain(obs)[0])
        assert aux(obs, torch.eye(3)[[0, 1, 2, 0]])[1].shape == (4,)
        path = str(tmp_path / "aux.json")
        export_policy(aux, path, env.encoder_version, env.action_space_version)
        with open(path, encoding="utf-8") as f:
            assert len(json.load(f)["layers"]) == 2  # trunk + policy head; no value head
        row = obs[0].numpy()
        np.testing.assert_allclose(env.policy_logits(path, row), aux(obs[:1], torch.eye(3)[:1])[0][0].detach().numpy(),
                                   rtol=1e-4, atol=1e-4)


def test_env_reports_the_teachers_moves_in_the_current_action_space():
    with SspEnv() as env:
        assert env.num_slots == 137
        batch = env.reset(num_envs=4, opponent="self", teacher=ev.resolve("bench:hard-update10000"))
        assert batch.teacher is not None and batch.teacher.shape == (4, 137)
        np.testing.assert_allclose(batch.teacher.sum(axis=1), 1, atol=1e-4)
        assert not (batch.teacher[~batch.mask] > 0).any()  # only legal moves carry mass
        env.set_teacher(None)
        assert env.step([int(np.flatnonzero(m)[0]) for m in batch.mask]).teacher is None


def test_copy_phase_then_ppo_against_the_benchmark(tmp_path):
    common = ["--run", "c", "--runs-dir", str(tmp_path), "--workers", "3", "--envs-per-worker", "4",
              "--rollout", "16", "--save-every", "100", "--eval-every", "0", "--minibatch", "64",
              "--no-build", "--device", "cpu", "--self-play", "0.34", "--bench-play", "0.34",
              "--teacher", "bench:hard-update10000", "--imitate-updates", "3", "--kl-coef", "0.1", "--kl-anneal", "2"]
    run = train.main(common + ["--updates", "6"])
    rows = [json.loads(line) for line in open(os.path.join(run, "metrics.jsonl"), encoding="utf-8")]
    assert [r["update"] for r in rows] == [1, 2, 3, 4, 5, 6]
    copy, ppo = rows[:3], rows[3:]
    assert all("approx_kl" not in r and r["teacher_share"] > 0 and 0 <= r["agreement"] <= 1 for r in copy)
    assert all("approx_kl" in r for r in ppo)
    assert ppo[0]["kl_coef"] == pytest.approx(0.1) and ppo[1]["kl_coef"] == pytest.approx(0.05)
    assert "teacher_kl" in ppo[1] and "teacher_kl" not in ppo[2]  # faded out: no targets any more
    # The copy is saved the moment it is done, whatever --save-every says.
    assert [u for u, _ in ev.list_policies(run)] == [3, 6]
    with open(os.path.join(run, "config.json"), encoding="utf-8") as f:
        assert json.load(f)["arch"]["aux_dim"] == 3
    train.main(common + ["--updates", "7", "--resume"])  # resumes into plain PPO
    assert [u for u, _ in ev.list_policies(run)] == [3, 6, 7]


def test_progress_table_marks_the_copy_phase(tmp_path):
    run = train.main(["--run", "p", "--runs-dir", str(tmp_path), "--workers", "2", "--envs-per-worker", "4",
                      "--rollout", "16", "--save-every", "2", "--eval-every", "2", "--eval-games", "2",
                      "--eval-workers", "1", "--eval-bench", "hard-update10000", "--minibatch", "64",
                      "--no-build", "--device", "cpu", "--self-play", "0.5", "--bench-play", "0.5",
                      "--teacher", "bench:hard-update10000", "--imitate-updates", "2", "--updates", "4"])
    with open(os.path.join(run, "progress.md"), encoding="utf-8") as f:
        text = f.read()
    assert "| 2 (copy) |" in text and "| 4 |" in text
    assert "Teacher hard-update10000.json: copied for 2 updates" in text and "50% bench" in text
