// One theater column: illustrated banner, the opponent's stack (top), yours
// (bottom), each with its strength badge and supply tokens. Stacks cascade
// top-down — each newer card overlaps the one before, leaving only its header
// strip showing, so the uncovered card is always the last one in each half.

import type { CSSProperties } from 'react';
import type { AlsState, AlsTheaterId } from './types';
import { AlsCardView, FaceDownCard } from './Card';
import { cardById, THEATER_DEFS } from './cards';
import { effectiveCardStrength, theaterControl, theaterStrengthParts, type StrengthParts } from './rules';
import { ControlFlag, SupplyToken, TheaterBanner, TheaterEmblem, THEATER_TINT } from './art';

interface Props {
  state: AlsState;
  theaterIdx: number;
  /** The viewing seat; -1 = spectator (everything shown). */
  viewer: 0 | 1 | -1;
  onCardClick?: (cardId: number) => void;
  onTheaterClick?: (theaterIdx: number) => void;
  /** Theater lights up as a target. */
  highlighted?: boolean;
  /** Board cards that are legal picks. */
  highlightCards?: Set<number>;
  /** Cards to point at without being picks (Envoy's target). */
  markedCards?: Set<number>;
}

export function TheaterColumn({ state, theaterIdx, viewer, onCardClick, onTheaterClick, highlighted, highlightCards, markedCards }: Props) {
  const theaterId: AlsTheaterId = state.theaters[theaterIdx];
  const def = THEATER_DEFS[theaterId];
  const stacks = state.board[theaterIdx];
  const supplies = state.supplies[theaterIdx] ?? [0, 0];
  const topSide: 0 | 1 = viewer === -1 ? 1 : viewer === 0 ? 1 : 0;
  const bottomSide: 0 | 1 = topSide === 0 ? 1 : 0;
  const parts = [theaterStrengthParts(state, theaterIdx, 0), theaterStrengthParts(state, theaterIdx, 1)];
  const holder = theaterControl(state)[theaterIdx];
  const tied = parts[0].total === parts[1].total;
  const tint = THEATER_TINT[theaterId];
  const seatName = (side: 0 | 1) => state.seats.find((s) => s.id === state.players[side].id)?.name ?? `Seat ${side + 1}`;

  const half = (side: 0 | 1, position: 'top' | 'bottom') => {
    // Hidden information: the opponent's face-down cards stay backs.
    const reveal = (faceDown: boolean) => viewer === -1 || side === viewer || !faceDown;
    const badge = <StrengthBadge parts={parts[side]} holds={holder === side} tied={tied} seatName={seatName(side)} />;
    return (
      <div className={`als-theater-half als-theater-${position === 'top' ? 'opp' : 'self'} ${holder === side ? 'holds' : ''}`}>
        {position === 'top' && badge}
        <div className="als-card-stack">
          {stacks[side].map((p, slotIdx) => {
            const card = cardById(p.cardId);
            const isTop = slotIdx === stacks[side].length - 1;
            const cls = [
              'als-stack-slot',
              isTop ? 'uncovered' : 'covered',
              highlightCards?.has(p.cardId) ? 'highlighted' : '',
              markedCards?.has(p.cardId) ? 'marked' : '',
            ].filter(Boolean).join(' ');
            const effective = effectiveCardStrength(state, theaterIdx, side, slotIdx);
            const click = onCardClick ? () => onCardClick(p.cardId) : undefined;
            return (
              <div key={p.cardId} className={cls} data-card={p.cardId}>
                {p.faceDown && !reveal(true)
                  ? <FaceDownCard size="small" selectable={!!click} onClick={click} effective={effective} />
                  : <AlsCardView card={card} size="small" faceDown={p.faceDown} effective={effective} selectable={!!click} onClick={click} />}
              </div>
            );
          })}
          {stacks[side].length === 0 && <div className={`als-empty-slot ${highlighted && side === bottomSide ? 'ready' : ''}`} />}
          {supplies[side] > 0 && <SupplyBadge n={supplies[side]} />}
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
      data-theater={theaterId}
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

function StrengthBadge({ parts, holds, tied, seatName }: { parts: StrengthParts; holds: boolean; tied: boolean; seatName: string }) {
  const bits = [`cards ${parts.cards}`];
  if (parts.support) bits.push(`Support +${parts.support}`);
  if (parts.spyNetwork) bits.push(`Spy Network +${parts.spyNetwork}`);
  if (parts.supplies) bits.push(`supplies +${parts.supplies}`);
  const title = `${seatName}: ${parts.total} (${bits.join(', ')})${holds ? ` — holds this theater${tied ? ' on the tie (1st player)' : ''}` : ''}`;
  return (
    <div className={`als-strength-badge ${holds ? 'holds' : ''} ${holds && tied ? 'tied' : ''}`} title={title}>
      {holds && <ControlFlag size={12} color={tied ? '#d9cfa8' : '#f2c230'} />}
      <span className="num">{parts.total}</span>
    </div>
  );
}

function SupplyBadge({ n }: { n: number }) {
  return (
    <div className="als-supply-badge" title={`${n} suppl${n === 1 ? 'y' : 'ies'} (+${n} strength)`}>
      <SupplyToken size={20} />
      <span>+{n}</span>
    </div>
  );
}
