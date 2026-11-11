// The game picker: a hero (the fanned-card crest, the title dealt in letter
// by letter, the join-a-room box) over a grid of game tiles, each the game's
// own hero art (GameModule.Thumbnail) with its name, player count and blurb.

import type { CSSProperties } from 'react';
import { GAMES } from '@/games/registry';
import type { AnyGameModule } from '@/core/module';
import { BrandMark } from './Brand';
import { JoinRoomBox } from './OnlineStatus';
import { playerRange } from './gameTheme';

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

// Card silhouettes drifting behind the title: position, tilt, colours, drift.
const DECO: ReadonlyArray<{ x: number; y: number; r: number; c: [string, string]; t: number; d: number; dx: number; dy: number }> = [
  { x: 6, y: 18, r: -18, c: ['#ff6b6b', '#c2364a'], t: 11, d: 0, dx: 10, dy: -14 },
  { x: 16, y: 62, r: 12, c: ['#2ec4b6', '#167d74'], t: 9, d: -3, dx: -8, dy: -12 },
  { x: 27, y: 8, r: 8, c: ['#ffc53d', '#c98a0c'], t: 13, d: -6, dx: 6, dy: 12 },
  { x: 70, y: 6, r: -10, c: ['#9b6bff', '#5b33c2'], t: 12, d: -2, dx: -10, dy: 14 },
  { x: 82, y: 56, r: 16, c: ['#ff5fa2', '#b42e6d'], t: 10, d: -5, dx: 8, dy: -16 },
  { x: 92, y: 14, r: -6, c: ['#4cc9f0', '#1f7fa8'], t: 14, d: -8, dx: -6, dy: 10 },
  { x: 60, y: 70, r: -22, c: ['#3ddc97', '#1c8d5c'], t: 12, d: -4, dx: 10, dy: -8 },
];

function HeroTitle({ text }: { text: string }) {
  let i = 0;
  return (
    <h1 className="home-title" aria-label={text}>
      {text.split(' ').map((word, w) => (
        <span key={w} className="word" aria-hidden="true">
          {[...word].map((ch, k) => (
            <span key={k} className="ch" style={{ '--i': i++ } as CSSProperties}>{ch}</span>
          ))}
        </span>
      ))}
    </h1>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <circle cx="8" cy="5" r="3" fill="currentColor" />
      <path d="M2 15c0-3.5 2.7-6 6-6s6 2.5 6 6z" fill="currentColor" />
    </svg>
  );
}

function GameTile({ module, index, onPick }: { module: AnyGameModule; index: number; onPick(): void }) {
  const Thumb = module.Thumbnail;
  const theme = module.theme;
  const tags: string[] = [];
  if (module.minPlayers === 1) tags.push('Solo');
  if (module.chooseAIAction) tags.push(module.aiLevels && module.aiLevels.length > 1 ? `${module.aiLevels.length} AI levels` : 'vs AI');
  if (module.onlineSupported !== false) tags.push('Online');
  return (
    <button
      type="button"
      className="game-tile"
      onClick={onPick}
      title={module.tagline}
      style={{
        '--i': index,
        ...(theme ? { '--tile-accent': theme.accent, '--tile-ink': theme.accentInk } : {}),
      } as CSSProperties}
    >
      <span className="game-tile-art">{Thumb && <Thumb />}</span>
      <span className="game-tile-info">
        <span className="game-tile-top">
          <span className="game-tile-name" style={theme?.titleFont ? { fontFamily: theme.titleFont } : undefined}>
            {module.name}
          </span>
          <span className="game-tile-players" title="Players">
            {playerRange(module)}
            <PersonIcon />
          </span>
        </span>
        <span className="game-tile-blurb">{module.tagline}</span>
        {tags.length > 0 && (
          <span className="game-tile-tags">
            {tags.map((t) => <span key={t}>{t}</span>)}
          </span>
        )}
      </span>
    </button>
  );
}

export function GamePicker({ urlCode, onPick }: { urlCode: string | null; onPick(gameId: string): void }) {
  const count = NUMBER_WORDS[GAMES.length] ?? String(GAMES.length);
  return (
    <div className="home cc-chrome">
      <section className="home-hero">
        <div className="home-hero-deco" aria-hidden="true">
          {DECO.map((d, i) => (
            <span
              key={i}
              style={{
                left: `${d.x}%`,
                top: `${d.y}%`,
                background: `linear-gradient(150deg, ${d.c[0]}, ${d.c[1]})`,
                '--r': `${d.r}deg`,
                '--t': `${d.t}s`,
                '--d': `${d.d}s`,
                '--dx': `${d.dx}px`,
                '--dy': `${d.dy}px`,
              } as CSSProperties}
            />
          ))}
        </div>
        <BrandMark className="home-crest" animated />
        <HeroTitle text="Card Collecting" />
        <p className="home-tagline">
          Draft, trade, build and bluff — <em>{count} card games</em>, one table.
        </p>
        <JoinRoomBox initialCode={urlCode} />
      </section>

      <div className="home-section-head">Pick a game</div>
      <div className="game-list cc-stagger">
        {GAMES.map((g, i) => (
          <GameTile key={g.id} module={g} index={i} onPick={() => onPick(g.id)} />
        ))}
      </div>

      <footer className="home-footer">
        Pass-and-play on one device, take on the AI, or host a room for friends — no accounts, nothing to install.
      </footer>
    </div>
  );
}
