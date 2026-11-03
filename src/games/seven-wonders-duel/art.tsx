// 7 Wonders Duel — hand-drawn SVG art. Flat fills and outlines only (no
// <defs>, ids, gradients, filters or clip paths), so any number of copies can
// share a page without clashing.
//
// Drawing boxes:
//   - icons (resources, coin, shield, VP laurel, science, chain, …): 24 × 24,
//     exported both as <g> glyphs (for composing into bigger pictures) and as
//     sized <svg> icons;
//   - card illustrations: 100 × 100, sky above y ≈ 80, ground below. The
//     card face shows them with `slice`, so the edges may be cropped;
//   - wonder illustrations: 160 × 90, ground below y ≈ 72;
//   - progress tokens: 40 × 40 — a green disc with a gold emblem;
//   - card backs: 80 × 120;
//   - military track: 760 × 92 (19 spaces, −9 … +9).

import type { ReactNode } from 'react';
import type { DuelCardColor, DuelProgressTokenId, DuelResource, DuelScience } from './types';

const INK = '#2b1d12';
const FONT = 'ui-sans-serif, system-ui, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

const SKY = '#cfe6f1';
const SKY_WARM = '#f6dfb0';
const GRASS = '#93c46a';
const GRASS_D = '#74a84f';
const SAND = '#e8cc8e';
const SAND_D = '#d4b06c';
const DIRT = '#c9a26b';
const MARBLE = '#f3ecda';
const STONE = '#ddd0b4';
const STONE_D = '#bba987';
const SHADOW = '#8a7357';
const ROOF = '#b9563c';
const WOOD = '#a86a33';
const DARKWOOD = '#6f4320';
const WATER = '#6fb7da';
const WATER_D = '#4d93bf';
const BRONZE = '#c48a3f';
const GOLD = '#f2c443';
const LEAF = '#5aa64a';
const LEAF_D = '#3f8240';
const FIRE = '#f39a2b';
const FIRE_L = '#ffd45a';
const RED = '#c8463a';
const BLUE = '#3d70b0';
const PURPLE = '#7a4fa8';
const IRON = '#8e979f';
const CREAM = '#fbf2da';
const WHITE = '#ffffff';

/** Outline shared by every shape. */
const LINE = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
/** Thinner outline for small details. */
const THIN = { stroke: INK, strokeWidth: 0.7, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
/** A detail stroke with no fill. */
const line = (color: string = INK, width = 1.2) =>
  ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

/** Card colours (frames, bands, chips). */
export const CARD_HEX: Record<DuelCardColor, string> = {
  brown: '#8f5b2c',
  gray: '#9aa2aa',
  blue: '#2f6fb2',
  yellow: '#e3a923',
  red: '#c43c2f',
  green: '#3f9a4b',
  purple: '#7a4fa8',
};

// ===========================================================================
// Primitives

type XY = { x: number; y: number };

function Box({ x, y, w, h, fill, rx = 0, thin = false }: XY & { w: number; h: number; fill: string; rx?: number; thin?: boolean }) {
  return <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} {...(thin ? THIN : LINE)} />;
}

function Shape({ d, fill, thin = false }: { d: string; fill: string; thin?: boolean }) {
  return <path d={d} fill={fill} {...(thin ? THIN : LINE)} />;
}

function Poly({ points, fill, thin = false }: { points: string; fill: string; thin?: boolean }) {
  return <polygon points={points} fill={fill} {...(thin ? THIN : LINE)} />;
}

/** Background fill, oversized so `slice` crops never show an edge. */
function Sky({ color = SKY, w = 100, h = 100 }: { color?: string; w?: number; h?: number }) {
  return <rect x={-2} y={-2} width={w + 4} height={h + 4} fill={color} />;
}

function Ground({ y = 80, fill = GRASS, w = 100, h = 100 }: { y?: number; fill?: string; w?: number; h?: number }) {
  return <rect x={-3} y={y} width={w + 6} height={h + 3 - y} fill={fill} {...LINE} />;
}

function Sun({ x, y, r = 7, color = '#ffd866' }: XY & { r?: number; color?: string }) {
  return <circle cx={x} cy={y} r={r} fill={color} />;
}

function Cloud({ x, y, s = 1 }: XY & { s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={WHITE} opacity={0.9}>
      <ellipse cx={0} cy={2} rx={10} ry={3.4} />
      <circle cx={-3.5} cy={-0.5} r={4} />
      <circle cx={3} cy={-1.5} r={5} />
    </g>
  );
}

function Hills({ y, fill = GRASS_D, w = 100 }: { y: number; fill?: string; w?: number }) {
  const q = w / 4;
  return <path d={`M-3 ${y} Q ${q} ${y - 14} ${2 * q} ${y - 4} T ${w + 3} ${y - 8} V ${y + 40} H -3 Z`} fill={fill} {...LINE} />;
}

/** One column: `x` is its centre, `y` the top of the capital, `h` the full height. */
function Column({ x, y, h, w = 5, fill = MARBLE }: XY & { h: number; w?: number; fill?: string }) {
  return (
    <g>
      <Box x={x - w / 2} y={y + 2} w={w} h={h - 4} fill={fill} thin />
      <line x1={x} y1={y + 3} x2={x} y2={y + h - 3} {...line(STONE_D, 0.6)} />
      <Box x={x - w / 2 - 1.2} y={y} w={w + 2.4} h={2.2} fill={fill} thin />
      <Box x={x - w / 2 - 1.2} y={y + h - 2.2} w={w + 2.4} h={2.2} fill={fill} thin />
    </g>
  );
}

/** `n` evenly spaced columns with centres from `x0` to `x1`. */
function Colonnade({ x0, x1, y, h, n, w = 5, fill = MARBLE }: { x0: number; x1: number; y: number; h: number; n: number; w?: number; fill?: string }) {
  const cols: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : x0 + ((x1 - x0) * i) / (n - 1);
    cols.push(<Column key={i} x={x} y={y} h={h} w={w} fill={fill} />);
  }
  return <g>{cols}</g>;
}

function Pediment({ x, y, w, h, fill = MARBLE }: XY & { w: number; h: number; fill?: string }) {
  return (
    <g>
      <Poly points={`${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`} fill={fill} />
      <Poly points={`${x + w * 0.16},${y + h - 1.6} ${x + w / 2},${y + h * 0.28} ${x + w * 0.84},${y + h - 1.6}`} fill={STONE} thin />
    </g>
  );
}

/** Steps whose top tread starts at `y`; each lower tread is wider. */
function Steps({ x, y, w, n = 3, dy = 2.6, fill = STONE }: XY & { w: number; n?: number; dy?: number; fill?: string }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    out.push(<Box key={i} x={x - i * 2.5} y={y + i * dy} w={w + i * 5} h={dy} fill={fill} thin />);
  }
  return <g>{out}</g>;
}

function Tree({ x, y, s = 1 }: XY & { s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Box x={-1.6} y={-8} w={3.2} h={9} fill={DARKWOOD} thin />
      <circle cx={0} cy={-14} r={7.5} fill={LEAF} {...LINE} />
      <circle cx={-4.5} cy={-10} r={4.5} fill={LEAF} {...THIN} />
      <circle cx={4.5} cy={-10.5} r={4.5} fill={LEAF} {...THIN} />
      <circle cx={-2} cy={-16} r={2} fill="#7cc163" />
    </g>
  );
}

function Cypress({ x, y, h = 24 }: XY & { h?: number }) {
  return (
    <g>
      <Box x={x - 1} y={y - 3} w={2} h={3} fill={DARKWOOD} thin />
      <path d={`M${x} ${y - h} C ${x + 5} ${y - h * 0.6} ${x + 5} ${y - 6} ${x} ${y - 2} C ${x - 5} ${y - 6} ${x - 5} ${y - h * 0.6} ${x} ${y - h} Z`} fill={LEAF_D} {...LINE} />
    </g>
  );
}

function Palm({ x, y, h = 26, s = 1 }: XY & { h?: number; s?: number }) {
  const top = { x: x + 3 * s, y: y - h };
  return (
    <g>
      <path d={`M${x} ${y} Q ${x - 1} ${y - h * 0.5} ${top.x} ${top.y}`} {...line(DARKWOOD, 2.6 * s)} />
      <path d={`M${x} ${y} Q ${x - 1} ${y - h * 0.5} ${top.x} ${top.y}`} {...line('#9b6a3a', 1.4 * s)} />
      {[-150, -110, -60, -20, 20].map((a, i) => {
        const r = (a * Math.PI) / 180;
        const ex = top.x + Math.cos(r) * 11 * s;
        const ey = top.y + Math.sin(r) * 7 * s + 5 * s;
        const cx = top.x + Math.cos(r) * 6 * s;
        const cy = top.y + Math.sin(r) * 7 * s - 2 * s;
        return <path key={i} d={`M${top.x} ${top.y} Q ${cx} ${cy} ${ex} ${ey} Q ${cx + 1} ${cy + 3} ${top.x} ${top.y} Z`} fill={LEAF} {...THIN} />;
      })}
    </g>
  );
}

function Pennant({ x, y, color = RED, h = 12 }: XY & { color?: string; h?: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - h} {...line(INK, 1)} />
      <Poly points={`${x},${y - h} ${x + 8},${y - h + 2.5} ${x},${y - h + 5}`} fill={color} thin />
    </g>
  );
}

/** A hanging banner with a notched tail, top edge at `y`. */
function Banner({ x, y, w = 8, h = 16, color = RED }: XY & { w?: number; h?: number; color?: string }) {
  return <Shape d={`M${x} ${y} h${w} v${h} l${-w / 2} ${-3} l${-w / 2} ${3} Z`} fill={color} thin />;
}

function Smoke({ x, y }: XY) {
  return (
    <g fill="#d9d4cc" opacity={0.85}>
      <circle cx={x} cy={y} r={3} />
      <circle cx={x + 3} cy={y - 5} r={3.8} />
      <circle cx={x + 1} cy={y - 11} r={4.4} />
    </g>
  );
}

function Waves({ y, x0 = 0, x1 = 100, color = WHITE }: { y: number; x0?: number; x1?: number; color?: string }) {
  const out: ReactNode[] = [];
  for (let x = x0 + 4; x < x1 - 6; x += 16) {
    out.push(<path key={x} d={`M${x} ${y} q 3 -2.5 6 0 t 6 0`} {...line(color, 0.9)} />);
  }
  return <g opacity={0.8}>{out}</g>;
}

/** An arched opening: left `x`, width `w`, arch top `top`, bottom `bottom`. */
function ArchHole({ x, w, top, bottom, fill = SHADOW }: { x: number; w: number; top: number; bottom: number; fill?: string }) {
  return <Shape d={`M${x} ${bottom} V${top + w / 2} A${w / 2} ${w / 2} 0 0 1 ${x + w} ${top + w / 2} V${bottom} Z`} fill={fill} thin />;
}

function Crenels({ x, y, w, n, h = 5, fill = STONE }: XY & { w: number; n: number; h?: number; fill?: string }) {
  const out: ReactNode[] = [];
  const step = w / n;
  for (let i = 0; i < n; i++) out.push(<Box key={i} x={x + i * step + step * 0.12} y={y - h} w={step * 0.6} h={h} fill={fill} thin />);
  return <g>{out}</g>;
}

/** A small figure in a robe; `x` is the centre, `y` the feet. */
function Figure({ x, y, robe = MARBLE, s = 1, armUp = false }: XY & { robe?: string; s?: number; armUp?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-5 0 L-3.4 -14 L3.4 -14 L5 0 Z" fill={robe} thin />
      {armUp
        ? <path d="M2.6 -12.5 L7 -20" {...line(INK, 2.6)} />
        : <path d="M2.6 -12.5 L4.6 -6" {...line(INK, 2.6)} />}
      {armUp
        ? <path d="M2.6 -12.5 L7 -20" {...line('#e9c9a0', 1.4)} />
        : <path d="M2.6 -12.5 L4.6 -6" {...line('#e9c9a0', 1.4)} />}
      <circle cx={0} cy={-17} r={3} fill="#e9c9a0" {...THIN} />
    </g>
  );
}

function Amphora({ x, y, s = 1, fill = '#c2703f' }: XY & { s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-1.6 -12 h3.2 v2 c3 1 4 4 3 7 c-0.8 2 -2 3 -3 3 h-3.2 c-1 0 -2.2 -1 -3 -3 c-1 -3 0 -6 3 -7 Z" fill={fill} thin />
      <path d="M-1.6 -10 q-3 0 -3 3 M1.6 -10 q3 0 3 3" {...line(INK, 0.7)} />
      <line x1={-3.6} y1={-5} x2={3.6} y2={-5} {...line('#f4d3a2', 0.8)} />
    </g>
  );
}

function Barrel({ x, y, s = 1 }: XY & { s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-6 -12 h12 q2 6 0 12 h-12 q-2 -6 0 -12 Z" fill={WOOD} thin />
      <line x1={-6.6} y1={-8.5} x2={6.6} y2={-8.5} {...line(IRON, 1.2)} />
      <line x1={-6.6} y1={-3.5} x2={6.6} y2={-3.5} {...line(IRON, 1.2)} />
      <line x1={-2} y1={-12} x2={-2} y2={0} {...line(DARKWOOD, 0.5)} />
      <line x1={2} y1={-12} x2={2} y2={0} {...line(DARKWOOD, 0.5)} />
    </g>
  );
}

function Crate({ x, y, s = 1 }: XY & { s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Box x={-5} y={-10} w={10} h={10} fill="#c08a4c" thin />
      <path d="M-5 -10 L5 0 M5 -10 L-5 0" {...line(DARKWOOD, 0.7)} />
    </g>
  );
}

/** A stack of coins seen side-on; `y` is the bottom. */
function CoinStack({ x, y, n }: XY & { n: number }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const cy = y - 2 - i * 2.6;
    out.push(
      <g key={i}>
        <path d={`M${x - 5} ${cy} v1.8 a5 1.8 0 0 0 10 0 v-1.8`} fill="#d9a520" {...THIN} />
        <ellipse cx={x} cy={cy} rx={5} ry={1.8} fill={GOLD} {...THIN} />
      </g>,
    );
  }
  return <g>{out}</g>;
}

function Gear({ x, y, r, fill = IRON, teeth = 8 }: XY & { r: number; fill?: string; teeth?: number }) {
  const pts: string[] = [];
  const inner = r * 0.76;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (Math.PI * i) / teeth - Math.PI / (teeth * 3.2);
    const a1 = (Math.PI * i) / teeth + Math.PI / (teeth * 3.2);
    const rr = i % 2 === 0 ? r : inner;
    pts.push(`${(x + Math.cos(a0) * rr).toFixed(2)},${(y + Math.sin(a0) * rr).toFixed(2)}`);
    pts.push(`${(x + Math.cos(a1) * rr).toFixed(2)},${(y + Math.sin(a1) * rr).toFixed(2)}`);
  }
  return (
    <g>
      <polygon points={pts.join(' ')} fill={fill} {...THIN} />
      <circle cx={x} cy={y} r={r * 0.32} fill={CREAM} {...THIN} />
    </g>
  );
}

function Wheel({ x, y, r, fill = WOOD }: XY & { r: number; fill?: string }) {
  const spokes: ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * i) / 3;
    spokes.push(<line key={i} x1={x} y1={y} x2={x + Math.cos(a) * r} y2={y + Math.sin(a) * r} {...line(fill, Math.max(1, r * 0.16))} />);
  }
  return (
    <g>
      <circle cx={x} cy={y} r={r} {...line(INK, r * 0.34)} />
      <circle cx={x} cy={y} r={r} {...line(fill, r * 0.2)} />
      {spokes}
      <circle cx={x} cy={y} r={r * 0.22} fill={DARKWOOD} {...THIN} />
    </g>
  );
}

// ===========================================================================
// Icons (24 × 24)

