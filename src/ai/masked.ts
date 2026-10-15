// Game-agnostic helpers for policies over a fixed action-slot space with a
// legality mask (1 = legal). Used by every learned / scripted agent that
// speaks slots, whatever game produced the mask.

export type Mask = ArrayLike<number>;

export function countLegal(mask: Mask): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  return n;
}

/** Highest-scoring legal slot (lowest index wins ties), or -1 if none is legal. */
export function maskedArgmax(scores: ArrayLike<number>, mask: Mask): number {
  let best = -1;
  let bestV = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    if (best === -1 || scores[i] > bestV) { best = i; bestV = scores[i]; }
  }
  return best;
}

/** Uniformly random legal slot for a uniform draw `u` in [0, 1), or -1. */
export function sampleLegal(mask: Mask, u: number): number {
  const n = countLegal(mask);
  if (n === 0) return -1;
  let k = Math.min(n - 1, Math.floor(u * n));
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && k-- === 0) return i;
  }
  return -1;
}
