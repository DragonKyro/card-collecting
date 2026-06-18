// Card-family metadata and deck builder.
//
// Card counts and colors are taken from the published rulebook distribution:
//   Base (58 cards):
//     Duo:        crab x9, boat x8, fish x7, shark x5, swimmer x5
//     Collector:  shell x6, octopus x5, penguin x3, sailor x2
//     Multiplier: lighthouse, shoal, penguinColony, captain (x1 each)
//     Mermaid:    x4
//   Extra Salt (+8 cards): jellyfish x2, lobster x1, starfish x3, seahorse x1,
//                          crabBasket (Cast of Crabs) x1.
//   Total with Salt: 66 cards across 11 colors:
//     Dark Blue 10, Teal 10, Black 9, Yellow 9, Green 7, Purple 5, Grey 5,
//     White 4, Orange 3, Pink 3, Tan 1.
//
// White is reserved for the 4 mermaids. The other colors are spread across
// the deck per the published per-card chart (see FAMILY_COLORS below).

import { shuffle, type RngState } from '@/core/rng';
import type { SspCard, SspCardFamily, SspColor } from './types';

export interface FamilyInfo {
  count: number;
  category: 'duo' | 'collector' | 'multiplier' | 'mermaid' | 'special';
  /** Pretty display name. */
  label: string;
  /** One-line scoring rule, shown on tooltip + cheatsheet. */
  rule: string;
  /** Optional duo-pair ability text (shark+swimmer share this on shark). */
  ability?: string;
  /** Only added to the deck when this expansion flag is on (omitted = base game). */
  expansion?: 'extraSalt';
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

  // ---------- Extra Salt expansion (only mixed into deck when extraSalt is on) ----------
  jellyfish:      { count: 2, category: 'duo',        label: 'Jellyfish',
                    rule: 'Pair (jellyfish + swimmer): 1 pt + ability.',
                    ability: "Opponent's next turn is locked: they can only draw from the deck (no discard, no pair plays, can't end the round).",
                    expansion: 'extraSalt' },
  lobster:        { count: 1, category: 'duo',        label: 'Lobster',
                    rule: 'Pair (lobster + crab): 1 pt + ability.',
                    ability: 'Reveal the top 5 of the deck, keep 1, shuffle the rest back in.',
                    expansion: 'extraSalt' },
  starfish:       { count: 3, category: 'special',    label: 'Starfish',
                    rule: 'Played as a trio with any duo: 3 pts for the trio. Cancels the duo\'s ability.',
                    expansion: 'extraSalt' },
  seahorse:       { count: 1, category: 'collector',  label: 'Seahorse',
                    rule: 'Wildcard collector — counts as one extra card in your highest collector set (capped at that set\'s max payout).',
                    expansion: 'extraSalt' },
  crabBasket:     { count: 1, category: 'multiplier', label: 'Cast of Crabs',
                    rule: '+1 pt for each Crab you hold (not counted as a crab itself).',
                    expansion: 'extraSalt' },
};

/** Order is stable to keep tests deterministic. Base families first, then Salt. */
export const FAMILY_ORDER: SspCardFamily[] = [
  'crab', 'boat', 'fish', 'shark', 'swimmer',
  'shell', 'octopus', 'penguin', 'sailor',
  'lighthouse', 'shoal', 'penguinColony', 'captain',
  'mermaid',
  'jellyfish', 'lobster', 'starfish', 'seahorse', 'crabBasket',
];

