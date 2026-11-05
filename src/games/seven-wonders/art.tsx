// 7 Wonders — hand-drawn SVG art: the icon set (resources, coins, shields,
// laurels, science, military tokens, …), one illustration per card and one
// per wonder board. Flat fills and no <defs> / ids, so any number of pieces
// can share a page without clashes.
//
// Boxes: icons 20 × 20; card scenes 120 × 80 (sky → ground at y ≈ 62 → the
// building); wonder scenes 360 × 120 (side B is the same wonder at dusk).
// Card scenes are picked by card name, falling back to one per card colour,
// so a new card always gets art.

import type { JSX, ReactNode } from 'react';
import type { SwCard, SwCardColor, SwResource, SwScience, SwWonder } from './types';

const INK = '#2a1c0e';
const FONT = 'ui-sans-serif, system-ui, sans-serif';

const LINE = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const THIN = { stroke: INK, strokeWidth: 0.7, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const line = (color: string = INK, width = 1.2) =>
  ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

// Scene palette.
const SKY = '#f3e4c0';
const SKY_BLUE = '#d6e9f0';
const SAND = '#dcb878';
const GRASS = '#a7c26a';
const MARBLE = '#f5efe1';
const STONE = '#ddd5c4';
const STONE_D = '#b3a993';
const WOOD = '#a86a32';
const DARKWOOD = '#6c4220';
const TERRA = '#c9673d';
const ROOF = '#b5483a';
const WATER = '#5fa6c4';
const LEAF = '#5f9a3e';
const DARKLEAF = '#3e7230';
const GOLD = '#e9b53a';
const CREAM = '#fbf3dd';
const WHITE = '#ffffff';

/** Card colour → printed frame colour. */
export const CARD_COLOR_HEX: Record<SwCardColor, string> = {
  brown: '#8b5a2b',
  gray: '#8f949e',
  blue: '#2f6fae',
  yellow: '#e2a92b',
  red: '#c03b32',
  green: '#3f9a4c',
  purple: '#7c55b0',
  leader: '#e8dcc0',
  black: '#34302e',
};

export const CARD_COLOR_LABEL: Record<SwCardColor, string> = {
  brown: 'Raw materials',
  gray: 'Manufactured goods',
  blue: 'Civilian',
  yellow: 'Commercial',
  red: 'Military',
  green: 'Science',
  purple: 'Guilds',
  leader: 'Leaders',
  black: 'Cities',
};

// ===========================================================================
// Icons (20 × 20)

function Icon({ size = 18, title, children, wide = false }: { size?: number; title?: string; children: ReactNode; wide?: boolean }) {
  return (
    <svg
      viewBox={wide ? '0 0 30 20' : '0 0 20 20'}
      width={wide ? size * 1.5 : size}
      height={size}
      className="sw-icon"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

function Num({ n, x = 10, y = 10, fill = INK, size }: { n: number | string; x?: number; y?: number; fill?: string; size?: number }) {
  const s = size ?? (String(n).length > 1 ? 8.6 : 10.5);
  return (
    <text x={x} y={y + s * 0.36} textAnchor="middle" fontSize={s} fontWeight={800} fontFamily={FONT} fill={fill}>
      {n}
    </text>
  );
}

const RES_TILE: Record<SwResource, string> = {
  wood: '#7a4a22',
  stone: '#857f76',
  clay: '#b04f2c',
  ore: '#3c4049',
  glass: '#2e8db0',
  loom: '#7b3f8e',
  papyrus: '#b3843b',
};

const RES_LABEL: Record<SwResource, string> = {
  wood: 'Wood', stone: 'Stone', clay: 'Clay', ore: 'Ore', glass: 'Glass', loom: 'Loom', papyrus: 'Papyrus',
};

function ResourceGlyph({ r }: { r: SwResource }) {
  switch (r) {
    case 'wood':
      return (
        <g>
          <rect x={3} y={10.6} width={12} height={5} rx={2.5} fill="#c98b4b" {...THIN} />
          <ellipse cx={15} cy={13.1} rx={1.9} ry={2.5} fill="#f0cf98" {...THIN} />
          <ellipse cx={15} cy={13.1} rx={0.7} ry={1} fill="none" stroke="#a8743d" strokeWidth={0.6} />
          <rect x={4.6} y={5.2} width={11} height={5} rx={2.5} fill="#b5763a" {...THIN} />
          <ellipse cx={15.6} cy={7.7} rx={1.9} ry={2.5} fill="#f0cf98" {...THIN} />
          <ellipse cx={15.6} cy={7.7} rx={0.7} ry={1} fill="none" stroke="#a8743d" strokeWidth={0.6} />
        </g>
      );
    case 'stone':
      return (
        <g>
          <rect x={2.8} y={10.6} width={7.2} height={5.6} rx={0.6} fill="#e4e0d8" {...THIN} />
          <rect x={10} y={10.6} width={7.2} height={5.6} rx={0.6} fill="#c9c4ba" {...THIN} />
          <rect x={6.4} y={5} width={7.2} height={5.6} rx={0.6} fill="#f0ede6" {...THIN} />
        </g>
      );
    case 'clay':
      return (
        <g {...THIN}>
          <rect x={2.6} y={12} width={7.2} height={3.8} fill="#ec9466" />
          <rect x={9.8} y={12} width={7.6} height={3.8} fill="#d97a4e" />
          <rect x={4.6} y={8.2} width={5.4} height={3.8} fill="#e2875a" />
          <rect x={10} y={8.2} width={5.4} height={3.8} fill="#f2a175" />
          <rect x={7} y={4.4} width={6} height={3.8} fill="#e98d60" />
        </g>
      );
    case 'ore':
      return (
        <g>
          <polygon points="3.6,14.2 5.6,7 11,4.2 16.2,7.4 16.6,13.6 11,16.4" fill="#6d7480" {...THIN} />
          <polygon points="5.6,7 11,4.2 11.4,9.6" fill="#a3acb7" />
          <polygon points="11.4,9.6 16.2,7.4 16.6,13.6" fill="#555b65" />
          <polygon points="3.6,14.2 11.4,9.6 11,16.4" fill="#7c8490" />
          <circle cx={8.4} cy={11.6} r={1.1} fill="#d27a45" />
          <circle cx={13.4} cy={12.6} r={0.8} fill="#d27a45" />
        </g>
      );
    case 'glass':
      return (
        <g>
          <path d="M7.8 3.4 H12.2 V6 C12.2 7 15.6 8.4 15.6 11.8 C15.6 14.9 13.5 16.4 10 16.4 C6.5 16.4 4.4 14.9 4.4 11.8 C4.4 8.4 7.8 7 7.8 6 Z" fill="#c4eef8" {...THIN} />
          <path d="M6.6 10.6 C6.6 9.4 7.6 8.6 8.4 8.2" {...line(WHITE, 1.1)} />
          <rect x={7.2} y={2.6} width={5.6} height={1.6} rx={0.6} fill="#9fdcec" {...THIN} />
        </g>
      );
    case 'loom':
      return (
        <g>
          <rect x={4} y={5.6} width={13} height={9.6} rx={1.4} fill="#eaa5cb" {...THIN} />
          <line x1={5} y1={8.4} x2={16.4} y2={8.4} stroke="#b4528e" strokeWidth={1} />
          <line x1={5} y1={12.4} x2={16.4} y2={12.4} stroke="#b4528e" strokeWidth={1} />
          <ellipse cx={4.2} cy={10.4} rx={1.7} ry={4.8} fill="#f6cde2" {...THIN} />
          <ellipse cx={4.2} cy={10.4} rx={0.6} ry={1.6} fill="#b4528e" />
        </g>
      );
    case 'papyrus':
      return (
        <g>
          <rect x={4.4} y={4.6} width={11.2} height={10.8} fill="#f8eac6" {...THIN} />
          <line x1={6.4} y1={8} x2={13.6} y2={8} stroke="#a07c40" strokeWidth={0.8} />
          <line x1={6.4} y1={10.2} x2={13.6} y2={10.2} stroke="#a07c40" strokeWidth={0.8} />
          <line x1={6.4} y1={12.4} x2={11.6} y2={12.4} stroke="#a07c40" strokeWidth={0.8} />
          <rect x={3} y={2.8} width={14} height={3.2} rx={1.6} fill="#e6c68a" {...THIN} />
          <rect x={3} y={14} width={14} height={3.2} rx={1.6} fill="#e6c68a" {...THIN} />
        </g>
      );
  }
}

export function ResourceIcon({ r, size = 18 }: { r: SwResource; size?: number }) {
  return (
    <Icon size={size} title={RES_LABEL[r]}>
      <rect x={1} y={1} width={18} height={18} rx={4.2} fill={RES_TILE[r]} stroke={INK} strokeWidth={1} />
      <ResourceGlyph r={r} />
    </Icon>
  );
}

export function CoinIcon({ n, size = 18, title }: { n?: number | string; size?: number; title?: string }) {
  return (
    <Icon size={size} title={title ?? (n !== undefined ? `${n} coin${n === 1 ? '' : 's'}` : 'Coins')}>
      <circle cx={10} cy={10} r={8.6} fill="#f3c33b" stroke="#7a4e05" strokeWidth={1.1} />
      <circle cx={10} cy={10} r={6.5} fill="none" stroke="#c9900e" strokeWidth={0.8} />
      {n !== undefined
        ? <Num n={n} fill="#5a3a02" />
        : <path d="M10 5.6 L11.2 8.6 L14.3 8.7 L11.9 10.7 L12.7 13.8 L10 12.1 L7.3 13.8 L8.1 10.7 L5.7 8.7 L8.8 8.6 Z" fill="#fff0b3" stroke="#c9900e" strokeWidth={0.5} />}
    </Icon>
  );
}

export function ShieldIcon({ size = 18, title = 'Shield' }: { size?: number; title?: string }) {
  return (
    <Icon size={size} title={title}>
      <path d="M10 1.6 L17.2 4.2 V9.6 C17.2 14.1 14.1 17 10 18.5 C5.9 17 2.8 14.1 2.8 9.6 V4.2 Z" fill="#c6362c" stroke={INK} strokeWidth={1.1} />
      <path d="M10 4 L14.8 5.8 V9.8 C14.8 12.9 12.8 15 10 16.1 Z" fill="#e2645a" />
      <path d="M10 4 V16.1" stroke="#8f211a" strokeWidth={0.8} />
    </Icon>
  );
}

function Laurel({ color = '#5d8a2f', r = 7.4 }: { color?: string; r?: number }) {
  const leaves: JSX.Element[] = [];
  const angles = [125, 150, 175, 200, 225, 55, 30, 5, -20, -45];
  angles.forEach((deg, i) => {
    const a = (deg * Math.PI) / 180;
    const x = 10 + r * Math.cos(a);
    const y = 10.6 + r * Math.sin(a) * 0.95;
    leaves.push(
      <ellipse key={i} cx={x} cy={y} rx={2.1} ry={1} fill={color} transform={`rotate(${deg + 90 + (deg > 90 ? 18 : -18)} ${x} ${y})`} />,
    );
  });
  return <g>{leaves}</g>;
}

export function VpIcon({ n, size = 18, title }: { n?: number | string; size?: number; title?: string }) {
  return (
    <Icon size={size} title={title ?? (n !== undefined ? `${n} victory point${n === 1 ? '' : 's'}` : 'Victory points')}>
      <circle cx={10} cy={10} r={9} fill="#fbf3dc" stroke="#7b6526" strokeWidth={0.9} />
      <Laurel />
      {n !== undefined && <Num n={n} fill="#1e3d6b" size={String(n).length > 1 ? 7.6 : 9} />}
    </Icon>
  );
}

const SCIENCE_LABEL: Record<SwScience | 'any', string> = {
  compass: 'Compass', gear: 'Gear', tablet: 'Tablet', any: 'Any science symbol',
};

function gearPath(cx: number, cy: number, r: number, teeth: number, depth: number): string {
  const pts: string[] = [];
  const n = teeth * 4;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r - depth;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function ScienceGlyph({ s }: { s: SwScience }) {
  switch (s) {
    case 'compass':
      return (
        <g>
          <path d="M10 5.4 L5.4 15.4 M10 5.4 L14.6 15.4" {...line('#3a3328', 1.7)} />
          <path d="M6.9 12.2 Q10 14 13.1 12.2" {...line('#3a3328', 1)} />
          <circle cx={10} cy={4.6} r={1.6} fill="#c69a3d" stroke="#3a3328" strokeWidth={0.8} />
        </g>
      );
    case 'gear':
      return (
        <g>
          <path d={gearPath(10, 10, 7, 8, 1.9)} fill="#5f6368" stroke="#2b2d30" strokeWidth={0.7} strokeLinejoin="round" />
          <circle cx={10} cy={10} r={2.3} fill="#e8f0d6" stroke="#2b2d30" strokeWidth={0.7} />
        </g>
      );
    case 'tablet':
      return (
        <g>
          <path d="M5.6 16.2 V6.8 Q5.6 3.6 10 3.6 Q14.4 3.6 14.4 6.8 V16.2 Z" fill="#a39b8c" stroke="#3a3328" strokeWidth={0.9} />
          <path d="M7.4 7.6 h5.2 M7.4 10 h5.2 M7.4 12.4 h3.6" {...line('#4d463a', 1)} />
        </g>
      );
  }
}

export function ScienceIcon({ s, size = 18 }: { s: SwScience | 'any'; size?: number }) {
  return (
    <Icon size={size} title={SCIENCE_LABEL[s]}>
      <circle cx={10} cy={10} r={9} fill="#e8f0d6" stroke="#3f7a35" strokeWidth={1} />
      {s === 'any'
        ? (
          <g>
            <g transform="translate(1.6 1.4) scale(0.52)"><ScienceGlyph s="compass" /></g>
            <g transform="translate(8 1.4) scale(0.52)"><ScienceGlyph s="gear" /></g>
            <g transform="translate(4.8 8.6) scale(0.52)"><ScienceGlyph s="tablet" /></g>
          </g>
        )
        : <ScienceGlyph s={s} />}
    </Icon>
  );
}

/** Military victory (+1 / +3 / +5) or defeat (−1) token. */
export function MilitaryToken({ value, size = 18 }: { value: number; size?: number }) {
  if (value < 0) {
    return (
      <Icon size={size} title={`Defeat token (${value})`}>
        <circle cx={10} cy={10} r={8.8} fill="#4a1f1b" stroke={INK} strokeWidth={1} />
        <circle cx={10} cy={10} r={6.6} fill="none" stroke="#7a3a32" strokeWidth={0.8} />
        <Num n={`−${Math.abs(value)}`} fill="#f6d9c9" size={8.4} />
      </Icon>
    );
  }
  const fill = value >= 5 ? '#efc23a' : value >= 3 ? '#cfd5db' : '#c98c4f';
  const ring = value >= 5 ? '#9a6d05' : value >= 3 ? '#6f7880' : '#7c4a1f';
  return (
    <Icon size={size} title={`Victory token (+${value})`}>
      <circle cx={10} cy={10} r={8.8} fill={fill} stroke={ring} strokeWidth={1.1} />
      <Laurel color={ring} r={7} />
      <Num n={value} fill={INK} size={9} />
    </Icon>
  );
}

export function WonderStageIcon({ size = 18, title = 'Wonder stage' }: { size?: number; title?: string }) {
  return (
    <Icon size={size} title={title}>
      <polygon points="1.8,17.4 18.2,17.4 15.6,12.6 4.4,12.6" fill="#d2ab5f" {...THIN} />
      <polygon points="4.4,12.6 15.6,12.6 13,7.8 7,7.8" fill="#e1bf78" {...THIN} />
      <polygon points="7,7.8 13,7.8 10.8,3 9.2,3" fill="#efd496" {...THIN} />
    </Icon>
  );
}

export function ColorChip({ color, size = 18 }: { color: SwCardColor; size?: number }) {
  return (
    <Icon size={size} title={`${CARD_COLOR_LABEL[color]} card`}>
      <rect x={4.4} y={1.6} width={11.2} height={16.8} rx={2} fill={CARD_COLOR_HEX[color]} stroke={INK} strokeWidth={1} />
      <rect x={6} y={3.4} width={8} height={3} rx={0.8} fill="rgba(255,255,255,0.35)" />
    </Icon>
  );
}

/** Direction marker: ◄ west neighbour, ► east neighbour, ▼ yourself. */
export function ArrowIcon({ dir, size = 18, light = false }: { dir: 'west' | 'east' | 'self'; size?: number; light?: boolean }) {
  const pts = dir === 'west' ? '14,3.5 14,16.5 4.5,10' : dir === 'east' ? '6,3.5 6,16.5 15.5,10' : '3.5,6 16.5,6 10,15.5';
  const label = dir === 'west' ? 'West neighbour' : dir === 'east' ? 'East neighbour' : 'Your own city';
  const fill = light ? '#f8e7bd' : dir === 'self' ? '#7a5a2a' : '#3a3026';
  return (
    <Icon size={size} title={label}>
      <polygon points={pts} fill={fill} stroke={light ? 'none' : INK} strokeWidth={0.8} strokeLinejoin="round" />
    </Icon>
  );
}

export function ChainIcon({ size = 14 }: { size?: number }) {
  return (
    <Icon size={size} title="Free via chain">
      <g transform="rotate(-35 10 10)">
        <rect x={1.6} y={7} width={9.6} height={6} rx={3} {...line('#5a4630', 1.9)} />
        <rect x={8.8} y={7} width={9.6} height={6} rx={3} {...line('#8a6a40', 1.9)} />
      </g>
    </Icon>
  );
}

export function DebtIcon({ n = 1, size = 18 }: { n?: number; size?: number }) {
  return (
    <Icon size={size} title={`${n} debt token${n === 1 ? '' : 's'}`}>
      <circle cx={10} cy={10} r={8.6} fill="#2c2826" stroke={INK} strokeWidth={1.1} />
      <circle cx={10} cy={10} r={6.4} fill="none" stroke="#6a625c" strokeWidth={0.8} />
      <Num n={`−${n}`} fill="#f3c33b" size={8.4} />
    </Icon>
  );
}

export function DiplomacyIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size} title="Diplomacy token">
      <circle cx={10} cy={10} r={8.8} fill="#f4f1e6" stroke="#4d6b3a" strokeWidth={1} />
      <path d="M4.6 15 Q9 11 15.6 4.8" {...line('#6b5232', 1.1)} />
      {[[6.6, 12.2, -20], [9, 10, -40], [11.4, 7.6, -40], [13.6, 5.8, -50], [8.6, 13, 50], [11.4, 10.6, 40]].map(([x, y, a], i) => (
        <ellipse key={i} cx={x} cy={y} rx={2} ry={0.95} fill="#6a9a3c" transform={`rotate(${a} ${x} ${y})`} />
      ))}
    </Icon>
  );
}

/** Cities' coin loss: a coin with a bite out of it. */
export function LossIcon({ n = 1, size = 18 }: { n?: number; size?: number }) {
  return (
    <Icon size={size} title={`Others lose ${n} coin${n === 1 ? '' : 's'}`}>
      <path d="M10 1.4 A8.6 8.6 0 1 0 18.4 8 L14.6 9.4 L16.4 5.4 L12.6 6.2 L13.6 2.2 Z" fill="#c9962a" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      <Num n={`−${n}`} x={9.2} y={11} fill="#3b2508" size={8} />
    </Icon>
  );
}

/** Cities' mask (espionage: copy a neighbour's science symbol). */
export function MaskIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size} title="Mask: copy a neighbour's science symbol">
      <circle cx={10} cy={10} r={8.8} fill="#e8dfcf" stroke={INK} strokeWidth={1} />
      <path d="M3.4 8.4 Q10 5.4 16.6 8.4 Q16.4 14 12 13.4 Q10 11.4 8 13.4 Q3.6 14 3.4 8.4 Z" fill="#2c2826" />
      <ellipse cx={6.8} cy={9.6} rx={1.6} ry={1} fill="#e8dfcf" />
      <ellipse cx={13.2} cy={9.6} rx={1.6} ry={1} fill="#e8dfcf" />
    </Icon>
  );
}

