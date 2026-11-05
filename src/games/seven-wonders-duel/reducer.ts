// 7 Wonders Duel — reducer.
//
// Flow:
//   wonderDraft (8 picks in two groups of 4) → turn (Age I, first player)
//   turn: take an accessible card → build it / discard it / build a wonder
//     (Pantheon, Age II on: or invoke a Divinity; Agora: or prepare a
//     Conspiracy with the card — and before any of these, trigger a prepared
//     Conspiracy).
//     Effects queue decisions (`state.pending`, resolved in order, each its
//     own sub-phase with the deciding seat active):
//       progress     a science pair → progressPick
//       library      the Great Library → libraryPick
//       destroy      Circus Maximus / Statue of Zeus / Expropriation / Swindle → destroyCard
//       discardBuild the Mausoleum / Hades → discardBuild
//       … and the expansions' decisions (types.ts lists them).
//     A decision an effect raises comes before the ones already waiting
//     (`enqueue`), as on Board Game Arena's state stack.
//   then the turn ends: the same seat again after a play-again effect, else
//   the other seat. When the age's last card is taken the next age is dealt
//   and the weaker seat (the pawn on its side; else whoever took the last
//   card) chooses who starts (chooseStarter) — a pending play-again is lost.
//   Age III's last card → civilian scoring.
//
// Military Supremacy (pawn at a capital) and Scientific Supremacy (six
// different symbols) end the match the moment they happen, mid-effect;
// Political Supremacy (Agora: all six Chambers) once the decision that made
// it is done.

import type { PlayerId } from '@/core/types';
import { rngInt, shuffle } from '@/core/rng';
import type {
  DuelAction, DuelAge, DuelCard, DuelConspiracyId, DuelDivinityId, DuelEndReason, DuelLogEntry, DuelMilitaryToken,
  DuelMythology, DuelPending, DuelPlayer, DuelProgressTokenId, DuelScience, DuelState, DuelStructureToken,
  DuelSubPhase, DuelWonder,
} from './types';
import { dealAgeFull, isSenator, senatorCards, SENATORS_PER_AGE } from './cards';
import { availableSlots, buildPyramid, flipUncovered, isPyramidEmpty, isSlotAvailable } from './pyramid';
import { MAX_WONDERS_BUILT, wonderById, wonderPool } from './wonders';
import { progressPool } from './progress';
import {
  cardPayment, countFor, discardGain, distinctScience, guildCount, purse, scienceSymbols, wonderPayment,
  type Payment,
} from './resources';
import { civilianWinner, scoreMatch } from './scoring';
import {
  divinitiesOf, divinityCost, emptyPlayerPantheon, MYTHOLOGY_IDS, OFFERING_VALUES, offeringChoices,
  STRUCTURE_TOKEN_SLOTS,
} from './pantheon';
import {
  CHAMBER_COUNT, chamberController, chambersControlled, CONSPIRACIES, cubesInSenate, DECREES, decreeHolder,
  emptyPlayerAgora, hasDecree, sectionChambers, senateActionCount,
} from './agora';

const STARTING_COINS = 7;
const URBANISM_CHAIN_COINS = 4;
const MILITARY_TOKEN_VALUE: Record<DuelMilitaryToken, number> = { p1At3: 2, p1At6: 5, p2At3: 2, p2At6: 5 };

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

type LogPartial = DistributiveOmit<DuelLogEntry, 'seq' | 'age'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushLog(state: DuelState, partial: LogPartial): void {
  state.logSeq += 1;
  state.log.push({ seq: state.logSeq, age: state.age, ...partial } as DuelLogEntry);
}

export function seatIdxOf(state: DuelState, playerId: PlayerId): 0 | 1 {
  if (state.players[0].id === playerId) return 0;
  if (state.players[1].id === playerId) return 1;
  throw new Error(`Unknown player: ${playerId}`);
}

const other = (idx: 0 | 1): 0 | 1 => (1 - idx) as 0 | 1;

function setActive(state: DuelState, idx: 0 | 1): void {
  state.activeSeatIdx = idx;
  state.activePlayerId = state.players[idx].id;
}

// ---------- The decision queue ----------
//
// Decisions an action raises are inserted before the ones already waiting, in
// the order they are raised. `queueAt` is where the next one goes; every
// action starts it at 0 (this is the only state outside DuelState, and it
// never outlives one applyAction call).

let queueAt = 0;

function enqueue(state: DuelState, p: DuelPending): void {
  state.pending.splice(queueAt, 0, p);
  queueAt += 1;
}

// ---------- Setup ----------

export function setupNewMatch(state: DuelState): void {
  for (const p of state.players) {
    p.coins = STARTING_COINS;
    p.tableau = [];
    p.wonders = [];
    p.progressTokens = [];
    delete p.pantheon;
    delete p.agora;
  }
  state.cardsById = {};
  state.pyramid = [];
  state.discard = [];
  state.militaryPawn = 0;
  state.militaryAwards = { p1At3: false, p1At6: false, p2At3: false, p2At6: false };
  state.pending = [];
  state.replay = false;
  state.finalScoringBreakdown = null;
  state.finalScores = null;
  state.endReason = null;
  state.winnerSeatIdx = null;
  state.phase = 'playing';
  state.age = 1;
  state.log = [];
  state.logSeq = 0;
  delete state.pantheon;
  delete state.agora;
  delete state.boxedCards;

  const tokens = shuffle(state.rngState, progressPool(state.config));
  state.progressOffer = tokens.slice(0, 5);
  state.progressBox = tokens.slice(5);

  const first = rngInt(state.rngState, 2) as 0 | 1;
  const second = other(first);
  state.firstSeatIdx = first;
  state.turnSeatIdx = first;
  const wonders = shuffle(state.rngState, wonderPool(state.config).map((w) => w.id)).slice(0, 8);
  state.wonderDraft = {
    pool: wonders.slice(0, 4),
    next: wonders.slice(4),
    // First group: first player 1, the other 2, first player the last; the
    // second group the other way round.
    pickOrder: [first, second, second, first, second, first, first, second],
    pickIdx: 0,
  };

  if (state.config.pantheon) {
    state.pantheon = {
      spaces: [null, null, null, null, null, null],
      decks: Object.fromEntries(MYTHOLOGY_IDS.map((m) => [m, shuffle(state.rngState, divinitiesOf(m))])) as Record<DuelMythology, DuelDivinityId[]>,
      revealed: false,
      enkiTokens: [],
      minerva: null,
    };
    for (const p of state.players) p.pantheon = emptyPlayerPantheon();
  }
  if (state.config.agora) {
    const decrees = shuffle(state.rngState, DECREES.map((d) => d.id)).slice(0, CHAMBER_COUNT);
    state.agora = {
      chambers: Array.from({ length: CHAMBER_COUNT }, () => [0, 0] as [number, number]),
      // Chambers 1, 3 and 5 show their Decree; 2, 4 and 6 hide theirs.
      decrees: decrees.map((id, i) => [{ id, faceUp: i % 2 === 0 }]),
      conspiracyDeck: shuffle(state.rngState, CONSPIRACIES.map((c) => c.id)),
      senatorPile: shuffle(state.rngState, senatorCards().map((c) => c.id)),
      locked: null,
      triggeredThisTurn: false,
      beforeMainAction: false,
    };
    state.boxedCards = [];
    for (const p of state.players) p.agora = emptyPlayerAgora();
  }

  state.subPhase = 'wonderDraft';
  setActive(state, first);
}

function startAge(state: DuelState, age: DuelAge): void {
  state.age = age;
  const ag = state.agora;
  const senators = ag
    ? ag.senatorPile.splice(0, SENATORS_PER_AGE[age]).map((id) => senatorCards().find((c) => c.id === id)!)
    : [];
  const { deck, boxed } = dealAgeFull(age, state.rngState, { temples: !!state.pantheon, senators });
  for (const c of deck) state.cardsById[c.id] = c;
  if (state.boxedCards) state.boxedCards.push(...boxed);
  state.pyramid = buildPyramid(age, deck.map((c) => c.id), !!ag);
  pushLog(state, { kind: 'ageStart' });
  if (state.pantheon && age <= 2) placeStructureTokens(state, age as 1 | 2);
  if (state.pantheon && age === 2) revealPantheon(state);
}

/** Pantheon: 5 random Mythology tokens on Age I, the 3 Offering tokens on Age II. */
function placeStructureTokens(state: DuelState, age: 1 | 2): void {
  const slots = STRUCTURE_TOKEN_SLOTS[state.agora ? 'agora' : 'base'][age];
  const tokens: DuelStructureToken[] = age === 1
    ? shuffle(state.rngState, MYTHOLOGY_IDS.flatMap((m) => [m, m])).slice(0, slots.length)
      .map((mythology) => ({ kind: 'mythology', mythology }))
    : shuffle(state.rngState, OFFERING_VALUES).map((value) => ({ kind: 'offering', value }));
  slots.forEach((slotIdx, i) => {
    if (tokens[i]) state.pyramid[slotIdx].token = tokens[i];
  });
}

/** Age II: the Gate takes the empty space and every Divinity turns face up. */
function revealPantheon(state: DuelState): void {
  const pan = state.pantheon!;
  pan.revealed = true;
  const empty = pan.spaces.findIndex((s) => s === null);
  if (empty >= 0) {
    pan.spaces[empty] = { divinity: 'gate', placedBy: null };
    pushLog(state, { kind: 'gatePlaced', space: empty });
  }
  if (pan.spaces.some((s) => s?.divinity === 'enki')) drawEnkiTokens(state);
}

/** Enki face up: 2 random Progress tokens from the box lie on it. */
function drawEnkiTokens(state: DuelState): void {
  const pan = state.pantheon!;
  if (pan.enkiTokens.length > 0) return;
  const picked = shuffle(state.rngState, state.progressBox).slice(0, 2);
  state.progressBox = state.progressBox.filter((t) => !picked.includes(t));
  pan.enkiTokens = picked;
}

function returnEnkiTokens(state: DuelState): void {
  const pan = state.pantheon!;
  state.progressBox.push(...pan.enkiTokens);
  pan.enkiTokens = [];
}

