// Air, Land & Sea — playing cards and resolving Tactical Abilities.
//
// Instant abilities go on `state.queue` when their card is played face up or
// flipped face up, and resolve one at a time in that order (Revised Edition:
// "resolve the instant abilities in the order they happened and fully resolve
// each ability before moving on to the next"). The resolving one is
// `state.frame`; each ability below is a small step machine that either asks a
// player (`state.pending`) or finishes. A queued ability whose card was flipped
// face down, destroyed or returned before it began never starts; one that has
// begun always finishes, whatever happens to its card.
//
// Ongoing abilities are never queued — `rules.ts` reads them off the board —
// except Envoy, whose "after you play a card in an adjacent theater, you may
// move this card" is queued behind the played card's own instant.
//
// `performPlay` is the one way a card enters a theater from a hand (main
// action, Redeploy, Reinforce): it checks the deploy restrictions, applies
// Containment / Blockade ("destroy" = face down to the bottom of the deck; the
// card never uses its ability) and queues what the play sets off.

import type {
  AlsAbilityKind, AlsAnswer, AlsFrame, AlsLogBody, AlsLogEntry, AlsPending, AlsState,
} from './types';
import { cardById, cardIdsForTheaters } from './cards';
import {
  adjacentTheaters, cardStrengthById, deployVia, inRange, isAdjacent, locate, occupancy,
  ongoingSources, otherSeat, playOptions, shownValue, theaterIndexOf, uncoveredCards,
} from './rules';

export function pushLog(state: AlsState, body: AlsLogBody): number {
  state.logSeq += 1;
  state.log.push({ seq: state.logSeq, battle: state.battleNumber, ...body } as AlsLogEntry);
  return state.logSeq;
}

// ---------- Primitive effects ----------

function removeFromHand(state: AlsState, seat: 0 | 1, cardId: number): void {
  const p = state.players[seat];
  const i = p.hand.indexOf(cardId);
  if (i === -1) throw new Error('card not in hand');
  p.hand.splice(i, 1);
  p.known = p.known.filter((c) => c !== cardId);
  p.neutralized = p.neutralized.filter((c) => c !== cardId);
}

/** Flip a card on the board; a card turned face up queues its instant ability for its owner. */
export function flipCard(state: AlsState, cardId: number, bySeat: 0 | 1): void {
  const loc = locate(state, cardId);
  if (!loc) throw new Error('flip: card not on the board');
  loc.placed.faceDown = !loc.placed.faceDown;
  pushLog(state, { kind: 'flip', seat: bySeat, cardId, ownerSeat: loc.side, theaterIdx: loc.theaterIdx, now: loc.placed.faceDown ? 'down' : 'up' });
  if (!loc.placed.faceDown) {
    const c = cardById(cardId);
    if (c.trigger === 'instant' && c.ability) state.queue.push({ ability: c.ability, owner: loc.side, sourceCardId: cardId });
  }
}

/** Destroy: the card goes face down to the bottom of the deck. */
export function destroyCard(state: AlsState, cardId: number, bySeat: 0 | 1 | null, reason: 'containment' | 'blockade' | 'relinquish'): void {
  const loc = locate(state, cardId);
  if (!loc) throw new Error('destroy: card not on the board');
  state.board[loc.theaterIdx][loc.side].splice(loc.slotIdx, 1);
  state.deck.unshift(cardId);
  pushLog(state, { kind: 'destroy', seat: bySeat, cardId, ownerSeat: loc.side, theaterIdx: loc.theaterIdx, faceDown: loc.placed.faceDown, reason });
}

/** Move one of `seat`'s cards on top of its stack in another theater (same side, same facing). */
export function moveCard(state: AlsState, seat: 0 | 1, cardId: number, to: number, ability: 'transport' | 'envoy'): void {
  const loc = locate(state, cardId);
  if (!loc || loc.side !== seat) throw new Error('move: not your card');
  if (loc.theaterIdx === to) throw new Error('move: must go to a different theater');
  state.board[loc.theaterIdx][seat].splice(loc.slotIdx, 1);
  state.board[to][seat].push(loc.placed);
  pushLog(state, { kind: 'move', seat, cardId, faceDown: loc.placed.faceDown, from: loc.theaterIdx, to, ability });
}