/** A duo pair is one of these unordered family combinations. */
export const DUO_PAIRS: ReadonlyArray<[SspCardFamily, SspCardFamily]> = [
  ['crab', 'crab'],
  ['boat', 'boat'],
  ['fish', 'fish'],
  ['shark', 'swimmer'],
  // Extra Salt: jellyfish swaps in for the swimmer-side of a pair (alternative
  // to the shark+swimmer pair). Lobster swaps in for one crab in a crab pair.
  ['jellyfish', 'swimmer'],
  ['lobster', 'crab'],
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

/** Returns the duo-pair counterpart (or self for matched families).
 *  Swimmer can pair with EITHER shark or jellyfish; we return shark as the
 *  canonical answer — `isValidDuoPair` is the authoritative check for
 *  swimmer-side ambiguity. Same idea for crab + lobster: crab returns 'crab'
 *  (self), but a crab + lobster is also valid via `isValidDuoPair`. */
export function duoPartner(family: SspCardFamily): SspCardFamily | null {
  if (family === 'shark') return 'swimmer';
  if (family === 'swimmer') return 'shark';
  if (family === 'jellyfish') return 'swimmer';
  if (family === 'lobster') return 'crab';
  if (family === 'crab' || family === 'boat' || family === 'fish') return family;
  return null;
}

// Per-family color assignments taken directly from the official rulebook
// distribution chart. Counts add up to each family's `count`; the per-color
// totals match the published deck distribution (Dark Blue 10, Teal 10,
// Black 9, Yellow 9, Green 7, Purple 5, Grey 5, White 4, Orange 3, Pink 3,
// Tan 1 — 66 cards including Extra Salt). With Extra Salt off the deck drops
// the 8 Salt cards (jellyfish×2, lobster×2, starfish×2, seahorse, crabBasket).
export const FAMILY_COLORS: Record<SspCardFamily, SspColor[]> = {
  // Base — 58 cards. Per-card colors taken from the official distribution
  // chart (one entry per copy). Row counts and column totals both match the
  // published 10/10/9/9/7/5/5/4/3/3/1 distribution.
  crab:           ['darkblue', 'darkblue', 'teal', 'teal', 'black', 'yellow', 'yellow', 'green', 'gray'],         // 9
  boat:           ['darkblue', 'darkblue', 'teal', 'teal', 'black', 'black', 'yellow', 'yellow'],                 // 8
  fish:           ['darkblue', 'darkblue', 'teal', 'black', 'black', 'yellow', 'green'],                          // 7
  shark:          ['darkblue', 'teal', 'black', 'green', 'purple'],                                               // 5
  swimmer:        ['darkblue', 'teal', 'black', 'yellow', 'orange'],                                              // 5
  shell:          ['darkblue', 'teal', 'black', 'yellow', 'green', 'gray'],                                       // 6 (no purple; 1 grey)
  octopus:        ['teal', 'yellow', 'purple', 'gray', 'green'],                                                  // 5 (no white; 1 green)
  penguin:        ['purple', 'orange', 'pink'],                                                                   // 3
  sailor:         ['pink', 'tan'],                                                                                // 2
  lighthouse:     ['purple'],                                                                                     // 1
  shoal:          ['gray'],                                                                                       // 1  ("School of Fish" — grey on chart)
  penguinColony:  ['green'],                                                                                      // 1
  captain:        ['orange'],                                                                                     // 1
  mermaid:        ['white', 'white', 'white', 'white'],                                                           // 4

  // Extra Salt — 8 cards
  jellyfish:      ['purple', 'pink'],                                                                             // 2
  lobster:        ['black'],                                                                                      // 1
  starfish:       ['darkblue', 'teal', 'yellow'],                                                                 // 3
  seahorse:       ['gray'],                                                                                       // 1
  crabBasket:     ['green'],                                                                                      // 1
};

export interface DeckOpts {
  extraSalt?: boolean;
}

/** Build the deck with deterministic colors and ids. Base game = 58 cards;
 *  with Extra Salt = 66 cards (adds jellyfish×2, lobster×2, starfish×2,
 *  seahorse×1, crabBasket×1). */
export function buildDeck(opts: DeckOpts = {}): SspCard[] {
  const out: SspCard[] = [];
  let id = 0;
  for (const family of FAMILY_ORDER) {
    const info = FAMILY[family];
    if (info.expansion === 'extraSalt' && !opts.extraSalt) continue;
    const palette = FAMILY_COLORS[family];
    for (let i = 0; i < info.count; i++) {
      let color: SspColor;
      if (family === 'mermaid') {
        color = 'white';
      } else {
        // Cycle through the published palette; if the per-family table is
        // shorter than the count (a few Salt families differ), wrap around.
        color = palette[i % palette.length] ?? 'darkblue';
      }
      out.push({ id: id++, family, color });
    }
  }
  return out;
}

export function buildShuffledDeck(rng: RngState, opts: DeckOpts = {}): SspCard[] {
  return shuffle(rng, buildDeck(opts));
}

/** Default match target depends on seat count. */
export function defaultTargetScore(playerCount: number): number {
  if (playerCount <= 2) return 40;
  if (playerCount === 3) return 35;
  return 30;
}
