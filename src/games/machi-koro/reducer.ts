// Machi Koro reducer (both editions — see types.ts for the turn outline).
//
// subPhase flow:
//   setupBuild (MK2 opening rounds: build an establishment or pass)
//   roll → [reroll (MK1 Radio Tower)] → [harbor (+2)] → resolve
//        → [demolish]* → [give]* → [tvTarget] → [renovate] → [exhibit] → [exchange]* → [gift] → build
//   build: build one card or pass (MK1 Tech Startup: maybe invest 1) → next
//          turn (or the same player on an extra turn)
//
// Resolution order (rulebook): red cards (opponents', counter-clockwise from the
// roller, each paid in full before the next) → blue (everyone) + green (roller)
// → purple (roller) → ongoing landmarks (Tech Startup, Renovation Company,
// Temple, then City Hall / Charterhouse if the roller received nothing, then
// Amusement Park, Moving Company). A copy closed for renovation reopens
// instead of activating. Choices queue behind the coin effects, in the order
// above. The "1 coin when broke" rule (MK2, or MK1's City Hall) applies on
// entering the build step.

import { createRng, rngInt, shuffle } from '@/core/rng';
import type { PlayerId, Seat } from '@/core/types';
import type {
  MkAction, MkConfig, MkEstEffect, MkEstablishmentDef, MkLandmarkDef, MkLandmarkEffect, MkLogEntry,
  MkMarketRow, MkPlayer, MkRowId, MkSource, MkState, MkSymbol, MkTurn,
} from './types';
import {
  estDef, isEstablishment, isLandmark, landmarkPool, lmDef, rowOf, rowSize, rulesFor, supplyCopies,
  type MkEditionRules,
} from './cards';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: MkState, entry: DistributiveOmit<MkLogEntry, 'seq' | 'turn'>): void {
  state.logSeq += 1;
  state.log.push({ ...entry, seq: state.logSeq, turn: state.turnNumber } as MkLogEntry);
}

export function rulesOf(state: MkState): MkEditionRules {
  return rulesFor(state.config);
}

export function freshTurn(): MkTurn {
  return {
    roll: null, rerolled: false, received: 0, built: null, extraTurn: false,
    exchangesLeft: 0, tvLeft: 0, giftOwed: false,
    demolishLeft: 0, givesLeft: 0, renovateLeft: 0, exhibitLeft: 0, bonusRoll: null,
  };
}

export function activePlayer(state: MkState): MkPlayer {
  return state.players[state.currentIdx];
}

export function playerById(state: MkState, id: PlayerId): MkPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

/** Everyone but `idx`, counter-clockwise (the player on idx's right first) —
 *  the order red cards and "each opponent" effects are paid in. */
export function counterClockwiseFrom(state: MkState, idx: number): MkPlayer[] {
  const n = state.players.length;
  const out: MkPlayer[] = [];
  for (let k = 1; k < n; k++) out.push(state.players[(idx - k + n) % n]);
  return out;
}

/** Everyone, in turn order starting at `idx`. */
function turnOrderFrom(state: MkState, idx: number): MkPlayer[] {
  const n = state.players.length;
  return Array.from({ length: n }, (_, k) => state.players[(idx + k) % n]);
}

/** The player on `idx`'s right — the one who played just before them. */
export function rightOf(state: MkState, idx: number): MkPlayer {
  const n = state.players.length;
  return state.players[(idx - 1 + n) % n];
}

// ---------- Board queries ----------

export function countSymbol(state: MkState, player: MkPlayer, symbol: MkSymbol): number {
  if (symbol === 'none') return 0;
  let n = 0;
  for (const [id, copies] of Object.entries(player.city)) {
    if (estDef(state.config.edition, id).symbol === symbol) n += copies;
  }
  return n;
}

export function establishmentCount(player: MkPlayer): number {
  let n = 0;
  for (const c of Object.values(player.city)) n += c;
  return n;
}

export function closedCount(player: MkPlayer, cardId: string): number {
  return player.closed[cardId] ?? 0;
}

/** Copies of `cardId` that aren't closed for renovation. */
export function openCount(player: MkPlayer, cardId: string): number {
  return (player.city[cardId] ?? 0) - closedCount(player, cardId);
}

/** Landmarks `player` has built, not counting a City Hall everyone starts with. */
export function landmarksBuilt(state: MkState, player: MkPlayer): number {
  return player.landmarks.filter((id) => !lmDef(state.config.edition, id).prebuilt).length;
}

/** Whether `def`'s condition lets it pay `owner` while `roller` takes the turn. */
export function conditionHolds(state: MkState, def: MkEstablishmentDef, owner: MkPlayer, roller: MkPlayer): boolean {
  const c = def.condition;
  if (!c) return true;
  switch (c.kind) {
    case 'ownerHas': return owner.landmarks.includes(c.landmark);
    case 'ownerBelow': return landmarksBuilt(state, owner) < c.landmarks;
    case 'rollerAtLeast': return landmarksBuilt(state, roller) >= c.landmarks;
  }
}

/** Every built landmark with its builder. */
function allBuiltLandmarks(state: MkState): { def: MkLandmarkDef; ownerId: PlayerId }[] {
  const out: { def: MkLandmarkDef; ownerId: PlayerId }[] = [];
  for (const p of state.players) {
    for (const id of p.landmarks) out.push({ def: lmDef(state.config.edition, id), ownerId: p.id });
  }
  return out;
}

