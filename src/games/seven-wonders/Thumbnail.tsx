// Game-picker thumbnail for 7 Wonders — a stylised Pyramid silhouette with
// three colored "wonder stage" tiles in the foreground.

export function SevenWondersThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="7 Wonders">
      <defs>
        <linearGradient id="sw-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0c87a" />
          <stop offset="100%" stopColor="#b87a3a" />
        </linearGradient>
        <linearGradient id="sw-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff5b8" />
          <stop offset="100%" stopColor="#f4a23c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="140" rx="10" fill="url(#sw-bg)" />

      {/* sun */}
      <circle cx="140" cy="50" r="22" fill="url(#sw-sun)" opacity="0.85" />

      {/* sand foreground */}
      <polygon points="0,110 280,110 280,140 0,140" fill="#caa066" />

      {/* big pyramid */}
      <polygon points="80,108 200,108 140,40" fill="#a0743a" stroke="#3a2a14" strokeWidth="1.4" />
      <polygon points="140,40 200,108 168,108" fill="#7d5828" />
      {/* stones */}
      <polyline points="100,98 180,98" stroke="#3a2a14" strokeWidth="0.6" opacity="0.5" />
      <polyline points="112,84 168,84" stroke="#3a2a14" strokeWidth="0.6" opacity="0.5" />
      <polyline points="122,72 158,72" stroke="#3a2a14" strokeWidth="0.6" opacity="0.5" />
      <polyline points="140,40 140,108" stroke="#3a2a14" strokeWidth="0.6" opacity="0.4" />

      {/* small side pyramids */}
      <polygon points="30,118 80,118 55,82" fill="#8b6228" stroke="#3a2a14" strokeWidth="1" />
      <polygon points="200,118 250,118 225,82" fill="#8b6228" stroke="#3a2a14" strokeWidth="1" />

      {/* three foreground "wonder cards" — brown / blue / green tableau hint */}
      <ThumbCard x={60} y={86} rot={-8} barColor="#9b6a3f" />
      <ThumbCard x={140} y={92} rot={0} barColor="#3d6da0" />
      <ThumbCard x={220} y={86} rot={8} barColor="#5fa552" />
    </svg>
  );
}

function ThumbCard({ x, y, rot, barColor }: { x: number; y: number; rot: number; barColor: string }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rot})`}>
      <rect x={-22} y={-4} width={44} height={42} rx={4} fill="#fbf6ea" stroke="#1c1a2e" strokeWidth={1.2} />
      <rect x={-22} y={-4} width={44} height={8} rx={4} fill={barColor} />
      <polygon points="-12,12 12,12 8,32 -8,32" fill="rgba(0,0,0,0.08)" />
      <polyline points="-12,18 12,18" stroke={barColor} strokeWidth="2" opacity="0.5" />
    </g>
  );
}
