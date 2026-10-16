// Sushi Go! Party — types.
//
// A "menu" is the set of 8 card kinds chosen in the lobby:
//   1 nigiri set + 1 roll + 3 appetizers + 2 specials + 1 dessert.
// The chosen menu drives deck composition only; turn flow is identical across
// menus.
//
// Turn structure: every round players are dealt a hand, simultaneously submit
// one pick from their hand, then hands pass left. Engine waits at
// `subPhase: 'selecting'` until all live players have submitted, then reveals.
// Cards that need a decision once revealed (special order, spoon, menu,
// takeout box) queue up in `resolution` and are answered one at a time in
// `subPhase: 'resolving'` before hands pass. Three rounds; dessert pile
// persists across rounds.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SushiGoCategory = 'nigiri' | 'roll' | 'appetizer' | 'special' | 'dessert';

export type SushiGoCardKind =
  // Nigiri set (always one, scored egg/salmon/squid).
  | 'nigiri'
  // Rolls (pick 1).
  | 'maki' | 'temaki' | 'uramaki'
  // Appetizers (pick 3).
  | 'dumpling' | 'tempura' | 'sashimi' | 'mizuOnigiri' | 'tofu' | 'edamame' | 'eel' | 'misoSoup'
  // Specials (pick 2).
  | 'soySauce' | 'wasabi' | 'tea' | 'specialOrder' | 'takeoutBox' | 'chopsticks' | 'spoon' | 'menu'
  // Desserts (pick 1).
  | 'pudding' | 'greenTeaIceCream' | 'fruit';

/** What a resolved special order counts as. */
export interface SushiGoCopy {
  kind: SushiGoCardKind;
  variant?: string;
  flipped?: boolean;
}

/** Some card kinds carry a variant (nigiri = egg/salmon/squid, maki = icon count,
 *  fruit = which fruits, chopsticks/spoon/menu/takeout box = the resolution-order
 *  number in the card's corner). */
export interface SushiGoCard {
  id: number;
  kind: SushiGoCardKind;
  /** Free-text discriminator. Documented per-kind in cards.ts. */
  variant?: string;
  /** Turned face-down by a takeout box: worth 2 at round end and no longer its kind. */
  flipped?: boolean;
  /** Special order only: the card it copies, once chosen. */
  copyOf?: SushiGoCopy;
}

export interface SushiGoConfig {
  /** Exactly 8 unique kinds: 1 nigiri + 1 roll + 3 appetizers + 2 specials + 1 dessert. */
  menu: SushiGoCardKind[];
  /** Number of rounds (party = 3; configurable 1-5 for sanity testing). */
  rounds: number;
}

export interface SushiGoPlayer {
  id: PlayerId;
  hand: SushiGoCard[];
  /** Cards played this round. Order matters for some scoring (wasabi → next nigiri). */
  table: SushiGoCard[];
  /** Cards kept across rounds (dessert only). */
  dessertPile: SushiGoCard[];
  /** This round's submitted pick — set during the selection phase. */
  pendingPick: SushiGoCard[] | null;
  /** Whether the pending pick also calls a spoon from the table. */
  pendingSpoon: boolean;
  /** Uramaki points already scored this round by reaching 10 icons. */
  uramakiPoints: number;
  /** Per-round score breakdown; index 0 = round 1 total, etc. */
  scoreByRound: number[];
  /** Dessert score, applied at the end of the match. */
  dessertScore: number;
}

export type SushiGoSubPhase =
  | 'selecting'      // waiting for all players to submit picks
  | 'resolving'      // revealed; answering special-card decisions one at a time
  | 'roundEnd'       // round scored; awaiting next-round confirm
  | 'matchEnd';

/** A decision owed by `playerId` before hands pass. `order` is the number in
 *  the card's corner — numbered cards resolve lowest first. */
export type SushiGoStep =
  /** A special order picks one of its owner's other played cards to copy. */
  | { type: 'copy'; playerId: PlayerId; cardId: number }
  /** A spoon names the card it wants. */
  | { type: 'spoon'; playerId: PlayerId; cardId: number; order: number }
  /** The first player to the spoon's left holding the request picks which copy to hand over. */
  | { type: 'spoonGive'; playerId: PlayerId; toId: PlayerId; spoonId: number; options: number[] }
  /** A menu plays one of the cards it drew (drawn when the step comes up). */
  | { type: 'menu'; playerId: PlayerId; cardId: number; order: number; drawn: SushiGoCard[] | null }
  /** A takeout box flips any of its owner's cards from earlier turns. */
  | { type: 'takeout'; playerId: PlayerId; cardId: number; order: number };

