// Hero art for 7 Wonders (picker tile, lobby banner): the ancient world at
// golden hour. A hand of seven cards — one of each Age colour, the civilian
// card lifted as the pick — fanned against a sun setting into the sea, the
// Temple of Artemis on the headland and the Colossus of Rhodes over the
// harbour mouth. Cards are drawn in the game's own printed layout.
//
// Ships in the picker bundle: nothing from art.tsx / ui.tsx. Every id comes
// from useSvgIds (the tile and the banner can be on screen together).
// Ambient motion: the sun's glow breathes, the Colossus' torch flickers,
// gulls drift.

import type { ReactNode } from 'react';
import { LightPool, SoftShadow, Vignette, useSvgIds } from '@/core/svg';

const INK = '#2a1c0e';
const PAPER = '#fbf3dd';
const SIL = '#4a2238';
const RIM = '#ffb56a';

/** The hand, left to right: band colour and the effect icon on its band. */
const HAND: Array<{ band: string; icon: ReactNode }> = [
  { band: '#8b5a2b', icon: <g><rect x={-3.5} y={-3.5} width={7} height={7} rx={1.6} fill="#7a4a22" stroke={INK} strokeWidth={0.5} /><path d="M-2 -1 H2 M-2 1 H2" stroke="#d9a066" strokeWidth={0.7} /></g> },
  { band: '#8f949e', icon: <g><rect x={-3.5} y={-3.5} width={7} height={7} rx={1.6} fill="#2e8db0" stroke={INK} strokeWidth={0.5} /><path d="M0 -2 Q2 0.6 0 2 Q-2 0.6 0 -2 Z" fill="#e6f6ff" /></g> },
  { band: '#e2a92b', icon: <g><circle r={3.7} fill="#f3c33b" stroke="#7a4e05" strokeWidth={0.6} /><circle r={2.4} fill="none" stroke="#c9900e" strokeWidth={0.4} /></g> },
  { band: '#2f6fae', icon: <g><circle r={4.2} fill="#fbf3dc" stroke="#7b6526" strokeWidth={0.5} /><path d="M-2.6 1.4 Q-3.2 -1.8 -0.8 -3.3 M2.6 1.4 Q3.2 -1.8 0.8 -3.3" stroke="#5d8a2f" strokeWidth={1.1} fill="none" strokeLinecap="round" /></g> },
  { band: '#c03b32', icon: <path d="M0 -4 L3.4 -2.7 V0.3 C3.4 2.4 1.9 3.6 0 4.3 C-1.9 3.6 -3.4 2.4 -3.4 0.3 V-2.7 Z" fill="#e2645a" stroke={INK} strokeWidth={0.5} /> },
  { band: '#3f9a4c', icon: <g><circle r={3.9} fill="#e8f0d6" stroke="#3f7a35" strokeWidth={0.5} /><path d="M0 -2 L-1.9 2.4 M0 -2 L1.9 2.4" stroke="#3a3328" strokeWidth={0.8} strokeLinecap="round" /></g> },
  { band: '#7c55b0', icon: <g><circle r={3.9} fill="#f1e8fb" stroke="#4d3270" strokeWidth={0.5} /><path d="M0 -2.4 L0.7 -0.6 L2.4 -0.6 L1 0.5 L1.5 2.3 L0 1.2 L-1.5 2.3 L-1 0.5 L-2.4 -0.6 L-0.7 -0.6 Z" fill="#7c55b0" /></g> },
];
const LIFTED = 3;
const PIVOT = { x: 160, y: 200 };

