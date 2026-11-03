// 7 Wonders Duel — picker thumbnail: a small card pyramid (covered rows
// peeking out, a face-down row of Age backs) above the military track.
// Self-contained (no import from art.tsx, so the picker bundle stays small)
// and flat-filled with no <defs>.

const INK = '#1d140c';

function MiniCard({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={26} height={38} rx={3} fill={color} stroke={INK} strokeWidth={1.2} />
      <rect width={26} height={10} rx={3} fill="rgba(0,0,0,0.18)" />
      <rect x={3} y={11} width={20} height={20} rx={1.5} fill="#cfe6f1" stroke={INK} strokeWidth={0.7} />
      <rect x={3} y={24} width={20} height={7} fill="#93c46a" />
      <circle cx={13} cy={5} r={3.2} fill="#f4ead0" stroke={INK} strokeWidth={0.7} />
    </g>
  );
}

function MiniBack({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={26} height={38} rx={3} fill="#2f5d8c" stroke={INK} strokeWidth={1.2} />
      <rect x={2.5} y={2.5} width={21} height={33} rx={2} fill="none" stroke="#cfe0f0" strokeWidth={0.8} />
      <circle cx={13} cy={19} r={6.5} fill="#21456a" stroke="#cfe0f0" strokeWidth={0.9} />
      <path d="M10.6 16 v6 M13 16 v6 M15.4 16 v6" stroke="#cfe0f0" strokeWidth={1} />
    </g>
  );
}

export function SevenWondersDuelThumbnail() {
  const top = ['#8f5b2c', '#3f9a4b', '#e3a923', '#c43c2f'];
  const bottom = ['#2f6fb2', '#7a4fa8'];
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="7 Wonders Duel">
      <rect width={280} height={140} rx={10} fill="#3b2a1c" />
      <rect x={8} y={8} width={264} height={92} rx={8} fill="#24413f" stroke={INK} strokeWidth={1.2} />
      {top.map((c, i) => <MiniCard key={i} x={85 + i * 28} y={14} color={c} />)}
      {[0, 1, 2].map((i) => <MiniBack key={i} x={99 + i * 28} y={34} />)}
      {bottom.map((c, i) => <MiniCard key={i} x={113 + i * 28} y={54} color={c} />)}

      {/* military track */}
      <rect x={34} y={108} width={212} height={22} rx={5} fill="#7a5a34" stroke={INK} strokeWidth={1.2} />
      {Array.from({ length: 19 }, (_, i) => {
        const d = Math.abs(i - 9);
        const fill = d === 0 ? '#fbf1d6' : d <= 2 ? '#efe0b8' : d <= 5 ? '#e3c98e' : d <= 8 ? '#d4ad69' : i === 0 ? '#e2513f' : '#2f7fd1';
        return <rect key={i} x={38 + i * 10.7} y={111} width={9.6} height={16} rx={1.5} fill={fill} stroke={INK} strokeWidth={0.6} />;
      })}
      <path d="M178 111 l1 -4 h6 l1 4 v14 l-1.5 3 h-5 l-1.5 -3 Z" fill="#d12f26" stroke={INK} strokeWidth={1} />
      <path d="M182 113 v10 M179.6 116 h4.8" stroke="#ffe7a6" strokeWidth={1.1} />
    </svg>
  );
}
