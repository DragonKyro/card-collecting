// Leaders — the draft, the Recruitment phase and every leader / guild /
// board power that needs the reducer.

import { describe, expect, it } from 'vitest';
import { applyAction, _internals } from '../../reducer';
import { planPayment, effectiveCostFor, shieldsFor } from '../../resources';
import { scoreMatch } from '../../scoring';
import type { SwPlayer, SwState } from '../../types';
import { newMatch, playOut, producer, realCard, discardAll } from '../../testSupport';
import { recruitCost } from './reducer';

const NO_PAY = { fromWest: [], fromEast: [], coins: 0 };

const PLAIN = ['gizah-a', 'rhodes-a', 'ephesos-a', 'alexandria-a', 'babylon-a', 'olympia-b', 'halicarnassus-b'];

/** A Leaders match on boards without leader powers (unless given). */
function leaders(n = 3, wonders?: string[]): SwState {
  return newMatch(n, { expansions: ['leaders'], wonders: wonders ?? PLAIN.slice(0, n), seed: 11 });
}

/** Play the drafts and Recruitment with the AI until Age I's picking. */
function toPicking(s: SwState): SwState {
  return playOut(s, (x) => x.subPhase === 'picking');
}

const leader = (name: string) => realCard(name);

function recruitNow(_s: SwState, p: SwPlayer, name: string): void {
  p.leaderTableau = [...(p.leaderTableau ?? []), leader(name)];
}

describe('Leaders: setup and the draft', () => {
  it('starts everyone on 6 coins with 4 leaders to draft', () => {
    const s = leaders(4);
    expect(s.subPhase).toBe('leaderDraft');
    for (const p of s.players) {
      expect(p.coins).toBe(6);
      expect(s.leaderDraftHands![p.id]).toHaveLength(4);
    }
  });

  it('passes the rest of the hand to the right (east) after each pick', () => {
    let s = leaders(3);
    const before = Object.fromEntries(s.players.map((p) => [p.id, s.leaderDraftHands![p.id].map((c) => c.id)]));
    for (const p of s.players) {
      s = applyAction(s, { type: 'submitLeaderDraft', playerId: p.id, cardId: before[p.id][0] });
    }
    // p1 now holds what was left of p0's hand (p0 → its right / east neighbour p1).
    expect(s.leaderDraftHands!.p1.map((c) => c.id)).toEqual(before.p0.slice(1));
    expect(s.leaderDraftHands!.p0.map((c) => c.id)).toEqual(before.p2.slice(1));
    expect(s.players[0].leaderHand!.map((c) => c.id)).toEqual([before.p0[0]]);
  });

  it('goes to the Recruitment phase before Age I, then deals the Age', () => {
    let s = playOut(leaders(3), (x) => x.subPhase === 'leaderPlay');
    expect(s.age).toBe(1);
    expect(s.players.every((p) => p.leaderHand!.length === 4)).toBe(true);
    for (const p of s.players) {
      s = applyAction(s, { type: 'submitLeaderPlay', playerId: p.id, pick: { kind: 'discard', cardId: p.leaderHand![0].id } });
    }
    expect(s.subPhase).toBe('picking');
    expect(s.players.every((p) => p.coins === 9 && p.hand.length === 7 && p.leaderHand!.length === 3)).toBe(true);
  });
});

