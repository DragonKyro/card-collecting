// Machi Koro reducer (both editions — see types.ts for the turn outline).
//
// subPhase flow:
//   setupBuild (MK2 opening rounds: build an establishment or pass)
//   roll → [reroll (MK1 Radio Tower)] → resolve → [tvTarget] → [exchange]* → [gift] → build
//   build: build one card or pass → next turn (or the same player on an extra turn)
//
// Resolution order (rulebook): red cards (opponents', counter-clockwise from the
// roller, each paid in full before the next) → blue (everyone) + green (roller)
// → purple (roller) → ongoing landmarks (Tech Startup, Renovation Company,
// Temple, then City Hall / Charterhouse if the roller received nothing, then
// Amusement Park, Moving Company). Choices queue behind the coin effects:
// TV Station target, Business Center exchanges, Moving Company gift. The MK2
// "1 coin when broke" rule applies on entering the build step.

import { createRng, rngInt, shuffle } from '@/core/rng';
import type { PlayerId, Seat } from '@/core/types';
import type {
  MkAction, MkConfig, MkEstablishmentDef, MkLandmarkDef, MkLandmarkEffect, MkLogEntry, MkMarketRow,
  MkPlayer, MkRowId, MkSource, MkState, MkSymbol, MkTurn,
} from './types';
import {
  EDITIONS, MARKET_ROW_SIZE, estDef, isEstablishment, isLandmark, landmarkPool, lmDef, rowOf,
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
  return EDITIONS[state.config.edition];
}

