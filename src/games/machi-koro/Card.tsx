// Card faces, dice and coins.
//
// Establishments follow the printed layout: activation number(s) on a colour
// band (blue / green / red / purple), the name, the illustration, the effect
// line with its corner symbol, and the cost coin. Landmarks are orange, carry
// their price ladder (the price that applies to the viewer highlighted) and a
// badge for who their rule applies to.

import type { CSSProperties, ReactNode } from 'react';
import type { MkEdition, MkEstablishmentDef, MkLandmarkDef } from './types';
import { activationLabel, estDef, isEstablishment, lmDef } from './cards';
import { CardArt, SymbolIcon } from './art';

export const COLOR_HEX: Record<MkEstablishmentDef['color'] | 'landmark', string> = {
  blue: '#2f7fd1',
  green: '#3b9b4a',
  red: '#d2433b',
  purple: '#8450bd',
  landmark: '#e98a1c',
};

export const TIMING_LABEL: Record<MkEstablishmentDef['color'], string> = {
  blue: 'Anyone’s turn',
  green: 'Your turn',
  red: 'Opponents’ turns',
  purple: 'Your turn',
};

/** One-line effect summary for a card face. */
export function shortEffect(def: MkEstablishmentDef): ReactNode {
  const e = def.effect;
  switch (e.kind) {
    case 'bank': return <><b>+{e.amount}</b> from the bank</>;
    case 'bankPerSymbol': return <><b>+{e.amount}</b> per <SymbolIcon symbol={e.symbol} size={12} /> you own</>;
    case 'takeFromRoller': return <>Take <b>{e.amount}</b> from the roller</>;
    case 'takeFromEach': return <>Take <b>{e.amount}</b> from each opponent</>;
    case 'takeHalfAbove': return <>Take <b>half</b> from each with 11+</>;
    case 'takeFromOne': return <>Take <b>{e.amount}</b> from one opponent</>;
    case 'exchange': return <>Swap an establishment</>;
  }
}

export type CardSize = 'lg' | 'md' | 'sm';

interface CommonProps {
  size?: CardSize;
  /** Copies in this stack (badge when > 1). */
  count?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  title?: string;
}

export function CardFace({ edition, cardId, ...rest }: CommonProps & {
  edition: MkEdition;
  cardId: string;
  /** Landmarks: the price ladder index that applies (viewer's landmark count). */
  priceIndex?: number;
  /** Landmarks: the actual price for the viewer, if it differs from the ladder (discounts). */
  price?: number;
  /** MK1 personal landmark not built yet. */
  unbuilt?: boolean;
}) {
  return isEstablishment(edition, cardId)
    ? <EstablishmentFace def={estDef(edition, cardId)} {...rest} />
    : <LandmarkFace def={lmDef(edition, cardId)} {...rest} />;
}

export function EstablishmentFace({ def, size = 'lg', count, className = '', style, onClick, title }: CommonProps & { def: MkEstablishmentDef }) {
  const color = COLOR_HEX[def.color];
  return (
    <div
      className={`mk-card mk-card-${size} mk-est ${onClick ? 'clickable' : ''} ${className}`}
      style={{ ['--mk-band' as string]: color, ...style }}
      onClick={onClick}
      title={title ?? `${def.name} — ${def.text}`}
      role={onClick ? 'button' : undefined}
    >
      <div className="mk-card-band">
        <span className="mk-card-num">{activationLabel(def.activation)}</span>
      </div>
      {size !== 'sm' && <div className="mk-card-name">{def.name}</div>}
      <div className="mk-card-art"><CardArt art={def.art} /></div>
      {size === 'lg' && (
        <div className="mk-card-text">
          {shortEffect(def)}
          <div className="mk-card-timing">{TIMING_LABEL[def.color]}</div>
        </div>
      )}
      <div className="mk-card-foot">
        <CostCoin value={def.cost} />
        {def.symbol !== 'none' && <SymbolIcon symbol={def.symbol} size={size === 'sm' ? 13 : 16} />}
      </div>
      {count !== undefined && count > 1 && <span className="mk-card-count">×{count}</span>}
    </div>
  );
}

export function LandmarkFace({
  def, size = 'lg', count, className = '', style, onClick, title, priceIndex, price, unbuilt,
}: CommonProps & { def: MkLandmarkDef; priceIndex?: number; price?: number; unbuilt?: boolean }) {
  const ladderAt = priceIndex === undefined ? -1 : Math.min(priceIndex, def.costs.length - 1);
  const scope = def.timing === 'immediate' ? 'Once, for you' : def.scope === 'everyone' ? 'Everyone' : 'Only you';
  return (
    <div
      className={`mk-card mk-card-${size} mk-lm ${unbuilt ? 'unbuilt' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      style={{ ['--mk-band' as string]: COLOR_HEX.landmark, ...style }}
      onClick={onClick}
      title={title ?? `${def.name} — ${def.text}`}
      role={onClick ? 'button' : undefined}
    >
      <div className="mk-card-band">
        <span className={`mk-lm-scope ${def.timing === 'immediate' ? 'once' : def.scope}`}>{size === 'sm' ? '★' : scope}</span>
      </div>
      {size !== 'sm' && <div className="mk-card-name">{def.name}</div>}
      <div className="mk-card-art"><CardArt art={def.art} /></div>
      {size === 'lg' && <div className="mk-card-text">{def.face}</div>}
      <div className="mk-card-foot">
        {size === 'sm'
          ? price !== undefined && <CostCoin value={price} />
          : def.costs.length === 1
          ? <CostCoin value={price ?? def.costs[Math.max(0, ladderAt)]} />
          : (
            <span className="mk-ladder">
              {def.costs.map((c, i) => (
                <span key={i} className={i === ladderAt ? 'now' : ''}>
                  {i === ladderAt && price !== undefined && price !== c ? <><s>{c}</s>{price}</> : c}
                </span>
              ))}
            </span>
          )}
        {def.promo && size !== 'sm' && <span className="mk-promo">promo</span>}
      </div>
      {count !== undefined && count > 1 && <span className="mk-card-count">×{count}</span>}
    </div>
  );
}

/** Card back for a market deck, with its remaining count. */
export function DeckBack({ label, count, size = 'lg' }: { label: string; count: number; size?: CardSize }) {
  return (
    <div className={`mk-card mk-card-${size} mk-back ${count === 0 ? 'empty' : ''}`} title={`${count} card${count === 1 ? '' : 's'} left`}>
      <div className="mk-back-label">{label}</div>
      <div className="mk-back-count">{count}</div>
    </div>
  );
}

export function CostCoin({ value }: { value: number }) {
  return <span className="mk-cost">{value}</span>;
}

/** A gold coin glyph. */
export function CoinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" className="mk-coin-icon">
      <circle cx={10} cy={10} r={9} fill="#f2c230" stroke="#9a6b06" strokeWidth={1.4} />
      <circle cx={10} cy={10} r={6} fill="none" stroke="#c99512" strokeWidth={1.2} />
      <path d="M10 6.2 L11.1 8.9 L13.8 9 L11.7 10.8 L12.4 13.6 L10 12.1 L7.6 13.6 L8.3 10.8 L6.2 9 L8.9 8.9 Z" fill="#fff2b8" />
    </svg>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export function DieFace({ value, size = 44, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`mk-die ${className}`} aria-label={`die showing ${value}`}>
      <rect x={4} y={4} width={92} height={92} rx={20} fill="#fffdf6" stroke="#3a2a14" strokeWidth={4} />
      {(PIPS[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={9} fill={value === 1 ? '#d2433b' : '#2b2118'} />
      ))}
    </svg>
  );
}
