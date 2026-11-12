// The app's mark: a fan of five cards, one per accent colour, each with a
// little emblem. The home hero fans it open on load and sweeps foil across
// the front card; the top bar shows it small and still.

import { useSvgIds } from '@/core/svg';

const FAN = [
  { angle: -34, fill: '#ff6b6b', ink: '#7a1d24' },
  { angle: -17, fill: '#ff9f43', ink: '#7a3a08' },
  { angle: 0, fill: '#ffc53d', ink: '#7a5200' },
  { angle: 17, fill: '#2ec4b6', ink: '#0b4f49' },
  { angle: 34, fill: '#9b6bff', ink: '#3b1d80' },
] as const;

// Pivot the fan turns around (the cards' shared bottom corner area).
const PX = 60;
const PY = 96;

function Emblem({ i, ink }: { i: number; ink: string }) {
  // Card-local coordinates: the card is 34 × 48 with its top-left at (-17, -48).
  switch (i) {
    case 0: // a maki roll
      return (
        <g>
          <circle cx={0} cy={-25} r={8} fill={ink} />
          <circle cx={0} cy={-25} r={5.2} fill="#fff8ec" />
          <circle cx={0} cy={-25} r={2.2} fill="#ff6b6b" />
        </g>
      );
    case 1: // a pyramid under a sun
      return (
        <g>
          <circle cx={6} cy={-33} r={3} fill="#fff8ec" opacity={0.9} />
          <path d="M-9 -17 L0 -32 L9 -17 Z" fill={ink} />
          <path d="M0 -32 L9 -17 L3 -17 Z" fill="#000" opacity={0.18} />
        </g>
      );
    case 2: // a star
      return (
        <path
          d="M0 -35 L2.9 -28.6 L9.8 -27.8 L4.7 -23.1 L6.1 -16.2 L0 -19.7 L-6.1 -16.2 L-4.7 -23.1 L-9.8 -27.8 L-2.9 -28.6 Z"
          fill={ink}
        />
      );
    case 3: // a paper boat on a wave
      return (
        <g>
          <path d="M-10 -24 L10 -24 L6 -18 L-6 -18 Z" fill={ink} />
          <path d="M0 -35 L0 -24 L7 -24 Z" fill="#fff8ec" />
          <path d="M-11 -14 q3 -3 6 0 t6 0 t6 0 t5 0" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    default: // a diamond
      return (
        <g>
          <path d="M0 -36 L9 -25 L0 -13 L-9 -25 Z" fill={ink} />
          <path d="M0 -36 L9 -25 L0 -25 Z" fill="#fff" opacity={0.3} />
        </g>
      );
  }
}

export function BrandMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const id = useSvgIds();
  return (
    <svg className={`brand-mark ${className ?? ''}`} viewBox="0 0 120 104" aria-hidden="true">
      <defs>
        <linearGradient id={id('sheen')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.75} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id={id('front')}>
          <rect x={-17} y={-48} width={34} height={48} rx={5} />
        </clipPath>
      </defs>
      <ellipse cx={PX} cy={PY + 4} rx={34} ry={4} fill="#000" opacity={0.3} />
      {FAN.map((c, i) => (
        <g
          key={i}
          className={animated ? 'brand-fan-card' : undefined}
          style={{
            transform: `rotate(${c.angle}deg)`,
            transformOrigin: `${PX}px ${PY}px`,
            animationDelay: animated ? `${120 + Math.abs(i - 2) * 70}ms` : undefined,
          }}
        >
          <g transform={`translate(${PX} ${PY - 6})`}>
            <rect x={-17} y={-48} width={34} height={48} rx={5} fill="#fffaf0" stroke="#1c1533" strokeWidth={1.6} />
            <rect x={-14} y={-45} width={28} height={42} rx={3.5} fill={c.fill} />
            <rect x={-14} y={-45} width={28} height={14} rx={3.5} fill="#fff" opacity={0.16} />
            <Emblem i={i} ink={c.ink} />
            {i === FAN.length - 1 && animated && (
              <g clipPath={id.url('front')}>
                <rect className="brand-sheen" x={-30} y={-52} width={16} height={60} fill={id.url('sheen')} />
              </g>
            )}
          </g>
        </g>
      ))}
    </svg>
  );
}
