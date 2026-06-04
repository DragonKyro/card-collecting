// Babel expansion — lobby section.

import type { SwConfig } from '../../types';

export function BabelLobbySection({
  config: _config, onChange: _onChange,
}: {
  config: SwConfig;
  onChange: (c: SwConfig) => void;
}) {
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
      Babel enabled. 5 orange cards added per age. Tower of Babel and Great
      Projects of Babylon central-board mechanics are NOT modeled in v1 — only
      the contributed card pool and three Babel-themed end-game scoring rules
      (science sets, VP per neighbor cards, VP per own-color set).
    </p>
  );
}