/** Wraps a 24 × 24 glyph in a sized <svg>. */
export function Icon({ size = 20, title, children, className }: { size?: number; title?: string; children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

function WoodGlyph() {
  return (
    <g>
      <rect x={2.5} y={12.5} width={15} height={7.4} rx={3.7} fill="#8d5524" {...LINE} />
      <line x1={5.5} y1={15} x2={12} y2={15} {...line('#5e3514', 0.7)} />
      <line x1={7} y1={17.6} x2={13.5} y2={17.6} {...line('#5e3514', 0.7)} />
      <ellipse cx={17.5} cy={16.2} rx={2.6} ry={3.7} fill="#e8b878" {...LINE} />
      <ellipse cx={17.5} cy={16.2} rx={1} ry={1.6} {...line('#a26a35', 0.7)} />
      <rect x={6} y={4.3} width={14} height={7.4} rx={3.7} fill="#9b6029" {...LINE} />
      <line x1={8.5} y1={6.8} x2={15} y2={6.8} {...line('#5e3514', 0.7)} />
      <ellipse cx={20} cy={8} rx={2.6} ry={3.7} fill="#e8b878" {...LINE} />
      <ellipse cx={20} cy={8} rx={1} ry={1.6} {...line('#a26a35', 0.7)} />
    </g>
  );
}

function StoneGlyph() {
  return (
    <g>
      <path d="M2.6 20.5 L3.6 13.2 L10.5 11.4 L20.2 12.8 L21.6 20.5 Z" fill="#9ea3a8" {...LINE} />
      <path d="M10.5 11.4 L11.5 20.5" {...line('#6b7075', 0.8)} />
      <path d="M3.6 13.2 L5 15.4 L11 14.5" {...line('#c9cdd1', 0.8)} />
      <path d="M6.6 12.2 L7.8 5.6 L13.6 3.4 L18.4 6.2 L17.8 12.4 Z" fill="#c5c9cd" {...LINE} />
      <path d="M13.6 3.4 L12.8 8.6 L17.8 12.4 M12.8 8.6 L7.8 5.6" {...line('#8a9095', 0.8)} />
    </g>
  );
}

function ClayGlyph() {
  return (
    <g>
      <rect x={2.2} y={14.2} width={9.4} height={6.2} rx={1.2} fill="#c65a32" {...LINE} />
      <rect x={12.4} y={14.2} width={9.4} height={6.2} rx={1.2} fill="#b44f2b" {...LINE} />
      <rect x={7.3} y={7.6} width={9.4} height={6.2} rx={1.2} fill="#d9703f" {...LINE} />
      <path d="M8.8 9.4 h3.4 M3.8 16 h3 M14 16 h3" {...line('#f1a77d', 0.9)} />
      <path d="M9.5 3.6 q2.5 -1.6 5 0 q1.4 2.2 -0.6 3.4 h-3.8 q-2 -1.2 -0.6 -3.4 Z" fill="#a8482a" {...THIN} />
    </g>
  );
}

function GlassGlyph() {
  return (
    <g>
      <path d="M9.6 4.2 h4.8 v3.6 c0 1.2 4.6 2.6 4.6 7.6 c0 4.2 -3 6.6 -7 6.6 c-4 0 -7 -2.4 -7 -6.6 c0 -5 4.6 -6.4 4.6 -7.6 Z" fill="#5fc0e0" {...LINE} />
      <path d="M8.2 13.2 c0 -1.8 1 -3 2.2 -3.6" {...line(WHITE, 1.3)} />
      <path d="M7.4 16.4 c1.6 1.2 7.6 1.2 9.2 0" {...line('#3d97ba', 0.9)} />
      <rect x={9} y={2.2} width={6} height={2.4} rx={1} fill="#2f86ab" {...THIN} />
    </g>
  );
}

function PapyrusGlyph() {
  return (
    <g>
      <rect x={6} y={5} width={12} height={14} fill="#f6e7b4" {...LINE} />
      <path d="M8.4 9 h7.2 M8.4 11.6 h7.2 M8.4 14.2 h5" {...line('#a7884a', 0.9)} />
      <rect x={3.8} y={2.6} width={16.4} height={4.4} rx={2.2} fill="#dcc07a" {...LINE} />
      <rect x={3.8} y={17} width={16.4} height={4.4} rx={2.2} fill="#dcc07a" {...LINE} />
      <circle cx={3.8 + 2.2} cy={4.8} r={0.8} fill="#8f6f30" />
      <circle cx={3.8 + 2.2} cy={19.2} r={0.8} fill="#8f6f30" />
    </g>
  );
}

export function ResourceGlyph({ r }: { r: DuelResource }) {
  switch (r) {
    case 'wood': return <WoodGlyph />;
    case 'stone': return <StoneGlyph />;
    case 'clay': return <ClayGlyph />;
    case 'glass': return <GlassGlyph />;
    case 'papyrus': return <PapyrusGlyph />;
  }
}

export function CoinGlyph({ value, negative = false }: { value?: number | string; negative?: boolean }) {
  const text = value === undefined ? undefined : `${negative ? '−' : ''}${value}`;
  const len = text?.length ?? 0;
  return (
    <g>
      <circle cx={12} cy={12} r={10.2} fill={negative ? '#e7b13a' : GOLD} stroke={negative ? '#8e1d14' : '#7a5206'} strokeWidth={1.3} />
      <circle cx={12} cy={12} r={7.8} fill="none" stroke={negative ? '#b8452f' : '#c99315'} strokeWidth={0.9} />
      {text === undefined
        ? <path d="M12 7.4 l1.4 3.1 3.3 0.3 -2.5 2.2 0.8 3.3 -3 -1.8 -3 1.8 0.8 -3.3 -2.5 -2.2 3.3 -0.3 Z" fill="#fff0b3" />
        : (
          <text x={12} y={12} dy="0.36em" textAnchor="middle" fontFamily={FONT} fontWeight={800}
            fontSize={len >= 3 ? 9 : len === 2 ? 11 : 13.5} fill={negative ? '#8e1d14' : '#3a2606'}>{text}</text>
        )}
    </g>
  );
}

export function ShieldGlyph() {
  return (
    <g>
      <path d="M12 2.4 L20.4 5.6 V11.6 C20.4 16.6 16.8 20 12 22 C7.2 20 3.6 16.6 3.6 11.6 V5.6 Z" fill="#c8372d" {...LINE} />
      <path d="M12 4.6 L18.3 7 V11.6 C18.3 15.2 15.9 17.9 12 19.6 Z" fill="#e2604d" />
      <path d="M12 2.4 L20.4 5.6 V11.6 C20.4 16.6 16.8 20 12 22 C7.2 20 3.6 16.6 3.6 11.6 V5.6 Z" fill="none" {...LINE} />
      <path d="M12 6 V18.6 M7 10.6 H17" {...line('#f7d27a', 1.4)} />
    </g>
  );
}

export function LaurelGlyph({ value }: { value?: number | string }) {
  const leaves: ReactNode[] = [];
  for (const side of [-1, 1]) {
    [104, 132, 160, 188, 216].forEach((deg, i) => {
      const a = ((side === -1 ? deg : 180 - deg) * Math.PI) / 180;
      const cx = 12 + Math.cos(a) * 9.2;
      const cy = 12.6 + Math.sin(a) * 9.2;
      const rot = (side === -1 ? deg : 180 - deg) + 90 + side * 18;
      leaves.push(<ellipse key={`${side}${i}`} cx={cx} cy={cy} rx={2.7} ry={1.25} transform={`rotate(${rot} ${cx} ${cy})`} fill="#5d9a36" {...THIN} />);
    });
  }
  const text = value === undefined ? '' : `${value}`;
  return (
    <g>
      {leaves}
      <circle cx={12} cy={12.4} r={7.4} fill={CREAM} {...LINE} />
      <text x={12} y={12.4} dy="0.36em" textAnchor="middle" fontFamily={SERIF} fontWeight={800}
        fontSize={text.length >= 2 ? 9.5 : 11.5} fill={INK}>{text}</text>
    </g>
  );
}

/** A science symbol on a cream disc. `bare` draws the symbol alone. */
export function ScienceGlyph({ symbol, bare = false }: { symbol: DuelScience; bare?: boolean }) {
  return (
    <g>
      {!bare && <circle cx={12} cy={12} r={10.6} fill="#f4ead0" {...LINE} />}
      <ScienceSymbol symbol={symbol} />
    </g>
  );
}

function ScienceSymbol({ symbol }: { symbol: DuelScience }) {
  switch (symbol) {
    case 'compass':
      return (
        <g>
          <path d="M11.2 7.4 L6.8 18.4 M12.8 7.4 L17.2 18.4" {...line(INK, 2.4)} />
          <path d="M11.2 7.4 L6.8 18.4 M12.8 7.4 L17.2 18.4" {...line('#b9884a', 1)} />
          <path d="M8.6 14.2 Q12 16.6 15.4 14.2" {...line(INK, 1)} />
          <circle cx={12} cy={6.2} r={2.1} fill={GOLD} {...LINE} />
        </g>
      );
    case 'gear':
      return <Gear x={12} y={12} r={7.4} fill="#6f6a5a" teeth={8} />;
    case 'tablet':
      return (
        <g>
          <path d="M6.8 19 V8.4 a5.2 4.4 0 0 1 10.4 0 V19 Z" fill="#b8ad96" {...LINE} />
          <path d="M8.8 10 h6.4 M8.8 12.6 h6.4 M8.8 15.2 h4.4" {...line('#5f5545', 1)} />
          <path d="M5.8 19 h12.4" {...line(INK, 1.4)} />
        </g>
      );
    case 'lyre':
      return (
        <g>
          <path d="M8.2 17.6 C4.8 13.4 6 7.6 8.8 5.2 M15.8 17.6 C19.2 13.4 18 7.6 15.2 5.2" {...line(INK, 2.6)} />
          <path d="M8.2 17.6 C4.8 13.4 6 7.6 8.8 5.2 M15.8 17.6 C19.2 13.4 18 7.6 15.2 5.2" {...line(GOLD, 1.2)} />
          <path d="M6.6 8.6 H17.4" {...line(INK, 1.6)} />
          <path d="M10 8.6 V17 M12 8.6 V17 M14 8.6 V17" {...line(INK, 0.7)} />
          <rect x={7.2} y={16.8} width={9.6} height={2.6} rx={1} fill={WOOD} {...THIN} />
        </g>
      );
    case 'wheel':
      return <Wheel x={12} y={12} r={7.2} fill="#9a6431" />;
    case 'sundial':
      return (
        <g>
          <path d="M4.6 16.4 A7.4 7.4 0 0 1 19.4 16.4 Z" fill="#d6c7a4" {...LINE} />
          <path d="M12 16.4 L7 11.4 M12 16.4 L12 9.2 M12 16.4 L17 11.4" {...line('#7d6b4c', 0.8)} />
          <path d="M12 16.4 L12 7.2 L16.4 16.4 Z" fill={INK} />
          <rect x={4} y={16.4} width={16} height={2.8} rx={0.8} fill="#a8987a" {...THIN} />
        </g>
      );
    case 'mortar':
      return (
        <g>
          <path d="M13.4 12 L18.2 4.6" {...line(INK, 3.6)} />
          <path d="M13.4 12 L18.2 4.6" {...line('#c9a46e', 2)} />
          <path d="M5 11.6 h14 c0 4.6 -3 7.6 -7 7.6 c-4 0 -7 -3 -7 -7.6 Z" fill="#a7a19a" {...LINE} />
          <path d="M7.4 14 c1.4 2.4 7.8 2.4 9.2 0" {...line('#d7d2cb', 0.9)} />
          <rect x={8.6} y={19} width={6.8} height={1.8} rx={0.6} fill="#8b857e" {...THIN} />
        </g>
      );
  }
}

export function ChainGlyph() {
  return (
    <g>
      <rect x={2.6} y={8.6} width={11.2} height={6.8} rx={3.4} transform="rotate(-35 8.2 12)" {...line(INK, 3.4)} />
      <rect x={2.6} y={8.6} width={11.2} height={6.8} rx={3.4} transform="rotate(-35 8.2 12)" {...line('#f3e6c2', 1.6)} />
      <rect x={10.2} y={8.6} width={11.2} height={6.8} rx={3.4} transform="rotate(-35 15.8 12)" {...line(INK, 3.4)} />
      <rect x={10.2} y={8.6} width={11.2} height={6.8} rx={3.4} transform="rotate(-35 15.8 12)" {...line('#f3e6c2', 1.6)} />
    </g>
  );
}

/** A mini card of a colour ("per card of this colour"). `both` = either city. */
export function ChipGlyph({ color, both = false }: { color: DuelCardColor; both?: boolean }) {
  const fill = CARD_HEX[color];
  return both ? (
    <g>
      <rect x={3.4} y={3} width={10.4} height={15.4} rx={1.8} fill={fill} {...LINE} opacity={0.75} />
      <rect x={10.2} y={5.6} width={10.4} height={15.4} rx={1.8} fill={fill} {...LINE} />
      <rect x={10.2} y={5.6} width={10.4} height={4} rx={1.8} fill="rgba(0,0,0,0.22)" />
    </g>
  ) : (
    <g>
      <rect x={6.4} y={3} width={11.2} height={18} rx={2} fill={fill} {...LINE} />
      <rect x={6.4} y={3} width={11.2} height={4.6} rx={2} fill="rgba(0,0,0,0.22)" />
    </g>
  );
}

/** A small pyramid: "per wonder". */
export function WonderGlyph() {
  return (
    <g>
      <path d="M2.6 19.6 L12 4.4 L21.4 19.6 Z" fill="#e2bf7d" {...LINE} />
      <path d="M12 4.4 L21.4 19.6 L14.6 19.6 Z" fill="#c49a58" {...THIN} />
      <path d="M6.6 13.2 h10.8 M4.5 16.4 h15" {...line('#8a6a3a', 0.7)} />
    </g>
  );
}

/** "Play again" — a circular arrow. */
export function ExtraTurnGlyph() {
  return (
    <g>
      <circle cx={12} cy={12} r={10.4} fill="#f4ead0" {...LINE} />
      <path d="M17.2 9.4 A5.8 5.8 0 1 0 17.6 14.6" {...line(INK, 2.2)} />
      <path d="M14.4 8.4 L18.4 8.8 L17.8 4.8 Z" fill={INK} {...LINE} />
    </g>
  );
}

/** "Build from the discard pile" — a card lifted off a pile. */
export function DiscardPickGlyph() {
  return (
    <g>
      <rect x={3} y={13} width={13} height={8} rx={1.4} fill="#8b7a62" {...LINE} />
      <rect x={5} y={11.4} width={13} height={8} rx={1.4} fill="#a8967c" {...LINE} />
      <rect x={9.4} y={2.6} width={9} height={12.4} rx={1.4} fill={CREAM} {...LINE} transform="rotate(12 14 8.8)" />
      <path d="M13.6 9.6 V5.2 M11.8 7 L13.6 5.2 L15.4 7" {...line(INK, 1.2)} />
    </g>
  );
}

/** Trade discount: the resources it covers, clustered (the card adds "= 1 coin"). */
export function TradeGlyph({ kind }: { kind: 'raw' | 'manufactured' }) {
  const rs: DuelResource[] = kind === 'raw' ? ['wood', 'stone', 'clay'] : ['glass', 'papyrus'];
  const at = kind === 'raw' ? [[-0.6, -0.4], [11.2, -0.4], [5.3, 10.8]] : [[-0.4, 5.4], [11, 5.4]];
  return (
    <g>
      {rs.map((r, i) => (
        <g key={r} transform={`translate(${at[i][0]} ${at[i][1]}) scale(0.56)`}><ResourceGlyph r={r} /></g>
      ))}
    </g>
  );
}

/** A generic progress token (score-table header). */
export function ProgressGlyph() {
  return (
    <g>
      <circle cx={12} cy={12} r={10.4} fill="#2f8752" stroke="#173a26" strokeWidth={1.2} />
      <circle cx={12} cy={12} r={8} fill="none" stroke="#e5c368" strokeWidth={1} />
      <path d="M12 6.6 l1.6 3.4 3.6 0.4 -2.7 2.4 0.8 3.6 -3.3 -1.9 -3.3 1.9 0.8 -3.6 -2.7 -2.4 3.6 -0.4 Z" fill="#f2d27a" stroke="#173a26" strokeWidth={0.6} />
    </g>
  );
}

/** A tiny castle (a capital on the military track). */
function CapitalGlyph({ color = STONE }: { color?: string }) {
  return (
    <g>
      <rect x={4} y={9} width={16} height={12} fill={color} {...LINE} />
      <path d="M3 9 V4.6 H6 V6.6 H8.6 V4.6 H11 V9 M13 9 V4.6 H15.4 V6.6 H18 V4.6 H21 V9" fill={color} {...LINE} />
      <path d="M9.4 21 V16 a2.6 2.6 0 0 1 5.2 0 V21 Z" fill={INK} />
    </g>
  );
}

export function ResourceIcon({ r, size = 18 }: { r: DuelResource; size?: number }) {
  return <Icon size={size} title={r}><ResourceGlyph r={r} /></Icon>;
}
export function CoinIcon({ value, size = 18, negative, title }: { value?: number | string; size?: number; negative?: boolean; title?: string }) {
  return <Icon size={size} title={title ?? (value === undefined ? 'coins' : `${negative ? 'opponent loses ' : ''}${value} coin${value === 1 ? '' : 's'}`)}><CoinGlyph value={value} negative={negative} /></Icon>;
}
export function ShieldIcon({ size = 18, title = 'shield' }: { size?: number; title?: string }) {
  return <Icon size={size} title={title}><ShieldGlyph /></Icon>;
}
export function LaurelIcon({ value, size = 18, title }: { value?: number | string; size?: number; title?: string }) {
  return <Icon size={size} title={title ?? (value === undefined ? 'victory points' : `${value} VP`)}><LaurelGlyph value={value} /></Icon>;
}
export function ScienceIcon({ symbol, size = 18 }: { symbol: DuelScience; size?: number }) {
  return <Icon size={size} title={symbol}><ScienceGlyph symbol={symbol} /></Icon>;
}
export function ChainIcon({ size = 14, title = 'chain' }: { size?: number; title?: string }) {
  return <Icon size={size} title={title}><ChainGlyph /></Icon>;
}

// ===========================================================================
// Card illustrations (100 × 100)

export function CardArt({ name, color, symbol }: { name: string; color: DuelCardColor; symbol?: DuelScience }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {cardScene(name, color, symbol)}
    </svg>
  );
}

function cardScene(name: string, color: DuelCardColor, symbol?: DuelScience): ReactNode {
  switch (name) {
    // brown
    case 'Lumber Yard': return <Forest />;
    case 'Logging Camp': return <Forest camp />;
    case 'Sawmill': return <Sawmill />;
    case 'Clay Pool': return <ClayPit />;
    case 'Brickyard': return <Brickyard />;
    case 'Quarry': return <Quarry />;
    case 'Shelf Quarry': return <Quarry shelves />;
    // gray
    case 'Glassworks': return <Glassworks />;
    case 'Glass-Blower': return <Glassworks blower />;
    case 'Press': return <PapyrusMarsh />;
    case 'Drying Room': return <PapyrusMarsh racks />;
    // blue
    case 'Theater': return <TheaterScene />;
    case 'Altar': return <AltarScene />;
    case 'Baths': return <BathsScene />;
    case 'Pharmacist': return <PharmacistScene />;
    case 'Temple': return <TempleScene />;
    case 'Statue': return <StatueScene />;
    case 'Aqueduct': return <AqueductScene />;
    case 'Rostrum': return <RostrumScene />;
    case 'Pantheon': return <PantheonScene />;
    case 'Gardens': return <GardensScene />;
    case 'Senate': return <SenateScene />;
    case 'Town Hall': return <TownHallScene />;
    case 'Obelisk': return <ObeliskScene />;
    // red
    case 'Stockade': return <PalisadeScene />;
    case 'Palisade': return <PalisadeScene gate />;
    case 'Barracks': return <BarracksScene />;
    case 'Guard Tower': return <GuardTowerScene />;
    case 'Walls': return <WallsScene />;
    case 'Fortifications': return <WallsScene towers />;
    case 'Horse Breeders': return <HorseScene />;
    case 'Archery Range': return <ArcheryScene />;
    case 'Parade Ground': return <ParadeScene />;
    case 'Siege Workshop': return <SiegeScene />;
    case 'Circus': return <ArenaScene banner={RED} />;
    case 'Arsenal': return <ArsenalScene />;
    // green
    case 'Apothecary': return <ApothecaryScene />;
    case 'Dispensary': return <ApothecaryScene />;
    case 'Bottling Plant': return <ApothecaryScene bottles />;
    case 'Workshop': return <WorkshopScene />;
    case 'Laboratory': return <WorkshopScene lab />;
    case 'Scriptorium': return <LibraryScene />;
    case 'Library': return <LibraryScene />;
    case 'Observatory': return <ObservatoryScene />;
    case 'Stable': return <StableScene />;
    // yellow
    case 'Tavern': return <TavernScene />;
    case 'Brewery': return <BreweryScene />;
    case 'Stone Reserve': return <ReserveScene goods="stone" />;
    case 'Clay Reserve': return <ReserveScene goods="clay" />;
    case 'Forum': return <MarketScene />;
    case 'Customs House': return <MarketScene customs />;
    case 'Caravansery': return <CaravanScene />;
    case 'Chamber of Commerce': return <ChamberScene />;
    case 'Port': return <PortScene />;
    case 'Armory': return <ArsenalScene coins />;
    case 'Lighthouse': return <LighthouseScene />;
    case 'Pretorium': return <PretoriumScene />;
    case 'Arena': return <ArenaScene banner={GOLD} />;
  }
  if (color === 'purple') return <GuildHallScene name={name} />;
  if (color === 'green') return <AcademyScene symbol={symbol ?? 'tablet'} />;
  switch (color) {
    case 'brown': return <Quarry />;
    case 'gray': return <Glassworks />;
    case 'blue': return <TempleScene />;
    case 'yellow': return <MarketScene />;
    case 'red': return <WallsScene />;
  }
  return <TempleScene />;
}

// ---- Brown ----------------------------------------------------------------

function LogPile({ x, y }: XY) {
  const logs: [number, number][] = [[0, 0], [9, 0], [18, 0], [4.5, -7.6], [13.5, -7.6], [9, -15.2]];
  return (
    <g>
      {logs.map(([dx, dy], i) => (
        <g key={i}>
          <circle cx={x + dx} cy={y + dy} r={4.4} fill="#e2ad6e" {...LINE} />
          <circle cx={x + dx} cy={y + dy} r={2} {...line('#a26a35', 0.7)} />
        </g>
      ))}
    </g>
  );
}

function Forest({ camp = false }: { camp?: boolean }) {
  return (
    <g>
      <Sky />
      <Cloud x={70} y={14} />
      <Hills y={58} fill="#9fcf7a" />
      <Tree x={16} y={66} s={1.25} />
      <Tree x={40} y={60} s={1.05} />
      <Tree x={80} y={64} s={1.3} />
      <Ground y={78} />
      {camp ? (
        <g>
          <Poly points="12,86 26,64 40,86" fill="#d9c08d" />
          <Poly points="22,86 26,72 30,86" fill={INK} />
        </g>
      ) : (
        <g>
          <Box x={14} y={80} w={12} h={7} fill={DARKWOOD} rx={1} />
          <ellipse cx={20} cy={80} rx={6} ry={2} fill="#d9a465" {...LINE} />
          <path d="M22 79 L30 70" {...line(DARKWOOD, 2)} />
          <Poly points="27,68 33,69 31,74 27,73" fill={IRON} thin />
        </g>
      )}
      <LogPile x={55} y={90} />
    </g>
  );
}

function Sawmill() {
  return (
    <g>
      <Sky />
      <Hills y={60} />
      <Tree x={86} y={64} s={1.1} />
      <Ground y={78} fill={DIRT} />
      <Box x={6} y={44} w={40} h={36} fill="#d9b98a" />
      <Poly points="2,46 26,30 50,46" fill={ROOF} />
      <Box x={18} y={58} w={14} h={22} fill={DARKWOOD} />
      <Box x={44} y={70} w={6} h={16} fill={DARKWOOD} thin />
      <Box x={84} y={70} w={6} h={16} fill={DARKWOOD} thin />
      <rect x={40} y={62} width={56} height={10} rx={5} fill="#9b6029" {...LINE} />
      <ellipse cx={96} cy={67} rx={3} ry={5} fill="#e8b878" {...LINE} />
      <Box x={66} y={44} w={3} h={20} fill={IRON} thin />
      <path d="M62 52 l2 3 l2 -3 l2 3 l2 -3 l2 3" {...line(INK, 0.8)} />
      <Box x={60} y={42} w={15} h={4} fill={WOOD} thin />
      <LogPile x={14} y={92} />
    </g>
  );
}

function ClayPit() {
  return (
    <g>
      <Sky />
      <Hills y={56} fill="#b9cf86" />
      <Ground y={66} fill={DIRT} />
      <ellipse cx={42} cy={82} rx={36} ry={12} fill="#9c5a3a" {...LINE} />
      <ellipse cx={42} cy={84} rx={24} ry={6} fill="#b56c45" />
      <path d="M28 82 q6 -2 12 0 M48 86 q6 -2 12 0" {...line('#d38c62', 1)} />
      {[[80, 72], [86, 74], [92, 72]].map(([x, y], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2={x - 2} y2={y - 18} {...line(LEAF_D, 1.4)} />
          <ellipse cx={x - 2} cy={y - 20} rx={1.6} ry={4} fill="#8a5a2c" {...THIN} />
        </g>
      ))}
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
        <Box key={`${r}${c}`} x={62 + c * 9} y={88 + r * -0.5 + r * 4} w={7} h={3.6} fill="#c65a32" thin />
      )))}
    </g>
  );
}