/** Ongoing landmarks whose rule applies to `playerId` right now. */
export function landmarksInForce(state: MkState, playerId: PlayerId): { def: MkLandmarkDef; ownerId: PlayerId }[] {
  return allBuiltLandmarks(state).filter(
    ({ def, ownerId }) => def.timing === 'ongoing' && (def.scope === 'everyone' || ownerId === playerId),
  );
}

function inForce<K extends MkLandmarkEffect['kind']>(
  state: MkState, playerId: PlayerId, kind: K,
): { def: MkLandmarkDef & { effect: Extract<MkLandmarkEffect, { kind: K }> }; ownerId: PlayerId }[] {
  return landmarksInForce(state, playerId).filter((l) => l.def.effect.kind === kind) as {
    def: MkLandmarkDef & { effect: Extract<MkLandmarkEffect, { kind: K }> }; ownerId: PlayerId;
  }[];
}

/** Extra coins each copy of `def` earns its owner (Forge, Soda Bottling Plant…). */
export function symbolBonus(state: MkState, ownerId: PlayerId, def: MkEstablishmentDef): number {
  let bonus = 0;
  for (const { def: lm } of inForce(state, ownerId, 'symbolBonus')) {
    if (lm.effect.symbols.includes(def.symbol)) bonus += lm.effect.amount;
  }
  return bonus;
}

export function canRollTwo(state: MkState, playerId: PlayerId): boolean {
  return rulesOf(state).twoDiceForAll || inForce(state, playerId, 'twoDice').length > 0;
}

/** What the Harbor lets `playerId` add to a roll of `total` (0 = nothing). */
export function rollBoost(state: MkState, playerId: PlayerId, total: number): number {
  let best = 0;
  for (const { def } of inForce(state, playerId, 'addToRoll')) {
    if (total >= def.effect.min) best = Math.max(best, def.effect.amount);
  }
  return best;
}

/** The owner's establishment with this effect kind, if they have one. */
function ownedWith(state: MkState, player: MkPlayer, kind: MkEstEffect['kind']): MkEstablishmentDef | null {
  for (const id of Object.keys(player.city)) {
    const d = estDef(state.config.edition, id);
    if (d.effect.kind === kind) return d;
  }
  return null;
}

/** The match's establishment with this effect kind (for a choice it queued). */
function cardWith(state: MkState, kind: MkEstEffect['kind']): MkEstablishmentDef {
  const d = rulesOf(state).establishments.find((x) => x.effect.kind === kind);
  if (!d) throw new Error(`no ${kind} card in this match`);
  return d;
}

function lmSource(def: MkLandmarkDef, ownerId: PlayerId): MkSource {
  return { type: 'lm', id: def.id, ownerId };
}

function estSource(def: MkEstablishmentDef, owner: MkPlayer, copies: number): MkSource {
  return { type: 'est', id: def.id, ownerId: owner.id, copies };
}

// ---------- Coins ----------

/** Move up to `owed` coins between players; the payer pays what they can and
 *  the bank never covers the rest. */
function transfer(state: MkState, from: MkPlayer, to: MkPlayer, owed: number, source: MkSource): void {
  if (owed <= 0 || from === to) return;
  const amount = Math.min(owed, from.coins);
  from.coins -= amount;
  to.coins += amount;
  if (to === activePlayer(state)) state.turn.received += amount;
  pushLog(state, { kind: 'coins', to: to.id, from: from.id, amount, owed, source });
}

function fromBank(state: MkState, to: MkPlayer, amount: number, source: MkSource): void {
  if (amount <= 0) return;
  to.coins += amount;
  if (to === activePlayer(state)) state.turn.received += amount;
  pushLog(state, { kind: 'coins', to: to.id, from: null, amount, owed: amount, source });
}

/** Pay up to `owed` coins to the bank. */
function toBank(state: MkState, from: MkPlayer, owed: number, source: MkSource): void {
  if (owed <= 0) return;
  const amount = Math.min(owed, from.coins);
  from.coins -= amount;
  pushLog(state, { kind: 'payBank', from: from.id, amount, owed, source });
}

/** Share every player's coins out evenly — as evenly as possible, the bank
 *  making up the difference: everyone ends on ceil(total / players). */
function redistribute(state: MkState, source: MkSource): void {
  const total = state.players.reduce((a, p) => a + p.coins, 0);
  const each = Math.ceil(total / state.players.length);
  for (const p of state.players) p.coins = each;
  pushLog(state, { kind: 'redistribute', each, fromBank: each * state.players.length - total, source });
}

// ---------- Setup ----------

export function createMatch(config: MkConfig, seed: number, seats: Seat[]): MkState {
  const state: MkState = {
    phase: 'playing',
    seats,
    activePlayerId: null,
    finalScores: null,
    rngState: createRng(seed),
    config,
    players: seats.map((s) => ({ id: s.id, coins: 0, city: {}, closed: {}, landmarks: [], invested: 0 })),
    firstIdx: 0,
    currentIdx: 0,
    setupRound: 0,
    round: 0,
    turnNumber: 0,
    subPhase: 'roll',
    market: emptyMarket(),
    turn: freshTurn(),
    winnerId: null,
    winReason: null,
    log: [],
    logSeq: 0,
  };
  if (seats.length >= 2) setupMatch(state);
  return state;
}

function emptyMarket(): Record<MkRowId, MkMarketRow> {
  return {
    low: { deck: [], slots: [] }, high: { deck: [], slots: [] }, landmark: { deck: [], slots: [] }, mixed: { deck: [], slots: [] },
    major: { deck: [], slots: [] },
  };
}

