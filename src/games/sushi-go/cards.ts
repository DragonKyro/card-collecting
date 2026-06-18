// Sushi Go! Party card metadata and deck builder.
//
// Each card kind belongs to one of 5 categories: nigiri (always 1), roll
// (choose 1), appetizer (choose 3), special (choose 3), dessert (choose 1).
// A complete menu has exactly 8 kinds: 1+1+3+2+1 = 8 (counting the nigiri set).
//
// Card counts per kind are fixed (from the published rulebook). Rolls, specials,
// and most appetizers/desserts have a single count. Nigiri is a single kind with
// three variants (egg×4, salmon×5, squid×5 → 14 cards total). Fruit has 9 cards
// with variants distributed across pineapple/watermelon/orange.

import { shuffle, type RngState } from '@/core/rng';
import type { SushiGoCard, SushiGoCardKind, SushiGoCategory } from './types';

export interface KindInfo {
  kind: SushiGoCardKind;
  category: SushiGoCategory;
  label: string;
  /** One-line scoring rule, shown on tooltip + cheatsheet. */
  rule: string;
  /** Total card count when this kind is included on the menu. */
  count: number;
  /** Per-round dessert additions (only applies to desserts). 5/3/2 cards added across rounds 1/2/3. */
  perRoundDessert?: [number, number, number];
}

/** Default party-game menu (a reasonable starter). */
export const DEFAULT_MENU: SushiGoCardKind[] = [
  'nigiri',
  'maki',
  'tempura', 'sashimi', 'dumpling',
  'wasabi', 'chopsticks',
  'pudding',
];

/** Menu must contain exactly one item from each slot pattern below. */
export const CATEGORY_REQUIRED: Record<SushiGoCategory, number> = {
  nigiri: 1,
  roll: 1,
  appetizer: 3,
  special: 2,
  dessert: 1,
};

