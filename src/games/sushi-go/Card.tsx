// Sushi Go! Party card rendering — background color per food, art from art.tsx.

import type { CSSProperties } from 'react';
import type { SushiGoCard, SushiGoCardKind } from './types';
import { KIND_INFO, cardColor } from './cards';
import { CardArt, TakeoutTray } from './art';

interface Props {
  card: SushiGoCard;
  size?: 'normal' | 'small';
  selectable?: boolean;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
}

export function CardView({ card, size = 'normal', selectable, selected, dim, onClick }: Props) {
  const cls = [
    'sgp-card',
    size === 'small' ? 'small' : '',
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
    dim ? 'dim' : '',
  ].filter(Boolean).join(' ');

  // A special order shows the card it copies, marked as a copy.
  const shown: SushiGoCard = card.copyOf
    ? { id: card.id, kind: card.copyOf.kind, variant: card.copyOf.variant, flipped: card.flipped || card.copyOf.flipped }
    : card;
  const info = KIND_INFO[shown.kind];
  const order = hasOrderNumber(shown.kind) ? shown.variant : undefined;

  if (shown.flipped) {
    return (
      <div className={`${cls} flipped`} onClick={onClick}>
        <div className="art">
          <svg viewBox="0 0 100 100" width={size === 'small' ? 44 : 70}>
            <TakeoutTray />
          </svg>
        </div>
        <div className="footer">Flipped · 2 pts</div>
        <div className="card-tooltip" role="tooltip">
          <strong>Flipped by a takeout box</strong>
          <div className="rule">Worth 2 pts at round end; it no longer counts as {info.label}.</div>
        </div>
      </div>
    );
  }

  const style = { '--kind-color': cardColor(shown.kind) } as CSSProperties;
  return (
    <div className={cls} style={style} onClick={onClick}>
      <div className="ribbon">
        <span className="fam">{card.copyOf ? 'COPY' : shortName(shown.kind)}</span>
      </div>
      <div className="art">
        <svg viewBox="0 0 100 100" width={size === 'small' ? 44 : 70} preserveAspectRatio="xMidYMid meet">
          <CardArt card={shown} />
        </svg>
        {order && <span className="order">{order}</span>}
      </div>
      <div className="footer">
        {card.copyOf && 'Copy: '}
        {/* Fruit art already shows which fruits; spelled out they overflow the footer. */}
        {info.label}{shown.variant && !order && shown.kind !== 'fruit' ? ` · ${variantLabel(shown)}` : ''}
      </div>
      <div className="card-tooltip" role="tooltip">
        <strong>
          {card.copyOf ? `Special Order → ${info.label}` : info.label}
          {shown.kind === 'fruit' && ` · ${variantLabel(shown)}`}
        </strong>
        <div className="rule">{info.rule}</div>
        {order && <div className="rule">Resolves in number order: #{order}.</div>}
      </div>
    </div>
  );
}

export function FaceDownCard({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  return <div className={`sgp-card facedown ${size === 'small' ? 'small' : ''}`} />;
}

function hasOrderNumber(kind: SushiGoCardKind): boolean {
  return kind === 'chopsticks' || kind === 'spoon' || kind === 'menu' || kind === 'takeoutBox';
}

function shortName(kind: SushiGoCardKind): string {
  switch (kind) {
    case 'nigiri': return 'NIGI';
    case 'maki': return 'MAKI';
    case 'temaki': return 'TMKI';
    case 'uramaki': return 'URAM';
    case 'dumpling': return 'DUMP';
    case 'tempura': return 'TEMP';
    case 'sashimi': return 'SASH';
    case 'mizuOnigiri': return 'OGRI';
    case 'tofu': return 'TOFU';
    case 'edamame': return 'EDAM';
    case 'eel': return 'EEL';
    case 'misoSoup': return 'MISO';
    case 'soySauce': return 'SOY';
    case 'wasabi': return 'WSBI';
    case 'tea': return 'TEA';
    case 'specialOrder': return 'SPCL';
    case 'takeoutBox': return 'BOX';
    case 'chopsticks': return 'CHOP';
    case 'spoon': return 'SPN';
    case 'menu': return 'MENU';
    case 'pudding': return 'PUDD';
    case 'greenTeaIceCream': return 'ICE';
    case 'fruit': return 'FRUIT';
  }
}

const FRUIT_NAMES: Record<string, string> = { W: 'watermelon', P: 'pineapple', O: 'orange' };

export function variantLabel(card: SushiGoCard): string {
  if (card.kind === 'nigiri') {
    if (card.variant === 'salmon') return 'salmon (2)';
    if (card.variant === 'squid') return 'squid (3)';
    return 'egg (1)';
  }
  if (card.kind === 'maki' || card.kind === 'uramaki') return `${card.variant} icon${card.variant === '1' ? '' : 's'}`;
  if (card.kind === 'mizuOnigiri') return card.variant ?? '';
  if (card.kind === 'fruit') {
    return (card.variant ?? '').split('').map((c) => FRUIT_NAMES[c] ?? c).join(' + ');
  }
  return card.variant ?? '';
}