export function addSupplies(state: AlsState, seat: 0 | 1, t: number, amount: number, ability: AlsAbilityKind): void {
  state.supplies[t][seat] += amount;
  pushLog(state, { kind: 'supply', seat, theaterIdx: t, amount, ability });
}

/** Reveal a card from `seat`'s hand: the enemy sees it; it stays in hand. */
export function revealCard(state: AlsState, seat: 0 | 1, cardId: number, ability: AlsAbilityKind): void {
  const p = state.players[seat];
  if (!p.hand.includes(cardId)) throw new Error('reveal: card not in hand');
  if (!p.known.includes(cardId)) p.known.push(cardId);
  pushLog(state, { kind: 'reveal', seat, cardId, ability });
}

/** Draw the top card of the deck into `seat`'s hand. Null when the deck is empty. */
function drawCard(state: AlsState, seat: 0 | 1, ability: AlsAbilityKind): number | null {
  const id = state.deck.pop();
  if (id === undefined) return null;
  state.players[seat].hand.push(id);
  pushLog(state, { kind: 'draw', seat, cardId: id, ability, private: seat });
  return id;
}

/** Play a card from `seat`'s hand to theater `t`. `forcedBy` marks a play an
 *  ability dictates (Reinforce: this card, face down, a theater it chose) —
 *  the deploy restrictions and Neutralize don't apply to it. */
export function performPlay(
  state: AlsState,
  seat: 0 | 1,
  cardId: number,
  t: number,
  faceDown: boolean,
  forcedBy?: AlsAbilityKind,
): void {
  const player = state.players[seat];
  if (!player.hand.includes(cardId)) throw new Error('play: card not in hand');
  if (!Number.isInteger(t) || t < 0 || t >= state.theaters.length) throw new Error('play: theater out of range');
  let via: ReturnType<typeof deployVia> = null;
  if (!forcedBy) {
    const options = playOptions(state, seat, cardId);
    if (!(faceDown ? options.faceDown : options.faceUp).includes(t)) {
      throw new Error(faceDown ? 'play: that card must be played elsewhere' : "play: that card can't be deployed there");
    }
    if (!faceDown) via = deployVia(state, seat, cardId, t);
  }
  removeFromHand(state, seat, cardId);
  // Air Drop covers "the next time you play a card", used or not.
  player.airDrop = false;
  const occupiedBefore = occupancy(state, t);
  state.board[t][seat].push({ cardId, faceDown });
  if (forcedBy) {
    pushLog(state, { kind: 'forcedPlay', seat, cardId, theaterIdx: t, ability: forcedBy, private: seat });
  } else if (faceDown) {
    pushLog(state, { kind: 'improvise', seat, cardId, theaterIdx: t, private: seat });
  } else {
    pushLog(state, { kind: 'deploy', seat, cardId, theaterIdx: t, ...(via && via !== 'match' ? { via } : {}) });
  }
  if (via === 'supplyLines') addSupplies(state, otherSeat(seat), t, 1, 'supplyLines');

  const contained = faceDown && ongoingSources(state, 'containment').some((src) => inRange(state, src.theaterIdx, t));
  const blockaded = occupiedBefore >= 3 && ongoingSources(state, 'blockade').some((src) => isAdjacent(src.theaterIdx, t));
  if (contained || blockaded) {
    destroyCard(state, cardId, null, contained ? 'containment' : 'blockade');
    return;
  }
  const card = cardById(cardId);
  if (!faceDown && card.trigger === 'instant' && card.ability) {
    state.queue.push({ ability: card.ability, owner: seat, sourceCardId: cardId });
  }
  for (const envoy of ongoingSources(state, 'envoy', seat)) {
    if (envoy.placed.cardId !== cardId && isAdjacent(envoy.theaterIdx, t)) {
      state.queue.push({ ability: 'envoy', owner: seat, sourceCardId: envoy.placed.cardId, coverCardId: cardId });
    }
  }
}

// ---------- The queue ----------

