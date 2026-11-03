// Jaipur — hand-drawn SVG art: the seven card faces, the card back, goods /
// bonus / camel tokens and the Seal of Excellence. Flat fills and no <defs>,
// so any number of cards can share a page without id clashes.
//
// Card art is drawn in a 100 × 140 box: a coloured frame, a cream panel with
// a Mughal arch window holding the illustration, a corner pip and a name
// banner. Tokens are drawn in a 40 × 40 box.

import type { ReactNode } from 'react';
import type { JaipurBonusSize, JaipurCardType, JaipurGood } from './types';
import { CARD_INFO } from './cards';

const CREAM = '#fbf3df';
const LINE = '#3b2615';

// ---------------------------------------------------------------------------
// Illustrations (100 × 140 box, centred on x = 50, arch window y ≈ 22–104).

function Gem({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} strokeLinejoin="round">
      <polygon points="-20,-6 -10,-18 10,-18 20,-6 0,22" fill="#e2414c" />
      <polygon points="-10,-18 10,-18 6,-6 -6,-6" fill="#f68b91" />
      <polygon points="-20,-6 -10,-18 -6,-6" fill="#f05a63" />
      <polygon points="20,-6 10,-18 6,-6" fill="#cc2d39" />
      <polygon points="-20,-6 -6,-6 0,22" fill="#c42532" />
      <polygon points="20,-6 6,-6 0,22" fill="#9d1a26" />
      <polygon points="-6,-6 6,-6 0,22" fill="#e2414c" />
      <polygon points="-20,-6 -10,-18 10,-18 20,-6 0,22" fill="none" stroke="#6b0f17" strokeWidth={1.6} />
      <polyline points="-20,-6 20,-6" fill="none" stroke="#6b0f17" strokeWidth={0.9} />
    </g>
  );
}