/** Deal the market and pick a first player. Mutates `state` (players already seated). */
export function setupMatch(state: MkState): void {
  const R = rulesOf(state);
  const ed = state.config.edition;
  for (const p of state.players) {
    p.coins = R.startCoins;
    p.city = { ...R.startCity };
    p.closed = {};
    p.landmarks = [...R.startLandmarks];
    p.invested = 0;
  }
  const copies = (d: MkEstablishmentDef) => supplyCopies(R, d, state.players.length);
  const copiesOf = (defs: MkEstablishmentDef[]) => defs.flatMap((d) => Array<string>(copies(d)).fill(d.id));
  const low = R.establishments.filter((d) => rowOf(R, d.id) === 'low');
  const high = R.establishments.filter((d) => rowOf(R, d.id) === 'high');
  state.market = emptyMarket();
  if (R.market === 'rows') {
    state.market.low.deck = shuffle(state.rngState, copiesOf(low));
    state.market.high.deck = shuffle(state.rngState, copiesOf(high));
    state.market.landmark.deck = shuffle(state.rngState, landmarkPool(ed, state.config.promoLandmarks).map((l) => l.id));
    for (const row of ['low', 'high', 'landmark'] as const) refillRow(state.market[row], rowSize(row));
  } else if (R.market === 'marketplace') {
    state.market.mixed.deck = shuffle(state.rngState, copiesOf(R.establishments));
    refillRow(state.market.mixed, rowSize('mixed'));
  } else if (R.market === 'hybrid') {
    const major = R.establishments.filter((d) => rowOf(R, d.id) === 'major');
    state.market.low.deck = shuffle(state.rngState, copiesOf(low));
    state.market.high.deck = shuffle(state.rngState, copiesOf(high));
    state.market.major.deck = shuffle(state.rngState, copiesOf(major));
    for (const row of ['low', 'high', 'major'] as const) refillRow(state.market[row], rowSize(row));
  } else {
    const open = (defs: MkEstablishmentDef[]): MkMarketRow => ({
      deck: [], slots: defs.map((d) => ({ cardId: d.id, count: copies(d) })),
    });
    state.market.low = open(low);
    state.market.high = open(high);
  }
  state.firstIdx = rngInt(state.rngState, state.players.length);
  state.currentIdx = state.firstIdx;
  state.turnNumber = 1;
  state.turn = freshTurn();
  state.winnerId = null;
  state.winReason = null;
  if (R.setupRounds > 0) {
    state.setupRound = 1;
    state.round = 0;
    state.subPhase = 'setupBuild';
  } else {
    state.setupRound = 0;
    state.round = 1;
    state.subPhase = 'roll';
  }
  state.activePlayerId = activePlayer(state).id;
  pushLog(state, { kind: 'firstPlayer', playerId: activePlayer(state).id });
}

/** Top a row back up to `size` different stacks. A drawn duplicate stacks on
 *  its twin; the first new stack fills the gap at `gapAt` so the row doesn't shuffle. */
function refillRow(row: MkMarketRow, size: number, gapAt?: number): void {
  let gap = gapAt;
  while (row.slots.length < size && row.deck.length > 0) {
    const id = row.deck.shift()!;
    const twin = row.slots.find((s) => s.cardId === id);
    if (twin) {
      twin.count += 1;
    } else if (gap !== undefined && gap <= row.slots.length) {
      row.slots.splice(gap, 0, { cardId: id, count: 1 });
      gap = undefined;
    } else {
      row.slots.push({ cardId: id, count: 1 });
    }
  }
}

// ---------- Building ----------

/** What `player` would pay for `cardId` (before checking they can afford it).
 *  Negative = building it pays them (Loan Office). */
export function priceOf(state: MkState, player: MkPlayer, cardId: string): number {
  const ed = state.config.edition;
  if (isEstablishment(ed, cardId)) return estDef(ed, cardId).cost;
  const def = lmDef(ed, cardId);
  let cost = def.costs[Math.min(player.landmarks.length, def.costs.length - 1)];
  for (const { def: lm } of inForce(state, player.id, 'landmarkDiscount')) cost -= lm.effect.amount;
  if (def.effect.kind === 'win') {
    for (const { def: lm } of inForce(state, player.id, 'launchPadDiscount')) cost -= lm.effect.amount;
  }
  return Math.max(0, cost);
}

function marketSlot(state: MkState, cardId: string): { row: MkRowId; index: number } | null {
  const row = rowOf(rulesOf(state), cardId);
  if (!row) return null;
  const index = state.market[row].slots.findIndex((s) => s.cardId === cardId && s.count > 0);
  return index < 0 ? null : { row, index };
}

/** Why `player` can't build `cardId` right now (ignoring whose turn it is), or
 *  null when they can. */
