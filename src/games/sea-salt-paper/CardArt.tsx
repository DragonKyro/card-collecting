// Hand-drawn SVG illustrations for each card family, in an origami style:
// every figure is built from flat paper facets, each fold a light / dark pair
// of the same hue, with a crisp ink edge so it reads at card size.
//
// Each illustration is drawn in a 100 × 120 viewBox and dropped onto the
// card body in Card.tsx, where it renders about 44 × 53 px — one unit is under
// half a pixel. So: big simple shapes that fill the frame, edges of ~1.3
// units, no detail smaller than ~4 units.

import type { SspCardFamily } from './types';

interface Props {
  family: SspCardFamily;
  /** Card body color used to harmonise the illustration. */
  bodyColor: string;
}

export function CardArt({ family, bodyColor }: Props) {
  switch (family) {
    case 'mermaid':       return <Mermaid />;
    case 'crab':          return <Crab />;
    case 'boat':          return <Boat />;
    case 'fish':          return <Fish />;
    case 'shark':         return <Shark />;
    case 'swimmer':       return <Swimmer />;
    case 'shell':         return <Shell />;
    case 'octopus':       return <Octopus />;
    case 'penguin':       return <Penguin />;
    case 'sailor':        return <Sailor />;
    case 'lighthouse':    return <Lighthouse />;
    case 'shoal':         return <Shoal />;
    case 'penguinColony': return <PenguinColony />;
    case 'captain':       return <Captain />;
    case 'jellyfish':     return <Jellyfish />;
    case 'lobster':       return <Lobster />;
    case 'starfish':      return <Starfish />;
    case 'seahorse':      return <Seahorse />;
    case 'crabBasket':    return <CrabBasket />;
    default:
      void bodyColor; // unused fallback
      return null;
  }
}

const INK = '#1c1a2e';
const EDGE = 1.3;
const CREASE = 'rgba(255,255,255,0.55)';

/** One flat paper facet. */
function F({ p, c }: { p: string; c: string }) {
  return <polygon points={p} fill={c} stroke={INK} strokeWidth={EDGE} strokeLinejoin="round" />;
}

/** A fold line drawn on top of a facet. */
function Crease({ p, c = CREASE, w = 1.1 }: { p: string; c?: string; w?: number }) {
  return <polyline points={p} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
}

function Eye({ x, y, r = 3.4 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth={EDGE * 0.8} />
      <circle cx={x + r * 0.15} cy={y} r={r * 0.55} fill={INK} />
    </g>
  );
}

function Dot({ x, y, r = 1.7 }: { x: number; y: number; r?: number }) {
  return <circle cx={x} cy={y} r={r} fill={INK} />;
}

/** Mirror a points list across the vertical centre line (x → 100 − x). */
function mirror(points: string): string {
  return points.trim().split(/\s+/).map((pt) => {
    const [x, y] = pt.split(',').map(Number);
    return `${100 - x},${y}`;
  }).join(' ');
}

// ---------------------------------------------------------------- base game

function Mermaid() {
  const tailL = '#45a9b8';
  const tailD = '#2b7f8f';
  const skin = '#f6cfa8';
  const skinD = '#e3ae84';
  const hair = '#c9573a';
  const hairD = '#9c3f27';
  return (
    <g>
      {/* hair, behind the head and shoulders */}
      <F p="34,26 40,8 62,8 70,22 77,48 68,68 62,42 58,26" c={hair} />
      <F p="62,42 68,68 77,48 70,22" c={hairD} />
      {/* tail, curling down to the left */}
      <F p="38,64 62,64 70,82 62,100 46,106 48,94 54,82 46,74" c={tailL} />
      <F p="52,64 62,64 70,82 62,100 46,106 50,96 58,82" c={tailD} />
      <Crease p="42,70 49,74 56,70" />
      <Crease p="48,80 55,84 62,80" />
      <Crease p="51,91 57,95 62,91" />
      {/* tail fin */}
      <F p="48,104 22,106 35,91" c={tailL} />
      <F p="48,104 44,117 61,109" c={tailD} />
      {/* torso and arm */}
      <F p="38,40 58,40 62,64 38,64" c={skin} />
      <F p="50,40 58,40 62,64 50,64" c={skinD} />
      <F p="38,42 27,60 33,63 42,48" c={skinD} />
      {/* shell top */}
      <F p="38,46 48,46 43,54" c="#b984c9" />
      <F p="50,46 60,46 55,54" c="#9c68ad" />
      {/* head */}
      <F p="38,24 43,12 57,12 62,24 57,38 43,38" c={skin} />
      <F p="50,12 57,12 62,24 57,38 50,38" c={skinD} />
      {/* fringe */}
      <F p="37,22 42,9 59,9 63,20 50,17" c={hair} />
      <Dot x={45} y={26} r={1.8} />
      <Dot x={55} y={26} r={1.8} />
      <Crease p="46,32 50,34.5 54,32" c={INK} w={1} />
    </g>
  );
}

