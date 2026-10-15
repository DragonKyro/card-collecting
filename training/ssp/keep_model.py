"""What drives an agent's draw-two keep decisions?

Logistic regression on P(keep card A over card B) with
  - card-family fixed effects (one-hot A minus one-hot B): each family's base keep value,
  - situational factors as A-minus-B differences: points the card adds now,
    completes a pair, copies already held, same-colour cards held, what it would
    be worth to the opponent (from their table + known cards), opponent's
    visible copies,
  - an intercept (preference for the first card of the draw — should be ~0).
Usage (keeps.csv from `evaluate.py analyze ... --keep-log keeps.csv`):
    python training/ssp/keep_model.py keeps.csv
"""
import sys

import numpy as np

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    families = f.readline().split(":", 1)[1].strip().split(",")
    header = f.readline().strip().split(",")
data = np.loadtxt(path, delimiter=",", skiprows=2)
col = {name: i for i, name in enumerate(header)}
n = len(data)
fa, fb = data[:, col["famA"]].astype(int), data[:, col["famB"]].astype(int)
y = data[:, col["keptA"]]
F = len(families)
FACTORS = ["gain", "pairNow", "sameHeld", "colourHeld", "oppGain", "oppSame"]
LABELS = {
    "gain": "points it adds right now (+1)",
    "pairNow": "completes a pair in hand",
    "sameHeld": "each copy of it already held",
    "colourHeld": "each held card of the same colour",
    "oppGain": "points it would give the opponent (+1)",
    "oppSame": "each copy the opponent visibly holds",
}

fam = np.zeros((n, F))
fam[np.arange(n), fa] += 1
fam[np.arange(n), fb] -= 1
ref = families.index("crab")  # family effects are relative to a crab
fam = np.delete(fam, ref, axis=1)
fac = np.stack([data[:, col[f + "A"]] - data[:, col[f + "B"]] for f in FACTORS], axis=1)


def fit(X, y, ridge=1.0, iters=50):
    w = np.zeros(X.shape[1])
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ w)))
        grad = X.T @ (y - p) - ridge * w
        H = (X * (p * (1 - p))[:, None]).T @ X + ridge * np.eye(X.shape[1])
        step = np.linalg.solve(H, grad)
        w += step
        if np.abs(step).max() < 1e-8:
            break
    p = 1 / (1 + np.exp(-(X @ w)))
    acc = float(((p > 0.5) == (y > 0.5)).mean())
    ll = float(-(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12)).mean())
    return w, acc, ll


ones = np.ones((n, 1))
w0, acc0, ll0 = fit(np.hstack([ones, fam]), y)
w1, acc1, ll1 = fit(np.hstack([ones, fam, fac]), y)
wf, accf, llf = fit(np.hstack([ones, fac]), y)

print(f"{n} keep decisions (different families only)")
print(f"  card identity only:          accuracy {acc0:.1%}  log-loss {ll0:.3f}")
print(f"  situation only (no identity): accuracy {accf:.1%}  log-loss {llf:.3f}")
print(f"  identity + situation:        accuracy {acc1:.1%}  log-loss {ll1:.3f}")
print(f"  first-drawn-card bias: odds x{np.exp(w1[0]):.2f}")

print("\nSituational factors (card identity held fixed): odds of keeping, per step")
fac_w = w1[1 + fam.shape[1]:]
sd = fac.std(axis=0)
for f, w, s in zip(FACTORS, fac_w, sd):
    print(f"  {LABELS[f]:<40} x{np.exp(w):5.2f}   (per typical difference: x{np.exp(w * s):5.2f})")

print("\nBase keep value by card, relative to a crab (log-odds; situation held fixed):")
fam_w = np.insert(w1[1:1 + fam.shape[1]], ref, 0.0)
for i in np.argsort(-fam_w):
    count = int(((fa == i) | (fb == i)).sum())
    print(f"  {families[i]:<15} {fam_w[i]:+5.2f}   (in {count} decisions)")

print("\nDoes the situation matter more as its own score rises? (factors refit per bucket)")
my = data[:, col["myScore"]]
for lo, hi, name in [(0, 3, "score 0-3"), (4, 6, "score 4-6"), (7, 99, "score 7+ (could end the round)")]:
    m = (my >= lo) & (my <= hi)
    if m.sum() < 2000:
        continue
    w, acc, _ = fit(np.hstack([ones[m], fam[m], fac[m]]), y[m])
    fw = w[1 + fam.shape[1]:]
    parts = ", ".join(f"{f} x{np.exp(v):.2f}" for f, v in zip(FACTORS, fw))
    print(f"  {name:<32} n={m.sum():6d}  {parts}")

print("\nMost common draws: how often each card is kept")
pairs = {}
for a, b, keptA in zip(fa, fb, y):
    key = tuple(sorted((a, b)))
    hit = keptA if a == key[0] else 1 - keptA
    tot, k = pairs.get(key, (0, 0))
    pairs[key] = (tot + 1, k + hit)
for (a, b), (tot, k) in sorted(pairs.items(), key=lambda kv: -kv[1][0])[:14]:
    first, second, rate = (a, b, k / tot) if k / tot >= 0.5 else (b, a, 1 - k / tot)
    print(f"  {families[first]:>13} over {families[second]:<13} {rate:5.1%}  (n={tot})")
