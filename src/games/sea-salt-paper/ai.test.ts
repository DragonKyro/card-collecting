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

  it('discards to the pile that buries a top the opponent has been collecting', () => {
    // Setup: AI 'a' is at awaitingKeep with a drawn pair. Opponent 'b' has
    // visibly taken 3 shells from discards already (their knownTaken profile),
    // so the AI should AVOID discarding a card that helps shell-builders AND
    // prefer to BURY the pile whose top is a shell.
    let s = freshAIState();
    s.subPhase = 'awaitingKeep';
    s.activePlayerId = 'a';
    // Pile 0 top = shell (juicy for opponent b), pile 1 top = boat (less so).
    s.discards[0] = [{ id: 1001, family: 'shell', color: 'yellow' }];
    s.discards[1] = [{ id: 1002, family: 'boat', color: 'darkblue' }];
    // Pending draw: keep a shell, discard a sailor (which a shell-builder
    // doesn't directly want).
    s.pendingDraw = [
      { id: 2001, family: 'shell', color: 'pink' },
      { id: 2002, family: 'sailor', color: 'tan' },
    ];
    // Build opponent profile via log entries — 'b' grabbed 3 shells from
    // discards previously.
    s.log = [
      { seq: 1, round: 1, kind: 'drawDiscard', playerId: 'b', pile: 0, family: 'shell' },
      { seq: 2, round: 1, kind: 'drawDiscard', playerId: 'b', pile: 0, family: 'shell' },
      { seq: 3, round: 1, kind: 'drawDiscard', playerId: 'b', pile: 0, family: 'shell' },
    ];
    s.logSeq = 3;
    const a = chooseAIAction(s, 'a') as SspAction | null;
    expect(a).not.toBeNull();
    expect(a!.type).toBe('keepFromDraw');
    if (a && a.type === 'keepFromDraw') {
      // Should keep the shell (index 0).
      expect(a.keepIndex).toBe(0);
      // And bury the shell pile (pile 0) by discarding the sailor onto it.
      expect(a.discardToPile).toBe(0);
    }
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
        { playerId: 'a', cardPoints: 8, colorBonus: 1, total: 9, forfeitCards: false, forfeitBonus: false },
        { playerId: 'b', cardPoints: 4, colorBonus: 0, total: 4, forfeitCards: false, forfeitBonus: false },
      ],
    };
    const a = chooseAIAction(s, 'a') as SspAction | null;
    expect(a?.type).toBe('nextRound');
  });
});
