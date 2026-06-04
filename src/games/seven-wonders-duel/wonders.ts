// 7 Wonders Duel — 12 wonders.
//
// Duel has 12 unique wonders (no A/B sides). Each match deals 8 from the 12,
// drafted 4-4 alternating. Each wonder has a build cost + effects when built.
//
// Effect modeling: most wonder effects use shapes already in DuelCardEffect
// (vp / shields / coins / produce / science). A few wonder-only effects
// ("extra turn", "pick from discard") are marked as `extraTurn` /
// `pickFromDiscard` and flagged not-fully-modeled-in-v1 — they take effect
// only partially (coin / VP component applied; the "extra turn" or
// "discard pick" sub-phase is documented but not interactive).

import type { DuelWonder } from './types';

export const WONDERS: readonly DuelWonder[] = [
  {
    id: 'pyramids',
    name: 'The Pyramids',
    cost: { resources: ['stone', 'stone', 'stone', 'papyrus'] },
    effects: [{ kind: 'vp', vp: 9 }],
    description: '+9 VP.',
  },
  {
    id: 'mausoleum',
    name: 'The Mausoleum',
    cost: { resources: ['glass', 'glass', 'clay', 'clay'] },
    effects: [{ kind: 'vp', vp: 2 }, { kind: 'pickFromDiscard' }],
    description: '+2 VP. (Build a card from the discard pile for free — not modeled in v1.)',
  },
  {
    id: 'lighthouse',
    name: 'The Lighthouse',
    cost: { resources: ['papyrus', 'papyrus', 'stone', 'wood'] },
    effects: [{ kind: 'vp', vp: 4 }, { kind: 'coins', coins: 6 }],
    description: '+4 VP, gain 6 coins.',
  },
  {
    id: 'temple-of-artemis',
    name: 'Temple of Artemis',
    cost: { resources: ['glass', 'papyrus', 'wood', 'stone'] },
    effects: [{ kind: 'coins', coins: 12 }],
    description: 'Gain 12 coins.',
  },
  {
    id: 'statue-of-zeus',
    name: 'Statue of Zeus',
    cost: { resources: ['stone', 'stone', 'clay', 'clay', 'papyrus'] },
    effects: [{ kind: 'vp', vp: 3 }, { kind: 'shields', shields: 1 }],
    description: '+3 VP, +1 shield. (Destroy an opponent\'s gray card — not modeled in v1.)',
  },
  {
    id: 'colossus',
    name: 'The Colossus',
    cost: { resources: ['clay', 'clay', 'clay', 'glass'] },
    effects: [{ kind: 'vp', vp: 3 }, { kind: 'shields', shields: 2 }],
    description: '+3 VP, +2 shields.',
  },
  {
    id: 'great-library',
    name: 'The Great Library',
    cost: { resources: ['wood', 'wood', 'wood', 'glass'] },
    effects: [{ kind: 'vp', vp: 4 }, { kind: 'pickFromDiscard' }],
    description: '+4 VP. (Take a random progress token of 3 — not modeled in v1.)',
  },
  {
    id: 'hanging-gardens',
    name: 'The Hanging Gardens',
    cost: { resources: ['papyrus', 'wood', 'wood'] },
    effects: [{ kind: 'vp', vp: 3 }, { kind: 'coins', coins: 6 }, { kind: 'extraTurn' }],
    description: '+3 VP, gain 6 coins. (Extra turn — not modeled in v1.)',
  },
  {
    id: 'circus-maximus',
    name: 'Circus Maximus',
    cost: { resources: ['stone', 'stone', 'wood' ] },
    effects: [{ kind: 'vp', vp: 3 }, { kind: 'shields', shields: 1 }],
    description: '+3 VP, +1 shield. (Destroy a gray card — not modeled in v1.)',
  },
  {
    id: 'great-lighthouse',
    name: 'Piraeus',
    cost: { resources: ['stone', 'stone', 'wood' ] },
    effects: [{ kind: 'produce', production: [['glass', 'papyrus']] }, { kind: 'extraTurn' }],
    description: 'Produce 1 of (glass / papyrus). (Extra turn — not modeled in v1.)',
  },
  {
    id: 'sphinx',
    name: 'The Sphinx',
    cost: { resources: ['glass', 'clay', 'clay'] },
    effects: [{ kind: 'vp', vp: 6 }, { kind: 'extraTurn' }],
    description: '+6 VP. (Extra turn — not modeled in v1.)',
  },
  {
    id: 'appian-way',
    name: 'The Appian Way',
    cost: { resources: ['stone', 'stone', 'clay', 'clay', 'papyrus'] },
    effects: [{ kind: 'vp', vp: 3 }, { kind: 'coins', coins: 3 }, { kind: 'forceOpponentDiscardCoins', amount: 3 }, { kind: 'extraTurn' }],
    description: '+3 VP, gain 3 coins, opponent loses 3 coins. (Extra turn — not modeled in v1.)',
  },
];

export function wonderById(id: string): DuelWonder {
  return WONDERS.find((w) => w.id === id) ?? WONDERS[0];
}
