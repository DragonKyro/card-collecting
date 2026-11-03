// Machi Koro card art — one small toy-town scene per building in a 120×80 box,
// plus the round symbol badges. Flat fills only (no <defs>, no ids), so any
// number of cards can share a page without clashes. Every scene is sky →
// ground strip (y ≈ 62–80) → the building, composed from the helpers below.

import type { JSX, ReactNode } from 'react';
import type { MkArtId, MkSymbol } from './types';

const INK = '#3b2a20';
const FONT = 'ui-sans-serif, system-ui, sans-serif';

const SKY = '#d6effa';
const GRASS = '#97d36e';
const DIRT = '#d8b07a';
const PAVE = '#d6cfc3';
const GLASS = '#aadff3';
const WOOD = '#b0703c';
const DARKWOOD = '#7a4a26';
const GOLD = '#f6c443';
const CREAM = '#fff6e2';
const WHITE = '#ffffff';
const RED = '#e2513f';
const GREEN = '#4fae55';
const LEAF = '#5cb85c';
const STEEL = '#8b95a1';

/** Outline shared by every shape. */
const LINE = { stroke: INK, strokeWidth: 1.3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
/** Thinner outline for small details. */
const THIN = { stroke: INK, strokeWidth: 0.8, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
/** A detail stroke with no fill. */
const line = (color: string = INK, width = 1.3) =>
  ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

export function CardArt({ art }: { art: MkArtId }): JSX.Element {
  return (
    <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {scene(art)}
    </svg>
  );
}

function scene(art: MkArtId): JSX.Element {
  switch (art) {
    case 'wheatField': return <WheatField />;
    case 'ranch': return <Ranch />;
    case 'sushiBar': return <SushiBar />;
    case 'bakery': return <Bakery />;
    case 'cafe': return <Cafe />;
    case 'vineyard': return <Vineyard />;
    case 'flowerGarden': return <FlowerGarden />;
    case 'convenienceStore': return <ConvenienceStore />;
    case 'forest': return <Forest />;
    case 'flowerShop': return <FlowerShop />;
    case 'businessCenter': return <BusinessCenter />;
    case 'stadium': return <Stadium />;
    case 'tvStation': return <TvStation />;
    case 'cornField': return <CornField />;
    case 'cheeseFactory': return <CheeseFactory />;
    case 'furnitureFactory': return <FurnitureFactory />;
    case 'hamburgerStand': return <HamburgerStand />;
    case 'shoppingDistrict': return <ShoppingDistrict />;
    case 'mine': return <Mine />;
    case 'winery': return <Winery />;
    case 'familyRestaurant': return <FamilyRestaurant />;
    case 'appleOrchard': return <AppleOrchard />;
    case 'foodWarehouse': return <FoodWarehouse />;
    case 'fruitMarket': return <FruitMarket />;
    case 'trainStation': return <TrainStation />;
    case 'shoppingMall': return <ShoppingMall />;
    case 'amusementPark': return <AmusementPark />;
    case 'radioTower': return <RadioTower />;
    case 'airport': return <Airport />;
    case 'museum': return <Museum />;
    case 'exhibitHall': return <ExhibitHall />;
    case 'temple': return <Temple />;
    case 'loanOffice': return <LoanOffice />;
    case 'park': return <Park />;
    case 'techStartup': return <TechStartup />;
    case 'frenchRestaurant': return <FrenchRestaurant />;
    case 'launchPad': return <LaunchPad />;
    case 'sodaPlant': return <SodaPlant />;
    case 'charterhouse': return <Charterhouse />;
    case 'privateClub': return <PrivateClub />;
    case 'forge': return <Forge />;
    case 'cityHall': return <CityHall />;
    case 'renovationCompany': return <RenovationCompany />;
    case 'farmersMarket': return <FarmersMarket />;
    case 'movingCompany': return <MovingCompany />;
    case 'observatory': return <Observatory />;
    case 'publisher': return <Publisher />;
    case 'pizzaJoint': return <PizzaJoint />;
    case 'mackerelBoat': return <MackerelBoat />;
    case 'tunaBoat': return <TunaBoat />;
    case 'taxOffice': return <TaxOffice />;
    case 'generalStore': return <GeneralStore />;
    case 'demolitionCompany': return <DemolitionCompany />;
    case 'harbor': return <Harbor />;
  }
}

// ---------------------------------------------------------------------------
// Helpers

type XY = { x: number; y: number };

function Box({ x, y, w, h, fill, rx = 0, thin = false }: XY & { w: number; h: number; fill: string; rx?: number; thin?: boolean }) {
  return <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} {...(thin ? THIN : LINE)} />;
}

function Shape({ d, fill, thin = false }: { d: string; fill: string; thin?: boolean }) {
  return <path d={d} fill={fill} {...(thin ? THIN : LINE)} />;
}

function Sky({ color = SKY, children }: { color?: string; children?: ReactNode }) {
  return <g><rect width={120} height={80} fill={color} />{children}</g>;
}

function Ground({ y = 64, fill = GRASS }: { y?: number; fill?: string }) {
  return <rect x={-2} y={y} width={124} height={84 - y} fill={fill} {...LINE} />;
}

function Cloud({ x, y, s = 1 }: XY & { s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={WHITE} opacity={0.95}>
      <ellipse cx={0} cy={2} rx={10} ry={3.5} />
      <circle cx={-3.5} cy={0} r={4} />
      <circle cx={2.5} cy={-1} r={5} />
    </g>
  );
}

function Sun({ x, y, r = 6 }: XY & { r?: number }) {
  return (
    <g>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d={`M${x} ${y - r - 1.8} V${y - r - 4.5}`} transform={`rotate(${a} ${x} ${y})`} {...line('#f2a93b', 1.4)} />
      ))}
      <circle cx={x} cy={y} r={r} fill="#ffd54a" {...LINE} />
    </g>
  );
}

/** Rolling hill band behind the scene. */
function Hills({ y = 50, fill = '#b5dc8a' }: { y?: number; fill?: string }) {
  return <Shape d={`M-2 ${y} Q30 ${y - 12} 62 ${y - 2} T122 ${y - 6} V70 H-2 Z`} fill={fill} />;
}

function Windows({ x, y, cols, rows = 1, w = 5, h = 5, gx = 3, gy = 3, fill = GLASS }: XY & {
  cols: number; rows?: number; w?: number; h?: number; gx?: number; gy?: number; fill?: string;
}) {
  const panes: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      panes.push(<rect key={`${r}.${c}`} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx={0.6} fill={fill} {...THIN} />);
    }
  }
  return <g>{panes}</g>;
}

/** Striped awning with a scalloped hem. */
function Awning({ x, y, w, h = 6, colors, n }: XY & { w: number; h?: number; colors: [string, string]; n?: number }) {
  const count = n ?? Math.max(3, Math.round(w / 7));
  const sw = w / count;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <path key={i} d={`M${x + i * sw} ${y} h${sw} v${h} a${sw / 2} ${sw / 2.4} 0 0 1 ${-sw} 0 Z`} fill={colors[i % 2]} {...THIN} />
      ))}
      <path d={`M${x - 1} ${y} H${x + w + 1}`} {...line(INK, 1.6)} />
    </g>
  );
}

function Gable({ x, y, w, h, fill }: XY & { w: number; h: number; fill: string }) {
  return <Shape d={`M${x} ${y + h} L${x + w / 2} ${y} L${x + w} ${y + h} Z`} fill={fill} />;
}

function Door({ x, y, w, h, fill = DARKWOOD }: XY & { w: number; h: number; fill?: string }) {
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} thin />
      <circle cx={x + w - 2.2} cy={y + h * 0.55} r={0.9} fill={GOLD} />
    </g>
  );
}

/** Arched doorway / window, bottom at y + h. */
function Arch({ x, y, w, h, fill }: XY & { w: number; h: number; fill: string }) {
  const r = w / 2;
  return <Shape d={`M${x} ${y + h} V${y + r} A${r} ${r} 0 0 1 ${x + w} ${y + r} V${y + h} Z`} fill={fill} thin />;
}

function Coin({ x, y, r = 5, label }: XY & { r?: number; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={GOLD} {...LINE} />
      <circle cx={x} cy={y} r={r * 0.7} {...line('#d99a1e', Math.max(0.7, r * 0.12))} />
      {label && (
        <text x={x} y={y + r * 0.42} textAnchor="middle" fontSize={r * 1.2} fontWeight={800} fontFamily={FONT} fill="#9a6410">{label}</text>
      )}
    </g>
  );
}

function Tree({ x, y, r = 9, fill = LEAF }: XY & { r?: number; fill?: string }) {
  return (
    <g>
      <Box x={x - r * 0.17} y={y - r * 1.3} w={r * 0.34} h={r * 1.3} fill={WOOD} thin />
      <circle cx={x} cy={y - r * 1.55} r={r} fill={fill} {...LINE} />
      <path d={`M${x - r * 0.55} ${y - r * 1.9} q${r * 0.25} ${-r * 0.35} ${r * 0.6} ${-r * 0.4}`} {...line(WHITE, 1.1)} opacity={0.45} />
    </g>
  );
}

function Pine({ x, y, h = 30, fill = '#3f9a5a' }: XY & { h?: number; fill?: string }) {
  const tiers = [0, 1, 2].map((t) => {
    const top = y - h + t * h * 0.2;
    const bottom = top + h * 0.42;
    const half = h * (0.17 + t * 0.06);
    return <Shape key={t} d={`M${x} ${top} L${x + half} ${bottom} H${x - half} Z`} fill={fill} />;
  });
  return (
    <g>
      <Box x={x - h * 0.05} y={y - h * 0.2} w={h * 0.1} h={h * 0.2} fill={DARKWOOD} thin />
      {tiers}
    </g>
  );
}

function Bush({ x, y, r = 5, fill = LEAF }: XY & { r?: number; fill?: string }) {
  return <Shape d={`M${x - r * 1.5} ${y} a${r * 0.8} ${r * 0.8} 0 0 1 ${r * 0.9} ${-r * 0.9} a${r} ${r} 0 0 1 ${r * 1.4} ${-r * 0.2} a${r * 0.8} ${r * 0.8} 0 0 1 ${r * 0.7} ${r * 1.1} Z`} fill={fill} thin />;
}

function Smoke({ x, y, s = 1 }: XY & { s?: number }) {
  return (
    <g fill="#eef0f2" {...THIN}>
      <circle cx={x} cy={y} r={2.6 * s} />
      <circle cx={x + 3 * s} cy={y - 5 * s} r={3.4 * s} />
      <circle cx={x + 7.5 * s} cy={y - 10.5 * s} r={4 * s} />
    </g>
  );
}

/** Tapering steel lattice mast: two rails with X bracing. */
function LatticeMast({ x, top, bottom, wTop, wBottom, color = STEEL }: {
  x: number; top: number; bottom: number; wTop: number; wBottom: number; color?: string;
}) {
  const hw = (y: number) => wTop / 2 + ((y - top) / (bottom - top)) * ((wBottom - wTop) / 2);
  const n = 6;
  const step = (bottom - top) / n;
  let braces = '';
  for (let i = 0; i < n; i++) {
    const y0 = top + i * step;
    const y1 = y0 + step;
    braces += ` M${x - hw(y0)} ${y0} L${x + hw(y1)} ${y1} M${x + hw(y0)} ${y0} L${x - hw(y1)} ${y1} M${x - hw(y1)} ${y1} H${x + hw(y1)}`;
  }
  const rails = `M${x - wTop / 2} ${top} L${x - wBottom / 2} ${bottom} M${x + wTop / 2} ${top} L${x + wBottom / 2} ${bottom}`;
  return (
    <g>
      <path d={braces} {...line(color, 0.9)} />
      <path d={rails} {...line(INK, 2.6)} />
      <path d={rails} {...line(color, 1.3)} />
    </g>
  );
}

function Crate({ x, y, s = 12, fill = '#c98b4f' }: XY & { s?: number; fill?: string }) {
  return (
    <g>
      <Box x={x} y={y} w={s} h={s} fill={fill} thin />
      <path d={`M${x} ${y + s / 3} H${x + s} M${x} ${y + (2 * s) / 3} H${x + s}`} {...line('#8a5a32', 0.8)} />
      <path d={`M${x + 1.2} ${y + 1.2} L${x + s - 1.2} ${y + s - 1.2}`} {...line('#8a5a32', 1)} />
    </g>
  );
}

/** A heap of round fruit sitting on y. */
function Pile({ x, y, w, color, r = 2.4 }: XY & { w: number; color: string; r?: number }) {
  const n = Math.max(2, Math.floor(w / (r * 2)));
  const step = w / n;
  const balls: JSX.Element[] = [];
  for (let i = 0; i < n; i++) balls.push(<circle key={`a${i}`} cx={x + step * (i + 0.5)} cy={y - r * 0.8} r={r} fill={color} {...THIN} />);
  for (let i = 0; i < n - 1; i++) balls.push(<circle key={`b${i}`} cx={x + step * (i + 1)} cy={y - r * 2.3} r={r} fill={color} {...THIN} />);
  return <g>{balls}</g>;
}

function Grapes({ x, y, s = 1 }: XY & { s?: number }) {
  const at: [number, number][] = [[-3, 0], [0, 0], [3, 0], [-1.5, 2.6], [1.5, 2.6], [0, 5.2]];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -1 q1 -3 3.5 -3.5 q-0.5 3 -3.5 3.5" fill={GREEN} {...THIN} />
      {at.map(([dx, dy], i) => <circle key={i} cx={dx} cy={dy + 1.5} r={1.9} fill="#7d4fa8" {...THIN} />)}
    </g>
  );
}

function Tulip({ x, y, h, color, s = 1 }: XY & { h: number; color: string; s?: number }) {
  return (
    <g>
      <path d={`M${x} ${y} V${y - h}`} {...line('#3f8f3f', 1.4)} />
      <path d={`M${x} ${y} q${-5 * s} ${-3 * s} ${-4 * s} ${-8 * s} q${3 * s} ${3 * s} ${4 * s} ${8 * s}`} fill={GREEN} {...THIN} />
      <g transform={`translate(${x} ${y - h}) scale(${s})`}>
        <path d="M-3.5 -5.5 V-1 Q0 3 3.5 -1 V-5.5 L1.8 -3 L0 -6.5 L-1.8 -3 Z" fill={color} {...THIN} />
      </g>
    </g>
  );
}

function WheatEar({ x, y, s = 1, color = '#f2c14e' }: XY & { s?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 4, 8].map((dy) => (
        <g key={dy}>
          <ellipse cx={-2} cy={4.5 + dy} rx={1.8} ry={3} transform={`rotate(-28 -2 ${4.5 + dy})`} fill={color} {...THIN} />
          <ellipse cx={2} cy={4.5 + dy} rx={1.8} ry={3} transform={`rotate(28 2 ${4.5 + dy})`} fill={color} {...THIN} />
        </g>
      ))}
      <ellipse cx={0} cy={1.8} rx={1.6} ry={3} fill={color} {...THIN} />
    </g>
  );
}

