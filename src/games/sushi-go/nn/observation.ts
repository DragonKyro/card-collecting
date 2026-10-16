// Sushi Go! Party — what one seat is allowed to know, as agent input.
//
// `observe(state, viewerId)` is the ONLY place the learned-agent pipeline
// reads SushiGoState; the encoder (and any action decoder) take a
// SushiGoObservation, so a policy built on them can't see anything a real
// player in that seat couldn't.
//
//   visible   own hand, every table (special-order copies and flipped cards
//             included), dessert piles, the round's discards, hand and deck
//             sizes, scores, who has submitted a pick this turn, whose
//             special-card decision is pending, and the viewer's own decision
//             (its menu draw, the cards it may copy / flip / hand over).
//   recalled  hands the viewer has held. Hands pass left, so the seat k places
//             to the left holds the hand the viewer passed k turns ago, and
//             everything that happened to it since was public: picks are
//             revealed face-up, used chopsticks go back in openly, a spoon's
//             hand-over is played face-up and the spoon handed across. So that
//             hand is known exactly once the round has had k passes — at 2
//             players, the opponent's whole hand from the second turn on.
//   hidden    every other hand, which card(s) anyone put face-down this turn
//             and whether they're calling a spoon, the deck, the dessert
//             supply, other players' menu draws and spoon hand-over choices,
//             the RNG.
//
// Simplification: the viewer knows a little more than this in two rare
// spots — the three cards its own menu put back in the deck, and that a
// player who answered a spoon now holds it — and the observation leaves both
// out (under-informing is safe; over-informing is not).
//
// Players are listed by seat offset from the viewer, in passing direction:
// 0 = viewer, 1 = the left neighbour (gets the viewer's hand next),
// n−1 = the right neighbour (passes the viewer its hand).

import type { PlayerId } from '@/core/types';
import type {
  SushiGoCard, SushiGoCardKind, SushiGoPlayer, SushiGoState, SushiGoStep, SushiGoSubPhase,
} from '../types';
import { handSize } from '../cards';
import { bonusCard, copyTargets, flipTargets } from '../reducer';

export interface SushiGoObservedPlayer {
  id: PlayerId;
  handSize: number;
  /** The player's hand, when the viewer has held it this round (always for
   *  the viewer itself); null while unseen. */
  knownHand: SushiGoCard[] | null;
  /** Played this round, in order (wasabi → next nigiri). */
  table: SushiGoCard[];
  dessertPile: SushiGoCard[];
  /** Uramaki places already scored this round. */
  uramakiPoints: number;
  scoreByRound: number[];
  /** Put a card face-down this turn (which one, and any spoon call, stay hidden). */
  submitted: boolean;
}

/** What the viewer has to decide right now. */
export type SushiGoDecision =
  /** Pick from the hand: 1 card, 2 with chopsticks, optionally calling a spoon. */
  | { type: 'pick'; canChopsticks: boolean; canSpoon: boolean }
  /** Own special order: which of these to copy. */
  | { type: 'copy'; cardId: number; targets: SushiGoCard[] }
  /** Own spoon: name a card. */
  | { type: 'spoon'; cardId: number }
  /** Someone's spoon asked for a kind the viewer holds in several variants: which to give. */
  | { type: 'spoonGive'; askerOffset: number; options: SushiGoCard[] }
  /** Own menu: play one of these. */
  | { type: 'menu'; cardId: number; drawn: SushiGoCard[] }
  /** Own takeout box: flip any of these. */
  | { type: 'takeout'; cardId: number; targets: SushiGoCard[] };

export interface SushiGoObservation {
  viewerId: PlayerId;
  playerCount: number;
  menu: SushiGoCardKind[];
  rounds: number;
  round: number;
  subPhase: SushiGoSubPhase;
  /** Cards each player was dealt this round. */
  dealtHandSize: number;
  /** Hand passes so far this round (hands at offsets 1..passes are known). */
  passes: number;
  deckSize: number;
  uramakiNextPlace: number;
  /** Cards discarded face-up this round. */
  discards: SushiGoCard[];
  /** The viewer's hand (= players[0].knownHand). */
  hand: SushiGoCard[];
  players: SushiGoObservedPlayer[];
  decision: SushiGoDecision | null;
  /** Someone else's special-card decision the table is waiting on. */
  waitingOn: { type: SushiGoStep['type']; offset: number } | null;
}