export function SevenWondersThumbnail() {
  const id = useSvgIds();
  // The left of the fan overlaps rightwards, the right leftwards, the pick on top.
  const order = [0, 1, 2, 6, 5, 4, LIFTED];
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="7 Wonders">
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#36214a" />
          <stop offset="0.3" stopColor="#a5485a" />
          <stop offset="0.5" stopColor="#ee8a40" />
          <stop offset="0.62" stopColor="#ffd27a" />
        </linearGradient>
        <linearGradient id={id('sea')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9a35c" />
          <stop offset="0.3" stopColor="#9a5260" />
          <stop offset="1" stopColor="#2a1934" />
        </linearGradient>
        <radialGradient id={id('sun')} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fffbea" />
          <stop offset="0.55" stopColor="#ffe394" />
          <stop offset="1" stopColor="#f79c3e" />
        </radialGradient>
        <LightPool id={id('glow')} color="#ffd88a" opacity={0.9} />
        <LightPool id={id('torch')} color="#ffe08a" opacity={1} />
        <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd38a" stopOpacity="0.45" />
          <stop offset="0.4" stopColor="#ffd38a" stopOpacity="0" />
        </linearGradient>
        <SoftShadow id={id('shadow')} dy={3} blur={3} opacity={0.6} />
        <Vignette id={id('vig')} color="#14070f" inner={0.5} opacity={0.7} />
      </defs>

      <rect width={320} height={180} fill={id.url('sky')} />
      {[[22, 14], [58, 8], [262, 10], [300, 22], [110, 18]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 0.8 : 1.1} fill="#fff4d6" opacity={0.7} />
      ))}

      {/* the sun going down into the sea, right behind the hand */}
      <circle cx={160} cy={112} r={130} fill={id.url('glow')} className="cc-anim-breathe" />
      <g fill="#ffe6a8" opacity={0.09}>
        {[-160, -136, -112, -68, -44, -20].map((a) => {
          const r = (d: number) => (d * Math.PI) / 180;
          return <path key={a} d={`M160 112 L${160 + 240 * Math.cos(r(a - 4))} ${112 + 240 * Math.sin(r(a - 4))} L${160 + 240 * Math.cos(r(a + 4))} ${112 + 240 * Math.sin(r(a + 4))} Z`} />;
        })}
      </g>
      <circle cx={160} cy={112} r={27} fill={id.url('sun')} />

      <g className="cc-anim-drift" stroke="#3a1a2a" strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.7}>
        <path d="M72 40 q3.5 -3.5 7 0 q3.5 -3.5 7 0" />
        <path d="M92 30 q3 -3 6 0 q3 -3 6 0" />
        <path d="M236 36 q3 -3 6 0 q3 -3 6 0" />
      </g>

      {/* the sea, with the sun's path glittering on it */}
      <rect x={-2} y={112} width={324} height={70} fill={id.url('sea')} />
      <path d="M-2 112 H322" stroke="#ffd58e" strokeWidth={1} opacity={0.7} />
      <g fill="#fff0c0">
        {[[150, 117, 20], [146, 123, 28], [152, 129, 18], [140, 135, 36], [156, 142, 22]].map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height={1.4} rx={0.7} opacity={0.75 - i * 0.1} />
        ))}
      </g>

      {/* the Temple of Artemis on its headland */}
      <path d="M-2 98 Q26 88 60 92 Q88 95 104 113 H-2 Z" fill="#7a3e2a" />
      <path d="M-2 98 Q26 88 60 92 Q88 95 104 113" fill="none" stroke={RIM} strokeWidth={1} opacity={0.6} />
      <g stroke={INK} strokeWidth={0.6} strokeLinejoin="round">
        <rect x={4} y={88} width={56} height={3.4} fill="#e9b98a" />
        {[8, 17, 26, 35, 44, 53].map((x) => <rect key={x} x={x} y={74} width={3.2} height={14} fill="#f6cf9c" />)}
        <rect x={5} y={70} width={54} height={4} fill="#f6cf9c" />
        <path d="M3 70 L32 60 L61 70 Z" fill="#ffdcaa" />
      </g>
      <path d="M68 94 C71.5 88 71.5 79 68 72 C64.5 79 64.5 88 68 94 Z" fill="#4a2228" />

      {/* the Colossus of Rhodes over the harbour mouth, torch raised */}
      <g fill={SIL} stroke="#2a1020" strokeWidth={0.7} strokeLinejoin="round">
        <rect x={257} y={103} width={17} height={10} />
        <rect x={299} y={103} width={17} height={10} />
        <path d="M262 103 L271 103 L286 74 L279 72 Z" />
        <path d="M311 103 L302 103 L288 74 L295 72 Z" />
        <path d="M277 79 L297 79 L294 65 L280 65 Z" />
        <path d="M280 66 L281 50 Q287 46 293 50 L294 66 Z" />
        <circle cx={287} cy={42.5} r={4.4} />
        <path d="M290 51 L299.5 31 L303 32.6 L294.5 54 Z" />
        <path d="M283.5 51.5 L275 67 L278 68.4 L286.5 54 Z" />
      </g>
      <path d="M262 103 L279 72 M280.5 66 L281 50.5 M283.5 52 L275.5 66.6" stroke={RIM} strokeWidth={1} opacity={0.75} fill="none" />
      {[-155, -120, -85, -50, -15].map((a) => (
        <path key={a} d={`M${287 + 4.4 * Math.cos((a * Math.PI) / 180)} ${42.5 + 4.4 * Math.sin((a * Math.PI) / 180)} l${3 * Math.cos((a * Math.PI) / 180)} ${3 * Math.sin((a * Math.PI) / 180)}`} stroke={SIL} strokeWidth={1.3} />
      ))}
      <g className="cc-anim-flicker">
        <circle cx={301.5} cy={28} r={13} fill={id.url('torch')} />
        <path d="M299 29.5 Q301.5 21 304 29.5 Q301.5 31.5 299 29.5 Z" fill="#fff1b8" />
      </g>

      {/* the hand: seven Age cards fanned, the pick lifted */}
      <g filter={id.url('shadow')}>
        {order.map((i) => (
          <FanCard key={i} angle={(i - LIFTED) * 9} lifted={i === LIFTED} side={Math.sign(i - LIFTED)} band={HAND[i].band} icon={HAND[i].icon} rim={id.url('rim')} />
        ))}
      </g>

      {/* coins and a laurel medal at the foot of the hand */}
      <g filter={id.url('shadow')}>
        {[[90, 124], [104, 124], [97, 119]].map(([cx, cy], i) => (
          <g key={i} transform={`translate(${cx} ${cy})`}>
            <ellipse rx={7.5} ry={3.2} cy={1.6} fill="#9a6d05" />
            <ellipse rx={7.5} ry={3.2} fill="#f3c33b" stroke="#7a4e05" strokeWidth={0.8} />
            <ellipse rx={4.6} ry={1.9} fill="none" stroke="#c9900e" strokeWidth={0.6} />
          </g>
        ))}
        <g transform="translate(228 121)">
          <circle r={9} fill="#f3c33b" stroke="#7a4e05" strokeWidth={1} />
          <circle r={6.6} fill="#fbf3dc" stroke="#9a6d05" strokeWidth={0.6} />
          <path d="M-4.2 2.8 Q-5.4 -2.4 -1.1 -5.3 M4.2 2.8 Q5.4 -2.4 1.1 -5.3" stroke="#5d8a2f" strokeWidth={1.9} fill="none" strokeLinecap="round" />
        </g>
      </g>

      <rect width={320} height={180} fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}