/** Begin the next queued ability that can still be used. False once the queue is empty. */
export function startNextFrame(state: AlsState): boolean {
  while (state.queue.length > 0) {
    const q = state.queue.shift()!;
    const loc = locate(state, q.sourceCardId);
    if (!loc || loc.placed.faceDown || loc.side !== q.owner) continue;
    if (q.ability === 'envoy') {
      const cover = locate(state, q.coverCardId!);
      if (!cover || cover.side !== q.owner || cover.theaterIdx === loc.theaterIdx || !isAdjacent(cover.theaterIdx, loc.theaterIdx)) continue;
    }
    const frame: AlsFrame = {
      ability: q.ability, owner: q.owner, sourceCardId: q.sourceCardId, theaterIdx: loc.theaterIdx, step: 0,
      ...(q.coverCardId !== undefined ? { coverCardId: q.coverCardId } : {}),
    };
    if (q.ability !== 'envoy') {
      frame.logSeq = pushLog(state, { kind: 'ability', seat: q.owner, cardId: q.sourceCardId, ability: q.ability });
    }
    state.frame = frame;
    return true;
  }
  return false;
}

/** Work on the current frame until it asks someone or finishes. */
export function runFrame(state: AlsState): void {
  const f = state.frame;
  if (!f) return;
  IMPLS[f.ability](state, f);
}

/** Validate an answer to `state.pending` from `seat` and feed it to its ability. */
export function answerPending(state: AlsState, seat: 0 | 1, answer: AlsAnswer): void {
  const p = state.pending;
  const f = state.frame;
  if (!p || !f) throw new Error('answer: nothing is being asked');
  if (p.seat !== seat) throw new Error('answer: not your decision');
  validateAnswer(state, p, answer);
  state.pending = null;
  IMPLS[f.ability](state, f, answer);
}

function validateAnswer(state: AlsState, p: AlsPending, a: AlsAnswer): void {
  if (a.kind === 'skip') {
    if (!p.optional) throw new Error('answer: this choice is not optional');
    return;
  }
  const inCards = (id: number) => (p.cards ?? []).includes(id);
  switch (p.prompt) {
    case 'flip': case 'destroy': case 'destroyOwn': case 'redeployPick':
    case 'reveal': case 'incite': case 'retrofit':
      if (a.kind !== 'card' || !inCards(a.cardId)) throw new Error('answer: pick one of the offered cards');
      return;
    case 'transport': {
      if (a.kind !== 'move' || !inCards(a.cardId)) throw new Error('answer: pick one of your cards to move');
      const loc = locate(state, a.cardId);
      if (!loc || a.theaterIdx === loc.theaterIdx || a.theaterIdx < 0 || a.theaterIdx >= state.theaters.length) {
        throw new Error('answer: move it to a different theater');
      }
      return;
    }
    case 'redeployPlay': {
      if (a.kind !== 'play' || !inCards(a.cardId)) throw new Error('answer: play a card from your hand');
      const options = playOptions(state, p.seat, a.cardId);
      if (!(a.faceDown ? options.faceDown : options.faceUp).includes(a.theaterIdx)) throw new Error("answer: that card can't be played there");
      return;
    }
    case 'reinforce': case 'supply':
      if (a.kind !== 'theater' || !(p.theaters ?? []).includes(a.theaterIdx)) throw new Error('answer: pick one of the offered theaters');
      return;
    case 'name':
      if (a.kind !== 'name' || !inCards(a.cardId)) throw new Error('answer: name a card in this battle');
      return;
    case 'giveOrKeep':
      if (a.kind !== 'option' || (a.option !== 'give' && a.option !== 'keep')) throw new Error('answer: give or keep');
      return;
    case 'envoy':
      if (a.kind !== 'option' || (a.option !== 'move' && a.option !== 'stay')) throw new Error('answer: move or stay');
      return;
  }
}

function ask(state: AlsState, f: AlsFrame, p: Omit<AlsPending, 'ability' | 'sourceCardId'>): void {
  state.pending = { ...p, ability: f.ability, sourceCardId: f.sourceCardId };
  state.activePlayerId = state.players[p.seat].id;
  state.subPhase = 'resolving';
}

function finish(state: AlsState, noEffect = false): void {
  const f = state.frame;
  if (f && noEffect && f.logSeq !== undefined) {
    const entry = state.log.find((e) => e.seq === f.logSeq);
    if (entry && entry.kind === 'ability') entry.noEffect = true;
  }
  state.frame = null;
}

// ---------- The abilities ----------

type Impl = (state: AlsState, f: AlsFrame, a?: AlsAnswer) => void;

