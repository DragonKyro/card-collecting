// Hero art for Air, Land & Sea (picker tile, lobby banner): a 1940s war-room
// map table under a desk lamp — three battle cards (Air / Land / Sea) fanned
// over a coastline chart, a radar scope sweeping in the corner, a brass
// compass rose, and an aircraft's shadow drifting over the map. Self-contained
// (it doesn't import the card art, so the picker bundle stays small); every id
// comes from useSvgIds, since the tile and the lobby banner can show it twice.

import type { ReactNode } from 'react';
import { LightPool, SoftShadow, Vignette, useSvgIds, type SvgIds } from '@/core/svg';

const INK = '#1e252b';
const STENCIL = "'Black Ops One', Impact, 'Arial Black', sans-serif";
const SHEET = 'M12 14 L306 4 L314 172 L6 178 Z';
const spin = (s: number) => ({ transformBox: 'fill-box' as const, transformOrigin: 'center', animation: `cc-spin ${s}s linear infinite` });

export function AirLandSeaThumbnail() {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="Air, Land & Sea">
      <defs>
        <linearGradient id={id('table')} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#2c4a3d" />
          <stop offset="1" stopColor="#10201b" />
        </linearGradient>
        <linearGradient id={id('sea')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9cc3ca" />
          <stop offset="1" stopColor="#5f8e9e" />
        </linearGradient>
        <linearGradient id={id('land')} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ece0b0" />
          <stop offset="1" stopColor="#cdb87c" />
        </linearGradient>
        <pattern id={id('grid')} width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0 L0 0 L0 16" fill="none" stroke="#1f3a37" strokeWidth="0.5" opacity="0.5" />
        </pattern>
        <clipPath id={id('sheet')}><path d={SHEET} /></clipPath>
        <radialGradient id={id('scope')} cx="45%" cy="40%" r="60%">
          <stop offset="0" stopColor="#1f5a3c" />
          <stop offset="1" stopColor="#092016" />
        </radialGradient>
        <linearGradient id={id('sweep')} gradientUnits="userSpaceOnUse" x1="6" y1="-20" x2="22" y2="2">
          <stop offset="0" stopColor="#7dffb0" stopOpacity="0" />
          <stop offset="1" stopColor="#7dffb0" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id={id('brass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3d98a" />
          <stop offset="0.5" stopColor="#b98a2e" />
          <stop offset="1" stopColor="#6e4f17" />
        </linearGradient>
        <linearGradient id={id('card')} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fffbf1" />
          <stop offset="1" stopColor="#e6dcc2" />
        </linearGradient>
        <LightPool id={id('lamp')} color="#ffd98a" opacity={0.42} />
        <SoftShadow id={id('shadow')} dy={5} blur={4} opacity={0.65} />
        <Vignette id={id('vig')} inner={0.38} opacity={0.85} />
      </defs>

      {/* The table and the chart pinned to it. */}
      <rect width="320" height="180" fill={id.url('table')} />
      <path d={SHEET} fill="#000" opacity="0.4" transform="translate(3 5)" />
      <g clipPath={id.url('sheet')}>
        <rect width="320" height="180" fill={id.url('sea')} />
        <path d="M246 0 C 234 24 254 40 246 64 C 238 88 254 108 240 122 C 222 136 184 132 156 142 C 126 154 88 150 66 180" fill="none" stroke="#3f7383" strokeWidth="0.9" strokeDasharray="3 3" />
        <path d="M330 0 L262 0 C 250 24 270 40 262 64 C 254 88 270 108 256 124 C 240 140 200 136 170 148 C 140 160 100 156 80 180 L330 180 Z" fill={id.url('land')} stroke="#8a7a45" strokeWidth="1" />
        <path d="M330 22 L284 22 C 276 42 290 58 284 78 C 278 98 290 118 278 134 C 264 150 226 152 200 162 C 180 170 160 172 150 180" fill="none" stroke="#a8955a" strokeWidth="0.9" />
        <path d="M330 52 L304 52 C 298 70 308 86 302 104 C 296 124 300 140 286 152 C 270 164 240 168 224 180" fill="none" stroke="#a8955a" strokeWidth="0.9" />
        <ellipse cx="26" cy="152" rx="30" ry="14" fill={id.url('land')} stroke="#8a7a45" strokeWidth="1" />
        <ellipse cx="24" cy="152" rx="18" ry="7" fill="none" stroke="#a8955a" strokeWidth="0.8" />
        <rect width="320" height="180" fill={id.url('grid')} />
        {/* Attack arrows chalked onto the chart, and two map pins. */}
        <path d="M304 156 C 312 128 300 108 290 86" fill="none" stroke="#b8322a" strokeWidth="2.4" strokeDasharray="5 3" strokeLinecap="round" />
        <path d="M286 76 L284 90 L295 86 Z" fill="#b8322a" />
        <path d="M16 140 C 18 120 30 106 44 98" fill="none" stroke="#2b4c8c" strokeWidth="2.2" strokeDasharray="5 3" strokeLinecap="round" />
        <path d="M52 94 L40 92 L45 103 Z" fill="#2b4c8c" />
      </g>
      {[[296, 124, '#c8452f'], [36, 128, '#2b5fa8']].map(([x, y, c]) => (
        <g key={c as string} transform={`translate(${x} ${y})`}>
          <ellipse cx={2.5} cy={3.5} rx={4} ry={2} fill="#000" opacity={0.35} />
          <circle r={4} fill={c as string} stroke={INK} strokeWidth={0.8} />
          <circle cx={-1.3} cy={-1.4} r={1.3} fill="#fff" opacity={0.6} />
        </g>
      ))}
      <path d={SHEET} fill="none" stroke="#f1ead2" strokeWidth="1.2" opacity="0.5" />

      {/* An aircraft's shadow sliding over the map. */}
      <g className="cc-anim-drift">
        <path transform="translate(268 128) rotate(-62) scale(1.5)" fill="#0d1a1c" opacity="0.28"
          d="M-16 0.5 L-3 -2.4 L3 -2.4 L16 0.5 L15.2 4 L-15.2 4 Z M-6 10 L6 10 L5.5 12.5 L-5.5 12.5 Z M0 -13 C2.4 -13 2.8 -8.6 2.7 -3.5 L1.7 9.6 L0.9 13.6 L-0.9 13.6 L-1.7 9.6 L-2.7 -3.5 C-2.8 -8.6 -2.4 -13 0 -13 Z" />
      </g>

      <Radar id={id} />
      <Compass id={id} />

      {/* The three battle cards. */}
      <g filter={id.url('shadow')}>
        <ThumbCard id={id} k="air" x={97} y={74} rot={-13} tint="#7d8b97" dark="#4d5a66" sky={['#c4dbe8', '#eef5f8']} strength={4}>
          <ellipse cx={-15} cy={-22} rx={9} ry={3.4} fill="#fff" opacity={0.9} />
          <ellipse cx={17} cy={-6} rx={11} ry={3.6} fill="#fff" opacity={0.85} />
          <path d="M-30 6 C -20 0 -12 -6 -6 -10" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" fill="none" opacity={0.85} />
          <g transform="translate(3 -14) rotate(40) scale(1.15)">
            <path d="M-16 0.5 L-3 -2.4 L3 -2.4 L16 0.5 L15.2 4 L-15.2 4 Z M-6 10 L6 10 L5.5 12.5 L-5.5 12.5 Z M0 -13 C2.4 -13 2.8 -8.6 2.7 -3.5 L1.7 9.6 L0.9 13.6 L-0.9 13.6 L-1.7 9.6 L-2.7 -3.5 C-2.8 -8.6 -2.4 -13 0 -13 Z" fill="#6f7d3c" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
            <circle cx={-10} cy={1.8} r={1.6} fill="#2b4c8c" stroke="#fbf6ea" strokeWidth={0.5} />
            <circle cx={10} cy={1.8} r={1.6} fill="#2b4c8c" stroke="#fbf6ea" strokeWidth={0.5} />
          </g>
        </ThumbCard>
        <ThumbCard id={id} k="sea" x={223} y={74} rot={13} tint="#2f7db3" dark="#1d557c" sky={['#bcdcef', '#e9f4fa']} strength={6}>
          <rect x={-34} y={0} width={68} height={14} fill="#3c7ca4" />
          <path d="M-30 5 Q -26 3 -22 5 T -14 5 M-2 10 Q 2 8 6 10 T 14 10 M18 4 Q 22 2 26 4" stroke="#cfe6f3" strokeWidth={0.8} fill="none" />
          <path d="M-18 -24 Q -16 -26 -14 -24 Q -12 -26 -10 -24" stroke="#4d6070" strokeWidth={0.8} fill="none" />
          <g transform="translate(0 0.5) scale(1.25)">
            <path d="M-22 -2 L18 -2 L23 -5 L21 2 L-20 2 Z" fill="#7c8b99" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
            <path d="M-6 -2 L-6 -8 L6 -8 L6 -2 Z M-2 -8 L-1 -14 L3 -14 L4 -8 Z M-14 -2 L-13 -9 L-9 -9 L-9 -2 Z" fill="#bcc6cf" stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
            <path d="M8 -4 L18 -4.6 M-18 -3.4 L-24 -3.8" stroke={INK} strokeWidth={1.1} />
          </g>
        </ThumbCard>
        <ThumbCard id={id} k="land" x={160} y={65} rot={0} tint="#5f8f3e" dark="#3d6224" sky={['#e4e8c4', '#f6f2dc']} strength={6}>
          <circle cx={-20} cy={-22} r={5} fill="#f6d77a" opacity={0.8} />
          <path d="M-34 -4 C -18 -10 8 -9 34 -7 L34 14 L-34 14 Z" fill="#b39858" />
          <path d="M-34 6 C -10 3 12 5 34 4 L34 14 L-34 14 Z" fill="#7f8f45" />
          <g transform="translate(2 -1) scale(1.2)">
            <path d="M6 -6.6 L22 -6.6" stroke="#4c5726" strokeWidth={2.2} />
            <rect x={-17} y={2} width={34} height={8} rx={4} fill="#3c4321" stroke={INK} strokeWidth={0.9} />
            <path d="M-19 2.6 L-16 -2 L15 -2 L20 2.6 Z M-8 -2 L-7 -7.4 C-5.6 -9.6 4 -9.6 6 -7.4 L8 -2 Z" fill="#6f7d3c" stroke={INK} strokeWidth={0.9} strokeLinejoin="round" />
            {[-11, -4, 3, 10].map((wx) => <circle key={wx} cx={wx} cy={6} r={2.6} fill="#8f9c57" stroke={INK} strokeWidth={0.5} />)}
          </g>
        </ThumbCard>
      </g>

      {/* Desk-lamp light pooling on the table, then the room's dark edges. */}
      <ellipse cx="160" cy="58" rx="190" ry="130" fill={id.url('lamp')} />
      <rect width="320" height="180" fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}

/** A CRT radar scope: rings, crosshair, a rotating sweep and blinking blips. */
function Radar({ id }: { id: SvgIds }) {
  return (
    <g transform="translate(44 44)">
      <circle r={33} fill="#000" opacity={0.45} transform="translate(2 4)" />
      <circle r={33} fill={id.url('brass')} />
      <circle r={29} fill={id.url('scope')} stroke="#0a120e" strokeWidth={1.4} />
      {[9, 18, 27].map((r) => <circle key={r} r={r} fill="none" stroke="#5fdc9a" strokeWidth={0.6} opacity={0.35} />)}
      <path d="M-28 0 L28 0 M0 -28 L0 28" stroke="#5fdc9a" strokeWidth={0.5} opacity={0.35} />
      <g style={spin(5)}>
        <circle r={28} fill="transparent" />
        <path d="M0 0 L28 0 A28 28 0 0 0 18 -21.4 Z" fill={id.url('sweep')} />
        <path d="M0 0 L28 0" stroke="#b6ffd2" strokeWidth={1} opacity={0.9} />
      </g>
      {[[12, -8, 0], [-16, 10, 1.1], [6, 17, 2.2]].map(([x, y, d]) => (
        <circle key={x} cx={x} cy={y} r={1.8} fill="#b6ffd2" className="cc-anim-twinkle" style={{ animationDelay: `${d}s` }} />
      ))}
      <ellipse cx={-10} cy={-14} rx={10} ry={5} fill="#fff" opacity={0.08} transform="rotate(-30 -10 -14)" />
    </g>
  );
}

/** Brass compass rose resting on the chart. */
function Compass({ id }: { id: SvgIds }) {
  return (
    <g transform="translate(288 36)">
      <circle r={19} fill="#000" opacity={0.35} transform="translate(2 3)" />
      <circle r={19} fill={id.url('brass')} />
      <circle r={15.5} fill="#efe6cc" stroke="#6e4f17" strokeWidth={0.8} />
      <path d="M0 -14 L3 -3 L14 0 L3 3 L0 14 L-3 3 L-14 0 L-3 -3 Z" fill="#6e4f17" opacity={0.85} />
      <path d="M0 -14 L3 -3 L0 0 Z M14 0 L3 3 L0 0 Z M0 14 L-3 3 L0 0 Z M-14 0 L-3 -3 L0 0 Z" fill="#c9a24a" />
      <path d="M0 -12 L2.2 0 L0 1.5 L-2.2 0 Z" fill="#b8322a" transform="rotate(18)" />
      <circle r={1.6} fill={INK} />
    </g>
  );
}

function ThumbCard({ id, k, x, y, rot, tint, dark, sky, strength, children }: {
  id: SvgIds; k: string; x: number; y: number; rot: number; tint: string; dark: string; sky: [string, string]; strength: number; children: ReactNode;
}) {
  const skyId = `sky-${k}`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <defs>
        <linearGradient id={id(skyId)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <clipPath id={id(`clip-${k}`)}><rect x={-33} y={-32} width={66} height={46} /></clipPath>
      </defs>
      <rect x={-34} y={-48} width={68} height={96} rx={6} fill={id.url('card')} stroke={dark} strokeWidth={2} />
      <path d="M-33 -42 C-33 -45.5 -30.5 -47 -28 -47 L28 -47 C30.5 -47 33 -45.5 33 -42 L33 -32 L-33 -32 Z" fill={tint} />
      <rect x={-33} y={-47} width={15} height={15} fill="#fbf6ea" />
      <path d="M-18 -47 L-18 -32" stroke={dark} strokeWidth={1.2} />
      <text x={-25.5} y={-35} textAnchor="middle" fontSize={13} fill={dark} style={{ fontFamily: STENCIL }}>{strength}</text>
      <rect x={-13} y={-42} width={38} height={4} rx={2} fill="rgba(255,255,255,0.7)" />
      <g clipPath={id.url(`clip-${k}`)}>
        <rect x={-33} y={-32} width={66} height={46} fill={id.url(skyId)} />
        {children}
      </g>
      <path d="M-33 14 L33 14" stroke={dark} strokeWidth={1.4} />
      <rect x={-27} y={20} width={54} height={3.4} rx={1.7} fill="#d4cab2" />
      <rect x={-27} y={27} width={44} height={3.4} rx={1.7} fill="#d4cab2" />
      <rect x={-27} y={34} width={48} height={3.4} rx={1.7} fill="#d4cab2" />
      {/* Rim light along the top edge. */}
      <path d="M-29 -46.4 L29 -46.4" stroke="#fff" strokeWidth={0.8} opacity={0.55} strokeLinecap="round" />
    </g>
  );
}
