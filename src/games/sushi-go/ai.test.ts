// Sushi Go! Party AI smoke + regression tests.

import { describe, it, expect } from 'vitest';
import { chooseAIAction } from './ai';
import { sushiGoModule } from './module';
import { applyAction } from './reducer';
import type { Seat } from '@/core/types';
import type { SushiGoState, SushiGoCardKind } from './types';
import { randomMenu } from './cards';
import { createRng, rngNext } from '@/core/rng';

function aiSeats(n = 3): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `p${i}`, name: `AI${i}`, color: '#888', isAI: true, isLocal: true });
  }
  return out;
}

function freshState(seed = 7, n = 3, menu?: SushiGoCardKind[]): SushiGoState {
  const config = { ...sushiGoModule.defaultConfig(aiSeats(n)), ...(menu ? { menu } : {}) };
  return sushiGoModule.createInitialState(config, seed, aiSeats(n));
}

function runFullAIGame(seed = 1, n = 3, menu?: SushiGoCardKind[], maxSteps = 5000): SushiGoState {
  let s = freshState(seed, n, menu);
  for (let i = 0; i < maxSteps && s.phase === 'playing'; i++) {
    // All-AI simultaneous: drive each player that hasn't picked yet.
    let advanced = false;
    if (s.subPhase === 'roundEnd' || s.subPhase === 'resolving') {
      // Round-end click-through, or the chooser of a special-card decision.
      const a = chooseAIAction(s, s.activePlayerId ?? s.players[0].id);
      if (a) {
        s = applyAction(s, a);
        advanced = true;
      }
    } else if (s.subPhase === 'selecting') {
      for (const p of s.players) {
        if (p.pendingPick !== null) continue;
        const a = chooseAIAction(s, p.id);
        if (!a) continue;
        s = applyAction(s, a);
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return s;
}

describe('Sushi Go! Party AI', () => {
  it('completes an end-to-end 3-player AI match', () => {
    const s = runFullAIGame(1, 3);
    expect(s.phase).toBe('gameOver');
    expect(s.finalScores).not.toBeNull();
  });

  it('completes an end-to-end 2-player AI match', () => {
    const s = runFullAIGame(2, 2);
    expect(s.phase).toBe('gameOver');
  });

  it('plays every special card through to the end', () => {
    const menus: [SushiGoCardKind[], number[]][] = [
      [['nigiri', 'uramaki', 'misoSoup', 'mizuOnigiri', 'eel', 'specialOrder', 'takeoutBox', 'fruit'], [2, 4, 6]],
      [['nigiri', 'temaki', 'edamame', 'tofu', 'misoSoup', 'spoon', 'menu', 'greenTeaIceCream'], [3, 5, 6]],
      [['nigiri', 'maki', 'tempura', 'sashimi', 'dumpling', 'chopsticks', 'spoon', 'pudding'], [3, 7, 8]],
      [['nigiri', 'uramaki', 'tempura', 'misoSoup', 'edamame', 'soySauce', 'tea', 'pudding'], [4, 8]],
      [['nigiri', 'maki', 'eel', 'tofu', 'sashimi', 'specialOrder', 'menu', 'fruit'], [2, 6]],
    ];
    for (const [menu, counts] of menus) {
      for (const n of counts) {
        for (const seed of [1, 2, 3]) {
          const s = runFullAIGame(seed, n, menu);
          expect(s.phase, `${menu.join(',')} @ ${n}p seed ${seed}`).toBe('gameOver');
        }
      }
    }
  });

  it('finishes random legal menus at every player count', () => {
    const rng = createRng(99);
    for (let n = 2; n <= 8; n++) {
      for (let i = 0; i < 8; i++) {
        const menu = randomMenu(n, () => rngNext(rng));
        const s = runFullAIGame(100 + i, n, menu);
        expect(s.phase, `${menu.join(',')} @ ${n}p`).toBe('gameOver');
      }
    }
  });

  it('never returns an illegal pick during selection', () => {
    // Run a few games with different seeds; an illegal pick throws on apply.
    expect(() => runFullAIGame(10, 3)).not.toThrow();
    expect(() => runFullAIGame(11, 4)).not.toThrow();
    expect(() => runFullAIGame(12, 5)).not.toThrow();
  });
});
