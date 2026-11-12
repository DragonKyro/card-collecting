// Air, Land & Sea — card faces and backs.
//
// Full cards (hand, decision panels) follow the printed layout: the strength
// numeral on a theater-coloured tab, the name, the theater emblem, the
// illustration, and a rules box led by the Instant / Ongoing marker. Small
// cards (on the board) keep the header strip and the illustration; when a newer
// card covers one, only its strip shows. Face-down cards are backs — the
// owner's own face-down cards carry a strip naming the real card ("peek").

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type { AlsCardTemplate } from './types';
import { THEATER_DEFS } from './cards';
import { CardArt, CardBackArt, TheaterEmblem, THEATER_TINT, TriggerGlyph } from './art';

type CardSize = 'normal' | 'small' | 'mini';

interface Props {
  card: AlsCardTemplate;
  size?: 'normal' | 'small';
  selectable?: boolean;
  selected?: boolean;
  /** Dimmed: shown but not a legal pick right now. */
  muted?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  /** Face down and not ours: render a back. */
  hideText?: boolean;
  /** Strength the card counts for where it sits (board cards), if known. */
  effective?: number;
  /** A small corner tag ("Revealed", "Must play face down", "Drawn"). */
  badge?: ReactNode;
  /** Extra classes / style on the face (entrance animations). */
  className?: string;
  style?: CSSProperties;
}

function clickProps(selectable: boolean | undefined, onClick: (() => void) | undefined) {
  if (!selectable || !onClick) return {};
  return {
    onClick,
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    },
  };
}

function classes(size: CardSize, extra: string, selectable?: boolean, selected?: boolean, muted?: boolean): string {
  return ['als-card', `als-card-${size}`, extra, selectable ? 'selectable' : '', selected ? 'selected' : '', muted ? 'muted' : '']
    .filter(Boolean).join(' ');
}

export function cardTitle(card: AlsCardTemplate): string {
  const head = `${card.name} — ${THEATER_DEFS[card.theater].name} ${card.strength}`;
  if (!card.trigger) return `${head}\nNo tactical ability.`;
  return `${head}\n${card.trigger === 'instant' ? 'Instant' : 'Ongoing'}: ${card.text}`;
}

export function AlsCardView({ card, size = 'normal', selectable, selected, muted, onClick, faceDown, hideText, effective, badge, className = '', style: extraStyle }: Props) {
  if (faceDown && hideText) {
    return <FaceDownCard size={size} onClick={onClick} selectable={selectable} selected={selected} effective={effective} />;
  }
  if (faceDown) {
    return <PeekCard card={card} size={size} selectable={selectable} selected={selected} onClick={onClick} effective={effective} />;
  }
  const tint = THEATER_TINT[card.theater];
  const style = { '--als-tint': tint.main, '--als-tint-dark': tint.dark, ...extraStyle } as CSSProperties;
  const boosted = effective !== undefined && effective !== card.strength;
  const title = `${cardTitle(card)}${boosted ? `\nCounts as ${effective} here.` : ''}`;

  if (size === 'small') {
    return (
      <div className={classes('small', `als-face ${className}`.trim(), selectable, selected, muted)} style={style} title={title} {...clickProps(selectable, onClick)}>
        <div className="als-card-head">
          <span className="als-card-str">{card.strength}</span>
          <span className="als-card-name">{card.name}</span>
          {boosted && <span className="als-card-eff">→{effective}</span>}
          {/* An Instant is spent once placed; an Ongoing one keeps working, even covered. */}
          {card.trigger === 'ongoing' && <TriggerGlyph trigger="ongoing" size={12} />}
        </div>
        <div className="als-card-art"><CardArt card={card} /></div>
      </div>
    );
  }

  return (
    <div className={classes('normal', `als-face ${className}`.trim(), selectable, selected, muted)} style={style} title={title} {...clickProps(selectable, onClick)}>
      <div className="als-card-head">
        <span className="als-card-str">{card.strength}</span>
        <span className="als-card-name">{card.name}</span>
      </div>
      <div className="als-card-art">
        <CardArt card={card} />
        <span className="als-card-emblem"><TheaterEmblem theater={card.theater} size={20} /></span>
        {badge && <span className="als-card-badge">{badge}</span>}
      </div>
      <div className="als-card-rules">
        <div className={`als-card-trigger ${card.trigger ?? 'none'}`}>
          {card.trigger && <TriggerGlyph trigger={card.trigger} size={13} />}
          {card.trigger === 'instant' ? 'Instant' : card.trigger === 'ongoing' ? 'Ongoing' : 'No ability'}
          <span className="als-card-theater">{THEATER_DEFS[card.theater].shortName}</span>
        </div>
        <div className="als-card-text">{card.trigger ? card.text : 'No tactical ability.'}</div>
      </div>
    </div>
  );
}

/** The owner's own face-down card: a back with a strip naming what it really is. */
function PeekCard({ card, size, selectable, selected, onClick, effective }: {
  card: AlsCardTemplate; size: 'normal' | 'small'; selectable?: boolean; selected?: boolean; onClick?: () => void; effective?: number;
}) {
  const counts = effective ?? 2;
  const tint = THEATER_TINT[card.theater];
  const style = { '--als-tint': tint.main, '--als-tint-dark': tint.dark } as CSSProperties;
  return (
    <div
      className={classes(size, 'als-back als-peek', selectable, selected)}
      style={style}
      title={`Your face-down card: ${card.name} (${THEATER_DEFS[card.theater].name} ${card.strength}). Counts as ${counts}, no ability.`}
      {...clickProps(selectable, onClick)}
    >
      <div className="als-card-head">
        <span className="als-card-str">{counts}</span>
        <span className="als-card-name">
          <span className="als-peek-real">{card.strength}</span>
          {card.name}
        </span>
      </div>
      <div className="als-card-art als-card-backart"><CardBackArt /></div>
    </div>
  );
}

export function FaceDownCard({ size = 'normal', selectable, selected, onClick, effective }: {
  size?: CardSize;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Strength it counts for on the board (public: 2, or 4 under Escalation / Cover Fire). */
  effective?: number;
}) {
  if (size === 'mini' || size === 'normal') {
    return (
      <div className={classes(size, 'als-back', selectable, selected)} title="Face-down card" {...clickProps(selectable, onClick)}>
        <CardBackArt />
      </div>
    );
  }
  return (
    <div className={classes(size, 'als-back', selectable, selected)} title={`Face-down card — counts as ${effective ?? 2}`} {...clickProps(selectable, onClick)}>
      <div className="als-card-head">
        <span className="als-card-str">{effective ?? 2}</span>
        <span className="als-card-name">Face-down</span>
      </div>
      <div className="als-card-art als-card-backart"><CardBackArt /></div>
    </div>
  );
}

/** A tiny face-up card (opponent's revealed hand cards, the Neutralize picker). */
export function MiniFace({ card, selectable, muted, onClick, label }: {
  card: AlsCardTemplate; selectable?: boolean; muted?: boolean; onClick?: () => void; label?: string;
}) {
  const tint = THEATER_TINT[card.theater];
  const style = { '--als-tint': tint.main, '--als-tint-dark': tint.dark } as CSSProperties;
  return (
    <div
      className={classes('mini', 'als-face als-mini-face', selectable, false, muted)}
      style={style}
      title={label ? `${label}\n${cardTitle(card)}` : cardTitle(card)}
      {...clickProps(selectable, onClick)}
    >
      <span className="als-mini-str">{card.strength}</span>
      <span className="als-mini-emblem"><TheaterEmblem theater={card.theater} size={14} /></span>
    </div>
  );
}
