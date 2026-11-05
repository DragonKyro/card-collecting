// 7 Wonders — wonder boards. 7 wonders × 2 sides (A/B) = 14 boards.
//
// Each board has an initial resource production (which neighbours may buy) and
// 2–4 stages with their own cost and effects. Stage production (Alexandria) is
// for the owner only. The wonder powers are effect kinds of their own, read
// where they apply: `scienceWild` (scoring), `buildFromDiscard` (reducer, end
// of turn), `playLastCard` (reducer, 6th pick), `freeBuildPerAge` (pick
// validation) and `copyGuild` (scoring).
//
// Costs and effects follow the first-edition boards.

import type { SwCardEffect, SwPlayer, SwResource, SwWonder } from './types';

const r = (...rs: SwResource[]): SwResource[] => rs;

export const WONDERS: SwWonder[] = [
  // ---------- Gizah ----------
  {
    id: 'gizah-a', name: 'Pyramids of Gizah', side: 'A',
    initialProduction: [['stone']],
    stages: [
      { cost: { resources: ['stone', 'stone'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['wood', 'wood', 'wood'] }, effects: [{ kind: 'vp', vp: 5 }], text: '+5 VP' },
      { cost: { resources: ['stone', 'stone', 'stone', 'stone'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'gizah-b', name: 'Pyramids of Gizah', side: 'B',
    initialProduction: [['stone']],
    stages: [
      { cost: { resources: ['wood', 'wood'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['stone', 'stone', 'stone'] }, effects: [{ kind: 'vp', vp: 5 }], text: '+5 VP' },
      { cost: { resources: ['clay', 'clay', 'clay'] }, effects: [{ kind: 'vp', vp: 5 }], text: '+5 VP' },
      { cost: { resources: ['stone', 'stone', 'stone', 'stone', 'papyrus'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },

  // ---------- Rhodes ----------
  {
    id: 'rhodes-a', name: 'Colossus of Rhodes', side: 'A',
    initialProduction: [['ore']],
    stages: [
      { cost: { resources: ['wood', 'wood'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['clay', 'clay', 'clay'] }, effects: [{ kind: 'shields', shields: 2 }], text: '+2 shields' },
      { cost: { resources: ['ore', 'ore', 'ore', 'ore'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'rhodes-b', name: 'Colossus of Rhodes', side: 'B',
    initialProduction: [['ore']],
    stages: [
      { cost: { resources: ['stone', 'stone', 'stone'] },
        effects: [{ kind: 'shields', shields: 1 }, { kind: 'coins', amount: 3 }, { kind: 'vp', vp: 3 }],
        text: '+1 shield · +3 coins · +3 VP' },
      { cost: { resources: ['ore', 'ore', 'ore', 'ore'] },
        effects: [{ kind: 'shields', shields: 1 }, { kind: 'coins', amount: 4 }, { kind: 'vp', vp: 4 }],
        text: '+1 shield · +4 coins · +4 VP' },
    ],
  },

  // ---------- Alexandria ----------
  {
    id: 'alexandria-a', name: 'Lighthouse of Alexandria', side: 'A',
    initialProduction: [['glass']],
    stages: [
      { cost: { resources: ['stone', 'stone'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['ore', 'ore'] }, effects: [{ kind: 'produce', production: [r('clay', 'stone', 'wood', 'ore')] }], text: 'Choose any raw resource each age' },
      { cost: { resources: ['glass', 'glass'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'alexandria-b', name: 'Lighthouse of Alexandria', side: 'B',
    initialProduction: [['glass']],
    stages: [
      { cost: { resources: ['clay', 'clay'] }, effects: [{ kind: 'produce', production: [r('clay', 'stone', 'wood', 'ore')] }], text: 'Choose any raw resource each age' },
      { cost: { resources: ['wood', 'wood'] }, effects: [{ kind: 'produce', production: [r('glass', 'papyrus', 'loom')] }], text: 'Choose any manufactured resource each age' },
      { cost: { resources: ['stone', 'stone', 'stone'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },

  // ---------- Ephesos ----------
  {
    id: 'ephesos-a', name: 'Temple of Artemis', side: 'A',
    initialProduction: [['papyrus']],
    stages: [
      { cost: { resources: ['stone', 'stone'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['wood', 'wood'] }, effects: [{ kind: 'coins', amount: 9 }], text: '+9 coins' },
      { cost: { resources: ['papyrus', 'papyrus'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'ephesos-b', name: 'Temple of Artemis', side: 'B',
    initialProduction: [['papyrus']],
    stages: [
      { cost: { resources: ['stone', 'stone'] }, effects: [{ kind: 'coins', amount: 4 }, { kind: 'vp', vp: 2 }], text: '+4 coins · +2 VP' },
      { cost: { resources: ['wood', 'wood'] }, effects: [{ kind: 'coins', amount: 4 }, { kind: 'vp', vp: 3 }], text: '+4 coins · +3 VP' },
      { cost: { resources: ['papyrus', 'loom', 'glass'] }, effects: [{ kind: 'coins', amount: 4 }, { kind: 'vp', vp: 5 }], text: '+4 coins · +5 VP' },
    ],
  },

  // ---------- Olympia ----------
  {
    id: 'olympia-a', name: 'Statue of Zeus at Olympia', side: 'A',
    initialProduction: [['wood']],
    stages: [
      { cost: { resources: ['wood', 'wood'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['stone', 'stone'] }, effects: [{ kind: 'freeBuildPerAge' }], text: 'Once per Age, build a card for free' },
      { cost: { resources: ['ore', 'ore'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'olympia-b', name: 'Statue of Zeus at Olympia', side: 'B',
    initialProduction: [['wood']],
    stages: [
      { cost: { resources: ['wood', 'wood'] }, effects: [{ kind: 'tradeDiscountRaw', sides: ['both'] }], text: 'Raw resources from neighbors cost 1 coin' },
      { cost: { resources: ['stone', 'stone'] }, effects: [{ kind: 'vp', vp: 5 }], text: '+5 VP' },
      { cost: { resources: ['ore', 'ore', 'loom'] }, effects: [{ kind: 'copyGuild' }], text: 'At the end, copy a guild built by a neighbour' },
    ],
  },

  // ---------- Halicarnassus ----------
  {
    id: 'halicarnassus-a', name: 'Mausoleum of Halicarnassus', side: 'A',
    initialProduction: [['loom']],
    stages: [
      { cost: { resources: ['clay', 'clay'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['ore', 'ore', 'ore'] }, effects: [{ kind: 'buildFromDiscard' }], text: 'Build a card from the discard pile for free' },
      { cost: { resources: ['loom', 'loom'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'halicarnassus-b', name: 'Mausoleum of Halicarnassus', side: 'B',
    initialProduction: [['loom']],
    stages: [
      { cost: { resources: ['ore', 'ore'] }, effects: [{ kind: 'vp', vp: 2 }, { kind: 'buildFromDiscard' }], text: '+2 VP · build a card from the discard pile for free' },
      { cost: { resources: ['clay', 'clay', 'clay'] }, effects: [{ kind: 'vp', vp: 1 }, { kind: 'buildFromDiscard' }], text: '+1 VP · build a card from the discard pile for free' },
      { cost: { resources: ['papyrus', 'loom', 'glass'] }, effects: [{ kind: 'buildFromDiscard' }], text: 'Build a card from the discard pile for free' },
    ],
  },

  // ---------- Babylon ----------
  {
    id: 'babylon-a', name: 'Hanging Gardens of Babylon', side: 'A',
    initialProduction: [['clay']],
    stages: [
      { cost: { resources: ['clay', 'clay'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['wood', 'wood', 'wood'] }, effects: [{ kind: 'scienceWild' }], text: 'A science symbol of your choice' },
      { cost: { resources: ['clay', 'clay', 'clay', 'clay'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'babylon-b', name: 'Hanging Gardens of Babylon', side: 'B',
    initialProduction: [['clay']],
    stages: [
      { cost: { resources: ['clay', 'loom'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['wood', 'wood', 'glass'] }, effects: [{ kind: 'playLastCard' }], text: 'Play the 7th card of each Age instead of discarding it' },
      { cost: { resources: ['clay', 'clay', 'clay', 'papyrus'] }, effects: [{ kind: 'scienceWild' }], text: 'A science symbol of your choice' },
    ],
  },
];

/** Find a wonder by id; throws on miss. */
export function wonderById(id: string): SwWonder {
  const w = WONDERS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown wonder: ${id}`);
  return w;
}

/** Every effect of the stages a city has built, in stage order. */
export function builtStageEffects(p: Pick<SwPlayer, 'wonderId' | 'wonderStagesBuilt'>): SwCardEffect[] {
  return wonderById(p.wonderId).stages.slice(0, p.wonderStagesBuilt).flatMap((st) => st.effects);
}

export type SwWonderPower = 'buildFromDiscard' | 'playLastCard' | 'freeBuildPerAge' | 'copyGuild';

/** True once a city has built a stage carrying the given wonder power. */
export function hasWonderPower(p: Pick<SwPlayer, 'wonderId' | 'wonderStagesBuilt'>, power: SwWonderPower): boolean {
  return builtStageEffects(p).some((e) => e.kind === power);
}

/** Build a list of (name, A, B) groupings — used in the lobby picker. */
export function wondersByName(): Array<{ name: string; a: SwWonder; b: SwWonder }> {
  const out: Array<{ name: string; a: SwWonder; b: SwWonder }> = [];
  const seen = new Set<string>();
  for (const w of WONDERS) {
    if (seen.has(w.name)) continue;
    const a = WONDERS.find((x) => x.name === w.name && x.side === 'A');
    const b = WONDERS.find((x) => x.name === w.name && x.side === 'B');
    if (a && b) {
      out.push({ name: w.name, a, b });
      seen.add(w.name);
    }
  }
  return out;
}
