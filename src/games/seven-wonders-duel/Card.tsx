// 7 Wonders Duel — card, wonder and progress-token views built on art.tsx.
//
// Cards follow the printed Duel layout: a colour frame, the effect in the top
// band, the cost down the left edge (a chain link when another card makes it
// free), the illustration and the name at the bottom. In the pyramid only the
// top ~40 % of a covered card shows — band and first costs — as on the table.
// Tucked cards in a city show just their band (`CardBand`).

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import type {
  DuelCard, DuelCardEffect, DuelCost, DuelProduction, DuelProgressTokenId, DuelWonder, DuelWonderStageEffect,
} from './types';
import { progressTokenById } from './progress';
import {
  CARD_HEX, CardArt, CardBackArt, ChainIcon, ChipGlyph, CoinGlyph, CoinIcon, DiscardPickGlyph, ExtraTurnGlyph,
  Icon, LaurelIcon, ProgressTokenArt, ResourceIcon, ScienceIcon, ShieldIcon, TradeGlyph, WonderArt, WonderGlyph,
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
      case 'tradeDiscountRaw': case 'tradeDiscountManufactured': u += 2.25; break;
      case 'endVp': u += (eff.coinsPerOnPlay ? 1 : 0) + (eff.vpPer ? 1 : 0) + 1.45; break;
      case 'gainCoinsPerCardColor': u += 2.45; break;
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
    <span className="swd-choice" title={`one of ${opts.join(' / ')}`}>
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

/** Trade discount: "these resources = 1 coin". */
function Trade({ kind, size }: { kind: 'raw' | 'manufactured'; size: number }) {
  const what = kind === 'raw' ? 'Raw resources (wood, stone, clay)' : 'Manufactured resources (glass, papyrus)';
  return (
    <span className="swd-per" title={`${what} cost 1 coin`}>
      <Icon size={size}><TradeGlyph kind={kind} /></Icon>
      <span className="swd-slash">=</span>
      <CoinIcon value={1} size={size * 0.8} title="1 coin" />
    </span>
  );
}

type EndVp = Extract<DuelCardEffect, { kind: 'endVp' }>;

function EndVpIcons({ eff, size }: { eff: EndVp; size: number }) {
  const w = eff.countWhat;
  const target = w.kind === 'cardColor'
    ? <Icon size={size} title={`${w.color} card`}><ChipGlyph color={w.color} both={eff.from === 'both'} /></Icon>
    : w.kind === 'wonderStages'
    ? <Icon size={size} title="wonder"><WonderGlyph /></Icon>
    : <Icon size={size} title="3 coins"><CoinGlyph value={3} /></Icon>;
  return (
    <span className="swd-per" title={endVpText(eff)}>
      {eff.coinsPerOnPlay ? <CoinIcon value={eff.coinsPerOnPlay} size={size} /> : null}
      {eff.vpPer ? <LaurelIcon value={eff.vpPer} size={size} /> : null}
      <span className="swd-slash">/</span>
      {target}
    </span>
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
      case 'tradeDiscountRaw':
      case 'tradeDiscountManufactured':
        out.push(<Trade key={i} kind={eff.kind === 'tradeDiscountRaw' ? 'raw' : 'manufactured'} size={size} />);
        break;
      case 'endVp': out.push(<EndVpIcons key={i} eff={eff} size={size} />); break;
      case 'forceOpponentDiscardCoins': out.push(<CoinIcon key={i} value={eff.amount} negative size={size} />); break;
      case 'gainCoinsPerCardColor':
        out.push(
          <span key={i} className="swd-per" title={`${eff.per} coin(s) per ${eff.color} card`}>
            <CoinIcon value={eff.per} size={size} />
            <span className="swd-slash">/</span>
            <Icon size={size} title={`${eff.color} card`}><ChipGlyph color={eff.color} /></Icon>
          </span>,
        );
        break;
    }
  });
  return <>{out}</>;
}

