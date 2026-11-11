// Hero art for Machi Koro (picker tile, lobby banner): a toy town at golden
// hour — a low sun behind the Ferris wheel, hazy hills, a wheat field and a
// barn, the radio tower, bakery, office tower and café under a string of
// bunting, and two big dice with coins on the cobbles in front. Every id
// comes from useSvgIds (the scene can be on screen twice). Ambient motion:
// the wheel turns, the tower light blinks, a cloud drifts. Self-contained so
// the picker bundle doesn't pull in art.tsx.

import { Glow, LightPool, SoftShadow, Vignette, useSvgIds } from '@/core/svg';

const INK = '#3b2a20';
const LINE = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const THIN = { stroke: INK, strokeWidth: 0.9, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const RIM = '#ffe7a8';
const LIT = '#ffd77a';
const GLASS = '#9fcbe6';
const SHADE = '#2a1838';

export function MachiKoroThumbnail() {
  const id = useSvgIds();
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="Machi Koro">
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c4a94" />
          <stop offset="0.36" stopColor="#8b84c6" />
          <stop offset="0.56" stopColor="#f3a07a" />
          <stop offset="0.72" stopColor="#ffd48c" />
        </linearGradient>
        <LightPool id={id('sun')} color="#ffe6a0" opacity={0.95} />
        <radialGradient id={id('disc')} cx="45%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="1" stopColor="#ffcc55" />
        </radialGradient>
        <linearGradient id={id('hill')} x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stopColor="#367f45" />
          <stop offset="0.7" stopColor="#6fbb58" />
          <stop offset="1" stopColor="#a6d873" />
        </linearGradient>
        <linearGradient id={id('street')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dcb27c" />
          <stop offset="1" stopColor="#8e6847" />
        </linearGradient>
        <radialGradient id={id('coin')} cx="38%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.6" stopColor="#f6c443" />
          <stop offset="1" stopColor="#c98d16" />
        </radialGradient>
        <Glow id={id('lamp')} color="#ffcf5a" blur={2.2} strength={0.9} />
        <SoftShadow id={id('shadow')} dy={2.5} blur={2.2} opacity={0.45} />
        <Vignette id={id('vig')} color="#170d2c" inner={0.5} opacity={0.62} />
      </defs>

      {/* sky, sun, clouds */}
      <rect width={320} height={180} fill={id.url('sky')} />
      <circle cx={238} cy={64} r={120} fill={id.url('sun')} />
      <circle cx={238} cy={64} r={14} fill={id.url('disc')} />
      <g className="cc-anim-drift">
        <Cloud x={70} y={40} />
      </g>
      <Cloud x={176} y={24} s={0.75} />
      {[[26, 16], [118, 12], [300, 20]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.9} fill="#fff6dc" opacity={0.7} />)}

      {/* far hills with a distant village */}
      <path d="M0 92 Q50 78 110 88 T220 82 T320 86 V130 H0 Z" fill="#8aae9c" />
      <g fill="#6f9486">
        <rect x={30} y={83} width={6} height={5} /><rect x={38} y={84} width={5} height={4} />
        <rect x={190} y={79} width={6} height={5} /><rect x={198} y={80} width={4} height={4} />
      </g>

      {/* everything from here to the dice, zoomed in on the town */}
      <g transform="translate(160 110) scale(1.13) translate(-160 -124)">
      {/* Ferris wheel, backlit by the sun */}
      <path d="M262 120 L276 66 L290 120" fill="none" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M262 120 L276 66 L290 120" fill="none" stroke="#a8a2b8" strokeWidth={2} strokeLinejoin="round" />
      <g style={{ transformBox: 'view-box', transformOrigin: '276px 66px', animation: 'cc-spin 40s linear infinite' }}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (Math.PI / 4) * i;
          return <path key={i} d={`M276 66 L${276 + Math.cos(a) * 30} ${66 + Math.sin(a) * 30}`} stroke={INK} strokeWidth={0.9} />;
        })}
        <circle cx={276} cy={66} r={30} fill="none" stroke={INK} strokeWidth={3.6} />
        <circle cx={276} cy={66} r={30} fill="none" stroke="#ef5a4c" strokeWidth={1.8} />
        {['#ef5a4c', '#f6c443', '#3e78b3', '#8fd16a', '#f28bb0', '#f08a24', '#8e5bc4', '#3fb6b0'].map((c, i) => {
          const a = (Math.PI / 4) * i + Math.PI / 8;
          return <circle key={i} cx={276 + Math.cos(a) * 30} cy={66 + Math.sin(a) * 30} r={3.6} fill={c} {...THIN} />;
        })}
      </g>
      <circle cx={276} cy={66} r={3.2} fill="#f6c443" {...THIN} />

      {/* green hill, wheat field, barn */}
      <path d="M0 116 Q70 98 150 112 T320 106 V180 H0 Z" fill={id.url('hill')} />
      <path d="M0 113 Q30 104 64 108 L70 124 L0 126 Z" fill="#f0c25a" {...THIN} />
      <path d="M6 116 L62 111 M4 120 L66 116 M2 124 L68 121" stroke="#c99636" strokeWidth={1} fill="none" />
      <g filter={id.url('shadow')}>
        <rect x={10} y={106} width={24} height={18} fill="#d9473b" {...LINE} />
        <path d="M7 108 L22 97 L37 108 Z" fill="#9b2f2b" {...LINE} />
        <rect x={17} y={113} width={10} height={11} fill="#b93a31" {...THIN} />
        <path d="M17 113 L27 124 M27 113 L17 124" stroke="#fff6e2" strokeWidth={1.3} />
      </g>

      {/* radio tower: red light blinking at the top */}
      <RadioTower />
      <circle cx={68} cy={40} r={5} fill="#ff6a4a" opacity={0.35} className="cc-anim-twinkle" />
      <circle cx={68} cy={40} r={2.3} fill="#ff5a4a" {...THIN} />

      {/* cast shadows: the low sun throws them to the left */}
      <g fill={SHADE} opacity={0.22}>
        <path d="M78 124 H124 L104 132 H52 Z" />
        <path d="M132 124 H166 L146 133 H100 Z" />
        <path d="M174 124 H218 L198 132 H150 Z" />
        <path d="M224 124 H252 L238 131 H206 Z" />
      </g>

      {/* the town */}
      <g filter={id.url('shadow')}>
        {/* office tower */}
        <path d="M149 39 V33" stroke={INK} strokeWidth={1.3} />
        <circle cx={149} cy={32.5} r={1.6} fill="#e2513f" />
        <rect x={132} y={44} width={34} height={80} fill="#ece7fa" {...LINE} />
        <rect x={129} y={39} width={40} height={7} rx={1} fill="#7a56b8" {...LINE} />
        <path d="M165 46 V123" stroke={RIM} strokeWidth={1.6} />
        {Array.from({ length: 8 }, (_, r) => Array.from({ length: 3 }, (_, c) => (
          <rect key={`${r}.${c}`} x={136.5 + c * 9.6} y={50 + r * 9} width={6} height={5.4} rx={0.6} fill={(r * 3 + c) % 4 === 1 || (r + c) % 5 === 0 ? LIT : GLASS} {...THIN} />
        )))}

        {/* bakery */}
        <rect x={78} y={96} width={46} height={28} fill="#fde3b5" {...LINE} />
        <rect x={75} y={91} width={52} height={6} rx={1} fill="#8a5a32" {...LINE} />
        <Awning x={78} y={100} w={46} colors={['#e2513f', '#fff6e2']} />
        <rect x={82} y={109} width={20} height={12} fill={LIT} {...THIN} />
        <rect x={108} y={107} width={11} height={17} fill="#7a4a26" {...THIN} />
        <ellipse cx={101} cy={84} rx={13} ry={6} fill="#d98f45" {...LINE} />
        <path d="M93 81 q2 3 0 6 M101 79.5 q2 4 0 8 M109 81 q2 3 0 6" stroke="#f3cf93" strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <path d="M123 98 V123" stroke={RIM} strokeWidth={1.4} />

        {/* café */}
        <rect x={174} y={100} width={44} height={24} fill="#cfe9d4" {...LINE} />
        <rect x={171} y={96} width={50} height={5} rx={1} fill="#3f7d5b" {...LINE} />
        <Awning x={174} y={104} w={44} colors={['#3aa45f', '#fff6e2']} />
        <rect x={178} y={112} width={18} height={10} fill={LIT} {...THIN} />
        <rect x={201} y={110} width={12} height={14} fill="#3f7d5b" {...THIN} />
        <path d="M188 80 H204 L202.5 90 Q196 93 189.5 90 Z" fill="#ffffff" {...LINE} />
        <circle cx={205.5} cy={84} r={2.6} fill="none" stroke={INK} strokeWidth={1.3} />
        <path d="M193 77 q2 -3 0 -6 M199 77 q2 -3 0 -6" stroke="#fff6e2" strokeWidth={1.2} fill="none" strokeLinecap="round" opacity={0.85} />
        <path d="M217 102 V123" stroke={RIM} strokeWidth={1.4} />

        {/* little house + tree */}
        <rect x={224} y={106} width={28} height={18} fill="#fff1c4" {...LINE} />
        <path d="M220 108 L238 94 L256 108 Z" fill="#3e78b3" {...LINE} />
        <rect x={229} y={111} width={8} height={7} fill={LIT} {...THIN} />
        <rect x={241} y={113} width={7} height={11} fill="#7a4a26" {...THIN} />
        <rect x={259} y={112} width={3} height={12} fill="#7a4a26" {...THIN} />
        <circle cx={260.5} cy={108} r={8} fill="#5cb85c" {...LINE} />
        <path d="M264 103 a6 6 0 0 1 2.5 6" stroke={RIM} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      </g>

      {/* bunting strung from the bakery to the café */}
      <path d="M126 92 Q150 112 172 97" fill="none" stroke={INK} strokeWidth={0.9} />
      {Array.from({ length: 7 }, (_, i) => {
        const t = 0.1 + i * 0.13;
        const x = (1 - t) ** 2 * 126 + 2 * (1 - t) * t * 150 + t * t * 172;
        const y = (1 - t) ** 2 * 92 + 2 * (1 - t) * t * 112 + t * t * 97;
        const c = ['#ef5a4c', '#ffd23f', '#3e9bd6', '#58b85c'][i % 4];
        return <path key={i} d={`M${x - 3} ${y} H${x + 3} L${x} ${y + 6} Z`} fill={c} {...THIN} />;
      })}

      {/* cobbled street */}
      <rect x={0} y={124} width={320} height={56} fill={id.url('street')} />
      <rect x={0} y={123} width={320} height={3} fill="#efd6a8" />
      <g fill="none" stroke="#6d4f33" strokeWidth={0.8} opacity={0.35}>
        {Array.from({ length: 4 }, (_, r) => Array.from({ length: 12 }, (_, c) => (
          <ellipse key={`${r}.${c}`} cx={c * 28 + (r % 2) * 14 + 6} cy={133 + r * 12} rx={10 + r * 1.5} ry={3.5 + r * 0.6} />
        )))}
      </g>

      {/* street lamp, already lit */}
      <circle cx={236} cy={99} r={13} fill={id.url('sun')} />
      <path d="M236 134 V102" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M236 134 V102" stroke="#4a5568" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M231 134 H241" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M231.5 96 H240.5 L239 103 H233 Z" fill="#ffe08a" filter={id.url('lamp')} {...THIN} />
      <path d="M230.5 96 L236 91.5 L241.5 96 Z" fill="#3f4a5c" {...THIN} />

      {/* dice and coins on the cobbles */}
      <ellipse cx={142} cy={140} rx={46} ry={5} fill={SHADE} opacity={0.3} />
      <g filter={id.url('shadow')}>
        <Die x={106} y={110} s={27} front={5} />
        <g transform="rotate(-7 168 128)"><Die x={152} y={115} s={24} front={6} /></g>
        <Coin x={96} y={133} r={7} />
        <ellipse cx={194} cy={137} rx={10} ry={3.6} fill="#c98d16" {...THIN} />
        <ellipse cx={194} cy={134} rx={10} ry={3.6} fill="#e3a92a" {...THIN} />
        <ellipse cx={194} cy={131} rx={10} ry={3.6} fill={id.url('coin')} {...THIN} />
      </g>
      <path d="M210 118 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4 Z" fill="#fff6c8" filter={id.url('lamp')} />

      </g>

      {/* warm evening light over everything, then the vignette */}
      <circle cx={238} cy={64} r={150} fill={id.url('sun')} opacity={0.22} pointerEvents="none" />
      <rect width={320} height={180} fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx={0} cy={4} rx={20} ry={6} fill="#f2b9a2" />
      <ellipse cx={0} cy={2} rx={19} ry={6} fill="#ffe9d8" />
      <circle cx={-7} cy={-1} r={7} fill="#ffe9d8" />
      <circle cx={5} cy={-3} r={9} fill="#fff1e2" />
    </g>
  );
}

