// 7 Wonders Duel — card, wonder and progress-token views built on art.tsx.
//
// Cards follow the printed Duel layout: a colour frame, the effect in the top
// band, the cost down the left edge (a chain symbol when an earlier card makes
// it free), the chain symbol the card gives at the bottom right, the
// illustration and the name at the bottom. In the pyramid only the top of a
// covered card shows — band and first costs — as on the table. Tucked cards
// in a city show just their band (`CardBand`).

import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from 'react';
import type {
  DuelCard, DuelCardEffect, DuelCost, DuelCount, DuelProduction, DuelProgressTokenId, DuelWonder,
  DuelWonderEffect,
} from './types';
import { progressTokenById } from './progress';
import {
  CARD_HEX, CardArt, CardBackArt, ChainSymbolIcon, ChipGlyph, CoinGlyph, CoinIcon, DestroyGlyph, DiscardPickGlyph,
  ExtraTurnGlyph, Icon, LaurelIcon, ProgressGlyph, ProgressTokenArt, ResourceIcon, SCIENCE_NAMES, ScienceIcon,
  ShieldIcon, TradeGlyph, WonderArt, WonderGlyph,
} from './art';

export type CardSize = 'lg' | 'md' | 'sm';

const ICON_PX: Record<CardSize, number> = { lg: 30, md: 22, sm: 15 };
const COST_PX: Record<CardSize, number> = { lg: 19, md: 13, sm: 10 };
/** Room for band icons: card width minus the cost column and padding. */
const BAND_PX: Record<CardSize, number> = { lg: 104, md: 62, sm: 42 };

/** How many icon widths a list of effects takes (slashes count ~0.45). */
function effectUnits(effects: DuelCardEffect[]): number {
  let u = 0;
  for (const eff of effects) {
    switch (eff.kind) {
      case 'produce':
        for (const opts of eff.production) u += opts.length === 1 ? 1 : opts.length * 0.86 + (opts.length - 1) * 0.45;
        break;
      case 'shields': u += eff.shields; break;
      case 'tradeFixed': u += 2.25; break;
      case 'coinsPer': u += 2.45; break;
      case 'guild': u += (eff.coinsPer ? 1 : 0) + 1 + 1.45; break;
      default: u += 1;
    }
  }
  return Math.max(u, 1);
}

/** Icon size that fits `effects` into `room` px, capped at `max`. */
export function fitIcon(effects: DuelCardEffect[], room: number, max: number): number {
  return Math.max(9, Math.min(max, Math.floor(room / effectUnits(effects))));
}

// ---------------------------------------------------------------------------
// Effects

function Production({ opts, size }: { opts: DuelProduction; size: number }) {
  if (opts.length === 1) return <ResourceIcon r={opts[0]} size={size} />;
  return (
    <span className="swd-choice" title={`one of ${opts.join(' / ')} each turn`}>
      {opts.map((r, i) => (
        <span key={r} className="swd-choice-item">
          {i > 0 && <span className="swd-slash">/</span>}
          <ResourceIcon r={r} size={size * 0.86} />
        </span>
      ))}
    </span>
  );
}

function Shields({ n, size }: { n: number; size: number }) {
  return <>{Array.from({ length: n }, (_, i) => <ShieldIcon key={i} size={size} title={`${n} shield${n === 1 ? '' : 's'}`} />)}</>;
}

/** Fixed trading price: "these resources = 1 coin". */
function Trade({ eff, size }: { eff: Extract<DuelCardEffect, { kind: 'tradeFixed' }>; size: number }) {
  return (
    <span className="swd-per" title={effectText(eff)}>
      <Icon size={size}><TradeGlyph resources={eff.resources} /></Icon>
      <span className="swd-slash">=</span>
      <CoinIcon value={1} size={size * 0.8} title="1 coin" />
    </span>
  );
}