export const KIND_INFO: Record<SushiGoCardKind, KindInfo> = {
  // ---- Nigiri set (single kind, 3 variants) ----
  nigiri: {
    kind: 'nigiri', category: 'nigiri', label: 'Nigiri',
    rule: 'Each nigiri scores its variant value (egg 1 / salmon 2 / squid 3). Wasabi placed before a nigiri triples it.',
    count: 14,
  },

  // ---- Rolls ----
  maki: {
    kind: 'maki', category: 'roll', label: 'Maki Roll',
    rule: 'Most icons in round: 6 pts (split). 2nd most: 3 pts (split). Counts are 1/2/3 icons per card.',
    count: 12,
  },
  temaki: {
    kind: 'temaki', category: 'roll', label: 'Temaki',
    rule: 'Most temaki in round: +4 pts. Fewest temaki: −4 pts (ties share).',
    count: 12,
  },
  uramaki: {
    kind: 'uramaki', category: 'roll', label: 'Uramaki',
    rule: 'First to 10 icons in a round: 8 pts. 2nd: 5. 3rd: 2. (Awards happen as totals are reached.)',
    count: 12,
  },

  // ---- Appetizers ----
  dumpling: {
    kind: 'dumpling', category: 'appetizer', label: 'Dumpling',
    rule: '1→1, 2→3, 3→6, 4→10, 5+→15 pts.',
    count: 8,
  },
  tempura: {
    kind: 'tempura', category: 'appetizer', label: 'Tempura',
    rule: 'Every 2 tempura → 5 pts. Singletons score 0.',
    count: 8,
  },
  sashimi: {
    kind: 'sashimi', category: 'appetizer', label: 'Sashimi',
    rule: 'Every 3 sashimi → 10 pts. Leftover cards score 0.',
    count: 8,
  },
  mizuOnigiri: {
    kind: 'mizuOnigiri', category: 'appetizer', label: 'Onigiri',
    rule: '1 unique shape → 1, 2 → 4, 3 → 9, 4 → 16 pts. Duplicate shapes don\'t add.',
    count: 8,
  },
  tofu: {
    kind: 'tofu', category: 'appetizer', label: 'Tofu',
    rule: '1 tofu → 2 pts, 2 → 6 pts, 3+ → 0 pts. Stop at 2!',
    count: 8,
  },
  edamame: {
    kind: 'edamame', category: 'appetizer', label: 'Edamame',
    rule: 'Each edamame scores (neighbors with edamame), capped at 4 pts per card.',
    count: 8,
  },
  eel: {
    kind: 'eel', category: 'appetizer', label: 'Eel',
    rule: '1 eel → −3 pts, 2+ → 7 pts.',
    count: 8,
  },
  eggNigiri: {
    kind: 'eggNigiri', category: 'appetizer', label: 'Egg Nigiri',
    rule: 'Counts as a nigiri; scores its variant (here always egg = 1 pt).',
    count: 8,
  },

  // ---- Specials ----
  soySauce: {
    kind: 'soySauce', category: 'special', label: 'Soy Sauce',
    rule: 'At round end: +4 pts for each player who has the most distinct card colors in their table.',
    count: 3,
  },
  wasabi: {
    kind: 'wasabi', category: 'special', label: 'Wasabi',
    rule: 'When played, the next nigiri YOU play scores triple.',
    count: 3,
  },
  tea: {
    kind: 'tea', category: 'special', label: 'Tea',
    rule: 'At round end: +1 pt per card of your most-played card kind, multiplied by tea cards.',
    count: 3,
  },
  specialOrder: {
    kind: 'specialOrder', category: 'special', label: 'Special Order',
    rule: 'Counts as a copy of one of your already-played cards (chosen when played).',
    count: 3,
  },
  takeoutBox: {
    kind: 'takeoutBox', category: 'special', label: 'Takeout Box',
    rule: 'After a pick, you may flip any number of your played cards face-down to score 2 pts each (no other effect).',
    count: 3,
  },
  chopsticks: {
    kind: 'chopsticks', category: 'special', label: 'Chopsticks',
    rule: 'On a future turn you may pick 2 cards instead of 1, then return chopsticks to the hand.',
    count: 3,
  },
  spoon: {
    kind: 'spoon', category: 'special', label: 'Spoon',
    rule: 'On a future turn, name a kind. If anyone has it in hand they pass it to you (random tiebreak).',
    count: 3,
  },
  menu: {
    kind: 'menu', category: 'special', label: 'Menu',
    rule: 'On a future turn you may peek 4 deck cards, take 1, discard the rest.',
    count: 3,
  },

  // ---- Desserts (added in 5/3/2 across rounds) ----
  pudding: {
    kind: 'pudding', category: 'dessert', label: 'Pudding',
    rule: 'End of MATCH: most pudding +6 pts (split), fewest pudding −6 pts (split). Skipped at 2 players.',
    count: 15, perRoundDessert: [5, 3, 2],
  },
  greenTeaIceCream: {
    kind: 'greenTeaIceCream', category: 'dessert', label: 'Green Tea Ice Cream',
    rule: 'End of MATCH: each set of 4 ice cream scores 12 pts.',
    count: 15, perRoundDessert: [5, 3, 2],
  },
  fruit: {
    kind: 'fruit', category: 'dessert', label: 'Fruit',
    rule: 'End of MATCH: each player scores per fruit pile (0→−2, 1→0, 2→1, 3→3, 4→6, 5→10 per kind).',
    count: 15, perRoundDessert: [5, 3, 2],
  },
};

export const ALL_KINDS: SushiGoCardKind[] = Object.keys(KIND_INFO) as SushiGoCardKind[];

export function kindsByCategory(category: SushiGoCategory): SushiGoCardKind[] {
  return ALL_KINDS.filter((k) => KIND_INFO[k].category === category);
}

/** Hand size per player count for round 1 (the rulebook table). Rounds 2-3 use the same hand size. */
export function handSize(playerCount: number): number {
  switch (playerCount) {
    case 2: return 10;
    case 3: return 9;
    case 4: return 8;
    case 5: return 7;
    case 6: return 7;
    case 7: return 7;
    case 8: return 7;
    default: return 8;
  }
}

/** Returns the variants array for a kind, repeated to fill `count`. Each variant
 *  is the string put on SushiGoCard.variant. Single-variant kinds return ['' x count]. */
