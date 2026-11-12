// Small decorations for the Sushi Go view: status-chip icons and the
// game-over confetti. Flat SVG (no <defs>), all aria-hidden.

import type { CSSProperties } from 'react';

export type ChipIconKind = 'round' | 'pass' | 'deck' | 'uramaki' | 'picks' | 'chopsticks';

const INK = '#2b0f06';

/** A 16 × 16 glyph for the status bar / hand header. */
export function ChipIcon({ kind }: { kind: ChipIconKind }) {
  return (
    <svg className={`sgp-icon sgp-icon-${kind}`} viewBox="0 0 16 16" width={16} height={16} aria-hidden>
      {kind === 'round' && (
        // A paper lantern.
        <g>
          <path d="M8 0.5 V2.5" stroke="#f2c46d" strokeWidth={1.2} />
          <rect x={5} y={2} width={6} height={1.8} rx={0.6} fill="#2a120d" />
          <ellipse cx={8} cy={8} rx={5.2} ry={4.6} fill="#ff8a4a" stroke="#b3241a" strokeWidth={0.9} />
          <path d="M3.4 6.2 Q8 7.2 12.6 6.2 M3 8.4 Q8 9.4 13 8.4 M3.6 10.6 Q8 11.4 12.4 10.6" stroke="#b3241a" strokeWidth={0.6} fill="none" />
          <rect x={5} y={12.2} width={6} height={1.8} rx={0.6} fill="#2a120d" />
          <path d="M8 14 V15.6" stroke="#f2c46d" strokeWidth={1.2} />
        </g>
      )}
      {kind === 'pass' && (
        // A plate riding the belt to the left.
        <g>
          <path d="M1 12.5 H15" stroke="#b9b2a8" strokeWidth={1.4} strokeLinecap="round" />
          <ellipse cx={8} cy={10} rx={5} ry={1.9} fill="#f7f1e3" stroke="#3d7fd1" strokeWidth={1} />
          <path d="M4.6 9.2 Q4.8 6.4 8 6.4 Q11.2 6.4 11.4 8.8 Q8 8.2 4.6 9.2 Z" fill="#f7894f" stroke={INK} strokeWidth={0.6} />
          <path d="M3.4 3.6 H12 M3.4 3.6 L5.4 1.8 M3.4 3.6 L5.4 5.4" stroke="#fbf3df" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      )}
      {kind === 'deck' && (
        <g stroke={INK} strokeWidth={0.8}>
          <rect x={4.5} y={1.5} width={8} height={11} rx={1.4} fill="#7a1510" transform="rotate(10 8.5 7)" />
          <rect x={3.5} y={2.5} width={8} height={11} rx={1.4} fill="#c4362a" />
          <circle cx={7.5} cy={8} r={2.2} fill="#1f2a1d" stroke="none" />
          <circle cx={7.5} cy={8} r={1.4} fill="#fbf3df" stroke="none" />
        </g>
      )}
      {kind === 'uramaki' && (
        <g>
          <circle cx={8} cy={8} r={6.4} fill="#fbf8ef" stroke={INK} strokeWidth={0.9} />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const a = (i / 8) * Math.PI * 2;
            return <circle key={i} cx={8 + Math.cos(a) * 5.2} cy={8 + Math.sin(a) * 5.2} r={0.75} fill="#ef8a2f" />;
          })}
          <circle cx={8} cy={8} r={3.6} fill="#1f2a1d" />
          <circle cx={8} cy={8} r={2.7} fill="#fbf8ef" />
          <circle cx={7.3} cy={8} r={1.1} fill="#8cc152" />
          <circle cx={8.9} cy={8.2} r={0.9} fill="#f07a6a" />
        </g>
      )}
      {kind === 'picks' && (
        <g>
          <rect x={2} y={3} width={7} height={10} rx={1.4} fill="#c4362a" stroke={INK} strokeWidth={0.8} transform="rotate(-10 5.5 8)" />
          <rect x={7} y={3} width={7} height={10} rx={1.4} fill="#c4362a" stroke={INK} strokeWidth={0.8} transform="rotate(8 10.5 8)" />
          <path d="M7.4 8.6 L9.6 10.8 L13.6 5.6" stroke="#fbf3df" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {kind === 'chopsticks' && (
        <g strokeLinecap="round">
          <path d="M2 2.5 L14.5 12.5" stroke="#d9a35b" strokeWidth={1.8} />
          <path d="M4 1.2 L15 10.5" stroke="#c98f45" strokeWidth={1.8} />
          <path d="M3.6 3.8 L5.4 2" stroke="#d23b2e" strokeWidth={1.4} />
        </g>
      )}
    </svg>
  );
}

// Confetti: little maki slices, rice grains and fish ribbons bursting out of
// the winner banner once. Positions are fixed (not random) so a re-render
// never jumps them.
const BITS = ['maki', 'salmon', 'rice', 'wasabi', 'tamago', 'tuna'] as const;

export function Confetti({ count = 30 }: { count?: number }) {
  return (
    <span className="sgp-confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12);
        const dist = 120 + ((i * 37) % 90);
        const style = {
          '--x': `${Math.round(Math.cos(a) * dist * 1.6)}px`,
          '--y': `${Math.round(Math.sin(a) * dist * 0.7 - 30)}px`,
          '--r': `${((i * 67) % 360) - 180}deg`,
          '--d': `${(i % 5) * 60}ms`,
        } as CSSProperties;
        return <i key={i} className={`bit ${BITS[i % BITS.length]}`} style={style} />;
      })}
    </span>
  );
}
