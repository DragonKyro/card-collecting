import { describe, it, expect } from 'vitest';
import type { SspCard } from '../types';
import { FAMILY_ORDER } from '../cards';
import { observe, type SspObservedPlayer } from './observation';
import { ENCODER_VERSION, OBS_DIM, _internals, encodeObservation, featureLayout } from './encode';
import { KINDS, kindIndex } from './kinds';
import { sampleStates } from '../testSupport';

/** Name the segments holding out-of-range values, for a readable failure. */
function layoutNames(badValues: Float32Array, x: Float32Array): string[] {
  if (badValues.length === 0) return [];
  return featureLayout()
    .filter((seg) => x.subarray(seg.offset, seg.offset + seg.size).some((v) => !(Number.isFinite(v) && Math.abs(v) <= 4)))
    .map((seg) => seg.name);
}

function segment(x: Float32Array, name: string): Float32Array {
  const seg = featureLayout().find((s) => s.name === name);
  if (!seg) throw new Error(`no segment ${name}`);
  return x.subarray(seg.offset, seg.offset + seg.size);
}

const STATES = [
  ...sampleStates({ players: 2, extraSalt: true, matches: 4, seed: 77, every: 3 }),
  ...sampleStates({ players: 2, extraSalt: false, matches: 2, seed: 78, every: 3 }),
  ...sampleStates({ players: 2, extraSalt: true, extraPepper: true, matches: 2, seed: 80, every: 3 }),
  ...sampleStates({ players: 4, extraSalt: true, extraPepper: true, matches: 2, seed: 79, every: 5 }),
];

describe('feature encoder', () => {
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

  it('matches the versioned size and kind list (bump ENCODER_VERSION when these change)', () => {
    expect({ version: ENCODER_VERSION, dim: OBS_DIM }).toEqual({ version: 3, dim: 2030 });
    const byFamily = Object.fromEntries(FAMILY_ORDER.map((f) => [f, KINDS.filter((k) => k.family === f).map((k) => k.color).join(' ')]));
    expect(byFamily).toEqual({
      mermaid: 'white',
      crab: 'darkblue teal black yellow green gray',
      boat: 'darkblue teal black yellow',
      fish: 'darkblue teal black yellow green',
      shark: 'darkblue teal black green purple',
      swimmer: 'darkblue teal black yellow tan',
      shell: 'darkblue teal black yellow green gray',
      octopus: 'teal yellow purple gray green',
      penguin: 'purple tan pink',
      sailor: 'pink orange',
      lighthouse: 'purple',
      shoal: 'gray',
      penguinColony: 'green',
      captain: 'tan',
      jellyfish: 'purple pink',
      lobster: 'black',
      starfish: 'darkblue teal yellow',
      seahorse: 'white',
      crabBasket: 'green',
    });
    expect(KINDS).toHaveLength(54);
  });

  it('produces bounded, finite, deterministic features across real states', () => {
    const buf = new Float32Array(OBS_DIM);
    for (const state of STATES) {
      for (const p of state.players) {
        const obs = observe(state, p.id);
        const x = encodeObservation(obs);
        expect(x.length).toBe(OBS_DIM);
        const bad = layoutNames(x.filter((v) => !(Number.isFinite(v) && Math.abs(v) <= 4)), x);
        expect(bad).toEqual([]);
        expect(encodeObservation(obs, buf)).toEqual(x);
      }
    }
  });

  it('per-kind values match rescoring each kind directly', () => {
    const { marginalTable, scoreOf } = _internals;
    let checked = 0;
    for (const state of STATES) {
      for (const p of state.players) {
        const obs = observe(state, p.id);
        for (const who of obs.players) {
          const cards = who === obs.players[0] ? [...obs.hand, ...who.table] : [...who.table, ...who.knownCards];
          const opts = optsOf(who);
          const table = marginalTable(cards, opts);
          const base = scoreOf(cards, opts);
          KINDS.forEach((k, i) => {
            const d = (scoreOf([...cards, { id: -1, family: k.family, color: k.color }], opts) - base) / 5;
            expect(table[i]).toBeCloseTo(Math.max(-4, Math.min(4, d)), 5);
          });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('shows each pile top-down: the card under the top is what taking the top exposes', () => {
    let checked = 0;
    for (const state of STATES) {
      const obs = observe(state, state.players[0].id);
      const x = encodeObservation(obs);
      obs.piles.forEach((pile, pi) => {
        if (pile.buried.length < 2 || pile.unknownRemovals > 0) return;
        const oneHot = (card: SspCard) => Array.from({ length: KINDS.length }, (_, k) => (k === kindIndex(card) ? 1 : 0));
        expect(Array.from(segment(x, `pile${pi}.top`))).toEqual(oneHot(pile.top!));
        expect(Array.from(segment(x, `pile${pi}.second`))).toEqual(oneHot(pile.buried[pile.buried.length - 1]));
        expect(Array.from(segment(x, `pile${pi}.third`))).toEqual(oneHot(pile.buried[pile.buried.length - 2]));
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(20);
  });
});

function optsOf(p: SspObservedPlayer) {
  return {
    trioCancelledIds: new Set(p.trios.flat()),
    trios: p.trios.length,
    shellPerCard: p.rules.shellPerCard,
    octopusPerCard: p.rules.octopusPerCard,
    mermaidsScoreZero: p.rules.mermaidsScoreZero,
  };
}
