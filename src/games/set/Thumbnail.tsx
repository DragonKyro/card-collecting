// Set — hero art for the picker tile and the lobby banner (SVG, 320 × 180).
//
// An arcade-lit table: a violet night with red / green / purple glows (the
// three inks), a perspective grid floor running to a bright horizon, and three
// cards hovering over it that make a set — one purple outlined diamond, two
// green striped ovals, three red solid squiggles — each haloed in its own ink
// and ringed the way the game rings selected cards. Faint symbols drift in the
// distance and sparkles twinkle round the trio.
//
// Ships in the picker's main bundle, so it only imports the shape outlines.
// Every id comes from useSvgIds (the scene can be on screen twice).

import type { ReactNode } from 'react';
import { useSvgIds } from '@/core/svg';
import { SHAPE_PATHS, SHAPE_STROKE } from './shapes';

const PURPLE = '#8a4fd6';
const GREEN = '#17a05e';
const RED = '#d63b48';

/** Symbol scale on a hero card: a 200 × 400 outline becomes 17 × 34. */
const S = 0.085;

const SPARKLE = 'M0,-6 C1,-1.2 1.2,-1 6,0 C1.2,1 1,1.2 0,6 C-1,1.2 -1.2,1 -6,0 C-1.2,-1 -1,-1.2 0,-6 Z';

const SPARKLES = [
  [44, 40, 0.9, '#ffffff', 0],
  [118, 22, 0.6, '#ffd3f0', 1.1],
  [206, 20, 0.75, '#ffffff', 2.2],
  [282, 46, 1, '#c8ffe4', 0.6],
  [300, 96, 0.55, '#ffffff', 1.7],
  [20, 98, 0.6, '#ffd6dc', 2.6],
  [178, 12, 0.5, '#e6d6ff', 0.3],
] as const;