/** Passes so far this round: each turn takes one card net out of every hand,
 *  and hands move on once the turn's special cards are resolved. */
export function passesThisRound(state: SushiGoState, viewerId: PlayerId): number {
  const viewer = state.players.find((p) => p.id === viewerId)!;
  const played = handSize(state.players.length) - viewer.hand.length;
  return Math.max(0, state.subPhase === 'resolving' ? played - 1 : played);
}

export function observe(state: SushiGoState, viewerId: PlayerId): SushiGoObservation {
  const n = state.players.length;
  const viewerIdx = state.players.findIndex((p) => p.id === viewerId);
  if (viewerIdx === -1) throw new Error(`observe: ${viewerId} is not seated`);
  const offsetOf = (id: PlayerId) => (state.players.findIndex((p) => p.id === id) - viewerIdx + n) % n;
  const viewer = state.players[viewerIdx];
  const passes = state.subPhase === 'selecting' || state.subPhase === 'resolving'
    ? passesThisRound(state, viewerId) : 0;

  const players: SushiGoObservedPlayer[] = [];
  for (let off = 0; off < n; off++) {
    const p = state.players[(viewerIdx + off) % n];
    players.push({
      id: p.id,
      handSize: p.hand.length,
      knownHand: off === 0 || off <= passes ? p.hand.map(copyCard) : null,
      table: p.table.map(copyCard),
      dessertPile: p.dessertPile.map(copyCard),
      uramakiPoints: p.uramakiPoints,
      scoreByRound: p.scoreByRound.slice(),
      submitted: state.subPhase === 'selecting' && p.pendingPick !== null,
    });
  }

  const step = state.subPhase === 'resolving' ? state.resolution?.steps[0] ?? null : null;
  return {
    viewerId,
    playerCount: n,
    menu: state.config.menu.slice(),
    rounds: state.config.rounds,
    round: state.round,
    subPhase: state.subPhase,
    dealtHandSize: handSize(n),
    passes,
    deckSize: state.deck.length,
    uramakiNextPlace: state.uramakiNextPlace,
    discards: state.discards.map(copyCard),
    hand: viewer.hand.map(copyCard),
    players,
    decision: decisionFor(state, viewer, step, offsetOf),
    waitingOn: step && step.playerId !== viewerId ? { type: step.type, offset: offsetOf(step.playerId) } : null,
  };
}

function decisionFor(
  state: SushiGoState,
  viewer: SushiGoPlayer,
  step: SushiGoStep | null,
  offsetOf: (id: PlayerId) => number,
): SushiGoDecision | null {
  if (state.phase !== 'playing') return null;
  if (state.subPhase === 'selecting') {
    if (viewer.pendingPick !== null || viewer.hand.length === 0) return null;
    return {
      type: 'pick',
      canChopsticks: viewer.hand.length >= 2 && bonusCard(viewer, 'chopsticks') !== undefined,
      canSpoon: bonusCard(viewer, 'spoon') !== undefined,
    };
  }
  if (!step || step.playerId !== viewer.id) return null;
  switch (step.type) {
    case 'copy':
      return { type: 'copy', cardId: step.cardId, targets: copyTargets(viewer, step.cardId).map(copyCard) };
    case 'spoon':
      return { type: 'spoon', cardId: step.cardId };
    case 'spoonGive':
      return {
        type: 'spoonGive',
        askerOffset: offsetOf(step.toId),
        options: viewer.hand.filter((c) => step.options.includes(c.id)).map(copyCard),
      };
    case 'menu':
      return { type: 'menu', cardId: step.cardId, drawn: (step.drawn ?? []).map(copyCard) };
    case 'takeout':
      return { type: 'takeout', cardId: step.cardId, targets: flipTargets(state, viewer).map(copyCard) };
  }
}

function copyCard(c: SushiGoCard): SushiGoCard {
  return {
    id: c.id,
    kind: c.kind,
    ...(c.variant !== undefined ? { variant: c.variant } : {}),
    ...(c.flipped ? { flipped: true } : {}),
    ...(c.copyOf ? { copyOf: { ...c.copyOf } } : {}),
  };
}
