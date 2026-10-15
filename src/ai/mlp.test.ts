import { describe, it, expect } from 'vitest';
import { MLP_FORMAT, Mlp, decodeFloat32, encodeFloat32, type MlpFile } from './mlp';

/** 3 → 2 (relu) → 2 (linear), small enough to check by hand. */
const FILE: MlpFile = {
  format: MLP_FORMAT,
  inputDim: 3,
  outputDim: 2,
  layers: [
    { in: 3, out: 2, activation: 'relu', weight: encodeFloat32([1, 0, -1, 0.5, 0.5, 0.5]), bias: encodeFloat32([0, -1]) },
    { in: 2, out: 2, activation: 'linear', weight: encodeFloat32([2, 0, -1, 1]), bias: encodeFloat32([0.25, 0]) },
  ],
};

describe('Mlp', () => {
  it('round-trips float32 through base64', () => {
    const v = [0, 1.5, -2.25, 3.4028234663852886e38, 1e-7];
    expect(Array.from(decodeFloat32(encodeFloat32(v)))).toEqual(Array.from(Float32Array.from(v)));
  });

  it('computes W·x + b with row-major weights and activations', () => {
    const net = new Mlp(FILE);
    // hidden = relu([1·1 + 0·2 − 1·3, 0.5·(1+2+3) − 1]) = relu([−2, 2]) = [0, 2]
    // out = [2·0 + 0·2 + 0.25, −1·0 + 1·2] = [0.25, 2]
    expect(Array.from(net.forward([1, 2, 3]))).toEqual([0.25, 2]);
  });

  it('rejects malformed files', () => {
    expect(() => new Mlp({ ...FILE, format: 'other' })).toThrow(/format/);
    expect(() => new Mlp({ ...FILE, outputDim: 5 })).toThrow(/outputs 2/);
    expect(() => new Mlp({ ...FILE, layers: [{ ...FILE.layers[0], in: 4 }, FILE.layers[1]] })).toThrow(/expects 4/);
    expect(() => new Mlp(FILE).forward([1, 2])).toThrow(/expected 3/);
  });
});