// ---------- Action dispatch ----------

export function applyAction(state: DuelState, action: DuelAction): DuelState {
  if (state.phase === 'gameOver') return state;
  const s = clone(state);
  queueAt = 0;
  switch (action.type) {
    case 'submitWonderDraft': return handleWonderDraft(s, action.playerId, action.wonderId);
    case 'takeAndBuild': return handleTakeAndBuild(s, action.playerId, action.cardId);
    case 'takeAndWonder': return handleTakeAndWonder(s, action.playerId, action.cardId, action.wonderId);
    case 'takeAndDiscard': return handleTakeAndDiscard(s, action.playerId, action.cardId);
    case 'chooseProgressToken': return handleChooseProgressToken(s, action.playerId, action.tokenId);
    case 'destroyCard': return handleDestroyCard(s, action.playerId, action.cardId);
    case 'buildFromDiscard': return handleBuildFromDiscard(s, action.playerId, action.cardId);
    case 'chooseStarter': return handleChooseStarter(s, action.playerId, action.starterId);
    case 'skip': return handleSkip(s, action.playerId);
    case 'invokeDivinity': return handleInvokeDivinity(s, action.playerId, action.space, action.offerings ?? []);
    case 'placeDivinity': return handlePlaceDivinity(s, action.playerId, action.divinity, action.space);
    case 'chooseDivinity': return handleChooseDivinity(s, action.playerId, action.divinity, action.top);
    case 'chooseMythology': return handleChooseMythology(s, action.playerId, action.mythology);
    case 'placeSnake': return handlePlaceSnake(s, action.playerId, action.cardId);
    case 'takeCard': return handleTakeCard(s, action.playerId, action.cardId);
    case 'discardStructureCard': return handleDiscardStructureCard(s, action.playerId, action.cardId);
    case 'chooseWonder': return handleChooseWonder(s, action.playerId, action.wonderId);
    case 'wonderFromDiscard': return handleWonderFromDiscard(s, action.playerId, action.cardId, action.wonderId);
    case 'placeMinerva': return handlePlaceMinerva(s, action.playerId, action.position);
    case 'chooseMilitaryToken': return handleChooseMilitaryToken(s, action.playerId, action.token);
    case 'takeAndPrepare': return handleTakeAndPrepare(s, action.playerId, action.cardId, action.conspiracy);
    case 'triggerConspiracy': return handleTriggerConspiracy(s, action.playerId, action.conspiracy);
    case 'placeInfluence': return handlePlaceInfluence(s, action.playerId, action.chamber);
    case 'moveInfluence': return handleMoveInfluence(s, action.playerId, action.from, action.to);
    case 'removeInfluence': return handleRemoveInfluence(s, action.playerId, action.chamber);
    case 'conspiratorChoice': return handleConspiratorChoice(s, action.playerId, action.choice);
    case 'chooseConspiracy': return handleChooseConspiracy(s, action.playerId, action.conspiracy);
    case 'placeRemnant': return handlePlaceRemnant(s, action.playerId, action.top);
    case 'lockProgressToken': return handleLockProgressToken(s, action.playerId, action.tokenId);
    case 'buildCard': return handleBuildCard(s, action.playerId, action.cardId);
    case 'swapCards': return handleSwapCards(s, action.playerId, action.takeId, action.giveId);
    case 'moveDecree': return handleMoveDecree(s, action.playerId, action.from, action.to);
    default:
      throw new Error(`Unhandled action: ${(action as { type: string }).type}`);
  }
}

function requireActive(state: DuelState, playerId: PlayerId, subPhase: DuelSubPhase): 0 | 1 {
  if (state.subPhase !== subPhase) throw new Error(`Not in ${subPhase}.`);
  const seatIdx = seatIdxOf(state, playerId);
  if (seatIdx !== state.activeSeatIdx) throw new Error('Not your turn.');
  return seatIdx;
}

/** Check the head decision is this seat's `kind` and take it off the queue. */
function takeHead<K extends DuelPending['kind']>(state: DuelState, playerId: PlayerId, kind: K): { seatIdx: 0 | 1; p: Extract<DuelPending, { kind: K }> } {
  const seatIdx = requireActive(state, playerId, PENDING_PHASE[kind]);
  const p = state.pending[0];
  if (!p || p.kind !== kind || p.seatIdx !== seatIdx) throw new Error('Nothing to choose.');
  state.pending.shift();
  return { seatIdx, p: p as Extract<DuelPending, { kind: K }> };
}

const pantheonOf = (state: DuelState) => {
  if (!state.pantheon) throw new Error('Pantheon is not in play.');
  return state.pantheon;
};
const agoraOf = (state: DuelState) => {
  if (!state.agora) throw new Error('Agora is not in play.');
  return state.agora;
};
const playerPantheon = (p: DuelPlayer) => {
  if (!p.pantheon) p.pantheon = emptyPlayerPantheon();
  return p.pantheon;
};
const playerAgora = (p: DuelPlayer) => {
  if (!p.agora) p.agora = emptyPlayerAgora();
  return p.agora;
};

// ---------- Wonder draft ----------

function handleWonderDraft(state: DuelState, playerId: PlayerId, wonderId: string): DuelState {
  const seatIdx = requireActive(state, playerId, 'wonderDraft');
  const draft = state.wonderDraft;
  if (!draft) throw new Error('No wonder draft.');
  if (!draft.pool.includes(wonderId)) throw new Error('Wonder not in the draft.');
  draft.pool = draft.pool.filter((id) => id !== wonderId);
  state.players[seatIdx].wonders.push({ wonderId, built: false, buriedCardId: null });
  pushLog(state, { kind: 'wonderDrafted', playerId, wonderId });
  draft.pickIdx += 1;
  if (draft.pool.length === 0 && draft.next.length > 0) {
    draft.pool = draft.next;
    draft.next = [];
  }
  // Agora's wonders act the moment they are drafted.
  const w = wonderById(wonderId);
  if (w.onSelect === 'conspire') enqueue(state, { kind: 'conspire', seatIdx });
  if (w.onSelect === 'placeInfluence') enqueue(state, { kind: 'placeInfluence', seatIdx });
  return settle(state);
}

function continueDraft(state: DuelState): DuelState {
  const draft = state.wonderDraft!;
  if (draft.pickIdx >= draft.pickOrder.length) {
    state.wonderDraft = null;
    startAge(state, 1);
    beginTurn(state, state.firstSeatIdx);
    return state;
  }
  state.subPhase = 'wonderDraft';
  setActive(state, draft.pickOrder[draft.pickIdx]);
  return state;
}

/** A new turn for `seat`. */
function beginTurn(state: DuelState, seat: 0 | 1): void {
  state.subPhase = 'turn';
  setActive(state, seat);
  state.turnSeatIdx = seat;
  if (state.agora) {
    state.agora.triggeredThisTurn = false;
    state.agora.beforeMainAction = false;
  }
}

/** The turn's main action is being taken (it ends the turn once its decisions are done). */
function mainAction(state: DuelState, playerId: PlayerId): 0 | 1 {
  const seatIdx = requireActive(state, playerId, 'turn');
  state.turnSeatIdx = seatIdx;
  if (state.agora) state.agora.beforeMainAction = false;
  return seatIdx;
}

// ---------- Taking a card ----------

function takeableCard(state: DuelState, cardId: number): DuelCard {
  const slot = state.pyramid.find((s) => s.cardId === cardId);
  if (!slot || !isSlotAvailable(slot, state.pyramid)) throw new Error(`Card ${cardId} is not accessible.`);
  const card = state.cardsById[cardId];
  if (!card) throw new Error(`Unknown card ${cardId}.`);
  return card;
}

/** Take a card out of the structure: cards it uncovers turn up, and the
 *  seat takes any Pantheon token on it or on them. */
function removeFromPyramid(state: DuelState, cardId: number, seatIdx: 0 | 1 = state.activeSeatIdx): void {
  const slot = state.pyramid.find((s) => s.cardId === cardId)!;
  slot.taken = true;
  slot.faceUp = true;
  const claimed: DuelStructureToken[] = [];
  if (slot.token) { claimed.push(slot.token); delete slot.token; }
  for (const f of flipUncovered(state.pyramid)) {
    if (f.token) { claimed.push(f.token); delete f.token; }
  }
  for (const t of claimed) claimToken(state, seatIdx, t);
}

function claimToken(state: DuelState, seatIdx: 0 | 1, token: DuelStructureToken): void {
  const me = state.players[seatIdx];
  const pan = playerPantheon(me);
  pushLog(state, { kind: 'tokenTaken', playerId: me.id, token });
  if (token.kind === 'offering') {
    pan.offeringTokens.push(token.value);
  } else {
    pan.mythologyTokens.push(token.mythology);
    enqueue(state, { kind: 'placeDivinity', seatIdx, mythology: token.mythology });
  }
}

/** Coins out of a seat's purse: the treasury first, then Astarte. */
function spend(p: DuelPlayer, coins: number): void {
  const fromTreasury = Math.min(p.coins, coins);
  p.coins -= fromTreasury;
  if (coins > fromTreasury) playerPantheon(p).astarteCoins -= coins - fromTreasury;
}

/** Charge a payment; with Economy the opponent pockets the trading coins. */
function pay(state: DuelState, seatIdx: 0 | 1, payment: Payment): void {
  const me = state.players[seatIdx];
  if (purse(me) < payment.coins) throw new Error(`Not enough coins (have ${purse(me)}, need ${payment.coins}).`);
  spend(me, payment.coins);
  const opp = state.players[other(seatIdx)];
  if (payment.trade > 0 && opp.progressTokens.includes('economy')) opp.coins += payment.trade;
}

function handleTakeAndBuild(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const seatIdx = mainAction(state, playerId);
  const card = takeableCard(state, cardId);
  const me = state.players[seatIdx];
  if (!isSenator(card) && me.tableau.some((c) => c.name === card.name)) throw new Error(`Already built ${card.name}.`);
  const payment = cardPayment(state, seatIdx, card);
  pay(state, seatIdx, payment);
  removeFromPyramid(state, cardId, seatIdx);
  if (payment.chained && me.progressTokens.includes('urbanism')) me.coins += URBANISM_CHAIN_COINS;
  buildCard(state, seatIdx, card, { paid: payment.coins, chained: payment.chained });
  return settle(state);
}

