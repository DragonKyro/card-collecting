// Animation overlay for moves that the FLIP harness (cardFlip.tsx) can't see.
//
// Background: every RENDERED card uses `useFlipCard(card.id, zone)`, so when
// a card's zone changes (pile → hand, hand → table, opponent A's hand →
// opponent B's hand via shark steal), the FLIP harness automatically slides
// it from its prior screen position to its new home. That covers ALMOST every
// move the player ever needs to follow:
//   - drawDiscard / crabPick   → pile-N to hand-X    (FLIP-handled)
//   - keepFromDraw (discard)   → pending-draw to pile (FLIP-handled)
//   - sharkSteal               → hand-A to hand-B    (FLIP-handled)
//   - playPair / playTrio      → hand to table       (FLIP-handled)
//
// What FLIP can't see: cards that come straight off the DECK. The deck doesn't
// render its interior cards, so a fresh-drawn card has no prior DOM position;
// the harness silently mounts it in place rather than inventing a phantom
// "flew from deck" animation.
//
// This overlay fills only that gap: we watch the log for deck-originating
// moves and spawn a transient face-down ghost that flies from the deck anchor
// to the card's destination (opponent's hand row, or a discard pile in the
// case of drawDeck's discarded card).

import { useEffect, useRef, useState } from 'react';
import type { SspState, SspLogEntry } from './types';
import type { PlayerId } from '@/core/types';

interface Ghost {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  visible: boolean;
  startDelay: number;
  /** If true, the ghost rotates 180° during its slide so it visually FLIPS
   *  on landing — simulating a real-life "deal" where the card is face-down
   *  in the dealer's hand and lands face-up on the table. The back face uses
   *  `backface-visibility: hidden`, so once rotated past 90° the ghost
   *  disappears and the real face-up card on the pile shows through. */
  flip?: boolean;
}

function getRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  return el.getBoundingClientRect();
}

/** Rect of the actual card that's NOW on top of a discard pile. The pile DOM
 *  is `.pile` > `.card` + label rows, so the pile rect's top-left is OFFSET
 *  from where the card sits. Querying the inner `.card` gives us the exact
 *  position the ghost should land on. Falls back to the pile rect's top-left
 *  if the pile is empty (shouldn't happen post-discard). */
function pileTopCardRect(idx: 0 | 1): DOMRect | null {
  const el = document.querySelector(`[data-anchor="pile-${idx}"] .card`) as HTMLElement | null;
  if (el) return el.getBoundingClientRect();
  return getRect(`[data-anchor="pile-${idx}"]`);
}

/** Compute the landing rect for the NEXT face-down card that will appear in
 *  an opponent's hand row. The hand is rendered as small cards (56px wide,
 *  4px gap) inside `[data-anchor="strip-${pid}"]`, left-aligned. The newest
 *  card sits at the right end after the action committed, so we use the
 *  post-action hand size to derive the new slot's x. */
function opponentHandEndPoint(state: SspState, pid: PlayerId): { x: number; y: number } | null {
  const r = getRect(`[data-anchor="strip-${pid}"]`) ?? getRect(`[data-anchor="hand-${pid}"]`);
  if (!r) return null;
  // Try to query the LAST face-down card in the strip — it's the precise
  // landing spot since the new card is appended at the end of the row.
  // Falls back to a computed x using the overlap step if no face-down card
  // exists yet (first-ever draw of the round).
  const cards = document.querySelectorAll(`[data-anchor="strip-${pid}"] .card.facedown`);
  if (cards.length > 0) {
    const last = (cards[cards.length - 1] as HTMLElement).getBoundingClientRect();
    return { x: last.left, y: last.top };
  }
  const player = state.players.find((p) => p.id === pid);
  const handCount = player?.hand.length ?? 0;
  // Standard card size + overlap step — must match .ssp .table-strip's overlap
  // rule (card is 56 wide, overlapping cards step by 14px → 56 - 42 = 14).
  const cardW = 56;
  const step = 14;
  const gap = 4;
  const slotsBeforeNew = Math.max(0, handCount - 1);
  const maxX = r.right - cardW - 4;
  const x = Math.min(maxX, r.left + slotsBeforeNew * step + (slotsBeforeNew > 0 ? gap : 0));
  const y = r.top + 4;
  return { x, y };
}