const CRAB_L = '#ec6a5c';
const CRAB_D = '#c4453a';

/** Crab drawn in the 100 × 120 frame (reused by the crab basket). */
function CrabShape() {
  const legs = ['26,64 4,60 26,70', '28,71 6,80 30,76', '34,78 16,94 38,80'];
  const arm = '22,48 28,44 36,56 30,60';
  const fingerA = '10,44 12,20 23,37';
  const fingerB = '18,41 30,22 31,42';
  const palm = '10,44 23,37 31,42 22,52';
  return (
    <g>
      {legs.map((p) => <F key={p} p={p} c={CRAB_D} />)}
      {legs.map((p) => <F key={`m${p}`} p={mirror(p)} c={CRAB_D} />)}
      <F p={arm} c={CRAB_D} />
      <F p={mirror(arm)} c={CRAB_D} />
      <F p={palm} c={CRAB_D} />
      <F p={fingerA} c={CRAB_L} />
      <F p={fingerB} c={CRAB_L} />
      <F p={mirror(palm)} c={CRAB_D} />
      <F p={mirror(fingerA)} c={CRAB_L} />
      <F p={mirror(fingerB)} c={CRAB_L} />
      {/* carapace: light upper facet, dark lower facet */}
      <F p="22,64 34,50 66,50 78,64" c={CRAB_L} />
      <F p="22,64 78,64 66,80 34,80" c={CRAB_D} />
      <Crease p="40,70 50,74 60,70" />
      {/* eye stalks */}
      <F p="42,52 40,42 44,42 46,52" c={CRAB_D} />
      <F p="54,52 56,42 60,42 58,52" c={CRAB_D} />
      <Eye x={42} y={39} r={4} />
      <Eye x={58} y={39} r={4} />
    </g>
  );
}

function Crab() {
  return <g transform="translate(0,6)"><CrabShape /></g>;
}

function Boat() {
  return (
    <g>
      {/* water */}
      <F p="4,100 16,96 28,100 40,96 52,100 64,96 76,100 88,96 96,99 96,112 4,112" c="#8cc3df" />
      {/* sail: one fold down the middle */}
      <F p="50,16 26,76 50,76" c="#fbf3dc" />
      <F p="50,16 50,76 74,76" c="#e2d0a2" />
      {/* hull */}
      <F p="8,74 92,74 85,84 15,84" c="#ea835d" />
      <F p="15,84 85,84 74,100 26,100" c="#cc5a35" />
      <Crease p="30,74 25,100" />
      <Crease p="70,74 75,100" />
    </g>
  );
}

/** Origami fish facing right, in the 100 × 120 frame (reused by the shoal). */
function FishShape({ light, dark, head }: { light: string; dark: string; head: string }) {
  return (
    <g>
      <F p="26,60 6,34 15,60" c={dark} />
      <F p="26,60 15,60 6,86" c={light} />
      <F p="44,42 56,22 64,40" c={dark} />
      <F p="46,78 50,96 62,80" c={dark} />
      <F p="24,60 52,36 94,58 56,60" c={light} />
      <F p="24,60 56,60 94,58 52,84" c={dark} />
      <F p="72,45 94,58 72,73" c={head} />
      <Eye x={81} y={56} r={4} />
    </g>
  );
}

function Fish() {
  return <FishShape light="#55b9d6" dark="#2c82a0" head="#7fcde2" />;
}

