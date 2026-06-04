import { describe, it, expect } from 'vitest';
import { chooseAIAction } from './ai';
import { seaSaltPaperModule } from './module';
import { applyAction } from './reducer';
import type { Seat } from '@/core/types';
import type { SspState, SspAction } from './types';

function aiSeats(): Seat[] {
  return [
    { id: 'a', name: 'AI-A', color: '#fff', isAI: true, isLocal: true },
    { id: 'b', name: 'AI-B', color: '#ccc', isAI: true, isLocal: true },
  ];
}

function freshAIState(seed = 7): SspState {
  return seaSaltPaperModule.createInitialState({ targetScore: 40 }, seed, aiSeats());
}

/** Run AI vs AI until game is over or a step ceiling is reached. */
function runAIGame(maxSteps = 2000): SspState {
  let s = freshAIState();
  let i = 0;
  while (i < maxSteps && s.phase === 'playing') {
    const playerId = s.subPhase === 'roundEnd' ? s.players[0].id : s.activePlayerId;
    if (!playerId) break;
    const action = chooseAIAction(s, playerId);
    if (!action) break;
    try {
      s = applyAction(s, action);
    } catch (e) {
      throw new Error(`AI tried an illegal action at step ${i}: ${(e as Error).message}\n${JSON.stringify(action)}`);
    }
    i++;
  }
  return s;
}

describe('AI driver', () => {
  it('completes an end-to-end game without throwing', () => {
    const s = runAIGame();
    expect(s.phase === 'gameOver' || s.round > 1).toBe(true);
  });

  it('produces legal actions for every subPhase reached during play', () => {
    // Just running the game already exercises legality (any illegal action throws).
    expect(() => runAIGame(500)).not.toThrow();
  });

  it('prefers drawing from a discard when it has higher marginal value', () => {
    let s = freshAIState();
    // Force a juicy discard top: shell, while deck is random.
    s.discards[0] = [{ id: 9001, family: 'shell', color: 'yellow' }];
    // Pretend we already have one shell, making a second very valuable.
    s.players[0].hand = [{ id: 9002, family: 'shell', color: 'green' }];
    const a = chooseAIAction(s, 'a') as SspAction | null;
    expect(a).not.toBeNull();
    expect(a!.type === 'drawFromDiscard').toBe(true);
  });

  it('plays a valid duo pair when one is in hand', () => {
    let s = freshAIState();
    // Drop straight into awaitingPlayOrEnd with a crab pair available.
    s.subPhase = 'awaitingPlayOrEnd';
    s.players[0].hand = [
      { id: 800, family: 'crab', color: 'yellow' },
      { id: 801, family: 'crab', color: 'pink' },
    ];
    const a = chooseAIAction(s, 'a') as SspAction | null;
    expect(a).not.toBeNull();
    expect(a!.type).toBe('playPair');
  });

  it('returns nextRound when at roundEnd', () => {
    let s = freshAIState();
    s.subPhase = 'roundEnd';
    s.lastRoundSummary = {
      round: 1,
      endedBy: 'stop',
      endedByPlayerId: 'a',
      lastChanceWon: null,
      perPlayer: [
        { playerId: 'a', cardPoints: 8, colorBonus: 1, total: 9, forfeitCards: false },
        { playerId: 'b', cardPoints: 4, colorBonus: 0, total: 4, forfeitCards: false },
      ],
    };
    const a = chooseAIAction(s, 'a') as SspAction | null;
    expect(a?.type).toBe('nextRound');
  });
});