function Brickyard() {
  return (
    <g>
      <Sky />
      <Ground y={76} fill={DIRT} />
      <Smoke x={30} y={22} />
      <Box x={24} y={22} w={10} h={18} fill="#9c4b2a" />
      <Shape d="M6 78 V52 A22 22 0 0 1 50 52 V78 Z" fill="#c4643b" />
      <path d="M10 58 h36 M8 66 h40 M14 50 h28" {...line('#8f4224', 0.8)} />
      <ArchHole x={20} w={16} top={62} bottom={78} fill="#3a1d10" />
      <Shape d="M23 78 q5 -10 10 0 Z" fill={FIRE} thin />
      <Shape d="M26 78 q2 -5 4 0 Z" fill={FIRE_L} thin />
      {[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => (
        <Box key={`${r}${c}`} x={58 + c * 12 + (r % 2) * 6} y={88 - r * 6} w={11} h={5.4} fill={r % 2 ? '#d9703f' : '#c65a32'} thin />
      )))}
    </g>
  );
}

function Quarry({ shelves = false }: { shelves?: boolean }) {
  return (
    <g>
      <Sky />
      <Cloud x={24} y={14} s={0.9} />
      <Shape d="M-3 34 L18 24 L40 30 L62 20 L84 28 L103 22 V90 H-3 Z" fill={STONE_D} />
      {shelves ? (
        <g>
          <Box x={6} y={40} w={88} h={6} fill={STONE} thin />
          <Box x={2} y={54} w={96} h={6} fill={STONE} thin />
          <Box x={-2} y={68} w={104} h={6} fill={STONE} thin />
        </g>
      ) : (
        <g>
          <Shape d="M20 40 h26 v14 h18 v14 H20 Z" fill={STONE} />
          <path d="M33 40 v14 M20 54 h26 M46 54 v14 M55 54 v14" {...line(SHADOW, 0.8)} />
        </g>
      )}
      <path d="M70 34 l6 8 M80 40 l-4 10 M10 48 l6 4" {...line(SHADOW, 0.8)} />
      <Ground y={80} fill="#cdbf9f" />
      <path d="M58 92 L64 82 L82 80 L90 86 L86 94 L62 96 Z" fill="#cfd2d4" {...LINE} />
      <path d="M64 82 L68 90 L86 94 M68 90 L62 96" {...line('#8a9095', 0.8)} />
      <path d="M18 96 L30 74" {...line(DARKWOOD, 2.2)} />
      <path d="M22 72 Q30 70 38 76" {...line(INK, 3)} />
      <path d="M22 72 Q30 70 38 76" {...line(IRON, 1.6)} />
    </g>
  );
}

// ---- Gray -----------------------------------------------------------------

function Bottle({ x, y, color, s = 1 }: XY & { color: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-1.4 -12 h2.8 v3 c0 0.8 3.4 2 3.4 5.4 c0 3 -2 3.6 -4.8 3.6 c-2.8 0 -4.8 -0.6 -4.8 -3.6 c0 -3.4 3.4 -4.6 3.4 -5.4 Z" fill={color} thin />
      <path d="M-2.6 -5 c0 -1 0.6 -1.8 1.4 -2.2" {...line(WHITE, 0.8)} />
    </g>
  );
}

function Glassworks({ blower = false }: { blower?: boolean }) {
  return (
    <g>
      <Sky color="#e6dccb" />
      <Box x={-2} y={70} w={104} h={34} fill="#a8927a" />
      <Box x={60} y={6} w={12} h={30} fill="#9a7a62" />
      <Smoke x={66} y={4} />
      <Shape d="M28 72 V48 A26 26 0 0 1 80 48 V72 Z" fill="#b0654a" />
      <path d="M32 56 h44 M30 64 h48 M38 44 h32" {...line('#7c432e', 0.8)} />
      <ArchHole x={44} w={20} top={52} bottom={72} fill="#3a1d10" />
      <Shape d="M47 72 q7 -14 14 0 Z" fill={FIRE} thin />
      <Shape d="M51 72 q3 -7 6 0 Z" fill={FIRE_L} thin />
      <Box x={2} y={78} w={34} h={4} fill={DARKWOOD} thin />
      <Box x={4} y={82} w={3} h={14} fill={DARKWOOD} thin />
      <Box x={31} y={82} w={3} h={14} fill={DARKWOOD} thin />
      <Bottle x={9} y={78} color="#5fc0e0" />
      <Bottle x={19} y={78} color="#7fd08a" s={0.85} />
      <Bottle x={28} y={78} color="#5fa8e0" s={0.75} />
      {blower ? (
        <g>
          <path d="M70 94 L88 70" {...line(INK, 1.8)} />
          <circle cx={68} cy={96} r={5} fill={FIRE_L} {...LINE} />
          <Figure x={90} y={100} robe="#8aa0b8" s={1.4} />
        </g>
      ) : (
        <g>
          <Bottle x={84} y={96} color="#5fc0e0" s={1.5} />
          <Bottle x={72} y={96} color="#e9a24a" s={1.1} />
        </g>
      )}
    </g>
  );
}

function PapyrusPlant({ x, y, h }: XY & { h: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - h} {...line(LEAF_D, 1.6)} />
      <path d={`M${x} ${y - h} l-6 -5 M${x} ${y - h} l-3 -7 M${x} ${y - h} l0 -8 M${x} ${y - h} l3 -7 M${x} ${y - h} l6 -5`} {...line('#7fb45a', 1.2)} />
    </g>
  );
}

function PapyrusMarsh({ racks = false }: { racks?: boolean }) {
  return (
    <g>
      <Sky color={SKY_WARM} />
      <Sun x={80} y={18} r={8} />
      <Ground y={62} fill={SAND} />
      <Box x={-2} y={84} w={104} h={20} fill={WATER} />
      <Waves y={92} />
      {[8, 14, 20, 88, 94].map((x, i) => <PapyrusPlant key={i} x={x} y={88} h={30 + (i % 2) * 6} />)}
      {racks ? (
        <g>
          <Box x={28} y={36} w={3} h={44} fill={DARKWOOD} thin />
          <Box x={72} y={36} w={3} h={44} fill={DARKWOOD} thin />
          <line x1={28} y1={40} x2={75} y2={40} {...line(INK, 1)} />
          <line x1={28} y1={58} x2={75} y2={58} {...line(INK, 1)} />
          {[33, 46, 59].map((x) => <Box key={x} x={x} y={40} w={11} h={14} fill="#f6e7b4" thin />)}
          {[33, 46, 59].map((x) => <Box key={x + 1} x={x} y={58} w={11} h={14} fill="#efdca0" thin />)}
        </g>
      ) : (
        <g>
          <Box x={32} y={62} w={38} h={18} fill={WOOD} />
          <Box x={36} y={40} w={4} h={22} fill={DARKWOOD} thin />
          <Box x={62} y={40} w={4} h={22} fill={DARKWOOD} thin />
          <Box x={32} y={36} w={38} h={6} fill={DARKWOOD} />
          <Box x={46} y={42} w={10} h={12} fill={IRON} thin />
          <Box x={38} y={54} w={26} h={6} fill="#f6e7b4" thin />
          <g transform="translate(72 66) scale(0.75)"><PapyrusGlyph /></g>
        </g>
      )}
    </g>
  );
}

// ---- Blue -----------------------------------------------------------------

function TempleScene() {
  return (
    <g>
      <Sky />
      <Cloud x={18} y={14} />
      <Cypress x={8} y={80} h={30} />
      <Cypress x={93} y={80} h={26} />
      <Ground y={80} />
      <Steps x={16} y={72} w={68} n={3} />
      <Colonnade x0={22} x1={78} y={44} h={28} n={5} />
      <Box x={14} y={38} w={72} h={6} fill={STONE} />
      <Pediment x={14} y={22} w={72} h={16} />
    </g>
  );
}

function TheaterScene() {
  const aisles = [30, 60, 90, 120, 150].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return <line key={deg} x1={50 + Math.cos(a) * 15} y1={78 - Math.sin(a) * 13} x2={50 + Math.cos(a) * 42} y2={78 - Math.sin(a) * 40} {...line(SHADOW, 0.8)} />;
  });
  return (
    <g>
      <Sky />
      <Hills y={46} fill={GRASS_D} />
      <Shape d="M8 78 A42 40 0 0 1 92 78 Z" fill={STONE_D} />
      <Shape d="M17 78 A33 31 0 0 1 83 78 Z" fill={STONE} />
      <Shape d="M26 78 A24 22 0 0 1 74 78 Z" fill={STONE_D} />
      {aisles}
      <Shape d="M35 78 A15 13 0 0 1 65 78 Z" fill={SAND} />
      <Ground y={82} fill={SAND_D} />
      <Box x={16} y={78} w={68} h={10} fill={MARBLE} />
      <Colonnade x0={22} x1={78} y={78} h={10} n={7} w={3} />
    </g>
  );
}

