// Sushi Go! Party card metadata and deck builder.
//
// Each card kind belongs to one of 5 categories: nigiri (always 1), roll
// (choose 1), appetizer (choose 3), special (choose 2), dessert (choose 1).
// A complete menu has exactly 8 kinds: 1+1+3+2+1 = 8 (counting the nigiri set).
//
// Card counts per kind are fixed (from the published rulebook). Nigiri is a
// single kind with three variants (egg×4, salmon×5, squid×3 → 12 cards).
// Desserts are 15 cards each; a few join the deck every round (see
// `dessertsForRound`). Fruit cards each show two fruits.

import type { SushiGoCard, SushiGoCardKind, SushiGoCategory } from './types';

export interface KindInfo {
  kind: SushiGoCardKind;
  category: SushiGoCategory;
  label: string;
  /** One-line scoring rule, shown on tooltip + cheatsheet. */
  rule: string;
  /** Total card count when this kind is included on the menu. */
  count: number;
  /** Player-count limits from the rulebook ("only use in 3-8 player games"). */
  minPlayers?: number;
  maxPlayers?: number;
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
    rule: 'Egg 1, salmon 2, squid 3 pts. A nigiri played onto a wasabi scores triple.',
    count: 12,
  },

  // ---- Rolls ----
  maki: {
    kind: 'maki', category: 'roll', label: 'Maki Roll',
    rule: 'Round end: most icons 6 pts, 2nd most 3 (6–8 players: 6 / 4 / 2). Tied players all score the full points.',
    count: 12,
  },
  temaki: {
    kind: 'temaki', category: 'roll', label: 'Temaki',
    rule: 'Round end: most temaki +4, fewest (even 0) −4; no penalty at 2 players. Tied players all score the full points.',
    count: 12,
  },
  uramaki: {
    kind: 'uramaki', category: 'roll', label: 'Uramaki',
    rule: 'First to 10 icons scores 8 at once and discards them; the next 5, then 2. At round end, most icons left scores the next unclaimed place.',
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
    rule: 'Each pair → 5 pts. A leftover single scores 0.',
    count: 8,
  },
  sashimi: {
    kind: 'sashimi', category: 'appetizer', label: 'Sashimi',
    rule: 'Each set of 3 → 10 pts. Leftovers score 0.',
    count: 8,
  },
  mizuOnigiri: {
    kind: 'mizuOnigiri', category: 'appetizer', label: 'Onigiri',
    rule: 'Each set of different shapes: 1→1, 2→4, 3→9, 4→16 pts. A repeated shape starts another set.',
    count: 8,
  },
  tofu: {
    kind: 'tofu', category: 'appetizer', label: 'Tofu',
    rule: '1 tofu → 2 pts, 2 → 6 pts, 3+ → 0 pts. Stop at 2!',
    count: 8,
  },
  edamame: {
    kind: 'edamame', category: 'appetizer', label: 'Edamame',
    rule: 'Each edamame: 1 pt per opponent with any edamame (max 4 per card). 3–8 players only.',
    count: 8, minPlayers: 3,
  },
  eel: {
    kind: 'eel', category: 'appetizer', label: 'Eel',
    rule: '1 eel → −3 pts, 2+ → 7 pts.',
    count: 8,
  },
  misoSoup: {
    kind: 'misoSoup', category: 'appetizer', label: 'Miso Soup',
    rule: '3 pts — but if more than one miso soup is played on the same turn, they are all discarded.',
    count: 8,
  },

  // ---- Specials ----
  soySauce: {
    kind: 'soySauce', category: 'special', label: 'Soy Sauce',
    rule: 'Round end: 4 pts if you have the most (or tied) different background colors among your played cards.',
    count: 3,
  },
  wasabi: {
    kind: 'wasabi', category: 'special', label: 'Wasabi',
    rule: 'The next nigiri you play goes on top of it and scores triple.',
    count: 3,
  },
  tea: {
    kind: 'tea', category: 'special', label: 'Tea',
    rule: 'Round end: 1 pt per card in your biggest set of one background color.',
    count: 3,
  },
  specialOrder: {
    kind: 'specialOrder', category: 'special', label: 'Special Order',
    rule: 'When played, becomes a copy of another card you have played this round. 2–6 players only.',
    count: 3, maxPlayers: 6,
  },
  takeoutBox: {
    kind: 'takeoutBox', category: 'special', label: 'Takeout Box',
    rule: 'When played, flip any of your cards from earlier turns face-down: each is worth 2 pts.',
    count: 3,
  },
  chopsticks: {
    kind: 'chopsticks', category: 'special', label: 'Chopsticks',
    rule: 'On a later turn, play 2 cards from your hand, then put the chopsticks back into the hand.',
    count: 3,
  },
  spoon: {
    kind: 'spoon', category: 'special', label: 'Spoon',
    rule: 'On a later turn, name a card: the first player to your left holding it gives it to you and takes the spoon. 3–8 players only.',
    count: 3, minPlayers: 3,
  },
  menu: {
    kind: 'menu', category: 'special', label: 'Menu',
    rule: 'When played, draw 4 cards from the deck, play 1 of them, and shuffle the rest back. 2–6 players only.',
    count: 3, maxPlayers: 6,
  },

  // ---- Desserts (a few join the deck each round) ----
  pudding: {
    kind: 'pudding', category: 'dessert', label: 'Pudding',
    rule: 'Game end: most pudding +6, fewest −6 (no penalty at 2 players). Tied players all score the full points.',
    count: 15,
  },
  greenTeaIceCream: {
    kind: 'greenTeaIceCream', category: 'dessert', label: 'Green Tea Ice Cream',
    rule: 'Game end: each set of 4 → 12 pts.',
    count: 15,
  },
  fruit: {
    kind: 'fruit', category: 'dessert', label: 'Fruit',
    rule: 'Game end, per fruit type: 0→−2, 1→0, 2→1, 3→3, 4→6, 5+→10 pts.',
    count: 15,
  },
};

