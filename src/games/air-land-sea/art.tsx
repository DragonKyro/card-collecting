// Air, Land & Sea — hand-drawn SVG art: one illustration per card (all 36 —
// the base game and Spies, Lies & Supplies), theater emblems and banners, the
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
const FOAM = '#e8f4fa';
const FIRE = '#f08a24';
const FIRE_HI = '#ffd34d';
const SMOKE = '#c7c1b5';
const SMOKE_DARK = '#8b867d';
const ROUNDEL = '#2b4c8c';
const LEAF = '#5f7c3a';
const WOOD = '#9a6a3a';

/** Theater colours, as printed: Air gray, Land green, Sea blue, Intelligence
 *  charcoal, Diplomacy purple, Economics brick. `main` for bands and numerals,
 *  `dark` for silhouettes, `light` for skies. */
export const THEATER_TINT: Record<AlsTheaterId, { main: string; dark: string; light: string }> = {
  air: { main: '#7d8b97', dark: '#4d5a66', light: '#dfe5ea' },
  land: { main: '#5f8f3e', dark: '#3d6224', light: '#dcead0' },
  sea: { main: '#2f7db3', dark: '#1d557c', light: '#d0e6f3' },
  intel: { main: '#4d525b', dark: '#2a2e35', light: '#d8dade' },
  diplo: { main: '#7b4fa6', dark: '#523173', light: '#e4d8f0' },
  econ: { main: '#a5483a', dark: '#702e24', light: '#f1d9d2' },
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
export function CardArt({ card }: { card: Pick<AlsCardTemplate, 'theater' | 'strength'> }): JSX.Element {
  return (
    <svg viewBox="0 0 120 72" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {SCENES[card.theater][card.strength - 1]?.() ?? null}
    </svg>
  );
}

/** One scene per card: theater × strength 1..6. */
const SCENES: Record<AlsTheaterId, Array<() => JSX.Element>> = {
  air: [SupportArt, AirDropArt, ManeuverArt, AerodromeArt, ContainmentArt, HeavyBombersArt],
  land: [ReinforceArt, AmbushArt, LandManeuverArt, CoverFireArt, DisruptArt, HeavyTanksArt],
  sea: [TransportArt, SeaEscalationArt, SeaManeuverArt, RedeployArt, BlockadeArt, SuperBattleshipArt],
  intel: [InciteArt, SpyNetworkArt, PuppetArt, NeutralizeArt, SurveilArt, CovertOpsArt],
  diplo: [RelinquishArt, EnvoyArt, MapTableArt, LeverageArt, GiveAndTakeArt, GrandBetrayalArt],
  econ: [RetrofitArt, SupplyLinesArt, ScalesArt, RequisitionArt, ArmsRaceArt, ProductionSurgeArt],
};

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

/** Maneuver (Land): tanks swing round a hill to take the flank. */
function LandManeuverArt() {
  return (
    <g>
      <LandSky horizon={58} />
      <path d="M30 58 C 36 36 54 28 66 30 C 80 32 88 44 94 58 Z" fill="#b69a5e" {...LINE} />
      <Bush x={56} y={34} s={0.8} />
      <Bush x={74} y={40} s={0.7} fill="#6c8a42" />
      <Tank x={20} y={52} s={0.42} />
      <Inked d="M30 48 C 40 66 78 70 96 56 C 102 50 104 44 104 38" color={WHITE} width={2.2} />
      <path d="M100 41 L104 36 L108 41" {...line(INK, 3.4)} />
      <path d="M100 41 L104 36 L108 41" {...line(WHITE, 1.8)} />
      <Tank x={104} y={30} s={0.36} fill={OD_LIGHT} flip />
    </g>
  );
}

/** Maneuver (Sea): a destroyer heels round in a hard turn. */
function SeaManeuverArt() {
  return (
    <g>
      <SeaSky waterline={34} />
      <path d="M-2 66 C 20 74 70 72 86 54 C 96 44 92 36 82 36" {...line(FOAM, 4.4)} />
      <path d="M-2 66 C 20 74 70 72 86 54 C 96 44 92 36 82 36" {...line('#9cc6de', 1.6)} />
      <g transform="rotate(-8 64 36)">
        <Destroyer x={64} y={36} s={0.82} />
      </g>
      <Waves y={34} color={FOAM} step={9} amp={1} x0={-6} x1={30} />
      <Waves y={48} color="#7fb2d1" step={12} amp={1.2} x0={-6} x1={50} />
    </g>
  );
}

/** Escalation (Sea): a cruiser looses rocket salvo after salvo. */
function SeaEscalationArt() {
  return (
    <g>
      <SeaSky waterline={50} />
      <path d="M44 38 C 58 26 74 18 88 14" {...line('#efe9dc', 2.2)} />
      <path d="M48 38 C 66 30 84 30 100 34" {...line('#efe9dc', 1.8)} />
      <path d="M40 38 C 48 22 60 10 70 4" {...line('#efe9dc', 2)} />
      <Rocket x={90} y={13} r={-14} />
      <Rocket x={102} y={35} r={14} />
      <Rocket x={71} y={4} r={-38} />
      <Puff x={44} y={38} s={1} />
      <Puff x={36} y={40} s={0.8} fill="#ddd7cb" />
      <Destroyer x={40} y={50} s={0.86} />
      <path d="M100 50 L100 40 M104 50 L104 44 M96 50 L96 45" {...line(FOAM, 1.6)} />
      <Waves y={54} color={FOAM} step={9} amp={1.1} />
      <Waves y={64} color="#7fb2d1" step={12} amp={1.2} />
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
// Spies, Lies & Supplies scenes

/** A standing figure in coat and hat, feet at (x, y), about 30 tall. */
function Figure({ x, y, s = 1, coat = '#5d5246', hat = '#2e281e', skin = '#d9b896', flip = false }: {
  x: number; y: number; s?: number; coat?: string; hat?: string; skin?: string; flip?: boolean;
}) {
  return (
    <g transform={`${place(x, y, s)}${flip ? ' scale(-1 1)' : ''}`}>
      <path d="M-5.5 0 L-4.4 -17 C-4 -20.5 4 -20.5 4.4 -17 L5.5 0 Z" fill={coat} {...LINE} />
      <path d="M-1.4 -19.6 L0 -14 L1.4 -19.6" {...line(INK, 0.7)} />
      <circle cx={0} cy={-23.2} r={3.3} fill={skin} {...THIN} />
      <ellipse cx={0} cy={-25.4} rx={5.8} ry={1.3} fill={hat} {...THIN} />
      <path d="M-3.4 -25.4 C-3.4 -30 3.4 -30 3.4 -25.4 Z" fill={hat} {...THIN} />
    </g>
  );
}

const NIGHT = '#283152';
const NIGHT_DARK = '#20284a';
const SILHOUETTE = '#161b30';
const LAMPLIGHT = '#ffe9a0';
const MARBLE = '#efe6d6';
const PAPER = '#f4efe2';
const MANILA = '#d9b86a';
const BRICK = '#a5483a';

function NightSky({ moon = true }: { moon?: boolean }) {
  return (
    <g>
      <rect width={120} height={72} fill={NIGHT} />
      <rect width={120} height={22} fill={NIGHT_DARK} />
      {[[12, 8], [34, 14], [56, 6], [72, 16], [114, 26], [44, 22], [86, 4]].map(([sx, sy]) => (
        <circle key={`${sx}-${sy}`} cx={sx} cy={sy} r={0.7} fill="#e8e3c8" />
      ))}
      {moon && (
        <g>
          <circle cx={100} cy={13} r={7} fill="#f3e9c6" />
          <circle cx={103} cy={11} r={6} fill={NIGHT_DARK} />
        </g>
      )}
    </g>
  );
}

/** Lit and dark windows on a block, deterministic. */
function Windows({ x, y, w, h, seed }: { x: number; y: number; w: number; h: number; seed: number }) {
  const out: ReactNode[] = [];
  for (let wy = y + 3; wy < y + h - 3; wy += 6) {
    for (let wx = x + 3; wx < x + w - 2; wx += 4.5) {
      const lit = ((Math.round(wx) * 7 + wy * 3 + seed) % 5) < 2;
      out.push(<rect key={`${wx}-${wy}`} x={wx} y={wy} width={2.2} height={2.8} fill={lit ? '#ffd76e' : '#2b3352'} />);
    }
  }
  return <g>{out}</g>;
}

// ----- Intelligence

function InciteArt() {
  return (
    <g>
      <NightSky moon={false} />
      <path d="M-2 62 L-2 28 L16 28 L16 20 L32 20 L32 62 Z" fill={SILHOUETTE} />
      <path d="M88 62 L88 24 L104 24 L104 32 L122 32 L122 62 Z" fill={SILHOUETTE} />
      <Windows x={0} y={30} w={30} h={32} seed={3} />
      <Windows x={90} y={34} w={30} h={28} seed={8} />
      <polygon points="44,74 76,74 66,14 54,14" fill={LAMPLIGHT} opacity={0.16} />
      <rect x={-2} y={62} width={124} height={12} fill="#1b2038" />
      <Crate x={50} y={48} w={20} h={12} fill="#8a6a3a" />
      <Figure x={60} y={48} s={0.95} coat="#7a2f2f" />
      <path d="M62.6 26.2 L71 22.4 L71.4 31.2 Z" fill={STEEL_LIGHT} {...THIN} />
      <path d="M57 30 L54 21 M54 21 L52.6 18.4" {...line(INK, 2.4)} />
      <path d="M57 30 L54 21" {...line('#7a2f2f', 1.4)} />
      <circle cx={53} cy={18.6} r={1.6} fill="#d9b896" {...THIN} />
      <path d="M75 22 Q 79 27 75 32 M79.5 19 Q 86 27 79.5 35" {...line(LAMPLIGHT, 1.2)} />
      {[6, 18, 30, 90, 102, 114, 42, 78].map((cx, i) => (
        <g key={cx}>
          <path d={`M${cx - 6.5} 74 C${cx - 6.5} 65 ${cx + 6.5} 65 ${cx + 6.5} 74 Z`} fill="#0f1322" />
          <circle cx={cx} cy={63} r={3.6} fill="#0f1322" />
          {i % 3 === 0 && <path d={`M${cx + 4} 66 L${cx + 6} 55`} {...line('#0f1322', 2.4)} />}
          {i % 3 === 0 && <circle cx={cx + 6.2} cy={54} r={1.8} fill="#0f1322" />}
        </g>
      ))}
    </g>
  );
}

function Photo({ x, y, r = 0 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={place(x, y, 1, r)}>
      <rect x={-8} y={-6.5} width={16} height={13} fill={PAPER} {...THIN} />
      <rect x={-6.4} y={-5} width={12.8} height={8.6} fill="#7d8796" />
      <circle cx={0} cy={-2.4} r={2} fill="#2a2e35" />
      <path d="M-4 3.6 C-4 0 4 0 4 3.6 Z" fill="#2a2e35" />
    </g>
  );
}

function SpyNetworkArt() {
  const pins: [number, number][] = [[22, 15], [60, 12], [98, 18], [36, 46], [80, 50], [104, 52], [58, 34]];
  const links: [number, number][] = [[0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [2, 5], [0, 3], [4, 5], [1, 2]];
  return (
    <g>
      <rect width={120} height={72} fill="#3a3f4a" />
      <rect x={4} y={3} width={112} height={66} rx={2} fill="#b98a55" {...LINE} />
      {Array.from({ length: 36 }, (_, i) => (
        <circle key={i} cx={8 + ((i * 37) % 106)} cy={6 + ((i * 23) % 60)} r={0.8} fill="#a3773f" />
      ))}
      <rect x={44} y={24} width={28} height={20} fill="#e6dcc0" {...THIN} transform="rotate(-4 58 34)" />
      <path d="M48 30 C 54 26 60 36 68 30 M50 38 L66 38" {...line('#9a8f78', 0.9)} transform="rotate(-4 58 34)" />
      {pins.slice(0, 6).map(([px, py], i) => <Photo key={i} x={px} y={py + 4} r={((i * 7) % 11) - 5} />)}
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={pins[a][0]} y1={pins[a][1]} x2={pins[b][0]} y2={pins[b][1]} {...line('#c8452f', 0.9)} />
      ))}
      {pins.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={1.6} fill="#e0402e" {...THIN} />)}
    </g>
  );
}

