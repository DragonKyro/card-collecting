import { describe, it, expect } from 'vitest';
import { observe } from './observation';
import { ENCODER_VERSION, OBS_DIM, V2_OBS_DIM, encodeObservation, featureLayout, isPepperDecisionSegment } from './encode';
import { sampleStates } from '../testSupport';

/** Name the segments holding out-of-range values, for a readable failure. */
function layoutNames(badValues: Float32Array, x: Float32Array): string[] {
  if (badValues.length === 0) return [];
  return featureLayout()
    .filter((seg) => x.subarray(seg.offset, seg.offset + seg.size).some((v) => !(Number.isFinite(v) && Math.abs(v) <= 4)))
    .map((seg) => seg.name);
}

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

  it('matches the versioned size (bump ENCODER_VERSION when this changes)', () => {
    expect({ version: ENCODER_VERSION, dim: OBS_DIM }).toEqual({ version: 3, dim: 833 });
  });

  it('keeps the v2 inputs first; every input after them is zero without Pepper', () => {
    const first = featureLayout().find((seg) => seg.offset === V2_OBS_DIM)!;
    expect(first.name.startsWith('pepper')).toBe(true);
    expect(featureLayout().filter((seg) => seg.offset >= V2_OBS_DIM).every((seg) => seg.name.startsWith('pepper'))).toBe(true);
    for (const state of [
      ...sampleStates({ players: 2, extraSalt: true, matches: 3, seed: 81, every: 3 }),
      ...sampleStates({ players: 4, extraSalt: false, matches: 2, seed: 82, every: 4 }),
    ]) {
      for (const p of state.players) {
        expect(encodeObservation(observe(state, p.id)).subarray(V2_OBS_DIM).every((v) => v === 0)).toBe(true);
      }
    }
  });

  it('writes the pepperDecision inputs only in the Pepper decision subphases', () => {
    const decision = new Set(['awaitingRodeoTarget', 'awaitingRodeoSwap', 'awaitingPairSteal', 'awaitingAngelfishPick', 'awaitingEventChoice']);
    const segs = featureLayout().filter((seg) => isPepperDecisionSegment(seg.name));
    let seen = 0;
    for (const state of sampleStates({ players: 3, extraSalt: true, extraPepper: true, matches: 12, seed: 83 })) {
      for (const p of state.players) {
        const x = encodeObservation(observe(state, p.id));
        const used = segs.some((seg) => x.subarray(seg.offset, seg.offset + seg.size).some((v) => v !== 0));
        if (used) seen++;
        if (!decision.has(state.subPhase) || state.activePlayerId !== p.id) expect(used, state.subPhase).toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('produces bounded, finite, deterministic features across real states', () => {
    const states = [
      ...sampleStates({ players: 2, extraSalt: true, matches: 4, seed: 77, every: 3 }),
      ...sampleStates({ players: 2, extraSalt: false, matches: 2, seed: 78, every: 3 }),
      ...sampleStates({ players: 4, extraSalt: true, extraPepper: true, matches: 2, seed: 79, every: 5 }),
    ];
    const buf = new Float32Array(OBS_DIM);
    for (const state of states) {
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
});
