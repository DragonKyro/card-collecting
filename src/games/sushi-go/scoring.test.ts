// Sushi Go! Party scoring, including the rulebook's worked examples.

import { describe, it, expect } from 'vitest';
import { scoreRound, scoreDesserts, totalRoundScore, claimUramaki } from './scoring';
import type { SushiGoCard, SushiGoCardKind, SushiGoPlayer } from './types';

let nextId = 1;
function card(kind: SushiGoCardKind, variant?: string, extra: Partial<SushiGoCard> = {}): SushiGoCard {
  return { id: nextId++, kind, ...(variant !== undefined ? { variant } : {}), ...extra };
}

function player(id: string, table: SushiGoCard[] = [], dessertPile: SushiGoCard[] = []): SushiGoPlayer {
  return {
    id, hand: [], table, dessertPile, pendingPick: null, pendingSpoon: false,
    uramakiPoints: 0, scoreByRound: [], dessertScore: 0,
  };
}

const points = (players: SushiGoPlayer[], kind: SushiGoCardKind, nextPlace = 0) => {
  const sc = scoreRound(players, nextPlace);
  return players.map((p) => sc[p.id].find((k) => k.kind === kind)?.points ?? 0);
};

describe('sushi-go scoring', () => {
  it('maki: tied players score the full points and the next total still places', () => {
    // Rulebook: Chris and Meredith 5 icons, Kerry 3, Andrew 1 → 6, 6, 3, 0.
    const ps = [
      player('chris', [card('maki', '3'), card('maki', '2')]),
      player('meredith', [card('maki', '2'), card('maki', '3')]),
      player('kerry', [card('maki', '3')]),
      player('andrew', [card('maki', '1')]),
    ];
    expect(points(ps, 'maki')).toEqual([6, 6, 3, 0]);
  });

  it('maki: 6–8 players score 6 / 4 / 2', () => {
    const ps = [
      player('a', [card('maki', '3')]),
      player('b', [card('maki', '2')]),
      player('c', [card('maki', '1')]),
      player('d'), player('e'), player('f'),
    ];
    expect(points(ps, 'maki')).toEqual([6, 4, 2, 0, 0, 0]);
    expect(points(ps.slice(0, 5), 'maki')).toEqual([6, 3, 0, 0, 0]);
  });

  it('temaki: fewest loses 4, except at 2 players', () => {
    const three = [player('a', [card('temaki'), card('temaki')]), player('b', [card('temaki')]), player('c')];
    expect(points(three, 'temaki')).toEqual([4, 0, -4]);
    const two = [player('a', [card('temaki')]), player('b')];
    expect(points(two, 'temaki')).toEqual([4, 0]);
  });

  it('uramaki: tied claimers both score and the next place is skipped', () => {
    // Rulebook: Chris and Meredith both reach 12 on the same turn → 8 each, 5 is skipped.
    const ps = [
      player('chris', [card('uramaki', '5'), card('uramaki', '4'), card('uramaki', '3')]),
      player('meredith', [card('uramaki', '4'), card('uramaki', '4'), card('uramaki', '4')]),
      player('kerry', [card('uramaki', '5')]),
    ];
    const claim = claimUramaki(ps, 0);
    expect(claim.awards).toEqual({ chris: 8, meredith: 8 });
    expect(claim.nextPlace).toBe(2);
  });

  it('uramaki: at round end the most icons left scores the next unclaimed place', () => {
    const scored = player('a', []);
    scored.uramakiPoints = 8;
    const ps = [scored, player('b', [card('uramaki', '5')]), player('c', [card('uramaki', '4')])];
    expect(points(ps, 'uramaki', 1)).toEqual([8, 5, 0]);
    expect(points(ps, 'uramaki', 3)).toEqual([8, 0, 0]);
  });

  it('edamame: 1 per opponent with edamame, per card', () => {
    // Rulebook: Chris 3, Kerry 2, Andrew 1, Meredith 0 → 6, 4, 2.
    const ps = [
      player('chris', [card('edamame'), card('edamame'), card('edamame')]),
      player('kerry', [card('edamame'), card('edamame')]),
      player('andrew', [card('edamame')]),
      player('meredith'),
    ];
    expect(points(ps, 'edamame')).toEqual([6, 4, 2, 0]);
  });

  it('onigiri: repeated shapes start another set', () => {
    // Rulebook: circle, triangle, 2 squares → 9 + 1.
    const ps = [player('chris', [
      card('mizuOnigiri', 'circle'), card('mizuOnigiri', 'triangle'),
      card('mizuOnigiri', 'square'), card('mizuOnigiri', 'square'),
    ])];
    expect(points(ps, 'mizuOnigiri')).toEqual([10]);
  });

  it('tea counts the biggest background color, where wasabi shares nigiri yellow', () => {
    // Rulebook: wasabi, squid nigiri, 2 salmon nigiri → tea worth 4.
    const ps = [player('chris', [
      card('wasabi'), card('nigiri', 'squid'), card('nigiri', 'salmon'), card('nigiri', 'salmon'), card('tea'),
    ])];
    expect(points(ps, 'tea')).toEqual([4]);
  });

  it('soy sauce: 4 if tied for most colors, soy sauce itself included', () => {
    const ps = [
      player('a', [card('soySauce'), card('wasabi'), card('nigiri', 'egg')]), // soy + yellow
      player('b', [card('tempura'), card('sashimi')]),
      player('c', [card('tempura')]),
    ];
    expect(points(ps, 'soySauce')).toEqual([4, 0, 0]);
  });

  it('miso soup scores 3 each', () => {
    expect(points([player('a', [card('misoSoup'), card('misoSoup')])], 'misoSoup')).toEqual([6]);
  });

  it('flipped cards score 2 and nothing else; a flipped nigiri still holds its wasabi', () => {
    const p = player('a', [
      card('wasabi'), card('nigiri', 'squid', { flipped: true }), card('nigiri', 'salmon'),
      card('tempura', undefined, { flipped: true }), card('tempura'),
    ]);
    const sc = scoreRound([p])['a'];
    expect(sc.find((k) => k.kind === 'nigiri')?.points).toBe(2); // salmon not tripled
    expect(sc.find((k) => k.kind === 'tempura')?.points).toBe(0); // only 1 face-up tempura
    expect(sc.find((k) => k.kind === 'takeoutBox')?.points).toBe(4);
  });

  it('a special order scores as the card it copies', () => {
    const p = player('a', [
      card('nigiri', 'squid'), card('wasabi'),
      card('specialOrder', undefined, { copyOf: { kind: 'nigiri', variant: 'squid' } }),
    ]);
    // squid 3 + copied squid on the wasabi 9
    expect(totalRoundScore(scoreRound([p])['a'])).toBe(12);
  });

  it('pudding: ties take the full points; no penalty at 2 players', () => {
    // Rulebook: Chris 4, Meredith 2, Kerry 1, Andrew 1 → +6, 0, −6, −6.
    const pud = (n: number) => Array.from({ length: n }, () => card('pudding'));
    const ps = [player('chris', [], pud(4)), player('meredith', [], pud(2)), player('kerry', [], pud(1)), player('andrew', [], pud(1))];
    const sc = scoreDesserts(ps);
    expect(ps.map((p) => sc[p.id])).toEqual([6, 0, -6, -6]);
    const two = [player('a', [], pud(2)), player('b', [], pud(1))];
    const sc2 = scoreDesserts(two);
    expect([sc2.a, sc2.b]).toEqual([6, 0]);
  });

  it('fruit: scored per type; no fruit at all costs 6', () => {
    // 5 pineapple, 1 orange, 0 watermelon → 10 + 0 − 2.
    const ps = [
      player('chris', [], [card('fruit', 'PP'), card('fruit', 'PO'), card('fruit', 'PP')]),
      player('meredith'),
    ];
    const sc = scoreDesserts(ps);
    expect(sc.chris).toBe(8);
    expect(sc.meredith).toBe(-6);
  });
});
