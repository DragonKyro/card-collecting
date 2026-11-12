// The top of a game's lobby (local and online): the game's hero art dealt
// onto a blurred, blown-up copy of itself, with its name in the game's title
// font, its blurb and what it supports. `children` adds to the chip row (the
// online host's game picker).

import type { ReactNode } from 'react';
import type { AnyGameModule } from '@/core/module';
import { playerRange } from './gameTheme';

export function LobbyBanner({ module, children }: { module: AnyGameModule; children?: ReactNode }) {
  const Thumb = module.Thumbnail;
  const levels = module.aiLevels?.length ?? 0;
  return (
    <section className={`lobby-banner cc-chrome${Thumb ? '' : ' no-art'}`}>
      {Thumb && (
        <div className="lobby-banner-blur" aria-hidden="true">
          <Thumb />
        </div>
      )}
      {Thumb && (
        <div className="lobby-banner-art">
          <div className="lobby-banner-art-inner">
            <Thumb />
          </div>
        </div>
      )}
      <div className="lobby-banner-text">
        <h2 className="lobby-banner-title">{module.name}</h2>
        <p className="lobby-banner-tagline">{module.tagline}</p>
        <div className="lobby-banner-meta">
          <span className="lobby-chip">{playerRange(module)} players</span>
          {module.chooseAIAction && (
            <span className="lobby-chip ghost">{levels > 1 ? `AI · ${levels} levels` : 'vs AI'}</span>
          )}
          {module.onlineSupported !== false ? (
            <span className="lobby-chip ghost">Online</span>
          ) : (
            <span className="lobby-chip ghost">Shared screen</span>
          )}
          {children}
        </div>
      </div>
    </section>
  );
}
