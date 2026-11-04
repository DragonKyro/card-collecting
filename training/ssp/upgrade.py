"""Upgrade Sea Salt & Paper policy files and checkpoints from encoder / action
space v2 to v3.

v3 only appended inputs (the Extra Pepper features) and action slots (the
Pepper decisions) after v2's, leaving v2's in place (see nn/encode.ts and
nn/actions.ts). So a v2 network becomes a v3 one by padding: zero weights on
the new inputs, and new output rows with zero weights and bias. Every v2 input
and logit is computed exactly as before, so the network plays every decision
v2 had a slot for exactly as before. The new slots stay untrained until
`teach.py` (copy the fixed rules) or `train.py` fills them in.

    python training/ssp/upgrade.py src/games/sea-salt-paper/policies/*.json
    python training/ssp/upgrade.py training/runs/ssp/multi/ckpt/update_014000.pt --out training/runs/ssp/multi/ckpt-v3/update_014000.pt

Policy files are rewritten in place (or to --out with one input); checkpoints
need --out and start a fresh optimizer (Adam's moments for the new rows don't
exist). Files already at the current versions are left alone.

To start training from a policy that was upgraded and then taught (teach.py),
pass it as --policy when upgrading its checkpoint: the trunk and policy head
come from the policy file, the value head from the checkpoint.

    python training/ssp/upgrade.py training/runs/ssp/multi/ckpt/update_014000.pt         --policy src/games/sea-salt-paper/policies/hard-multi-update14000.json         --out training/runs/ssp/pepper-init/update_014000.pt
"""

from __future__ import annotations

import argparse
import base64
import json
import os

import numpy as np
import torch

from env_client import SspEnv
from model import load_checkpoint

# What v2 looked like; v3 = v2 + appended inputs / slots.
V2 = {"encoderVersion": 2, "actionSpaceVersion": 2, "inputDim": 632, "outputDim": 66}


def current_spec() -> dict:
    with SspEnv() as env:
        return {"encoderVersion": env.encoder_version, "actionSpaceVersion": env.action_space_version,
                "inputDim": env.obs_dim, "outputDim": env.num_slots}


def _floats(b64: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(b64), dtype="<f4").copy()


def _b64(a: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype="<f4").tobytes()).decode()


def upgrade_policy_doc(doc: dict, spec: dict) -> dict:
    """A v2 MlpFile doc padded to `spec`'s dims (returns `doc` unchanged if already current)."""
    versions = {k: doc[k] for k in ("encoderVersion", "actionSpaceVersion")}
    if versions == {k: spec[k] for k in versions}:
        return doc
    if versions != {k: V2[k] for k in versions} or doc["inputDim"] != V2["inputDim"] or doc["outputDim"] != V2["outputDim"]:
        raise ValueError(f"can only upgrade v2 files ({V2}); this one is {versions}, {doc['inputDim']} → {doc['outputDim']}")
    layers = [dict(l) for l in doc["layers"]]
    first, last = layers[0], layers[-1]
    w = _floats(first["weight"]).reshape(first["out"], first["in"])
    first["weight"] = _b64(np.pad(w, ((0, 0), (0, spec["inputDim"] - first["in"]))))
    first["in"] = spec["inputDim"]
    w = _floats(last["weight"]).reshape(last["out"], last["in"])
    last["weight"] = _b64(np.pad(w, ((0, spec["outputDim"] - last["out"]), (0, 0))))
    last["bias"] = _b64(np.pad(_floats(last["bias"]), (0, spec["outputDim"] - last["out"])))
    last["out"] = spec["outputDim"]
    meta = dict(doc.get("meta") or {})
    meta["upgradedFrom"] = dict(V2)
    return {**doc, "encoderVersion": spec["encoderVersion"], "actionSpaceVersion": spec["actionSpaceVersion"],
            "inputDim": spec["inputDim"], "outputDim": spec["outputDim"], "layers": layers, "meta": meta}


def upgrade_checkpoint(ck: dict, spec: dict) -> dict:
    """A v2 training checkpoint padded to `spec` (trunk input columns, policy head rows)."""
    target = {"encoderVersion": spec["encoderVersion"], "actionSpaceVersion": spec["actionSpaceVersion"]}
    if ck["versions"] == target:
        return ck
    if ck["versions"] != {"encoderVersion": V2["encoderVersion"], "actionSpaceVersion": V2["actionSpaceVersion"]}:
        raise ValueError(f"can only upgrade v2 checkpoints; this one is {ck['versions']}")
    model = dict(ck["model"])
    first = "trunk.0.weight"
    model[first] = torch.nn.functional.pad(model[first], (0, spec["inputDim"] - model[first].shape[1]))
    rows = spec["outputDim"] - model["policy.weight"].shape[0]
    model["policy.weight"] = torch.nn.functional.pad(model["policy.weight"], (0, 0, 0, rows))
    model["policy.bias"] = torch.nn.functional.pad(model["policy.bias"], (0, rows))
    arch = {**ck["arch"], "obs_dim": spec["inputDim"], "num_slots": spec["outputDim"]}
    return {**ck, "model": model, "arch": arch, "versions": target, "optimizer": None,
            "upgradedFrom": dict(V2)}


def with_policy_weights(ck: dict, doc: dict) -> dict:
    """`ck` with its trunk and policy head replaced by a (current-version) policy file's."""
    dense = [k[: -len(".weight")] for k in ck["model"] if k.startswith("trunk.") and k.endswith(".weight")]
    names = sorted(dense, key=lambda k: int(k.split(".")[1])) + ["policy"]
    if len(names) != len(doc["layers"]):
        raise ValueError(f"policy has {len(doc['layers'])} layers, checkpoint {len(names)}")
    model = dict(ck["model"])
    for name, layer in zip(names, doc["layers"]):
        w = torch.from_numpy(_floats(layer["weight"]).reshape(layer["out"], layer["in"]))
        if w.shape != model[name + ".weight"].shape:
            raise ValueError(f"{name}: policy {tuple(w.shape)} vs checkpoint {tuple(model[name + '.weight'].shape)}")
        model[name + ".weight"] = w
        model[name + ".bias"] = torch.from_numpy(_floats(layer["bias"]))
    return {**ck, "model": model}


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("paths", nargs="+", help="policy .json files and/or checkpoint .pt files")
    p.add_argument("--out", default=None, help="output path (one input only; required for a .pt)")
    p.add_argument("--policy", default=None,
                   help="with a .pt: take the trunk and policy head from this (upgraded, taught) policy file")
    a = p.parse_args(argv)
    if a.out and len(a.paths) != 1:
        p.error("--out takes a single input")
    spec = current_spec()
    for path in a.paths:
        out = a.out or path
        if path.endswith(".pt"):
            if not a.out:
                p.error("a checkpoint needs --out (the v2 one stays for its run)")
            ck = upgrade_checkpoint(load_checkpoint(path), spec)
            if a.policy:
                with open(a.policy, encoding="utf-8") as f:
                    ck = with_policy_weights(ck, json.load(f))
            os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
            torch.save(ck, out)
        else:
            with open(path, encoding="utf-8") as f:
                doc = json.load(f)
            new = upgrade_policy_doc(doc, spec)
            if new is doc and out == path:
                print(f"{path}: already v{spec['encoderVersion']} / v{spec['actionSpaceVersion']}")
                continue
            tmp = out + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(new, f)
            os.replace(tmp, out)
        print(f"{path} -> {out}: v2 -> encoder v{spec['encoderVersion']} ({spec['inputDim']}) / "
              f"action space v{spec['actionSpaceVersion']} ({spec['outputDim']})")


if __name__ == "__main__":
    main()
