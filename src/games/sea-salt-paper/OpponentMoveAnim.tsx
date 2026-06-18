// Visualizes opponent moves that involve cards the local viewer can see:
//   - drawDiscard / crabPick   → animate the taken card from the pile → opponent's hand strip
//   - keepFromDraw (discard)   → animate the discarded card from opponent's hand strip → pile
//   - sharkSteal               → animate the stolen card from target's strip → stealer's strip
//   - playPair / playTrio      → animate cards from opponent's hand strip → their table
//
// Implementation: watch state.log; for each new entry that matches one of the
// visible-info kinds above, mount a transient absolutely-positioned ghost
// CardView at the SOURCE location, then on the next frame slide it to the
// DESTINATION location. Auto-cleans up after the slide.
//
// Source / destination positions are resolved via DOM lookups by stable id
// attributes (`data-anchor`) on the pile slots, opponent strips, and table
// strips. Cards going INTO an opponent's hand land at the END of their strip
// (right side, where new face-down cards visually appear).

import { useEffect, useRef, useState } from 'react';
import type { SspState, SspLogEntry, SspCardFamily, SspColor } from './types';
import type { PlayerId } from '@/core/types';

/** Featureless ghost card: just a colored rectangle the size of a small
 *  card. Used by the opponent-move animation overlay — no art, no text, just
 *  a visual hint of "a card is moving here". */
function GhostCard({ color }: { family: SspCardFamily; color: SspColor }) {
  return (
    <div
      className={`card small color-${color} ssp-ghost-card`}
      style={{ animation: 'none' }}
    />
  );
}

interface Ghost {
  id: string;            // unique per ghost; entry seq + variant
  card: { id: number; family: import('./types').SspCardFamily; color: import('./types').SspColor };
  from: { x: number; y: number };
  to:   { x: number; y: number };
  faceDown: boolean;     // render as face-down placeholder if the card identity is hidden
  visible: boolean;      // controls the post-mount transform clear
  /** Delay (ms) before this ghost starts moving — used to stagger multi-leg
   *  moves like deck → opponent hand → pile so the player sees the flow. */
  startDelay: number;
}

function getRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  return el.getBoundingClientRect();
}

function pileRect(idx: 0 | 1): DOMRect | null {
  return getRect(`[data-anchor="pile-${idx}"]`);
}
function opponentStripRect(pid: PlayerId): DOMRect | null {
  return getRect(`[data-anchor="hand-${pid}"]`);
}
function localHandRect(): DOMRect | null {
  return getRect('[data-anchor="hand-me"]');
}

