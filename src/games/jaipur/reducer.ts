// Jaipur — reducer. Pure: every random draw comes from state.rngState when a
// round is set up (deck order, bonus piles), so an action fully determines
// the next state. See types.ts for the rules summary.

import type { PlayerId, Seat } from '@/core/types';
import { createRng, rngInt, shuffle } from '@/core/rng';
import type {
  JaipurAction, JaipurBonusSize, JaipurBonusToken, JaipurCard, JaipurConfig, JaipurGood, JaipurGoodsToken,
  JaipurLogEntry, JaipurPlayer, JaipurState,
} from './types';
import {
  BONUS_SIZES, BONUS_VALUES, CARD_COUNTS, CARD_TYPES, EMPTY_PILES_TO_END, GOODS, HAND_DEAL, HAND_LIMIT,
  MARKET_CAMELS, MARKET_SIZE, TOKEN_VALUES, bonusSizeFor, minSale,
} from './cards';
import { canCompleteTrade, countCards, emptyCounts, emptyGoodCounts, isCompleteTrade, type TradeContext } from './rules';
import { scoreRound } from './scoring';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/** The full card set, ids 0–54 in type order (camels last). */
export function allCards(): JaipurCard[] {
  const out: JaipurCard[] = [];
  for (const type of CARD_TYPES) for (let i = 0; i < CARD_COUNTS[type]; i++) out.push({ id: out.length, type });
  return out;
}

/** Fresh goods piles (ids 0–37), most valuable on top. */
export function freshTokens(): Record<JaipurGood, JaipurGoodsToken[]> {
  let id = 0;
  const out = {} as Record<JaipurGood, JaipurGoodsToken[]>;
  for (const good of GOODS) out[good] = TOKEN_VALUES[good].map((value) => ({ id: id++, good, value }));
  return out;
}

/** Bonus tokens (ids 100–117) per size, in printed order (unshuffled). */
export function freshBonus(): Record<JaipurBonusSize, JaipurBonusToken[]> {
  let id = 100;
  const out = {} as Record<JaipurBonusSize, JaipurBonusToken[]>;
  for (const size of BONUS_SIZES) out[size] = BONUS_VALUES[size].map((value) => ({ id: id++, size, value }));
  return out;
}

export function createJaipurState(config: JaipurConfig, seed: number, seats: Seat[]): JaipurState {
  const state: JaipurState = {
    phase: 'playing',
    seats,
    activePlayerId: null,
    finalScores: null,
    rngState: createRng(seed),
    config,
    round: 1,
    subPhase: 'turn',
    deck: [],
    market: [],
    discard: [],
    tokens: freshTokens(),
    bonus: freshBonus(),
    players: seats.map((s) => ({ id: s.id, hand: [], herd: [], goodsTokens: [], bonusTokens: [], seals: 0 })),
    roundStarterId: null,
    lastRoundSummary: null,
    roundHistory: [],
    winnerId: null,
    log: [],
    logSeq: 0,
  };
  if (state.players.length === 0) return state;
  const starter = state.players[rngInt(state.rngState, state.players.length)].id;
  setupRound(state, starter);
  return state;
}

/** Deal a round: 3 camels + 2 cards to the market, 5 cards each, camels to herds. */
function setupRound(state: JaipurState, starterId: PlayerId): void {
  const cards = allCards();
  const camels = cards.filter((c) => c.type === 'camel');
  const marketCamels = camels.slice(0, MARKET_CAMELS);
  const rest = cards.filter((c) => !marketCamels.includes(c));
  state.deck = shuffle(state.rngState, rest);
  state.market = marketCamels;
  state.discard = [];
  state.tokens = freshTokens();
  const bonus = freshBonus();
  for (const size of BONUS_SIZES) bonus[size] = shuffle(state.rngState, bonus[size]);
  state.bonus = bonus;
  for (const p of state.players) {
    const dealt = state.deck.splice(state.deck.length - HAND_DEAL, HAND_DEAL).reverse();
    p.hand = dealt.filter((c) => c.type !== 'camel');
    p.herd = dealt.filter((c) => c.type === 'camel');
    p.goodsTokens = [];
    p.bonusTokens = [];
  }
  while (state.market.length < MARKET_SIZE) state.market.push(state.deck.pop()!);
  state.subPhase = 'turn';
  state.roundStarterId = starterId;
  state.activePlayerId = starterId;
}

