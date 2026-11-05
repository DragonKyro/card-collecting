"""Teach an upgraded (v2 → v3) Sea Salt & Paper policy the Extra Pepper
decisions by copying the fixed rules (src/games/sea-salt-paper/nn/fixedChoices.ts).

An upgraded policy (upgrade.py) plays every v2 decision exactly as before, but
its Pepper slots — Water Rodeo duos / look / swap / pair steal, the Coral Reef
shell, the Angelfish pick, the event-card choice — are untrained. This fits
them to what the fixed rules do, on decisions from Extra Salt + Pepper matches
the policy plays itself (teach-data.ts), and trains ONLY weights that can't
change a v2 decision:
  - the output rows of the Pepper slots;
  - the first layer's weights from the `pepperDecision.*` inputs, which are
    zero everywhere except the Pepper decision subphases (where only Pepper
    slots are legal).
Everything else is frozen and checked unchanged afterwards. So the policy
still plays every game without Pepper — and every v2 decision in a game with
it — exactly as before.

    python training/ssp/teach.py path/to/upgraded-policy.json --matches 3000

(Only on a policy just upgraded from v2: on one trained with Pepper it would
replace the learned Pepper decisions with the fixed rules.)

Writes the policy back in place (or to --out), with `meta.taught` recording the
data and the held-out accuracy per decision kind.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import tempfile

import numpy as np
import torch
import torch.nn.functional as F

from env_client import SspEnv

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_SCRIPT = os.path.normpath(os.path.join(HERE, "..", "dist", "ssp-teach-data.mjs"))


def _floats(b64: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(b64), dtype="<f4").copy()


def _b64(t: torch.Tensor) -> str:
    return base64.b64encode(np.ascontiguousarray(t.detach().cpu().numpy(), dtype="<f4").tobytes()).decode()


def generate(policy: str, matches: int, seed: int, players: str, work: str) -> dict:
    node = shutil.which("node")
    if not node or not os.path.isfile(DATA_SCRIPT):
        raise FileNotFoundError(f"need node and {DATA_SCRIPT} (npm run train:build)")
    prefix = os.path.join(work, "teach")
    subprocess.run([node, DATA_SCRIPT, "--policy", os.path.abspath(policy), "--matches", str(matches),
                    "--seed", str(seed), "--players", players, "--out", prefix], check=True)
    with open(prefix + ".json", encoding="utf-8") as f:
        info = json.load(f)
    n, d, k = info["rows"], info["obsDim"], info["numSlots"]
    info["x"] = np.fromfile(prefix + ".features.f32", dtype="<f4").reshape(n, d)
    info["mask"] = np.fromfile(prefix + ".mask.u8", dtype=np.uint8).reshape(n, k).astype(bool)
    info["y"] = np.fromfile(prefix + ".target.i32", dtype="<i4").astype(np.int64)
    info["kind"] = np.fromfile(prefix + ".kind.u8", dtype=np.uint8)
    return info


def teach(doc: dict, data: dict, decision_cols: list[int], epochs: int = 30, lr: float = 3e-3,
          batch: int = 2048, seed: int = 1, log=print) -> tuple[dict, dict]:
    torch.manual_seed(seed)
    layers = doc["layers"]
    ws = [torch.tensor(_floats(l["weight"]).reshape(l["out"], l["in"]), requires_grad=True) for l in layers]
    bs = [torch.tensor(_floats(l["bias"]), requires_grad=True) for l in layers]
    acts = [l["activation"] for l in layers]
    frozen = [(w.detach().clone(), b.detach().clone()) for w, b in zip(ws, bs)]
    v2_slots = data["v2Slots"]

    # Gradient masks: only the Pepper rows of the output layer, and the first
    # layer's columns from the pepperDecision inputs.
    gw = [torch.zeros_like(w) for w in ws]
    gb = [torch.zeros_like(b) for b in bs]
    gw[-1][v2_slots:] = 1
    gb[-1][v2_slots:] = 1
    gw[0][:, decision_cols] = 1
    params = [*ws, *bs]
    opt = torch.optim.Adam(params, lr=lr)

    def forward(x: torch.Tensor) -> torch.Tensor:
        h = x
        for w, b, act in zip(ws, bs, acts):
            h = h @ w.T + b
            if act == "relu":
                h = torch.relu(h)
            elif act == "tanh":
                h = torch.tanh(h)
        return h

    x = torch.from_numpy(data["x"])
    mask = torch.from_numpy(data["mask"])
    y = torch.from_numpy(data["y"])
    n = len(y)
    perm = torch.randperm(n)
    val = perm[: max(1, n // 10)]
    tr = perm[max(1, n // 10):]

    def loss_of(idx: torch.Tensor) -> torch.Tensor:
        logits = forward(x[idx]).masked_fill(~mask[idx], -1e9)
        return F.cross_entropy(logits, y[idx])

    for epoch in range(epochs):
        order = tr[torch.randperm(len(tr))]
        for start in range(0, len(order), batch):
            idx = order[start:start + batch]
            opt.zero_grad()
            loss_of(idx).backward()
            for w, b, mw, mb in zip(ws, bs, gw, gb):
                w.grad *= mw
                b.grad *= mb
            opt.step()
            # Adam's update is per parameter, so re-pin anything frozen exactly.
            with torch.no_grad():
                for (w0, b0), w, b, mw, mb in zip(frozen, ws, bs, gw, gb):
                    w.copy_(torch.where(mw.bool(), w, w0))
                    b.copy_(torch.where(mb.bool(), b, b0))
        if epoch % 10 == 9 or epoch == epochs - 1:
            with torch.no_grad():
                log(f"  epoch {epoch + 1}: train loss {loss_of(tr).item():.4f}, held-out loss {loss_of(val).item():.4f}")

    with torch.no_grad():
        pred = forward(x[val]).masked_fill(~mask[val], -1e9).argmax(-1)
        right = (pred == y[val]).numpy()
        kinds = data["kind"][val.numpy()]
        accuracy = {"all": float(right.mean())}
        for i, name in enumerate(data["kinds"]):
            sel = kinds == i
            if sel.any():
                accuracy[name] = float(right[sel].mean())
        for (w0, b0), w, b, mw, mb in zip(frozen, ws, bs, gw, gb):
            assert torch.equal(w[~mw.bool()], w0[~mw.bool()]) and torch.equal(b[~mb.bool()], b0[~mb.bool()])

    new_layers = [{**l, "weight": _b64(w), "bias": _b64(b)} for l, w, b in zip(layers, ws, bs)]
    return {**doc, "layers": new_layers}, accuracy


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("policy", help="an upgraded (v3) policy .json")
    p.add_argument("--out", default=None, help="default: rewrite the policy in place")
    p.add_argument("--matches", type=int, default=3000)
    p.add_argument("--players", default="2,3,4")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--epochs", type=int, default=30)
    a = p.parse_args(argv)

    with open(a.policy, encoding="utf-8") as f:
        doc = json.load(f)
    with SspEnv() as env:
        layout = env.feature_layout
        versions = (env.encoder_version, env.action_space_version)
    if (doc["encoderVersion"], doc["actionSpaceVersion"]) != versions:
        raise SystemExit(f"{a.policy} is v{doc['encoderVersion']} / v{doc['actionSpaceVersion']}; upgrade it first")
    cols = [i for seg in layout if seg["name"].startswith("pepperDecision.")
            for i in range(seg["offset"], seg["offset"] + seg["size"])]

    with tempfile.TemporaryDirectory(prefix="ssp-teach-") as work:
        data = generate(a.policy, a.matches, a.seed, a.players, work)
        print(f"{a.policy}: {len(data['y'])} decisions {data['counts']}")
        new, accuracy = teach(doc, data, cols, epochs=a.epochs, seed=a.seed)
    print("  held-out agreement with the fixed rules: "
          + ", ".join(f"{k.replace('awaiting', '')} {100 * v:.1f}%" for k, v in accuracy.items()))
    meta = dict(new.get("meta") or {})
    meta["taught"] = {"teacher": "nn/fixedChoices.ts", "matches": a.matches, "players": a.players,
                      "decisions": data["counts"], "heldOutAgreement": accuracy}
    new["meta"] = meta
    out = a.out or a.policy
    tmp = out + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(new, f)
    os.replace(tmp, out)
    print(f"  wrote {out}")


if __name__ == "__main__":
    main()
