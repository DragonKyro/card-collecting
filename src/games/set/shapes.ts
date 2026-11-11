// Symbol outlines, in a 200 × 400 box. Shared by the card art (art.tsx, one
// hidden <defs> block) and the picker thumbnail, which ships in the main bundle
// and so must not pull in the card components.

/** 0 squiggle, 1 oval, 2 diamond, 3 hourglass (4Set only). */
export const SHAPE_PATHS = [
  // Squiggle: a band of constant width snaking down the card. Both edges shift
  // together, which is what makes it read as an S rather than an hourglass.
  'M25,32 C52,10 90,8 116,30 C148,56 182,96 180,142 C178,192 110,214 110,268 '
    + 'C110,310 146,340 174,368 C150,390 108,392 84,370 C56,344 20,310 20,266 '
    + 'C20,214 90,192 90,142 C90,96 54,58 25,32 Z',
  // Oval: a capsule.
  'M100,14 C147,14 186,53 186,100 L186,300 C186,347 147,386 100,386 '
    + 'C53,386 14,347 14,300 L14,100 C14,53 53,14 100,14 Z',
  // Diamond.
  'M100,12 L188,200 L100,388 L12,200 Z',
  // Hourglass.
  'M22,16 L178,16 C178,90 130,160 112,200 C130,240 178,310 178,384 '
    + 'L22,384 C22,310 70,240 88,200 C70,160 22,90 22,16 Z',
] as const;

/** Stroke width of a symbol's outline, in the same 200 × 400 units. */
export const SHAPE_STROKE = 17;