/** A Tower of Babel tile with its number. */
export function TileIcon({ n, size = 18 }: { n?: number; size?: number }) {
  return (
    <Icon size={size} title={n ? `Babel tile ${n}` : 'Babel tile'}>
      <path d="M10 1.2 L18.8 10 L10 18.8 L1.2 10 Z" fill="#e3b06e" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      <path d="M10 4 L16 10 L10 16 L4 10 Z" fill="#f3cd92" stroke="#8a5a2b" strokeWidth={0.6} />
      {n ? <Num n={n} fill="#5a3410" size={n > 9 ? 7 : 8.6} /> : null}
    </Icon>
  );
}

/** A Great Project participation token. */
export function ParticipationIcon({ size = 18 }: { size?: number }) {
  return (
    <Icon size={size} title="Participation token">
      <circle cx={10} cy={10} r={8.6} fill="#d9a35f" stroke={INK} strokeWidth={1.1} />
      <path d="M5 14 H15 L13.4 11 H6.6 Z M7.4 11 L8.4 7.4 H11.6 L12.6 11 M8.8 7.4 L9.4 5 H10.6 L11.2 7.4" fill="#f3cd92" stroke="#6c4220" strokeWidth={0.7} strokeLinejoin="round" />
    </Icon>
  );
}

/** A Great Project penalty token (−1 / −2 / −3). */
export function PenaltyIcon({ n = 1, size = 18 }: { n?: number; size?: number }) {
  return (
    <Icon size={size} title={`Penalty token −${n} VP`}>
      <path d="M10 1.4 L18 6 V14 L10 18.6 L2 14 V6 Z" fill="#5a3a5e" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
      <Num n={`−${n}`} fill="#f3e3f4" size={8.4} />
    </Icon>
  );
}

/** Art for the Tower of Babel (table panel) and a Great Project card. */
export function BabelArt({ kind }: { kind: 'tower' | 'project' }) {
  return (
    <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {kind === 'tower' ? <TowerOfBabel /> : <ZigguratScene />}
    </svg>
  );
}

const ROMAN = ['', 'I', 'II', 'III'] as const;
export const AGE_HEX = ['', '#a8582a', '#3b689a', '#76489a'] as const;

/** A tiny card back with the Age numeral. */
export function AgeIcon({ age, size = 18 }: { age: 1 | 2 | 3; size?: number }) {
  return (
    <Icon size={size} title={`Age ${ROMAN[age]}`}>
      <rect x={3.6} y={1.2} width={12.8} height={17.6} rx={2} fill={AGE_HEX[age]} stroke={INK} strokeWidth={1} />
      <rect x={5} y={2.6} width={10} height={14.8} rx={1.2} fill="none" stroke="rgba(255,240,200,0.6)" strokeWidth={0.7} />
      <Num n={ROMAN[age]} fill="#fbecc6" size={age === 3 ? 6.6 : 7.6} />
    </Icon>
  );
}

export type WonderPower = 'buildFromDiscard' | 'playLastCard' | 'freeBuildPerAge' | 'copyGuild';

const POWER_LABEL: Record<WonderPower, string> = {
  buildFromDiscard: 'Build a card from the discard pile for free',
  playLastCard: 'Play the 7th card of each Age',
  freeBuildPerAge: 'Once per Age, build a card for free',
  copyGuild: "Copy a neighbour's guild",
};

/** The base game's wonder powers (Halicarnassus, Babylon B, Olympia A / B). */
export function WonderPowerIcon({ power, size = 18 }: { power: WonderPower; size?: number }) {
  const card = (x: number, y: number, fill: string, rot = 0) => (
    <rect x={x} y={y} width={8.4} height={12} rx={1.4} fill={fill} stroke={INK} strokeWidth={0.9} transform={rot ? `rotate(${rot} ${x + 4.2} ${y + 6})` : undefined} />
  );
  return (
    <Icon size={size} title={POWER_LABEL[power]}>
      {power === 'buildFromDiscard' && (
        <g>
          {/* the face-down pile, a card lifted off it */}
          {card(2.4, 6.4, '#4a3a2a', -14)}
          {card(5, 6.8, '#5c4632', -4)}
          {card(9.2, 2.2, '#fbf3dd', 10)}
          <path d="M13.4 13.6 V7.4 M11.2 9.6 L13.4 7.2 L15.6 9.6" {...line('#3f9a4c', 1.6)} />
        </g>
      )}
      {power === 'playLastCard' && (
        <g>
          {card(5.8, 3.6, '#fbf3dd')}
          <Num n={7} x={10} y={9.4} size={8.6} />
          <path d="M4.4 17.4 H15.6" {...line('#3f9a4c', 1.6)} />
        </g>
      )}
      {power === 'freeBuildPerAge' && (
        <g>
          {card(2.4, 3.4, '#fbf3dd')}
          <circle cx={13.2} cy={12.4} r={4.6} fill={GOLD} stroke="#9a6d05" strokeWidth={0.9} />
          <path d="M9.6 16 L16.8 8.8" {...line('#c03b32', 1.6)} />
        </g>
      )}
      {power === 'copyGuild' && (
        <g>
          {card(2.6, 4.6, '#7c55b0', -10)}
          {card(9, 3.4, '#a585d3', 8)}
          <path d="M7.4 16.8 Q10 18.6 12.6 16.8 M11.2 15.6 L12.8 16.8 L11.4 18.2" {...line(INK, 1)} />
        </g>
      )}
    </Icon>
  );
}

// ===========================================================================
// Card scenes (120 × 80)

export function CardArt({ card }: { card: Pick<SwCard, 'name' | 'color' | 'effects'> }) {
  return (
    <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {cardScene(card)}
    </svg>
  );
}

function cardScene(card: Pick<SwCard, 'name' | 'color' | 'effects'>): JSX.Element {
  const byName = NAMED_SCENES[card.name];
  if (byName) return byName();
  switch (card.color) {
    case 'brown': return <ResourceLand resources={producedResources(card)} />;
    case 'gray': return <Workshop resource={producedResources(card)[0] ?? 'glass'} />;
    case 'blue': return <TempleScene />;
    case 'yellow': return <Market />;
    case 'red': return <Barracks />;
    case 'green': return <ScienceDesk symbol={scienceOf(card) ?? 'compass'} />;
    case 'purple': return <GuildHall emblem={guildEmblem(card.name)} />;
    case 'leader': return <LeaderBust name={card.name} />;
    case 'black': return <NightCity emblem={cityEmblem(card.name)} />;
  }
}

function producedResources(card: Pick<SwCard, 'effects'>): SwResource[] {
  const out: SwResource[] = [];
  for (const e of card.effects) if (e.kind === 'produce') for (const p of e.production) out.push(...p);
  return out.slice(0, 2);
}

function scienceOf(card: Pick<SwCard, 'effects'>): SwScience | null {
  for (const e of card.effects) if (e.kind === 'science') return e.symbol;
  return null;
}

// ---------- scene helpers ----------

function Sky({ fill = SKY, sun = true }: { fill?: string; sun?: boolean }) {
  return (
    <g>
      <rect x={-2} y={-2} width={124} height={84} fill={fill} />
      {sun && <circle cx={98} cy={16} r={8} fill="#fbe7a6" />}
    </g>
  );
}

function Ground({ y = 62, fill = SAND }: { y?: number; fill?: string }) {
  return <rect x={-2} y={y} width={124} height={84 - y} fill={fill} {...LINE} />;
}

function Hills({ fill = '#e2c98f', y = 62 }: { fill?: string; y?: number }) {
  return <path d={`M-2 ${y} Q 18 ${y - 16} 40 ${y - 6} Q 64 ${y - 20} 88 ${y - 7} Q 106 ${y - 15} 122 ${y - 5} V ${y} Z`} fill={fill} />;
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={WHITE} opacity={0.9}>
      <ellipse cx={0} cy={2} rx={10} ry={3.4} />
      <circle cx={-3.5} cy={0} r={3.8} />
      <circle cx={3} cy={-0.6} r={4.6} />
    </g>
  );
}

function Box({ x, y, w, h, fill, rx = 0, thin = false }: { x: number; y: number; w: number; h: number; fill: string; rx?: number; thin?: boolean }) {
  return <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} {...(thin ? THIN : LINE)} />;
}

function Shape({ d, fill, thin = false }: { d: string; fill: string; thin?: boolean }) {
  return <path d={d} fill={fill} {...(thin ? THIN : LINE)} />;
}

/** A classical temple front standing on `base`: steps, columns, architrave, pediment. */
function Temple({ x, base, w, colH, cols = 6, fill = MARBLE, roof = fill }: {
  x: number; base: number; w: number; colH: number; cols?: number; fill?: string; roof?: string;
}) {
  const top = base - 5 - colH;
  const inner = w - 8;
  const cw = Math.min(4, inner / (cols * 1.9));
  const items: JSX.Element[] = [];
  for (let i = 0; i < cols; i++) {
    const cx = x + 4 + cw / 2 + (i * (inner - cw)) / Math.max(1, cols - 1);
    items.push(<Box key={i} x={cx - cw / 2} y={top} w={cw} h={colH} fill={fill} thin />);
    items.push(<Box key={`c${i}`} x={cx - cw / 2 - 0.9} y={top} w={cw + 1.8} h={1.6} fill={fill} thin />);
  }
  return (
    <g>
      <Box x={x - 2} y={base - 2.6} w={w + 4} h={2.6} fill={STONE} thin />
      <Box x={x} y={base - 5} w={w} h={2.4} fill={STONE} thin />
      <rect x={x + 2} y={top} width={w - 4} height={colH} fill="#c9bfa8" />
      {items}
      <Box x={x + 0.5} y={top - 4.4} w={w - 1} h={4.4} fill={fill} thin />
      <Shape d={`M${x - 1} ${top - 4.4} L${x + w / 2} ${top - 4.4 - w * 0.17} L${x + w + 1} ${top - 4.4} Z`} fill={roof} thin />
    </g>
  );
}

function Tree({ x, y, s = 1, kind = 'round' }: { x: number; y: number; s?: number; kind?: 'round' | 'cypress' | 'palm' }) {
  if (kind === 'cypress') {
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <Box x={-1} y={-4} w={2} h={4} fill={DARKWOOD} thin />
        <Shape d="M0 -26 C5 -18 5 -8 0 -4 C-5 -8 -5 -18 0 -26 Z" fill={DARKLEAF} thin />
      </g>
    );
  }
  if (kind === 'palm') {
    return (
      <g transform={`translate(${x} ${y}) scale(${s})`}>
        <path d="M0 0 Q 2 -10 0 -20" {...line(DARKWOOD, 2.4)} />
        {[-60, -20, 20, 60, 160, 200].map((a, i) => (
          <ellipse key={i} cx={0} cy={-20} rx={7} ry={1.8} fill={LEAF} stroke={INK} strokeWidth={0.6} transform={`rotate(${a} 0 -20) translate(5 0)`} />
        ))}
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Box x={-1.4} y={-7} w={2.8} h={7} fill={DARKWOOD} thin />
      <circle cx={0} cy={-13} r={7} fill={LEAF} {...THIN} />
      <circle cx={-3} cy={-15} r={3} fill="#77b052" />
    </g>
  );
}

