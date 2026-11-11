// The board: a 3-deep grid of cards plus, in chain modes, a strip showing the
// group you must build from.
//
// Two orientations. "Rows" is the tabletop layout — three rows that grow to the
// right, filled column-major so card i sits at (row i%3, column floor(i/3)).
// "Columns" is the phone layout — three across, growing downwards. Keyboard
// shortcuts follow whichever orientation is active, taken off the physical QWERTY
// grid so the keys sit under your fingers in the same shape as the cards.
//
// Motion (all view-side; nothing here waits before dispatching): the opening
// board deals in card by card; a card that appears later (a refill, a grown
// board, the chain strip) drops in on its own. Each card sits in a slot that
// owns that one-off entrance, so the card's own lift / shake / glow classes can
// come and go without restarting it. A found group pops and sparkles where it
// stood — ghost copies laid over the table at the cards' last measured boxes,
// click-through, while the replacements deal in underneath — and the table rim
// flashes green (or red for a miss).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CardId, CardSpace } from './cards';
import { SetCard } from './Card';
import type { SetResultFlash } from './types';

export type BoardLayout = 'rows' | 'columns';

const QWERTY_ROWS = ['qwertyuiop', 'asdfghjkl;', 'zxcvbnm,./'] as const;

/** Column-major walk of the key grid: q a z w s x e d c … */
const ROWS_KEYS = (() => {
  const out: string[] = [];
  for (let c = 0; c < QWERTY_ROWS[0].length; c++) {
    for (let r = 0; r < 3; r++) out.push(QWERTY_ROWS[r][c]);
  }
  return out;
})();

/** Row-major walk in blocks of three columns: q w e / a s d / z x c / r t y … */
const COLUMNS_KEYS = (() => {
  const out: string[] = [];
  for (let block = 0; block < 3; block++) {
    for (let r = 0; r < 3; r++) {
      out.push(...QWERTY_ROWS[r].slice(block * 3, block * 3 + 3));
    }
  }
  return out;
})();

export function boardShortcuts(layout: BoardLayout): readonly string[] {
  return layout === 'rows' ? ROWS_KEYS : COLUMNS_KEYS;
}

interface Props {
  space: CardSpace;
  board: readonly CardId[];
  /** Chain modes: the previous group, still selectable. */
  lastSet: readonly CardId[];
  selection: readonly CardId[];
  hintCards: readonly CardId[];
  /** Cards flashing red after a rejected claim. */
  wrongCards: readonly CardId[];
  faceDown: boolean;
  layout: BoardLayout;
  showShortcuts: boolean;
  interactive: boolean;
  /** The last claim's outcome, for the found / missed effects. */
  result: SetResultFlash | null;
  /** Nothing scored or missed yet: the board on screen is the opening deal. */
  opening: boolean;
  onCardClick(cardId: CardId): void;
  onClear(): void;
}

interface Box { x: number; y: number; w: number; h: number }

interface Fx {
  key: string;
  kind: 'set' | 'error';
  ghosts: { cardId: CardId; box: Box }[];
}

interface Deal { cls: string; delay: number }

