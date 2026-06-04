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
  /** One-line scoring rule, shown on tooltip + cheatsheet. */
  rule: string;
  /** Optional duo-pair ability text (shark+swimmer share this on shark). */
  ability?: string;
}

export const FAMILY: Record<SspCardFamily, FamilyInfo> = {
  crab:           { count: 9, category: 'duo',        label: 'Crab',
                    rule: 'Pair (2 matching): 1 pt + ability.',
                    ability: 'Take any card from either discard pile.' },
  boat:           { count: 8, category: 'duo',        label: 'Boat',
                    rule: 'Pair (2 matching): 1 pt + ability. Lighthouse adds +1 pt per boat held.',
                    ability: 'Take another turn immediately after this one.' },
  fish:           { count: 7, category: 'duo',        label: 'Fish',
                    rule: 'Pair (2 matching): 1 pt + ability. Shoal adds +1 pt per fish held.',
                    ability: 'Draw the top card of the deck for free.' },
  shark:          { count: 5, category: 'duo',        label: 'Shark',
                    rule: 'Pair (shark + swimmer): 1 pt + ability.',
                    ability: 'Steal a random card from an opponent\'s hand.' },
  swimmer:        { count: 5, category: 'duo',        label: 'Swimmer',
                    rule: 'Pair (shark + swimmer): 1 pt + ability.',
                    ability: 'Steal a random card from an opponent\'s hand.' },
  shell:          { count: 6, category: 'collector',  label: 'Shell',
                    rule: 'Set scoring 1→0, 2→2, 3→4, 4→6, 5→8, 6→10 pts.' },
  octopus:        { count: 5, category: 'collector',  label: 'Octopus',
                    rule: 'Set scoring 1→0, 2→3, 3→6, 4→9, 5→12 pts.' },
  penguin:        { count: 3, category: 'collector',  label: 'Penguin',
                    rule: 'Set scoring 1→1, 2→3, 3→5 pts. Doubled by Penguin Colony.' },
  sailor:         { count: 2, category: 'collector',  label: 'Sailor',
                    rule: 'Set scoring 1→0, 2→5 pts. Tripled by Captain.' },
  lighthouse:     { count: 1, category: 'multiplier', label: 'Lighthouse',
                    rule: '+1 pt for each Boat you hold (not counted as a boat itself).' },
  shoal:          { count: 1, category: 'multiplier', label: 'Shoal of Fish',
                    rule: '+1 pt for each Fish you hold (not counted as a fish itself).' },
  penguinColony:  { count: 1, category: 'multiplier', label: 'Penguin Colony',
                    rule: '+2 pts for each Penguin you hold (added on top of penguin set).' },
  captain:        { count: 1, category: 'multiplier', label: 'Captain',
                    rule: '+3 pts for each Sailor you hold (added on top of sailor set).' },
  mermaid:        { count: 4, category: 'mermaid',    label: 'Mermaid',
                    rule: 'Per mermaid held: claim the biggest unused color group as bonus. 4 mermaids = instant win.' },
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
