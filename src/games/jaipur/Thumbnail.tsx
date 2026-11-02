// Game-picker thumbnail for Jaipur — a fan of market cards (diamond, camel,
// cloth) in front of a pink-city arch at dusk, with a few rupee tokens.

import { BonusTokenArt, CardFaceArt, GoodsTokenArt } from './art';

export function JaipurThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Jaipur">
      <defs>
        <linearGradient id="jaipur-thumb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6b26b" />
          <stop offset="100%" stopColor="#c8506a" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="140" rx="10" fill="url(#jaipur-thumb-sky)" />
      {/* Hawa Mahal-style facade */}
      <path d="M20 140 L20 70 Q20 50 40 44 Q52 40 58 30 Q64 40 76 44 Q96 50 96 70 L96 140 Z" fill="#e88d84" opacity={0.55} />
      <path d="M184 140 L184 70 Q184 50 204 44 Q216 40 222 30 Q228 40 240 44 Q260 50 260 70 L260 140 Z" fill="#e88d84" opacity={0.55} />
      {[34, 50, 66, 82, 198, 214, 230, 246].map((x) => (
        <path key={x} d={`M${x - 5} 120 L${x - 5} 92 Q${x} 84 ${x + 5} 92 L${x + 5} 120 Z`} fill="#b84a5c" opacity={0.6} />
      ))}
      <ellipse cx="140" cy="132" rx="118" ry="7" fill="rgba(0,0,0,0.22)" />

      <g transform="translate(70 26) rotate(-14) scale(0.72)"><CardFaceArt type="diamond" /></g>
      <g transform="translate(176 16) rotate(14) scale(0.72)"><CardFaceArt type="cloth" /></g>
      <g transform="translate(104 14) scale(0.76)"><CardFaceArt type="camel" /></g>

      <g transform="translate(26 96) scale(0.8)"><GoodsTokenArt good="diamond" value={7} /></g>
      <g transform="translate(48 104) scale(0.7)"><GoodsTokenArt good="gold" value={6} /></g>
      <g transform="translate(222 98) scale(0.8)"><BonusTokenArt size={5} /></g>
      <g transform="translate(244 108) scale(0.65)"><GoodsTokenArt good="spice" value={5} /></g>
    </svg>
  );
}