function Star({ x, y, r, fill = GOLD, thin = true }: XY & { r: number; fill?: string; thin?: boolean }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`;
  });
  return <polygon points={pts.join(' ')} fill={fill} {...(thin ? THIN : LINE)} />;
}

function Clock({ x, y, r }: XY & { r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={WHITE} {...LINE} />
      <path d={`M${x} ${y - r * 0.65} V${y} H${x + r * 0.5}`} {...line(INK, 1)} />
    </g>
  );
}

function Pennant({ x, y, h = 7, color = RED }: XY & { h?: number; color?: string }) {
  return (
    <g>
      <path d={`M${x} ${y} V${y - h}`} {...line(INK, 1)} />
      <Shape d={`M${x} ${y - h} L${x + 6} ${y - h + 2} L${x} ${y - h + 4} Z`} fill={color} thin />
    </g>
  );
}

/** Zig-zag bracing between two vertical rails. */
function bracing(x: number, w: number, y0: number, y1: number, step: number): string {
  let d = `M${x} ${y0}`;
  let right = true;
  for (let y = y0 + step; y <= y1 + 0.01; y += step) {
    d += ` L${right ? x + w : x} ${y}`;
    right = !right;
  }
  return d;
}

/** Shopping bag, base centre at (x, y). */
function Bag({ x, y, color, s = 1 }: XY & { color: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-2.2 -9 V-11 a2.2 2.2 0 0 1 4.4 0 V-9" {...line(INK, 1)} />
      <Shape d="M-4.5 -9 H4.5 L5.5 0 H-5.5 Z" fill={color} thin />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Primary industry (fields, ranches, mines)

function WheatField() {
  const back = [6, 20, 34, 48, 62, 76, 90, 104, 118];
  const front = [13, 27, 41, 55, 69, 83, 97, 111];
  return (
    <g>
      <Sky><Sun x={100} y={15} r={7} /><Cloud x={30} y={14} /></Sky>
      <Hills y={50} />
      <Ground y={58} fill="#e9c46a" />
      {back.map((x) => (
        <g key={x}>
          <path d={`M${x} 66 V48`} {...line('#c08f2e', 1.2)} />
          <WheatEar x={x} y={40} s={0.75} color="#f4cf63" />
        </g>
      ))}
      {front.map((x, i) => (
        <g key={x}>
          <path d={`M${x} 80 V${48 + (i % 2) * 4}`} {...line('#b8862a', 1.6)} />
          <WheatEar x={x} y={34 + (i % 2) * 4} s={1.15} />
        </g>
      ))}
    </g>
  );
}

function Cow({ x, y }: XY) {
  return (
    <g>
      <path d={`M${x - 13} ${y - 3} q-4 3 -3 9`} {...line(INK, 1.2)} />
      {[-10, -5, 4, 9].map((dx) => (
        <g key={dx}>
          <Box x={x + dx - 1.4} y={y + 4} w={2.8} h={8} fill={WHITE} thin />
          <Box x={x + dx - 1.4} y={y + 10.5} w={2.8} h={1.8} fill={INK} thin />
        </g>
      ))}
      <ellipse cx={x} cy={y} rx={14} ry={7.5} fill={WHITE} {...LINE} />
      <ellipse cx={x - 4} cy={y - 2} rx={4.5} ry={3} fill="#2f2a2a" />
      <ellipse cx={x + 6} cy={y + 2.5} rx={3} ry={2.4} fill="#2f2a2a" />
      <ellipse cx={x - 9} cy={y + 2} rx={2} ry={1.8} fill="#2f2a2a" />
      <ellipse cx={x + 1} cy={y + 7} rx={2.6} ry={1.5} fill="#f7b6b6" {...THIN} />
      <path d={`M${x + 13} ${y - 12} q-1 -3 1 -4 M${x + 19} ${y - 12} q1 -3 -1 -4`} {...line('#e9dcc0', 1.6)} />
      <ellipse cx={x + 11.5} cy={y - 9} rx={2.4} ry={1.3} fill="#2f2a2a" transform={`rotate(-20 ${x + 11.5} ${y - 9})`} />
      <ellipse cx={x + 20.5} cy={y - 9} rx={2.4} ry={1.3} fill="#2f2a2a" transform={`rotate(20 ${x + 20.5} ${y - 9})`} />
      <ellipse cx={x + 16} cy={y - 7} rx={5} ry={5.8} fill={WHITE} {...LINE} />
      <ellipse cx={x + 16} cy={y - 3} rx={4.2} ry={2.8} fill="#f7b6b6" {...THIN} />
      <circle cx={x + 14.5} cy={y - 3} r={0.6} fill={INK} />
      <circle cx={x + 17.5} cy={y - 3} r={0.6} fill={INK} />
      <circle cx={x + 14} cy={y - 8} r={0.9} fill={INK} />
      <circle cx={x + 18} cy={y - 8} r={0.9} fill={INK} />
    </g>
  );
}

function Ranch() {
  return (
    <g>
      <Sky><Cloud x={92} y={12} /><Cloud x={70} y={22} s={0.6} /></Sky>
      <Hills y={50} />
      <Ground y={60} />
      {[68, 78, 88, 98, 108, 118].map((x) => <Box key={x} x={x - 1.2} y={48} w={2.4} h={14} fill={CREAM} thin />)}
      <path d="M64 51 H122 M64 56 H122" {...line(INK, 1)} />
      <path d="M64 51 H122 M64 56 H122" {...line(CREAM, 0.6)} />
      <Box x={14} y={34} w={46} h={32} fill="#d9473b" />
      <Shape d="M10 37 L18 22 L37 12 L56 22 L64 37 Z" fill="#9b2f2b" />
      <path d="M12 36 L19 23.5 L37 14.5 L55 23.5 L62 36" {...line(CREAM, 1.4)} />
      <Box x={32} y={23} w={10} h={8} fill={CREAM} thin />
      <Box x={27} y={44} w={20} h={22} fill="#b93a31" />
      <path d="M27 44 L47 66 M47 44 L27 66" {...line(CREAM, 1.8)} />
      <Box x={27} y={44} w={20} h={22} fill="none" />
      <Box x={18} y={42} w={6} h={6} fill={CREAM} thin />
      <Box x={50} y={42} w={6} h={6} fill={CREAM} thin />
      <Cow x={88} y={58} />
    </g>
  );
}

function CornStalk({ x, y, h }: XY & { h: number }) {
  const top = y - h;
  const leaf = (at: number, dir: 1 | -1) => {
    const ly = y - h * at;
    return <Shape d={`M${x} ${ly} q${dir * 8} -8 ${dir * 14} -2 q${-dir * 7} -2 ${-dir * 14} 6 Z`} fill="#6cbf4f" thin />;
  };
  return (
    <g>
      <Box x={x - 1.4} y={top} w={2.8} h={h} fill="#5aa845" thin />
      {leaf(0.2, -1)}
      {leaf(0.42, 1)}
      {leaf(0.68, -1)}
      {leaf(0.85, 1)}
      <g transform={`rotate(18 ${x + 3} ${y - h * 0.55})`}>
        <ellipse cx={x + 3} cy={y - h * 0.55} rx={2.8} ry={6.5} fill="#ffd94a" {...THIN} />
        <path d={`M${x + 3} ${y - h * 0.55 - 5} V${y - h * 0.55 + 5} M${x + 1} ${y - h * 0.55 - 3} V${y - h * 0.55 + 4} M${x + 5} ${y - h * 0.55 - 3} V${y - h * 0.55 + 4}`} {...line('#e0a92a', 0.6)} />
        <Shape d={`M${x + 0.5} ${y - h * 0.55 + 6} q-2 -6 1 -11 q0 6 3 11 Z`} fill="#8fd16a" thin />
      </g>
      <path d={`M${x} ${top} l-3 -5 M${x} ${top} l0 -6 M${x} ${top} l3 -5`} {...line('#c9963a', 1.2)} />
    </g>
  );
}

function CornField() {
  return (
    <g>
      <Sky><Cloud x={24} y={10} s={0.9} /><Cloud x={84} y={8} s={0.8} /></Sky>
      <Hills y={52} fill="#c4e29a" />
      <Ground y={62} fill={DIRT} />
      <path d="M-2 70 H122 M-2 76 H122" {...line('#b88c55', 1)} />
      {[14, 34, 54, 74, 94, 114].map((x, i) => <CornStalk key={x} x={x} y={74} h={i % 2 ? 50 : 56} />)}
    </g>
  );
}

function Vineyard() {
  const backLeaves = Array.from({ length: 19 }, (_, i) => 6 + i * 6);
  const frontLeaves = Array.from({ length: 15 }, (_, i) => 4 + i * 8);
  return (
    <g>
      <Sky><Sun x={18} y={14} /><Cloud x={90} y={12} /></Sky>
      <Hills y={44} fill="#a9d47c" />
      <Ground y={60} fill={DIRT} />
      {[12, 60, 108].map((x) => <Box key={x} x={x - 1} y={33} w={2} h={18} fill={WOOD} thin />)}
      {backLeaves.map((x) => <circle key={x} cx={x} cy={37} r={3.8} fill="#6cbf5a" {...THIN} />)}
      {[22, 44, 76, 96].map((x) => <Grapes key={x} x={x} y={40} s={0.7} />)}
      {[8, 60, 112].map((x) => <Box key={x} x={x - 1.6} y={46} w={3.2} h={26} fill={WOOD} thin />)}
      {frontLeaves.map((x) => <circle key={x} cx={x} cy={51} r={5.4} fill="#4fa64a" {...THIN} />)}
      {[18, 34, 48, 72, 88, 102].map((x) => <Grapes key={x} x={x} y={55} s={1.15} />)}
    </g>
  );
}

function FlowerGarden() {
  const colors = ['#e2453f', '#f6c443', '#f28bb0', '#8e5bc4', '#f08a24'];
  return (
    <g>
      <Sky><Cloud x={26} y={12} /><Cloud x={96} y={16} s={0.8} /></Sky>
      {Array.from({ length: 18 }, (_, i) => (
        <Shape key={i} d={`M${2 + i * 7} 54 V40 l2 -2.5 l2 2.5 V54 Z`} fill={WHITE} thin />
      ))}
      <path d="M-2 43.5 H122 M-2 50 H122" {...line(INK, 0.9)} />
      <Ground y={54} />
      <Box x={6} y={56} w={108} h={6} rx={3} fill="#9a6a44" />
      {Array.from({ length: 9 }, (_, i) => <Tulip key={i} x={12 + i * 12} y={58} h={11} color={colors[i % 5]} s={0.8} />)}
      <Box x={2} y={70} w={116} h={9} rx={4} fill="#9a6a44" />
      {Array.from({ length: 8 }, (_, i) => <Tulip key={i} x={10 + i * 14.3} y={72} h={13} color={colors[(i + 2) % 5]} s={1.15} />)}
    </g>
  );
}

function Forest() {
  return (
    <g>
      <Sky><Sun x={104} y={14} /><Cloud x={20} y={14} /></Sky>
      <Hills y={52} fill="#b0d98a" />
      <Ground y={62} fill="#86c96a" />
      <Pine x={8} y={70} h={24} fill="#5aaa62" />
      <Pine x={112} y={70} h={26} fill="#5aaa62" />
      <Pine x={25} y={68} h={38} fill="#3f8f55" />
      <Pine x={96} y={68} h={40} fill="#3f8f55" />
      <Pine x={42} y={71} h={48} fill="#2f7e4a" />
      <Pine x={79} y={71} h={50} fill="#2f7e4a" />
      <Pine x={60} y={76} h={62} fill="#3a9a58" />
      <g>
        <Box x={30} y={72} w={2.4} h={4} fill={CREAM} thin />
        <path d="M27.5 72.5 a3.7 3.2 0 0 1 7.4 0 Z" fill={RED} {...THIN} />
      </g>
    </g>
  );
}

function AppleOrchard() {
  const apples: [number, number][] = [[-9, -4], [3, -10], [10, 1], [-2, 4], [-11, 7], [7, 10], [-4, -12], [12, -7]];
  const tree = (x: number, y: number, r: number, fill: string) => (
    <g>
      <Tree x={x} y={y} r={r} fill={fill} />
      {apples.map(([dx, dy], i) => (
        <circle key={i} cx={x + (dx * r) / 18} cy={y - r * 1.55 + (dy * r) / 18} r={r * 0.13} fill="#e23b3b" {...THIN} />
      ))}
    </g>
  );
  return (
    <g>
      <Sky><Sun x={104} y={13} /><Cloud x={58} y={10} s={0.8} /></Sky>
      <Hills y={50} />
      <Ground y={60} />
      {tree(60, 62, 12, '#6cbf5a')}
      {tree(26, 74, 18, '#4fae4f')}
      {tree(94, 74, 18, '#4fae4f')}
      <Shape d="M51 68 H69 L67 77 H53 Z" fill="#c98b4f" thin />
      <path d="M52 71.5 H68 M53 74.5 H67" {...line('#8a5a32', 0.7)} />
      <Pile x={52} y={68} w={16} color="#e23b3b" r={2.2} />
      <circle cx={44} cy={76} r={2} fill="#e23b3b" {...THIN} />
      <circle cx={76} cy={77} r={2} fill="#e23b3b" {...THIN} />
    </g>
  );
}

function Mine() {
  return (
    <g>
      <Sky><Cloud x={102} y={12} /><Cloud x={18} y={20} s={0.7} /></Sky>
      <Shape d="M-2 64 L20 30 L32 38 L56 10 L76 30 L88 22 L122 64 Z" fill="#a89277" />
      <Shape d="M50 17 L56 10 L63 18 L58 16 L54 19 Z" fill="#efe8dc" thin />
      <path d="M28 40 L36 50 M80 30 L92 42 M66 26 L70 34" {...line('#8a7660', 1.1)} />
      <Ground y={62} fill="#c9ab84" />
      <Box x={44} y={38} w={32} h={26} fill="#2a211c" />
      <Box x={40} y={37} w={5} h={27} fill={WOOD} />
      <Box x={75} y={37} w={5} h={27} fill={WOOD} />
      <Box x={36} y={32} w={48} h={6} fill={WOOD} />
      <path d="M52 64 L44 80 M68 64 L78 80" {...line('#6b737d', 1.6)} />
      {[67, 72, 77].map((y) => {
        const t = (y - 64) / 16;
        return <path key={y} d={`M${52 - 8 * t - 2} ${y} H${68 + 10 * t + 2}`} {...line(DARKWOOD, 1.6)} />;
      })}
      <Shape d="M84 50 H110 L106 62 H88 Z" fill="#7d8792" />
      {[[89, 49], [94, 47], [99, 48.5], [104, 49.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="#5d5d66" {...THIN} />)}
      <polygon points="96,44 99,47 96,50 93,47" fill="#7fd3f0" {...THIN} />
      <polygon points="104,45 106.5,47 104,49 101.5,47" fill={GOLD} {...THIN} />
      <circle cx={91} cy={64} r={3} fill="#3a3a40" {...THIN} />
      <circle cx={103} cy={64} r={3} fill="#3a3a40" {...THIN} />
      <g transform="rotate(-30 20 60)">
        <path d="M20 50 V72" {...line(DARKWOOD, 2.2)} />
        <path d="M12 52 Q20 46 28 52" {...line('#6b737d', 2.4)} />
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Shops and restaurants

function SushiBar() {
  return (
    <g>
      <Sky color="#fbeee0"><Cloud x={14} y={12} s={0.8} /><Cloud x={104} y={10} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={18} y={38} w={84} h={28} fill={CREAM} />
      {[23, 81].map((x) => (
        <g key={x}>
          <Box x={x} y={44} w={16} h={12} fill="#f4e3c2" thin />
          <path d={`M${x + 5.3} 44 V56 M${x + 10.6} 44 V56 M${x} 50 H${x + 16}`} {...line(DARKWOOD, 0.8)} />
        </g>
      ))}
      <Box x={46} y={50} w={28} h={16} fill={DARKWOOD} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <Box x={45 + i * 10} y={41} w={10} h={13} fill="#d63c3c" thin />
          <circle cx={50 + i * 10} cy={47} r={2} fill={WHITE} />
        </g>
      ))}
      <Shape d="M6 41 Q18 39 22 28 H98 Q102 39 114 41 Z" fill="#4c5566" />
      <path d="M14 39 Q22 36 25 30 M106 39 Q98 36 95 30" {...line('#6a7487', 1.2)} />
      <Box x={22} y={25} w={76} h={4} fill="#363d4a" />
      <Box x={38} y={9} w={44} h={15} rx={2} fill="#e9c99a" />
      <ellipse cx={60} cy={18.5} rx={10} ry={3.5} fill={WHITE} {...THIN} />
      <path d="M50 17 Q50 12 60 12.5 Q70 12 70 16 Q70 18 66 17.5 Q60 16.5 54 18 Q50 19 50 17 Z" fill="#f7894f" {...THIN} />
      <path d="M55 13.5 l2 3.5 M60 13 l2 3.5 M65 13.3 l1.5 3" {...line('#fde1c8', 1)} />
      <ellipse cx={12} cy={48} rx={3.5} ry={4.5} fill="#e04b4b" {...THIN} />
      <ellipse cx={108} cy={48} rx={3.5} ry={4.5} fill="#e04b4b" {...THIN} />
      <path d="M12 41 V43.5 M108 41 V43.5" {...line(INK, 0.8)} />
    </g>
  );
}

function Bakery() {
  return (
    <g>
      <Sky><Cloud x={14} y={12} /><Cloud x={104} y={16} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={16} y={32} w={88} h={34} fill="#fde3b5" />
      <Box x={13} y={29} w={94} h={5} fill="#8a5a32" />
      <Awning x={16} y={38} w={88} colors={['#8a5a32', '#f6e2c0']} n={11} />
      <Box x={21} y={50} w={42} h={14} fill={GLASS} thin />
      <path d="M21 60 H63" {...line(DARKWOOD, 1)} />
      {[28, 39, 50].map((x) => <ellipse key={x} cx={x + 3} cy={57.5} rx={4.5} ry={2.4} fill="#d98f45" {...THIN} />)}
      <Door x={70} y={47} w={14} h={19} />
      <Box x={89} y={50} w={11} h={12} fill={GLASS} thin />
      <path d="M46 29 V24 M74 29 V24" {...line(INK, 1.6)} />
      <ellipse cx={60} cy={16} rx={25} ry={10} fill="#d98f45" {...LINE} />
      <path d="M44 12 Q47 17 44 21 M54 9 Q57 15 54 22 M64 9 Q67 15 64 22 M74 11 Q77 16 74 21" {...line('#f3cf93', 2)} />
    </g>
  );
}

function Cafe() {
  return (
    <g>
      <Sky color="#e3f4fa"><Cloud x={14} y={14} /><Cloud x={104} y={12} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={26} y={34} w={66} h={32} fill="#cfe9d4" />
      <Box x={23} y={30} w={72} h={5} fill="#3f7d5b" />
      <Awning x={26} y={39} w={66} colors={['#e04b4b', WHITE]} n={9} />
      <Box x={31} y={50} w={30} h={14} fill={GLASS} thin />
      <path d="M46 50 V64" {...line(INK, 0.8)} />
      <Door x={68} y={47} w={16} h={19} fill="#3f7d5b" />
      <Box x={71} y={50} w={10} h={7} fill={GLASS} thin />
      <path d="M53 9 Q51 6 53 3 M60 9 Q58 6 60 3 M67 9 Q65 6 67 3" {...line('#9aa3ad', 1.2)} />
      <ellipse cx={60} cy={27} rx={13} ry={2.6} fill={WHITE} {...LINE} />
      <circle cx={70} cy={18.5} r={3.4} {...line(INK, 3.2)} />
      <circle cx={70} cy={18.5} r={3.4} {...line(WHITE, 1.6)} />
      <Shape d="M50 13 H70 L68 23 Q60 27 52 23 Z" fill={WHITE} />
      <ellipse cx={60} cy={13} rx={10} ry={1.8} fill="#7a4a26" {...THIN} />
      <path d="M55 18 H65" {...line('#e04b4b', 1.6)} />
      <ellipse cx={106} cy={53} rx={7} ry={2} fill={WHITE} {...THIN} />
      <path d="M106 55 V66 M102 66 H110" {...line(INK, 1.2)} />
      <Shape d="M9 66 L10 58 H18 L19 66 Z" fill="#d0743c" thin />
      <circle cx={14} cy={53} r={5} fill={LEAF} {...THIN} />
    </g>
  );
}

function ConvenienceStore() {
  return (
    <g>
      <Sky><Cloud x={18} y={14} /><Cloud x={100} y={12} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <path d="M59 30 V22 M61 30 V22" {...line(INK, 1.2)} />
      <Box x={12} y={30} w={96} h={36} fill="#f8f8f4" />
      <rect x={12} y={30} width={96} height={5.5} fill="#2e9e62" />
      <rect x={12} y={35.5} width={96} height={2.5} fill="#f08a24" />
      <rect x={12} y={38} width={96} height={3.5} fill="#2e9e62" />
      <Box x={12} y={30} w={96} h={36} fill="none" />
      <Box x={17} y={46} w={40} h={18} fill={GLASS} thin />
      <path d="M30.3 46 V64 M43.6 46 V64" {...line(INK, 0.8)} />
      <Box x={62} y={45} w={20} h={21} fill={GLASS} thin />
      <path d="M72 45 V66" {...line(INK, 0.8)} />
      <Box x={87} y={46} w={16} h={18} fill={GLASS} thin />
      <path d="M20 50 l5 -3 M66 50 l4 -3 M90 50 l4 -3" {...line(WHITE, 1.2)} />
      <Box x={42} y={7} w={36} h={16} rx={3} fill="#f08a24" />
      <text x={60} y={19.5} textAnchor="middle" fontSize={12} fontWeight={900} fontFamily={FONT} fill={WHITE}>24</text>
    </g>
  );
}

function FlowerPot({ x, y, colors }: XY & { colors: [string, string, string] }) {
  return (
    <g>
      <circle cx={x - 2.5} cy={y - 10} r={3} fill={LEAF} {...THIN} />
      <circle cx={x + 2.5} cy={y - 10} r={3} fill={LEAF} {...THIN} />
      <circle cx={x - 3} cy={y - 12.5} r={2.2} fill={colors[0]} {...THIN} />
      <circle cx={x + 3} cy={y - 12.5} r={2.2} fill={colors[1]} {...THIN} />
      <circle cx={x} cy={y - 15} r={2.4} fill={colors[2]} {...THIN} />
      <Shape d={`M${x - 5} ${y - 8} H${x + 5} L${x + 4} ${y} H${x - 4} Z`} fill="#d0743c" thin />
      <Box x={x - 5.8} y={y - 9} w={11.6} h={2.4} fill="#e08a50" thin />
    </g>
  );
}

function FlowerShop() {
  return (
    <g>
      <Sky color="#fdeef3"><Cloud x={14} y={14} /><Cloud x={104} y={12} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={16} y={30} w={88} h={36} fill="#fff7ea" />
      <Box x={13} y={27} w={94} h={5} fill="#c2537e" />
      <Awning x={16} y={36} w={88} colors={['#f28bb0', WHITE]} n={11} />
      <Box x={21} y={46} w={48} h={18} fill={GLASS} thin />
      <Door x={77} y={45} w={16} h={21} fill="#c2537e" />
      <Box x={80} y={48} w={10} h={7} fill={GLASS} thin />
      <FlowerPot x={28} y={68} colors={['#e2453f', '#f6c443', '#f28bb0']} />
      <FlowerPot x={45} y={68} colors={['#8e5bc4', '#f28bb0', '#e2453f']} />
      <FlowerPot x={62} y={68} colors={['#f6c443', '#f08a24', '#8e5bc4']} />
      <path d="M60 27 V24" {...line(INK, 1.4)} />
      <circle cx={60} cy={15} r={9.5} fill={WHITE} {...LINE} />
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={60} cy={11.2} rx={2.4} ry={3.6} fill="#f28bb0" transform={`rotate(${a} 60 15)`} {...THIN} />
      ))}
      <circle cx={60} cy={15} r={2.2} fill={GOLD} {...THIN} />
    </g>
  );
}

function HamburgerStand() {
  return (
    <g>
      <Sky color="#fff1d8"><Cloud x={16} y={12} /><Cloud x={104} y={20} s={0.7} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={24} y={44} w={72} h={22} fill="#e8574a" />
      <path d="M24 61 H96" {...line(WHITE, 2)} />
      <Box x={31} y={50} w={58} h={9} fill="#5a3b2a" thin />
      <Box x={29} y={58} w={62} h={3} fill={CREAM} thin />
      <Box x={22} y={40} w={76} h={4} fill="#b33b32" />
      <Awning x={24} y={44} w={72} h={4} colors={['#ffd23f', '#e8574a']} n={9} />
      <Box x={38} y={33} w={44} h={7} rx={3.5} fill="#eda850" />
      <Box x={36} y={28} w={48} h={6} rx={3} fill="#7a4428" />
      <Shape d="M36 28 H84 L82 32 L77 29.5 L71 33 L65 29.5 L59 33 L53 29.5 L47 33 L41 29.5 L38 32 Z" fill="#ffd23f" thin />
      <path d="M36 27 q3 -3 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" fill="#6cbf4f" {...THIN} />
      <Shape d="M37 26 Q37 9 60 9 Q83 9 83 26 Z" fill="#eda850" />
      {[[48, 16, -20], [56, 13, 10], [64, 15, -10], [72, 18, 25], [52, 21, 0], [66, 21, 15]].map(([x, y, a], i) => (
        <ellipse key={i} cx={x} cy={y} rx={1.6} ry={0.9} fill="#fff6e0" transform={`rotate(${a} ${x} ${y})`} />
      ))}
    </g>
  );
}

function ShoppingDistrict() {
  const shop = (x: number, top: number, wall: string, cap: string, awning: [string, string]) => (
    <g>
      <Box x={x} y={top} w={36} h={66 - top} fill={wall} />
      <Box x={x - 2} y={top - 3} w={40} h={4} fill={cap} />
      <Awning x={x} y={42} w={36} colors={awning} n={5} />
      <Box x={x + 4} y={52} w={18} h={11} fill={GLASS} thin />
      <Door x={x + 25} y={51} w={8} h={15} fill={cap} />
    </g>
  );
  return (
    <g>
      <Sky><Cloud x={20} y={12} /><Cloud x={100} y={14} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      {shop(4, 32, '#bfe0f5', '#3e78b3', ['#e04b4b', WHITE])}
      {shop(42, 20, '#ffe7a3', '#c98a1b', ['#3e78b3', WHITE])}
      {shop(80, 28, '#cdeccf', '#2f8f52', ['#f08a24', WHITE])}
      <Windows x={9} y={35} cols={3} w={6} h={4} gx={4} />
      <Windows x={47} y={24} cols={3} rows={2} w={6} h={5} gx={4} gy={3} />
      <Windows x={85} y={32} cols={3} w={6} h={5} gx={4} />
    </g>
  );
}

function Winery() {
  /** Standing barrel, base centre at (x, y). */
  const barrel = (x: number, y: number) => (
    <g>
      <Shape d={`M${x - 5.5} ${y - 17} Q${x - 8.5} ${y - 8.5} ${x - 5.5} ${y} H${x + 5.5} Q${x + 8.5} ${y - 8.5} ${x + 5.5} ${y - 17} Z`} fill="#a8622f" />
      <path d={`M${x - 2.4} ${y - 16.5} Q${x - 3.4} ${y - 8.5} ${x - 2.4} ${y - 0.5} M${x + 2.4} ${y - 16.5} Q${x + 3.4} ${y - 8.5} ${x + 2.4} ${y - 0.5}`} {...line('#7a4520', 0.8)} />
      <path d={`M${x - 6.4} ${y - 13.5} H${x + 6.4} M${x - 6.4} ${y - 3.5} H${x + 6.4}`} {...line('#4c5560', 1.6)} />
    </g>
  );
  return (
    <g>
      <Sky color="#f5eefb"><Cloud x={100} y={12} /></Sky>
      <Hills y={48} fill="#b9d98e" />
      <Ground y={64} />
      <Box x={14} y={32} w={66} h={34} fill="#ddd0b9" />
      {[[18, 36], [30, 40], [60, 36], [70, 52], [20, 56], [46, 34], [64, 60]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={7} height={3.5} rx={1} fill="#cfc0a5" stroke="#b5a68b" strokeWidth={0.7} />
      ))}
      <Gable x={8} y={14} w={78} h={20} fill="#c4573a" />
      <circle cx={47} cy={26} r={4} fill={GLASS} {...THIN} />
      <Arch x={38} y={44} w={18} h={22} fill={DARKWOOD} />
      <path d="M47 44 V66" {...line('#5a3218', 0.8)} />
      <Arch x={20} y={42} w={9} h={11} fill={GLASS} />
      <Arch x={65} y={42} w={9} h={11} fill={GLASS} />
      {barrel(91, 68)}
      {barrel(107, 68)}
      <g transform="rotate(90 99 44.5)">{barrel(99, 53)}</g>
      <path d="M14 38 H6" {...line(INK, 1.2)} />
      <circle cx={7} cy={44} r={5} fill={CREAM} {...THIN} />
      <Grapes x={7} y={41} s={0.6} />
    </g>
  );
}

function FamilyRestaurant() {
  return (
    <g>
      <Sky><Cloud x={18} y={14} /><Cloud x={102} y={12} s={0.9} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={8} y={36} w={104} h={30} fill="#fff0cc" />
      <Box x={5} y={31} w={110} h={6} rx={2} fill="#e0553f" />
      <Awning x={8} y={37} w={104} h={4} colors={['#e0553f', WHITE]} n={14} />
      {[13, 31, 75, 93].map((x) => (
        <g key={x}>
          <Box x={x} y={46} w={14} h={12} fill={GLASS} thin />
          <path d={`M${x + 7} 46 V58 M${x} 52 H${x + 14}`} {...line(WHITE, 0.9)} />
          <Box x={x - 1} y={58} w={16} h={3} fill="#e0553f" thin />
        </g>
      ))}
      <Door x={52} y={46} w={16} h={20} fill="#e0553f" />
      <Box x={55} y={49} w={10} h={6} fill={GLASS} thin />
      <path d="M54 31 V25 M66 31 V25" {...line(INK, 1.6)} />
      <circle cx={60} cy={15} r={12} fill="#ffd23f" {...LINE} />
      <circle cx={60} cy={15} r={9} fill="#e0553f" {...THIN} />
      <path d="M56 9 V21 M54 9 V13 Q54 15 56 15 Q58 15 58 13 V9" {...line(WHITE, 1.3)} />
      <path d="M64 21 V9 Q67 11 66.5 16 H64" fill={WHITE} stroke={WHITE} strokeWidth={1.1} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
}

function FruitMarket() {
  return (
    <g>
      <Sky color="#fff4dc"><Cloud x={14} y={8} s={0.8} /><Cloud x={106} y={8} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={12} y={24} w={3} h={42} fill={WOOD} thin />
      <Box x={105} y={24} w={3} h={42} fill={WOOD} thin />
      <Box x={15} y={30} w={90} h={18} fill="#f3dfb8" thin />
      <Shape d="M6 23 L18 11 H102 L114 23 Z" fill="#f08a24" />
      <Awning x={6} y={23} w={108} h={6} colors={['#f08a24', WHITE]} n={12} />
      <Pile x={18} y={46} w={22} color="#e23b3b" r={2.2} />
      <Pile x={43} y={46} w={34} color="#9ccf4a" r={2.2} />
      <Pile x={80} y={46} w={22} color="#f6a530" r={2.2} />
      <path d="M15 46 H105" {...line(DARKWOOD, 1.4)} />
      {[0, 1, 2, 3].map((i) => <Crate key={i} x={14 + i * 23.5} y={54} s={13} />)}
      <Pile x={14} y={54} w={13} color="#f08a24" r={2.4} />
      <Pile x={37.5} y={54} w={13} color="#e23b3b" r={2.4} />
      <g>
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${62 + i * 3} 53 q3 -7 9 -6`} {...line(INK, 3.2)} />
        ))}
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${62 + i * 3} 53 q3 -7 9 -6`} {...line('#ffd94a', 2)} />
        ))}
      </g>
      <Grapes x={91} y={47} s={0.9} />
      <Grapes x={97} y={48} s={0.8} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Offices, studios, venues

function BusinessCenter() {
  return (
    <g>
      <Sky color="#e6e4f7"><Cloud x={18} y={14} /><Cloud x={102} y={10} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={8} y={34} w={30} h={32} fill="#b8a5e0" />
      <Windows x={12} y={38} cols={3} rows={3} w={5} h={5} gx={3.5} gy={3.5} fill="#e6f5fb" />
      <Box x={82} y={26} w={30} h={40} fill="#ddd5f2" />
      <Windows x={86} y={30} cols={3} rows={4} w={5} h={5.5} gx={3.5} gy={3} />
      <path d="M60 8 V1" {...line(INK, 1.2)} />
      <circle cx={60} cy={1.5} r={1.4} fill={RED} />
      <Box x={38} y={10} w={44} h={56} fill="#ece7fa" />
      <Box x={36} y={7} w={48} h={5} fill="#7a56b8" />
      <Windows x={42.5} y={16} cols={4} rows={5} w={7} h={5} gx={2.7} gy={2.8} />
      <path d="M38 55 H82" {...line('#7a56b8', 2)} />
      <Box x={52} y={57} w={16} h={9} fill={GLASS} thin />
      <path d="M60 57 V66" {...line(INK, 0.8)} />
    </g>
  );
}

function Stadium() {
  const lights = (x: number) => (
    <g>
      <path d={`M${x} 66 V14`} {...line(INK, 2.4)} />
      <path d={`M${x} 66 V14`} {...line('#9aa3ad', 1.1)} />
      <Box x={x - 7} y={7} w={14} h={8} rx={1} fill="#5a6270" />
      {[-4, 0, 4].map((dx) => [9.5, 12.5].map((dy) => <circle key={`${dx}.${dy}`} cx={x + dx} cy={dy} r={1.1} fill="#ffe680" />))}
    </g>
  );
  return (
    <g>
      <Sky><Cloud x={60} y={9} s={0.9} /></Sky>
      <Ground y={62} />
      {lights(9)}
      {lights(111)}
      <Shape d="M14 35 L18 60 Q60 70 102 60 L106 35 Z" fill="#ece5d6" />
      {Array.from({ length: 9 }, (_, i) => {
        const x = 23 + i * 8.6;
        return <path key={i} d={`M${x} 61 V54 a2.8 2.8 0 0 1 5.6 0 V61.5`} fill="#8c8578" {...THIN} />;
      })}
      <path d="M17 46 Q60 54 103 46" {...line('#d24c4c', 2)} />
      <ellipse cx={60} cy={35} rx={46} ry={10} fill="#d5473f" {...LINE} />
      <ellipse cx={60} cy={36} rx={34} ry={6} fill="#73c35b" {...THIN} />
      <path d="M60 30 V42" {...line(WHITE, 0.9)} />
      <ellipse cx={60} cy={36} rx={4} ry={1.6} {...line(WHITE, 0.9)} />
      <Pennant x={30} y={27} color="#3e78b3" />
      <Pennant x={60} y={25} color={GOLD} />
      <Pennant x={90} y={27} color="#3e78b3" />
    </g>
  );
}

function TvStation() {
  return (
    <g>
      <Sky><Cloud x={20} y={12} /><Cloud x={66} y={8} s={0.7} /></Sky>
      <Ground y={64} fill={PAVE} />
      <LatticeMast x={100} top={14} bottom={66} wTop={3} wBottom={16} />
      <path d="M100 14 V4" {...line(INK, 1.4)} />
      <circle cx={100} cy={4} r={1.8} fill={RED} {...THIN} />
      <Box x={97} y={12} w={6} h={3} fill={RED} thin />
      <circle cx={96.5} cy={27} r={3} fill={WHITE} {...THIN} />
      <circle cx={103.5} cy={36} r={3} fill={WHITE} {...THIN} />
      <Box x={8} y={36} w={76} h={30} fill="#dfeaf6" />
      <Box x={6} y={32} w={80} h={5} fill="#3e6fb0" />
      <Windows x={13} y={41} cols={6} w={7} h={6} gx={4.6} />
      <Box x={16} y={52} w={14} h={14} fill={GLASS} thin />
      <path d="M23 52 V66" {...line(INK, 0.8)} />
      <path d="M57 50 L54 45 M63 50 L66 45" {...line(INK, 1)} />
      <Box x={48} y={50} w={24} h={14} rx={2.5} fill="#3d3d4d" />
      <Box x={51} y={52.5} w={18} h={9} rx={1.5} fill="#7fd3f0" thin />
      <path d="M53 55 l3 -2" {...line(WHITE, 1)} />
      <circle cx={78} cy={58} r={2.6} fill={RED} {...THIN} />
      <path d="M27 32 L30 24 L33 32" {...line(INK, 1.4)} />
      <g transform="rotate(-35 30 20)">
        <ellipse cx={30} cy={20} rx={10} ry={6} fill="#f3f3f3" {...LINE} />
        <ellipse cx={30} cy={20} rx={6.5} ry={3.6} {...line('#c3c9d1', 1)} />
        <path d="M30 20 V12" {...line(INK, 1)} />
        <circle cx={30} cy={12} r={1.3} fill={RED} />
      </g>
    </g>
  );
}

function TrainStation() {
  return (
    <g>
      <Sky color="#dff1fb"><Cloud x={16} y={10} /><Cloud x={104} y={8} s={0.8} /></Sky>
      <Ground y={62} fill={PAVE} />
      <Box x={12} y={28} w={96} h={34} fill="#f1dcc0" />
      <Shape d="M6 30 L16 20 H104 L114 30 Z" fill="#4f6fa8" />
      <Gable x={42} y={4} w={36} h={20} fill="#f1dcc0" />
      <Clock x={60} y={16} r={5.5} />
      {[18, 32, 80, 94].map((x) => <Arch key={x} x={x} y={33} w={8} h={13} fill={GLASS} />)}
      <Arch x={50} y={32} w={20} h={24} fill="#8a5a32" />
      <Box x={0} y={58} w={120} h={4} fill="#bdb4a6" thin />
      <path d="M-2 75 H122" {...line('#6b737d', 1.6)} />
      {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${2 + i * 9.5} 73 V77`} {...line(DARKWOOD, 1.6)} />)}
      <Smoke x={21} y={44} />
      <Box x={18} y={46} w={6} h={10} fill="#444a52" />
      <Box x={10} y={54} w={30} h={14} rx={3} fill="#3fa463" />
      <Box x={36} y={46} w={16} h={22} fill="#3fa463" />
      <Box x={34} y={44} w={20} h={3} fill="#2a7046" />
      <Box x={40} y={49} w={8} h={7} fill={GLASS} thin />
      <path d="M10 60 H36" {...line(GOLD, 1.4)} />
      <Box x={56} y={52} w={44} h={16} rx={2} fill="#e04b4b" />
      <Box x={54} y={49.5} w={48} h={3} rx={1} fill="#a8332b" thin />
      <Windows x={60} y={55} cols={4} w={7} h={5} gx={3.2} fill={GLASS} />
      <path d="M52 63 H56" {...line(INK, 1.4)} />
      {[16, 26, 44, 64, 92].map((x) => (
        <g key={x}>
          <circle cx={x} cy={70} r={3.6} fill="#3a3a40" {...THIN} />
          <circle cx={x} cy={70} r={1.2} fill="#c9ced4" />
        </g>
      ))}
    </g>
  );
}

