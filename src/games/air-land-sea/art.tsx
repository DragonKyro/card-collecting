// Air, Land & Sea — hand-drawn SVG art: one unit illustration per base card, a
// scene per Spies, Lies & Supplies theater, theater emblems and banners, the
// Instant / Ongoing glyphs, the card back and the board tokens. Flat fills and
// outlines only (no <defs>, ids, gradients or clip paths), so any number of
// cards can share a page without clashes.
//
// Drawing boxes:
//   - card illustrations  120 × 72 — side-on scenes; aircraft are seen from
//     below (plan view), ships and vehicles from the side, waterline / ground
//     strip near the bottom
//   - theater banners     240 × 44, drawn to be cropped (`slice`) to any width
//   - emblems, glyphs, tokens  24 × 24
//   - card back           100 × 140
// The root <svg> clips to its view box, so scenery may run past the edges.

import type { JSX, ReactNode } from 'react';
import type { AlsCardTemplate, AlsTheaterId } from './types';

const INK = '#1e252b';
const FONT = 'ui-sans-serif, system-ui, sans-serif';

const WHITE = '#fbf8ef';
const CLOUD = '#ffffff';
const GLASS = '#a9d9ee';
const OD = '#6f7d3c';
const OD_DARK = '#4c5726';
const OD_LIGHT = '#8f9c57';
const KHAKI = '#cdb47c';
const CANVAS = '#a39a6a';
const STEEL = '#8d99a5';
const STEEL_DARK = '#5d6975';
const STEEL_LIGHT = '#bcc6cf';
const NAVY_GRAY = '#7c8b99';
const BOOT = '#93392b';
const SEA = '#3c7ca4';
const SEA_DARK = '#2b5e80';
const SEA_DEEP = '#234c69';
const FOAM = '#e8f4fa';
const FIRE = '#f08a24';
const FIRE_HI = '#ffd34d';
const SMOKE = '#c7c1b5';
const SMOKE_DARK = '#8b867d';
const ROUNDEL = '#2b4c8c';
const LEAF = '#5f7c3a';
const WOOD = '#9a6a3a';

/** Theater colours: `main` for bands and numerals, `dark` for silhouettes, `light` for skies. */
export const THEATER_TINT: Record<AlsTheaterId, { main: string; dark: string; light: string }> = {
  air: { main: '#4f9fd1', dark: '#2c6a95', light: '#c6e5f5' },
  land: { main: '#c48a3a', dark: '#875a1d', light: '#f2dfb2' },
  sea: { main: '#2f6f99', dark: '#1d4a69', light: '#cfe7f1' },
  intel: { main: '#7d5cb8', dark: '#4f3880', light: '#d9cdef' },
  diplo: { main: '#c4614a', dark: '#8a3a28', light: '#f2d6c6' },
  econ: { main: '#4a9a68', dark: '#2c6644', light: '#d3ead9' },
};

/** Outline shared by every shape. */
const LINE = { stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
/** Thinner outline for small details. */
const THIN = { stroke: INK, strokeWidth: 0.7, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
/** A detail stroke with no fill. */
const line = (color: string = INK, width = 1.2) =>
  ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

const place = (x: number, y: number, s = 1, r = 0) =>
  `translate(${x} ${y})${r ? ` rotate(${r})` : ''}${s !== 1 ? ` scale(${s})` : ''}`;

// ---------------------------------------------------------------------------
// Entry points

/** The illustration for a card, in the 120 × 72 box. */
export function CardArt({ card }: { card: Pick<AlsCardTemplate, 'ability' | 'theater' | 'strength'> }): JSX.Element {
  return (
    <svg viewBox="0 0 120 72" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {scene(card)}
    </svg>
  );
}

function scene(card: Pick<AlsCardTemplate, 'ability' | 'theater' | 'strength'>): JSX.Element {
  switch (card.ability) {
    case 'support': return <SupportArt />;
    case 'airDrop': return <AirDropArt />;
    case 'maneuver': return <ManeuverArt />;
    case 'aerodrome': return <AerodromeArt />;
    case 'containment': return <ContainmentArt />;
    case 'heavyBombers': return <HeavyBombersArt />;
    case 'reinforce': return <ReinforceArt />;
    case 'ambush': return <AmbushArt />;
    case 'coverFire': return <CoverFireArt />;
    case 'disrupt': return <DisruptArt />;
    case 'escalation': return <EscalationArt />;
    case 'heavyTanks': return <HeavyTanksArt />;
    case 'transport': return <TransportArt />;
    case 'redeploy': return <RedeployArt />;
    case 'blockade': return <BlockadeArt />;
    case 'transportSea': return <InvestigationArt />;
    case 'coverFireSea': return <SalvageArt />;
    case 'superBattleship': return <SuperBattleshipArt />;
    default: break;
  }
  switch (card.theater) {
    case 'intel': return <IntelArt strength={card.strength} />;
    case 'diplo': return <DiploArt strength={card.strength} />;
    case 'econ': return <EconArt strength={card.strength} />;
    case 'air': return <HeavyBombersArt />;
    case 'land': return <HeavyTanksArt />;
    case 'sea': return <SuperBattleshipArt />;
  }
}

// ---------------------------------------------------------------------------
// Small helpers

const STAR_UNIT: [number, number][] = Array.from({ length: 10 }, (_, i) => {
  const a = ((-90 + i * 36) * Math.PI) / 180;
  const r = i % 2 === 0 ? 1 : 0.4;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

function Star({ x, y, r, fill = WHITE, outline = false }: { x: number; y: number; r: number; fill?: string; outline?: boolean }) {
  const pts = STAR_UNIT.map(([px, py]) => `${(x + px * r).toFixed(2)},${(y + py * r).toFixed(2)}`).join(' ');
  return <polygon points={pts} fill={fill} {...(outline ? THIN : {})} />;
}

/** A spiky blast: `points` spikes alternating between r and r × inner. */
function Burst({ x, y, r, fill = FIRE, inner = 0.55, points = 10, rot = 0, outline = true }: {
  x: number; y: number; r: number; fill?: string; inner?: number; points?: number; rot?: number; outline?: boolean;
}) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((rot - 90 + (i * 180) / points) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return <polygon points={pts.join(' ')} fill={fill} {...(outline ? THIN : {})} />;
}

function Cloud({ x, y, s = 1, fill = CLOUD }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s)} fill={fill} opacity={0.95}>
      <ellipse cx={0} cy={2} rx={11} ry={3.6} />
      <circle cx={-4} cy={-0.5} r={4.2} />
      <circle cx={2.5} cy={-1.8} r={5} />
      <circle cx={7} cy={0.6} r={3.2} />
    </g>
  );
}

function Puff({ x, y, s = 1, fill = SMOKE }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s)} fill={fill}>
      <circle cx={0} cy={0} r={4} />
      <circle cx={4} cy={-1.5} r={3.2} />
      <circle cx={-3.5} cy={-2.5} r={2.8} />
      <circle cx={1} cy={-4} r={2.6} />
    </g>
  );
}

/** Scalloped wave crests along y, from x0 to x1. */
function Waves({ y, x0 = -4, x1 = 124, step = 8, amp = 2, color = FOAM, width = 1 }: {
  y: number; x0?: number; x1?: number; step?: number; amp?: number; color?: string; width?: number;
}) {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += step) d += ` q ${step / 2} ${-amp * 2} ${step} 0`;
  return <path d={d} {...line(color, width)} />;
}