describe('Leaders: the Recruitment phase', () => {
  function atRecruitment(n = 3, wonders?: string[]): SwState {
    return playOut(leaders(n, wonders), (x) => x.subPhase === 'leaderPlay');
  }

  it('recruiting pays the printed cost; Croesus pays 6 at once; Aspasia is a diplomacy token', () => {
    let s = atRecruitment();
    const me = s.players[0];
    me.leaderHand = [leader('Croesus'), leader('Caesar')];
    s = applyAction(s, { type: 'submitLeaderPlay', playerId: me.id, pick: { kind: 'play', cardId: me.leaderHand[0].id, payment: NO_PAY } });
    for (const p of s.players.slice(1)) s = applyAction(s, { type: 'submitLeaderPlay', playerId: p.id, pick: { kind: 'discard', cardId: p.leaderHand![0].id } });
    expect(s.players[0].coins).toBe(6 - 1 + 6);
    expect(s.players[0].leaderTableau!.map((c) => c.name)).toEqual(['Croesus']);
  });

  it('a recruit needs the coins', () => {
    const s = atRecruitment();
    const me = s.players[0];
    me.coins = 3;
    me.leaderHand = [leader('Pericles')];
    expect(() => applyAction(s, { type: 'submitLeaderPlay', playerId: me.id, pick: { kind: 'play', cardId: me.leaderHand![0].id, payment: NO_PAY } })).toThrow(/coins/);
  });

  it('burying a leader builds the stage with its full power (Halicarnassus builds from the discard)', () => {
    let s = atRecruitment(3, ['halicarnassus-a', 'gizah-a', 'rhodes-a']);
    const me = s.players[0];
    me.wonderStagesBuilt = 1;
    me.tableau.push(producer('ore', 'ore', 'ore'));
    s.discard.push(realCard('Baths'));
    s = applyAction(s, { type: 'submitLeaderPlay', playerId: me.id, pick: { kind: 'bury', cardId: me.leaderHand![0].id, payment: NO_PAY } });
    for (const p of s.players.slice(1)) s = applyAction(s, { type: 'submitLeaderPlay', playerId: p.id, pick: { kind: 'discard', cardId: p.leaderHand![0].id } });
    expect(s.players[0].wonderStagesBuilt).toBe(2);
    expect(s.subPhase).toBe('discardBuild');
    s = applyAction(s, { type: 'buildFromDiscard', playerId: me.id, cardId: s.discard.find((c) => c.name === 'Baths')!.id });
    expect(s.players[0].tableau.some((c) => c.name === 'Baths')).toBe(true);
    expect(s.subPhase).toBe('picking');
  });

  it('Solomon builds a card from the discard pile when recruited', () => {
    let s = atRecruitment();
    const me = s.players[0];
    me.leaderHand = [leader('Solomon')];
    s.discard.push(realCard('Altar'));
    s = applyAction(s, { type: 'submitLeaderPlay', playerId: me.id, pick: { kind: 'play', cardId: me.leaderHand[0].id, payment: NO_PAY } });
    for (const p of s.players.slice(1)) s = applyAction(s, { type: 'submitLeaderPlay', playerId: p.id, pick: { kind: 'discard', cardId: p.leaderHand![0].id } });
    expect(s.subPhase).toBe('solomonAwaitPick');
    expect(s.activePlayerId).toBe(me.id);
    s = applyAction(s, { type: 'solomonPick', playerId: me.id, cardId: s.discard.find((c) => c.name === 'Altar')!.id });
    expect(s.players[0].tableau.some((c) => c.name === 'Altar')).toBe(true);
    expect(s.subPhase).toBe('picking');
  });
});

