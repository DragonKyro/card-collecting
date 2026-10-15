import { describe, it, expect } from 'vitest';
import type { SspAction, SspState } from '../types';
import { applyAction } from '../reducer';
import { observe } from './observation';
import {
  ACTION_SPACE_VERSION, NUM_SLOTS, SLOT_NAMES, decodeSlot, legalMask, slotForAction,
} from './actions';
import { sampleStates } from '../testSupport';

function accepted(state: SspState, action: SspAction): boolean {
  try {
    applyAction(state, action);
    return true;
  } catch {
    return false;
  }
}

/** Every raw action worth asking the reducer about. Trios are only tried
 *  with a starfish in them — the reducer rejects any trio without one, and
 *  the full cube of hand triples is slow for no extra coverage. */
function candidateActions(state: SspState): SspAction[] {
  const out: SspAction[] = [
    { type: 'drawPair' },
    { type: 'drawFromDiscard', pile: 0 },
    { type: 'drawFromDiscard', pile: 1 },
    { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 },
    { type: 'keepFromDraw', keepIndex: 0, discardToPile: 1 },
    { type: 'keepFromDraw', keepIndex: 1, discardToPile: 0 },
    { type: 'keepFromDraw', keepIndex: 1, discardToPile: 1 },
    { type: 'stop' },
    { type: 'lastChance' },
    { type: 'pass' },
    { type: 'nextRound' },
  ];
  const me = state.players.find((p) => p.id === state.activePlayerId);
  const hand = me?.hand ?? [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      out.push({ type: 'playPair', cardIds: [hand[i].id, hand[j].id] });
      for (const star of hand) {
        if (star.family !== 'starfish' || star.id === hand[i].id || star.id === hand[j].id) continue;
        out.push({ type: 'playTrio', cardIds: [hand[i].id, hand[j].id, star.id] });
      }
    }
  }
  for (const pile of [0, 1] as const) {
    for (const c of state.discards[pile]) out.push({ type: 'crabPick', pile, cardId: c.id });
  }
  for (const p of state.players) out.push({ type: 'sharkSteal', targetPlayerId: p.id });
  for (const c of state.pendingLobsterPick ?? []) out.push({ type: 'lobsterPick', cardId: c.id });
  return out;
}

const CONFIGS = [
  { name: '2p base', players: 2, extraSalt: false, extraPepper: false, matches: 8 },
  { name: '2p Extra Salt', players: 2, extraSalt: true, extraPepper: false, matches: 16 },
  { name: '2p Salt + Pepper', players: 2, extraSalt: true, extraPepper: true, matches: 8 },
  { name: '3p Extra Salt', players: 3, extraSalt: true, extraPepper: false, matches: 4 },
];

describe('action slots', () => {
  it('has unique slot names', () => {
    expect(new Set(SLOT_NAMES).size).toBe(NUM_SLOTS);
  });

  it('matches the versioned layout (bump ACTION_SPACE_VERSION when this changes)', () => {
    expect({ version: ACTION_SPACE_VERSION, slots: NUM_SLOTS }).toEqual({ version: 2, slots: 66 });
  });

  const everLegal = new Set<string>();

  for (const cfg of CONFIGS) {
    it(`mask, decoder and inverse agree with the reducer (${cfg.name})`, () => {
      const states = sampleStates({ ...cfg, seed: 9001, every: 4 });
      for (const state of states) {
        const actor = state.subPhase === 'roundEnd' ? state.players[0].id : state.activePlayerId!;
        const obs = observe(state, actor);
        // Mid-crab there is a second view per pile: after choosing to look through it.
        const views = [obs];
        if (state.subPhase === 'awaitingCrabPick') {
          for (const pile of [0, 1] as const) {
            if (state.discards[pile].length) views.push(observe(state, actor, { crabLookPile: pile }));
          }
        }

        // Everything the reducer accepts is on masked-in slots — for a crab
        // pick, its pile slot first and then its card slot in that pile's view.
        for (const a of candidateActions(state)) {
          if (!accepted(state, a)) continue;
          const steps = [obs];
          if (a.type === 'crabPick') steps.push(observe(state, actor, { crabLookPile: a.pile }));
          for (const view of steps) {
            const s = slotForAction(view, a);
            expect(s, `${JSON.stringify(a)} in ${state.subPhase}`).toBeGreaterThanOrEqual(0);
            expect(legalMask(view)[s], `${SLOT_NAMES[s]} should be legal in ${state.subPhase}`).toBe(1);
          }
        }

        // Every masked-in slot decodes to something valid that maps back to it.
        for (const view of views) {
          const mask = legalMask(view);
          for (let s = 0; s < NUM_SLOTS; s++) {
            if (!mask[s]) continue;
            everLegal.add(SLOT_NAMES[s]);
            const d = decodeSlot(view, s);
            if (d.type === 'crabLook') {
              expect(state.discards[d.pile].length).toBeGreaterThan(0);
            } else {
              expect(accepted(state, d), `${SLOT_NAMES[s]} → ${JSON.stringify(d)} rejected`).toBe(true);
            }
            expect(slotForAction(view, d)).toBe(s);
          }
        }

        // Seats that aren't up have nothing to do (round-end aside).
        if (state.subPhase !== 'roundEnd') {
          for (const p of state.players) {
            if (p.id === actor) continue;
            expect(legalMask(observe(state, p.id)).every((m) => m === 0)).toBe(true);
          }
        }
      }
    });
  }

  it('the sampled states exercised every kind of decision', () => {
    const groups = [
      'drawPair', 'drawDiscard:', 'keep:', 'pair:crab+crab', 'pair:shark+swimmer',
      'pair:jellyfish+swimmer', 'pair:lobster+crab', 'trio:', 'stop', 'lastChance', 'pass',
      'crabPile:', 'crab:', 'steal:+1', 'steal:+2', 'lobster:', 'nextRound',
    ];
    const missing = groups.filter((g) => ![...everLegal].some((n) => n.startsWith(g)));
    expect(missing).toEqual([]);
  });
});