export interface SushiGoResolution {
  /** Head is the decision being waited on. */
  steps: SushiGoStep[];
  /** Ids of every card that reached a table this turn (miso soup, takeout box). */
  playedThisTurn: number[];
}

export interface SushiGoRoundScore {
  playerId: PlayerId;
  /** Itemized score per kind played this round. */
  perKind: Array<{ kind: SushiGoCardKind; points: number; detail?: string }>;
  /** Sum of perKind. */
  total: number;
}

export interface SushiGoRoundSummary {
  round: number;
  perPlayer: SushiGoRoundScore[];
}

export interface SushiGoState {
  phase: GamePhase;
  seats: Seat[];
  /** Null while in simultaneous selection; the chooser while resolving. */
  activePlayerId: PlayerId | null;
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: SushiGoConfig;
  round: number;
  subPhase: SushiGoSubPhase;

  /** Undealt cards this round. Menus draw from here. */
  deck: SushiGoCard[];
  /** Dessert cards not yet shuffled into a round (all 15 of the chosen dessert, shuffled at setup). */
  dessertSupply: SushiGoCard[];
  /** Cards discarded face-up this round (used menus / takeout boxes / spoons,
   *  miso soups that clashed, scored uramaki). Public. */
  discards: SushiGoCard[];
  players: SushiGoPlayer[];

  /** Uramaki places already claimed this round (index into 8/5/2). */
  uramakiNextPlace: number;
  /** Special-card decisions after a reveal; null while selecting. */
  resolution: SushiGoResolution | null;

  /** Last round's score breakdown (shown on the round-end screen). */
  lastRoundSummary: SushiGoRoundSummary | null;

  /** Append-only event log for the history sidebar. */
  log: SushiGoLogEntry[];
  logSeq: number;
}

type LoggedCard = { kind: SushiGoCardKind; variant?: string };

export type SushiGoLogEntry =
  | { seq: number; round: number; kind: 'pickSubmitted'; playerId: PlayerId }
  | { seq: number; round: number; kind: 'pickRevealed'; playerId: PlayerId; cards: LoggedCard[] }
  | { seq: number; round: number; kind: 'copied'; playerId: PlayerId; card: LoggedCard | null }
  | { seq: number; round: number; kind: 'spoon'; playerId: PlayerId; asked: LoggedCard; fromId: PlayerId | null }
  | { seq: number; round: number; kind: 'menu'; playerId: PlayerId; card: LoggedCard | null }
  | { seq: number; round: number; kind: 'flipped'; playerId: PlayerId; count: number }
  | { seq: number; round: number; kind: 'misoDiscarded'; playerIds: PlayerId[] }
  | { seq: number; round: number; kind: 'uramaki'; playerId: PlayerId; points: number }
  | { seq: number; round: number; kind: 'roundEnd' }
  | { seq: number; round: number; kind: 'matchEnd'; winnerId: PlayerId | null };

export type SushiGoAction =
  /** Player submits their pick: 1 card, or 2 using chopsticks from their table.
   *  `useSpoon` also calls a spoon from their table (the card is named once revealed). */
  | { type: 'submitPick'; playerId: PlayerId; cardIds: number[]; useSpoon?: boolean }
  /** Special order: copy one of your other played cards. */
  | { type: 'copyCard'; playerId: PlayerId; targetId: number }
  /** Spoon: name a card kind, optionally one exact variant. */
  | { type: 'askSpoon'; playerId: PlayerId; kind: SushiGoCardKind; variant?: string }
  /** The asked player hands over one of the matching cards. */
  | { type: 'giveSpoon'; playerId: PlayerId; cardId: number }
  /** Menu: play one of the drawn cards. */
  | { type: 'pickMenu'; playerId: PlayerId; cardId: number }
  /** Takeout box: flip any of your earlier cards (possibly none). */
  | { type: 'flipCards'; playerId: PlayerId; cardIds: number[] }
  /** Move from roundEnd to the next round (or to matchEnd if final). */
  | { type: 'nextRound' };
