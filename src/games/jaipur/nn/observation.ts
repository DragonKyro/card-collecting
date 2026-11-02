// Jaipur — what one seat is allowed to know, as agent input.
//
// `observe(state, viewerId)` is the ONLY place the learned-agent pipeline (and
// the heuristic AI) reads JaipurState. The feature encoder, legal mask and
// action decoder all take a JaipurObservation, so a policy built on them
// cannot see anything a real player in that seat couldn't. The information
// rules live in ../knowledge.ts.
//
// An exchange is answered one card at a time, carrying a JaipurDraft between
// policy calls (it changes no game state): pick the goods to take from the
// market one by one, close the take, then the cards to give one by one. The
// draft's `stage` says which half is being built.

import type { GamePhase, PlayerId } from '@/core/types';
import type { JaipurBonusSize, JaipurCard, JaipurGood, JaipurState, JaipurSubPhase } from '../types';
import { BONUS_SIZES, GOODS } from '../cards';
import { emptyPiles } from '../reducer';
import { knowledgeOf } from '../knowledge';
import type { Counts, GoodCounts, TradeContext, TradeDraft } from '../rules';
import { countCards } from '../rules';

export interface JaipurDraft extends TradeDraft {
  /** 'take' while goods are still being picked from the market, 'give' after. */
  stage: 'take' | 'give';
}

export type JaipurDecision =
  | { stage: 'main' }
  | { stage: 'take'; draft: JaipurDraft }
  | { stage: 'give'; draft: JaipurDraft };

export interface JaipurObservedOpponent {
  id: PlayerId;
  handSize: number;
  /** Hand goods the viewer knows they hold. */
  known: GoodCounts;
  unknown: number;
  herd: number;
  /** Values of their goods tokens (public). */
  goodsTokens: number[];
  /** How many bonus tokens of each size they hold (values hidden). */
  bonusCounts: Record<JaipurBonusSize, number>;
  seals: number;
}

export interface JaipurObservation {
  viewerId: PlayerId;
  sealsToWin: number;
  round: number;
  phase: GamePhase;
  subPhase: JaipurSubPhase;
  /** The viewer started this round (and so the opponent moves last if it ends on deck). */
  startedRound: boolean;
  deckSize: number;
  market: JaipurCard[];
  discard: Counts;
  /** Remaining token values per good, top first. */
  tokens: Record<JaipurGood, number[]>;
  /** Bonus tokens left in each pile. */
  bonusLeft: Record<JaipurBonusSize, number>;
  emptyPiles: number;
  hand: JaipurCard[];
  /** The viewer's camels (cards, so a trade can name them). */
  herd: JaipurCard[];
  goodsTokens: number[];
  bonusTokens: Array<{ size: JaipurBonusSize; value: number }>;
  seals: number;
  /** What the opponent knows about the viewer's hand. */
  exposed: GoodCounts;
  opponent: JaipurObservedOpponent;
  /** Cards the viewer can't place (deck + the opponent's unknown cards). */
  unseen: Counts;
  /** Bonus values the viewer hasn't seen, per size (piles + opponent's). */
  unseenBonus: Record<JaipurBonusSize, number[]>;
  /** The viewer's current decision, or null when it isn't the viewer's turn. */
  decision: JaipurDecision | null;
}

export interface ObserveOptions {
  /** The viewer's exchange so far; ignored unless it's the viewer's turn. */
  draft?: JaipurDraft | null;
}

export function observe(state: JaipurState, viewerId: PlayerId, opts: ObserveOptions = {}): JaipurObservation {
  const vi = state.players.findIndex((p) => p.id === viewerId);
  if (vi === -1) throw new Error(`observe: ${viewerId} is not seated`);
  const oi = (vi + 1) % state.players.length;
  const me = state.players[vi];
  const opp = state.players[oi];
  const mine = knowledgeOf(state, viewerId);
  const theirs = knowledgeOf(state, opp.id);

  const tokens = {} as Record<JaipurGood, number[]>;
  for (const g of GOODS) tokens[g] = state.tokens[g].map((t) => t.value);
  const bonusLeft = {} as Record<JaipurBonusSize, number>;
  const oppBonus = {} as Record<JaipurBonusSize, number>;
  for (const size of BONUS_SIZES) {
    bonusLeft[size] = state.bonus[size].length;
    oppBonus[size] = opp.bonusTokens.filter((t) => t.size === size).length;
  }

  const myTurn = state.phase === 'playing' && state.subPhase === 'turn' && state.activePlayerId === viewerId;
  const draft = myTurn ? opts.draft ?? null : null;
  const decision: JaipurDecision | null = !myTurn ? null
    : !draft ? { stage: 'main' }
    : { stage: draft.stage, draft: copyDraft(draft) };

  return {
    viewerId,
    sealsToWin: state.config.sealsToWin,
    round: state.round,
    phase: state.phase,
    subPhase: state.subPhase,
    startedRound: state.roundStarterId === viewerId,
    deckSize: state.deck.length,
    market: state.market.map(copyCard),
    discard: countCards(state.discard),
    tokens,
    bonusLeft,
    emptyPiles: emptyPiles(state),
    hand: me.hand.map(copyCard),
    herd: me.herd.map(copyCard),
    goodsTokens: me.goodsTokens.map((t) => t.value),
    bonusTokens: me.bonusTokens.map((t) => ({ size: t.size, value: t.value })),
    seals: me.seals,
    exposed: { ...theirs.knownHands[vi] },
    opponent: {
      id: opp.id,
      handSize: opp.hand.length,
      known: { ...mine.knownHands[oi] },
      unknown: mine.unknownCounts[oi],
      herd: opp.herd.length,
      goodsTokens: opp.goodsTokens.map((t) => t.value),
      bonusCounts: oppBonus,
      seals: opp.seals,
    },
    unseen: mine.unseen,
    unseenBonus: mine.unseenBonus,
    decision,
  };
}

/** The viewer's trade options, from its observation. */
export function obsTradeContext(obs: JaipurObservation): TradeContext {
  return { market: countCards(obs.market), hand: countCards(obs.hand), herd: obs.herd.length };
}

function copyCard(c: JaipurCard): JaipurCard {
  return { id: c.id, type: c.type };
}

function copyDraft(d: JaipurDraft): JaipurDraft {
  return { take: { ...d.take }, give: { ...d.give }, stage: d.stage };
}