function Logs({ x, y, n = 3 }: { x: number; y: number; n?: number }) {
  const out: JSX.Element[] = [];
  const rows = n >= 3 ? [[0, 0], [7, 0], [3.5, -5.6]] : [[0, 0], [7, 0]];
  rows.slice(0, n).forEach(([dx, dy], i) => {
    out.push(<rect key={`l${i}`} x={x + dx - 12} y={y + dy - 5.6} width={14} height={5.6} rx={2.8} fill="#b77a3d" {...THIN} />);
    out.push(<circle key={`e${i}`} cx={x + dx + 2} cy={y + dy - 2.8} r={2.8} fill="#efcd93" {...THIN} />);
  });
  return <g>{out}</g>;
}

function Bricks({ x, y, rows = 3 }: { x: number; y: number; rows?: number }) {
  const out: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    const n = rows - r + 1;
    for (let i = 0; i < n; i++) {
      out.push(<rect key={`${r}-${i}`} x={x + i * 6.4 + r * 3.2 - (n * 6.4) / 2 + (r * 0)} y={y - (r + 1) * 3.6} width={6.4} height={3.6} fill={i % 2 ? '#d97a4e' : '#eb9165'} {...THIN} />);
    }
  }
  return <g>{out}</g>;
}

function Blocks({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <Box x={x - 10} y={y - 6} w={9} h={6} fill="#e9e4d9" thin />
      <Box x={x - 1} y={y - 6} w={9} h={6} fill="#d4cdbf" thin />
      <Box x={x - 6} y={y - 12} w={9} h={6} fill="#f2eee5" thin />
    </g>
  );
}

function Cart({ x, y, load }: { x: number; y: number; load: string }) {
  return (
    <g>
      <Shape d={`M${x - 8} ${y - 9} H${x + 8} L${x + 6} ${y - 3} H${x - 6} Z`} fill={WOOD} thin />
      <ellipse cx={x} cy={y - 9.5} rx={7} ry={2.6} fill={load} {...THIN} />
      <circle cx={x - 4} cy={y - 2} r={2.2} fill={DARKWOOD} {...THIN} />
      <circle cx={x + 4} cy={y - 2} r={2.2} fill={DARKWOOD} {...THIN} />
    </g>
  );
}

function Figure({ x, y, s = 1, fill = '#c96f4a', robe = '#f1e3c6' }: { x: number; y: number; s?: number; fill?: string; robe?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-3.4 0 L-2.4 -9 Q0 -11 2.4 -9 L3.4 0 Z" fill={robe} thin />
      <circle cx={0} cy={-12.4} r={2.4} fill={fill} {...THIN} />
    </g>
  );
}

function Amphora({ x, y, s = 1, fill = TERRA }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-1.6 -12 H1.6 V-10.4 C5 -9 5.2 -4 3 -1.4 L1.4 0 H-1.4 L-3 -1.4 C-5.2 -4 -5 -9 -1.6 -10.4 Z" fill={fill} thin />
      <path d="M-1.6 -11 C-4 -11 -4.4 -9 -3 -8 M1.6 -11 C4 -11 4.4 -9 3 -8" {...line(INK, 0.7)} />
      <path d="M-3.6 -6 H3.6" {...line('#2a1c0e', 0.9)} />
    </g>
  );
}

function Stall({ x, y, w = 26, a = '#c8443a', b = CREAM }: { x: number; y: number; w?: number; a?: string; b?: string }) {
  const stripes: JSX.Element[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    stripes.push(<rect key={i} x={x + (i * w) / n} y={y - 22} width={w / n} height={6} fill={i % 2 ? b : a} />);
  }
  return (
    <g>
      <Box x={x + 1} y={y - 16} w={1.6} h={16} fill={DARKWOOD} thin />
      <Box x={x + w - 2.6} y={y - 16} w={1.6} h={16} fill={DARKWOOD} thin />
      {stripes}
      <rect x={x} y={y - 22} width={w} height={6} fill="none" {...THIN} />
      <Box x={x - 1} y={y - 7} w={w + 2} h={4} fill={WOOD} thin />
    </g>
  );
}

function Tent({ x, y, w = 22, h = 16, fill = '#e8d9b4' }: { x: number; y: number; w?: number; h?: number; fill?: string }) {
  return (
    <g>
      <Shape d={`M${x - w / 2} ${y} L${x} ${y - h} L${x + w / 2} ${y} Z`} fill={fill} thin />
      <Shape d={`M${x - 2.4} ${y} L${x} ${y - h * 0.6} L${x + 2.4} ${y} Z`} fill="#5a3a20" thin />
      <path d={`M${x} ${y - h} V${y - h - 4}`} {...line(DARKWOOD, 0.9)} />
      <path d={`M${x} ${y - h - 4} l5 1.4 l-5 1.4`} fill="#c0392b" stroke={INK} strokeWidth={0.5} />
    </g>
  );
}

function Crenels({ x, y, w, h, fill = STONE }: { x: number; y: number; w: number; h: number; fill?: string }) {
  const merlons: JSX.Element[] = [];
  const n = Math.max(2, Math.round(w / 7));
  const mw = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) merlons.push(<Box key={i} x={x + i * 2 * mw} y={y - 3.4} w={mw} h={3.4} fill={fill} thin />);
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} />
      {merlons}
    </g>
  );
}

function Waves({ y, fill = WATER }: { y: number; fill?: string }) {
  let d = `M-2 ${y}`;
  for (let x = -2; x < 124; x += 10) d += ` q 2.5 -2.4 5 0 q 2.5 2.4 5 0`;
  return (
    <g>
      <path d={`${d} V82 H-2 Z`} fill={fill} {...LINE} />
      <path d={`M8 ${y + 7} q3 -2 6 0 M44 ${y + 9} q3 -2 6 0 M82 ${y + 6} q3 -2 6 0`} {...line('#d8eff7', 1)} />
    </g>
  );
}

function Boat({ x, y, s = 1, sail = CREAM }: { x: number; y: number; s?: number; sail?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-14 -4 H14 L10 2 H-10 Z" fill={WOOD} thin />
      <path d="M0 -4 V-24" {...line(DARKWOOD, 1.2)} />
      <Shape d="M0.6 -23 Q9 -15 0.6 -6 Z" fill={sail} thin />
      <Shape d="M-0.6 -21 Q-8 -14 -0.6 -7 Z" fill={sail} thin />
    </g>
  );
}

function Arches({ x, y, w, n, h, fill = STONE }: { x: number; y: number; w: number; n: number; h: number; fill?: string }) {
  const aw = w / n;
  let d = `M${x} ${y} V${y - h}`;
  d += ` H${x + w} V${y}`;
  for (let i = n - 1; i >= 0; i--) {
    const ax = x + i * aw;
    d += ` H${ax + aw - 2} V${y - h * 0.45} A ${aw / 2 - 2} ${aw / 2 - 2} 0 0 0 ${ax + 2} ${y - h * 0.45} V${y}`;
  }
  return <Shape d={`${d} Z`} fill={fill} />;
}

function Dome({ cx, y, r, fill = '#d9cdb4' }: { cx: number; y: number; r: number; fill?: string }) {
  return <Shape d={`M${cx - r} ${y} A ${r} ${r * 0.9} 0 0 1 ${cx + r} ${y} Z`} fill={fill} />;
}

function Scroll({ x, y, w = 18, open = true }: { x: number; y: number; w?: number; open?: boolean }) {
  if (!open) {
    return (
      <g>
        <Box x={x} y={y - 4} w={w} h={4} rx={2} fill="#efdcae" thin />
        <ellipse cx={x + w} cy={y - 2} rx={1.2} ry={2} fill="#d9bf86" {...THIN} />
      </g>
    );
  }
  return (
    <g>
      <Box x={x} y={y - 9} w={w} h={9} fill="#f6e8c5" thin />
      <path d={`M${x + 3} ${y - 6} h${w - 6} M${x + 3} ${y - 3.4} h${w - 9}`} {...line('#a58650', 0.7)} />
      <Box x={x - 1.6} y={y - 10} w={3.2} h={11} rx={1.6} fill="#e2c387" thin />
      <Box x={x + w - 1.6} y={y - 10} w={3.2} h={11} rx={1.6} fill="#e2c387" thin />
    </g>
  );
}

function Flask({ x, y, s = 1, fill = '#7cc7a0' }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-1.6 -12 H1.6 V-7 L5 -1 Q5.6 0 4.4 0 H-4.4 Q-5.6 0 -5 -1 L-1.6 -7 Z" fill="#e7f4f7" thin />
      <path d="M-4 -2.4 L-2.4 -5 H2.4 L4 -2.4 Q4.4 -0.8 3.4 -0.8 H-3.4 Q-4.4 -0.8 -4 -2.4 Z" fill={fill} />
    </g>
  );
}

function Banner({ x, y, w = 12, h = 22, fill }: { x: number; y: number; w?: number; h?: number; fill: string }) {
  return (
    <g>
      <path d={`M${x - 1} ${y} H${x + w + 1}`} {...line(DARKWOOD, 1.4)} />
      <Shape d={`M${x} ${y} H${x + w} V${y + h} L${x + w / 2} ${y + h - 4} L${x} ${y + h} Z`} fill={fill} thin />
    </g>
  );
}

// ---------- brown: raw materials ----------

function ResourceFeature({ r, x, y, s = 1 }: { r: SwResource; x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`}><Feature r={r} x={x} y={y} /></g>;
}

function Feature({ r, x, y }: { r: SwResource; x: number; y: number }) {
  switch (r) {
    case 'wood':
      return (
        <g>
          <Tree x={x - 9} y={y - 2} s={1.05} kind="cypress" />
          <Tree x={x + 6} y={y - 3} s={1.1} />
          <Logs x={x + 2} y={y + 6} />
        </g>
      );
    case 'stone':
      return (
        <g>
          <Shape d={`M${x - 20} ${y + 2} L${x - 16} ${y - 22} L${x - 4} ${y - 28} L${x + 10} ${y - 20} L${x + 14} ${y + 2} Z`} fill="#c7bfae" />
          <path d={`M${x - 15} ${y - 14} H${x + 8} M${x - 16} ${y - 6} H${x + 11} M${x - 6} ${y - 22} V${y - 14} M${x + 2} ${y - 14} V${y - 6} M${x - 9} ${y - 6} V${y + 2}`} {...line('#8a826f', 0.8)} />
          <Blocks x={x + 14} y={y + 8} />
        </g>
      );
    case 'clay':
      return (
        <g>
          <ellipse cx={x - 6} cy={y + 4} rx={15} ry={4.4} fill="#a5532d" {...THIN} />
          <ellipse cx={x - 6} cy={y + 3.4} rx={11} ry={2.6} fill="#c66b3f" />
          <Bricks x={x + 11} y={y + 8} />
          <Figure x={x - 14} y={y + 1} s={0.9} />
        </g>
      );
    case 'ore':
      return (
        <g>
          <Shape d={`M${x - 22} ${y + 2} Q${x - 18} ${y - 26} ${x} ${y - 28} Q${x + 18} ${y - 24} ${x + 20} ${y + 2} Z`} fill="#8b8172" />
          <Shape d={`M${x - 7} ${y + 2} V${y - 10} Q${x} ${y - 17} ${x + 7} ${y - 10} V${y + 2} Z`} fill="#2a2420" />
          <path d={`M${x - 8} ${y + 2} V${y - 11} M${x + 8} ${y + 2} V${y - 11} M${x - 9} ${y - 11} H${x + 9}`} {...line(DARKWOOD, 2)} />
          <Cart x={x + 18} y={y + 8} load="#5a5f68" />
        </g>
      );
    default:
      return <Workshop resource={r} />;
  }
}

function ResourceLand({ resources }: { resources: SwResource[] }) {
  const list = resources.length ? resources : (['wood'] as SwResource[]);
  return (
    <g>
      <Sky />
      <Cloud x={24} y={16} s={0.9} />
      <Hills />
      <Ground y={62} fill={list.some((r) => r === 'wood') ? GRASS : SAND} />
      {list.length === 1
        ? <ResourceFeature r={list[0]} x={58} y={58} s={1.55} />
        : (
          <>
            <ResourceFeature r={list[0]} x={30} y={60} s={1.2} />
            <ResourceFeature r={list[1]} x={88} y={62} s={1.2} />
          </>
        )}
    </g>
  );
}

// ---------- gray: manufactured goods ----------

function Workshop({ resource }: { resource: SwResource }) {
  if (resource === 'glass') {
    return (
      <g>
        <Sky fill="#efd9b8" sun={false} />
        <Ground y={64} fill="#bf9a68" />
        <Shape d="M20 64 V40 Q20 22 40 22 Q60 22 60 40 V64 Z" fill="#b5654a" />
        <path d="M24 36 H56 M22 48 H58 M30 22 V36 M50 22 V36 M38 36 V48" {...line('#8a4532', 0.8)} />
        <Shape d="M31 64 V54 Q40 44 49 54 V64 Z" fill="#ffb347" />
        <path d="M34 64 V57 Q40 50 46 57 V64" fill="#ffe08a" />
        <Box x={36} y={10} w={8} h={13} fill="#9a5a43" />
        <path d="M40 8 q-3 -4 0 -8" {...line('#c9c1b4', 1.6)} />
        <Box x={68} y={46} w={44} h={3} fill={WOOD} thin />
        <Box x={68} y={60} w={44} h={3} fill={WOOD} thin />
        {[74, 86, 98, 108].map((cx, i) => (
          <g key={i}>
            <path d={`M${cx - 2} ${46 - 9 - (i % 2) * 2} h4 v3 q4 2 4 5 q0 1 -1 1 h-10 q-1 0 -1 -1 q0 -3 4 -5 Z`} fill={['#9fe0f0', '#7ccbe0', '#b8ecf3', '#8fd8c9'][i]} {...THIN} />
            <path d={`M${cx - 3} ${60} q-1 -7 3 -9 q4 2 3 9 Z`} fill={['#7ccbe0', '#b8ecf3', '#8fd8c9', '#9fe0f0'][i]} {...THIN} />
          </g>
        ))}
      </g>
    );
  }
  if (resource === 'loom') {
    return (
      <g>
        <Sky fill="#efdcc4" sun={false} />
        <Ground y={66} fill="#c4a272" />
        <Box x={22} y={14} w={4} h={52} fill={WOOD} />
        <Box x={74} y={14} w={4} h={52} fill={WOOD} />
        <Box x={18} y={12} w={64} h={5} fill={DARKWOOD} />
        <Box x={22} y={50} w={56} h={4} fill={DARKWOOD} />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={29 + i * 4} y1={17} x2={29 + i * 4} y2={50} stroke={['#d04f7a', '#f2c94c', '#5b8bd0'][i % 3]} strokeWidth={1.4} />
        ))}
        <rect x={27} y={30} width={46} height={14} fill="#e98bb0" stroke={INK} strokeWidth={0.7} />
        <path d="M27 34 H73 M27 38 H73 M27 42 H73" {...line('#b8457a', 0.8)} />
        <ellipse cx={96} cy={60} rx={12} ry={5} fill="#c86aa0" {...THIN} />
        <ellipse cx={96} cy={53} rx={10} ry={4.2} fill="#7fb0e0" {...THIN} />
        <ellipse cx={96} cy={47} rx={8} ry={3.6} fill="#f2c94c" {...THIN} />
      </g>
    );
  }
  // papyrus
  return (
    <g>
      <Sky />
      <Waves y={60} fill="#7fb7c9" />
      {[8, 14, 104, 112].map((x, i) => (
        <g key={i}>
          <path d={`M${x} 64 V${36 + (i % 2) * 6}`} {...line(DARKLEAF, 1.2)} />
          <ellipse cx={x} cy={34 + (i % 2) * 6} rx={3.4} ry={2} fill="#9cc25a" {...THIN} />
        </g>
      ))}
      <Box x={30} y={14} w={5} h={46} fill={WOOD} />
      <Box x={83} y={14} w={5} h={46} fill={WOOD} />
      <Box x={26} y={12} w={66} h={6} fill={DARKWOOD} />
      <Box x={56} y={18} w={6} h={14} fill="#8c8c8c" />
      <Box x={40} y={32} w={38} h={5} fill={WOOD} />
      <Box x={38} y={37} w={42} h={10} fill="#f6e8c5" />
      <path d="M38 40.4 H80 M38 43.8 H80" {...line('#cdb37a', 0.8)} />
      <Box x={36} y={47} w={46} h={5} fill={DARKWOOD} />
      <Scroll x={64} y={62} w={16} open={false} />
      <Scroll x={42} y={62} w={14} open={false} />
    </g>
  );
}

// ---------- blue: civilian ----------

function TempleScene() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Cloud x={22} y={14} />
      <Ground y={64} fill={GRASS} />
      <Temple x={26} base={64} w={68} colH={26} cols={6} />
      <Tree x={12} y={64} kind="cypress" />
      <Tree x={108} y={64} kind="cypress" />
    </g>
  );
}

function Altar() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={64} fill={GRASS} />
      <Box x={38} y={56} w={44} h={8} fill={STONE} />
      <Box x={44} y={38} w={32} h={18} fill={MARBLE} />
      <path d="M48 44 H72 M48 50 H72" {...line(STONE_D, 0.8)} />
      <Box x={41} y={34} w={38} h={4} fill={STONE} />
      <Shape d="M52 34 Q50 24 56 18 Q56 26 60 24 Q62 16 66 12 Q70 22 68 34 Z" fill="#f08a2c" />
      <Shape d="M56 34 Q56 28 60 26 Q63 30 64 34 Z" fill="#ffd257" />
      <Tree x={18} y={64} kind="cypress" s={1.1} />
      <Tree x={102} y={64} kind="cypress" s={1.1} />
    </g>
  );
}

function Theater() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={66} fill={SAND} />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${8 + i * 4} ${30 + i * 7} Q60 ${14 + i * 9} ${112 - i * 4} ${30 + i * 7}`} {...line(i % 2 ? '#c9b98f' : '#e6d8b2', 6)} />
      ))}
      <path d="M8 30 Q60 14 112 30" {...line(INK, 0.8)} />
      <Box x={40} y={56} w={40} h={10} fill={MARBLE} />
      <circle cx={52} cy={50} r={5} fill="#f4e2b8" {...THIN} />
      <path d="M50 49 h1 M53 49 h1 M50.4 52.4 q1.6 1.4 3.2 0" {...line(INK, 0.8)} />
      <circle cx={68} cy={50} r={5} fill="#d9a35f" {...THIN} />
      <path d="M66 49 h1 M69 49 h1 M66.4 53.4 q1.6 -1.4 3.2 0" {...line(INK, 0.8)} />
    </g>
  );
}

