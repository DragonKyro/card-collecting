// Air, Land & Sea — strength calculation, theater control, battle scoring.
//
// Effective strength rules (per rulebook + BGG FAQ):
//   - Face-up card: its printed strength.
//   - Face-down card: 2 by default. Escalation (owner's, face-up on the board)
//     promotes ALL of that owner's face-down cards to 4.
//   - Cover Fire (face-up + uncovered): each card BENEATH it has strength 4
//     (overrides printed/face-down strength).
//   - Air Support (face-up + uncovered on Air theater): adds +3 strength to
//     each adjacent theater on the SAME side. (Cards in those adjacent
//     theaters keep their printed strength; the +3 is a theater-level bonus.)
//   - Supply Tokens (SLS): each token adds +1 strength to its theater for the
//     owning side.
//   - Ongoing abilities continue to work even when the card is COVERED — per
//     the published Air, Land & Sea FAQ. (Only being FLIPPED face-down disables
//     them.)
//
// Battle winner: controls more than half of the theaters in play (2 of 3, 3 of 5).
//   - Controlling a theater = strictly higher total strength on your side.
//   - Tie or both sides empty = 1st player controls.

import type { AlsCardTemplate, AlsPlacedCard, AlsState } from './types';

/** VP awarded based on how many cards the WITHDRAWING player has left in hand.
 *  Per Supreme Commander withdraw chart:
 *    6 cards in hand → 2 VP
 *    4-5            → 3 VP
 *    2-3            → 4 VP
 *    0-1            → 6 VP (same as a full-hand defeat) */
export const WITHDRAW_VP_CHART: ReadonlyArray<{ minCardsLeft: number; vp: number }> = [
  { minCardsLeft: 6, vp: 2 },
  { minCardsLeft: 4, vp: 3 },
  { minCardsLeft: 2, vp: 4 },
  { minCardsLeft: 0, vp: 6 },
];

export const FULL_BATTLE_VP = 6;
/** Hand-size used in the withdraw chart. For Epic (5 theaters, 9 cards), the
 *  rulebook reuses the same VP brackets — withdraw with 6+ left = 2 VP, etc.
 *  We just key off `cardsLeftInHand` directly. */

export function vpForWithdraw(cardsLeftInWithdrawerHand: number): number {
  for (const { minCardsLeft, vp } of WITHDRAW_VP_CHART) {
    if (cardsLeftInWithdrawerHand >= minCardsLeft) return vp;
  }
  return FULL_BATTLE_VP;
}

// ---------- Strength calc ----------

/** Return the effective printed/face-down strength for a single card at position
 *  (theaterIdx, sideIdx, slotIdx). Does NOT include theater-level bonuses
 *  (Air Support, Supply Tokens). */
export function effectiveCardStrength(
  state: AlsState,
  theaterIdx: number,
  sideIdx: 0 | 1,
  slotIdx: number,
): number {
  const stack = state.playedCards[theaterIdx][sideIdx];
  const placed = stack[slotIdx];
  if (!placed) return 0;
  const tpl = state.deckPool[placed.cardId];
  if (!tpl) return 0;

  const isTopOfStack = slotIdx === stack.length - 1;

  // Cover Fire: if any FACE-UP cover-fire card exists above this card on the
  // same side, this card's strength becomes 4. (Cover Fire still works when
  // covered itself.)
  for (let above = slotIdx + 1; above < stack.length; above++) {
    const aboveCard = stack[above];
    if (aboveCard.faceDown) continue;
    const aboveTpl = state.deckPool[aboveCard.cardId];
    if (!aboveTpl) continue;
    if (aboveTpl.ability === 'coverFire' || aboveTpl.ability === 'coverFireSea') {
      return 4;
    }
  }

  if (placed.faceDown) {
    // Escalation: this owner has a face-up Escalation in play somewhere → 4.
    if (ownerHasOngoing(state, sideIdx, 'escalation')) return 4;
    return 2;
  }

  // Face-up card: just the printed strength.
  void isTopOfStack;
  return tpl.strength;
}

/** Theater bonus from Air Support cards on adjacent theaters (same side). */
function airSupportBonusFor(state: AlsState, theaterIdx: number, sideIdx: 0 | 1): number {
  let bonus = 0;
  const neighborIndices = [theaterIdx - 1, theaterIdx + 1].filter(
    (i) => i >= 0 && i < state.config.theaters.length,
  );
  for (const nIdx of neighborIndices) {
    const stack = state.playedCards[nIdx][sideIdx];
    for (let i = 0; i < stack.length; i++) {
      const placed = stack[i];
      if (placed.faceDown) continue;
      const tpl = state.deckPool[placed.cardId];
      if (!tpl) continue;
      if (tpl.ability === 'support') {
        // Per rule: Support gives +3 to each adjacent theater on its side.
        bonus += 3;
      }
    }
  }
  return bonus;
}

