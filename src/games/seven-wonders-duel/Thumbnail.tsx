// 7 Wonders Duel — picker thumbnail (SVG).

export function SevenWondersDuelThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet">
      {/* Background */}
      <defs>
        <linearGradient id="duelBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4a3a2e" />
          <stop offset="100%" stopColor="#1c1410" />
        </linearGradient>
      </defs>
      <rect width="280" height="140" fill="url(#duelBg)" />
      {/* Stylized pyramid of cards */}
      {/* Row 1: 2 cards */}
      <rect x="118" y="22" width="20" height="28" rx="3" fill="#3d6da0" stroke="#1b2a3d" />
      <rect x="142" y="22" width="20" height="28" rx="3" fill="#b73c3c" stroke="#1b2a3d" />
      {/* Row 2: 3 cards (face-down) */}
      <rect x="104" y="54" width="20" height="28" rx="3" fill="#2a3245" stroke="#1b2a3d" />
      <rect x="128" y="54" width="20" height="28" rx="3" fill="#2a3245" stroke="#1b2a3d" />
      <rect x="152" y="54" width="20" height="28" rx="3" fill="#2a3245" stroke="#1b2a3d" />
      {/* Row 3: 4 cards */}
      <rect x="90" y="86" width="20" height="28" rx="3" fill="#8b5e2a" stroke="#1b2a3d" />
      <rect x="114" y="86" width="20" height="28" rx="3" fill="#5fa552" stroke="#1b2a3d" />
      <rect x="138" y="86" width="20" height="28" rx="3" fill="#e7b13e" stroke="#1b2a3d" />
      <rect x="162" y="86" width="20" height="28" rx="3" fill="#8d6cc0" stroke="#1b2a3d" />
      {/* Military pawn on a horizontal track */}
      <rect x="50" y="125" width="180" height="6" rx="2" fill="#382318" />
      <circle cx="140" cy="128" r="5" fill="#e0c98a" stroke="#4a3a2e" />
      {/* Title */}
      <text x="140" y="18" fontFamily="Georgia, serif" fontSize="13" fill="#e0c98a" textAnchor="middle">
        7 Wonders Duel
      </text>
    </svg>
  );
}
