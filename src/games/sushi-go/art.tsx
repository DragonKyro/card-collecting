// Sushi Go! Party card art — one hand-drawn inline SVG per food, in a 100×100
// box. Flat fills only (no <defs>), so any number of cards can share a page
// without id clashes. Variants show in the art: nigiri toppings, the number of
// maki / uramaki rolls, onigiri shapes, the two fruits on a fruit card.

import type { ReactNode } from 'react';
import type { SushiGoCard } from './types';

const INK = '#3a2a14';
const RICE = '#fbf8ef';
const GRAIN = '#ddd3bf';
const NORI = '#1f2a1d';
const SALMON = '#f7894f';
const SALMON_FAT = '#fde1c8';
const TUNA = '#d93f4c';
const TAMAGO = '#ffe066';

/** Outline style shared by every shape. */
const LINE = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
/** A detail stroke with no fill. */
const detail = (color: string, width = 1.5) =>
  ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

export function CardArt({ card }: { card: SushiGoCard }) {
  switch (card.kind) {
    case 'nigiri':
      if (card.variant === 'salmon') return <SalmonNigiri />;
      if (card.variant === 'squid') return <SquidNigiri />;
      return <EggNigiri />;
    case 'maki':
    case 'uramaki': {
      const n = Number(card.variant ?? (card.kind === 'maki' ? 1 : 3));
      const { r, at } = rollLayout(n);
      const Slice = card.kind === 'maki' ? MakiSlice : UramakiSlice;
      return <>{at.map(([x, y], i) => <Slice key={i} x={x} y={y} r={r} />)}</>;
    }
    case 'temaki': return <Temaki />;
    case 'dumpling': return <Gyoza />;
    case 'tempura': return <ShrimpTempura />;
    case 'sashimi': return <Sashimi />;
    case 'mizuOnigiri': return <Onigiri shape={card.variant ?? 'circle'} />;
    case 'tofu': return <Tofu />;
    case 'edamame': return <Edamame />;
    case 'eel': return <EelNigiri />;
    case 'misoSoup': return <MisoSoup />;
    case 'soySauce': return <SoySauce />;
    case 'wasabi': return <Wasabi />;
    case 'tea': return <Tea />;
    case 'specialOrder': return <OrderTicket />;
    case 'takeoutBox': return <TakeoutTray />;
    case 'chopsticks': return <Chopsticks />;
    case 'spoon': return <Spoon />;
    case 'menu': return <MenuBoard />;
    case 'pudding': return <Pudding />;
    case 'greenTeaIceCream': return <MatchaIceCream />;
    case 'fruit': return <FruitPair fruits={(card.variant ?? 'WW').split('')} />;
  }
}

// ---------------------------------------------------------------------------
// Nigiri: an oblong rice mound with the topping draped over it.

/** Topping outline draped over the rice. */
const DRAPE = 'M14 62 Q14 44 50 42 Q86 42 86 60 Q86 68 76 66 Q50 62 24 68 Q14 70 14 62 Z';

function NigiriRice({ children }: { children: ReactNode }) {
  return (
    <g>
      <ellipse cx={50} cy={84} rx={30} ry={4} fill="#000" opacity={0.15} />
      <path d="M20 70 Q20 58 50 57 Q80 58 80 70 Q80 82 50 82 Q20 82 20 70 Z" fill={RICE} {...LINE} />
      {[[30, 74], [42, 78], [57, 77], [69, 73], [36, 69], [62, 70]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={2.6} ry={1.4} {...detail(GRAIN, 1)} />
      ))}
      {children}
    </g>
  );
}

function SalmonNigiri() {
  return (
    <NigiriRice>
      <path d={DRAPE} fill={SALMON} {...LINE} />
      {[30, 43, 56, 69].map((x) => <path key={x} d={`M${x} 46 q5 9 1 18`} {...detail(SALMON_FAT, 3)} />)}
    </NigiriRice>
  );
}

function SquidNigiri() {
  return (
    <NigiriRice>
      <path d={DRAPE} fill="#f6f2ea" {...LINE} />
      {/* Scored criss-cross. */}
      {[28, 38, 48, 58, 68].map((x) => (
        <g key={x}>
          <path d={`M${x + 4} 47 l-5 13`} {...detail('#d2c6b2', 1.3)} />
          <path d={`M${x - 1} 47 l5 13`} {...detail('#d2c6b2', 1.3)} />
        </g>
      ))}
      <path d="M20 52 Q50 44 80 50" {...detail('#ffffff', 2.5)} opacity={0.9} />
    </NigiriRice>
  );
}

