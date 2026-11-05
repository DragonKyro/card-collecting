// 7 Wonders — wonder boards. 7 wonders × 2 sides (A/B) = 14 boards.
//
// Each board has an initial resource production (which neighbours may buy) and
// 2–4 stages with their own cost and effects. Stage production (Alexandria) is
// for the owner only. The wonder powers are effect kinds of their own, read
// where they apply: `scienceWild` (scoring), `buildFromDiscard` (reducer, end
// of turn), `playLastCard` (reducer, 6th pick), `freeBuildPerAge` (pick
// validation) and `copyGuild` (scoring).
//
// Costs and effects follow the first-edition boards. Expansion boards (Petra,
// Byzantium, Rome) are dealt only with their expansion (`availableWonders`).

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
      { cost: { resources: ['wood', 'wood', 'glass'] }, effects: [{ kind: 'playLastCard' }], text: 'Play the last card of each Age instead of discarding it' },
      { cost: { resources: ['clay', 'clay', 'clay', 'papyrus'] }, effects: [{ kind: 'scienceWild' }], text: 'A science symbol of your choice' },
    ],
  },
  // ---------- Expansion boards ----------
  // Cities: Petra and Byzantium (dealt only with Cities). Leaders: Rome
  // (dealt only with Leaders; its board power is in force from the start).
  {
    id: 'petra-a', name: 'Al Khazneh in Petra', side: 'A', expansion: 'cities',
    initialProduction: [['clay']],
    stages: [
      { cost: { resources: ['wood', 'stone'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { coins: 7 }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
      { cost: { resources: ['wood', 'papyrus', 'stone', 'stone'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'petra-b', name: 'Al Khazneh in Petra', side: 'B', expansion: 'cities',
    initialProduction: [['clay']],
    stages: [
      { cost: { resources: ['clay', 'clay', 'ore', 'ore'] },
        effects: [{ kind: 'vp', vp: 3 }, { kind: 'coinLoss', amount: 2 }],
        text: '+3 VP · every other city loses 2 coins' },
      { cost: { coins: 14 }, effects: [{ kind: 'vp', vp: 14 }], text: '+14 VP' },
    ],
  },
  {
    id: 'byzantium-a', name: 'Hagia Sophia in Byzantium', side: 'A', expansion: 'cities',
    initialProduction: [['stone']],
    stages: [
      { cost: { resources: ['ore', 'clay'] }, effects: [{ kind: 'vp', vp: 3 }], text: '+3 VP' },
      { cost: { resources: ['papyrus', 'wood', 'wood'] }, effects: [{ kind: 'vp', vp: 2 }, { kind: 'diplomacy' }], text: '+2 VP · a diplomacy token' },
      { cost: { resources: ['glass', 'loom', 'clay', 'clay'] }, effects: [{ kind: 'vp', vp: 7 }], text: '+7 VP' },
    ],
  },
  {
    id: 'byzantium-b', name: 'Hagia Sophia in Byzantium', side: 'B', expansion: 'cities',
    initialProduction: [['stone']],
    stages: [
      { cost: { resources: ['glass', 'ore', 'papyrus', 'wood'] }, effects: [{ kind: 'vp', vp: 3 }, { kind: 'diplomacy' }], text: '+3 VP · a diplomacy token' },
      { cost: { resources: ['clay', 'loom', 'ore', 'ore'] }, effects: [{ kind: 'vp', vp: 4 }, { kind: 'diplomacy' }], text: '+4 VP · a diplomacy token' },
    ],
  },
  {
    id: 'rome-a', name: 'Colosseum in Rome', side: 'A', expansion: 'leaders',
    initialProduction: [],
    boardEffects: [{ kind: 'freeLeaders' }],
    boardText: 'Recruit your leaders for free',
    stages: [
      { cost: { resources: ['clay', 'wood', 'ore'] }, effects: [{ kind: 'vp', vp: 4 }], text: '+4 VP' },
      { cost: { resources: ['stone', 'stone', 'loom', 'clay'] }, effects: [{ kind: 'vp', vp: 6 }], text: '+6 VP' },
    ],
  },
  {
    id: 'rome-b', name: 'Colosseum in Rome', side: 'B', expansion: 'leaders',
    initialProduction: [],
    boardEffects: [{ kind: 'leaderRebate', self: 2, neighbors: 1 }],
    boardText: 'Your leaders cost 2 coins less, your neighbours’ 1 less',
    stages: [
      { cost: { resources: ['clay', 'wood'] }, effects: [{ kind: 'coins', amount: 5 }, { kind: 'drawLeaders', count: 4 }], text: '+5 coins · draw 4 leaders into your hand' },
      { cost: { resources: ['loom', 'stone', 'clay'] }, effects: [{ kind: 'vp', vp: 3 }, { kind: 'recruitNow' }], text: '+3 VP · recruit a leader now' },
      { cost: { resources: ['papyrus', 'stone', 'stone'] }, effects: [{ kind: 'vp', vp: 3 }, { kind: 'recruitNow' }], text: '+3 VP · recruit a leader now' },
    ],
  },
];

/** Find a wonder by id; throws on miss. */
export function wonderById(id: string): SwWonder {
  const w = WONDERS.find((x) => x.id === id);
  if (!w) throw new Error(`Unknown wonder: ${id}`);
  return w;
}

/** The boards in play with these expansions (an expansion's boards only with it). */
export function availableWonders(expansions: readonly string[]): SwWonder[] {
  return WONDERS.filter((w) => !w.expansion || expansions.includes(w.expansion));
}

/** Every effect of the stages a city has built, in stage order. */
export function builtStageEffects(p: Pick<SwPlayer, 'wonderId' | 'wonderStagesBuilt'>): SwCardEffect[] {
  return wonderById(p.wonderId).stages.slice(0, p.wonderStagesBuilt).flatMap((st) => st.effects);
}

/** The board's own power plus its built stages' effects. */
export function wonderEffects(p: Pick<SwPlayer, 'wonderId' | 'wonderStagesBuilt'>): SwCardEffect[] {
  const w = wonderById(p.wonderId);
  return [...(w.boardEffects ?? []), ...builtStageEffects(p)];
}

export type SwWonderPower = 'buildFromDiscard' | 'playLastCard' | 'freeBuildPerAge' | 'copyGuild';

/** True once a city has built a stage carrying the given wonder power. */
export function hasWonderPower(p: Pick<SwPlayer, 'wonderId' | 'wonderStagesBuilt'>, power: SwWonderPower): boolean {
  return builtStageEffects(p).some((e) => e.kind === power);
}

/** Build a list of (name, A, B) groupings — used in the lobby picker. */
export function wondersByName(expansions?: readonly string[]): Array<{ name: string; a: SwWonder; b: SwWonder }> {
  const pool = expansions ? availableWonders(expansions) : WONDERS;
  const out: Array<{ name: string; a: SwWonder; b: SwWonder }> = [];
  const seen = new Set<string>();
  for (const w of pool) {
    if (seen.has(w.name)) continue;
    const a = pool.find((x) => x.name === w.name && x.side === 'A');
    const b = pool.find((x) => x.name === w.name && x.side === 'B');
    if (a && b) {
      out.push({ name: w.name, a, b });
      seen.add(w.name);
    }
  }
  return out;
}