function CountIcon({ what, both, size }: { what: DuelCount; both: boolean; size: number }) {
  if (what.kind === 'wonders') return <Icon size={size} title="wonder built"><WonderGlyph /></Icon>;
  if (what.kind === 'coins') return <Icon size={size} title="3 coins"><CoinGlyph value={3} /></Icon>;
  return (
    <>
      {what.colors.map((c) => <Icon key={c} size={size} title={`${c} card`}><ChipGlyph color={c} both={both} /></Icon>)}
    </>
  );
}

/** The icons for a card's effects, as printed in its top band. */
export function CardEffects({ effects, size }: { effects: DuelCardEffect[]; size: number }) {
  const out: ReactNode[] = [];
  effects.forEach((eff, i) => {
    switch (eff.kind) {
      case 'produce':
        eff.production.forEach((opts, j) => out.push(<Production key={`${i}.${j}`} opts={opts} size={size} />));
        break;
      case 'coins': out.push(<CoinIcon key={i} value={eff.amount} size={size} />); break;
      case 'shields': out.push(<Shields key={i} n={eff.shields} size={size} />); break;
      case 'vp': out.push(<LaurelIcon key={i} value={eff.vp} size={size} />); break;
      case 'science': out.push(<ScienceIcon key={i} symbol={eff.symbol} size={size} />); break;
      case 'tradeFixed': out.push(<Trade key={i} eff={eff} size={size} />); break;
      case 'coinsPer':
        out.push(
          <span key={i} className="swd-per" title={effectText(eff)}>
            <CoinIcon value={eff.per} size={size} />
            <span className="swd-slash">/</span>
            <CountIcon what={eff.what} both={false} size={size} />
          </span>,
        );
        break;
      case 'guild':
        out.push(
          <span key={i} className="swd-per" title={effectText(eff)}>
            {eff.coinsPer ? <CoinIcon value={eff.coinsPer} size={size} /> : null}
            <LaurelIcon value={eff.vpPer} size={size} />
            <span className="swd-slash">/</span>
            <CountIcon what={eff.what} both size={size} />
          </span>,
        );
        break;
    }
  });
  return <>{out}</>;
}

/** The icons for a wonder's effects. */
export function WonderEffects({ effects, size }: { effects: DuelWonderEffect[]; size: number }) {
  const out: ReactNode[] = [];
  effects.forEach((eff, i) => {
    switch (eff.kind) {
      case 'vp': out.push(<LaurelIcon key={i} value={eff.vp} size={size} />); break;
      case 'coins': out.push(<CoinIcon key={i} value={eff.amount} size={size} />); break;
      case 'opponentLosesCoins': out.push(<CoinIcon key={i} value={eff.amount} negative size={size} />); break;
      case 'shields': out.push(<Shields key={i} n={eff.shields} size={size} />); break;
      case 'produce': eff.production.forEach((opts, j) => out.push(<Production key={`${i}.${j}`} opts={opts} size={size} />)); break;
      case 'playAgain': out.push(<Icon key={i} size={size} title="Play again"><ExtraTurnGlyph /></Icon>); break;
      case 'destroy': out.push(<Icon key={i} size={size} title={`Discard a ${eff.color} card of your opponent's`}><DestroyGlyph color={eff.color} /></Icon>); break;
      case 'buildFromDiscard': out.push(<Icon key={i} size={size} title="Build a discarded card for free"><DiscardPickGlyph /></Icon>); break;
      case 'progressFromBox': out.push(<Icon key={i} size={size} title="Keep 1 of 3 Progress tokens from the box"><ProgressGlyph /></Icon>); break;
    }
  });
  return <>{out}</>;
}

