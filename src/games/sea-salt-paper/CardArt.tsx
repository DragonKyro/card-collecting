// Hand-drawn SVG illustrations for each card family.
// Origami-paper aesthetic: layered solid polygons with subtle highlight strokes,
// no gradients on the base shapes (matches the original game's look).
//
// Each illustration is a viewBox 0 0 100 120 group that gets dropped onto the
// card body in Card.tsx.

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
    default:
      void bodyColor; // unused fallback
      return null;
  }
}

const STROKE = '#1c1a2e';
const HIGHLIGHT = 'rgba(255,255,255,0.4)';
const SHADOW = 'rgba(0,0,0,0.25)';

function Mermaid() {
  return (
    <g>
      {/* tail */}
      <polygon points="50,95 30,110 70,110" fill="#3b6c7a" stroke={STROKE} strokeWidth="1" />
      <polygon points="50,72 35,98 65,98" fill="#56a3b5" stroke={STROKE} strokeWidth="1" />
      {/* body */}
      <polygon points="50,48 38,78 62,78" fill="#f4c8a2" stroke={STROKE} strokeWidth="1" />
      {/* hair */}
      <polygon points="38,40 28,58 38,55 35,72 50,50" fill="#8b3a1f" stroke={STROKE} strokeWidth="1" />
      <polygon points="62,40 72,58 62,55 65,72 50,50" fill="#8b3a1f" stroke={STROKE} strokeWidth="1" />
      {/* face */}
      <polygon points="50,30 40,46 60,46" fill="#fcdcb8" stroke={STROKE} strokeWidth="1" />
      <circle cx="45" cy="40" r="1.2" fill={STROKE} />
      <circle cx="55" cy="40" r="1.2" fill={STROKE} />
      {/* tail fin highlights */}
      <polyline points="50,95 50,108" stroke={HIGHLIGHT} strokeWidth="1" fill="none" />
    </g>
  );
}

function Crab() {
  return (
    <g>
      {/* body */}
      <polygon points="50,55 30,72 50,88 70,72" fill="#e0584f" stroke={STROKE} strokeWidth="1" />
      <polygon points="50,55 40,68 50,76 60,68" fill="#c4423a" stroke={STROKE} strokeWidth="1" />
      {/* claws */}
      <polygon points="22,60 12,72 22,80 30,72" fill="#e0584f" stroke={STROKE} strokeWidth="1" />
      <polygon points="78,60 88,72 78,80 70,72" fill="#e0584f" stroke={STROKE} strokeWidth="1" />
      <polygon points="14,72 22,68 22,76" fill="#fff" stroke={STROKE} strokeWidth="0.8" />
      <polygon points="86,72 78,68 78,76" fill="#fff" stroke={STROKE} strokeWidth="0.8" />
      {/* legs */}
      <line x1="32" y1="80" x2="22" y2="92" stroke={STROKE} strokeWidth="1.4" />
      <line x1="38" y1="82" x2="32" y2="96" stroke={STROKE} strokeWidth="1.4" />
      <line x1="62" y1="82" x2="68" y2="96" stroke={STROKE} strokeWidth="1.4" />
      <line x1="68" y1="80" x2="78" y2="92" stroke={STROKE} strokeWidth="1.4" />
      {/* eyes */}
      <circle cx="44" cy="62" r="2" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="56" cy="62" r="2" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="44" cy="62" r="0.9" fill={STROKE} />
      <circle cx="56" cy="62" r="0.9" fill={STROKE} />
    </g>
  );
}

function Boat() {
  return (
    <g>
      {/* sea */}
      <polygon points="10,92 90,92 90,108 10,108" fill="#86b5d4" stroke={STROKE} strokeWidth="0.6" />
      <polyline points="10,95 90,95" stroke={HIGHLIGHT} strokeWidth="0.8" fill="none" />
      {/* hull */}
      <polygon points="20,82 80,82 70,95 30,95" fill="#c95a2f" stroke={STROKE} strokeWidth="1" />
      <polygon points="20,82 80,82 78,86 22,86" fill="#e07750" stroke={STROKE} strokeWidth="0.6" />
      {/* mast */}
      <line x1="50" y1="80" x2="50" y2="30" stroke={STROKE} strokeWidth="1.4" />
      {/* sail */}
      <polygon points="50,32 50,76 80,76" fill="#f8eecf" stroke={STROKE} strokeWidth="1" />
      <polygon points="50,32 50,76 20,76" fill="#f4d28a" stroke={STROKE} strokeWidth="1" />
      <polyline points="50,32 50,76" stroke={STROKE} strokeWidth="0.6" />
      {/* flag */}
      <polygon points="50,30 60,33 50,36" fill="#e0584f" stroke={STROKE} strokeWidth="0.6" />
    </g>
  );
}

