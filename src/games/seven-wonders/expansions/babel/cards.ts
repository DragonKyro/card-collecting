// 7 Wonders Babel — the 24 Tower of Babel tiles and the 15 Great Projects.
//
// Tiles (numbered as printed; they carry no names). Each changes the rules for
// every city while it shows on the tower:
//   1 / 6 / 16 / 13  tax (1/2/3 coins by Age) on building a red / blue card,
//                    a wonder stage, or through a chain
//   2 / 15           red cards / wonder stages cost no resources (coins stay)
//   3                brown cards producing two units or a choice produce nothing
//   4                the trading posts, Marketplace, Caravansery and Forum are off
//   5 / 14           1/2/3 coins by Age for building a blue card / through a chain
//   7                chains may use the neighbours' buildings too
//   8 / 23           blue / purple cards cost as many coins as they list resources
//   9 / 10           manufactured goods from neighbours 1 coin cheaper / dearer
//   11 / 12          raw materials from neighbours 1 coin cheaper / dearer
//   17 / 18 / 21     a free wood-or-stone / ore-or-clay / glass-loom-or-papyrus a turn
//   19               victory tokens one step lower (1 → none, 3 → 1, 5 → 3)
//   20               single-resource brown cards produce any amount
//   22               a lost battle gives 2 defeat tokens
//   24               5 coins for building a guild
// Great Projects: 5 per Age, one revealed each Age. Build a card of its colour
// and pay its participation cost to take a participation token. If every
// token is taken by the end of the Age, each participant gets the reward per
// token; otherwise everyone without one suffers the penalty (or takes a
// penalty token, −1/−2/−3, if they can't).

import type { SwBabelTile, SwGreatProject } from '../../types';

export const BABEL_TILES: readonly SwBabelTile[] = [
  { id: 1, name: 'Tile 1', text: 'Building a red card costs 1/2/3 coins more (Age I/II/III), paid to the bank.' },
  { id: 2, name: 'Tile 2', text: 'Red cards cost no resources (coins are still paid).' },
  { id: 3, name: 'Tile 3', text: 'Brown cards with two resources or a choice produce nothing (they can still be built).' },
  { id: 4, name: 'Tile 4', text: 'The trading posts, Marketplace, Caravansery and Forum have no effect (they can still be built).' },
  { id: 5, name: 'Tile 5', text: 'Building a blue card earns 1/2/3 coins (Age I/II/III).' },
  { id: 6, name: 'Tile 6', text: 'Building a blue card costs 1/2/3 coins more (Age I/II/III), paid to the bank.' },
  { id: 7, name: 'Tile 7', text: 'Chains may use the buildings of both neighbouring cities.' },
  { id: 8, name: 'Tile 8', text: 'Blue cards cost as many coins as they list resources, instead of the resources (chains stay free).' },
  { id: 9, name: 'Tile 9', text: 'Manufactured goods bought from neighbours cost 1 coin less.' },
  { id: 10, name: 'Tile 10', text: 'Manufactured goods bought from neighbours cost 1 coin more.' },
  { id: 11, name: 'Tile 11', text: 'Raw materials bought from neighbours cost 1 coin less.' },
  { id: 12, name: 'Tile 12', text: 'Raw materials bought from neighbours cost 1 coin more.' },
  { id: 13, name: 'Tile 13', text: 'Building through a chain costs 1/2/3 coins (Age I/II/III), paid to the bank.' },
  { id: 14, name: 'Tile 14', text: 'Building through a chain earns 1/2/3 coins (Age I/II/III).' },
  { id: 15, name: 'Tile 15', text: 'Wonder stages cost no resources (coins are still paid).' },
  { id: 16, name: 'Tile 16', text: 'Building a wonder stage costs 1/2/3 coins more (Age I/II/III), paid to the bank.' },
  { id: 17, name: 'Tile 17', text: 'Every city produces a wood or a stone each turn.' },
  { id: 18, name: 'Tile 18', text: 'Every city produces an ore or a clay each turn.' },
  { id: 19, name: 'Tile 19', text: 'Victory tokens are one step lower: 1 → nothing, 3 → 1, 5 → 3.' },
  { id: 20, name: 'Tile 20', text: 'Brown cards producing a single resource produce any amount of it.' },
  { id: 21, name: 'Tile 21', text: 'Every city produces a glass, a loom or a papyrus each turn.' },
  { id: 22, name: 'Tile 22', text: 'A lost battle gives 2 defeat tokens instead of 1.' },
  { id: 23, name: 'Tile 23', text: 'Guilds cost as many coins as they list resources, instead of the resources (chains stay free).' },
  { id: 24, name: 'Tile 24', text: 'Building a guild earns 5 coins.' },
];

