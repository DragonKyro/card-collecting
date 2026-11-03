// Game-picker thumbnail for Air, Land & Sea: three battle cards (plane / tank /
// ship) fanned over a slate map table. Self-contained flat SVG — it doesn't
// import the card art, so the picker bundle stays small.

import type { ReactNode } from 'react';

const INK = '#1e252b';
const CREAM = '#fbf6ea';

export function AirLandSeaThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Air, Land & Sea">
      <rect x="0" y="0" width="280" height="140" rx="10" fill="#26303b" />
      <path d="M0 96 L280 52 L280 74 L0 118 Z" fill="#2c3744" />
      <path d="M20 128 L140 108 L260 128" fill="none" stroke="#3a4654" strokeWidth={1.4} strokeDasharray="4 4" />
      <Roundel x={30} y={28} />
      <Roundel x={250} y={112} />

      <ThumbCard x={78} y={74} rot={-11} tint="#4f9fd1" dark="#2c6a95" sky="#c6e5f5" strength={4}>
        <path d="M-16 0.5 L-3 -2.4 L3 -2.4 L16 0.5 L15.2 4 L-15.2 4 Z M-6 10 L6 10 L5.5 12.5 L-5.5 12.5 Z M0 -13 C2.4 -13 2.8 -8.6 2.7 -3.5 L1.7 9.6 L0.9 13.6 L-0.9 13.6 L-1.7 9.6 L-2.7 -3.5 C-2.8 -8.6 -2.4 -13 0 -13 Z" fill="#6f7d3c" stroke={INK} strokeWidth={1} strokeLinejoin="round" transform="rotate(30)" />
      </ThumbCard>
      <ThumbCard x={202} y={74} rot={11} tint="#2f6f99" dark="#1d4a69" sky="#cfe7f1" strength={6} sea>
        <path d="M-22 -2 L18 -2 L23 -5 L21 2 L-20 2 Z" fill="#7c8b99" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
        <path d="M-6 -2 L-6 -8 L6 -8 L6 -2 Z M-2 -8 L-1 -14 L3 -14 L4 -8 Z M-14 -2 L-13 -9 L-9 -9 L-9 -2 Z" fill="#bcc6cf" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
        <path d="M8 -4 L18 -4.6" stroke={INK} strokeWidth={1.2} />
      </ThumbCard>
      <ThumbCard x={140} y={66} rot={0} tint="#c48a3a" dark="#875a1d" sky="#f2dfb2" strength={6} land>
        <path d="M6 -6.6 L22 -6.6" stroke="#4c5726" strokeWidth={2.2} />
        <rect x={-17} y={2} width={34} height={8} rx={4} fill="#3c4321" stroke={INK} strokeWidth={1} />
        <path d="M-19 2.6 L-16 -2 L15 -2 L20 2.6 Z M-8 -2 L-7 -7.4 C-5.6 -9.6 4 -9.6 6 -7.4 L8 -2 Z" fill="#6f7d3c" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
        {[-11, -4, 3, 10].map((wx) => <circle key={wx} cx={wx} cy={6} r={2.6} fill="#8f9c57" stroke={INK} strokeWidth={0.6} />)}
      </ThumbCard>
    </svg>
  );
}

function Roundel({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={13} fill="#e9e1c8" stroke={INK} strokeWidth={1.2} />
      <circle r={10.5} fill="#2b4c8c" stroke={INK} strokeWidth={1} />
      <polygon points="0,-9 2.1,-2.8 8.6,-2.8 3.4,1.1 5.3,7.3 0,3.5 -5.3,7.3 -3.4,1.1 -8.6,-2.8 -2.1,-2.8" fill={CREAM} />
    </g>
  );
}

function ThumbCard({ x, y, rot, tint, dark, sky, strength, land, sea, children }: {
  x: number; y: number; rot: number; tint: string; dark: string; sky: string; strength: number;
  land?: boolean; sea?: boolean; children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-33} y={-46} width={66} height={92} rx={6} fill="rgba(0,0,0,0.35)" transform="translate(2 3)" />
      <rect x={-33} y={-46} width={66} height={92} rx={6} fill={CREAM} stroke={dark} strokeWidth={2} />
      <path d="M-32 -40 C-32 -43.5 -29.5 -45 -27 -45 L27 -45 C29.5 -45 32 -43.5 32 -40 L32 -30 L-32 -30 Z" fill={tint} />
      <rect x={-32} y={-45} width={15} height={15} fill={CREAM} />
      <path d="M-17 -45 L-17 -30" stroke={dark} strokeWidth={1.2} />
      <text x={-24.5} y={-33.6} textAnchor="middle" fontSize={13} fontWeight={900} fill={dark} fontFamily="ui-sans-serif, system-ui, sans-serif">{strength}</text>
      <rect x={-12} y={-40} width={36} height={4} rx={2} fill="rgba(255,255,255,0.75)" />
      <rect x={-32} y={-30} width={64} height={40} fill={sky} />
      {land && <path d="M-32 0 C-16 -4 10 -3 32 -1 L32 10 L-32 10 Z" fill="#a98a50" />}
      {sea && <rect x={-32} y={0} width={64} height={10} fill="#3c7ca4" />}
      <path d="M-32 10 L32 10" stroke={dark} strokeWidth={1.4} />
      <g transform="translate(0 -9)">{children}</g>
      <rect x={-26} y={16} width={52} height={3.4} rx={1.7} fill="#d9d1bf" />
      <rect x={-26} y={23} width={44} height={3.4} rx={1.7} fill="#d9d1bf" />
      <rect x={-26} y={30} width={48} height={3.4} rx={1.7} fill="#d9d1bf" />
    </g>
  );
}