function Baths() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={60} fill={STONE} />
      <Arches x={10} y={46} w={100} n={4} h={30} fill={MARBLE} />
      <Box x={8} y={14} w={104} h={4} fill={STONE} />
      <Box x={14} y={54} w={92} h={10} rx={1} fill="#7cc0d8" />
      <path d="M22 59 q3 -2 6 0 M50 58 q3 -2 6 0 M80 59 q3 -2 6 0" {...line('#d8eff7', 1)} />
      {[30, 60, 90].map((x) => <path key={x} d={`M${x} 52 q-3 -4 0 -8 q3 -4 0 -8`} {...line('#ffffff', 1.4)} />)}
    </g>
  );
}

function Pawnshop() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={64} fill={SAND} />
      <Box x={24} y={30} w={56} h={34} fill="#eadbbd" />
      <Shape d="M20 30 L52 16 L84 30 Z" fill={ROOF} />
      <Box x={44} y={44} w={16} h={20} fill={DARKWOOD} />
      <Box x={28} y={38} w={11} h={10} fill="#8fb6c9" thin />
      <Box x={65} y={38} w={11} h={10} fill="#8fb6c9" thin />
      <Amphora x={92} y={64} s={1.3} />
      <Amphora x={102} y={64} s={1} fill="#d9a35f" />
      <circle cx={52} cy={36} r={4} fill={GOLD} {...THIN} />
    </g>
  );
}

function Aqueduct() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Cloud x={92} y={14} s={0.8} />
      <Hills fill="#c9d59a" y={64} />
      <Ground y={66} fill={GRASS} />
      <Arches x={4} y={66} w={112} n={5} h={22} fill={STONE} />
      <Arches x={4} y={44} w={112} n={8} h={14} fill={MARBLE} />
      <Box x={2} y={27} w={116} h={4} fill={STONE} />
      <rect x={2} y={28} width={116} height={1.6} fill={WATER} />
    </g>
  );
}

function Statue() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Cloud x={24} y={16} />
      <Ground y={64} fill={GRASS} />
      <Box x={44} y={52} w={32} h={12} fill={STONE} />
      <Box x={48} y={46} w={24} h={6} fill={MARBLE} />
      <Shape d="M54 46 L55 30 Q60 26 65 30 L66 46 Z" fill="#e7e1d2" />
      <Shape d="M55 32 L48 22 L50 21 L57 29 Z" fill="#e7e1d2" thin />
      <circle cx={60} cy={24} r={4} fill="#e7e1d2" {...LINE} />
      <path d="M66 32 L72 40" {...line(INK, 1.2)} />
      <Tree x={20} y={64} kind="cypress" s={1.1} />
      <Tree x={100} y={64} kind="round" />
    </g>
  );
}

function Courthouse() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={64} fill={SAND} />
      <Temple x={22} base={64} w={76} colH={24} cols={4} />
      <path d="M60 18 V8 M50 12 H70" {...line(INK, 1)} />
      <path d="M50 12 L47 18 H53 Z M70 12 L67 18 H73 Z" fill={GOLD} {...THIN} />
    </g>
  );
}

function Pantheon() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={64} fill={SAND} />
      <Box x={28} y={30} w={64} h={34} fill="#e9dfc9" />
      <Dome cx={60} y={30} r={30} fill="#d8ccb2" />
      <circle cx={60} cy={6} r={3} fill="#c9bfa8" {...THIN} />
      <Temple x={36} base={64} w={48} colH={18} cols={4} />
    </g>
  );
}

function Gardens() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Cloud x={90} y={12} s={0.8} />
      <Ground y={60} fill={GRASS} />
      <Tree x={14} y={60} kind="cypress" s={1.2} />
      <Tree x={30} y={60} s={1.1} />
      <Tree x={92} y={60} s={1.1} />
      <Tree x={108} y={60} kind="cypress" s={1.2} />
      <ellipse cx={60} cy={66} rx={22} ry={5} fill="#7cc0d8" {...LINE} />
      <Box x={57} y={46} w={6} h={18} fill={MARBLE} />
      <ellipse cx={60} cy={46} rx={9} ry={2.4} fill={MARBLE} {...THIN} />
      <path d="M60 44 Q60 32 52 40 M60 44 Q60 32 68 40" {...line('#7cc0d8', 1.4)} />
      {[[40, 70], [80, 70], [46, 74], [74, 74]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill={['#e46a8a', '#f2c94c'][i % 2]} {...THIN} />)}
    </g>
  );
}

function TownHall() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={64} fill={SAND} />
      <Box x={14} y={34} w={92} h={30} fill="#eadbbd" />
      <Box x={48} y={14} w={24} h={20} fill="#eadbbd" />
      <Shape d="M46 14 L60 4 L74 14 Z" fill={ROOF} />
      <circle cx={60} cy={22} r={5} fill={WHITE} {...THIN} />
      <path d="M60 22 V19 M60 22 H63" {...line(INK, 0.8)} />
      {[20, 34, 78, 92].map((x) => <Box key={x} x={x} y={40} w={8} h={12} fill="#8fb6c9" thin />)}
      <Box x={52} y={46} w={16} h={18} fill={DARKWOOD} />
      <path d="M14 34 H106" {...line(INK, 1.4)} />
      <path d="M16 30 V20 M104 30 V20" {...line(DARKWOOD, 1)} />
      <path d="M16 20 l7 2 l-7 2 Z M104 20 l7 2 l-7 2 Z" fill="#2f6fae" {...THIN} />
    </g>
  );
}

function Palace() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={64} fill={GRASS} />
      <Box x={10} y={36} w={100} h={28} fill="#f1e6cd" />
      <Dome cx={30} y={36} r={10} fill={GOLD} />
      <Dome cx={90} y={36} r={10} fill={GOLD} />
      <Box x={44} y={24} w={32} h={40} fill="#f1e6cd" />
      <Dome cx={60} y={24} r={16} fill={GOLD} />
      <path d="M60 8 V2" {...line(INK, 1)} />
      {[16, 26, 36, 84, 94, 104].map((x) => <Box key={x} x={x - 2} y={44} w={4} h={20} fill={MARBLE} thin />)}
      <Shape d="M52 64 V48 Q60 40 68 48 V64 Z" fill={DARKWOOD} />
    </g>
  );
}

function Senate() {
  return (
    <g>
      <Sky fill={SKY_BLUE} />
      <Ground y={64} fill={SAND} />
      <Box x={16} y={58} w={88} h={6} fill={STONE} />
      <Box x={22} y={52} w={76} h={6} fill={STONE} />
      <Box x={30} y={30} w={60} h={22} fill="#c9bfa8" />
      {[32, 42, 52, 62, 72, 82].map((x) => <Box key={x} x={x} y={30} w={5} h={22} fill={MARBLE} thin />)}
      <Box x={26} y={25} w={68} h={5} fill={MARBLE} />
      <Dome cx={60} y={25} r={26} fill="#e2d6bc" />
      <Figure x={60} y={64} s={0.8} robe={WHITE} />
    </g>
  );
}

// ---------- yellow: commercial ----------

function Market() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={SAND} />
      <Stall x={10} y={64} w={30} a="#c8443a" />
      <Stall x={46} y={64} w={30} a="#2f6fae" />
      <Stall x={82} y={64} w={30} a="#3f9a4c" />
      <Amphora x={20} y={57} s={0.8} />
      <circle cx={58} cy={55} r={2.4} fill="#e46a3a" {...THIN} />
      <circle cx={63} cy={55} r={2.4} fill="#f2c94c" {...THIN} />
      <circle cx={95} cy={55} r={2.4} fill="#9cc25a" {...THIN} />
      <Figure x={42} y={72} s={0.9} robe="#e3c08c" />
    </g>
  );
}

function Tavern() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={SAND} />
      <Box x={22} y={30} w={64} h={34} fill="#e5cfa4" />
      <Shape d="M18 30 L54 14 L90 30 Z" fill={ROOF} />
      <Box x={46} y={44} w={16} h={20} fill={DARKWOOD} />
      <path d="M86 36 H100 V40" {...line(DARKWOOD, 1.4)} />
      <Box x={94} y={40} w={12} h={10} fill={CREAM} thin />
      <Amphora x={100} y={49} s={0.6} />
      <Amphora x={30} y={64} s={1.1} />
      <Amphora x={38} y={64} s={0.9} fill="#d9a35f" />
      {[[28, 38], [33, 38], [30.5, 42]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.2} fill="#8a3b7a" {...THIN} />)}
    </g>
  );
}

function TradingPost({ dir }: { dir: 'east' | 'west' }) {
  const flip = dir === 'west';
  return (
    <g>
      <Sky />
      <Hills />
      <Ground y={62} fill={SAND} />
      <Shape d="M40 80 L54 62 H66 L80 80 Z" fill="#c9a061" thin />
      <g transform={flip ? 'translate(120 0) scale(-1 1)' : undefined}>
        <Box x={22} y={26} w={3} h={40} fill={DARKWOOD} />
        <Shape d="M24 28 H48 L54 34 L48 40 H24 Z" fill="#e9c27a" />
        <Shape d="M24 42 H44 L49 47 L44 52 H24 Z" fill="#d9a35f" />
        <Cart x={84} y={68} load="#b77a3d" />
      </g>
      <text x={flip ? 82 : 38} y={36.6} textAnchor="middle" fontSize={7} fontWeight={800} fontFamily={FONT} fill={INK}>{flip ? 'W' : 'E'}</text>
    </g>
  );
}

function Forum() {
  return (
    <g>
      <Sky />
      <Ground y={62} fill="#e6d3a8" />
      {[10, 26, 42, 78, 94, 110].map((x) => (
        <g key={x}>
          <Box x={x - 3} y={24} w={6} h={38} fill={MARBLE} thin />
          <Box x={x - 4.4} y={22} w={8.8} h={3} fill={STONE} thin />
        </g>
      ))}
      <Box x={4} y={18} w={44} h={4} fill={STONE} />
      <Box x={72} y={18} w={44} h={4} fill={STONE} />
      <path d="M0 70 H120 M20 62 L10 80 M60 62 V80 M100 62 L110 80" {...line('#c9b58a', 0.8)} />
      <Figure x={54} y={66} robe="#2f6fae" />
      <Figure x={64} y={66} robe="#c8443a" fill="#a8603e" />
    </g>
  );
}

function Camel({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-12 -12 Q-9 -22 -3 -16 Q1 -24 6 -14 L10 -14 Q12 -22 16 -22 L18 -20 L15 -18 L13 -10 L8 -8 H-10 Z" fill="#d1a15b" thin />
      <path d="M-9 -9 V0 M-5 -9 V0 M4 -9 V0 M8 -9 V0" {...line(INK, 1.4)} />
    </g>
  );
}

function Caravansery() {
  return (
    <g>
      <Sky />
      <Hills fill="#e8c88a" />
      <Ground y={62} fill={SAND} />
      <Tree x={102} y={62} kind="palm" s={1.1} />
      <Tent x={22} y={62} w={24} h={16} fill="#e7c48b" />
      <Camel x={56} y={70} s={1.1} />
      <Camel x={84} y={72} s={0.9} />
      <path d="M68 58 L74 58" {...line(INK, 0.6)} />
    </g>
  );
}

