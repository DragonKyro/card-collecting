// Game-picker thumbnail for Sea Salt & Paper. A small still-life of three
// fanned cards (mermaid / crab / shell) on a teal "sea" background.

import { CardArt } from './CardArt';

export function SeaSaltPaperThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sea Salt & Paper">
      {/* sea backdrop */}
      <defs>
        <linearGradient id="ssp-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a48" />
          <stop offset="100%" stopColor="#2d5d6e" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="140" rx="10" fill="url(#ssp-bg)" />
      <ellipse cx="140" cy="128" rx="120" ry="8" fill="rgba(0,0,0,0.25)" />

      {/* Three fanned cards: mermaid (left), crab (center), shell (right) */}
      <ThumbCard x={50} y={30} rot={-12} family="mermaid" />
      <ThumbCard x={140} y={20} rot={0} family="crab" />
      <ThumbCard x={230} y={30} rot={12} family="shell" />
    </svg>
  );
}

function ThumbCard({ x, y, rot, family }: { x: number; y: number; rot: number; family: 'mermaid' | 'crab' | 'shell' }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rot})`}>
      <rect x={-32} y={-6} width={64} height={92} rx={6} fill="#fbf6ea" stroke="#1c1a2e" strokeWidth={1.4} />
      <rect x={-32} y={-6} width={64} height={6} rx={6} fill={colorForFamily(family)} />
      <g transform="translate(-22, 4) scale(0.42)">
        <CardArt family={family} bodyColor="#fbf6ea" />
      </g>
    </g>
  );
}

function colorForFamily(family: 'mermaid' | 'crab' | 'shell'): string {
  switch (family) {
    case 'mermaid': return '#f9f6ed';
    case 'crab': return '#f0a4b3';
    case 'shell': return '#f4d268';
  }
}
