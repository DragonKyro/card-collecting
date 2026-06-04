// Game-picker thumbnail for Air, Land & Sea.
// Three small theater badges (plane / tank / ship) on a slate background.

export function AirLandSeaThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Air, Land & Sea">
      <defs>
        <linearGradient id="als-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f3744" />
          <stop offset="100%" stopColor="#1a1e25" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="140" rx="10" fill="url(#als-bg)" />

      {/* Air theater badge (left) */}
      <ThumbBadge x={56} y={70} tint="#6fb1d4" label="AIR">
        <Plane />
      </ThumbBadge>
      {/* Land theater badge (center) */}
      <ThumbBadge x={140} y={70} tint="#c5a36b" label="LAND">
        <Tank />
      </ThumbBadge>
      {/* Sea theater badge (right) */}
      <ThumbBadge x={224} y={70} tint="#5e8db5" label="SEA">
        <Ship />
      </ThumbBadge>
    </svg>
  );
}

function ThumbBadge({ x, y, tint, label, children }: { x: number; y: number; tint: string; label: string; children: React.ReactNode }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-30} y={-40} width={60} height={86} rx={6} fill="#fbf6ea" stroke="#1c1a2e" strokeWidth={1.4} />
      <rect x={-30} y={-40} width={60} height={10} rx={6} fill={tint} />
      <text x={0} y={-32} textAnchor="middle" fill="#fbf6ea" fontSize={9} fontWeight={700} fontFamily="ui-sans-serif, system-ui, sans-serif">{label}</text>
      <g transform="translate(-15, -16)">
        {children}
      </g>
    </g>
  );
}

function Plane() {
  return (
    <svg viewBox="0 0 30 30" width={30} height={30}>
      <path d="M15 4 L17 16 L26 19 L17 20 L15 26 L13 20 L4 19 L13 16 Z" fill="#3a4252" />
    </svg>
  );
}

function Tank() {
  return (
    <svg viewBox="0 0 30 30" width={30} height={30}>
      <rect x={5} y={16} width={20} height={6} rx={1} fill="#3a4252" />
      <rect x={9} y={11} width={12} height={6} rx={1} fill="#3a4252" />
      <rect x={20} y={13} width={6} height={2} fill="#3a4252" />
      <circle cx={9} cy={24} r={2} fill="#1c1a2e" />
      <circle cx={15} cy={24} r={2} fill="#1c1a2e" />
      <circle cx={21} cy={24} r={2} fill="#1c1a2e" />
    </svg>
  );
}

function Ship() {
  return (
    <svg viewBox="0 0 30 30" width={30} height={30}>
      <path d="M3 18 L27 18 L24 24 L6 24 Z" fill="#3a4252" />
      <rect x={11} y={11} width={8} height={6} fill="#3a4252" />
      <rect x={13} y={4} width={2} height={9} fill="#3a4252" />
      <rect x={15} y={6} width={5} height={2} fill="#3a4252" />
    </svg>
  );
}