function ShoppingMall() {
  return (
    <g>
      <Sky><Cloud x={14} y={12} /><Cloud x={106} y={14} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Shape d="M30 30 Q60 -14 90 30 Z" fill="#bfe8f7" />
      <path d="M44 29 Q46 15 54 9.5 M76 29 Q74 15 66 9.5 M36 22 Q60 13 84 22" {...line('#6fa9c4', 1)} />
      <Box x={4} y={30} w={112} h={36} fill="#f3e8f6" />
      <Box x={2} y={27} w={116} h={5} fill="#d05c9a" />
      <Bag x={60} y={27} color="#d05c9a" s={1.3} />
      <Box x={8} y={37} w={104} h={22} fill={GLASS} thin />
      {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${8 + (i + 1) * 8} 37 V59`} {...line('#6fa9c4', 0.8)} />)}
      <path d="M8 48 H112" {...line('#6fa9c4', 0.8)} />
      <path d="M14 44 l6 -5 M66 44 l6 -5 M90 54 l6 -5" {...line(WHITE, 1.2)} />
      <Box x={48} y={48} w={24} h={18} fill="#7fcbe8" />
      <path d="M60 48 V66" {...line(INK, 0.9)} />
      <Bag x={18} y={66} color="#f28bb0" />
      <Bag x={28} y={67} color={GOLD} />
      <Bag x={92} y={67} color="#7fcbe8" />
      <Bag x={102} y={66} color="#8fd16a" />
    </g>
  );
}

function AmusementPark() {
  const cx = 44;
  const cy = 34;
  const r = 25;
  const cars = ['#e04b4b', GOLD, '#3e78b3', '#8fd16a', '#f28bb0', '#f08a24', '#8e5bc4', '#3fb6b0'];
  return (
    <g>
      <Sky color="#dff3fb"><Cloud x={98} y={10} /><Cloud x={10} y={8} s={0.6} /></Sky>
      <Ground y={64} />
      <path d={`M${cx - 15} 66 L${cx} ${cy} L${cx + 15} 66`} {...line(INK, 3.4)} />
      <path d={`M${cx - 15} 66 L${cx} ${cy} L${cx + 15} 66`} {...line('#9aa3ad', 1.8)} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i;
        return <path key={i} d={`M${cx} ${cy} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`} {...line(INK, 0.8)} />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.62} {...line(INK, 0.8)} />
      <circle cx={cx} cy={cy} r={r} {...line(INK, 3.6)} />
      <circle cx={cx} cy={cy} r={r} {...line('#e04b4b', 2)} />
      <circle cx={cx} cy={cy} r={3} fill={GOLD} {...THIN} />
      {cars.map((c, i) => {
        const a = (Math.PI / 4) * i + Math.PI / 8;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        return (
          <g key={i}>
            <path d={`M${x} ${y} V${y + 2}`} {...line(INK, 0.8)} />
            <Box x={x - 3.5} y={y + 2} w={7} h={5} rx={1.5} fill={c} thin />
          </g>
        );
      })}
      {Array.from({ length: 6 }, (_, i) => (
        <Box key={i} x={82 + i * 5.5} y={46} w={5.5} h={20} fill={i % 2 ? WHITE : '#e04b4b'} thin />
      ))}
      <Shape d="M96 66 V56 Q98.5 52 101 56 V66 Z" fill="#5a3b2a" thin />
      {Array.from({ length: 6 }, (_, i) => (
        <Shape key={i} d={`M99 24 L${78 + i * 7} 46 H${85 + i * 7} Z`} fill={i % 2 ? WHITE : '#e04b4b'} thin />
      ))}
      <Box x={82} y={46} w={33} h={20} fill="none" />
      <Pennant x={99} y={24} color={GOLD} />
    </g>
  );
}

function RadioTower() {
  const hw = (y: number) => 2 + ((y - 18) / 48) * 12;
  const segs = [0, 1, 2, 3].map((k) => {
    const y0 = 18 + k * 12;
    const y1 = y0 + 12;
    return (
      <g key={k}>
        <Shape d={`M${60 - hw(y0)} ${y0} H${60 + hw(y0)} L${60 + hw(y1)} ${y1} H${60 - hw(y1)} Z`} fill={k % 2 ? WHITE : RED} thin />
        <path d={`M${60 - hw(y0)} ${y0} L${60 + hw(y1)} ${y1} M${60 + hw(y0)} ${y0} L${60 - hw(y1)} ${y1}`} {...line(INK, 0.7)} />
      </g>
    );
  });
  const waves = [7, 12.5, 18].map((r) => {
    const dx = r * Math.cos(0.55);
    const dy = r * Math.sin(0.55);
    return (
      <g key={r}>
        <path d={`M${60 - dx} ${11 - dy} A${r} ${r} 0 0 0 ${60 - dx} ${11 + dy}`} {...line('#f08a24', 1.8)} />
        <path d={`M${60 + dx} ${11 - dy} A${r} ${r} 0 0 1 ${60 + dx} ${11 + dy}`} {...line('#f08a24', 1.8)} />
      </g>
    );
  });
  return (
    <g>
      <Sky color="#e2f1fb"><Cloud x={18} y={30} s={0.8} /><Cloud x={104} y={34} s={0.7} /></Sky>
      <Ground y={64} />
      {waves}
      <path d="M60 18 V11" {...line(INK, 1.4)} />
      <circle cx={60} cy={11} r={2} fill={RED} {...THIN} />
      {segs}
      <Box x={54.5} y={29} w={11} h={2.5} fill={STEEL} thin />
      <Box x={84} y={52} w={22} h={14} fill={CREAM} />
      <Gable x={82} y={45} w={26} h={8} fill="#3e78b3" />
      <Door x={91} y={57} w={7} h={9} />
      <Bush x={22} y={64} r={6} />
    </g>
  );
}

function Airport() {
  return (
    <g>
      <Sky color="#d3edfb"><Cloud x={94} y={44} s={0.8} /><Cloud x={14} y={36} s={0.7} /></Sky>
      <Ground y={62} fill={PAVE} />
      <path d="M2 72 H18 M28 72 H44 M54 72 H70 M80 72 H96 M106 72 H120" {...line(WHITE, 2)} />
      <Box x={4} y={44} w={64} h={18} fill="#e9eef3" />
      <Box x={2} y={41} w={68} h={4} fill="#3e78b3" />
      <Box x={8} y={48} w={56} h={8} fill={GLASS} thin />
      {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M${16 + i * 8} 48 V56`} {...line(INK, 0.7)} />)}
      <Box x={77} y={26} w={12} h={36} fill="#e9eef3" />
      <Shape d="M69 14 H97 L92 26 H74 Z" fill={GLASS} />
      <path d="M75 14 L77 26 M83 14 V26 M91 14 L89 26" {...line(INK, 0.7)} />
      <Box x={71} y={10} w={24} h={4} fill="#3e78b3" />
      <path d="M83 10 V4" {...line(INK, 1.2)} />
      <circle cx={83} cy={4} r={1.3} fill={RED} />
      <g transform="rotate(-8 34 20)">
        <Shape d="M18 18 L13 8 H18 L25 17 Z" fill="#3e78b3" />
        <Shape d="M14 20 Q14 16 20 16 H48 Q56 16 59 20 Q56 23.5 48 23.5 H20 Q14 23.5 14 20 Z" fill={WHITE} />
        <path d="M16 21.5 H56" {...line('#3e78b3', 1.4)} />
        {[24, 28, 32, 36, 40, 44].map((x) => <circle key={x} cx={x} cy={18.8} r={0.9} fill="#3e78b3" />)}
        <Shape d="M51 17.5 Q55 17.5 57 19.5 H51 Z" fill={GLASS} thin />
        <Shape d="M30 21 H40 L32 31 H27 Z" fill="#c9d3dc" />
      </g>
    </g>
  );
}

