// Jaipur — types.
//
// 55 cards: diamond ×6, gold ×6, silver ×6, cloth ×8, spice ×8, leather ×10,
// camel ×11. Goods tokens per good, highest on top:
//   diamond 7 7 5 5 5 · gold 6 6 5 5 5 · silver 5 5 5 5 5
//   cloth 5 3 3 2 2 1 1 · spice 5 3 3 2 2 1 1 · leather 4 3 2 1 1 1 1 1 1
// Bonus tokens, shuffled face down per size:
//   ×3: 3 3 2 2 2 1 1 · ×4: 6 6 5 5 4 4 · ×5: 10 10 9 8 8
// plus the camel token (5) and three Seals of Excellence.
//
// A round: 3 camels + 2 deck cards form the market, each player gets 5 cards
// and moves their camels to a face-up herd. On a turn the active player does
// exactly one of:
//   takeOne     one good from the market into hand; the deck refills its slot
//   takeCamels  every camel in the market into the herd; the deck refills
//   exchange    2+ goods from the market, paid for with as many cards from
//               hand and/or camels from the herd — never a good of a type
//               being taken
//   sell        any number of one good from hand (diamond / gold / silver:
//               at least 2) for that many tokens off the top of its pile,
//               plus a bonus token for 3 / 4 / 5+ cards
// with at most 7 cards in hand afterwards (camels don't count). The round
// ends the moment 3 goods piles are empty, or the market needs a card the
// deck no longer has. Most camels takes the camel token (none on a tie);
// most rupees wins a seal — ties go to more bonus tokens, then more goods
// tokens. The loser starts the next round; first to `sealsToWin` seals wins.
//
// Randomness (the deck order, the bonus piles, round one's starter) is drawn
// from `rngState` when a round is set up, so every action is deterministic.
// Hidden information — the deck, each hand, the bonus piles and the values of
// an opponent's bonus tokens — is a UI concern; what a seat may know is
// defined in knowledge.ts.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type JaipurGood = 'diamond' | 'gold' | 'silver' | 'cloth' | 'spice' | 'leather';
export type JaipurCardType = JaipurGood | 'camel';
export type JaipurBonusSize = 3 | 4 | 5;

export interface JaipurCard {
  id: number;
  type: JaipurCardType;
}

export interface JaipurGoodsToken {
  id: number;
  good: JaipurGood;
  value: number;
}

export interface JaipurBonusToken {
  id: number;
  size: JaipurBonusSize;
  value: number;
}

export interface JaipurPlayer {
  id: PlayerId;
  /** Goods only — camels go straight to the herd. */
  hand: JaipurCard[];
  /** Camels, face up. */
  herd: JaipurCard[];
  goodsTokens: JaipurGoodsToken[];
  /** Face down: only the owner sees their values until the round is scored. */
  bonusTokens: JaipurBonusToken[];
  seals: number;
}

export interface JaipurConfig {
  /** Seals of Excellence needed to win: 2 = best of three rounds. */
  sealsToWin: number;
  /** Which trained policy plays the AI seats (see levels.ts); omitted = the
   *  default level. */
  aiLevel?: JaipurAiLevel;
}

/** A trained policy shipped in ./policies. */
export type JaipurAiLevel = 'easy' | 'normal' | 'hard';

export type JaipurSubPhase = 'turn' | 'roundEnd';

export interface JaipurRoundScore {
  playerId: PlayerId;
  goods: number;
  bonus: number;
  /** The camel token's 5, or 0. */
  camel: number;
  total: number;
  goodsCount: number;
  bonusCount: number;
  herd: number;
}

export interface JaipurRoundSummary {
  round: number;
  endedBy: 'tokens' | 'deck';
  camelTokenTo: PlayerId | null;
  /** Null when the round was tied on every tiebreak (no seal; play again). */
  winnerId: PlayerId | null;
  /** What separated the players. */
  decidedBy: 'rupees' | 'bonusTokens' | 'goodsTokens' | 'tie';
  perPlayer: JaipurRoundScore[];
}

/** Structured log. Values are kept in full (state is replicated anyway);
 *  `bonus.value` on a sale is private to the seller until the round ends —
 *  readers must not show it to anyone else. */
export type JaipurLogEntry =
  | { seq: number; round: number; kind: 'takeOne'; playerId: PlayerId; good: JaipurGood; refill: JaipurCardType | null }
  | { seq: number; round: number; kind: 'takeCamels'; playerId: PlayerId; count: number; refills: JaipurCardType[] }
  | { seq: number; round: number; kind: 'exchange'; playerId: PlayerId; took: JaipurGood[]; gave: JaipurCardType[] }
  | {
    seq: number; round: number; kind: 'sell'; playerId: PlayerId; good: JaipurGood; count: number;
    tokens: number[]; bonus: { size: JaipurBonusSize; value: number } | null;
  }
  | { seq: number; round: number; kind: 'roundEnd'; endedBy: JaipurRoundSummary['endedBy']; winnerId: PlayerId | null }
  | { seq: number; round: number; kind: 'matchEnd'; winnerId: PlayerId };

export interface JaipurState {
  phase: GamePhase;
  seats: Seat[];
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: JaipurConfig;
  round: number;
  subPhase: JaipurSubPhase;
  /** Face down; the top card is the LAST element. */
  deck: JaipurCard[];
  /** Up to 5 face-up cards, in display order. A replacement card takes the
   *  slot of the card it replaces, so the market doesn't reshuffle on screen. */
  market: JaipurCard[];
  /** Sold cards, face up; last = most recent. */
  discard: JaipurCard[];
  /** Goods piles; index 0 is the top (most valuable) token. */
  tokens: Record<JaipurGood, JaipurGoodsToken[]>;
  /** Shuffled face-down bonus piles; index 0 is the top. */
  bonus: Record<JaipurBonusSize, JaipurBonusToken[]>;
  players: JaipurPlayer[];
  /** Who took the first turn of this round. */
  roundStarterId: PlayerId | null;
  lastRoundSummary: JaipurRoundSummary | null;
  roundHistory: JaipurRoundSummary[];
  winnerId: PlayerId | null;
  log: JaipurLogEntry[];
  logSeq: number;
}

export type JaipurAction =
  | { type: 'takeOne'; cardId: number }
  | { type: 'takeCamels' }
  /** `takeIds` are market goods; `giveIds` are hand cards and/or herd camels. */
  | { type: 'exchange'; takeIds: number[]; giveIds: number[] }
  /** Cards of one good from hand. */
  | { type: 'sell'; cardIds: number[] }
  | { type: 'nextRound' };