function Fish() {
  return (
    <g>
      {/* body */}
      <polygon points="20,65 60,45 80,65 60,85" fill="#3aa3c4" stroke={STROKE} strokeWidth="1" />
      {/* tail */}
      <polygon points="20,65 6,52 12,65 6,78" fill="#2e7e98" stroke={STROKE} strokeWidth="1" />
      {/* dorsal */}
      <polygon points="50,52 64,52 56,42" fill="#2e7e98" stroke={STROKE} strokeWidth="1" />
      {/* belly highlight */}
      <polygon points="38,68 70,68 58,80 42,80" fill={HIGHLIGHT} stroke="none" />
      {/* eye */}
      <circle cx="68" cy="60" r="2.6" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="68" cy="60" r="1.1" fill={STROKE} />
      {/* gill */}
      <polyline points="58,55 56,75" stroke={STROKE} strokeWidth="0.7" fill="none" />
    </g>
  );
}

function Shark() {
  return (
    <g>
      {/* body */}
      <polygon points="14,72 60,58 86,72 60,84" fill="#4f6271" stroke={STROKE} strokeWidth="1" />
      {/* belly */}
      <polygon points="22,76 78,76 60,84" fill="#cfd6dd" stroke={STROKE} strokeWidth="0.6" />
      {/* dorsal */}
      <polygon points="50,60 64,60 54,46" fill="#4f6271" stroke={STROKE} strokeWidth="1" />
      {/* tail */}
      <polygon points="14,72 4,55 10,72 4,90" fill="#3b4a57" stroke={STROKE} strokeWidth="1" />
      {/* teeth */}
      <polyline points="76,70 78,74 80,70 82,74 84,70" stroke="#fff" strokeWidth="0.8" fill="none" />
      {/* eye */}
      <circle cx="72" cy="66" r="1.6" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="72" cy="66" r="0.7" fill={STROKE} />
      {/* gill */}
      <polyline points="62,65 60,80" stroke={STROKE} strokeWidth="0.6" fill="none" />
    </g>
  );
}

function Swimmer() {
  return (
    <g>
      {/* water */}
      <polygon points="10,82 90,82 90,108 10,108" fill="#86b5d4" stroke={STROKE} strokeWidth="0.6" />
      <polyline points="10,85 90,85" stroke={HIGHLIGHT} strokeWidth="0.8" fill="none" />
      <polyline points="10,90 90,90" stroke={HIGHLIGHT} strokeWidth="0.5" fill="none" />
      {/* arm reaching */}
      <polygon points="18,52 36,46 42,58 22,62" fill="#f4c8a2" stroke={STROKE} strokeWidth="0.8" />
      {/* head */}
      <circle cx="60" cy="62" r="11" fill="#f4c8a2" stroke={STROKE} strokeWidth="1" />
      {/* cap */}
      <polygon points="49,58 71,58 67,48 53,48" fill="#e0584f" stroke={STROKE} strokeWidth="1" />
      {/* goggles */}
      <polygon points="54,62 60,60 60,66" fill={STROKE} />
      <polygon points="64,60 70,62 64,66" fill={STROKE} />
      {/* trailing body in water */}
      <polygon points="62,72 88,80 82,86 56,80" fill="#f4c8a2" stroke={STROKE} strokeWidth="0.8" />
    </g>
  );
}

function Shell() {
  return (
    <g>
      {/* shell body */}
      <polygon points="50,30 16,86 84,86" fill="#f7c489" stroke={STROKE} strokeWidth="1" />
      {/* ribs */}
      <polyline points="50,30 30,86" stroke="#b87e44" strokeWidth="0.9" fill="none" />
      <polyline points="50,30 40,86" stroke="#b87e44" strokeWidth="0.9" fill="none" />
      <polyline points="50,30 50,86" stroke="#b87e44" strokeWidth="0.9" fill="none" />
      <polyline points="50,30 60,86" stroke="#b87e44" strokeWidth="0.9" fill="none" />
      <polyline points="50,30 70,86" stroke="#b87e44" strokeWidth="0.9" fill="none" />
      {/* base */}
      <polygon points="14,86 86,86 80,92 20,92" fill="#c8884c" stroke={STROKE} strokeWidth="0.8" />
      {/* highlight */}
      <polygon points="50,30 35,82 30,82" fill={HIGHLIGHT} stroke="none" />
    </g>
  );
}