export function SetThumbnail() {
  const id = useSvgIds();
  const grid = id.url('grid');

  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      width="100%"
      height="100%"
      role="img"
      aria-label="Set"
    >
      <defs>
        <linearGradient id={id('bg')} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#2a1650" />
          <stop offset="0.58" stopColor="#170d33" />
          <stop offset="1" stopColor="#0b0619" />
        </linearGradient>
        <Pool id={id('red')} color="#ff4d6a" opacity={0.42} />
        <Pool id={id('green')} color="#2fe08a" opacity={0.32} />
        <Pool id={id('violet')} color="#a66cff" opacity={0.55} />
        <Pool id={id('spot')} color="#f4ecff" opacity={0.3} />
        <Pool id={id('horizon')} color="#ff8ad8" opacity={0.75} />
        <Pool id={id('shadow')} color="#05020d" opacity={0.85} />
        <linearGradient id={id('grid')} gradientUnits="userSpaceOnUse" x1="0" y1="112" x2="0" y2="180">
          <stop offset="0" stopColor="#d9a6ff" stopOpacity="0" />
          <stop offset="1" stopColor="#d9a6ff" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1d63" />
          <stop offset="1" stopColor="#0c0620" />
        </linearGradient>
        <linearGradient id={id('face')} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#ebe4d4" />
        </linearGradient>
        <pattern id={id('stripes')} width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="15" height="34" fill={GREEN} />
        </pattern>
        <filter id={id('blur')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={id('lift')} x="-30%" y="-30%" width="160%" height="170%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.2" />
          <feOffset dy="3" result="o" />
          <feComponentTransfer><feFuncA type="linear" slope="0.55" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id={id('vig')} cx="50%" cy="42%" r="72%">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {/* Sky and the three ink glows. */}
      <rect width="320" height="180" fill={id.url('bg')} />
      <circle cx="34" cy="26" r="120" fill={id.url('red')} />
      <circle cx="296" cy="34" r="118" fill={id.url('green')} />
      <ellipse cx="160" cy="150" rx="190" ry="110" fill={id.url('violet')} />

      {/* Distant symbols, drifting. */}
      <g className="cc-anim-drift" style={{ animationDuration: '22s' }} fill="none" strokeWidth={SHAPE_STROKE} strokeLinejoin="round">
        <path d={SHAPE_PATHS[2]} stroke="#b98cff" opacity="0.32" transform="translate(8 30) rotate(-18) scale(0.085)" />
        <path d={SHAPE_PATHS[1]} stroke="#5ff0a8" opacity="0.26" transform="translate(292 14) rotate(28) scale(0.075)" />
        <path d={SHAPE_PATHS[0]} stroke="#ff7a8c" opacity="0.3" transform="translate(238 4) rotate(62) scale(0.075)" />
        <path d={SHAPE_PATHS[1]} stroke="#ff7a8c" opacity="0.18" transform="translate(96 4) rotate(-64) scale(0.05)" />
        <path d={SHAPE_PATHS[2]} stroke="#5ff0a8" opacity="0.2" transform="translate(150 22) rotate(80) scale(0.045)" />
      </g>

      {/* Grid floor to a lit horizon. */}
      <rect y="112" width="320" height="68" fill={id.url('floor')} />
      <g stroke={grid} strokeWidth="0.8">
        {Array.from({ length: 19 }, (_, i) => {
          const k = i - 9;
          return <line key={`v${k}`} x1={160 + k * 7} y1="112" x2={160 + k * 52} y2="180" />;
        })}
        {[115, 120, 127, 137, 150, 167].map((y) => (
          <line key={`h${y}`} x1="0" y1={y} x2="320" y2={y} />
        ))}
      </g>
      <ellipse cx="160" cy="112" rx="190" ry="11" fill={id.url('horizon')} />
      <rect x="0" y="111.4" width="320" height="1.2" fill="#ffd2f4" opacity="0.7" />

      {/* Spotlight on the trio, and their shadows on the floor. */}
      <circle cx="160" cy="70" r="112" fill={id.url('spot')} />
      <ellipse cx="78" cy="125" rx="40" ry="6" fill={id.url('shadow')} />
      <ellipse cx="242" cy="125" rx="40" ry="6" fill={id.url('shadow')} />
      <ellipse
        cx="160" cy="128" rx="42" ry="6.5" fill={id.url('shadow')}
        className="cc-anim-breathe" style={{ animationDuration: '4.6s', animationDelay: '-2.3s' }}
      />

      <Card x={78} y={82} rotate={-10} glow="#b07cff" blur={id.url('blur')} face={id.url('face')} lift={id.url('lift')}>
        <Sym x={0} shape={2} ink={PURPLE} fill="none" />
      </Card>
      <Card x={242} y={82} rotate={10} glow="#ff5d70" blur={id.url('blur')} face={id.url('face')} lift={id.url('lift')}>
        {[-21, 0, 21].map((x) => <Sym key={x} x={x} shape={0} ink={RED} fill={RED} />)}
      </Card>
      <g transform="translate(160 66)">
        <g className="cc-anim-float" style={{ animationDuration: '4.6s' }}>
          <Card x={0} y={0} rotate={0} glow="#35e595" blur={id.url('blur')} face={id.url('face')} lift={id.url('lift')}>
            {[-11, 11].map((x) => <Sym key={x} x={x} shape={1} ink={GREEN} fill={id.url('stripes')} />)}
          </Card>
        </g>
      </g>

      {/* Sparkles. */}
      {SPARKLES.map(([x, y, s, color, delay], i) => (
        <path
          key={i}
          d={SPARKLE}
          fill={color}
          transform={`translate(${x} ${y}) scale(${s})`}
          className="cc-anim-twinkle"
          style={{ animationDelay: `${delay}s`, animationDuration: '2.8s' }}
        />
      ))}

      <rect width="320" height="180" fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}

function Pool({ id, color, opacity }: { id: string; color: string; opacity: number }) {
  return (
    <radialGradient id={id} cx="50%" cy="50%" r="50%">
      <stop offset="0" stopColor={color} stopOpacity={opacity} />
      <stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.32} />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </radialGradient>
  );
}

/** A hero card: ink halo, lifted face, selection ring, then its symbols. */
function Card({
  x, y, rotate, glow, blur, face, lift, children,
}: {
  x: number; y: number; rotate: number; glow: string;
  blur: string; face: string; lift: string; children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x="-44" y="-30" width="88" height="60" rx="11" fill={glow} opacity="0.7" filter={blur} />
      <g filter={lift}>
        <rect x="-41" y="-27" width="82" height="54" rx="7.5" fill={face} />
      </g>
      <rect x="-43.6" y="-29.6" width="87.2" height="59.2" rx="9.6" fill="none" stroke="#d7bcff" strokeWidth="1.4" opacity="0.85" />
      <path d="M-35,-25.6 H35" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
      <rect x="-41" y="-27" width="82" height="54" rx="7.5" fill="none" stroke="#2a1d4a" strokeOpacity="0.22" strokeWidth="0.8" />
      {children}
    </g>
  );
}

/** One symbol, centred on (x, 0) of its card. */
function Sym({ x, shape, ink, fill }: { x: number; shape: number; ink: string; fill: string }) {
  const d = SHAPE_PATHS[shape];
  return (
    <g transform={`translate(${x - 100 * S} ${-200 * S}) scale(${S})`}>
      {fill !== 'none' && <path d={d} fill={fill} />}
      <path d={d} fill="none" stroke={ink} strokeWidth={SHAPE_STROKE} strokeLinejoin="round" />
    </g>
  );
}