function Museum() {
  const cols = [22, 37.2, 52.4, 67.6, 82.8, 98];
  return (
    <g>
      <Sky color="#e9f1f7"><Cloud x={14} y={10} /><Cloud x={106} y={12} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={16} y={31} w={88} h={22} fill="#ddd3c2" />
      <Door x={54} y={38} w={12} h={15} />
      {cols.map((x) => (
        <g key={x}>
          <Box x={x - 3.5} y={32} w={7} h={21} fill="#f4efe4" thin />
          <path d={`M${x - 1.2} 34 V51 M${x + 1.2} 34 V51`} {...line('#d6ccba', 0.7)} />
          <Box x={x - 4.5} y={30} w={9} h={2.5} fill="#f4efe4" thin />
        </g>
      ))}
      <Box x={12} y={25} w={96} h={6} fill="#f4efe4" />
      <Shape d="M10 25 L60 7 L110 25 Z" fill="#f4efe4" />
      <path d="M20 23 L60 10.5 L100 23 Z" {...line('#d6ccba', 0.9)} />
      <circle cx={60} cy={18} r={3.2} fill={GOLD} {...THIN} />
      <Box x={14} y={53} w={92} h={4} fill="#f4efe4" />
      <Box x={10} y={57} w={100} h={4} fill="#e9e2d4" />
      <Box x={6} y={61} w={108} h={4} fill="#ddd5c6" />
    </g>
  );
}

