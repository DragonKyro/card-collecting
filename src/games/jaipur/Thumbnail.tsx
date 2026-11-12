// Hero art for Jaipur (picker tile, lobby banner): a bazaar stall in the
// pink city at dusk. A striped silk awning and marigold garlands frame the
// rose-sandstone skyline (honeycomb palace facades, chhatri domes, lit
// windows) under a setting sun; on the stall's rug, a fan of the game's own
// cards with a few rupee tokens and the Seal of Excellence. Ambient motion:
// the brass lantern sways and flickers, the garland tassel sways, a few
// windows twinkle. Every SVG id comes from useSvgIds (it can be on screen twice).

import type { ReactNode } from 'react';
import { Glow, LightPool, SoftShadow, Vignette, useSvgIds } from '@/core/svg';
import { BonusTokenArt, CamelTokenArt, CardFaceArt, GoodsTokenArt, SealArt } from './art';
import type { JaipurCardType } from './types';

const swayTop = (dur: number, delay = 0) => ({
  animation: `cc-sway ${dur}s ease-in-out ${delay}s infinite`,
  transformBox: 'fill-box' as const,
  transformOrigin: '50% 0%',
});

/** A Hawa Mahal–style honeycomb facade: stepped tiers of small arched windows. */
function Facade({ cx, base, w, tiers, fill, win, lit }: {
  cx: number; base: number; w: number; tiers: number; fill: string; win: string; lit: number[];
}) {
  const parts: ReactNode[] = [];
  let n = 0;
  for (let t = 0; t < tiers; t++) {
    const tw = w - t * 13;
    const top = base - (t + 1) * 13;
    parts.push(<rect key={`t${t}`} x={cx - tw / 2} y={top} width={tw} height={13.5} fill={fill} />);
    for (let x = cx - tw / 2 + 4; x <= cx + tw / 2 - 6; x += 7.5) {
      const on = lit.includes(n++);
      parts.push(
        <rect
          key={`w${t}-${x}`} x={x} y={top + 3} width={3.6} height={7} rx={1.8}
          fill={on ? '#ffd27a' : win}
          className={on ? 'cc-anim-twinkle' : undefined}
          style={on ? { animationDelay: `${(n * 0.7) % 3}s` } : undefined}
        />,
      );
    }
  }
  const tw = w - tiers * 13;
  const top = base - tiers * 13;
  parts.push(<path key="crown" d={`M${cx - tw / 2} ${top} Q${cx} ${top - 16} ${cx + tw / 2} ${top} Z`} fill={fill} />);
  parts.push(<circle key="fin" cx={cx} cy={top - 13} r={1.6} fill={fill} />);
  return <g>{parts}</g>;
}

/** A chhatri: a small domed pavilion on posts. */
function Chhatri({ x, y, s = 1, fill }: { x: number; y: number; s?: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
      <path d="M-12 0 V-14 H12 V0 Z M-14 -14 H14 V-17 H-14 Z" />
      <path d="M-11 -17 Q-11 -30 0 -33 Q11 -30 11 -17 Z" />
      <rect x={-0.8} y={-38} width={1.6} height={6} />
    </g>
  );
}

/** Marigold swag between two hooks: `sag` is how far its middle drops. */
function Garland({ x1, x2, y, sag }: { x1: number; x2: number; y: number; sag: number }) {
  const mx = (x1 + x2) / 2;
  const cy = y + 2 * sag;
  const blooms: ReactNode[] = [];
  const N = 15;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const bx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * mx + t ** 2 * x2;
    const by = (1 - t) ** 2 * y + 2 * (1 - t) * t * cy + t ** 2 * y;
    blooms.push(
      <g key={i}>
        <circle cx={bx} cy={by} r={3.4} fill={i % 2 ? '#ffc93c' : '#f28a12'} />
        <circle cx={bx} cy={by} r={1.3} fill={i % 2 ? '#e0901a' : '#b9520a'} />
      </g>,
    );
  }
  return (
    <g>
      <path d={`M${x1} ${y} Q${mx} ${cy} ${x2} ${y}`} fill="none" stroke="#5b3a12" strokeWidth={0.8} />
      {blooms}
    </g>
  );
}

