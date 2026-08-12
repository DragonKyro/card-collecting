// Card art — hand-authored SVG, drawn for this project.
//
// Four symbol outlines (squiggle, oval, diamond, hourglass — the fourth exists
// for 4Set's fourth shape variant), four fills (solid, outline, striped,
// checkered) and four inks. Shapes live in a single hidden <defs> block that
// <SetArtDefs /> mounts once; every card then draws <use href="#set-shape-n" />,
// so a 21-card Memory board is 21 references to four paths rather than 21 copies.
//
// Fills are done with masks rather than pattern fills so the ink colour stays a
// plain `fill` — masks are colour-agnostic, which keeps striped and checkered
// symbols exactly the same hue as solid ones.

/** Ink per colour variant. Tuned to read against the light card face. */
export const SET_INKS = ['#8a4fd6', '#17a05e', '#d63b48', '#e07b1f'] as const;

/** Shading variants: 0 solid, 1 outline, 2 striped, 3 checkered. */
const SHADE_MASK = [null, null, 'url(#set-mask-stripes)', 'url(#set-mask-checkers)'] as const;

/** Border variants (MegaSet's fifth feature). */
export const SET_BORDER_STYLES = ['solid', 'dashed', 'double'] as const;

const SHAPE_COUNT = 4;

export function SetArtDefs() {
  return (
    <svg className="set-art-defs" aria-hidden="true" focusable="false">
      <defs>
        {/* 0 — squiggle: a band of constant width snaking down the card. Both
            edges shift together, which is what makes it read as an S rather
            than an hourglass. */}
        <path
          id="set-shape-0"
          d="M25,32 C52,10 90,8 116,30
             C148,56 182,96 180,142 C178,192 110,214 110,268
             C110,310 146,340 174,368
             C150,390 108,392 84,370
             C56,344 20,310 20,266 C20,214 90,192 90,142
             C90,96 54,58 25,32 Z"
        />
        {/* 1 — oval: a capsule. */}
        <path
          id="set-shape-1"
          d="M100,14 C147,14 186,53 186,100 L186,300
             C186,347 147,386 100,386 C53,386 14,347 14,300 L14,100
             C14,53 53,14 100,14 Z"
        />
        {/* 2 — diamond. */}
        <path id="set-shape-2" d="M100,12 L188,200 L100,388 L12,200 Z" />
        {/* 3 — hourglass (4Set only). */}
        <path
          id="set-shape-3"
          d="M22,16 L178,16 C178,90 130,160 112,200 C130,240 178,310 178,384
             L22,384 C22,310 70,240 88,200 C70,160 22,90 22,16 Z"
        />

        {/* Stripes: vertical bars along the symbol's long axis. */}
        <pattern id="set-pattern-stripes" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="#000" />
          <rect width="15" height="34" fill="#fff" />
        </pattern>
        {/* Checkers: a two-tone grid. */}
        <pattern id="set-pattern-checkers" width="48" height="48" patternUnits="userSpaceOnUse">
          <rect width="48" height="48" fill="#000" />
          <rect width="24" height="24" fill="#fff" />
          <rect x="24" y="24" width="24" height="24" fill="#fff" />
        </pattern>
        <mask id="set-mask-stripes" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="400">
          <rect width="200" height="400" fill="url(#set-pattern-stripes)" />
        </mask>
        <mask id="set-mask-checkers" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="400">
          <rect width="200" height="400" fill="url(#set-pattern-checkers)" />
        </mask>
      </defs>
    </svg>
  );
}

/** One symbol. `shape`, `shade` and `color` are variant indices. */
export function SetSymbol({
  shape, shade, color,
}: { shape: number; shade: number; color: number }) {
  const href = `#set-shape-${shape % SHAPE_COUNT}`;
  const ink = SET_INKS[color % SET_INKS.length];
  const mask = SHADE_MASK[shade % SHADE_MASK.length];
  return (
    <svg className="set-symbol" viewBox="0 0 200 400" aria-hidden="true" focusable="false">
      {shade !== 1 && (
        <use href={href} fill={ink} {...(mask ? { mask } : {})} />
      )}
      <use href={href} fill="none" stroke={ink} strokeWidth={17} strokeLinejoin="round" />
    </svg>
  );
}

export const SHAPE_NAMES = ['squiggle', 'oval', 'diamond', 'hourglass'] as const;
export const SHADE_NAMES = ['solid', 'outline', 'striped', 'checkered'] as const;
export const COLOR_NAMES = ['purple', 'green', 'red', 'orange'] as const;
export const BORDER_NAMES = ['single', 'dashed', 'double'] as const;
