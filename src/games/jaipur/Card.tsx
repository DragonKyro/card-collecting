// Jaipur — card and token views. Every one registers with the FLIP harness
// (flip.tsx) under its id and the zone it sits in, so moving between zones
// animates by itself.

import type { CSSProperties } from 'react';
import type { JaipurBonusToken, JaipurCard, JaipurGoodsToken } from './types';
import { CARD_INFO } from './cards';
import { BonusTokenArt, CardSvg, GoodsTokenArt, TokenSvg } from './art';
import { bonusKey, cardKey, tokenKey, useFlip } from './flip';

interface CardProps {
  card: JaipurCard;
  zone: string;
  /** Draw the back instead (opponent's hand). */
  faceDown?: boolean;
  size?: 'normal' | 'small' | 'tiny';
  selectable?: boolean;
  selected?: boolean;
  /** Dimmed: can't be part of the current selection. */
  disabled?: boolean;
  /** Arrived since the viewer last looked (a soft glow). */
  fresh?: boolean;
  onClick?: () => void;
  title?: string;
  style?: CSSProperties;
}

export function CardView({ card, zone, faceDown, size = 'normal', selectable, selected, disabled, fresh, onClick, title, style }: CardProps) {
  const ref = useFlip(cardKey(card.id), zone);
  const cls = [
    'jp-card', `jp-card-${size}`,
    selectable ? 'selectable' : '', selected ? 'selected' : '', disabled ? 'disabled' : '', fresh ? 'fresh' : '',
  ].filter(Boolean).join(' ');
  const label = faceDown ? 'Face-down card' : CARD_INFO[card.type].label;
  return (
    <div
      ref={ref}
      className={cls}
      style={style}
      onClick={selectable && !disabled ? onClick : undefined}
      title={title ?? label}
      role={selectable ? 'button' : undefined}
      aria-pressed={selectable ? !!selected : undefined}
      tabIndex={selectable && !disabled ? 0 : undefined}
      onKeyDown={selectable && !disabled ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
    >
      <CardSvg type={faceDown ? 'back' : card.type} />
    </div>
  );
}

/** A decorative card back (deck stack), not tracked. */
export function CardBack({ size = 'normal', style }: { size?: 'normal' | 'small' | 'tiny'; style?: CSSProperties }) {
  return (
    <div className={`jp-card jp-card-${size}`} style={style} aria-hidden>
      <CardSvg type="back" />
    </div>
  );
}

export function GoodsTokenView({ token, zone, size = 'normal', style }: {
  token: JaipurGoodsToken; zone: string; size?: 'normal' | 'small'; style?: CSSProperties;
}) {
  const ref = useFlip(tokenKey(token.id), zone);
  return (
    <div ref={ref} className={`jp-token jp-token-${size}`} style={style} title={`${CARD_INFO[token.good].label} token: ${token.value}`}>
      <TokenSvg label={`${token.value}`}>
        <GoodsTokenArt good={token.good} value={token.value} />
      </TokenSvg>
    </div>
  );
}

export function BonusTokenView({ token, zone, revealed, size = 'normal', style }: {
  token: JaipurBonusToken; zone: string; revealed: boolean; size?: 'normal' | 'small'; style?: CSSProperties;
}) {
  const ref = useFlip(bonusKey(token.id), zone);
  return (
    <div
      ref={ref}
      className={`jp-token jp-token-${size} jp-bonus`}
      style={style}
      title={revealed ? `×${token.size} bonus: ${token.value}` : `×${token.size} bonus token (face down)`}
    >
      <TokenSvg label={revealed ? `${token.value}` : `bonus ×${token.size}`}>
        <BonusTokenArt size={token.size} value={revealed ? token.value : undefined} />
      </TokenSvg>
    </div>
  );
}