export const ALL_KINDS: SushiGoCardKind[] = Object.keys(KIND_INFO) as SushiGoCardKind[];

export function kindsByCategory(category: SushiGoCategory): SushiGoCardKind[] {
  return ALL_KINDS.filter((k) => KIND_INFO[k].category === category);
}

/** Whether the rulebook allows this kind on the menu at `playerCount` players. */
export function kindAllowedAt(kind: SushiGoCardKind, playerCount: number): boolean {
  const { minPlayers = 2, maxPlayers = 8 } = KIND_INFO[kind];
  return playerCount >= minPlayers && playerCount <= maxPlayers;
}

/** "3–8 players", or null when the kind has no player-count limit. */
export function playerRangeLabel(kind: SushiGoCardKind): string | null {
  const { minPlayers, maxPlayers } = KIND_INFO[kind];
  if (minPlayers === undefined && maxPlayers === undefined) return null;
  return `${minPlayers ?? 2}–${maxPlayers ?? 8} players`;
}

/** Cards dealt to each player per round (the rulebook table). */
export function handSize(playerCount: number): number {
  if (playerCount <= 3) return 10;
  if (playerCount <= 5) return 9;
  if (playerCount <= 7) return 8;
  return 7;
}

/** Dessert cards shuffled into the deck before `round` (1-indexed): 5/3/2 at
 *  2–5 players, 7/5/3 at 6–8. Rounds past 3 repeat the last entry. */
export function dessertsForRound(playerCount: number, round: number): number {
  const schedule = playerCount >= 6 ? [7, 5, 3] : [5, 3, 2];
  return schedule[Math.min(round, schedule.length) - 1];
}

/** Resolution-order number printed in the corner of each copy (lowest goes first). */
const ORDER_NUMBERS: Partial<Record<SushiGoCardKind, number[]>> = {
  chopsticks: [1, 2, 3],
  spoon: [4, 5, 6],
  menu: [7, 8, 9],
  takeoutBox: [10, 11, 12],
};

/** Returns the variants array for a kind, one entry per card. Each variant
 *  is the string put on SushiGoCard.variant. Single-variant kinds return ['' x count]. */
function variantsForKind(kind: SushiGoCardKind): string[] {
  const repeat = (pairs: [string, number][]) => pairs.flatMap(([v, n]) => Array.from({ length: n }, () => v));
  const numbers = ORDER_NUMBERS[kind];
  if (numbers) return numbers.map(String);
  switch (kind) {
    case 'nigiri':
      return repeat([['egg', 4], ['salmon', 5], ['squid', 3]]);
    case 'maki':
      // Icon count per card.
      return repeat([['1', 4], ['2', 5], ['3', 3]]);
    case 'uramaki':
      return repeat([['3', 4], ['4', 4], ['5', 4]]);
    case 'mizuOnigiri':
      return repeat([['circle', 2], ['triangle', 2], ['square', 2], ['rectangle', 2]]);
    case 'fruit':
      // Two fruits per card: W = watermelon, P = pineapple, O = orange.
      return repeat([['WW', 2], ['PP', 2], ['OO', 2], ['WP', 3], ['WO', 3], ['PO', 3]]);
    default:
      return Array.from({ length: KIND_INFO[kind].count }, () => '');
  }
}

