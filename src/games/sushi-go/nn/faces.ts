// Sushi Go! Party — card FACES for the learned agent: kind plus the variant
// that changes scoring (egg / salmon / squid nigiri, maki and uramaki icon
// counts, onigiri shapes, fruit pairs). 37 across all 22 kinds. The corner
// numbers of chopsticks / spoon / menu / takeout box only order their
// resolution, so those kinds are one face each.
//
// Changing this list changes the feature layout: bump ENCODER_VERSION.

import type { SushiGoCard, SushiGoCardKind } from '../types';
import { ALL_KINDS, KIND_INFO, variantsOf, roundCards, dessertCards } from '../cards';

export interface SushiGoFace {
  kind: SushiGoCardKind;
  variant?: string;
}

export const FACES: readonly SushiGoFace[] = ALL_KINDS.flatMap((kind) => {
  const variants = variantsOf(kind);
  return variants.length === 0 ? [{ kind }] : variants.map((variant) => ({ kind, variant }));
});
export const FACE_COUNT = FACES.length;

const key = (kind: SushiGoCardKind, variant: string | undefined) => `${kind}:${variant ?? ''}`;
const FACE_INDEX = new Map(FACES.map((f, i) => [key(f.kind, f.variant), i]));

/** The face of a card as it is (a special order is a special order — see
 *  scoring.effectiveCard for what it counts as). */
export function faceIndex(card: { kind: SushiGoCardKind; variant?: string }): number {
  const variant = variantsOf(card.kind).length > 0 ? card.variant : undefined;
  const i = FACE_INDEX.get(key(card.kind, variant));
  if (i === undefined) throw new Error(`faceIndex: no face for ${card.kind} ${card.variant ?? ''}`);
  return i;
}

/** Copies of each face when its kind is on the menu (desserts: the whole 15). */
export const FACE_COPIES: readonly number[] = (() => {
  const copies = new Array<number>(FACE_COUNT).fill(0);
  const cards: SushiGoCard[] = [
    ...roundCards(ALL_KINDS, 1),
    ...ALL_KINDS.filter((k) => KIND_INFO[k].category === 'dessert').flatMap((k) => dessertCards([k])),
  ];
  for (const c of cards) copies[faceIndex(c)] += 1;
  return copies;
})();

/** Faces of the kinds on a menu, in FACES order. */
export function menuFaces(menu: readonly SushiGoCardKind[]): number[] {
  const on = new Set(menu);
  return FACES.flatMap((f, i) => (on.has(f.kind) ? [i] : []));
}