/** A stroke drawn twice — ink underneath, colour on top — so it reads on any background. */
function Inked({ d, color = WHITE, width = 2.2 }: { d: string; color?: string; width?: number }) {
  return (
    <g>
      <path d={d} {...line(INK, width + 1.6)} />
      <path d={d} {...line(color, width)} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Backdrops

function AirSky({ clouds = true }: { clouds?: boolean }) {
  return (
    <g>
      <rect width={120} height={72} fill="#bfe1f3" />
      <rect y={0} width={120} height={22} fill="#d4ecf8" />
      <rect y={50} width={120} height={22} fill="#acd6ec" />
      {clouds && (
        <>
          <Cloud x={18} y={60} s={1.3} />
          <Cloud x={102} y={64} s={1.1} />
          <Cloud x={92} y={12} s={0.8} />
        </>
      )}
    </g>
  );
}

function LandSky({ horizon = 54 }: { horizon?: number }) {
  return (
    <g>
      <rect width={120} height={72} fill="#f3e2b6" />
      <rect width={120} height={18} fill="#f7ebcb" />
      <path d={`M-2 ${horizon - 6} C 18 ${horizon - 16} 34 ${horizon - 14} 52 ${horizon - 8} C 70 ${horizon - 2} 88 ${horizon - 18} 122 ${horizon - 10} L122 72 L-2 72 Z`} fill="#d8bf86" />
      <path d={`M-2 ${horizon} C 30 ${horizon - 4} 80 ${horizon - 3} 122 ${horizon + 1} L122 74 L-2 74 Z`} fill="#a98a50" {...LINE} />
    </g>
  );
}

function SeaSky({ waterline = 48 }: { waterline?: number }) {
  return (
    <g>
      <rect width={120} height={72} fill="#cde6f1" />
      <rect width={120} height={16} fill="#e0f0f7" />
      <rect x={-2} y={waterline} width={124} height={76 - waterline} fill={SEA} {...LINE} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Aircraft (plan view, nose toward −y; rotate to aim)

function Roundel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={ROUNDEL} {...THIN} />
      <Star x={x} y={y} r={r * 0.8} />
    </g>
  );
}

function Fighter({ x, y, s = 1, r = 0, fill = OD, plain = false }: { x: number; y: number; s?: number; r?: number; fill?: string; plain?: boolean }) {
  const o = plain ? { stroke: 'none' } : LINE;
  return (
    <g transform={place(x, y, s, r)}>
      <path d="M-7 12 L-1 10.5 L1 10.5 L7 12 L6.5 14.8 L-6.5 14.8 Z" fill={fill} {...o} />
      <path d="M-18 0.5 L-3 -3 L3 -3 L18 0.5 L17.2 4.6 L-17.2 4.6 Z" fill={fill} {...o} />
      <path d="M0 -15 C2.7 -15 3.3 -10 3.1 -4 L2 11 L1 16 L-1 16 L-2 11 L-3.1 -4 C-3.3 -10 -2.7 -15 0 -15 Z" fill={fill} {...o} />
      {!plain && (
        <>
          <ellipse cx={0} cy={-5.5} rx={1.5} ry={3} fill={GLASS} {...THIN} />
          <line x1={-5} y1={-15.6} x2={5} y2={-15.6} {...line(INK, 0.9)} />
          <Roundel x={-11} y={1.8} r={1.9} />
          <Roundel x={11} y={1.8} r={1.9} />
        </>
      )}
    </g>
  );
}

function Bomber({ x, y, s = 1, r = 0, fill = STEEL, plain = false }: { x: number; y: number; s?: number; r?: number; fill?: string; plain?: boolean }) {
  const o = plain ? { stroke: 'none' } : LINE;
  return (
    <g transform={place(x, y, s, r)}>
      <path d="M-10 14 L-1.5 12.5 L1.5 12.5 L10 14 L9.4 17.2 L-9.4 17.2 Z" fill={fill} {...o} />
      <path d="M-28 2 L-3.5 -4 L3.5 -4 L28 2 L27 6.2 L-27 6.2 Z" fill={fill} {...o} />
      {[-17, -8, 8, 17].map((ex) => (
        <ellipse key={ex} cx={ex} cy={-3.2} rx={1.9} ry={4.4} fill={fill} {...(plain ? o : THIN)} />
      ))}
      <path d="M0 -18 C3 -18 3.8 -12 3.6 -4 L2.6 14 L1.2 19.5 L-1.2 19.5 L-2.6 14 L-3.6 -4 C-3.8 -12 -3 -18 0 -18 Z" fill={fill} {...o} />
      {!plain && (
        <>
          <ellipse cx={0} cy={-15} rx={2} ry={2.5} fill={GLASS} {...THIN} />
          {[-17, -8, 8, 17].map((ex) => <line key={ex} x1={ex - 3} y1={-7.8} x2={ex + 3} y2={-7.8} {...line(INK, 0.8)} />)}
          <Roundel x={-21} y={3.6} r={1.8} />
          <Roundel x={21} y={3.6} r={1.8} />
        </>
      )}
    </g>
  );
}

function CargoPlane({ x, y, s = 1, r = 0, fill = OD_LIGHT }: { x: number; y: number; s?: number; r?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s, r)}>
      <path d="M-9 13 L-1.5 11.5 L1.5 11.5 L9 13 C9.5 15 8.5 16 7 16 L-7 16 C-8.5 16 -9.5 15 -9 13 Z" fill={fill} {...LINE} />
      <path d="M-27 1 C-27 -1 -24 -2 -20 -2 L20 -2 C24 -2 27 -1 27 1 L26 4.6 C25 5.6 23 5.6 20 5.4 L-20 5.4 C-23 5.6 -25 5.6 -26 4.6 Z" fill={fill} {...LINE} />
      {[-9, 9].map((ex) => <ellipse key={ex} cx={ex} cy={-2.6} rx={2.1} ry={4.8} fill={fill} {...THIN} />)}
      <path d="M0 -17 C3.4 -17 4 -11 4 -4 L2.6 12 L1.2 17.5 L-1.2 17.5 L-2.6 12 L-4 -4 C-4 -11 -3.4 -17 0 -17 Z" fill={fill} {...LINE} />
      <ellipse cx={0} cy={-13.5} rx={2.2} ry={2.4} fill={GLASS} {...THIN} />
      {[-9, 9].map((ex) => <line key={ex} x1={ex - 3.2} y1={-7.6} x2={ex + 3.2} y2={-7.6} {...line(INK, 0.8)} />)}
      <Star x={-18} y={1.7} r={2.4} />
      <Star x={18} y={1.7} r={2.4} />
    </g>
  );
}

/** A small prop plane in side view, facing right. */
function PlaneSide({ x, y, s = 1, fill = OD_LIGHT }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s)}>
      <line x1={4} y1={2} x2={5.5} y2={7} {...line(INK, 1)} />
      <circle cx={5.5} cy={7.6} r={1.8} fill="#2b2b26" {...THIN} />
      <circle cx={-15} cy={2.6} r={0.9} fill="#2b2b26" />
      <path d="M-15 -1.5 L-19 -10 L-14 -10 L-9 -3 Z" fill={fill} {...LINE} />
      <path d="M-18 -1 C-18 -3 -14 -4 -8 -4 L10 -4.5 C14 -4.5 17 -2.4 17 0 C17 2 14 3 10 3 L-8 2 C-13 2 -18 1 -18 -1 Z" fill={fill} {...LINE} />
      <path d="M2 -4.4 C3 -8.4 9 -8.4 10 -4.5 Z" fill={GLASS} {...THIN} />
      <ellipse cx={3} cy={0.6} rx={9} ry={1.9} fill={OD} {...THIN} />
      <ellipse cx={18.2} cy={-0.5} rx={1} ry={6} fill="#e6e1d2" opacity={0.8} />
      <circle cx={17.6} cy={-0.5} r={1.1} fill={INK} />
      <Star x={-5} y={-0.8} r={2.2} />
    </g>
  );
}

function Parachute({ x, y, s = 1, fill = WHITE }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s)}>
      <path d="M-7 0 L0 9.5 M0 0 L0 9.5 M7 0 L0 9.5" {...line(INK, 0.6)} />
      <path d="M-7.5 0 C-7.5 -9 7.5 -9 7.5 0 Q 3.75 -1.8 0 0 Q -3.75 -1.8 -7.5 0 Z" fill={fill} {...THIN} />
      <path d="M0 -6.8 L0 -0.2" {...line(INK, 0.5)} />
      <circle cx={0} cy={10.8} r={1.4} fill={OD_DARK} />
      <path d="M0 12 L0 15 M-1.6 13 L1.6 13 M0 15 L-1.2 17.5 M0 15 L1.2 17.5" {...line(OD_DARK, 1)} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Ground vehicles (side view, facing right; `flip` faces left)

function Tank({ x, y, s = 1, fill = OD, flip = false, plain = false }: { x: number; y: number; s?: number; fill?: string; flip?: boolean; plain?: boolean }) {
  const o = plain ? { stroke: 'none' } : LINE;
  const t = o === LINE ? THIN : o;
  return (
    <g transform={`${place(x, y, s)}${flip ? ' scale(-1 1)' : ''}`}>
      <rect x={10} y={-10.4} width={26} height={2.8} fill={plain ? fill : OD_DARK} {...t} />
      <rect x={34} y={-11.2} width={3.6} height={4.4} fill={plain ? fill : OD_DARK} {...t} />
      <rect x={-27} y={3} width={54} height={13} rx={6.5} fill={plain ? fill : '#3c4321'} {...o} />
      {!plain && [-19, -10, -1, 8, 17].map((wx) => (
        <g key={wx}>
          <circle cx={wx} cy={9.6} r={4.3} fill={OD_LIGHT} {...THIN} />
          <circle cx={wx} cy={9.6} r={1.4} fill={OD_DARK} />
        </g>
      ))}
      <path d="M-29 4 L-25 -3 L23 -3 L30 4 Z" fill={fill} {...o} />
      <path d="M-13 -3 L-11 -11 C-9 -14.5 6 -14.5 9 -11 L12 -3 Z" fill={fill} {...o} />
      {!plain && (
        <>
          <rect x={-6} y={-16} width={7} height={2.6} rx={1.2} fill={OD_DARK} {...THIN} />
          <Star x={-1} y={-7} r={3.2} />
          <line x1={-25} y1={0.5} x2={26} y2={0.5} {...line(OD_DARK, 0.8)} />
        </>
      )}
    </g>
  );
}