function Octopus() {
  return (
    <g>
      {/* head */}
      <polygon points="50,28 28,52 38,72 62,72 72,52" fill="#a23c92" stroke={STROKE} strokeWidth="1" />
      <polygon points="50,28 40,46 60,46" fill="#bf52ae" stroke={STROKE} strokeWidth="0.6" />
      {/* eyes */}
      <circle cx="44" cy="56" r="2.4" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="56" cy="56" r="2.4" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="44" cy="56" r="1" fill={STROKE} />
      <circle cx="56" cy="56" r="1" fill={STROKE} />
      {/* tentacles */}
      <polygon points="32,72 26,96 32,90 30,104 38,90 40,72" fill="#a23c92" stroke={STROKE} strokeWidth="1" />
      <polygon points="44,72 42,98 48,90 46,104 52,90 52,72" fill="#a23c92" stroke={STROKE} strokeWidth="1" />
      <polygon points="56,72 54,98 60,90 58,104 64,90 60,72" fill="#a23c92" stroke={STROKE} strokeWidth="1" />
      <polygon points="68,72 64,90 72,104 70,90 76,98 72,72" fill="#a23c92" stroke={STROKE} strokeWidth="1" />
    </g>
  );
}

function Penguin() {
  return (
    <g>
      {/* belly */}
      <polygon points="32,46 68,46 72,98 28,98" fill="#f8f4ea" stroke={STROKE} strokeWidth="1" />
      {/* back/wings */}
      <polygon points="32,46 22,52 18,98 28,98" fill="#1c1a2e" stroke={STROKE} strokeWidth="1" />
      <polygon points="68,46 78,52 82,98 72,98" fill="#1c1a2e" stroke={STROKE} strokeWidth="1" />
      {/* head */}
      <polygon points="30,30 70,30 74,52 26,52" fill="#1c1a2e" stroke={STROKE} strokeWidth="1" />
      <polygon points="38,40 62,40 66,52 34,52" fill="#f8f4ea" stroke={STROKE} strokeWidth="0.6" />
      {/* eyes */}
      <circle cx="44" cy="42" r="1.2" fill={STROKE} />
      <circle cx="56" cy="42" r="1.2" fill={STROKE} />
      {/* beak */}
      <polygon points="48,46 52,46 50,52" fill="#f4a23c" stroke={STROKE} strokeWidth="0.5" />
      {/* feet */}
      <polygon points="34,98 44,98 40,108" fill="#f4a23c" stroke={STROKE} strokeWidth="0.5" />
      <polygon points="56,98 66,98 60,108" fill="#f4a23c" stroke={STROKE} strokeWidth="0.5" />
    </g>
  );
}

function Sailor() {
  return (
    <g>
      {/* shirt */}
      <polygon points="28,68 72,68 78,108 22,108" fill="#1c5f9e" stroke={STROKE} strokeWidth="1" />
      <polyline points="35,72 32,108" stroke="#fff" strokeWidth="1.5" />
      <polyline points="45,72 44,108" stroke="#fff" strokeWidth="1.5" />
      <polyline points="55,72 56,108" stroke="#fff" strokeWidth="1.5" />
      <polyline points="65,72 68,108" stroke="#fff" strokeWidth="1.5" />
      {/* collar */}
      <polygon points="36,68 50,80 64,68" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      {/* face */}
      <circle cx="50" cy="44" r="14" fill="#f4c8a2" stroke={STROKE} strokeWidth="1" />
      {/* hat */}
      <polygon points="32,40 68,40 64,28 36,28" fill="#fff" stroke={STROKE} strokeWidth="1" />
      <polygon points="30,40 70,40 70,44 30,44" fill="#fff" stroke={STROKE} strokeWidth="0.6" />
      <polygon points="46,28 54,28 50,22" fill={SHADOW} stroke={STROKE} strokeWidth="0.4" />
      {/* eyes & smile */}
      <circle cx="45" cy="46" r="1" fill={STROKE} />
      <circle cx="55" cy="46" r="1" fill={STROKE} />
      <polyline points="46,52 50,55 54,52" stroke={STROKE} strokeWidth="0.8" fill="none" />
    </g>
  );
}

function Lighthouse() {
  return (
    <g>
      {/* rock */}
      <polygon points="14,98 86,98 76,108 24,108" fill="#5a6e7c" stroke={STROKE} strokeWidth="1" />
      {/* tower */}
      <polygon points="36,42 64,42 60,98 40,98" fill="#fff" stroke={STROKE} strokeWidth="1" />
      <polygon points="40,42 44,98 40,98" fill={SHADOW} stroke="none" />
      {/* red stripes */}
      <polygon points="36,55 64,55 64,63 36,63" fill="#e0584f" stroke={STROKE} strokeWidth="0.6" />
      <polygon points="38,78 62,78 62,86 38,86" fill="#e0584f" stroke={STROKE} strokeWidth="0.6" />
      {/* lantern */}
      <polygon points="34,32 66,32 64,42 36,42" fill="#f8eecf" stroke={STROKE} strokeWidth="1" />
      <polygon points="32,28 68,28 66,32 34,32" fill="#1c1a2e" stroke={STROKE} strokeWidth="0.6" />
      <polygon points="40,18 60,18 64,28 36,28" fill="#e0584f" stroke={STROKE} strokeWidth="1" />
      {/* beam */}
      <polygon points="64,34 96,22 96,46" fill="#fff5b8" opacity="0.55" />
      <polygon points="36,34 4,22 4,46" fill="#fff5b8" opacity="0.55" />
    </g>
  );
}