/** The icons for a wonder's effects. */
export function WonderEffects({ effects, size }: { effects: DuelWonderStageEffect[]; size: number }) {
  const out: ReactNode[] = [];
  effects.forEach((eff, i) => {
    switch (eff.kind) {
      case 'vp': out.push(<LaurelIcon key={i} value={eff.vp ?? 0} size={size} />); break;
      case 'coins': out.push(<CoinIcon key={i} value={eff.coins ?? eff.amount ?? 0} size={size} />); break;
      case 'shields': out.push(<Shields key={i} n={eff.shields ?? 0} size={size} />); break;
      case 'produce': (eff.production ?? []).forEach((opts, j) => out.push(<Production key={`${i}.${j}`} opts={opts} size={size} />)); break;
      case 'science': if (eff.symbol) out.push(<ScienceIcon key={i} symbol={eff.symbol} size={size} />); break;
      case 'tradeDiscountRaw': out.push(<Trade key={i} kind="raw" size={size} />); break;
      case 'tradeDiscountManufactured': out.push(<Trade key={i} kind="manufactured" size={size} />); break;
      case 'forceOpponentDiscardCoins': out.push(<CoinIcon key={i} value={eff.amount ?? 0} negative size={size} />); break;
      case 'extraTurn': out.push(<Icon key={i} size={size} title="Play again (not modelled yet)"><ExtraTurnGlyph /></Icon>); break;
      case 'pickFromDiscard': out.push(<Icon key={i} size={size} title="Discard-pile effect (not modelled yet)"><DiscardPickGlyph /></Icon>); break;
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

function endVpText(eff: EndVp): string {
  const w = eff.countWhat;
  const what = w.kind === 'cardColor' ? `${w.color} card` : w.kind === 'wonderStages' ? 'wonder built' : '3 coins';
  const where = eff.from === 'self' ? 'in your city' : eff.from === 'opponent' ? "in your opponent's city" : 'in both cities';
  const parts: string[] = [];
  if (eff.coinsPerOnPlay) parts.push(`${eff.coinsPerOnPlay} coin${eff.coinsPerOnPlay === 1 ? '' : 's'} now`);
  if (eff.vpPer) parts.push(`${eff.vpPer} VP at the end`);
  return `${parts.join(' and ')} per ${what} ${where}`;
}

export function effectText(eff: DuelCardEffect): string {
  switch (eff.kind) {
    case 'produce': return `Produces ${eff.production.map((o) => o.join(' or ')).join(' + ')}`;
    case 'coins': return `+${eff.amount} coins`;
    case 'shields': return `${eff.shields} shield${eff.shields === 1 ? '' : 's'}`;
    case 'vp': return `${eff.vp} VP`;
    case 'science': return `Science: ${eff.symbol}`;
    case 'tradeDiscountRaw': return 'Raw resources cost 1 coin';
    case 'tradeDiscountManufactured': return 'Manufactured resources cost 1 coin';
    case 'endVp': return endVpText(eff);
    case 'forceOpponentDiscardCoins': return `Opponent loses ${eff.amount} coins`;
    case 'gainCoinsPerCardColor': return `${eff.per} coin(s) per ${eff.color} card`;
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
  if (card.chainFrom?.length) lines.push(`Free if you own ${card.chainFrom.join(' or ')}`);
  if (card.chainTo?.length) lines.push(`Makes ${card.chainTo.join(' / ')} free`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Card face / back / tucked band

interface Clickable {
  onClick?: () => void;
  title?: string;
  className?: string;
  style?: CSSProperties;
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

export function CardFace({ card, size = 'md', onClick, title, className = '', style }: Clickable & { card: DuelCard; size?: CardSize }) {
  const science = card.effects.find((e) => e.kind === 'science');
  const symbol = science && science.kind === 'science' ? science.symbol : undefined;
  const hasCost = !!card.cost.coins || (card.cost.resources?.length ?? 0) > 0;
  return (
    <div
      className={`swd-card swd-card-${size} ${card.name.length > 14 ? 'swd-name-long' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      style={{ ['--swd-card' as string]: CARD_HEX[card.color], ...style }}
      title={title ?? describeCard(card)}
      {...clickProps(onClick)}
    >
      <div className="swd-card-art"><CardArt name={card.name} color={card.color} symbol={symbol} /></div>
      <div className="swd-card-band"><CardEffects effects={card.effects} size={fitIcon(card.effects, BAND_PX[size], ICON_PX[size])} /></div>
      {(hasCost || card.chainFrom?.length) && (
        <div className="swd-card-cost">
          <CostIcons cost={card.cost} size={COST_PX[size]} />
          {card.chainFrom?.length ? (
            <span className="swd-card-chainfrom"><ChainIcon size={COST_PX[size]} title={`Free if you own ${card.chainFrom.join(' or ')}`} /></span>
          ) : null}
        </div>
      )}
      {card.chainTo?.length ? (
        <span className="swd-card-chainto"><ChainIcon size={COST_PX[size]} title={`Makes ${card.chainTo.join(' / ')} free`} /></span>
      ) : null}
      <div className="swd-card-name">{card.name}</div>
    </div>
  );
}

export function CardBack({ age, guild = false, size = 'md', onClick, title, className = '', style }: Clickable & {
  age: 1 | 2 | 3; guild?: boolean; size?: CardSize;
}) {
  return (
    <div
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
export function CardBand({ card }: { card: DuelCard }) {
  return (
    <div className="swd-band" style={{ ['--swd-card' as string]: CARD_HEX[card.color] }} title={describeCard(card)}>
      <CardEffects effects={card.effects} size={fitIcon(card.effects, 60, 17)} />
      {card.chainTo?.length ? <span className="swd-band-chain"><ChainIcon size={10} title={`Makes ${card.chainTo.join(' / ')} free`} /></span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wonders

export function WonderCard({ wonder, size = 'lg', built = false, buriedAge, onClick, title, className = '', footer, costOverride }: Clickable & {
  wonder: DuelWonder;
  size?: 'lg' | 'sm';
  built?: boolean;
  /** Age of the card tucked under a built wonder. */
  buriedAge?: 1 | 2 | 3;
  footer?: ReactNode;
  /** Show this cost instead of the printed one (e.g. after Architecture). */
  costOverride?: DuelCost;
}) {
  const icon = size === 'lg' ? 22 : 15;
  const cost = costOverride ?? wonder.cost;
  return (
    <div
      className={`swd-wonder swd-wonder-${size} ${built ? 'built' : ''} ${onClick ? 'clickable' : ''} ${className}`}
      title={title ?? `${wonder.name} — ${wonder.description}\nCost: ${costText(wonder.cost)}`}
      {...clickProps(onClick)}
    >
      {built && buriedAge && <div className="swd-wonder-tuck"><CardBackArt age={buriedAge} /></div>}
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

export function ProgressToken({ id, size = 44, label = false, onClick, title, className = '' }: Clickable & {
  id: DuelProgressTokenId; size?: number; label?: boolean;
}) {
  const t = progressTokenById(id);
  return (
    <div
      className={`swd-token ${onClick ? 'clickable' : ''} ${className}`}
      title={title ?? `${t.name} — ${t.description}`}
      {...clickProps(onClick)}
    >
      <ProgressTokenArt id={id} size={size} />
      {label && <span className="swd-token-name">{t.name}</span>}
    </div>
  );
}