function AltarScene() {
  return (
    <g>
      <Sky color="#f3d9b5" />
      <Sun x={50} y={30} r={18} color="#ffe7a6" />
      <Ground y={80} fill={STONE} />
      <Column x={14} y={24} h={56} w={8} />
      <Column x={86} y={24} h={56} w={8} />
      <Steps x={30} y={72} w={40} n={3} />
      <Box x={34} y={54} w={32} h={18} fill={MARBLE} />
      <Box x={34} y={60} w={32} h={4} fill={STONE_D} thin />
      <Box x={31} y={50} w={38} h={5} fill={MARBLE} />
      <Shape d="M50 22 C57 31 62 38 59 45 C57 50 43 50 41 45 C38 38 44 33 50 22 Z" fill={FIRE} />
      <Shape d="M50 32 C54 37 56 41 54 45 C53 48 47 48 46 45 C44 41 47 38 50 32 Z" fill={FIRE_L} thin />
    </g>
  );
}

function BathsScene() {
  return (
    <g>
      <Sky />
      <Box x={-2} y={30} w={104} h={50} fill={STONE} />
      <Box x={-2} y={24} w={104} h={7} fill={STONE_D} />
      <ArchHole x={6} w={22} top={40} bottom={76} fill="#7fa9bd" />
      <ArchHole x={39} w={22} top={40} bottom={76} fill="#7fa9bd" />
      <ArchHole x={72} w={22} top={40} bottom={76} fill="#7fa9bd" />
      <Box x={-2} y={74} w={104} h={5} fill={MARBLE} />
      <Box x={-2} y={79} w={104} h={25} fill={WATER} />
      <Waves y={86} />
      <Waves y={95} x0={6} />
      {[20, 50, 80].map((x) => <path key={x} d={`M${x} 70 q-3 -6 0 -10 q3 -4 0 -9`} {...line(WHITE, 1.2)} opacity={0.7} />)}
    </g>
  );
}

function PharmacistScene() {
  return (
    <g>
      <Sky />
      <Ground y={82} fill={STONE} />
      <Box x={10} y={32} w={80} h={50} fill="#efe2c4" />
      <Poly points="6,34 50,16 94,34" fill={ROOF} />
      <Box x={18} y={44} w={40} h={38} fill="#6e5440" />
      {[52, 64].map((y) => <Box key={y} x={20} y={y} w={36} h={2.4} fill={DARKWOOD} thin />)}
      {[24, 31, 38, 45, 52].map((x, i) => <Box key={x} x={x - 2.5} y={46} w={5} h={6} rx={1.2} fill={['#7fd08a', '#5fc0e0', '#e9a24a', '#d77fa8', '#7fd08a'][i]} thin />)}
      {[24, 33, 42, 51].map((x, i) => <Box key={x} x={x - 3} y={57.5} w={6} h={6.5} rx={1.5} fill={['#e9a24a', '#5fc0e0', '#7fd08a', '#e9a24a'][i]} thin />)}
      <Box x={18} y={74} w={40} h={8} fill={WOOD} />
      <line x1={66} y1={44} x2={82} y2={44} {...line(INK, 1.2)} />
      <circle cx={76} cy={58} r={10} fill={CREAM} {...LINE} />
      <line x1={76} y1={50} x2={76} y2={66} {...line(DARKWOOD, 1.6)} />
      <path d="M72.5 53 q7 2 0 4.5 q-6 2.5 1 5" {...line(LEAF_D, 1.6)} />
      <line x1={70} y1={44} x2={72} y2={48} {...line(INK, 0.8)} />
      <line x1={82} y1={44} x2={80} y2={48} {...line(INK, 0.8)} />
    </g>
  );
}

function StatueScene() {
  return (
    <g>
      <Sky />
      <Cloud x={78} y={16} s={0.9} />
      <Cypress x={14} y={84} h={34} />
      <Cypress x={86} y={84} h={30} />
      <Ground y={84} />
      <Box x={33} y={84} w={34} h={4} fill={MARBLE} />
      <Box x={36} y={64} w={28} h={20} fill={MARBLE} />
      <Box x={36} y={70} w={28} h={3} fill={STONE} thin />
      <Box x={33} y={60} w={34} h={4.5} fill={MARBLE} />
      <Shape d="M43 60 L45.5 38 L54.5 38 L57 60 Z" fill={BRONZE} />
      <path d="M45 44 l10 2 M44.4 50 l11.2 2" {...line('#8f6229', 0.8)} />
      <path d="M54 40 L61 26" {...line(INK, 4.2)} />
      <path d="M54 40 L61 26" {...line(BRONZE, 2.6)} />
      <path d="M46 40 L42 52" {...line(INK, 4.2)} />
      <path d="M46 40 L42 52" {...line(BRONZE, 2.6)} />
      <line x1={62} y1={14} x2={60} y2={60} {...line(INK, 1.2)} />
      <Poly points="62,10 64,16 60,16" fill={IRON} thin />
      <circle cx={50} cy={33} r={5} fill={BRONZE} {...LINE} />
      <path d="M45.4 30 q4.6 -5 9.2 0" {...line(LEAF_D, 1.6)} />
    </g>
  );
}

function AqueductScene() {
  return (
    <g>
      <Sky />
      <Cloud x={20} y={12} s={0.8} />
      <Hills y={62} fill={GRASS} />
      <Box x={-3} y={24} w={106} h={8} fill={STONE} />
      <rect x={-3} y={24} width={106} height={2.6} fill={WATER} />
      <Box x={-3} y={32} w={106} h={18} fill={STONE_D} />
      {[2, 22, 42, 62, 82].map((x) => <ArchHole key={x} x={x} w={14} top={35} bottom={50} fill="#b8dbea" />)}
      <Box x={-3} y={50} w={106} h={40} fill={STONE} />
      {[-4, 22, 48, 74].map((x) => <ArchHole key={x} x={x} w={18} top={56} bottom={90} fill="#a9d29b" />)}
      <Ground y={86} fill={GRASS_D} />
    </g>
  );
}

function RostrumScene() {
  return (
    <g>
      <Sky />
      <Colonnade x0={8} x1={92} y={30} h={34} n={6} fill="#e7dfc8" />
      <Box x={2} y={26} w={96} h={5} fill={STONE} />
      <Ground y={80} fill={STONE} />
      <path d="M0 88 h100 M20 80 l-6 20 M50 80 v20 M80 80 l6 20" {...line(STONE_D, 0.8)} />
      <Box x={22} y={58} w={56} h={24} fill={MARBLE} />
      <Box x={20} y={55} w={60} h={4} fill={STONE} />
      {[30, 56].map((x) => (
        <Shape key={x} d={`M${x} 64 q8 0 14 6 q-6 1 -8 6 q-2 -6 -6 -6 Z`} fill={BRONZE} />
      ))}
      <Figure x={50} y={55} robe={WHITE} s={1.3} armUp />
    </g>
  );
}

function PantheonScene() {
  return (
    <g>
      <Sky />
      <Cloud x={82} y={12} s={0.8} />
      <Ground y={82} fill={STONE} />
      <Box x={20} y={44} w={60} h={38} fill={STONE} />
      <Shape d="M18 46 A32 28 0 0 1 82 46 Z" fill="#cfc8b8" />
      <path d="M34 46 Q36 26 50 18 M66 46 Q64 26 50 18 M50 18 V46" {...line(SHADOW, 0.7)} />
      <ellipse cx={50} cy={19} rx={4} ry={1.4} fill={SHADOW} {...THIN} />
      <Pediment x={26} y={40} w={48} h={12} />
      <Box x={26} y={52} w={48} h={4} fill={STONE} />
      <Colonnade x0={30} x1={70} y={56} h={22} n={5} w={4} />
      <Steps x={24} y={78} w={52} n={2} dy={2.4} />
    </g>
  );
}

function GardensScene() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={GRASS} />
      <Tree x={12} y={66} s={1.2} />
      <Tree x={88} y={66} s={1.25} />
      <Cypress x={30} y={64} h={28} />
      <Cypress x={70} y={64} h={28} />
      <Poly points="40,102 60,102 54,66 46,66" fill={SAND} />
      <Box x={2} y={66} w={36} h={10} rx={5} fill={LEAF_D} />
      <Box x={62} y={66} w={36} h={10} rx={5} fill={LEAF_D} />
      {[8, 16, 24, 32, 68, 76, 84, 92].map((x, i) => <circle key={x} cx={x} cy={67} r={1.6} fill={i % 2 ? '#f6a6c0' : '#ffe07a'} {...THIN} />)}
      <ellipse cx={50} cy={84} rx={20} ry={6} fill={MARBLE} {...LINE} />
      <ellipse cx={50} cy={83} rx={15} ry={3.6} fill={WATER} {...THIN} />
      <Box x={47.5} y={66} w={5} h={16} fill={MARBLE} thin />
      <path d="M50 64 q-8 -6 -12 10 M50 64 q8 -6 12 10 M50 64 v-6" {...line(WATER_D, 1.4)} />
    </g>
  );
}

function SenateScene() {
  return (
    <g>
      <Sky />
      <Cloud x={16} y={12} s={0.8} />
      <Ground y={82} fill={STONE} />
      <Shape d="M34 36 A16 12 0 0 1 66 36 Z" fill="#cfc8b8" />
      <Box x={6} y={34} w={88} h={6} fill={STONE} />
      <Box x={8} y={40} w={84} h={36} fill={MARBLE} />
      <Colonnade x0={13} x1={87} y={42} h={32} n={8} w={4.2} fill={WHITE} />
      <Steps x={14} y={76} w={72} n={2} dy={3} />
      <Banner x={2} y={40} color={RED} w={7} h={18} />
      <Banner x={91} y={40} color={RED} w={7} h={18} />
    </g>
  );
}

function TownHallScene() {
  return (
    <g>
      <Sky />
      <Ground y={82} fill={STONE} />
      <Box x={40} y={14} w={20} h={30} fill={STONE} />
      <Poly points="38,15 50,4 62,15" fill={ROOF} />
      <circle cx={50} cy={24} r={5} fill={CREAM} {...LINE} />
      <path d="M50 24 V20.5 M50 24 L52.6 25.4" {...line(INK, 1)} />
      <Box x={8} y={42} w={84} h={40} fill={MARBLE} />
      <Box x={6} y={38} w={88} h={5} fill={STONE} />
      {[14, 26, 64, 76].map((x) => <ArchHole key={x} x={x} w={8} top={48} bottom={60} fill="#7fa9bd" />)}
      {[14, 26, 64, 76].map((x) => <ArchHole key={x + 1} x={x} w={8} top={66} bottom={78} fill="#7fa9bd" />)}
      <Pediment x={38} y={44} w={24} h={8} />
      <ArchHole x={42} w={16} top={56} bottom={82} fill={DARKWOOD} />
      <Banner x={4} y={43} color={BLUE} w={6} h={16} />
      <Banner x={90} y={43} color={BLUE} w={6} h={16} />
    </g>
  );
}

function ObeliskScene() {
  return (
    <g>
      <Sky color={SKY_WARM} />
      <Sun x={78} y={22} r={9} />
      <path d="M-3 70 Q 30 60 60 68 T 103 64 V90 H-3 Z" fill={SAND_D} {...LINE} />
      <Ground y={82} fill={SAND} />
      <Palm x={18} y={84} h={34} />
      <Box x={38} y={80} w={24} h={7} fill={STONE} />
      <Poly points="44,80 46,24 54,24 56,80" fill={STONE} />
      <Poly points="54,24 56,80 51,80" fill={STONE_D} thin />
      <Poly points="46,24 50,14 54,24" fill={GOLD} />
      {[34, 44, 54, 64].map((y) => <path key={y} d={`M48 ${y} h2.4 M48.6 ${y + 4} h1.6`} {...line(SHADOW, 0.9)} />)}
    </g>
  );
}

// ---- Red ------------------------------------------------------------------

function PalisadeScene({ gate = false }: { gate?: boolean }) {
  const tops = [38, 34, 40, 33, 37, 41, 35, 39, 34, 38];
  return (
    <g>
      <Sky />
      <Cloud x={76} y={14} s={0.9} />
      <Hills y={56} fill={GRASS_D} />
      <Ground y={80} />
      {tops.map((t, i) => {
        const x = -2 + i * 10.4;
        if (gate && (i === 4 || i === 5)) return null;
        return <Poly key={i} points={`${x},84 ${x},${t + 6} ${x + 5},${t} ${x + 10},${t + 6} ${x + 10},84`} fill={i % 2 ? '#b07438' : WOOD} />;
      })}
      <Box x={-3} y={52} w={106} h={3} fill={DARKWOOD} thin />
      <Box x={-3} y={70} w={106} h={3} fill={DARKWOOD} thin />
      {gate && (
        <g>
          <Box x={39.6} y={50} w={20.8} h={34} fill="#3b2a1a" />
          <Box x={36} y={36} w={4} h={48} fill={DARKWOOD} thin />
          <Box x={60} y={36} w={4} h={48} fill={DARKWOOD} thin />
          <Box x={34} y={34} w={32} h={5} fill={DARKWOOD} />
          <Pennant x={50} y={34} color={RED} h={14} />
        </g>
      )}
      {!gate && <Pennant x={33} y={34} color={RED} h={14} />}
    </g>
  );
}

function Tent({ x, y, w, color }: XY & { w: number; color: string }) {
  return (
    <g>
      <Poly points={`${x},${y} ${x + w / 2},${y - w * 0.75} ${x + w},${y}`} fill={color} />
      <path d={`M${x + w / 2} ${y - w * 0.75} L${x + w * 0.3} ${y} M${x + w / 2} ${y - w * 0.75} L${x + w * 0.7} ${y}`} {...line('#f4e3c3', 1.2)} />
      <Poly points={`${x + w * 0.42},${y} ${x + w / 2},${y - w * 0.32} ${x + w * 0.58},${y}`} fill={INK} thin />
      <line x1={x + w / 2} y1={y - w * 0.75} x2={x + w / 2} y2={y - w * 0.75 - 6} {...line(INK, 1)} />
    </g>
  );
}

function BarracksScene() {
  return (
    <g>
      <Sky />
      <Hills y={56} />
      <Ground y={76} fill={DIRT} />
      <Tent x={4} y={80} w={40} color={RED} />
      <Tent x={46} y={74} w={28} color="#d9c08d" />
      {[78, 84, 90].map((x) => (
        <g key={x}>
          <line x1={x} y1={88} x2={x} y2={50} {...line(DARKWOOD, 1.4)} />
          <Poly points={`${x - 2},${51} ${x},${44} ${x + 2},${51}`} fill={IRON} thin />
        </g>
      ))}
      <circle cx={84} cy={80} r={8} fill={BRONZE} {...LINE} />
      <circle cx={84} cy={80} r={2.4} fill={GOLD} {...THIN} />
      <path d="M40 94 l10 -4 M42 90 l8 4" {...line(DARKWOOD, 2)} />
      <Shape d="M42 90 q4 -9 8 0 Z" fill={FIRE} thin />
    </g>
  );
}

function GuardTowerScene() {
  return (
    <g>
      <Sky />
      <Cloud x={20} y={16} />
      <Hills y={60} />
      <Ground y={82} />
      <Box x={-3} y={60} w={42} h={22} fill={STONE_D} />
      <Crenels x={-3} y={60} w={42} n={5} fill={STONE_D} />
      <Box x={38} y={28} w={30} h={54} fill={STONE} />
      <Crenels x={36} y={28} w={34} n={4} h={6} />
      {[38, 50, 62, 74].map((y) => <path key={y} d={`M38 ${y} h30 M${y % 24 ? 46 : 53} ${y} v-6`} {...line(STONE_D, 0.7)} />)}
      <ArchHole x={49} w={8} top={38} bottom={50} fill={INK} />
      <ArchHole x={46} w={14} top={66} bottom={82} fill={DARKWOOD} />
      <Pennant x={60} y={22} color={RED} h={16} />
    </g>
  );
}