/** Manipulate (Intelligence): a soldier marionette on strings. */
function PuppetArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#2a2e35" />
      <path d="M-2 0 L18 0 C 14 24 18 48 10 74 L-2 74 Z" fill="#6e2a2a" {...LINE} />
      <path d="M122 0 L102 0 C 106 24 102 48 110 74 L122 74 Z" fill="#6e2a2a" {...LINE} />
      <polygon points="60,0 34,66 86,66" fill={LAMPLIGHT} opacity={0.18} />
      <rect x={-2} y={64} width={124} height={10} fill="#5a4030" {...LINE} />
      <path d="M38 6 L82 6 M60 1 L60 13" {...line(INK, 3.4)} />
      <path d="M38 6 L82 6 M60 1 L60 13" {...line(WOOD, 1.8)} />
      <path d="M38 6 L49 37 M82 6 L71 37 M60 13 L60 24 M45 6 L54 61 M75 6 L66 61" {...line('#e6e1d2', 0.6)} />
      <g transform={place(60, 0)}>
        <path d="M-6 31 L-11 37 M6 31 L11 37" {...line(OD_DARK, 2.6)} />
        <path d="M-3 46 L-6 61 M3 46 L6 61" {...line(OD_DARK, 2.8)} />
        <rect x={-6} y={29} width={12} height={18} rx={2} fill={OD} {...LINE} />
        <circle cx={0} cy={26} r={3.6} fill="#d9b896" {...THIN} />
        <Helmet x={0} y={25} s={0.72} />
        <path d="M-4 35 L4 35 M-4 39 L4 39" {...line(OD_DARK, 0.7)} />
      </g>
    </g>
  );
}

function NeutralizeArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#11141f" />
      <circle cx={60} cy={36} r={31} fill="#cfd59f" />
      <rect x={36} y={12} width={48} height={42} fill="#b9c08a" />
      <rect x={40} y={16} width={40} height={30} fill="#9da874" stroke="#7f8a5c" strokeWidth={1} />
      <path d="M60 16 L60 46 M40 31 L80 31" {...line('#7f8a5c', 1)} />
      <Figure x={60} y={64} s={1.25} coat="#3e3a34" hat="#1f1b16" />
      <rect x={63} y={43} width={7} height={8} rx={1} fill={FIRE_HI} {...THIN} />
      <circle cx={60} cy={36} r={35} {...line('#11141f', 9)} />
      <circle cx={60} cy={36} r={30.5} {...line(INK, 1.8)} />
      <path d="M60 6 L60 28 M60 44 L60 66 M30 36 L52 36 M68 36 L90 36" {...line(INK, 1.1)} />
      {[-12, -6, 6, 12].map((d) => <path key={d} d={`M${60 + d} 34.5 L${60 + d} 37.5 M58.5 ${36 + d} L61.5 ${36 + d}`} {...line(INK, 0.8)} />)}
      <circle cx={60} cy={36} r={1} fill="#c8452f" />
    </g>
  );
}

function SurveilArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#2b3040" />
      <rect x={84} y={6} width={30} height={22} fill="#3a4258" {...LINE} />
      <path d="M99 6 L99 28 M84 17 L114 17" {...line(INK, 1)} />
      <rect x={86} y={8} width={11} height={7.5} fill={LAMPLIGHT} opacity={0.5} />
      <rect x={-2} y={52} width={124} height={22} fill="#6b4a2a" {...LINE} />
      <path d="M-2 56 L122 56" {...line('#5a3d22', 1)} />
      <path d="M10 52 L18 30 L30 26" {...line(INK, 1.6)} />
      <path d="M26 22 L38 26 L33 31 Z" fill={STEEL_DARK} {...THIN} />
      <polygon points="35,29 22,52 58,52" fill={LAMPLIGHT} opacity={0.2} />
      <rect x={34} y={34} width={46} height={18} rx={2} fill={STEEL_DARK} {...LINE} />
      <rect x={40} y={45} width={34} height={3} fill={INK} opacity={0.5} />
      {[46, 68].map((rx) => (
        <g key={rx}>
          <circle cx={rx} cy={31} r={8.5} fill="#2b2b2b" {...LINE} />
          <circle cx={rx} cy={31} r={5} fill="#4a4a4a" />
          <circle cx={rx} cy={31} r={1.6} fill={STEEL_LIGHT} />
          <path d={`M${rx - 4} ${31} L${rx + 4} ${31} M${rx} ${27} L${rx} ${35}`} {...line(STEEL, 0.7)} />
        </g>
      ))}
      <path d="M46 39.5 L68 39.5" {...line('#8b5a2b', 1)} />
      <path d="M86 50 C 86 38 106 38 106 50" {...line(INK, 2.2)} />
      <rect x={83} y={45} width={6} height={8} rx={2} fill="#3b3b3b" {...THIN} />
      <rect x={103} y={45} width={6} height={8} rx={2} fill="#3b3b3b" {...THIN} />
      <path d="M112 36 Q 116 40 112 44 M115 32 Q 121 40 115 48" {...line(LAMPLIGHT, 1)} />
    </g>
  );
}

function CovertOpsArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#3a3326" />
      <path d="M-2 20 L122 12 M-2 44 L122 38" {...line('#332c20', 1)} />
      <g transform="rotate(-8 56 38)">
        <rect x={20} y={14} width={70} height={46} rx={2} fill={MANILA} {...LINE} />
        <path d="M20 14 L20 9 L42 9 L46 14 Z" fill={MANILA} {...LINE} />
        <rect x={28} y={18} width={30} height={22} fill="#7d8796" {...THIN} />
        <rect x={24} y={30} width={62} height={10} fill="#c8452f" {...THIN} />
        <text x={55} y={37.6} textAnchor="middle" fontFamily={FONT} fontSize={7.4} fontWeight={900} letterSpacing={1.2} fill={WHITE}>TOP SECRET</text>
        <path d="M30 46 L78 46 M30 50 L70 50 M30 54 L74 54" {...line('#9a7d3d', 0.9)} />
      </g>
      <g transform="translate(6 54)">
        <rect x={0} y={0} width={24} height={15} rx={1.5} fill="#2b2b2b" {...LINE} />
        <rect x={4} y={3} width={16} height={6} fill={STEEL_LIGHT} {...THIN} />
        <circle cx={8} cy={6} r={1.8} fill="#2b2b2b" />
        <circle cx={16} cy={6} r={1.8} fill="#2b2b2b" />
      </g>
      <path d="M86 58 L112 58 L113 54 L100 53 L98 50 L92 50 L91 53 L86 53 Z" fill="#22252b" {...LINE} />
      <path d="M90 58 L88 68 L95 68 L96 58 Z" fill="#22252b" {...LINE} />
    </g>
  );
}

// ----- Diplomacy

function RelinquishArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#ddd3c6" />
      <rect width={120} height={20} fill="#e8e0d4" />
      <Puff x={92} y={18} s={1.3} fill="#c5bcae" />
      <Puff x={104} y={12} s={1} fill="#d0c8bb" />
      <path d="M-2 50 C 30 44 80 46 122 50 L122 74 L-2 74 Z" fill="#9b8a6c" {...LINE} />
      {[[8, 50], [20, 49], [32, 49], [44, 50], [14, 44], [26, 43], [38, 44]].map(([bx, by]) => (
        <ellipse key={`${bx}-${by}`} cx={bx} cy={by} rx={6.6} ry={3.6} fill={KHAKI} {...THIN} />
      ))}
      <path d="M30 41 L30 4" {...line(INK, 1.6)} />
      <path d="M30 5 C 37 3 43 8 52 5 L52 20 C 43 23 37 18 30 20 Z" fill="#fbf8ef" {...LINE} />
      <path d="M36 9 C 40 8 44 11 48 9" {...line('#d8d2c2', 0.8)} />
      <g transform="rotate(-12 82 60)">
        <rect x={62} y={58} width={40} height={2.8} fill={WOOD} {...THIN} />
        <rect x={94} y={57.4} width={14} height={2} fill={STEEL_DARK} {...THIN} />
      </g>
      <Helmet x={60} y={64} s={1} />
    </g>
  );
}

function EnvoyArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#e9dfee" />
      <path d="M18 32 L60 18 L102 32 Z" fill={MARBLE} {...LINE} />
      <circle cx={60} cy={27.5} r={2.6} fill={THEATER_TINT.diplo.main} {...THIN} />
      <rect x={20} y={32} width={80} height={3} fill="#ddd2bd" {...THIN} />
      {[24, 36, 48, 68, 80, 92].map((cx) => <rect key={cx} x={cx} y={35} width={4} height={20} fill="#f4eee2" {...THIN} />)}
      <rect x={55} y={39} width={10} height={16} fill="#5a3f6e" {...THIN} />
      <rect x={14} y={55} width={92} height={3} fill="#d4c8b0" {...THIN} />
      <rect x={-2} y={58} width={124} height={16} fill="#8f8a94" {...LINE} />
      <g transform="translate(60 64)">
        <path d="M-30 4 L-30 -2 C-30 -4 -28 -5 -24 -5 L-14 -5 L-9 -12 L10 -12 L16 -5 L26 -5 C29 -5 31 -3 31 0 L31 4 Z" fill="#26252c" {...LINE} />
        <path d="M-7.6 -10.6 L-3 -10.6 L-3 -5.6 L-11.4 -5.6 Z M-1 -10.6 L8.6 -10.6 L13 -5.6 L-1 -5.6 Z" fill={GLASS} {...THIN} />
        {[-19, 20].map((wx) => (
          <g key={wx}>
            <circle cx={wx} cy={4} r={4.6} fill="#1a1a1e" {...THIN} />
            <circle cx={wx} cy={4} r={1.8} fill={STEEL_LIGHT} />
          </g>
        ))}
        {[-27, 28].map((fx) => (
          <g key={fx}>
            <path d={`M${fx} -5 L${fx} -13`} {...line(STEEL_LIGHT, 0.8)} />
            <rect x={fx} y={-13} width={6} height={4} fill={THEATER_TINT.diplo.main} {...THIN} />
            <rect x={fx} y={-11.6} width={6} height={1.2} fill={WHITE} />
          </g>
        ))}
      </g>
    </g>
  );
}

/** Manipulate (Diplomacy): pieces pushed around the map table. */
function MapTableArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#3b2f45" />
      <path d="M8 10 L112 10 L120 72 L0 72 Z" fill="#7a5a3a" {...LINE} />
      <path d="M14 14 L106 14 L112 66 L8 66 Z" fill="#e6dcbc" {...THIN} />
      <path d="M22 22 C 34 16 46 24 44 34 C 42 44 26 46 22 38 Z M58 20 C 72 16 92 22 96 32 C 100 44 84 52 70 48 C 58 44 52 30 58 20 Z M30 52 C 38 50 48 54 46 60 C 40 64 30 62 30 52 Z" fill="#b8c49a" {...THIN} />
      <path d="M44 34 C 52 36 56 40 64 44" fill="none" stroke="#7a6a4a" strokeWidth={0.8} strokeDasharray="2 2" />
      {[[34, 30, '#c8452f'], [40, 56, '#c8452f'], [78, 34, ROUNDEL], [86, 44, ROUNDEL]].map(([px, py, c]) => (
        <g key={`${px}-${py}`}>
          <rect x={(px as number) - 3} y={(py as number) - 3} width={6} height={5} fill={c as string} {...THIN} />
          <path d={`M${px} ${(py as number) - 3} L${px} ${(py as number) - 9}`} {...line(INK, 0.7)} />
          <path d={`M${px} ${(py as number) - 9} L${(px as number) + 5} ${(py as number) - 7.5} L${px} ${(py as number) - 6} Z`} fill={c as string} />
        </g>
      ))}
      <path d="M120 4 L72 40" {...line(INK, 3)} />
      <path d="M120 4 L72 40" {...line(WOOD, 1.6)} />
      <rect x={62} y={38} width={8} height={6} fill={ROUNDEL} {...THIN} transform="rotate(-36 66 41)" />
      <Inked d="M60 44 C 54 48 50 46 46 42" color={FIRE_HI} width={1.4} />
    </g>
  );
}

function LeverageArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#e4d8f0" />
      <rect y={60} width={120} height={14} fill="#8b7aa0" {...LINE} />
      <rect x={10} y={30} width={30} height={22} fill="#9a9aa0" {...LINE} />
      <path d="M10 40 L40 40 M24 30 L24 40 M18 40 L18 52 M32 40 L32 52" {...line('#7c7c84', 0.9)} />
      <path d="M44 60 L52 46 L60 60 Z" fill={STEEL_DARK} {...LINE} />
      <path d="M8 54 L112 22" {...line(INK, 4)} />
      <path d="M8 54 L112 22" {...line(WOOD, 2.4)} />
      <g transform="rotate(-17 104 18)">
        <rect x={94} y={10} width={20} height={13} fill={PAPER} {...LINE} />
        <path d="M94 10 L104 17 L114 10" {...line(INK, 0.8)} />
        <circle cx={104} cy={18} r={3} fill="#a4262c" {...THIN} />
      </g>
      <Inked d="M104 4 L104 9 M101 6 L104 9 L107 6" color={FIRE_HI} width={1.4} />
    </g>
  );
}

function GiveAndTakeArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#dccfe6" />
      <rect y={50} width={120} height={24} fill="#6b4f7d" {...LINE} />
      <Crate x={6} y={36} w={20} h={15} fill="#b49c62" />
      <rect x={92} y={40} width={22} height={11} fill={PAPER} {...THIN} transform="rotate(6 103 45)" />
      <path d="M95 44 L110 45 M95 47 L106 48" {...line('#9a9080', 0.7)} transform="rotate(6 103 45)" />
      <path d="M-4 22 L40 30 L44 38 L-4 36 Z" fill={KHAKI} {...LINE} />
      <path d="M124 22 L80 30 L76 38 L124 36 Z" fill="#33405e" {...LINE} />
      <path d="M38 28 L48 26 C 54 25 58 26 62 29 L70 33 C 72 35 70 38 67 37 L60 35 L54 38 L44 38 Z" fill="#d9b896" {...LINE} />
      <path d="M82 28 L72 26 C 66 25 62 27 58 30 L54 34 C 53 37 56 38 58 37 L64 35 L68 38 L76 38 Z" fill="#c9a483" {...LINE} />
      <path d="M58 30 L62 33 M61 29 L65 32" {...line(INK, 0.6)} />
    </g>
  );
}

function GrandBetrayalArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#2e2438" />
      <rect x={38} y={6} width={44} height={36} fill="#5a3a2a" {...LINE} />
      <rect x={41} y={9} width={38} height={30} fill={FIRE} />
      <Burst x={60} y={30} r={14} fill={FIRE_HI} inner={0.6} points={9} outline={false} />
      <Puff x={52} y={16} s={1.2} fill="#5a4a4a" />
      <Puff x={68} y={13} s={1} fill="#6a5a5a" />
      <path d="M60 9 L60 39 M41 24 L79 24" {...line('#5a3a2a', 2)} />
      <rect x={-2} y={62} width={124} height={12} fill="#1e1826" />
      <Figure x={40} y={66} s={1.25} coat="#3d3a52" hat="#1f1d2a" />
      <Figure x={80} y={66} s={1.25} coat="#4e3a3a" hat="#2a1d1d" flip />
      <path d="M44.5 46 L60 44 L75.5 46" {...line(INK, 3)} />
      <circle cx={60} cy={44} r={2.2} fill="#d9b896" {...THIN} />
      <path d="M86 46 L92 52" {...line(INK, 2.8)} />
      <path d="M92 52 L104 44" {...line(STEEL_LIGHT, 1.6)} />
      <path d="M90 50 L94 54" {...line(WOOD, 2)} />
    </g>
  );
}

// ----- Economics

function RetrofitArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#e9dcd2" />
      <path d="M0 0 L0 12 L20 2 L20 12 L40 2 L40 12 L60 2 L60 12 L80 2 L80 12 L100 2 L100 12 L120 2 L120 0 Z" fill="#8a7a70" />
      <rect x={-2} y={12} width={124} height={5} fill={STEEL_DARK} {...LINE} />
      <rect x={52} y={17} width={14} height={6} fill={FIRE_HI} {...LINE} />
      <path d="M59 23 L59 34" {...line(INK, 0.9)} />
      <path d="M55 34 C 55 38 63 38 63 34" {...line(INK, 1.4)} />
      <g transform="translate(59 41)">
        <rect x={-8} y={-5} width={16} height={9} rx={3} fill={OD} {...LINE} />
        <rect x={6} y={-2.4} width={20} height={3} fill={OD_DARK} {...THIN} />
        <Star x={-1} y={-0.6} r={2.6} />
      </g>
      <path d="M44 64 L44 54 L76 54 L82 64 Z" fill={OD} {...LINE} />
      <rect x={34} y={62} width={56} height={9} rx={4.5} fill="#3c4321" {...LINE} />
      {[42, 52, 62, 72, 82].map((wx) => <circle key={wx} cx={wx} cy={66.5} r={3.4} fill={OD_LIGHT} {...THIN} />)}
      <path d="M30 48 L36 52 M32 44 L38 46 M88 46 L94 44 M90 50 L96 52" {...line(FIRE_HI, 1.2)} />
      <rect x={4} y={40} width={16} height={24} fill="#b9aa9c" {...LINE} />
      <rect x={7} y={44} width={10} height={6} fill={GLASS} {...THIN} />
    </g>
  );
}

function SupplyLinesArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#efe1d8" />
      <rect width={120} height={22} fill="#f6ebe4" />
      <path d="M-2 30 C 30 24 80 28 122 26 L122 74 L-2 74 Z" fill="#b9a27a" {...LINE} />
      <path d="M50 30 C 56 36 30 42 36 50 C 42 58 92 58 84 74 L40 74 C 46 62 12 60 18 50 C 24 40 44 36 44 30 Z" fill="#8a7860" {...THIN} />
      <path d="M47 32 C 50 38 30 42 30 50 C 30 58 72 60 64 74" fill="none" stroke={WHITE} strokeWidth={0.9} strokeDasharray="3 3" />
      <Truck x={47} y={30} s={0.24} />
      <Truck x={32} y={44} s={0.4} />
      <Truck x={62} y={62} s={0.62} />
      <Crate x={94} y={44} w={12} h={9} />
      <Crate x={104} y={50} w={12} h={9} fill="#b49c62" />
      <Crate x={98} y={36} w={11} h={8} fill="#b49c62" />
      <Bush x={14} y={34} s={0.5} />
      <Bush x={104} y={30} s={0.45} />
    </g>
  );
}

/** Manipulate (Economics): a thumb on the scales. */
function ScalesArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#f1d9d2" />
      <path d="M4 52 L20 40 L34 46 L50 26 L66 34 L82 14 L98 22 L116 10" {...line('#d6a89c', 1.6)} />
      <rect x={-2} y={62} width={124} height={12} fill="#7a3a2e" {...LINE} />
      <path d="M52 62 L68 62 L64 56 L56 56 Z" fill={STEEL_DARK} {...LINE} />
      <path d="M60 56 L60 14" {...line(INK, 2)} />
      <path d="M30 26 L90 12" {...line(INK, 2.4)} />
      <circle cx={60} cy={19} r={2} fill={FIRE_HI} {...THIN} />
      <path d="M30 26 L22 42 M30 26 L38 42 M90 12 L82 28 M90 12 L98 28" {...line(INK, 0.7)} />
      <path d="M18 42 C 18 48 42 48 42 42 Z" fill={STEEL_LIGHT} {...LINE} />
      <path d="M78 28 C 78 34 102 34 102 28 Z" fill={STEEL_LIGHT} {...LINE} />
      {[[26, 40], [30, 37], [34, 40]].map(([cx, cy]) => <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={4} ry={1.6} fill="#f2c230" {...THIN} />)}
      <ellipse cx={90} cy={26.4} rx={4} ry={1.6} fill="#f2c230" {...THIN} />
      <path d="M8 2 C 12 14 16 26 24 36 L28 34 C 22 24 20 14 16 2 Z" fill="#c9a483" {...LINE} />
    </g>
  );
}

function RequisitionArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#e8d2c8" />
      <Crate x={70} y={40} w={18} h={14} />
      <Crate x={88} y={40} w={18} h={14} fill="#b49c62" />
      <Crate x={79} y={26} w={18} h={14} fill="#b49c62" />
      <rect x={-2} y={54} width={124} height={20} fill="#7a4a3a" {...LINE} />
      <g transform="rotate(-6 36 36)">
        <rect x={16} y={8} width={38} height={54} rx={2} fill="#8a6a4a" {...LINE} />
        <rect x={20} y={14} width={30} height={44} fill={PAPER} {...THIN} />
        <rect x={28} y={5} width={14} height={6} rx={1} fill={STEEL} {...THIN} />
        {[20, 27, 34, 41].map((ly) => (
          <g key={ly}>
            <rect x={23} y={ly} width={3.4} height={3.4} {...line(INK, 0.6)} />
            <path d={`M29 ${ly + 1.8} L46 ${ly + 1.8}`} {...line('#9a9080', 0.7)} />
          </g>
        ))}
        <path d="M23.6 21.6 L25 23 L27.6 19.4 M23.6 28.6 L25 30 L27.6 26.4" {...line('#2c6644', 0.9)} />
        <rect x={30} y={45} width={16} height={9} rx={1} {...line(BRICK, 1.4)} transform="rotate(-10 38 50)" />
      </g>
      <g transform="translate(58 30)">
        <rect x={-5} y={10} width={14} height={4} rx={1} fill={BRICK} {...THIN} />
        <rect x={-1} y={0} width={6} height={10} fill={WOOD} {...THIN} />
        <circle cx={2} cy={-2} r={4} fill={WOOD} {...THIN} />
      </g>
    </g>
  );
}