function handleTakeAndWonder(state: DuelState, playerId: PlayerId, cardId: number, wonderId: string): DuelState {
  const seatIdx = mainAction(state, playerId);
  const card = takeableCard(state, cardId);
  const me = state.players[seatIdx];
  const ws = me.wonders.find((w) => w.wonderId === wonderId);
  if (!ws) throw new Error('Not your wonder.');
  if (ws.built) throw new Error('Wonder already built.');
  const wonder = wonderById(wonderId);
  const payment = wonderPayment(state, seatIdx, wonder);
  pay(state, seatIdx, payment);
  removeFromPyramid(state, cardId, seatIdx);
  constructWonder(state, seatIdx, wonder, card, payment.coins);
  return settle(state);
}

function handleTakeAndDiscard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const seatIdx = mainAction(state, playerId);
  const card = takeableCard(state, cardId);
  const me = state.players[seatIdx];
  const gained = discardGain(state, seatIdx);
  removeFromPyramid(state, cardId, seatIdx);
  me.coins += gained;
  state.discard.push(card);
  pushLog(state, { kind: 'cardDiscarded', playerId, cardId: card.id, cardName: card.name, coinsGained: gained });
  return settle(state);
}

// ---------- Effects ----------

const COLOR_COIN_DECREE = { blue: 'blueCoins', green: 'greenCoins', yellow: 'yellowCoins', red: 'redCoins' } as const;

function buildCard(state: DuelState, seatIdx: 0 | 1, card: DuelCard, info: { paid: number; chained: boolean; fromDiscard?: boolean; free?: boolean }): void {
  const me = state.players[seatIdx];
  me.tableau.push(card);
  pushLog(state, {
    kind: 'cardBuilt', playerId: me.id, cardId: card.id, cardName: card.name,
    paid: info.paid, chained: info.chained, ...(info.fromDiscard ? { fromDiscard: true } : {}), ...(info.free ? { free: true } : {}),
  });
  // The card is in the city already, so a Lighthouse counts itself.
  for (const eff of card.effects) {
    switch (eff.kind) {
      case 'coins': me.coins += eff.amount; break;
      case 'shields': {
        const bonus = card.color === 'red' && me.progressTokens.includes('strategy') ? 1 : 0;
        advanceMilitary(state, seatIdx, eff.shields + bonus);
        break;
      }
      case 'science': gainScience(state, seatIdx, eff.symbol); break;
      case 'coinsPer': me.coins += countFor(me, eff.what) * eff.per; break;
      case 'guild': me.coins += guildCount(state, eff.what) * eff.coinsPer; break;
      case 'politician':
        enqueue(state, { kind: 'senate', seatIdx, section: eff.section, left: senateActionCount(state, seatIdx) });
        break;
      case 'conspirator':
        enqueue(state, { kind: 'conspirator', seatIdx });
        if (hasDecree(state, seatIdx, 'conspiratorReplay')) state.replay = true;
        break;
      default: break;
    }
    if (state.phase === 'gameOver') return;
  }
  // Agora's colour taxes: whoever controls the Decree takes the Age in coins.
  const decree = card.color in COLOR_COIN_DECREE ? COLOR_COIN_DECREE[card.color as keyof typeof COLOR_COIN_DECREE] : null;
  if (decree) decreeCoins(state, decree);
}

function decreeCoins(state: DuelState, decree: 'blueCoins' | 'greenCoins' | 'yellowCoins' | 'redCoins' | 'wonderCoins'): void {
  const holder = decreeHolder(state, decree);
  if (holder === null) return;
  state.players[holder].coins += state.age;
  pushLog(state, { kind: 'decreeCoins', playerId: state.players[holder].id, decree, coins: state.age });
}

/** Build a wonder with `card` tucked under it (already paid for). */
function constructWonder(state: DuelState, seatIdx: 0 | 1, wonder: DuelWonder, card: DuelCard, paid: number): void {
  const me = state.players[seatIdx];
  const ws = me.wonders.find((w) => w.wonderId === wonder.id)!;
  ws.built = true;
  ws.buriedCardId = card.id;
  state.cardsById[card.id] = card;
  pushLog(state, { kind: 'wonderBuilt', playerId: me.id, wonderId: wonder.id, cardId: card.id, paid });
  applyWonderEffects(state, seatIdx, wonder);
  if (state.phase === 'gameOver') return;
  if (me.progressTokens.includes('theology')) state.replay = true;
  decreeCoins(state, 'wonderCoins');
  enforceWonderLimit(state);
}

function applyWonderEffects(state: DuelState, seatIdx: 0 | 1, wonder: DuelWonder): void {
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  for (const eff of wonder.effects) {
    switch (eff.kind) {
      case 'coins': me.coins += eff.amount; break;
      case 'opponentLosesCoins': {
        const lost = Math.min(opp.coins, eff.amount);
        opp.coins -= lost;
        pushLog(state, { kind: 'coinsLost', playerId: opp.id, coins: lost });
        break;
      }
      case 'shields': advanceMilitary(state, seatIdx, eff.shields); break;
      case 'playAgain': state.replay = true; break;
      case 'destroy': enqueue(state, { kind: 'destroy', seatIdx, color: eff.color }); break;
      case 'buildFromDiscard': enqueue(state, { kind: 'discardBuild', seatIdx }); break;
      case 'progressFromBox': {
        const options = shuffle(state.rngState, state.progressBox).slice(0, 3);
        enqueue(state, { kind: 'library', seatIdx, options });
        break;
      }
      case 'placeInfluence': enqueue(state, { kind: 'placeInfluence', seatIdx }); break;
      case 'moveInfluence': enqueue(state, { kind: 'moveInfluence', seatIdx }); break;
      case 'triggerUnprepared': enqueue(state, { kind: 'triggerUnprepared', seatIdx }); break;
      case 'divineTheater': enqueue(state, { kind: 'theaterDeck', seatIdx }); break;
      default: break;
    }
    if (state.phase === 'gameOver') return;
  }
}

/** A new science symbol: six different wins at once; a matching pair takes a Progress token. */
function gainScience(state: DuelState, seatIdx: 0 | 1, symbol: DuelScience): void {
  if (checkScienceSupremacy(state)) return;
  if ((scienceSymbols(state.players[seatIdx]).get(symbol) ?? 0) >= 2) enqueue(state, { kind: 'progress', seatIdx });
}

/** Six different symbols win; both at once (Coercion) is a shared victory. */
function checkScienceSupremacy(state: DuelState): boolean {
  const a = distinctScience(state.players[0]) >= 6;
  const b = distinctScience(state.players[1]) >= 6;
  if (!a && !b) return false;
  endMatch(state, 'science', a && b ? null : a ? 0 : 1);
  return true;
}

/** Move the conflict pawn `shields` spaces toward the opponent's capital,
 *  taking any military token it reaches; the capital wins. Minerva's pawn
 *  stops it; Poliorcetics costs the opponent a coin per space. */
function advanceMilitary(state: DuelState, seatIdx: 0 | 1, shields: number): void {
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  const dir = seatIdx === 0 ? 1 : -1;
  const pan = state.pantheon;
  let moved = 0;
  let lostCoins = 0;
  for (let i = 0; i < shields; i++) {
    const next = state.militaryPawn + dir;
    if (Math.abs(next) > 9) break;
    if (pan && pan.minerva === next) {
      pan.minerva = null;
      pushLog(state, { kind: 'minervaStop', position: next });
      break;
    }
    state.militaryPawn = next;
    moved++;
    if (me.progressTokens.includes('poliorcetics') && opp.coins > 0) { opp.coins -= 1; lostCoins++; }
  }
  pushLog(state, { kind: 'militaryAdvance', playerId: me.id, amount: moved, newPawn: state.militaryPawn });
  if (lostCoins > 0) pushLog(state, { kind: 'coinsLost', playerId: opp.id, coins: lostCoins });
  const ahead = dir * state.militaryPawn;
  const awards = state.militaryAwards;
  const [small, large]: [DuelMilitaryToken, DuelMilitaryToken] = seatIdx === 0 ? ['p1At3', 'p1At6'] : ['p2At3', 'p2At6'];
  if (ahead >= 3 && !awards[small]) { awards[small] = true; militaryTokenEffect(state, seatIdx, small); }
  if (ahead >= 6 && !awards[large]) { awards[large] = true; militaryTokenEffect(state, seatIdx, large); }
  if (Math.abs(state.militaryPawn) >= 9) endMatch(state, 'military', state.militaryPawn > 0 ? 0 : 1);
}

/** A military token's effect for the seat that took it: the opponent loses
 *  2 / 5 coins — or, with Agora, a Senate action (small: place a cube;
 *  large: remove one of the opponent's, then you may move one). */
function militaryTokenEffect(state: DuelState, seatIdx: 0 | 1, token: DuelMilitaryToken): void {
  const value = MILITARY_TOKEN_VALUE[token];
  if (state.agora) {
    if (value === 2) enqueue(state, { kind: 'placeInfluence', seatIdx });
    else {
      enqueue(state, { kind: 'removeInfluence', seatIdx });
      enqueue(state, { kind: 'moveInfluence', seatIdx });
    }
    return;
  }
  const opp = state.players[other(seatIdx)];
  const lost = Math.min(opp.coins, value);
  opp.coins -= lost;
  pushLog(state, { kind: 'looted', playerId: opp.id, coins: lost });
}

/** Once 7 wonders stand, the unbuilt one goes back to the box. */
function enforceWonderLimit(state: DuelState): void {
  const built = state.players.reduce((n, p) => n + p.wonders.filter((w) => w.built).length, 0);
  if (built < MAX_WONDERS_BUILT) return;
  for (const p of state.players) {
    for (const w of p.wonders.filter((x) => !x.built)) pushLog(state, { kind: 'wonderRemoved', playerId: p.id, wonderId: w.wonderId });
    p.wonders = p.wonders.filter((w) => w.built);
  }
}