const all = (state: AlsState) => state.theaters.map((_, t) => t);
const ownCards = (state: AlsState, seat: 0 | 1, faceDownOnly = false) =>
  state.board.flatMap((stacks) => stacks[seat].filter((p) => !faceDownOnly || p.faceDown).map((p) => p.cardId));

/** Flip one uncovered card among `targets` (mandatory); then finish. */
function flipOne(state: AlsState, f: AlsFrame, targets: number[], a?: AlsAnswer): void {
  if (a) {
    if (a.kind === 'card') flipCard(state, a.cardId, f.owner);
    return finish(state);
  }
  if (targets.length === 0) return finish(state, true);
  ask(state, f, { seat: f.owner, prompt: 'flip', cards: targets, optional: false });
}

const maneuver: Impl = (state, f, a) =>
  flipOne(state, f, a ? [] : uncoveredCards(state, { theaters: adjacentTheaters(state.theaters.length, f.theaterIdx) }), a);

const IMPLS: Record<AlsAbilityKind, Impl> = {
  // ----- Air, Land & Sea -----
  airDrop(state, f) {
    state.players[f.owner].airDrop = true;
    finish(state);
  },
  maneuver,
  manipulate: maneuver,
  ambush: (state, f, a) => flipOne(state, f, a ? [] : uncoveredCards(state), a),

  reinforce(state, f, a) {
    if (a) {
      if (a.kind === 'theater') performPlay(state, f.owner, f.cardId!, a.theaterIdx, true, 'reinforce');
      return finish(state);
    }
    const drawn = drawCard(state, f.owner, 'reinforce');
    if (drawn === null) return finish(state, true);
    f.cardId = drawn;
    ask(state, f, { seat: f.owner, prompt: 'reinforce', theaters: adjacentTheaters(state.theaters.length, f.theaterIdx), drawnCardId: drawn, optional: false });
  },

  // Starting with you, each player flips one of their own uncovered cards.
  disrupt(state, f, a) {
    const fresh = !a && f.step === 0;
    if (a) {
      if (a.kind === 'card') flipCard(state, a.cardId, f.step === 0 ? f.owner : otherSeat(f.owner));
      f.step += 1;
    }
    while (f.step < 2) {
      const seat = f.step === 0 ? f.owner : otherSeat(f.owner);
      const targets = uncoveredCards(state, { sides: [seat] });
      if (targets.length > 0) return ask(state, f, { seat, prompt: 'flip', cards: targets, optional: false });
      f.step += 1;
    }
    finish(state, fresh);
  },

  transport(state, f, a) {
    if (a) {
      if (a.kind === 'move') moveCard(state, f.owner, a.cardId, a.theaterIdx, 'transport');
      return finish(state);
    }
    const mine = ownCards(state, f.owner);
    if (mine.length === 0 || state.theaters.length < 2) return finish(state, true);
    ask(state, f, { seat: f.owner, prompt: 'transport', cards: mine, optional: true });
  },

  redeploy(state, f, a) {
    const me = state.players[f.owner];
    if (f.step === 0) {
      if (a) {
        if (a.kind !== 'card') return finish(state);
        const loc = locate(state, a.cardId)!;
        state.board[loc.theaterIdx][f.owner].splice(loc.slotIdx, 1);
        me.hand.push(a.cardId);
        pushLog(state, { kind: 'toHand', seat: f.owner, cardId: a.cardId, from: loc.theaterIdx, private: f.owner });
        f.step = 1;
      } else {
        const faceDown = ownCards(state, f.owner, true);
        if (faceDown.length === 0) return finish(state, true);
        return ask(state, f, { seat: f.owner, prompt: 'redeployPick', cards: faceDown, optional: true });
      }
    }
    if (a && a.kind === 'play') {
      performPlay(state, f.owner, a.cardId, a.theaterIdx, a.faceDown);
      return finish(state);
    }
    // "If you do, play a card."
    const playable = me.hand.filter((c) => {
      const o = playOptions(state, f.owner, c);
      return o.faceUp.length + o.faceDown.length > 0;
    });
    if (playable.length === 0) return finish(state);
    ask(state, f, { seat: f.owner, prompt: 'redeployPlay', cards: playable, optional: false });
  },

  // Ongoing abilities never resolve as frames.
  support: (state) => finish(state),
  aerodrome: (state) => finish(state),
  containment: (state) => finish(state),
  coverFire: (state) => finish(state),
  escalation: (state) => finish(state),
  blockade: (state) => finish(state),
  spyNetwork: (state) => finish(state),
  supplyLines: (state) => finish(state),

  // ----- Spies, Lies & Supplies -----
  envoy(state, f, a) {
    if (a) {
      if (a.kind === 'option' && a.option === 'move') {
        const cover = locate(state, f.coverCardId!);
        if (cover) moveCard(state, f.owner, f.sourceCardId, cover.theaterIdx, 'envoy');
      }
      return finish(state);
    }
    ask(state, f, { seat: f.owner, prompt: 'envoy', cards: [f.coverCardId!], optional: false });
  },

  relinquish(state, f, a) {
    if (f.step === 0) {
      if (a) {
        if (a.kind !== 'card') return finish(state);
        destroyCard(state, a.cardId, f.owner, 'relinquish');
        f.step = 1;
      } else {
        const mine = ownCards(state, f.owner).filter((c) => c !== f.sourceCardId);
        if (mine.length === 0) return finish(state, true);
        return ask(state, f, { seat: f.owner, prompt: 'destroyOwn', cards: mine, optional: true });
      }
    } else if (a) {
      if (a.kind === 'card') destroyCard(state, a.cardId, f.owner, 'relinquish');
      return finish(state);
    }
    const targets = uncoveredCards(state);
    if (targets.length === 0) return finish(state);
    ask(state, f, { seat: f.owner, prompt: 'destroy', cards: targets, optional: false });
  },

  leverage(state, f, a) {
    const flippableAtOrBelow = (n: number) =>
      uncoveredCards(state).filter((c) => shownValue(c, locate(state, c)!.placed.faceDown) <= n);
    if (f.step === 0) {
      if (a) {
        if (a.kind !== 'card') return finish(state);
        revealCard(state, f.owner, a.cardId, 'leverage');
        f.cardId = a.cardId;
        f.step = 1;
      } else {
        const options = state.players[f.owner].hand.filter((c) => flippableAtOrBelow(cardById(c).strength).length > 0);
        if (options.length === 0) return finish(state, true);
        return ask(state, f, { seat: f.owner, prompt: 'reveal', cards: options, optional: true });
      }
    } else if (a) {
      if (a.kind === 'card') flipCard(state, a.cardId, f.owner);
      return finish(state);
    }
    flipOneStep(state, f, flippableAtOrBelow(cardById(f.cardId!).strength));
  },

  giveAndTake(state, f, a) {
    const enemy = otherSeat(f.owner);
    if (a) {
      if (a.kind === 'option' && a.option === 'give') {
        const drawn = f.cardId!;
        removeFromHand(state, f.owner, drawn);
        state.players[enemy].hand.push(drawn);
        state.players[enemy].known.push(drawn);
        pushLog(state, { kind: 'give', seat: f.owner, cardId: drawn });
        drawCard(state, f.owner, 'giveAndTake');
      } else {
        pushLog(state, { kind: 'keep', seat: f.owner });
        drawCard(state, enemy, 'giveAndTake');
      }
      return finish(state);
    }
    const drawn = drawCard(state, f.owner, 'giveAndTake');
    if (drawn === null) return finish(state, true);
    f.cardId = drawn;
    ask(state, f, { seat: f.owner, prompt: 'giveOrKeep', drawnCardId: drawn, cards: [drawn], optional: false });
  },

  incite(state, f, a) {
    if (a) {
      if (a.kind !== 'card') return finish(state);
      const copied = cardById(a.cardId).ability!;
      state.frame = {
        ability: copied, owner: f.owner, sourceCardId: f.sourceCardId, theaterIdx: f.theaterIdx, step: 0, viaIncite: true,
        logSeq: pushLog(state, { kind: 'ability', seat: f.owner, cardId: f.sourceCardId, ability: copied, viaIncite: true }),
      };
      return;
    }
    const targets = uncoveredCards(state, { faceUp: true }).filter((c) => {
      const card = cardById(c);
      return c !== f.sourceCardId && card.trigger === 'instant' && card.ability !== 'incite';
    });
    if (targets.length === 0) return finish(state, true);
    ask(state, f, { seat: f.owner, prompt: 'incite', cards: targets, optional: false });
  },

  neutralize(state, f, a) {
    if (a) {
      if (a.kind !== 'name') return finish(state);
      const enemy = state.players[otherSeat(f.owner)];
      const hit = enemy.hand.includes(a.cardId);
      pushLog(state, { kind: 'name', seat: f.owner, cardId: a.cardId, hit });
      if (hit) {
        revealCard(state, otherSeat(f.owner), a.cardId, 'neutralize');
        if (!enemy.neutralized.includes(a.cardId)) enemy.neutralized.push(a.cardId);
      }
      return finish(state);
    }
    ask(state, f, { seat: f.owner, prompt: 'name', cards: cardIdsForTheaters(state.theaters), optional: false });
  },

  surveil(state, f, a) {
    const enemy = otherSeat(f.owner);
    if (a) {
      if (f.step === 0) {
        if (a.kind !== 'card') return finish(state);
        revealCard(state, enemy, a.cardId, 'surveil');
        f.cardId = a.cardId;
        f.step = 1;
      } else if (f.step === 1) {
        if (a.kind !== 'card') return finish(state);
        revealCard(state, f.owner, a.cardId, 'surveil');
        f.step = 2;
      } else {
        if (a.kind === 'card') flipCard(state, a.cardId, f.owner);
        return finish(state);
      }
    }
    if (f.step === 0) {
      const hand = state.players[enemy].hand;
      if (hand.length === 0) return finish(state, true);
      return ask(state, f, { seat: enemy, prompt: 'reveal', cards: hand.slice(), optional: false });
    }
    const faceUp = uncoveredCards(state, { faceUp: true });
    if (f.step === 1) {
      const lower = state.players[f.owner].hand.filter((c) => cardById(c).strength < cardById(f.cardId!).strength);
      if (lower.length === 0 || faceUp.length === 0) return finish(state);
      return ask(state, f, { seat: f.owner, prompt: 'reveal', cards: lower, optional: true, revealedCardId: f.cardId });
    }
    flipOneStep(state, f, faceUp);
  },

  retrofit(state, f, a) {
    if (a) {
      if (a.kind === 'card') {
        const loc = locate(state, a.cardId)!;
        addSupplies(state, f.owner, loc.theaterIdx, cardStrengthById(state, a.cardId), 'retrofit');
        flipCard(state, a.cardId, f.owner);
      }
      return finish(state);
    }
    const mine = uncoveredCards(state, { sides: [f.owner] });
    if (mine.length === 0) return finish(state, true);
    ask(state, f, { seat: f.owner, prompt: 'retrofit', cards: mine, optional: false });
  },

  requisition(state, f, a) {
    if (a) {
      if (a.kind === 'card') {
        revealCard(state, f.owner, a.cardId, 'requisition');
        const t = theaterIndexOf(state, cardById(a.cardId).theater);
        if (t !== -1) addSupplies(state, f.owner, t, 2, 'requisition');
      }
      return finish(state);
    }
    const hand = state.players[f.owner].hand;
    if (hand.length === 0) return finish(state, true);
    ask(state, f, { seat: f.owner, prompt: 'reveal', cards: hand.slice(), optional: true });
  },

  armsRace(state, f, a) {
    if (a && a.kind === 'theater') {
      if (f.step === 0) {
        addSupplies(state, f.owner, a.theaterIdx, 2, 'armsRace');
        f.pickedTheaterIdx = a.theaterIdx;
        f.step = 1;
      } else {
        addSupplies(state, otherSeat(f.owner), a.theaterIdx, 2, 'armsRace');
        return finish(state);
      }
    }
    if (f.step === 0) return ask(state, f, { seat: f.owner, prompt: 'supply', theaters: all(state), optional: false });
    ask(state, f, { seat: otherSeat(f.owner), prompt: 'supply', theaters: all(state).filter((t) => t !== f.pickedTheaterIdx), optional: false });
  },
};

/** The last step of a multi-step ability: flip one of `targets`, or finish if there are none. */
function flipOneStep(state: AlsState, f: AlsFrame, targets: number[]): void {
  if (targets.length === 0) return finish(state);
  ask(state, f, { seat: f.owner, prompt: 'flip', cards: targets, optional: false });
}