function EggNigiri() {
  return (
    <NigiriRice>
      <rect x={17} y={38} width={66} height={22} rx={4} fill={TAMAGO} {...LINE} />
      <path d="M18.5 45 H81.5 M18.5 52 H81.5" {...detail('#e8b730', 1.4)} />
      <path d="M21 39.5 H79" {...detail('#d9962a', 2.5)} opacity={0.7} />
      <rect x={44} y={36} width={12} height={46} rx={1.5} fill={NORI} {...LINE} />
    </NigiriRice>
  );
}

function EelNigiri() {
  return (
    <NigiriRice>
      <path d={DRAPE} fill="#8c4a1f" {...LINE} />
      {/* Grill marks, glaze shine, sesame. */}
      {[26, 37, 61, 72].map((x) => <path key={x} d={`M${x + 3} 47 l-5 12`} {...detail('#4f2810', 3)} opacity={0.8} />)}
      <path d="M22 50 Q50 44 80 49" {...detail('#ffffff', 2.5)} opacity={0.35} />
      {[[30, 54, 20], [40, 50, -30], [62, 52, 40], [70, 56, -10], [34, 60, 70]].map(([x, y, a], i) => (
        <ellipse key={i} cx={x} cy={y} rx={1.8} ry={1} fill="#fff7e0" transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <rect x={45} y={40} width={10} height={42} rx={1.5} fill={NORI} {...LINE} />
    </NigiriRice>
  );
}

// ---------------------------------------------------------------------------
// Rolls

/** Where to draw n rolls (1–5) in the 100×100 art box, and how big. */
function rollLayout(n: number): { r: number; at: [number, number][] } {
  switch (n) {
    case 1: return { r: 24, at: [[50, 50]] };
    case 2: return { r: 19, at: [[29, 50], [71, 50]] };
    case 3: return { r: 17, at: [[50, 28], [29, 66], [71, 66]] };
    case 4: return { r: 16, at: [[31, 31], [69, 31], [31, 69], [69, 69]] };
    default: return { r: 14, at: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]] };
  }
}

/** A maki slice from above: nori outside, rice, fish in the middle. */
function MakiSlice({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={NORI} {...LINE} />
      <circle cx={x} cy={y} r={r * 0.76} fill={RICE} />
      <circle cx={x} cy={y} r={r * 0.32} fill={TUNA} />
    </g>
  );
}

/** An inside-out slice: roe-dotted rice outside, a nori ring, avocado + crab inside. */
function UramakiSlice({ x, y, r }: { x: number; y: number; r: number }) {
  const roe = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * Math.PI * 2;
    return <circle key={i} cx={x + Math.cos(a) * r * 0.82} cy={y + Math.sin(a) * r * 0.82} r={r * 0.11} fill="#ef8a2f" />;
  });
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={RICE} {...LINE} />
      {roe}
      <circle cx={x} cy={y} r={r * 0.58} fill={NORI} />
      <circle cx={x} cy={y} r={r * 0.46} fill={RICE} />
      <circle cx={x - r * 0.14} cy={y} r={r * 0.2} fill="#8cc152" />
      <circle cx={x + r * 0.16} cy={y + r * 0.05} r={r * 0.16} fill="#f07a6a" />
    </g>
  );
}