function Shark() {
  const top = '#71899a';
  const dark = '#4b5f6f';
  return (
    <g>
      {/* tail */}
      <F p="24,62 3,30 16,62" c={dark} />
      <F p="24,66 16,62 8,88" c={top} />
      {/* fins */}
      <F p="46,50 58,20 67,48" c={dark} />
      <F p="52,72 44,96 66,74" c={dark} />
      {/* body: grey back, pale belly */}
      <F p="20,62 58,44 96,64 56,66" c={top} />
      <F p="20,66 56,66 96,64 84,73 56,82" c="#e4eaee" />
      {/* gills, mouth, eye */}
      <Crease p="66,56 64,66" c={INK} w={1} />
      <Crease p="70,56 68,66" c={INK} w={1} />
      <Crease p="84,70 93,66" c={INK} w={1.1} />
      <Eye x={81} y={60} r={3.2} />
    </g>
  );
}

function Swimmer() {
  const skin = '#f3c9a2';
  const skinD = '#d9a57c';
  return (
    <g>
      {/* water, two bands of waves */}
      <F p="4,78 16,74 28,78 40,74 52,78 64,74 76,78 88,74 96,77 96,112 4,112" c="#86c0e2" />
      <F p="4,92 16,88 28,92 40,88 52,92 64,88 76,92 88,88 96,91 96,112 4,112" c="#5c9fcb" />
      {/* kicking foot, splash */}
      <F p="18,76 4,66 10,80" c={skinD} />
      <Crease p="8,62 12,58" c="#fff" w={1.6} />
      <Crease p="16,62 18,56" c="#fff" w={1.6} />
      {/* arm reaching over the head */}
      <F p="48,74 56,40 66,44 58,76" c={skin} />
      <F p="56,40 78,34 92,60 84,62 74,46 66,44" c={skinD} />
      <Crease p="88,66 92,70" c="#fff" w={1.6} />
      <Crease p="80,68 80,74" c="#fff" w={1.6} />
      {/* head: cap, goggle strap and lens */}
      <F p="26,64 30,52 44,50 52,58 48,72 32,74" c={skin} />
      <F p="25,63 29,50 44,47 53,57 40,60" c="#e0584f" />
      <Crease p="27,64 41,62" c={INK} w={1.8} />
      <circle cx={45} cy={62} r={4} fill="#2a5f8a" stroke={INK} strokeWidth={EDGE} />
      <circle cx={46.5} cy={60.5} r={1.2} fill="#fff" />
    </g>
  );
}

function Shell() {
  // A scallop: a pleated fan of facets around the hinge, light and dark in turn.
  const hinge = '50,98';
  const rim = ['8,68', '14,42', '30,24', '50,18', '70,24', '86,42', '92,68'];
  return (
    <g>
      {rim.slice(0, -1).map((pt, i) => (
        <F key={pt} p={`${hinge} ${pt} ${rim[i + 1]}`} c={i % 2 ? '#e39c58' : '#f8c68e'} />
      ))}
      <F p="36,92 64,92 60,104 40,104" c="#c47e44" />
    </g>
  );
}

function Octopus() {
  const light = '#c25bb1';
  const dark = '#94377e';
  const outer = '30,58 17,70 11,84 15,96 26,98 28,92 22,90 19,84 25,74 40,62';
  return (
    <g>
      {/* arms: the outer pair curl up at the tips */}
      <F p={outer} c={dark} />
      <F p={mirror(outer)} c={dark} />
      <F p="40,62 34,82 38,96 33,108 44,101 46,84 50,62" c={light} />
      <F p="50,62 54,84 56,101 67,108 62,96 66,82 60,62" c={dark} />
      {/* mantle, folded down the middle */}
      <F p="50,10 30,22 22,46 34,64 50,64" c={light} />
      <F p="50,10 50,64 66,64 78,46 70,22" c={dark} />
      <Eye x={41} y={50} r={4.2} />
      <Eye x={59} y={50} r={4.2} />
    </g>
  );
}

const PENGUIN_DARK = '#25263c';
const PENGUIN_WING = '#3e4060';

/** Origami penguin in the 100 × 120 frame, feet at y ≈ 108 (reused by the colony). */
function PenguinShape() {
  const wing = '34,40 20,74 31,82 38,56';
  return (
    <g>
      <F p="36,104 48,104 42,111" c="#f4a23c" />
      <F p="52,104 64,104 58,111" c="#f4a23c" />
      <F p="34,32 66,32 75,70 66,104 34,104 25,70" c={PENGUIN_DARK} />
      <F p="40,36 60,36 67,70 58,102 42,102 33,70" c="#f8f4ea" />
      <F p="50,36 60,36 67,70 58,102 50,102" c="#e2dccd" />
      <F p={wing} c={PENGUIN_WING} />
      <F p={mirror(wing)} c={PENGUIN_WING} />
      {/* head */}
      <F p="50,10 66,20 68,34 32,34 34,20" c={PENGUIN_DARK} />
      <Eye x={43} y={25} r={3.2} />
      <Eye x={57} y={25} r={3.2} />
      <F p="44,31 56,31 50,40" c="#f4a23c" />
    </g>
  );
}

