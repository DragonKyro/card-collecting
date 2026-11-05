import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRng, rngNext } from '@/core/rng';
import { sampleLegal } from '@/ai/masked';
import type { SushiGoCardKind, SushiGoLogEntry, SushiGoState } from './types';
import { DEFAULT_MENU, handSize, validateMenu } from './cards';
import { sushiGoModule } from './module';
import { applyAction } from './reducer';
import { actWithPolicy } from './nn/agent';
import { seatsFor } from './testSupport';
import { matchStats, turnsOf } from './stats';
import { MatchStats } from './StatsPanel';

afterEach(cleanup);

/** Menus that bring every special card into play between them. */
const MENUS: SushiGoCardKind[][] = [
  DEFAULT_MENU,
  ['nigiri', 'uramaki', 'tempura', 'sashimi', 'misoSoup', 'wasabi', 'specialOrder', 'fruit'],
  ['nigiri', 'temaki', 'dumpling', 'eel', 'tofu', 'spoon', 'takeoutBox', 'greenTeaIceCream'],
  ['nigiri', 'maki', 'mizuOnigiri', 'edamame', 'tempura', 'menu', 'soySauce', 'pudding'],
  ['nigiri', 'maki', 'sashimi', 'eel', 'dumpling', 'tea', 'chopsticks', 'pudding'],
];

/** A whole match where every seat picks uniformly random legal slots. */
function randomMatch(players: number, menu: SushiGoCardKind[], seed: number): SushiGoState {
  const rng = createRng(seed ^ 0x5bd1e995);
  const random = (_obs: unknown, mask: Uint8Array) => sampleLegal(mask, rngNext(rng));
  let s = sushiGoModule.createInitialState({ menu: menu.slice(), rounds: 3 }, seed, seatsFor(players));
  for (let step = 0; step < 10000 && s.phase === 'playing'; step++) {
    if (s.subPhase === 'roundEnd') {
      s = applyAction(s, { type: 'nextRound' });
      continue;
    }
    const pid = s.subPhase === 'selecting' ? s.players.find((q) => q.pendingPick === null)!.id : s.activePlayerId!;
    s = applyAction(s, actWithPolicy(s, pid, random)!);
  }
  expect(s.phase).toBe('gameOver');
  return s;
}

const matches = MENUS.flatMap((menu, i) => [2, 4, 7]
  .filter((n) => validateMenu(menu, n).length === 0)
  .map((n) => randomMatch(n, menu, 100 + i * 10 + n)));

