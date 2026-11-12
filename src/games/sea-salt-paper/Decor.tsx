// Purely decorative pieces of the Sea Salt & Paper table: the sea behind the
// board (watercolour, light rays, drifting ripples, glints), the rubber stamp
// that says how a round ended, the winner's crest and a paper-confetti burst.
// No game logic; everything here is aria-hidden and ignores the pointer.
// The motion is CSS (ssp.css), so the global reduced-motion rule covers it.

import type { CSSProperties } from 'react';
import type { SspRoundSummary } from './types';

/** The sea under the board: sits behind every zone (see `.ssp-sea`). */
export function SeaDecor() {
  const glints: Array<[number, number, number]> = [[12, 18, 0], [86, 9, 1.1], [64, 31, 2.3], [24, 52, 0.7], [93, 46, 1.8], [47, 6, 2.9]];
  return (
    <div className="ssp-sea" aria-hidden>
      <div className="ssp-sea-rays" />
      <div className="ssp-sea-ripples" />
      {glints.map(([x, y, d], i) => (
        <span key={i} className="ssp-sea-glint" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

const STAMPS: Record<SspRoundSummary['endedBy'], { text: string; tone: string }> = {
  stop: { text: 'STOP', tone: 'stop' },
  lastChance: { text: 'Last chance', tone: 'last' },
  deckEmpty: { text: 'Deck empty', tone: 'deck' },
  mermaid: { text: '4 Mermaids', tone: 'mermaid' },
};

/** Rubber stamp naming how the round ended. */
export function RoundStamp({ endedBy, won }: { endedBy: SspRoundSummary['endedBy']; won: boolean | null }) {
  const s = STAMPS[endedBy];
  const sub = endedBy === 'lastChance' ? (won ? 'bet won' : 'bet lost') : null;
  return (
    <span className={`ssp-stamp tone-${s.tone}${sub && !won ? ' lost' : ''}`} aria-hidden>
      <span className="ssp-stamp-main">{s.text}</span>
      {sub && <span className="ssp-stamp-sub">{sub}</span>}
    </span>
  );
}

/** A folded paper crown with a pearl: the match winner's crest. */
export function WinnerCrest() {
  const INK = '#1c1a2e';
  return (
    <svg viewBox="0 0 120 84" width="96" height="67" aria-hidden>
      <ellipse cx="60" cy="78" rx="44" ry="5" fill="rgba(60,40,10,0.22)" />
      <polygon points="14,70 106,70 100,78 20,78" fill="#c99a2e" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="14,70 8,22 36,46" fill="#f6cf5a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="14,70 36,46 60,70" fill="#e0ac3a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="36,46 60,8 60,70" fill="#ffe08a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="60,8 84,46 60,70" fill="#e9b743" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="60,70 84,46 106,70" fill="#d39a2c" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="84,46 112,22 106,70" fill="#c88a22" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="60" cy="8" r="5" fill="#f9f6ed" stroke={INK} strokeWidth="2" />
      <circle cx="8" cy="22" r="4" fill="#4fd1c5" stroke={INK} strokeWidth="2" />
      <circle cx="112" cy="22" r="4" fill="#f0a4b3" stroke={INK} strokeWidth="2" />
      <polyline points="22,60 36,52 50,60" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const CONFETTI_COLORS = ['#f4d268', '#4fd1c5', '#f0a4b3', '#9ed27c', '#b984c9', '#e8a04a', '#fbf6ea', '#1c5f9e'];

/** Paper bits falling once over the winner banner. */
export function Confetti({ count = 22 }: { count?: number }) {
  return (
    <div className="ssp-confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        // A fixed scatter (no randomness needed): golden-angle spacing.
        const x = (i * 61.8) % 100;
        const style = {
          left: `${x}%`,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationDelay: `${(i % 7) * 0.11}s`,
          animationDuration: `${2.2 + ((i * 37) % 10) / 10}s`,
          '--spin': `${(i % 2 ? 1 : -1) * (240 + ((i * 53) % 300))}deg`,
          '--drift': `${((i * 29) % 60) - 30}px`,
        } as CSSProperties;
        return <span key={i} className={i % 3 === 0 ? 'tri' : undefined} style={style} />;
      })}
    </div>
  );
}
