// 7 Wonders Duel — the 12 wonders.
//
// Each match drafts 8 of them, 4 per player, and at most 7 get built: when
// the 7th is built the last unbuilt one goes back to the box. Effects are
// listed in the order printed on the card; the reducer applies them in that
// order (`playAgain`, `destroy`, `buildFromDiscard` and `progressFromBox`
// queue a follow-up rather than resolving inline).

import type { DuelWonder } from './types';

export const WONDERS: readonly DuelWonder[] = [
  {
    id: 'appian-way',
    name: 'The Appian Way',
    cost: { resources: ['stone', 'stone', 'clay', 'clay', 'papyrus'] },
    effects: [{ kind: 'coins', amount: 3 }, { kind: 'opponentLosesCoins', amount: 3 }, { kind: 'playAgain' }, { kind: 'vp', vp: 3 }],
    description: 'Take 3 coins; your opponent loses 3. Play again. 3 VP.',
  },
  {
    id: 'circus-maximus',
    name: 'Circus Maximus',
    cost: { resources: ['stone', 'stone', 'wood', 'glass'] },
    effects: [{ kind: 'destroy', color: 'gray' }, { kind: 'shields', shields: 1 }, { kind: 'vp', vp: 3 }],
    description: "Discard a gray card from your opponent's city. 1 shield. 3 VP.",
  },
  {
    id: 'colossus',
    name: 'The Colossus',
    cost: { resources: ['clay', 'clay', 'clay', 'glass'] },
    effects: [{ kind: 'shields', shields: 2 }, { kind: 'vp', vp: 3 }],
    description: '2 shields. 3 VP.',
  },
  {
    id: 'great-library',
    name: 'The Great Library',
    cost: { resources: ['wood', 'wood', 'wood', 'glass', 'papyrus'] },
    effects: [{ kind: 'progressFromBox' }, { kind: 'vp', vp: 4 }],
    description: 'Draw 3 of the Progress tokens left out of the game and keep one. 4 VP.',
  },
  {
    id: 'great-lighthouse',
    name: 'The Great Lighthouse',
    cost: { resources: ['wood', 'stone', 'papyrus', 'papyrus'] },
    effects: [{ kind: 'produce', production: [['wood', 'stone', 'clay']] }, { kind: 'vp', vp: 4 }],
    description: 'Produces one wood, stone or clay each turn. 4 VP.',
  },
  {
    id: 'hanging-gardens',
    name: 'The Hanging Gardens',
    cost: { resources: ['wood', 'wood', 'glass', 'papyrus'] },
    effects: [{ kind: 'coins', amount: 6 }, { kind: 'playAgain' }, { kind: 'vp', vp: 3 }],
    description: 'Take 6 coins. Play again. 3 VP.',
  },
  {
    id: 'mausoleum',
    name: 'The Mausoleum',
    cost: { resources: ['clay', 'clay', 'glass', 'glass', 'papyrus'] },
    effects: [{ kind: 'buildFromDiscard' }, { kind: 'vp', vp: 2 }],
    description: 'Build any discarded card for free. 2 VP.',
  },
  {
    id: 'piraeus',
    name: 'Piraeus',
    cost: { resources: ['wood', 'wood', 'stone', 'clay'] },
    effects: [{ kind: 'produce', production: [['glass', 'papyrus']] }, { kind: 'playAgain' }, { kind: 'vp', vp: 2 }],
    description: 'Produces one glass or papyrus each turn. Play again. 2 VP.',
  },
  {
    id: 'pyramids',
    name: 'The Pyramids',
    cost: { resources: ['stone', 'stone', 'stone', 'papyrus'] },
    effects: [{ kind: 'vp', vp: 9 }],
    description: '9 VP.',
  },
  {
    id: 'sphinx',
    name: 'The Sphinx',
    cost: { resources: ['stone', 'clay', 'glass', 'glass'] },
    effects: [{ kind: 'playAgain' }, { kind: 'vp', vp: 6 }],
    description: 'Play again. 6 VP.',
  },
  {
    id: 'statue-of-zeus',
    name: 'The Statue of Zeus',
    cost: { resources: ['stone', 'wood', 'clay', 'papyrus', 'papyrus'] },
    effects: [{ kind: 'destroy', color: 'brown' }, { kind: 'shields', shields: 1 }, { kind: 'vp', vp: 3 }],
    description: "Discard a brown card from your opponent's city. 1 shield. 3 VP.",
  },
  {
    id: 'temple-of-artemis',
    name: 'The Temple of Artemis',
    cost: { resources: ['wood', 'stone', 'glass', 'papyrus'] },
    effects: [{ kind: 'coins', amount: 12 }, { kind: 'playAgain' }],
    description: 'Take 12 coins. Play again.',
  },
];

/** The expansions' wonders: Agora's two act when drafted as well as when built. */
export const EXPANSION_WONDERS: readonly DuelWonder[] = [
  {
    id: 'curia-julia',
    name: 'Curia Julia',
    expansion: 'agora',
    onSelect: 'conspire',
    cost: { resources: ['papyrus', 'glass', 'clay', 'wood', 'stone'] },
    effects: [{ kind: 'coins', amount: 6 }, { kind: 'playAgain' }, { kind: 'triggerUnprepared' }],
    description: 'When drafted: Conspire. When built: take 6 coins, you may trigger one of your unprepared Conspiracies. Play again.',
  },
  {
    id: 'knossos',
    name: 'Knossos',
    expansion: 'agora',
    onSelect: 'placeInfluence',
    cost: { resources: ['glass', 'glass', 'clay', 'wood', 'stone'] },
    effects: [{ kind: 'placeInfluence' }, { kind: 'moveInfluence' }, { kind: 'vp', vp: 3 }],
    description: 'When drafted: place an Influence cube. When built: place an Influence cube, then you may move one. 3 VP.',
  },
  {
    id: 'sanctuary',
    name: 'The Sanctuary',
    expansion: 'pantheon',
    cost: { resources: ['papyrus', 'glass', 'stone', 'stone'] },
    effects: [{ kind: 'divinityDiscount', amount: 2 }, { kind: 'playAgain' }],
    description: 'Invoking Divinities costs you 2 coins less. Play again.',
  },
  {
    id: 'divine-theater',
    name: 'The Divine Theater',
    expansion: 'pantheon',
    cost: { resources: ['papyrus', 'papyrus', 'glass', 'wood', 'wood'] },
    effects: [{ kind: 'divineTheater' }, { kind: 'vp', vp: 2 }],
    description: 'Look through a Mythology deck of your choice and invoke one of its Divinities for free. 2 VP.',
  },
];

/** Every wonder, the expansions' included. */
export const ALL_WONDERS: readonly DuelWonder[] = [...WONDERS, ...EXPANSION_WONDERS];

/** The wonders a match drafts from (the base 12 first, in their printed order). */
export function wonderPool(config: { pantheon?: boolean; agora?: boolean }): DuelWonder[] {
  return ALL_WONDERS.filter((w) => !w.expansion || (w.expansion === 'agora' ? !!config.agora : !!config.pantheon));
}

const BY_ID = new Map(ALL_WONDERS.map((w) => [w.id, w]));

export function wonderById(id: string): DuelWonder {
  const w = BY_ID.get(id);
  if (!w) throw new Error(`Unknown wonder: ${id}`);
  return w;
}

/** Wonders the rules let a match have built at most. */
export const MAX_WONDERS_BUILT = 7;
