// 7 Wonders Duel — hero art for the picker tile and the lobby banner.
//
// Two rival capitals at dusk — a red-lit pyramid and temple on the left, a
// blue-lit lighthouse on the right — and between them, on a marble table, the
// Age I card structure: face-up rows over face-down Age backs, the accessible
// front row edged in gold, one card lifted. The bronze conflict pawn stands to
// one side, Progress tokens glint on the other. Ambient: the lifted card
// floats, the lighthouse flame flickers, the tokens glint.
//
// Self-contained (nothing from art.tsx, so the picker bundle stays small).
// Every id comes from useSvgIds: the tile and the lobby banner can both be on
// screen.

import { SoftShadow, Glow, Vignette, LightPool, useSvgIds } from '@/core/svg';

const INK = '#1d140c';
/** Cards are drawn 28 × 40 and scaled up. */
const S = 1.2;
const STEP_X = 36;
const STEP_Y = 17;
const CARD_W = 28 * S;
const CARD_H = 40 * S;

type Mark = 'shield' | 'coin' | 'leaf' | 'gear' | 'col';

/** A face-up card in the game's style: colour frame, effect band, art window, name strip. */
function MiniCard({ x, y, color, mark }: { x: number; y: number; color: string; mark: Mark }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${S})`}>
      <rect width={28} height={40} rx={3} fill={color} stroke={INK} strokeWidth={1} />
      <rect x={0.6} y={0.6} width={26.8} height={10} rx={2.6} fill="rgba(0,0,0,0.2)" />
      <rect x={3} y={11.5} width={22} height={20} rx={1.2} fill="#cfe6f1" stroke={INK} strokeWidth={0.5} />
      <path d="M3 26 Q14 22 25 25.5 V31.5 H3 Z" fill="#93c46a" />
      {mark === 'col' ? (
        <g fill="#f3ecda" stroke={INK} strokeWidth={0.45}>
          <path d="M7 18 L14 14 L21 18 Z" />
          {[8.5, 12.5, 16.5].map((cx) => <rect key={cx} x={cx} y={18.4} width={2.4} height={8} />)}
        </g>
      ) : (
        <g stroke={INK} strokeWidth={0.45}>
          <rect x={7} y={19} width={8} height={8} fill="#f3ecda" />
          <path d="M6 19 L11 15 L16 19 Z" fill="#b9563c" />
          <rect x={17} y={21} width={5} height={6} fill="#ddd0b4" />
        </g>
      )}
      <rect x={0.6} y={32.4} width={26.8} height={7} rx={2.4} fill="rgba(0,0,0,0.35)" />
      <rect x={7} y={35.2} width={14} height={1.4} rx={0.7} fill="rgba(255,255,255,0.75)" />
      <g transform="translate(14 5.6)">
        {mark === 'shield' && <path d="M0 -4 L3.6 -2.6 V0.4 C3.6 2.6 2 3.8 0 4.6 C-2 3.8 -3.6 2.6 -3.6 0.4 V-2.6 Z" fill="#c8372d" stroke={INK} strokeWidth={0.6} />}
        {mark === 'coin' && <circle r={3.6} fill="#f2c443" stroke="#7a5206" strokeWidth={0.7} />}
        {mark === 'leaf' && <circle r={3.6} fill="#fbf2da" stroke={INK} strokeWidth={0.6} />}
        {mark === 'gear' && <circle r={3.4} fill="#8e979f" stroke={INK} strokeWidth={0.9} strokeDasharray="1.4 0.9" />}
        {mark === 'col' && <path d="M-3.6 -1.6 L0 -4 L3.6 -1.6 Z M-2.4 -1 V3 M0 -1 V3 M2.4 -1 V3" stroke={INK} strokeWidth={0.7} fill="#f3ecda" />}
      </g>
      {/* rim light from the dusk sun */}
      <path d="M2.4 1 H25.6" stroke="rgba(255,240,200,0.6)" strokeWidth={0.8} strokeLinecap="round" />
    </g>
  );
}

/** A face-down Age I card. */
function MiniBack({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${S})`}>
      <rect width={28} height={40} rx={3} fill="#9a4f22" stroke={INK} strokeWidth={1} />
      <rect x={2.4} y={2.4} width={23.2} height={35.2} rx={2} fill="none" stroke="#f0c27a" strokeWidth={0.8} />
      <path d="M11 8 L14 4.6 L17 8 Z" fill="#f0c27a" opacity={0.85} />
      <circle cx={14} cy={20} r={7} fill="#7a3a16" stroke="#f0c27a" strokeWidth={0.9} />
      <path d="M14 16.4 V23.6" stroke="#f0c27a" strokeWidth={1.6} />
    </g>
  );
}

