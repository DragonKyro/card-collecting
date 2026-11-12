// FLIP animation harness for Jaipur's cards and tokens.
//
// Every card and token on screen registers its DOM node under a key ('c12'
// for card 12, 't5' for goods token 5, 'b103' for bonus token 103) and the
// zone it sits in (`useFlip(key, zone)`); the deck registers a card-sized
// anchor (`useFlipAnchor('deck')`). On every commit the provider compares
// each item with the previous commit:
//
//   - same zone as before → no animation, so reflows inside a zone, hover
//     and selection lifts never make anything fly;
//   - shown before, in another zone → it flies from where it was, scaling
//     from its old size (a small face-down card in the opponent's hand grows
//     into a market card);
//   - not shown before → it flies from the anchor the game state kept it
//     behind (`origins`: deck cards) and turns face up on the way.
//
// Items that land together are staggered (in the order they registered) so a
// sale's tokens peel off the pile one by one instead of moving as a block.
// `pace` sets the speed: 'slow' for a move a human should follow (the AI's,
// with a human watching), 'normal' otherwise.
//
// "Where it was" is read in getSnapshotBeforeUpdate, before React touches the
// DOM, so it covers items about to unmount and items still mid-flight: an
// interrupted flight carries on from wherever it is. Flights use the Web
// Animations API, which leaves the items' own CSS transforms (hover,
// selected) alone. A `scene` change (new round, a hot-seat hand-over flipping
// the point of view, summary) animates nothing.
//
// A token landing in a player's pile (zone `tokens-…`) clinks: once its
// flight finishes, its artwork (the node's child, never the flown node
// itself) bounces and flashes.

import { Component, createContext, useContext, type ReactNode } from 'react';

export type FlipPace = 'normal' | 'slow';

const PACES: Record<FlipPace, { duration: number; stagger: number; maxStagger: number }> = {
  normal: { duration: 420, stagger: 70, maxStagger: 420 },
  slow: { duration: 760, stagger: 130, maxStagger: 650 },
};
const EASING = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

interface Registry {
  nodes: Map<string, HTMLElement>;
  zones: Map<string, string>;
  anchors: Map<string, HTMLElement>;
}

interface Snapshot {
  items: Map<string, DOMRect>;
  anchors: Map<string, DOMRect>;
}

const Ctx = createContext<Registry | null>(null);

interface ProviderProps {
  /** Item key → anchor name for everything the game state holds off screen
   *  (deck cards → 'deck'). */
  origins: ReadonlyMap<string, string>;
  /** Changes when the view is swapped out wholesale: that commit animates nothing. */
  scene: string;
  /** Speed of the flights this commit starts (default 'normal'). */
  pace?: FlipPace;
  children: ReactNode;
}

export class JaipurFlipProvider extends Component<ProviderProps> {
  private readonly registry: Registry = { nodes: new Map(), zones: new Map(), anchors: new Map() };
  private lastZones = new Map<string, string>();
  private lastOrigins: ReadonlyMap<string, string> = new Map();
  private readonly flights = new WeakMap<HTMLElement, Animation>();

  override componentDidMount(): void {
    this.remember();
  }

  override getSnapshotBeforeUpdate(): Snapshot {
    const items = new Map<string, DOMRect>();
    for (const [key, node] of this.registry.nodes) items.set(key, node.getBoundingClientRect());
    const anchors = new Map<string, DOMRect>();
    for (const [name, node] of this.registry.anchors) anchors.set(name, node.getBoundingClientRect());
    return { items, anchors };
  }

  override componentDidUpdate(prev: ProviderProps, _state: unknown, before: Snapshot): void {
    if (prev.scene === this.props.scene && !prefersReducedMotion()) {
      const moves: Array<{ node: HTMLElement; from: DOMRect; reveal: boolean; zone: string }> = [];
      for (const [key, node] of this.registry.nodes) {
        const zone = this.registry.zones.get(key);
        const was = this.lastZones.get(key);
        if (zone === undefined || zone === was) continue;
        if (was !== undefined) {
          const from = before.items.get(key);
          if (from) moves.push({ node, from, reveal: false, zone });
          continue;
        }
        const origin = this.lastOrigins.get(key);
        if (origin === undefined || origin === zone) continue;
        const from = before.anchors.get(origin) ?? this.registry.anchors.get(origin)?.getBoundingClientRect();
        if (from) moves.push({ node, from, reveal: true, zone });
      }
      const pace = PACES[this.props.pace ?? 'normal'];
      const landed = new Map<string, number>();
      for (const m of moves) {
        const k = landed.get(m.zone) ?? 0;
        landed.set(m.zone, k + 1);
        const flight = this.fly(m.node, m.from, m.reveal, pace.duration, Math.min(pace.maxStagger, k * pace.stagger));
        if (flight && m.zone.startsWith('tokens-')) clinkOnLanding(m.node, flight);
      }
    }
    this.remember();
  }

  private fly(node: HTMLElement, from: DOMRect, reveal: boolean, duration: number, delay: number): Animation | null {
    this.flights.get(node)?.cancel();
    const to = node.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return null;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) return null;
    const start = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    // A card coming off the deck turns over mid-flight (squeezes to an edge
    // and opens up face-up); opacity is pinned so mount fades don't run mid-air.
    const o = '0 0';
    const frames: Keyframe[] = reveal
      ? [
        { transform: `${start} scaleX(0.05)`, transformOrigin: o, opacity: 1 },
        {
          transform: `translate(${dx * 0.45}px, ${dy * 0.45}px) scale(${(sx + 1) / 2}, ${(sy + 1) / 2}) scaleX(0.05)`,
          transformOrigin: o, opacity: 1, offset: 0.35,
        },
        { transform: 'none', transformOrigin: o, opacity: 1 },
      ]
      : [{ transform: start, transformOrigin: o, opacity: 1 }, { transform: 'none', transformOrigin: o, opacity: 1 }];
    const flight = node.animate(frames, { duration, delay, easing: EASING, fill: 'backwards' });
    this.flights.set(node, flight);
    return flight;
  }

  private remember(): void {
    this.lastZones = new Map(this.registry.zones);
    this.lastOrigins = this.props.origins;
  }

  override render(): ReactNode {
    return <Ctx.Provider value={this.registry}>{this.props.children}</Ctx.Provider>;
  }
}

/** A coin-like bounce on a landed token's artwork. Interrupted flights don't clink. */
function clinkOnLanding(node: HTMLElement, flight: Animation): void {
  const art = node.firstElementChild;
  if (!flight.finished || !art || typeof art.animate !== 'function') return;
  flight.finished.then(() => {
    art.animate(
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.32) rotate(-8deg)', filter: 'brightness(1.45)', offset: 0.35 },
        { transform: 'scale(0.94) rotate(3deg)', filter: 'brightness(1.1)', offset: 0.7 },
        { transform: 'none', filter: 'brightness(1)' },
      ],
      { duration: 340, easing: 'ease-out' },
    );
  }, () => {});
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

/** Ref callback for a named anchor (`'deck'`): items appearing from that part
 *  of the game state fly in from it. */
export function useFlipAnchor(name: string): (node: HTMLElement | null) => (() => void) | void {
  const reg = useContext(Ctx);
  return (node) => {
    if (!reg || !node) return;
    reg.anchors.set(name, node);
    return () => {
      if (reg.anchors.get(name) === node) reg.anchors.delete(name);
    };
  };
}

export const cardKey = (id: number) => `c${id}`;
export const tokenKey = (id: number) => `t${id}`;
export const bonusKey = (id: number) => `b${id}`;
