// FLIP animation harness for 7 Wonders Duel.
//
// Cards, wonders and Progress tokens register their DOM node under a key
// ('c205' for card 205, 'w:pyramids', 'p:law') and the zone they sit in
// (`useFlip(key, zone)`): the pyramid, a city, the discard pile, under a
// wonder, the wonder draft, a player's wonder row, the token offer, a
// player's tokens. On every commit the provider compares each item with the
// previous commit:
//
//   - same zone as before → no animation (hover, selection and reflow inside
//     a zone never make anything fly);
//   - shown before, in another zone → it flies from where it was, scaling
//     from its old size (a pyramid card shrinks into a city band, a drafted
//     wonder flies down to its owner's row);
//   - not shown before → nothing (a new age's pyramid is just dealt).
//
// Items that land in one zone together are staggered in registration order.
// "Where it was" is read in getSnapshotBeforeUpdate, before React touches the
// DOM, so it covers items about to unmount and items still in flight. Flights
// use the Web Animations API, so CSS transforms (hover lifts) are left alone.
// A `scene` change (the hot-seat point of view swapping sides) animates nothing.

import { Component, createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';

export type FlipPace = 'normal' | 'slow';

const PACES: Record<FlipPace, { duration: number; stagger: number; maxStagger: number }> = {
  normal: { duration: 460, stagger: 80, maxStagger: 400 },
  slow: { duration: 760, stagger: 120, maxStagger: 600 },
};
const EASING = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

interface Registry {
  nodes: Map<string, HTMLElement>;
  zones: Map<string, string>;
}

const Ctx = createContext<Registry | null>(null);

interface ProviderProps {
  /** Changes when the view is swapped out wholesale: that commit animates nothing. */
  scene: string;
  /** Speed of the flights this commit starts (default 'normal'). */
  pace?: FlipPace;
  children: ReactNode;
}

export class DuelFlipProvider extends Component<ProviderProps> {
  private readonly registry: Registry = { nodes: new Map(), zones: new Map() };
  private lastZones = new Map<string, string>();
  private readonly flights = new WeakMap<HTMLElement, Animation>();

  override componentDidMount(): void {
    this.lastZones = new Map(this.registry.zones);
  }

  override getSnapshotBeforeUpdate(): Map<string, DOMRect> {
    const rects = new Map<string, DOMRect>();
    for (const [key, node] of this.registry.nodes) rects.set(key, node.getBoundingClientRect());
    return rects;
  }

  override componentDidUpdate(prev: ProviderProps, _state: unknown, before: Map<string, DOMRect>): void {
    if (prev.scene === this.props.scene && motionAllowed()) {
      const pace = PACES[this.props.pace ?? 'normal'];
      const landed = new Map<string, number>();
      for (const [key, node] of this.registry.nodes) {
        const zone = this.registry.zones.get(key);
        const was = this.lastZones.get(key);
        if (zone === undefined || was === undefined || zone === was) continue;
        const from = before.get(key);
        if (!from) continue;
        const k = landed.get(zone) ?? 0;
        landed.set(zone, k + 1);
        this.fly(node, from, pace.duration, Math.min(pace.maxStagger, k * pace.stagger));
      }
    }
    this.lastZones = new Map(this.registry.zones);
  }

  private fly(node: HTMLElement, from: DOMRect, duration: number, delay: number): void {
    this.flights.get(node)?.cancel();
    const to = node.getBoundingClientRect();
    if (to.width === 0 || to.height === 0 || from.width === 0) return;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) return;
    const frames: Keyframe[] = [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: '0 0', zIndex: 50, position: 'relative' },
      { transform: 'none', transformOrigin: '0 0', zIndex: 50, position: 'relative' },
    ];
    this.flights.set(node, node.animate(frames, { duration, delay, easing: EASING, fill: 'backwards' }));
  }

  override render(): ReactNode {
    return <Ctx.Provider value={this.registry}>{this.props.children}</Ctx.Provider>;
  }
}

/** False under reduced motion and where the Web Animations API is missing (jsdom). */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return false;
  return !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** Ref callback registering an item's node and zone. The latest registration
 *  of a key wins, and a cleanup only removes its own node. */
export function useFlip(key: string | undefined, zone: string): (node: HTMLElement | null) => (() => void) | void {
  const reg = useContext(Ctx);
  return (node) => {
    if (!reg || key == null || !node) return;
    reg.nodes.set(key, node);
    reg.zones.set(key, zone);
    return () => {
      if (reg.nodes.get(key) !== node) return;
      reg.nodes.delete(key);
      reg.zones.delete(key);
    };
  };
}

/** Plays `frames` on the ref'd node whenever `value` changes to one `when`
 *  accepts (never on mount): a card turning face up, a wonder being built. */
export function useAnimateOn<T>(ref: RefObject<HTMLElement | null>, value: T, when: (now: T, was: T) => boolean, frames: Keyframe[], duration: number, delay = 0): void {
  const last = useRef(value);
  useEffect(() => {
    const was = last.current;
    last.current = value;
    const node = ref.current;
    if (!node || Object.is(was, value) || !when(value, was) || !motionAllowed()) return;
    node.animate(frames, { duration, delay, easing: EASING, fill: 'backwards' });
    // `frames`, `when` and `delay` are constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

export const cardKey = (id: number) => `c${id}`;
export const wonderKey = (id: string) => `w:${id}`;
export const tokenKey = (id: string) => `p:${id}`;
