// Cities expansion — lobby UI section.
//
// Cities has no in-game overlay (it's a deck contribution + onEvent + scoring
// extras module). The lobby section explains what's modeled vs deferred.

import type { SwConfig } from '../../types';

export function CitiesLobbySection({
  config: _config, onChange: _onChange,
}: {
  config: SwConfig;
  onChange: (c: SwConfig) => void;
}) {
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
      Cities enabled. 9 black cards added per age (per-player-count appearance).
      Debt tokens, diplomacy tokens, and Tourist Office / Gambling Hall scoring
      extras modeled. Some per-card abilities are placeholder no-ops pending
      authoritative rulebook text — see the source for the full list.
    </p>
  );
}