function Vineyard() {
  return (
    <g>
      <Sky />
      <Hills fill="#c8cf86" />
      <Ground y={58} fill="#b8c470" />
      {[62, 68, 74].map((y, row) => (
        <g key={y}>
          {Array.from({ length: 6 }, (_, i) => {
            const x = 10 + i * 20 + row * 4;
            return (
              <g key={i}>
                <path d={`M${x} ${y + 6} V${y - 6}`} {...line(DARKWOOD, 1.2)} />
                <circle cx={x - 3} cy={y - 4} r={3.2} fill={LEAF} {...THIN} />
                <circle cx={x + 3} cy={y - 5} r={3.2} fill="#77b052" {...THIN} />
                {[[0, 0], [2, 0], [1, 1.8]].map(([dx, dy], k) => <circle key={k} cx={x - 1 + dx} cy={y - 1 + dy} r={1.1} fill="#7b2f6f" />)}
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}

function Bazaar() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={SAND} />
      <Stall x={8} y={64} w={34} a="#d97a2a" b="#f6e3b0" />
      <Stall x={46} y={64} w={30} a="#7c55b0" b="#f6e3b0" />
      <Stall x={80} y={64} w={32} a="#c8443a" b="#f6e3b0" />
      <rect x={14} y={48} width={14} height={9} fill="#c8443a" stroke={INK} strokeWidth={0.6} />
      <path d="M14 52.5 H28" {...line(GOLD, 1)} />
      <rect x={52} y={48} width={14} height={9} fill="#2f6fae" stroke={INK} strokeWidth={0.6} />
      <Amphora x={96} y={57} s={0.8} fill="#d9a35f" />
    </g>
  );
}

function Haven() {
  return (
    <g>
      <Sky />
      <Waves y={56} />
      <Box x={-2} y={50} w={46} h={8} fill={STONE} />
      <Box x={4} y={30} w={30} h={20} fill="#e5cfa4" />
      <Shape d="M0 30 L19 18 L38 30 Z" fill={ROOF} />
      <path d="M40 50 V16 L60 20" {...line(DARKWOOD, 1.6)} />
      <path d="M58 20 V34" {...line(INK, 0.6)} />
      <Box x={55} y={34} w={6} h={5} fill={WOOD} thin />
      <Boat x={84} y={62} s={1.2} sail="#f6e3b0" />
    </g>
  );
}

function LighthouseScene({ night = false }: { night?: boolean }) {
  return (
    <g>
      <Sky fill={night ? '#3b4a6b' : SKY} sun={!night} />
      <path d="M62 16 L120 4 V30 Z" fill="#fff2b0" opacity={0.7} />
      <Waves y={60} fill={night ? '#2d5f7c' : WATER} />
      <Shape d="M30 66 L42 50 H78 L90 66 Z" fill={STONE_D} />
      <Shape d="M48 50 L52 22 H68 L72 50 Z" fill={MARBLE} />
      <path d="M50 36 H70 M49 44 H71" {...line(STONE_D, 0.8)} />
      <Box x={50} y={18} w={20} h={4} fill={STONE} />
      <Box x={54} y={9} w={12} h={9} fill="#ffd257" />
      <Shape d="M52 9 L60 2 L68 9 Z" fill={ROOF} />
      <Boat x={16} y={66} s={0.7} />
    </g>
  );
}

function Chamber() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={SAND} />
      <Temple x={14} base={64} w={60} colH={22} cols={4} fill="#f1e6cd" roof="#e2a92b" />
      <Box x={80} y={46} w={30} h={18} fill={WOOD} />
      <path d="M80 52 H110" {...line(DARKWOOD, 1)} />
      {[[86, 46], [92, 46], [98, 46], [104, 46], [89, 42], [95, 42], [101, 42], [95, 38]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={3} ry={1.6} fill={GOLD} {...THIN} />
      ))}
    </g>
  );
}

function Arena() {
  return (
    <g>
      <Sky />
      <Ground y={66} fill={SAND} />
      <Shape d="M6 66 V30 Q60 14 114 30 V66 Z" fill="#e2cfa2" />
      <path d="M6 42 Q60 26 114 42 M6 54 Q60 38 114 54" {...line(INK, 0.9)} />
      {Array.from({ length: 9 }, (_, i) => {
        const x = 12 + i * 12;
        const t = Math.abs(i - 4) / 4;
        const top = 32 - (1 - t * t) * 9;
        return (
          <g key={i}>
            <path d={`M${x} ${top + 12} V${top + 7} q4 -4 8 0 V${top + 12}`} fill="#8a6a3f" stroke={INK} strokeWidth={0.6} />
            <path d={`M${x} ${top + 24} V${top + 19} q4 -4 8 0 V${top + 24}`} fill="#8a6a3f" stroke={INK} strokeWidth={0.6} />
          </g>
        );
      })}
      <path d="M58 22 V10" {...line(DARKWOOD, 1)} />
      <path d="M58 10 l8 2 l-8 2 Z" fill="#c8443a" {...THIN} />
    </g>
  );
}

// ---------- red: military ----------

function Palisade() {
  return (
    <g>
      <Sky />
      <Hills />
      <Ground y={62} fill={GRASS} />
      {Array.from({ length: 13 }, (_, i) => (
        <Shape key={i} d={`M${6 + i * 8.6} 66 V${30 + (i % 3) * 2} L${10.3 + i * 8.6} ${24 + (i % 3) * 2} L${14.6 + i * 8.6} ${30 + (i % 3) * 2} V66 Z`} fill={i % 2 ? WOOD : '#b97d40'} thin />
      ))}
      <path d="M2 44 H118 M2 56 H118" {...line(DARKWOOD, 1.6)} />
    </g>
  );
}

function Barracks() {
  return (
    <g>
      <Sky />
      <Hills />
      <Ground y={62} fill={SAND} />
      <Tent x={30} y={64} w={30} h={22} fill="#e7d7b0" />
      <Tent x={82} y={64} w={34} h={26} fill="#d9c49a" />
      {[50, 56, 62].map((x) => (
        <g key={x}>
          <path d={`M${x} 66 L${x + 4} 34`} {...line(DARKWOOD, 1)} />
          <path d={`M${x + 4} 34 l-1.4 4 l3 0.4 Z`} fill="#9aa3ae" {...THIN} />
        </g>
      ))}
    </g>
  );
}

function GuardTower() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={GRASS} />
      <Crenels x={44} y={18} w={32} h={46} fill={STONE} />
      <Box x={55} y={40} w={10} h={24} rx={0} fill={DARKWOOD} />
      <Box x={57} y={26} w={6} h={8} fill="#2a2420" thin />
      <path d="M60 15 V4" {...line(DARKWOOD, 1)} />
      <path d="M60 4 l10 3 l-10 3 Z" fill="#c03b32" {...THIN} />
      <Crenels x={4} y={46} w={40} h={18} fill="#cfc6b3" />
      <Crenels x={76} y={46} w={40} h={18} fill="#cfc6b3" />
    </g>
  );
}

function WallsScene() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={SAND} />
      <Crenels x={4} y={30} w={112} h={34} fill={STONE} />
      <path d="M4 40 H116 M4 52 H116 M20 30 V40 M44 30 V40 M68 30 V40 M92 30 V40 M32 40 V52 M56 40 V52 M80 40 V52 M104 40 V52" {...line(STONE_D, 0.8)} />
      <Shape d="M48 64 V48 Q60 36 72 48 V64 Z" fill={DARKWOOD} />
      <path d="M52 64 V50 M56 64 V46 M60 64 V44 M64 64 V46 M68 64 V50" {...line('#4a2c14', 0.8)} />
      <Crenels x={18} y={18} w={16} h={14} fill={STONE} />
      <Crenels x={86} y={18} w={16} h={14} fill={STONE} />
    </g>
  );
}

function TrainingGround() {
  return (
    <g>
      <Sky />
      <Ground y={60} fill="#d8bf87" />
      <path d="M30 66 V30 M20 38 H40" {...line(DARKWOOD, 2.2)} />
      <circle cx={30} cy={26} r={5} fill="#e7d7b0" {...LINE} />
      <Shape d="M24 40 H36 V54 H24 Z" fill="#e7d7b0" />
      <Figure x={64} y={70} s={1.4} robe="#c03b32" fill="#c98c5a" />
      <path d="M68 50 L80 36" {...line('#9aa3ae', 1.8)} />
      <Shape d="M86 70 Q86 52 96 52 Q106 52 106 70 Z" fill="#c6362c" />
      <circle cx={96} cy={61} r={2.6} fill={GOLD} {...THIN} />
    </g>
  );
}

function Horse({ x, y, s = 1, fill = '#8a5a34' }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Shape d="M-16 -14 Q-16 -20 -8 -20 H8 L14 -30 Q18 -32 20 -28 L18 -22 L14 -18 V-12 L10 -12 Q8 -10 -12 -10 Q-16 -10 -16 -14 Z" fill={fill} thin />
      <path d="M-13 -11 V0 M-8 -11 V0 M6 -12 V0 M11 -12 V0" {...line(INK, 1.6)} />
      <path d="M-16 -16 Q-20 -12 -20 -6" {...line('#3a2414', 1.6)} />
      <path d="M10 -26 Q8 -22 6 -20" {...line('#3a2414', 1.6)} />
    </g>
  );
}

function Stables() {
  return (
    <g>
      <Sky />
      <Ground y={64} fill={GRASS} />
      <Box x={6} y={28} w={50} h={36} fill="#c99a62" />
      <Shape d="M2 28 L31 14 L60 28 Z" fill={ROOF} />
      <Box x={20} y={42} w={22} h={22} fill={DARKWOOD} />
      <path d="M20 42 L42 64 M42 42 L20 64" {...line('#a87a48', 1.2)} />
      <Horse x={88} y={68} s={1.1} />
      <path d="M62 52 H118 M62 60 H118" {...line(WOOD, 1.6)} />
    </g>
  );
}

function Target({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <path d={`M${x - r * 0.6} ${y + r * 1.6} L${x} ${y} L${x + r * 0.6} ${y + r * 1.6}`} {...line(DARKWOOD, 1.6)} />
      <circle cx={x} cy={y} r={r} fill={CREAM} {...LINE} />
      <circle cx={x} cy={y} r={r * 0.66} fill="#c6362c" {...THIN} />
      <circle cx={x} cy={y} r={r * 0.33} fill={CREAM} {...THIN} />
    </g>
  );
}

function ArcheryRange() {
  return (
    <g>
      <Sky />
      <Ground y={60} fill={GRASS} />
      <Target x={84} y={38} r={14} />
      <Target x={30} y={44} r={8} />
      <path d="M78 34 L62 26 M88 42 L74 46" {...line(DARKWOOD, 1)} />
      <path d="M62 26 l-3 -2 M62 26 l-3 1.4 M74 46 l-3 -1.6 M74 46 l-2.6 2" {...line('#c03b32', 0.9)} />
    </g>
  );
}

function Fortifications() {
  return (
    <g>
      <Sky />
      <Hills />
      <Ground y={66} fill={SAND} />
      <Shape d="M0 66 L14 50 H106 L120 66 Z" fill="#c9bea6" />
      <Crenels x={20} y={30} w={80} h={22} fill={STONE} />
      <Crenels x={8} y={18} w={20} h={34} fill="#e6dece" />
      <Crenels x={92} y={18} w={20} h={34} fill="#e6dece" />
      <Crenels x={50} y={10} w={20} h={22} fill="#e6dece" />
      <path d="M60 7 V-2" {...line(DARKWOOD, 1)} />
      <path d="M60 -1 l9 2.6 l-9 2.6 Z" fill="#c03b32" {...THIN} />
      <Shape d="M54 52 V44 Q60 38 66 44 V52 Z" fill={DARKWOOD} />
    </g>
  );
}

function Circus() {
  return (
    <g>
      <Sky />
      <Ground y={40} fill="#e3c88f" />
      <ellipse cx={60} cy={60} rx={56} ry={16} fill="#d9b678" {...LINE} />
      <ellipse cx={60} cy={60} rx={38} ry={6} fill="#c9a061" {...LINE} />
      <Shape d="M58 58 L60 36 L62 58 Z" fill={MARBLE} />
      <Horse x={30} y={70} s={0.55} fill="#6a4228" />
      <Shape d="M38 64 h8 l1 -5 h-8 Z" fill="#c03b32" thin />
      <Horse x={90} y={58} s={0.45} fill="#e7d7b0" />
      <path d="M2 36 Q60 18 118 36" {...line(INK, 0.9)} />
      {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={8 + i * 11.6} cy={33 - Math.sin((i / 9) * Math.PI) * 8} r={1.6} fill={['#c8443a', '#2f6fae', '#f2c94c'][i % 3]} />)}
    </g>
  );
}

function Arsenal() {
  return (
    <g>
      <Sky fill="#ecd6b0" sun={false} />
      <Ground y={66} fill="#bf9a68" />
      <Box x={6} y={12} w={108} h={4} fill={DARKWOOD} />
      <Box x={6} y={62} w={108} h={4} fill={DARKWOOD} />
      {[16, 28, 40].map((x) => (
        <g key={x}>
          <path d={`M${x} 62 V20`} {...line(WOOD, 1.6)} />
          <path d={`M${x} 16 l-3 6 h6 Z`} fill="#9aa3ae" {...THIN} />
        </g>
      ))}
      <Shape d="M52 30 Q52 22 64 22 Q76 22 76 30 V44 Q76 54 64 58 Q52 54 52 44 Z" fill="#c6362c" />
      <circle cx={64} cy={39} r={5} fill={GOLD} {...THIN} />
      <Shape d="M82 34 Q82 26 92 26 Q102 26 102 34 V46 Q102 54 92 58 Q82 54 82 46 Z" fill="#2f6fae" />
      <path d="M86 20 L110 56 M110 20 L86 56" {...line('#9aa3ae', 2)} />
    </g>
  );
}

function SiegeWorkshop() {
  return (
    <g>
      <Sky />
      <Hills />
      <Ground y={62} fill={SAND} />
      <Shape d="M30 62 H86 L80 52 H36 Z" fill={WOOD} />
      <circle cx={40} cy={64} r={6} fill={DARKWOOD} {...LINE} />
      <circle cx={76} cy={64} r={6} fill={DARKWOOD} {...LINE} />
      <path d="M50 52 L64 30 L76 52" {...line(DARKWOOD, 2)} />
      <path d="M62 50 L36 14" {...line('#7a4a22', 2.4)} />
      <path d="M36 14 q-6 0 -6 6 q6 0 6 -6 Z" fill={DARKWOOD} {...THIN} />
      <circle cx={31} cy={18} r={3} fill="#8b8172" {...THIN} />
      <Logs x={104} y={62} n={2} />
    </g>
  );
}

// ---------- green: science ----------

function ScienceDesk({ symbol }: { symbol: SwScience }) {
  return (
    <g>
      <Sky fill="#e5eed4" sun={false} />
      <Ground y={60} fill="#b99464" />
      <Box x={8} y={50} w={104} h={6} fill={WOOD} />
      <path d="M14 56 V80 M106 56 V80" {...line(DARKWOOD, 3)} />
      <g transform="translate(36 6) scale(2.4)">
        <circle cx={10} cy={10} r={9} fill="#f6f3e4" stroke="#3f7a35" strokeWidth={0.6} />
        <ScienceGlyph s={symbol} />
      </g>
      <Scroll x={78} y={50} w={22} />
      <Flask x={20} y={50} s={1.1} />
    </g>
  );
}

function Apothecary() {
  return (
    <g>
      <Sky fill="#e5eed4" sun={false} />
      <Ground y={64} fill="#b99464" />
      {[22, 40].map((y) => <Box key={y} x={6} y={y} w={60} h={3} fill={WOOD} thin />)}
      {[12, 22, 32, 44, 56].map((x, i) => <Flask key={x} x={x} y={22} s={0.8} fill={['#7cc7a0', '#e46a8a', '#f2c94c', '#7fb0e0', '#9cc25a'][i]} />)}
      {[14, 28, 42, 56].map((x, i) => <Amphora key={x} x={x} y={40} s={0.8} fill={['#c9673d', '#d9a35f', '#8a6a3f', '#c9673d'][i]} />)}
      <Box x={70} y={48} w={44} h={16} fill={WOOD} />
      <Shape d="M82 48 Q82 38 90 38 Q98 38 98 48 Z" fill="#9aa3ae" />
      <path d="M92 40 L102 28" {...line(DARKWOOD, 2)} />
      {[[76, 44], [106, 44], [80, 40]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={3} ry={1.4} fill={LEAF} transform={`rotate(-30 ${x} ${y})`} />)}
    </g>
  );
}

function Library() {
  return (
    <g>
      <Sky fill="#e5eed4" sun={false} />
      <Ground y={66} fill="#b99464" />
      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          <Box x={6} y={14 + row * 13} w={108} h={2.4} fill={DARKWOOD} thin />
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i}>
              <ellipse cx={14 + i * 10.4} cy={10 + row * 13} rx={3.4} ry={3.4} fill={['#efdcae', '#e2c387', '#f6e8c5'][(i + row) % 3]} {...THIN} />
              <circle cx={14 + i * 10.4} cy={10 + row * 13} r={1} fill="#a58650" />
            </g>
          ))}
        </g>
      ))}
    </g>
  );
}