function ExhibitHall() {
  const banners: [number, string][] = [[11, '#e04b4b'], [24, GOLD], [88, '#3e78b3'], [101, '#3aa45f']];
  return (
    <g>
      <Sky><Cloud x={14} y={14} /><Cloud x={106} y={18} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <path d="M60 12 V3" {...line(INK, 1.1)} />
      <Shape d="M60 3 L67 5 L60 7 Z" fill="#e04b4b" thin />
      <Shape d="M28 38 A32 26 0 0 1 92 38 Z" fill="#5fb3b0" />
      <path d="M44 38 Q46 18 60 12 M76 38 Q74 18 60 12 M60 12 V38 M34 28 Q60 22 86 28" {...line('#3d8a87', 1)} />
      <Box x={4} y={38} w={112} h={28} fill="#f3ece0" />
      <Box x={2} y={35} w={116} h={4} fill="#c9b78f" />
      <Windows x={38} y={43} cols={2} w={5} h={8} gx={3} />
      <Windows x={69} y={43} cols={2} w={5} h={8} gx={3} />
      <Arch x={50} y={44} w={20} h={22} fill={GLASS} />
      <path d="M60 44 V66 M50 54 H70" {...line(INK, 0.7)} />
      {banners.map(([x, c]) => (
        <Shape key={x} d={`M${x} 40 H${x + 8} V58 L${x + 4} 55 L${x} 58 Z`} fill={c} thin />
      ))}
      {banners.map(([x]) => <Star key={x} x={x + 4} y={46} r={2.2} fill={WHITE} />)}
    </g>
  );
}

function Temple() {
  return (
    <g>
      <Sky color="#fde8d8"><circle cx={60} cy={44} r={16} fill="#f8b48c" /></Sky>
      <Bush x={10} y={62} r={8} fill="#5aa862" />
      <Bush x={104} y={62} r={8} fill="#5aa862" />
      <Ground y={62} fill="#d9c7a5" />
      <Box x={36} y={56} w={48} h={6} fill="#c9b79a" />
      <Box x={41} y={44} w={38} h={12} fill="#fbf3e3" />
      {[41, 54, 66, 79].map((x) => <Box key={x} x={x - 1} y={44} w={2} h={12} fill="#e0453a" thin />)}
      <Box x={55} y={46} w={10} h={10} fill="#8a5a32" thin />
      <Shape d="M30 46 Q42 44 46 34 H74 Q78 44 90 46 Z" fill="#4f6b5a" />
      <Box x={44} y={31} w={32} h={4} fill="#3c5446" />
      {[[56, 66], [58, 71], [60, 76]].map(([x, y], i) => <ellipse key={i} cx={x + (i - 1) * 2} cy={y} rx={4 + i} ry={1.6} fill="#bfae8f" {...THIN} />)}
      <Box x={18} y={18} w={6} h={46} fill="#e0453a" />
      <Box x={96} y={18} w={6} h={46} fill="#e0453a" />
      <Box x={17} y={60} w={8} h={5} fill="#3a2e2e" thin />
      <Box x={95} y={60} w={8} h={5} fill="#3a2e2e" thin />
      <Box x={12} y={27} w={96} h={4} fill="#e0453a" />
      <Box x={57} y={18} w={6} h={9} fill="#3a2e2e" thin />
      <Box x={10} y={17} w={100} h={4} fill="#e0453a" />
      <Shape d="M5 10 Q60 17 115 10 L113 17 Q60 22 7 17 Z" fill="#3a2e2e" />
    </g>
  );
}

function LoanOffice() {
  return (
    <g>
      <Sky color="#e8f4ea"><Cloud x={16} y={12} /><Cloud x={104} y={12} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={14} y={32} w={92} h={34} fill="#d8ecd9" />
      <Box x={10} y={28} w={100} h={5} fill="#4c9a6a" />
      {[18, 42, 72, 96].map((x) => <Box key={x} x={x} y={33} w={6} h={31} fill="#f4f8f2" thin />)}
      {[28, 82].map((x) => (
        <g key={x}>
          <Box x={x} y={40} w={10} h={14} fill={GLASS} thin />
          <path d={`M${x + 3.3} 40 V54 M${x + 6.6} 40 V54`} {...line('#5a6270', 1)} />
        </g>
      ))}
      <Door x={52} y={43} w={16} h={21} fill="#2f6e4a" />
      <path d="M60 43 V64" {...line(INK, 0.8)} />
      <Box x={46} y={63} w={28} h={3} fill="#c9c1b4" thin />
      <Box x={53} y={25} w={14} h={3.5} fill="#4c9a6a" thin />
      <Coin x={60} y={14} r={11} label="$" />
      {[0, 1, 2].map((i) => <ellipse key={i} cx={112} cy={64 - i * 2.6} rx={5} ry={1.8} fill={GOLD} {...THIN} />)}
      {[0, 1].map((i) => <ellipse key={i} cx={8} cy={64 - i * 2.6} rx={5} ry={1.8} fill={GOLD} {...THIN} />)}
    </g>
  );
}

function Park() {
  return (
    <g>
      <Sky><Sun x={18} y={14} /><Cloud x={88} y={12} /></Sky>
      <Hills y={50} fill="#b5dc8a" />
      <Ground y={58} />
      <Shape d="M46 80 Q56 70 54 64 H66 Q64 70 74 80 Z" fill="#eadbb4" thin />
      <Tree x={92} y={58} r={8} fill="#6cbf5a" />
      <Tree x={14} y={64} r={12} fill="#4fae4f" />
      <Tree x={108} y={68} r={12} fill={LEAF} />
      <path d="M60 36 Q58 26 52 32 M60 36 Q62 26 68 32" {...line('#5bb8e0', 1.6)} />
      <path d="M49 42 Q45 46 44 56 M71 42 Q75 46 76 56" {...line('#5bb8e0', 1.4)} />
      <Box x={58} y={40} w={4} h={20} fill="#cfd6dd" thin />
      <Shape d="M49 40 H71 Q68 46 60 46 Q52 46 49 40 Z" fill="#cfd6dd" />
      <Shape d="M38 60 V65 Q60 71 82 65 V60" fill="#cfd6dd" />
      <ellipse cx={60} cy={60} rx={22} ry={5} fill="#cfd6dd" {...LINE} />
      <ellipse cx={60} cy={60} rx={18} ry={3.4} fill="#7fcbe8" {...THIN} />
      <path d="M58 40 V60" {...line(INK, 0.8)} />
      <Box x={22} y={68} w={18} h={2.5} fill={WOOD} thin />
      <Box x={22} y={63} w={18} h={2.5} fill={WOOD} thin />
      <path d="M24 70.5 V75 M38 70.5 V75 M24 65.5 V68 M38 65.5 V68" {...line(INK, 1.2)} />
      {[[86, 74, '#e2453f'], [92, 76, GOLD], [98, 74, '#f28bb0']].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={1.8} fill={c as string} {...THIN} />
      ))}
    </g>
  );
}

function TechStartup() {
  return (
    <g>
      <Sky color="#e3f3fb"><Cloud x={16} y={14} /><Cloud x={60} y={8} s={0.6} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={70} y={34} w={40} h={32} fill="#f7f7f7" />
      {[40, 48, 56].map((y) => <Box key={y} x={74} y={y} w={32} h={4.5} fill={GLASS} thin />)}
      <path d="M90 34 V31" {...line(INK, 1.4)} />
      <path d="M83 12 L80 10 M97 12 L100 10 M90 5 V2 M82 20 H79 M98 20 H101" {...line('#f2a93b', 1.4)} />
      <circle cx={90} cy={17} r={7.5} fill="#ffe066" {...LINE} />
      <path d="M88 20 V17 l2 -2 l2 2 V20" {...line('#e0a92a', 0.9)} />
      <Box x={86} y={23.5} w={8} h={6} rx={1} fill="#b8bec6" thin />
      <path d="M86 25.5 H94 M86 27.5 H94" {...line(INK, 0.6)} />
      <Shape d="M22 66 V26 L66 16 V66 Z" fill="#8fd0ee" />
      {[30.8, 39.6, 48.4, 57.2].map((x) => <path key={x} d={`M${x} ${26 - ((x - 22) * 10) / 44} V66`} {...line('#5c9fc0', 0.8)} />)}
      {[34, 42, 50].map((y) => <path key={y} d={`M22 ${y} H66`} {...line('#5c9fc0', 0.8)} />)}
      <path d="M27 40 l10 -10 M27 50 l14 -14 M50 60 l12 -12" {...line(WHITE, 1.3)} />
      <Box x={37} y={54} w={14} h={12} fill="#d6f0fa" thin />
      <path d="M44 54 V66" {...line(INK, 0.7)} />
      <Bush x={10} y={64} r={5} />
    </g>
  );
}

function FrenchRestaurant() {
  return (
    <g>
      <Sky color="#eef0fb"><Cloud x={14} y={12} s={0.8} /><Cloud x={104} y={10} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={12} y={28} w={96} h={38} fill="#f7ecd9" />
      <Shape d="M10 28 L16 15 H104 L110 28 Z" fill="#5b6b8c" />
      {[28, 84].map((x) => (
        <g key={x}>
          <Arch x={x} y={17} w={8} h={9} fill={GLASS} />
          <path d={`M${x - 1} 21 Q${x + 4} 15 ${x + 9} 21`} {...line(INK, 1.1)} />
        </g>
      ))}
      <Awning x={12} y={34} w={96} h={6} colors={['#8e2a3b', CREAM]} n={12} />
      {[18, 80].map((x) => (
        <g key={x}>
          <Arch x={x} y={45} w={22} h={14} fill={GLASS} />
          <path d={`M${x + 11} 45 V59`} {...line(INK, 0.8)} />
          <Box x={x - 1} y={59} w={24} h={3.5} fill="#8e2a3b" thin />
          {[4, 9, 14, 19].map((dx) => <circle key={dx} cx={x + dx} cy={58.5} r={1.4} fill="#e2453f" />)}
        </g>
      ))}
      <Door x={51} y={45} w={18} h={21} fill="#8e2a3b" />
      <Box x={54} y={48} w={12} h={8} fill={GLASS} thin />
      <path d="M54 15 V12 M66 15 V12" {...line(INK, 1.4)} />
      <ellipse cx={60} cy={8} rx={11} ry={6.5} fill={CREAM} {...LINE} />
      <path d="M56 4 H64 Q64 9 60 9.5 Q56 9 56 4 Z" fill={WHITE} {...THIN} />
      <path d="M56.5 6.5 H63.5 Q63 9 60 9.4 Q57 9 56.5 6.5 Z" fill="#8e2a3b" />
      <path d="M60 9.5 V12.5 M57.5 12.8 H62.5" {...line(INK, 0.9)} />
    </g>
  );
}

