// Armada expansion — lobby section.

import type { SwConfig } from '../../types';

export function ArmadaLobbySection({
  config: _config, onChange: _onChange,
}: {
  config: SwConfig;
  onChange: (c: SwConfig) => void;
}) {
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
      Armada enabled. 5 navy cards added per age. Personal shipyards, naval
      combat, island cards, and the pirate track are NOT modeled in v1 — only
      the contributed card pool and three Armada-themed end-game scoring rules
      (pillage neighbors' losses, Age III bonuses, color-set completion).
    </p>
  );
}
