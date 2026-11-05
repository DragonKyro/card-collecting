// 7 Wonders Duel — art for the Pantheon and Agora expansions.
//
// Flat hand-drawn SVG in art.tsx's style, no <defs> / ids: a 40 × 40 emblem
// for every Divinity, Mythology, Decree and Conspiracy (each distinct), the
// Mythology and Offering tokens, the face-down backs and an Influence cube.
// The Grand Temples, Senators and the four new wonders are scenes in art.tsx.

import type { ReactNode } from 'react';
import type { DuelConspiracyId, DuelDecreeId, DuelDivinityId, DuelMythology } from './types';
import { MYTHOLOGIES } from './pantheon';

const INK = '#2b1d12';
const CREAM = '#f7ecd2';
const GOLD = '#f2c443';
const L = { stroke: INK, strokeWidth: 1.1, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const ln = (color: string, width: number) =>
  ({ stroke: color, strokeWidth: width, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;

const mythColor = (m: DuelMythology) => MYTHOLOGIES.find((x) => x.id === m)!.color;

function Svg({ size, children, label }: { size: number; children: ReactNode; label?: string }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mythologies

function mythologyGlyph(m: DuelMythology, color = CREAM): ReactNode {
  switch (m) {
    case 'mesopotamian': // a ziggurat
      return (
        <g fill={color} {...L}>
          <rect x={9} y={26} width={22} height={5} />
          <rect x={12.5} y={21} width={15} height={5} />
          <rect x={16} y={16} width={8} height={5} />
          <rect x={18.5} y={11} width={3} height={5} />
        </g>
      );
    case 'phoenician': // a galley
      return (
        <g>
          <path d="M8 24 h24 q-2 6 -6 7 h-12 q-4 -1 -6 -7 Z" fill={color} {...L} />
          <path d="M20 24 V9" {...ln(INK, 1.4)} />
          <path d="M14 11 h12 q1 5 0 10 h-12 q-1 -5 0 -10 Z" fill={color} {...L} />
          <path d="M11 31 l-2 3 M15 31 l-2 3 M19 31 l-2 3 M23 31 l-2 3" {...ln(INK, 0.9)} />
        </g>
      );
    case 'greek': // an Ionic column
      return (
        <g fill={color} {...L}>
          <path d="M11 11 q0 -3 3 -3 h12 q3 0 3 3 q-2 -1 -3 0 h-12 q-1 -1 -3 0 Z" />
          <rect x={15} y={12} width={10} height={17} />
          <rect x={12} y={29} width={16} height={4} />
          <path d="M18 13 v15 M22 13 v15" {...ln(INK, 0.7)} />
        </g>
      );
    case 'egyptian': // an ankh
      return (
        <g>
          <ellipse cx={20} cy={13} rx={5} ry={6} {...ln(INK, 4.4)} />
          <ellipse cx={20} cy={13} rx={5} ry={6} {...ln(color, 2.4)} />
          <path d="M11 21 H29 M20 19 V34" {...ln(INK, 4.4)} />
          <path d="M11 21 H29 M20 19 V34" {...ln(color, 2.4)} />
        </g>
      );
    case 'roman': // a laurel wreath around an eagle's wings
      return (
        <g>
          <path d="M12 30 Q6 20 12 10 M28 30 Q34 20 28 10" {...ln(color, 2)} />
          {[14, 19, 24].map((y) => <ellipse key={y} cx={9.6} cy={y} rx={1.6} ry={2.8} fill={color} {...L} strokeWidth={0.6} />)}
          {[14, 19, 24].map((y) => <ellipse key={y} cx={30.4} cy={y} rx={1.6} ry={2.8} fill={color} {...L} strokeWidth={0.6} />)}
          <path d="M14 18 Q20 12 26 18 L20 26 Z" fill={color} {...L} />
        </g>
      );
  }
}

export function MythologyGlyph({ mythology, size = 20 }: { mythology: DuelMythology; size?: number }) {
  return (
    <Svg size={size}>
      <circle cx={20} cy={20} r={18.5} fill={mythColor(mythology)} {...L} />
      {mythologyGlyph(mythology)}
    </Svg>
  );
}

/** A Mythology token (hexagonal, in its Mythology's colour). */
export function MythologyTokenArt({ mythology, size = 26 }: { mythology: DuelMythology; size?: number }) {
  return (
    <Svg size={size}>
      <path d="M20 2 L36 11 V29 L20 38 L4 29 V11 Z" fill={mythColor(mythology)} {...L} strokeWidth={1.4} />
      <path d="M20 6 L32.6 13 V27 L20 34 L7.4 27 V13 Z" {...ln(CREAM, 0.8)} />
      <g transform="translate(5 5) scale(0.75)">{mythologyGlyph(mythology)}</g>
    </Svg>
  );
}

/** An Offering token: a gold disc with its discount. */
export function OfferingTokenArt({ value, size = 26 }: { value: number; size?: number }) {
  return (
    <Svg size={size}>
      <circle cx={20} cy={20} r={18} fill="#c9ced3" {...L} strokeWidth={1.4} />
      <circle cx={20} cy={20} r={14.6} fill={GOLD} {...L} />
      <path d="M12 16 q8 -7 16 0" {...ln('#a8742a', 1)} />
      <text x={20} y={21} dy="0.36em" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={700} fontSize={15} fill={INK}>−{value}</text>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Divinities

function divinityGlyph(id: DuelDivinityId): ReactNode {
  switch (id) {
    case 'enki': // the waters and a fish
      return (
        <g>
          <path d="M8 26 q3 -3 6 0 t6 0 t6 0 t6 0 M8 31 q3 -3 6 0 t6 0 t6 0 t6 0" {...ln(CREAM, 1.6)} />
          <path d="M12 16 q8 -7 14 0 q-6 7 -14 0 Z M26 16 l5 -4 v8 Z" fill={CREAM} {...L} />
          <circle cx={15} cy={15} r={0.9} fill={INK} />
        </g>
      );
    case 'ishtar': // the eight-pointed star
      return (
        <g>
          {[0, 45, 90, 135].map((a) => (
            <path key={a} d="M20 6 L22.4 20 L20 34 L17.6 20 Z" transform={`rotate(${a} 20 20)`} fill={GOLD} {...L} />
          ))}
          <circle cx={20} cy={20} r={3.4} fill={CREAM} {...L} />
        </g>
      );
    case 'nisaba': // the snake coiled on a stylus
      return (
        <g>
          <path d="M20 6 V34" {...ln('#a86a33', 2.4)} />
          <path d="M14 30 q12 -4 0 -8 q-6 -3 4 -7 q10 -3 2 -8" {...ln(INK, 4)} />
          <path d="M14 30 q12 -4 0 -8 q-6 -3 4 -7 q10 -3 2 -8" {...ln('#7fbf6a', 2.4)} />
          <circle cx={20} cy={7} r={2.2} fill="#7fbf6a" {...L} />
        </g>
      );
    case 'astarte': // a crescent cradling 7 coins
      return (
        <g>
          <path d="M8 18 A12 12 0 0 0 32 18 A10 8 0 0 1 8 18 Z" fill={CREAM} {...L} />
          {[[14, 13], [20, 11], [26, 13], [11, 8], [17, 6], [23, 6], [29, 8]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.3} fill={GOLD} {...L} strokeWidth={0.7} />
          ))}
          <path d="M20 30 v4" {...ln(CREAM, 1.6)} />
        </g>
      );
    case 'baal': // bull horns over a club
      return (
        <g>
          <path d="M8 10 Q10 22 20 22 Q30 22 32 10 Q28 18 20 18 Q12 18 8 10 Z" fill={CREAM} {...L} />
          <path d="M20 22 V34" {...ln(INK, 4)} />
          <path d="M20 22 V34" {...ln('#a86a33', 2.2)} />
          <path d="M16 26 l8 2" {...ln(GOLD, 1.6)} />
        </g>
      );
    case 'tanit': // the sign of Tanit
      return (
        <g fill={CREAM} {...L}>
          <path d="M20 17 L30 33 H10 Z" />
          <rect x={9} y={15} width={22} height={3} />
          <circle cx={20} cy={10} r={4.4} />
        </g>
      );
    case 'aphrodite': // a scallop shell
      return (
        <g>
          <path d="M8 26 Q20 2 32 26 Z" fill="#f4c6c9" {...L} />
          {[12, 16, 20, 24, 28].map((x) => <path key={x} d={`M20 26 L${x} ${x === 20 ? 9 : 14}`} {...ln(INK, 0.8)} />)}
          <path d="M16 26 h8 l-2 5 h-4 Z" fill="#f4c6c9" {...L} />
        </g>
      );
    case 'hades': // the bident
      return (
        <g>
          <path d="M20 14 V34 M13 6 V12 Q13 16 20 16 Q27 16 27 12 V6" {...ln(INK, 3.6)} />
          <path d="M20 14 V34 M13 6 V12 Q13 16 20 16 Q27 16 27 12 V6" {...ln('#c9ced3', 1.8)} />
          <path d="M11 30 q9 -4 18 0" {...ln('#b23c32', 1.4)} />
        </g>
      );
    case 'zeus': // the thunderbolt
      return <path d="M23 4 L10 22 H19 L15 36 L30 16 H21 Z" fill={GOLD} {...L} strokeWidth={1.3} />;
    case 'anubis': // a jackal's head
      return (
        <g>
          <path d="M14 34 L14 18 L11 6 L18 14 L22 14 L26 6 L25 18 Q31 22 30 26 L22 26 L22 34 Z" fill="#2a262c" {...L} stroke={CREAM} />
          <circle cx={21} cy={19} r={1.2} fill={GOLD} />
        </g>
      );
    case 'isis': // a winged disc
      return (
        <g>
          <path d="M20 20 Q10 10 4 14 Q8 18 6 22 Q12 22 20 24 Z M20 20 Q30 10 36 14 Q32 18 34 22 Q28 22 20 24 Z" fill={CREAM} {...L} />
          <circle cx={20} cy={20} r={5} fill="#b23c32" {...L} />
          <path d="M16 30 h8" {...ln(CREAM, 1.6)} />
        </g>
      );
    case 'ra': // the sun disc
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M20 3 V8" transform={`rotate(${i * 30} 20 20)`} {...ln(GOLD, 1.8)} />
          ))}
          <circle cx={20} cy={20} r={10} fill="#e85a2a" {...L} />
          <path d="M16 16 q4 -4 8 0" {...ln(GOLD, 1.3)} />
        </g>
      );
    case 'mars': // spear and shield
      return (
        <g>
          <path d="M8 34 L30 8" {...ln(INK, 3)} />
          <path d="M8 34 L30 8" {...ln('#a86a33', 1.6)} />
          <path d="M30 8 l-6 1 l4 4 Z" fill="#c9ced3" {...L} />
          <circle cx={16} cy={22} r={8} fill="#b23c32" {...L} />
          <circle cx={16} cy={22} r={2.6} fill={GOLD} {...L} />
        </g>
      );
    case 'minerva': // the owl
      return (
        <g>
          <path d="M10 34 Q8 16 12 10 L16 14 H24 L28 10 Q32 16 30 34 Z" fill="#a89070" {...L} />
          <circle cx={16} cy={19} r={4} fill={CREAM} {...L} />
          <circle cx={24} cy={19} r={4} fill={CREAM} {...L} />
          <circle cx={16} cy={19} r={1.6} fill={INK} />
          <circle cx={24} cy={19} r={1.6} fill={INK} />
          <path d="M19 23 l1 2 l1 -2 Z" fill={GOLD} {...L} strokeWidth={0.6} />
        </g>
      );
    case 'neptune': // the trident
      return (
        <g>
          <path d="M20 12 V35 M11 5 V12 Q11 17 20 17 Q29 17 29 12 V5 M20 4 V17" {...ln(INK, 3.4)} />
          <path d="M20 12 V35 M11 5 V12 Q11 17 20 17 Q29 17 29 12 V5 M20 4 V17" {...ln('#5cb3d9', 1.8)} />
        </g>
      );
    case 'gate': // a gateway between two pylons
      return (
        <g>
          <path d="M6 34 V12 L12 8 L18 12 V34 Z M22 34 V12 L28 8 L34 12 V34 Z" fill="#c9ced3" {...L} />
          <path d="M14 34 V20 A6 6 0 0 1 26 20 V34 Z" fill="#2a262c" {...L} />
          <path d="M20 22 v8" {...ln(GOLD, 1.4)} />
          <path d="M8 8 q12 -8 24 0" {...ln(GOLD, 1.2)} />
        </g>
      );
  }
}

