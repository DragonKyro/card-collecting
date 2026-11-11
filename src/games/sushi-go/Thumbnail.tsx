// Hero art for Sushi Go! Party (picker tile, lobby banner): a lantern-lit
// sushi bar — lacquer-red wall in seigaiha waves, two paper lanterns, a
// conveyor belt carrying plates to the left behind a fanned hand of three
// cards (maki, salmon nigiri, gyoza) drawn in the game's own card style.
// Ambient motion: the belt runs, the lanterns sway and glow, sparkles twinkle.
// Every id comes from useSvgIds (the scene can be on screen twice).

import type { CSSProperties, ReactNode } from 'react';
import { LightPool, SoftShadow, Vignette, useSvgIds, type SvgIds } from '@/core/svg';

const INK = '#1c1a2e';
const LINE_INK = '#3a2a14';
const RICE = '#fbf8ef';
const NORI = '#1f2a1d';
const SALMON = '#f7894f';
const TUNA = '#d93f4c';
const TAMAGO = '#ffe066';
const line = { stroke: LINE_INK, strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

/** One plate's worth of sushi on the belt, ~22 units wide, centred on 0,0. */
function PlateSushi({ kind }: { kind: 'salmon' | 'tuna' | 'egg' | 'maki' | 'gyoza' }) {
  const s = { stroke: LINE_INK, strokeWidth: 0.8, strokeLinejoin: 'round' } as const;
  if (kind === 'maki') {
    return (
      <>
        {[-5.5, 5.5].map((x) => (
          <g key={x}>
            <circle cx={x} cy={-4} r={5} fill={NORI} {...s} />
            <circle cx={x} cy={-4} r={3.6} fill={RICE} />
            <circle cx={x} cy={-4} r={1.6} fill={TUNA} />
          </g>
        ))}
      </>
    );
  }
  if (kind === 'gyoza') {
    return <path d="M-10 0 Q-9 -10 0 -10 Q9 -10 10 0 Q0 3 -10 0 Z" fill="#f4e2b8" {...s} />;
  }
  return (
    <>
      <ellipse cx={0} cy={-2} rx={9} ry={3.6} fill={RICE} {...s} />
      {kind === 'egg' ? (
        <>
          <rect x={-9.5} y={-8} width={19} height={5} rx={1.2} fill={TAMAGO} {...s} />
          <rect x={-1.6} y={-8.6} width={3.2} height={9} fill={NORI} />
        </>
      ) : (
        <path d="M-10 -2 Q-10 -9 0 -9 Q10 -9 10 -3 Q0 -5 -10 -1 Z" fill={kind === 'salmon' ? SALMON : TUNA} {...s} />
      )}
    </>
  );
}

const BELT: Array<{ kind: 'salmon' | 'tuna' | 'egg' | 'maki' | 'gyoza'; rim: string }> = [
  { kind: 'salmon', rim: '#3d7fd1' },
  { kind: 'maki', rim: '#d6402f' },
  { kind: 'egg', rim: '#e0a92a' },
  { kind: 'gyoza', rim: '#3d7fd1' },
  { kind: 'tuna', rim: '#d6402f' },
];

/** A game card, 66 × 92 centred on 0,0, holding a 100-unit art box. */
function HeroCard({ id, x, y, rot, color, children }: { id: SvgIds; x: number; y: number; rot: number; color: string; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-33} y={-46} width={66} height={92} rx={7} fill={color} stroke={INK} strokeWidth={2} filter={id.url('shadow')} />
      <rect x={-31} y={-44} width={62} height={44} rx={6} fill={id.url('gloss')} />
      <circle cx={0} cy={-6} r={26} fill={id.url('plate')} />
      <rect x={8} y={-41} width={21} height={7} rx={2} fill="#fff" opacity={0.82} />
      <g transform="translate(-28 -36) scale(0.56)">{children}</g>
      <path d="M-31 31 H31 V39 Q31 44 26 44 H-26 Q-31 44 -31 39 Z" fill="#fff" opacity={0.74} />
      <path d="M-13 37.5 H13" stroke={INK} strokeOpacity={0.35} strokeWidth={2.4} strokeLinecap="round" />
      <rect x={-31.5} y={-44.5} width={63} height={89} rx={6} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1} />
    </g>
  );
}