export function OpponentMoveAnim({ state, localPlayerId }: { state: SspState; localPlayerId: PlayerId | null }) {
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const lastSeq = useRef<number>(0);

  useEffect(() => {
    const log = state.log ?? [];
    const newEntries = log.filter((e) => e.seq > lastSeq.current);
    if (newEntries.length === 0) return;
    lastSeq.current = log[log.length - 1].seq;

    const toAdd: Ghost[] = [];
    for (const e of newEntries) {
      toAdd.push(...ghostFor(e, state, localPlayerId));
    }
    if (toAdd.length === 0) return;

    setGhosts((prev) => [...prev, ...toAdd]);

    const flipTimers: number[] = [];
    for (const g of toAdd) {
      const t = window.setTimeout(() => {
        requestAnimationFrame(() => {
          setGhosts((prev) => prev.map((x) => x.id === g.id ? { ...x, visible: true } : x));
        });
      }, g.startDelay);
      flipTimers.push(t);
    }

    // Cleanup intentionally not cancelled on re-render — see history for the
    // orphaned-ghost bug. Each batch's removal timer must fire on its own.
    // Slide is 460ms; 40ms grace lines the removal up tight against the end
    // of the transition so the ghost doesn't sit on top of the real card.
    const maxLifetime = Math.max(...toAdd.map((g) => g.startDelay)) + 500;
    window.setTimeout(() => {
      const ids = new Set(toAdd.map((t) => t.id));
      setGhosts((prev) => prev.filter((g) => !ids.has(g.id)));
    }, maxLifetime);

    return () => { for (const t of flipTimers) clearTimeout(t); };
    // `state` is intentionally NOT in the deps — `state.logSeq` already fires
    // on every dispatch (and that's what gates new-entry discovery). Including
    // `state` re-runs the effect on identity changes that aren't log-related
    // and re-walks the (growing) log every time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.logSeq, localPlayerId]);

  if (ghosts.length === 0) return null;

  // Overlay sits outside the .ssp container; add the class here so the ghost
  // card picks up SSP-scoped sizing and the facedown stripe pattern.
  return (
    <div className="ssp" style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 80,
    }}>
      {ghosts.map((g) => {
        const dx = g.visible ? 0 : g.from.x - g.to.x;
        const dy = g.visible ? 0 : g.from.y - g.to.y;
        // Two-layer transform: the outer div slides, the inner div flips on
        // its Y-axis if `flip` is set. We can't combine translate + rotateY on
        // one node because the rotation breaks the FLIP-style translate-back
        // illusion. perspective on the slider makes the flip read as a real
        // 3D rotation.
        return (
          <div
            key={g.id}
            style={{
              position: 'absolute',
              left: g.to.x,
              top: g.to.y,
              transform: `translate(${dx}px, ${dy}px)`,
              transition: g.visible ? 'transform 460ms cubic-bezier(0.2, 0.7, 0.3, 1)' : 'none',
              perspective: 600,
            }}
          >
            {g.flip ? (
              <div
                className="ssp-flip-card"
                style={{
                  transform: g.visible ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: g.visible ? 'transform 460ms cubic-bezier(0.2, 0.7, 0.3, 1)' : 'none',
                }}
              >
                {/* Front face = the face-down ghost. As the slider lands and
                 *  the inner flips past 90°, this face rotates out of view
                 *  (backface-visibility hides it). The back face is empty —
                 *  the real face-up card on the pile beneath shows through. */}
                <div className="ssp-flip-face ssp-flip-front">
                  <div className="card facedown small" style={{ animation: 'none' }} />
                </div>
                <div className="ssp-flip-face ssp-flip-back" />
              </div>
            ) : (
              <div className="card facedown small" style={{ animation: 'none' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ghostFor(
  e: SspLogEntry, state: SspState, localPlayerId: PlayerId | null,
): Ghost[] {
  // FLIP handles every other card move. We ONLY animate cards leaving the
  // deck, because the deck doesn't render its interior and FLIP can't see a
  // card it never tracked.
  switch (e.kind) {
    case 'drawDeck': {
      // Opponent drew 2 from the deck; kept one face-down, discarded the other
      // onto a pile. We animate just the deck → opponent's hand leg here; the
      // discarded card is FLIP-tracked once it lands on the pile, but the
      // moment-of-landing flight from deck → pile happens too fast for FLIP to
      // see (the card never had a prior rect on screen) so we animate it too.
      if (e.playerId === localPlayerId) return [];
      const deckRect = getRect('[data-anchor="deck"]');
      const handEnd = opponentHandEndPoint(state, e.playerId);
      const pileR = pileTopCardRect(e.toPile);
      if (!deckRect) return [];
      const ghosts: Ghost[] = [];
      if (handEnd) {
        ghosts.push({
          id: `l-${e.seq}-kept`,
          from: { x: deckRect.left, y: deckRect.top },
          to: handEnd,
          visible: false,
          startDelay: 0,
        });
      }
      if (pileR) {
        // Land exactly on the pile's top card and flip face-up on touchdown.
        ghosts.push({
          id: `l-${e.seq}-disc`,
          from: { x: deckRect.left, y: deckRect.top },
          to: { x: pileR.left, y: pileR.top },
          visible: false,
          startDelay: 0,
          flip: true,
        });
      }
      return ghosts;
    }
    case 'fishDraw':
    case 'angelfishDraw': {
      // Free draw from the deck. Always face-down (deck is hidden).
      if (e.playerId === localPlayerId) return [];
      const deckRect = getRect('[data-anchor="deck"]');
      const handEnd = opponentHandEndPoint(state, e.playerId);
      if (!deckRect || !handEnd) return [];
      return [{
        id: `l-${e.seq}-${e.kind}`,
        from: { x: deckRect.left, y: deckRect.top },
        to: handEnd,
        visible: false,
        startDelay: 0,
      }];
    }
    default:
      return [];
  }
}
