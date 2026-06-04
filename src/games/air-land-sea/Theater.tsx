// One theater column: header, opponent stack (top), supply tokens, your stack (bottom).

import type { AlsState, AlsTheaterId, AlsCardTemplate } from './types';
import { AlsCardView, FaceDownCard } from './Card';
import { THEATER_DEFS } from './cards';
import { theaterStrength } from './scoring';

interface Props {
  state: AlsState;
  theaterIdx: number;
  /** Seat index of the local player (0 or 1); -1 = spectator (reveal nothing). */
  localSeatIdx: 0 | 1 | -1;
  /** Click handlers for highlighting / picking targets. */
  onCardClick?: (theaterIdx: number, sideIdx: 0 | 1, cardId: number) => void;
  onTheaterClick?: (theaterIdx: number) => void;
  /** Set of theaterIdxs that should glow as deployment targets. */
  highlightTheaters?: Set<number>;
  /** Set of "theaterIdx:sideIdx:cardId" strings that should glow as card targets. */
  highlightCards?: Set<string>;
}

export function TheaterColumn({
  state, theaterIdx, localSeatIdx,
  onCardClick, onTheaterClick, highlightTheaters, highlightCards,
}: Props) {
  const theaterId: AlsTheaterId = state.config.theaters[theaterIdx];
  const def = THEATER_DEFS[theaterId];
  const stacks = state.playedCards[theaterIdx];
  const supplyTokens = state.supplyTokens[theaterIdx] ?? [0, 0];
  const opponentSide: 0 | 1 = localSeatIdx === 0 ? 1 : 0;
  const meSide: 0 | 1 | null = localSeatIdx === 0 || localSeatIdx === 1 ? (localSeatIdx as 0 | 1) : null;
  const s0 = theaterStrength(state, theaterIdx, 0);
  const s1 = theaterStrength(state, theaterIdx, 1);
  const highlighted = highlightTheaters?.has(theaterIdx);

  const myStrength = meSide === null ? null : (meSide === 0 ? s0 : s1);
  const oppStrength = meSide === null ? null : (meSide === 0 ? s1 : s0);

  return (
    <div className={`als-theater ${highlighted ? 'als-theater-highlight' : ''}`}
         onClick={onTheaterClick ? () => onTheaterClick(theaterIdx) : undefined}>
      <div className="als-theater-header" style={{ background: theaterTint(theaterId) }}>
        <strong>{def.shortName}</strong>
        <span className="als-theater-name">{def.name}</span>
      </div>

      {/* Opponent stack (top of column, rendered top-down so first played is at top) */}
      <div className="als-theater-half als-theater-opp">
        <div className="als-strength-badge">{oppStrength ?? s1}</div>
        <div className="als-card-stack">
          {meSide === null
            ? stacks[1].map((p) => renderPlaced(state, theaterIdx, 1, p.cardId, /*reveal*/ true, onCardClick, highlightCards))
            : stacks[opponentSide].map((p) => renderPlaced(state, theaterIdx, opponentSide, p.cardId, /*reveal*/ !p.faceDown, onCardClick, highlightCards))}
          {supplyTokens[opponentSide] > 0 && <SupplyBadge n={supplyTokens[opponentSide]} />}
        </div>
      </div>

      {/* Your stack (bottom) */}
      <div className="als-theater-half als-theater-self">
        <div className="als-card-stack">
          {meSide === null
            ? stacks[0].map((p) => renderPlaced(state, theaterIdx, 0, p.cardId, /*reveal*/ true, onCardClick, highlightCards))
            : stacks[meSide].map((p) => renderPlaced(state, theaterIdx, meSide, p.cardId, /*reveal*/ true, onCardClick, highlightCards))}
          {meSide !== null && supplyTokens[meSide] > 0 && <SupplyBadge n={supplyTokens[meSide]} />}
        </div>
        <div className="als-strength-badge">{myStrength ?? s0}</div>
      </div>
    </div>
  );
}

function renderPlaced(
  state: AlsState,
  theaterIdx: number,
  sideIdx: 0 | 1,
  cardId: number,
  reveal: boolean,
  onCardClick?: (t: number, s: 0 | 1, id: number) => void,
  highlightCards?: Set<string>,
) {
  const placed = state.playedCards[theaterIdx][sideIdx].find((p) => p.cardId === cardId);
  if (!placed) return null;
  const tpl: AlsCardTemplate | undefined = state.deckPool[cardId];
  const key = `${theaterIdx}:${sideIdx}:${cardId}`;
  const highlighted = highlightCards?.has(key);
  if (!tpl) return null;
  if (placed.faceDown && !reveal) {
    return (
      <div key={cardId} className={highlighted ? 'als-stack-slot highlighted' : 'als-stack-slot'}>
        <FaceDownCard
          size="small"
          selectable={!!onCardClick}
          onClick={onCardClick ? () => onCardClick(theaterIdx, sideIdx, cardId) : undefined}
        />
      </div>
    );
  }
  return (
    <div key={cardId} className={highlighted ? 'als-stack-slot highlighted' : 'als-stack-slot'}>
      <AlsCardView
        card={tpl}
        size="small"
        faceDown={placed.faceDown}
        hideText={false}
        selectable={!!onCardClick}
        onClick={onCardClick ? () => onCardClick(theaterIdx, sideIdx, cardId) : undefined}
      />
    </div>
  );
}

function SupplyBadge({ n }: { n: number }) {
  return <div className="als-supply-badge">+{n} supply</div>;
}

function theaterTint(t: AlsTheaterId): string {
  switch (t) {
    case 'air': return '#6fb1d4';
    case 'land': return '#c5a36b';
    case 'sea': return '#5e8db5';
    case 'intel': return '#a37bd0';
    case 'diplo': return '#d48262';
    case 'econ': return '#7bc592';
  }
}
