// The board: a 3-deep grid of cards plus, in chain modes, a strip showing the
// group you must build from.
//
// Two orientations. "Rows" is the tabletop layout — three rows that grow to the
// right, filled column-major so card i sits at (row i%3, column floor(i/3)).
// "Columns" is the phone layout — three across, growing downwards. Keyboard
// shortcuts follow whichever orientation is active, taken off the physical QWERTY
// grid so the keys sit under your fingers in the same shape as the cards.

import { useEffect, useMemo } from 'react';
import type { CardId, CardSpace } from './cards';
import { SetCard } from './Card';

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
  onCardClick(cardId: CardId): void;
  onClear(): void;
}

export function SetBoard({
  space, board, lastSet, selection, hintCards, wrongCards,
  faceDown, layout, showShortcuts, interactive, onCardClick, onClear,
}: Props) {
  const keys = useMemo(() => boardShortcuts(layout), [layout]);

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

  const cols = Math.max(1, Math.ceil(board.length / 3));

  return (
    <div className="set-board-wrap">
      {lastSet.length > 0 && (
        <div className="set-chain-strip">
          <span className="set-chain-label">Previous</span>
          <div className="set-chain-cards">
            {lastSet.map((cardId, i) => (
              <SetCard
                key={cardId}
                space={space}
                cardId={cardId}
                selected={selection.includes(cardId)}
                hinted={hintCards.includes(cardId)}
                wrong={wrongCards.includes(cardId)}
                shortcut={showShortcuts ? String(i + 1) : undefined}
                onClick={interactive ? () => onCardClick(cardId) : undefined}
              />
            ))}
          </div>
        </div>
      )}
      <div
        className={`set-board set-board-${layout}`}
        style={{ ['--set-cols' as string]: String(cols) }}
      >
        {board.map((cardId, i) => (
          <SetCard
            key={cardId}
            space={space}
            cardId={cardId}
            selected={selection.includes(cardId)}
            hinted={hintCards.includes(cardId)}
            wrong={wrongCards.includes(cardId)}
            faceDown={faceDown && !selection.includes(cardId)}
            shortcut={showShortcuts ? keys[i] : undefined}
            onClick={interactive ? () => onCardClick(cardId) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
