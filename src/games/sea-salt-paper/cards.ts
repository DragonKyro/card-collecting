// Card-family metadata and deck builder.
//
// Card counts are taken from the published rulebook:
//   Duo:        crab x9, boat x8, fish x7, shark x5, swimmer x5
//   Collector:  shell x6, octopus x5, penguin x3, sailor x2
//   Multiplier: lighthouse, shoal, penguinColony, captain (x1 each)
//   Mermaid:    x4
//   Total: 58 cards
//
// Colors are mainly cosmetic except for the mermaid bonus. The rulebook lists
// 9 colors across the deck; the per-card color assignment below is a sensible
// even-ish distribution — exact published colors aren't critical for gameplay
// since only the color *spread per player's hand* matters at scoring time.

import { shuffle, type RngState } from '@/core/rng';
import type { SspCard, SspCardFamily, SspColor } from './types';

export interface FamilyInfo {
  count: number;
  category: 'duo' | 'collector' | 'multiplier' | 'mermaid';
  /** Pretty display name. */
  label: string;
}

export const FAMILY: Record<SspCardFamily, FamilyInfo> = {
  crab:           { count: 9, category: 'duo',        label: 'Crab' },
  boat:           { count: 8, category: 'duo',        label: 'Boat' },
  fish:           { count: 7, category: 'duo',        label: 'Fish' },
  shark:          { count: 5, category: 'duo',        label: 'Shark' },
  swimmer:        { count: 5, category: 'duo',        label: 'Swimmer' },
  shell:          { count: 6, category: 'collector',  label: 'Shell' },
  octopus:        { count: 5, category: 'collector',  label: 'Octopus' },
  penguin:        { count: 3, category: 'collector',  label: 'Penguin' },
  sailor:         { count: 2, category: 'collector',  label: 'Sailor' },
  lighthouse:     { count: 1, category: 'multiplier', label: 'Lighthouse' },
  shoal:          { count: 1, category: 'multiplier', label: 'Shoal of Fish' },
  penguinColony:  { count: 1, category: 'multiplier', label: 'Penguin Colony' },
  captain:        { count: 1, category: 'multiplier', label: 'Captain' },
  mermaid:        { count: 4, category: 'mermaid',    label: 'Mermaid' },
};

/** Order is stable to keep tests deterministic. */
export const FAMILY_ORDER: SspCardFamily[] = [
  'crab', 'boat', 'fish', 'shark', 'swimmer',
  'shell', 'octopus', 'penguin', 'sailor',
  'lighthouse', 'shoal', 'penguinColony', 'captain',
  'mermaid',
];

/** A duo pair is one of these unordered family combinations. */
export const DUO_PAIRS: ReadonlyArray<[SspCardFamily, SspCardFamily]> = [
  ['crab', 'crab'],
  ['boat', 'boat'],
  ['fish', 'fish'],
  ['shark', 'swimmer'],
];

export function isDuoFamily(f: SspCardFamily): boolean {
  return FAMILY[f].category === 'duo';
}

export function isCollectorFamily(f: SspCardFamily): boolean {
  return FAMILY[f].category === 'collector';
}

export function isMultiplierFamily(f: SspCardFamily): boolean {
  return FAMILY[f].category === 'multiplier';
}

export function isMermaid(f: SspCardFamily): boolean {
  return f === 'mermaid';
}

/** Returns the duo-pair counterpart (or self for matched families). */
export function duoPartner(family: SspCardFamily): SspCardFamily | null {
  if (family === 'shark') return 'swimmer';
  if (family === 'swimmer') return 'shark';
  if (family === 'crab' || family === 'boat' || family === 'fish') return family;
  return null;
}

const COLORS_NON_WHITE: SspColor[] = [
  'yellow', 'green', 'pink', 'purple',
  'lightblue', 'darkblue', 'black', 'gray',
];

/** Build the canonical 58-card deck with deterministic colors and ids. */
export function buildDeck(): SspCard[] {
  const out: SspCard[] = [];
  let id = 0;
  for (const family of FAMILY_ORDER) {
    const { count } = FAMILY[family];
    for (let i = 0; i < count; i++) {
      let color: SspColor;
      if (family === 'mermaid') {
        color = 'white';
      } else {
        color = COLORS_NON_WHITE[i % COLORS_NON_WHITE.length];
      }
      out.push({ id: id++, family, color });
    }
  }
  return out;
}

export function buildShuffledDeck(rng: RngState): SspCard[] {
  return shuffle(rng, buildDeck());
}

/** Default match target depends on seat count. */
export function defaultTargetScore(playerCount: number): number {
  if (playerCount <= 2) return 40;
  if (playerCount === 3) return 35;
  return 30;
}