function Observatory() {
  return (
    <g>
      <Sky fill="#28365a" sun={false} />
      {[[10, 10], [26, 22], [44, 8], [84, 12], [104, 26], [112, 8], [70, 6]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 1 : 1.4} fill="#fff3c2" />
      ))}
      <circle cx={100} cy={14} r={6} fill="#f6efd0" />
      <Ground y={62} fill="#6f7a64" />
      <Box x={34} y={40} w={52} h={22} fill="#d9cdb4" />
      <Dome cx={60} y={40} r={22} fill="#e7dcc2" />
      <path d="M60 20 L84 6" {...line('#3a3328', 4)} />
      <path d="M60 20 L84 6" {...line('#c69a3d', 2)} />
      <Shape d="M54 62 V50 Q60 44 66 50 V62 Z" fill={DARKWOOD} />
    </g>
  );
}

function Workbench() {
  return (
    <g>
      <Sky fill="#e5eed4" sun={false} />
      <Ground y={60} fill="#b99464" />
      <Box x={6} y={50} w={108} h={6} fill={WOOD} />
      <path d="M12 56 V80 M108 56 V80" {...line(DARKWOOD, 3)} />
      <path d={gearPath(36, 30, 16, 10, 4)} fill="#8d9298" {...LINE} />
      <circle cx={36} cy={30} r={5} fill="#5f6368" {...THIN} />
      <path d={gearPath(62, 38, 10, 8, 3)} fill="#b3b8be" {...LINE} />
      <circle cx={62} cy={38} r={3} fill="#5f6368" {...THIN} />
      <path d="M84 48 L100 20" {...line(DARKWOOD, 2.6)} />
      <g transform="rotate(30 100 18)"><Box x={94} y={14} w={12} h={7} fill="#7b828b" /></g>
      <path d="M78 48 L106 42" {...line('#9aa3ae', 1.6)} />
    </g>
  );
}

function School() {
  return (
    <g>
      <Sky fill="#e5eed4" />
      <Ground y={64} fill={GRASS} />
      <Box x={20} y={16} w={44} h={30} fill="#3b4a3a" />
      <path d="M26 24 h18 M26 30 h28 M26 36 h12" {...line('#f4f1e6', 1.2)} />
      <circle cx={52} cy={36} r={4} fill="none" stroke="#f4f1e6" strokeWidth={0.9} />
      <path d="M20 46 L16 64 M64 46 L68 64" {...line(DARKWOOD, 1.6)} />
      <Figure x={82} y={66} s={1.3} robe="#3f9a4c" />
      <Figure x={98} y={66} s={1.1} robe="#f1e3c6" fill="#a8603e" />
      <Box x={74} y={60} w={34} h={4} fill={WOOD} thin />
    </g>
  );
}

function University() {
  return (
    <g>
      <Sky fill="#e5eed4" />
      <Ground y={64} fill={GRASS} />
      <Box x={8} y={34} w={104} h={30} fill="#efe4cb" />
      {[16, 28, 40, 80, 92, 104].map((x) => <Box key={x} x={x - 3} y={42} w={6} h={10} fill="#8fb6c9" thin />)}
      <Temple x={44} base={64} w={32} colH={20} cols={4} />
      <Dome cx={60} y={34} r={0.1} />
      <Scroll x={14} y={62} w={14} open={false} />
    </g>
  );
}

function Laboratory() {
  return (
    <g>
      <Sky fill="#e5eed4" sun={false} />
      <Ground y={64} fill="#b99464" />
      <Box x={6} y={54} w={108} h={6} fill={WOOD} />
      <Shape d="M28 54 Q18 54 18 42 Q18 30 30 30 Q42 30 42 42 Q42 54 32 54 Z" fill="#e7f4f7" />
      <path d="M22 46 Q30 50 38 46 Q38 52 30 52 Q22 52 22 46 Z" fill="#9cc25a" />
      <path d="M38 34 Q52 20 66 28 L72 40" {...line(INK, 2.6)} />
      <path d="M38 34 Q52 20 66 28 L72 40" {...line('#e7f4f7', 1.2)} />
      <Flask x={74} y={54} s={1.2} fill="#e46a8a" />
      <Box x={22} y={56} w={16} h={4} fill="#5a5f68" thin />
      <Shape d="M24 64 Q30 56 36 64 Z" fill="#ffb347" />
      <Flask x={92} y={54} s={0.9} fill="#7fb0e0" />
      <Flask x={104} y={54} s={0.8} fill="#f2c94c" />
    </g>
  );
}

function Scribe() {
  return (
    <g>
      <Sky fill="#e5eed4" sun={false} />
      <Ground y={66} fill="#b99464" />
      <Shape d="M14 50 L106 42 L108 50 L16 58 Z" fill={WOOD} />
      <path d="M22 58 V80 M100 50 V80" {...line(DARKWOOD, 3)} />
      <Shape d="M30 46 L84 41 L86 49 L32 54 Z" fill="#f6e8c5" thin />
      <path d="M38 47 L76 44 M38 50.4 L70 47.8" {...line('#a58650', 0.8)} />
      <path d="M90 42 L104 14" {...line('#f4f1e6', 2.6)} />
      <path d="M90 42 L104 14" {...line(INK, 0.7)} />
      <Shape d="M98 26 Q108 12 106 6 Q100 14 96 24 Z" fill="#f4f1e6" thin />
      <Box x={88} y={36} w={8} h={6} rx={1} fill="#2a2420" thin />
      <Scroll x={14} y={44} w={12} open={false} />
      <Scroll x={18} y={38} w={12} open={false} />
    </g>
  );
}

function Academy() {
  return (
    <g>
      <Sky fill="#e5eed4" />
      <Ground y={64} fill={GRASS} />
      <Temple x={20} base={64} w={80} colH={24} cols={6} />
      <Figure x={42} y={70} s={1.2} robe={WHITE} fill="#d9a07a" />
      <Figure x={56} y={71} s={1.1} robe="#3f9a4c" />
      <Figure x={74} y={70} s={1.2} robe="#f1e3c6" fill="#a8603e" />
      <path d="M46 58 L52 55" {...line(INK, 0.8)} />
    </g>
  );
}

// ---------- purple: guilds ----------

type Emblem = 'hammer' | 'anvil' | 'scales' | 'owl' | 'eye' | 'helmet' | 'ship' | 'gear' | 'laurel' | 'pyramid';

function guildEmblem(name: string): Emblem {
  if (/Workers/.test(name)) return 'hammer';
  if (/Craftsmen/.test(name)) return 'anvil';
  if (/Traders/.test(name)) return 'scales';
  if (/Philosophers/.test(name)) return 'owl';
  if (/Spies/.test(name)) return 'eye';
  if (/Strategists|Mercenaries/.test(name)) return 'helmet';
  if (/Shipowners/.test(name)) return 'ship';
  if (/Scientists/.test(name)) return 'gear';
  if (/Magistrates/.test(name)) return 'laurel';
  return 'pyramid';
}

function EmblemGlyph({ e, x, y, s = 1 }: { e: Emblem; x: number; y: number; s?: number }) {
  const g = (() => {
    switch (e) {
      case 'hammer': return <g><path d="M-1 8 L-1 -4" {...line(DARKWOOD, 2.4)} /><Box x={-6} y={-8} w={12} h={5} fill="#9aa3ae" thin /></g>;
      case 'anvil': return <Shape d="M-8 -4 H6 Q9 -4 9 -1 H3 L2 3 H5 V6 H-5 V3 H-2 L-3 -1 H-8 Z" fill="#7b828b" thin />;
      case 'scales': return <g><path d="M0 -8 V7 M-7 -5 H7 M-4 7 H4" {...line(GOLD, 1.4)} /><path d="M-7 -5 L-10 1 H-4 Z M7 -5 L4 1 H10 Z" fill={GOLD} {...THIN} /></g>;
      case 'owl': return <g><Shape d="M-6 7 Q-8 -2 -5 -7 L-2 -4 H2 L5 -7 Q8 -2 6 7 Z" fill="#b08a5a" thin /><circle cx={-2.4} cy={-1} r={2} fill={CREAM} {...THIN} /><circle cx={2.4} cy={-1} r={2} fill={CREAM} {...THIN} /></g>;
      case 'eye': return <g><Shape d="M-9 0 Q0 -8 9 0 Q0 8 -9 0 Z" fill={CREAM} thin /><circle cx={0} cy={0} r={3} fill="#2f6fae" {...THIN} /><circle cx={0} cy={0} r={1.2} fill={INK} /></g>;
      case 'helmet': return <g><Shape d="M-7 6 V-1 Q-7 -8 0 -8 Q7 -8 7 -1 V6 H3 V1 H-3 V6 Z" fill={GOLD} thin /><path d="M0 -8 Q2 -13 7 -12" {...line('#c03b32', 2)} /></g>;
      case 'ship': return <g><Shape d="M-9 2 H9 L6 7 H-6 Z" fill={WOOD} thin /><path d="M0 2 V-9" {...line(DARKWOOD, 1)} /><Shape d="M0.5 -8 Q6 -3 0.5 1 Z" fill={CREAM} thin /></g>;
      case 'gear': return <g><path d={gearPath(0, 0, 7, 8, 2)} fill="#8d9298" {...THIN} /><circle cx={0} cy={0} r={2.2} fill={CREAM} {...THIN} /></g>;
      case 'laurel': return <g transform="translate(-10 -10)"><Laurel color={GOLD} r={7} /></g>;
      case 'pyramid': return <g transform="translate(-10 -10)"><polygon points="2,17 18,17 10,3" fill={GOLD} {...THIN} /><path d="M6 12 H14 M8 8 H12" {...line('#9a6d05', 0.7)} /></g>;
    }
  })();
  return <g transform={`translate(${x} ${y}) scale(${s})`}>{g}</g>;
}

function GuildHall({ emblem }: { emblem: Emblem }) {
  return (
    <g>
      <Sky fill="#e6dcef" />
      <Ground y={64} fill={STONE} />
      <Temple x={16} base={64} w={88} colH={28} cols={6} fill="#efe6f3" roof="#7c55b0" />
      <Banner x={30} y={22} fill="#7c55b0" />
      <Banner x={78} y={22} fill="#7c55b0" />
      <circle cx={60} cy={20} r={7.6} fill="#f8f0d8" {...LINE} />
      <EmblemGlyph e={emblem} x={60} y={20} s={0.75} />
      <EmblemGlyph e={emblem} x={36} y={33} s={0.5} />
      <EmblemGlyph e={emblem} x={84} y={33} s={0.5} />
    </g>
  );
}

// ---------- leaders ----------

type Headwear = 'laurel' | 'helmet' | 'crown' | 'nemes' | 'veil' | 'none';

const LEADER_LOOK: Record<string, { hat: Headwear; beard?: boolean; skin?: string }> = {
  Caesar: { hat: 'laurel' }, Nero: { hat: 'laurel' }, Justinian: { hat: 'crown', beard: true }, Maecenas: { hat: 'laurel' },
  Hannibal: { hat: 'helmet', beard: true, skin: '#b07a52' }, Alexander: { hat: 'helmet' }, Leonidas: { hat: 'helmet', beard: true },
  Xenophon: { hat: 'helmet', beard: true }, Pericles: { hat: 'helmet', beard: true }, Tomyris: { hat: 'helmet' },
  Croesus: { hat: 'crown', beard: true }, Midas: { hat: 'crown', beard: true }, Nebuchadnezzar: { hat: 'crown', beard: true, skin: '#b07a52' },
  Solomon: { hat: 'crown', beard: true, skin: '#b07a52' }, Hiram: { hat: 'crown', beard: true, skin: '#b07a52' }, Hammurabi: { hat: 'crown', beard: true, skin: '#b07a52' },
  Bilkis: { hat: 'crown', skin: '#8a5a3a' }, Zenobia: { hat: 'crown', skin: '#b07a52' }, Amytis: { hat: 'veil', skin: '#b07a52' },
  Cleopatra: { hat: 'nemes', skin: '#b07a52' }, Nefertiti: { hat: 'nemes', skin: '#9a6a44' }, Ramses: { hat: 'nemes', skin: '#9a6a44' },
  Hatshepsut: { hat: 'nemes', skin: '#9a6a44' }, Imhotep: { hat: 'none', skin: '#9a6a44' },
  Sappho: { hat: 'laurel' }, Hypatia: { hat: 'veil' },
  Aspasia: { hat: 'veil' }, Berenice: { hat: 'crown', skin: '#b07a52' }, Caligula: { hat: 'laurel' },
  Darius: { hat: 'crown', beard: true, skin: '#b07a52' }, Diocletian: { hat: 'laurel', beard: true }, Semiramis: { hat: 'crown', skin: '#b07a52' },
  Euclid: { hat: 'none', beard: true }, Ptolemy: { hat: 'none', beard: true }, Pythagoras: { hat: 'none', beard: true },
  Aristotle: { hat: 'none', beard: true }, Plato: { hat: 'none', beard: true }, Archimedes: { hat: 'none', beard: true },
  Varro: { hat: 'none', beard: true }, Vitruvius: { hat: 'none', beard: true }, Phidias: { hat: 'none', beard: true }, Praxiteles: { hat: 'none', beard: true },
};

function LeaderBust({ name }: { name: string }) {
  const look = LEADER_LOOK[name] ?? { hat: 'laurel' as Headwear };
  const skin = look.skin ?? '#e0b48a';
  return (
    <g>
      <Sky fill="#efe4c8" sun={false} />
      <circle cx={60} cy={44} r={34} fill="#d9c08a" {...LINE} />
      <circle cx={60} cy={44} r={29} fill="#f4e6c4" {...THIN} />
      {/* shoulders + draped robe */}
      <Shape d="M34 82 Q36 62 60 60 Q84 62 86 82 Z" fill="#9b3d38" />
      <Shape d="M48 82 Q50 66 60 62 Q70 66 72 82 Z" fill="#f1e3c6" />
      {/* neck + profile head (facing right) */}
      <Shape d="M54 62 L55 52 H64 L65 62 Z" fill={skin} thin />
      <Shape d="M50 40 Q50 24 62 24 Q72 24 72 36 L75 41 L72 43 Q72 50 66 54 H56 Q50 50 50 40 Z" fill={skin} />
      <circle cx={67} cy={36} r={1} fill={INK} />
      {look.beard && <Shape d="M56 50 Q60 58 68 54 Q71 50 70 46 Q64 50 58 46 Z" fill="#5a4030" thin />}
      {look.hat === 'laurel' && (
        <g>
          <path d="M50 32 Q58 22 72 28" {...line(DARKLEAF, 1.4)} />
          {[[52, 30], [56, 26], [61, 24], [66, 25], [70, 27]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx={2.6} ry={1.2} fill={LEAF} transform={`rotate(${-40 + i * 18} ${x} ${y})`} />)}
          <Shape d="M50 40 Q48 30 54 26 Q50 34 52 40 Z" fill="#5a4030" thin />
        </g>
      )}
      {look.hat === 'helmet' && (
        <g>
          <Shape d="M47 42 Q46 20 62 20 Q75 20 74 34 L68 34 V40 H58 L56 46 Z" fill={GOLD} />
          <Shape d="M52 20 Q60 6 76 14 Q66 14 60 22 Z" fill="#c03b32" />
        </g>
      )}
      {look.hat === 'crown' && (
        <g>
          <Shape d="M50 34 Q50 24 62 24 Q70 24 72 30 L71 34 Q60 30 50 34 Z" fill="#5a4030" thin />
          <Shape d="M51 28 L52 18 L56 24 L60 16 L64 24 L68 18 L70 28 Z" fill={GOLD} />
          <circle cx={60} cy={25} r={1.4} fill="#c03b32" />
        </g>
      )}
      {look.hat === 'nemes' && (
        <g>
          <Shape d="M46 56 L48 30 Q50 20 62 21 Q72 22 72 30 L66 30 L60 33 L56 56 Z" fill="#f2c94c" />
          <path d="M49 34 L57 33 M48.6 40 L57 39 M48.2 46 L56.6 45 M47.8 52 L56.2 51" {...line('#2f6fae', 1.4)} />
          <Shape d="M62 21 Q66 16 70 20 L68 24 Z" fill="#3f9a4c" thin />
        </g>
      )}
      {look.hat === 'veil' && (
        <Shape d="M46 60 Q44 30 54 24 Q64 18 72 26 L70 30 Q60 28 56 34 Q52 44 54 60 Z" fill="#cfe0ea" />
      )}
      {look.hat === 'none' && <Shape d="M50 40 Q48 28 56 25 Q66 22 72 30 Q62 28 56 32 Q52 36 52 42 Z" fill="#8a8078" thin />}
    </g>
  );
}