function takeProgressToken(state: DuelState, seatIdx: 0 | 1, tokenId: DuelProgressTokenId, fromBox: boolean): void {
  const me = state.players[seatIdx];
  me.progressTokens.push(tokenId);
  pushLog(state, { kind: 'progressTaken', playerId: me.id, tokenId, fromBox });
  if (tokenId === 'agriculture' || tokenId === 'urbanism') me.coins += 6;
  if (tokenId === 'law') gainScience(state, seatIdx, 'law');
}

// ---------- Pantheon: Divinities ----------

function activateDivinity(state: DuelState, seatIdx: 0 | 1, id: DuelDivinityId, paid: number, free: boolean): void {
  const me = state.players[seatIdx];
  const pan = playerPantheon(me);
  pan.divinities.push(id);
  pushLog(state, { kind: 'divinityInvoked', playerId: me.id, divinity: id, paid, free });
  switch (id) {
    case 'enki':
      drawEnkiTokens(state);
      enqueue(state, { kind: 'enki', seatIdx });
      break;
    case 'ishtar': gainScience(state, seatIdx, 'law'); break;
    case 'nisaba': enqueue(state, { kind: 'snake', seatIdx }); break;
    case 'astarte': pan.astarteCoins += 7; break;
    case 'baal': enqueue(state, { kind: 'takeCard', seatIdx }); break;
    case 'tanit': me.coins += 12; break;
    case 'aphrodite': break; // 9 VP at the end
    case 'hades': enqueue(state, { kind: 'discardBuild', seatIdx }); break;
    case 'zeus': enqueue(state, { kind: 'zeus', seatIdx }); break;
    case 'anubis': enqueue(state, { kind: 'anubis', seatIdx }); break;
    case 'isis': enqueue(state, { kind: 'isis', seatIdx }); break;
    case 'ra': enqueue(state, { kind: 'takeWonder', seatIdx }); break;
    case 'mars': advanceMilitary(state, seatIdx, 2); break;
    case 'minerva': enqueue(state, { kind: 'minerva', seatIdx }); break;
    case 'neptune':
      enqueue(state, { kind: 'neptuneDiscard', seatIdx });
      enqueue(state, { kind: 'neptuneApply', seatIdx });
      break;
    case 'gate': enqueue(state, { kind: 'gate', seatIdx }); break;
  }
}

function handleInvokeDivinity(state: DuelState, playerId: PlayerId, space: number, offerings: number[]): DuelState {
  const seatIdx = requireActive(state, playerId, 'turn');
  const pan = pantheonOf(state);
  if (!pan.revealed) throw new Error('The Pantheon opens in Age II.');
  const slot = pan.spaces[space];
  if (!slot) throw new Error('No Divinity on that space.');
  const me = state.players[seatIdx];
  const mine = playerPantheon(me).offeringTokens.slice();
  for (const v of offerings) {
    const i = mine.indexOf(v);
    if (i < 0) throw new Error(`No −${v} Offering token.`);
    mine.splice(i, 1);
  }
  const cost = divinityCost(state, seatIdx, space, offerings);
  if (purse(me) < cost) throw new Error(`Not enough coins (have ${purse(me)}, need ${cost}).`);
  mainAction(state, playerId);
  spend(me, cost);
  playerPantheon(me).offeringTokens = mine;
  pan.spaces[space] = null;
  activateDivinity(state, seatIdx, slot.divinity, cost, false);
  return settle(state);
}

function handlePlaceDivinity(state: DuelState, playerId: PlayerId, divinity: DuelDivinityId, space: number): DuelState {
  const { seatIdx, p } = takeHead(state, playerId, 'placeDivinity');
  const pan = pantheonOf(state);
  const options = p.options ?? [];
  if (!options.includes(divinity)) throw new Error('Not one of the drawn Divinities.');
  if (!Number.isInteger(space) || space < 0 || space > 5 || pan.spaces[space]) throw new Error('Pick an empty space of the Pantheon.');
  pan.spaces[space] = { divinity, placedBy: seatIdx };
  // The other one goes back on top of its deck.
  for (const d of options) if (d !== divinity) pan.decks[p.mythology].push(d);
  pushLog(state, { kind: 'divinityPlaced', playerId, mythology: p.mythology, space });
  return settle(state);
}

/** The top card of every non-empty Mythology deck (the Gate's choice). */
export function gateOptions(state: DuelState): DuelDivinityId[] {
  const pan = state.pantheon;
  if (!pan) return [];
  return MYTHOLOGY_IDS.map((m) => pan.decks[m][pan.decks[m].length - 1]).filter((d): d is DuelDivinityId => !!d);
}

function handleChooseDivinity(state: DuelState, playerId: PlayerId, divinity: DuelDivinityId, top?: DuelDivinityId): DuelState {
  const pan = pantheonOf(state);
  if (state.subPhase === 'gate') {
    const { seatIdx } = takeHead(state, playerId, 'gate');
    const options = gateOptions(state);
    if (!options.includes(divinity)) throw new Error('Not on top of a Mythology deck.');
    const m = MYTHOLOGY_IDS.find((x) => pan.decks[x][pan.decks[x].length - 1] === divinity)!;
    pan.decks[m].pop();
    if (options.includes('enki') && divinity !== 'enki') returnEnkiTokens(state);
    activateDivinity(state, seatIdx, divinity, 0, true);
  } else {
    const { seatIdx, p } = takeHead(state, playerId, 'theater');
    const deck = pan.decks[p.mythology];
    if (!deck.includes(divinity)) throw new Error('Not in that Mythology deck.');
    const rest = deck.filter((d) => d !== divinity);
    if (top !== undefined) {
      if (!rest.includes(top)) throw new Error('That Divinity is not left in the deck.');
      pan.decks[p.mythology] = [...rest.filter((d) => d !== top), top];
    } else {
      pan.decks[p.mythology] = rest;
    }
    if (deck.includes('enki') && divinity !== 'enki') returnEnkiTokens(state);
    activateDivinity(state, seatIdx, divinity, 0, true);
  }
  return settle(state);
}

function handleChooseMythology(state: DuelState, playerId: PlayerId, mythology: DuelMythology): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'theaterDeck');
  if (!MYTHOLOGY_IDS.includes(mythology) || pantheonOf(state).decks[mythology].length === 0) throw new Error('Pick a Mythology deck with cards in it.');
  enqueue(state, { kind: 'theater', seatIdx, mythology });
  return settle(state);
}

function handlePlaceSnake(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'snake');
  const opp = state.players[other(seatIdx)];
  const card = opp.tableau.find((c) => c.id === cardId && c.color === 'green');
  const sci = card?.effects.find((e) => e.kind === 'science');
  if (!card || !sci || sci.kind !== 'science') throw new Error("Pick one of your opponent's green cards.");
  playerPantheon(state.players[seatIdx]).snake = { cardId, symbol: sci.symbol };
  pushLog(state, { kind: 'snakePlaced', playerId, cardId, cardName: card.name });
  gainScience(state, seatIdx, sci.symbol);
  return settle(state);
}

function handleTakeCard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'takeCard');
  const opp = state.players[other(seatIdx)];
  const card = opp.tableau.find((c) => c.id === cardId && (c.color === 'brown' || c.color === 'gray'));
  if (!card) throw new Error("Pick one of your opponent's brown or gray cards.");
  opp.tableau = opp.tableau.filter((c) => c.id !== cardId);
  state.players[seatIdx].tableau.push(card);
  pushLog(state, { kind: 'cardTaken', playerId, ownerId: opp.id, cardId, cardName: card.name });
  return settle(state);
}

function handleDiscardStructureCard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const zeus = state.subPhase === 'zeus';
  const { seatIdx } = zeus ? takeHead(state, playerId, 'zeus') : takeHead(state, playerId, 'discardAvailable');
  const slot = state.pyramid.find((s) => s.cardId === cardId && !s.taken);
  if (!slot) throw new Error('That card is not in the structure.');
  if (!zeus && !isSlotAvailable(slot, state.pyramid)) throw new Error('Pick an accessible card.');
  const card = state.cardsById[cardId];
  removeFromPyramid(state, cardId, seatIdx);
  state.discard.push(card);
  pushLog(state, { kind: 'structureDiscard', playerId, cardId, cardName: card.name });
  return settle(state);
}

function handleChooseWonder(state: DuelState, playerId: PlayerId, wonderId: string): DuelState {
  const kind = state.subPhase === 'anubis' ? 'anubis' : state.subPhase === 'sabotage' ? 'sabotage' : 'takeWonder';
  const { seatIdx } = takeHead(state, playerId, kind);
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  if (kind === 'anubis') {
    const owner = state.players.find((p) => p.wonders.some((w) => w.wonderId === wonderId && w.built));
    if (!owner) throw new Error('Pick a built wonder.');
    const ws = owner.wonders.find((w) => w.wonderId === wonderId)!;
    const card = state.cardsById[ws.buriedCardId!];
    ws.built = false;
    ws.buriedCardId = null;
    if (card) state.discard.push(card);
    pushLog(state, { kind: 'wonderUnbuilt', playerId, ownerId: owner.id, wonderId, cardName: card?.name ?? '' });
  } else if (kind === 'sabotage') {
    const ws = opp.wonders.find((w) => w.wonderId === wonderId && w.built);
    if (!ws) throw new Error("Pick one of your opponent's built wonders.");
    const card = state.cardsById[ws.buriedCardId!];
    opp.wonders = opp.wonders.filter((w) => w.wonderId !== wonderId);
    if (card) state.discard.push(card);
    pushLog(state, { kind: 'wonderSabotaged', playerId, ownerId: opp.id, wonderId });
  } else {
    const ws = opp.wonders.find((w) => w.wonderId === wonderId && !w.built);
    if (!ws) throw new Error("Pick one of your opponent's unbuilt wonders.");
    opp.wonders = opp.wonders.filter((w) => w.wonderId !== wonderId);
    me.wonders.push(ws);
    pushLog(state, { kind: 'wonderTaken', playerId, ownerId: opp.id, wonderId });
  }
  return settle(state);
}