function Shoal() {
  return (
    <g>
      {/* three little fish swimming */}
      <Mini x={20} y={36} dir={1} color="#f4a23c" />
      <Mini x={56} y={48} dir={1} color="#3aa3c4" />
      <Mini x={28} y={66} dir={1} color="#e0584f" />
      <Mini x={62} y={82} dir={1} color="#56a3b5" />
      <Mini x={20} y={96} dir={1} color="#a23c92" />
    </g>
  );
}

function Mini({ x, y, dir, color }: { x: number; y: number; dir: 1 | -1; color: string }) {
  // a tiny 28x14 fish at (x,y)
  const sign = dir;
  return (
    <g transform={`translate(${x},${y}) scale(${sign},1)`}>
      <polygon points="0,6 18,0 26,6 18,12" fill={color} stroke={STROKE} strokeWidth="0.7" />
      <polygon points="0,6 -6,0 -2,6 -6,12" fill={color} stroke={STROKE} strokeWidth="0.7" />
      <circle cx="20" cy="5" r="1.1" fill="#fff" stroke={STROKE} strokeWidth="0.3" />
      <circle cx="20" cy="5" r="0.5" fill={STROKE} />
    </g>
  );
}

function PenguinColony() {
  return (
    <g>
      {/* ice */}
      <polygon points="10,92 90,92 88,108 12,108" fill="#cfe7f0" stroke={STROKE} strokeWidth="0.6" />
      {/* three penguins clustered */}
      <SmallPenguin x={22} y={42} scale={0.55} />
      <SmallPenguin x={50} y={36} scale={0.62} />
      <SmallPenguin x={74} y={46} scale={0.55} />
    </g>
  );
}

function SmallPenguin({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x - 25 * scale}, ${y}) scale(${scale})`}>
      <polygon points="10,16 40,16 44,60 6,60" fill="#f8f4ea" stroke={STROKE} strokeWidth="1" />
      <polygon points="10,16 0,22 -4,60 6,60" fill="#1c1a2e" stroke={STROKE} strokeWidth="1" />
      <polygon points="40,16 50,22 54,60 44,60" fill="#1c1a2e" stroke={STROKE} strokeWidth="1" />
      <polygon points="8,0 42,0 46,22 4,22" fill="#1c1a2e" stroke={STROKE} strokeWidth="1" />
      <polygon points="16,10 34,10 38,22 12,22" fill="#f8f4ea" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="22" cy="13" r="1.1" fill={STROKE} />
      <circle cx="28" cy="13" r="1.1" fill={STROKE} />
      <polygon points="24,16 26,16 25,21" fill="#f4a23c" stroke={STROKE} strokeWidth="0.4" />
    </g>
  );
}

function Captain() {
  return (
    <g>
      {/* coat */}
      <polygon points="22,70 78,70 84,108 16,108" fill="#16345c" stroke={STROKE} strokeWidth="1" />
      <polyline points="50,70 50,108" stroke="#f4d268" strokeWidth="1" />
      <circle cx="42" cy="80" r="1.4" fill="#f4d268" />
      <circle cx="42" cy="90" r="1.4" fill="#f4d268" />
      <circle cx="58" cy="80" r="1.4" fill="#f4d268" />
      <circle cx="58" cy="90" r="1.4" fill="#f4d268" />
      {/* face */}
      <circle cx="50" cy="44" r="14" fill="#f4c8a2" stroke={STROKE} strokeWidth="1" />
      {/* beard */}
      <polygon points="38,46 62,46 60,62 50,68 40,62" fill="#dcdcdc" stroke={STROKE} strokeWidth="0.6" />
      {/* hat */}
      <polygon points="30,40 70,40 70,32 30,32" fill="#16345c" stroke={STROKE} strokeWidth="1" />
      <polygon points="36,32 64,32 60,18 40,18" fill="#16345c" stroke={STROKE} strokeWidth="1" />
      <polygon points="42,26 58,26 56,22 44,22" fill="#f4d268" stroke={STROKE} strokeWidth="0.5" />
      {/* eyes */}
      <circle cx="45" cy="46" r="1" fill={STROKE} />
      <circle cx="55" cy="46" r="1" fill={STROKE} />
      {/* pipe */}
      <polygon points="58,56 70,58 70,62 58,60" fill="#5a3a1f" stroke={STROKE} strokeWidth="0.6" />
      <circle cx="73" cy="60" r="2" fill="#1c1a2e" />
    </g>
  );
}