export function babelTileById(id: number): SwBabelTile {
  const t = BABEL_TILES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown Babel tile ${id}`);
  return t;
}

/** VP for the tiles a city put on the tower: 1 → 2, 2 → 5, 3 → 10. */
export function towerVp(built: number): number {
  return built >= 3 ? 10 : built === 2 ? 5 : built === 1 ? 2 : 0;
}

export const GREAT_PROJECTS: readonly SwGreatProject[] = [
  // ----- Age I -----
  { id: 'belvedere', name: 'Belvedere', age: 1, color: 'blue', cost: { coins: 1, resources: ['clay'] },
    reward: { kind: 'freeStage' }, penalty: { kind: 'discardColor', color: 'red' } },
  { id: 'cranes', name: 'Cranes', age: 1, color: 'green', cost: { coins: 1 },
    reward: { kind: 'freeBuild' }, penalty: { kind: 'discardColor', color: 'brown' } },
  { id: 'double-walls', name: 'Double Walls', age: 1, color: 'red', cost: { coins: 1 },
    reward: { kind: 'victoryToken', vp: 1 }, penalty: { kind: 'blockResource' } },
  { id: 'factory', name: 'Factory', age: 1, color: 'brown', cost: { coins: 2 },
    reward: { kind: 'anyColor' }, penalty: { kind: 'discardColor', color: 'gray' } },
  { id: 'rampart-road', name: 'Rampart Road', age: 1, color: 'yellow', cost: { coins: 1, resources: ['stone'] },
    reward: { kind: 'coins', amount: 4 }, penalty: { kind: 'allCoins' } },
  // ----- Age II -----
  { id: 'obelisk', name: 'Obelisk', age: 2, color: 'blue', cost: { coins: 1, resources: ['papyrus'] },
    reward: { kind: 'shield', shields: 1 }, penalty: { kind: 'discardColor', color: 'brown' } },
  { id: 'river-port', name: 'River Port', age: 2, color: 'yellow', cost: { coins: 1, resources: ['loom'] },
    reward: { kind: 'coins', amount: 6 }, penalty: { kind: 'allCoins' } },
  { id: 'sewer-network', name: 'Sewer Network', age: 2, color: 'green', cost: { coins: 2 },
    reward: { kind: 'freeBuild' }, penalty: { kind: 'discardColor', color: 'red' } },
  { id: 'smelter', name: 'Smelter', age: 2, color: 'brown', cost: { coins: 2 },
    reward: { kind: 'stages', vp: 1 }, penalty: { kind: 'discardColor', color: 'gray' } },
  { id: 'war-mirror', name: 'War Mirror', age: 2, color: 'red', cost: { coins: 2, resources: ['glass'] },
    reward: { kind: 'victoryToken', vp: 3 }, penalty: { kind: 'discardColor', color: 'blue' } },
  // ----- Age III -----
  { id: 'archives', name: 'Archives', age: 3, color: 'green', cost: { coins: 4 },
    reward: { kind: 'scienceSets', vp: 3 }, penalty: { kind: 'discardColor', color: 'blue' } },
  { id: 'giant-trebuchet', name: 'Giant Trebuchet', age: 3, color: 'red', cost: { coins: 5, resources: ['wood'] },
    reward: { kind: 'victoryToken', vp: 5 }, penalty: { kind: 'allCoins' } },
  { id: 'grand-bazaar', name: 'Grand Bazaar', age: 3, color: 'yellow', cost: { coins: 4, resources: ['ore'] },
    reward: { kind: 'coins', amount: 12 }, penalty: { kind: 'discardColor', color: 'red' } },
  { id: 'menagerie', name: 'Menagerie', age: 3, color: 'purple', cost: { coins: 4 },
    reward: { kind: 'guilds', vp: 1 }, penalty: { kind: 'discardColor', color: 'green' } },
  { id: 'triumphal-arches', name: 'Triumphal Arches', age: 3, color: 'blue', cost: { coins: 5 },
    reward: { kind: 'shield', shields: 2 }, penalty: { kind: 'victoryTokens', count: 2 } },
];

export function greatProjectById(id: string): SwGreatProject {
  const p = GREAT_PROJECTS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown Great Project ${id}`);
  return p;
}

export function rewardText(r: SwGreatProject['reward']): string {
  switch (r.kind) {
    case 'coins': return `${r.amount} coins`;
    case 'shield': return r.shields === 1 ? 'a shield token' : `a ${r.shields}-shield token`;
    case 'victoryToken': return `a ${r.vp}-VP victory token`;
    case 'freeBuild': return 'a token to build a card for free';
    case 'freeStage': return 'a token to build a wonder stage for free';
    case 'anyColor': return 'a token to join a later project with a card of any colour';
    case 'scienceSets': return `+${r.vp} VP per set of the three science symbols`;
    case 'guilds': return `${r.vp} VP per guild in your city and both neighbours’`;
    case 'stages': return `${r.vp} VP per wonder stage you built`;
  }
}

export function penaltyText(p: SwGreatProject['penalty']): string {
  switch (p.kind) {
    case 'discardColor': return `discard a ${p.color} card of your city`;
    case 'allCoins': return 'lose all your coins';
    case 'victoryTokens': return `discard ${p.count} victory tokens`;
    case 'blockResource': return 'lose your board’s starting resource for the rest of the game';
  }
}