function handleWonderFromDiscard(state: DuelState, playerId: PlayerId, cardId: number, wonderId: string): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'isis');
  const card = state.discard.find((c) => c.id === cardId);
  if (!card) throw new Error('Card not in the discard pile.');
  const ws = state.players[seatIdx].wonders.find((w) => w.wonderId === wonderId && !w.built);
  if (!ws) throw new Error('Pick one of your unbuilt wonders.');
  state.discard = state.discard.filter((c) => c.id !== cardId);
  constructWonder(state, seatIdx, wonderById(wonderId), card, 0);
  return settle(state);
}

function handlePlaceMinerva(state: DuelState, playerId: PlayerId, position: number): DuelState {
  takeHead(state, playerId, 'minerva');
  if (!Number.isInteger(position) || Math.abs(position) > 9 || position === state.militaryPawn) {
    throw new Error('Pick a space of the track other than the conflict pawn\'s.');
  }
  pantheonOf(state).minerva = position;
  pushLog(state, { kind: 'minervaPlaced', playerId, position });
  return settle(state);
}

/** Military tokens still on the track. */
export function militaryTokensLeft(state: DuelState): DuelMilitaryToken[] {
  return (['p1At3', 'p1At6', 'p2At3', 'p2At6'] as const).filter((t) => !state.militaryAwards[t]);
}

function handleChooseMilitaryToken(state: DuelState, playerId: PlayerId, token: DuelMilitaryToken): DuelState {
  const apply = state.subPhase === 'neptuneApply';
  const { seatIdx } = apply ? takeHead(state, playerId, 'neptuneApply') : takeHead(state, playerId, 'neptuneDiscard');
  if (!militaryTokensLeft(state).includes(token)) throw new Error('That military token is gone.');
  state.militaryAwards[token] = true;
  pushLog(state, { kind: 'militaryToken', playerId, token, applied: apply });
  if (apply) militaryTokenEffect(state, seatIdx, token);
  return settle(state);
}

// ---------- Agora: the Senate ----------

/** Add `delta` of a seat's cubes to a Chamber (0-based), from or back to
 *  its supply when `supply`; a change of control reveals the Chamber's
 *  Decrees and moves the pawn for the Levy. */
function changeCubes(state: DuelState, chamber: number, seat: 0 | 1, delta: number, supply: boolean): void {
  const ag = agoraOf(state);
  const before = chamberController(ag, chamber);
  ag.chambers[chamber][seat] += delta;
  if (supply) playerAgora(state.players[seat]).cubes -= delta;
  const after = chamberController(ag, chamber);
  if (before === after) return;
  if (before !== null) {
    pushLog(state, { kind: 'chamberControl', playerId: state.players[before].id, chamber, gained: false });
    if (ag.decrees[chamber].some((d) => d.id === 'militaryDecree')) advanceMilitary(state, other(before), 1);
    if (state.phase === 'gameOver') return;
  }
  if (after !== null) {
    pushLog(state, { kind: 'chamberControl', playerId: state.players[after].id, chamber, gained: true });
    for (const d of ag.decrees[chamber]) {
      if (!d.faceUp) {
        d.faceUp = true;
        pushLog(state, { kind: 'decreeRevealed', chamber, decree: d.id });
      }
    }
    if (ag.decrees[chamber].some((d) => d.id === 'militaryDecree')) advanceMilitary(state, after, 1);
  }
}

const chamberIndex = (n: number): number => {
  if (!Number.isInteger(n) || n < 1 || n > CHAMBER_COUNT) throw new Error('Chambers are numbered 1 to 6.');
  return n - 1;
};

function handlePlaceInfluence(state: DuelState, playerId: PlayerId, chamberNo: number): DuelState {
  const c = chamberIndex(chamberNo);
  if (state.subPhase === 'senate') {
    const { seatIdx, p } = takeHead(state, playerId, 'senate');
    if (!sectionChambers(p.section).includes(c)) throw new Error("Place it in the Politician's section.");
    if (playerAgora(state.players[seatIdx]).cubes <= 0) throw new Error('No Influence cubes left.');
    pushLog(state, { kind: 'influence', playerId, action: 'place', chamber: c });
    changeCubes(state, c, seatIdx, 1, true);
    if (p.left > 1 && state.phase !== 'gameOver') enqueue(state, { ...p, left: p.left - 1 });
  } else {
    const { seatIdx } = takeHead(state, playerId, 'placeInfluence');
    if (playerAgora(state.players[seatIdx]).cubes <= 0) throw new Error('No Influence cubes left.');
    pushLog(state, { kind: 'influence', playerId, action: 'place', chamber: c });
    changeCubes(state, c, seatIdx, 1, true);
  }
  return settle(state);
}

function handleMoveInfluence(state: DuelState, playerId: PlayerId, fromNo: number, toNo: number): DuelState {
  const from = chamberIndex(fromNo);
  const to = chamberIndex(toNo);
  const senate = state.subPhase === 'senate';
  const { seatIdx, p } = senate ? takeHead(state, playerId, 'senate') : takeHead(state, playerId, 'moveInfluence');
  const ag = agoraOf(state);
  if (Math.abs(from - to) !== 1) throw new Error('A cube moves to the next Chamber.');
  if (ag.chambers[from][seatIdx] <= 0) throw new Error('You have no cube in that Chamber.');
  pushLog(state, { kind: 'influence', playerId, action: 'move', chamber: to, from });
  changeCubes(state, from, seatIdx, -1, false);
  if (state.phase !== 'gameOver') changeCubes(state, to, seatIdx, 1, false);
  if (senate && p.kind === 'senate' && p.left > 1 && state.phase !== 'gameOver') enqueue(state, { ...p, left: p.left - 1 });
  return settle(state);
}

function handleRemoveInfluence(state: DuelState, playerId: PlayerId, chamberNo: number): DuelState {
  const c = chamberIndex(chamberNo);
  const { seatIdx } = takeHead(state, playerId, 'removeInfluence');
  const opp = other(seatIdx);
  if (agoraOf(state).chambers[c][opp] <= 0) throw new Error('Your opponent has no cube there.');
  pushLog(state, { kind: 'influence', playerId, action: 'remove', chamber: c });
  changeCubes(state, c, opp, -1, true);
  return settle(state);
}

function handleMoveDecree(state: DuelState, playerId: PlayerId, fromNo: number, toNo: number): DuelState {
  const from = chamberIndex(fromNo);
  const to = chamberIndex(toNo);
  const { seatIdx } = takeHead(state, playerId, 'moveDecree');
  const ag = agoraOf(state);
  if (from === to) throw new Error('Move it to another Chamber.');
  const decree = ag.decrees[from].shift();
  if (!decree) throw new Error('No Decree in that Chamber.');
  ag.decrees[to].push(decree);
  pushLog(state, { kind: 'decreeMoved', playerId: state.players[seatIdx].id, from, to });
  const was = chamberController(ag, from);
  const now = chamberController(ag, to);
  if (was !== now) {
    if (!decree.faceUp) {
      decree.faceUp = true;
      pushLog(state, { kind: 'decreeRevealed', chamber: to, decree: decree.id });
    }
    if (decree.id === 'militaryDecree') {
      if (was !== null) advanceMilitary(state, other(was), 1);
      if (now !== null && state.phase !== 'gameOver') advanceMilitary(state, now, 1);
    }
  }
  return settle(state);
}

// ---------- Agora: Conspiracies ----------

function drawConspiracies(state: DuelState, n: number): DuelConspiracyId[] {
  const deck = agoraOf(state).conspiracyDeck;
  const out: DuelConspiracyId[] = [];
  for (let i = 0; i < n && deck.length > 0; i++) out.push(deck.pop()!);
  return out;
}

function keepConspiracy(state: DuelState, seatIdx: 0 | 1, id: DuelConspiracyId): void {
  playerAgora(state.players[seatIdx]).conspiracies.push({ id, preparedWith: null, triggered: false });
}

function handleConspiratorChoice(state: DuelState, playerId: PlayerId, choice: 'influence' | 'conspire'): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'conspirator');
  if (choice === 'influence') {
    if (playerAgora(state.players[seatIdx]).cubes <= 0) throw new Error('No Influence cubes left.');
    enqueue(state, { kind: 'placeInfluence', seatIdx });
  } else {
    if (agoraOf(state).conspiracyDeck.length === 0) throw new Error('The Conspiracy deck is empty.');
    enqueue(state, { kind: 'conspire', seatIdx });
  }
  return settle(state);
}

function handleChooseConspiracy(state: DuelState, playerId: PlayerId, id: DuelConspiracyId): DuelState {
  const { seatIdx, p } = takeHead(state, playerId, 'conspire');
  const options = p.options ?? [];
  if (!options.includes(id)) throw new Error('Not one of the drawn Conspiracies.');
  keepConspiracy(state, seatIdx, id);
  pushLog(state, { kind: 'conspired', playerId, kept: 1 });
  const rest = options.find((o) => o !== id);
  if (rest) enqueue(state, { kind: 'remnant', seatIdx, conspiracy: rest });
  return settle(state);
}

function handlePlaceRemnant(state: DuelState, playerId: PlayerId, top: boolean): DuelState {
  const { p } = takeHead(state, playerId, 'remnant');
  const deck = agoraOf(state).conspiracyDeck;
  if (top) deck.push(p.conspiracy);
  else deck.unshift(p.conspiracy);
  pushLog(state, { kind: 'remnantPlaced', playerId, top });
  return settle(state);
}

function handleTakeAndPrepare(state: DuelState, playerId: PlayerId, cardId: number, id: DuelConspiracyId): DuelState {
  const seatIdx = mainAction(state, playerId);
  const card = takeableCard(state, cardId);
  const c = playerAgora(state.players[seatIdx]).conspiracies.find((x) => x.id === id);
  if (!c) throw new Error('Not your Conspiracy.');
  if (c.preparedWith !== null || c.triggered) throw new Error('That Conspiracy is already prepared.');
  removeFromPyramid(state, cardId, seatIdx);
  c.preparedWith = card.id;
  pushLog(state, { kind: 'conspiracyPrepared', playerId, cardAge: card.age });
  return settle(state);
}