function Missile({ x, y, band }: { x: number; y: number; band: string }) {
  return (
    <g transform={place(x, y)}>
      <path d="M0 -26 C 3.6 -20 4 -14 4 -6 L4 8 L-4 8 L-4 -6 C-4 -14 -3.6 -20 0 -26 Z" fill={STEEL_LIGHT} {...LINE} />
      <rect x={-4} y={-8} width={8} height={3} fill={band} />
      <path d="M-4 2 L-9 10 L-4 8 Z M4 2 L9 10 L4 8 Z" fill={band} {...THIN} />
      <polygon points="-3,8 3,8 0,17" fill={FIRE} />
      <polygon points="-1.6,8 1.6,8 0,13" fill={FIRE_HI} />
    </g>
  );
}

function ArmsRaceArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#f3dcd0" />
      <rect width={120} height={24} fill="#f8e8e0" />
      <path d="M40 74 C 40 62 38 52 38 46 M80 74 C 80 64 82 56 82 50" {...line('#e9e3da', 7)} />
      <Puff x={38} y={66} s={1.4} />
      <Puff x={82} y={66} s={1.3} fill="#d7d2c8" />
      <rect x={-2} y={64} width={124} height={10} fill="#8a5a4a" {...LINE} />
      <Missile x={38} y={36} band="#c8452f" />
      <Missile x={82} y={30} band={ROUNDEL} />
      <Inked d="M58 30 L58 12 M54 16 L58 12 L62 16" color={FIRE_HI} width={1.6} />
      <rect x={10} y={40} width={8} height={24} fill={STEEL_DARK} {...LINE} />
      <rect x={102} y={36} width={8} height={28} fill={STEEL_DARK} {...LINE} />
    </g>
  );
}

function ProductionSurgeArt() {
  return (
    <g>
      <rect width={120} height={72} fill="#ead8cf" />
      <path d="M0 0 L0 16 L24 4 L24 16 L48 4 L48 16 L72 4 L72 16 L96 4 L96 16 L120 4 L120 0 Z" fill="#8a6a60" />
      <path d="M24 4 L24 16 M48 4 L48 16 M72 4 L72 16 M96 4 L96 16" {...line(GLASS, 1.4)} />
      {[14, 46, 78, 110].map((lx) => (
        <g key={lx}>
          <path d={`M${lx} 16 L${lx} 22`} {...line(INK, 0.8)} />
          <path d={`M${lx - 4} 22 L${lx + 4} 22 L${lx + 2} 26 L${lx - 2} 26 Z`} fill={STEEL_DARK} />
          <polygon points={`${lx - 2},26 ${lx + 2},26 ${lx + 9},50 ${lx - 9},50`} fill={LAMPLIGHT} opacity={0.18} />
        </g>
      ))}
      <rect x={-2} y={54} width={124} height={8} fill="#3a3a3a" {...LINE} />
      {Array.from({ length: 13 }, (_, i) => <circle key={i} cx={2 + i * 10} cy={58} r={2.4} fill="#6a6a6a" {...THIN} />)}
      <rect x={-2} y={62} width={124} height={12} fill="#7a5a4a" {...LINE} />
      <Tank x={18} y={42} s={0.38} />
      <Tank x={58} y={42} s={0.38} fill={OD_LIGHT} />
      <Tank x={98} y={42} s={0.38} />
      <Burst x={78} y={46} r={3.4} fill={FIRE_HI} inner={0.4} points={8} outline={false} />
      <Burst x={38} y={44} r={2.6} fill={FIRE_HI} inner={0.4} points={8} outline={false} />
    </g>
  );
}

// Kept for the Diplomacy banner.
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
          <path d="M15.6 8.4 C 14.6 7 13.4 6.6 12 6.6 C 9.6 6.6 8.2 7.8 8.2 9.6 C 8.2 13.6 15.8 11.4 15.8 15.2 C 15.8 17 14.2 18.2 12 18.2 C 10.2 18.2 8.8 17.6 8 16.2" {...line(WHITE, 2)} />
          <path d="M12 4.6 L12 20" {...line(WHITE, 1.6)} />
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