function Penguin() {
  return <PenguinShape />;
}

function Sailor() {
  // Breton-striped shirt, red neckerchief, white cap.
  const left = (y: number) => 22 - (6 * (y - 72)) / 38;
  const right = (y: number) => 78 + (6 * (y - 72)) / 38;
  const band = (y0: number, y1: number) =>
    `${left(y0)},${y0} ${right(y0)},${y0} ${right(y1)},${y1} ${left(y1)},${y1}`;
  return (
    <g>
      {/* head first: the shirt's neckline overlaps the chin */}
      <F p="35,52 41,38 59,38 65,52 59,74 41,74" c="#f3c9a2" />
      <F p="50,38 59,38 65,52 59,74 50,74" c="#e1b089" />
      <Dot x={45} y={54} r={1.9} />
      <Dot x={55} y={54} r={1.9} />
      <Crease p="46,61 50,64 54,61" c={INK} w={1} />
      <F p="22,72 78,72 84,110 16,110" c="#f8f4ea" />
      {[[80, 86], [92, 98], [104, 110]].map(([a, b]) => <F key={a} p={band(a, b)} c="#2f6fb0" />)}
      <F p="42,72 58,72 50,86" c="#e0584f" />
      {/* cap */}
      <F p="38,40 62,40 59,22 41,22" c="#fbfaf5" />
      <F p="32,39 68,39 66,45 34,45" c="#fbfaf5" />
      <F p="40,35 60,35 60,39 40,39" c="#2f6fb0" />
    </g>
  );
}

function Lighthouse() {
  const left = (y: number) => 38 - (4 * (y - 40)) / 56;
  const right = (y: number) => 62 + (4 * (y - 40)) / 56;
  const band = (y0: number, y1: number, x0: (y: number) => number, x1: (y: number) => number) =>
    `${x0(y0)},${y0} ${x1(y0)},${y0} ${x1(y1)},${y1} ${x0(y1)},${y1}`;
  const mid = () => 50;
  return (
    <g>
      {/* light beams */}
      <polygon points="60,28 98,16 98,42 60,36" fill="#fff3a0" opacity="0.75" />
      <polygon points="40,28 2,16 2,42 40,36" fill="#fff3a0" opacity="0.75" />
      {/* tower, folded down the middle */}
      <F p="38,40 62,40 66,96 34,96" c="#fbfaf5" />
      <F p="50,40 62,40 66,96 50,96" c="#e3dfd3" />
      <F p={band(52, 62, left, mid)} c="#e0584f" />
      <F p={band(52, 62, mid, right)} c="#bf4136" />
      <F p={band(74, 84, left, mid)} c="#e0584f" />
      <F p={band(74, 84, mid, right)} c="#bf4136" />
      {/* lantern, gallery, roof */}
      <F p="40,26 60,26 60,38 40,38" c="#fff2a8" />
      <F p="33,37 67,37 67,42 33,42" c={INK} />
      <F p="35,27 65,27 50,10" c="#e0584f" />
      <F p="50,10 65,27 50,27" c="#bf4136" />
      {/* rocks */}
      <F p="8,100 26,88 50,94 72,86 92,100 86,112 14,112" c="#7a8d9a" />
      <F p="50,94 72,86 92,100 86,112 50,112" c="#5b6d7a" />
    </g>
  );
}

function Shoal() {
  const fish: Array<[number, number, string, string, string]> = [
    [4, 8, '#f6b14d', '#d9822a', '#fbd18a'],
    [50, 20, '#55b9d6', '#2c82a0', '#7fcde2'],
    [10, 40, '#ec6a5c', '#c4453a', '#f39b8f'],
    [54, 54, '#7cc59a', '#3f9467', '#a6dbb9'],
    [16, 74, '#b984c9', '#8a55a0', '#d2aedd'],
  ];
  return (
    <g>
      {fish.map(([x, y, l, d, h]) => (
        <g key={`${x},${y}`} transform={`translate(${x},${y}) scale(0.4)`}>
          <FishShape light={l} dark={d} head={h} />
        </g>
      ))}
    </g>
  );
}

