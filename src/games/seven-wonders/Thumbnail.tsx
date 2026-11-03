// Game-picker thumbnail for 7 Wonders — the pyramids at Gizah behind a fan of
// three Age cards (raw materials, civilian, science). Self-contained flat SVG
// (no <defs>, and nothing imported from art.tsx, so the picker bundle stays small).

const INK = '#2a1c0e';

export function SevenWondersThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="7 Wonders">
      <rect x={0} y={0} width={280} height={140} rx={10} fill="#f4ddb0" />
      <rect x={0} y={62} width={280} height={30} fill="#f0cf96" />
      <circle cx={226} cy={34} r={16} fill="#fbe7a6" />
      <path d="M0 92 Q70 84 140 90 T280 86 V130 Q280 140 270 140 H10 Q0 140 0 130 Z" fill="#dcb878" stroke={INK} strokeWidth={1.2} />

      {/* pyramids */}
      <polygon points="40,92 112,22 184,92" fill="#e8c27c" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      <polygon points="112,22 184,92 142,92" fill="#c99a55" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      <polygon points="168,92 206,54 244,92" fill="#e8c27c" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <polygon points="206,54 244,92 222,92" fill="#c99a55" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M72 62 H152 M88 46 H136" stroke="#b0874a" strokeWidth={0.8} />

      <ThumbCard x={88} y={100} rot={-12} band="#8b5a2b" sky="#f3e4c0" ground="#a7c26a">
        <rect x={-9} y={6} width={9} height={4} rx={2} fill="#b77a3d" stroke={INK} strokeWidth={0.6} />
        <rect x={-5} y={2} width={9} height={4} rx={2} fill="#c98b4b" stroke={INK} strokeWidth={0.6} />
        <path d="M8 10 V2" stroke="#6c4220" strokeWidth={1.4} />
        <circle cx={8} cy={-1} r={4} fill="#5f9a3e" stroke={INK} strokeWidth={0.6} />
      </ThumbCard>
      <ThumbCard x={140} y={96} rot={0} band="#2f6fae" sky="#d6e9f0" ground="#a7c26a">
        <polygon points="-12,0 0,-6 12,0" fill="#f5efe1" stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />
        {[-9, -3, 3, 9].map((x) => <rect key={x} x={x - 1} y={0} width={2} height={9} fill="#f5efe1" stroke={INK} strokeWidth={0.5} />)}
        <rect x={-13} y={9} width={26} height={2} fill="#ddd5c4" stroke={INK} strokeWidth={0.5} />
      </ThumbCard>
      <ThumbCard x={192} y={100} rot={12} band="#3f9a4c" sky="#e5eed4" ground="#b99464">
        <circle cx={0} cy={2} r={8} fill="#f6f3e4" stroke="#3f7a35" strokeWidth={0.8} />
        <path d="M0 -3 L-4 7 M0 -3 L4 7" stroke="#3a3328" strokeWidth={1.3} strokeLinecap="round" />
        <circle cx={0} cy={-3.6} r={1.4} fill="#c69a3d" stroke="#3a3328" strokeWidth={0.5} />
      </ThumbCard>
    </svg>
  );
}

function ThumbCard({ x, y, rot, band, sky, ground, children }: {
  x: number; y: number; rot: number; band: string; sky: string; ground: string; children: React.ReactNode;
}) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rot})`}>
      <rect x={-22} y={-30} width={44} height={60} rx={5} fill="#fbf3dd" stroke={INK} strokeWidth={1.4} />
      <rect x={-20} y={-28} width={40} height={10} rx={3} fill={band} />
      <rect x={-20} y={-18} width={40} height={30} fill={sky} />
      <rect x={-20} y={6} width={40} height={6} fill={ground} />
      <g transform="translate(0,-6)">{children}</g>
      <rect x={-14} y={17} width={28} height={3} rx={1.5} fill="#c9b58a" />
    </g>
  );
}