function LaunchPad() {
  return (
    <g>
      <Sky color="#dceefb"><Cloud x={18} y={14} /><Cloud x={104} y={36} s={0.7} /></Sky>
      <Ground y={64} fill="#cfc6b8" />
      <path d={bracing(82, 8, 10, 64, 6)} {...line('#e07a2e', 1.2)} />
      <Box x={80.5} y={8} w={2.5} h={58} fill="#e07a2e" thin />
      <Box x={88.5} y={8} w={2.5} h={58} fill="#e07a2e" thin />
      <Box x={79} y={6} w={13.5} h={3} fill="#e07a2e" thin />
      <Box x={63} y={22} w={18} h={2.5} fill="#e07a2e" thin />
      <Box x={63} y={40} w={18} h={2.5} fill="#e07a2e" thin />
      <Shape d="M49 46 L41 59 H49 Z" fill="#e04b4b" />
      <Shape d="M63 46 L71 59 H63 Z" fill="#e04b4b" />
      <Box x={52} y={56} w={8} h={4} fill="#6b737d" thin />
      <Box x={49} y={18} w={14} h={40} rx={2} fill={WHITE} />
      <Shape d="M49 19 Q49 7 56 2 Q63 7 63 19 Z" fill="#e04b4b" />
      <circle cx={56} cy={28} r={3.4} fill={GLASS} {...LINE} />
      <Box x={49} y={40} w={14} h={3} fill="#e04b4b" thin />
      <path d="M56 46 V58" {...line('#d0d4da', 1)} />
      <Box x={30} y={59} w={60} h={7} fill="#9aa3ad" />
      <path d="M38 66 V59 M82 66 V59" {...line(INK, 0.8)} />
      {[[38, 60, 4], [44, 62, 3.4], [70, 61, 4], [76, 63, 3]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#f3f4f6" {...THIN} />)}
    </g>
  );
}

function SodaPlant() {
  return (
    <g>
      <Sky><Cloud x={16} y={10} /><Cloud x={104} y={10} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={12} y={28} w={18} h={12} fill="#c9d3dc" />
      <ellipse cx={21} cy={28} rx={9} ry={2.4} fill="#dfe5ea" {...THIN} />
      <Box x={95} y={24} w={7} h={16} fill="#b8bec6" />
      <Smoke x={99} y={18} />
      <Box x={6} y={42} w={108} h={24} fill="#ffe9d6" />
      <Box x={4} y={39} w={112} h={4} fill="#d23c3c" />
      <Windows x={11} y={48} cols={3} w={8} h={7} gx={4} />
      <Windows x={77} y={48} cols={3} w={8} h={7} gx={4} />
      <Door x={52} y={50} w={16} h={16} fill="#d23c3c" />
      <path d="M30 34 H40 V39" {...line(INK, 2.4)} />
      <path d="M30 34 H40 V39" {...line('#c9d3dc', 1.2)} />
      <Shape d="M55 6 H65 V10 Q65 14 68 17 Q74 23 74 30 V37 Q74 39 72 39 H48 Q46 39 46 37 V30 Q46 23 52 17 Q55 14 55 10 Z" fill="#9fdcb8" />
      <Box x={54.5} y={2} w={11} h={4.5} rx={1} fill="#d23c3c" />
      <Box x={46} y={25} w={28} h={9} fill="#d23c3c" thin />
      <path d="M49 31 Q55 26 60 30 Q65 33 71 28" {...line(WHITE, 1.4)} />
      <path d="M51 21 Q53 18 56 16" {...line(WHITE, 1.4)} />
      {[[80, 30, 1.4], [84, 24, 1.1], [79, 18, 1.6], [40, 24, 1.3], [37, 16, 1]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={WHITE} {...THIN} />
      ))}
    </g>
  );
}

function Charterhouse() {
  return (
    <g>
      <Sky color="#eaf0f7"><Cloud x={18} y={12} /><Cloud x={102} y={10} s={0.8} /></Sky>
      <Ground y={64} />
      <Shape d="M53 80 L56 66 H64 L67 80 Z" fill="#e3d6b8" thin />
      <Box x={18} y={18} w={6} h={12} fill="#a85a40" />
      <Box x={96} y={18} w={6} h={12} fill="#a85a40" />
      <Shape d="M2 38 L12 26 H108 L118 38 Z" fill="#4a4f5c" />
      <Box x={6} y={37} w={108} h={29} fill="#c9785a" />
      <Windows x={11} y={41} cols={4} rows={2} w={6} h={7} gx={3.8} gy={5} fill="#e8f6fb" />
      <Windows x={76.6} y={41} cols={4} rows={2} w={6} h={7} gx={3.8} gy={5} fill="#e8f6fb" />
      <Box x={48} y={20} w={24} h={46} fill="#d98a6c" />
      <Shape d="M46 21 L60 3 L74 21 Z" fill="#4a4f5c" />
      <path d="M60 3 V0" {...line(INK, 1.2)} />
      <Clock x={60} y={30} r={6.5} />
      <Arch x={56} y={39} w={8} h={7} fill="#e8f6fb" />
      <Arch x={54} y={50} w={12} h={16} fill={DARKWOOD} />
    </g>
  );
}

function PrivateClub() {
  const post = (x: number) => (
    <g>
      <ellipse cx={x} cy={70} rx={3} ry={1.2} fill={GOLD} {...THIN} />
      <Box x={x - 1.1} y={59} w={2.2} h={11} fill={GOLD} thin />
      <circle cx={x} cy={58.5} r={1.8} fill={GOLD} {...THIN} />
    </g>
  );
  return (
    <g>
      <Sky color="#e7e0f3"><Cloud x={10} y={10} s={0.8} /><Cloud x={110} y={12} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={20} y={22} w={80} h={44} fill="#4b2a4f" />
      <Box x={16} y={18} w={88} h={5} fill="#d7a940" />
      <Box x={18} y={14} w={84} h={4} fill="#6b3d70" />
      {[27, 83].map((x) => (
        <g key={x}>
          <Arch x={x} y={28} w={10} h={18} fill="#ffe9a8" />
          <path d={`M${x + 5} 33 V46 M${x} 39 H${x + 10}`} {...line('#d7a940', 0.8)} />
        </g>
      ))}
      <Shape d="M49 80 L53 64 H67 L71 80 Z" fill="#c3283b" thin />
      <Arch x={51} y={36} w={18} h={28} fill="#2a1730" />
      <path d="M51 64 V45 A9 9 0 0 1 69 45 V64" {...line('#d7a940', 1.4)} />
      <path d="M60 46 V64" {...line('#d7a940', 0.8)} />
      <Star x={60} y={29} r={5.5} />
      {post(34)}
      {post(47)}
      {post(73)}
      {post(86)}
      <path d="M34 59 Q40.5 65 47 59 M73 59 Q79.5 65 86 59" {...line('#c3283b', 1.6)} />
    </g>
  );
}

function Forge() {
  return (
    <g>
      <Sky color="#fde3c8" />
      <Smoke x={26} y={10} s={0.75} />
      <Ground y={62} fill="#b9a58c" />
      <Box x={19} y={12} w={14} h={12} fill="#8a7d72" />
      <Box x={6} y={22} w={50} h={44} fill="#9c8f84" />
      {[[10, 26], [24, 26], [38, 26], [17, 30], [31, 30], [45, 30], [8, 46], [50, 50], [8, 56], [50, 40]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={8} height={3} rx={1} fill="#b3a79c" stroke="#7a6e64" strokeWidth={0.6} />
      ))}
      <Arch x={14} y={34} w={34} h={28} fill="#3a2620" />
      <Shape d="M18 62 Q15 52 22 46 Q22 52 26 50 Q25 42 31 37 Q34 45 38 44 Q42 50 40 54 Q46 50 44 62 Z" fill="#f5872c" thin />
      <path d="M23 62 Q22 55 27 52 Q28 56 31 54 Q31 49 34 47 Q37 53 36 56 Q40 56 39 62 Z" fill="#ffd23f" />
      <Box x={10} y={62} w={42} h={4} fill="#7a6e64" thin />
      <Box x={72} y={54} w={26} h={12} fill={WOOD} />
      <path d="M76 58 Q85 60 94 58" {...line(DARKWOOD, 0.8)} />
      <Shape d="M70 40 H102 V45 H95 Q92 46 92 50 L97 54 H73 L78 50 Q78 46 75 45 H70 Q63 44 58 41 Q63 40 70 40 Z" fill="#4c5560" />
      <path d="M71 41.5 H100" {...line('#7b8591', 1)} />
      <Box x={78} y={36.5} w={16} h={3.5} rx={1.7} fill="#ff9d3a" thin />
      <g transform="rotate(-40 100 30)">
        <Box x={98.5} y={22} w={3} h={20} rx={1} fill={WOOD} thin />
        <Box x={93} y={17} w={14} h={7} rx={1} fill="#6b737d" />
      </g>
      {[[80, 31], [86, 28], [74, 30], [90, 33]].map(([x, y], i) => <Star key={i} x={x} y={y} r={1.8} fill="#ffd23f" />)}
    </g>
  );
}

function CityHall() {
  const cols = [44, 53, 63, 72];
  return (
    <g>
      <Sky color="#e3f0fa"><Cloud x={16} y={14} /><Cloud x={84} y={10} s={0.7} /></Sky>
      <Ground y={64} fill={PAVE} />
      <path d="M102 32 V8" {...line(INK, 1.2)} />
      <Shape d="M102 8 Q107 6 113 9 V16 Q107 13 102 15 Z" fill="#e04b4b" thin />
      <Box x={6} y={36} w={108} h={30} fill="#f2ede3" />
      <Box x={4} y={33} w={112} h={4} fill="#3e6fb0" />
      <Windows x={11} y={41} cols={3} rows={2} w={6} h={8} gx={4} gy={5} />
      <Windows x={83} y={41} cols={3} rows={2} w={6} h={8} gx={4} gy={5} />
      <Box x={51} y={14} w={18} h={18} fill="#f8f4ea" />
      <Shape d="M49 14 L60 4 L71 14 Z" fill="#3e6fb0" />
      <Clock x={60} y={22} r={5.5} />
      <Box x={40} y={34} w={40} h={26} fill="#f8f4ea" />
      <Shape d="M37 35 L60 26 L83 35 Z" fill="#f8f4ea" />
      <Door x={55} y={46} w={10} h={14} />
      {cols.map((x) => <Box key={x} x={x} y={36} w={4} h={24} fill={WHITE} thin />)}
      <Box x={38} y={60} w={44} h={3} fill="#e3ddd1" thin />
      <Box x={35} y={63} w={50} h={3} fill="#d6cfc3" thin />
    </g>
  );
}

function RenovationCompany() {
  const pole = '#7d8792';
  return (
    <g>
      <Sky><Cloud x={14} y={12} /></Sky>
      <Ground y={64} />
      <path d={bracing(100, 6, 10, 64, 6)} {...line('#c99a1e', 1)} />
      <Box x={99} y={8} w={1.8} h={58} fill="#f2c230" thin />
      <Box x={105} y={8} w={1.8} h={58} fill="#f2c230" thin />
      <Box x={52} y={7} w={66} h={3.5} fill="#f2c230" thin />
      <Box x={108} y={10.5} w={8} h={6} fill="#6b737d" thin />
      <Box x={98} y={11} w={9} h={7} fill="#f2c230" thin />
      <path d="M64 10.5 V24" {...line(INK, 0.8)} />
      <path d="M64 24 q0 2 2 2" {...line(INK, 1)} />
      <Box x={55} y={26} w={20} h={3.5} fill="#c98b4f" thin />
      <Box x={18} y={38} w={56} h={28} fill="#fbe7c2" />
      <Shape d="M12 40 L46 22 L80 40 Z" fill="#d0603e" />
      <Box x={50} y={44} w={10} h={9} fill={GLASS} thin />
      <Door x={62} y={48} w={9} h={18} />
      {[12, 26, 40].map((x) => <Box key={x} x={x} y={30} w={2} h={36} fill={pole} thin />)}
      {[44, 55].map((y) => <Box key={y} x={10} y={y} w={34} h={2.5} fill="#c98b4f" thin />)}
      <path d="M13 44 L27 55 M27 44 L41 55 M13 33 L27 44" {...line(pole, 0.9)} />
      <Box x={84} y={58} w={8} h={8} rx={1} fill="#3e78b3" thin />
      <path d="M84 60 H92" {...line(WHITE, 1)} />
    </g>
  );
}

function MarketStall({ x, cloth, produce }: { x: number; cloth: string; produce: ReactNode }) {
  const w = 34;
  return (
    <g>
      <Box x={x + 2} y={28} w={2} h={38} fill={WOOD} thin />
      <Box x={x + w - 4} y={28} w={2} h={38} fill={WOOD} thin />
      <Shape d={`M${x} 28 L${x + w / 2} 15 L${x + w} 28 Z`} fill={cloth} />
      <Awning x={x} y={28} w={w} h={4} colors={[cloth, WHITE]} n={5} />
      {produce}
      <Box x={x + 3} y={50} w={w - 6} h={3} fill={DARKWOOD} thin />
      <Box x={x + 4} y={53} w={w - 8} h={11} fill={cloth} thin />
      <path d={`M${x + 4} 57 H${x + w - 4}`} {...line(WHITE, 1)} />
    </g>
  );
}