function handleTriggerConspiracy(state: DuelState, playerId: PlayerId, id: DuelConspiracyId): DuelState {
  const ag = agoraOf(state);
  let seatIdx: 0 | 1;
  if (state.subPhase === 'turn') {
    seatIdx = requireActive(state, playerId, 'turn');
    if (ag.triggeredThisTurn) throw new Error('Only one Conspiracy a turn.');
    const c = playerAgora(state.players[seatIdx]).conspiracies.find((x) => x.id === id);
    if (!c || c.triggered || c.preparedWith === null) throw new Error('Trigger one of your prepared Conspiracies.');
    // Before the main action: it still has to come once this is resolved.
    state.turnSeatIdx = seatIdx;
    ag.beforeMainAction = true;
  } else {
    seatIdx = takeHead(state, playerId, 'triggerUnprepared').seatIdx;
    const c = playerAgora(state.players[seatIdx]).conspiracies.find((x) => x.id === id);
    if (!c || c.triggered || c.preparedWith !== null) throw new Error('Trigger one of your unprepared Conspiracies.');
  }
  ag.triggeredThisTurn = true;
  fireConspiracy(state, seatIdx, id);
  return settle(state);
}

function fireConspiracy(state: DuelState, seatIdx: 0 | 1, id: DuelConspiracyId): void {
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  const c = playerAgora(me).conspiracies.find((x) => x.id === id)!;
  c.triggered = true;
  pushLog(state, { kind: 'conspiracyTriggered', playerId: me.id, conspiracy: id });
  const move = () => enqueue(state, { kind: 'moveInfluence', seatIdx });
  switch (id) {
    case 'extortion': enqueue(state, { kind: 'takeWonder', seatIdx }); move(); break;
    case 'blackmail': {
      const n = Math.ceil(opp.coins / 2);
      opp.coins -= n;
      me.coins += n;
      if (n > 0) pushLog(state, { kind: 'coinsTaken', playerId: me.id, fromId: opp.id, coins: n });
      move();
      break;
    }
    case 'expropriation': enqueue(state, { kind: 'destroy', seatIdx, color: 'blue' }); move(); break;
    case 'swindle': enqueue(state, { kind: 'destroy', seatIdx, color: 'yellow' }); move(); break;
    case 'obscurantism': enqueue(state, { kind: 'lockToken', seatIdx }); break;
    case 'coup': advanceMilitary(state, seatIdx, 2); break;
    case 'propertyFraud': enqueue(state, { kind: 'backRowBuild', seatIdx }); break;
    case 'treason': enqueue(state, { kind: 'boxBuild', seatIdx }); break;
    case 'politicalManeuver':
      enqueue(state, { kind: 'placeInfluence', seatIdx });
      enqueue(state, { kind: 'removeInfluence', seatIdx });
      move();
      break;
    case 'espionage': enqueue(state, { kind: 'espionage', seatIdx }); break;
    case 'turnOfEvents':
      enqueue(state, { kind: 'discardAvailable', seatIdx, optional: false });
      enqueue(state, { kind: 'discardAvailable', seatIdx, optional: true });
      move();
      break;
    case 'embezzlement': {
      const ag = agoraOf(state);
      const gain = cubesInSenate(ag, seatIdx);
      me.coins += gain;
      const lost = Math.min(opp.coins, cubesInSenate(ag, other(seatIdx)));
      opp.coins -= lost;
      if (lost > 0) pushLog(state, { kind: 'coinsLost', playerId: opp.id, coins: lost });
      break;
    }
    case 'foreclosure': enqueue(state, { kind: 'takeCard', seatIdx }); break;
    case 'coercion': enqueue(state, { kind: 'swap', seatIdx }); move(); break;
    case 'insiderInfluence': enqueue(state, { kind: 'moveDecree', seatIdx }); move(); break;
    case 'sabotage': enqueue(state, { kind: 'sabotage', seatIdx }); break;
  }
}

function handleLockProgressToken(state: DuelState, playerId: PlayerId, tokenId: DuelProgressTokenId): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'lockToken');
  const ag = agoraOf(state);
  const opp = state.players[other(seatIdx)];
  let from: 'board' | 'opponent' | 'box';
  if (state.progressOffer.includes(tokenId)) {
    from = 'board';
    state.progressOffer = state.progressOffer.filter((t) => t !== tokenId);
  } else if (opp.progressTokens.includes(tokenId)) {
    from = 'opponent';
    opp.progressTokens = opp.progressTokens.filter((t) => t !== tokenId);
  } else if (state.progressBox.includes(tokenId)) {
    from = 'box';
    state.progressBox = state.progressBox.filter((t) => t !== tokenId);
  } else {
    throw new Error('That Progress token cannot be locked.');
  }
  ag.locked = { tokenId, from };
  pushLog(state, { kind: 'tokenLocked', playerId, tokenId: from === 'box' ? null : tokenId, from });
  return settle(state);
}

/** Back-row cards Property Fraud may build (not Senators). */
export function backRowCards(state: DuelState): DuelCard[] {
  return state.pyramid.filter((s) => s.row === 0 && !s.taken).map((s) => state.cardsById[s.cardId]).filter((c) => !isSenator(c));
}

/** Boxed cards Treason may build: those of the ages dealt so far. */
export function treasonCards(state: DuelState): DuelCard[] {
  return (state.boxedCards ?? []).filter((c) => c.age <= state.age);
}

function handleBuildCard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  if (state.subPhase === 'backRowBuild') {
    const { seatIdx } = takeHead(state, playerId, 'backRowBuild');
    const card = backRowCards(state).find((c) => c.id === cardId);
    if (!card) throw new Error('Pick a card of the back row (not a Senator).');
    removeFromPyramid(state, cardId, seatIdx);
    buildCard(state, seatIdx, card, { paid: 0, chained: false, free: true });
  } else {
    const { seatIdx } = takeHead(state, playerId, 'boxBuild');
    const card = treasonCards(state).find((c) => c.id === cardId);
    if (!card) throw new Error('Pick one of the boxed cards.');
    state.boxedCards = (state.boxedCards ?? []).filter((c) => c.id !== cardId);
    state.cardsById[card.id] = card;
    buildCard(state, seatIdx, card, { paid: 0, chained: false, free: true });
  }
  return settle(state);
}

/** Coercion's possible swaps: [their card, my card] of the same colour, blue or green. */
export function swapOptions(state: DuelState, seatIdx: 0 | 1): [DuelCard, DuelCard][] {
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  const out: [DuelCard, DuelCard][] = [];
  for (const t of opp.tableau) {
    if (t.color !== 'blue' && t.color !== 'green') continue;
    for (const g of me.tableau) if (g.color === t.color) out.push([t, g]);
  }
  return out;
}

function handleSwapCards(state: DuelState, playerId: PlayerId, takeId: number, giveId: number): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'swap');
  const pair = swapOptions(state, seatIdx).find(([t, g]) => t.id === takeId && g.id === giveId);
  if (!pair) throw new Error('Swap a blue card for a blue card, or a green one for a green one.');
  const [take, give] = pair;
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  opp.tableau = opp.tableau.filter((c) => c.id !== takeId);
  me.tableau = me.tableau.filter((c) => c.id !== giveId);
  me.tableau.push(take);
  opp.tableau.push(give);
  // The Snake leaves a card that changes hands.
  for (const p of state.players) {
    const snake = p.pantheon?.snake;
    if (snake && (snake.cardId === takeId || snake.cardId === giveId)) p.pantheon!.snake = null;
  }
  pushLog(state, { kind: 'cardsSwapped', playerId, took: take.name, gave: give.name });
  if (checkScienceSupremacy(state)) return state;
  const pairOf = (p: DuelPlayer, c: DuelCard) => {
    const e = c.effects.find((x) => x.kind === 'science');
    return !!e && e.kind === 'science' && (scienceSymbols(p).get(e.symbol) ?? 0) >= 2;
  };
  if (pairOf(me, take)) enqueue(state, { kind: 'progress', seatIdx });
  if (pairOf(opp, give)) enqueue(state, { kind: 'progress', seatIdx: other(seatIdx) });
  return settle(state);
}

// ---------- Queued decisions ----------

export const PENDING_PHASE: Record<DuelPending['kind'], DuelSubPhase> = {
  progress: 'progressPick',
  library: 'libraryPick',
  destroy: 'destroyCard',
  discardBuild: 'discardBuild',
  placeDivinity: 'placeDivinity',
  enki: 'enki',
  snake: 'snake',
  takeCard: 'takeCard',
  zeus: 'zeus',
  anubis: 'anubis',
  isis: 'isis',
  takeWonder: 'takeWonder',
  minerva: 'minerva',
  neptuneDiscard: 'neptuneDiscard',
  neptuneApply: 'neptuneApply',
  gate: 'gate',
  theaterDeck: 'theaterDeck',
  theater: 'theater',
  senate: 'senate',
  placeInfluence: 'placeInfluence',
  moveInfluence: 'moveInfluence',
  removeInfluence: 'removeInfluence',
  conspirator: 'conspirator',
  conspire: 'conspire',
  remnant: 'remnant',
  triggerUnprepared: 'triggerUnprepared',
  lockToken: 'lockToken',
  backRowBuild: 'backRowBuild',
  boxBuild: 'boxBuild',
  espionage: 'espionage',
  discardAvailable: 'discardAvailable',
  swap: 'swap',
  moveDecree: 'moveDecree',
  sabotage: 'sabotage',
};

