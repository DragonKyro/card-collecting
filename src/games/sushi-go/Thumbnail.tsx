// Game-picker thumbnail for Sushi Go! Party — fanned set of three sushi cards
// (nigiri / maki / dumpling) on a warm tan background.

export function SushiGoThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sushi Go! Party">
      <defs>
        <linearGradient id="sushi-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8d2a4" />
          <stop offset="100%" stopColor="#c79a64" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="140" rx="10" fill="url(#sushi-bg)" />
      <ellipse cx="140" cy="128" rx="120" ry="8" fill="rgba(0,0,0,0.2)" />

      {/* Nigiri (left) */}
      <g transform="translate(50,30) rotate(-12)">
        <rect x={-32} y={-6} width={64} height={92} rx={6} fill="#fff8ec" stroke="#3a2a14" strokeWidth={1.4} />
        <rect x={-32} y={-6} width={64} height={6} rx={6} fill="#e0584f" />
        <g transform="translate(0,46)">
          {/* rice block */}
          <rect x={-22} y={-6} width={44} height={14} rx={3} fill="#f8f1de" stroke="#3a2a14" strokeWidth={1} />
          {/* salmon */}
          <rect x={-24} y={-12} width={48} height={8} rx={3} fill="#f78b65" stroke="#3a2a14" strokeWidth={1} />
          <polyline points="-18,-9 18,-9" stroke="#fff" strokeWidth="0.8" opacity="0.6" />
          {/* nori band */}
          <rect x={-4} y={-13} width={8} height={22} fill="#1c2a1a" stroke="#3a2a14" strokeWidth={1} />
        </g>
      </g>

      {/* Maki (center) */}
      <g transform="translate(140,20)">
        <rect x={-32} y={-6} width={64} height={92} rx={6} fill="#fff8ec" stroke="#3a2a14" strokeWidth={1.4} />
        <rect x={-32} y={-6} width={64} height={6} rx={6} fill="#1c5f9e" />
        <g transform="translate(0,46)">
          {/* nori roll */}
          <circle r="22" fill="#1c2a1a" stroke="#3a2a14" strokeWidth={1.2} />
          <circle r="15" fill="#f8f1de" stroke="#3a2a14" strokeWidth={1} />
          <circle r="6" fill="#f78b65" stroke="#3a2a14" strokeWidth={1} />
          <circle cx="-8" cy="-6" r="2" fill="#9ed27c" />
          <circle cx="8" cy="-6" r="2" fill="#9ed27c" />
          <circle cx="-8" cy="6" r="2" fill="#f4d268" />
          <circle cx="8" cy="6" r="2" fill="#f4d268" />
        </g>
      </g>

      {/* Dumpling (right) */}
      <g transform="translate(230,30) rotate(12)">
        <rect x={-32} y={-6} width={64} height={92} rx={6} fill="#fff8ec" stroke="#3a2a14" strokeWidth={1.4} />
        <rect x={-32} y={-6} width={64} height={6} rx={6} fill="#9ed27c" />
        <g transform="translate(0,46)">
          <polygon points="-22,8 -16,-12 0,-18 16,-12 22,8 0,18" fill="#f0d28a" stroke="#3a2a14" strokeWidth={1} />
          <polyline points="-12,-6 -6,-12 0,-14 6,-12 12,-6" stroke="#3a2a14" strokeWidth="1" fill="none" />
          <polyline points="-10,4 10,4" stroke="#3a2a14" strokeWidth="0.6" opacity="0.5" />
        </g>
      </g>
    </svg>
  );
}