// ---------- expansions ----------

type CityEmblem = 'mask' | 'coins' | 'flag' | 'dagger' | 'urn' | 'bird' | 'bottle';

function cityEmblem(name: string): CityEmblem {
  if (/Spy Ring|Hideout|Lair|Brotherhood|Secret Society/.test(name)) return 'mask';
  if (/Gambling|Secret Warehouse|Slave Market/.test(name)) return 'coins';
  if (/Embassy|Consulate/.test(name)) return 'flag';
  if (/Militia|Mercenaries|Contingent|Torture/.test(name)) return 'dagger';
  if (/Pigeon/.test(name)) return 'bird';
  if (/Dock/.test(name)) return 'bottle';
  return 'urn';
}

function NightCity({ emblem }: { emblem: CityEmblem }) {
  return (
    <g>
      <Sky fill="#2b3150" sun={false} />
      <circle cx={98} cy={14} r={7} fill="#f6efd0" />
      <circle cx={101} cy={12} r={6} fill="#2b3150" />
      {[[12, 10], [30, 18], [52, 8], [74, 16], [114, 26]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1} fill="#fff3c2" />)}
      <Shape d="M-2 80 V46 H12 V36 H24 V50 H34 V30 H46 V44 H58 V38 H70 V52 H82 V34 H94 V48 H106 V40 H122 V80 Z" fill="#1c1f30" />
      {[[16, 40], [38, 34], [40, 42], [86, 38], [86, 44], [62, 42], [110, 46]].map(([x, y], i) => <rect key={i} x={x} y={y} width={3} height={3} fill="#f2c94c" />)}
      <Ground y={66} fill="#3a3a44" />
      <g transform="translate(60 52)">
        <circle cx={0} cy={0} r={13} fill="#efe6d6" {...LINE} />
        {emblem === 'mask' && <Shape d="M-9 -3 Q0 -7 9 -3 Q9 5 3 5 Q0 2 -3 5 Q-9 5 -9 -3 Z" fill="#2c2826" />}
        {emblem === 'coins' && [[-4, 3], [3, 3], [-0.5, -2]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4} fill={GOLD} {...THIN} />)}
        {emblem === 'flag' && <g><path d="M-5 9 V-9" {...line(DARKWOOD, 1.4)} /><Shape d="M-5 -9 H7 L4 -4 L7 1 H-5 Z" fill="#c03b32" thin /></g>}
        {emblem === 'dagger' && <g><Shape d="M0 -10 L2 3 H-2 Z" fill="#c9d1d8" thin /><path d="M-5 3 H5 M0 3 V9" {...line(DARKWOOD, 2)} /></g>}
        {emblem === 'urn' && <Shape d="M-3 -9 H3 V-7 Q8 -4 6 3 Q4 8 0 8 Q-4 8 -6 3 Q-8 -4 -3 -7 Z" fill="#8a8078" thin />}
        {emblem === 'bird' && <Shape d="M-9 2 Q-4 -2 0 0 Q2 -8 8 -8 Q4 -4 4 0 Q8 2 9 5 Q2 4 -2 6 Q-6 6 -9 2 Z" fill="#b9c0c7" thin />}
        {emblem === 'bottle' && <Shape d="M-2 -10 H2 V-5 Q6 -3 6 2 V9 H-6 V2 Q-6 -3 -2 -5 Z" fill="#6aa06a" thin />}
      </g>
    </g>
  );
}

function ZigguratScene() {
  return (
    <g>
      <Sky fill="#f6d2a2" />
      <Ground y={64} fill={SAND} />
      <Box x={14} y={52} w={92} h={12} fill="#d9a35f" />
      <Box x={26} y={40} w={68} h={12} fill="#e3b06e" />
      <Box x={38} y={28} w={44} h={12} fill="#ecbf80" />
      <Box x={50} y={16} w={20} h={12} fill="#f3cd92" />
      <Box x={56} y={16} w={8} h={48} fill="#c98a4a" thin />
      <path d="M56 22 H64 M56 30 H64 M56 38 H64 M56 46 H64 M56 54 H64" {...line('#8a5a2b', 0.7)} />
      <Tree x={8} y={64} kind="palm" />
      <Tree x={112} y={64} kind="palm" s={0.9} />
    </g>
  );
}

function TowerOfBabel() {
  return (
    <g>
      <Sky fill="#f6d2a2" />
      <Cloud x={22} y={14} />
      <Ground y={66} fill={SAND} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const w = 70 - i * 10;
        const y = 66 - (i + 1) * 9.4;
        return (
          <g key={i}>
            <Box x={60 - w / 2} y={y} w={w} h={9.4} fill={i % 2 ? '#e3b06e' : '#d9a35f'} thin />
            {Array.from({ length: Math.max(1, Math.floor(w / 9)) }, (_, k) => (
              <path key={k} d={`M${60 - w / 2 + 4 + k * 9} ${y + 9.4} V${y + 4} q2 -3 4 0 V${y + 9.4}`} fill="#7a4a22" />
            ))}
          </g>
        );
      })}
      <path d="M26 64 L95 47 M30 55 L88 38" {...line('#b07a3a', 0.8)} />
    </g>
  );
}

function IshtarGate() {
  return (
    <g>
      <Sky fill="#f6d2a2" />
      <Ground y={66} fill={SAND} />
      <Crenels x={14} y={14} w={26} h={52} fill="#2f5fa8" />
      <Crenels x={80} y={14} w={26} h={52} fill="#2f5fa8" />
      <Box x={36} y={26} w={48} h={40} fill="#2f5fa8" />
      <Shape d="M46 66 V42 Q60 28 74 42 V66 Z" fill="#2a1c0e" />
      {[[22, 30], [92, 30], [22, 46], [92, 46], [52, 32], [68, 32]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <Shape d="M-4 2 Q-4 -2 0 -2 H4 L5 -4 L6 -2 V2 Z" fill="#f2c94c" thin />
        </g>
      ))}
      <path d="M36 30 H84 M14 58 H40 M80 58 H106" {...line('#f2c94c', 1.2)} />
    </g>
  );
}

function TerraceGardens() {
  return (
    <g>
      <Sky fill="#f6d2a2" />
      <Ground y={66} fill={SAND} />
      <Box x={10} y={52} w={100} h={14} fill="#d9a35f" />
      <Box x={24} y={38} w={72} h={14} fill="#e3b06e" />
      <Box x={38} y={24} w={44} h={14} fill="#ecbf80" />
      {[[12, 52, 98], [26, 38, 70], [40, 24, 42]].map(([x, y, w], i) => (
        <g key={i}>
          {Array.from({ length: Math.floor(w / 7) }, (_, k) => <circle key={k} cx={x + 3 + k * 7} cy={y} r={3.6} fill={k % 2 ? LEAF : '#77b052'} {...THIN} />)}
          <path d={`M${x + 8} ${y + 2} q-2 6 0 10 M${x + w - 10} ${y + 2} q2 6 0 10`} {...line(DARKLEAF, 1.6)} />
        </g>
      ))}
      <Tree x={60} y={24} kind="palm" s={0.8} />
    </g>
  );
}

function ShipScene() {
  return (
    <g>
      <Sky fill="#d6e9f0" />
      <Cloud x={24} y={14} />
      <Waves y={58} fill="#3f7fa8" />
      <Shape d="M18 54 H102 L92 66 H28 Z" fill="#8a5a34" />
      <path d="M22 58 H98" {...line('#f2c94c', 1.2)} />
      <path d="M44 54 V12 M76 54 V18" {...line(DARKWOOD, 1.6)} />
      <Shape d="M45 14 Q60 26 45 42 Z" fill={CREAM} />
      <Shape d="M43 16 Q30 28 43 40 Z" fill="#f1e3c6" />
      <Shape d="M77 20 Q90 30 77 46 Z" fill={CREAM} />
      <path d="M44 12 l8 2 l-8 2 Z" fill="#1f3f73" {...THIN} />
      {[30, 40, 50, 60, 70, 80, 90].map((x) => <path key={x} d={`M${x} 64 L${x - 4} 72`} {...line(DARKWOOD, 1)} />)}
    </g>
  );
}

function Shipyard() {
  return (
    <g>
      <Sky fill="#d6e9f0" />
      <Waves y={64} fill="#3f7fa8" />
      <Shape d="M-2 64 L30 50 H122 V64 Z" fill="#c9b58a" />
      <Shape d="M38 50 Q40 34 70 34 H96 Q98 44 92 50 Z" fill="#b07a48" />
      <path d="M46 36 V50 M56 34 V50 M66 34 V50 M76 34 V50 M86 34 V50" {...line(DARKWOOD, 0.8)} />
      <path d="M38 50 L34 62 M60 50 V62 M90 50 L94 62" {...line(DARKWOOD, 1.6)} />
      <path d="M106 50 V10 L80 14" {...line(DARKWOOD, 1.8)} />
      <path d="M82 14 V26" {...line(INK, 0.6)} />
      <Logs x={22} y={56} n={2} />
    </g>
  );
}

function ChartScene() {
  return (
    <g>
      <Sky fill="#e8dcc0" sun={false} />
      <Box x={10} y={8} w={100} h={64} fill="#f4e6c4" />
      <path d="M18 30 Q30 18 44 26 Q52 34 46 44 Q36 52 26 46 Q16 40 18 30 Z" fill="#c9d59a" {...THIN} />
      <path d="M70 20 Q84 14 96 24 Q102 36 92 40 Q80 42 74 34 Z" fill="#c9d59a" {...THIN} />
      <path d="M30 60 L58 40 L84 52" {...line('#c03b32', 1)} strokeDasharray="2 2" />
      <g transform="translate(86 58)">
        <circle cx={0} cy={0} r={9} fill="none" {...THIN} />
        <path d="M0 -10 L2 0 L0 10 L-2 0 Z" fill="#1f3f73" />
        <path d="M-10 0 L0 -2 L10 0 L0 2 Z" fill="#9aa3ae" />
      </g>
      <Boat x={56} y={40} s={0.4} />
    </g>
  );
}

function Harbor() {
  return (
    <g>
      <Sky fill="#d6e9f0" />
      <Waves y={56} fill="#3f7fa8" />
      <Box x={-2} y={50} w={60} h={6} fill={WOOD} />
      {[6, 20, 34, 48].map((x) => <path key={x} d={`M${x} 56 V72`} {...line(DARKWOOD, 2)} />)}
      <Boat x={84} y={62} s={1.1} />
      <Boat x={30} y={48} s={0.6} sail="#f6d2a2" />
      <Box x={6} y={36} w={12} h={14} fill="#b07a48" />
      <Box x={22} y={40} w={10} h={10} fill="#c99a62" />
    </g>
  );
}

const NAMED_SCENES: Record<string, () => JSX.Element> = {
  // blue
  Altar: () => <Altar />,
  Theater: () => <Theater />,
  Baths: () => <Baths />,
  Pawnshop: () => <Pawnshop />,
  Aqueduct: () => <Aqueduct />,
  Temple: () => <TempleScene />,
  Statue: () => <Statue />,
  Courthouse: () => <Courthouse />,
  Pantheon: () => <Pantheon />,
  Gardens: () => <Gardens />,
  'Town Hall': () => <TownHall />,
  Palace: () => <Palace />,
  Senate: () => <Senate />,
  // yellow
  Tavern: () => <Tavern />,
  'East Trading Post': () => <TradingPost dir="east" />,
  'West Trading Post': () => <TradingPost dir="west" />,
  Marketplace: () => <Market />,
  Forum: () => <Forum />,
  Caravansery: () => <Caravansery />,
  Vineyard: () => <Vineyard />,
  Bazaar: () => <Bazaar />,
  Haven: () => <Haven />,
  Lighthouse: () => <LighthouseScene />,
  'Chamber of Commerce': () => <Chamber />,
  Arena: () => <Arena />,
  // red
  Stockade: () => <Palisade />,
  Barracks: () => <Barracks />,
  'Guard Tower': () => <GuardTower />,
  Walls: () => <WallsScene />,
  'Training Ground': () => <TrainingGround />,
  Stables: () => <Stables />,
  'Archery Range': () => <ArcheryRange />,
  Fortifications: () => <Fortifications />,
  Circus: () => <Circus />,
  Arsenal: () => <Arsenal />,
  'Siege Workshop': () => <SiegeWorkshop />,
  // green
  Apothecary: () => <Apothecary />,
  Dispensary: () => <Apothecary />,
  Workshop: () => <Workbench />,
  Laboratory: () => <Laboratory />,
  Scriptorium: () => <Scribe />,
  Library: () => <Library />,
  School: () => <School />,
  Observatory: () => <Observatory />,
  University: () => <University />,
  Academy: () => <Academy />,
  Lodge: () => <ScienceDesk symbol="compass" />,
  Study: () => <ScienceDesk symbol="gear" />,
  // Cities
  'Gates of the City': () => <IshtarGate />,
  'Clandestine Dock West': () => <ShipScene />,
  'Clandestine Dock East': () => <ShipScene />,
  'Architect Cabinet': () => <ChartScene />,
  'Builders Union': () => <Shipyard />,
  Residence: () => <TerraceGardens />,
  Capitol: () => <Palace />,
  Tabularium: () => <Library />,
  'Black Market': () => <Harbor />,
};

// ===========================================================================
// Wonder scenes (360 × 120)

export function WonderArt({ wonder }: { wonder: Pick<SwWonder, 'id' | 'side'> }) {
  const night = wonder.side === 'B';
  return (
    <svg viewBox="0 0 360 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {wonderScene(wonder.id.split('-')[0], night)}
    </svg>
  );
}

function WSky({ night, fill, ground }: { night: boolean; fill?: string; ground?: string }) {
  return (
    <g>
      <rect x={-2} y={-2} width={364} height={124} fill={night ? '#3a3f66' : fill ?? '#f4ddb0'} />
      {night
        ? (
          <g>
            <rect x={-2} y={70} width={364} height={50} fill="#5b4f6e" />
            {[[20, 14], [60, 30], [96, 10], [150, 22], [210, 12], [250, 34], [300, 16], [338, 30], [120, 40]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 ? 1 : 1.6} fill="#fff3c2" />
            ))}
            <circle cx={318} cy={24} r={11} fill="#f6efd0" />
            <circle cx={323} cy={20} r={9.5} fill="#3a3f66" />
          </g>
        )
        : (
          <g>
            <rect x={-2} y={66} width={364} height={54} fill="#f0cf96" />
            <circle cx={300} cy={30} r={18} fill="#fbe7a6" />
          </g>
        )}
      {ground && <rect x={-2} y={98} width={364} height={24} fill={ground} {...LINE} />}
    </g>
  );
}