/** Whether a queued decision has anything to choose from (else it is skipped). */
function pendingPossible(state: DuelState, p: DuelPending): boolean {
  const me = state.players[p.seatIdx];
  const opp = state.players[other(p.seatIdx)];
  const pan = state.pantheon;
  const ag = state.agora;
  switch (p.kind) {
    case 'progress': return state.progressOffer.length > 0;
    case 'library': return p.options.length > 0;
    case 'destroy': return opp.tableau.some((c) => c.color === p.color);
    case 'discardBuild': return state.discard.length > 0;
    case 'placeDivinity':
      return !!pan && pan.spaces.some((s) => s === null) && ((p.options?.length ?? 0) > 0 || pan.decks[p.mythology].length > 0);
    case 'enki': return (pan?.enkiTokens.length ?? 0) > 0;
    case 'snake': return opp.tableau.some((c) => c.color === 'green');
    case 'takeCard': return opp.tableau.some((c) => c.color === 'brown' || c.color === 'gray');
    case 'zeus': return state.pyramid.some((s) => !s.taken);
    case 'anubis': return state.players.some((x) => x.wonders.some((w) => w.built));
    case 'isis': return state.discard.length > 0 && me.wonders.some((w) => !w.built);
    case 'takeWonder': return opp.wonders.some((w) => !w.built);
    case 'minerva': return !!pan;
    case 'neptuneDiscard':
    case 'neptuneApply': return militaryTokensLeft(state).length > 0;
    case 'gate': return gateOptions(state).length > 0;
    case 'theaterDeck': return !!pan && MYTHOLOGY_IDS.some((m) => pan.decks[m].length > 0);
    case 'theater': return !!pan && pan.decks[p.mythology].length > 0;
    case 'senate': return !!ag && (playerAgora(me).cubes > 0 || cubesInSenate(ag, p.seatIdx) > 0);
    case 'placeInfluence': return !!ag && playerAgora(me).cubes > 0;
    case 'moveInfluence': return !!ag && cubesInSenate(ag, p.seatIdx) > 0;
    case 'removeInfluence': return !!ag && cubesInSenate(ag, other(p.seatIdx)) > 0;
    case 'conspirator': return !!ag && (playerAgora(me).cubes > 0 || ag.conspiracyDeck.length > 0);
    case 'conspire': return !!ag && ((p.options?.length ?? 0) > 0 || ag.conspiracyDeck.length > 0);
    case 'remnant': return !!ag;
    case 'triggerUnprepared': return (me.agora?.conspiracies ?? []).some((c) => !c.triggered && c.preparedWith === null);
    case 'lockToken': return state.progressOffer.length + opp.progressTokens.length + state.progressBox.length > 0;
    case 'backRowBuild': return backRowCards(state).length > 0;
    case 'boxBuild': return treasonCards(state).length > 0;
    case 'espionage': return state.progressBox.length > 0;
    case 'discardAvailable': return availableSlots(state.pyramid).length > 0;
    case 'swap': return swapOptions(state, p.seatIdx).length > 0;
    case 'moveDecree': return !!ag && ag.decrees.some((d) => d.length > 0);
    case 'sabotage': return opp.wonders.some((w) => w.built);
  }
}

/** Prepare a decision coming up (draw what it chooses from). False when it
 *  resolved itself — Organized Crime keeps both Conspiracies drawn. */
function openPending(state: DuelState, p: DuelPending): boolean {
  const pan = state.pantheon;
  switch (p.kind) {
    case 'placeDivinity':
      if (!p.options) {
        const deck = pan!.decks[p.mythology];
        p.options = deck.splice(Math.max(0, deck.length - 2)).reverse();
      }
      return true;
    case 'gate':
      if (gateOptions(state).includes('enki')) drawEnkiTokens(state);
      return true;
    case 'theater':
      if (pan!.decks[p.mythology].includes('enki')) drawEnkiTokens(state);
      return true;
    case 'conspire': {
      if (!p.options) p.options = drawConspiracies(state, 2);
      const me = state.players[p.seatIdx];
      if (me.progressTokens.includes('organizedCrime') || p.options.length < 2) {
        for (const id of p.options) keepConspiracy(state, p.seatIdx, id);
        pushLog(state, { kind: 'conspired', playerId: me.id, kept: p.options.length });
        return false;
      }
      return true;
    }
    default:
      return true;
  }
}

function handleChooseProgressToken(state: DuelState, playerId: PlayerId, tokenId: DuelProgressTokenId): DuelState {
  switch (state.subPhase) {
    case 'progressPick': {
      const { seatIdx } = takeHead(state, playerId, 'progress');
      if (!state.progressOffer.includes(tokenId)) throw new Error('Token not on the board.');
      state.progressOffer = state.progressOffer.filter((t) => t !== tokenId);
      takeProgressToken(state, seatIdx, tokenId, false);
      break;
    }
    case 'libraryPick': {
      const { seatIdx, p } = takeHead(state, playerId, 'library');
      if (!p.options.includes(tokenId)) throw new Error('Token not drawn.');
      // The other two drawn tokens go back into the box.
      state.progressBox = state.progressBox.filter((t) => t !== tokenId);
      takeProgressToken(state, seatIdx, tokenId, true);
      break;
    }
    case 'enki': {
      const { seatIdx } = takeHead(state, playerId, 'enki');
      const pan = pantheonOf(state);
      if (!pan.enkiTokens.includes(tokenId)) throw new Error('That token is not on Enki.');
      pan.enkiTokens = pan.enkiTokens.filter((t) => t !== tokenId);
      returnEnkiTokens(state);
      takeProgressToken(state, seatIdx, tokenId, true);
      break;
    }
    case 'espionage': {
      const { seatIdx } = takeHead(state, playerId, 'espionage');
      if (!state.progressBox.includes(tokenId)) throw new Error('That token is not in the box.');
      state.progressBox = state.progressBox.filter((t) => t !== tokenId);
      takeProgressToken(state, seatIdx, tokenId, true);
      break;
    }
    default:
      throw new Error('Not choosing a Progress token.');
  }
  return settle(state);
}

function handleDestroyCard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const { seatIdx, p } = takeHead(state, playerId, 'destroy');
  const opp = state.players[other(seatIdx)];
  const card = opp.tableau.find((c) => c.id === cardId);
  if (!card || card.color !== p.color) throw new Error(`Pick a ${p.color} card of your opponent's.`);
  opp.tableau = opp.tableau.filter((c) => c.id !== cardId);
  state.discard.push(card);
  pushLog(state, { kind: 'cardDestroyed', playerId, ownerId: opp.id, cardId: card.id, cardName: card.name });
  return settle(state);
}

function handleBuildFromDiscard(state: DuelState, playerId: PlayerId, cardId: number): DuelState {
  const { seatIdx } = takeHead(state, playerId, 'discardBuild');
  const card = state.discard.find((c) => c.id === cardId);
  if (!card) throw new Error('Card not in the discard pile.');
  state.discard = state.discard.filter((c) => c.id !== cardId);
  buildCard(state, seatIdx, card, { paid: 0, chained: false, fromDiscard: true });
  return settle(state);
}

function handleChooseStarter(state: DuelState, playerId: PlayerId, starterId: PlayerId): DuelState {
  requireActive(state, playerId, 'chooseStarter');
  const starter = seatIdxOf(state, starterId);
  pushLog(state, { kind: 'starterChosen', playerId, starterId });
  beginTurn(state, starter);
  return state;
}

/** Sub-phases where the decision may be declined. */
const SKIPPABLE: Partial<Record<DuelSubPhase, DuelPending['kind']>> = {
  senate: 'senate',
  moveInfluence: 'moveInfluence',
  discardAvailable: 'discardAvailable',
  triggerUnprepared: 'triggerUnprepared',
};

function handleSkip(state: DuelState, playerId: PlayerId): DuelState {
  const kind = SKIPPABLE[state.subPhase];
  if (!kind) throw new Error('This decision cannot be skipped.');
  const p = state.pending[0];
  if (p?.kind === 'discardAvailable' && !p.optional) throw new Error('Discard a first card.');
  takeHead(state, playerId, kind);
  return settle(state);
}

// ---------- End of turn ----------

/** Open the next queued decision, or end the turn. */
function settle(state: DuelState): DuelState {
  if (state.phase === 'gameOver') return state;
  if (checkPoliticalSupremacy(state)) return state;
  while (state.pending.length > 0) {
    const p = state.pending[0];
    if (pendingPossible(state, p) && openPending(state, p)) {
      state.subPhase = PENDING_PHASE[p.kind];
      setActive(state, p.seatIdx);
      return state;
    }
    state.pending.shift();
  }
  if (state.wonderDraft) return continueDraft(state);
  const seat = state.turnSeatIdx ?? state.activeSeatIdx;
  const empty = isPyramidEmpty(state.pyramid);
  if (state.agora?.beforeMainAction && !empty) {
    // A Conspiracy was triggered at the start of the turn: now the main action.
    state.agora.beforeMainAction = false;
    state.subPhase = 'turn';
    setActive(state, seat);
    return state;
  }
  if (empty) {
    // A play-again earned with the age's last card is lost.
    state.replay = false;
    if (state.age === 3) return endMatch(state, 'civilian', null);
    const chooser: 0 | 1 = state.militaryPawn > 0 ? 1 : state.militaryPawn < 0 ? 0 : seat;
    startAge(state, (state.age + 1) as DuelAge);
    state.subPhase = 'chooseStarter';
    setActive(state, chooser);
    return state;
  }
  if (state.replay) {
    state.replay = false;
    pushLog(state, { kind: 'playAgain', playerId: state.players[seat].id });
    beginTurn(state, seat);
  } else {
    beginTurn(state, other(seat));
  }
  return state;
}

/** Agora: a seat controlling all six Chambers wins at once. */
function checkPoliticalSupremacy(state: DuelState): boolean {
  const ag = state.agora;
  if (!ag) return false;
  for (const seat of [0, 1] as const) {
    if (chambersControlled(ag, seat) === CHAMBER_COUNT) {
      endMatch(state, 'political', seat);
      return true;
    }
  }
  return false;
}

function endMatch(state: DuelState, reason: DuelEndReason, winner: 0 | 1 | null): DuelState {
  state.phase = 'gameOver';
  state.subPhase = 'finalScoring';
  state.endReason = reason;
  state.pending = [];
  state.replay = false;
  const breakdown = scoreMatch(state);
  state.finalScoringBreakdown = breakdown;
  state.winnerSeatIdx = reason === 'civilian' ? civilianWinner(breakdown) : winner;
  state.finalScores = {};
  for (const row of breakdown) state.finalScores[row.playerId] = row.total;
  pushLog(state, {
    kind: 'gameEnd', reason,
    winnerId: state.winnerSeatIdx !== null ? state.players[state.winnerSeatIdx].id : null,
  });
  state.activePlayerId = null;
  return state;
}

