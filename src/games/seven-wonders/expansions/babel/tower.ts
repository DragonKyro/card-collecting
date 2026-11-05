// Babel — the Tower of Babel module.
//
// Before Age I (after the Leaders draft), each city is dealt 3 tiles and
// drafts them: keep one, pass the rest to the right, keep one of the two
// received, pass the last. During the game a city may discard its card (or,
// with Leaders, a leader) to build one of its tiles instead of the usual
// three actions. Tiles go on the tower once the turn is resolved, clockwise
// space by space (several in one turn: lowest number first); the tower has 3
// spaces at 2–4 players and 4 at 5–8, and once full the next tiles cover the
// oldest, spiralling up. A tile's rule applies to everyone while it shows.
// At the end: 1 / 2 / 3 tiles built → 2 / 5 / 10 VP.
//
// Reading where the rulebook text is short: taxes (tiles 1, 6, 13, 16) apply
// to builds that pay a cost — a free build (Olympia, a free-build token,
// Caligula, Halicarnassus, Solomon) pays no tax.

import type { PlayerId } from '@/core/types';
import { nextSimultaneousSeat } from '@/core/seats';
import { shuffle } from '@/core/rng';
import type { SwAction, SwCost, SwPendingPick, SwPlayer, SwState } from '../../types';
import { RAW_RESOURCES } from '../../types';
import type { SwExpansion, SwTurnEndStep, SwProductionRules } from '../types';
import { beginPregame, gainFromBank, playerById, pushLog, setActiveAIIfAny } from '../../reducer';
import { neighborsOf } from '../../resources';
import { BABEL_TILES, towerVp } from './cards';

const DRAFT_SIZE = 3;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/** Spaces on the tower: 3 at 2–4 players, 4 at 5–8. */
export function towerSpaces(playerCount: number): number {
  return playerCount <= 4 ? 3 : 4;
}

/** The tiles showing (their rules in force). */
export function activeTiles(state: SwState): Set<number> {
  const out = new Set<number>();
  for (const stack of state.babelTower ?? []) if (stack.length > 0) out.add(stack[stack.length - 1]);
  return out;
}

function on(state: SwState, id: number): boolean {
  return activeTiles(state).has(id);
}

// ----- Draft -----

function pregameTower(state: SwState): boolean {
  if (state.babelDraftRound !== undefined) return false;
  const tiles = shuffle(state.rngState, BABEL_TILES.map((t) => t.id));
  state.babelDraftHands = {};
  for (const p of state.players) {
    state.babelDraftHands[p.id] = tiles.splice(0, DRAFT_SIZE);
    p.babelHand = [];
    p.babelDraftPick = null;
  }
  state.babelDraftRound = 1;
  state.subPhase = 'babelDraft';
  return true;
}

function handleDraft(state: SwState, playerId: PlayerId, tileId: number): SwState {
  if (state.subPhase !== 'babelDraft') throw new Error('submitBabelDraft: not drafting tiles');
  const s = clone(state);
  const p = playerById(s, playerId);
  if (p.babelDraftPick != null) throw new Error('Already picked this round.');
  if (!(s.babelDraftHands?.[playerId] ?? []).includes(tileId)) throw new Error(`Tile ${tileId} is not in your draft hand.`);
  p.babelDraftPick = tileId;
  if (s.players.some((x) => x.babelDraftPick == null)) {
    setActiveAIIfAny(s);
    return s;
  }
  const hands = s.babelDraftHands!;
  for (const x of s.players) {
    const hand = hands[x.id];
    hand.splice(hand.indexOf(x.babelDraftPick!), 1);
    (x.babelHand ??= []).push(x.babelDraftPick!);
    x.babelDraftPick = null;
  }
  s.babelDraftRound = (s.babelDraftRound ?? 1) + 1;
  // Pass to the right: player i takes the hand of the player on its left.
  const n = s.players.length;
  const byIdx = s.players.map((x) => hands[x.id]);
  for (let i = 0; i < n; i++) hands[s.players[i].id] = byIdx[(i - 1 + n) % n];
  if (s.babelDraftRound === DRAFT_SIZE) {
    // The last tile is simply kept.
    for (const x of s.players) (x.babelHand ??= []).push(...hands[x.id]);
    s.babelDraftHands = {};
    s.babelDraftRound = 0;
    beginPregame(s);
    return s;
  }
  setActiveAIIfAny(s);
  return s;
}

// ----- Building a tile -----

function validateTile(_state: SwState, player: SwPlayer, pick: SwPendingPick): void {
  if (pick.kind !== 'babelTile') return;
  if (!(player.babelHand ?? []).includes(pick.tileId)) throw new Error(`Tile ${pick.tileId} is not in your hand.`);
}

function onTilePicked(state: SwState, player: SwPlayer, pick: SwPendingPick): void {
  if (pick.kind !== 'babelTile') return;
  player.babelHand = (player.babelHand ?? []).filter((t) => t !== pick.tileId);
  (state.babelPending ??= []).push({ playerId: player.id, tileId: pick.tileId });
}