export function buildBlocker(state: MkState, player: MkPlayer, cardId: string): string | null {
  const R = rulesOf(state);
  const ed = state.config.edition;
  if (isEstablishment(ed, cardId)) {
    if (!marketSlot(state, cardId)) return 'Not available in the market.';
    const def = estDef(ed, cardId);
    if (R.onePurpleEach && def.color === 'purple' && (player.city[cardId] ?? 0) > 0) {
      return 'You may own only one of each purple establishment.';
    }
  } else if (isLandmark(ed, cardId)) {
    if (!R.landmarkDefs.some((l) => l.id === cardId)) return 'Not in this game.';
    if (state.subPhase === 'setupBuild') return 'Only establishments can be built in the opening rounds.';
    if (player.landmarks.includes(cardId)) return 'Already built.';
    if (R.landmarks === 'market' && !marketSlot(state, cardId)) return 'Not available in the market.';
    const def = lmDef(ed, cardId);
    if (def.onlyIfSoleWithout) {
      const sole = player.landmarks.length === 0
        && state.players.every((p) => p === player || p.landmarks.length > 0);
      if (!sole) return 'Only while you are the only player with no landmarks.';
    }
  } else {
    return 'Unknown card.';
  }
  if (player.coins < priceOf(state, player, cardId)) return 'Not enough coins.';
  return null;
}

/** Every card `player` could build right now, with its price. */
export function buildOptions(state: MkState, player: MkPlayer): { cardId: string; cost: number }[] {
  const R = rulesOf(state);
  const ids = new Set<string>();
  for (const row of Object.values(state.market)) for (const s of row.slots) if (s.count > 0) ids.add(s.cardId);
  if (R.landmarks === 'personal') for (const l of R.landmarkDefs) ids.add(l.id);
  const out: { cardId: string; cost: number }[] = [];
  for (const id of ids) {
    if (buildBlocker(state, player, id) === null) out.push({ cardId: id, cost: priceOf(state, player, id) });
  }
  return out;
}

function takeFromMarket(state: MkState, cardId: string): void {
  const at = marketSlot(state, cardId);
  if (!at) return; // MK1 personal landmark
  const row = state.market[at.row];
  const slot = row.slots[at.index];
  slot.count -= 1;
  if (slot.count === 0 && rulesOf(state).market !== 'open') {
    row.slots.splice(at.index, 1);
    refillRow(row, rowSize(at.row), at.index);
  }
}

/** Put a copy back on its market pile — a new pile at the end if none shows. */
function returnToMarket(state: MkState, cardId: string): void {
  const row = rowOf(rulesOf(state), cardId);
  if (!row) return;
  const slot = state.market[row].slots.find((s) => s.cardId === cardId);
  if (slot) slot.count += 1;
  else state.market[row].slots.push({ cardId, count: 1 });
}

function applyImmediate(state: MkState, player: MkPlayer, def: MkLandmarkDef): void {
  const e = def.effect;
  const src = lmSource(def, player.id);
  const opps = counterClockwiseFrom(state, state.players.indexOf(player));
  switch (e.kind) {
    case 'takeHalfAbove':
      for (const o of opps) if (o.coins > e.threshold) transfer(state, o, player, Math.floor(o.coins / 2), src);
      break;
    case 'takeFromEach':
      for (const o of opps) transfer(state, o, player, e.amount, src);
      break;
    case 'takePerLandmark':
      for (const o of opps) transfer(state, o, player, e.amount * o.landmarks.length, src);
      break;
    case 'takePerSymbol':
      for (const o of opps) transfer(state, o, player, e.amount * countSymbol(state, o, e.symbol), src);
      break;
    case 'takeIfLandmarks':
      for (const o of opps) if (o.landmarks.length === e.landmarks) transfer(state, o, player, e.amount, src);
      break;
    case 'redistribute':
      redistribute(state, src);
      break;
    case 'extraTurn':
      grantExtraTurn(state, player, src);
      break;
    case 'win':
      win(state, player, 'launchPad');
      break;
    default:
      break; // ongoing — read where it applies
  }
}

function grantExtraTurn(state: MkState, player: MkPlayer, source: MkSource): void {
  // Amusement Park + Radio Tower in one turn still give just one extra turn.
  if (state.turn.extraTurn) return;
  state.turn.extraTurn = true;
  pushLog(state, { kind: 'extraTurn', playerId: player.id, source });
}

function win(state: MkState, player: MkPlayer, reason: 'landmarks' | 'launchPad'): void {
  state.phase = 'gameOver';
  state.winnerId = player.id;
  state.winReason = reason;
  state.activePlayerId = null;
  state.finalScores = Object.fromEntries(state.players.map((p) => [p.id, p.landmarks.length]));
  pushLog(state, { kind: 'win', playerId: player.id, reason });
}

function build(state: MkState, player: MkPlayer, cardId: string): void {
  const why = buildBlocker(state, player, cardId);
  if (why) throw new Error(why);
  const ed = state.config.edition;
  const cost = priceOf(state, player, cardId);
  player.coins -= cost;
  takeFromMarket(state, cardId);
  state.turn.built = cardId;
  if (isEstablishment(ed, cardId)) {
    player.city[cardId] = (player.city[cardId] ?? 0) + 1;
    pushLog(state, { kind: 'build', playerId: player.id, cardId, landmark: false, cost });
    return;
  }
  player.landmarks.push(cardId);
  pushLog(state, { kind: 'build', playerId: player.id, cardId, landmark: true, cost });
  applyImmediate(state, player, lmDef(ed, cardId));
  if (state.phase !== 'gameOver' && player.landmarks.length >= rulesOf(state).landmarksToWin) {
    win(state, player, 'landmarks');
  }
}

// ---------- Rolling ----------

function doRoll(state: MkState, dice: 1 | 2, reroll: boolean): void {
  const values = Array.from({ length: dice }, () => rngInt(state.rngState, 6) + 1);
  const total = values.reduce((a, b) => a + b, 0);
  const doubles = values.length === 2 && values[0] === values[1];
  state.turn.roll = { dice: values, total, doubles, added: 0 };
  const act = activePlayer(state);
  pushLog(state, { kind: 'roll', playerId: act.id, dice: values, total, doubles, reroll });
  if (!state.turn.rerolled && inForce(state, act.id, 'reroll').length > 0) {
    state.subPhase = 'reroll';
    return;
  }
  settleRoll(state);
}