function variantsForKind(kind: SushiGoCardKind): string[] {
  switch (kind) {
    case 'nigiri': {
      // 4 egg, 5 salmon, 5 squid = 14
      const out: string[] = [];
      for (let i = 0; i < 4; i++) out.push('egg');
      for (let i = 0; i < 5; i++) out.push('salmon');
      for (let i = 0; i < 5; i++) out.push('squid');
      return out;
    }
    case 'maki': {
      // 4×1, 5×2, 3×3 icons = 12 cards
      const out: string[] = [];
      for (let i = 0; i < 4; i++) out.push('1');
      for (let i = 0; i < 5; i++) out.push('2');
      for (let i = 0; i < 3; i++) out.push('3');
      return out;
    }
    case 'uramaki': {
      // 4 of each 3/4/5-icon = 12
      const out: string[] = [];
      for (let i = 0; i < 4; i++) out.push('3');
      for (let i = 0; i < 4; i++) out.push('4');
      for (let i = 0; i < 4; i++) out.push('5');
      return out;
    }
    case 'temaki':
      return Array.from({ length: 12 }, () => '');
    case 'fruit': {
      // 15 cards, each card shows 2 fruits across pineapple/watermelon/orange.
      // We'll use simple variants like 'PP', 'PW', 'WW' etc. (5 of each combo).
      const pairs = ['PP', 'PW', 'PO', 'WW', 'WO', 'OO'];
      const out: string[] = [];
      const each = Math.floor(15 / pairs.length);
      const rem = 15 % pairs.length;
      for (const p of pairs) for (let i = 0; i < each; i++) out.push(p);
      for (let i = 0; i < rem; i++) out.push(pairs[i]);
      return out;
    }
    case 'mizuOnigiri': {
      // 4 onigiri shapes (square/triangle/circle/rectangle), 2 of each = 8
      const shapes = ['square', 'triangle', 'circle', 'rectangle'];
      const out: string[] = [];
      for (const s of shapes) { out.push(s); out.push(s); }
      return out;
    }
    default:
      return Array.from({ length: KIND_INFO[kind].count }, () => '');
  }
}

/** Build the round draw pile from a menu. Desserts have their own per-round add count.
 *  `round` is 1-indexed. Returns a shuffled deck. */
export function buildRoundDeck(rng: RngState, menu: SushiGoCardKind[], round: number): SushiGoCard[] {
  const cards: SushiGoCard[] = [];
  let id = (round - 1) * 1000; // give cards in this round predictable id ranges
  for (const kind of menu) {
    const info = KIND_INFO[kind];
    if (info.category === 'dessert') {
      const addPerRound = info.perRoundDessert ?? [5, 3, 2];
      const addCount = addPerRound[Math.min(round - 1, addPerRound.length - 1)];
      // Desserts use round-independent variants; for fruit we draw from variants list.
      const variants = variantsForKind(kind);
      for (let i = 0; i < addCount; i++) {
        const v = variants[(round * 17 + i) % variants.length];
        cards.push({ id: id++, kind, variant: v });
      }
    } else {
      const variants = variantsForKind(kind);
      for (let i = 0; i < info.count; i++) {
        cards.push({ id: id++, kind, variant: variants[i] || undefined });
      }
    }
  }
  return shuffle(rng, cards);
}

/** Validate a menu: must have exactly the right number of each category and no dups. */
export function validateMenu(menu: SushiGoCardKind[]): string[] {
  const errors: string[] = [];
  const seen = new Set<SushiGoCardKind>();
  for (const k of menu) {
    if (seen.has(k)) errors.push(`Duplicate menu item: ${KIND_INFO[k].label}.`);
    seen.add(k);
  }
  const byCat: Record<SushiGoCategory, number> = {
    nigiri: 0, roll: 0, appetizer: 0, special: 0, dessert: 0,
  };
  for (const k of menu) byCat[KIND_INFO[k].category] += 1;
  for (const cat of Object.keys(CATEGORY_REQUIRED) as SushiGoCategory[]) {
    if (byCat[cat] !== CATEGORY_REQUIRED[cat]) {
      errors.push(`Need exactly ${CATEGORY_REQUIRED[cat]} ${cat}${CATEGORY_REQUIRED[cat] === 1 ? '' : 's'}, got ${byCat[cat]}.`);
    }
  }
  return errors;
}

/** Color used on the card border, mostly cosmetic but also used for the soy-sauce
 *  scoring rule (counts distinct colors in your table). */
export function cardColor(kind: SushiGoCardKind): string {
  const info = KIND_INFO[kind];
  switch (info.category) {
    case 'nigiri': return '#f78b65';
    case 'roll': return '#1c2a1a';
    case 'appetizer': return '#f4d268';
    case 'special': return '#b984c9';
    case 'dessert': return '#aed5e6';
  }
}

export function nigiriPoints(variant: string | undefined): number {
  if (variant === 'salmon') return 2;
  if (variant === 'squid') return 3;
  return 1; // egg
}
