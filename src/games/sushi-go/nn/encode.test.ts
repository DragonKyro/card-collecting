import { describe, it, expect } from 'vitest';
import type { SushiGoCard, SushiGoCardKind } from '../types';
import { sampleStates } from '../testSupport';
import { observe, type SushiGoObservation } from './observation';
import { ENCODER_VERSION, OBS_DIM, encodeObservation, featureLayout } from './encode';
import { FACES, FACE_COPIES, faceIndex } from './faces';

function segment(x: Float32Array, name: string): Float32Array {
  const seg = featureLayout().find((s) => s.name === name);
  if (!seg) throw new Error(`no segment ${name}`);
  return x.subarray(seg.offset, seg.offset + seg.size);
}

const MENU_A: SushiGoCardKind[] = ['nigiri', 'uramaki', 'misoSoup', 'mizuOnigiri', 'tempura', 'specialOrder', 'wasabi', 'fruit'];
const MENU_B: SushiGoCardKind[] = ['nigiri', 'maki', 'edamame', 'tofu', 'eel', 'spoon', 'takeoutBox', 'pudding'];

const STATES = [
  ...sampleStates({ players: 2, menu: MENU_A, matches: 3, seed: 77, every: 2 }),
  ...sampleStates({ players: 2, matches: 2, seed: 78, every: 2 }),
  ...sampleStates({ players: 3, menu: MENU_B, matches: 2, seed: 79, every: 3 }),
  ...sampleStates({ players: 6, menu: MENU_A, matches: 1, seed: 80, every: 4 }),
  ...sampleStates({ players: 8, menu: MENU_B, matches: 1, seed: 81, every: 4 }),
];

let nextId = 9000;
const card = (kind: SushiGoCardKind, variant?: string): SushiGoCard => ({ id: nextId++, kind, ...(variant ? { variant } : {}) });

/** A 2-player selecting observation with the given tables. */
function obsWith(myTable: SushiGoCard[], hand: SushiGoCard[], oppTable: SushiGoCard[] = []): SushiGoObservation {
  const base = observe(sampleStates({ players: 2, menu: MENU_A, matches: 1, seed: 5 })[0], 'p0');
  return {
    ...base,
    hand,
    players: [
      { ...base.players[0], table: myTable, knownHand: hand, handSize: hand.length },
      { ...base.players[1], table: oppTable },
    ],
  };
}

describe('sushi-go feature encoder', () => {
  it('has a contiguous layout with unique segment names', () => {
    const layout = featureLayout();
    let at = 0;
    for (const seg of layout) {
      expect(seg.offset).toBe(at);
      expect(seg.size).toBeGreaterThan(0);
      at += seg.size;
    }
    expect(at).toBe(OBS_DIM);
    expect(new Set(layout.map((s) => s.name)).size).toBe(layout.length);
  });

  it('matches the versioned size and face list (bump ENCODER_VERSION when these change)', () => {
    expect({ version: ENCODER_VERSION, dim: OBS_DIM, faces: FACES.length }).toEqual({ version: 1, dim: 615, faces: 37 });
    expect(FACE_COPIES.reduce((a, b) => a + b, 0)).toBe(12 + 3 * 12 + 8 * 8 + 8 * 3 + 3 * 15);
  });

  it('writes bounded, finite values for every sampled state and seat', () => {
    expect(STATES.length).toBeGreaterThan(200);
    for (const s of STATES) {
      for (const p of s.players) {
        const x = encodeObservation(observe(s, p.id));
        const bad = featureLayout().filter((seg) =>
          x.subarray(seg.offset, seg.offset + seg.size).some((v) => !(Number.isFinite(v) && Math.abs(v) <= 4)));
        expect(bad.map((seg) => seg.name)).toEqual([]);
      }
    }
  });

  it('accounts for every card: the unseen pool is exactly the deck plus unseen hands', () => {
    for (const s of STATES) {
      if (s.subPhase !== 'selecting' && s.subPhase !== 'resolving') continue;
      for (const p of s.players) {
        const obs = observe(s, p.id);
        const x = encodeObservation(obs);
        const othersDrawn = (s.resolution?.steps ?? [])
          .reduce((n, st) => n + (st.type === 'menu' && st.playerId !== p.id && st.drawn ? st.drawn.length : 0), 0);
        const unknownHands = obs.players.slice(1).reduce((n, q) => n + (q.knownHand ? 0 : q.handSize), 0);
        expect(segment(x, 'unseen.total')[0] * 60).toBeCloseTo(s.deck.length + unknownHands + othersDrawn, 3);
        expect(Math.min(...segment(x, 'unseen.faces'))).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('marginals are the exact score change of one more card', () => {
    const at = (x: Float32Array, kind: SushiGoCardKind, variant?: string) =>
      segment(x, 'me.marginal')[faceIndex({ kind, variant })] * 5;
    const x = encodeObservation(obsWith([card('tempura'), card('wasabi')], [card('nigiri', 'egg')]));
    expect(at(x, 'tempura')).toBeCloseTo(5);
    expect(at(x, 'nigiri', 'squid')).toBeCloseTo(9); // onto the open wasabi
    expect(at(x, 'nigiri', 'egg')).toBeCloseTo(3);
    expect(at(x, 'misoSoup')).toBeCloseTo(3);
    expect(at(x, 'mizuOnigiri', 'circle')).toBeCloseTo(1);
    // Not on this menu: left at 0.
    expect(at(x, 'maki', '3')).toBe(0);
    expect(segment(x, 'me.openWasabi')[0]).toBeCloseTo(1 / 3);
  });

  it('flip gains count the 2 a flipped card scores, against what it was worth', () => {
    const x = encodeObservation(obsWith([card('tempura'), card('nigiri', 'squid')], []));
    const gain = segment(x, 'me.flipGain');
    expect(gain[faceIndex({ kind: 'tempura' })] * 5).toBeCloseTo(2); // a lone tempura scores 0
    expect(gain[faceIndex({ kind: 'nigiri', variant: 'squid' })] * 5).toBeCloseTo(-1); // 3 → 2
  });

  it('left and right are the same opponent at 2 players and different seats at 3+', () => {
    const two = STATES.find((s) => s.players.length === 2 && s.subPhase === 'selecting' && s.players[1].table.length > 0)!;
    const x2 = encodeObservation(observe(two, 'p0'));
    expect(Array.from(segment(x2, 'left.table'))).toEqual(Array.from(segment(x2, 'right.table')));
    const three = STATES.find((s) => s.players.length === 3 && s.subPhase === 'selecting'
      && s.players[1].table.length > 0 && JSON.stringify(s.players[1].table.map((c) => c.kind)) !== JSON.stringify(s.players[2].table.map((c) => c.kind)))!;
    const x3 = encodeObservation(observe(three, 'p0'));
    expect(Array.from(segment(x3, 'left.table'))).not.toEqual(Array.from(segment(x3, 'right.table')));
  });
});
