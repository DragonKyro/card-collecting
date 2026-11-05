import { describe, it, expect } from 'vitest';
import type { SspAction, SspState } from '../types';
import { applyAction } from '../reducer';
import { tablePairs } from '../scoring';
import { observe, type ObserveOptions, type SspObservation } from './observation';
import {
  ACTION_SPACE_VERSION, NUM_SLOTS, SLOT_NAMES, V2_NUM_SLOTS, decodeSlot, legalMask, slotForAction,
} from './actions';
import { nextStep } from './agent';
import { createSspState } from '../setup';
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
    { type: 'angelfishPick', pile: 0 },
    { type: 'angelfishPick', pile: 1 },
    { type: 'rodeoSwap', swap: null },
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
  for (const c of hand) out.push({ type: 'placeCoralShell', cardId: c.id });
  for (const pile of [0, 1] as const) {
    for (const c of state.discards[pile]) out.push({ type: 'crabPick', pile, cardId: c.id });
  }
  for (const p of state.players) {
    out.push({ type: 'sharkSteal', targetPlayerId: p.id }, { type: 'rodeoLook', targetPlayerId: p.id });
    for (const [a, b] of tablePairs(p.table, p.trios)) out.push({ type: 'stealPair', targetPlayerId: p.id, cardIds: [a.id, b.id] });
  }
  const target = state.players.find((p) => p.id === state.pendingRodeo?.targetId);
  for (const mine of hand) for (const theirs of target?.hand ?? []) out.push({ type: 'rodeoSwap', swap: [mine.id, theirs.id] });
  for (const c of state.pendingLobsterPick ?? []) out.push({ type: 'lobsterPick', cardId: c.id });
  const choice = state.pendingEventChoice;
  if (choice) out.push({ type: 'chooseEvent', keep: choice.newEventId }, { type: 'chooseEvent', keep: choice.oldEventId });
  return out;
}

/** The observations a decision is made from: the first step, then (for a
 *  two-step decision) the view after its first half. */
function stepsFor(state: SspState, actor: string, a: SspAction): SspObservation[] {
  const views = [observe(state, actor)];
  if (a.type === 'crabPick') views.push(observe(state, actor, { crabLookPile: a.pile }));
  if (a.type === 'rodeoSwap' && a.swap) {
    const theirs = views[0].rodeoLook?.hand.find((c) => c.id === a.swap![1]);
    if (theirs) views.push(observe(state, actor, { rodeoTake: theirs.family }));
  }
  return views;
}

/** Every view the policy can be asked in: the plain one plus each second step. */
function allViews(state: SspState, actor: string): SspObservation[] {
  const obs = observe(state, actor);
  const steps: ObserveOptions[] = [];
  if (state.subPhase === 'awaitingCrabPick') {
    for (const pile of [0, 1] as const) if (state.discards[pile].length) steps.push({ crabLookPile: pile });
  }
  for (const c of obs.rodeoLook?.hand ?? []) steps.push({ rodeoTake: c.family });
  return [obs, ...steps.map((o) => observe(state, actor, o))];
}

const CONFIGS = [
  { name: '2p base', players: 2, extraSalt: false, extraPepper: false, matches: 8 },
  { name: '2p Extra Salt', players: 2, extraSalt: true, extraPepper: false, matches: 16 },
  { name: '2p Salt + Pepper', players: 2, extraSalt: true, extraPepper: true, matches: 24 },
  { name: '3p Extra Salt', players: 3, extraSalt: true, extraPepper: false, matches: 4 },
  { name: '4p Salt + Pepper', players: 4, extraSalt: true, extraPepper: true, matches: 8 },
];

