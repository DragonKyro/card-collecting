import { describe, it, expect } from 'vitest';
import type { SspAction, SspCard, SspState } from '../types';
import { applyAction } from '../reducer';
import { createSspState } from '../setup';
import { observe } from './observation';
import {
  ACTION_SPACE_VERSION, NUM_SLOTS, SLOT_CRAB_PICK, SLOT_CRAB_TOP, SLOT_LOBSTER_PICK, SLOT_NAMES,
  SLOT_PLAY_PAIR, SSP_ACTIONS, decodeSlot, legalMask, type SspActionSpace,
} from './actions';
import { ACTIONS_V2 } from './actionsV2';
import { kindIndex } from './kinds';
import { DUO_PAIRS } from '../cards';
import { sampleStates, seatsFor } from '../testSupport';

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

const COMMON_GROUPS = [
  'drawPair', 'drawDiscard:', 'keep:', 'pair:crab+crab', 'pair:shark+swimmer',
  'pair:jellyfish+swimmer', 'pair:lobster+crab', 'trio:', 'stop', 'lastChance', 'pass',
  'crabPile:', 'crab:', 'steal:+1', 'steal:+2', 'lobster:', 'nextRound',
];

const SPACES: Array<{ space: SspActionSpace; pin: { version: number; slots: number }; groups: string[] }> = [
  { space: SSP_ACTIONS, pin: { version: 3, slots: 137 }, groups: [...COMMON_GROUPS, 'crab:top'] },
  // Frozen for the shipped policies — its pin must never change.
  { space: ACTIONS_V2, pin: { version: 2, slots: 66 }, groups: COMMON_GROUPS },
];

for (const { space, pin, groups } of SPACES) {
  describe(`action slots v${space.version}`, () => {
    it('has unique slot names', () => {
      expect(new Set(space.slotNames).size).toBe(space.numSlots);
    });

    it('matches the versioned layout (bump ACTION_SPACE_VERSION when this changes)', () => {
      expect({ version: space.version, slots: space.numSlots }).toEqual(pin);
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
              const s = space.slotForAction(view, a);
              expect(s, `${JSON.stringify(a)} in ${state.subPhase}`).toBeGreaterThanOrEqual(0);
              expect(space.legalMask(view)[s], `${space.slotNames[s]} should be legal in ${state.subPhase}`).toBe(1);
            }
          }

          // Every masked-in slot decodes to something valid that maps back to it.
          for (const view of views) {
            const mask = space.legalMask(view);
            for (let s = 0; s < space.numSlots; s++) {
              if (!mask[s]) continue;
              everLegal.add(space.slotNames[s]);
              const d = space.decodeSlot(view, s);
              if (d.type === 'crabLook') {
                expect(state.discards[d.pile].length).toBeGreaterThan(0);
              } else {
                expect(accepted(state, d), `${space.slotNames[s]} → ${JSON.stringify(d)} rejected`).toBe(true);
              }
              expect(space.slotForAction(view, d)).toBe(s);
            }
          }

          // Seats that aren't up have nothing to do (round-end aside).
          if (state.subPhase !== 'roundEnd') {
            for (const p of state.players) {
              if (p.id === actor) continue;
              expect(space.legalMask(observe(state, p.id)).every((m) => m === 0)).toBe(true);
            }
          }
        }
      });
    }

    it('the sampled states exercised every kind of decision', () => {
      const missing = groups.filter((g) => ![...everLegal].some((n) => n.startsWith(g)));
      expect(missing).toEqual([]);
    });
  });
}