/** Cost icons, one per unit (coins first), stacked by the caller's CSS. */
export function CostIcons({ cost, size }: { cost: DuelCost; size: number }) {
  return (
    <>
      {cost.coins ? <CoinIcon value={cost.coins} size={size} /> : null}
      {(cost.resources ?? []).map((r, i) => <ResourceIcon key={i} r={r} size={size} />)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Text (tooltips and the action panel)

function countText(what: DuelCount): string {
  switch (what.kind) {
    case 'color': return `${what.colors.join(' and ')} card`;
    case 'wonders': return 'wonder built';
    case 'coins': return 'set of 3 coins';
  }
}

export function effectText(eff: DuelCardEffect): string {
  switch (eff.kind) {
    case 'produce': return `Produces ${eff.production.map((o) => o.join(' or ')).join(' + ')}`;
    case 'coins': return `Take ${eff.amount} coins`;
    case 'shields': return `${eff.shields} shield${eff.shields === 1 ? '' : 's'}`;
    case 'vp': return `${eff.vp} VP`;
    case 'science': return `Science symbol: ${SCIENCE_NAMES[eff.symbol]}`;
    case 'tradeFixed': return `${eff.resources.join(' and ')} cost you 1 coin each`;
    case 'coinsPer': return `Take ${eff.per} coin${eff.per === 1 ? '' : 's'} per ${countText(eff.what)} in your city`;
    case 'guild': {
      const parts = [eff.coinsPer ? `Take ${eff.coinsPer} coin per` : '', `${eff.vpPer} VP per`].filter(Boolean).join(' and ');
      return `${parts} ${countText(eff.what)} in the city that has the most`;
    }
  }
}

export function costText(cost: DuelCost): string {
  const parts: string[] = [];
  if (cost.coins) parts.push(`${cost.coins} coin${cost.coins === 1 ? '' : 's'}`);
  const counts: Record<string, number> = {};
  for (const r of cost.resources ?? []) counts[r] = (counts[r] ?? 0) + 1;
  for (const [r, n] of Object.entries(counts)) parts.push(n > 1 ? `${n} ${r}` : r);
  return parts.length > 0 ? parts.join(', ') : 'free';
}

export function describeCard(card: DuelCard): string {
  const lines = [`${card.name} (${card.color}, Age ${card.age})`, `Cost: ${costText(card.cost)}`, ...card.effects.map(effectText)];
  if (card.chainFrom) lines.push(`Free if you own ${card.chainFrom}`);
  if (card.chain) lines.push(`Chain symbol: ${card.chain}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Card face / back / tucked band

interface Clickable {
  onClick?: () => void;
  title?: string;
  className?: string;
  style?: CSSProperties;
  /** Ref to the card's root node (animation registration). */
  nodeRef?: Ref<HTMLDivElement>;
}

function clickProps(onClick?: () => void) {
  if (!onClick) return {};
  return {
    onClick,
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    },
  };
}

export function CardFace({ card, size = 'md', onClick, title, className = '', style, nodeRef }: Clickable & { card: DuelCard; size?: CardSize }) {
  const science = card.effects.find((e) => e.kind === 'science');
  const symbol = science && science.kind === 'science' ? science.symbol : undefined;
  const hasCost = !!card.cost.coins || (card.cost.resources?.length ?? 0) > 0;
  return (
    <div
      ref={nodeRef}
      className={`swd-card swd-card-${size} ${card.name.length > 14 ? 'swd-name-long' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      style={{ ['--swd-card' as string]: CARD_HEX[card.color], ...style }}
      title={title ?? describeCard(card)}
      {...clickProps(onClick)}
    >
      <div className="swd-card-art"><CardArt name={card.name} color={card.color} symbol={symbol} /></div>
      <div className="swd-card-band"><CardEffects effects={card.effects} size={fitIcon(card.effects, BAND_PX[size], ICON_PX[size])} /></div>
      {(hasCost || card.chainCost) && (
        <div className="swd-card-cost">
          <CostIcons cost={card.cost} size={COST_PX[size]} />
          {card.chainCost ? (
            <span className="swd-card-chainfrom">
              <ChainSymbolIcon symbol={card.chainCost} size={COST_PX[size]} title={`Free if you own ${card.chainFrom}`} />
            </span>
          ) : null}
        </div>
      )}
      {card.chain ? (
        <span className="swd-card-chainto"><ChainSymbolIcon symbol={card.chain} size={COST_PX[size] + 2} title={`Chain symbol: makes a later card free`} /></span>
      ) : null}
      <div className="swd-card-name">{card.name}</div>
    </div>
  );
}

export function CardBack({ age, guild = false, size = 'md', onClick, title, className = '', style, nodeRef }: Clickable & {
  age: 1 | 2 | 3; guild?: boolean; size?: CardSize;
}) {
  return (
    <div
      ref={nodeRef}
      className={`swd-card swd-card-${size} swd-card-back ${className}`}
      style={style}
      title={title ?? (guild ? 'Face-down guild card' : `Face-down Age ${age} card`)}
      {...clickProps(onClick)}
    >
      <CardBackArt age={age} guild={guild} />
    </div>
  );
}

/** A built card tucked into a city: just its colour band and effect icons. */
export function CardBand({ card, nodeRef, onClick, className = '' }: { card: DuelCard; nodeRef?: Ref<HTMLDivElement>; onClick?: () => void; className?: string }) {
  return (
    <div
      ref={nodeRef}
      className={`swd-band ${onClick ? 'clickable' : ''} ${className}`}
      style={{ ['--swd-card' as string]: CARD_HEX[card.color] }}
      title={describeCard(card)}
      {...clickProps(onClick)}
    >
      <CardEffects effects={card.effects} size={fitIcon(card.effects, 60, 17)} />
      {card.chain ? <span className="swd-band-chain"><ChainSymbolIcon symbol={card.chain} size={10} /></span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wonders

export function WonderCard({ wonder, size = 'lg', built = false, buriedAge, onClick, title, className = '', footer, costOverride, nodeRef, tuckRef }: Clickable & {
  wonder: DuelWonder;
  size?: 'lg' | 'sm';
  built?: boolean;
  /** Age of the card tucked under a built wonder. */
  buriedAge?: 1 | 2 | 3;
  footer?: ReactNode;
  /** Show this cost instead of the printed one (e.g. after Architecture). */
  costOverride?: DuelCost;
  /** Ref to the tucked card (animation registration). */
  tuckRef?: Ref<HTMLDivElement>;
}) {
  const icon = size === 'lg' ? 22 : 15;
  const cost = costOverride ?? wonder.cost;
  return (
    <div
      ref={nodeRef}
      className={`swd-wonder swd-wonder-${size} ${built ? 'built' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      title={title ?? `${wonder.name} — ${wonder.description}\nCost: ${costText(wonder.cost)}`}
      {...clickProps(onClick)}
    >
      {built && buriedAge && <div className="swd-wonder-tuck" ref={tuckRef}><CardBackArt age={buriedAge} /></div>}
      <div className="swd-wonder-face">
        <div className="swd-wonder-name">{wonder.name}</div>
        <div className="swd-wonder-art"><WonderArt id={wonder.id} /></div>
        {!built && <div className="swd-wonder-cost"><CostIcons cost={cost} size={size === 'lg' ? 17 : 11} /></div>}
        <div className="swd-wonder-fx"><WonderEffects effects={wonder.effects} size={icon} /></div>
        {built && <div className="swd-wonder-built" aria-label="built">✓</div>}
      </div>
      {footer}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress tokens

export function ProgressToken({ id, size = 44, label = false, onClick, title, className = '', nodeRef }: Clickable & {
  id: DuelProgressTokenId; size?: number; label?: boolean;
}) {
  const t = progressTokenById(id);
  return (
    <div
      ref={nodeRef}
      className={`swd-token ${onClick ? 'clickable' : ''} ${className}`}
      title={title ?? `${t.name} — ${t.description}`}
      {...clickProps(onClick)}
    >
      <ProgressTokenArt id={id} size={size} />
      {label && <span className="swd-token-name">{t.name}</span>}
    </div>
  );
}
