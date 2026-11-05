// 7 Wonders Duel — AI smoke and behaviour tests.

import { describe, it, expect } from 'vitest';
import { createRng, rngInt, type RngState } from '@/core/rng';
import type { DuelAction, DuelConfig, DuelState } from './types';
import { applyAction, legalActions } from './reducer';
import { chooseAIAction } from './ai';
import { divinityById } from './pantheon';
import { giveCard, newMatch, SEATS, stage, startedMatch } from './testSupport';

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

  it('answers every decision sub-phase (base game)', () => {
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

// ---------------------------------------------------------------------------
// Expansions

const EXPANSIONS: [string, DuelConfig][] = [
  ['Pantheon', { pantheon: true }],
  ['Agora', { agora: true }],
  ['Pantheon + Agora', { pantheon: true, agora: true }],
];

function playWith(seed: number, config: DuelConfig, agents: [Agent, Agent], check?: (s: DuelState, a: DuelAction) => void): DuelState {
  const rng = createRng(seed * 977);
  let s = newMatch(seed, SEATS, config);
  for (let i = 0; i < 900 && s.phase === 'playing'; i++) {
    const a = agents[s.activeSeatIdx](s, rng);
    check?.(s, a);
    s = applyAction(s, a);
  }
  return s;
}

/** Everything the seat to move can't know, changed: the opponent's
 *  unrevealed Conspiracies, face-down Decrees, the order of the Mythology and
 *  Conspiracy decks, face-down structure cards, and (in Age I) the
 *  opponent's face-down Divinities. */
function scramble(state: DuelState): DuelState {
  const s: DuelState = JSON.parse(JSON.stringify(state));
  const me = s.activeSeatIdx;
  const opp = (1 - me) as 0 | 1;
  const ag = s.agora;
  if (ag) {
    for (const c of s.players[opp].agora!.conspiracies) {
      if (c.triggered || ag.conspiracyDeck.length === 0) continue;
      const swap = ag.conspiracyDeck.shift()!;
      ag.conspiracyDeck.push(c.id);
      c.id = swap;
    }
    ag.conspiracyDeck.reverse();
    const hidden = ag.decrees.flat().filter((d) => !d.faceUp);
    const ids = hidden.map((d) => d.id).reverse();
    hidden.forEach((d, i) => { d.id = ids[i]; });
  }
  const pan = s.pantheon;
  if (pan) {
    for (const deck of Object.values(pan.decks)) deck.reverse();
    if (!pan.revealed) {
      for (const sp of pan.spaces) {
        if (!sp || sp.placedBy !== opp) continue;
        const deck = pan.decks[divinityById(sp.divinity).mythology!];
        if (deck.length === 0) continue;
        const swap = deck.shift()!;
        deck.push(sp.divinity);
        sp.divinity = swap;
      }
    }
  }
  const down = s.pyramid.filter((x) => !x.faceUp && !x.taken);
  const cards = down.map((x) => x.cardId).reverse();
  down.forEach((x, i) => { x.cardId = cards[i]; });
  return s;
}

describe('Duel AI with the expansions', () => {
  for (const [label, config] of EXPANSIONS) {
    it(`${label}: AI-vs-AI matches end, with only legal moves, from either seat`, () => {
      const reasons = new Set<string>();
      const wins = [0, 0];
      for (let seed = 1; seed <= 16; seed++) {
        const s = playWith(seed, config, [ai, ai], (st, a) => {
          expect(legalActions(st)).toContainEqual(a);
        });
        expect(s.phase).toBe('gameOver');
        reasons.add(s.endReason!);
        if (s.winnerSeatIdx !== null) wins[s.winnerSeatIdx]++;
      }
      expect(wins[0] + wins[1]).toBeGreaterThan(10);
      expect(wins[0]).toBeGreaterThan(0);
      expect(wins[1]).toBeGreaterThan(0);
      expect(reasons.size).toBeGreaterThan(0);
    }, 120_000);

    it(`${label}: beats a random player from either seat`, () => {
      let wins = 0;
      const n = 12;
      for (let seed = 1; seed <= n; seed++) {
        if (playWith(seed, config, [ai, random]).winnerSeatIdx === 0) wins++;
        if (playWith(seed + 500, config, [random, ai]).winnerSeatIdx === 1) wins++;
      }
      expect(wins / (2 * n)).toBeGreaterThan(0.85);
    }, 120_000);
  }

  it('chooses the same move whatever the hidden information is', () => {
    let checked = 0;
    for (let seed = 1; seed <= 6; seed++) {
      playWith(seed, { pantheon: true, agora: true }, [ai, ai], (s, a) => {
        if (s.subPhase !== 'turn' && s.subPhase !== 'senate' && s.subPhase !== 'placeInfluence') return;
        expect(chooseAIAction(scramble(s), s.activePlayerId!)).toEqual(a);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(200);
  }, 120_000);

  it('invokes a Divinity worth more than its cost, and triggers a strong prepared Conspiracy', () => {
    const s = startedMatch(3, undefined, { pantheon: true });
    const seat = s.activeSeatIdx;
    s.pantheon!.revealed = true;
    s.pantheon!.spaces[seat === s.firstSeatIdx ? 5 : 0] = { divinity: 'tanit', placedBy: 0 };
    s.players[seat].coins = 9;
    s.players[seat].wonders = [];
    // Nothing to build: every accessible card is already in the city.
    for (const slot of s.pyramid.filter((x) => !x.taken && x.faceUp)) giveCard(s, seat, s.cardsById[slot.cardId].name);
    expect(chooseAIAction(s, s.activePlayerId!)).toMatchObject({ type: 'invokeDivinity' });

    const t = startedMatch(3, undefined, { agora: true });
    const ts = t.activeSeatIdx;
    t.players[1 - ts].coins = 20;
    t.players[ts].agora!.conspiracies.push({ id: 'blackmail', preparedWith: 100, triggered: false });
    expect(chooseAIAction(t, t.activePlayerId!)).toEqual({ type: 'triggerConspiracy', playerId: t.activePlayerId, conspiracy: 'blackmail' });
  });
});
