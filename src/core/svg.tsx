// SVG helpers for art that needs gradients or filters (the picker's hero
// scenes, lobby banners). Game-agnostic.
//
// Ids inside inline SVG are document-global: two scenes that both declare
// `<linearGradient id="bg">` silently share (or clobber) each other's
// gradients — and the picker tile and the lobby banner can show the same
// scene twice. Derive every id from `useSvgIds`. (Card art drawn many times
// over stays flat, with no <defs> at all.)

import { useId } from 'react';

export type SvgIds = ((name: string) => string) & { url: (name: string) => string };

/**
 * Document-unique ids for one SVG's defs: `const id = useSvgIds();` then
 * `id('glow')` → `"cc-r12-glow"` and `id.url('glow')` → `"url(#cc-r12-glow)"`.
 */
export function useSvgIds(): SvgIds {
  const base = `cc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fn = ((name: string) => `${base}-${name}`) as SvgIds;
  fn.url = (name: string) => `url(#${base}-${name})`;
  return fn;
}

/** Soft drop shadow filter: `<g filter={id.url('shadow')}>`. */
export function SoftShadow({ id, dy = 2, blur = 2.5, opacity = 0.55 }: { id: string; dy?: number; blur?: number; opacity?: number }) {
  return (
    <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} />
      <feOffset dy={dy} result="o" />
      <feComponentTransfer>
        <feFuncA type="linear" slope={opacity} />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Outer glow in a colour (lanterns, sun, magic, highlights). */
export function Glow({ id, color, blur = 4, strength = 1 }: { id: string; color: string; blur?: number; strength?: number }) {
  return (
    <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="b" />
      <feFlood floodColor={color} floodOpacity={strength} />
      <feComposite in2="b" operator="in" result="g" />
      <feMerge>
        <feMergeNode in="g" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

/** Radial vignette gradient; overlay it as `<rect … fill={id.url('vig')} />`. */
export function Vignette({ id, color = '#000', inner = 0.55, opacity = 0.7 }: { id: string; color?: string; inner?: number; opacity?: number }) {
  return (
    <radialGradient id={id} cx="50%" cy="45%" r="75%">
      <stop offset={`${inner * 100}%`} stopColor={color} stopOpacity={0} />
      <stop offset="100%" stopColor={color} stopOpacity={opacity} />
    </radialGradient>
  );
}

/** Radial light pool (sun, lamp, spotlight): bright centre fading to nothing. */
export function LightPool({ id, color, opacity = 0.6 }: { id: string; color: string; opacity?: number }) {
  return (
    <radialGradient id={id} cx="50%" cy="50%" r="50%">
      <stop offset="0%" stopColor={color} stopOpacity={opacity} />
      <stop offset="45%" stopColor={color} stopOpacity={opacity * 0.3} />
      <stop offset="100%" stopColor={color} stopOpacity={0} />
    </radialGradient>
  );
}

/**
 * Paper / card-stock grain composited over the source, so flat fills read as
 * printed stock. `amount` 0..1.
 */
export function PaperGrain({ id, amount = 0.18, freq = 0.85, seed = 3 }: { id: string; amount?: number; freq?: number; seed?: number }) {
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={3} seed={seed} result="noise" />
      <feColorMatrix
        in="noise"
        type="matrix"
        values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${amount} 0`}
        result="grain"
      />
      <feComposite in="grain" in2="SourceGraphic" operator="in" result="g2" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="g2" />
      </feMerge>
    </filter>
  );
}
