// One theater column: illustrated banner, opponent stack (top), your stack
// (bottom), each with its strength badge. Stacks cascade top-down — each newer
// card overlaps the one before, leaving only its header strip showing, so the
// uncovered card is always the last one in each half.

import type { CSSProperties } from 'react';
import type { AlsState, AlsTheaterId, AlsCardTemplate } from './types';
import { AlsCardView, FaceDownCard } from './Card';
import { THEATER_DEFS } from './cards';
import { computeTheaterControl, effectiveCardStrength, theaterStrength } from './scoring';
import { ControlFlag, SupplyToken, TheaterBanner, TheaterEmblem, THEATER_TINT } from './art';

interface Props {
  state: AlsState;
  theaterIdx: number;
  /** Seat index of the local player (0 or 1); -1 = spectator (both sides shown face-up). */
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
  // Spectators see seat 1 on top and seat 0 below.
  const topSide: 0 | 1 = meSide === null ? 1 : opponentSide;
  const bottomSide: 0 | 1 = meSide === null ? 0 : meSide;
  const strengths = [theaterStrength(state, theaterIdx, 0), theaterStrength(state, theaterIdx, 1)];
  const holder = computeTheaterControl(state)[theaterIdx];
  const tied = strengths[0] === strengths[1];
  const highlighted = highlightTheaters?.has(theaterIdx);
  const tint = THEATER_TINT[theaterId];

  const half = (side: 0 | 1, position: 'top' | 'bottom') => {
    // Hidden-info contract: the opponent's face-down cards stay backs; your own
    // (and everything, for spectators) is revealed.
    const reveal = (faceDown: boolean) => meSide === null || side === meSide || !faceDown;
    const badge = (
      <StrengthBadge
        value={strengths[side]}
        holds={holder === side}
        tied={tied}
        seatName={state.seats.find((s) => s.id === state.players[side].id)?.name ?? `Seat ${side + 1}`}
      />
    );
    return (
      <div className={`als-theater-half als-theater-${position === 'top' ? 'opp' : 'self'} ${holder === side ? 'holds' : ''}`}>
        {position === 'top' && badge}
        <div className="als-card-stack">
          {stacks[side].map((p, slotIdx) =>
            renderPlaced(state, theaterIdx, side, slotIdx, p.cardId, reveal(p.faceDown), onCardClick, highlightCards))}
          {stacks[side].length === 0 && <div className={`als-empty-slot ${highlighted && side === bottomSide ? 'ready' : ''}`} />}
          {supplyTokens[side] > 0 && <SupplyBadge n={supplyTokens[side]} />}
        </div>
        {position === 'bottom' && badge}
      </div>
    );
  };

  return (
    <div
      className={`als-theater ${highlighted ? 'als-theater-highlight' : ''}`}
      style={{ '--als-tint': tint.main, '--als-tint-dark': tint.dark } as CSSProperties}
      onClick={onTheaterClick ? () => onTheaterClick(theaterIdx) : undefined}
    >
      <div className="als-theater-header">
        <div className="als-theater-banner"><TheaterBanner theater={theaterId} /></div>
        <div className="als-theater-label">
          <TheaterEmblem theater={theaterId} size={22} />
          <strong>{def.shortName}</strong>
        </div>
      </div>
      {half(topSide, 'top')}
      {half(bottomSide, 'bottom')}
    </div>
  );
}

function StrengthBadge({ value, holds, tied, seatName }: { value: number; holds: boolean; tied: boolean; seatName: string }) {
  const title = holds
    ? `${seatName} holds this theater${tied ? ' (tie — the 1st player wins ties)' : ''}`
    : `${seatName}: ${value} strength`;
  return (
    <div className={`als-strength-badge ${holds ? 'holds' : ''} ${holds && tied ? 'tied' : ''}`} title={title}>
      {holds && <ControlFlag size={12} color={tied ? '#d9cfa8' : '#f2c230'} />}
      <span className="num">{value}</span>
    </div>
  );
}

function renderPlaced(
  state: AlsState,
  theaterIdx: number,
  sideIdx: 0 | 1,
  slotIdx: number,
  cardId: number,
  reveal: boolean,
  onCardClick?: (t: number, s: 0 | 1, id: number) => void,
  highlightCards?: Set<string>,
) {
  const placed = state.playedCards[theaterIdx][sideIdx][slotIdx];
  if (!placed) return null;
  const tpl: AlsCardTemplate | undefined = state.deckPool[cardId];
  const key = `${theaterIdx}:${sideIdx}:${cardId}`;
  const highlighted = highlightCards?.has(key);
  if (!tpl) return null;
  const effective = effectiveCardStrength(state, theaterIdx, sideIdx, slotIdx);
  const isTop = slotIdx === state.playedCards[theaterIdx][sideIdx].length - 1;
  const cls = ['als-stack-slot', highlighted ? 'highlighted' : '', isTop ? 'uncovered' : 'covered'].filter(Boolean).join(' ');
  const click = onCardClick ? () => onCardClick(theaterIdx, sideIdx, cardId) : undefined;
  if (placed.faceDown && !reveal) {
    return (
      <div key={cardId} className={cls}>
        <FaceDownCard size="small" selectable={!!onCardClick} onClick={click} effective={effective} />
      </div>
    );
  }
  return (
    <div key={cardId} className={cls}>
      <AlsCardView
        card={tpl}
        size="small"
        faceDown={placed.faceDown}
        hideText={false}
        effective={effective}
        selectable={!!onCardClick}
        onClick={click}
      />
    </div>
  );
}

function SupplyBadge({ n }: { n: number }) {
  return (
    <div className="als-supply-badge" title={`${n} Supply Token${n === 1 ? '' : 's'} (+${n} strength)`}>
      <SupplyToken size={20} />
      <span>+{n}</span>
    </div>
  );
}