function FarmersMarket() {
  const carrots = [8, 12, 16].map((dx) => (
    <Shape key={dx} d={`M${43 + dx} 49.5 L${45 + dx} 39 L${47 + dx} 49.5 Z`} fill="#f08a24" thin />
  ));
  return (
    <g>
      <Sky color="#eaf6f0"><Cloud x={20} y={8} s={0.8} /><Cloud x={98} y={8} s={0.8} /></Sky>
      <Ground y={64} />
      <MarketStall
        x={4}
        cloth="#3aa45f"
        produce={<g><Pile x={8} y={50} w={12} color="#e23b3b" r={2.2} /><Pile x={20} y={50} w={14} color="#8fd16a" r={3} /></g>}
      />
      <MarketStall
        x={43}
        cloth="#e04b4b"
        produce={
          <g>
            {carrots}
            {[0, 1, 2].map((dx) => <path key={dx} d={`M${53 + dx * 4} 39 l-1 -3 M${53 + dx * 4} 39 l1 -3`} {...line(GREEN, 0.9)} />)}
            <circle cx={70} cy={46} r={4} fill="#f08a24" {...THIN} />
            <path d="M70 42 V50 M67.5 43 Q66.5 46 67.5 49 M72.5 43 Q73.5 46 72.5 49" {...line('#c96a1a', 0.7)} />
          </g>
        }
      />
      <MarketStall
        x={82}
        cloth={GOLD}
        produce={
          <g>
            {[88, 94, 100].map((x) => <ellipse key={x} cx={x} cy={46} rx={2.6} ry={4} fill="#7d4fa8" {...THIN} />)}
            <Pile x={103} y={50} w={8} color="#f6a530" r={2} />
          </g>
        }
      />
    </g>
  );
}

function MovingCompany() {
  const wheel = (x: number) => (
    <g>
      <circle cx={x} cy={64} r={6.5} fill="#3a3a40" {...LINE} />
      <circle cx={x} cy={64} r={2.5} fill="#c9ced4" />
    </g>
  );
  const box = (x: number, y: number, w: number, h: number, fill = '#d9a566') => (
    <g>
      <Box x={x} y={y} w={w} h={h} fill={fill} thin />
      <path d={`M${x + w / 2} ${y} V${y + h * 0.4}`} {...line('#a87a44', 1.4)} />
    </g>
  );
  return (
    <g>
      <Sky><Cloud x={16} y={12} /><Cloud x={98} y={14} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={24} y={56} w={92} h={4} fill="#55595f" />
      <Box x={26} y={18} w={62} h={40} rx={2} fill="#f7f7f2" />
      <Box x={26} y={44} w={62} h={5} fill="#f08a24" thin />
      {box(47, 25, 16, 13)}
      <path d="M43 31.5 h-6 m2 -2.5 l-2 2.5 l2 2.5 M67 31.5 h6 m-2 -2.5 l2 2.5 l-2 2.5" {...line('#f08a24', 1.4)} />
      <Shape d="M88 32 H103 Q109 32 111 40 L114 48 V58 H88 Z" fill="#f08a24" />
      <Shape d="M92 35.5 H102 Q106 35.5 107.5 42 H92 Z" fill={GLASS} thin />
      <Box x={110} y={51} w={5} h={3} rx={1} fill={GOLD} thin />
      {wheel(40)}
      {wheel(100)}
      {box(3, 52, 17, 14)}
      {box(5, 40, 13, 12, '#e2b278')}
    </g>
  );
}

