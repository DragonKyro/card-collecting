// Sea Salt & Paper — what one seat is allowed to know, as agent input.
//
// `observe(state, viewerId)` is the ONLY place the learned-agent pipeline
// reads SspState. The feature encoder, legal mask and action decoder all take
// an SspObservation, so a policy built on them cannot see anything a real
// player in that seat couldn't. The information rules themselves live in
// ../knowledge.ts:
//
//   visible   own hand, every table, pile tops and sizes, hand sizes, match
//             scores, events, the score a LAST CHANCE caller announced, the
//             viewer's own pending draw / lobster reveal, and — mid-crab —
//             the one pile the viewer chose to dig through.
//   recalled  each pile's buried cards from memory, in landing order,
//             flagged uncertain after an opponent's unseen crab dig; and this
//             round's history of who discarded, took or passed over what.
//   inferred  opponent cards the viewer saw them take off a pile top or
//             steal from the viewer.
//   hidden    everything else: deck order and contents, the rest of every
//             opponent's hand, their pending draw / lobster reveal, the RNG,
//             private log fields.
//
// Players are listed by seat offset from the viewer (0 = viewer, 1 = the seat
// that plays next), so one policy can play any seat.

import type { GamePhase, PlayerId } from '@/core/types';
import type { SspCard, SspCardFamily, SspEventId, SspState, SspSubPhase } from '../types';
import { FAMILY_ORDER } from '../cards';
import { canEndRound, scoringOptsFor, stopThresholdFor } from '../reducer';
import { eventAppliesTo } from '../events';
import { knowledgeOf, roundLog, type PileMemory } from '../knowledge';

export const FAMILY_COUNT = FAMILY_ORDER.length;
export const FAMILY_INDEX: Record<SspCardFamily, number> = Object.fromEntries(
  FAMILY_ORDER.map((f, i) => [f, i]),
) as Record<SspCardFamily, number>;

/** Per-player rule modifiers from Extra Pepper events (public: events are face-up). */
export interface SspPlayerRules {
  shellPerCard: boolean;
  octopusPerCard: boolean;
  mermaidsScoreZero: boolean;
  stopThreshold: number;
}

export interface SspObservedPlayer {
  id: PlayerId;
  handSize: number;
  table: SspCard[];
  trios: Array<[number, number, number]>;
  heldEvents: SspEventId[];
  matchScore: number;
  /** Cards known to be in this player's hand, sorted by id. For the viewer
   *  (offset 0) it is what every opponent knows about the viewer's hand. */
  knownCards: SspCard[];
  rules: SspPlayerRules;
  /** Jellyfish lock: this player's next (or current) turn is draw-and-pass only. */
  locked: boolean;
  /** This round, in play order: cards the player took off a visible pile top. */
  pulls: SspCard[];
  /** This round, in play order: cards the player drew from the deck and discarded face-up. */
  discards: SspCard[];
  /** This round: distinct pile tops the player passed over to draw from the deck. */
  passedTops: SspCard[];
  /** The player's unseen crab digs the viewer can't account for yet (0 for the viewer). */
  hiddenDigs: number;
  /** After a LAST CHANCE call: this player's final turn is still to come. */
  finalTurnPending: boolean;
}

export type SspPileView = PileMemory;

export interface SspObservation {
  viewerId: PlayerId;
  targetScore: number;
  extraSalt: boolean;
  extraPepper: boolean;
  round: number;
  phase: GamePhase;
  subPhase: SspSubPhase;
  /** Seat offsets (see header) — null when nobody holds the role. */
  activeOffset: number | null;
  roundStarterOffset: number | null;
  lastChanceOffset: number | null;
  /** The score the LAST CHANCE caller announced (the log shows it to everyone). */
  lastChanceScore: number | null;
  deckSize: number;
  /** Each discard pile as the viewer knows it. */
  piles: [SspPileView, SspPileView];
  /** Mid-crab: the pile the viewer chose to dig through (shown exactly in
   *  `piles`), or null while the pile is still to be chosen. */
  crabLookPile: 0 | 1 | null;
  hand: SspCard[];
  /** The viewer's own two-card draw; empty unless the viewer is choosing. */
  pendingDraw: SspCard[];
  /** The viewer's own lobster reveal; empty unless the viewer is choosing. */
  lobsterReveal: SspCard[];
  players: SspObservedPlayer[];
  currentEvent: SspEventId | null;
  /** End-of-turn options for the viewer (false unless it's their call). */
  canStop: boolean;
  canLastChance: boolean;
}

