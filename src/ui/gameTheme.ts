// A game's `theme` (GameModule.theme) as CSS custom properties for the shell:
// the accent its buttons take (--btn-bg / --btn-ink, read by theme.css's base
// button and every accent-coloured bit of chrome), its title font and the
// page backdrop behind its lobby and match.

import type { CSSProperties } from 'react';
import type { AnyGameModule } from '@/core/module';

export function themeVars(module: AnyGameModule | undefined | null): CSSProperties {
  const t = module?.theme;
  if (!t) return {};
  const vars: Record<string, string> = {
    '--btn-bg': t.accent,
    '--btn-ink': t.accentInk,
  };
  if (t.titleFont) vars['--game-title-font'] = t.titleFont;
  if (t.backdrop) vars['--game-backdrop'] = t.backdrop;
  return vars as CSSProperties;
}

/** "2–8", or "2" when the game seats exactly one count. */
export function playerRange(module: AnyGameModule): string {
  return module.minPlayers === module.maxPlayers ? `${module.minPlayers}` : `${module.minPlayers}–${module.maxPlayers}`;
}
