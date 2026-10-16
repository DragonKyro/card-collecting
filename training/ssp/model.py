"""Policy / value network for Sea Salt & Paper, its checkpoints, and its export
to the TypeScript runtime (src/ai/mlp.ts, src/games/sea-salt-paper/nn/policy.ts).

The network is a ReLU MLP trunk with two heads: one logit per action slot
(policy) and a scalar match-outcome estimate (value). Only trunk + policy head
are exported — playing needs no value estimate.
"""

from __future__ import annotations

import base64
import json
import math
import os

import numpy as np
import torch
from torch import nn

MLP_FORMAT = "card-collecting/mlp@1"
GAME = "sea-salt-paper"
ILLEGAL_LOGIT = -1e9


class PolicyValueNet(nn.Module):
    def __init__(self, obs_dim: int, num_slots: int, hidden: int = 256, layers: int = 2):
        super().__init__()
        self.obs_dim, self.num_slots, self.hidden, self.layers = obs_dim, num_slots, hidden, layers
        trunk: list[nn.Module] = []
        dims = [obs_dim] + [hidden] * layers
        for a, b in zip(dims, dims[1:]):
            trunk += [_linear(a, b, math.sqrt(2)), nn.ReLU()]
        self.trunk = nn.Sequential(*trunk)
        # Small policy init → near-uniform play at the start; value starts near 0.
        self.policy = _linear(hidden, num_slots, 0.01)
        self.value = _linear(hidden, 1, 1.0)

    def forward(self, obs: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.trunk(obs)
        return self.policy(h), self.value(h).squeeze(-1)


def _linear(n_in: int, n_out: int, gain: float) -> nn.Linear:
    layer = nn.Linear(n_in, n_out)
    nn.init.orthogonal_(layer.weight, gain=gain)
    nn.init.zeros_(layer.bias)
    return layer


def masked_logits(logits: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    return logits.masked_fill(~mask, ILLEGAL_LOGIT)


def _b64(t: torch.Tensor) -> str:
    return base64.b64encode(np.ascontiguousarray(t.detach().cpu().numpy(), dtype="<f4").tobytes()).decode()


def export_policy(net: PolicyValueNet, path: str, encoder_version: int, action_space_version: int,
                  meta: dict | None = None, game: str = GAME) -> None:
    """Write trunk + policy head as an MlpFile the TypeScript side can load.
    nn.Linear stores weight as [out, in], which is the file's row-major layout.
    `game` names the game the policy plays (other trainers reuse this module)."""
    dense = [m for m in net.trunk if isinstance(m, nn.Linear)]
    layers = [_dense(m, "relu") for m in dense] + [_dense(net.policy, "linear")]
    doc = {
        "format": MLP_FORMAT,
        "game": game,
        "encoderVersion": encoder_version,
        "actionSpaceVersion": action_space_version,
        "inputDim": net.obs_dim,
        "outputDim": net.num_slots,
        "layers": layers,
        "meta": meta or {},
    }
    _atomic_write(path, json.dumps(doc))


def _dense(layer: nn.Linear, activation: str) -> dict:
    return {
        "in": layer.in_features,
        "out": layer.out_features,
        "activation": activation,
        "weight": _b64(layer.weight),
        "bias": _b64(layer.bias),
    }


def save_checkpoint(path: str, net: PolicyValueNet, optimizer: torch.optim.Optimizer, state: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    torch.save({
        "model": net.state_dict(),
        "optimizer": optimizer.state_dict(),
        "arch": {"obs_dim": net.obs_dim, "num_slots": net.num_slots, "hidden": net.hidden, "layers": net.layers},
        **state,
    }, tmp)
    os.replace(tmp, path)


def load_checkpoint(path: str, device: str | torch.device = "cpu") -> dict:
    return torch.load(path, map_location=device, weights_only=False)


def net_from_checkpoint(ckpt: dict, device: str | torch.device = "cpu") -> PolicyValueNet:
    net = PolicyValueNet(**ckpt["arch"]).to(device)
    net.load_state_dict(ckpt["model"])
    return net


def _atomic_write(path: str, text: str) -> None:
    """Readers (env workers loading opponents) never see a half-written file."""
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)