/** The dice are final: offer the Harbor's +2, or pay out. */
function settleRoll(state: MkState): void {
  if (rollBoost(state, activePlayer(state).id, state.turn.roll!.total) > 0) {
    state.subPhase = 'harbor';
    return;
  }
  resolveRoll(state);
  nextStep(state);
}

/** Pay out every card the roll activated, then the ongoing landmarks. */
export function resolveRoll(state: MkState): void {
  const ed = state.config.edition;
  const roll = state.turn.roll!;
  const total = roll.total;
  const act = activePlayer(state);
  const matching = (p: MkPlayer, color: MkEstablishmentDef['color']) =>
    Object.keys(p.city)
      .map((id) => estDef(ed, id))
      .filter((def) => def.color === color && def.activation.includes(total))
      .sort((a, b) => a.activation[0] - b.activation[0]);
  const fire = (owner: MkPlayer, def: MkEstablishmentDef) => {
    const copies = reopen(state, owner, def.id);
    if (copies > 0) activate(state, owner, def, copies);
  };

  // 1. Red — opponents' restaurants, counter-clockwise from the roller.
  for (const owner of counterClockwiseFrom(state, state.currentIdx)) {
    for (const def of matching(owner, 'red')) fire(owner, def);
  }

  // 2. Blue (everyone's) and green (the roller's) — from the bank.
  for (const owner of turnOrderFrom(state, state.currentIdx)) {
    const cards = [...matching(owner, 'blue'), ...(owner === act ? matching(owner, 'green') : [])];
    for (const def of cards) fire(owner, def);
  }

  // 3. Purple — the roller's major establishments, one copy at a time.
  for (const def of matching(act, 'purple')) fire(act, def);

  // 4. Ongoing landmarks that react to the roll.
  for (const { def, ownerId } of inForce(state, act.id, 'rollBonus')) {
    if (total === def.effect.total) fromBank(state, act, def.effect.amount, lmSource(def, ownerId));
  }
  for (const { def, ownerId } of inForce(state, act.id, 'rollBonusPerSymbol')) {
    if (total === def.effect.total) {
      fromBank(state, act, def.effect.amount * countSymbol(state, act, def.effect.symbol), lmSource(def, ownerId));
    }
  }
  if (roll.doubles) {
    for (const { def, ownerId } of inForce(state, act.id, 'doublesTakeFromEach')) {
      for (const o of counterClockwiseFrom(state, state.currentIdx)) {
        transfer(state, o, act, def.effect.amount, lmSource(def, ownerId));
      }
    }
  }
  if (state.turn.received === 0) {
    for (const { def, ownerId } of inForce(state, act.id, 'noIncomeBonus')) {
      if (roll.dice.length === def.effect.dice) fromBank(state, act, def.effect.amount, lmSource(def, ownerId));
    }
  }
  if (roll.doubles) {
    const park = inForce(state, act.id, 'doublesExtraTurn')[0];
    if (park) grantExtraTurn(state, act, lmSource(park.def, park.ownerId));
    if (inForce(state, act.id, 'doublesGiveRight').length > 0 && establishmentCount(act) > 0) {
      state.turn.giftOwed = true;
    }
  }
}

/** A card whose number came up: its closed copies reopen instead of
 *  activating. Returns the copies that do activate. */
function reopen(state: MkState, owner: MkPlayer, cardId: string): number {
  const closed = closedCount(owner, cardId);
  if (closed > 0) {
    delete owner.closed[cardId];
    pushLog(state, { kind: 'reopened', playerId: owner.id, cardId, copies: closed });
  }
  return (owner.city[cardId] ?? 0) - closed;
}

function closeCopies(state: MkState, owner: MkPlayer, cardId: string, copies: number): void {
  const owned = owner.city[cardId] ?? 0;
  const n = Math.min(copies, owned - closedCount(owner, cardId));
  if (n <= 0) return;
  owner.closed[cardId] = closedCount(owner, cardId) + n;
  pushLog(state, { kind: 'closed', playerId: owner.id, cardId, copies: n });
}

type BankEffect = Extract<MkEstEffect, { kind: 'bank' | 'bankPerSymbol' | 'bankPerSymbolAll' | 'bankPerCard' | 'bankRoll' }>;

/** What one copy of a bank-paying card earns before landmark bonuses. */
function bankBase(state: MkState, owner: MkPlayer, def: MkEstablishmentDef, e: BankEffect): number {
  switch (e.kind) {
    case 'bank': return e.amount;
    case 'bankPerSymbol': return e.amount * countSymbol(state, owner, e.symbol);
    case 'bankPerSymbolAll': return e.amount * state.players.reduce((a, p) => a + countSymbol(state, p, e.symbol), 0);
    case 'bankPerCard': return e.amount * (owner.city[e.cardId] ?? 0);
    case 'bankRoll': return tunaRoll(state, def);
  }
}

/** The Tuna Boat roll: made once per turn, the first time a Tuna Boat pays. */
function tunaRoll(state: MkState, def: MkEstablishmentDef): number {
  if (state.turn.bonusRoll === null) {
    const dice = [rngInt(state.rngState, 6) + 1, rngInt(state.rngState, 6) + 1];
    const total = dice[0] + dice[1];
    state.turn.bonusRoll = total;
    const act = activePlayer(state);
    pushLog(state, { kind: 'bonusRoll', playerId: act.id, dice, total, source: estSource(def, act, 1) });
  }
  return state.turn.bonusRoll;
}