function WallsScene({ towers = false }: { towers?: boolean }) {
  return (
    <g>
      <Sky />
      <Cloud x={50} y={12} s={0.9} />
      <Ground y={84} fill={GRASS_D} />
      <Box x={-3} y={42} w={106} h={42} fill={STONE} />
      <Crenels x={-3} y={42} w={106} n={9} h={6} />
      {[52, 62, 72].map((y, r) => [0, 1, 2, 3, 4, 5].map((c) => (
        <line key={`${r}${c}`} x1={c * 18 + (r % 2) * 9} y1={y} x2={c * 18 + (r % 2) * 9} y2={y + 10} {...line(STONE_D, 0.7)} />
      )))}
      <path d="M-3 52 h106 M-3 62 h106 M-3 72 h106" {...line(STONE_D, 0.7)} />
      <ArchHole x={38} w={24} top={54} bottom={84} fill="#3b2a1a" />
      <path d="M40 66 h20 M40 72 h20 M40 78 h20 M45 60 v24 M50 58 v26 M55 60 v24" {...line('#6b5a40', 0.8)} />
      {towers && (
        <g>
          {[2, 74].map((x) => (
            <g key={x}>
              <Box x={x} y={26} w={24} h={58} fill={STONE_D} />
              <Crenels x={x - 2} y={26} w={28} n={4} h={6} fill={STONE_D} />
              <ArchHole x={x + 9} w={6} top={36} bottom={46} fill={INK} />
              <Pennant x={x + 12} y={20} color={RED} h={14} />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}

function Horse({ x, y, s = 1, fill = '#8b5a2e' }: XY & { s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 -4 q-8 2 -9 14" {...line(INK, 3)} />
      <path d="M-14 -4 q-8 2 -9 14" {...line('#4b2e17', 1.8)} />
      {[[-12, 0], [-7, 0], [8, 0], [13, 0]].map(([lx], i) => (
        <Box key={i} x={lx - 1.6} y={2} w={3.2} h={17} fill={i % 3 === 0 ? '#6e4423' : fill} thin />
      ))}
      <ellipse cx={0} cy={0} rx={17} ry={8.5} fill={fill} {...LINE} />
      <Shape d="M10 -3 L15 -20 L22 -18 L18 2 Z" fill={fill} />
      <Shape d="M14 -22 Q19 -26 24 -21 L31 -15 Q32 -12 29 -11 L22 -11 Q17 -12 15 -16 Z" fill={fill} />
      <Poly points="16,-22 17,-28 19,-23" fill={fill} thin />
      <path d="M14 -20 Q10 -12 10 -3" {...line('#4b2e17', 2.4)} />
      <circle cx={21} cy={-18} r={0.9} fill={INK} />
    </g>
  );
}

function HorseScene() {
  return (
    <g>
      <Sky />
      <Hills y={58} fill={GRASS} />
      <Ground y={78} />
      <Horse x={46} y={60} s={1.15} />
      {[4, 30, 56, 82].map((x) => <Box key={x} x={x} y={66} w={4} h={24} fill={WOOD} thin />)}
      <Box x={-3} y={70} w={106} h={3.6} fill="#c08a4c" thin />
      <Box x={-3} y={80} w={106} h={3.6} fill="#c08a4c" thin />
    </g>
  );
}

function ArcheryScene() {
  return (
    <g>
      <Sky />
      <Hills y={58} />
      <Ground y={76} />
      <path d="M50 86 L60 54 L70 86 M60 54 V86" {...line(DARKWOOD, 2)} />
      {[[20, WHITE], [16, RED], [12, WHITE], [8, RED], [4, GOLD]].map(([r, c], i) => (
        <circle key={i} cx={60} cy={46} r={r as number} fill={c as string} {...LINE} />
      ))}
      {[[62, 44, 32, 30], [57, 50, 30, 54], [65, 40, 44, 18]].map(([x1, y1, x2, y2], i) => (
        <g key={i}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} {...line(DARKWOOD, 1.2)} />
          <path d={`M${x2} ${y2} l-3 -1 M${x2} ${y2} l-1 3`} {...line(RED, 1.4)} />
        </g>
      ))}
      <Box x={4} y={78} w={26} h={14} rx={3} fill="#e2c46a" />
      <path d="M8 78 v14 M15 78 v14 M22 78 v14" {...line('#b3913a', 0.9)} />
      <path d="M76 94 Q88 80 100 94" {...line(DARKWOOD, 2.4)} />
      <line x1={76} y1={94} x2={100} y2={94} {...line(INK, 0.6)} />
    </g>
  );
}

function ParadeScene() {
  return (
    <g>
      <Sky />
      <Ground y={74} fill={SAND} />
      {[18, 50, 82].map((x) => (
        <g key={x}>
          <line x1={x + 9} y1={90} x2={x + 9} y2={28} {...line(DARKWOOD, 1.4)} />
          <Poly points={`${x + 7},${30} ${x + 9},${22} ${x + 11},${30}`} fill={IRON} thin />
          <Shape d={`M${x - 8} 38 q8 -12 16 0 v4 h-16 Z`} fill={BRONZE} />
          <path d={`M${x - 7} 30 q7 -10 14 0`} {...line(RED, 3)} />
          <Box x={x - 10} y={44} w={20} h={34} rx={4} fill={RED} />
          <path d={`M${x - 6} 48 v26 M${x + 6} 48 v26`} {...line(GOLD, 1.2)} />
          <circle cx={x} cy={61} r={3.4} fill={GOLD} {...THIN} />
        </g>
      ))}
      <Ground y={88} fill={SAND_D} />
    </g>
  );
}

function SiegeScene() {
  return (
    <g>
      <Sky />
      <Hills y={58} />
      <Box x={2} y={48} w={30} h={34} fill="#d9b98a" />
      <Poly points="-2,50 17,36 36,50" fill={ROOF} />
      <Box x={10} y={62} w={12} h={20} fill={DARKWOOD} />
      <Ground y={80} fill={DIRT} />
      <path d="M48 70 L66 42 L84 70" {...line(INK, 4)} />
      <path d="M48 70 L66 42 L84 70" {...line(WOOD, 2.4)} />
      <Box x={40} y={68} w={52} h={7} fill={WOOD} />
      <path d="M50 68 L86 22" {...line(INK, 4.2)} />
      <path d="M50 68 L86 22" {...line('#b97a3c', 2.6)} />
      <Shape d="M82 22 q4 -6 10 -2 q-2 6 -8 6 Z" fill={DARKWOOD} />
      <circle cx={88} cy={18} r={4} fill={IRON} {...LINE} />
      <Wheel x={48} y={80} r={7} />
      <Wheel x={84} y={80} r={7} />
      {[[30, 92], [37, 93], [33.5, 87]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.6} fill={IRON} {...LINE} />)}
    </g>
  );
}

function ArenaScene({ banner }: { banner: string }) {
  return (
    <g>
      <Sky />
      <Cloud x={20} y={12} s={0.8} />
      <Ground y={86} fill={SAND} />
      <Shape d="M4 86 V42 Q50 26 96 42 V86 Z" fill={STONE} />
      <path d="M4 60 Q50 46 96 60 M4 42 Q50 26 96 42" {...line(STONE_D, 1)} />
      {[10, 24, 38, 52, 66, 80].map((x) => <ArchHole key={x} x={x} w={9} top={x < 30 || x > 70 ? 46 : 42} bottom={x < 30 || x > 70 ? 58 : 54} fill={SHADOW} />)}
      {[10, 24, 38, 52, 66, 80].map((x) => <ArchHole key={x + 1} x={x} w={9} top={66} bottom={86} fill={SHADOW} />)}
      {[16, 50, 84].map((x) => <Pennant key={x} x={x} y={x === 50 ? 34 : 38} color={banner} h={12} />)}
    </g>
  );
}

function ArsenalScene({ coins = false }: { coins?: boolean }) {
  return (
    <g>
      <Sky color="#d9ccb3" />
      <path d="M0 30 h100 M0 50 h100 M20 30 v20 M60 30 v20 M40 10 v20 M80 10 v20" {...line('#bfae90', 0.8)} />
      <Box x={-2} y={80} w={104} h={24} fill="#a8927a" />
      <Box x={6} y={22} w={88} h={5} fill={DARKWOOD} />
      {[14, 24, 34].map((x) => (
        <g key={x}>
          <line x1={x} y1={20} x2={x} y2={80} {...line(DARKWOOD, 1.6)} />
          <Poly points={`${x - 2.4},${21} ${x},${12} ${x + 2.4},${21}`} fill={IRON} thin />
        </g>
      ))}
      {[48, 58].map((x) => (
        <g key={x}>
          <Shape d={`M${x - 2} 30 h4 v28 l-2 4 l-2 -4 Z`} fill="#d8dde2" thin />
          <Box x={x - 5} y={26} w={10} h={3} fill={GOLD} thin />
          <Box x={x - 1.4} y={20} w={2.8} h={6} fill={DARKWOOD} thin />
        </g>
      ))}
      {coins ? (
        <g>
          <CoinStack x={74} y={80} n={6} />
          <CoinStack x={86} y={80} n={4} />
          <circle cx={56} cy={76} r={9} fill={BRONZE} {...LINE} />
        </g>
      ) : (
        <g>
          <circle cx={76} cy={64} r={13} fill={BRONZE} {...LINE} />
          <circle cx={76} cy={64} r={4} fill={GOLD} {...THIN} />
          <Box x={40} y={70} w={22} h={14} rx={4} fill={RED} />
          <circle cx={51} cy={77} r={2.4} fill={GOLD} {...THIN} />
        </g>
      )}
    </g>
  );
}

// ---- Green ----------------------------------------------------------------

/** Interior of a hall of learning with a big plaque of the card's symbol. */
function AcademyScene({ symbol }: { symbol: DuelScience }) {
  return (
    <g>
      <Sky color="#dfeccf" />
      <Box x={-2} y={82} w={104} h={22} fill="#c9b48a" />
      <path d="M0 90 h100 M20 82 l-6 20 M50 82 v20 M80 82 l6 20" {...line('#a8935f', 0.8)} />
      <Box x={-2} y={8} w={104} h={7} fill={STONE} />
      <Column x={10} y={15} h={67} w={9} />
      <Column x={90} y={15} h={67} w={9} />
      <circle cx={50} cy={44} r={24} fill="#f7efd8" {...LINE} />
      <circle cx={50} cy={44} r={20.5} {...line('#c9a245', 1.6)} />
      <g transform="translate(50 44) scale(1.55) translate(-12 -12)"><ScienceGlyph symbol={symbol} bare /></g>
      <Box x={40} y={74} w={20} h={4} fill={DARKWOOD} thin />
      <Box x={47} y={78} w={6} h={10} fill={DARKWOOD} thin />
      <Box x={38} y={70} w={24} h={4} rx={2} fill="#f6e7b4" thin />
    </g>
  );
}

function ApothecaryScene({ bottles = false }: { bottles?: boolean }) {
  const colors = ['#7fd08a', '#5fc0e0', '#e9a24a', '#d77fa8', '#a98fe0', '#7fd08a'];
  return (
    <g>
      <Sky color="#e2ecd6" />
      <Box x={-2} y={84} w={104} h={20} fill="#a8927a" />
      {[34, 58, 82].map((y, r) => (
        <g key={y}>
          <Box x={4} y={y} w={92} h={3.4} fill={DARKWOOD} />
          {[12, 26, 40, 54, 68, 82].map((x, i) => bottles
            ? <Bottle key={x} x={x} y={y} color={colors[(i + r) % colors.length]} s={1.15} />
            : (
              <g key={x}>
                <Box x={x - 5} y={y - 14} w={10} h={14} rx={2.4} fill={colors[(i + r * 2) % colors.length]} thin />
                <Box x={x - 5.6} y={y - 16} w={11.2} h={3} rx={1} fill={STONE_D} thin />
                <Box x={x - 3} y={y - 9} w={6} h={4} fill={CREAM} thin />
              </g>
            ))}
        </g>
      ))}
      <path d="M90 6 v8" {...line(INK, 0.8)} />
      <path d="M90 14 l-4 10 M90 14 l0 11 M90 14 l4 10" {...line(LEAF_D, 1.6)} />
    </g>
  );
}

function WorkshopScene({ lab = false }: { lab?: boolean }) {
  return (
    <g>
      <Sky color="#e2ddcc" />
      <Box x={10} y={10} w={80} h={40} fill="#c9a87a" />
      <path d="M22 18 v14 M18 18 h8" {...line(INK, 2.2)} />
      <Shape d="M38 16 h10 l-2 10 h-6 Z" fill={IRON} thin />
      <line x1={43} y1={26} x2={43} y2={40} {...line(DARKWOOD, 2)} />
      <path d="M60 16 L56 40 M60 16 L64 40 M57.6 30 q2.4 2 4.8 0" {...line(INK, 1.4)} />
      <circle cx={60} cy={15} r={1.8} fill={GOLD} {...THIN} />
      <Gear x={78} y={28} r={8} fill="#9a9480" />
      <Box x={-2} y={84} w={104} h={20} fill="#a8927a" />
      <Box x={4} y={62} w={92} h={6} fill={WOOD} />
      <Box x={8} y={68} w={5} h={18} fill={DARKWOOD} thin />
      <Box x={87} y={68} w={5} h={18} fill={DARKWOOD} thin />
      <Gear x={30} y={52} r={10} fill={BRONZE} />
      <Gear x={45} y={56} r={6} fill="#9a9480" />
      {lab ? (
        <g>
          <Bottle x={66} y={62} color="#7fd08a" s={1.4} />
          <Bottle x={78} y={62} color="#5fc0e0" s={1.1} />
        </g>
      ) : (
        <g>
          <Box x={62} y={52} w={20} h={10} fill={IRON} />
          <Box x={70} y={44} w={4} h={8} fill={DARKWOOD} thin />
        </g>
      )}
    </g>
  );
}

function LibraryScene() {
  const ends: ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const x0 = 8 + c * 21;
      const y0 = 10 + r * 18;
      [[5, 6], [12, 6], [8.5, 12], [15.5, 12]].forEach(([dx, dy], k) => {
        ends.push(<circle key={`${r}${c}${k}`} cx={x0 + dx} cy={y0 + dy} r={3} fill="#f3e2a8" {...THIN} />);
      });
    }
  }
  return (
    <g>
      <Sky color="#e8dcc0" />
      <Box x={4} y={6} w={92} h={60} fill={DARKWOOD} />
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
        <Box key={`${r}${c}`} x={8 + c * 21} y={10 + r * 18} w={19} h={16} fill="#4a2c14" thin />
      )))}
      {ends}
      <Box x={-2} y={84} w={104} h={20} fill="#a8927a" />
      <Box x={20} y={70} w={60} h={6} fill={WOOD} />
      <Box x={26} y={76} w={5} h={12} fill={DARKWOOD} thin />
      <Box x={69} y={76} w={5} h={12} fill={DARKWOOD} thin />
      <Box x={30} y={64} w={30} h={6} rx={1} fill="#f6e7b4" thin />
      <path d="M34 67 h20" {...line('#a7884a', 0.8)} />
      <rect x={28} y={63} width={4} height={8} rx={2} fill="#dcc07a" {...THIN} />
      <rect x={58} y={63} width={4} height={8} rx={2} fill="#dcc07a" {...THIN} />
      <Box x={66} y={64} w={6} h={6} rx={1.6} fill={INK} thin />
      <path d="M70 64 Q76 54 82 52" {...line(WHITE, 1.4)} />
    </g>
  );
}

function ObservatoryScene() {
  return (
    <g>
      <Sky color="#26345c" />
      {[[10, 12], [26, 30], [86, 14], [72, 34], [14, 50], [92, 52], [40, 8], [60, 12]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.5} fill="#fff6c8" />
      ))}
      <path d="M78 10 a7 7 0 1 0 6 11 a5.6 5.6 0 1 1 -6 -11 Z" fill="#fff0b0" />
      <Ground y={86} fill="#5f6b4a" />
      <Box x={30} y={62} w={40} h={28} fill={STONE} />
      <Crenels x={28} y={62} w={44} n={5} h={4} />
      <ArchHole x={44} w={12} top={72} bottom={90} fill={DARKWOOD} />
      <Box x={47} y={52} w={6} h={10} fill={BRONZE} thin />
      <circle cx={50} cy={36} r={16} {...line(INK, 3)} />
      <circle cx={50} cy={36} r={16} {...line(GOLD, 1.6)} />
      <ellipse cx={50} cy={36} rx={16} ry={6} transform="rotate(-22 50 36)" {...line(INK, 3)} />
      <ellipse cx={50} cy={36} rx={16} ry={6} transform="rotate(-22 50 36)" {...line(GOLD, 1.6)} />
      <ellipse cx={50} cy={36} rx={6} ry={16} transform="rotate(18 50 36)" {...line(INK, 3)} />
      <ellipse cx={50} cy={36} rx={6} ry={16} transform="rotate(18 50 36)" {...line(GOLD, 1.6)} />
      <circle cx={50} cy={36} r={3.6} fill="#5fa8e0" {...LINE} />
    </g>
  );
}