function wonderScene(base: string, night: boolean): JSX.Element {
  const sea = night ? '#2d5f7c' : WATER;
  const sand = night ? '#a88a6a' : SAND;
  switch (base) {
    case 'gizah':
      return (
        <g>
          <WSky night={night} />
          <path d="M-2 98 Q90 88 180 96 T362 92 V122 H-2 Z" fill={sand} {...LINE} />
          <Shape d="M60 98 L150 18 L240 98 Z" fill={night ? '#c9a678' : '#e8c27c'} />
          <Shape d="M150 18 L240 98 H186 Z" fill={night ? '#a8865a' : '#c99a55'} />
          {[34, 50, 66, 82].map((y) => <path key={y} d={`M${150 - (y - 18) * 1.12} ${y} H${150 + (y - 18) * 1.12}`} {...line(night ? '#8a6c48' : '#b0874a', 0.6)} />)}
          <Shape d="M226 98 L276 48 L326 98 Z" fill={night ? '#c9a678' : '#e8c27c'} />
          <Shape d="M276 48 L326 98 H296 Z" fill={night ? '#a8865a' : '#c99a55'} />
          <Shape d="M14 98 L44 68 L74 98 Z" fill={night ? '#b8966a' : '#dcb46e'} />
          <Shape d="M44 68 L74 98 H56 Z" fill={night ? '#98764e' : '#bd8f4c'} />
          <Shape d="M246 112 V102 Q252 92 262 96 L264 90 Q270 88 272 94 L272 112 Z" fill={night ? '#b8966a' : '#d9b06a'} />
          <path d="M228 112 H272" {...line(INK, 1.2)} />
          <Tree x={330} y={104} kind="palm" s={1.4} />
          <Camel x={110} y={114} s={1.1} />
        </g>
      );
    case 'rhodes':
      return (
        <g>
          <WSky night={night} />
          <path d="M-2 92 Q30 88 60 92 T120 92 T180 92 T240 92 T300 92 T362 92 V122 H-2 Z" fill={sea} {...LINE} />
          <Box x={96} y={78} w={40} h={20} fill={STONE} />
          <Box x={224} y={78} w={40} h={20} fill={STONE} />
          {/* bronze colossus straddling the harbour */}
          <Shape d="M118 78 L128 78 L176 50 L170 44 Z" fill="#b07a3e" />
          <Shape d="M242 78 L232 78 L186 50 L192 44 Z" fill="#9a6a34" />
          <Shape d="M166 50 L168 40 H192 L194 50 Q180 56 166 50 Z" fill="#8a5a2b" />
          <Shape d="M168 40 L164 22 Q180 16 196 22 L192 40 Z" fill="#c9954f" />
          <path d="M172 28 Q180 32 188 28" {...line('#a8763a', 1)} />
          <Shape d="M194 23 L210 10 L214 13 L198 28 Z" fill="#c08a4a" />
          <path d="M212 11 V4" {...line(DARKWOOD, 2.4)} />
          <Shape d="M208 4 Q212 -6 216 4 Q214 8 212 7 Q210 8 208 4 Z" fill="#ffb347" />
          <Shape d="M166 23 L156 40 L160 42 L170 28 Z" fill="#b07a3e" />
          <Box x={176} y={13} w={8} h={6} fill="#c9954f" thin />
          <circle cx={180} cy={9} r={6.4} fill="#c9954f" {...LINE} />
          {[-150, -120, -90, -60, -30].map((a, i) => (
            <path key={i} d={`M${180 + 6.4 * Math.cos((a * Math.PI) / 180)} ${9 + 6.4 * Math.sin((a * Math.PI) / 180)} L${180 + 11 * Math.cos((a * Math.PI) / 180)} ${9 + 11 * Math.sin((a * Math.PI) / 180)}`} {...line('#a8763a', 1.8)} />
          ))}
          <Boat x={175} y={102} s={1.4} sail={night ? '#d8d0c0' : CREAM} />
          <Boat x={46} y={100} s={0.9} />
          <Boat x={316} y={100} s={0.8} />
        </g>
      );
    case 'alexandria':
      return (
        <g>
          <WSky night={night} />
          {night && <path d="M166 16 L362 -2 V34 Z" fill="#ffe08a" opacity={0.4} />}
          {night && <path d="M154 16 L-2 2 V30 Z" fill="#ffe08a" opacity={0.25} />}
          <path d="M-2 96 Q30 92 60 96 T120 96 T180 96 T240 96 T300 96 T362 96 V122 H-2 Z" fill={sea} {...LINE} />
          <Shape d="M110 100 Q130 84 180 84 Q230 84 250 100 Z" fill={sand} />
          <Box x={140} y={64} w={40} h={22} fill={MARBLE} />
          <Box x={146} y={38} w={28} h={26} fill="#efe6d2" />
          <Box x={152} y={20} w={16} h={18} fill={MARBLE} />
          <Box x={154} y={12} w={12} h={8} fill={night ? '#ffd257' : '#f6c443'} />
          <Shape d="M152 12 L160 2 L168 12 Z" fill={ROOF} />
          <Box x={136} y={60} w={48} h={4} fill={STONE} />
          <Box x={143} y={35} w={34} h={3} fill={STONE} />
          {[146, 152, 158, 164, 170].map((x) => <Box key={x} x={x} y={68} w={2.4} h={14} fill="#c9bfa8" thin />)}
          <Boat x={70} y={104} s={1} />
          <Boat x={286} y={104} s={1.2} />
          <Tree x={232} y={88} kind="palm" s={1} />
        </g>
      );
    case 'ephesos':
      return (
        <g>
          <WSky night={night} ground={night ? '#7a8a62' : GRASS} />
          <Tree x={26} y={100} kind="cypress" s={1.8} />
          <Tree x={334} y={100} kind="cypress" s={1.8} />
          <Tree x={52} y={100} kind="round" s={1.3} />
          <Box x={64} y={92} w={232} h={7} fill={STONE} />
          <Box x={72} y={86} w={216} h={6} fill={STONE} />
          <rect x={78} y={42} width={204} height={44} fill={night ? '#8f8573' : '#c9bfa8'} />
          {Array.from({ length: 12 }, (_, i) => {
            const x = 82 + i * 17.6;
            return (
              <g key={i}>
                <Box x={x} y={44} w={6} h={42} fill={MARBLE} thin />
                <Box x={x - 1.6} y={42} w={9.2} h={3} fill={MARBLE} thin />
                <circle cx={x - 0.6} cy={43.6} r={1.6} fill={MARBLE} {...THIN} />
                <circle cx={x + 6.6} cy={43.6} r={1.6} fill={MARBLE} {...THIN} />
              </g>
            );
          })}
          <Box x={74} y={34} w={212} h={8} fill={MARBLE} />
          <path d="M78 38 H282" {...line(GOLD, 1.2)} />
          <Shape d="M70 34 L180 10 L290 34 Z" fill={MARBLE} />
          <Shape d="M120 30 L180 17 L240 30 Z" fill={night ? '#b0a68e' : '#e4dac4'} thin />
          <Figure x={180} y={30} s={0.8} robe={GOLD} />
        </g>
      );
    case 'olympia':
      return (
        <g>
          <WSky night={night} ground={night ? '#7a8a62' : GRASS} />
          <Tree x={30} y={100} kind="cypress" s={1.6} />
          <Tree x={330} y={100} kind="round" s={1.4} />
          <Box x={92} y={92} w={176} h={7} fill={STONE} />
          <rect x={100} y={38} width={160} height={54} fill={night ? '#4a3a36' : '#6a4a38'} />
          {/* seated Zeus inside the cella */}
          <Box x={150} y={82} w={60} h={10} fill={GOLD} />
          <Shape d="M156 82 V58 Q156 50 164 50 H196 Q204 50 204 58 V82 Z" fill="#8a5a34" />
          <Shape d="M166 82 L168 58 Q180 50 192 58 L194 82 Z" fill="#f2c94c" />
          <Shape d="M168 70 H192 V82 H168 Z" fill="#3f6e9e" />
          <circle cx={180} cy={46} r={7} fill="#f2d9a0" {...LINE} />
          <Shape d="M174 50 Q180 60 186 50 Z" fill="#e8e0d0" thin />
          <path d="M194 62 L206 40" {...line(GOLD, 2)} />
          <path d="M166 64 L156 68" {...line('#f2d9a0', 3)} />
          {[104, 122, 140, 214, 232, 250].map((x) => (
            <g key={x}>
              <Box x={x} y={40} w={7} h={52} fill={MARBLE} thin />
              <Box x={x - 1.4} y={38} w={9.8} h={3} fill={MARBLE} thin />
            </g>
          ))}
          <Box x={96} y={30} w={168} h={8} fill={MARBLE} />
          <Shape d="M92 30 L180 8 L268 30 Z" fill={MARBLE} />
        </g>
      );
    case 'halicarnassus':
      return (
        <g>
          <WSky night={night} ground={night ? '#8a7a62' : SAND} />
          <Tree x={40} y={100} kind="cypress" s={1.6} />
          <Tree x={320} y={100} kind="cypress" s={1.6} />
          <Box x={110} y={64} w={140} h={36} fill={night ? '#c9bfa8' : '#e2d6bc'} />
          <path d="M110 76 H250 M110 88 H250" {...line(STONE_D, 0.8)} />
          <Box x={120} y={58} w={120} h={6} fill={STONE} />
          {Array.from({ length: 9 }, (_, i) => (
            <Box key={i} x={124 + i * 13.4} y={36} w={5} h={22} fill={MARBLE} thin />
          ))}
          <Box x={118} y={31} w={124} h={5} fill={MARBLE} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Box key={i} x={124 + i * 8} y={25 - i * 4.2} w={112 - i * 16} h={4.2} fill={i % 2 ? '#e2d6bc' : STONE} thin />
          ))}
          <Box x={170} y={2} w={20} h={4} fill={GOLD} />
          <Horse x={180} y={4} s={0.4} fill={GOLD} />
          {[[96, 100], [264, 100]].map(([x, y], i) => (
            <g key={i}><Box x={x - 6} y={y - 8} w={12} h={8} fill={STONE} /><Figure x={x} y={y - 8} s={0.9} robe={MARBLE} fill={MARBLE} /></g>
          ))}
        </g>
      );
    case 'babylon':
      return (
        <g>
          <WSky night={night} ground={night ? '#8a7a62' : SAND} />
          <path d="M-2 106 Q90 100 180 106 T362 104 V122 H-2 Z" fill={night ? '#2d5f7c' : '#7fb7c9'} {...LINE} />
          {[0, 1, 2, 3].map((i) => {
            const w = 220 - i * 46;
            const y = 98 - (i + 1) * 20;
            return (
              <g key={i}>
                <Box x={180 - w / 2} y={y} w={w} h={20} fill={['#d9a35f', '#e3b06e', '#ecbf80', '#f3cd92'][i]} />
                {Array.from({ length: Math.floor(w / 12) }, (_, k) => (
                  <path key={`a${k}`} d={`M${180 - w / 2 + 6 + k * 12} ${y + 20} V${y + 12} q3 -4 6 0 V${y + 20}`} fill="#8a5a2b" />
                ))}
                {Array.from({ length: Math.floor(w / 9) }, (_, k) => (
                  <circle key={`l${k}`} cx={180 - w / 2 + 4 + k * 9} cy={y} r={4.4} fill={k % 2 ? LEAF : '#77b052'} {...THIN} />
                ))}
                <path d={`M${180 - w / 2 + 10} ${y + 2} q-3 8 0 14 M${180 + w / 2 - 12} ${y + 2} q3 8 0 14`} {...line(DARKLEAF, 2)} />
              </g>
            );
          })}
          <Tree x={180} y={18} kind="palm" s={1.1} />
          <Tree x={30} y={102} kind="palm" s={1.4} />
          <Tree x={334} y={102} kind="palm" s={1.3} />
        </g>
      );
    case 'petra':
      return (
        <g>
          <WSky night={night} fill="#f3c9a0" ground={night ? '#8a5a4a' : '#d99a76'} />
          {/* the cliff, with the treasury cut into it */}
          <Shape d="M-2 100 V20 Q40 6 90 18 Q130 4 180 14 Q230 2 280 16 Q320 8 362 20 V100 Z" fill={night ? '#9a5a4e' : '#d47f5e'} />
          <Shape d="M110 100 V32 H250 V100 Z" fill={night ? '#b06a58' : '#e8987a'} />
          <Shape d="M120 32 L180 14 L240 32 Z" fill={night ? '#c07a66' : '#f0a888'} />
          <Box x={166} y={18} w={28} h={24} fill={night ? '#c07a66' : '#f0a888'} />
          <Dome cx={180} y={18} r={14} fill={night ? '#c07a66' : '#f0a888'} />
          {[124, 144, 206, 226].map((x) => <Box key={x} x={x} y={34} w={8} h={58} fill={night ? '#c98a74' : '#f6b89a'} thin />)}
          <path d="M162 100 V62 Q180 50 198 62 V100 Z" fill={night ? '#2a1a1a' : '#5a2e22'} {...LINE} />
          <Box x={112} y={60} w={136} h={4} fill={night ? '#c98a74' : '#f6b89a'} thin />
          <Camel x={60} y={112} s={1.1} />
          <Camel x={300} y={112} s={0.9} />
        </g>
      );
    case 'byzantium':
      return (
        <g>
          <WSky night={night} ground={night ? '#7a8a62' : GRASS} />
          <Box x={110} y={60} w={140} h={40} fill={night ? '#c9a678' : '#e8c27c'} />
          <Dome cx={180} y={60} r={46} fill={night ? '#a8865a' : '#c99a55'} />
          <Box x={128} y={44} w={104} h={16} fill={night ? '#c9a678' : '#e8c27c'} />
          <Dome cx={140} y={60} r={18} fill={night ? '#b8966a' : '#dcb46e'} />
          <Dome cx={220} y={60} r={18} fill={night ? '#b8966a' : '#dcb46e'} />
          <path d="M180 14 V6 M176 9 H184" {...line(GOLD, 1.6)} />
          {[[86, 20], [274, 20]].map(([x, top]) => (
            <g key={x}>
              <Box x={x - 4} y={top} w={8} h={80} fill={MARBLE} />
              <Shape d={`M${x - 5} ${top} L${x} ${top - 16} L${x + 5} ${top} Z`} fill={night ? '#5a6a8a' : '#4a6a9a'} />
            </g>
          ))}
          {[150, 170, 190, 210].map((x) => <path key={x} d={`M${x} 100 V84 Q${x + 5} 78 ${x + 10} 84 V100`} fill={night ? '#3a2a20' : '#6a4a38'} />)}
          <Tree x={40} y={102} kind="cypress" s={1.4} />
          <Tree x={326} y={102} kind="cypress" s={1.3} />
        </g>
      );
    case 'rome':
      return (
        <g>
          <WSky night={night} ground={night ? '#8a7a62' : SAND} />
          {/* the Colosseum: three tiers of arches */}
          <Shape d="M60 100 V40 Q180 18 300 40 V100 Z" fill={night ? '#b8a07a' : '#e6d3a8'} />
          <Arches x={70} y={100} w={220} n={11} h={20} fill={night ? '#c9b28a' : '#f0dfb8'} />
          <Arches x={74} y={78} w={212} n={11} h={18} fill={night ? '#c9b28a' : '#f0dfb8'} />
          <Arches x={78} y={58} w={204} n={10} h={16} fill={night ? '#c9b28a' : '#f0dfb8'} />
          <Shape d="M240 40 Q270 44 300 40 V100 H286 V50 Q262 46 240 48 Z" fill={night ? '#8a7656' : '#c9b28a'} />
          <Figure x={34} y={104} s={1.2} robe="#9b3d38" />
          <Tree x={334} y={102} kind="cypress" s={1.5} />
        </g>
      );
    default:
      return <WSky night={night} ground={sand} />;
  }
}
