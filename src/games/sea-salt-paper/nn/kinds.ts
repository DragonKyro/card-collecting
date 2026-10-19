// Sea Salt & Paper — card KINDS: family and colour together, so a teal crab
// and a yellow crab differ. The Extra Salt deck has 54 of them. The encoder
// counts cards by kind and the action slots pick cards by kind, so both use
// this one list; changing it changes ENCODER_VERSION and ACTION_SPACE_VERSION.

import type { SspCard, SspCardFamily, SspColor } from '../types';
import { FAMILY_COLORS, FAMILY_ORDER } from '../cards';
import { FAMILY_INDEX } from './observation';

export const COLORS: readonly SspColor[] = [
  'white', 'yellow', 'green', 'pink', 'purple', 'teal',
  'darkblue', 'black', 'gray', 'orange', 'tan',
];
export const COLOR_COUNT = COLORS.length;
export const COLOR_INDEX = Object.fromEntries(COLORS.map((c, i) => [c, i])) as Record<SspColor, number>;

export interface SspKind {
  family: SspCardFamily;
  color: SspColor;
}

/** Every (family, colour) pair in the Extra Salt deck: FAMILY_ORDER, then
 *  each family's colours in deck-chart order. */
export const KINDS: readonly SspKind[] = FAMILY_ORDER.flatMap((family) =>
  [...new Set(FAMILY_COLORS[family])].map((color) => ({ family, color })));
export const KIND_COUNT = KINDS.length;

const KIND_AT: number[][] = FAMILY_ORDER.map(() => new Array<number>(COLOR_COUNT).fill(-1));
KINDS.forEach((k, i) => { KIND_AT[FAMILY_INDEX[k.family]][COLOR_INDEX[k.color]] = i; });

export function kindIndex(c: SspCard): number {
  const k = KIND_AT[FAMILY_INDEX[c.family]]?.[COLOR_INDEX[c.color]] ?? -1;
  if (k < 0) throw new Error(`the deck has no ${c.color} ${c.family}`);
  return k;
}

/** `crab/teal`-style label for slot names and debugging. */
export function kindName(k: SspKind): string {
  return `${k.family}/${k.color}`;
}
