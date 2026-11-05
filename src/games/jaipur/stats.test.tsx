import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRng, rngNext } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { JaipurState } from './types';
import { GOODS, HAND_DEAL, HAND_LIMIT } from './cards';
import { applyAction, createJaipurState } from './reducer';
import { actWithPolicy } from './nn/agent';
import { seatsFor } from './testSupport';
import { matchStats, saleSizeIndex } from './stats';
import { MatchStats } from './StatsPanel';

afterEach(cleanup);

/** A whole match where both seats play uniformly random legal moves. */
function randomMatch(seed: number, sealsToWin = 2): JaipurState {
  const rng = createRng(seed ^ 0x2545f491);
  const random = (_obs: unknown, mask: Uint8Array) => sampleLegal(mask, rngNext(rng));
  let s = createJaipurState({ sealsToWin }, seed, seatsFor());
  for (let step = 0; step < 5000 && s.phase === 'playing'; step++) {
    s = s.subPhase === 'roundEnd'
      ? applyAction(s, { type: 'nextRound' })
      : applyAction(s, actWithPolicy(s, s.activePlayerId!, random)!);
  }
  expect(s.phase).toBe('gameOver');
  return s;
}

const matches = [1, 2, 3, 4, 5, 6].map((seed) => randomMatch(seed, seed % 3 + 1));

describe('jaipur match stats', () => {
  it('tracks each round move by move and lands on the scored totals', () => {
    for (const s of matches) {
      const stats = matchStats(s);
      expect(stats.rounds.map((r) => r.round)).toEqual(s.roundHistory.map((r) => r.round));
      for (const track of stats.rounds) {
        for (const row of track.summary.perPlayer) {
          const id = row.playerId;
          for (const series of [track.rupees[id], track.herd[id], track.hand[id]]) {
            expect(series).toHaveLength(track.moves.length + 2);
          }
          expect(track.rupees[id].at(-1)).toBe(row.total);
          expect(track.herd[id].at(-1)).toBe(row.herd);
          expect(track.hand[id][0] + track.herd[id][0]).toBe(HAND_DEAL);
          for (const n of track.hand[id]) expect(n).toBeGreaterThanOrEqual(0);
          for (const n of track.hand[id]) expect(n).toBeLessThanOrEqual(HAND_LIMIT);
          for (const n of track.herd[id]) expect(n).toBeGreaterThanOrEqual(0);
          // Rupees never go down within a round.
          track.rupees[id].forEach((v, i) => { if (i > 0) expect(v).toBeGreaterThanOrEqual(track.rupees[id][i - 1]); });
        }
      }
      // The last round's hands are still on the table at game over.
      const last = stats.rounds.at(-1)!;
      for (const p of s.players) expect(last.hand[p.id].at(-1)).toBe(p.hand.length);
    }
  });

  it('adds up per player to what the rounds scored', () => {
    for (const s of matches) {
      const stats = matchStats(s);
      for (const p of stats.players) {
        const rows = s.roundHistory.map((r) => r.perPlayer.find((x) => x.playerId === p.playerId)!);
        const sold = rows.reduce((a, r) => a + r.goods + r.bonus, 0);
        expect(GOODS.reduce((a, g) => a + p.byGood[g].rupees, 0)).toBe(sold);
        expect(p.salesRupees).toBe(sold);
        expect(p.bonusRupees).toBe(rows.reduce((a, r) => a + r.bonus, 0));
        expect(p.bonusTokens).toBe(rows.reduce((a, r) => a + r.bonusCount, 0));
        expect(p.saleSizes.reduce((a, n) => a + n, 0)).toBe(p.moves.sell);
        expect(p.saleSizeRupees.reduce((a, n) => a + n, 0)).toBe(sold);
        expect(p.cardsSold).toBe(GOODS.reduce((a, g) => a + p.byGood[g].cards, 0));
        expect(p.camelTokens).toBe(rows.filter((r) => r.camel > 0).length);
        expect(p.roundsWon).toBe(s.players.find((x) => x.id === p.playerId)!.seals);
        const turns = s.log.filter((e) => 'playerId' in e && e.playerId === p.playerId).length;
        expect(p.moves.takeOne + p.moves.takeCamels + p.moves.exchange + p.moves.sell).toBe(turns);
      }
    }
  });

  it('buckets sales by size, five and up together', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(saleSizeIndex)).toEqual([0, 1, 2, 3, 4, 4, 4]);
  });

  it('renders every tab, as charts and as tables', () => {
    const s = matches[0];
    const view = render(<MatchStats state={s} />);
    const tabs = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Race', 'Round scores', 'Goods', 'Sale size', 'Moves']);
    for (const mode of ['Chart', 'Table']) {
      fireEvent.click(view.getByRole('button', { name: mode }));
      for (const tab of tabs) {
        fireEvent.click(tab);
        const panel = view.container.querySelector('[role="tabpanel"]')!;
        expect(panel.querySelector(mode === 'Chart' ? 'svg' : 'table')).not.toBeNull();
      }
    }
    // The race names each move in its table view.
    fireEvent.click(tabs[0]);
    expect(view.container.querySelector('[role="tabpanel"]')!.textContent).toMatch(/Turn 1 · P[01] (took|traded|sold)/);
  });
});
