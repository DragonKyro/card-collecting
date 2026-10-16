import { describe, it, expect } from 'vitest';
import { observe } from './observation';
import { ENCODER_V2 } from './encodeV2';
import { sampleStates } from '../testSupport';

const { dim: OBS_DIM, encode: encodeObservation } = ENCODER_V2;
const featureLayout = () => ENCODER_V2.layout;

/** Name the segments holding out-of-range values, for a readable failure. */
function layoutNames(badValues: Float32Array, x: Float32Array): string[] {
  if (badValues.length === 0) return [];
  return featureLayout()
    .filter((seg) => x.subarray(seg.offset, seg.offset + seg.size).some((v) => !(Number.isFinite(v) && Math.abs(v) <= 4)))
    .map((seg) => seg.name);
}

describe('feature encoder v2 (frozen for the shipped policies)', () => {
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

  it('keeps its frozen size', () => {
    expect({ version: ENCODER_V2.version, dim: OBS_DIM }).toEqual({ version: 2, dim: 632 });
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