export function OpponentMoveAnim({ state, localPlayerId }: { state: SspState; localPlayerId: PlayerId | null }) {
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const lastSeq = useRef<number>(0);

  useEffect(() => {
    const log = state.log ?? [];
    // Process every NEW entry since the last seq we handled.
    const newEntries = log.filter((e) => e.seq > lastSeq.current);
    if (newEntries.length === 0) return;
    lastSeq.current = log[log.length - 1].seq;

    const toAdd: Ghost[] = [];
    for (const e of newEntries) {
      toAdd.push(...ghostFor(e, state, localPlayerId));
    }
    if (toAdd.length === 0) return;

    setGhosts((prev) => [...prev, ...toAdd]);

    const timers: number[] = [];
    // For each ghost, fire its visibility flip after `startDelay` + 1 frame
    // so the browser first paints it at its `from` position.
    for (const g of toAdd) {
      const t = window.setTimeout(() => {
        requestAnimationFrame(() => {
          setGhosts((prev) => prev.map((x) => x.id === g.id ? { ...x, visible: true } : x));
        });
      }, g.startDelay);
      timers.push(t);
    }

    // Clean up after the slide completes. We pick the max delay + the 460ms
    // animation + a 200ms grace period, so all ghosts have fully settled.
    const maxLifetime = Math.max(...toAdd.map((g) => g.startDelay)) + 700;
    const cleanup = window.setTimeout(() => {
      const ids = new Set(toAdd.map((t) => t.id));
      setGhosts((prev) => prev.filter((g) => !ids.has(g.id)));
    }, maxLifetime);
    timers.push(cleanup);
    return () => { for (const t of timers) clearTimeout(t); };
  }, [state.logSeq, state, localPlayerId]);

  if (ghosts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 80,
    }}>
      {ghosts.map((g) => {
        const dx = g.visible ? 0 : g.from.x - g.to.x;
        const dy = g.visible ? 0 : g.from.y - g.to.y;
        return (
          <div
            key={g.id}
            style={{
              position: 'absolute',
              left: g.to.x,
              top: g.to.y,
              transform: `translate(${dx}px, ${dy}px) scale(0.75)`,
              transformOrigin: 'top left',
              transition: g.visible ? 'transform 460ms cubic-bezier(0.2, 0.7, 0.3, 1)' : 'none',
            }}
          >
            {g.faceDown ? (
              <div className="card facedown small" style={{ animation: 'none' }} />
            ) : (
              <GhostCard family={g.card.family} color={g.card.color} />
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
  // We only animate moves involving OPPONENT cards that the local viewer can
  // partially see (the source or destination is public).
  switch (e.kind) {
    case 'drawDiscard': {
      if (e.playerId === localPlayerId) return [];
      const from = pileRect(e.pile);
      const to = opponentStripRect(e.playerId);
      if (!from || !to) return [];
      const cardId = guessCardId(state, e);
      return [{
        id: `l-${e.seq}-drawDiscard`,
        card: { id: cardId ?? -e.seq, family: e.family, color: pickColor(e.family) },
        from: { x: from.left, y: from.top },
        to: { x: to.right - 60, y: to.top },
        faceDown: false,
        visible: false,
        startDelay: 0,
      }];
    }
    case 'crabPick': {
      if (e.playerId === localPlayerId) return [];
      const from = pileRect(e.pile);
      const to = opponentStripRect(e.playerId);
      if (!from || !to) return [];
      const cardId = guessCardId(state, e);
      return [{
        id: `l-${e.seq}-crabPick`,
        card: { id: cardId ?? -e.seq, family: e.family, color: pickColor(e.family) },
        from: { x: from.left, y: from.top },
        to: { x: to.right - 60, y: to.top },
        faceDown: false,
        visible: false,
        startDelay: 0,
      }];
    }
    case 'sharkSteal': {
      const fromPid = e.targetPlayerId;
      const toPid = e.playerId;
      if (toPid === localPlayerId) return [];
      const fromRect = fromPid === localPlayerId ? localHandRect() : opponentStripRect(fromPid);
      const toRect = opponentStripRect(toPid);
      if (!fromRect || !toRect) return [];
      return [{
        id: `l-${e.seq}-shark`,
        card: { id: -e.seq, family: e.family, color: pickColor(e.family) },
        from: { x: fromRect.left + Math.max(0, fromRect.width - 60), y: fromRect.top },
        to: { x: toRect.right - 60, y: toRect.top },
        faceDown: true,
        visible: false,
        startDelay: 0,
      }];
    }
    case 'drawDeck': {
      // Opponent drew 2 from the deck; kept one and discarded the other to a
      // pile. We animate this as two sequential moves so the player can
      // FOLLOW what happened:
      //   leg 1 (0ms):    a face-down card slides deck → opponent's hand
      //   leg 1b (60ms):  the discarded card slides deck → opponent's hand
      //                   (just a slight stagger so they don't overlap exactly)
      //   leg 2 (520ms):  the discarded card slides opponent's hand → pile
      if (e.playerId === localPlayerId) return [];
      const deckRect = getRect('[data-anchor="deck"]');
      const handRect = opponentStripRect(e.playerId);
      const pileR = pileRect(e.toPile);
      if (!deckRect) return [];
      const ghosts: Ghost[] = [];
      if (handRect) {
        // Kept card: face-down, deck → hand.
        ghosts.push({
          id: `l-${e.seq}-kept`,
          card: { id: -e.seq, family: e.keptFamily, color: pickColor(e.keptFamily) },
          from: { x: deckRect.left, y: deckRect.top },
          to: { x: handRect.right - 70, y: handRect.top + 8 },
          faceDown: true,
          visible: false,
          startDelay: 0,
        });
        // Discarded card: deck → hand (briefly), THEN hand → pile.
        ghosts.push({
          id: `l-${e.seq}-disc-pickup`,
          card: { id: -e.seq - 50000, family: e.discardedFamily, color: pickColor(e.discardedFamily) },
          from: { x: deckRect.left, y: deckRect.top },
          to: { x: handRect.right - 40, y: handRect.top + 8 },
          faceDown: false,
          visible: false,
          startDelay: 60,
        });
        if (pileR) {
          ghosts.push({
            id: `l-${e.seq}-disc-drop`,
            card: { id: -e.seq - 100000, family: e.discardedFamily, color: pickColor(e.discardedFamily) },
            from: { x: handRect.right - 40, y: handRect.top + 8 },
            to: { x: pileR.left, y: pileR.top },
            faceDown: false,
            visible: false,
            startDelay: 520,
          });
        }
      } else if (pileR) {
        // No opponent hand strip visible — fall back to deck → pile.
        ghosts.push({
          id: `l-${e.seq}-disc`,
          card: { id: -e.seq - 100000, family: e.discardedFamily, color: pickColor(e.discardedFamily) },
          from: { x: deckRect.left, y: deckRect.top },
          to: { x: pileR.left, y: pileR.top },
          faceDown: false,
          visible: false,
          startDelay: 0,
        });
      }
      return ghosts;
    }
    case 'playPair':
    case 'playTrio': {
      if (e.playerId === localPlayerId) return [];
      const stripRect = opponentStripRect(e.playerId);
      if (!stripRect) return [];
      // Show each played family sliding out of the opponent's hand strip and
      // landing on their table (= top of the strip area, slightly offset).
      return e.families.map((fam, i) => ({
        id: `l-${e.seq}-play-${i}`,
        card: { id: -e.seq - i * 1000, family: fam, color: pickColor(fam) },
        from: { x: stripRect.right - 70 - i * 30, y: stripRect.top + 4 },
        to: { x: stripRect.right - 70 - i * 30, y: stripRect.top + 38 },
        faceDown: false,
        visible: false,
        startDelay: i * 80,
      }));
    }
    case 'fishDraw':
    case 'angelfishDraw': {
      // Opponent drew a free card from the deck (fish duo bonus, etc.).
      if (e.playerId === localPlayerId) return [];
      const deckRect = getRect('[data-anchor="deck"]');
      const handRect = opponentStripRect(e.playerId);
      if (!deckRect || !handRect) return [];
      return [{
        id: `l-${e.seq}-${e.kind}`,
        card: { id: -e.seq, family: e.family, color: pickColor(e.family) },
        from: { x: deckRect.left, y: deckRect.top },
        to: { x: handRect.right - 60, y: handRect.top + 8 },
        faceDown: true,
        visible: false,
        startDelay: 0,
      }];
    }
    default:
      return [];
  }
}

/** Try to find the actual SspCard.id from state for log entries whose source
 *  is a discard pile (we know the family was on top). Returns null if no
 *  match — caller falls back to a synthetic id. */
function guessCardId(state: SspState, e: SspLogEntry): number | null {
  if (e.kind === 'drawDiscard' || e.kind === 'crabPick') {
    // After the action, the card has already been removed from the pile and
    // added to the actor's hand. We can find it there.
    const p = state.players.find((q) => q.id === (e as { playerId: PlayerId }).playerId);
    if (!p) return null;
    const match = p.hand.find((c) => c.family === e.family);
    return match?.id ?? null;
  }
  return null;
}

function pickColor(family: SspCardFamily): SspColor {
  if (family === 'mermaid') return 'white';
  return 'yellow';
}