function Truck({ x, y, s = 1, fill = OD, cargo = 'canvas' }: { x: number; y: number; s?: number; fill?: string; cargo?: 'canvas' | 'rails' }) {
  return (
    <g transform={place(x, y, s)}>
      <rect x={-27} y={3} width={54} height={3.4} fill="#2f3220" {...THIN} />
      {cargo === 'canvas' ? (
        <>
          <path d="M-27 4 L-27 -11 C-27 -15.5 -23 -16.5 -18 -16.5 L3 -16.5 C7.5 -16.5 9 -14.5 9 -11 L9 4 Z" fill={CANVAS} {...LINE} />
          {[-18, -9, 0].map((rx) => <line key={rx} x1={rx} y1={-16} x2={rx} y2={3.5} {...line('#7e7650', 1)} />)}
          <Star x={-9} y={-6} r={4.4} />
        </>
      ) : (
        <rect x={-27} y={-4} width={36} height={8} fill={fill} {...LINE} />
      )}
      <path d="M10 4 L10 -10 L18 -10 L23 -3 L28 -2 L28 4 Z" fill={fill} {...LINE} />
      <path d="M12 -8 L17.4 -8 L21 -3.6 L12 -3.6 Z" fill={GLASS} {...THIN} />
      {[-18, -8, 19].map((wx) => (
        <g key={wx}>
          <circle cx={wx} cy={8} r={5} fill="#2b2b26" {...THIN} />
          <circle cx={wx} cy={8} r={2} fill={STEEL} />
        </g>
      ))}
    </g>
  );
}

function Helmet({ x, y, s = 1, fill = OD }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s)}>
      <path d="M-6 0 C-6 -7.6 6 -7.6 6 0 Z" fill={fill} {...LINE} />
      <path d="M-7.6 0.2 L7.6 0.2" {...line(INK, 1.6)} />
      <path d="M-4 -3.4 L4 -3.4" {...line(OD_DARK, 0.7)} />
    </g>
  );
}

function Bush({ x, y, s = 1, fill = LEAF }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s)} fill={fill} {...THIN}>
      <circle cx={-6} cy={0} r={5.5} />
      <circle cx={5} cy={0.5} r={5.8} />
      <circle cx={0} cy={-4} r={6.4} />
    </g>
  );
}

function Crate({ x, y, w = 12, h = 9, fill = KHAKI }: { x: number; y: number; w?: number; h?: number; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} {...LINE} />
      <path d={`M${x} ${y} L${x + w} ${y + h} M${x + w} ${y} L${x} ${y + h}`} {...line('#8c7646', 0.8)} />
      <rect x={x + 1.4} y={y + 1.4} width={w - 2.8} height={h - 2.8} {...line('#8c7646', 0.8)} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Ships (side view, facing right, waterline at y = 0)

function Battleship({ x, y, s = 1, fill = NAVY_GRAY }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={place(x, y, s)}>
      <Puff x={-22} y={-28} s={0.9} fill={SMOKE} />
      <Puff x={-32} y={-31} s={0.7} fill={SMOKE} />
      <path d="M1 -30 L1 -40 M-3 -36 L5 -36" {...line(INK, 0.9)} />
      <path d="M-46 -7 L-60 -7 M-46 -9 L-60 -9" {...line(STEEL_DARK, 1.4)} />
      <path d="M31 -10 L47 -10 M31 -8 L47 -8" {...line(STEEL_DARK, 1.4)} />
      <path d="M20 -13 L36 -13.5 M20 -11.5 L36 -12" {...line(STEEL_DARK, 1.4)} />
      <path d="M-54 -6 L44 -6 L57 -12 L52 0 L50 3 L-50 3 L-53 0 Z" fill={fill} {...LINE} />
      <path d="M-52.4 0 L52 0 L50.6 3 L-50 3 Z" fill={BOOT} {...THIN} />
      <path d="M-14 -6 L-14 -15 L10 -15 L10 -6 Z" fill={STEEL_LIGHT} {...LINE} />
      <path d="M-4 -15 L-3 -26 L5 -26 L6 -15 Z" fill={STEEL_LIGHT} {...LINE} />
      <path d="M-6 -26 L8 -26 L7 -30 L-5 -30 Z" fill={STEEL} {...THIN} />
      <rect x={-2} y={-24} width={6} height={2} fill={GLASS} />
      <path d="M-22 -6 L-21 -21 L-14 -21 L-14 -6 Z" fill={STEEL} {...LINE} />
      <rect x={-22} y={-23} width={8.4} height={2.4} fill={INK} />
      <path d="M8 -6 L8 -10.5 L19 -10.5 L19 -6 Z" fill={fill} {...THIN} />
      <path d="M7 -10.5 L8 -14.5 L18 -14.5 L20 -10.5 Z" fill={STEEL} {...THIN} />
      <path d="M21 -6 L22 -10 L31 -10 L33 -6 Z" fill={STEEL} {...THIN} />
      <path d="M-46 -6 L-45 -10 L-35 -10 L-33 -6 Z" fill={STEEL} {...THIN} />
      {[-40, -32, -24, -6, 2, 14, 26, 36].map((px) => <circle key={px} cx={px} cy={-2.6} r={0.8} fill={INK} />)}
      <path d="M-53 -6 L-53 -12 M-53 -12 L-49 -11 L-53 -10 Z" fill="#c8452f" stroke={INK} strokeWidth={0.6} />
    </g>
  );
}

function Destroyer({ x, y, s = 1, fill = NAVY_GRAY, plain = false }: { x: number; y: number; s?: number; fill?: string; plain?: boolean }) {
  const o = plain ? { stroke: 'none' } : LINE;
  const t = plain ? { stroke: 'none' } : THIN;
  return (
    <g transform={place(x, y, s)}>
      <path d="M8 -15 L8 -23 M5 -20 L11 -20" {...line(plain ? fill : INK, plain ? 1.6 : 0.8)} />
      <path d="M22 -6 L31 -6.4 M-30 -6 L-38 -6.4" {...line(plain ? fill : STEEL_DARK, 1.4)} />
      <path d="M-36 -4 L30 -4 L39 -8.5 L35 0 L34 2 L-33 2 L-35 0 Z" fill={fill} {...o} />
      {!plain && <path d="M-35 0 L35 0 L34 2 L-33 2 Z" fill={BOOT} {...THIN} />}
      <path d="M2 -4 L2 -10 L13 -10 L13 -4 Z" fill={plain ? fill : STEEL_LIGHT} {...o} />
      <path d="M4 -10 L5 -15 L11 -15 L12 -10 Z" fill={plain ? fill : STEEL_LIGHT} {...t} />
      <path d="M-10 -4 L-9 -13 L-4.6 -13 L-4.6 -4 Z" fill={plain ? fill : STEEL} {...t} />
      <path d="M-18 -4 L-17 -12 L-12.6 -12 L-12.6 -4 Z" fill={plain ? fill : STEEL} {...t} />
      <path d="M14 -4 L15 -7.4 L22 -7.4 L23 -4 Z" fill={plain ? fill : STEEL} {...t} />
      <path d="M-30 -4 L-29 -7.4 L-22 -7.4 L-21 -4 Z" fill={plain ? fill : STEEL} {...t} />
    </g>
  );
}

