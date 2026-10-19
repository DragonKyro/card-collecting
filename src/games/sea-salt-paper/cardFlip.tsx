// FLIP animation harness for Sea Salt & Paper cards.
//
// Every card on screen registers its DOM node and the zone it sits in
// (`useFlipCard(card.id, zone)`); the deck and each discard pile register a
// card-sized anchor (`useFlipAnchor`). On every commit the provider compares
// each card with the previous commit:
//
//   - same zone as before → no animation, so reflows inside a zone, hover and
//     clicking a selectable card never make cards fly;
//   - shown before, in another zone → slide from where it was on screen;
//   - not shown before → slide from the anchor of where the game state kept
//     it (`origins`): the deck — which also covers an opponent's unseen
//     two-card draw and a lobster reveal — or the pile it was buried in. A
//     card just uncovered where it already was (the next card of a pile, a
//     crab look through that pile) doesn't move.
//
// "Where it was" is read in getSnapshotBeforeUpdate, before React touches the
// DOM, so it includes cards about to unmount and cards still mid-flight; an
// interrupted flight carries on from wherever the card is. Every card is the
// same size, so a move is a pure translation of the top-left corner. Flights
// use the Web Animations API, which starts reliably on the next frame and
// leaves the cards' own CSS transforms (hover, selected) alone.

import { Component, createContext, useContext, type ReactNode } from 'react';

const DURATION_MS = 360;
const EASING = 'cubic-bezier(0.2, 0.7, 0.3, 1)';

interface Registry {
  nodes: Map<number, HTMLElement>;
  zones: Map<number, string>;
  anchors: Map<string, HTMLElement>;
}

interface Snapshot {
  cards: Map<number, DOMRect>;
  anchors: Map<string, DOMRect>;
}

const Ctx = createContext<Registry | null>(null);

interface ProviderProps {
  /** Card id → anchor name (`'deck'`, `'pile-0'`, `'pile-1'`) for every card
   *  the game state holds somewhere off screen. */
  origins: ReadonlyMap<number, string>;
  /** Changes when the view is swapped out wholesale (new round, round
   *  summary, game over): that commit animates nothing. */
  scene: string;
  children: ReactNode;
}

export class SspFlipProvider extends Component<ProviderProps> {
  private readonly registry: Registry = { nodes: new Map(), zones: new Map(), anchors: new Map() };
  /** Zones and origins as of the previous commit. */
  private lastZones = new Map<number, string>();
  private lastOrigins: ReadonlyMap<number, string> = new Map();
  private readonly flights = new WeakMap<HTMLElement, Animation>();

  override componentDidMount(): void {
    this.remember();
  }

  override getSnapshotBeforeUpdate(): Snapshot {
    const cards = new Map<number, DOMRect>();
    for (const [id, node] of this.registry.nodes) cards.set(id, node.getBoundingClientRect());
    const anchors = new Map<string, DOMRect>();
    for (const [name, node] of this.registry.anchors) anchors.set(name, node.getBoundingClientRect());
    return { cards, anchors };
  }

  override componentDidUpdate(prev: ProviderProps, _state: unknown, before: Snapshot): void {
    if (prev.scene === this.props.scene && !prefersReducedMotion()) {
      const moves: Array<{ node: HTMLElement; from: DOMRect }> = [];
      for (const [id, node] of this.registry.nodes) {
        const zone = this.registry.zones.get(id);
        const was = this.lastZones.get(id);
        if (zone === undefined || zone === was) continue;
        let from: DOMRect | undefined;
        if (was !== undefined) {
          from = before.cards.get(id);
        } else {
          const origin = this.lastOrigins.get(id);
          if (origin !== undefined && origin !== zone) {
            from = before.anchors.get(origin) ?? this.registry.anchors.get(origin)?.getBoundingClientRect();
          }
        }
        if (from) moves.push({ node, from });
      }
      for (const { node, from } of moves) this.fly(node, from);
    }
    this.remember();
  }

  private fly(node: HTMLElement, from: DOMRect): void {
    this.flights.get(node)?.cancel();
    const to = node.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    // Opacity is pinned so a freshly mounted card doesn't run its fade-in mid-air.
    this.flights.set(node, node.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 1 }, { transform: 'none', opacity: 1 }],
      { duration: DURATION_MS, easing: EASING },
    ));
  }

  private remember(): void {
    this.lastZones = new Map(this.registry.zones);
    this.lastOrigins = this.props.origins;
  }

  override render(): ReactNode {
    return <Ctx.Provider value={this.registry}>{this.props.children}</Ctx.Provider>;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ref callback registering a card's DOM node and the zone it lives in. The
 *  same id can briefly be on screen twice (a pile's top card is also shown in
 *  the crab look-through); the latest registration wins, and a cleanup only
 *  removes its own node. */
export function useFlipCard(cardId: number | undefined, zone: string): (node: HTMLElement | null) => (() => void) | void {
  const reg = useContext(Ctx);
  return (node) => {
    if (!reg || cardId == null || !node) return;
    reg.nodes.set(cardId, node);
    reg.zones.set(cardId, zone);
    return () => {
      if (reg.nodes.get(cardId) !== node) return;
      reg.nodes.delete(cardId);
      reg.zones.delete(cardId);
    };
  };
}

/** Ref callback for a named, card-sized anchor (`'deck'`, `'pile-0'`, …):
 *  cards appearing from that part of the game state fly in from it. */
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
