// Set — picker thumbnail (SVG). Three cards making a set: one of each colour,
// one of each shading, one, two, three symbols.

export function SetThumbnail() {
  return (
    <svg viewBox="0 0 280 140" width="100%" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="setThumbBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2b2340" />
          <stop offset="100%" stopColor="#12161f" />
        </linearGradient>
        <pattern id="setThumbStripes" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#f4f1e8" />
          <rect width="3" height="6" fill="#17a05e" />
        </pattern>
      </defs>
      <rect width="280" height="140" fill="url(#setThumbBg)" />

      {/* One purple diamond, outlined */}
      <g transform="translate(26,44)">
        <rect width="70" height="52" rx="7" fill="#f4f1e8" stroke="#262b36" strokeWidth="2" />
        <path d="M35,12 L48,26 L35,40 L22,26 Z" fill="none" stroke="#8a4fd6" strokeWidth="3" />
      </g>

      {/* Two green ovals, striped */}
      <g transform="translate(105,44)">
        <rect width="70" height="52" rx="7" fill="#f4f1e8" stroke="#262b36" strokeWidth="2" />
        <rect x="19" y="12" width="12" height="28" rx="6" fill="url(#setThumbStripes)" stroke="#17a05e" strokeWidth="2.5" />
        <rect x="39" y="12" width="12" height="28" rx="6" fill="url(#setThumbStripes)" stroke="#17a05e" strokeWidth="2.5" />
      </g>

      {/* Three red squiggles, solid */}
      <g transform="translate(184,44)">
        <rect width="70" height="52" rx="7" fill="#f4f1e8" stroke="#262b36" strokeWidth="2" />
        {[14, 29, 44].map((x) => (
          <path
            key={x}
            d={`M${x},12 c6,-3 12,1 11,6 c-1,5 -6,8 -6,12 c0,4 6,6 4,9 c-2,3 -10,2 -11,-3 c-1,-5 4,-8 4,-12 c0,-4 -6,-7 -2,-12 z`}
            fill="#d63b48"
            stroke="#d63b48"
            strokeWidth="1.5"
          />
        ))}
      </g>

      <text
        x="140" y="24"
        fontFamily="system-ui, sans-serif" fontSize="15" fontWeight="700"
        fill="#e8eaed" textAnchor="middle" letterSpacing="4"
      >
        SET
      </text>
      <text
        x="140" y="120"
        fontFamily="system-ui, sans-serif" fontSize="10"
        fill="#9aa0a6" textAnchor="middle"
      >
        all the same, or all different
      </text>
    </svg>
  );
}
