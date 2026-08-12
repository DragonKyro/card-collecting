// Trait axes — the "one dimension of a card" abstraction.
//
// A Set card is a point in a product of finite cyclic groups. Each visual trait
// (colour, shape, shading, border, count) is one axis, and each axis knows how
// to embed its variant index into coordinates over Z_p:
//
//   Mod3Axis    3 variants → 1 coordinate  over Z_3   (classic Set trait)
//   Klein4Axis  4 variants → 2 coordinates over Z_2   (4Set trait)
//
// Why two flavours? Because the rule "all same, all different, or two pairs"
// used by 4Set is *not* sum-zero mod 4 — it's sum-zero in the Klein four-group
// (Z_2)^2, i.e. XOR. Pushing that choice down into the axis means every rule
// above this layer is just "does the vector sum vanish", with no per-mode
// special cases. See rules.ts.
//
// Adding a trait (a 6th feature) or a variant count (Mod5Axis for 5-variant
// traits with sets of 5) means adding a class here and an entry in modes.ts —
// no rule, reducer or UI change.

/** How a single trait's variant index maps into modular coordinates. */
export abstract class TraitAxis {
  constructor(
    /** Stable key — also the render hint the card art switches on. */
    readonly id: TraitAxisId,
    /** Human label used in the rules book / lobby. */
    readonly label: string,
    /** Number of distinct variants of this trait. */
    readonly variants: number,
  ) {}

  /** Modulus of every coordinate this axis contributes. */
  abstract readonly modulus: number;
  /** How many coordinates this axis contributes to a card's vector. */
  abstract readonly dimension: number;
  /** Embed a variant index (0 .. variants-1) as coordinates over Z_modulus. */
  abstract embed(value: number): number[];
  /** Inverse of embed — used when we solve for a completing card. */
  abstract unembed(coords: readonly number[]): number;
}

export type TraitAxisId = 'color' | 'shape' | 'shade' | 'border' | 'count';

/** 3 variants, one coordinate mod 3. "All same or all different" ⟺ sum ≡ 0. */
export class Mod3Axis extends TraitAxis {
  readonly modulus = 3;
  readonly dimension = 1;

  constructor(id: TraitAxisId, label: string) {
    super(id, label, 3);
  }

  embed(value: number): number[] {
    return [value % 3];
  }

  unembed(coords: readonly number[]): number {
    return coords[0] % 3;
  }
}

/** 4 variants, two coordinates mod 2 (the Klein four-group). Sum-zero over four
 *  cards ⟺ the AAAA / ABCD / AABB patterns 4Set asks for. */
export class Klein4Axis extends TraitAxis {
  readonly modulus = 2;
  readonly dimension = 2;

  constructor(id: TraitAxisId, label: string) {
    super(id, label, 4);
  }

  embed(value: number): number[] {
    return [value & 1, (value >> 1) & 1];
  }

  unembed(coords: readonly number[]): number {
    return (coords[0] & 1) | ((coords[1] & 1) << 1);
  }
}

const LABELS: Record<TraitAxisId, string> = {
  color: 'Colour',
  shape: 'Shape',
  shade: 'Shading',
  border: 'Border',
  count: 'Count',
};

/** Build an axis of the right flavour for a given variant count. */
export function makeAxis(id: TraitAxisId, variants: number): TraitAxis {
  switch (variants) {
    case 3: return new Mod3Axis(id, LABELS[id]);
    case 4: return new Klein4Axis(id, LABELS[id]);
    default:
      throw new Error(`No TraitAxis implementation for ${variants} variants`);
  }
}

// Axis order is part of the card encoding, so it must be stable. Count is always
// last (it reads naturally as "three red squiggles"); traits are dropped from the
// middle as the trait count shrinks:
//   3 traits → colour, shape, count               (shading forced solid)
//   4 traits → colour, shape, shading, count      (classic Set)
//   5 traits → colour, shape, shading, border, count  (MegaSet)
const AXIS_ORDER: readonly TraitAxisId[] = ['color', 'shape', 'shade', 'border', 'count'];

/** Which axes a mode with `traitCount` features uses, in encoding order. */
export function axisIdsFor(traitCount: number): TraitAxisId[] {
  if (traitCount < 3 || traitCount > 5) {
    throw new Error(`Unsupported trait count: ${traitCount}`);
  }
  const middle: TraitAxisId[] = ['color', 'shape'];
  if (traitCount >= 4) middle.push('shade');
  if (traitCount >= 5) middle.push('border');
  const ids = [...middle, 'count' as TraitAxisId];
  // Sanity: order must agree with AXIS_ORDER so the encoding never drifts.
  const ranked = ids.slice().sort((a, b) => AXIS_ORDER.indexOf(a) - AXIS_ORDER.indexOf(b));
  return ranked;
}

/** The full axis list for a mode: `traitCount` traits, each with `variants`. */
export function buildAxes(traitCount: number, variants: number): TraitAxis[] {
  return axisIdsFor(traitCount).map((id) => makeAxis(id, variants));
}

/** Total coordinate count of a card vector for these axes. */
export function vectorDimension(axes: readonly TraitAxis[]): number {
  return axes.reduce((n, a) => n + a.dimension, 0);
}