describe('action slots', () => {
  it('has unique slot names', () => {
    expect(new Set(SLOT_NAMES).size).toBe(NUM_SLOTS);
  });

  it('matches the versioned layout (bump ACTION_SPACE_VERSION when this changes)', () => {
    expect({ version: ACTION_SPACE_VERSION, slots: NUM_SLOTS }).toEqual({ version: 3, slots: 141 });
  });

  it('keeps every v2 slot in place, with the Pepper slots after them', () => {
    expect(SLOT_NAMES.slice(0, V2_NUM_SLOTS).at(-1)).toBe('nextRound');
    expect(SLOT_NAMES[V2_NUM_SLOTS]).toBe('pair:swimmer+swimmer');
  });

  const everLegal = new Set<string>();

  for (const cfg of CONFIGS) {
    it(`mask, decoder and inverse agree with the reducer (${cfg.name})`, () => {
      const states = sampleStates({ ...cfg, seed: 9001, every: 4 });
      for (const state of states) {
        const actor = state.subPhase === 'roundEnd' ? state.players[0].id : state.activePlayerId!;

        // Everything the reducer accepts is on masked-in slots — for a
        // two-step decision, its first slot and then its second in that view.
        for (const a of candidateActions(state)) {
          if (!accepted(state, a)) continue;
          for (const view of stepsFor(state, actor, a)) {
            const s = slotForAction(view, a);
            expect(s, `${JSON.stringify(a)} in ${state.subPhase}`).toBeGreaterThanOrEqual(0);
            expect(legalMask(view)[s], `${SLOT_NAMES[s]} should be legal in ${state.subPhase}`).toBe(1);
          }
        }

        // Every masked-in slot decodes to something valid that maps back to it.
        for (const view of allViews(state, actor)) {
          const mask = legalMask(view);
          for (let s = 0; s < NUM_SLOTS; s++) {
            if (!mask[s]) continue;
            everLegal.add(SLOT_NAMES[s]);
            const d = decodeSlot(view, s);
            const step = nextStep(d);
            if (d.type === 'crabLook') {
              expect(state.discards[d.pile].length).toBeGreaterThan(0);
            } else if (d.type === 'rodeoTake') {
              expect(view.rodeoLook?.hand.some((c) => c.family === d.family)).toBe(true);
            } else {
              expect(step).toBeNull();
              expect(accepted(state, d as SspAction), `${SLOT_NAMES[s]} → ${JSON.stringify(d)} rejected`).toBe(true);
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
      'pair:swimmer+swimmer', 'pair:shark+shark', 'coral:place', 'rodeoLook:', 'rodeoTake:', 'rodeoSwap:none',
      'rodeoGive:', 'angelfish:', 'event:keepNew',
    ]; // (pairSteal: random play almost never gets there — see the test below)
    const missing = groups.filter((g) => ![...everLegal].some((n) => n.startsWith(g)));
    expect(missing).toEqual([]);
  });

  it('a Water Rodeo shark pair can take any pair in front of an opponent who is not immune', () => {
    const card = (id: number, family: 'crab' | 'boat' | 'fish' | 'shark' | 'shell') => ({ id, family, color: 'yellow' as const });
    let s = createSspState({ targetScore: 40, expansions: { extraSalt: true, extraPepper: true } }, 5, seatsFor(3));
    s.event!.current = 'waterRodeo';
    s.players[1].table = [card(10, 'crab'), card(11, 'crab'), card(12, 'boat'), card(13, 'boat')];
    s.players[2].table = [card(20, 'fish'), card(21, 'fish')];
    s.players[2].coralShell = card(22, 'shell');
    s.players[0].hand = [card(1, 'shark'), card(2, 'shark')];
    s.activePlayerId = 'p0';
    s.subPhase = 'awaitingPlayOrEnd';
    s = applyAction(s, decodeSlot(observe(s, 'p0'), SLOT_NAMES.indexOf('pair:shark+shark')) as SspAction);
    expect(s.subPhase).toBe('awaitingPairSteal');
    const obs = observe(s, 'p0');
    const mask = legalMask(obs);
    const legal = SLOT_NAMES.filter((_, i) => mask[i]);
    expect(legal).toEqual(['pairSteal:+1:crab+crab', 'pairSteal:+1:boat+boat']);
    for (const name of legal) {
      const d = decodeSlot(obs, SLOT_NAMES.indexOf(name)) as SspAction;
      expect(accepted(s, d)).toBe(true);
      expect(slotForAction(obs, d)).toBe(SLOT_NAMES.indexOf(name));
    }
  });
});