/** Sparkles per found card: angle, reach (× card width), colour. */
const SPARKS: readonly (readonly [number, number, string])[] = [
  [-90, 0.42, '#ffffff'], [-38, 0.5, '#3ddc97'], [8, 0.46, '#ffc53d'], [52, 0.5, '#ff6b81'],
  [96, 0.42, '#ffffff'], [140, 0.5, '#b98cff'], [186, 0.46, '#3ddc97'], [230, 0.5, '#ff6b81'],
];

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SetBoard({
  space, board, lastSet, selection, hintCards, wrongCards,
  faceDown, layout, showShortcuts, interactive, result, opening, onCardClick, onClear,
}: Props) {
  const keys = useMemo(() => boardShortcuts(layout), [layout]);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** Every card's box at the last commit (offsets ignore the lift transforms). */
  const boxes = useRef(new Map<CardId, Box>());
  /** How each slot on screen made its entrance — fixed for the slot's life. */
  const deals = useRef(new Map<string, Deal>());
  const [fx, setFx] = useState<Fx | null>(null);

  useEffect(() => {
    if (!interactive) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        onClear();
        return;
      }
      // Digits pick out of the chain strip.
      if (lastSet.length && e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (idx < lastSet.length) {
          e.preventDefault();
          onCardClick(lastSet[idx]);
        }
        return;
      }
      if (e.key.length !== 1) return;
      const idx = keys.indexOf(e.key.toLowerCase());
      if (idx >= 0 && idx < board.length) {
        e.preventDefault();
        onCardClick(board[idx]);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [board, lastSet, keys, interactive, onCardClick, onClear]);

  // A new outcome: lay the found cards' ghosts where those cards stood a
  // commit ago (before the refill moved anything). Declared before the box
  // snapshot below, so it runs first and still reads the old boxes.
  const fxKey = result ? `${result.kind}-${result.atMs}` : null;
  useLayoutEffect(() => {
    if (!result || !fxKey || reducedMotion()) return;
    const ghosts = result.kind === 'set'
      ? result.cards.flatMap((cardId) => {
        const box = boxes.current.get(cardId);
        return box ? [{ cardId, box }] : [];
      })
      : [];
    setFx({ key: fxKey, kind: result.kind, ghosts });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxKey]);

  // Clear the effect layer once it has played (not tied to `result`, which
  // the next click resets to null).
  useEffect(() => {
    if (!fx) return;
    const timer = window.setTimeout(() => setFx(null), 900);
    return () => window.clearTimeout(timer);
  }, [fx]);

  // Every commit: remember where each card sits, and forget the entrances of
  // slots that are gone (so a card that comes back makes a fresh one).
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const next = new Map<CardId, Box>();
    const live = new Set<string>();
    wrap.querySelectorAll<HTMLElement>('[data-slot]').forEach((el) => {
      const cardId = el.dataset.card;
      if (cardId) next.set(cardId, { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
      live.add(el.dataset.slot!);
    });
    boxes.current = next;
    for (const slot of [...deals.current.keys()]) {
      if (!live.has(slot)) deals.current.delete(slot);
    }
  });

  /** A slot's entrance, decided the first time it renders. */
  function dealFor(slot: string, index: number, total: number): Deal {
    let deal = deals.current.get(slot);
    if (!deal) {
      deal = opening
        ? { cls: 'is-opening', delay: Math.round(index * Math.min(45, 760 / Math.max(1, total))) }
        : { cls: 'is-refill', delay: 0 };
      deals.current.set(slot, deal);
    }
    return deal;
  }

  function slotProps(zone: string, cardId: CardId, index: number, total: number) {
    const slot = `${zone}:${cardId}`;
    const deal = dealFor(slot, index, total);
    return {
      className: `set-slot ${deal.cls}`,
      style: { ['--deal-delay' as string]: `${deal.delay}ms` } as CSSProperties,
      'data-card': cardId,
      'data-slot': slot,
    };
  }

  const cols = Math.max(1, Math.ceil(board.length / 3));

  return (
    <div className="set-board-wrap" ref={wrapRef}>
      {lastSet.length > 0 && (
        <div className="set-chain-strip">
          <span className="set-chain-label">Previous</span>
          <div className="set-chain-cards">
            {lastSet.map((cardId, i) => (
              <div key={cardId} {...slotProps('chain', cardId, i, lastSet.length)}>
                <SetCard
                  space={space}
                  cardId={cardId}
                  selected={selection.includes(cardId)}
                  hinted={hintCards.includes(cardId)}
                  wrong={wrongCards.includes(cardId)}
                  shortcut={showShortcuts ? String(i + 1) : undefined}
                  onClick={interactive ? () => onCardClick(cardId) : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        className={`set-board set-board-${layout}${faceDown ? ' is-memory' : ''}`}
        style={{ ['--set-cols' as string]: String(cols) }}
      >
        {board.map((cardId, i) => (
          <div key={cardId} {...slotProps('board', cardId, i, board.length)}>
            <SetCard
              space={space}
              cardId={cardId}
              selected={selection.includes(cardId)}
              hinted={hintCards.includes(cardId)}
              wrong={wrongCards.includes(cardId)}
              faceDown={faceDown && !selection.includes(cardId)}
              shortcut={showShortcuts ? keys[i] : undefined}
              onClick={interactive ? () => onCardClick(cardId) : undefined}
            />
          </div>
        ))}
      </div>

      {fx && <span key={`flash-${fx.key}`} className={`set-table-flash is-${fx.kind}`} aria-hidden="true" />}
      {fx && fx.ghosts.length > 0 && (
        <div key={`ghosts-${fx.key}`} className="set-ghosts" aria-hidden="true">
          {fx.ghosts.map(({ cardId, box }, i) => {
            const pos = {
              // The ghost layer overhangs the table by --set-ghost-pad (so a
              // popping edge card isn't clipped); boxes are table-relative.
              left: `calc(${box.x}px + var(--set-ghost-pad))`,
              top: `calc(${box.y}px + var(--set-ghost-pad))`,
              width: box.w,
              height: box.h,
              ['--i' as string]: i,
            } as CSSProperties;
            return (
              <div key={cardId}>
                <div className="set-ghost" style={pos}>
                  <SetCard space={space} cardId={cardId} />
                </div>
                <span className="set-burst" style={pos}>
                  {SPARKS.map(([angle, reach, color], j) => (
                    <i
                      key={j}
                      style={{
                        ['--a' as string]: `${angle}deg`,
                        ['--r' as string]: `${Math.round(reach * box.w)}px`,
                        ['--c' as string]: color,
                      } as CSSProperties}
                    />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