export function freshTurn(): MkTurn {
  return {
    roll: null, rerolled: false, received: 0, built: null, extraTurn: false,
    exchangesLeft: 0, tvLeft: 0, giftOwed: false,
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

/** Every built landmark with its builder. */
function builtLandmarks(state: MkState): { def: MkLandmarkDef; ownerId: PlayerId }[] {
  const out: { def: MkLandmarkDef; ownerId: PlayerId }[] = [];
  for (const p of state.players) {
    for (const id of p.landmarks) out.push({ def: lmDef(state.config.edition, id), ownerId: p.id });
  }
  return out;
}

/** Ongoing landmarks whose rule applies to `playerId` right now. */
export function landmarksInForce(state: MkState, playerId: PlayerId): { def: MkLandmarkDef; ownerId: PlayerId }[] {
  return builtLandmarks(state).filter(
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

function lmSource(def: MkLandmarkDef, ownerId: PlayerId): MkSource {
  return { type: 'lm', id: def.id, ownerId };
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

// ---------- Setup ----------

export function createMatch(config: MkConfig, seed: number, seats: Seat[]): MkState {
  const state: MkState = {
    phase: 'playing',
    seats,
    activePlayerId: null,
    finalScores: null,
    rngState: createRng(seed),
    config,
    players: seats.map((s) => ({ id: s.id, coins: 0, city: {}, landmarks: [] })),
    firstIdx: 0,
    currentIdx: 0,
    setupRound: 0,
    round: 0,
    turnNumber: 0,
    subPhase: 'roll',
    market: { low: { deck: [], slots: [] }, high: { deck: [], slots: [] }, landmark: { deck: [], slots: [] } },
    turn: freshTurn(),
    winnerId: null,
    winReason: null,
    log: [],
    logSeq: 0,
  };
  if (seats.length >= 2) setupMatch(state);
  return state;
}

/** Deal the market and pick a first player. Mutates `state` (players already seated). */
export function setupMatch(state: MkState): void {
  const R = rulesOf(state);
  const ed = state.config.edition;
  for (const p of state.players) {
    p.coins = R.startCoins;
    p.city = { ...R.startCity };
    p.landmarks = [];
  }
  const copiesOf = (defs: MkEstablishmentDef[]) => defs.flatMap((d) => Array<string>(d.copies).fill(d.id));
  const low = R.establishments.filter((d) => rowOf(ed, d.id) === 'low');
  const high = R.establishments.filter((d) => rowOf(ed, d.id) === 'high');
  if (R.market === 'rows') {
    state.market = {
      low: { deck: shuffle(state.rngState, copiesOf(low)), slots: [] },
      high: { deck: shuffle(state.rngState, copiesOf(high)), slots: [] },
      landmark: {
        deck: shuffle(state.rngState, landmarkPool(ed, state.config.promoLandmarks).map((l) => l.id)),
        slots: [],
      },
    };
    for (const row of Object.values(state.market)) refillRow(row);
  } else {
    const open = (defs: MkEstablishmentDef[]): MkMarketRow => ({
      deck: [], slots: defs.map((d) => ({ cardId: d.id, count: d.copies })),
    });
    state.market = { low: open(low), high: open(high), landmark: { deck: [], slots: [] } };
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

/** Top a row back up to five different stacks. A drawn duplicate stacks on its
 *  twin; the first new stack fills the gap at `gapAt` so the row doesn't shuffle. */
function refillRow(row: MkMarketRow, gapAt?: number): void {
  let gap = gapAt;
  while (row.slots.length < MARKET_ROW_SIZE && row.deck.length > 0) {
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

/** What `player` would pay for `cardId` (before checking they can afford it). */
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
  const row = rowOf(state.config.edition, cardId);
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
  if (slot.count === 0 && rulesOf(state).market === 'rows') {
    row.slots.splice(at.index, 1);
    refillRow(row, at.index);
  }
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
    case 'redistribute': {
      // Rulebook: as evenly as possible, the bank making up the difference —
      // everyone ends on ceil(total / players).
      const total = state.players.reduce((a, p) => a + p.coins, 0);
      const each = Math.ceil(total / state.players.length);
      for (const p of state.players) p.coins = each;
      pushLog(state, { kind: 'redistribute', each, fromBank: each * state.players.length - total, source: src });
      break;
    }
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
  state.turn.roll = { dice: values, total, doubles };
  const act = activePlayer(state);
  pushLog(state, { kind: 'roll', playerId: act.id, dice: values, total, doubles, reroll });
  if (!state.turn.rerolled && inForce(state, act.id, 'reroll').length > 0) {
    state.subPhase = 'reroll';
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
    Object.entries(p.city)
      .map(([id, copies]) => ({ def: estDef(ed, id), copies }))
      .filter(({ def }) => def.color === color && def.activation.includes(total))
      .sort((a, b) => a.def.activation[0] - b.def.activation[0]);
  const estSource = (def: MkEstablishmentDef, owner: MkPlayer, copies: number): MkSource =>
    ({ type: 'est', id: def.id, ownerId: owner.id, copies });

  // 1. Red — opponents' restaurants, counter-clockwise from the roller.
  for (const owner of counterClockwiseFrom(state, state.currentIdx)) {
    for (const { def, copies } of matching(owner, 'red')) {
      if (def.effect.kind !== 'takeFromRoller') continue;
      const each = def.effect.amount + symbolBonus(state, owner.id, def);
      transfer(state, act, owner, each * copies, estSource(def, owner, copies));
    }
  }

  // 2. Blue (everyone's) and green (the roller's) — from the bank.
  for (const owner of turnOrderFrom(state, state.currentIdx)) {
    const cards = [...matching(owner, 'blue'), ...(owner === act ? matching(owner, 'green') : [])];
    for (const { def, copies } of cards) {
      const e = def.effect;
      let each: number;
      if (e.kind === 'bank') each = e.amount;
      else if (e.kind === 'bankPerSymbol') each = e.amount * countSymbol(state, owner, e.symbol);
      else continue;
      if (each === 0) continue; // a combo with nothing to count
      each += symbolBonus(state, owner.id, def);
      fromBank(state, owner, each * copies, estSource(def, owner, copies));
    }
  }

  // 3. Purple — the roller's major establishments, one copy at a time.
  for (const { def, copies } of matching(act, 'purple')) {
    const e = def.effect;
    const src = estSource(def, act, 1);
    for (let k = 0; k < copies; k++) {
      if (e.kind === 'takeFromEach') {
        for (const o of counterClockwiseFrom(state, state.currentIdx)) transfer(state, o, act, e.amount, src);
      } else if (e.kind === 'takeHalfAbove') {
        for (const o of counterClockwiseFrom(state, state.currentIdx)) {
          if (o.coins > e.threshold) transfer(state, o, act, Math.floor(o.coins / 2), src);
        }
      } else if (e.kind === 'takeFromOne') {
        state.turn.tvLeft += 1;
      } else if (e.kind === 'exchange') {
        state.turn.exchangesLeft += 1;
      }
    }
  }

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

/** Move on to the next pending choice, or the build step. */
function nextStep(state: MkState): void {
  const act = activePlayer(state);
  const t = state.turn;
  if (t.tvLeft > 0) {
    if (state.players.some((p) => p !== act && p.coins > 0)) { state.subPhase = 'tvTarget'; return; }
    t.tvLeft = 0;
  }
  if (t.exchangesLeft > 0) {
    if (exchangePossible(state)) { state.subPhase = 'exchange'; return; }
    t.exchangesLeft = 0;
  }
  if (t.giftOwed) {
    if (establishmentCount(act) > 0) { state.subPhase = 'gift'; return; }
    t.giftOwed = false;
  }
  if (rulesOf(state).coinWhenBroke && act.coins === 0) {
    fromBank(state, act, 1, { type: 'rule', id: 'broke', ownerId: null });
  }
  state.subPhase = 'build';
}

function moveCard(from: MkPlayer, to: MkPlayer, cardId: string): void {
  if ((from.city[cardId] ?? 0) < 1) throw new Error(`no ${cardId} to move`);
  from.city[cardId] -= 1;
  if (from.city[cardId] === 0) delete from.city[cardId];
  to.city[cardId] = (to.city[cardId] ?? 0) + 1;
}

// ---------- Turn order ----------

function endTurn(state: MkState): void {
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
      resolveRoll(state);
      nextStep(state);
      break;
    }
    case 'reroll': {
      expect('reroll');
      if (action.dice === 2 && !canRollTwo(state, act.id)) throw new Error('you need the Train Station to roll 2 dice');
      state.turn.rerolled = true;
      doRoll(state, action.dice, true);
      break;
    }
    case 'tvTarget': {
      expect('tvTarget');
      const target = playerById(state, action.targetId);
      if (target === act) throw new Error('pick an opponent');
      const tv = Object.keys(act.city).map((id) => estDef(state.config.edition, id))
        .find((d) => d.effect.kind === 'takeFromOne');
      if (!tv || tv.effect.kind !== 'takeFromOne') throw new Error('no TV Station');
      transfer(state, target, act, tv.effect.amount, { type: 'est', id: tv.id, ownerId: act.id, copies: 1 });
      state.turn.tvLeft -= 1;
      nextStep(state);
      break;
    }
    case 'exchange': {
      expect('exchange');
      const target = playerById(state, action.targetId);
      if (target === act) throw new Error('exchange with an opponent');
      if (!exchangeableCards(state, act).includes(action.give)) throw new Error(`you can't give ${action.give}`);
      if (!exchangeableCards(state, target).includes(action.take)) throw new Error(`you can't take ${action.take}`);
      moveCard(act, target, action.give);
      moveCard(target, act, action.take);
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
      moveCard(act, to, action.cardId);
      pushLog(state, { kind: 'gift', playerId: act.id, toId: to.id, cardId: action.cardId });
      state.turn.giftOwed = false;
      nextStep(state);
      break;
    }
    case 'build': {
      expect('build', 'setupBuild');
      build(state, act, action.cardId);
      if (state.phase === 'playing') endTurn(state);
      break;
    }
    case 'pass': {
      expect('build', 'setupBuild');
      pushLog(state, { kind: 'pass', playerId: act.id });
      endTurn(state);
      break;
    }
    default: {
      const never: never = action;
      throw new Error(`unknown action ${(never as { type: string }).type}`);
    }
  }
  return state;
}
