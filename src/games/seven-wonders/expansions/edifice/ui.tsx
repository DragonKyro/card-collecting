// Edifice expansion — lobby section.

import type { SwConfig } from '../../types';

export function EdificeLobbySection({
  config: _config, onChange: _onChange,
}: {
  config: SwConfig;
  onChange: (c: SwConfig) => void;
}) {
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
      Edifice enabled. Three central project tiles (one per age) are drawn at
      match start. A player contributes to age N's project by building any
      wonder stage during that age. At endgame, completed projects (threshold
      met) reward each contributor and penalize each non-contributor. Outcomes
      are surfaced as an "edifice" column in the final scoring.
    </p>
  );
}