function Observatory() {
  const stars: [number, number, number][] = [
    [10, 8, 1], [24, 18, 0.8], [36, 6, 1.1], [86, 6, 0.9], [112, 30, 1], [8, 34, 0.8], [104, 40, 0.7], [78, 16, 0.7], [20, 44, 0.7],
  ];
  return (
    <g>
      <Sky color="#2c3566">
        {stars.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#fff6c8" />)}
      </Sky>
      <Star x={16} y={24} r={3} fill="#ffe680" />
      <Star x={94} y={24} r={2.4} fill="#ffe680" />
      <circle cx={104} cy={13} r={7} fill="#ffe9a0" {...THIN} />
      <circle cx={107} cy={11} r={6} fill="#2c3566" />
      <Shape d="M-2 66 Q60 54 122 66 V82 H-2 Z" fill="#3e6b52" />
      <Box x={36} y={42} w={48} h={24} fill="#e3e6ee" />
      <Box x={55} y={52} w={10} h={14} fill="#6b7385" thin />
      <circle cx={44} cy={54} r={2.5} fill="#ffe9a8" {...THIN} />
      <circle cx={76} cy={54} r={2.5} fill="#ffe9a8" {...THIN} />
      <Shape d="M32 43 A28 26 0 0 1 88 43 Z" fill="#c9cfdb" />
      <Shape d="M56.5 17.3 Q60 17 63.5 17.3 V43 H56.5 Z" fill="#1d2244" thin />
      <g transform="rotate(35 60 34)">
        <Box x={57} y={6} w={6} h={28} rx={1} fill="#8d96a8" />
        <Box x={56} y={5} w={8} h={4} rx={1} fill="#5f687a" thin />
      </g>
      <Box x={32} y={42} w={56} h={3} fill="#9aa3b5" thin />
    </g>
  );
}

function Publisher() {
  const books: [number, number, number, string][] = [
    [90, 60, 24, '#d84b4b'], [92, 54, 20, '#3e78b3'], [89, 48, 23, '#f2c230'], [93, 42, 18, '#3aa45f'], [91, 36, 21, '#8e5bc4'],
  ];
  return (
    <g>
      <Sky><Cloud x={100} y={12} /><Cloud x={10} y={10} s={0.6} /></Sky>
      <Ground y={64} fill={PAVE} />
      <path d="M32 28 V24 M64 28 V24" {...line(INK, 1.4)} />
      <Box x={8} y={30} w={80} h={36} fill="#efe2cf" />
      <Box x={6} y={27} w={84} h={4} fill="#6b4a8e" />
      <Box x={20} y={5} w={56} h={19} rx={1} fill={WHITE} />
      <Box x={24} y={8} w={48} h={3.5} fill={INK} thin />
      {[14.5, 17.5, 20.5].map((y) => <path key={y} d={`M24 ${y} H46`} {...line('#9aa3ad', 1.2)} />)}
      <Box x={50} y={13.5} w={22} h={8} fill="#cfd6dd" thin />
      <Box x={14} y={38} w={42} h={22} fill={GLASS} thin />
      <path d="M14 49 H56" {...line(DARKWOOD, 1.2)} />
      {[['#d84b4b', 17], ['#3e78b3', 21], ['#f2c230', 25], ['#3aa45f', 30], ['#8e5bc4', 34], ['#f08a24', 41], ['#d84b4b', 45], ['#3e78b3', 50]].map(([c, x], i) => (
        <rect key={i} x={x as number} y={40.5 + (i % 3)} width={3.4} height={8.5 - (i % 3)} fill={c as string} {...THIN} />
      ))}
      <path d="M16 52 H54 M16 56 H54" {...line('#d6ecf4', 1.2)} />
      <Door x={64} y={42} w={16} h={24} fill="#6b4a8e" />
      {books.map(([x, y, w, c]) => (
        <g key={y}>
          <Box x={x} y={y} w={w} h={6} rx={1} fill={c} thin />
          <path d={`M${x + w - 2.5} ${y + 1.2} V${y + 4.8}`} {...line(WHITE, 1.4)} />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Industry

function CheeseFactory() {
  return (
    <g>
      <Sky color="#eef6fb"><Cloud x={20} y={10} s={0.8} /></Sky>
      <Ground y={64} />
      <Box x={96} y={20} w={9} h={46} fill="#b9a28a" />
      <Box x={95} y={20} w={11} h={3} fill="#9a8570" thin />
      <Smoke x={101} y={14} />
      <Box x={8} y={38} w={86} h={28} fill="#f6e7bf" />
      <Box x={6} y={35} w={90} h={4} fill="#c28b3c" />
      <Windows x={14} y={44} cols={4} w={9} h={7} gx={4} />
      <Box x={68} y={46} w={20} h={20} fill="#c28b3c" thin />
      {[50, 54, 58, 62].map((y) => <path key={y} d={`M68 ${y} H88`} {...line('#8a5a20', 0.7)} />)}
      <Shape d="M14 22 L70 25 L86 9 Z" fill="#ffe27a" />
      <Shape d="M14 22 L70 25 V35 L14 32 Z" fill="#f6c443" />
      <Shape d="M70 25 L86 9 V19 L70 35 Z" fill="#e8a92e" />
      {[[26, 27.5, 2], [39, 29, 1.6], [52, 28.5, 2.6], [63, 31, 1.4], [78, 20, 1.8], [52, 20, 1.6], [66, 17, 1.2]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.75} fill="#d99a1e" />
      ))}
    </g>
  );
}

function FurnitureFactory() {
  const tw = 86 / 3;
  return (
    <g>
      <Sky><Cloud x={30} y={10} /></Sky>
      <Ground y={64} />
      <Box x={98} y={18} w={9} h={48} fill="#c46b4a" />
      <Box x={97} y={18} w={11} h={3} fill="#9c4f34" thin />
      <Smoke x={103} y={12} />
      {[0, 1, 2].map((i) => {
        const x0 = 8 + i * tw;
        return (
          <g key={i}>
            <Shape d={`M${x0} 38 L${x0 + tw - 5} 24 V38 Z`} fill="#a65a3a" />
            <Box x={x0 + tw - 5} y={24} w={5} h={14} fill={GLASS} thin />
          </g>
        );
      })}
      <Box x={8} y={38} w={86} h={28} fill="#e8d6b6" />
      <Windows x={13} y={44} cols={3} w={8} h={7} gx={3.5} />
      <Box x={50} y={42} w={20} h={18} rx={2} fill={CREAM} />
      <Box x={55} y={45} w={3} h={12} fill={WOOD} thin />
      <Box x={55} y={50.5} w={11} h={2.5} fill={WOOD} thin />
      <path d="M64.5 53 V57 M56.5 53 V57" {...line(INK, 1.2)} />
      <Box x={74} y={46} w={16} h={20} fill="#a65a3a" thin />
      {[50, 54, 58, 62].map((y) => <path key={y} d={`M74 ${y} H90`} {...line('#6b3a20', 0.7)} />)}
      {[[6, 70], [12, 70], [9, 65]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={3} fill="#c98b4f" {...THIN} />
          <circle cx={x} cy={y} r={1.2} {...line('#8a5a32', 0.6)} />
        </g>
      ))}
    </g>
  );
}

function FoodWarehouse() {
  return (
    <g>
      <Sky><Cloud x={100} y={12} /><Cloud x={20} y={10} s={0.7} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={6} y={32} w={80} h={34} fill="#c8d5de" />
      {Array.from({ length: 19 }, (_, i) => <path key={i} d={`M${10 + i * 4} 33 V65`} {...line('#a8b8c4', 0.7)} />)}
      <Shape d="M2 34 L46 19 L90 34 Z" fill="#6f8597" />
      <Box x={18} y={42} w={40} h={24} fill="#eef2f5" />
      {[45, 48, 51, 54, 57, 60, 63].map((y) => <path key={y} d={`M18 ${y} H58`} {...line('#a8b8c4', 0.8)} />)}
      <Box x={16} y={40} w={44} h={3} fill="#6f8597" thin />
      <Box x={30} y={34} w={16} h={5} rx={1} fill="#e8a33a" thin />
      <Box x={64} y={44} w={12} h={10} fill={GLASS} thin />
      <Crate x={84} y={53} s={13} />
      <Crate x={98} y={53} s={13} />
      <Crate x={91} y={40} s={13} fill="#d9a566" />
      <Pile x={91} y={40} w={13} color="#e23b3b" r={2.2} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// MK1 expansions (Harbor, Millionaire's Row)

function Fish({ x, y, s = 1, color = '#6b8fb3', flip = false }: XY & { s?: number; color?: string; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <path d="M-7 0 Q-2 -4.5 4 -1.5 L8 -4 L7 0 L8 4 L4 1.5 Q-2 4.5 -7 0 Z" fill={color} {...THIN} />
      <circle cx={-4.2} cy={-0.6} r={0.8} fill={INK} />
    </g>
  );
}

/** Rows of little wave crests across the water at y. */
function Waves({ y, color = WHITE }: { y: number; color?: string }) {
  let d = '';
  for (let x = 2; x < 120; x += 13) d += ` M${x} ${y} q3 -2 6 0 t6 0`;
  return <path d={d} {...line(color, 0.9)} opacity={0.7} />;
}

/** Barrel, base centre at (x, y). */
function Barrel({ x, y }: XY) {
  return (
    <g>
      <Shape d={`M${x - 5} ${y} Q${x - 6.5} ${y - 6} ${x - 5} ${y - 12} H${x + 5} Q${x + 6.5} ${y - 6} ${x + 5} ${y} Z`} fill="#a86a3a" thin />
      <path d={`M${x - 5.8} ${y - 3.5} H${x + 5.8} M${x - 5.8} ${y - 8.5} H${x + 5.8}`} {...line('#5a3a1e', 0.9)} />
    </g>
  );
}

function PizzaJoint() {
  return (
    <g>
      <Sky color="#fdf0e0"><Cloud x={16} y={12} /><Cloud x={104} y={14} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={18} y={34} w={84} h={32} fill="#fbe7c6" />
      <Box x={15} y={30} w={90} h={5} fill="#2f8f4e" />
      <Awning x={18} y={35} w={84} colors={['#d8483b', WHITE]} n={12} />
      <Box x={23} y={48} w={30} h={15} fill={GLASS} thin />
      <path d="M25 63 Q38 53 51 63 Z" fill="#f08a24" opacity={0.7} />
      <path d="M38 48 V63" {...line(INK, 0.8)} />
      <Door x={62} y={45} w={15} h={21} fill="#2f8f4e" />
      <Box x={84} y={48} w={13} h={13} fill={GLASS} thin />
      <path d="M60 30 V25" {...line(INK, 1.4)} />
      <circle cx={60} cy={14} r={11.5} fill="#e9b25a" {...LINE} />
      <circle cx={60} cy={14} r={9} fill="#f6d04d" {...THIN} />
      <path d="M60 5 V23 M51 14 H69 M53.6 7.6 L66.4 20.4 M66.4 7.6 L53.6 20.4" {...line('#d9a43a', 0.7)} />
      {[[56, 10.5], [64.5, 11], [57, 18], [63.5, 18.5]].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r={1.9} fill="#c8402f" {...THIN} />
      ))}
    </g>
  );
}

function MackerelBoat() {
  return (
    <g>
      <Sky color="#d3edfb"><Cloud x={18} y={12} /><Sun x={102} y={13} r={5} /></Sky>
      <Box x={-2} y={56} w={124} h={28} fill="#4a9fd8" />
      <Waves y={66} />
      <Waves y={74} />
      <Shape d="M26 50 H94 L85 63 H35 Z" fill="#e2513f" />
      <path d="M29 54.5 H91" {...line(WHITE, 1.6)} />
      <Box x={44} y={36} w={22} h={14} fill={CREAM} />
      <Box x={42} y={33} w={26} h={4} fill="#2f6fa8" />
      <Box x={48} y={39.5} w={5} h={5} fill={GLASS} thin />
      <Box x={57} y={39.5} w={5} h={5} fill={GLASS} thin />
      <path d="M78 50 V20" {...line(INK, 1.4)} />
      <path d="M78 23 L100 43" {...line(INK, 0.9)} />
      <path d="M95 42 Q100 50 105 43" {...line('#7a5a3a', 0.9)} />
      <Fish x={100} y={46} s={0.6} color="#5f86ad" />
      <Fish x={14} y={46} s={0.75} color="#5f86ad" flip />
      <path d="M8 52 q2 -3 4 0 M18 53 q2 -3 4 0" {...line(WHITE, 0.9)} />
    </g>
  );
}

function TunaBoat() {
  return (
    <g>
      <Sky color="#cfe6f6"><Cloud x={22} y={12} /><Cloud x={98} y={10} s={0.8} /></Sky>
      <Box x={-2} y={56} w={124} h={28} fill="#2f7fc0" />
      <Waves y={67} />
      <Waves y={75} />
      <Shape d="M10 47 H110 L100 64 H22 Z" fill="#2f5f8a" />
      <path d="M13 52 H107" {...line('#e2513f', 2)} />
      <Box x={64} y={29} w={28} h={18} fill={WHITE} />
      <Box x={62} y={26} w={32} h={4} fill="#e2513f" />
      <Windows x={67} y={33} cols={3} w={5.5} h={5} gx={2.5} />
      <path d="M78 26 V11 M73 15 H83" {...line(INK, 1.2)} />
      <circle cx={78} cy={10} r={1.3} fill={RED} />
      <path d="M26 47 V22 L50 34" {...line(INK, 2.6)} />
      <path d="M26 47 V22 L50 34" {...line(STEEL, 1.2)} />
      <path d="M44 31 V36" {...line(INK, 0.8)} />
      <Fish x={42} y={42} s={1.55} color="#3d5a80" />
      <path d="M33 41 l3 -2 M33 43 l3 2" {...line('#9fb6cc', 0.8)} />
    </g>
  );
}

function TaxOffice() {
  return (
    <g>
      <Sky color="#e9eef5"><Cloud x={14} y={12} /><Cloud x={106} y={12} s={0.8} /></Sky>
      <Ground y={64} fill={PAVE} />
      <Box x={10} y={62} w={100} h={4} fill="#d8d2c6" thin />
      <Box x={14} y={59} w={92} h={3.5} fill="#e4dfd5" thin />
      <Box x={18} y={35} w={84} h={24} fill="#e7e2f3" />
      <Gable x={14} y={16} w={92} h={16} fill="#cfc6e6" />
      <Box x={14} y={31.5} w={92} h={4} fill="#b9addb" />
      {[23, 37, 77, 91].map((x) => <Box key={x} x={x} y={36} w={6} h={23} fill={WHITE} thin />)}
      <Door x={52} y={41} w={16} h={18} fill="#6b4fa0" />
      <text x={60} y={29} textAnchor="middle" fontSize={8} fontWeight={900} fontFamily={FONT} fill="#5b3f90">TAX</text>
      <Coin x={110} y={52} r={5} label="$" />
      <Coin x={104} y={58} r={4} />
      <Shape d="M4 66 Q2 56 8 54 H14 Q20 56 18 66 Z" fill="#c9a46a" thin />
      <path d="M8 54 L11 50 L14 54" {...line(INK, 0.9)} />
      <text x={11} y={63} textAnchor="middle" fontSize={6} fontWeight={900} fontFamily={FONT} fill="#6a4a1a">$</text>
    </g>
  );
}

function GeneralStore() {
  return (
    <g>
      <Sky color="#fdf3df"><Cloud x={14} y={12} /><Cloud x={106} y={14} s={0.8} /></Sky>
      <Ground y={64} fill={DIRT} />
      <Shape d="M22 66 V24 H38 V18 H82 V24 H98 V66 Z" fill="#c98b4f" />
      <path d="M22 31 H98 M22 38 H98" {...line('#9a6436', 0.6)} />
      <Box x={36} y={21} w={48} h={10} fill={CREAM} thin />
      <text x={60} y={28.6} textAnchor="middle" fontSize={6.4} fontWeight={900} fontFamily={FONT} fill="#7a4a26">GENERAL STORE</text>
      <Shape d="M15 42 H105 L101 46 H19 Z" fill="#8a5a32" />
      <path d="M22 46 V64 M98 46 V64" {...line(DARKWOOD, 1.8)} />
      <Box x={29} y={49} w={17} h={12} fill={GLASS} thin />
      <Box x={74} y={49} w={17} h={12} fill={GLASS} thin />
      <path d="M37.5 49 V61 M82.5 49 V61" {...line(INK, 0.7)} />
      <Door x={53} y={47} w={14} h={19} />
      <Barrel x={10} y={66} />
      <Barrel x={110} y={66} />
      <Crate x={99} y={56} s={8} />
    </g>
  );
}

function DemolitionCompany() {
  return (
    <g>
      <Sky color="#f3ead8"><Cloud x={18} y={12} /><Cloud x={64} y={8} s={0.7} /></Sky>
      <Ground y={64} fill={DIRT} />
      <Shape d="M84 66 V30 L91 26 L96 33 L103 27 L112 31 V66 Z" fill="#c9a07a" />
      <Windows x={88} y={38} cols={3} rows={3} w={5} h={5} gx={2.5} gy={3} fill="#8fb6c9" />
      <path d="M96 33 L93 40 M103 27 L105 34" {...line('#8a6448', 0.8)} />
      {[[78, 62, 20], [86, 64, -15], [74, 64, 40]].map(([x, y, a]) => (
        <rect key={`${x}`} x={x} y={y - 3} width={5} height={3} fill="#c9603f" {...THIN} transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <g fill="#ebe3d6" {...THIN}>
        <circle cx={82} cy={44} r={3.5} />
        <circle cx={86} cy={39} r={4.2} />
        <circle cx={80} cy={50} r={2.8} />
      </g>
      <path d="M22 50 L58 10" {...line(INK, 3.4)} />
      <path d="M22 50 L58 10" {...line('#f2b632', 1.8)} />
      <path d="M58 10 L73 34" {...line(INK, 0.9)} />
      <circle cx={75} cy={38} r={6} fill="#4a4f5b" {...LINE} />
      <path d="M72 35.5 q2 -2 4 -1" {...line(WHITE, 1)} opacity={0.5} />
      <Box x={8} y={48} w={32} h={11} rx={1.5} fill="#f2b632" />
      <Box x={26} y={40} w={13} h={9} fill="#f2b632" />
      <Box x={29} y={42} w={7.5} h={5} fill={GLASS} thin />
      <Box x={6} y={58} w={36} h={7} rx={3.5} fill="#4a4f5b" />
      {[11, 18, 25, 32, 38].map((x) => <circle key={x} cx={x} cy={61.5} r={2} fill="#8b95a1" {...THIN} />)}
    </g>
  );
}

function Harbor() {
  return (
    <g>
      <Sky color="#d3edfb"><Cloud x={46} y={12} /><Cloud x={14} y={20} s={0.7} /></Sky>
      <Box x={-2} y={52} w={124} h={32} fill="#4a9fd8" />
      <Waves y={66} />
      <Waves y={75} />
      <Box x={6} y={36} w={28} h={16} fill="#e2513f" />
      <Gable x={4} y={27} w={32} h={9} fill="#a33a2e" />
      <Box x={15} y={42} w={9} h={10} fill={DARKWOOD} thin />
      <Box x={-2} y={52} w={60} h={7} fill="#b0703c" />
      <path d="M6 59 V70 M20 59 V70 M34 59 V70 M48 59 V70" {...line(DARKWOOD, 2.2)} />
      <Box x={42} y={48} w={4} h={4} rx={1} fill="#4a4f5b" thin />
      <Shape d="M60 57 H82 L78 63 H64 Z" fill="#e2513f" />
      <path d="M71 57 V43" {...line(INK, 1.1)} />
      <Shape d="M72 44 L80 55 H72 Z" fill={WHITE} thin />
      <Shape d="M92 54 L95 22 H103 L106 54 Z" fill={WHITE} />
      <path d="M93.2 41 H104.8 M94 31 H104" {...line('#e2513f', 3)} />
      <Box x={93} y={15} w={12} h={7} fill={GOLD} />
      <path d="M96 15 V22 M102 15 V22" {...line(INK, 0.7)} />
      <Shape d="M91.5 15 L99 9 L106.5 15 Z" fill="#e2513f" />
      <path d="M92 18 L80 14 M92 19 L80 22 M106 18 L118 14 M106 19 L118 22" {...line('#ffd54a', 1.2)} />
      <ellipse cx={99} cy={55} rx={11} ry={3} fill="#8b95a1" {...THIN} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Symbol badges

const SYMBOL_COLOR: Record<Exclude<MkSymbol, 'none'>, string> = {
  wheat: '#e2a321',
  cow: '#9a6a44',
  gear: '#5f6f80',
  shop: '#3a9a5b',
  cup: '#d8483b',
  fruit: '#ef7f2f',
  flower: '#e0609c',
  factory: '#3d7fc4',
  major: '#7b4fb5',
  boat: '#2b8fc9',
  briefcase: '#8a6440',
};

export function SymbolIcon({ symbol, size = 16 }: { symbol: MkSymbol; size?: number }): JSX.Element | null {
  if (symbol === 'none') return null;
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      <circle cx={10} cy={10} r={9.2} fill={SYMBOL_COLOR[symbol]} stroke={INK} strokeWidth={1} />
      {glyph(symbol)}
    </svg>
  );
}

function glyph(symbol: Exclude<MkSymbol, 'none'>): JSX.Element {
  const W = WHITE;
  switch (symbol) {
    case 'wheat':
      return (
        <g fill={W}>
          <path d="M10 17 V7" {...line(W, 1.3)} />
          {[8, 11, 14].map((y) => (
            <g key={y}>
              <ellipse cx={8.3} cy={y - 1} rx={1.3} ry={2.2} transform={`rotate(-30 8.3 ${y - 1})`} />
              <ellipse cx={11.7} cy={y - 1} rx={1.3} ry={2.2} transform={`rotate(30 11.7 ${y - 1})`} />
            </g>
          ))}
          <ellipse cx={10} cy={4.6} rx={1.2} ry={2} />
        </g>
      );
    case 'cow':
      return (
        <g>
          <path d="M6.6 6.4 Q6 4 7.4 3.4 M13.4 6.4 Q14 4 12.6 3.4" {...line('#f3e7cc', 1.3)} />
          <ellipse cx={5} cy={8} rx={2} ry={1.1} fill={W} transform="rotate(-20 5 8)" />
          <ellipse cx={15} cy={8} rx={2} ry={1.1} fill={W} transform="rotate(20 15 8)" />
          <ellipse cx={10} cy={9.6} rx={4.2} ry={4.8} fill={W} />
          <ellipse cx={10} cy={13.6} rx={3.6} ry={2.4} fill="#f7b6b6" />
          <circle cx={8.6} cy={13.6} r={0.55} fill={INK} />
          <circle cx={11.4} cy={13.6} r={0.55} fill={INK} />
          <circle cx={8.3} cy={9} r={0.75} fill={INK} />
          <circle cx={11.7} cy={9} r={0.75} fill={INK} />
        </g>
      );
    case 'gear':
      return (
        <g fill={W}>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={8.8} y={3.2} width={2.4} height={3} rx={0.4} transform={`rotate(${i * 45} 10 10)`} />
          ))}
          <circle cx={10} cy={10} r={4.6} />
          <circle cx={10} cy={10} r={1.8} fill={SYMBOL_COLOR.gear} />
        </g>
      );
    case 'shop':
      return (
        <g>
          <path d="M4.5 9.5 L10 4.5 L15.5 9.5 Z" fill={W} />
          <rect x={6} y={9.5} width={8} height={6.5} fill={W} />
          <rect x={8.9} y={12} width={2.2} height={4} fill={SYMBOL_COLOR.shop} />
        </g>
      );
    case 'cup':
      return (
        <g>
          <path d="M7.5 5.5 Q6.8 4.2 7.5 3 M10 5.5 Q9.3 4.2 10 3" {...line(W, 0.9)} />
          <circle cx={13.6} cy={10.2} r={1.7} {...line(W, 1.1)} />
          <path d="M5.2 7.5 H13.4 V10.6 Q13.4 14.4 9.3 14.4 Q5.2 14.4 5.2 10.6 Z" fill={W} />
          <path d="M4 16 H14.6" {...line(W, 1.3)} />
        </g>
      );
    case 'fruit':
      return (
        <g>
          <path d="M10 7 Q10 5 11 3.6" {...line(INK, 0.9)} />
          <path d="M10.6 5.4 Q13 3 15 4.4 Q13 6.4 10.6 5.4 Z" fill="#7ccf5a" />
          <path d="M10 7.2 Q6.5 5.6 5 8.6 Q4 12.4 6.6 15.2 Q8.2 16.6 10 15.6 Q11.8 16.6 13.4 15.2 Q16 12.4 15 8.6 Q13.5 5.6 10 7.2 Z" fill={W} />
        </g>
      );
    case 'flower':
      return (
        <g>
          <path d="M10 16.5 V9" {...line(W, 1.2)} />
          <path d="M10 15.5 Q6.5 14.5 6 11.5 Q8.8 12.3 10 15.5 Z" fill={W} />
          <path d="M6.5 4.6 V8.4 Q10 12 13.5 8.4 V4.6 L11.8 6.6 L10 3.4 L8.2 6.6 Z" fill={W} />
        </g>
      );
    case 'factory':
      return (
        <g fill={W}>
          <rect x={12.6} y={4.4} width={2.4} height={6} />
          <path d="M4 16 V10.2 L7.6 12.2 V10.2 L11.2 12.2 V10.2 L15.6 12.2 V16 Z" />
        </g>
      );
    case 'major':
      return (
        <g fill={W}>
          <path d="M3.8 7.6 L10 4 L16.2 7.6 Z" />
          <rect x={4.4} y={7.9} width={11.2} height={1.2} />
          {[5.2, 8.9, 12.6].map((x) => <rect key={x} x={x} y={9.6} width={2.2} height={4.6} />)}
          <rect x={3.8} y={14.6} width={12.4} height={1.8} />
        </g>
      );
    case 'boat':
      return (
        <g fill={W}>
          <path d="M3.8 12 H16.2 L14.2 15.6 H5.8 Z" />
          <path d="M10.4 3.6 V11 H15.2 Z" />
          <path d="M9.4 5.4 V11 H5.4 Z" />
        </g>
      );
    case 'briefcase':
      return (
        <g>
          <path d="M7.6 6.8 V5.4 Q7.6 4.4 8.6 4.4 H11.4 Q12.4 4.4 12.4 5.4 V6.8" {...line(W, 1.2)} />
          <rect x={4} y={6.8} width={12} height={8.6} rx={1.4} fill={W} />
          <path d="M4 10.6 H16" {...line(SYMBOL_COLOR.briefcase, 1)} />
          <rect x={9} y={9.8} width={2} height={1.8} fill={SYMBOL_COLOR.briefcase} />
        </g>
      );
  }
}
