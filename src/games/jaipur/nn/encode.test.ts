import { describe, it, expect } from 'vitest';
import type { JaipurState } from '../types';
import { BONUS_VALUES, CARD_COUNTS, GOODS, TOKEN_VALUES } from '../cards';
import { sampleStates } from '../testSupport';
import { observe } from './observation';
import { ENCODER_VERSION, OBS_DIM, encodeObservation, featureLayout } from './encode';
import { SLOT_NAMES, decodeSlot, legalMask } from './actions';

function segment(x: Float32Array, name: string): Float32Array {
  const seg = featureLayout().find((s) => s.name === name);
  if (!seg) throw new Error(`no segment ${name}`);
  return x.subarray(seg.offset, seg.offset + seg.size);
}

const STATES: JaipurState[] = [
  ...sampleStates({ matches: 4, seed: 77, every: 2 }),
  ...sampleStates({ matches: 3, seed: 78, every: 2, players: 'heuristic' }),
];

describe('jaipur feature encoder', () => {
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

  it('matches the versioned size (bump ENCODER_VERSION when it changes)', () => {
    expect({ version: ENCODER_VERSION, dim: OBS_DIM }).toEqual({ version: 2, dim: 310 });
  });

  it('encodes the price ladders, unsold cards, expected deck and unseen bonus values exactly', () => {
    let checked = 0;
    for (const s of STATES) {
      if (s.phase !== 'playing') continue;
      for (const p of s.players) {
        const obs = observe(s, p.id);
        const x = encodeObservation(obs);
        GOODS.forEach((g) => {
          const ladder = Array.from(segment(x, `tokens.ladder.${g}`)).map((v) => Math.round(v * 7));
          expect(ladder).toEqual(TOKEN_VALUES[g].map((_, k) => s.tokens[g][k]?.value ?? 0));
          const unsold = CARD_COUNTS[g] - s.discard.filter((c) => c.type === g).length;
          expect(segment(x, 'cards.unsold')[GOODS.indexOf(g)]).toBeCloseTo(unsold / CARD_COUNTS[g], 5);
        });
        // The deck's expected make-up adds up to the deck, camels exactly.
        const deck = Array.from(segment(x, 'deck.expected')).map((v) => v * 10);
        expect(deck.reduce((a, b) => a + b, 0)).toBeCloseTo(s.deck.length, 3);
        expect(deck[6]).toBeCloseTo(s.deck.filter((c) => c.type === 'camel').length, 3);
        const odds = Array.from(segment(x, 'deck.nextOdds'));
        if (s.deck.length) expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);
        // Unseen bonus values = the printed piles minus the viewer's own tokens.
        for (const size of [3, 4, 5] as const) {
          const faces = [...new Set(BONUS_VALUES[size])].sort((a, b) => b - a);
          const got = Array.from(segment(x, `bonus.unseenValues.${size}`))
            .map((v, i) => Math.round(v * BONUS_VALUES[size].filter((b) => b === faces[i]).length));
          const own = p.bonusTokens.filter((t) => t.size === size).map((t) => t.value);
          expect(got).toEqual(faces.map((f) => BONUS_VALUES[size].filter((b) => b === f).length - own.filter((o) => o === f).length));
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('writes bounded, finite values for every sampled state, seat and draft', () => {
    expect(STATES.length).toBeGreaterThan(200);
    let drafts = 0;
    for (const s of STATES) {
      for (const p of s.players) {
        let obs = observe(s, p.id);
        for (let guard = 0; guard < 20; guard++) {
          const x = encodeObservation(obs);
          const bad = Array.from(x).findIndex((v) => !Number.isFinite(v) || Math.abs(v) > 2);
          expect(bad, bad === -1 ? '' : featureLayout().find((g) => bad >= g.offset && bad < g.offset + g.size)!.name).toBe(-1);
          if (!obs.decision) break;
          // Follow the first legal trade slot to cover the draft features.
          const mask = legalMask(obs);
          const legal = SLOT_NAMES.map((_, k) => k).filter((k) => mask[k]);
          const slot = legal.find((k) => /^(trade|give):/.test(SLOT_NAMES[k])) ?? legal[0];
          const d = decodeSlot(obs, slot);
          if (d.type !== 'draft') break;
          drafts++;
          obs = observe(s, p.id, { draft: d.draft });
        }
      }
    }
    expect(drafts).toBeGreaterThan(50);
  });

  it('marks the decision stage and the draft contents', () => {
    const s = STATES.find((x) => x.subPhase === 'turn' && x.phase === 'playing')!;
    const pid = s.activePlayerId!;
    const main = encodeObservation(observe(s, pid));
    expect(Array.from(segment(main, 'decision.stage'))).toEqual([1, 0, 0]);
    const draft = { take: { diamond: 1, gold: 1, silver: 0, cloth: 0, spice: 0, leather: 0 }, give: { diamond: 0, gold: 0, silver: 0, cloth: 0, spice: 0, leather: 0, camel: 1 }, stage: 'give' as const };
    const x = encodeObservation(observe(s, pid, { draft }));
    expect(Array.from(segment(x, 'decision.stage'))).toEqual([0, 0, 1]);
    expect(segment(x, 'draft.take')[0]).toBeCloseTo(0.2);
    expect(segment(x, 'draft.give')[6]).toBeCloseTo(0.2);
    expect(segment(x, 'draft.left')[0]).toBeCloseTo(0.2);
  });
});
