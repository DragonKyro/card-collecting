// A single card face. Reads its traits out of the CardSpace, so the same
// component renders a 3-feature Junior card and a 5-feature MegaSet card without
// knowing which mode is running.

import { memo } from 'react';
import type { CardId, CardSpace } from './cards';
import { SET_BORDER_STYLES, SetSymbol } from './art';

export interface SetCardProps {
  space: CardSpace;
  cardId: CardId;
  selected?: boolean;
  hinted?: boolean;
  wrong?: boolean;
  /** Memory mode / paused: show the back instead of the face. */
  faceDown?: boolean;
  /** Keyboard shortcut badge, when shortcuts are being shown. */
  shortcut?: string;
  onClick?: () => void;
}

function SetCardInner({
  space, cardId, selected, hinted, wrong, faceDown, shortcut, onClick,
}: SetCardProps) {
  const values = space.traitValues(cardId);
  const axisIndex = (id: string) => space.axes.findIndex((a) => a.id === id);
  const at = (id: string, fallback: number) => {
    const i = axisIndex(id);
    return i < 0 ? fallback : values[i];
  };

  const color = at('color', 0);
  const shape = at('shape', 0);
  const shade = at('shade', 0);
  const border = at('border', 0);
  const count = at('count', 0) + 1;

  const classes = ['set-card'];
  if (selected) classes.push('is-selected');
  if (hinted) classes.push('is-hinted');
  if (wrong) classes.push('is-wrong');
  if (faceDown) classes.push('is-face-down');
  if (onClick) classes.push('is-clickable');

  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={{ borderStyle: SET_BORDER_STYLES[border % SET_BORDER_STYLES.length] }}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={!!selected}
      aria-label={faceDown ? 'face-down card' : describeCard(space, cardId)}
    >
      {faceDown ? (
        <span className="set-card-back" />
      ) : (
        <span className="set-card-symbols">
          {Array.from({ length: count }, (_, i) => (
            <SetSymbol key={i} shape={shape} shade={shade} color={color} />
          ))}
        </span>
      )}
      {shortcut && <span className="set-card-key">{shortcut}</span>}
    </button>
  );
}

/** Screen-reader / tooltip text, e.g. "two striped green diamonds". */
export function describeCard(space: CardSpace, cardId: CardId): string {
  const values = space.traitValues(cardId);
  const parts: string[] = [];
  for (let i = 0; i < space.axes.length; i++) {
    parts.push(`${space.axes[i].label} ${values[i] + 1}`);
  }
  return parts.join(', ');
}

export const SetCard = memo(SetCardInner);
