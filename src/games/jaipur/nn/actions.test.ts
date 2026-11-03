import { describe, it, expect } from 'vitest';
import type { JaipurAction, JaipurGood, JaipurState } from '../types';
import { CARD_TYPES, GOODS } from '../cards';
import { applyAction } from '../reducer';
import { countCards, emptyCounts, emptyGoodCounts, legalMoves, moveKey, type JaipurMove } from '../rules';
import { sampleStates } from '../testSupport';
import { observe, obsTradeContext, type JaipurDraft } from './observation';
import { ACTION_SPACE_VERSION, NUM_SLOTS, SLOT_NAMES, decodeSlot, legalMask } from './actions';

/** Every action reachable by legal slot sequences from this seat. */
function reachable(state: JaipurState, pid: string): JaipurAction[] {
  const out: JaipurAction[] = [];
  // Orderings of the same trade converge on the same draft: visit each once.
  const seen = new Set<string>();
  const walk = (draft: JaipurDraft | null) => {
    const key = JSON.stringify(draft);
    if (seen.has(key)) return;
    seen.add(key);
    const obs = observe(state, pid, { draft });
    const mask = legalMask(obs);
    expect(mask.some((m) => m === 1), `dead end at ${JSON.stringify(draft)}`).toBe(true);
    for (let s = 0; s < NUM_SLOTS; s++) {
      if (!mask[s]) continue;
      const d = decodeSlot(obs, s);
      if (d.type === 'draft') walk(d.draft);
      else if (!out.some((a) => JSON.stringify(a) === JSON.stringify(d))) out.push(d);
    }
  };
  walk(null);
  return out;
}

/** The type-level move a concrete action stands for. */
function moveOf(state: JaipurState, a: JaipurAction): JaipurMove {
  const p = state.players.find((x) => x.id === state.activePlayerId)!;
  const typeOf = (id: number) => [...state.market, ...p.hand, ...p.herd].find((c) => c.id === id)!.type;
  switch (a.type) {
    case 'takeOne': return { kind: 'takeOne', good: typeOf(a.cardId) as JaipurGood };
    case 'takeCamels': return { kind: 'takeCamels' };
    case 'sell': return { kind: 'sell', good: typeOf(a.cardIds[0]) as JaipurGood, count: a.cardIds.length };
    case 'exchange': {
      const take = emptyGoodCounts();
      const give = emptyCounts();
      for (const id of a.takeIds) take[typeOf(id) as JaipurGood]++;
      for (const id of a.giveIds) give[typeOf(id)]++;
      return { kind: 'exchange', take, give };
    }
    default: throw new Error(a.type);
  }
}

describe('jaipur action space', () => {
  it('has the versioned slot list (bump ACTION_SPACE_VERSION when it changes)', () => {
    expect({ version: ACTION_SPACE_VERSION, slots: NUM_SLOTS }).toEqual({ version: 1, slots: 63 });
    expect(new Set(SLOT_NAMES).size).toBe(NUM_SLOTS);
  });

  it('slot sequences reach exactly the legal moves, and the reducer accepts every one', () => {
    const states = [
      ...sampleStates({ matches: 3, seed: 31, every: 2 }),
      ...sampleStates({ matches: 2, seed: 32, every: 2, players: 'policy' }),
    ];
    const kinds = new Set<string>();
    let checked = 0;
    for (const state of states) {
      for (const p of state.players) {
        const obs = observe(state, p.id);
        if (!obs.decision) {
          expect(legalMask(obs).some((m) => m === 1)).toBe(false);
          continue;
        }
        const actions = reachable(state, p.id);
        const keys = new Set<string>();
        for (const a of actions) {
          expect(() => applyAction(state, a), `${a.type}`).not.toThrow();
          const m = moveOf(state, a);
          kinds.add(m.kind);
          keys.add(moveKey(m));
        }
        expect(keys).toEqual(new Set(legalMoves(obsTradeContext(obs)).map(moveKey)));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    for (const k of ['takeOne', 'takeCamels', 'exchange', 'sell']) expect(kinds).toContain(k);
  });

  it('an exchange draft names cards by type: taken from the market, given from hand and herd', () => {
    const states = sampleStates({ matches: 3, seed: 8 }).filter((s) => s.phase === 'playing' && s.subPhase === 'turn');
    let trades = 0;
    for (const state of states) {
      const pid = state.activePlayerId!;
      for (const a of reachable(state, pid)) {
        if (a.type !== 'exchange') continue;
        trades++;
        const p = state.players.find((x) => x.id === pid)!;
        expect(a.takeIds.every((id) => state.market.some((c) => c.id === id && c.type !== 'camel'))).toBe(true);
        expect(a.giveIds.every((id) => [...p.hand, ...p.herd].some((c) => c.id === id))).toBe(true);
        const market = countCards(state.market);
        for (const g of GOODS) expect(market[g]).toBeGreaterThanOrEqual(a.takeIds.filter((id) => state.market.find((c) => c.id === id)!.type === g).length);
      }
    }
    expect(trades).toBeGreaterThan(50);
    expect(CARD_TYPES).toHaveLength(7);
  });
});
