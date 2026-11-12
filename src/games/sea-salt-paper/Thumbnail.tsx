// Game-picker hero art for Sea Salt & Paper: origami on the sea. A folded
// paper boat carries a fan of three cards (shell / mermaid / crab) as its
// sail, on paper-cut waves at sunrise — a lighthouse island on the horizon,
// gulls, a leaping fish, glints on the water.
//
// Also the lobby banner (and its blurred backdrop), so it can be on screen
// twice: every id comes from useSvgIds. The animated parts carry no filters
// (the boat's shadows are plain shapes), so they stay cheap to repaint.

import type { ReactNode } from 'react';
import { LightPool, SoftShadow, Vignette, useSvgIds } from '@/core/svg';
import type { SspCardFamily } from './types';
import { CardArt } from './CardArt';

const INK = '#1c1a2e';

export function SeaSaltPaperThumbnail() {
  const id = useSvgIds();
  const glints = [[206, 108, 1], [226, 118, 1.3], [252, 112, 0.9], [238, 128, 1.1], [272, 122, 0.8], [62, 116, 0.8]] as const;
  return (
    <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" role="img" aria-label="Sea Salt & Paper">
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3fb3c8" />
          <stop offset="55%" stopColor="#9fe0d8" />
          <stop offset="100%" stopColor="#ffdcae" />
        </linearGradient>
        <linearGradient id={id('farSea')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5cc3c8" />
          <stop offset="100%" stopColor="#2f97a8" />
        </linearGradient>
        <linearGradient id={id('midSea')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a8fa3" />
          <stop offset="100%" stopColor="#1c6a80" />
        </linearGradient>
        <linearGradient id={id('nearSea')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b6f86" />
          <stop offset="100%" stopColor="#0c3a4c" />
        </linearGradient>
        <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id('sun')} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="70%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#ffc35c" />
        </radialGradient>
        <LightPool id={id('sunGlow')} color="#fff1c4" opacity={0.85} />
        <LightPool id={id('fanGlow')} color="#fff6dc" opacity={0.5} />
        <Vignette id={id('vig')} color="#04202b" inner={0.5} opacity={0.6} />
        <SoftShadow id={id('soft')} dy={1.5} blur={1.5} opacity={0.35} />
      </defs>

      {/* sky, sun and its rays */}
      <rect width="320" height="180" fill={id.url('sky')} />
      <circle cx="244" cy="78" r="96" fill={id.url('sunGlow')} />
      <g fill="#fffbe6" style={{ animation: 'cc-twinkle 7s ease-in-out infinite' }} opacity="0.5">
        <polygon points="244,78 150,-10 186,-10" opacity="0.35" />
        <polygon points="244,78 214,-10 238,-10" opacity="0.3" />
        <polygon points="244,78 272,-10 300,-10" opacity="0.3" />
        <polygon points="244,78 330,0 330,30" opacity="0.25" />
      </g>
      <circle cx="244" cy="80" r="15" fill={id.url('sun')} />

      {/* paper-cut clouds drifting */}
      <g className="cc-anim-drift">
        <Cloud x={40} y={30} s={1} />
        <Cloud x={160} y={18} s={0.7} />
      </g>
      {/* origami gulls */}
      <g className="cc-anim-float" fill="none" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M96 52 l6 -4 l4 4 l4 -4 l6 4" />
        <path d="M118 40 l4 -3 l3 3 l3 -3 l4 3" opacity="0.75" />
      </g>

      {/* lighthouse island on the horizon */}
      <path d="M8 88 Q24 76 44 78 Q62 74 82 88 Z" fill="#3d7d82" />
      <path d="M44 78 Q62 74 82 88 L58 88 Z" fill="#2f666c" />
      <polygon points="52,60 60,60 62,80 50,80" fill="#fbfaf5" stroke={INK} strokeWidth="1" />
      <polygon points="51,66 61,66 61.4,71 50.6,71" fill="#e0584f" />
      <polygon points="52,55 60,55 60,60 52,60" fill="#fff2a8" stroke={INK} strokeWidth="1" />
      <polygon points="50,55 56,49 62,55" fill="#e0584f" stroke={INK} strokeWidth="1" />
      <polygon points="60,56 92,48 92,62" fill="#fff6c2" opacity="0.55" className="cc-anim-twinkle" />

      {/* far sea, sun path */}
      <rect y="86" width="320" height="94" fill={id.url('farSea')} />
      <g fill="#fff6d0" opacity="0.8">
        <rect x="226" y="90" width="36" height="1.6" rx="0.8" />
        <rect x="232" y="95" width="24" height="1.4" rx="0.7" />
        <rect x="236" y="100" width="16" height="1.2" rx="0.6" />
      </g>

      {/* mid swell */}
      <path d="M0 104 Q20 96 40 104 T80 104 T120 104 T160 104 T200 104 T240 104 T280 104 T320 104 V180 H0 Z" fill={id.url('midSea')} />
      <path d="M0 104 Q20 96 40 104 T80 104 T120 104 T160 104 T200 104 T240 104 T280 104 T320 104" fill="none" stroke="#e9fbf6" strokeWidth="1.6" strokeDasharray="22 10" opacity="0.7" />
      {glints.map(([x, y, s], i) => (
        <path
          key={i}
          d={`M${x} ${y - 4 * s} L${x + s} ${y - s} L${x + 4 * s} ${y} L${x + s} ${y + s} L${x} ${y + 4 * s} L${x - s} ${y + s} L${x - 4 * s} ${y} L${x - s} ${y - s} Z`}
          fill="#fffbe6"
          className="cc-anim-twinkle"
          style={{ animationDelay: `${(i * 0.53) % 3}s` }}
        />
      ))}

      {/* leaping origami fish */}
      <g transform="translate(262 72) rotate(-28) scale(0.36)">
        <CardArt family="fish" bodyColor="#4fb0a8" />
      </g>
      <g fill="#e9fbf6">
        <circle cx="258" cy="104" r="1.6" />
        <circle cx="252" cy="99" r="1.2" />
        <circle cx="296" cy="100" r="1.4" />
      </g>

      {/* the paper boat with its sail of cards, bobbing */}
      <ellipse cx="162" cy="134" rx="82" ry="7" fill="#0b3a4a" opacity="0.45" />
      <circle cx="160" cy="80" r="70" fill={id.url('fanGlow')} />
      <g className="cc-anim-bob" style={{ animationDuration: '4.6s' }}>
        <FanCard x={124} y={118} rot={-17} family="shell" color="#f4d268" ids={id} />
        <FanCard x={196} y={118} rot={17} family="crab" color="#f0a4b3" ids={id} />
        <FanCard x={160} y={112} rot={0} family="mermaid" color="#f9f6ed" ids={id} star />
        {/* hull: two end folds and the front face */}
        <polygon points="76,102 244,102 214,136 106,136" fill="#ef8a63" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <polygon points="76,102 120,102 106,136" fill="#cc5a35" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <polygon points="244,102 200,102 214,136" fill="#cc5a35" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <polyline points="122,106 160,128 198,106" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" strokeLinecap="round" />
        <polyline points="84,104 230,104" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
      </g>

      {/* near swell, drifting in front of the hull */}
      <g className="cc-anim-drift" style={{ animationDuration: '11s' }}>
        <path d="M-40 128 Q-20 120 0 128 T40 128 T80 128 T120 128 T160 128 T200 128 T240 128 T280 128 T320 128 T360 128 V180 H-40 Z" fill={id.url('nearSea')} />
        <path d="M-40 128 Q-20 120 0 128 T40 128 T80 128 T120 128 T160 128 T200 128 T240 128 T280 128 T320 128 T360 128" fill="none" stroke="#f4fffb" strokeWidth="2" strokeLinecap="round" strokeDasharray="30 8 6 8" opacity="0.85" />
      </g>

      {/* a scallop and a starfish on the near water's edge */}
      <g filter={id.url('soft')}>
        <g transform="translate(18 134) scale(0.3)"><CardArt family="shell" bodyColor="#f4d268" /></g>
        <g transform="translate(276 136) rotate(14) scale(0.3)"><CardArt family="starfish" bodyColor="#e8a04a" /></g>
      </g>

      <rect width="320" height="180" fill={id.url('vig')} pointerEvents="none" />
    </svg>
  );
}

type Ids = ReturnType<typeof useSvgIds>;

/** One card of the fan, bottom-centre at (x, y), drawn as the in-game face:
 *  family-colour body, ink edge, art on a pale plate, a points ribbon. */
function FanCard({ x, y, rot, family, color, ids, star }: {
  x: number; y: number; rot: number; family: SspCardFamily; color: string; ids: Ids; star?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-26} y={-78} width={56} height={82} rx={5} fill="rgba(6,30,40,0.3)" />
      <rect x={-28} y={-82} width={56} height={82} rx={5} fill={color} stroke={INK} strokeWidth={1.6} />
      <rect x={-23} y={-70} width={46} height={56} rx={4} fill="rgba(255,255,255,0.78)" />
      <g transform="translate(-21 -69) scale(0.42)">
        <CardArt family={family} bodyColor={color} />
      </g>
      <rect x={-23} y={-11} width={46} height={7} rx={1.5} fill="rgba(255,255,255,0.85)" />
      <rect x={-9} y={-79} width={18} height={6} rx={2} fill="rgba(0,0,0,0.65)" />
      {star ? <Star /> : <rect x={-5} y={-77} width={10} height={2} rx={1} fill="#fff" />}
      <rect x={-28} y={-82} width={56} height={82} rx={5} fill={ids.url('sheen')} />
    </g>
  );
}

function Star(): ReactNode {
  return <polygon points="0,-78.6 0.9,-76.6 3,-76.4 1.4,-75 1.9,-73 0,-74 -1.9,-73 -1.4,-75 -3,-76.4 -0.9,-76.6" fill="#ffe08a" />;
}

/** A flat paper-cut cloud: a light top and a shaded fold underneath. */
function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 14 Q2 4 12 6 Q16 -4 28 0 Q36 -6 44 2 Q56 0 56 12 Q60 14 58 18 H2 Q-2 18 0 14 Z" fill="#fdfaf0" />
      <path d="M2 18 H58 Q57 21 52 21 H6 Q2 21 2 18 Z" fill="#d7ede8" />
    </g>
  );
}