export interface ObserveOptions {
  /** Second step of a crab pick: the pile the viewer chose to look through.
   *  Ignored unless the viewer is the active player in awaitingCrabPick. */
  crabLookPile?: 0 | 1 | null;
}

export function observe(state: SspState, viewerId: PlayerId, opts: ObserveOptions = {}): SspObservation {
  const n = state.players.length;
  const viewerIdx = state.players.findIndex((p) => p.id === viewerId);
  if (viewerIdx === -1) throw new Error(`observe: ${viewerId} is not seated`);
  const offsetOf = (id: PlayerId | null | undefined): number | null => {
    if (id == null) return null;
    const i = state.players.findIndex((p) => p.id === id);
    return i === -1 ? null : (i - viewerIdx + n) % n;
  };

  const viewer = state.players[viewerIdx];
  const viewerActive = state.activePlayerId === viewerId;
  const crabLookPile = viewerActive && state.subPhase === 'awaitingCrabPick' ? opts.crabLookPile ?? null : null;
  const mine = knowledgeOf(state, viewerId, { lookingAt: crabLookPile });

  // What the opponents know about the viewer's hand: the cards ALL of them know.
  let exposed: SspCard[] | null = null;
  for (let o = 1; o < n; o++) {
    const theirs = knowledgeOf(state, state.players[(viewerIdx + o) % n].id).knownHands[viewerIdx];
    exposed = exposed ? exposed.filter((c) => theirs.some((t) => t.id === c.id)) : theirs;
  }

  const players: SspObservedPlayer[] = [];
  for (let off = 0; off < n; off++) {
    const idx = (viewerIdx + off) % n;
    const p = state.players[idx];
    const opts = scoringOptsFor(state, p);
    players.push({
      id: p.id,
      handSize: p.hand.length,
      table: p.table.map(copyCard),
      trios: (p.trios ?? []).map((t) => [t[0], t[1], t[2]]),
      heldEvents: (p.heldEvents ?? []).slice(),
      matchScore: p.matchScore,
      knownCards: off === 0 ? exposed ?? [] : mine.knownHands[idx],
      rules: {
        shellPerCard: opts.shellPerCard,
        octopusPerCard: opts.octopusPerCard,
        mermaidsScoreZero: opts.mermaidsScoreZero,
        stopThreshold: stopThresholdFor(state, p),
      },
      locked: state.nextTurnLockedPlayerId === p.id,
      pulls: mine.publicPulls[idx],
      discards: mine.discards[idx],
      passedTops: mine.passedTops[idx],
      hiddenDigs: mine.hiddenDigs[idx],
      finalTurnPending: state.lastChanceFrom !== null && state.lastChanceRemaining.includes(p.id),
    });
  }

  const canEnd = viewerActive && canEndRound(state);
  return {
    viewerId,
    targetScore: state.config.targetScore,
    extraSalt: !!state.config.expansions?.extraSalt,
    extraPepper: !!state.config.expansions?.extraPepper,
    round: state.round,
    phase: state.phase,
    subPhase: state.subPhase,
    activeOffset: offsetOf(state.activePlayerId),
    roundStarterOffset: offsetOf(state.currentRoundStarterId),
    lastChanceOffset: offsetOf(state.lastChanceFrom),
    lastChanceScore: lastChanceScore(state),
    deckSize: state.deck.length,
    piles: mine.piles,
    crabLookPile,
    hand: viewer.hand.map(copyCard),
    pendingDraw: viewerActive && state.subPhase === 'awaitingKeep'
      ? state.pendingDraw.map(copyCard) : [],
    lobsterReveal: viewerActive && state.subPhase === 'awaitingLobsterPick'
      ? (state.pendingLobsterPick ?? []).map(copyCard) : [],
    players,
    currentEvent: state.event?.current ?? null,
    canStop: canEnd && !eventAppliesTo(state, viewer, 'diodonFish'),
    canLastChance: canEnd,
  };
}

function lastChanceScore(state: SspState): number | null {
  if (state.lastChanceFrom === null) return null;
  for (const e of roundLog(state)) if (e.kind === 'lastChance') return e.score;
  return null;
}

/** Every card in a pile view, top included (exact when the pile is being looked at). */
export function pileCards(pile: SspPileView): SspCard[] {
  return pile.top ? [...pile.buried, pile.top] : pile.buried.slice();
}

function copyCard(c: SspCard): SspCard {
  return { id: c.id, family: c.family, color: c.color };
}