/** Run `copies` open copies of `def` for `owner` on the active player's turn
 *  (the colour rules — whose turn it fires on — are the caller's business). */
function activate(state: MkState, owner: MkPlayer, def: MkEstablishmentDef, copies: number): void {
  const act = activePlayer(state);
  const e = def.effect;
  const src = estSource(def, owner, copies);
  if (conditionHolds(state, def, owner, act)) {
    switch (e.kind) {
      case 'takeFromRoller':
        transfer(state, act, owner, (e.amount + symbolBonus(state, owner.id, def)) * copies, src);
        break;
      case 'takeAllFromRoller':
        transfer(state, act, owner, act.coins, src);
        break;
      case 'bank': case 'bankPerSymbol': case 'bankPerSymbolAll': case 'bankPerCard': case 'bankRoll': {
        const each = bankBase(state, owner, def, e);
        if (each > 0) fromBank(state, owner, (each + symbolBonus(state, owner.id, def)) * copies, src);
        break; // a combo with nothing to count pays nothing, bonus or not
      }
      case 'payBank':
        toBank(state, owner, e.amount * copies, src);
        break;
      case 'demolish':
        state.turn.demolishLeft += copies;
        break;
      case 'give':
        state.turn.givesLeft += copies;
        break;
      default:
        for (let k = 0; k < copies; k++) majorEffect(state, owner, def);
    }
  }
  if (def.closesAfter) closeCopies(state, owner, def.id, copies);
}

/** One copy of a purple card, for its owner (the roller). */
function majorEffect(state: MkState, owner: MkPlayer, def: MkEstablishmentDef): void {
  const e = def.effect;
  const src = estSource(def, owner, 1);
  const opps = counterClockwiseFrom(state, state.players.indexOf(owner));
  switch (e.kind) {
    case 'takeFromEach':
      for (const o of opps) transfer(state, o, owner, e.amount, src);
      break;
    case 'takeHalfAbove':
      for (const o of opps) if (o.coins > e.threshold) transfer(state, o, owner, Math.floor(o.coins / 2), src);
      break;
    case 'takePerSymbolFromEach':
      for (const o of opps) {
        transfer(state, o, owner, e.amount * e.symbols.reduce((a, s) => a + countSymbol(state, o, s), 0), src);
      }
      break;
    case 'invested':
      for (const o of opps) transfer(state, o, owner, owner.invested, src);
      break;
    case 'redistribute':
      redistribute(state, src);
      break;
    case 'takeFromOne':
      state.turn.tvLeft += 1;
      break;
    case 'renovate':
      state.turn.renovateLeft += 1;
      break;
    case 'activateOther':
      state.turn.exhibitLeft += 1;
      break;
    case 'exchange':
      state.turn.exchangesLeft += 1;
      break;
    default:
      break;
  }
}

// ---------- Choices ----------

/** Establishments `player` may hand over in a Business Center swap. */
export function exchangeableCards(state: MkState, player: MkPlayer): string[] {
  const R = rulesOf(state);
  return Object.keys(player.city).filter(
    (id) => R.exchangePurples || estDef(state.config.edition, id).color !== 'purple',
  );
}

export function exchangePossible(state: MkState): boolean {
  const act = activePlayer(state);
  return exchangeableCards(state, act).length > 0
    && state.players.some((p) => p !== act && exchangeableCards(state, p).length > 0);
}

/** Landmarks `player` could demolish: any they built (not a starting City Hall). */
export function demolishable(state: MkState, player: MkPlayer): string[] {
  return player.landmarks.filter((id) => !lmDef(state.config.edition, id).prebuilt);
}

/** Establishments `player` may give away with the MK1 Moving Company. */
export function giveableCards(state: MkState, player: MkPlayer): string[] {
  return Object.keys(player.city).filter((id) => estDef(state.config.edition, id).color !== 'purple');
}

/** What a Renovation Company may close: any non-major establishment someone owns. */
export function renovationTargets(state: MkState): string[] {
  const ids = new Set<string>();
  for (const p of state.players) for (const id of giveableCards(state, p)) ids.add(id);
  return [...ids];
}

/** What an International Exhibit Hall may activate instead: one of `player`'s
 *  open blue or green establishments (a red one would take from themselves). */
export function exhibitOptions(state: MkState, player: MkPlayer): string[] {
  return Object.keys(player.city).filter((id) => {
    const d = estDef(state.config.edition, id);
    return (d.color === 'blue' || d.color === 'green') && openCount(player, id) > 0;
  });
}

/** Whether `player` has a Tech Startup to invest in. */
export function canInvest(state: MkState, player: MkPlayer): boolean {
  return ownedWith(state, player, 'invested') !== null;
}