function PenguinColony() {
  const at = (cx: number, feet: number, s: number) => `translate(${cx - 50 * s},${feet - 108 * s}) scale(${s})`;
  return (
    <g>
      <F p="4,98 96,98 90,112 10,112" c="#d6ecf4" />
      <F p="50,98 96,98 90,112 50,112" c="#b7d8e6" />
      <g transform={at(50, 96, 0.6)}><PenguinShape /></g>
      <g transform={at(24, 102, 0.52)}><PenguinShape /></g>
      <g transform={at(76, 102, 0.52)}><PenguinShape /></g>
    </g>
  );
}

function Captain() {
  const navy = '#1d3d68';
  const navyD = '#132b4c';
  const gold = '#f4d268';
  return (
    <g>
      {/* coat */}
      <F p="20,72 80,72 86,108 14,108" c={navy} />
      <F p="50,72 80,72 86,108 50,108" c={navyD} />
      <F p="42,72 58,72 50,90" c="#f8f4ea" />
      <F p="16,72 32,72 30,78 14,79" c={gold} />
      <F p="84,72 68,72 70,78 86,79" c={gold} />
      <circle cx={44} cy={98} r={2.4} fill={gold} stroke={INK} strokeWidth={0.8} />
      <circle cx={56} cy={98} r={2.4} fill={gold} stroke={INK} strokeWidth={0.8} />
      {/* head and beard */}
      <F p="36,48 42,36 58,36 64,48 58,66 42,66" c="#f3c9a2" />
      <F p="36,55 64,55 62,64 50,74 38,64" c="#e3e3e3" />
      <F p="50,55 64,55 62,64 50,74" c="#c7c7c7" />
      <Dot x={45} y={50} r={1.9} />
      <Dot x={55} y={50} r={1.9} />
      {/* pipe */}
      <F p="58,60 72,62 72,66 58,64" c="#6b4423" />
      <F p="69,54 77,54 76,66 70,66" c="#6b4423" />
      {/* peaked cap */}
      <F p="33,34 67,34 63,20 37,20" c={navy} />
      <F p="33,33 67,33 67,40 33,40" c={navyD} />
      <F p="36,40 64,40 58,45 42,45" c={INK} />
      <F p="50,23 55,27 50,31 45,27" c={gold} />
    </g>
  );
}

// ---------------------------------------------------------------- Extra Salt

function Jellyfish() {
  const light = '#eab0e6';
  const dark = '#c983c6';
  const centre = '50,60';
  const dome = ['16,60', '22,38', '36,22', '50,17', '64,22', '78,38', '84,60'];
  const tentacle = (x: number) =>
    `${x},62 ${x - 5},76 ${x + 1},88 ${x - 4},102 ${x},112 ${x + 4},102 ${x + 7},88 ${x + 2},76 ${x + 5},62`;
  return (
    <g>
      {[26, 38, 50, 62].map((x, i) => <F key={x} p={tentacle(x)} c={i % 2 ? dark : light} />)}
      {dome.slice(0, -1).map((pt, i) => (
        <F key={pt} p={`${centre} ${pt} ${dome[i + 1]}`} c={i % 2 ? dark : light} />
      ))}
      <F p="16,60 25,68 33,60 42,68 50,60 58,68 67,60 75,68 84,60" c="#b06cad" />
    </g>
  );
}