function Lantern({ id, cx, delay }: { id: SvgIds; cx: number; delay: string }) {
  return (
    <g style={{ transformBox: 'fill-box', transformOrigin: '50% 0%', animation: `cc-sway 5.5s ease-in-out ${delay} infinite` }}>
      <path d={`M${cx} 4 V14`} stroke="#1b0b08" strokeWidth={1.5} />
      <rect x={cx - 9} y={12} width={18} height={5} rx={1.5} fill="#2a120d" />
      <ellipse cx={cx} cy={40} rx={21} ry={24} fill={id.url('lantern')} />
      {[-16, -8, 0, 8, 16].map((dy) => {
        const w = 21 * Math.sqrt(1 - (dy / 24) ** 2);
        return <path key={dy} d={`M${cx - w} ${40 + dy} Q${cx} ${43 + dy} ${cx + w} ${40 + dy}`} stroke="#8e1c14" strokeOpacity={0.5} fill="none" />;
      })}
      <path d={`M${cx - 11} 26 Q${cx - 15} 40 ${cx - 11} 54`} stroke="#fff3d0" strokeOpacity={0.5} strokeWidth={2} fill="none" strokeLinecap="round" />
      <rect x={cx - 9} y={62} width={18} height={5} rx={1.5} fill="#2a120d" />
      <path d={`M${cx} 67 V80 M${cx - 2.5} 69 V78 M${cx + 2.5} 69 V78`} stroke="#e0a43a" strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

function Sparkle({ x, y, s, delay }: { x: number; y: number; s: number; delay: string }) {
  return (
    <path
      d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`}
      fill="#fff6dc"
      className="cc-anim-twinkle"
      style={{ animationDelay: delay }}
    />
  );
}

export function SushiGoThumbnail() {
  const id = useSvgIds();
  const plates = [...BELT, ...BELT];
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="Sushi Go! Party">
      <defs>
        {/* Seigaiha: rows of scales, each lower row drawn over the one above. */}
        <pattern id={id('waves')} width={16} height={8} patternUnits="userSpaceOnUse">
          {[[8, -4], [0, 0], [16, 0], [8, 4], [0, 8], [16, 8], [8, 12]].map(([cx, cy], i) => (
            <g key={i} stroke="#ffc98a" strokeOpacity={0.16} strokeWidth={0.7}>
              <circle cx={cx} cy={cy} r={8} fill="#4a1410" />
              <circle cx={cx} cy={cy} r={5.6} fill="none" />
              <circle cx={cx} cy={cy} r={3.2} fill="none" />
            </g>
          ))}
        </pattern>
        <linearGradient id={id('wallShade')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a0806" stopOpacity={0.55} />
          <stop offset="0.5" stopColor="#2a0806" stopOpacity={0} />
          <stop offset="1" stopColor="#120302" stopOpacity={0.7} />
        </linearGradient>
        <radialGradient id={id('lantern')} cx="45%" cy="45%" r="60%">
          <stop offset="0" stopColor="#ffe3a0" />
          <stop offset="0.45" stopColor="#ff8a4a" />
          <stop offset="1" stopColor="#b3241a" />
        </radialGradient>
        <LightPool id={id('lamp')} color="#ffad5c" opacity={0.55} />
        <LightPool id={id('spot')} color="#ffd9a0" opacity={0.3} />
        <LightPool id={id('plate')} color="#ffffff" opacity={0.45} />
        <linearGradient id={id('gloss')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.42} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={id('counter')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e2b277" />
          <stop offset="0.12" stopColor="#c8894c" />
          <stop offset="1" stopColor="#6e3c1b" />
        </linearGradient>
        <linearGradient id={id('belt')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4a423d" />
          <stop offset="1" stopColor="#25201d" />
        </linearGradient>
        <SoftShadow id={id('shadow')} dy={3} blur={3} opacity={0.55} />
        <Vignette id={id('vig')} inner={0.5} opacity={0.65} />
      </defs>

      {/* Wall, lantern light, the bar's back shelf */}
      <rect width={320} height={112} fill={id.url('waves')} />
      <rect width={320} height={112} fill={id.url('wallShade')} />
      <rect width={320} height={6} fill="#24100b" />
      <circle cx={40} cy={42} r={78} fill={id.url('lamp')} className="cc-anim-flicker" />
      <circle cx={282} cy={42} r={78} fill={id.url('lamp')} className="cc-anim-flicker" style={{ animationDelay: '1.3s' }} />
      <circle cx={160} cy={70} r={110} fill={id.url('spot')} />
      <g opacity={0.85}>
        <path d="M0 94 H66 M254 94 H320" stroke="#1d0906" strokeWidth={3} />
        <path d="M12 94 v-12 q0 -4 3 -6 v-6 h4 v6 q3 2 3 6 v12 Z M300 94 v-12 q0 -4 3 -6 v-6 h4 v6 q3 2 3 6 v12 Z" fill="#2a0d09" />
        <path d="M34 94 q-2 -12 10 -12 q12 0 10 12 Z M268 94 v-14 h16 v14 Z" fill="#2a0d09" />
      </g>
      <Lantern id={id} cx={40} delay="0s" />
      <Lantern id={id} cx={282} delay="-2.6s" />

      {/* Conveyor belt — plates ride off to the left, as the hands pass */}
      <rect x={0} y={100} width={320} height={18} fill={id.url('belt')} />
      <g style={{ animation: 'cc-scroll-x 40s linear infinite', '--cc-drift-w': '320px' } as CSSProperties}>
        {Array.from({ length: 80 }, (_, i) => (
          <path key={i} d={`M${i * 8} 102 v14`} stroke="#000" strokeOpacity={0.25} />
        ))}
        {plates.map((p, i) => (
          <g key={i} transform={`translate(${32 + i * 64} 111)`}>
            <ellipse cx={0} cy={0} rx={15} ry={5.5} fill="#f7f1e3" stroke={p.rim} strokeWidth={2} />
            <PlateSushi kind={p.kind} />
          </g>
        ))}
      </g>
      <rect x={0} y={99} width={320} height={2.5} fill="#b9b2a8" />
      <rect x={0} y={117} width={320} height={2.5} fill="#8c857c" />

      {/* Counter */}
      <rect x={0} y={119} width={320} height={61} fill={id.url('counter')} />
      <path d="M0 132 Q80 128 160 133 T320 130 M0 150 Q100 146 190 151 T320 148 M0 166 Q70 163 150 167 T320 165" stroke="#5a2e12" strokeOpacity={0.35} fill="none" />
      <ellipse cx={160} cy={130} rx={104} ry={7} fill="#000" opacity={0.28} />
      <g transform="translate(38 152)">
        <ellipse rx={20} ry={6.5} fill="#f7f1e3" stroke={LINE_INK} strokeWidth={1} />
        <ellipse rx={13} ry={3.8} fill="#3b2216" />
      </g>
      <g transform="translate(244 170) rotate(-22)">
        <rect x={0} y={-6} width={92} height={4.5} rx={2.2} fill="#d9a35b" stroke={LINE_INK} strokeWidth={0.8} />
        <rect x={4} y={2} width={92} height={4.5} rx={2.2} fill="#c98f45" stroke={LINE_INK} strokeWidth={0.8} />
      </g>

      {/* The hand */}
      <HeroCard id={id} x={99} y={87} rot={-15} color="#e5584a">
        {[29, 71].map((x) => (
          <g key={x}>
            <circle cx={x} cy={50} r={19} fill={NORI} {...line} />
            <circle cx={x} cy={50} r={14.4} fill={RICE} />
            <circle cx={x} cy={50} r={6} fill={TUNA} />
          </g>
        ))}
      </HeroCard>
      <HeroCard id={id} x={221} y={87} rot={15} color="#7b90e4">
        <ellipse cx={50} cy={74} rx={38} ry={6} fill="#000" opacity={0.15} />
        <path d="M12 66 Q14 34 50 32 Q86 34 88 66 Q50 76 12 66 Z" fill="#f4e2b8" {...line} />
        <path d="M13.5 61 Q50 72 86.5 61 Q87.5 64 88 66 Q50 76 12 66 Q12.5 63 13.5 61 Z" fill="#c98a3a" />
        {[[24, 44], [34, 38], [44, 35], [56, 35], [66, 38], [76, 44]].map(([x, y]) => (
          <path key={x} d={`M${x} ${y} q4 5 2 11`} stroke="#c9a86a" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        ))}
      </HeroCard>
      <HeroCard id={id} x={160} y={74} rot={0} color="#f5c33b">
        <ellipse cx={50} cy={84} rx={30} ry={4} fill="#000" opacity={0.15} />
        <path d="M20 70 Q20 58 50 57 Q80 58 80 70 Q80 82 50 82 Q20 82 20 70 Z" fill={RICE} {...line} />
        <path d="M14 62 Q14 44 50 42 Q86 42 86 60 Q86 68 76 66 Q50 62 24 68 Q14 70 14 62 Z" fill={SALMON} {...line} />
        {[30, 43, 56, 69].map((x) => (
          <path key={x} d={`M${x} 46 q5 9 1 18`} stroke="#fde1c8" strokeWidth={3} fill="none" strokeLinecap="round" />
        ))}
      </HeroCard>
      <Sparkle x={198} y={28} s={5} delay="0s" />
      <Sparkle x={118} y={38} s={3.5} delay="1.1s" />
      <Sparkle x={240} y={56} s={3} delay="2.2s" />

      <rect width={320} height={180} fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}
