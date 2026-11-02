// Game-picker thumbnail for Machi Koro — a little toy-town skyline (barn,
// bakery, office tower, café, Ferris wheel) with two dice and some coins in
// the foreground. Self-contained so the picker bundle doesn't pull in art.tsx.

const INK = '#3b2a20';
const LINE = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const THIN = { stroke: INK, strokeWidth: 1, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const GLASS = '#aadff3';

export function MachiKoroThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Machi Koro">
      <defs>
        <linearGradient id="mk-thumb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9fd8f5" />
          <stop offset="100%" stopColor="#fdf3d6" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="140" rx="10" fill="url(#mk-thumb-sky)" />

      {/* sun + clouds */}
      <circle cx={260} cy={21} r={11} fill="#ffd54a" {...LINE} />
      <Cloud x={52} y={24} />
      <Cloud x={160} y={16} s={0.8} />

      {/* hills */}
      <path d="M0 92 Q60 72 130 88 T280 80 V112 H0 Z" fill="#b5dc8a" {...LINE} />

      {/* Ferris wheel (behind the café) */}
      <FerrisWheel cx={226} cy={62} r={28} />

      {/* ground */}
      <path d="M0 106 H280 V130 Q280 140 270 140 H10 Q0 140 0 130 Z" fill="#97d36e" {...LINE} />

      {/* barn */}
      <rect x={18} y={76} width={40} height={32} fill="#d9473b" {...LINE} />
      <path d="M14 79 L21 66 L38 58 L55 66 L62 79 Z" fill="#9b2f2b" {...LINE} />
      <rect x={29} y={88} width={18} height={20} fill="#b93a31" {...THIN} />
      <path d="M29 88 L47 108 M47 88 L29 108" stroke="#fff6e2" strokeWidth={1.8} />
      <rect x={33} y={67} width={10} height={7} fill="#fff6e2" {...THIN} />

      {/* bakery */}
      <rect x={66} y={80} width={44} height={28} fill="#fde3b5" {...LINE} />
      <rect x={63} y={76} width={50} height={5} fill="#8a5a32" {...LINE} />
      <Awning x={66} y={84} w={44} colors={['#3aa45f', '#ffffff']} n={6} />
      <rect x={70} y={94} width={20} height={11} fill={GLASS} {...THIN} />
      <rect x={95} y={92} width={11} height={16} fill="#7a4a26" {...THIN} />
      <ellipse cx={88} cy={69} rx={14} ry={6} fill="#d98f45" {...LINE} />
      <path d="M80 66 q2 3 0 6 M88 64.5 q2 4 0 8 M96 66 q2 3 0 6" stroke="#f3cf93" strokeWidth={1.6} fill="none" strokeLinecap="round" />

      {/* office tower */}
      <path d="M131 30 V20" stroke={INK} strokeWidth={1.4} />
      <circle cx={131} cy={20} r={2} fill="#e2513f" />
      <rect x={116} y={34} width={30} height={74} fill="#ece7fa" {...LINE} />
      <rect x={114} y={30} width={34} height={6} fill="#7a56b8" {...LINE} />
      {Array.from({ length: 7 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => (
          <rect key={`${r}.${c}`} x={120 + c * 8.4} y={41 + r * 8.6} width={5.4} height={5.4} rx={0.6} fill={GLASS} {...THIN} />
        )),
      )}

      {/* café */}
      <rect x={152} y={82} width={46} height={26} fill="#cfe9d4" {...LINE} />
      <rect x={149} y={78} width={52} height={5} fill="#3f7d5b" {...LINE} />
      <Awning x={152} y={86} w={46} colors={['#e04b4b', '#ffffff']} n={6} />
      <rect x={156} y={96} width={18} height={10} fill={GLASS} {...THIN} />
      <rect x={180} y={94} width={12} height={14} fill="#3f7d5b" {...THIN} />
      <path d="M166 64 H182 L180.5 74 Q174 77 167.5 74 Z" fill="#ffffff" {...LINE} />
      <circle cx={183.5} cy={68} r={2.6} fill="none" stroke={INK} strokeWidth={1.4} />
      <ellipse cx={174} cy={64} rx={8} ry={1.6} fill="#7a4a26" {...THIN} />

      {/* little house */}
      <rect x={232} y={86} width={34} height={22} fill="#fff1c4" {...LINE} />
      <path d="M228 88 L249 72 L270 88 Z" fill="#3e78b3" {...LINE} />
      <rect x={237} y={92} width={9} height={8} fill={GLASS} {...THIN} />
      <rect x={252} y={94} width={9} height={14} fill="#7a4a26" {...THIN} />

      {/* dice + coins */}
      <Die x={110} y={120} rot={-12} pips={5} />
      <Die x={142} y={121} rot={9} pips={6} />
      <Coin x={78} y={124} />
      <Coin x={178} y={127} />
      <Coin x={190} y={121} />
    </svg>
  );
}

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#ffffff">
      <ellipse cx={0} cy={3} rx={18} ry={6} />
      <circle cx={-6} cy={0} r={7} />
      <circle cx={5} cy={-2} r={9} />
    </g>
  );
}

function Awning({ x, y, w, colors, n }: { x: number; y: number; w: number; colors: [string, string]; n: number }) {
  const sw = w / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={`M${x + i * sw} ${y} h${sw} v5 a${sw / 2} ${sw / 2.4} 0 0 1 ${-sw} 0 Z`} fill={colors[i % 2]} {...THIN} />
      ))}
    </g>
  );
}

function FerrisWheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const cars = ['#e04b4b', '#f6c443', '#3e78b3', '#8fd16a', '#f28bb0', '#f08a24', '#8e5bc4', '#3fb6b0'];
  return (
    <g>
      <path d={`M${cx - 16} 108 L${cx} ${cy} L${cx + 16} 108`} fill="none" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d={`M${cx - 16} 108 L${cx} ${cy} L${cx + 16} 108`} fill="none" stroke="#9aa3ad" strokeWidth={2} strokeLinejoin="round" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i;
        return <path key={i} d={`M${cx} ${cy} L${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`} stroke={INK} strokeWidth={0.9} />;
      })}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={4} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e04b4b" strokeWidth={2.2} />
      <circle cx={cx} cy={cy} r={3.4} fill="#f6c443" {...THIN} />
      {cars.map((c, i) => {
        const a = (Math.PI / 4) * i + Math.PI / 8;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        return <rect key={i} x={x - 4} y={y + 1} width={8} height={6} rx={1.8} fill={c} {...THIN} />;
      })}
    </g>
  );
}

const PIPS: Record<number, [number, number][]> = {
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function Die({ x, y, rot, pips }: { x: number; y: number; rot: number; pips: 5 | 6 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-12} y={-10} width={24} height={24} rx={5} fill="#000000" opacity={0.15} />
      <rect x={-12} y={-12} width={24} height={24} rx={5} fill="#ffffff" {...LINE} />
      {PIPS[pips].map(([px, py], i) => <circle key={i} cx={px * 6} cy={py * 6} r={2.2} fill="#d23c3c" />)}
    </g>
  );
}

function Coin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={8} fill="#f6c443" {...LINE} />
      <circle cx={x} cy={y} r={5.4} fill="none" stroke="#d99a1e" strokeWidth={1} />
      <path d={`M${x - 2} ${y - 3} l1.5 -1 V${y + 4}`} fill="none" stroke="#9a6410" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