describe('sushi go match stats', () => {
  it('keeps every round in the history', () => {
    for (const s of matches) {
      expect(s.roundHistory.map((r) => r.round)).toEqual([1, 2, 3]);
      for (const p of s.players) {
        expect(s.roundHistory.map((r) => r.perPlayer.find((x) => x.playerId === p.id)!.total)).toEqual(p.scoreByRound);
      }
    }
  });

  it('adds the points up to the final score', () => {
    for (const s of matches) {
      const stats = matchStats(s);
      for (const p of stats.players) {
        expect(p.cumulative).toHaveLength(5);
        expect(p.cumulative.at(-1)).toBe(s.finalScores![p.playerId]);
        expect(p.final).toBe(s.finalScores![p.playerId]);
        const byKind = Object.values(p.pointsByKind).reduce((a, v) => a + (v ?? 0), 0);
        expect(byKind).toBe(s.finalScores![p.playerId]);
      }
    }
  });

  it('splits the log into one turn per card dealt, with every seat’s pick', () => {
    for (const s of matches) {
      const stats = matchStats(s);
      const n = s.players.length;
      for (const round of [1, 2, 3]) {
        const turns = stats.turns.filter((t) => t.round === round);
        expect(turns.map((t) => t.turn)).toEqual(Array.from({ length: handSize(n) }, (_, i) => i + 1));
        for (const t of turns) for (const p of s.players) expect(t.picks[p.id].length).toBeGreaterThanOrEqual(1);
      }
      for (const p of stats.players) {
        const taken = Object.values(p.takenByKind).reduce((a, v) => a + (v ?? 0), 0);
        const scoredAs = Object.values(p.scoredAsByKind).reduce((a, v) => a + (v ?? 0), 0);
        // A copy moves a card between kinds; it never adds or loses one.
        expect(scoredAs).toBe(taken);
        for (const v of Object.values(p.scoredAsByKind)) expect(v).toBeGreaterThanOrEqual(0);
        const picked = stats.turns.reduce((a, t) => a + t.picks[p.playerId].length, 0);
        expect(taken).toBeGreaterThanOrEqual(picked);
      }
    }
  });

  it('files what happens after a reveal under that turn', () => {
    const log: SushiGoLogEntry[] = [
      { seq: 1, round: 1, kind: 'pickSubmitted', playerId: 'a' },
      { seq: 2, round: 1, kind: 'pickSubmitted', playerId: 'b' },
      { seq: 3, round: 1, kind: 'pickRevealed', playerId: 'a', cards: [{ kind: 'menu', variant: '7' }] },
      { seq: 4, round: 1, kind: 'pickRevealed', playerId: 'b', cards: [{ kind: 'tempura' }, { kind: 'eel' }] },
      { seq: 5, round: 1, kind: 'menu', playerId: 'a', card: { kind: 'sashimi' } },
      { seq: 6, round: 1, kind: 'pickRevealed', playerId: 'a', cards: [{ kind: 'spoon', variant: '4' }] },
      { seq: 7, round: 1, kind: 'pickRevealed', playerId: 'b', cards: [{ kind: 'misoSoup' }] },
      { seq: 8, round: 1, kind: 'spoon', playerId: 'a', asked: { kind: 'tempura' }, fromId: 'b' },
      { seq: 9, round: 1, kind: 'roundEnd' },
      { seq: 10, round: 2, kind: 'pickRevealed', playerId: 'a', cards: [{ kind: 'eel' }] },
      { seq: 11, round: 2, kind: 'pickRevealed', playerId: 'b', cards: [{ kind: 'eel' }] },
      // A turn where nothing happened after the reveal: only the next picks separate it.
      { seq: 12, round: 2, kind: 'pickSubmitted', playerId: 'b' },
      { seq: 13, round: 2, kind: 'pickSubmitted', playerId: 'a' },
      { seq: 14, round: 2, kind: 'pickRevealed', playerId: 'a', cards: [{ kind: 'tofu' }] },
      { seq: 15, round: 2, kind: 'pickRevealed', playerId: 'b', cards: [{ kind: 'tofu' }] },
    ];
    const turns = turnsOf(log, ['a', 'b']);
    expect(turns.map((t) => [t.round, t.turn])).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(turns[3].picks).toEqual({ a: [{ kind: 'tofu' }], b: [{ kind: 'tofu' }] });
    expect(turns[0].picks.b).toEqual([{ kind: 'tempura' }, { kind: 'eel' }]);
    expect(turns[0].events.a).toEqual([{ type: 'menu', card: { kind: 'sashimi' } }]);
    expect(turns[1].events.a).toEqual([{ type: 'spoon', asked: { kind: 'tempura' }, fromId: 'b' }]);
    expect(turns[1].events.b).toEqual([{ type: 'gaveSpoon', asked: { kind: 'tempura' }, toId: 'a' }]);
  });

  it('renders every tab, as charts and as tables', () => {
    const s = matches[0];
    const view = render(<MatchStats state={s} />);
    const tabs = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Score', 'Points by card', 'Cards taken', 'Picks']);
    for (const mode of ['Chart', 'Table']) {
      for (const tab of tabs.slice(0, 3)) {
        fireEvent.click(tab);
        fireEvent.click(view.getByRole('button', { name: mode }));
        const panel = view.container.querySelector('[role="tabpanel"]')!;
        expect(panel.querySelector(mode === 'Chart' ? 'svg' : 'table')).not.toBeNull();
      }
    }
    // The pick timeline is a table either way, one row per turn plus the round score.
    fireEvent.click(tabs[3]);
    expect(view.queryByRole('button', { name: 'Table' })).toBeNull();
    const rows = view.container.querySelectorAll('.sgp-picks tbody tr');
    expect(rows).toHaveLength(handSize(s.players.length) + 1);
    expect(view.container.querySelectorAll('.sgp-chip').length).toBeGreaterThanOrEqual(handSize(s.players.length) * s.players.length);
  });
});