describe('v3 slots choose the colour', () => {
  /** p0 takes a deck turn and passes, so p1 is up. */
  function p1ToAct(): SspState {
    let s = createSspState({ targetScore: 40 }, 5, seatsFor(2));
    s = applyAction(s, { type: 'drawPair' });
    s = applyAction(s, { type: 'keepFromDraw', keepIndex: 0, discardToPile: 0 });
    return applyAction(s, { type: 'pass' });
  }
  /** p1 plays a crab pair with pile 0 set to `pile` (bottom first), then looks through it. */
  function crabLookAt(pile: SspCard[]) {
    const s = p1ToAct();
    s.discards[0] = pile;
    s.players[1].hand.push({ id: 9001, family: 'crab', color: 'black' }, { id: 9002, family: 'crab', color: 'gray' });
    s.subPhase = 'awaitingPlayOrEnd';
    const crabbing = applyAction(s, { type: 'playPair', cardIds: [9001, 9002] });
    return { state: crabbing, view: observe(crabbing, 'p1', { crabLookPile: 0 }) };
  }
  const slotOf = (family: SspCard['family'], color: SspCard['color']) =>
    SLOT_CRAB_PICK[kindIndex({ id: -1, family, color })];

  it('offers each colour of a family in the pile as its own pick', () => {
    const { view } = crabLookAt([
      { id: 9101, family: 'crab', color: 'teal' },
      { id: 9102, family: 'mermaid', color: 'white' },
      { id: 9103, family: 'crab', color: 'yellow' },
    ]);
    const mask = legalMask(view);
    const legal = SLOT_NAMES.filter((_, s) => mask[s]);
    expect(legal.sort()).toEqual(['crab:crab/teal', 'crab:crab/yellow', 'crab:mermaid/white']);
    expect(decodeSlot(view, slotOf('crab', 'teal'))).toMatchObject({ cardId: 9101 });
    expect(decodeSlot(view, slotOf('crab', 'yellow'))).toMatchObject({ cardId: 9103 });
  });

  it('with a twin beneath the top, digs the twin by default and takes the top only via crab:top', () => {
    const { state, view } = crabLookAt([
      { id: 9101, family: 'mermaid', color: 'white' },
      { id: 9102, family: 'shell', color: 'teal' },
      { id: 9103, family: 'mermaid', color: 'white' },
    ]);
    const mask = legalMask(view);
    expect(mask[SLOT_CRAB_TOP]).toBe(1);
    const dig = decodeSlot(view, slotOf('mermaid', 'white'));
    const top = decodeSlot(view, SLOT_CRAB_TOP);
    expect(dig).toMatchObject({ type: 'crabPick', cardId: 9101 });
    expect(top).toMatchObject({ type: 'crabPick', cardId: 9103 });
    // Digging leaves the top in place; taking it exposes the shell.
    expect(applyAction(state, dig as SspAction).discards[0].at(-1)!.id).toBe(9103);
    expect(applyAction(state, top as SspAction).discards[0].at(-1)!.id).toBe(9102);
  });

  it('keeps the chosen colour from a lobster reveal', () => {
    const s = p1ToAct();
    s.subPhase = 'awaitingLobsterPick';
    s.pendingLobsterPick = [
      { id: 9201, family: 'octopus', color: 'teal' },
      { id: 9202, family: 'octopus', color: 'purple' },
      { id: 9203, family: 'fish', color: 'black' },
    ];
    const view = observe(s, 'p1');
    const purple = SLOT_LOBSTER_PICK[kindIndex({ id: -1, family: 'octopus', color: 'purple' })];
    expect(legalMask(view)[purple]).toBe(1);
    expect(decodeSlot(view, purple)).toEqual({ type: 'lobsterPick', cardId: 9202 });
  });

  it('plays the pair copies the opponent already knows about, keeping the others hidden', () => {
    let s = p1ToAct();
    s.discards[0].push({ id: 9301, family: 'crab', color: 'yellow' });
    s = applyAction(s, { type: 'drawFromDiscard', pile: 0 }); // public: p0 saw it
    s.players[1].hand.unshift({ id: 9302, family: 'crab', color: 'teal' }, { id: 9303, family: 'crab', color: 'darkblue' });
    const view = observe(s, 'p1');
    const crabPair = SLOT_PLAY_PAIR[DUO_PAIRS.findIndex(([a, b]) => a === 'crab' && b === 'crab')];
    const d = decodeSlot(view, crabPair);
    expect(d.type === 'playPair' && d.cardIds).toContain(9301);
  });
});

describe('current action space', () => {
  it('is the one the exports describe', () => {
    expect({ version: ACTION_SPACE_VERSION, slots: NUM_SLOTS }).toEqual({ version: SSP_ACTIONS.version, slots: SSP_ACTIONS.numSlots });
  });
});