function Awning({ x, y, w, colors }: { x: number; y: number; w: number; colors: [string, string] }) {
  const n = 6;
  const sw = w / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${x + i * sw} ${y} h${sw} v5 a${sw / 2} ${sw / 2.4} 0 0 1 ${-sw} 0 Z`} fill={colors[i % 2]} {...THIN} />
      ))}
    </g>
  );
}

/** Red-and-white lattice tower, x 62–74, apex at y 44. */
function RadioTower() {
  const half = (y: number) => 1.2 + ((y - 44) / 80) * 4.8;
  const band = (y0: number, y1: number) => `M${68 - half(y0)} ${y0} H${68 + half(y0)} L${68 + half(y1)} ${y1} H${68 - half(y1)} Z`;
  return (
    <g>
      <path d={band(44, 124)} fill="#efe6da" {...LINE} />
      {[[44, 56], [68, 80], [92, 104], [114, 124]].map(([a, b]) => <path key={a} d={band(a, b)} fill="#d9473b" {...THIN} />)}
      <path d="M68 42 V44" stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

const PIPS: Record<number, [number, number][]> = {
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** A die drawn as a little cube: front face, lit top, shaded right side. */
function Die({ x, y, s, front }: { x: number; y: number; s: number; front: 5 | 6 }) {
  const d = s * 0.34;
  const up = d * 0.62;
  const c = s / 2;
  const step = s * 0.27;
  return (
    <g>
      <path d={`M${x} ${y} L${x + d} ${y - up} H${x + s + d} L${x + s} ${y} Z`} fill="#ffffff" {...LINE} />
      <path d={`M${x + s} ${y} L${x + s + d} ${y - up} V${y + s - up} L${x + s} ${y + s} Z`} fill="#e8d2ae" {...LINE} />
      <rect x={x} y={y} width={s} height={s} rx={2.5} fill="#fff6e6" {...LINE} />
      <ellipse cx={x + c + d / 2} cy={y - up / 2} rx={s * 0.1} ry={s * 0.055} fill="#d23c3c" />
      {PIPS[front].map(([px, py], i) => <circle key={i} cx={x + c + px * step} cy={y + c + py * step} r={s * 0.085} fill="#2b2118" />)}
    </g>
  );
}

function Coin({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#f6c443" {...LINE} />
      <circle cx={x} cy={y} r={r * 0.68} fill="none" stroke="#c98d16" strokeWidth={0.9} />
      <path d={`M${x - r * 0.3} ${y - r * 0.5} a${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.75} ${r * 0.2}`} stroke="#fff7cc" strokeWidth={1.1} fill="none" strokeLinecap="round" />
    </g>
  );
}
