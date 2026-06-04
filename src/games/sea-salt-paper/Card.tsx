import type { SspCard, SspCardFamily } from './types';
import { FAMILY } from './cards';
import { CardArt } from './CardArt';

interface Props {
  card: SspCard;
  size?: 'normal' | 'small';
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function CardView({ card, size = 'normal', selectable, selected, onClick }: Props) {
  const cls = [
    'card',
    size === 'small' ? 'small' : '',
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
    `color-${card.color}`,
  ].filter(Boolean).join(' ');
  const info = FAMILY[card.family];

  return (
    <div className={cls} onClick={onClick}>
      <div className="ribbon">
        <span className="pts">{ribbonValue(card.family)}</span>
        <span className="fam">{shortName(card.family)}</span>
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

function shortName(family: SspCardFamily): string {
  switch (family) {
    case 'penguinColony': return 'COLNY';
    case 'lighthouse': return 'L.HSE';
    case 'shoal': return 'SHOAL';
    case 'captain': return 'CAPT';
    case 'mermaid': return 'MERM';
    case 'swimmer': return 'SWIM';
    case 'octopus': return 'OCTO';
    case 'penguin': return 'PNGN';
    case 'sailor': return 'SAIL';
    case 'shark': return 'SHRK';
    case 'jellyfish': return 'JELLY';
    case 'lobster': return 'LOBST';
    case 'starfish': return 'STAR';
    case 'seahorse': return 'SHRSE';
    case 'crabBasket': return 'CRABS';
    default: return family.slice(0, 4).toUpperCase();
  }
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