/** The variations a kind comes in (egg / salmon / squid, icon counts, shapes,
 *  fruit pairs), in deck order — what a spoon can ask for by name. [] for
 *  single-variant kinds; the corner numbers of chopsticks / spoon / menu /
 *  takeout box only set resolution order and don't count. */
export function variantsOf(kind: SushiGoCardKind): readonly string[] {
  let variants = VARIANTS.get(kind);
  if (!variants) {
    variants = ORDER_NUMBERS[kind] ? [] : [...new Set(variantsForKind(kind))].filter((v) => v !== '');
    VARIANTS.set(kind, variants);
  }
  return variants;
}
const VARIANTS = new Map<SushiGoCardKind, readonly string[]>();

/** The non-dessert cards of a round, unshuffled. Ids are unique per round.
 *  `specialOrdersKept` special orders sit in dessert piles (they copied a
 *  dessert) and stay out of later rounds. */
export function roundCards(menu: SushiGoCardKind[], round: number, specialOrdersKept = 0): SushiGoCard[] {
  const cards: SushiGoCard[] = [];
  let id = round * 1000;
  for (const kind of menu) {
    if (KIND_INFO[kind].category === 'dessert') continue;
    let variants = variantsForKind(kind);
    if (kind === 'specialOrder') variants = variants.slice(specialOrdersKept);
    for (const v of variants) cards.push({ id: id++, kind, variant: v || undefined });
  }
  return cards;
}

/** All copies of the menu's dessert, unshuffled. Ids stay clear of `roundCards`. */
export function dessertCards(menu: SushiGoCardKind[]): SushiGoCard[] {
  const kind = menu.find((k) => KIND_INFO[k].category === 'dessert');
  if (!kind) return [];
  return variantsForKind(kind).map((v, i) => ({ id: 100 + i, kind, variant: v || undefined }));
}

/** Validate a menu: must have exactly the right number of each category and no
 *  dups, and (when the player count is known) only cards allowed at that count. */
export function validateMenu(menu: SushiGoCardKind[], playerCount?: number): string[] {
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
  if (playerCount !== undefined) {
    for (const k of seen) {
      if (!kindAllowedAt(k, playerCount)) {
        errors.push(`${KIND_INFO[k].label} is for ${playerRangeLabel(k)} only (this match has ${playerCount}).`);
      }
    }
  }
  return errors;
}

/** A random legal menu for `playerCount` players. `rand` returns [0, 1). */
export function randomMenu(playerCount: number, rand: () => number): SushiGoCardKind[] {
  const menu: SushiGoCardKind[] = [];
  for (const cat of Object.keys(CATEGORY_REQUIRED) as SushiGoCategory[]) {
    const pool = kindsByCategory(cat).filter((k) => kindAllowedAt(k, playerCount));
    for (let n = 0; n < CATEGORY_REQUIRED[cat]; n++) {
      menu.push(...pool.splice(Math.floor(rand() * pool.length), 1));
    }
  }
  return menu;
}

/** Background color group, the thing soy sauce and tea count. Every food has
 *  its own, except that wasabi shares nigiri's yellow. */
export function colorGroup(kind: SushiGoCardKind): SushiGoCardKind {
  return kind === 'wasabi' ? 'nigiri' : kind;
}

const KIND_COLOR: Record<SushiGoCardKind, string> = {
  nigiri: '#f5c33b',
  maki: '#e5584a',
  temaki: '#a3b84a',
  uramaki: '#5aaee0',
  dumpling: '#7b90e4',
  tempura: '#ad8fd8',
  sashimi: '#8fd46e',
  mizuOnigiri: '#c5ccd4',
  tofu: '#e9dcae',
  edamame: '#43b07c',
  eel: '#b56aa9',
  misoSoup: '#ea9b48',
  soySauce: '#a7764c',
  wasabi: '#f5c33b',
  tea: '#d8b47e',
  specialOrder: '#e8739c',
  takeoutBox: '#c97b55',
  chopsticks: '#4fc3c0',
  spoon: '#98abc0',
  menu: '#a24a63',
  pudding: '#f5a9c4',
  greenTeaIceCream: '#c4e0f0',
  fruit: '#a8dcd1',
};

/** Card background color — one per food (see `colorGroup`). */
export function cardColor(kind: SushiGoCardKind): string {
  return KIND_COLOR[colorGroup(kind)];
}

export function nigiriPoints(variant: string | undefined): number {
  if (variant === 'salmon') return 2;
  if (variant === 'squid') return 3;
  return 1; // egg
}

/** Resolution-order number of a chopsticks / spoon / menu / takeout box card. */
export function orderNumber(card: SushiGoCard): number {
  return Number(card.copyOf?.variant ?? card.variant ?? 0);
}