// ---------- Legal moves ----------

/** Every legal action for the seat that has to act (empty when none). */
export function legalActions(state: DuelState): DuelAction[] {
  if (state.phase !== 'playing' || state.activePlayerId === null) return [];
  const seatIdx = state.activeSeatIdx;
  const me = state.players[seatIdx];
  const opp = state.players[other(seatIdx)];
  const playerId = me.id;
  const p = state.pending[0];
  const pan = state.pantheon;
  const ag = state.agora;
  const chambers = Array.from({ length: CHAMBER_COUNT }, (_, i) => i);
  const moves = (): DuelAction[] => {
    if (!ag) return [];
    const out: DuelAction[] = [];
    for (const c of chambers) {
      if (ag.chambers[c][seatIdx] <= 0) continue;
      for (const t of [c - 1, c + 1]) if (t >= 0 && t < CHAMBER_COUNT) out.push({ type: 'moveInfluence', playerId, from: c + 1, to: t + 1 });
    }
    return out;
  };
  switch (state.subPhase) {
    case 'wonderDraft':
      return (state.wonderDraft?.pool ?? []).map((wonderId) => ({ type: 'submitWonderDraft', playerId, wonderId }));
    case 'turn': {
      const out: DuelAction[] = [];
      const coins = purse(me);
      if (ag && !ag.triggeredThisTurn) {
        for (const c of me.agora?.conspiracies ?? []) {
          if (c.preparedWith !== null && !c.triggered) out.push({ type: 'triggerConspiracy', playerId, conspiracy: c.id });
        }
      }
      const wonders = me.wonders.filter((w) => !w.built)
        .filter((w) => wonderPayment(state, seatIdx, wonderById(w.wonderId)).coins <= coins);
      const unprepared = (me.agora?.conspiracies ?? []).filter((c) => c.preparedWith === null && !c.triggered);
      for (const slot of availableSlots(state.pyramid)) {
        const card = state.cardsById[slot.cardId];
        if (cardPayment(state, seatIdx, card).coins <= coins && (isSenator(card) || !me.tableau.some((c) => c.name === card.name))) {
          out.push({ type: 'takeAndBuild', playerId, cardId: card.id });
        }
        for (const w of wonders) out.push({ type: 'takeAndWonder', playerId, cardId: card.id, wonderId: w.wonderId });
        out.push({ type: 'takeAndDiscard', playerId, cardId: card.id });
        for (const c of unprepared) out.push({ type: 'takeAndPrepare', playerId, cardId: card.id, conspiracy: c.id });
      }
      if (pan?.revealed) {
        pan.spaces.forEach((s, space) => {
          if (!s) return;
          for (const offerings of offeringChoices(me.pantheon?.offeringTokens ?? [])) {
            if (divinityCost(state, seatIdx, space, offerings) <= coins) {
              out.push({ type: 'invokeDivinity', playerId, space, ...(offerings.length ? { offerings } : {}) });
            }
          }
        });
      }
      return out;
    }
    case 'progressPick':
      return state.progressOffer.map((tokenId) => ({ type: 'chooseProgressToken', playerId, tokenId }));
    case 'libraryPick':
      return p?.kind === 'library' ? p.options.map((tokenId) => ({ type: 'chooseProgressToken', playerId, tokenId })) : [];
    case 'enki':
      return (pan?.enkiTokens ?? []).map((tokenId) => ({ type: 'chooseProgressToken', playerId, tokenId }));
    case 'espionage':
      return state.progressBox.map((tokenId) => ({ type: 'chooseProgressToken', playerId, tokenId }));
    case 'destroyCard': {
      if (p?.kind !== 'destroy') return [];
      return opp.tableau.filter((c) => c.color === p.color).map((c) => ({ type: 'destroyCard', playerId, cardId: c.id }));
    }
    case 'discardBuild':
      return state.discard.map((c) => ({ type: 'buildFromDiscard', playerId, cardId: c.id }));
    case 'chooseStarter':
      return state.players.map((x) => ({ type: 'chooseStarter', playerId, starterId: x.id }));
    case 'placeDivinity': {
      if (p?.kind !== 'placeDivinity' || !pan) return [];
      const out: DuelAction[] = [];
      for (const divinity of p.options ?? []) {
        pan.spaces.forEach((s, space) => { if (!s) out.push({ type: 'placeDivinity', playerId, divinity, space }); });
      }
      return out;
    }
    case 'gate':
      return gateOptions(state).map((divinity) => ({ type: 'chooseDivinity', playerId, divinity }));
    case 'theaterDeck':
      return pan ? MYTHOLOGY_IDS.filter((m) => pan.decks[m].length > 0).map((mythology) => ({ type: 'chooseMythology', playerId, mythology })) : [];
    case 'theater': {
      if (p?.kind !== 'theater' || !pan) return [];
      const deck = pan.decks[p.mythology];
      const out: DuelAction[] = [];
      for (const divinity of deck) {
        const rest = deck.filter((d) => d !== divinity);
        if (rest.length === 2) for (const top of rest) out.push({ type: 'chooseDivinity', playerId, divinity, top });
        else out.push({ type: 'chooseDivinity', playerId, divinity });
      }
      return out;
    }
    case 'snake':
      return opp.tableau.filter((c) => c.color === 'green').map((c) => ({ type: 'placeSnake', playerId, cardId: c.id }));
    case 'takeCard':
      return opp.tableau.filter((c) => c.color === 'brown' || c.color === 'gray').map((c) => ({ type: 'takeCard', playerId, cardId: c.id }));
    case 'zeus':
      return state.pyramid.filter((s) => !s.taken).map((s) => ({ type: 'discardStructureCard', playerId, cardId: s.cardId }));
    case 'discardAvailable': {
      const out: DuelAction[] = availableSlots(state.pyramid).map((s) => ({ type: 'discardStructureCard', playerId, cardId: s.cardId }));
      if (p?.kind === 'discardAvailable' && p.optional) out.push({ type: 'skip', playerId });
      return out;
    }
    case 'anubis':
      return state.players.flatMap((x) => x.wonders.filter((w) => w.built)).map((w) => ({ type: 'chooseWonder', playerId, wonderId: w.wonderId }));
    case 'takeWonder':
      return opp.wonders.filter((w) => !w.built).map((w) => ({ type: 'chooseWonder', playerId, wonderId: w.wonderId }));
    case 'sabotage':
      return opp.wonders.filter((w) => w.built).map((w) => ({ type: 'chooseWonder', playerId, wonderId: w.wonderId }));
    case 'isis': {
      const out: DuelAction[] = [];
      for (const c of state.discard) {
        for (const w of me.wonders.filter((x) => !x.built)) out.push({ type: 'wonderFromDiscard', playerId, cardId: c.id, wonderId: w.wonderId });
      }
      return out;
    }
    case 'minerva': {
      const out: DuelAction[] = [];
      for (let position = -9; position <= 9; position++) if (position !== state.militaryPawn) out.push({ type: 'placeMinerva', playerId, position });
      return out;
    }
    case 'neptuneDiscard':
    case 'neptuneApply':
      return militaryTokensLeft(state).map((token) => ({ type: 'chooseMilitaryToken', playerId, token }));
    case 'senate': {
      if (p?.kind !== 'senate' || !ag) return [];
      const out: DuelAction[] = [];
      if ((me.agora?.cubes ?? 0) > 0) for (const c of sectionChambers(p.section)) out.push({ type: 'placeInfluence', playerId, chamber: c + 1 });
      out.push(...moves(), { type: 'skip', playerId });
      return out;
    }
    case 'placeInfluence':
      return (me.agora?.cubes ?? 0) > 0 ? chambers.map((c) => ({ type: 'placeInfluence', playerId, chamber: c + 1 })) : [];
    case 'moveInfluence':
      return [...moves(), { type: 'skip', playerId }];
    case 'removeInfluence':
      return ag ? chambers.filter((c) => ag.chambers[c][other(seatIdx)] > 0).map((c) => ({ type: 'removeInfluence', playerId, chamber: c + 1 })) : [];
    case 'conspirator': {
      const out: DuelAction[] = [];
      if ((me.agora?.cubes ?? 0) > 0) out.push({ type: 'conspiratorChoice', playerId, choice: 'influence' });
      if ((ag?.conspiracyDeck.length ?? 0) > 0) out.push({ type: 'conspiratorChoice', playerId, choice: 'conspire' });
      return out;
    }
    case 'conspire':
      return p?.kind === 'conspire' ? (p.options ?? []).map((conspiracy) => ({ type: 'chooseConspiracy', playerId, conspiracy })) : [];
    case 'remnant':
      return [{ type: 'placeRemnant', playerId, top: true }, { type: 'placeRemnant', playerId, top: false }];
    case 'triggerUnprepared': {
      const out: DuelAction[] = (me.agora?.conspiracies ?? []).filter((c) => !c.triggered && c.preparedWith === null)
        .map((c) => ({ type: 'triggerConspiracy', playerId, conspiracy: c.id }));
      return [...out, { type: 'skip', playerId }];
    }
    case 'lockToken':
      return [...state.progressOffer, ...opp.progressTokens, ...state.progressBox].map((tokenId) => ({ type: 'lockProgressToken', playerId, tokenId }));
    case 'backRowBuild':
      return backRowCards(state).map((c) => ({ type: 'buildCard', playerId, cardId: c.id }));
    case 'boxBuild':
      return treasonCards(state).map((c) => ({ type: 'buildCard', playerId, cardId: c.id }));
    case 'swap':
      return swapOptions(state, seatIdx).map(([t, g]) => ({ type: 'swapCards', playerId, takeId: t.id, giveId: g.id }));
    case 'moveDecree': {
      if (!ag) return [];
      const out: DuelAction[] = [];
      for (const f of chambers) {
        if (ag.decrees[f].length === 0) continue;
        for (const t of chambers) if (t !== f) out.push({ type: 'moveDecree', playerId, from: f + 1, to: t + 1 });
      }
      return out;
    }
    default:
      return [];
  }
}

// Exports for tests.
export const _internals = { startAge, advanceMilitary, settle, endMatch };