const FAN: Array<{ type: JaipurCardType; a: number; r: number }> = [
  { type: 'spice', a: -38, r: 34 },
  { type: 'gold', a: 38, r: 34 },
  { type: 'diamond', a: -20, r: 40 },
  { type: 'cloth', a: 20, r: 40 },
  { type: 'camel', a: 0, r: 45 },
];
const PIVOT = { x: 160, y: 174 };
const STAR = 'M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z';

export function JaipurThumbnail() {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="Jaipur">
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.12" stopColor="#4a1446" />
          <stop offset="0.42" stopColor="#a8355c" />
          <stop offset="0.66" stopColor="#ee7d5e" />
          <stop offset="0.8" stopColor="#ffbf72" />
        </linearGradient>
        <LightPool id={id('sun')} color="#ffd98a" opacity={0.85} />
        <LightPool id={id('lamp')} color="#ffc661" opacity={0.75} />
        <linearGradient id={id('awnShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#3a0718" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id={id('awnCast')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a0616" stopOpacity="0.5" />
          <stop offset="1" stopColor="#2a0616" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('rug')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8f1d33" />
          <stop offset="1" stopColor="#4a0a1b" />
        </linearGradient>
        <linearGradient id={id('post')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a0f1d" />
          <stop offset="0.45" stopColor="#7a2c3c" />
          <stop offset="1" stopColor="#2a0a14" />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.1" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('floorShadow')} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#1a0208" stopOpacity="0.55" />
          <stop offset="1" stopColor="#1a0208" stopOpacity="0" />
        </radialGradient>
        <SoftShadow id={id('shadow')} dy={3} blur={2.6} opacity={0.6} />
        <Glow id={id('halo')} color="#ffd98a" blur={3} strength={0.55} />
        <Vignette id={id('vig')} color="#1a0410" inner={0.5} opacity={0.7} />
      </defs>

      {/* Dusk sky, the sun low behind the stall. */}
      <rect width="320" height="180" fill={id.url('sky')} />
      <circle cx="160" cy="112" r="130" fill={id.url('sun')} />
      <circle cx="160" cy="118" r="24" fill="#ffe2a0" opacity={0.85} />

      {/* Far city: domes and towers in the haze. */}
      <g opacity={0.7}>
        <path d="M14 134 V112 H34 V104 H46 V112 H62 V98 H70 V112 H96 V134 Z M226 134 V108 H244 V100 H254 V108 H272 V114 H306 V134 Z" fill="#c4607a" />
        <Chhatri x={40} y={104} s={0.7} fill="#c4607a" />
        <Chhatri x={250} y={100} s={0.75} fill="#c4607a" />
        <Chhatri x={118} y={116} s={0.9} fill="#c96a80" />
        <Chhatri x={204} y={114} s={0.8} fill="#c96a80" />
      </g>
      {/* Honeycomb palace facades in rose sandstone. */}
      <Facade cx={58} base={136} w={82} tiers={5} fill="#d9707f" win="#9c3550" lit={[3, 9, 16, 22, 27]} />
      <Facade cx={262} base={136} w={82} tiers={5} fill="#d9707f" win="#9c3550" lit={[1, 7, 12, 19, 25]} />

      {/* The stall's rug, catching the light. */}
      <path d="M0 180 V136 Q160 124 320 136 V180 Z" fill={id.url('rug')} />
      <path d="M0 139 Q160 127 320 139" fill="none" stroke="#e7b84a" strokeWidth={1.6} />
      <path d="M0 144 Q160 132 320 144" fill="none" stroke="#e7b84a" strokeWidth={0.7} strokeDasharray="3 3" opacity={0.8} />
      <ellipse cx="160" cy="134" rx="104" ry="9" fill={id.url('floorShadow')} />

      {/* Posts, the awning's cast shadow, garlands. */}
      <rect x="0" y="0" width="320" height="58" fill={id.url('awnCast')} />
      <rect x="-2" y="14" width="13" height="170" fill={id.url('post')} />
      <rect x="309" y="14" width="13" height="170" fill={id.url('post')} />
      {[46, 92].map((y) => (
        <g key={y} fill="#d9a43a">
          <rect x="-2" y={y} width="13" height="3" />
          <rect x="309" y={y} width="13" height="3" />
        </g>
      ))}
      <Garland x1={10} x2={106} y={30} sag={13} />
      <Garland x1={214} x2={310} y={30} sag={13} />
      <g style={swayTop(5.2, 0.6)}>
        <line x1="262" y1="44" x2="262" y2="58" stroke="#5b3a12" strokeWidth={0.8} />
        {[50, 56, 62].map((y, i) => <circle key={y} cx="262" cy={y} r={3} fill={i % 2 ? '#f28a12' : '#ffc93c'} />)}
        <path d="M259 65 L262 74 L265 65 Z" fill="#c42a47" />
      </g>

      {/* Brass lantern hanging from the awning. */}
      <circle cx="58" cy="70" r="30" fill={id.url('lamp')} className="cc-anim-flicker" />
      <g style={swayTop(4.4)}>
        <line x1="58" y1="28" x2="58" y2="56" stroke="#8a5d12" strokeWidth={1} />
        <path d="M51 58 L65 58 L62 54 L54 54 Z" fill="#c9952e" />
        <path d="M50 58 H66 L64 78 H52 Z" fill="#ffcf6b" stroke="#8a5d12" strokeWidth={1.2} />
        <path d="M55 58 V78 M61 58 V78" stroke="#a8741c" strokeWidth={0.9} />
        <path d="M50 78 H66 L60 84 H56 Z" fill="#c9952e" />
      </g>

      {/* Striped silk awning with a scalloped hem and tassels. */}
      {Array.from({ length: 16 }, (_, i) => {
        const x = i * 20;
        return (
          <g key={i}>
            <path d={`M${x} 0 H${x + 20} V22 A10 10 0 0 1 ${x} 22 Z`} fill={i % 2 ? '#f6c453' : '#c42a47'} />
            <circle cx={x + 10} cy={35} r={1.7} fill="#e7b84a" />
          </g>
        );
      })}
      <rect x="0" y="0" width="320" height="32" fill={id.url('awnShade')} />
      <path d={Array.from({ length: 16 }, (_, i) => `M${i * 20 + 20} 22 A10 10 0 0 1 ${i * 20} 22`).join(' ')} fill="none" stroke="#7a1a2e" strokeWidth={0.8} opacity={0.6} />
      <rect x="0" y="0" width="320" height="4" fill="#d9a43a" />

      {/* The fan of market cards, warm rim light, the camel in front. */}
      <g filter={id.url('halo')}>
        {FAN.map(({ type, a, r }) => (
          <g key={type} transform={`translate(${PIVOT.x} ${PIVOT.y}) rotate(${a}) translate(-31 ${-r - 87})`} filter={id.url('shadow')}>
            <g transform="scale(0.62)"><CardFaceArt type={type} /></g>
            {type === 'camel' && <rect x="1" y="1" width="60.8" height="85.6" rx="5.6" fill={id.url('sheen')} />}
            {type === 'diamond' && (
              <path d={STAR} transform="translate(15 27)" fill="#fff" className="cc-anim-twinkle" />
            )}
          </g>
        ))}
      </g>

      {/* Rupee tokens on the rug, the bonus and camel tokens, the seal. */}
      <g filter={id.url('shadow')}>
        <g transform="translate(18 118) scale(0.72)"><GoodsTokenArt good="silver" value={5} /></g>
        <g transform="translate(30 104) scale(0.8)"><GoodsTokenArt good="diamond" value={7} /></g>
        <g transform="translate(56 112) scale(0.76)"><GoodsTokenArt good="gold" value={6} /></g>
        <g transform="translate(250 114) scale(0.74)"><BonusTokenArt size={5} /></g>
        <g transform="translate(274 120) scale(0.66)"><CamelTokenArt /></g>
      </g>
      <g transform="translate(262 72) scale(1.05)">
        <g className="cc-anim-float" filter={id.url('halo')}><SealArt earned /></g>
      </g>

      <rect width="320" height="180" fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}