/** A Divinity's emblem on a disc of its Mythology's colour (the Gate on stone). */
export function DivinityEmblem({ id, mythology, size = 40 }: { id: DuelDivinityId; mythology: DuelMythology | null; size?: number }) {
  return (
    <Svg size={size}>
      <circle cx={20} cy={20} r={19} fill={mythology ? mythColor(mythology) : '#6b6470'} {...L} strokeWidth={1.3} />
      {divinityGlyph(id)}
    </Svg>
  );
}

/** A face-down Divinity: its Mythology's back. */
export function DivinityBackArt({ mythology, size = 40 }: { mythology: DuelMythology; size?: number }) {
  return (
    <Svg size={size}>
      <rect x={2} y={2} width={36} height={36} rx={6} fill={mythColor(mythology)} {...L} strokeWidth={1.3} />
      <rect x={5} y={5} width={30} height={30} rx={4} {...ln(CREAM, 0.8)} />
      <g transform="translate(6 6) scale(0.7)">{mythologyGlyph(mythology)}</g>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Decrees

const CHIP: Record<string, string> = { blue: '#2f6fb2', green: '#3f9a4b', yellow: '#e3a923', red: '#c43c2f', brown: '#8f5b2c', gray: '#9aa2aa' };

const chip = (color: string, x = 10, y = 12) => <rect x={x} y={y} width={9} height={13} rx={1.6} fill={color} {...L} />;
const coin = (x = 26, y = 19, label = '') => (
  <g>
    <circle cx={x} cy={y} r={5.6} fill={GOLD} {...L} />
    {label && <text x={x} y={y} dy="0.36em" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={700} fontSize={6.4} fill={INK}>{label}</text>}
  </g>
);
const minus = (x = 27, y = 19) => (
  <g>
    <circle cx={x} cy={y} r={5.4} fill={CREAM} {...L} />
    <path d={`M${x - 3} ${y} h6`} {...ln('#b23c32', 1.8)} />
  </g>
);
const miniPyramid = (x = 14, y = 26) => <path d={`M${x - 6} ${y} L${x} ${y - 11} L${x + 6} ${y} Z`} fill="#e7c584" {...L} />;

function decreeGlyph(id: DuelDecreeId): ReactNode {
  switch (id) {
    case 'blueCoins': return <g>{chip(CHIP.blue)}{coin()}</g>;
    case 'greenCoins': return <g>{chip(CHIP.green)}{coin()}</g>;
    case 'yellowCoins': return <g>{chip(CHIP.yellow)}{coin()}</g>;
    case 'redCoins': return <g>{chip(CHIP.red)}{coin()}</g>;
    case 'yellowRebate': return <g>{chip(CHIP.yellow)}{minus()}</g>;
    case 'redRebate': return <g>{chip(CHIP.red)}{minus()}</g>;
    case 'greenRebate': return <g>{chip(CHIP.green)}{minus()}</g>;
    case 'wonderRebate': return <g>{miniPyramid()}{minus()}</g>;
    case 'militaryDecree':
      return <path d="M20 9 L29 12 V20 Q29 27 20 31 Q11 27 11 20 V12 Z" fill="#c43c2f" {...L} />;
    case 'rawTrade':
      return <g><rect x={8} y={14} width={13} height={9} rx={1} fill="#b8552f" {...L} /><path d="M8 18.5 h13 M14.5 14 v4.5" {...ln(INK, 0.6)} />{coin(28, 19, '−1')}</g>;
    case 'goodsTrade':
      return <g><path d="M12 10 h5 v4 l3 4 v9 h-11 v-9 l3 -4 Z" fill="#9fd3e0" {...L} />{coin(28, 19, '−1')}</g>;
    case 'senateBoost':
      return <g>{chip(CHIP.blue, 8, 12)}{chip(CHIP.blue, 13, 14)}<text x={29} y={19} dy="0.36em" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={700} fontSize={10} fill={INK}>+2</text></g>;
    case 'discardBonus':
      return <g><rect x={8} y={11} width={10} height={15} rx={1.4} fill={CREAM} {...L} transform="rotate(-14 13 18)" />{coin(27, 19, '+2')}</g>;
    case 'wonderCoins': return <g>{miniPyramid()}{coin()}</g>;
    case 'sharedChains':
      return (
        <g>
          <rect x={7} y={15} width={14} height={8} rx={4} {...ln(INK, 2.4)} />
          <rect x={19} y={15} width={14} height={8} rx={4} {...ln(INK, 2.4)} />
          <rect x={7} y={15} width={14} height={8} rx={4} {...ln('#c9ced3', 1.2)} />
          <rect x={19} y={15} width={14} height={8} rx={4} {...ln('#c9ced3', 1.2)} />
        </g>
      );
    case 'conspiratorReplay':
      return (
        <g>
          <path d="M8 28 L11 14 Q15 7 19 14 L22 28 Z" fill="#2a262c" {...L} />
          <path d="M26 12 A7 7 0 1 1 25 26" {...ln(INK, 2)} />
          <path d="M25 26 l-3 -1 l2 -3" {...ln(INK, 2)} />
        </g>
      );
  }
}

/** A Decree: a parchment seal with its emblem. */
export function DecreeArt({ id, size = 34 }: { id: DuelDecreeId; size?: number }) {
  return (
    <Svg size={size}>
      <rect x={3} y={6} width={34} height={28} rx={3} fill="#f1e1b4" {...L} />
      <path d="M3 10 q-2 -4 2 -4 M37 30 q2 4 -2 4" {...ln(INK, 1)} />
      {decreeGlyph(id)}
      <circle cx={33} cy={31} r={3.2} fill="#b23c32" {...L} strokeWidth={0.7} />
    </Svg>
  );
}

/** A face-down Decree. */
export function DecreeBackArt({ size = 34 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x={3} y={6} width={34} height={28} rx={3} fill="#8d7a52" {...L} />
      <rect x={6} y={9} width={28} height={22} rx={2} {...ln('#e8d6a6', 0.8)} />
      <text x={20} y={20} dy="0.36em" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={700} fontSize={13} fill="#e8d6a6">?</text>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Conspiracies

function conspiracyGlyph(id: DuelConspiracyId): ReactNode {
  switch (id) {
    case 'extortion': // a hook over a wonder
      return <g>{miniPyramid(16, 32)}<path d="M26 6 V18 a5 5 0 1 1 -5 5" {...ln('#c9ced3', 2.2)} /></g>;
    case 'blackmail': // a sealed letter
      return (
        <g>
          <rect x={7} y={12} width={26} height={17} rx={1.6} fill={CREAM} {...L} />
          <path d="M7 12 L20 23 L33 12" {...ln(INK, 1)} />
          <circle cx={20} cy={23} r={3.4} fill="#b23c32" {...L} />
        </g>
      );
    case 'expropriation': // a blue card, torn
      return <g><path d="M12 8 h16 v24 h-16 Z" fill={CHIP.blue} {...L} /><path d="M12 20 l5 -3 l5 4 l6 -3" {...ln(CREAM, 1.8)} /></g>;
    case 'swindle': // a yellow card behind a mask
      return (
        <g>
          <rect x={10} y={7} width={16} height={24} rx={1.6} fill={CHIP.yellow} {...L} />
          <path d="M14 22 q6 -6 16 -2 q-2 7 -8 6 q-3 -3 -8 -4 Z" fill="#2a262c" {...L} />
          <circle cx={21} cy={22} r={1.2} fill={CREAM} />
          <circle cx={26} cy={22} r={1.2} fill={CREAM} />
        </g>
      );
    case 'obscurantism': // a snuffed candle
      return (
        <g>
          <rect x={16} y={18} width={8} height={15} fill={CREAM} {...L} />
          <path d="M20 18 V15" {...ln(INK, 1)} />
          <path d="M12 12 L24 4 L27 8 L15 16 Z" fill="#c9ced3" {...L} />
          <path d="M21 13 q2 -3 0 -5" {...ln('#9aa2aa', 1)} />
        </g>
      );
    case 'coup': // a toppled crown and a sword
      return (
        <g>
          <path d="M8 26 L9 16 L13 20 L16 13 L19 20 L23 16 L24 26 Z" fill={GOLD} {...L} transform="rotate(-20 16 20)" />
          <path d="M22 34 L33 8" {...ln(INK, 2.6)} />
          <path d="M22 34 L33 8" {...ln('#c9ced3', 1.2)} />
          <path d="M25 26 l5 2" {...ln(INK, 2)} />
        </g>
      );
    case 'propertyFraud': // a house and a key
      return (
        <g>
          <path d="M7 20 L17 11 L27 20 V31 H7 Z" fill={CREAM} {...L} />
          <circle cx={27} cy={26} r={3.6} {...ln(GOLD, 2)} />
          <path d="M30 26 h5 M33 26 v3" {...ln(GOLD, 2)} />
        </g>
      );
    case 'treason': // the opened box
      return (
        <g>
          <path d="M8 18 h24 v14 h-24 Z" fill="#a86a33" {...L} />
          <path d="M8 18 L12 9 h24 l-4 9" fill="#c08a4c" {...L} />
          <path d="M14 24 h12" {...ln(GOLD, 1.6)} />
          <path d="M18 6 l2 -3 l2 3" {...ln(GOLD, 1.2)} />
        </g>
      );
    case 'politicalManeuver': // cubes shuffled between chambers
      return (
        <g>
          <path d="M8 26 h8 v6 h-8 Z" fill="#e8c35a" {...L} />
          <path d="M24 12 h8 v6 h-8 Z" fill="#e8c35a" {...L} />
          <path d="M14 22 Q16 12 23 14" {...ln(CREAM, 1.6)} />
          <path d="M23 14 l-3 -1 l1 3" {...ln(CREAM, 1.6)} />
          <path d="M28 22 l-4 8 M24 22 l4 8" {...ln('#b23c32', 1.6)} />
        </g>
      );
    case 'espionage': // an eye through a keyhole
      return (
        <g>
          <path d="M6 20 Q20 8 34 20 Q20 32 6 20 Z" fill={CREAM} {...L} />
          <circle cx={20} cy={18} r={3} fill="#2a262c" />
          <path d="M18.6 19 L17.6 25 H22.4 L21.4 19 Z" fill="#2a262c" />
        </g>
      );
    case 'turnOfEvents': // an hourglass, turning
      return (
        <g>
          <path d="M12 8 H28 L21 20 L28 32 H12 L19 20 Z" fill={CREAM} {...L} />
          <path d="M15 30 h10 l-5 -5 Z M17 11 h6 l-3 4 Z" fill="#e3a923" />
          <path d="M33 14 A14 14 0 0 1 33 26" {...ln(CREAM, 1.4)} />
        </g>
      );
    case 'embezzlement': // a money bag
      return (
        <g>
          <path d="M14 14 Q6 24 12 32 H28 Q34 24 26 14 Z" fill="#c08a4c" {...L} />
          <path d="M14 14 L16 8 L20 11 L24 8 L26 14 Z" fill="#c08a4c" {...L} />
          <text x={20} y={24} dy="0.36em" textAnchor="middle" fontFamily="Georgia, serif" fontWeight={700} fontSize={9} fill={GOLD}>$</text>
        </g>
      );
    case 'foreclosure': // a padlock on a brown card
      return (
        <g>
          <rect x={8} y={8} width={14} height={22} rx={1.4} fill={CHIP.brown} {...L} />
          <path d="M22 18 v-4 a5 5 0 0 1 10 0 v4" {...ln('#c9ced3', 2.2)} />
          <rect x={19} y={18} width={16} height={13} rx={2} fill={GOLD} {...L} />
        </g>
      );
    case 'coercion': // two cards swapping
      return (
        <g>
          <rect x={6} y={10} width={11} height={16} rx={1.4} fill={CHIP.blue} {...L} />
          <rect x={23} y={14} width={11} height={16} rx={1.4} fill={CHIP.green} {...L} />
          <path d="M12 30 Q20 37 28 32 M28 8 Q20 3 12 8" {...ln(CREAM, 1.4)} />
        </g>
      );
    case 'insiderInfluence': // a decree carried to another chamber
      return (
        <g>
          <rect x={6} y={12} width={18} height={14} rx={2} fill="#f1e1b4" {...L} />
          <circle cx={21} cy={23} r={2.4} fill="#b23c32" {...L} strokeWidth={0.6} />
          <path d="M26 19 H35 M31 15 l4 4 l-4 4" {...ln(CREAM, 1.8)} />
        </g>
      );
    case 'sabotage': // a wonder in flames
      return (
        <g>
          {miniPyramid(20, 34)}
          <path d="M20 22 C26 16 24 10 20 4 C18 10 12 14 16 22 Z" fill="#f39a2b" {...L} />
          <path d="M20 21 C22 17 21 14 20 11 C19 14 17 17 20 21 Z" fill="#ffd45a" />
        </g>
      );
  }
}

/** A Conspiracy face up: a dark card with its emblem. */
export function ConspiracyArt({ id, size = 40 }: { id: DuelConspiracyId; size?: number }) {
  return (
    <Svg size={size}>
      <rect x={3} y={1.5} width={34} height={37} rx={4} fill="#3b2a3e" {...L} />
      <rect x={5.5} y={4} width={29} height={32} rx={3} {...ln('#c9a86a', 0.8)} />
      {conspiracyGlyph(id)}
    </Svg>
  );
}

/** A Conspiracy face down. */
export function ConspiracyBackArt({ size = 40 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x={3} y={1.5} width={34} height={37} rx={4} fill="#2a1d2c" {...L} />
      <rect x={5.5} y={4} width={29} height={32} rx={3} {...ln('#c9a86a', 0.8)} />
      <path d="M13 28 L15 14 Q20 6 25 14 L27 28 Z" {...ln('#c9a86a', 0.9)} fill="#1a1219" />
      <path d="M17 16 h6" {...ln('#c9a86a', 1)} />
    </Svg>
  );
}

/** An Influence cube in a seat's colour. */
export function CubeIcon({ color, size = 14, title }: { color: string; size?: number; title?: string }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M10 2 L18 6 V14 L10 18 L2 14 V6 Z" fill={color} {...L} />
      <path d="M2 6 L10 10 L18 6 M10 10 V18" {...ln('rgba(0,0,0,0.45)', 1)} />
    </svg>
  );
}
