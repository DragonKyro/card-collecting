// Sushi Go! Party — types. Implementation lives alongside in state.ts /
// actions.ts (TBD). This file fixes the shapes the engine and netcode will see.
//
// Party-edition design notes (relevant to the engine, not yet implemented):
// - Menu builder picks 8 card types (1 nigiri set, 1–3 rolls, 5 appetizers,
//   3 specials, 1 dessert) before round 1. The chosen menu drives deck
//   composition only — turn structure is identical across menus.
// - Three rounds. Players are dealt a hand each round, simultaneously pick one
//   card, then pass hands. Engine model: each "tick" collects every player's
//   `play` action, applies them as a batch, rotates hands. Engine waits at a
//   "selection" phase until all live players have submitted.
// - Chopsticks / Spoon / Special Order / Takeout Box / Menu / Soy Sauce / Tea /
//   Wasabi are all "trigger after pick" — we'll model them as a second pending
//   phase per turn the player who played the special enters.
// - Pudding / fruit / scoring cards persist across rounds; non-dessert cards
//   reset.

import type { Seat, PlayerId, GamePhase } from '@/core/types';
import type { RngState } from '@/core/rng';

export type SushiGoCardKind =
  // Nigiri set (always one)
  | 'nigiri'
  // Rolls (choose one)
  | 'maki' | 'temaki' | 'uramaki'
  // Appetizers (choose 3)
  | 'dumpling' | 'tempura' | 'sashimi' | 'mizu_onigiri' | 'tofu' | 'edamame' | 'eel' | 'eggNigiri'
  // Specials (choose 3)
  | 'soySauce' | 'wasabi' | 'tea' | 'specialOrder' | 'takeoutBox' | 'chopsticks' | 'spoon' | 'menu'
  // Desserts (choose 1)
  | 'pudding' | 'greenTeaIceCream' | 'fruit';

export interface SushiGoCard {
  id: number;                 // unique within a game
  kind: SushiGoCardKind;
  /** For nigiri: 1/2/3 (egg/salmon/squid). For fruit: which 3 fruits. Otherwise unused. */
  variant?: string;
}

export interface SushiGoConfig {
  /** Eight card kinds drawn from the menu, set in lobby. */
  menu: SushiGoCardKind[];
  /** Number of rounds (party game is always 3 — kept configurable for sanity). */
  rounds: number;
}

export interface SushiGoPlayer {
  id: PlayerId;
  hand: SushiGoCard[];              // current hand (hidden — UI gates by localPlayerId)
  table: SushiGoCard[];             // cards played this round
  dessertPile: SushiGoCard[];       // cards kept across rounds
  pendingPick: SushiGoCard[] | null; // submitted picks for the current tick (face down until reveal)
  scoreByRound: number[];
}

export interface SushiGoState {
  phase: GamePhase;
  seats: Seat[];
  activePlayerId: PlayerId | null;  // null during simultaneous selection
  finalScores: Record<PlayerId, number> | null;
  rngState: RngState;

  config: SushiGoConfig;
  round: number;
  /** 'selecting' = waiting on picks; 'revealing' = applying batch; 'specialResolution' = post-pick triggers. */
  subPhase: 'selecting' | 'revealing' | 'specialResolution' | 'roundEnd';
  deck: SushiGoCard[];
  players: SushiGoPlayer[];
}

export type SushiGoAction =
  | { type: 'submitPick'; playerId: PlayerId; cardIds: number[] }   // 1 card normally; 2 with chopsticks/spoon
  | { type: 'resolveSpecial'; playerId: PlayerId; payloadJson: string }
  | { type: 'advanceTick' };  // host-only sentinel
