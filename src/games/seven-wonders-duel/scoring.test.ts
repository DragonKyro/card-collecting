// 7 Wonders Duel — civilian scoring.

import { describe, it, expect } from 'vitest';
import { civilianWinner, scoreMatch } from './scoring';
import { giveCard, startedMatch } from './testSupport';

describe('Duel scoring', () => {
  it('scores printed VP by colour — green cards by their VP, not symbol sets', () => {
    const s = startedMatch();
    giveCard(s, 0, 'Theater', 'Temple', 'Palace');            // 3 + 4 + 7
    giveCard(s, 0, 'Workshop', 'Laboratory', 'Academy');      // 1 + 1 + 3 (a plumb pair)
    giveCard(s, 0, 'Port', 'Tavern');                         // 3 + 0
    const [row] = scoreMatch(s);
    expect(row.civilian).toBe(14);
    expect(row.science).toBe(5);
    expect(row.commercial).toBe(3);
  });

  it('counts a guild in the city with the most of its kind', () => {
    const s = startedMatch();
    giveCard(s, 0, 'Magistrates Guild', 'Theater');
    giveCard(s, 1, 'Altar', 'Baths', 'Temple');
    expect(scoreMatch(s)[0].guild).toBe(3);
    giveCard(s, 0, 'Moneylenders Guild');
    s.players[0].coins = 4;
    s.players[1].coins = 13;
    expect(scoreMatch(s)[0].guild).toBe(3 + 4);
    giveCard(s, 1, 'Builders Guild');
    s.players[0].wonders[0].built = true;
    s.players[0].wonders[1].built = true;
    expect(scoreMatch(s)[1].guild).toBe(4);
  });

  it('scores wonders, progress tokens, treasury and military', () => {
    const s = startedMatch();
    s.players[0].wonders[0].built = true; // Pyramids, 9
    s.players[0].progressTokens = ['mathematics', 'philosophy', 'agriculture'];
    s.players[0].coins = 11;
    s.militaryPawn = 4;
    const [row, opp] = scoreMatch(s);
    expect(row.wonders).toBe(9);
    expect(row.progress).toBe(9 + 7 + 4);
    expect(row.treasury).toBe(3);
    expect(row.military).toBe(5);
    expect(opp.military).toBe(0);
    expect(row.total).toBe(9 + 20 + 3 + 5);
  });

  it('gives military VP by zone', () => {
    const s = startedMatch();
    const at = (pawn: number) => { s.militaryPawn = pawn; return scoreMatch(s).map((r) => r.military); };
    expect(at(0)).toEqual([0, 0]);
    expect(at(2)).toEqual([2, 0]);
    expect(at(-3)).toEqual([0, 5]);
    expect(at(8)).toEqual([10, 0]);
  });

  it('breaks a tie on civilian VP, then shares it', () => {
    const s = startedMatch();
    giveCard(s, 0, 'Theater');             // 3 civilian
    s.players[1].wonders[3].built = true;  // Great Library, 4
    s.players[0].coins = 3;                // +1 → 4 each
    s.players[1].coins = 0;
    const rows = scoreMatch(s);
    expect(rows[0].total).toBe(rows[1].total);
    expect(civilianWinner(rows)).toBe(0);
    giveCard(s, 1, 'Altar');
    s.players[0].coins = 12;               // 3 + 4 = 7 vs 4 + 3 = 7, civilian 3 vs 3
    expect(civilianWinner(scoreMatch(s))).toBeNull();
  });
});