function StableScene() {
  return (
    <g>
      <Sky />
      <Hills y={56} />
      <Ground y={80} fill={DIRT} />
      <Box x={4} y={40} w={56} h={40} fill="#d9b98a" />
      <Poly points="0,42 32,24 64,42" fill={ROOF} />
      <Box x={14} y={52} w={16} h={28} fill={DARKWOOD} />
      <Box x={36} y={52} w={16} h={28} fill={DARKWOOD} />
      <path d="M14 52 L30 80 M30 52 L14 80 M36 52 L52 80 M52 52 L36 80" {...line('#9a6431', 1.2)} />
      <Wheel x={76} y={66} r={16} />
      <Wheel x={60} y={86} r={9} />
    </g>
  );
}

// ---- Yellow ---------------------------------------------------------------

function TavernScene() {
  return (
    <g>
      <Sky />
      <Cloud x={84} y={14} s={0.8} />
      <Ground y={82} fill={STONE} />
      <Box x={10} y={38} w={64} h={44} fill="#f0dcb4" />
      <Poly points="4,40 42,20 80,40" fill={ROOF} />
      <ArchHole x={20} w={16} top={54} bottom={82} fill={DARKWOOD} />
      <Box x={46} y={50} w={16} h={12} fill="#7fa9bd" />
      <path d="M54 50 v12 M46 56 h16" {...line(INK, 0.8)} />
      <line x1={74} y1={44} x2={92} y2={44} {...line(INK, 1.6)} />
      <line x1={80} y1={44} x2={80} y2={48} {...line(INK, 0.8)} />
      <line x1={90} y1={44} x2={90} y2={48} {...line(INK, 0.8)} />
      <Box x={76} y={48} w={18} h={16} rx={2} fill={GOLD} />
      <Amphora x={85} y={62} s={0.9} fill="#b5532f" />
      <Amphora x={82} y={92} s={1.1} />
      <Amphora x={92} y={92} s={0.9} fill="#a8482a" />
      <Barrel x={8} y={94} s={0.9} />
    </g>
  );
}

function BreweryScene() {
  return (
    <g>
      <Sky />
      <Ground y={80} fill={DIRT} />
      <Box x={44} y={30} w={52} h={50} fill="#e3cfa6" />
      <Poly points="40,32 70,14 100,32" fill={ROOF} />
      <ArchHole x={60} w={20} top={50} bottom={80} fill={DARKWOOD} />
      <Barrel x={14} y={96} s={1.3} />
      <Barrel x={32} y={96} s={1.3} />
      <Barrel x={23} y={80} s={1.3} />
      <Shape d="M58 96 h30 l-3 -18 h-24 Z" fill={WOOD} />
      <path d="M59 90 h28 M60 84 h26" {...line(IRON, 1.2)} />
      <ellipse cx={73} cy={78} rx={12} ry={2.4} fill="#e9a24a" {...THIN} />
    </g>
  );
}

function ReserveScene({ goods }: { goods: 'stone' | 'clay' }) {
  return (
    <g>
      <Sky />
      <Ground y={84} fill={STONE} />
      <Box x={8} y={34} w={84} h={50} fill="#e3cfa6" />
      <Poly points="2,36 50,16 98,36" fill={ROOF} />
      <Box x={16} y={46} w={68} h={38} fill="#5c4532" />
      {goods === 'stone'
        ? [[20, 84], [36, 84], [52, 84], [68, 84], [28, 72], [44, 72], [60, 72], [36, 60], [52, 60]].map(([x, y], i) => (
          <Box key={i} x={x} y={y - 12} w={15} h={12} rx={1} fill={i % 2 ? '#c5c9cd' : '#a3a7ab'} thin />
        ))
        : [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3].map((c) => (
          <Box key={`${r}${c}`} x={18 + c * 16 + (r % 2) * 8} y={78 - r * 7} w={15} h={6.6} fill={r % 2 ? '#d9703f' : '#c65a32'} thin />
        )))}
      <g transform="translate(40 24) scale(0.85)"><CoinGlyph value={1} /></g>
    </g>
  );
}

function Stall({ x, y, color }: XY & { color: string }) {
  const stripes: ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    stripes.push(<Poly key={i} points={`${x + i * 9},${y} ${x + i * 9 + 9},${y} ${x + i * 9 + 9},${y + 8} ${x + i * 9 + 4.5},${y + 11} ${x + i * 9},${y + 8}`} fill={i % 2 ? CREAM : color} thin />);
  }
  return (
    <g>
      <Box x={x + 1} y={y + 8} w={2.6} h={30} fill={DARKWOOD} thin />
      <Box x={x + 32.4} y={y + 8} w={2.6} h={30} fill={DARKWOOD} thin />
      {stripes}
      <Box x={x - 1} y={y + 24} w={38} h={14} fill={WOOD} />
    </g>
  );
}

function MarketScene({ customs = false }: { customs?: boolean }) {
  return (
    <g>
      <Sky />
      <Colonnade x0={6} x1={94} y={20} h={40} n={6} fill="#ece4cc" />
      <Box x={0} y={15} w={100} h={6} fill={STONE} />
      <Ground y={84} fill={STONE} />
      <Stall x={4} y={46} color={RED} />
      <Stall x={60} y={46} color={customs ? BLUE : '#3f9a4b'} />
      <Amphora x={12} y={70} s={0.8} />
      {[22, 27, 32].map((x, i) => <circle key={x} cx={x} cy={67.5} r={2.6} fill={['#f39a2b', '#d33', '#ffd45a'][i]} {...THIN} />)}
      <CoinStack x={70} y={70} n={3} />
      <Crate x={84} y={70} s={0.8} />
      {customs && (
        <g>
          <line x1={50} y1={30} x2={50} y2={58} {...line(INK, 1.4)} />
          <line x1={42} y1={34} x2={58} y2={34} {...line(INK, 1.4)} />
          <Shape d="M38 42 h8 q-4 5 -8 0 Z" fill={GOLD} thin />
          <Shape d="M54 42 h8 q-4 5 -8 0 Z" fill={GOLD} thin />
          <path d="M42 34 L38 42 M42 34 L46 42 M58 34 L54 42 M58 34 L62 42" {...line(INK, 0.6)} />
        </g>
      )}
    </g>
  );
}

function Camel({ x, y, s = 1 }: XY & { s?: number }) {
  const fill = '#c99a5b';
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[-14, -9, 7, 12].map((lx, i) => <Box key={i} x={lx - 1.3} y={-2} w={2.6} h={16} fill={i % 3 === 0 ? '#a77c44' : fill} thin />)}
      <Shape d="M-18 0 Q-16 -10 -8 -10 Q-4 -20 2 -11 Q8 -12 12 -6 L16 -4 L15 2 L-17 2 Z" fill={fill} />
      <Shape d="M12 -4 Q16 -10 18 -20 L23 -22 Q27 -21 26 -18 L22 -17 Q20 -8 16 -2 Z" fill={fill} />
      <path d="M-18 -2 q-4 4 -3 10" {...line(INK, 1)} />
      <Box x={-8} y={-14} w={12} h={4} rx={1} fill={RED} thin />
      <circle cx={23.4} cy={-20} r={0.7} fill={INK} />
    </g>
  );
}

function CaravanScene() {
  return (
    <g>
      <Sky color={SKY_WARM} />
      <Sun x={18} y={18} r={7} />
      <Ground y={82} fill={SAND} />
      <Box x={44} y={26} w={56} h={58} fill="#e3cfa6" />
      <Crenels x={44} y={26} w={56} n={5} fill="#e3cfa6" />
      <ArchHole x={58} w={28} top={44} bottom={84} fill="#6e5440" />
      <Camel x={36} y={76} s={1.05} />
      <Crate x={84} y={92} />
      <Crate x={94} y={92} s={0.8} />
      <Amphora x={74} y={92} s={0.9} />
    </g>
  );
}

function ChamberScene() {
  return (
    <g>
      <Sky />
      <Ground y={84} fill={STONE} />
      <Box x={10} y={36} w={80} h={48} fill={MARBLE} />
      <Pediment x={6} y={20} w={88} h={16} />
      <Colonnade x0={16} x1={84} y={38} h={32} n={5} w={5} fill={WHITE} />
      <Steps x={14} y={70} w={72} n={2} dy={3} />
      <CoinStack x={22} y={96} n={5} />
      <CoinStack x={34} y={96} n={7} />
      <CoinStack x={74} y={96} n={4} />
      <g transform="translate(50 86) scale(0.6) translate(-12 -12)"><CoinGlyph /></g>
    </g>
  );
}

function Ship({ x, y, s = 1, sail = CREAM }: XY & { s?: number; sail?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <line x1={0} y1={0} x2={0} y2={-26} {...line(DARKWOOD, 1.6)} />
      <Shape d="M-11 -24 h22 q2 9 0 18 h-22 q-2 -9 0 -18 Z" fill={sail} thin />
      <path d="M-11 -15 h22" {...line(RED, 2)} />
      <Shape d="M-18 -2 h34 q2 0 4 -4 q0 8 -6 10 h-28 q-4 -2 -4 -6 Z" fill={DARKWOOD} />
      <path d="M-14 1 h28" {...line('#c08a4c', 0.8)} />
    </g>
  );
}

function PortScene() {
  return (
    <g>
      <Sky />
      <Cloud x={24} y={14} />
      <path d="M30 20 q3 -3 6 0 q3 -3 6 0" {...line(INK, 0.8)} />
      <Box x={-3} y={58} w={106} h={46} fill={WATER} />
      <Waves y={70} />
      <Waves y={84} x0={-8} />
      <Ship x={34} y={74} s={1.2} />
      <Box x={60} y={62} w={46} h={8} fill={WOOD} />
      {[64, 76, 88, 100].map((x) => <Box key={x} x={x} y={70} w={3} h={20} fill={DARKWOOD} thin />)}
      <Crate x={70} y={62} />
      <Crate x={82} y={62} s={0.8} />
      <Amphora x={92} y={62} s={0.8} />
    </g>
  );
}

function LighthouseScene() {
  return (
    <g>
      <Sky color="#bcd9ea" />
      <Poly points="50,16 4,4 4,30" fill="#fff3b0" />
      <Poly points="50,16 96,4 96,30" fill="#fff3b0" />
      <Box x={-3} y={66} w={106} h={38} fill={WATER} />
      <Waves y={80} />
      <Shape d="M18 72 L28 58 L44 56 L62 56 L76 60 L84 72 Z" fill="#9ea3a8" />
      <Poly points="40,58 44,24 56,24 60,58" fill={WHITE} />
      <Poly points="42.6,42 43.6,34 56.4,34 57.4,42" fill={RED} thin />
      <Poly points="41.2,54 41.8,48 58.2,48 58.8,54" fill={RED} thin />
      <Box x={41} y={20} w={18} h={4} fill={INK} />
      <Box x={44} y={10} w={12} h={10} fill={FIRE_L} />
      <Shape d="M50 11 q4 4 0 8 q-4 -4 0 -8 Z" fill={FIRE} thin />
      <Poly points="42,10 50,3 58,10" fill={ROOF} />
    </g>
  );
}

function PretoriumScene() {
  return (
    <g>
      <Sky />
      <Ground y={84} fill={STONE} />
      <Box x={4} y={38} w={92} h={46} fill={MARBLE} />
      <Box x={2} y={32} w={96} h={6} fill={STONE} />
      <Pediment x={26} y={16} w={48} h={16} />
      <Colonnade x0={30} x1={70} y={40} h={34} n={4} w={5} fill={WHITE} />
      {[10, 82].map((x) => (
        <g key={x}>
          <Banner x={x} y={40} w={10} h={24} color={RED} />
          <path d={`M${x + 2} ${48} l3 3 l3 -3`} {...line(GOLD, 1.4)} />
          <circle cx={x + 5} cy={46} r={1.6} fill={GOLD} />
        </g>
      ))}
      <Steps x={22} y={74} w={56} n={3} dy={3.2} />
    </g>
  );
}

// ---- Purple ---------------------------------------------------------------

function guildEmblem(name: string): ReactNode {
  switch (name) {
    case 'Merchants Guild': return <CoinGlyph />;
    case 'Shipowners Guild': return <ResourceGlyph r="wood" />;
    case 'Builders Guild': return <WonderGlyph />;
    case 'Magistrates Guild': return <LaurelGlyph value="" />;
    case 'Scientists Guild': return <ScienceGlyph symbol="gear" />;
    case 'Tacticians Guild': return <ShieldGlyph />;
    case 'Moneylenders Guild': return <CoinGlyph value="$" />;
  }
  return <WonderGlyph />;
}

function GuildHallScene({ name }: { name: string }) {
  return (
    <g>
      <Sky color="#ddd2ec" />
      <Ground y={84} fill={STONE} />
      <Box x={8} y={40} w={84} h={44} fill={MARBLE} />
      <Box x={4} y={34} w={92} h={6} fill={STONE} />
      <Pediment x={4} y={16} w={92} h={18} />
      <Colonnade x0={14} x1={86} y={42} h={40} n={6} w={5} fill={WHITE} />
      <Banner x={24} y={40} w={10} h={26} color={PURPLE} />
      <Banner x={66} y={40} w={10} h={26} color={PURPLE} />
      <Shape d="M38 40 h24 v34 l-12 -5 l-12 5 Z" fill={PURPLE} />
      <path d="M40 42 h20" {...line(GOLD, 1.4)} />
      <g transform="translate(50 54) scale(0.75) translate(-12 -12)">{guildEmblem(name)}</g>
    </g>
  );
}

// ===========================================================================
// Wonder illustrations (160 × 90)

export function WonderArt({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 160 90" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {wonderScene(id)}
    </svg>
  );
}

function wonderScene(id: string): ReactNode {
  switch (id) {
    case 'pyramids': return <PyramidsWonder />;
    case 'mausoleum': return <MausoleumWonder />;
    case 'lighthouse': return <PharosWonder />;
    case 'temple-of-artemis': return <ArtemisWonder />;
    case 'statue-of-zeus': return <ZeusWonder />;
    case 'colossus': return <ColossusWonder />;
    case 'great-library': return <LibraryWonder />;
    case 'hanging-gardens': return <GardensWonder />;
    case 'circus-maximus': return <CircusWonder />;
    case 'great-lighthouse': return <PiraeusWonder />;
    case 'sphinx': return <SphinxWonder />;
    case 'appian-way': return <AppianWonder />;
  }
  return <PyramidsWonder />;
}

function Pyramid({ x, base, h, light = '#e7c584', dark = '#c49a58' }: { x: number; base: number; h: number; light?: string; dark?: string }) {
  const half = h * 0.95;
  const apexY = base - h;
  const steps: ReactNode[] = [];
  for (let i = 1; i < 6; i++) {
    const y = apexY + (h * i) / 6;
    const dx = (half * i) / 6;
    steps.push(<line key={i} x1={x - dx} y1={y} x2={x + dx * 0.4} y2={y} {...line('#a8854c', 0.6)} />);
  }
  return (
    <g>
      <Poly points={`${x - half},${base} ${x},${apexY} ${x + half},${base}`} fill={light} />
      <Poly points={`${x},${apexY} ${x + half},${base} ${x + half * 0.4},${base}`} fill={dark} />
      {steps}
    </g>
  );
}

function PyramidsWonder() {
  return (
    <g>
      <Sky color={SKY_WARM} w={160} h={90} />
      <Sun x={132} y={20} r={10} />
      <path d="M-3 66 Q 40 56 80 64 T 163 60 V90 H-3 Z" fill={SAND_D} {...LINE} />
      <Pyramid x={128} base={74} h={30} />
      <Pyramid x={96} base={76} h={42} />
      <Pyramid x={50} base={78} h={58} />
      <Ground y={76} fill={SAND} w={160} h={90} />
      <Palm x={10} y={82} h={30} />
      <Palm x={150} y={84} h={22} s={0.8} />
    </g>
  );
}

function MausoleumWonder() {
  const roof: ReactNode[] = [];
  for (let i = 0; i < 6; i++) roof.push(<Box key={i} x={50 + i * 5} y={28 - (i + 1) * 3} w={60 - i * 10} h={3} fill={STONE} thin />);
  return (
    <g>
      <Sky w={160} h={90} />
      <Cloud x={130} y={16} />
      <Ground y={76} w={160} h={90} />
      <Cypress x={22} y={78} h={34} />
      <Cypress x={36} y={78} h={26} />
      <Cypress x={140} y={78} h={32} />
      <Box x={44} y={52} w={72} h={26} fill={MARBLE} />
      <path d="M44 60 h72 M44 68 h72 M60 52 v8 M80 60 v8 M100 52 v8 M70 68 v10 M90 68 v10" {...line(STONE_D, 0.7)} />
      <Box x={46} y={30} w={68} h={4} fill={STONE} />
      <Colonnade x0={52} x1={108} y={34} h={18} n={8} w={3.6} />
      {roof}
      <Box x={74} y={8} w={12} h={3} fill={BRONZE} thin />
      <Shape d="M76 8 l2 -6 h6 l-1 6 Z" fill={BRONZE} thin />
      <circle cx={77} cy={10} r={1.6} fill={BRONZE} {...THIN} />
    </g>
  );
}