function Submarine({ x, y, s = 1, ghost = SEA_DARK }: { x: number; y: number; s?: number; ghost?: string }) {
  return (
    <g transform={place(x, y, s)}>
      <path d="M-44 2 C-44 -2 -34 -3.5 -20 -3.5 L32 -3.5 C42 -3.5 48 -0.5 48 2 C48 5 42 7.5 32 7.5 L-20 7.5 C-34 7.5 -44 6 -44 2 Z" fill={ghost} />
      <path d="M-38 0 L-35 -3 L36 -3 L41 0 Z" fill={STEEL_DARK} {...LINE} />
      <path d="M-8 -3 L-6 -14 L8 -14 L11 -3 Z" fill={STEEL_DARK} {...LINE} />
      <path d="M2 -14 L2 -22 L5.5 -22" {...line(INK, 1.1)} />
      <path d="M16 -3 L17 -6 L22 -6 L22 -3 Z M22 -5 L28 -5.6" fill={STEEL} {...THIN} />
      <rect x={-4} y={-11} width={9} height={1.6} fill={INK} opacity={0.6} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Air scenes

function Chevrons({ x, y, dir }: { x: number; y: number; dir: 1 | -1 }) {
  const d = (ox: number) => `M${x + ox - 3 * dir} ${y - 5} L${x + ox + 3 * dir} ${y} L${x + ox - 3 * dir} ${y + 5}`;
  return (
    <g>
      <Inked d={d(0)} color={FIRE_HI} width={2} />
      <Inked d={d(6 * dir)} color={FIRE_HI} width={2} />
    </g>
  );
}

function SupportArt() {
  return (
    <g>
      <AirSky />
      <Chevrons x={9} y={38} dir={-1} />
      <Chevrons x={111} y={38} dir={1} />
      <Fighter x={36} y={50} s={0.72} />
      <Fighter x={84} y={50} s={0.72} />
      <Fighter x={60} y={28} s={1.02} />
    </g>
  );
}

function AirDropArt() {
  return (
    <g>
      <AirSky clouds={false} />
      <Cloud x={100} y={14} s={0.9} />
      <path d="M-2 64 C 30 60 80 61 122 63 L122 74 L-2 74 Z" fill="#9fb86a" {...LINE} />
      <Bush x={16} y={64} s={0.5} />
      <Bush x={104} y={64} s={0.55} />
      <Parachute x={56} y={30} s={1} />
      <Parachute x={78} y={42} s={1.15} fill={KHAKI} />
      <Parachute x={98} y={28} s={0.9} />
      <Parachute x={64} y={52} s={0.8} fill={KHAKI} />
      <CargoPlane x={28} y={22} s={0.66} r={68} />
    </g>
  );
}

function ManeuverArt() {
  return (
    <g>
      <AirSky />
      <Inked d="M-2 64 C 22 62 40 48 36 34 C 32 20 14 24 18 36 C 22 48 46 50 62 42 C 76 35 84 26 92 22" color={WHITE} width={2.4} />
      <Fighter x={100} y={18} s={0.95} r={64} />
    </g>
  );
}

function AerodromeArt() {
  return (
    <g>
      <AirSky clouds={false} />
      <Cloud x={70} y={14} s={0.9} />
      <rect x={-2} y={52} width={124} height={22} fill="#9db06a" {...LINE} />
      <rect x={-2} y={59} width={124} height={9} fill="#7a7f84" {...LINE} />
      <path d="M2 63.5 L122 63.5" stroke={WHITE} strokeWidth={1.2} strokeDasharray="6 5" />
      <path d="M4 52 L4 41 C4 25 42 25 42 41 L42 52 Z" fill={STEEL_LIGHT} {...LINE} />
      {[13, 23, 33].map((rx) => <path key={rx} d={`M${rx} ${rx === 23 ? 29.5 : 31.5} L${rx} 52`} {...line(STEEL, 1)} />)}
      <rect x={12} y={39} width={22} height={13} fill="#3d454c" {...THIN} />
      <rect x={93} y={30} width={13} height={22} fill={KHAKI} {...LINE} />
      <rect x={89} y={21} width={21} height={9} fill={GLASS} {...LINE} />
      <path d="M96 21 L96 30 M103 21 L103 30" {...line(INK, 0.8)} />
      <rect x={87.5} y={18.5} width={24} height={3} fill={STEEL_DARK} {...THIN} />
      <path d="M115 52 L115 28" {...line(INK, 1.2)} />
      <path d="M115 28.5 L124 30 L124 33.5 L115 35 Z" fill={FIRE} {...THIN} />
      <path d="M119 29.3 L119 34.3" {...line(WHITE, 1.4)} />
      <PlaneSide x={64} y={55} s={0.95} />
    </g>
  );
}

function ContainmentArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#2b3555" />
      <rect width={120} height={20} fill="#232b47" />
      {[[10, 8], [30, 14], [74, 6], [104, 12], [114, 30], [6, 30]].map(([sx, sy]) => (
        <circle key={`${sx}-${sy}`} cx={sx} cy={sy} r={0.7} fill="#e8e3c8" />
      ))}
      <polygon points="24,64 50,-2 66,-2" fill="#fff2a8" opacity={0.32} />
      <polygon points="98,64 46,-2 62,-2" fill="#fff2a8" opacity={0.32} />
      <Bomber x={57} y={20} s={0.42} r={90} fill="#9aa4bb" />
      <Burst x={30} y={24} r={5} fill="#4b4b52" inner={0.6} />
      <Burst x={30} y={24} r={2.2} fill={FIRE} inner={0.5} outline={false} />
      <Burst x={86} y={14} r={4.4} fill="#4b4b52" inner={0.6} rot={12} />
      <Burst x={86} y={14} r={2} fill={FIRE} inner={0.5} outline={false} />
      <Burst x={80} y={38} r={4} fill="#4b4b52" inner={0.6} rot={20} />
      <Burst x={80} y={38} r={1.8} fill={FIRE} inner={0.5} outline={false} />
      <path d="M-2 62 C 20 58 40 60 60 62 C 80 64 100 58 122 60 L122 74 L-2 74 Z" fill="#171c2c" />
      <g stroke="#56607a" strokeWidth={0.8} fill="none">
        {[4, 18, 32, 46, 60, 74, 88, 102, 116].map((px) => <path key={px} d={`M${px} 70 L${px} 62`} />)}
        <path d="M0 64 L4 66 L8 64 L12 66 L16 64 L20 66 L24 64 L28 66 L32 64 L36 66 L40 64 L44 66 L48 64 L52 66 L56 64 L60 66 L64 64 L68 66 L72 64 L76 66 L80 64 L84 66 L88 64 L92 66 L96 64 L100 66 L104 64 L108 66 L112 64 L116 66 L120 64" />
      </g>
      <circle cx={24} cy={63} r={3.2} fill={STEEL} {...THIN} />
      <circle cx={98} cy={63} r={3.2} fill={STEEL} {...THIN} />
    </g>
  );
}