/** End of turn: the turn's tiles go on the tower, lowest number first. */
const PLACE_STEP: SwTurnEndStep = {
  order: 40,
  run(state) {
    const pending = (state.babelPending ?? []).slice().sort((a, b) => a.tileId - b.tileId);
    state.babelPending = [];
    for (const { playerId, tileId } of pending) {
      const tower = (state.babelTower ??= Array.from({ length: towerSpaces(state.players.length) }, () => []));
      const space = (state.babelNextSpace ?? 0) % tower.length;
      const covered = tower[space].length > 0 ? tower[space][tower[space].length - 1] : null;
      tower[space].push(tileId);
      state.babelNextSpace = space + 1;
      const p = playerById(state, playerId);
      p.babelBuilt = (p.babelBuilt ?? 0) + 1;
      pushLog(state, { kind: 'babelPlaced', playerId, tileId, covered });
    }
    return false;
  },
};

// ----- The tiles' rules -----

function ageCoins(state: SwState): number {
  return state.age;
}

function modifyCost(state: SwState, _player: SwPlayer, target: Parameters<NonNullable<SwExpansion['modifyCost']>>[2], cost: SwCost): SwCost {
  const active = activeTiles(state);
  if (active.size === 0) return cost;
  const out: SwCost = { ...cost, resources: cost.resources?.slice() };
  const addCoins = (n: number) => { out.coins = (out.coins ?? 0) + n; };
  const toCoins = () => { addCoins(out.resources?.length ?? 0); out.resources = []; };
  if (target.kind === 'card') {
    const color = target.card.color;
    if (color === 'red' && active.has(2)) out.resources = [];
    if (color === 'blue' && active.has(8)) toCoins();
    if (color === 'purple' && active.has(23)) toCoins();
    if (color === 'red' && active.has(1)) addCoins(ageCoins(state));
    if (color === 'blue' && active.has(6)) addCoins(ageCoins(state));
  } else if (target.kind === 'chain') {
    const color = target.card.color;
    if (active.has(13)) addCoins(ageCoins(state));
    if (color === 'red' && active.has(1)) addCoins(ageCoins(state));
    if (color === 'blue' && active.has(6)) addCoins(ageCoins(state));
  } else if (target.kind === 'wonderStage') {
    if (active.has(15)) out.resources = [];
    if (active.has(16)) addCoins(ageCoins(state));
  }
  return out;
}

function tradePrice(state: SwState, _buyer: SwPlayer, resource: string, price: number): number {
  const active = activeTiles(state);
  const raw = (RAW_RESOURCES as readonly string[]).includes(resource);
  let p = price;
  if (raw && active.has(11)) p -= 1;
  if (raw && active.has(12)) p += 1;
  if (!raw && active.has(9)) p -= 1;
  if (!raw && active.has(10)) p += 1;
  return p;
}

function productionRules(state: SwState): SwProductionRules {
  const active = activeTiles(state);
  const rules: SwProductionRules = {};
  if (active.has(3)) rules.blockMultiBrown = true;
  if (active.has(20)) rules.unlimitedSingleBrown = true;
  if (active.has(4)) rules.disableYellowTrade = true;
  const free = [];
  if (active.has(17)) free.push(['wood', 'stone'] as const);
  if (active.has(18)) free.push(['ore', 'clay'] as const);
  if (active.has(21)) free.push(['glass', 'loom', 'papyrus'] as const);
  if (free.length) rules.freeChoices = free.map((f) => [...f]);
  return rules;
}

export const towerExpansion: SwExpansion = {
  id: 'babelTower',
  label: 'Babel: Tower of Babel',

  setupMatch(state) {
    state.babelTower = Array.from({ length: towerSpaces(state.players.length) }, () => []);
    state.babelNextSpace = 0;
    state.babelPending = [];
    for (const p of state.players) {
      p.babelHand = [];
      p.babelBuilt = 0;
    }
    delete state.babelDraftRound;
  },
  pregame: pregameTower,

  applyAction(state: SwState, action: SwAction) {
    if (action.type === 'submitBabelDraft') return handleDraft(state, action.playerId, action.tileId);
    return undefined;
  },
  ownsSubPhase: (sub) => sub === 'babelDraft',
  nextAIPicker: (state) => nextSimultaneousSeat(state.seats, state.players.filter((p) => p.babelDraftPick == null).map((p) => p.id)),

  pickKinds: ['babelTile'],
  validatePick: validateTile,
  onPickPlaced: onTilePicked,
  turnEndSteps: [PLACE_STEP],

  modifyCost,
  tradePrice,
  productionRules,
  chainSources(state, player) {
    if (!on(state, 7)) return [];
    const { west, east } = neighborsOf(state, player.id);
    return [...west.tableau, ...east.tableau];
  },
  onEvent(state, event) {
    if (event.kind !== 'cardBuilt') return;
    const active = activeTiles(state);
    const p = playerById(state, event.playerId);
    if (event.card.color === 'blue' && active.has(5)) gainFromBank(state, p, ageCoins(state));
    if (event.viaChain && active.has(14)) gainFromBank(state, p, ageCoins(state));
    if (event.card.color === 'purple' && active.has(24)) gainFromBank(state, p, 5);
  },
  victoryToken(state, vp) {
    if (!on(state, 19)) return vp;
    return vp === 5 ? 3 : vp === 3 ? 1 : 0;
  },
  defeatTokens: (state) => (on(state, 22) ? 2 : 1),

  scoreExtras: (_state, player) => ({ tower: towerVp(player.babelBuilt ?? 0) }),
  scoreCategories: ['tower'],
};
