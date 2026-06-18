import type { SspCard, SspCardFamily } from './types';
import { FAMILY } from './cards';
import { CardArt } from './CardArt';
import { useFlipCard } from './cardFlip';

interface Props {
  card: SspCard;
  size?: 'normal' | 'small';
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Logical zone the card currently lives in (e.g. 'hand-A', 'pile-0',
   *  'pending-draw'). The FLIP harness only animates a card when this string
   *  changes between renders — i.e. when the card actually moves from one
   *  zone to another. Defaults to a stable per-card label so cards without
   *  a zone never animate. */
  zone?: string;
}

export function CardView({ card, size = 'normal', selectable, selected, onClick, zone }: Props) {
  const cls = [
    'card',
    size === 'small' ? 'small' : '',
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
    `color-${card.color}`,
  ].filter(Boolean).join(' ');
  const info = FAMILY[card.family];
  const flipRef = useFlipCard(card.id, zone ?? `static-${card.id}`);

  return (
    <div className={cls} onClick={onClick} ref={flipRef}>
      <div className="ribbon">
        <span className="pts">{ribbonValue(card.family)}</span>
      </div>
      <div className="color-bar" />
      <div className="art">
        <svg viewBox="0 0 100 120" width={size === 'small' ? 50 : 80}>
          <CardArt family={card.family} bodyColor={card.color} />
        </svg>
      </div>
      <div className="footer">{info.label}</div>
      <div className="card-tooltip" role="tooltip">
        <strong>{info.label}</strong>
        <div className="rule">{info.rule}</div>
        {info.ability ? <div className="ability"><em>Ability:</em> {info.ability}</div> : null}
      </div>
    </div>
  );
}

export function FaceDownCard({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  return <div className={`card facedown ${size === 'small' ? 'small' : ''}`} />;
}

function ribbonValue(family: SspCardFamily): string {
  switch (family) {
    case 'shell': return 'SET';
    case 'octopus': return 'SET';
    case 'penguin': return 'SET';
    case 'sailor': return 'SET';
    case 'lighthouse': return '+B';
    case 'shoal': return '+F';
    case 'penguinColony': return 'x2P';
    case 'captain': return 'x3S';
    case 'mermaid': return '★';
    case 'starfish': return 'TRIO';
    case 'seahorse': return 'WILD';
    case 'crabBasket': return '+C';
    default: return 'DUO';
  }
}
