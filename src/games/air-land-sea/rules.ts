// Air, Land & Sea — read-only board rules: strength, control, ongoing
// abilities, deploy permissions, withdraw VP. Shared by the reducer, the AI and
// the UI.
//
// Strength (Revised Edition + SLS):
//   - a face-up card counts its printed strength, a face-down card 2;
//   - Escalation: the owner's face-down cards count 4;
//   - Cover Fire: every card covered by it counts 4 (stronger cards drop to 4);
//   - Support: +3 to its owner in each adjacent theater;
//   - Spy Network: +3 in its theater per face-down card its owner has in the
//     adjacent theaters;
//   - each supply token on a side is +1.
// Ongoing abilities work while face up, covered or not. In Epic Mode they reach
// only their own theater and the adjacent ones (official Epic update).

import type {
  AlsAbilityKind, AlsPlacedCard, AlsState, AlsTheaterId,
} from './types';
import { cardById, FULL_BATTLE_VP, WITHDRAW_CHARTS } from './cards';

export function otherSeat(s: 0 | 1): 0 | 1 { return s === 0 ? 1 : 0; }

export function isEpic(state: Pick<AlsState, 'theaters'>): boolean {
  return state.theaters.length === 5;
}

/** Indices of the theaters next to `t` in a row of `count`. */
export function adjacentTheaters(count: number, t: number): number[] {
  const out: number[] = [];
  if (t - 1 >= 0) out.push(t - 1);
  if (t + 1 < count) out.push(t + 1);
  return out;
}

export function isAdjacent(a: number, b: number): boolean {
  return Math.abs(a - b) === 1;
}

/** Can an ongoing ability in theater `src` affect theater `t`? Always outside
 *  Epic Mode; in Epic only its own theater and the adjacent ones. */
export function inRange(state: Pick<AlsState, 'theaters'>, src: number, t: number): boolean {
  return !isEpic(state) || Math.abs(src - t) <= 1;
}

export function theaterIndexOf(state: Pick<AlsState, 'theaters'>, theater: AlsTheaterId): number {
  return state.theaters.indexOf(theater);
}

// ---------- Locating cards ----------

export interface CardLocation {
  theaterIdx: number;
  side: 0 | 1;
  slotIdx: number;
  placed: AlsPlacedCard;
  uncovered: boolean;
}

export function locate(state: AlsState, cardId: number): CardLocation | null {
  for (let t = 0; t < state.board.length; t++) {
    for (const side of [0, 1] as const) {
      const stack = state.board[t][side];
      const slotIdx = stack.findIndex((p) => p.cardId === cardId);
      if (slotIdx !== -1) {
        return { theaterIdx: t, side, slotIdx, placed: stack[slotIdx], uncovered: slotIdx === stack.length - 1 };
      }
    }
  }
  return null;
}

/** Every card on the board, as locations. */
export function boardCards(state: AlsState): CardLocation[] {
  const out: CardLocation[] = [];
  state.board.forEach((stacks, t) => {
    for (const side of [0, 1] as const) {
      stacks[side].forEach((placed, slotIdx) => {
        out.push({ theaterIdx: t, side, slotIdx, placed, uncovered: slotIdx === stacks[side].length - 1 });
      });
    }
  });
  return out;
}

/** Uncovered card ids, optionally filtered. */
export function uncoveredCards(
  state: AlsState,
  filter: { sides?: Array<0 | 1>; theaters?: number[]; faceUp?: boolean; faceDown?: boolean } = {},
): number[] {
  const out: number[] = [];
  state.board.forEach((stacks, t) => {
    if (filter.theaters && !filter.theaters.includes(t)) return;
    for (const side of [0, 1] as const) {
      if (filter.sides && !filter.sides.includes(side)) continue;
      const top = stacks[side][stacks[side].length - 1];
      if (!top) continue;
      if (filter.faceUp && top.faceDown) continue;
      if (filter.faceDown && !top.faceDown) continue;
      out.push(top.cardId);
    }
  });
  return out;
}

/** Face-up cards with ongoing `ability`, optionally only `side`'s. */
export function ongoingSources(state: AlsState, ability: AlsAbilityKind, side?: 0 | 1): CardLocation[] {
  return boardCards(state).filter((loc) => {
    if (loc.placed.faceDown) return false;
    if (side !== undefined && loc.side !== side) return false;
    const c = cardById(loc.placed.cardId);
    return c.trigger === 'ongoing' && c.ability === ability;
  });
}

// ---------- Strength ----------

/** What one card counts for where it sits (no theater-wide bonuses). */
export function effectiveCardStrength(state: AlsState, theaterIdx: number, side: 0 | 1, slotIdx: number): number {
  const stack = state.board[theaterIdx][side];
  const placed = stack[slotIdx];
  if (!placed) return 0;
  for (let above = slotIdx + 1; above < stack.length; above++) {
    const a = stack[above];
    if (!a.faceDown && cardById(a.cardId).ability === 'coverFire') return 4;
  }
  if (placed.faceDown) {
    const escalated = ongoingSources(state, 'escalation', side).some((src) => inRange(state, src.theaterIdx, theaterIdx));
    return escalated ? 4 : 2;
  }
  return cardById(placed.cardId).strength;
}