function Lobster() {
  const light = '#d64a3a';
  const dark = '#a33223';
  const leg = '38,56 20,60 38,61';
  const leg2 = '39,63 22,70 40,66';
  const arm = '40,44 30,40 26,46 36,52';
  const fingerA = '18,44 12,14 26,30';
  const fingerB = '22,42 32,16 34,40';
  const palm = '18,44 26,30 34,40 28,50';
  return (
    <g>
      {/* antennae */}
      <polyline points="46,34 34,20 22,4" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
      <polyline points="54,34 66,20 78,4" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
      {[leg, leg2].map((p) => <F key={p} p={p} c={dark} />)}
      {[leg, leg2].map((p) => <F key={`m${p}`} p={mirror(p)} c={dark} />)}
      <F p={arm} c={dark} />
      <F p={mirror(arm)} c={dark} />
      <F p={palm} c={dark} />
      <F p={fingerA} c={light} />
      <F p={fingerB} c={light} />
      <F p={mirror(palm)} c={dark} />
      <F p={mirror(fingerA)} c={light} />
      <F p={mirror(fingerB)} c={light} />
      {/* tail fan */}
      <F p="44,94 50,102 34,108" c={dark} />
      <F p="44,94 56,94 50,102" c={light} />
      <F p="56,94 66,108 50,102" c={dark} />
      {/* tail segments */}
      <F p="42,66 58,66 60,76 40,76" c={dark} />
      <F p="40,76 60,76 58,86 42,86" c={light} />
      <F p="42,86 58,86 56,94 44,94" c={dark} />
      {/* carapace */}
      <F p="42,38 58,38 64,56 56,66 44,66 36,56" c={light} />
      <F p="50,38 58,38 64,56 56,66 50,66" c={dark} />
      <F p="44,38 56,38 50,30" c={light} />
      <Dot x={45} y={40} r={2} />
      <Dot x={55} y={40} r={2} />
    </g>
  );
}

function Starfish() {
  // Each arm is folded along its middle: one light half, one dark half.
  const cx = 50;
  const cy = 64;
  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  };
  const c = `${cx},${cy}`;
  return (
    <g>
      {[-90, -18, 54, 126, 198].map((deg) => (
        <g key={deg}>
          <F p={`${c} ${pt(deg - 36, 18)} ${pt(deg, 44)}`} c="#f7b062" />
          <F p={`${c} ${pt(deg, 44)} ${pt(deg + 36, 18)}`} c="#dc7a33" />
        </g>
      ))}
    </g>
  );
}

function Seahorse() {
  // Facing left: tube snout, crowned head, belly bulging forward, fin on the
  // back, tail curled forward under the belly.
  const light = '#f7bb58';
  const mid = '#eaa142';
  const dark = '#cc7d2a';
  return (
    <g>
      {/* dorsal fin */}
      <F p="74,52 92,46 90,70 74,68" c="#fcd889" />
      <Crease p="76,60 91,56" c="#d9a04a" w={1} />
      <Crease p="76,64 90,64" c="#d9a04a" w={1} />
      {/* tail, coiling forward */}
      <F p="64,86 68,100 60,110 46,111 37,102 40,92 48,89 53,94 50,100 45,100 47,104 55,103 59,97 54,86" c={dark} />
      {/* back, then belly */}
      <F p="64,38 68,32 76,44 78,62 72,78 64,88 58,86 60,72 62,56" c={dark} />
      <F p="58,38 64,38 62,56 60,72 58,86 54,86 46,74 44,60 50,48" c={light} />
      <Crease p="47,54 61,54" />
      <Crease p="45,63 61,63" />
      <Crease p="46,72 60,72" />
      <Crease p="51,80 59,80" />
      {/* head and snout */}
      <F p="48,26 60,28 70,22 66,34 58,38 50,34" c={mid} />
      <F p="48,26 28,27 27,34 50,34" c={mid} />
      <F p="50,18 62,13 70,22 60,28 48,26" c={light} />
      {/* crown */}
      <F p="54,16 57,6 62,14" c={dark} />
      <F p="62,14 68,9 67,19" c={dark} />
      <Eye x={59} y={23} r={3.6} />
    </g>
  );
}

function CrabBasket() {
  const wood = '#b97a46';
  const woodD = '#8c5a2d';
  return (
    <g>
      {/* two crabs in the basket, claws up over the rim */}
      <g transform="translate(-2,38) scale(0.5)"><CrabShape /></g>
      <g transform="translate(48,32) scale(0.5)"><CrabShape /></g>
      {/* basket */}
      <F p="20,72 80,72 72,108 28,108" c={wood} />
      <F p="50,72 80,72 72,108 50,108" c={woodD} />
      <Crease p="25,84 77,84" c="rgba(0,0,0,0.3)" w={1.2} />
      <Crease p="27,96 74,96" c="rgba(0,0,0,0.3)" w={1.2} />
      <Crease p="36,72 38,108" c="rgba(255,255,255,0.35)" w={1.2} />
      <Crease p="64,72 62,108" c="rgba(255,255,255,0.35)" w={1.2} />
      <F p="14,66 86,66 82,74 18,74" c={woodD} />
    </g>
  );
}