/** Move on to the next pending choice, or the build step. */
function nextStep(state: MkState): void {
  const act = activePlayer(state);
  const t = state.turn;
  if (t.demolishLeft > 0) {
    if (demolishable(state, act).length > 0) { state.subPhase = 'demolish'; return; }
    t.demolishLeft = 0;
  }
  if (t.givesLeft > 0) {
    if (giveableCards(state, act).length > 0) { state.subPhase = 'give'; return; }
    t.givesLeft = 0;
  }
  if (t.tvLeft > 0) {
    if (state.players.some((p) => p !== act && p.coins > 0)) { state.subPhase = 'tvTarget'; return; }
    t.tvLeft = 0;
  }
  if (t.renovateLeft > 0) {
    if (renovationTargets(state).length > 0) { state.subPhase = 'renovate'; return; }
    t.renovateLeft = 0;
  }
  if (t.exhibitLeft > 0) {
    if (ownedWith(state, act, 'activateOther') && exhibitOptions(state, act).length > 0) {
      state.subPhase = 'exhibit';
      return;
    }
    t.exhibitLeft = 0;
  }
  if (t.exchangesLeft > 0) {
    if (exchangePossible(state)) { state.subPhase = 'exchange'; return; }
    t.exchangesLeft = 0;
  }
  if (t.giftOwed) {
    if (establishmentCount(act) > 0) { state.subPhase = 'gift'; return; }
    t.giftOwed = false;
  }
  if (act.coins === 0) {
    if (rulesOf(state).coinWhenBroke) {
      fromBank(state, act, 1, { type: 'rule', id: 'broke', ownerId: null });
    } else {
      const hall = inForce(state, act.id, 'brokeCoin')[0];
      if (hall) fromBank(state, act, hall.def.effect.amount, lmSource(hall.def, hall.ownerId));
    }
  }
  state.subPhase = 'build';
}

/** Move one copy of `cardId`. A closed copy travels closed; `closedFirst`
 *  hands over a closed copy when there is one (the giver's pick), otherwise an
 *  open one (the taker's pick). */
function moveCard(from: MkPlayer, to: MkPlayer, cardId: string, closedFirst: boolean): void {
  const owned = from.city[cardId] ?? 0;
  if (owned < 1) throw new Error(`no ${cardId} to move`);
  const closed = closedCount(from, cardId);
  const movesClosed = closed > 0 && (closedFirst || closed === owned);
  from.city[cardId] = owned - 1;
  if (from.city[cardId] === 0) delete from.city[cardId];
  if (movesClosed) {
    from.closed[cardId] = closed - 1;
    if (from.closed[cardId] === 0) delete from.closed[cardId];
    to.closed[cardId] = closedCount(to, cardId) + 1;
  }
  to.city[cardId] = (to.city[cardId] ?? 0) + 1;
}

// ---------- Turn order ----------

function endTurn(state: MkState, invest: boolean): void {
  const R = rulesOf(state);
  const act = activePlayer(state);
  const n = state.players.length;
  let extra = false;
  if (state.subPhase === 'setupBuild') {
    state.currentIdx = (state.currentIdx + 1) % n;
    if (state.currentIdx === state.firstIdx) {
      state.setupRound += 1;
      if (state.setupRound > R.setupRounds) {
        state.setupRound = 0;
        state.round = 1;
        pushLog(state, { kind: 'setupDone' });
      }
    }
  } else {
    if (!state.turn.built) {
      for (const { def, ownerId } of inForce(state, act.id, 'skipBuildBonus')) {
        fromBank(state, act, def.effect.amount, lmSource(def, ownerId));
      }
    }
    if (invest && canInvest(state, act) && act.coins > 0) {
      act.coins -= 1;
      act.invested += 1;
      pushLog(state, { kind: 'invest', playerId: act.id, total: act.invested });
    }
    if (state.turn.extraTurn) {
      extra = true;
    } else {
      state.currentIdx = (state.currentIdx + 1) % n;
      if (state.currentIdx === state.firstIdx) state.round += 1;
    }
  }
  state.turnNumber += 1;
  state.turn = freshTurn();
  state.subPhase = state.setupRound > 0 ? 'setupBuild' : 'roll';
  state.activePlayerId = activePlayer(state).id;
  pushLog(state, { kind: 'turnStart', playerId: activePlayer(state).id, extra });
}

// ---------- Reducer ----------