describe('Leaders: powers', () => {
  it('Rome A recruits for free; Rome B for 2 less and its neighbours for 1 less', () => {
    const a = leaders(3, ['rome-a', 'gizah-a', 'rhodes-a']);
    expect(recruitCost(a, a.players[0], leader('Pericles'))).toBe(0);
    const b = leaders(3, ['rome-b', 'gizah-a', 'rhodes-a']);
    expect(recruitCost(b, b.players[0], leader('Pericles'))).toBe(4);
    expect(recruitCost(b, b.players[1], leader('Pericles'))).toBe(5);
    expect(recruitCost(b, b.players[2], leader('Pericles'))).toBe(5);
    expect(recruitCost(b, b.players[0], leader('Croesus'))).toBe(0);
  });

  it('Rome B: stage 1 draws 4 leaders, stage 2 recruits one at once', () => {
    let s = toPicking(leaders(3, ['rome-b', 'gizah-a', 'rhodes-a']));
    const me = s.players[0];
    const before = me.leaderHand!.length;
    me.tableau.push(producer('clay', 'wood', 'loom', 'stone', 'clay'));
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'wonder', cardId: me.hand[0].id, stageIndex: 0, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.players[0].leaderHand!.length).toBe(before + 4);
    const coins = s.players[0].coins;
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'wonder', cardId: s.players[0].hand[0].id, stageIndex: 1, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.subPhase).toBe('romeRecruit');
    const pick = s.players[0].leaderHand!.find((c) => recruitCost(s, s.players[0], c) <= s.players[0].coins)!;
    s = applyAction(s, { type: 'romeRecruit', playerId: me.id, cardId: pick.id });
    expect(s.players[0].leaderTableau!.some((c) => c.id === pick.id)).toBe(true);
    expect(s.subPhase).toBe('picking');
    void coins;
  });

  it("Tomyris hands her owner's defeats to the victor", () => {
    const s = leaders(3);
    s.subPhase = 'picking';
    s.players[0].tableau = [];
    s.players[1].tableau = [realCard('Stockade')];
    s.players[2].tableau = [realCard('Stockade')];
    recruitNow(s, s.players[0], 'Tomyris');
    _internals.resolveMilitary(s);
    expect(s.players[0].militaryTokens).toEqual([]);
    expect(s.players[1].militaryTokens.sort()).toEqual([-1, 1]);
    expect(s.players[2].militaryTokens.sort()).toEqual([-1, 1]);
  });

  it('Semiramis counts each defeat token as a shield', () => {
    const s = leaders(3);
    const me = s.players[0];
    me.militaryTokens = [-1, -1];
    expect(shieldsFor(me)).toBe(0);
    recruitNow(s, me, 'Semiramis');
    expect(shieldsFor(me)).toBe(2);
  });

  it("the one-resource-less leaders leave out the dearest unit; Ramses frees guilds", () => {
    // Nobody at the table produces papyrus.
    const s = leaders(3, ['gizah-a', 'rhodes-a', 'alexandria-a']);
    const me = s.players[0];
    me.coins = 20;
    s.players[1].tableau.push(producer('glass'));
    s.players[2].tableau.push(producer('glass'));
    const lab = realCard('Laboratory'); // clay, clay, papyrus
    me.tableau.push(producer('clay', 'clay'));
    expect(planPayment(s, me, effectiveCostFor(s, me, { kind: 'card', card: lab })).ok).toBe(false);
    recruitNow(s, me, 'Archimedes');
    const plan = planPayment(s, me, effectiveCostFor(s, me, { kind: 'card', card: lab }));
    expect(plan).toMatchObject({ ok: true, totalCoins: 0, payment: { waived: ['papyrus'] } });
    recruitNow(s, me, 'Ramses');
    expect(effectiveCostFor(s, me, { kind: 'card', card: realCard('Builders Guild') }).resources).toEqual([]);
  });

  it('Bilkis buys a missing resource from the bank for 1 coin', () => {
    const s = leaders(3);
    const me = s.players[0];
    me.coins = 5;
    recruitNow(s, me, 'Bilkis');
    const plan = planPayment(s, me, { resources: ['papyrus'] });
    expect(plan).toMatchObject({ ok: true, totalCoins: 1, payment: { bank: 'papyrus' } });
  });

  it('Xenophon, Vitruvius and Hatshepsut pay their coins; Berenice adds 1 once a turn', () => {
    let s = toPicking(leaders(3));
    const me = s.players[0];
    me.leaderTableau = [leader('Xenophon')];
    me.coins = 10;
    me.hand[0] = realCard('Tavern');
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.players[0].coins).toBe(10 + 5 + 2);

    s = toPicking(leaders(3));
    const b = s.players[0];
    b.leaderTableau = [leader('Berenice')];
    b.coins = 0;
    s = applyAction(s, { type: 'submitPick', playerId: b.id, pick: { kind: 'discard', cardId: b.hand[0].id } });
    s = discardAll(s);
    expect(s.players[0].coins).toBe(3 + 1);
  });

  it('Caligula builds one black card per Age for free', () => {
    let s = toPicking(newMatch(3, { expansions: ['leaders', 'cities'], seed: 4 }));
    s = playOut(s, (x) => x.subPhase === 'picking');
    const me = s.players[0];
    me.leaderTableau = [leader('Caligula')];
    me.coins = 0;
    me.hand[0] = realCard('Tabularium');
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY, free: 'color' } });
    s = discardAll(s);
    expect(s.players[0].tableau.some((c) => c.name === 'Tabularium')).toBe(true);
    expect(s.players[0].freeColorUsedAge).toBe(1);
  });

  it("the Courtesans' Guild copies a neighbour's leader", () => {
    let s = toPicking(leaders(3));
    s.age = 3;
    const me = s.players[0];
    s.players[1].leaderTableau = [leader('Caesar')];
    me.coins = 20;
    me.tableau.push(producer('wood', 'clay', 'glass', 'loom'));
    me.hand[0] = realCard('Courtesans Guild');
    s = applyAction(s, { type: 'submitPick', playerId: me.id, pick: { kind: 'build', cardId: me.hand[0].id, payment: NO_PAY } });
    s = discardAll(s);
    expect(s.subPhase).toBe('courtesan');
    const caesar = s.players[1].leaderTableau![0];
    s = applyAction(s, { type: 'courtesanPick', playerId: me.id, leaderId: caesar.id });
    expect(shieldsFor(s.players[0])).toBe(2);
    expect(s.players[0].leaderTableau!.find((c) => c.copyOf)?.copyOf).toEqual({ playerId: 'p1', cardId: caesar.id });
  });
});

