// FLIP animation harness for Sea Salt & Paper cards.
//
// We animate a card ONLY when its containing zone changes (e.g. moved from the
// deck slot to your hand, from your hand to a pile). Every CardView declares
// the zone it belongs to via the `zone` prop; the harness compares to the
// previous render's zone for each card.id and, if different, slides the new
// position back to the card's ACTUAL prior rect (or, for fresh cards with no
// prior rect, the deck anchor's last rect).
//
// This deliberately ignores positional reflows inside the same zone (drag,
// hover, sibling insertion), so clicking a card does NOT make the whole
// hand re-fly.

import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

interface FlipState {
  /** Currently-mounted card DOM nodes, keyed by card.id. */
  liveNodes: Map<number, HTMLElement>;
  /** Zone label for each currently-mounted card. */
  liveZones: Map<number, string>;
  /** Anchor DOM nodes (one per zone label, latest registration wins). */
  liveAnchors: Map<string, HTMLElement>;
  /** Last-commit zone label per card.id (read by the next useLayoutEffect). */
  lastZone: Map<number, string>;
  /** Last-commit bounding rect per card.id — the source position when a card
   *  moves to a new zone. Persists across the unmount-then-remount that
   *  happens when a card visually "moves" (some card holders only render the
   *  top of a stack; the rect from before the move is still our best source). */
  lastCardRect: Map<number, DOMRect>;
  /** Last-commit anchor rect per zone label — fallback for cards with no
   *  prior recorded rect (typically fresh deals). */
  lastAnchorRect: Map<string, DOMRect>;
}

const Ctx = createContext<FlipState | null>(null);

const TRANSITION = 'transform 320ms cubic-bezier(0.2, 0.7, 0.3, 1)';

export function SspFlipProvider({ children }: { children: ReactNode }) {
  const state = useRef<FlipState>({
    liveNodes: new Map(),
    liveZones: new Map(),
    liveAnchors: new Map(),
    lastZone: new Map(),
    lastCardRect: new Map(),
    lastAnchorRect: new Map(),
  }).current;

  useLayoutEffect(() => {
    // Snapshot every anchor's current rect — used as a fallback source for
    // cards with no recorded prior rect.
    const anchorRects = new Map<string, DOMRect>();
    for (const [name, node] of state.liveAnchors) {
      anchorRects.set(name, node.getBoundingClientRect());
    }

    const offsets: Array<{ node: HTMLElement; dx: number; dy: number }> = [];
    const nextCardRects = new Map<number, DOMRect>();

    for (const [id, node] of state.liveNodes) {
      const nowZone = state.liveZones.get(id);
      if (!nowZone) continue;
      const next = node.getBoundingClientRect();
      nextCardRects.set(id, next);

      const prevZone = state.lastZone.get(id);
      if (prevZone === nowZone) continue; // no movement between zones

      // Pick the source rect, in priority order:
      //   1. The card's own last-known rect (best fidelity — accounts for
      //      its actual previous location like a specific pile slot).
      //   2. The last rect of the previous zone's anchor (e.g. the pile the
      //      card was sitting on top of).
      //   3. The current rect of the previous zone's anchor (re-entry).
      //   4. The anchor of the CURRENT zone — this is the case for a card
      //      with no recorded history (e.g. the card UNDERNEATH the one just
      //      taken off a pile, which was hidden until the top was removed).
      //      Using its own current zone produces dx=dy=0 → no animation.
      //   5. Last-resort: the deck anchor.
      let source: DOMRect | undefined;
      const ownRect = state.lastCardRect.get(id);
      const lastPrevAnchor = prevZone ? state.lastAnchorRect.get(prevZone) : undefined;
      const curPrevAnchor = prevZone ? anchorRects.get(prevZone) : undefined;
      const curNowAnchor = anchorRects.get(nowZone);
      const deckAnchor = anchorRects.get('deck');
      if (ownRect) source = ownRect;
      else if (lastPrevAnchor) source = lastPrevAnchor;
      else if (curPrevAnchor) source = curPrevAnchor;
      else if (curNowAnchor) source = curNowAnchor;
      else source = deckAnchor;
      if (!source) continue;
      const dx = source.left - next.left;
      const dy = source.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      offsets.push({ node, dx, dy });
    }

    // Update bookkeeping for the next render's comparison. Keep the rects of
    // cards that are still mounted (so a card whose zone DIDN'T change keeps
    // a fresh rect for next time); replace the zone map outright.
    state.lastZone.clear();
    for (const [id, z] of state.liveZones) state.lastZone.set(id, z);
    state.lastCardRect = nextCardRects;
    state.lastAnchorRect = anchorRects;

    if (offsets.length === 0) return;

    for (const { node, dx, dy } of offsets) {
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    requestAnimationFrame(() => {
      for (const { node } of offsets) {
        if (!node.isConnected) continue;
        node.style.transition = TRANSITION;
        node.style.transform = '';
      }
    });
  });

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** Ref callback registering a card's DOM node + the zone it currently lives
 *  in. When the zone string changes between renders for the same card.id, the
 *  harness slides the card from its prior rect to its new home. */
export function useFlipCard(cardId: number | undefined, zone: string): (node: HTMLElement | null) => void {
  const ctx = useContext(Ctx);
  return (node) => {
    if (!ctx || cardId == null) return;
    if (node) {
      ctx.liveNodes.set(cardId, node);
      ctx.liveZones.set(cardId, zone);
    } else {
      ctx.liveNodes.delete(cardId);
      ctx.liveZones.delete(cardId);
    }
  };
}

/** Ref callback for a named zone anchor (e.g. 'deck', 'pile-0'). Cards arriving
 *  in a zone with no prior recorded position slide in from this anchor. */
export function useFlipAnchor(name: string): (node: HTMLElement | null) => void {
  const ctx = useContext(Ctx);
  return (node) => {
    if (!ctx) return;
    if (node) ctx.liveAnchors.set(name, node);
    else ctx.liveAnchors.delete(name);
  };
}