/** One card of the fan in the printed layout (effect band, scene, name),
 *  rotated about the hand's pivot below the frame. */
function FanCard({ angle, lifted, side, band, icon, rim }: {
  angle: number; lifted: boolean; side: number; band: string; icon: ReactNode; rim: string;
}) {
  return (
    <g transform={`rotate(${angle} ${PIVOT.x} ${PIVOT.y}) translate(${PIVOT.x} ${PIVOT.y - (lifted ? 12 : 0)})`}>
      {lifted && <rect x={-24.5} y={-172.5} width={49} height={69} rx={7} fill="none" stroke="#ffe08a" strokeWidth={2} opacity={0.85} />}
      <rect x={-22} y={-170} width={44} height={64} rx={5} fill={PAPER} stroke={INK} strokeWidth={1.3} />
      <rect x={-20} y={-168} width={40} height={11} rx={3} fill={band} />
      {/* the icon sits on the part of the band left showing */}
      <g transform={`translate(${side * 12} -162.5)`}>{icon}</g>
      <rect x={-20} y={-156} width={40} height={32} fill={lifted ? '#fde3b0' : '#f3e4c0'} />
      <rect x={-20} y={-130} width={40} height={6} fill={lifted ? '#a7c26a' : '#dcb878'} />
      {lifted ? (
        <g stroke={INK} strokeWidth={0.5} strokeLinejoin="round">
          <circle cx={10} cy={-148} r={4} fill="#fff1c0" stroke="none" />
          <polygon points="-15,-140 0,-148 15,-140" fill="#f5efe1" />
          <rect x={-14} y={-140} width={28} height={2.2} fill="#f5efe1" />
          {[-11, -5.5, 0, 5.5, 11].map((x) => <rect key={x} x={x - 1.1} y={-137.8} width={2.2} height={7.4} fill="#f5efe1" strokeWidth={0.4} />)}
          <rect x={-16} y={-130.4} width={32} height={2} fill="#ddd5c4" />
        </g>
      ) : (
        <path d="M-20 -130 L-12 -141 L-6 -136 L0 -146 L8 -134 L20 -138 V-130 Z" fill={band} opacity={0.45} />
      )}
      <path d="M-20 -124 H20" stroke={INK} strokeWidth={0.6} />
      <rect x={-14} y={-119} width={28} height={5} rx={2.5} fill="#ecdfbd" stroke="#b39a6a" strokeWidth={0.5} />
      <rect x={-9} y={-117.2} width={18} height={1.4} rx={0.7} fill="#8a7350" />
      <rect x={-22} y={-170} width={44} height={64} rx={5} fill={rim} />
    </g>
  );
}
