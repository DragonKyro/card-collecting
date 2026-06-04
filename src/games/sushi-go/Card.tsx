// Sushi Go! Party card rendering — small inline SVG art per kind.

import type { SushiGoCard, SushiGoCardKind } from './types';
import { KIND_INFO, cardColor, nigiriPoints } from './cards';

interface Props {
  card: SushiGoCard;
  size?: 'normal' | 'small';
  selectable?: boolean;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
}

export function CardView({ card, size = 'normal', selectable, selected, dim, onClick }: Props) {
  const info = KIND_INFO[card.kind];
  const cls = [
    'sgp-card',
    size === 'small' ? 'small' : '',
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
    dim ? 'dim' : '',
  ].filter(Boolean).join(' ');
  const color = cardColor(card.kind);
  const pts = ribbonValue(card);
  return (
    <div className={cls} onClick={onClick}>
      <div className="ribbon">
        <span className="pts">{pts}</span>
        <span className="fam">{shortName(card.kind)}</span>
      </div>
      <div className="color-bar" style={{ background: color }} />
      <div className="art">
        <svg viewBox="0 0 100 100" width={size === 'small' ? 44 : 70} preserveAspectRatio="xMidYMid meet">
          <CardArt card={card} />
        </svg>
      </div>
      <div className="footer">{info.label}{card.variant ? ` · ${variantLabel(card)}` : ''}</div>
      <div className="card-tooltip" role="tooltip">
        <strong>{info.label}</strong>
        <div className="rule">{info.rule}</div>
      </div>
    </div>
  );
}

export function FaceDownCard({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  return <div className={`sgp-card facedown ${size === 'small' ? 'small' : ''}`} />;
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
    case 'eggNigiri': return 'EGGN';
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

function ribbonValue(card: SushiGoCard): string {
  switch (card.kind) {
    case 'nigiri': return String(nigiriPoints(card.variant));
    case 'maki': return `${card.variant ?? '1'}🍃`;
    case 'uramaki': return `${card.variant ?? '0'}🍃`;
    case 'tempura': return '×2';
    case 'sashimi': return '×3';
    case 'dumpling': return 'SET';
    case 'eel': return '−/+';
    case 'tofu': return '1·2';
    case 'mizuOnigiri': return 'SET';
    case 'edamame': return 'NBR';
    case 'eggNigiri': return '1';
    case 'soySauce': return '+4';
    case 'wasabi': return '×3';
    case 'tea': return '×';
    case 'specialOrder': return 'CPY';
    case 'takeoutBox': return '+2';
    case 'chopsticks': return '↔';
    case 'spoon': return '↔';
    case 'menu': return '◇';
    case 'pudding': return '±6';
    case 'greenTeaIceCream': return '/4';
    case 'fruit': return '◷';
    case 'temaki': return '±4';
  }
}

function variantLabel(card: SushiGoCard): string {
  if (card.kind === 'nigiri') {
    if (card.variant === 'salmon') return 'salmon (2)';
    if (card.variant === 'squid') return 'squid (3)';
    return 'egg (1)';
  }
  if (card.kind === 'maki' || card.kind === 'uramaki') return `${card.variant} icon${card.variant === '1' ? '' : 's'}`;
  if (card.kind === 'mizuOnigiri') return card.variant ?? '';
  if (card.kind === 'fruit') {
    const m: Record<string, string> = { P: 'pineapple', W: 'watermelon', O: 'orange' };
    return (card.variant ?? '').split('').map((c) => m[c] ?? c).join('+');
  }
  return card.variant ?? '';
}

function CardArt({ card }: { card: SushiGoCard }) {
  // Lightweight emoji-based art for speed — replace with real SVGs if desired.
  const emoji = (() => {
    switch (card.kind) {
      case 'nigiri':
        if (card.variant === 'salmon') return '🍣';
        if (card.variant === 'squid') return '🦑';
        return '🥚';
      case 'maki': return '🍱';
      case 'temaki': return '🌯';
      case 'uramaki': return '🍙';
      case 'dumpling': return '🥟';
      case 'tempura': return '🍤';
      case 'sashimi': return '🐟';
      case 'mizuOnigiri': return '🍙';
      case 'tofu': return '🟦';
      case 'edamame': return '🌱';
      case 'eel': return '🐍';
      case 'eggNigiri': return '🥚';
      case 'soySauce': return '🥢';
      case 'wasabi': return '🟢';
      case 'tea': return '🍵';
      case 'specialOrder': return '📋';
      case 'takeoutBox': return '📦';
      case 'chopsticks': return '🥢';
      case 'spoon': return '🥄';
      case 'menu': return '📜';
      case 'pudding': return '🍮';
      case 'greenTeaIceCream': return '🍨';
      case 'fruit': return '🍉';
    }
  })();
  return (
    <text x="50" y="65" fontSize="48" textAnchor="middle">{emoji}</text>
  );
}
