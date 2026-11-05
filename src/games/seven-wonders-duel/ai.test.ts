// 7 Wonders Duel — AI smoke and behaviour tests.

import { describe, it, expect } from 'vitest';
import { createRng, rngInt, type RngState } from '@/core/rng';
import type { DuelAction, DuelState } from './types';
import { applyAction, legalActions } from './reducer';
import { chooseAIAction } from './ai';
import { giveCard, newMatch, stage, startedMatch } from './testSupport';

type Agent = (s: DuelState, rng: RngState) => DuelAction;
const ai: Agent = (s) => {
  const a = chooseAIAction(s, s.activePlayerId!);
  if (!a) throw new Error(`AI returned null in ${s.subPhase}`);
  return a;
};
const random: Agent = (s, rng) => {
  const legal = legalActions(s);
  return legal[rngInt(rng, legal.length)];
};

function play(seed: number, agents: [Agent, Agent]): DuelState {
  const rng = createRng(seed * 977);
  let s = newMatch(seed);
  for (let i = 0; i < 400 && s.phase === 'playing'; i++) {
    s = applyAction(s, agents[s.activeSeatIdx](s, rng));
  }
  return s;
}

describe('Duel AI', () => {
  it('plays AI-vs-AI matches to the end with only legal moves', () => {
    const reasons = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = play(seed, [ai, ai]);
      expect(s.phase).toBe('gameOver');
      reasons.add(s.endReason!);
    }
    expect(reasons.has('civilian')).toBe(true);
  }, 60_000);

  it('beats a random player from either seat', () => {
    let wins = 0;
    const n = 30;
    for (let seed = 1; seed <= n; seed++) {
      const a = play(seed, [ai, random]);
      const b = play(seed + 1000, [random, ai]);
      if (a.winnerSeatIdx === 0) wins++;
      if (b.winnerSeatIdx === 1) wins++;
    }
    expect(wins / (2 * n)).toBeGreaterThan(0.9);
  }, 60_000);

  it('takes a card that wins on the spot', () => {
    const s = startedMatch(3);
    const seat = s.activeSeatIdx;
    s.players[seat].coins = 30;
    s.militaryPawn = seat === 0 ? 7 : -7;
    const walls = stage(s, 'Walls', 1);
    expect(chooseAIAction(s, s.activePlayerId!)).toEqual({ type: 'takeAndBuild', playerId: s.activePlayerId, cardId: walls });
  });

  it('denies the opponent a card that would win for them', () => {
    const s = startedMatch(3);
    const seat = s.activeSeatIdx;
    const opp = (1 - seat) as 0 | 1;
    // The opponent holds five different symbols; Study would be their sixth.
    giveCard(s, opp, 'Workshop', 'Apothecary', 'Scriptorium', 'Pharmacist', 'University');
    s.players[opp].coins = 30;
    const study = stage(s, 'Study', 2);
    const a = chooseAIAction(s, s.activePlayerId!);
    expect(a && 'cardId' in a ? a.cardId : null).toBe(study);
  });

  it('answers every decision sub-phase', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = newMatch(seed);
      const seen = new Set<string>();
      for (let i = 0; i < 400 && s.phase === 'playing'; i++) {
        seen.add(s.subPhase);
        s = applyAction(s, ai(s, createRng(1)));
      }
      expect(s.phase).toBe('gameOver');
      expect(seen.has('wonderDraft')).toBe(true);
    }
  });
});