function Sparkle({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x},${y}) scale(${s})`}
      d="M0 -7 L1.6 -1.6 L7 0 L1.6 1.6 L0 7 L-1.6 1.6 L-7 0 L-1.6 -1.6 Z"
      fill="#fff"
    />
  );
}

function DiamondArt() {
  return (
    <g>
      <Gem x={50} y={60} s={1.15} />
      <Gem x={30} y={88} s={0.55} />
      <Gem x={70} y={90} s={0.62} />
      <Sparkle x={67} y={42} />
      <Sparkle x={33} y={50} s={0.6} />
      <Sparkle x={52} y={96} s={0.5} />
    </g>
  );
}

function Ingot({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} strokeLinejoin="round" stroke="#6e4a06" strokeWidth={1.3}>
      <polygon points="-16,7 16,7 11,-3 -11,-3" fill="#d39a17" />
      <polygon points="-11,-3 11,-3 8,-8 -8,-8" fill="#f8d35c" />
      <line x1={-8} y1={2} x2={8} y2={2} stroke="#f6cd55" strokeWidth={1.2} />
    </g>
  );
}

function GoldArt() {
  return (
    <g>
      <Ingot x={34} y={88} />
      <Ingot x={66} y={88} />
      <Ingot x={50} y={74} />
      <Ingot x={50} y={60} />
      <circle cx={50} cy={40} r={9} fill="#f3c63f" stroke="#6e4a06" strokeWidth={1.3} />
      <circle cx={50} cy={40} r={5.5} fill="none" stroke="#9a6c0b" strokeWidth={1} />
      <Sparkle x={66} y={50} s={0.8} />
      <Sparkle x={30} y={64} s={0.55} />
    </g>
  );
}

function CoinStack({ x, y, n }: { x: number; y: number; n: number }) {
  const coins: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const cy = y - i * 5;
    coins.push(
      <g key={i}>
        <path d={`M${x - 13} ${cy} v4 a13 4.5 0 0 0 26 0 v-4`} fill="#8d98a3" stroke="#3f4952" strokeWidth={1.1} />
        <ellipse cx={x} cy={cy} rx={13} ry={4.5} fill="#d6dde3" stroke="#3f4952" strokeWidth={1.1} />
      </g>,
    );
  }
  return <g>{coins}</g>;
}

function SilverArt() {
  return (
    <g>
      <CoinStack x={34} y={94} n={4} />
      <CoinStack x={64} y={96} n={3} />
      <circle cx={52} cy={54} r={18} fill="#c9d1d8" stroke="#3f4952" strokeWidth={1.4} />
      <circle cx={52} cy={54} r={13.5} fill="#e4e9ed" stroke="#7d8892" strokeWidth={1} />
      <path
        d="M52 44 L54.6 51 L62 51.3 L56.2 55.8 L58.3 63 L52 58.8 L45.7 63 L47.8 55.8 L42 51.3 L49.4 51 Z"
        fill="#9aa5ae"
        stroke="#3f4952"
        strokeWidth={0.8}
      />
      <Sparkle x={70} y={40} s={0.8} />
    </g>
  );
}

/** One folded length of cloth seen from the front: the fold rounds the left edge. */
function FoldedCloth({ x, y, w, h, fill, fold, pattern }: {
  x: number; y: number; w: number; h: number; fill: string; fold: string; pattern: 'stripes' | 'dots' | 'zigzag';
}) {
  const mid = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2.4} fill={fill} stroke="#3d1149" strokeWidth={1.2} />
      <path d={`M${x + 7} ${y + 0.6} Q ${x + 1} ${mid} ${x + 7} ${y + h - 0.6}`} fill="none" stroke={fold} strokeWidth={2.2} />
      {pattern === 'stripes' && (
        <>
          <line x1={x + 10} y1={mid - 2.5} x2={x + w - 3} y2={mid - 2.5} stroke="#e9b52c" strokeWidth={1.8} />
          <line x1={x + 10} y1={mid + 2.5} x2={x + w - 3} y2={mid + 2.5} stroke="#e9b52c" strokeWidth={1.8} />
        </>
      )}
      {pattern === 'dots' && Array.from({ length: Math.floor((w - 14) / 8) }, (_, i) => (
        <circle key={i} cx={x + 13 + i * 8} cy={mid} r={1.7} fill="#f6e3fb" />
      ))}
      {pattern === 'zigzag' && (
        <polyline
          points={Array.from({ length: Math.floor((w - 12) / 5) + 1 }, (_, i) => `${x + 10 + i * 5},${mid + (i % 2 ? 2.5 : -2.5)}`).join(' ')}
          fill="none"
          stroke="#e9b52c"
          strokeWidth={1.4}
        />
      )}
    </g>
  );
}

function ClothArt() {
  return (
    <g strokeLinejoin="round">
      {/* a stack of folded cloths */}
      <FoldedCloth x={16} y={88} w={68} h={15} fill="#7b3592" fold="#5a2270" pattern="stripes" />
      <FoldedCloth x={20} y={74} w={62} h={15} fill="#c38bd6" fold="#a165b8" pattern="zigzag" />
      <FoldedCloth x={18} y={61} w={64} h={14} fill="#9b4fb4" fold="#7b3592" pattern="dots" />
      {[24, 29, 34].map((fx) => (
        <line key={fx} x1={fx} y1={103} x2={fx - 1} y2={108} stroke="#e9b52c" strokeWidth={1.3} strokeLinecap="round" />
      ))}
      {/* the bolt on top */}
      <rect x={24} y={34} width={44} height={24} rx={4} fill="#9b4fb4" stroke="#3d1149" strokeWidth={1.4} />
      <rect x={24} y={39.5} width={44} height={3} fill="#e9b52c" />
      <rect x={24} y={49.5} width={44} height={3} fill="#e9b52c" />
      {[31, 41, 51, 61].map((dx) => (
        <circle key={dx} cx={dx} cy={46} r={1.5} fill="#f3d9fb" />
      ))}
      <ellipse cx={68} cy={46} rx={6.5} ry={12} fill="#b878cc" stroke="#3d1149" strokeWidth={1.4} />
      <ellipse cx={68} cy={46} rx={3.8} ry={7.4} fill="none" stroke="#3d1149" strokeWidth={0.9} />
      <ellipse cx={68} cy={46} rx={1.6} ry={3.1} fill="#3d1149" />
    </g>
  );
}

function SpiceArt() {
  const specks: Array<[number, number]> = [[40, 64], [48, 56], [56, 62], [62, 70], [44, 72], [52, 68], [36, 72], [58, 54]];
  return (
    <g strokeLinejoin="round">
      {/* heap */}
      <path d="M26 76 Q 50 30 74 76 Z" fill="#4f9a3c" stroke="#21481a" strokeWidth={1.3} />
      {specks.map(([sx, sy], i) => (
        <circle key={i} cx={sx} cy={sy} r={1.5} fill={i % 2 ? '#8fd16f' : '#2f6a24'} />
      ))}
      {/* clay bowl */}
      <path d="M20 76 Q 50 112 80 76 Z" fill="#c8693a" stroke="#5a2a10" strokeWidth={1.4} />
      <ellipse cx={50} cy={76} rx={30} ry={5} fill="#a8522a" stroke="#5a2a10" strokeWidth={1.2} />
      <path d="M30 88 Q 50 100 70 88" fill="none" stroke="#f0b37e" strokeWidth={1.6} />
      {/* cardamom pods + a chili */}
      <ellipse cx={22} cy={100} rx={5} ry={2.8} fill="#6fae4f" stroke="#21481a" strokeWidth={1} transform="rotate(-20 22 100)" />
      <ellipse cx={30} cy={104} rx={5} ry={2.8} fill="#5d9c41" stroke="#21481a" strokeWidth={1} transform="rotate(15 30 104)" />
      <path d="M66 102 Q 76 98 84 88" fill="none" stroke="#c4331f" strokeWidth={4} strokeLinecap="round" />
      <path d="M84 88 L87 84" stroke="#2f6a24" strokeWidth={2} strokeLinecap="round" />
      {/* steam of aroma */}
      <path d="M44 38 q -4 -5 0 -10 q 4 -5 0 -10" fill="none" stroke="#7ab65e" strokeWidth={1.4} strokeLinecap="round" />
      <path d="M56 40 q -4 -5 0 -10 q 4 -5 0 -10" fill="none" stroke="#7ab65e" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

const HIDE_PATH = 'M30 40 Q38 33 44 40 Q50 31 56 40 Q62 33 70 40 Q79 51 71 60 Q81 72 71 84 '
  + 'Q63 94 56 86 Q50 96 44 86 Q37 94 29 84 Q19 72 29 60 Q21 51 30 40 Z';

function LeatherArt() {
  return (
    <g strokeLinejoin="round">
      <path d={HIDE_PATH} fill="#9a6236" stroke="#3e220d" strokeWidth={1.5} />
      <path d={HIDE_PATH} fill="none" stroke="#f0d2a8" strokeWidth={1.1} strokeDasharray="3 2.5" transform="translate(50 63) scale(0.8) translate(-50 -63)" />
      <ellipse cx={42} cy={56} rx={5} ry={3} fill="#b67a48" />
      <ellipse cx={58} cy={72} rx={6} ry={3.5} fill="#7f4e28" />
      <ellipse cx={55} cy={52} rx={3} ry={2} fill="#7f4e28" />
      {/* a strap with a brass buckle */}
      <path d="M18 100 Q 50 92 82 100" fill="none" stroke="#5e3517" strokeWidth={6} strokeLinecap="round" />
      <rect x={45} y={91} width={11} height={10} rx={2} fill="none" stroke="#e0b23a" strokeWidth={2.2} />
      <line x1={50.5} y1={92} x2={50.5} y2={100} stroke="#e0b23a" strokeWidth={1.6} />
    </g>
  );
}

const CAMEL_PATH = 'M22 72 C 24 62 32 55 40 55 C 44 42 58 42 60 54 C 63 57 66 58 68 56 '
  + 'L 72 44 C 73 39 77 37 81 38.5 L 86 42 L 85 45.5 L 77.5 46.5 L 73.5 61 C 71 67 69 71 67 73 '
  + 'L 67 98 L 62.5 98 L 61.5 78 L 56 78 L 55 98 L 50.5 98 L 50 78 C 44 80 36 80 32 78 '
  + 'L 33 98 L 28.5 98 L 27 80 L 24.5 98 L 20 98 L 21 76 Z';

export function CamelSilhouette({ fill = '#a8743e', stroke = LINE }: { fill?: string; stroke?: string }) {
  return <path d={CAMEL_PATH} fill={fill} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />;
}

function CamelArt() {
  return (
    <g strokeLinejoin="round">
      <circle cx={30} cy={36} r={9} fill="#f6c453" />
      <path d="M8 104 Q 34 92 58 102 Q 76 94 94 102 L 94 112 L 8 112 Z" fill="#e7c88d" />
      <CamelSilhouette />
      {/* saddle blanket over the hump */}
      <path d="M42 54 Q 50 46 60 54 L 60 66 Q 51 70 42 66 Z" fill="#c4331f" stroke={LINE} strokeWidth={1.1} />
      <path d="M43 62 Q 51 66 59 62" fill="none" stroke="#f6c453" strokeWidth={1.6} />
      {[45, 50, 55].map((tx) => (
        <line key={tx} x1={tx} y1={67.5} x2={tx} y2={72} stroke="#f6c453" strokeWidth={1.4} />
      ))}
      <circle cx={80} cy={41} r={1.1} fill={LINE} />
      <path d="M72 50 Q 75 52 77 50" fill="none" stroke="#c4331f" strokeWidth={1.4} />
    </g>
  );
}

const ART: Record<JaipurCardType, () => ReactNode> = {
  diamond: DiamondArt,
  gold: GoldArt,
  silver: SilverArt,
  cloth: ClothArt,
  spice: SpiceArt,
  leather: LeatherArt,
  camel: CamelArt,
};

/** Just the illustration, in the card's 100 × 140 coordinates. */
export function Illustration({ type }: { type: JaipurCardType }) {
  const Art = ART[type];
  return <Art />;
}

// ---------------------------------------------------------------------------
// Card face and back.

const ARCH = 'M14 108 L14 46 Q14 30 32 24 Q44 20 50 12 Q56 20 68 24 Q86 30 86 46 L86 108 Z';

/** Pale tint of a card colour for the arch window. */
function tint(type: JaipurCardType): string {
  const tints: Record<JaipurCardType, string> = {
    diamond: '#fde1e1', gold: '#fdf0c8', silver: '#eef1f4', cloth: '#f1e2f6',
    spice: '#e4f2dc', leather: '#f4e4d2', camel: '#fdf3dc',
  };
  return tints[type];
}

export function CardFaceArt({ type }: { type: JaipurCardType }) {
  const info = CARD_INFO[type];
  return (
    <g>
      <rect x={1} y={1} width={98} height={138} rx={9} fill={info.color} stroke={info.ink} strokeWidth={2} />
      <rect x={6} y={6} width={88} height={128} rx={6} fill={CREAM} />
      <path d={ARCH} fill={tint(type)} stroke={info.color} strokeWidth={2.2} />
      <path d={ARCH} fill="none" stroke={info.ink} strokeWidth={0.6} transform="translate(50 60) scale(0.93) translate(-50 -60)" />
      <g transform="translate(0,2)">
        <Illustration type={type} />
      </g>
      {/* corner pip, readable when cards overlap in a fan */}
      <circle cx={16} cy={17} r={8.5} fill={info.color} stroke={info.ink} strokeWidth={1.2} />
      <g transform="translate(16 17) scale(0.16) translate(-50 -64)">
        <Illustration type={type} />
      </g>
      {/* name banner */}
      <path d="M10 114 L90 114 L86 124 L90 134 L10 134 L14 124 Z" fill={info.color} stroke={info.ink} strokeWidth={1.2} />
      <text
        x={50}
        y={128.5}
        textAnchor="middle"
        fontSize={type === 'leather' || type === 'diamond' ? 11 : 12}
        fontWeight={800}
        letterSpacing={1.2}
        fill={type === 'gold' || type === 'silver' || type === 'camel' ? info.ink : '#fff8ec'}
        fontFamily="Georgia, 'Times New Roman', serif"
      >
        {info.label.toUpperCase()}
      </text>
    </g>
  );
}

export function CardBackArt() {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <g>
      <rect x={1} y={1} width={98} height={138} rx={9} fill="#8e1b2a" stroke="#4a0c15" strokeWidth={2} />
      <rect x={7} y={7} width={86} height={126} rx={6} fill="none" stroke="#e7b84a" strokeWidth={1.6} />
      <rect x={11} y={11} width={78} height={118} rx={4} fill="none" stroke="#e7b84a" strokeWidth={0.7} strokeDasharray="2 2" />
      <g transform="translate(50 70)">
        {petals.map((a) => (
          <ellipse key={a} cx={0} cy={-19} rx={6} ry={12} fill="#b8333f" stroke="#e7b84a" strokeWidth={1} transform={`rotate(${a})`} />
        ))}
        <circle r={13} fill="#e7b84a" stroke="#4a0c15" strokeWidth={1} />
        <circle r={8} fill="#8e1b2a" />
        <circle r={3.5} fill="#e7b84a" />
      </g>
      <text x={50} y={124} textAnchor="middle" fontSize={11} fontWeight={800} letterSpacing={2.5} fill="#e7b84a" fontFamily="Georgia, 'Times New Roman', serif">
        JAIPUR
      </text>
      <path d="M50 14 Q 56 22 64 22 Q 56 26 50 34 Q 44 26 36 22 Q 44 22 50 14 Z" fill="#e7b84a" />
    </g>
  );
}

export function CardSvg({ type, className }: { type: JaipurCardType | 'back'; className?: string }) {
  return (
    <svg viewBox="0 0 100 140" className={className} role="img" aria-label={type === 'back' ? 'Card back' : CARD_INFO[type].label}>
      {type === 'back' ? <CardBackArt /> : <CardFaceArt type={type} />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tokens (40 × 40 box).

export function GoodsTokenArt({ good, value }: { good: JaipurGood; value: number }) {
  const info = CARD_INFO[good];
  const light = good === 'gold' || good === 'silver';
  return (
    <g>
      <circle cx={20} cy={20} r={19} fill={info.color} stroke={info.ink} strokeWidth={1.5} />
      <circle cx={20} cy={20} r={15} fill="none" stroke={light ? info.ink : '#fff8ec'} strokeWidth={0.8} strokeDasharray="2 1.6" opacity={0.75} />
      <g transform="translate(20 9.5) scale(0.085) translate(-50 -64)" opacity={0.85}>
        <Illustration type={good} />
      </g>
      <text x={20} y={30} textAnchor="middle" fontSize={15} fontWeight={800} fill={light ? info.ink : '#fff8ec'} fontFamily="Georgia, serif">
        {value}
      </text>
    </g>
  );
}

const BONUS_COLORS: Record<JaipurBonusSize, { fill: string; ink: string }> = {
  3: { fill: '#c98a3a', ink: '#5a3611' },
  4: { fill: '#3f8291', ink: '#123d46' },
  5: { fill: '#7a2a4a', ink: '#3a0f22' },
};

export function bonusColor(size: JaipurBonusSize): string {
  return BONUS_COLORS[size].fill;
}

/** A bonus token; without a value it's shown face down (size only). */
export function BonusTokenArt({ size, value }: { size: JaipurBonusSize; value?: number }) {
  const c = BONUS_COLORS[size];
  const hex = '20,1 37,10.5 37,29.5 20,39 3,29.5 3,10.5';
  return (
    <g>
      <polygon points={hex} fill={c.fill} stroke={c.ink} strokeWidth={1.5} strokeLinejoin="round" />
      <polygon points={hex} fill="none" stroke="#f6dfa8" strokeWidth={0.8} transform="translate(20 20) scale(0.8) translate(-20 -20)" />
      {value === undefined ? (
        <text x={20} y={25.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#f6dfa8" fontFamily="Georgia, serif">
          ×{size}
        </text>
      ) : (
        <>
          <text x={20} y={15} textAnchor="middle" fontSize={7} fontWeight={700} fill="#f6dfa8" fontFamily="Georgia, serif">×{size}</text>
          <text x={20} y={31} textAnchor="middle" fontSize={15} fontWeight={800} fill="#fff8ec" fontFamily="Georgia, serif">{value}</text>
        </>
      )}
    </g>
  );
}

export function CamelTokenArt() {
  return (
    <g>
      <circle cx={20} cy={20} r={19} fill="#e2c58f" stroke="#7a5a2a" strokeWidth={1.5} />
      <circle cx={20} cy={20} r={15.5} fill="none" stroke="#7a5a2a" strokeWidth={0.7} strokeDasharray="2 1.6" />
      <g transform="translate(20 15) scale(0.3) translate(-53 -68)">
        <CamelSilhouette fill="#a8743e" />
      </g>
      <text x={20} y={34} textAnchor="middle" fontSize={10} fontWeight={800} fill="#5a3611" fontFamily="Georgia, serif">5</text>
    </g>
  );
}

/** Seal of Excellence; `earned` false draws the empty slot. */
export function SealArt({ earned }: { earned: boolean }) {
  if (!earned) {
    return <circle cx={20} cy={20} r={15} fill="none" stroke="#c9a24a" strokeWidth={1.5} strokeDasharray="3 2.5" opacity={0.6} />;
  }
  const rays = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <g>
      <path d="M12 26 L7 39 L13 36 L16 40 L19 28 Z" fill="#b8333f" stroke="#5c0f18" strokeWidth={0.8} />
      <path d="M28 26 L33 39 L27 36 L24 40 L21 28 Z" fill="#b8333f" stroke="#5c0f18" strokeWidth={0.8} />
      <g transform="translate(20 18)">
        {rays.map((a) => (
          <polygon key={a} points="0,-16 2.6,-10 -2.6,-10" fill="#e7b84a" stroke="#7a5308" strokeWidth={0.5} transform={`rotate(${a})`} />
        ))}
        <circle r={11} fill="#f3cf63" stroke="#7a5308" strokeWidth={1.2} />
        <circle r={8} fill="none" stroke="#7a5308" strokeWidth={0.7} />
        <path d="M0 -5.5 L1.6 -1.7 L5.6 -1.6 L2.5 1 L3.5 5 L0 2.7 L-3.5 5 L-2.5 1 L-5.6 -1.6 L-1.6 -1.7 Z" fill="#b8333f" />
      </g>
    </g>
  );
}

export function TokenSvg({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** Small inline icon of a card type (log lines, buttons). */
export function TypeIcon({ type, size = 18 }: { type: JaipurCardType; size?: number }) {
  const info = CARD_INFO[type];
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="jp-type-icon" role="img" aria-label={info.label}>
      <circle cx={20} cy={20} r={19} fill={info.color} stroke={info.ink} strokeWidth={2} />
      <g transform="translate(20 21) scale(0.33) translate(-50 -66)">
        <Illustration type={type} />
      </g>
    </svg>
  );
}
