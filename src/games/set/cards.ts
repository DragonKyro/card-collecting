// Cards, and the vector space they live in.
//
// A card is stored on the wire / in game state as its digit string: one digit per
// trait axis, in axis order (see traits.ts). "1202" is colour 1, shape 2,
// shading 0, count 2. Digit strings are compact, JSON-serialisable, usable as
// object keys, and readable in a test failure — which matters more here than
// packing into an int.
//
// CardSpace is the algebra: it turns those digits into a coordinate vector over
// a product of Z_p's and knows how to add and solve within it. Everything above
// this file (rules, hints, board dealing) talks vectors, never pixels or traits.

import type { TraitAxis } from './traits';
import { buildAxes, vectorDimension } from './traits';

/** A card, encoded as one digit per trait axis. */
export type CardId = string;

/** Coordinates over the space's per-axis moduli. */
export type CardVector = readonly number[];

export class CardSpace {
  readonly axes: readonly TraitAxis[];
  /** Modulus of each coordinate, flattened across axes. */
  readonly moduli: readonly number[];
  readonly dimension: number;

  private readonly vectorCache = new Map<CardId, CardVector>();

  constructor(axes: readonly TraitAxis[]) {
    this.axes = axes;
    this.dimension = vectorDimension(axes);
    const moduli: number[] = [];
    for (const axis of axes) {
      for (let i = 0; i < axis.dimension; i++) moduli.push(axis.modulus);
    }
    this.moduli = moduli;
  }

  static forMode(traitCount: number, variants: number): CardSpace {
    return new CardSpace(buildAxes(traitCount, variants));
  }

  /** Number of traits (= digits in a CardId). */
  get traitCount(): number {
    return this.axes.length;
  }

  /** Variants of each trait (uniform across axes in every mode we ship). */
  get variants(): number {
    return this.axes[0].variants;
  }

  /** Total cards in a full deck: variants ^ traitCount. */
  get deckSize(): number {
    return this.axes.reduce((n, a) => n * a.variants, 1);
  }

  // ----- encoding -----

  /** Per-trait variant indices of a card, in axis order. */
  traitValues(id: CardId): number[] {
    const out: number[] = [];
    for (let i = 0; i < id.length; i++) out.push(id.charCodeAt(i) - 48);
    return out;
  }

  /** Look up a trait by axis id — the card art's entry point. */
  traitValue(id: CardId, axisId: TraitAxis['id']): number | null {
    const idx = this.axes.findIndex((a) => a.id === axisId);
    return idx < 0 ? null : id.charCodeAt(idx) - 48;
  }

  fromTraitValues(values: readonly number[]): CardId {
    let out = '';
    for (const v of values) out += String.fromCharCode(48 + v);
    return out;
  }

  /** Coordinate vector of a card. Memoised — decks are at most 256 cards. */
  vectorOf(id: CardId): CardVector {
    const hit = this.vectorCache.get(id);
    if (hit) return hit;
    const coords: number[] = [];
    const values = this.traitValues(id);
    for (let i = 0; i < this.axes.length; i++) {
      coords.push(...this.axes[i].embed(values[i]));
    }
    this.vectorCache.set(id, coords);
    return coords;
  }

  /** Inverse of vectorOf. */
  cardOf(vector: CardVector): CardId {
    const values: number[] = [];
    let at = 0;
    for (const axis of this.axes) {
      values.push(axis.unembed(vector.slice(at, at + axis.dimension)));
      at += axis.dimension;
    }
    return this.fromTraitValues(values);
  }

  // ----- algebra -----

  zero(): number[] {
    return new Array(this.dimension).fill(0);
  }

  /** Componentwise sum of cards, reduced by each coordinate's modulus. */
  sum(ids: readonly CardId[]): number[] {
    const acc = this.zero();
    for (const id of ids) {
      const v = this.vectorOf(id);
      for (let i = 0; i < acc.length; i++) acc[i] += v[i];
    }
    return this.reduce(acc);
  }

  reduce(vector: number[]): number[] {
    for (let i = 0; i < vector.length; i++) {
      const m = this.moduli[i];
      vector[i] = ((vector[i] % m) + m) % m;
    }
    return vector;
  }

  negate(vector: CardVector): number[] {
    const out: number[] = [];
    for (let i = 0; i < vector.length; i++) {
      const m = this.moduli[i];
      out.push((m - (vector[i] % m)) % m);
    }
    return out;
  }

  isZero(vector: CardVector): boolean {
    for (let i = 0; i < vector.length; i++) {
      if (vector[i] % this.moduli[i] !== 0) return false;
    }
    return true;
  }

  /** The unique card that makes `ids` sum to zero — the "conjugate" card.
   *  Works for any modulus, so it covers both the mod-3 third card of a Set and
   *  the XOR fourth card of a 4Set with one implementation. */
  completion(ids: readonly CardId[]): CardId {
    return this.cardOf(this.negate(this.sum(ids)));
  }

  // ----- deck -----

  /** Every card in the space, in odometer order (deterministic). */
  allCards(): CardId[] {
    const out: CardId[] = [];
    const values = new Array(this.axes.length).fill(0);
    for (;;) {
      out.push(this.fromTraitValues(values));
      let i = this.axes.length - 1;
      for (; i >= 0; i--) {
        values[i]++;
        if (values[i] < this.axes[i].variants) break;
        values[i] = 0;
      }
      if (i < 0) break;
    }
    return out;
  }
}

/** Stable key for an unordered group of cards (dedupe of found sets, etc.). */
export function cardGroupKey(ids: readonly CardId[]): string {
  return ids.slice().sort().join('|');
}
