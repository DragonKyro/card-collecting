// Air, Land & Sea — card front + face-down back.

import type { AlsCardTemplate, AlsTheaterId } from './types';

interface Props {
  card: AlsCardTemplate;
  size?: 'normal' | 'small';
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  hideText?: boolean;   // when true (face-down + not our card) render a back
}

const THEATER_COLOR: Record<AlsTheaterId, string> = {
  air:   '#6fb1d4',
  land:  '#c5a36b',
  sea:   '#5e8db5',
  intel: '#a37bd0',
  diplo: '#d48262',
  econ:  '#7bc592',
};

export function AlsCardView({ card, size = 'normal', selectable, selected, onClick, faceDown, hideText }: Props) {
  if (faceDown && hideText) return <FaceDownCard size={size} onClick={onClick} selectable={selectable} selected={selected} />;
  const cls = [
    'als-card',
    size === 'small' ? 'small' : '',
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
    faceDown ? 'face-down-revealed' : '',
  ].filter(Boolean).join(' ');
  const tint = THEATER_COLOR[card.theater];
  return (
    <div className={cls} onClick={onClick} style={{ borderColor: tint }}>
      <div className="als-card-header" style={{ background: tint }}>
        <span className="als-card-strength">{faceDown ? '2' : card.strength}</span>
        <span className="als-card-theater">{card.theater.slice(0, 4).toUpperCase()}</span>
      </div>
      <div className="als-card-body">
        <div className="als-card-name">{card.name}</div>
        <div className="als-card-text">{faceDown ? 'Face-down (wild, strength 2, no ability).' : card.abilityText}</div>
      </div>
      {faceDown && <div className="als-card-fd-overlay">FACE DOWN</div>}
    </div>
  );
}

export function FaceDownCard({ size = 'normal', selectable, selected, onClick }: {
  size?: 'normal' | 'small';
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const cls = [
    'als-card',
    'als-card-back',
    size === 'small' ? 'small' : '',
    selectable ? 'selectable' : '',
    selected ? 'selected' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick}>
      <div className="als-card-back-marker">★</div>
    </div>
  );
}
