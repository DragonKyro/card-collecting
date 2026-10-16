// Game-agnostic runtime for small dense networks exported by the trainers
// under training/. Plain loops over Float32Arrays — the policies are a few
// hundred thousand weights, so a forward pass is well under a millisecond
// and no ML library (or its bundle weight) is needed. Inputs are mostly
// zeros (game observations are one-hots and counts; hidden layers are ReLU),
// so each layer sums over its non-zero inputs only — same terms, same order,
// same result as the dense sum.
//
// File format (`MLP_FORMAT`): JSON with layers applied in order, each
// `y = activation(W·x + b)`, W stored row-major [out][in] as base64 of
// little-endian float32 (the layout of a PyTorch nn.Linear weight). Games add
// their own fields (feature / action-space versions) next to these.

export const MLP_FORMAT = 'card-collecting/mlp@1';

export type Activation = 'relu' | 'tanh' | 'linear';

export interface DenseLayerJson {
  in: number;
  out: number;
  activation: Activation;
  /** base64 float32, length out × in, row-major. */
  weight: string;
  /** base64 float32, length out. */
  bias: string;
}

export interface MlpFile {
  format: string;
  inputDim: number;
  outputDim: number;
  layers: DenseLayerJson[];
}

interface Layer {
  inDim: number;
  outDim: number;
  activation: Activation;
  weight: Float32Array;
  bias: Float32Array;
  out: Float32Array;
  /** Scratch: indices of the non-zero inputs. */
  nonZero: Int32Array;
}

export class Mlp {
  readonly inputDim: number;
  readonly outputDim: number;
  private readonly layers: Layer[];

  constructor(file: MlpFile) {
    if (file.format !== MLP_FORMAT) throw new Error(`unsupported network format "${file.format}"`);
    if (!file.layers?.length) throw new Error('network has no layers');
    let dim = file.inputDim;
    this.layers = file.layers.map((l, i) => {
      if (l.in !== dim) throw new Error(`layer ${i} expects ${l.in} inputs, previous layer gives ${dim}`);
      const weight = decodeFloat32(l.weight);
      const bias = decodeFloat32(l.bias);
      if (weight.length !== l.in * l.out) throw new Error(`layer ${i} weight has ${weight.length} values, expected ${l.in * l.out}`);
      if (bias.length !== l.out) throw new Error(`layer ${i} bias has ${bias.length} values, expected ${l.out}`);
      dim = l.out;
      return {
        inDim: l.in, outDim: l.out, activation: l.activation, weight, bias,
        out: new Float32Array(l.out), nonZero: new Int32Array(l.in),
      };
    });
    if (dim !== file.outputDim) throw new Error(`network outputs ${dim} values, file says ${file.outputDim}`);
    this.inputDim = file.inputDim;
    this.outputDim = file.outputDim;
  }

  /** Run the network. The returned array is reused by the next call — copy it to keep it. */
  forward(x: ArrayLike<number>): Float32Array {
    if (x.length !== this.inputDim) throw new Error(`expected ${this.inputDim} inputs, got ${x.length}`);
    let input: ArrayLike<number> = x;
    for (const l of this.layers) {
      const { inDim, outDim, weight, bias, out, nonZero } = l;
      let n = 0;
      for (let i = 0; i < inDim; i++) if (input[i] !== 0) nonZero[n++] = i;
      const sparse = n < inDim * 0.6;
      for (let o = 0; o < outDim; o++) {
        let s = bias[o];
        const row = o * inDim;
        if (sparse) {
          for (let k = 0; k < n; k++) {
            const i = nonZero[k];
            s += weight[row + i] * input[i];
          }
        } else {
          for (let i = 0; i < inDim; i++) s += weight[row + i] * input[i];
        }
        out[o] = l.activation === 'relu' ? (s > 0 ? s : 0) : l.activation === 'tanh' ? Math.tanh(s) : s;
      }
      input = out;
    }
    return input as Float32Array;
  }
}

export function decodeFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length % 4 !== 0) throw new Error('float32 data length is not a multiple of 4');
  return new Float32Array(bytes.buffer);
}

export function encodeFloat32(values: ArrayLike<number>): string {
  const bytes = new Uint8Array(Float32Array.from(values).buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