describe('Leaders: scoring', () => {
  it('scores the leaders column and Aristotle with science', () => {
    const s = leaders(3);
    const me = s.players[0];
    me.tableau = [realCard('Apothecary'), realCard('Workshop'), realCard('Scriptorium'), realCard('Barracks'), realCard('Altar')];
    me.coins = 9;
    me.militaryTokens = [1, 3, -1];
    me.leaderTableau = [leader('Cleopatra'), leader('Justinian'), leader('Midas'), leader('Alexander'), leader('Hypatia')];
    let row = scoreMatch(s).find((r) => r.playerId === me.id)!;
    // 5 + 3 (one set) + 3 (9 coins) + 2 (two victories) + 3 (three green)
    expect(row.extras?.leaders).toBe(16);
    expect(row.science).toBe(10);
    me.leaderTableau.push(leader('Aristotle'));
    row = scoreMatch(s).find((r) => r.playerId === me.id)!;
    expect(row.science).toBe(13);
  });

  it("the Diplomats' Guild counts neighbours' recruited leaders, not copies", () => {
    const s = leaders(3);
    s.players[0].tableau = [realCard('Diplomats Guild')];
    s.players[1].leaderTableau = [leader('Sappho'), { ...leader('Caesar'), copyOf: { playerId: 'p2', cardId: 1 } }];
    s.players[2].leaderTableau = [leader('Nero')];
    expect(scoreMatch(s).find((r) => r.playerId === 'p0')!.guild).toBe(2);
  });
});

describe('Leaders: AI', () => {
  it('plays whole matches at 3–7 players, with Cities and the Tower', () => {
    for (let n = 3; n <= 7; n++) {
      const s = playOut(newMatch(n, { expansions: ['leaders', 'cities', 'babelTower'], seed: 20 + n, side: 'random' }));
      expect(s.phase).toBe('gameOver');
    }
  });
});