function PharosWonder() {
  return (
    <g>
      <Sky color="#bcd9ea" w={160} h={90} />
      <Poly points="80,12 0,0 0,34" fill="#fff3b0" />
      <Poly points="80,12 160,0 160,34" fill="#fff3b0" />
      <Box x={-3} y={66} w={166} h={30} fill={WATER} />
      <Waves y={78} x1={160} />
      <Shape d="M40 72 L54 62 L106 62 L122 72 Z" fill="#9ea3a8" />
      <Box x={58} y={58} w={44} h={6} fill={STONE} />
      <Box x={64} y={32} w={32} h={26} fill={MARBLE} />
      {[38, 46].map((y) => <path key={y} d={`M70 ${y} h3 M78.5 ${y} h3 M87 ${y} h3`} {...line(INK, 1.4)} />)}
      <Box x={62} y={29} w={36} h={4} fill={STONE} />
      <Box x={70} y={16} w={20} h={13} fill={MARBLE} />
      <Box x={68} y={14} w={24} h={3} fill={STONE} />
      <Box x={74} y={6} w={12} h={8} fill={FIRE_L} />
      <Shape d="M80 6 q5 4 0 8 q-5 -4 0 -8 Z" fill={FIRE} thin />
      <Poly points="72,6 80,0 88,6" fill={BRONZE} />
      <Ship x={28} y={78} s={0.8} />
    </g>
  );
}

function ArtemisWonder() {
  return (
    <g>
      <Sky w={160} h={90} />
      <Cloud x={24} y={12} />
      <Hills y={56} w={160} />
      <Tree x={10} y={74} s={1.1} />
      <Tree x={150} y={74} s={1.2} />
      <Ground y={76} w={160} h={90} />
      <Steps x={22} y={66} w={116} n={4} dy={2.6} />
      <Colonnade x0={28} x1={132} y={36} h={30} n={10} w={4.4} />
      <Box x={20} y={30} w={120} h={6} fill={STONE} />
      <path d="M22 33 h116" {...line(STONE_D, 0.6)} />
      <Pediment x={20} y={12} w={120} h={18} />
      <circle cx={80} cy={24} r={2.4} fill={GOLD} {...THIN} />
    </g>
  );
}

function ZeusWonder() {
  return (
    <g>
      <Sky color="#4a3a5a" w={160} h={90} />
      <Box x={-3} y={76} w={166} h={20} fill="#c9b99a" />
      <path d="M0 82 h160" {...line('#a8987a', 0.8)} />
      <Column x={14} y={4} h={72} w={10} />
      <Column x={34} y={4} h={72} w={10} />
      <Column x={126} y={4} h={72} w={10} />
      <Column x={146} y={4} h={72} w={10} />
      <ellipse cx={80} cy={82} rx={28} ry={4} fill="#2f2a3a" {...THIN} />
      <Box x={60} y={14} w={40} h={52} rx={6} fill={DARKWOOD} />
      <Box x={60} y={14} w={40} h={52} rx={6} fill="none" />
      <path d="M64 18 h32" {...line(GOLD, 1.4)} />
      <Box x={56} y={58} w={48} h={8} fill={DARKWOOD} />
      <Box x={58} y={66} w={6} h={10} fill={DARKWOOD} thin />
      <Box x={96} y={66} w={6} h={10} fill={DARKWOOD} thin />
      <Shape d="M62 58 h36 l4 14 h-44 Z" fill={GOLD} />
      <path d="M66 62 l-2 10 M80 60 v12 M94 62 l2 10" {...line('#b8881f', 0.8)} />
      <Shape d="M70 34 h20 l3 24 h-26 Z" fill="#f3e6cc" />
      <Shape d="M70 34 l-4 22 l6 0 l2 -14 Z" fill={GOLD} thin />
      <circle cx={80} cy={26} r={7} fill="#f3e6cc" {...LINE} />
      <Shape d="M73 28 q7 12 14 0 q-2 6 -7 6 q-5 0 -7 -6 Z" fill="#d8c9a6" thin />
      <path d="M77.4 25 h0.1 M82.6 25 h0.1" {...line(INK, 1.4)} />
      <path d="M73 22 q7 -6 14 0" {...line(LEAF_D, 1.8)} />
      <path d="M90 38 L102 30" {...line(INK, 3.4)} />
      <path d="M90 38 L102 30" {...line('#f3e6cc', 2)} />
      <line x1={104} y1={6} x2={104} y2={74} {...line(INK, 1.6)} />
      <circle cx={104} cy={6} r={2.4} fill={GOLD} {...THIN} />
      <path d="M70 40 L60 48" {...line(INK, 3.4)} />
      <path d="M70 40 L60 48" {...line('#f3e6cc', 2)} />
      <Figure x={58} y={50} robe={GOLD} s={0.5} />
    </g>
  );
}

function ColossusWonder() {
  return (
    <g>
      <Sky w={160} h={90} />
      <Cloud x={30} y={14} />
      <Box x={-3} y={60} w={166} h={36} fill={WATER} />
      <Waves y={72} x1={160} />
      <Waves y={84} x0={-6} x1={160} />
      <Box x={-3} y={56} w={40} h={10} fill={STONE_D} />
      <Box x={124} y={56} w={40} h={10} fill={STONE_D} />
      <Box x={66} y={60} w={28} h={12} fill={MARBLE} />
      <Box x={63} y={57} w={34} h={4} fill={STONE} />
      <Box x={72} y={42} w={6} h={16} fill={BRONZE} />
      <Box x={82} y={42} w={6} h={16} fill={BRONZE} />
      <Shape d="M70 25 h20 l2 19 h-24 Z" fill={BRONZE} />
      <path d="M72 32 h16 M73.4 38 h13.2" {...line('#8f6229', 0.8)} />
      <path d="M88 27 L96 14" {...line(INK, 4.2)} />
      <path d="M88 27 L96 14" {...line(BRONZE, 2.6)} />
      <Box x={94} y={9} w={4.4} h={6} fill={DARKWOOD} thin />
      <Shape d="M96.2 2 q4.4 3.4 0 7 q-4.4 -3.6 0 -7 Z" fill={FIRE} thin />
      <path d="M72 27 L66 40" {...line(INK, 4.2)} />
      <path d="M72 27 L66 40" {...line(BRONZE, 2.6)} />
      {[-60, -30, 0, 30, 60].map((a) => {
        const r = ((a - 90) * Math.PI) / 180;
        return <line key={a} x1={80 + Math.cos(r) * 4.6} y1={20 + Math.sin(r) * 4.6} x2={80 + Math.cos(r) * 8.4} y2={20 + Math.sin(r) * 8.4} {...line(GOLD, 1.6)} />;
      })}
      <circle cx={80} cy={20} r={4.6} fill={BRONZE} {...LINE} />
      <path d="M78 19.6 h0.1 M82 19.6 h0.1" {...line(INK, 1.3)} />
      <Ship x={30} y={80} s={0.75} />
      <Ship x={134} y={82} s={0.65} sail="#f3d9b5" />
    </g>
  );
}

function LibraryWonder() {
  const ends: ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 6; c++) {
      const x0 = 22 + c * 20;
      const y0 = 14 + r * 16;
      [[5, 5], [11, 5], [8, 10.5], [14, 10.5]].forEach(([dx, dy], k) => {
        ends.push(<circle key={`${r}${c}${k}`} cx={x0 + dx} cy={y0 + dy} r={2.6} fill="#f3e2a8" {...THIN} />);
      });
    }
  }
  return (
    <g>
      <Sky color="#e8dcc0" w={160} h={90} />
      <Box x={18} y={10} w={124} h={52} fill={DARKWOOD} />
      {[0, 1, 2].map((r) => [0, 1, 2, 3, 4, 5].map((c) => (
        <Box key={`${r}${c}`} x={22 + c * 20} y={14 + r * 16} w={18} h={14} fill="#4a2c14" thin />
      )))}
      {ends}
      <Box x={-3} y={74} w={166} h={20} fill="#c9b48a" />
      <path d="M0 82 h160 M40 74 l-6 16 M80 74 v16 M120 74 l6 16" {...line('#a8935f', 0.8)} />
      <Column x={8} y={2} h={72} w={10} />
      <Column x={152} y={2} h={72} w={10} />
      <Box x={-3} y={-3} w={166} h={6} fill={STONE} />
      <Box x={50} y={62} w={60} h={6} fill={WOOD} />
      <Box x={56} y={68} w={5} h={10} fill={DARKWOOD} thin />
      <Box x={99} y={68} w={5} h={10} fill={DARKWOOD} thin />
      <Box x={60} y={57} w={32} h={5} rx={1} fill="#f6e7b4" thin />
      <rect x={58} y={56} width={4} height={7} rx={2} fill="#dcc07a" {...THIN} />
      <rect x={90} y={56} width={4} height={7} rx={2} fill="#dcc07a" {...THIN} />
      <Shape d="M98 62 q2 -6 6 -6 q-1 3 3 2 l1 4 Z" fill={BRONZE} thin />
      <Shape d="M103 52 q2 2 0 4 q-2 -2 0 -4 Z" fill={FIRE} thin />
    </g>
  );
}

function GardensWonder() {
  const tiers: Array<[number, number, number]> = [[20, 120, 58], [34, 92, 44], [48, 64, 30], [62, 36, 18]];
  return (
    <g>
      <Sky color={SKY_WARM} w={160} h={90} />
      <Sun x={138} y={18} r={9} />
      <Box x={-3} y={80} w={166} h={14} fill={WATER} />
      <Waves y={86} x1={160} />
      <Ground y={72} fill={SAND} w={160} h={90} />
      <Box x={-3} y={80} w={166} h={14} fill={WATER} />
      {tiers.map(([x, w, y], i) => (
        <g key={i}>
          <Box x={x} y={y} w={w} h={i === 0 ? 16 : 14} fill={i % 2 ? '#d6b37a' : '#c9a46a'} />
          {Array.from({ length: Math.floor(w / 14) }, (_, k) => (
            <ArchHole key={k} x={x + 5 + k * 14} w={6} top={y + 5} bottom={y + (i === 0 ? 16 : 14)} fill="#6e5440" />
          ))}
          {Array.from({ length: Math.floor(w / 7) }, (_, k) => (
            <circle key={`b${k}`} cx={x + 3 + k * 7} cy={y} r={3.6} fill={k % 2 ? LEAF : LEAF_D} {...THIN} />
          ))}
          {Array.from({ length: Math.floor(w / 18) }, (_, k) => (
            <path key={`v${k}`} d={`M${x + 8 + k * 18} ${y + 2} q-1 5 0 9`} {...line(LEAF_D, 1.6)} />
          ))}
        </g>
      ))}
      <Palm x={10} y={80} h={34} />
      <Palm x={150} y={80} h={30} />
    </g>
  );
}

function CircusWonder() {
  return (
    <g>
      <Sky w={160} h={90} />
      <Hills y={34} fill={GRASS} w={160} />
      <Ground y={80} w={160} h={90} />
      <Shape d="M8 52 Q8 24 40 24 H120 Q152 24 152 52 Q152 82 120 82 H40 Q8 82 8 52 Z" fill={STONE_D} />
      <path d="M14 52 Q14 30 42 30 H118 Q146 30 146 52" {...line(STONE, 1.4)} />
      <Shape d="M22 54 Q22 38 44 38 H116 Q138 38 138 54 Q138 70 116 70 H44 Q22 70 22 54 Z" fill={SAND} />
      <Box x={40} y={52} w={80} h={4} fill={MARBLE} thin />
      <Poly points="78,54 79.5,30 80.5,30 82,54" fill={STONE} thin />
      <Poly points="79.5,30 80,27 80.5,30" fill={GOLD} thin />
      {[38, 122].map((x) => (
        <g key={x}>
          {[-3, 0, 3].map((d) => <Poly key={d} points={`${x + d - 1.4},54 ${x + d},46 ${x + d + 1.4},54`} fill={GOLD} thin />)}
        </g>
      ))}
      <Shape d="M8 52 Q8 82 40 82 H120 Q152 82 152 52 V58 Q152 88 120 88 H40 Q8 88 8 58 Z" fill={STONE} />
      {[22, 38, 54, 70, 86, 102, 118, 134].map((x) => <ArchHole key={x} x={x} w={6} top={81} bottom={88} fill={SHADOW} />)}
      <g transform="translate(58 66) scale(0.5)"><Horse x={0} y={0} fill="#f3ecda" /></g>
      <g transform="translate(108 46) scale(0.45)"><Horse x={0} y={0} fill="#5a3a22" /></g>
    </g>
  );
}

function PiraeusWonder() {
  return (
    <g>
      <Sky w={160} h={90} />
      <Hills y={30} fill={GRASS_D} w={160} />
      <Box x={-3} y={40} w={166} h={56} fill={WATER} />
      <Waves y={60} x1={160} />
      <Waves y={74} x0={10} x1={160} />
      {[[6, 26], [28, 22], [48, 28]].map(([x, h], i) => (
        <g key={i}>
          <Box x={x} y={46 - h} w={20} h={h} fill={i % 2 ? '#efdcb4' : '#e3cfa6'} />
          <Poly points={`${x - 2},${47 - h} ${x + 10},${39 - h} ${x + 22},${47 - h}`} fill={ROOF} />
          <ArchHole x={x + 6} w={8} top={46 - h * 0.6} bottom={46} fill={DARKWOOD} />
        </g>
      ))}
      <Box x={-3} y={44} w={80} h={5} fill={STONE} />
      <Shape d="M150 40 Q150 76 100 86 L100 82 Q144 72 144 40 Z" fill={STONE} />
      <Box x={140} y={26} w={8} h={14} fill={MARBLE} />
      <Shape d="M144 21 q3 2.5 0 5 q-3 -2.5 0 -5 Z" fill={FIRE} thin />
      <Ship x={52} y={74} s={0.9} />
      <Ship x={92} y={62} s={0.75} sail="#f3d9b5" />
      <Ship x={120} y={80} s={0.7} />
    </g>
  );
}

function SphinxWonder() {
  const BODY = '#d9b77a';
  return (
    <g>
      <Sky color={SKY_WARM} w={160} h={90} />
      <Sun x={30} y={18} r={9} />
      <Pyramid x={124} base={60} h={40} />
      <Ground y={60} fill={SAND} w={160} h={90} />
      <Shape d="M18 72 Q18 54 34 52 H98 L104 76 H18 Z" fill={BODY} />
      <path d="M18 70 q-8 0 -10 -8" {...line(INK, 1.4)} />
      <Shape d="M96 72 H150 Q154 72 154 76 Q154 80 150 80 H96 Z" fill={BODY} />
      <path d="M140 76 v4 M146 76 v4" {...line(SHADOW, 0.8)} />
      <Shape d="M88 54 L94 30 H114 L118 54 Z" fill={BODY} />
      <Shape d="M90 36 L94 16 H114 L118 36 L112 46 H96 Z" fill="#3d70b0" />
      {[20, 25, 30, 35, 40].map((y) => <line key={y} x1={92} y1={y} x2={116} y2={y} {...line(GOLD, 1.6)} />)}
      <Box x={97} y={18} w={14} h={22} rx={3} fill={BODY} />
      <path d="M100 25 h3 M105 25 h3 M104 27 v5 M101.5 35 h5" {...line(INK, 1)} />
      <path d="M40 64 q14 -6 30 0" {...line(SHADOW, 0.8)} />
    </g>
  );
}

function AppianWonder() {
  const cross: ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const y = 90 - (1 - (1 - t) * (1 - t)) * 50;
    const half = 22 - (22 - 4) * (1 - (1 - t) * (1 - t));
    cross.push(<line key={i} x1={80 - half} y1={y} x2={80 + half} y2={y} {...line('#7d776d', 0.7)} />);
  }
  return (
    <g>
      <Sky w={160} h={90} />
      <Cloud x={34} y={14} />
      <Cloud x={130} y={10} s={0.8} />
      <Hills y={44} fill={GRASS} w={160} />
      <Ground y={40} fill={GRASS_D} w={160} h={90} />
      <Poly points="56,92 104,92 84,40 76,40" fill="#a59e92" />
      {cross}
      <Box x={74} y={30} w={12} h={10} fill={STONE} thin />
      <ArchHole x={77} w={6} top={33} bottom={40} fill={SHADOW} />
      <Cypress x={64} y={46} h={12} />
      <Cypress x={96} y={46} h={12} />
      <Cypress x={50} y={58} h={20} />
      <Cypress x={110} y={58} h={20} />
      <Cypress x={30} y={80} h={32} />
      <Cypress x={130} y={80} h={32} />
      <Box x={112} y={70} w={20} h={12} fill={MARBLE} />
      <Shape d="M112 70 A10 6 0 0 1 132 70 Z" fill={STONE} />
      <Box x={42} y={72} w={5} h={12} fill={STONE} thin />
      <Box x={41} y={70} w={7} h={2.4} fill={STONE} thin />
    </g>
  );
}