/** Total effective strength one side has in a given theater (cards + supply
 *  tokens + air-support bonus from neighbors). */
export function theaterStrength(
  state: AlsState,
  theaterIdx: number,
  sideIdx: 0 | 1,
): number {
  let total = 0;
  const stack = state.playedCards[theaterIdx][sideIdx];
  for (let i = 0; i < stack.length; i++) {
    total += effectiveCardStrength(state, theaterIdx, sideIdx, i);
  }
  total += airSupportBonusFor(state, theaterIdx, sideIdx);
  total += (state.supplyTokens[theaterIdx]?.[sideIdx] ?? 0);
  return total;
}

// ---------- Ongoing ability lookups ----------

/** True if any face-up card on `sideIdx`'s side of any theater has ongoing
 *  ability `ability`. Per BGG FAQ, covered cards still emit ongoing effects;
 *  only being face-DOWN suppresses them. */
export function ownerHasOngoing(
  state: AlsState,
  sideIdx: 0 | 1,
  ability: AlsCardTemplate['ability'],
): boolean {
  for (let t = 0; t < state.config.theaters.length; t++) {
    const stack = state.playedCards[t][sideIdx];
    for (const placed of stack) {
      if (placed.faceDown) continue;
      const tpl = state.deckPool[placed.cardId];
      if (!tpl) continue;
      if (tpl.ability === ability) return true;
    }
  }
  return false;
}

/** True if there's an active Containment effect from EITHER side. Containment
 *  is symmetric in the original rules — any face-down play, by either player,
 *  is immediately discarded. */
export function containmentActive(state: AlsState): boolean {
  return ownerHasOngoing(state, 0, 'containment') || ownerHasOngoing(state, 1, 'containment');
}

// ---------- Theater control + battle resolution ----------

/** Returns the side (0 | 1) that controls each theater (null if both sides
 *  empty AND no Supply Tokens — first player wins by tiebreak then). */
export function computeTheaterControl(state: AlsState): Array<0 | 1> {
  const firstSide = state.firstPlayerSeatIdx;
  const otherSide: 0 | 1 = firstSide === 0 ? 1 : 0;
  const out: Array<0 | 1> = [];
  for (let t = 0; t < state.config.theaters.length; t++) {
    const s0 = theaterStrength(state, t, 0);
    const s1 = theaterStrength(state, t, 1);
    if (s0 > s1) out.push(0);
    else if (s1 > s0) out.push(1);
    else out.push(firstSide);   // ties + double-empty go to 1st player
    void otherSide;
  }
  return out;
}

/** Resolve a fully played battle. Returns winner seat and control array. */
export interface BattleResolution {
  winnerSeatIdx: 0 | 1;
  control: Array<0 | 1>;
  strengths: Array<[number, number]>;
}
export function resolveFullBattle(state: AlsState): BattleResolution {
  const control = computeTheaterControl(state);
  const counts = [0, 0];
  for (const seat of control) counts[seat]++;
  const winner: 0 | 1 = counts[0] > counts[1] ? 0 : 1;
  const strengths = state.playedCards.map((_, t) =>
    [theaterStrength(state, t, 0), theaterStrength(state, t, 1)] as [number, number],
  );
  return { winnerSeatIdx: winner, control, strengths };
}

// ---------- Helpers ----------

/** Indices of theaters adjacent to `t` in a 3- or 5-column row. */
export function adjacentTheaters(theaterCount: number, t: number): number[] {
  const out: number[] = [];
  if (t - 1 >= 0) out.push(t - 1);
  if (t + 1 < theaterCount) out.push(t + 1);
  return out;
}

/** Find a placed card on a side by id. Returns its position or null. */
export function findCardOnBoard(
  state: AlsState,
  cardId: number,
): { theaterIdx: number; sideIdx: 0 | 1; slotIdx: number; placed: AlsPlacedCard } | null {
  for (let t = 0; t < state.playedCards.length; t++) {
    for (const side of [0, 1] as const) {
      const stack = state.playedCards[t][side];
      const slotIdx = stack.findIndex((p) => p.cardId === cardId);
      if (slotIdx !== -1) {
        return { theaterIdx: t, sideIdx: side, slotIdx, placed: stack[slotIdx] };
      }
    }
  }
  return null;
}
