import { describe, it, expect } from 'vitest';
import type { JaipurCardType } from './types';
import { CARD_TYPES, GOODS } from './cards';
import {
  addGive, addTake, canCompleteTrade, canGive, canTakeMore, emptyCounts, emptyDraft, isCompleteTrade, legalMoves,
  moveKey, type TradeContext,
} from './rules';

function ctx(market: Partial<Record<JaipurCardType, number>>, hand: Partial<Record<JaipurCardType, number>>, herd: number): TradeContext {
  return { market: { ...emptyCounts(), ...market }, hand: { ...emptyCounts(), ...hand }, herd };
}

/** Brute force: every multiset take/give pair, checked straight from the rules. */
function bruteForceTrades(c: TradeContext): Set<string> {
  const out = new Set<string>();
  const handSize = GOODS.reduce((s, g) => s + c.hand[g], 0);
  const takes: Array<Record<string, number>> = [{}];
  for (const g of GOODS) {
    const next: Array<Record<string, number>> = [];
    for (const t of takes) for (let n = 0; n <= c.market[g]; n++) next.push({ ...t, [g]: n });
    takes.splice(0, takes.length, ...next);
  }
  for (const take of takes) {
    const t = GOODS.reduce((s, g) => s + (take[g] ?? 0), 0);
    if (t < 2) continue;
    let gives: Array<Record<string, number>> = [{}];
    for (const x of CARD_TYPES) {
      const have = x === 'camel' ? c.herd : (take[x] ? 0 : c.hand[x]);
      const next: Array<Record<string, number>> = [];
      for (const gv of gives) for (let n = 0; n <= have; n++) next.push({ ...gv, [x]: n });
      gives = next;
    }
    for (const give of gives) {
      const total = CARD_TYPES.reduce((s, x) => s + (give[x] ?? 0), 0);
      const goodsGiven = GOODS.reduce((s, g) => s + (give[g] ?? 0), 0);
      if (total !== t || handSize + t - goodsGiven > 7) continue;
      out.add(moveKey({
        kind: 'exchange',
        take: Object.fromEntries(GOODS.map((g) => [g, take[g] ?? 0])) as never,
        give: Object.fromEntries(CARD_TYPES.map((x) => [x, give[x] ?? 0])) as never,
      }));
    }
  }
  return out;
}

const CASES: TradeContext[] = [
  ctx({ diamond: 2, leather: 2, camel: 1 }, { leather: 1, gold: 1 }, 2),
  ctx({ cloth: 3, spice: 2 }, { cloth: 6 }, 1),
  ctx({ silver: 1, gold: 1, diamond: 1, camel: 2 }, { leather: 7 }, 0),
  ctx({ silver: 1, gold: 1, spice: 3 }, {}, 4),
  ctx({ leather: 5 }, { leather: 3, spice: 2 }, 0),
  ctx({ diamond: 1, gold: 1, silver: 1, cloth: 1, spice: 1 }, { leather: 4, cloth: 1 }, 5),
  ctx({ diamond: 3, camel: 2 }, { gold: 6 }, 11),
];

describe('trade legality', () => {
  it('legalMoves lists exactly the trades the rules allow', () => {
    for (const c of CASES) {
      const listed = legalMoves(c).filter((m) => m.kind === 'exchange').map(moveKey);
      expect(new Set(listed).size).toBe(listed.length);
      expect(new Set(listed)).toEqual(bruteForceTrades(c));
    }
  });

  it('building a trade card by card reaches every legal trade and never dead-ends', () => {
    for (const c of CASES) {
      const reached = new Set<string>();
      const walk = (d: ReturnType<typeof emptyDraft>, giving: boolean) => {
        expect(canCompleteTrade(c, d)).toBe(true);
        let moved = false;
        if (!giving) {
          for (const g of GOODS) if (canTakeMore(c, d, g)) { moved = true; walk(addTake(d, g), false); }
          if (GOODS.reduce((s, g) => s + d.take[g], 0) >= 2) { moved = true; walk(d, true); }
        } else if (isCompleteTrade(c, d)) {
          reached.add(moveKey({ kind: 'exchange', take: d.take, give: d.give }));
          moved = true;
        } else {
          for (const x of CARD_TYPES) if (canGive(c, d, x)) { moved = true; walk(addGive(d, x), true); }
        }
        expect(moved).toBe(true);
      };
      const start = emptyDraft();
      for (const g of GOODS) if (canTakeMore(c, start, g)) walk(addTake(start, g), false);
      expect(reached).toEqual(bruteForceTrades(c));
    }
  });

  it('a full hand with no camels can only trade goods for goods', () => {
    const c = ctx({ diamond: 2, camel: 3 }, { leather: 7 }, 0);
    const trades = legalMoves(c).filter((m) => m.kind === 'exchange');
    expect(trades.map(moveKey)).toEqual(['trade:diamond2>leather2']);
    expect(legalMoves(c).some((m) => m.kind === 'takeOne')).toBe(false);
  });
});
