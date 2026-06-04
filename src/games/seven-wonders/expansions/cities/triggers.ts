// Cities expansion — onEvent hook for cardBuilt → debt and diplomacy effects.
//
// When a Cities card with citiesDebtToNeighbors is built, both seat-adjacent
// neighbors each receive `amount` debt tokens. When a card with
// citiesGainDiplomacy is built, the owner gains diplomacy tokens (consumed
// automatically at next age-end military resolution).

import type { SwState } from '../../types';
import type { SwEvent } from '../types';
import { neighborsOf } from '../../resources';

export function onEventCities(state: SwState, event: SwEvent): void {
  if (event.kind !== 'cardBuilt') return;
  const { playerId, card } = event;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  for (const eff of card.effects) {
    if (eff.kind === 'citiesDebtToNeighbors') {
      const { west, east } = neighborsOf(state, playerId);
      west.debtTokens = (west.debtTokens ?? 0) + eff.amount;
      east.debtTokens = (east.debtTokens ?? 0) + eff.amount;
    } else if (eff.kind === 'citiesGainDiplomacy') {
      player.diplomacyTokens = (player.diplomacyTokens ?? 0) + eff.amount;
    }
  }
}