function HeavyBombersArt() {
  return (
    <g>
      <AirSky clouds={false} />
      <Cloud x={14} y={66} s={1.5} />
      <Cloud x={64} y={70} s={1.3} />
      <Cloud x={108} y={64} s={1.4} />
      <Bomber x={20} y={50} s={0.58} />
      <Bomber x={100} y={50} s={0.58} />
      <Bomber x={60} y={30} s={1.04} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Land scenes

function ReinforceArt() {
  return (
    <g>
      <LandSky horizon={56} />
      <Puff x={26} y={57} s={1} fill="#e2cf9c" />
      <Puff x={16} y={54} s={0.7} fill="#e8d8ab" />
      <Truck x={70} y={50} s={1.05} />
      <Crate x={2} y={50} w={13} h={10} />
      <Crate x={9} y={40} w={11} h={10} />
      <Crate x={104} y={53} w={12} h={9} fill="#b49c62" />
    </g>
  );
}

function AmbushArt() {
  return (
    <g>
      <LandSky horizon={50} />
      <Tank x={92} y={36} s={0.36} fill="#857f69" flip />
      <path d="M-2 58 C 30 54 70 56 122 58 L122 74 L-2 74 Z" fill="#8f7440" {...LINE} />
      <Helmet x={22} y={56} s={1.05} />
      <Helmet x={44} y={55} s={1.05} fill={OD_LIGHT} />
      <path d="M48 53 L70 47" {...line(INK, 1.8)} />
      <path d="M48 53 L56 51" {...line(WOOD, 2.6)} />
      {[6, 18, 30, 42, 54].map((bx) => <ellipse key={bx} cx={bx} cy={62} rx={6.8} ry={3.8} fill={KHAKI} {...THIN} />)}
      {[12, 24, 36, 48].map((bx) => <ellipse key={bx} cx={bx} cy={67} rx={6.8} ry={3.8} fill="#bba26a" {...THIN} />)}
      <Bush x={86} y={64} s={1.2} />
      <Bush x={108} y={62} s={1.05} fill="#6c8a42" />
      <Bush x={70} y={70} s={0.9} fill="#56723a" />
    </g>
  );
}

function CoverFireArt() {
  return (
    <g>
      <LandSky horizon={54} />
      <path d="M72 30 C 86 14 100 16 110 38" fill="none" stroke={INK} strokeWidth={0.9} strokeDasharray="2.5 2.5" />
      <Burst x={110} y={44} r={6} fill={FIRE} inner={0.5} />
      <Burst x={110} y={44} r={3} fill={FIRE_HI} inner={0.5} outline={false} />
      <Puff x={104} y={38} s={0.7} fill={SMOKE_DARK} />
      <g transform={place(40, 55)}>
        <path d="M-2 4 L-26 10" {...line(INK, 3.6)} />
        <path d="M-2 4 L-26 10" {...line(OD_DARK, 2)} />
        <g transform="rotate(-24)">
          <rect x={0} y={-8} width={30} height={3.6} fill={OD_DARK} {...THIN} />
          <rect x={27} y={-8.6} width={4.4} height={4.8} fill={OD_DARK} {...THIN} />
          <rect x={-6} y={-10} width={12} height={7} rx={2} fill={OD} {...THIN} />
        </g>
        <path d="M-3 -10 L9 -12 L10 2 L-2 4 Z" fill={OD} {...LINE} />
        <circle cx={0} cy={4} r={8} fill="#3c4321" {...LINE} />
        <circle cx={0} cy={4} r={5.2} fill={OD_LIGHT} {...THIN} />
        <path d="M0 -1.2 L0 9.2 M-5.2 4 L5.2 4 M-3.7 0.3 L3.7 7.7 M3.7 0.3 L-3.7 7.7" {...line(OD_DARK, 0.7)} />
        <circle cx={0} cy={4} r={1.4} fill={OD_DARK} />
      </g>
      <Burst x={73} y={30} r={6.5} fill={FIRE} inner={0.45} rot={8} />
      <Burst x={73} y={30} r={3.4} fill={FIRE_HI} inner={0.5} outline={false} />
      <Puff x={62} y={34} s={0.9} />
      <Puff x={52} y={38} s={0.7} fill="#ddd7cb" />
      <Helmet x={20} y={53} s={0.9} />
    </g>
  );
}

function DisruptArt() {
  return (
    <g>
      <LandSky horizon={50} />
      <rect x={-2} y={56} width={124} height={18} fill="#5d8fae" {...LINE} />
      <Waves y={63} color="#a9cde2" step={10} amp={1.2} />
      <rect x={16} y={47} width={10} height={14} fill="#9a8f7d" {...LINE} />
      <rect x={92} y={47} width={10} height={14} fill="#9a8f7d" {...LINE} />
      <rect x={-2} y={43} width={124} height={4.6} fill={STEEL_DARK} {...LINE} />
      <path d="M-2 33 L122 33" {...line(STEEL_DARK, 2.2)} />
      <path d="M-2 43 L6 33 L14 43 L22 33 L30 43 L38 33 L46 43 L54 33 L62 43 L70 33 L78 43 L86 33 L94 43 L102 33 L110 43 L118 33 L126 43" {...line(STEEL_DARK, 1.6)} />
      <Puff x={52} y={18} s={1.4} fill={SMOKE_DARK} />
      <Puff x={66} y={14} s={1.2} fill={SMOKE} />
      <Burst x={60} y={38} r={17} fill={FIRE} inner={0.55} points={12} />
      <Burst x={60} y={38} r={9} fill={FIRE_HI} inner={0.55} points={9} rot={10} outline={false} />
      {[[38, 24, 30], [82, 22, -24], [44, 50, 60], [80, 52, -40]].map(([dx, dy, r]) => (
        <rect key={`${dx}`} x={dx - 2.4} y={dy - 1.2} width={4.8} height={2.4} fill={STEEL_DARK} transform={`rotate(${r} ${dx} ${dy})`} {...THIN} />
      ))}
      <path d="M22 66 C 38 72 50 66 56 50" {...line('#b83a2a', 1)} />
      <rect x={4} y={60} width={18} height={10} fill={WOOD} {...LINE} />
      <path d="M13 60 L13 52 M8 52 L18 52" {...line(INK, 2)} />
      <path d="M8 52 L18 52" {...line('#cfc9b8', 1)} />
    </g>
  );
}

function Rocket({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={place(x, y, 1, r)}>
      <path d="M-16 0 L-7 0" {...line('#efe9dc', 3)} />
      <polygon points="-7,-1.6 -12,0 -7,1.6" fill={FIRE} />
      <rect x={-7} y={-1.6} width={11} height={3.2} rx={1.2} fill={STEEL_LIGHT} {...THIN} />
      <path d="M4 -1.6 L7 0 L4 1.6 Z" fill={BOOT} {...THIN} />
    </g>
  );
}

function EscalationArt() {
  return (
    <g>
      <LandSky horizon={56} />
      <path d="M44 38 C 60 30 70 26 76 22" {...line('#efe9dc', 2.4)} />
      <path d="M44 38 C 64 28 82 16 96 10" {...line('#efe9dc', 2)} />
      <Puff x={50} y={36} s={0.9} />
      <Puff x={40} y={42} s={1.1} fill="#ddd7cb" />
      <Rocket x={78} y={21} r={-28} />
      <Rocket x={98} y={9} r={-30} />
      <Rocket x={112} y={30} r={-18} />
      <g transform={place(40, 50)}>
        <path d="M-24 -2 L4 -16 L8 -12 L-20 2 Z" fill={OD_DARK} {...LINE} />
        <path d="M-22 -5 L5 -18 M-22 -1 L6 -14" {...line(STEEL, 0.9)} />
        <path d="M-12 -2 L-12 -6 M-2 -2 L-2 -10" {...line(INK, 1.4)} />
      </g>
      <Truck x={40} y={50} s={1} cargo="rails" />
    </g>
  );
}

function HeavyTanksArt() {
  return (
    <g>
      <LandSky horizon={58} />
      <Puff x={10} y={56} s={1.1} fill="#e2cf9c" />
      <Tank x={26} y={45} s={0.6} fill="#8d9662" />
      <Puff x={42} y={62} s={1.2} fill="#e6d4a4" />
      <Tank x={72} y={50} s={1.05} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sea scenes

function TransportArt() {
  return (
    <g>
      <SeaSky waterline={44} />
      <g transform={place(30, 44, 0.72)} fill="#93a1ad">
        <path d="M-34 -6 L28 -6 L35 -11 L31 2 L-31 2 Z" {...THIN} />
        <path d="M-20 -6 L-20 -14 L8 -14 L8 -6 Z M-12 -14 L-12 -20 L2 -20 L2 -14 Z" {...THIN} />
        <path d="M-26 -6 L-26 -24 M18 -6 L18 -22 M-26 -18 L-18 -8 M18 -16 L10 -8" {...line(INK, 0.7)} />
        {[-28, -22, -16, -10, -4, 2, 8, 14, 20].map((px) => <circle key={px} cx={px} cy={-2.4} r={0.8} fill={INK} />)}
      </g>
      <Waves y={50} color="#7fb2d1" step={12} amp={1.2} />
      <path d="M40 60 L58 58 M36 64 L58 62 M44 68 L60 66" {...line(FOAM, 1.2)} />
      <g transform={place(80, 60, 1.15)}>
        <Helmet x={-12} y={-7} s={0.55} />
        <Helmet x={-5} y={-7.2} s={0.55} fill={OD_LIGHT} />
        <Helmet x={2} y={-7} s={0.55} />
        <Helmet x={-17.5} y={-9.5} s={0.55} fill={OD_LIGHT} />
        <path d="M-21 -7 L13 -7 L13 3 L-18 3 L-22 -2 Z" fill="#7f8f6a" {...LINE} />
        <path d="M13 -9.5 L18.5 -8.5 L18.5 3 L13 3 Z" fill="#65744f" {...LINE} />
        <path d="M-19 -3 L12 -3" {...line('#65744f', 0.8)} />
        <path d="M19 -4 C 24 -6 27 -3 28 0 M19 0 C 23 -1 26 1 27 3" {...line(FOAM, 1.3)} />
      </g>
      <Waves y={64} color={FOAM} step={10} amp={1} x0={60} x1={124} />
    </g>
  );
}

function RedeployArt() {
  return (
    <g>
      <SeaSky waterline={38} />
      <rect x={-2} y={58} width={124} height={16} fill={SEA_DARK} />
      <Submarine x={60} y={38} s={1.05} />
      <Waves y={38} color={FOAM} step={9} amp={1} x0={-6} x1={20} />
      <Waves y={38} color={FOAM} step={9} amp={1} x0={100} x1={126} />
      {[[22, 50, 1.6], [28, 46, 1.1], [16, 56, 1.2], [96, 54, 1.4], [104, 49, 1]].map(([bx, by, br]) => (
        <circle key={`${bx}-${by}`} cx={bx} cy={by} r={br} {...line(FOAM, 0.8)} />
      ))}
      <Inked d="M84 64 C 70 70 46 70 34 62 M38 60 L33 62.5 L37 66.5" color={FIRE_HI} width={1.8} />
    </g>
  );
}

function Mine({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y + 4} L${x} ${y + 14}`} {...line(INK, 0.8)} />
      {[0, 60, 120, 180, 240, 300].map((a) => {
        const rad = (a * Math.PI) / 180;
        return <line key={a} x1={x} y1={y} x2={x + Math.cos(rad) * 7} y2={y + Math.sin(rad) * 7} {...line(INK, 1.4)} />;
      })}
      <circle cx={x} cy={y} r={4.8} fill="#3b3f45" {...THIN} />
      <circle cx={x - 1.6} cy={y - 1.6} r={1.1} fill="#6b7178" />
      <rect x={x - 9} y={y + 1.2} width={18} height={6} fill={SEA} />
      <Waves y={y + 1.6} x0={x - 9} x1={x + 9} step={6} amp={0.8} color={FOAM} width={0.9} />
    </g>
  );
}

function BlockadeArt() {
  return (
    <g>
      <SeaSky waterline={42} />
      <Destroyer x={62} y={42} s={1} />
      <Waves y={49} color="#7fb2d1" step={12} amp={1.2} />
      <path d="M-2 56 C 20 60 40 58 60 60 C 80 62 100 58 122 56" {...line('#2b3138', 0.9)} />
      <Mine x={14} y={55} />
      <Mine x={44} y={58} />
      <Mine x={76} y={60} />
      <Mine x={106} y={56} />
    </g>
  );
}

function InvestigationArt() {
  return (
    <g>
      <SeaSky waterline={30} />
      <rect x={-2} y={54} width={124} height={20} fill={SEA_DARK} />
      <rect x={-2} y={64} width={124} height={10} fill={SEA_DEEP} />
      {[10, 18, 26].map((rr) => (
        <path key={rr} d={`M${54 - rr} ${34} A ${rr} ${rr * 0.75} 0 0 0 ${54 + rr} 34`} fill="none" stroke={FOAM} strokeWidth={1} strokeDasharray="3 2.4" opacity={0.85} />
      ))}
      <g transform={place(92, 60, 0.42)}>
        <path d="M-44 2 C-44 -2 -34 -3.5 -20 -3.5 L32 -3.5 C42 -3.5 48 -0.5 48 2 C48 5 42 7.5 32 7.5 L-20 7.5 C-34 7.5 -44 6 -44 2 Z" fill="#18394f" />
        <path d="M-8 -3 L-6 -12 L8 -12 L11 -3 Z" fill="#18394f" />
      </g>
      <circle cx={92} cy={58} r={6} {...line(FIRE_HI, 1)} />
      <circle cx={92} cy={58} r={1.4} fill={FIRE_HI} />
      <Destroyer x={56} y={30} s={0.88} />
      <Waves y={30} color={FOAM} step={9} amp={1} x0={-6} x1={20} />
    </g>
  );
}

function SalvageArt() {
  return (
    <g>
      <SeaSky waterline={46} />
      <path d="M104 10 Q 106 8 108 10 Q 110 8 112 10" {...line(INK, 0.9)} />
      <path d="M92 18 Q 93.5 16.5 95 18 Q 96.5 16.5 98 18" {...line(INK, 0.8)} />
      <path d="M26 41 L26 14 M26 18 L80 10" {...line(INK, 2.6)} />
      <path d="M26 41 L26 14 M26 18 L80 10" {...line(FIRE, 1.4)} />
      <path d="M26 30 L80 10" {...line(INK, 0.6)} />
      <path d="M80 10 L80 34" {...line(INK, 0.7)} />
      <path d="M78 34 C 78 36.5 82 36.5 82 34" {...line(INK, 1)} />
      <path d="M80 35.5 L74 39 M80 35.5 L86 39" {...line(INK, 0.6)} />
      <Crate x={72} y={38} w={16} h={11} fill="#b49c62" />
      <path d="M74 50 L74 53 M80 50 L80 54 M86 50 L86 52.5" {...line(FOAM, 1)} />
      <ellipse cx={80} cy={53} rx={11} ry={2} {...line(FOAM, 1)} />
      <ellipse cx={80} cy={53} rx={17} ry={3.2} {...line('#9cc6de', 0.9)} />
      <g transform={place(30, 46)}>
        <path d="M-30 -5 L24 -5 L31 -9 L28 2 L-28 2 Z" fill="#a7543d" {...LINE} />
        <path d="M-29 0 L29 0 L28 2 L-28 2 Z" fill={INK} opacity={0.4} />
        <path d="M6 -5 L6 -13 L18 -13 L19 -5 Z" fill={WHITE} {...LINE} />
        <rect x={8} y={-11.5} width={9} height={2.4} fill={GLASS} {...THIN} />
        <path d="M10 -13 L10 -18 L13 -18 L13 -13 Z" fill={INK} />
      </g>
      <Waves y={52} color="#7fb2d1" step={12} amp={1.2} x0={-6} x1={64} />
      <Waves y={62} color={FOAM} step={10} amp={1} />
    </g>
  );
}

function SuperBattleshipArt() {
  return (
    <g>
      <SeaSky waterline={52} />
      <path d="M100 12 Q 102 10 104 12 Q 106 10 108 12" {...line(INK, 0.9)} />
      <Battleship x={58} y={52} s={1} />
      <path d="M108 46 C 112 48 116 50 118 54 M106 50 C 110 52 114 54 116 58" {...line(FOAM, 1.4)} />
      <Waves y={56} color={FOAM} step={9} amp={1.1} />
      <Waves y={65} color="#7fb2d1" step={12} amp={1.2} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Spies, Lies & Supplies scenes (one per theater; details vary with strength)

function IntelArt({ strength }: { strength: number }) {
  const lit = (i: number) => ((i * 7 + strength * 3) % 5) < 2;
  const windows: ReactNode[] = [];
  const blocks: [number, number, number][] = [[62, 34, 16], [80, 24, 14], [96, 40, 12], [108, 30, 14], [-2, 44, 14]];
  blocks.forEach(([bx, by, bw], bi) => {
    for (let wy = by + 4; wy < 68; wy += 6) {
      for (let wx = bx + 3; wx < bx + bw - 2; wx += 4.5) {
        const i = bi * 31 + wy * 3 + Math.round(wx);
        windows.push(<rect key={`${bi}-${wx}-${wy}`} x={wx} y={wy} width={2.2} height={2.8} fill={lit(i) ? '#ffd76e' : '#2b3352'} />);
      }
    }
  });
  return (
    <g>
      <rect width={120} height={72} fill="#283152" />
      <rect width={120} height={22} fill="#20284a" />
      <circle cx={100} cy={13} r={7} fill="#f3e9c6" />
      <circle cx={103} cy={11} r={6} fill="#20284a" />
      {[[12, 8], [34, 14], [56, 6], [72, 16], [114, 26], [44, 24]].map(([sx, sy]) => <circle key={`${sx}-${sy}`} cx={sx} cy={sy} r={0.7} fill="#e8e3c8" />)}
      {blocks.map(([bx, by, bw]) => <rect key={bx} x={bx} y={by} width={bw} height={74 - by} fill="#161b30" />)}
      {windows}
      <polygon points="31,27 37,27 52,74 14,74" fill="#ffe9a0" opacity={0.22} />
      <path d="M34 74 L34 26" {...line('#11141f', 2)} />
      <path d="M30 27 L38 27 L36 23 L32 23 Z" fill="#11141f" />
      <circle cx={34} cy={28} r={1.6} fill="#ffe9a0" />
      <g transform={place(46, 0)}>
        <path d="M-6 74 L-4.4 47 C-4 43 4 43 4.4 47 L6 74 Z" fill="#8a7a5a" {...LINE} />
        <path d="M-4 46 L0 53 L4 46" {...line(INK, 0.8)} />
        <path d="M-3.6 55 L3.6 55" {...line('#5d5036', 1.6)} />
        <circle cx={0} cy={40} r={3.4} fill="#d9b896" {...THIN} />
        <ellipse cx={0} cy={37.6} rx={6.2} ry={1.5} fill="#2e281e" {...THIN} />
        <path d="M-3.6 37.6 C-3.6 33 3.6 33 3.6 37.6 Z" fill="#2e281e" {...THIN} />
        {strength % 2 === 0 ? (
          <rect x={5} y={57} width={8} height={6} rx={1} fill="#6b4a2a" {...THIN} />
        ) : (
          <g>
            <rect x={-2} y={45.5} width={8} height={4.6} rx={1} fill="#2b2b2b" {...THIN} />
            <circle cx={2} cy={47.8} r={1.5} fill={GLASS} />
          </g>
        )}
      </g>
    </g>
  );
}

function Flag({ x, y, colors }: { x: number; y: number; colors: [string, string] }) {
  return (
    <g>
      <path d={`M${x} ${y + 40} L${x} ${y}`} {...line(INK, 1.2)} />
      <path d={`M${x} ${y + 1} C ${x + 5} ${y - 1} ${x + 9} ${y + 3} ${x + 14} ${y + 1} L${x + 14} ${y + 10} C ${x + 9} ${y + 12} ${x + 5} ${y + 8} ${x} ${y + 10} Z`} fill={colors[0]} {...THIN} />
      <path d={`M${x} ${y + 4} C ${x + 5} ${y + 2} ${x + 9} ${y + 6} ${x + 14} ${y + 4} L${x + 14} ${y + 7} C ${x + 9} ${y + 9} ${x + 5} ${y + 5} ${x} ${y + 7} Z`} fill={colors[1]} />
      <circle cx={x} cy={y - 0.8} r={1.2} fill={FIRE_HI} {...THIN} />
    </g>
  );
}

function Dove({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={place(x, y, s)}>
      <path d="M-9 1 C-6 -1 -2 -1 1 0 L6 -2 C8 -2.6 9.6 -1.6 9 0 L7 1 C5 4 0 5 -4 4 L-9 6 L-7 2.6 Z" fill={WHITE} {...THIN} />
      <path d="M-2 0 C-4 -6 -1 -10 4 -11 C2 -7 2 -3 2 0 Z" fill={WHITE} {...THIN} />
      <circle cx={6.4} cy={-0.8} r={0.5} fill={INK} />
      <path d="M9.4 0 L13 2.4" {...line(LEAF, 0.9)} />
      <ellipse cx={11.6} cy={2.6} rx={1.4} ry={0.7} fill={LEAF} />
    </g>
  );
}

function DiploArt({ strength }: { strength: number }) {
  const flagSets: [string, string][] = [['#c8452f', WHITE], [ROUNDEL, WHITE], ['#e8b13a', '#3b6b3a'], ['#3b6b3a', WHITE], ['#7d5cb8', FIRE_HI], [WHITE, '#c8452f']];
  return (
    <g>
      <rect width={120} height={72} fill="#f3e4c9" />
      <rect width={120} height={18} fill="#f8eedb" />
      <rect x={-2} y={62} width={124} height={12} fill="#c9b48e" {...LINE} />
      <rect x={52} y={10} width={16} height={8} fill="#e6dccb" {...THIN} />
      <path d="M50 12 C 50 -2 70 -2 70 12 Z" fill="#e1d6c2" {...LINE} />
      <path d="M58 1 L58 -3 L62 -3 L62 1" fill={STEEL} {...THIN} />
      <rect x={44} y={16} width={32} height={8} fill="#ece4d4" {...THIN} />
      {[46, 50, 54, 58, 62, 66, 70].map((cx) => <path key={cx} d={`M${cx + 1} 16 L${cx + 1} 24`} {...line('#b8ac96', 0.7)} />)}
      <path d="M22 34 L60 22 L98 34 Z" fill="#ece4d4" {...LINE} />
      <circle cx={60} cy={29.5} r={2.6} fill={THEATER_TINT.diplo.main} {...THIN} />
      <rect x={24} y={34} width={72} height={3} fill="#ddd2bd" {...THIN} />
      {[28, 38, 48, 68, 78, 88].map((cx) => (
        <g key={cx}>
          <rect x={cx} y={37} width={4} height={18} fill="#f4eee2" {...THIN} />
          <path d={`M${cx + 2} 38 L${cx + 2} 54`} {...line('#cfc4ae', 0.6)} />
        </g>
      ))}
      <rect x={55} y={40} width={10} height={15} rx={1} fill="#7a5a3a" {...THIN} />
      <rect x={22} y={55} width={76} height={3} fill="#ddd2bd" {...THIN} />
      <rect x={18} y={58} width={84} height={4} fill="#d4c8b0" {...THIN} />
      <Flag x={6} y={20} colors={flagSets[strength % flagSets.length]} />
      <Flag x={104} y={20} colors={flagSets[(strength + 3) % flagSets.length]} />
      <Dove x={24} y={12} s={0.9} />
    </g>
  );
}

function EconArt({ strength }: { strength: number }) {
  const crates: [number, number][] = [[2, 56], [15, 56], [28, 56], [8.5, 46], [21.5, 46], [15, 36]];
  return (
    <g>
      <rect width={120} height={72} fill="#dbe8d4" />
      <rect width={120} height={18} fill="#e7f0e2" />
      <Puff x={86} y={8} s={1.3} fill={SMOKE} />
      <Puff x={98} y={4} s={1} fill="#d7d2c8" />
      <Puff x={104} y={12} s={0.9} fill={SMOKE} />
      <rect x={-2} y={62} width={124} height={12} fill="#a8a58b" {...LINE} />
      <rect x={82} y={12} width={7} height={24} fill="#8f4a36" {...LINE} />
      <rect x={95} y={18} width={6} height={18} fill="#8f4a36" {...LINE} />
      <path d="M81 15 L90 15 M94 21 L102 21" {...line(WHITE, 1.2)} />
      <path d="M40 62 L40 36 L48 28 L48 36 L56 28 L56 36 L64 28 L64 36 L72 28 L72 36 L80 28 L80 36 L88 28 L88 36 L106 36 L106 62 Z" fill="#b5654a" {...LINE} />
      <path d="M48 28 L48 36 M56 28 L56 36 M64 28 L64 36 M72 28 L72 36 M80 28 L80 36" {...line(GLASS, 1.4)} />
      {[46, 56, 66, 76, 86, 96].map((wx) => <rect key={wx} x={wx} y={42} width={6} height={7} fill={GLASS} {...THIN} />)}
      <rect x={68} y={52} width={14} height={10} fill="#5a4030" {...THIN} />
      <path d="M75 52 L75 62" {...line(INK, 0.6)} />
      {crates.slice(0, Math.max(1, Math.min(6, strength))).map(([cx, cy], i) => (
        <Crate key={i} x={cx} y={cy} w={12} h={10} fill={i % 2 ? '#b49c62' : KHAKI} />
      ))}
      <g transform={place(112, 62)}>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <ellipse cx={0} cy={-i * 3} rx={6} ry={2.2} fill="#c9971d" {...THIN} />
          </g>
        ))}
        <ellipse cx={0} cy={-6.6} rx={6} ry={2.2} fill="#f2c230" {...THIN} />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Emblems, glyphs, tokens (24 × 24)

function EmblemIcon({ theater }: { theater: AlsTheaterId }) {
  switch (theater) {
    case 'air': return <Fighter x={12} y={12.6} s={0.46} r={0} fill={WHITE} plain />;
    case 'land': return <Tank x={11.2} y={13} s={0.29} fill={WHITE} plain />;
    case 'sea': return <Destroyer x={12} y={15} s={0.27} fill={WHITE} plain />;
    case 'intel':
      return (
        <g>
          <path d="M3.6 12 C 7.5 6 16.5 6 20.4 12 C 16.5 18 7.5 18 3.6 12 Z" fill={WHITE} />
          <circle cx={12} cy={12} r={3.4} fill={THEATER_TINT.intel.dark} />
          <circle cx={12} cy={12} r={1.4} fill={WHITE} />
        </g>
      );
    case 'diplo':
      return (
        <g fill={WHITE}>
          <path d="M4.6 9.4 L12 5 L19.4 9.4 Z" />
          <rect x={5.4} y={10.2} width={13.2} height={1.6} />
          {[6.4, 10.4, 14.4].map((cx) => <rect key={cx} x={cx} y={12.4} width={3.2} height={4.8} />)}
          <rect x={4.6} y={17.8} width={14.8} height={1.8} />
        </g>
      );
    case 'econ':
      return (
        <g>
          <rect x={6} y={7} width={12} height={10} fill={WHITE} />
          <path d="M6.8 7.8 L17.2 16.2 M17.2 7.8 L6.8 16.2" {...line(THEATER_TINT.econ.dark, 1.1)} />
          <rect x={7.6} y={8.6} width={8.8} height={6.8} {...line(THEATER_TINT.econ.dark, 0.9)} />
        </g>
      );
  }
}

export function TheaterEmblem({ theater, size = 20 }: { theater: AlsTheaterId; size?: number }) {
  const tint = THEATER_TINT[theater];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="als-emblem">
      <circle cx={12} cy={12} r={11} fill={tint.main} {...LINE} />
      <circle cx={12} cy={12} r={9} {...line(WHITE, 0.7)} opacity={0.55} />
      <EmblemIcon theater={theater} />
    </svg>
  );
}

/** Instant (lightning) and Ongoing (infinity) markers. */
export function TriggerGlyph({ trigger, size = 14 }: { trigger: 'instant' | 'ongoing'; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="als-trigger-glyph">
      {trigger === 'instant' ? (
        <>
          <circle cx={12} cy={12} r={11} fill="#f2c230" {...LINE} />
          <path d="M13.5 3.5 L6.5 13.2 L11.2 13.2 L9.6 20.5 L17.5 10.2 L12.6 10.2 Z" fill={INK} />
        </>
      ) : (
        <>
          <circle cx={12} cy={12} r={11} fill="#5fb3a4" {...LINE} />
          <path d="M12 12 C 9.5 8.4 5 8.6 5 12 C 5 15.4 9.5 15.6 12 12 C 14.5 8.4 19 8.6 19 12 C 19 15.4 14.5 15.6 12 12 Z" {...line(INK, 2.2)} />
        </>
      )}
    </svg>
  );
}

/** A campaign medal — the VP marker. */
export function MedalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="als-medal">
      <path d="M7 1 L11 1 L13.4 10 L9.4 10 Z" fill="#c8452f" {...THIN} />
      <path d="M17 1 L13 1 L10.6 10 L14.6 10 Z" fill={ROUNDEL} {...THIN} />
      <circle cx={12} cy={15.5} r={7} fill="#f2c230" {...LINE} />
      <circle cx={12} cy={15.5} r={5} {...line('#b88a14', 0.8)} />
      <Star x={12} y={15.8} r={3.6} fill="#fff2b8" outline />
    </svg>
  );
}

/** Pennant on a pole — marks the side that holds a theater. */
export function ControlFlag({ size = 14, color = '#f2c230' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="als-flag">
      <path d="M6 22 L6 3" {...line(INK, 2.4)} />
      <path d="M6 3 L20 7.5 L6 12 Z" fill={color} {...LINE} />
    </svg>
  );
}

/** A Supply Token: a round chip with a crate. */
export function SupplyToken({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="als-supply-token">
      <circle cx={12} cy={12} r={11} fill={THEATER_TINT.econ.main} {...LINE} />
      <circle cx={12} cy={12} r={8.6} {...line(WHITE, 0.8)} opacity={0.6} />
      <rect x={7} y={8} width={10} height={8} fill={KHAKI} {...THIN} />
      <path d="M7.4 8.4 L16.6 15.6 M16.6 8.4 L7.4 15.6" {...line('#8c7646', 0.8)} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card back (100 × 140)

export function CardBackArt(): JSX.Element {
  const stripes: ReactNode[] = [];
  for (let x0 = -140; x0 < 120; x0 += 9) {
    stripes.push(<path key={x0} d={`M${x0} 140 L${x0 + 140} 0`} {...line('#33424d', 3.2)} />);
  }
  return (
    <svg viewBox="0 0 100 140" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={100} height={140} fill="#28343e" />
      {stripes}
      <rect x={5} y={5} width={90} height={130} rx={5} {...line('#c9b27a', 1.6)} />
      <rect x={8.5} y={8.5} width={83} height={123} rx={3.5} {...line('#c9b27a', 0.6)} />
      <circle cx={50} cy={70} r={25} fill="#e9e1c8" {...LINE} />
      <circle cx={50} cy={70} r={20.5} fill={ROUNDEL} {...LINE} />
      <Star x={50} y={71} r={17} />
      <path d="M14 70 L25 70 M75 70 L86 70" {...line('#c9b27a', 1.4)} />
      <text x={50} y={28} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fontWeight={800} letterSpacing={2.4} fill="#e9e1c8">AIR · LAND</text>
      <text x={50} y={118} textAnchor="middle" fontFamily={FONT} fontSize={8.5} fontWeight={800} letterSpacing={2.4} fill="#e9e1c8">&amp; SEA</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Theater banners (240 × 44, cropped to fit)

export function TheaterBanner({ theater }: { theater: AlsTheaterId }): JSX.Element {
  const tint = THEATER_TINT[theater];
  return (
    <svg viewBox="0 0 240 44" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={240} height={44} fill={tint.light} />
      {banner(theater, tint)}
      <rect x={0} y={42.5} width={240} height={1.5} fill={INK} />
    </svg>
  );
}

function banner(theater: AlsTheaterId, tint: { main: string; dark: string; light: string }): JSX.Element {
  switch (theater) {
    case 'air':
      return (
        <g>
          <rect width={240} height={14} fill="#dcf0f9" />
          <Cloud x={34} y={34} s={1.6} />
          <Cloud x={196} y={30} s={1.4} />
          <Cloud x={120} y={40} s={1.2} />
          <Fighter x={150} y={18} s={0.5} r={90} fill={tint.dark} plain />
          <Fighter x={134} y={10} s={0.4} r={90} fill={tint.dark} plain />
          <Fighter x={134} y={27} s={0.4} r={90} fill={tint.dark} plain />
          <Bomber x={70} y={16} s={0.36} r={90} fill={tint.main} plain />
        </g>
      );
    case 'land':
      return (
        <g>
          <path d="M0 30 C 30 18 60 22 90 28 C 120 34 150 16 190 22 C 210 25 228 22 240 20 L240 44 L0 44 Z" fill="#dcc48e" />
          <path d="M0 38 C 50 32 120 34 240 36 L240 44 L0 44 Z" fill={tint.main} />
          <Tank x={150} y={30} s={0.34} fill={tint.dark} plain />
          <Tank x={186} y={32} s={0.26} fill={tint.dark} plain />
          <g fill={tint.dark}>
            <path d="M58 34 L58 24" stroke={tint.dark} strokeWidth={1.6} />
            <circle cx={58} cy={21} r={5} />
            <circle cx={66} cy={25} r={3.6} />
          </g>
        </g>
      );
    case 'sea':
      return (
        <g>
          <rect y={30} width={240} height={14} fill={tint.main} />
          <Waves y={34} step={12} amp={1.2} x0={-4} x1={244} color="#9fc8de" />
          <Destroyer x={160} y={30} s={0.56} fill={tint.dark} plain />
          <Destroyer x={70} y={31} s={0.36} fill={tint.dark} plain />
          <path d="M110 12 Q 112 10 114 12 Q 116 10 118 12" {...line(tint.dark, 0.9)} />
        </g>
      );
    case 'intel':
      return (
        <g>
          <rect width={240} height={44} fill="#2b3254" />
          <polygon points="196,44 150,0 166,0" fill="#fff2a8" opacity={0.22} />
          <circle cx={40} cy={12} r={5} fill="#f3e9c6" />
          {[[90, 8], [120, 16], [20, 26], [214, 10]].map(([sx, sy]) => <circle key={sx} cx={sx} cy={sy} r={0.7} fill="#e8e3c8" />)}
          <path d="M0 44 L0 30 L14 30 L14 24 L26 24 L26 32 L40 32 L40 20 L50 20 L50 30 L70 30 L70 26 L84 26 L84 34 L104 34 L104 22 L114 22 L114 16 L120 16 L120 22 L130 22 L130 32 L150 32 L150 26 L170 26 L170 30 L190 30 L190 22 L202 22 L202 32 L222 32 L222 26 L240 26 L240 44 Z" fill="#161b30" />
          {[[18, 28], [44, 24], [74, 30], [108, 26], [116, 20], [158, 30], [194, 26], [228, 30]].map(([wx, wy]) => <rect key={wx} x={wx} y={wy} width={2} height={2.4} fill="#ffd76e" />)}
        </g>
      );
    case 'diplo':
      return (
        <g>
          <path d="M0 44 L0 38 L240 38 L240 44 Z" fill={tint.main} />
          <path d="M96 24 L120 14 L144 24 Z" fill="#ece0cc" stroke={tint.dark} strokeWidth={0.8} />
          <rect x={98} y={24} width={44} height={2} fill={tint.dark} opacity={0.5} />
          {[100, 108, 116, 124, 132].map((cx) => <rect key={cx} x={cx} y={26} width={3} height={12} fill="#f4eee2" stroke={tint.dark} strokeWidth={0.6} />)}
          <path d="M108 14 C 108 4 132 4 132 14 Z" fill="#e1d6c2" stroke={tint.dark} strokeWidth={0.8} />
          <path d="M40 38 L40 14 M200 38 L200 14" {...line(tint.dark, 1)} />
          <path d="M40 14 L52 17 L40 21 Z M200 14 L212 17 L200 21 Z" fill={tint.main} />
          <Dove x={170} y={16} s={0.7} />
        </g>
      );
    case 'econ':
      return (
        <g>
          <Puff x={166} y={8} s={1} fill="#c7c9bd" />
          <Puff x={178} y={4} s={0.8} fill="#d3d4ca" />
          <path d="M0 44 L0 34 L240 34 L240 44 Z" fill={tint.main} />
          <path d="M120 34 L120 22 L128 16 L128 22 L136 16 L136 22 L144 16 L144 22 L152 16 L152 22 L176 22 L176 34 Z" fill={tint.dark} />
          <rect x={160} y={10} width={5} height={12} fill={tint.dark} />
          <rect x={168} y={14} width={4} height={8} fill={tint.dark} />
          <rect x={60} y={26} width={10} height={8} fill={tint.dark} />
          <rect x={72} y={26} width={10} height={8} fill={tint.dark} />
          <rect x={66} y={18} width={10} height={8} fill={tint.dark} />
        </g>
      );
  }
}
