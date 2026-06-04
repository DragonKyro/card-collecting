// Leaders expansion — onEvent hook implementation.
//
// Scans each player's leaderTableau for `leaderTrigger` effects and emits the
// rewards when matching events fire. Note: triggers only fire for events AFTER
// the leader was recruited — leaders played mid-Age don't retro-trigger on the
// neighbor's purchase or the chain build that already happened this tick.
//
// Hatshepsut is special: she pays out at most ONCE per pick tick (rulebook FAQ).
// We track that via player.bilkisUsedThisTick — no wait, that's for Bilkis.
// We add a separate per-player flag `hatshepsutPaidThisTick` (in passing —
// reusing transientResources area isn't right, so we just store it inline).

import type { SwPlayer, SwState } from '../../types';
import type { SwEvent } from '../types';

export function onEventLeaders(state: SwState, event: SwEvent): void {
  // Per-tick reset: clear Hatshepsut-paid flag at tick start.
  if (event.kind === 'tickStart') {
    for (const p of state.players) {
      // Stash on player to keep it serializable. We use a dynamic key on the
      // player object; declared optional in types.
      (p as SwPlayer & { hatshepsutPaidThisTick?: boolean }).hatshepsutPaidThisTick = false;
    }
    return;
  }

  // The event has a playerId or buyerId — find the relevant player.
  const eventPlayerId = getEventPlayer(event);
  if (!eventPlayerId) return;
  const player = state.players.find((p) => p.id === eventPlayerId);
  if (!player) return;
  const leaders = player.leaderTableau ?? [];
  if (leaders.length === 0) return;

  for (const leader of leaders) {
    for (const eff of leader.effects) {
      if (eff.kind !== 'leaderTrigger') continue;
      if (!matchesTrigger(eff.on, event, leader.name, player)) continue;
      player.coins += eff.reward.coins ?? 0;
      if (leader.name === 'Hatshepsut') {
        (player as SwPlayer & { hatshepsutPaidThisTick?: boolean }).hatshepsutPaidThisTick = true;
      }
    }
  }
}

function getEventPlayer(event: SwEvent): string | null {
  switch (event.kind) {
    case 'cardBuilt': return event.playerId;
    case 'wonderStageBuilt': return event.playerId;
    case 'militaryTokenGained': return event.playerId;
    case 'neighborPurchase': return event.buyerId;
    case 'leaderRecruited': return event.playerId;
    case 'tickStart': return null;
  }
}

function matchesTrigger(
  on: { type: string; color?: string },
  event: SwEvent,
  leaderName: string,
  player: SwPlayer,
): boolean {
  if (on.type === 'buildCardColor' && event.kind === 'cardBuilt') {
    return event.card.color === on.color;
  }
  if (on.type === 'buildViaChain' && event.kind === 'cardBuilt') {
    return event.viaChain;
  }
  if (on.type === 'militaryWin' && event.kind === 'militaryTokenGained') {
    return event.vp > 0;
  }
  if (on.type === 'neighborPurchase' && event.kind === 'neighborPurchase') {
    // Hatshepsut pays out at most once per tick.
    if (leaderName === 'Hatshepsut') {
      const paid = (player as SwPlayer & { hatshepsutPaidThisTick?: boolean }).hatshepsutPaidThisTick;
      return !paid;
    }
    return true;
  }
  return false;
}
