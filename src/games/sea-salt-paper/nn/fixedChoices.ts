// Sea Salt & Paper — hand-written answers to the Extra Pepper decisions:
// which of two event cards to keep, the Angelfish pick, Water Rodeo duos
// (playing them, whose hand to look at, the swap, the pair to steal) and the
// Coral Reef shell.
//
// Not played at runtime — every decision is the network's (action space v3
// has slots for all of these). These rules are the teacher that
// training/ssp/teach.py copies into the Pepper slots of a policy upgraded
// from v2, so it plays Pepper as well as before; a policy trained on Pepper
// should then beat them. Like the network, they read only the seat's
// observation, and choose by score — what the cards involved are worth to
// each side, under that side's own event rules. null = "the network decides"
// (or, outside these decisions, nothing to answer).

import type { SspAction, SspCard, SspEventId } from '../types';
import { tablePairs, totalScore } from '../scoring';
import { scoringOpts } from './encode';
import type { SspObservation, SspObservedPlayer } from './observation';

/** Event cards from best to worst to hold. The two cards in a choice share a
 *  sign — a holder who changed place has already lost the old card — so this
 *  only ever compares boosts with boosts and handicaps with handicaps. */
const KEEP_ORDER: SspEventId[] = [
  'danceOfShells', 'hermitCrab', 'sunfish', 'dolphins', 'danceOfMermaids', 'angelfish', 'waterRodeo', 'coralReef',
  'kraken', 'tornado', 'treasureChest', 'diodonFish',
];

function worth(p: SspObservedPlayer, cards: SspCard[]): number {
  return totalScore(cards, scoringOpts(p)).total;
}

const without = (cards: SspCard[], ids: number[]) => cards.filter((c) => !ids.includes(c.id));

export function fixedChoice(obs: SspObservation): SspAction | null {
  if (obs.eventChoice) {
    const { newEventId, oldEventId } = obs.eventChoice;
    const keepNew = KEEP_ORDER.indexOf(newEventId) <= KEEP_ORDER.indexOf(oldEventId);
    return { type: 'chooseEvent', keep: keepNew ? newEventId : oldEventId };
  }
  if (obs.phase !== 'playing' || obs.activeOffset !== 0) return null;

  const me = obs.players[0];
  const mine = [...obs.hand, ...me.table];
  const myWorth = worth(me, mine);
  /** Change in the viewer's score from gaining `add` and losing `lose`. */
  const gain = (add: SspCard[], lose: number[] = []) => worth(me, [...without(mine, lose), ...add]) - myWorth;
  const attackable = (off: number) => obs.lastChanceOffset !== off && !obs.players[off].coralShell;
  const opponents = obs.players.map((p, off) => ({ p, off })).slice(1);

  switch (obs.subPhase) {
    case 'awaitingAngelfishPick': {
      const [top0, top1] = [obs.piles[0].top, obs.piles[1].top];
      if (!top0 || !top1) return { type: 'angelfishPick', pile: top0 ? 0 : 1 };
      return { type: 'angelfishPick', pile: gain([top1]) > gain([top0]) ? 1 : 0 };
    }

    case 'awaitingRodeoTarget': {
      // Look at the match leader's hand (the bigger hand on a tie).
      const targets = opponents.filter(({ p, off }) => attackable(off) && p.handSize > 0);
      targets.sort((a, b) => b.p.matchScore - a.p.matchScore || b.p.handSize - a.p.handSize);
      return targets.length ? { type: 'rodeoLook', targetPlayerId: targets[0].p.id } : null;
    }

    case 'awaitingRodeoSwap': {
      // The swap that gains the viewer most over what the opponent gains.
      const look = obs.rodeoLook;
      if (!look) return { type: 'rodeoSwap', swap: null };
      const them = obs.players[look.offset];
      const theirs = [...look.hand, ...them.table];
      const theirWorth = worth(them, theirs);
      let swap: [number, number] | null = null;
      let best = 0;
      for (const give of obs.hand) {
        for (const take of look.hand) {
          const net = gain([take], [give.id]) - (worth(them, [...without(theirs, [take.id]), give]) - theirWorth);
          if (net > best) { best = net; swap = [give.id, take.id]; }
        }
      }
      return { type: 'rodeoSwap', swap };
    }

    case 'awaitingPairSteal': {
      // The pair worth most to the viewer plus what it costs the opponent
      // (judged on the cards the viewer can see of theirs).
      let pick: SspAction | null = null;
      let best = -Infinity;
      for (const { p, off } of opponents) {
        if (!attackable(off)) continue;
        const seen = [...p.table, ...p.knownCards];
        for (const pair of tablePairs(p.table, p.trios)) {
          const ids = pair.map((c) => c.id);
          const net = gain(pair) + worth(p, seen) - worth(p, without(seen, ids));
          if (net > best) {
            best = net;
            pick = { type: 'stealPair', targetPlayerId: p.id, cardIds: [pair[0].id, pair[1].id] };
          }
        }
      }
      return pick;
    }

    case 'awaitingPlayOrEnd': {
      // The Coral Reef: hide a shell that scores nothing where it is.
      if (obs.canPlaceCoral) {
        const shell = obs.hand.find((c) => c.family === 'shell' && gain([], [c.id]) >= 0);
        if (shell) return { type: 'placeCoralShell', cardId: shell.id };
      }
      // Water Rodeo duos, when nothing else in hand wants those cards (a
      // shark + swimmer or jellyfish + swimmer pair is the network's call)
      // and their effect has a target.
      if (me.rules.waterRodeo) {
        const of = (f: string) => obs.hand.filter((c) => c.family === f);
        const [swimmers, sharks, jellies] = [of('swimmer'), of('shark'), of('jellyfish')];
        if (swimmers.length >= 2 && sharks.length + jellies.length === 0
          && opponents.some(({ p, off }) => attackable(off) && p.handSize > 0)) {
          return { type: 'playPair', cardIds: [swimmers[0].id, swimmers[1].id] };
        }
        if (sharks.length >= 2 && swimmers.length === 0
          && opponents.some(({ p, off }) => attackable(off) && tablePairs(p.table, p.trios).length > 0)) {
          return { type: 'playPair', cardIds: [sharks[0].id, sharks[1].id] };
        }
      }
      return null;
    }

    default:
      return null;
  }
}
