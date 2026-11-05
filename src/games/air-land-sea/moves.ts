// Air, Land & Sea — every legal action / answer. Used by the AI and the tests
// (the reducer validates independently).

import type { PlayerId } from '@/core/types';
import type { AlsAction, AlsAnswer, AlsState } from './types';
import { locate, playOptions } from './rules';

/** Every answer `state.pending` accepts. */
export function legalAnswers(state: AlsState): AlsAnswer[] {
  const p = state.pending;
  if (!p) return [];
  const out: AlsAnswer[] = p.optional ? [{ kind: 'skip' }] : [];
  const cards = p.cards ?? [];
  switch (p.prompt) {
    case 'flip': case 'destroy': case 'destroyOwn': case 'redeployPick':
    case 'reveal': case 'incite': case 'retrofit':
      for (const cardId of cards) out.push({ kind: 'card', cardId });
      break;
    case 'transport':
      for (const cardId of cards) {
        const from = locate(state, cardId)?.theaterIdx;
        state.theaters.forEach((_, t) => { if (t !== from) out.push({ kind: 'move', cardId, theaterIdx: t }); });
      }
      break;
    case 'redeployPlay':
      for (const cardId of cards) {
        const o = playOptions(state, p.seat, cardId);
        for (const t of o.faceUp) out.push({ kind: 'play', cardId, theaterIdx: t, faceDown: false });
        for (const t of o.faceDown) out.push({ kind: 'play', cardId, theaterIdx: t, faceDown: true });
      }
      break;
    case 'reinforce': case 'supply':
      for (const t of p.theaters ?? []) out.push({ kind: 'theater', theaterIdx: t });
      break;
    case 'name':
      for (const cardId of cards) out.push({ kind: 'name', cardId });
      break;
    case 'giveOrKeep':
      out.push({ kind: 'option', option: 'give' }, { kind: 'option', option: 'keep' });
      break;
    case 'envoy':
      out.push({ kind: 'option', option: 'move' }, { kind: 'option', option: 'stay' });
      break;
  }
  return out;
}

/** Every action `playerId` may take now. */
export function legalActions(state: AlsState, playerId: PlayerId): AlsAction[] {
  if (state.phase === 'gameOver') return [];
  if (state.activePlayerId !== playerId) return [];
  if (state.subPhase === 'battleEnd') return [{ type: 'continueBattle' }];
  if (state.subPhase === 'resolving') {
    return legalAnswers(state).map((answer) => ({ type: 'answer', playerId, answer }));
  }
  const seat: 0 | 1 = state.players[0].id === playerId ? 0 : 1;
  if (seat !== state.turnSeatIdx) return [];
  const out: AlsAction[] = [];
  for (const cardId of state.players[seat].hand) {
    const o = playOptions(state, seat, cardId);
    for (const t of o.faceUp) out.push({ type: 'deploy', playerId, cardId, theaterIdx: t });
    for (const t of o.faceDown) out.push({ type: 'improvise', playerId, cardId, theaterIdx: t });
  }
  out.push({ type: 'withdraw', playerId });
  return out;
}