export function playerById(state: JaipurState, id: PlayerId): JaipurPlayer {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}

export function opponentOf(state: JaipurState, id: PlayerId): JaipurPlayer {
  const i = state.players.findIndex((x) => x.id === id);
  return state.players[(i + 1) % state.players.length];
}

/** What the active player's trade options depend on. */
export function tradeContext(state: JaipurState, player: JaipurPlayer): TradeContext {
  return { market: countCards(state.market), hand: countCards(player.hand), herd: player.herd.length };
}

export function emptyPiles(state: JaipurState): number {
  return GOODS.filter((g) => state.tokens[g].length === 0).length;
}

/** Omit over each member of a union. */
type LogBody<T> = T extends unknown ? Omit<T, 'seq' | 'round'> : never;

function log(state: JaipurState, entry: LogBody<JaipurLogEntry>): void {
  state.log.push({ ...entry, seq: state.logSeq++, round: state.round } as JaipurLogEntry);
}

/** Empty the given market slots and refill them from the deck, in order.
 *  False when the deck ran out first (the market then closes up its gaps). */
function refill(state: JaipurState, slots: number[]): boolean {
  const market = state.market as Array<JaipurCard | null>;
  for (const i of slots) market[i] = null;
  for (const i of slots) {
    const card = state.deck.pop();
    if (!card) {
      state.market = market.filter((c): c is JaipurCard => c !== null);
      return false;
    }
    market[i] = card;
  }
  return true;
}

function endTurn(state: JaipurState, player: JaipurPlayer, deckOk: boolean): void {
  if (!deckOk) return endRound(state, 'deck');
  if (emptyPiles(state) >= EMPTY_PILES_TO_END) return endRound(state, 'tokens');
  state.activePlayerId = opponentOf(state, player.id).id;
}

function endRound(state: JaipurState, endedBy: 'tokens' | 'deck'): void {
  const summary = scoreRound(state.players, state.round, endedBy);
  state.lastRoundSummary = summary;
  state.roundHistory.push(summary);
  log(state, { kind: 'roundEnd', endedBy, winnerId: summary.winnerId });
  if (summary.winnerId) {
    const winner = playerById(state, summary.winnerId);
    winner.seals++;
    if (winner.seals >= state.config.sealsToWin) {
      state.phase = 'gameOver';
      state.winnerId = winner.id;
      state.activePlayerId = null;
      state.finalScores = Object.fromEntries(state.players.map((p) => [p.id, p.seals]));
      log(state, { kind: 'matchEnd', winnerId: winner.id });
      return;
    }
  }
  state.subPhase = 'roundEnd';
  // Park the AI driver on a seat only when no human needs to read the summary.
  state.activePlayerId = state.seats.length > 0 && state.seats.every((s) => s.isAI) ? state.seats[0].id : null;
}

/** Who starts the next round: the last round's loser (after a full tie, the
 *  player who didn't start the last one). */
function nextStarter(state: JaipurState): PlayerId {
  const winner = state.lastRoundSummary?.winnerId;
  if (winner) return opponentOf(state, winner).id;
  return opponentOf(state, state.roundStarterId ?? state.players[0].id).id;
}

function requireActive(state: JaipurState): JaipurPlayer {
  if (state.phase !== 'playing' || state.subPhase !== 'turn' || !state.activePlayerId) {
    throw new Error('not a turn');
  }
  return playerById(state, state.activePlayerId);
}

function takeById<T extends { id: number }>(arr: T[], id: number, what: string): T {
  const i = arr.findIndex((c) => c.id === id);
  if (i === -1) throw new Error(`${what}: card ${id} not available`);
  return arr.splice(i, 1)[0];
}

