import { describe, expect, it } from 'vitest';
import { rngInt, type RngState } from '@/core/rng';
import type { MkAction, MkEdition, MkState } from './types';
import { chooseAIAction } from './ai';
import {
  activePlayer, applyAction, buildOptions, canRollTwo, createMatch, exchangeableCards,
} from './reducer';
import { seats } from './testSupport';

/** Any legal move, picked at random. */
function randomAction(state: MkState, rng: RngState): MkAction {
  const me = activePlayer(state);
  const playerId = me.id;
  const pick = <T,>(xs: T[]) => xs[rngInt(rng, xs.length)];
  switch (state.subPhase) {
    case 'roll':
      return { type: 'roll', playerId, dice: canRollTwo(state, playerId) ? pick([1, 2] as const) : 1 };
    case 'reroll':
      return rngInt(rng, 2) ? { type: 'keepRoll', playerId } : { type: 'reroll', playerId, dice: 1 };
    case 'tvTarget':
      return { type: 'tvTarget', playerId, targetId: pick(state.players.filter((p) => p !== me)).id };
    case 'exchange': {
      const opp = pick(state.players.filter((p) => p !== me && exchangeableCards(state, p).length > 0));
      return {
        type: 'exchange', playerId, give: pick(exchangeableCards(state, me)), targetId: opp.id,
        take: pick(exchangeableCards(state, opp)),
      };
    }
    case 'gift':
      return { type: 'gift', playerId, cardId: pick(Object.keys(me.city)) };
    case 'build':
    case 'setupBuild': {
      const opts = buildOptions(state, me);
      return opts.length && rngInt(rng, 4) ? { type: 'build', playerId, cardId: pick(opts).cardId } : { type: 'pass', playerId };
    }
  }
}

function playOut(edition: MkEdition, n: number, seed: number, randomSeats: number[] = []): MkState {
  let state = createMatch({ edition, promoLandmarks: seed % 2 === 0 }, seed, seats(n, true));
  const rng = { seed: seed * 7919 };
  for (let steps = 0; state.phase === 'playing'; steps++) {
    if (steps > 4000) throw new Error(`${edition} ${n}p seed ${seed} did not finish`);
    const idx = state.currentIdx;
    const action = randomSeats.includes(idx)
      ? randomAction(state, rng)
      : chooseAIAction(state, state.activePlayerId!);
    expect(action).not.toBeNull();
    state = applyAction(state, action!);
  }
  return state;
}

describe('AI', () => {
  for (const [edition, counts] of [['mk2', [2, 3, 4, 5]], ['mk1', [2, 3, 4]]] as const) {
    it(`${edition}: AI-only matches always finish with a winner (${counts.join('/')} players)`, () => {
      const rounds: number[] = [];
      for (const n of counts) {
        for (let seed = 1; seed <= 12; seed++) {
          const end = playOut(edition, n, seed);
          expect(end.phase).toBe('gameOver');
          expect(end.winnerId).not.toBeNull();
          rounds.push(end.round);
        }
      }
      const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
      // Sanity: real games run roughly 10–20 rounds.
      expect(avg).toBeGreaterThan(5);
      expect(avg).toBeLessThan(40);
    });
  }

  for (const edition of ['mk2', 'mk1'] as const) {
    it(`${edition}: beats a random player head to head`, () => {
      let wins = 0;
      const games = 40;
      for (let seed = 1; seed <= games; seed++) {
        const randomSeat = seed % 2;
        const end = playOut(edition, 2, 1000 + seed, [randomSeat]);
        if (end.winnerId === `p${1 - randomSeat}`) wins++;
      }
      expect(wins / games).toBeGreaterThan(0.8);
    });
  }

  it('only acts for the active player', () => {
    const state = createMatch({ edition: 'mk2', promoLandmarks: false }, 3, seats(3, true));
    const other = state.players.find((p) => p.id !== state.activePlayerId)!;
    expect(chooseAIAction(state, other.id)).toBeNull();
  });
});
