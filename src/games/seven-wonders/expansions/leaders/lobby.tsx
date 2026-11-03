// Leaders expansion — lobby blurb. Kept apart from ui.tsx: the expansion
// object (and so this component) loads with the module, while ui.tsx and the
// card art it draws with load lazily with the game view.

import type { SwConfig } from '../../types';

export function LeadersLobbySection({ config: _config, onChange: _onChange }: { config: SwConfig; onChange: (c: SwConfig) => void }) {
  // No lobby-side config for Leaders (just the on/off in the main panel).
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
      Leaders enabled. 36 leaders shuffled and pass-drafted at match start.
    </p>
  );
}