export function cardStrengthById(state: AlsState, cardId: number): number {
  const loc = locate(state, cardId);
  return loc ? effectiveCardStrength(state, loc.theaterIdx, loc.side, loc.slotIdx) : 0;
}

export interface StrengthParts {
  cards: number;
  support: number;
  spyNetwork: number;
  supplies: number;
  total: number;
}

export function theaterStrengthParts(state: AlsState, t: number, side: 0 | 1): StrengthParts {
  let cards = 0;
  const stack = state.board[t][side];
  for (let i = 0; i < stack.length; i++) cards += effectiveCardStrength(state, t, side, i);
  let support = 0;
  for (const src of ongoingSources(state, 'support', side)) {
    if (isAdjacent(src.theaterIdx, t)) support += 3;
  }
  let spyNetwork = 0;
  for (const src of ongoingSources(state, 'spyNetwork', side)) {
    if (src.theaterIdx !== t) continue;
    for (const a of adjacentTheaters(state.theaters.length, t)) {
      spyNetwork += 3 * state.board[a][side].filter((p) => p.faceDown).length;
    }
  }
  const supplies = state.supplies[t]?.[side] ?? 0;
  return { cards, support, spyNetwork, supplies, total: cards + support + spyNetwork + supplies };
}

export function theaterStrength(state: AlsState, t: number, side: 0 | 1): number {
  return theaterStrengthParts(state, t, side).total;
}

/** Who controls each theater: higher strength, the 1st player on a tie (and on an empty theater). */
export function theaterControl(state: AlsState): Array<0 | 1> {
  return state.board.map((_, t) => {
    const s0 = theaterStrength(state, t, 0);
    const s1 = theaterStrength(state, t, 1);
    if (s0 > s1) return 0;
    if (s1 > s0) return 1;
    return state.firstPlayerSeatIdx;
  });
}

/** The full-play winner: whoever controls more theaters. */
export function battleWinner(state: AlsState): 0 | 1 {
  const control = theaterControl(state);
  const zero = control.filter((s) => s === 0).length;
  return zero * 2 > control.length ? 0 : 1;
}

/** The value "lower / higher" compares (Leverage, Surveil): printed strength in
 *  hand or face up, 2 for a face-down card. */
export function shownValue(cardId: number, faceDown: boolean): number {
  return faceDown ? 2 : cardById(cardId).strength;
}

// ---------- Withdraw ----------

export function withdrawChart(state: AlsState, seat: 0 | 1) {
  return WITHDRAW_CHARTS[isEpic(state) ? 'epic' : 'standard'][seat === state.firstPlayerSeatIdx ? 'first' : 'second'];
}

/** VP the opponent scores if `seat` withdraws with `cardsLeft` cards in hand. */
export function vpForWithdraw(state: AlsState, seat: 0 | 1, cardsLeft = state.players[seat].hand.length): number {
  if (state.config.beginner) return 1;
  for (const row of withdrawChart(state, seat)) {
    if (cardsLeft >= row.minCards) return row.vp;
  }
  return FULL_BATTLE_VP;
}

export function fullBattleVp(state: AlsState): number {
  return state.config.beginner ? 1 : FULL_BATTLE_VP;
}

// ---------- Playing cards ----------

export type DeployVia = 'match' | 'airDrop' | 'aerodrome' | 'supplyLines';

/** Can `seat` play `cardId` face up to theater `t`, and on what authority?
 *  Free permissions come before Supply Lines, which costs a supply. */
export function deployVia(state: AlsState, seat: 0 | 1, cardId: number, t: number): DeployVia | null {
  const card = cardById(cardId);
  if (state.theaters[t] === card.theater) return 'match';
  if (state.players[seat].airDrop) return 'airDrop';
  if (card.strength <= 3 && ongoingSources(state, 'aerodrome', seat).some((src) => inRange(state, src.theaterIdx, t))) {
    return 'aerodrome';
  }
  if (state.turnSeatIdx === seat && ongoingSources(state, 'supplyLines', seat).some((src) => inRange(state, src.theaterIdx, t))) {
    return 'supplyLines';
  }
  return null;
}

/** Where `seat` may play `cardId` from hand, face up and face down (Neutralize
 *  forces its named cards face down and nothing else may be played). */
export function playOptions(state: AlsState, seat: 0 | 1, cardId: number): { faceUp: number[]; faceDown: number[] } {
  const all = state.theaters.map((_, t) => t);
  const neutralized = state.players[seat].neutralized;
  if (neutralized.length > 0) {
    return neutralized.includes(cardId) ? { faceUp: [], faceDown: all } : { faceUp: [], faceDown: [] };
  }
  return { faceUp: all.filter((t) => deployVia(state, seat, cardId, t) !== null), faceDown: all };
}

/** Theater occupancy, both players' cards. */
export function occupancy(state: AlsState, t: number): number {
  return state.board[t][0].length + state.board[t][1].length;
}
