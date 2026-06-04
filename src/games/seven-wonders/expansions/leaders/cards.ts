// 7 Wonders Leaders expansion — all 36 leader cards.
//
// Each leader has:
//   - cost in coins (paid when "played" before an age)
//   - effects (a mix of base SwCardEffect kinds + leader-specific ones)
// Leaders use color 'leader' so they never get counted by base scoring (which
// scopes to brown/gray/blue/yellow/red/green/purple). End-of-game bonuses from
// leaders are scored in the Leaders expansion's `scoreExtras` impl.

import type { SwCard, SwCardEffect } from '../../types';

interface LeaderTemplate {
  name: string;
  cost: number;        // in coins
  effects: SwCardEffect[];
  description: string; // human-readable tooltip
}

const LEADERS: readonly LeaderTemplate[] = [
  // ----- Tier (a): pure on-play effects -----
  { name: 'Caesar',     cost: 5, effects: [{ kind: 'shields', shields: 2 }],
    description: '+2 shields when played.' },
  { name: 'Hannibal',   cost: 2, effects: [{ kind: 'shields', shields: 1 }],
    description: '+1 shield when played.' },
  { name: 'Croesus',    cost: 1, effects: [{ kind: 'coins', amount: 6 }],
    description: 'Gain 6 coins when played.' },
  { name: 'Euclid',     cost: 3, effects: [{ kind: 'science', symbol: 'compass' }],
    description: '+1 compass science symbol.' },
  { name: 'Ptolemy',    cost: 3, effects: [{ kind: 'science', symbol: 'tablet' }],
    description: '+1 tablet science symbol.' },
  { name: 'Pythagoras', cost: 3, effects: [{ kind: 'science', symbol: 'gear' }],
    description: '+1 gear science symbol.' },
  { name: 'Cleopatra',  cost: 4, effects: [{ kind: 'vp', vp: 5 }],
    description: 'Worth 5 VP at end of game.' },
  { name: 'Nefertiti',  cost: 3, effects: [{ kind: 'vp', vp: 4 }],
    description: 'Worth 4 VP at end of game.' },
  { name: 'Zenobia',    cost: 3, effects: [{ kind: 'vp', vp: 3 }],
    description: 'Worth 3 VP at end of game.' },
  { name: 'Sappho',     cost: 1, effects: [{ kind: 'vp', vp: 2 }],
    description: 'Worth 2 VP at end of game.' },

  // ----- Tier (b): end-game VP per X (uses endVp) -----
  // Amytis: 2 VP per wonder stage built.
  { name: 'Amytis',     cost: 4,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'wonderStages' }, vpPer: 2 }],
    description: '2 VP per wonder stage built.' },
  // Hiram: 2 VP per purple (guild) card. Tableau-self.
  { name: 'Hiram',      cost: 3,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'purple' }, vpPer: 2 }],
    description: '2 VP per purple (guild) card.' },
  // Hypatia: 1 VP per green card.
  { name: 'Hypatia',    cost: 4,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'green' }, vpPer: 1 }],
    description: '1 VP per green (science) card.' },
  // Nebuchadnezzar: 1 VP per blue card.
  { name: 'Nebuchadnezzar', cost: 4,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'blue' }, vpPer: 1 }],
    description: '1 VP per blue (civilian) card.' },
  // Pericles: 2 VP per red card.
  { name: 'Pericles',   cost: 6,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'red' }, vpPer: 2 }],
    description: '2 VP per red (military) card.' },
  // Phidias: 1 VP per brown card.
  { name: 'Phidias',    cost: 3,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'brown' }, vpPer: 1 }],
    description: '1 VP per brown (raw materials) card.' },
  // Praxiteles: 2 VP per gray card.
  { name: 'Praxiteles', cost: 3,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'gray' }, vpPer: 2 }],
    description: '2 VP per gray (manufactured) card.' },
  // Varro: 1 VP per yellow card.
  { name: 'Varro',      cost: 3,
    effects: [{ kind: 'endVp', from: 'self', countWhat: { kind: 'cardColor', color: 'yellow' }, vpPer: 1 }],
    description: '1 VP per yellow (commerce) card.' },
  // Alexander: +1 VP per victory token (any of 1, 3, 5).
  { name: 'Alexander',  cost: 3,
    effects: [{ kind: 'leaderScoreExtra', rule: { type: 'alexanderTokenBonus' } }],
    description: '+1 VP per existing victory token (1/3/5 tokens become 2/4/6).' },
  // Midas: +1 VP per 3 coins.
  { name: 'Midas',      cost: 3,
    effects: [{ kind: 'leaderScoreExtra', rule: { type: 'midasCoinBonus' } }],
    description: '+1 VP per 3 coins (stacks with treasury → 2 VP per 3 coins).' },

  // ----- Tier (d): cost modifiers -----
  { name: 'Archimedes', cost: 4,
    effects: [{ kind: 'leaderCostModifier', target: 'cardColor', targetColor: 'green', remove: 'oneResource' }],
    description: 'Green (science) cards cost 1 fewer resource.' },
  { name: 'Hammurabi',  cost: 3,
    effects: [{ kind: 'leaderCostModifier', target: 'cardColor', targetColor: 'blue', remove: 'oneResource' }],
    description: 'Blue (civilian) cards cost 1 fewer resource.' },
  { name: 'Leonidas',   cost: 2,
    effects: [{ kind: 'leaderCostModifier', target: 'cardColor', targetColor: 'red', remove: 'oneResource' }],
    description: 'Red (military) cards cost 1 fewer resource.' },
  { name: 'Imhotep',    cost: 3,
    effects: [{ kind: 'leaderCostModifier', target: 'wonderStage', remove: 'oneResource' }],
    description: 'Wonder stages cost 1 fewer resource.' },
  { name: 'Maecenas',   cost: 1,
    effects: [{ kind: 'leaderCostModifier', target: 'leader', remove: 'allCoins' }],
    description: 'Future leaders cost 0 coins.' },
  { name: 'Ramses',     cost: 3,
    effects: [{ kind: 'leaderCostModifier', target: 'guild', remove: 'allResources' }],
    description: 'Future guilds (purple) cost no resources.' },

  // ----- Tier (e): on-play triggers -----
  { name: 'Hatshepsut', cost: 2,
    effects: [{ kind: 'leaderTrigger', on: { type: 'neighborPurchase' }, reward: { coins: 1 } }],
    description: 'Each turn, your first neighbor purchase refunds 1 coin (max 1/turn).' },
  { name: 'Nero',       cost: 1,
    effects: [{ kind: 'leaderTrigger', on: { type: 'militaryWin' }, reward: { coins: 2 } }],
    description: 'When you win a conflict, gain 2 coins.' },
  { name: 'Xenophon',   cost: 3,
    effects: [{ kind: 'leaderTrigger', on: { type: 'buildCardColor', color: 'yellow' }, reward: { coins: 2 } }],
    description: 'When you build a yellow card, gain 2 coins.' },
  { name: 'Vitruvius',  cost: 1,
    effects: [{ kind: 'leaderTrigger', on: { type: 'buildViaChain' }, reward: { coins: 2 } }],
    description: 'When you build via a chain, gain 2 coins.' },

  // ----- Tier (f): activated ability -----
  { name: 'Bilkis',     cost: 4,
    effects: [{ kind: 'leaderActivated', ability: 'bilkis' }],
    description: 'Once per turn, pay 1 coin to gain 1 of any resource for this turn\'s build.' },

  // ----- Tier (g): set-completion scoring -----
  { name: 'Aristotle',  cost: 3,
    effects: [{ kind: 'leaderScoreExtra', rule: { type: 'completeScienceSet', vpPerSet: 3 } }],
    description: '+3 VP per completed set of 3 different science symbols.' },
  { name: 'Justinian',  cost: 3,
    effects: [{ kind: 'leaderScoreExtra', rule: { type: 'completeRGBSet', vpPerSet: 3 } }],
    description: '+3 VP per complete {red, blue, green} triple.' },
  { name: 'Plato',      cost: 4,
    effects: [{ kind: 'leaderScoreExtra', rule: { type: 'completeAllColorsSet', vpPerSet: 7 } }],
    description: '+7 VP per complete set of all 7 card colors.' },

  // ----- Tier (h): on-recruit effect -----
  { name: 'Solomon',    cost: 3,
    effects: [{ kind: 'leaderOnRecruit', effect: 'solomonBuildFromDiscard' }],
    description: 'On play, take any card from the discard pile and build it for free.' },

  // ----- Tier (e) extra: Tomyris (defeat tokens go to victor) -----
  // Modeled as a future enhancement; for now a 0-effect placeholder so the
  // card is in the deck. The defeat-rerouting mechanic isn't wired into the
  // base reducer; flagged in CLAUDE.md "not modeled".
  { name: 'Tomyris',    cost: 4, effects: [],
    description: 'After play, defeats you receive in conflict go to the victor instead. (Not modeled in v1.)' },
];

// ID counter starts well above the base card ids (which top out at a few hundred
// after deck padding) to keep types serializable but clearly distinct.
let _nextLeaderId = 10000;

export function buildLeaderDeck(): SwCard[] {
  return LEADERS.map<SwCard>((t) => ({
    id: _nextLeaderId++,
    name: t.name,
    age: 1, // leaders aren't tied to an age — using 1 as a placeholder
    color: 'leader',
    minPlayers: 3,
    maxPlayers: 7,
    cost: { coins: t.cost },
    effects: t.effects,
  }));
}

export function resetLeaderIdCounter(start: number = 10000): void {
  _nextLeaderId = start;
}

export const ALL_LEADER_NAMES = LEADERS.map((t) => t.name);
export const LEADER_COUNT = LEADERS.length;