// ===========================================================================
// Progress tokens (40 × 40)

const TOKEN_GOLD = '#f2d27a';
const TOKEN_INK = '#173a26';
const TL = { stroke: TOKEN_INK, strokeWidth: 1.1, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const tline = (color: string, width: number) =>
  ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

export function ProgressTokenArt({ id, size = 48 }: { id: DuelProgressTokenId; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <circle cx={20} cy={20} r={19} fill="#2f8752" stroke={TOKEN_INK} strokeWidth={1.4} />
      <circle cx={20} cy={20} r={16.4} fill="none" stroke="#e5c368" strokeWidth={1.2} />
      {tokenEmblem(id)}
    </svg>
  );
}

function tokenEmblem(id: DuelProgressTokenId): ReactNode {
  switch (id) {
    case 'agriculture':
      return (
        <g>
          {[-22, 0, 22].map((a) => (
            <g key={a} transform={`rotate(${a} 20 31)`}>
              <line x1={20} y1={31} x2={20} y2={11} {...tline(TOKEN_INK, 2.4)} />
              <line x1={20} y1={31} x2={20} y2={11} {...tline(TOKEN_GOLD, 1.2)} />
              {[11, 14, 17].map((y) => (
                <g key={y}>
                  <ellipse cx={18.4} cy={y} rx={1.4} ry={2.4} transform={`rotate(-25 18.4 ${y})`} fill={TOKEN_GOLD} {...TL} strokeWidth={0.7} />
                  <ellipse cx={21.6} cy={y} rx={1.4} ry={2.4} transform={`rotate(25 21.6 ${y})`} fill={TOKEN_GOLD} {...TL} strokeWidth={0.7} />
                </g>
              ))}
            </g>
          ))}
          <rect x={16.6} y={23} width={6.8} height={3} rx={1} fill="#c9542f" {...TL} />
        </g>
      );
    case 'architecture':
      return (
        <g>
          <path d="M10 30 V20 A10 10 0 0 1 30 20 V30 H25.6 V20.4 A5.6 5.6 0 0 0 14.4 20.4 V30 Z" fill={TOKEN_GOLD} {...TL} />
          <path d="M18 10.6 L22 10.6 L21.2 15 L18.8 15 Z" fill="#e5a93a" {...TL} />
          <path d="M8.6 30 H31.4" {...tline(TOKEN_INK, 1.6)} />
        </g>
      );
    case 'economy':
      return (
        <g>
          {[29, 25.6, 22.2].map((y) => (
            <g key={y}>
              <path d={`M8.6 ${y} v2.4 a6.4 2.4 0 0 0 12.8 0 v-2.4`} fill="#d9a520" {...TL} strokeWidth={0.8} />
              <ellipse cx={15} cy={y} rx={6.4} ry={2.4} fill={TOKEN_GOLD} {...TL} strokeWidth={0.8} />
            </g>
          ))}
          <circle cx={25.6} cy={20.6} r={7.4} fill={TOKEN_GOLD} {...TL} />
          <circle cx={25.6} cy={20.6} r={5.2} {...tline('#c99315', 0.9)} />
          <path d="M25.6 16.8 v7.6 M23.4 18.6 q2.2 -1.8 4.4 0 q0 1.6 -2.2 2 q-2.2 0.4 -2.2 2 q2.2 1.8 4.4 0" {...tline(TOKEN_INK, 0.9)} />
        </g>
      );
    case 'law':
      return (
        <g>
          <path d="M20 9 V30 M13 30 H27 M9 13.6 H31" {...tline(TOKEN_INK, 2.6)} />
          <path d="M20 9 V30 M13 30 H27 M9 13.6 H31" {...tline(TOKEN_GOLD, 1.3)} />
          <path d="M9.6 14 L6.4 22 M9.6 14 L12.8 22 M30.4 14 L27.2 22 M30.4 14 L33.6 22" {...tline(TOKEN_INK, 0.7)} />
          <path d="M5.4 22 H13.8 A4.2 3.4 0 0 1 5.4 22 Z" fill={TOKEN_GOLD} {...TL} />
          <path d="M26.2 22 H34.6 A4.2 3.4 0 0 1 26.2 22 Z" fill={TOKEN_GOLD} {...TL} />
          <circle cx={20} cy={8.6} r={1.8} fill={TOKEN_GOLD} {...TL} />
        </g>
      );
    case 'masonry':
      return (
        <g>
          {[[9, 25.4, 10], [19.4, 25.4, 11.4], [12, 20.6, 10], [22.4, 20.6, 8.4]].map(([x, y, w], i) => (
            <rect key={i} x={x} y={y} width={w} height={4.4} rx={0.6} fill={i % 2 ? '#e8b356' : TOKEN_GOLD} {...TL} strokeWidth={0.9} />
          ))}
          <path d="M10 19 L16.6 8.4 L23.4 9.8 L21.6 16.4 Z" fill="#dfe4e8" {...TL} />
          <path d="M16.2 13.6 L21 12.4" {...tline('#9aa3aa', 0.8)} />
          <path d="M23 10 L29.6 4.6" {...tline(TOKEN_INK, 3)} />
          <path d="M23 10 L29.6 4.6" {...tline('#b97a3c', 1.6)} />
        </g>
      );
    case 'mathematics':
      return (
        <g>
          <circle cx={20} cy={20.6} r={10.4} {...tline(TOKEN_INK, 2.6)} />
          <circle cx={20} cy={20.6} r={10.4} {...tline(TOKEN_GOLD, 1.3)} />
          <path d="M11 25.8 L29 25.8 L20 10.2 Z" {...tline(TOKEN_INK, 2.6)} />
          <path d="M11 25.8 L29 25.8 L20 10.2 Z" {...tline(TOKEN_GOLD, 1.3)} />
          {[[11, 25.8], [29, 25.8], [20, 10.2]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.8} fill={TOKEN_GOLD} {...TL} strokeWidth={0.8} />)}
        </g>
      );
    case 'philosophy':
      return (
        <g>
          <path d="M11 14 L13 8.6 L16 12 Q20 10.6 24 12 L27 8.6 L29 14 Q31 20 28 26 Q24 31 20 31 Q16 31 12 26 Q9 20 11 14 Z" fill={TOKEN_GOLD} {...TL} />
          <circle cx={16} cy={17} r={3.6} fill="#fff7dc" {...TL} strokeWidth={0.9} />
          <circle cx={24} cy={17} r={3.6} fill="#fff7dc" {...TL} strokeWidth={0.9} />
          <circle cx={16} cy={17} r={1.5} fill={TOKEN_INK} />
          <circle cx={24} cy={17} r={1.5} fill={TOKEN_INK} />
          <path d="M18.6 20.4 L20 23 L21.4 20.4 Z" fill="#e5873a" {...TL} strokeWidth={0.7} />
          <path d="M15 25 q5 3 10 0" {...tline(TOKEN_INK, 0.8)} />
        </g>
      );
    case 'strategy':
      return (
        <g>
          <path d="M12 30 V19 Q12 10 21 10 Q29 10 29 19 V24 H24 V30 Z" fill={TOKEN_GOLD} {...TL} />
          <path d="M17.4 18 H29 V22 H22 V30" fill="#2f8752" {...TL} strokeWidth={0.9} />
          <path d="M12 12 Q18 2 30 8 Q24 6 21 10" fill="#c9542f" {...TL} strokeWidth={0.9} />
        </g>
      );
    case 'theology':
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 12;
            return <line key={i} x1={20 + Math.cos(a) * 8} y1={18 + Math.sin(a) * 8} x2={20 + Math.cos(a) * 13} y2={18 + Math.sin(a) * 13} {...tline(TOKEN_GOLD, 1.4)} />;
          })}
          <circle cx={20} cy={18} r={6} fill={TOKEN_GOLD} {...TL} />
          <rect x={12.6} y={26} width={14.8} height={5} rx={0.8} fill="#e8b356" {...TL} />
          <path d="M20 16 q3 3 0 6 q-3 -3 0 -6 Z" fill="#e5873a" {...TL} strokeWidth={0.7} />
        </g>
      );
    case 'urbanism':
      return (
        <g>
          <rect x={9} y={18} width={7} height={13} fill={TOKEN_GOLD} {...TL} />
          <path d="M8.4 18.4 L12.5 13 L16.6 18.4" fill="#e8b356" {...TL} />
          <rect x={16.4} y={11} width={7.4} height={20} fill={TOKEN_GOLD} {...TL} />
          <path d="M16.4 11 h7.4 l-3.7 -3.6 Z" fill="#e8b356" {...TL} />
          <rect x={24} y={20} width={7.4} height={11} fill={TOKEN_GOLD} {...TL} />
          <path d="M24 20 A3.7 3.6 0 0 1 31.4 20 Z" fill="#e8b356" {...TL} />
          {[[18.4, 14.6], [21, 14.6], [18.4, 19], [21, 19], [18.4, 23.4], [21, 23.4]].map(([x, y], i) => (
            <rect key={i} x={x} y={y} width={1.6} height={2.4} fill={TOKEN_INK} />
          ))}
          <path d="M7.6 31 H32.4" {...tline(TOKEN_INK, 1.6)} />
        </g>
      );
  }
}

// ===========================================================================
// Card backs (80 × 120)

const BACKS = {
  1: { bg: '#9a4f22', deep: '#7a3a16', rim: '#f0c27a' },
  2: { bg: '#2f5d8c', deep: '#21456a', rim: '#cfe0f0' },
  3: { bg: '#8e3550', deep: '#6c2338', rim: '#f6c8d2' },
  guild: { bg: '#3e2358', deep: '#28143c', rim: '#e8c35a' },
} as const;

export function CardBackArt({ age, guild = false }: { age: 1 | 2 | 3; guild?: boolean }) {
  const p = guild ? BACKS.guild : BACKS[age];
  const dots: ReactNode[] = [];
  for (let gx = 0; gx < 6; gx++) {
    for (let gy = 0; gy < 10; gy++) {
      const x = 14 + gx * 10.4;
      const y = 14 + gy * 10.2;
      if (Math.hypot(x - 40, y - 60) < 26) continue;
      dots.push(<path key={`${gx}${gy}`} d={`M${x} ${y - 2.6} L${x + 2.6} ${y} L${x} ${y + 2.6} L${x - 2.6} ${y} Z`} fill={p.rim} opacity={0.28} />);
    }
  }
  const numeral = age === 1 ? 'I' : age === 2 ? 'II' : 'III';
  return (
    <svg viewBox="0 0 80 120" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <rect x={0.8} y={0.8} width={78.4} height={118.4} rx={6} fill={p.bg} stroke={INK} strokeWidth={1.6} />
      <rect x={5.5} y={5.5} width={69} height={109} rx={4} fill="none" stroke={p.rim} strokeWidth={1.3} />
      {dots}
      <circle cx={40} cy={60} r={21} fill={p.deep} stroke={p.rim} strokeWidth={1.6} />
      <circle cx={40} cy={60} r={17.6} fill="none" stroke={p.rim} strokeWidth={0.6} opacity={0.7} />
      {guild ? (
        <g>
          <path d="M27 54 L40 45 L53 54 Z" fill={p.rim} stroke={INK} strokeWidth={0.8} />
          {[30, 36.7, 43.3, 50].map((x) => <rect key={x} x={x - 1.6} y={55} width={3.2} height={11} fill={p.rim} />)}
          <rect x={26} y={66} width={28} height={3} fill={p.rim} />
          <text x={40} y={76.5} textAnchor="middle" fontFamily={SERIF} fontSize={6.2} fontWeight={700} letterSpacing={1.2} fill={p.rim}>GUILD</text>
        </g>
      ) : (
        <text x={40} y={60} dy="0.36em" textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={age === 3 ? 18 : 22} fill={p.rim}>{numeral}</text>
      )}
      <path d="M33 22 L40 12 L47 22 Z" fill={p.rim} opacity={0.85} />
      <path d="M33 98 L40 108 L47 98 Z" fill={p.rim} opacity={0.85} />
    </svg>
  );
}

// ===========================================================================
// Military track (760 × 92)

/** The conflict track. Seat 0's capital is on the left (−9), seat 1's on the
 *  right (+9); positive pawn positions push toward seat 1. Laurels above each
 *  zone give its end-game VP; the looting tokens below sit there until claimed. */
export function MilitaryTrackArt({ pawn, awards, leftColor, rightColor }: {
  pawn: number;
  awards: { p1At3: boolean; p1At6: boolean; p2At3: boolean; p2At6: boolean };
  leftColor: string;
  rightColor: string;
}) {
  const xOf = (pos: number) => 20 + (pos + 9) * 38;
  const spaces: ReactNode[] = [];
  for (let pos = -9; pos <= 9; pos++) {
    const d = Math.abs(pos);
    const fill = d === 0 ? '#fbf1d6' : d <= 2 ? '#efe0b8' : d <= 5 ? '#e3c98e' : d <= 8 ? '#d4ad69' : pos < 0 ? leftColor : rightColor;
    spaces.push(<rect key={pos} x={xOf(pos) + 1} y={40} width={36} height={34} rx={3} fill={fill} {...LINE} />);
    if (d === 9) spaces.push(<g key={`c${pos}`} transform={`translate(${xOf(pos) + 6.4} ${44}) scale(1.05)`}><CapitalGlyph color="#f3ecda" /></g>);
  }
  const zoneMarks = [-8.5, -5.5, -2.5, 2.5, 5.5, 8.5].map((edge) => (
    <line key={edge} x1={xOf(edge) + 19} y1={36} x2={xOf(edge) + 19} y2={78} {...line(INK, 2.2)} />
  ));
  const laurel = (pos: number, v: number) => (
    <g key={`l${pos}`} transform={`translate(${xOf(pos) + 19 - 15} 1) scale(1.25)`}><LaurelGlyph value={v} /></g>
  );
  const loot = (pos: number, v: number, show: boolean) => show && (
    <g key={`t${pos}`} transform={`translate(${xOf(pos) + 19 - 14} 79)`}>
      <rect x={0} y={0} width={28} height={22} rx={4} fill="#9b2f22" {...LINE} />
      <g transform="translate(4.4 1.4) scale(0.8)"><CoinGlyph value={v} negative /></g>
    </g>
  );
  const px = xOf(Math.max(-9, Math.min(9, pawn))) + 19;
  return (
    <svg viewBox="0 0 760 104" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Military track, pawn at ${pawn}`}>
      <rect x={6} y={34} width={748} height={46} rx={9} fill="#7a5a34" {...LINE} />
      {spaces}
      {zoneMarks}
      {[-7, -4, -1.5, 1.5, 4, 7].map((p) => laurel(p, Math.abs(p) === 7 ? 10 : Math.abs(p) === 4 ? 5 : 2))}
      {[-9, 9].map((p) => (
        <g key={`w${p}`} transform={`translate(${xOf(p) + 19 - 13} 4) scale(1.1)`}>
          <path d="M5 18 L3 6 L8.5 11 L12 3 L15.5 11 L21 6 L19 18 Z" fill={GOLD} {...LINE} />
          <rect x={5} y={18} width={14} height={4} rx={1} fill={GOLD} {...LINE} />
        </g>
      ))}
      {loot(-4, 2, !awards.p2At3)}
      {loot(-7, 5, !awards.p2At6)}
      {loot(4, 2, !awards.p1At3)}
      {loot(7, 5, !awards.p1At6)}
      <line x1={xOf(0) + 19} y1={43} x2={xOf(0) + 19} y2={71} {...line('#b9a06a', 1)} strokeDasharray="2 2" />
      <g transform={`translate(${px} 0)`}>
        <ellipse cx={0} cy={77} rx={10} ry={3} fill="rgba(0,0,0,0.3)" />
        <path d="M-8 40 L-6 32 H6 L8 40 V70 L5 76 H-5 L-8 70 Z" fill="#d12f26" {...LINE} strokeWidth={1.6} />
        <path d="M-6 32 H6 L4 28 H-4 Z" fill="#e85a48" {...LINE} />
        <path d="M0 42 V64 M-5 48 H5" {...line('#ffe7a6', 2)} />
      </g>
    </svg>
  );
}
