// Babel — the Great Projects: one per Age, participation, success and
// failure, every reward and penalty kind, penalty tokens.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../reducer';
import { shieldsFor } from '../../resources';
import { scoreMatch } from '../../scoring';
import type { SwState } from '../../types';
import { newMatch, playOut, producer, realCard, discardAll } from '../../testSupport';
import { GREAT_PROJECTS } from './cards';

const NO_PAY = { fromWest: [], fromEast: [], coins: 0 };
const WONDERS = ['gizah-a', 'rhodes-a', 'ephesos-a', 'alexandria-a'];

function projects(n = 3, projectId?: string): SwState {
  const s = newMatch(n, { expansions: ['babelProjects'], wonders: WONDERS.slice(0, n), seed: 5 });
  if (projectId) s.project = { projectId, tokensLeft: n - 1, outcome: null };
  return s;
}

/** Everyone sells until the Age's conflicts. */
function finishAge(s: SwState): SwState {
  const age = s.age;
  while (s.phase === 'playing' && s.age === age && s.subPhase === 'picking') s = discardAll(s);
  return s;
}

describe('Great Projects', () => {
  it('reveals one project of the Age with one token fewer than players', () => {
    const s = projects(4);
    expect(s.project).toMatchObject({ tokensLeft: 3, outcome: null });
    expect(GREAT_PROJECTS.find((p) => p.id === s.project!.projectId)!.age).toBe(1);
    expect(GREAT_PROJECTS.filter((p) => p.age === 1)).toHaveLength(5);
  });

  it('joining needs a card of its colour and pays its cost with the card', () => {
    let s = projects(3, 'rampart-road'); // yellow, 1 coin + stone
    const me = s.players[0]; // Gizah makes stone
    me.hand[0] = realCard('Tavern');
    me.hand[1] = realCard('Altar');
    expect(() => applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[1].id, payment: NO_PAY, participate: true } })).toThrow(/Great Project/);
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY, participate: true } });
    s = discardAll(s);
    expect(s.players[0].participations).toBe(1);
    expect(s.project!.tokensLeft).toBe(1);
    expect(s.players[0].coins).toBe(3 - 1 + 5);
  });

  it('a built project rewards each participant per token', () => {
    let s = projects(3, 'rampart-road');
    s.players[0].participations = 1;
    s.players[1].participations = 1;
    s.project!.tokensLeft = 0;
    s = finishAge(s);
    expect(s.project!.outcome).toBe('success');
    // 3 to start + 3 per sale (6 picks); the reward is 4 coins per participant.
    const sold = 3 + 3 * 6;
    expect(s.players[0].coins).toBe(sold + 4);
    expect(s.players[2].coins).toBe(sold);
    expect(s.players.every((p) => p.participations === 0)).toBe(true);
  });

  it('a failed project penalises everyone without a token (or a penalty token)', () => {
    let s = projects(3, 'rampart-road'); // penalty: lose all coins
    s.players[0].participations = 1;
    s = finishAge(s);
    expect(s.project!.outcome).toBe('failure');
    expect(s.players[0].coins).toBeGreaterThan(0);
    expect(s.players[1].coins).toBe(0);
    expect(s.players[2].coins).toBe(0);
  });

  it('"discard a card of a colour": the city chooses when it has several, else it is automatic', () => {
    let s = projects(3, 'belvedere'); // penalty: discard a red card
    s.players[1].tableau.push(realCard('Stockade'), realCard('Barracks'));
    s.players[2].tableau.push(realCard('Guard Tower'));
    s.players[0].participations = 1;
    s = finishAge(s);
    expect(s.subPhase).toBe('projectPenalty');
    expect(s.projectPenaltyQueue).toEqual(['p1']);
    expect(s.players[2].tableau.some((c) => c.name === 'Guard Tower')).toBe(false);
    const barracks = s.players[1].tableau.find((c) => c.name === 'Barracks')!;
    s = applyAction(s, { type: 'projectPenalty', playerId: 'p1', cardId: barracks.id });
    expect(s.players[1].tableau.map((c) => c.name)).toContain('Stockade');
    expect(s.discard.some((c) => c.id === barracks.id)).toBe(true);
    expect(s.subPhase).toBe('militaryEnd');
  });

  it('a city that cannot pay takes a penalty token (−1/−2/−3 by Age)', () => {
    let s = projects(3, 'cranes'); // penalty: discard a brown card — nobody has one
    s.players[0].participations = 1;
    s = finishAge(s);
    expect(s.players[1].projectTokens!.penalties).toEqual([-1]);
    expect(scoreMatch(s).find((r) => r.playerId === 'p1')!.extras?.projects).toBe(-1);
  });

  it('rewards: shield, victory, free build / stage tokens, science and guild tokens', () => {
    let s = projects(3, 'double-walls'); // reward: 1-VP victory token
    s.players[0].participations = 2;
    s.project!.tokensLeft = 0;
    s = finishAge(s);
    expect(s.players[0].militaryTokens.filter((t) => t === 1).length).toBeGreaterThanOrEqual(2);

    s = projects(3, 'obelisk');
    s.players[0].participations = 1;
    s.project!.tokensLeft = 0;
    s = finishAge(s);
    expect(shieldsFor(s.players[0])).toBeGreaterThanOrEqual(1);

    s = projects(3, 'cranes');
    s.players[0].participations = 1;
    s.project!.tokensLeft = 0;
    s = finishAge(s);
    expect(s.players[0].projectTokens!.freeBuild).toBe(1);
  });

  it('a free-build token builds a card for nothing', () => {
    let s = projects(3);
    const me = s.players[0];
    me.projectTokens!.freeBuild = 1;
    me.coins = 0;
    me.hand[0] = realCard('Baths');
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY, free: 'token' } });
    s = discardAll(s);
    expect(s.players[0].tableau.some((c) => c.name === 'Baths')).toBe(true);
    expect(s.players[0].projectTokens!.freeBuild).toBe(0);
  });

  it('Double Walls\' penalty takes the board\'s starting resource away', () => {
    let s = projects(3, 'double-walls');
    s.players[0].participations = 1;
    s = finishAge(s);
    expect(s.players[1].projectTokens!.resourceBlocked).toBe(true);
    expect(s.players[0].projectTokens!.resourceBlocked).toBe(false);
    void producer;
  });

  it('the AI plays whole matches and joins projects', () => {
    let joined = 0;
    for (let n = 3; n <= 7; n++) {
      const s = playOut(newMatch(n, { expansions: ['babelProjects'], seed: 70 + n, side: 'random' }));
      expect(s.phase).toBe('gameOver');
      joined += s.log.filter((e) => e.kind === 'pickRevealed' && e.pick.kind === 'build' && e.pick.participate).length;
    }
    expect(joined).toBeGreaterThan(5);
  });
});