/** Hand roll: a nori cone with rice and fillings spilling out of the top. */
function Temaki() {
  return (
    <g transform="translate(5 9) scale(0.9)">
      <path d="M22 38 L80 28 L58 92 Z" fill={NORI} {...LINE} />
      <path d="M36 42 L57 86 M52 37 L58 88 M68 33 L59 86" {...detail('#34452f', 1)} />
      {/* Fillings */}
      <path d="M36 32 L50 8 L60 28 Z" fill={SALMON} {...LINE} />
      <path d="M42 26 L50 12 M48 28 L54 16" {...detail(SALMON_FAT, 1.8)} />
      <g transform="rotate(20 68 20)">
        <rect x={63} y={6} width={9} height={26} rx={3} fill="#4f9a40" {...LINE} />
        <rect x={65.5} y={9} width={4} height={18} rx={2} fill="#c6e8a0" />
      </g>
      {/* Rice at the opening */}
      <path d="M18 38 Q18 28 32 30 Q44 22 56 28 Q70 20 80 28 Q86 32 82 30 Q50 42 18 40 Z" fill={RICE} {...LINE} />
      {[[30, 33], [26, 31], [34, 30]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill="#f29132" />)}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Appetizers

function Gyoza() {
  const pleats: [number, number][] = [[24, 44], [34, 38], [44, 35], [56, 35], [66, 38], [76, 44]];
  return (
    <g>
      <ellipse cx={50} cy={74} rx={38} ry={6} fill="#000" opacity={0.15} />
      <path d="M12 66 Q14 34 50 32 Q86 34 88 66 Q50 76 12 66 Z" fill="#f4e2b8" {...LINE} />
      {/* Pan-browned bottom */}
      <path d="M13.5 61 Q50 72 86.5 61 Q87.5 64 88 66 Q50 76 12 66 Q12.5 63 13.5 61 Z" fill="#c98a3a" />
      <path d="M12 66 Q50 76 88 66" {...detail(INK)} />
      {pleats.map(([x, y]) => <path key={x} d={`M${x} ${y} q4 5 2 11`} {...detail('#c9a86a', 1.8)} />)}
    </g>
  );
}

function ShrimpTempura() {
  const bits: [number, number, number][] = [
    [21, 70, 3], [27, 65, 2.5], [17, 58, 2.5], [27, 56, 3], [22, 47, 2.5], [33, 46, 2.5],
    [30, 38, 3], [40, 40, 2.5], [42, 32, 2.5], [50, 37, 3], [55, 29, 2.5], [58, 35, 2.2],
  ];
  return (
    <g>
      <path d="M22 76 Q22 36 66 30" {...detail(INK, 25)} />
      <path d="M22 76 Q22 36 66 30" {...detail('#efb94c', 22)} />
      {bits.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#f8d77e" stroke="#d99a2b" strokeWidth={0.8} />)}
      {/* Tail */}
      <path d="M64 32 L86 14 L84 30 L94 36 L72 40 Z" fill="#e2533f" {...LINE} />
      <path d="M74 34 L85 20 M76 37 L90 35" {...detail('#b33a2a', 1.2)} />
    </g>
  );
}

function Sashimi() {
  return (
    <g>
      {/* Shiso leaf */}
      <path d="M12 76 Q24 30 86 22 Q76 74 12 76 Z" fill="#2f8a3c" {...LINE} />
      <path d="M16 74 Q46 54 82 26" {...detail('#62b85f', 1.4)} />
      {/* Three tuna slices, back to front */}
      {([[32, 54, -28], [50, 50, -16], [68, 46, -4]] as const).map(([x, y, a], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${a})`}>
          <rect x={-12} y={-21} width={24} height={42} rx={7} fill={TUNA} {...LINE} />
          <path d="M-5 -15 q6 15 0 30 M4 -16 q5 15 0 32" {...detail('#f08a92', 1.6)} />
        </g>
      ))}
      {/* A dab of wasabi */}
      <path d="M72 78 Q72 70 80 68 Q88 70 88 78 Z" fill="#9bcf53" {...LINE} />
    </g>
  );
}

/** Onigiri in its shape, with a nori strip across the bottom. */
function Onigiri({ shape }: { shape: string }) {
  const body = (() => {
    switch (shape) {
      case 'triangle':
        // Rounded corners: a fat round-joined stroke, outlined by a fatter one beneath.
        return (
          <>
            <polygon points="50,22 80,76 20,76" fill={INK} stroke={INK} strokeWidth={16} strokeLinejoin="round" />
            <polygon points="50,22 80,76 20,76" fill={RICE} stroke={RICE} strokeWidth={12} strokeLinejoin="round" />
          </>
        );
      case 'square':
        return <rect x={22} y={22} width={56} height={56} rx={8} fill={RICE} {...LINE} strokeWidth={2} />;
      case 'rectangle':
        return <rect x={12} y={30} width={76} height={42} rx={8} fill={RICE} {...LINE} strokeWidth={2} />;
      default:
        return <circle cx={50} cy={50} r={30} fill={RICE} {...LINE} strokeWidth={2} />;
    }
  })();
  const nori = {
    triangle: { y: 62, h: 20 },
    square: { y: 58, h: 20 },
    rectangle: { y: 52, h: 20 },
    circle: { y: 60, h: 18 },
  }[shape] ?? { y: 60, h: 18 };
  return (
    <g>
      {body}
      <rect x={41} y={nori.y} width={18} height={nori.h} rx={2} fill={NORI} />
    </g>
  );
}

/** Hiyayakko: a cube of silken tofu topped with scallions, on a blue plate. */
function Tofu() {
  return (
    <g>
      <ellipse cx={50} cy={74} rx={38} ry={10} fill="#3f6e9e" {...LINE} />
      <ellipse cx={50} cy={73} rx={30} ry={7} fill="#5a89b8" />
      <polygon points="24,39 50,50 50,74 24,63" fill="#efeadf" {...LINE} />
      <polygon points="50,50 76,39 76,63 50,74" fill="#ddd6c6" {...LINE} />
      <polygon points="50,28 76,39 50,50 24,39" fill="#ffffff" {...LINE} />
      <path d="M38 38 Q46 34 56 37 Q62 40 56 43" fill="none" stroke="#7a4a24" strokeWidth={2.5} strokeLinecap="round" opacity={0.6} />
      {[[42, 36], [52, 33], [50, 42], [60, 39], [38, 41]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6} fill="#8fd14f" stroke="#4a8a2a" strokeWidth={1} />
      ))}
    </g>
  );
}

/** An edamame pod: three beans in a row, then a stem. */
/** An edamame pod: a flat bumpy pod with three beans showing through, and a stem. */
function Pod({ x, y, a }: { x: number; y: number; a: number }) {
  const beans = [-15, 0, 15];
  return (
    <g transform={`translate(${x} ${y}) rotate(${a})`}>
      <path
        d="M-30 0 Q-30 -11 -18 -11 Q-8 -14 0 -11 Q8 -14 18 -11 Q30 -11 30 0 Q30 11 18 11 Q8 14 0 11 Q-8 14 -18 11 Q-30 11 -30 0 Z"
        fill="#9fd45a" {...LINE}
      />
      {beans.map((bx) => <ellipse key={bx} cx={bx} cy={0} rx={6.5} ry={7.5} fill="#c9ec8c" stroke="#7fb53e" strokeWidth={1} />)}
      {beans.map((bx) => <ellipse key={`h${bx}`} cx={bx - 2} cy={-3} rx={2} ry={1.5} fill="#ffffff" opacity={0.6} />)}
      <path d="M30 -1 q6 -2 8 -9" {...detail('#4a8a2a', 2.5)} />
    </g>
  );
}

function Edamame() {
  return (
    <g>
      <Pod x={46} y={38} a={-14} />
      <Pod x={52} y={66} a={10} />
    </g>
  );
}

function MisoSoup() {
  return (
    <g>
      <path d="M36 30 q-6 -8 0 -16 M50 28 q-6 -8 0 -16 M64 30 q-6 -8 0 -16" {...detail('#ffffff', 2.5)} opacity={0.85} />
      <path d="M36 82 L38 90 H62 L64 82" fill="#7d1b16" {...LINE} />
      <path d="M12 46 Q14 84 50 84 Q86 84 88 46 Z" fill="#a8261f" {...LINE} />
      <path d="M20 56 Q22 70 32 78" {...detail('#ffffff', 3)} opacity={0.3} />
      <ellipse cx={50} cy={46} rx={38} ry={10} fill="#c58a3c" {...LINE} />
      {[[30, 43], [50, 46], [62, 40]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={7} height={6} rx={1} fill="#fffdf6" stroke={INK} strokeWidth={1} />
      ))}
      <path d="M40 48 q4 -4 8 0 q4 4 8 0" {...detail('#2f5a2a', 2.5)} />
      {[[44, 41], [70, 46], [24, 46]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.2} fill="#8fd14f" stroke="#4a8a2a" strokeWidth={0.8} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Specials

function SoySauce() {
  return (
    <g>
      <ellipse cx={72} cy={84} rx={16} ry={5} fill="#fffaf0" {...LINE} />
      <ellipse cx={72} cy={83} rx={11} ry={3} fill="#3b2216" />
      <g {...LINE}>
        <rect x={33} y={14} width={18} height={10} rx={2} fill="#d23b2e" />
        <path d="M35 24 h14 v10 q14 6 14 20 v26 q0 6 -6 6 h-30 q-6 0 -6 -6 v-26 q0 -14 14 -20 z" fill="#3b2216" />
        <rect x={26} y={52} width={32} height={18} rx={2} fill="#f3e6c8" />
      </g>
      <path d="M36 58 h12 M36 64 h8" {...detail('#d23b2e', 2)} />
    </g>
  );
}

function Wasabi() {
  return (
    <g>
      <ellipse cx={50} cy={78} rx={32} ry={8} fill="#f4efe6" {...LINE} />
      <path d="M24 76 Q22 56 38 48 Q46 42 47 32 Q48 22 56 20 Q53 29 58 35 Q74 48 76 76 Q50 82 24 76 Z" fill="#8fcb4a" {...LINE} />
      {[[36, 62], [44, 54], [54, 60], [62, 52], [66, 66], [48, 70], [56, 44]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.4} fill="#5f9a2c" />
      ))}
      <path d="M34 58 Q38 50 46 46" {...detail('#d6f0a8', 2.5)} />
    </g>
  );
}

/** A yunomi of green tea on a wooden saucer. */
function Tea() {
  return (
    <g>
      <path d="M36 30 q-5 -7 0 -14 M50 28 q-5 -7 0 -14 M64 30 q-5 -7 0 -14" {...detail('#ffffff', 2.5)} opacity={0.85} />
      <ellipse cx={50} cy={84} rx={32} ry={6} fill="#8a5a33" {...LINE} />
      <path d="M26 38 L74 38 L70 80 Q50 86 30 80 Z" fill="#ece5d3" {...LINE} />
      <path d="M27.1 50 L72.9 50 L72.1 58 L27.9 58 Z" fill="#4a6fa5" />
      <path d="M31 64 L33 76" {...detail('#ffffff', 3)} opacity={0.6} />
      <ellipse cx={50} cy={38} rx={24} ry={5} fill="#9bbf4a" {...LINE} />
    </g>
  );
}

/** The chef's order ticket, stamped special. */
function OrderTicket() {
  return (
    <g transform="rotate(-8 50 52)">
      <rect x={24} y={16} width={52} height={70} rx={3} fill="#fffdf6" {...LINE} />
      <path d="M24 19 Q24 16 27 16 H73 Q76 16 76 19 V29 H24 Z" fill="#d23b2e" {...LINE} />
      <text x={50} y={26} fontSize={8} fontWeight={700} fill="#ffffff" textAnchor="middle" fontFamily="sans-serif" letterSpacing={1}>
        ORDER
      </text>
      <path d="M31 39 H69 M31 48 H62 M31 57 H66" {...detail('#b9ad97', 2)} />
      {/* Mini nigiri doodle + star stamp */}
      <ellipse cx={39} cy={74} rx={8} ry={4} fill={RICE} {...LINE} strokeWidth={1} />
      <path d="M30 72 Q31 66 39 66 Q48 66 48 72 Q39 70 30 73 Z" fill={SALMON} {...LINE} strokeWidth={1} />
      <circle cx={62} cy={72} r={10} {...detail('#d23b2e', 2)} />
      <polygon points="62,64.5 64.2,69.5 69.5,70 65.5,73.5 66.6,78.7 62,76 57.4,78.7 58.5,73.5 54.5,70 59.8,69.5" fill="#d23b2e" />
    </g>
  );
}

/** A to-go sushi tray under a clear lid. Also the face of a flipped card. */
export function TakeoutTray() {
  const pieces: [number, string][] = [[28, SALMON], [50, TUNA], [72, TAMAGO]];
  return (
    <g>
      <rect x={12} y={44} width={76} height={38} rx={6} fill="#1d1d1f" {...LINE} />
      <path d="M16 74 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8" {...detail('#3fae4f', 2.5)} />
      {pieces.map(([x, color]) => (
        <g key={x} transform={`translate(${x} 62)`}>
          <ellipse cx={0} cy={3} rx={9} ry={5} fill={RICE} {...LINE} strokeWidth={1} />
          <path d="M-10 0 Q-9 -7 0 -7 Q10 -7 10 0 Q0 -2 -10 1 Z" fill={color} {...LINE} strokeWidth={1} />
        </g>
      ))}
      {/* Clear lid with a rubber band */}
      <rect x={10} y={36} width={80} height={42} rx={7} fill="#ffffff" fillOpacity={0.16} stroke="#ffffff" strokeOpacity={0.85} strokeWidth={1.5} />
      <path d="M58 35 V79" {...detail('#e2533f', 2.5)} />
    </g>
  );
}

function Chopsticks() {
  return (
    <g>
      <path d="M22 80 Q20 70 30 72 L74 72 Q84 70 82 80 Q50 88 22 80 Z" fill="#4a7fbf" {...LINE} />
      <path d="M12 30 L17 25 L90 74 L88 77 Z" fill="#d9a35b" {...LINE} />
      <path d="M22 20 L27 15 L94 63 L92 66 Z" fill="#c98f45" {...LINE} />
      {/* Paper sleeve band */}
      <path d="M24 26 L31 19 L37 24 L30 32 Z" fill="#fffdf6" {...LINE} strokeWidth={1} />
      <path d="M27 23 L33 28" {...detail('#d23b2e', 1.5)} />
    </g>
  );
}

/** A ceramic renge soup spoon. */
function Spoon() {
  return (
    <g transform="rotate(-24 50 52)">
      <path d="M16 52 Q16 34 40 34 Q58 34 62 46 L88 44 Q95 44 95 50 Q95 56 88 56 L62 56 Q58 70 40 70 Q16 70 16 52 Z" fill="#f7f5ee" {...LINE} />
      <ellipse cx={39} cy={52} rx={18} ry={12} fill="#e3ddd0" />
      <path d="M70 50 H86" {...detail('#4a6fa5', 3)} />
      <path d="M28 44 Q36 40 46 42" {...detail('#ffffff', 2.5)} />
    </g>
  );
}

/** A sushi-bar menu: dishes with prices. */
function MenuBoard() {
  const rows: [number, string][] = [[40, SALMON], [55, TUNA], [70, TAMAGO]];
  return (
    <g>
      <rect x={20} y={14} width={60} height={74} rx={4} fill="#f6ecd2" {...LINE} />
      <path d="M20 18 Q20 14 24 14 H76 Q80 14 80 18 V28 H20 Z" fill={NORI} {...LINE} />
      <text x={50} y={24.5} fontSize={9} fontWeight={700} fill="#f6ecd2" textAnchor="middle" fontFamily="sans-serif" letterSpacing={1.5}>
        MENU
      </text>
      {rows.map(([y, color]) => (
        <g key={y}>
          <ellipse cx={31} cy={y + 2} rx={6} ry={3} fill={RICE} stroke={INK} strokeWidth={0.8} />
          <path d={`M24 ${y + 1} Q25 ${y - 4} 31 ${y - 4} Q38 ${y - 4} 38 ${y + 1} Q31 ${y} 24 ${y + 2} Z`} fill={color} stroke={INK} strokeWidth={0.8} />
          <path d={`M43 ${y} H63`} {...detail('#b9ad97', 2)} />
          <circle cx={70} cy={y} r={2.5} fill="#d23b2e" />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Desserts

/** Custard purin with caramel, whipped cream and a cherry. */
function Pudding() {
  return (
    <g>
      <ellipse cx={50} cy={80} rx={38} ry={8} fill="#fffaf0" {...LINE} />
      <path d="M26 78 L33 42 Q50 36 67 42 L74 78 Q50 84 26 78 Z" fill="#f7d77c" {...LINE} />
      <path d="M33 42 Q50 36 67 42 L67.8 48 Q63 54 59 48 Q53 56 47 48 Q41 54 35.6 48 L33 42 Z" fill="#8a4a1c" {...LINE} />
      <ellipse cx={50} cy={41} rx={17} ry={4.5} fill="#a3591f" {...LINE} />
      <path d="M38 58 L36 72" {...detail('#fff4cf', 3)} />
      <path d="M40 38 Q38 30 46 30 Q48 24 54 27 Q62 26 60 34 Q62 38 58 39 Q50 41 42 40 Z" fill="#ffffff" {...LINE} />
      <path d="M52 24 Q54 16 60 13" {...detail('#3f7a2a', 1.6)} />
      <circle cx={51} cy={24} r={5} fill="#d6283b" {...LINE} />
      <circle cx={49.5} cy={22.5} r={1.3} fill="#ffffff" opacity={0.8} />
    </g>
  );
}

/** A scoop seen from the side: round top, frilly scooped edge at the bottom. */
function Scoop({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const w = r / 2;
  const frill = Array.from({ length: 4 }, () => `q${-w / 2} ${r / 3} ${-w} 0`).join(' ');
  return (
    <g>
      <path d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} ${frill} Z`} fill={fill} {...LINE} />
      <path d={`M${cx - r * 0.55} ${cy - r * 0.45} q${r * 0.25} ${-r * 0.3} ${r * 0.55} ${-r * 0.3}`} {...detail('#c7e79a', 2.5)} />
      {[[-0.3, -0.1], [0.25, -0.5], [0.45, 0.05], [-0.05, 0.15]].map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx * r} cy={cy + dy * r} r={1.2} fill="#4f7a26" />
      ))}
    </g>
  );
}

/** Two scoops of matcha ice cream in a white bowl, with a wafer. */
function MatchaIceCream() {
  return (
    <g>
      <ellipse cx={50} cy={64} rx={27} ry={4.5} fill="#e4dccb" {...LINE} />
      <g transform="rotate(26 72 30)">
        <rect x={67} y={8} width={10} height={36} rx={2} fill="#e8c27a" {...LINE} />
        <path d="M67 16 H77 M67 24 H77 M67 32 H77" {...detail('#c79a4a', 1.2)} />
      </g>
      <Scoop cx={62} cy={50} r={18} fill="#77ad40" />
      <Scoop cx={39} cy={54} r={21} fill="#86bd4c" />
      <path d="M30 33 q5 -9 14 -8 q-3 9 -14 8 Z" fill="#3f8a3a" {...LINE} strokeWidth={1} />
      <path d="M23 64 Q50 71 77 64 Q75 86 50 87 Q25 86 23 64 Z" fill="#fffaf0" {...LINE} />
      <path d="M29 70 Q31 78 38 82" {...detail('#e4dccb', 3)} />
      <path d="M41 86 L43 91 H57 L59 86" fill="#e4dccb" {...LINE} />
    </g>
  );
}

/** The two fruits on a fruit card, side by side. */
function FruitPair({ fruits }: { fruits: string[] }) {
  return (
    <>
      {fruits.map((f, i) => {
        const x = fruits.length === 1 ? 50 : 28 + i * 44;
        const Fruit = f === 'P' ? Pineapple : f === 'O' ? OrangeSlice : Watermelon;
        return <Fruit key={i} x={x} y={54} />;
      })}
    </>
  );
}

function Watermelon({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-12)`}>
      <path d="M-20 -8 A20 20 0 0 0 20 -8 Z" fill="#3f9a3f" {...LINE} />
      <path d="M-17 -8 A17 17 0 0 0 17 -8 Z" fill="#e8f5c8" />
      <path d="M-15 -8 A15 15 0 0 0 15 -8 Z" fill="#ec4a52" />
      {[[-8, -2], [0, 2], [8, -2], [-3, -5], [4, -4]].map(([sx, sy], i) => (
        <ellipse key={i} cx={sx} cy={sy} rx={1.2} ry={2} fill={INK} />
      ))}
    </g>
  );
}

function Pineapple({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 -14 L-8 -30 L-2 -20 L0 -34 L2 -20 L8 -30 Z" fill="#4f9a40" {...LINE} />
      <ellipse cx={0} cy={2} rx={12} ry={17} fill="#f5c22e" {...LINE} />
      <path d="M-9 -8 L7 12 M-11 2 L1 16 M-5 -14 L11 6 M9 -8 L-7 12 M11 2 L-1 16 M5 -14 L-11 6" {...detail('#c8901a', 1.2)} />
    </g>
  );
}

function OrangeSlice({ x, y }: { x: number; y: number }) {
  const segments = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i / 8) * Math.PI * 2;
    return <path key={i} d={`M0 0 L${Math.cos(a) * 13} ${Math.sin(a) * 13}`} {...detail('#fff3d6', 1.4)} />;
  });
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={17} fill="#f7931e" {...LINE} />
      <circle r={14} fill="#fff3d6" />
      <circle r={13} fill="#ffb347" />
      {segments}
      <circle r={2} fill="#fff3d6" />
    </g>
  );
}