/** A Progress token lying on the table: a green disc in a gold rim. */
function Token({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={2.2} rx={13} ry={6.4} fill="#1a4f30" />
      <ellipse cx={0} cy={0} rx={13} ry={6.4} fill="#2f8752" stroke="#e5c368" strokeWidth={1.1} />
      <ellipse cx={0} cy={0} rx={9} ry={4.2} fill="none" stroke="#e5c368" strokeWidth={0.7} />
      <path d="M-3.4 0.8 L0 -2.4 L3.4 0.8 Z M-2.2 1 V2.4 M2.2 1 V2.4" stroke="#f2d27a" strokeWidth={0.8} fill="#f2d27a" />
      <path d="M-9 -2.6 Q-3 -6 4 -5.6" stroke="rgba(255,255,255,0.45)" strokeWidth={1} fill="none" strokeLinecap="round" />
    </g>
  );
}

export function SevenWondersDuelThumbnail() {
  const id = useSvgIds();
  // The structure, back row first (face up, face down, face up, the accessible front row).
  const rows: { n: number; up: boolean; colors?: string[] }[] = [
    { n: 2, up: true, colors: ['#3f9a4b', '#2f6fb2'] },
    { n: 3, up: false },
    { n: 4, up: true, colors: ['#e3a923', '#8f5b2c', '#9aa2aa', '#3f9a4b'] },
    { n: 5, up: true, colors: ['#2f6fb2', '#8f5b2c', '', '#e3a923', '#3f9a4b'] },
  ];
  const marks: Mark[] = ['leaf', 'gear', 'col', 'coin'];
  const top = 15;
  const frontY = top + 3 * STEP_Y;
  const frontX = 160 - (5 * STEP_X - (STEP_X - CARD_W)) / 2;
  const glints = [[42, 114], [64, 121], [263, 78]] as const;
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="7 Wonders Duel">
      <defs>
        <linearGradient id={id('sky')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#140d22" />
          <stop offset="42%" stopColor="#3a1f33" />
          <stop offset="64%" stopColor="#a5603a" />
          <stop offset="100%" stopColor="#5a3420" />
        </linearGradient>
        <radialGradient id={id('red')} cx="0%" cy="55%" r="62%">
          <stop offset="0%" stopColor="#ff4a3a" stopOpacity={0.62} />
          <stop offset="100%" stopColor="#ff4a3a" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={id('blue')} cx="100%" cy="55%" r="62%">
          <stop offset="0%" stopColor="#3f7dff" stopOpacity={0.62} />
          <stop offset="100%" stopColor="#3f7dff" stopOpacity={0} />
        </radialGradient>
        <LightPool id={id('sun')} color="#ffd98a" opacity={0.8} />
        <LightPool id={id('flame')} color="#ffc65a" opacity={0.85} />
        <linearGradient id={id('marble')} x1="0" x2="0.2" y1="0" y2="1">
          <stop offset="0%" stopColor="#d8c8a6" />
          <stop offset="45%" stopColor="#9c8662" />
          <stop offset="100%" stopColor="#4a3824" />
        </linearGradient>
        <linearGradient id={id('bronze')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#8a2a1c" />
          <stop offset="50%" stopColor="#f2c66a" />
          <stop offset="100%" stopColor="#2a3a7a" />
        </linearGradient>
        <linearGradient id={id('pawn')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#8c1712" />
          <stop offset="45%" stopColor="#ef4b38" />
          <stop offset="100%" stopColor="#9e1c15" />
        </linearGradient>
        <SoftShadow id={id('shadow')} dy={3} blur={2.6} opacity={0.6} />
        <Glow id={id('glow')} color="#ffd970" blur={3.4} strength={0.95} />
        <Vignette id={id('vig')} inner={0.5} opacity={0.72} />
      </defs>

      {/* Sky, the rivals' glows, the sun behind the structure */}
      <rect width={320} height={180} fill={id.url('sky')} />
      <rect width={320} height={180} fill={id.url('red')} />
      <rect width={320} height={180} fill={id.url('blue')} />
      <circle cx={160} cy={92} r={128} fill={id.url('sun')} />
      {[[22, 16], [58, 30], [96, 10], [222, 12], [250, 30], [300, 18]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.9} fill="#fff4dc" opacity={0.7} />
      ))}

      {/* Left capital: a stepped pyramid and a red-lit temple */}
      <path d="M-16 116 L30 50 L76 116 Z" fill="#3a1418" />
      <path d="M30 50 L76 116 H60 Z" fill="#5c1c1e" />
      <path d="M30 50 L76 116 H70 Z" fill="#ff6a50" opacity={0.4} />
      <g fill="#4a1a1c">
        <path d="M44 116 V90 H92 V116 Z" />
        <path d="M40 91 L68 77 L96 91 Z" />
      </g>
      {[50, 59, 68, 77, 86].map((x) => <rect key={x} x={x - 2} y={94} width={4} height={22} fill="#2a0e10" />)}
      <path d="M68 77 L96 91 H90 Z" fill="#ff6a50" opacity={0.55} />

      {/* Right capital: a blue-lit colonnade and the lighthouse */}
      <g fill="#16224a">
        <path d="M238 116 V92 H284 V116 Z" />
        <path d="M234 93 L261 80 L288 93 Z" />
        <path d="M290 116 L295 46 H309 L314 116 Z" />
        <rect x={292} y={40} width={20} height={7} />
      </g>
      {[244, 253, 262, 271, 280].map((x) => <rect key={x} x={x - 1.6} y={96} width={3.2} height={20} fill="#0c1430" />)}
      <path d="M290 116 L295 46 H299 L295 116 Z" fill="#5f8dff" opacity={0.5} />
      <circle cx={302} cy={34} r={22} fill={id.url('flame')} className="cc-anim-flicker" />
      <path d="M296 40 Q302 21 308 40 Z" fill="#ffb347" className="cc-anim-flicker" />
      <path d="M299 40 Q302 30 305 40 Z" fill="#fff0b0" />

      {/* The marble table and its bronze edge (red end to blue end) */}
      <path d="M-10 116 H330 V180 H-10 Z" fill={id.url('marble')} />
      <path d="M14 136 Q90 126 150 142 T306 130 M-4 160 Q70 152 130 168" stroke="#d9c9a8" strokeWidth={0.7} fill="none" opacity={0.45} />
      <rect x={-10} y={113} width={340} height={4} fill={id.url('bronze')} />
      <ellipse cx={160} cy={122} rx={104} ry={9} fill="rgba(30,14,4,0.5)" />

      {/* The card structure */}
      <g filter={id.url('shadow')}>
        {rows.map((row, r) => {
          const y = top + r * STEP_Y;
          const x0 = 160 - ((row.n - 1) * STEP_X + CARD_W) / 2;
          return Array.from({ length: row.n }, (_, i) => {
            const x = x0 + i * STEP_X;
            if (!row.up) return <MiniBack key={`${r}.${i}`} x={x} y={y} />;
            const color = row.colors?.[i];
            if (!color) return null;
            return <MiniCard key={`${r}.${i}`} x={x} y={y} color={color} mark={marks[(r + i) % marks.length]} />;
          });
        })}
      </g>
      {/* The accessible front row: a gold edge; one card lifted and glowing */}
      {[0, 1, 3, 4].map((i) => (
        <rect key={i} x={frontX + i * STEP_X} y={frontY} width={CARD_W} height={CARD_H} rx={3.6} fill="none" stroke="#ffd970" strokeWidth={1.3} opacity={0.85} />
      ))}
      <g className="cc-anim-float" style={{ animationDuration: '3.6s' }}>
        <g filter={id.url('glow')}>
          <MiniCard x={frontX + 2 * STEP_X} y={frontY - 9} color="#c43c2f" mark="shield" />
        </g>
      </g>

      {/* Coins and Progress tokens (left), the conflict pawn (right) */}
      <g filter={id.url('shadow')}>
        <ellipse cx={24} cy={128} rx={11} ry={5} fill="#c99315" stroke="#7a5206" strokeWidth={0.8} />
        <ellipse cx={24} cy={125} rx={11} ry={5} fill="#e7b13a" stroke="#7a5206" strokeWidth={0.8} />
        <ellipse cx={24} cy={122} rx={11} ry={5} fill="#f2c443" stroke="#7a5206" strokeWidth={0.8} />
        <Token x={46} y={119} />
        <Token x={68} y={127} />
        <g transform="translate(270 76)">
          <ellipse cx={0} cy={46} rx={14} ry={3.8} fill="rgba(0,0,0,0.45)" />
          <circle cx={0} cy={24} r={22} fill="#ff4a3a" opacity={0.22} />
          <path d="M-10 12 L-8 2 H8 L10 12 V38 L7 45 H-7 L-10 38 Z" fill={id.url('pawn')} stroke={INK} strokeWidth={1.2} />
          <path d="M-8 2 H8 L5.6 -3.4 H-5.6 Z" fill="#f06a52" stroke={INK} strokeWidth={1} />
          <path d="M0 14 V34 M-5.6 20 H5.6" stroke="#ffe7a6" strokeWidth={2} strokeLinecap="round" />
          <path d="M-6.6 6 V36" stroke="rgba(255,220,200,0.55)" strokeWidth={1.2} strokeLinecap="round" />
        </g>
      </g>
      {glints.map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y - 5} L${x + 1.2} ${y - 1.2} L${x + 5} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 5} L${x - 1.2} ${y + 1.2} L${x - 5} ${y} L${x - 1.2} ${y - 1.2} Z`}
          fill="#fffbe8"
          className="cc-anim-twinkle"
          style={{ animationDelay: `${i * 1.1}s` }}
        />
      ))}

      <rect width={320} height={180} fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}