export function applyAction(prev: MkState, action: MkAction): MkState {
  if (prev.phase !== 'playing') throw new Error('match is over');
  if (action.playerId !== prev.activePlayerId) {
    throw new Error(`not your turn (active=${prev.activePlayerId}, you=${action.playerId})`);
  }
  const state = clone(prev);
  const act = activePlayer(state);
  const ed = state.config.edition;
  const expect = (...phases: MkState['subPhase'][]) => {
    if (!phases.includes(state.subPhase)) throw new Error(`${action.type} not allowed during ${state.subPhase}`);
  };

  switch (action.type) {
    case 'roll': {
      expect('roll');
      if (action.dice !== 1 && action.dice !== 2) throw new Error('roll 1 or 2 dice');
      if (action.dice === 2 && !canRollTwo(state, act.id)) throw new Error('you need the Train Station to roll 2 dice');
      doRoll(state, action.dice, false);
      break;
    }
    case 'keepRoll': {
      expect('reroll');
      pushLog(state, { kind: 'keepRoll', playerId: act.id });
      settleRoll(state);
      break;
    }
    case 'reroll': {
      expect('reroll');
      if (action.dice === 2 && !canRollTwo(state, act.id)) throw new Error('you need the Train Station to roll 2 dice');
      state.turn.rerolled = true;
      doRoll(state, action.dice, true);
      break;
    }
    case 'harbor': {
      expect('harbor');
      const roll = state.turn.roll!;
      if (action.add) {
        const amount = rollBoost(state, act.id, roll.total);
        const harbor = inForce(state, act.id, 'addToRoll')[0];
        roll.total += amount;
        roll.added = amount;
        pushLog(state, { kind: 'addToRoll', playerId: act.id, amount, total: roll.total, source: lmSource(harbor.def, act.id) });
      } else {
        pushLog(state, { kind: 'keepRoll', playerId: act.id });
      }
      resolveRoll(state);
      nextStep(state);
      break;
    }
    case 'demolish': {
      expect('demolish');
      if (!demolishable(state, act).includes(action.landmarkId)) throw new Error(`you can't demolish ${action.landmarkId}`);
      act.landmarks = act.landmarks.filter((id) => id !== action.landmarkId);
      pushLog(state, { kind: 'demolish', playerId: act.id, landmarkId: action.landmarkId });
      const card = cardWith(state, 'demolish');
      if (card.effect.kind === 'demolish') fromBank(state, act, card.effect.amount, estSource(card, act, 1));
      state.turn.demolishLeft -= 1;
      nextStep(state);
      break;
    }
    case 'give': {
      expect('give');
      const target = playerById(state, action.targetId);
      if (target === act) throw new Error('give to another player');
      if (!giveableCards(state, act).includes(action.cardId)) throw new Error(`you can't give ${action.cardId}`);
      moveCard(act, target, action.cardId, true);
      pushLog(state, { kind: 'give', playerId: act.id, toId: target.id, cardId: action.cardId });
      const card = cardWith(state, 'give');
      if (card.effect.kind === 'give') fromBank(state, act, card.effect.amount, estSource(card, act, 1));
      state.turn.givesLeft -= 1;
      nextStep(state);
      break;
    }
    case 'tvTarget': {
      expect('tvTarget');
      const target = playerById(state, action.targetId);
      if (target === act) throw new Error('pick an opponent');
      const tv = ownedWith(state, act, 'takeFromOne');
      if (!tv || tv.effect.kind !== 'takeFromOne') throw new Error('no TV Station');
      transfer(state, target, act, tv.effect.amount, estSource(tv, act, 1));
      state.turn.tvLeft -= 1;
      nextStep(state);
      break;
    }
    case 'renovate': {
      expect('renovate');
      if (!renovationTargets(state).includes(action.cardId)) throw new Error(`you can't renovate ${action.cardId}`);
      const card = ownedWith(state, act, 'renovate');
      if (!card || card.effect.kind !== 'renovate') throw new Error('no Renovation Company');
      pushLog(state, { kind: 'renovate', playerId: act.id, cardId: action.cardId });
      for (const p of turnOrderFrom(state, state.currentIdx)) closeCopies(state, p, action.cardId, p.city[action.cardId] ?? 0);
      for (const o of counterClockwiseFrom(state, state.currentIdx)) {
        transfer(state, o, act, card.effect.amount * (o.city[action.cardId] ?? 0), estSource(card, act, 1));
      }
      state.turn.renovateLeft -= 1;
      nextStep(state);
      break;
    }
    case 'exhibit': {
      expect('exhibit');
      const hall = ownedWith(state, act, 'activateOther');
      if (!hall) throw new Error('no International Exhibit Hall');
      if (action.cardId === null) {
        pushLog(state, { kind: 'exhibit', playerId: act.id, cardId: null, hallId: hall.id });
      } else {
        if (!exhibitOptions(state, act).includes(action.cardId)) throw new Error(`you can't activate ${action.cardId}`);
        pushLog(state, { kind: 'exhibit', playerId: act.id, cardId: action.cardId, hallId: hall.id });
        activate(state, act, estDef(ed, action.cardId), 1);
        act.city[hall.id] -= 1;
        if (act.city[hall.id] === 0) delete act.city[hall.id];
        returnToMarket(state, hall.id);
      }
      state.turn.exhibitLeft -= 1;
      nextStep(state);
      break;
    }
    case 'exchange': {
      expect('exchange');
      const target = playerById(state, action.targetId);
      if (target === act) throw new Error('exchange with an opponent');
      if (!exchangeableCards(state, act).includes(action.give)) throw new Error(`you can't give ${action.give}`);
      if (!exchangeableCards(state, target).includes(action.take)) throw new Error(`you can't take ${action.take}`);
      moveCard(act, target, action.give, true);
      moveCard(target, act, action.take, false);
      pushLog(state, { kind: 'exchange', playerId: act.id, withId: target.id, gave: action.give, took: action.take });
      state.turn.exchangesLeft -= 1;
      nextStep(state);
      break;
    }
    case 'skipExchange': {
      expect('exchange');
      pushLog(state, { kind: 'skipExchange', playerId: act.id });
      state.turn.exchangesLeft -= 1;
      nextStep(state);
      break;
    }
    case 'gift': {
      expect('gift');
      const to = rightOf(state, state.currentIdx);
      moveCard(act, to, action.cardId, true);
      pushLog(state, { kind: 'gift', playerId: act.id, toId: to.id, cardId: action.cardId });
      state.turn.giftOwed = false;
      nextStep(state);
      break;
    }
    case 'build': {
      expect('build', 'setupBuild');
      build(state, act, action.cardId);
      if (state.phase === 'playing') endTurn(state, action.invest === true);
      break;
    }
    case 'pass': {
      expect('build', 'setupBuild');
      pushLog(state, { kind: 'pass', playerId: act.id });
      endTurn(state, action.invest === true);
      break;
    }
    default: {
      const never: never = action;
      throw new Error(`unknown action ${(never as { type: string }).type}`);
    }
  }
  return state;
}