export function applyAction(state: JaipurState, action: JaipurAction): JaipurState {
  const s = clone(state);
  switch (action.type) {
    case 'takeOne': {
      const p = requireActive(s);
      const slot = s.market.findIndex((c) => c.id === action.cardId);
      if (slot === -1) throw new Error('takeOne: card not in the market');
      const card = s.market[slot];
      if (card.type === 'camel') throw new Error('takeOne: camels are taken all together');
      if (p.hand.length >= HAND_LIMIT) throw new Error(`takeOne: hand limit is ${HAND_LIMIT}`);
      p.hand.push(card);
      const ok = refill(s, [slot]);
      log(s, { kind: 'takeOne', playerId: p.id, good: card.type, refill: ok ? s.market[slot].type : null });
      endTurn(s, p, ok);
      return s;
    }

    case 'takeCamels': {
      const p = requireActive(s);
      const slots = s.market.flatMap((c, i) => (c.type === 'camel' ? [i] : []));
      if (slots.length === 0) throw new Error('takeCamels: no camels in the market');
      p.herd.push(...slots.map((i) => s.market[i]));
      const ok = refill(s, slots);
      log(s, {
        kind: 'takeCamels', playerId: p.id, count: slots.length,
        refills: ok ? slots.map((i) => s.market[i].type) : [],
      });
      endTurn(s, p, ok);
      return s;
    }

    case 'exchange': {
      const p = requireActive(s);
      const { takeIds, giveIds } = action;
      if (takeIds.length < 2) throw new Error('exchange: take at least 2 goods');
      if (giveIds.length !== takeIds.length) throw new Error('exchange: give as many cards as you take');
      if (new Set(takeIds).size !== takeIds.length || new Set(giveIds).size !== giveIds.length) {
        throw new Error('exchange: a card is listed twice');
      }
      const slots = takeIds.map((id) => s.market.findIndex((c) => c.id === id));
      if (slots.some((i) => i === -1)) throw new Error('exchange: card not in the market');
      const taken = slots.map((i) => s.market[i]);
      if (taken.some((c) => c.type === 'camel')) throw new Error('exchange: camels are taken all together');
      const given = giveIds.map((id) => p.hand.find((c) => c.id === id) ?? p.herd.find((c) => c.id === id));
      if (given.some((c) => !c)) throw new Error('exchange: you do not hold that card');
      const draft = { take: emptyGoodCounts(), give: emptyCounts() };
      for (const c of taken) draft.take[c.type as JaipurGood]++;
      for (const c of given) draft.give[c!.type]++;
      const ctx = tradeContext(s, p);
      if (!isCompleteTrade(ctx, draft)) {
        throw new Error(canCompleteTrade(ctx, { ...draft, give: emptyCounts() })
          ? 'exchange: you cannot give back a good of a type you take, or end above 7 cards'
          : 'exchange: not a legal trade');
      }
      for (const c of given) {
        if (c!.type === 'camel') takeById(p.herd, c!.id, 'exchange');
        else takeById(p.hand, c!.id, 'exchange');
      }
      slots.forEach((slot, k) => { s.market[slot] = given[k]!; });
      p.hand.push(...taken);
      log(s, { kind: 'exchange', playerId: p.id, took: taken.map((c) => c.type as JaipurGood), gave: given.map((c) => c!.type) });
      endTurn(s, p, true);
      return s;
    }

    case 'sell': {
      const p = requireActive(s);
      const ids = action.cardIds;
      if (ids.length === 0) throw new Error('sell: choose cards to sell');
      if (new Set(ids).size !== ids.length) throw new Error('sell: a card is listed twice');
      const cards = ids.map((id) => p.hand.find((c) => c.id === id));
      if (cards.some((c) => !c)) throw new Error('sell: you do not hold that card');
      const good = cards[0]!.type as JaipurGood;
      if (cards.some((c) => c!.type !== good)) throw new Error('sell: one type of good at a time');
      if (ids.length < minSale(good)) throw new Error(`sell: ${good} sells at least ${minSale(good)} at a time`);
      for (const c of cards) s.discard.push(takeById(p.hand, c!.id, 'sell'));
      const tokens = s.tokens[good].splice(0, ids.length);
      p.goodsTokens.push(...tokens);
      const size = bonusSizeFor(ids.length);
      const bonus = size ? s.bonus[size].shift() ?? null : null;
      if (bonus) p.bonusTokens.push(bonus);
      log(s, {
        kind: 'sell', playerId: p.id, good, count: ids.length, tokens: tokens.map((t) => t.value),
        bonus: bonus ? { size: bonus.size, value: bonus.value } : null,
      });
      endTurn(s, p, true);
      return s;
    }

    case 'nextRound': {
      if (s.phase !== 'playing' || s.subPhase !== 'roundEnd') throw new Error('nextRound: the round is not over');
      const starter = nextStarter(s);
      s.round++;
      setupRound(s, starter);
      return s;
    }
  }
}
