// 7 Wonders — card faces, tucked tableau bands and wonder boards, drawn from
// the art in art.tsx.
//
// A card face follows the printed layout: the effect band across the top in
// the card's colour, the cost down the left of the illustration, the name on
// a ribbon, and the chain links (free-build from / to) underneath. In a city
// cards are tucked so only their effect band shows — `CardBand`.

import type { CSSProperties, ReactNode } from 'react';
import type { SwCard, SwCardColor, SwCardEffect, SwCost, SwResource, SwWonder } from './types';
import { MANUFACTURED_RESOURCES, RAW_RESOURCES } from './types';
import {
  AgeIcon, ArrowIcon, CARD_COLOR_HEX, CardArt, ChainIcon, CoinIcon, ColorChip, DebtIcon, DiplomacyIcon,
  MilitaryToken, ResourceIcon, ScienceIcon, ShieldIcon, VpIcon, WonderArt, WonderPowerIcon, WonderStageIcon,
} from './art';

const ROMAN = ['', 'I', 'II', 'III'] as const;

/** Text colour that reads on each card colour's band. */
const BAND_INK: Record<SwCardColor, string> = {
  brown: '#fff4e0', gray: '#1d1f24', blue: '#fff', yellow: '#2a1c0e', red: '#fff', green: '#fff',
  purple: '#fff', leader: '#2a1c0e', black: '#f3e9d6', orange: '#2a1c0e', navy: '#fff',
};

export function cardStyle(color: SwCardColor): CSSProperties {
  return { ['--sw-card' as string]: CARD_COLOR_HEX[color], ['--sw-card-ink' as string]: BAND_INK[color] };
}

// ---------------------------------------------------------------------------
// Effects as icons

function Per() {
  return <span className="sw-fx-per">/</span>;
}

function Arrow() {
  return <span className="sw-fx-arrow">→</span>;
}

function Scope({ from, size }: { from: 'self' | 'neighbors' | 'all'; size: number }) {
  const s = Math.round(size * 0.7);
  return (
    <span className="sw-fx-scope">
      {from !== 'self' && <ArrowIcon dir="west" size={s} />}
      {from !== 'neighbors' && <ArrowIcon dir="self" size={s} />}
      {from !== 'self' && <ArrowIcon dir="east" size={s} />}
    </span>
  );
}

function Chips({ colors, size }: { colors: readonly SwCardColor[]; size: number }) {
  const s = colors.length > 3 ? Math.round(size * 0.7) : size;
  return <span className="sw-fx-group">{colors.map((c, i) => <ColorChip key={i} color={c} size={s} />)}</span>;
}

const ALL_SEVEN: SwCardColor[] = ['brown', 'gray', 'blue', 'yellow', 'red', 'green', 'purple'];

function Trade({ sides, goods, size }: { sides: ('east' | 'west' | 'both')[]; goods: readonly SwResource[]; size: number }) {
  const west = sides.some((s) => s === 'west' || s === 'both');
  const east = sides.some((s) => s === 'east' || s === 'both');
  const g = Math.round(size * 0.62);
  return (
    <span className="sw-fx-trade" title={`Buy ${goods === RAW_RESOURCES ? 'raw materials' : 'manufactured goods'} for 1 coin from ${west && east ? 'both neighbours' : west ? 'your west neighbour' : 'your east neighbour'}`}>
      {west && <ArrowIcon dir="west" size={Math.round(size * 0.75)} />}
      <span className="sw-fx-goods" style={{ gridTemplateColumns: `repeat(${goods.length > 3 ? 2 : goods.length}, auto)` }}>
        {goods.map((r) => <ResourceIcon key={r} r={r} size={g} />)}
      </span>
      <CoinIcon n={1} size={size} />
      {east && <ArrowIcon dir="east" size={Math.round(size * 0.75)} />}
    </span>
  );
}

function effectIcons(e: SwCardEffect, size: number): ReactNode {
  switch (e.kind) {
    case 'produce':
      return e.production.map((opts, i) => (
        opts.length === 1
          ? <ResourceIcon key={i} r={opts[0]} size={size} />
          : (
            <span key={i} className="sw-fx-choice">
              {opts.map((r, k) => (
                <span key={r} className="sw-fx-group">{k > 0 && <span className="sw-fx-or">/</span>}<ResourceIcon r={r} size={opts.length > 3 ? Math.round(size * 0.78) : size} /></span>
              ))}
            </span>
          )
      ));
    case 'coins': return <CoinIcon n={e.amount} size={size} />;
    case 'shields':
      return e.shields <= 4
        ? Array.from({ length: e.shields }, (_, i) => <ShieldIcon key={i} size={size} />)
        : <span className="sw-fx-group"><ShieldIcon size={size} /><span className="sw-fx-text">×{e.shields}</span></span>;
    case 'vp': return <VpIcon n={e.vp} size={size} />;
    case 'science': return <ScienceIcon s={e.symbol} size={size} />;
    case 'scienceWild': return <ScienceIcon s="any" size={size} />;
    case 'buildFromDiscard':
    case 'playLastCard':
    case 'freeBuildPerAge':
    case 'copyGuild':
      return <WonderPowerIcon power={e.kind} size={size} />;
    case 'tradeDiscountRaw': return <Trade sides={e.sides} goods={RAW_RESOURCES} size={size} />;
    case 'tradeDiscountManufactured': return <Trade sides={e.sides} goods={MANUFACTURED_RESOURCES} size={size} />;
    case 'endVp': {
      const what = e.countWhat.kind === 'cardColor' ? <ColorChip color={e.countWhat.color} size={size} />
        : e.countWhat.kind === 'wonderStages' ? <WonderStageIcon size={size} />
        : <MilitaryToken value={-1} size={size} />;
      return (
        <span className="sw-fx-group">
          {e.coinsPerOnPlay ? <CoinIcon n={e.coinsPerOnPlay} size={size} /> : null}
          {e.vpPer ? <VpIcon n={e.vpPer} size={size} /> : null}
          <Per />
          <Scope from={e.from} size={size} />
          {what}
        </span>
      );
    }
    case 'citiesDebtToNeighbors':
      return <span className="sw-fx-group"><Scope from="neighbors" size={size} /><DebtIcon n={e.amount} size={size} /></span>;
    case 'citiesGainDiplomacy':
      return Array.from({ length: e.amount }, (_, i) => <DiplomacyIcon key={i} size={size} />);
    case 'citiesScoreExtra':
      switch (e.rule.type) {
        case 'completeAllColorsSet': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPerSet} size={size} /><Per /><Chips colors={ALL_SEVEN} size={size} /></span>;
        case 'vpPerDebtTotal': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPer} size={size} /><Per /><Scope from="all" size={size} /><DebtIcon size={size} /></span>;
        case 'coinsPerDebtTotal': return <span className="sw-fx-group"><CoinIcon size={size} /><Per /><Scope from="all" size={size} /><DebtIcon size={size} /></span>;
      }
      return null;
    case 'babelScoreExtra':
      switch (e.rule.type) {
        case 'vpPerScienceSet':
          return (
            <span className="sw-fx-group">
              <VpIcon n={e.rule.vpPerSet} size={size} /><Per />
              <ScienceIcon s="compass" size={Math.round(size * 0.8)} /><ScienceIcon s="gear" size={Math.round(size * 0.8)} /><ScienceIcon s="tablet" size={Math.round(size * 0.8)} />
            </span>
          );
        case 'vpPerNeighborCards': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPer} size={size} /><Per /><Scope from="neighbors" size={size} /><ColorChip color={e.rule.color} size={size} /></span>;
        case 'vpPerOwnColors': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPer} size={size} /><Per /><Chips colors={e.rule.colors} size={size} /></span>;
      }
      return null;
    case 'armadaScoreExtra':
      switch (e.rule.type) {
        case 'vpPerNeighborMilitaryLosses': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPer} size={size} /><Per /><Scope from="neighbors" size={size} /><MilitaryToken value={-1} size={size} /></span>;
        case 'vpPerOwnAgeIIIBuilds': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPer} size={size} /><Per /><AgeIcon age={3} size={size} /></span>;
        case 'vpPerOwnNavalSet': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPerSet} size={size} /><Per /><Chips colors={['red', 'blue', 'green', 'yellow']} size={size} /></span>;
      }
      return null;
    case 'leaderCostModifier': {
      const target = e.target === 'cardColor' && e.targetColor ? <ColorChip color={e.targetColor} size={size} />
        : e.target === 'wonderStage' ? <WonderStageIcon size={size} />
        : e.target === 'guild' ? <ColorChip color="purple" size={size} />
        : <ColorChip color="leader" size={size} />;
      const label = e.remove === 'oneResource' ? '−1 resource' : e.remove === 'allResources' ? 'no resources' : 'no coins';
      return <span className="sw-fx-group">{target}<span className="sw-fx-text">{label}</span></span>;
    }
    case 'leaderTrigger': {
      const on = e.on.type === 'buildCardColor' ? <ColorChip color={e.on.color} size={size} />
        : e.on.type === 'buildViaChain' ? <ChainIcon size={size} />
        : e.on.type === 'militaryWin' ? <MilitaryToken value={1} size={size} />
        : <Scope from="neighbors" size={size} />;
      return <span className="sw-fx-group">{on}<Arrow /><CoinIcon n={e.reward.coins ?? 0} size={size} /></span>;
    }
    case 'leaderScoreExtra':
      switch (e.rule.type) {
        case 'completeScienceSet':
          return (
            <span className="sw-fx-group">
              <VpIcon n={e.rule.vpPerSet} size={size} /><Per />
              <ScienceIcon s="compass" size={Math.round(size * 0.8)} /><ScienceIcon s="gear" size={Math.round(size * 0.8)} /><ScienceIcon s="tablet" size={Math.round(size * 0.8)} />
            </span>
          );
        case 'completeRGBSet': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPerSet} size={size} /><Per /><Chips colors={['red', 'blue', 'green']} size={size} /></span>;
        case 'completeAllColorsSet': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPerSet} size={size} /><Per /><Chips colors={ALL_SEVEN} size={size} /></span>;
        case 'midasCoinBonus': return <span className="sw-fx-group"><VpIcon n={1} size={size} /><Per /><CoinIcon n={3} size={size} /></span>;
        case 'alexanderTokenBonus': return <span className="sw-fx-group"><VpIcon n={1} size={size} /><Per /><MilitaryToken value={1} size={size} /></span>;
      }
      return null;
    case 'leaderActivated':
      return <span className="sw-fx-group"><CoinIcon n={1} size={size} /><Arrow /><span className="sw-fx-text">any resource</span></span>;
    case 'leaderOnRecruit':
      return <span className="sw-fx-text">build from discard</span>;
  }
}

/** A row of effect icons. */
export function EffectIcons({ effects, size = 18 }: { effects: readonly SwCardEffect[]; size?: number }) {
  return <span className="sw-fx">{effects.map((e, i) => <span key={i} className="sw-fx-group">{effectIcons(e, size)}</span>)}</span>;
}

export function hasEffectIcons(card: Pick<SwCard, 'effects'>): boolean {
  return card.effects.length > 0;
}

/** Resources (and coins) of a cost, one icon per unit. */
export function CostIcons({ cost, size = 16, free = false }: { cost: SwCost; size?: number; free?: boolean }) {
  const res = cost.resources ?? [];
  if (!cost.coins && res.length === 0) return free ? <span className="sw-fx-text sw-free">free</span> : null;
  return (
    <span className="sw-fx">
      {cost.coins ? <CoinIcon n={cost.coins} size={size} /> : null}
      {res.map((r, i) => <ResourceIcon key={i} r={r} size={size} />)}
    </span>
  );
}

/** Plain-text summary of a card's effects (tooltips, logs). */
export function cardEffectsText(c: Pick<SwCard, 'effects' | 'name'>): string {
  const parts: string[] = [];
  for (const eff of c.effects) {
    if (eff.kind === 'vp') parts.push(`+${eff.vp} VP`);
    else if (eff.kind === 'coins') parts.push(`+${eff.amount} coins`);
    else if (eff.kind === 'shields') parts.push(`+${eff.shields} shield${eff.shields === 1 ? '' : 's'}`);
    else if (eff.kind === 'science') parts.push(`science: ${eff.symbol}`);
    else if (eff.kind === 'scienceWild') parts.push('a science symbol of your choice');
    else if (eff.kind === 'produce') parts.push(eff.production.map((opts) => opts.join('/')).join(' + '));
    else if (eff.kind === 'tradeDiscountRaw') parts.push(`raw materials cost 1 coin (${eff.sides.join('/')})`);
    else if (eff.kind === 'tradeDiscountManufactured') parts.push(`manufactured goods cost 1 coin (${eff.sides.join('/')})`);
    else if (eff.kind === 'endVp') {
      const what =
        eff.countWhat.kind === 'cardColor' ? `${eff.countWhat.color} card`
        : eff.countWhat.kind === 'wonderStages' ? 'wonder stage'
        : 'defeat token';
      const scope = eff.from === 'self' ? 'yours' : eff.from === 'neighbors' ? "neighbours'" : 'yours and neighbours\'';
      const bits: string[] = [];
      if (eff.coinsPerOnPlay) bits.push(`+${eff.coinsPerOnPlay} coin${eff.coinsPerOnPlay === 1 ? '' : 's'} now`);
      if (eff.vpPer) bits.push(`+${eff.vpPer} VP at the end`);
      parts.push(`${bits.join(' and ')} per ${what} (${scope})`);
    }
    else if (eff.kind === 'citiesDebtToNeighbors') parts.push(`each neighbour takes ${eff.amount} debt`);
    else if (eff.kind === 'citiesGainDiplomacy') parts.push(`+${eff.amount} diplomacy`);
  }
  return parts.join(' · ') || '—';
}

// ---------------------------------------------------------------------------
// Card face

export type CardStatus =
  | { kind: 'free' }
  | { kind: 'chain' }
  | { kind: 'pay'; coins: number }
  | { kind: 'blocked'; reason: string }
  | { kind: 'owned' };

function StatusBadge({ status }: { status: CardStatus }) {
  switch (status.kind) {
    case 'free': return <span className="sw-cf-status ok" title="You can build this for free">Free</span>;
    case 'chain': return <span className="sw-cf-status ok" title="Free: you own its chain card"><ChainIcon size={12} />Free</span>;
    case 'pay': return <span className="sw-cf-status pay" title={`Building costs ${status.coins} coin${status.coins === 1 ? '' : 's'} in total`}><CoinIcon n={status.coins} size={14} /></span>;
    case 'blocked': return <span className="sw-cf-status no" title={status.reason}>✕</span>;
    case 'owned': return <span className="sw-cf-status no" title="You already built one">Built</span>;
  }
}

export function CardFace({
  card, size = 'lg', selected, disabled, status, text, onClick, title, className = '',
}: {
  card: SwCard;
  size?: 'lg' | 'md';
  selected?: boolean;
  disabled?: boolean;
  status?: CardStatus;
  /** Rules text shown under the art (leaders, whose effects don't fit icons). */
  text?: ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  const icon = size === 'lg' ? 18 : 15;
  const hasCost = !!card.cost.coins || (card.cost.resources?.length ?? 0) > 0;
  const cls = [
    'sw-cardface', `sw-cardface-${size}`, `sw-c-${card.color}`,
    onClick && !disabled ? 'clickable' : '', selected ? 'selected' : '', disabled ? 'disabled' : '', className,
  ].filter(Boolean).join(' ');
  return (
    <div
      className={cls}
      style={cardStyle(card.color)}
      onClick={disabled ? undefined : onClick}
      title={title ?? `${card.name} — ${cardEffectsText(card)}`}
      role={onClick ? 'button' : undefined}
      aria-pressed={onClick ? !!selected : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={onClick && !disabled ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="sw-cf-band">
        {hasEffectIcons(card) ? <EffectIcons effects={card.effects} size={icon} /> : <span className="sw-fx-text">special</span>}
      </div>
      <div className="sw-cf-art">
        <CardArt card={card} />
        {hasCost && (
          <div className="sw-cf-cost">
            {card.cost.coins ? <CoinIcon n={card.cost.coins} size={icon - 3} /> : null}
            {(card.cost.resources ?? []).map((r, i) => <ResourceIcon key={i} r={r} size={icon - 3} />)}
          </div>
        )}
        {card.color !== 'leader' && <span className="sw-cf-age">{ROMAN[card.age]}</span>}
        {status && <StatusBadge status={status} />}
      </div>
      {text && <div className="sw-cf-text">{text}</div>}
      <div className="sw-cf-name">{card.name}</div>
      {(card.chainFrom?.length || card.chainTo?.length) ? (
        <div className="sw-cf-chain">
          {card.chainFrom?.length ? <span title={`Free if you own ${card.chainFrom.join(' or ')}`}><ChainIcon size={11} />{card.chainFrom.join(' / ')}</span> : <span />}
          {card.chainTo?.length ? <span title={`Makes ${card.chainTo.join(' and ')} free`}>→ {card.chainTo.join(' / ')}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A tucked card: only the coloured effect band shows. `fresh`: built on the
 *  last turn — it pops in and glows for a moment. */
export function CardBand({ card, size = 'md', fresh = false }: { card: SwCard; size?: 'md' | 'sm'; fresh?: boolean }) {
  const icon = size === 'md' ? 17 : 13;
  return (
    <div className={`sw-band sw-band-${size} sw-c-${card.color}${fresh ? ' sw-fresh' : ''}`} style={cardStyle(card.color)} title={`${card.name} — ${cardEffectsText(card)}`}>
      {hasEffectIcons(card)
        ? <EffectIcons effects={card.effects} size={icon} />
        : <span className="sw-band-name">{card.name}</span>}
    </div>
  );
}

/** Cards of a city, tucked by colour into columns in the printed colour order. */
export const TABLEAU_ORDER: SwCardColor[] = ['brown', 'gray', 'yellow', 'red', 'green', 'blue', 'purple', 'black', 'orange', 'navy', 'leader'];

export function TableauColumns({ cards, size = 'md', fresh }: { cards: SwCard[]; size?: 'md' | 'sm'; fresh?: ReadonlySet<number> }) {
  return (
    <div className={`sw-city sw-city-${size}`}>
      {TABLEAU_ORDER.map((color) => {
        const col = cards.filter((c) => c.color === color);
        if (col.length === 0) return null;
        return (
          <div key={color} className="sw-city-col">
            {col.map((c) => <CardBand key={c.id} card={c} size={size} fresh={fresh?.has(c.id)} />)}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wonder board

const POWERS = new Set<SwCardEffect['kind']>(['buildFromDiscard', 'playLastCard', 'freeBuildPerAge', 'copyGuild', 'scienceWild']);

/** `fresh`: the last built stage went up on the last turn (it glows). */
export function WonderBoard({ wonder, built, highlightNext = false, fresh = false }: { wonder: SwWonder; built: number; highlightNext?: boolean; fresh?: boolean }) {
  return (
    <div className="sw-wboard">
      <div className="sw-wboard-art">
        <WonderArt wonder={wonder} />
        <div className="sw-wboard-title">
          <span className="sw-wboard-res" title="Starting resource">
            {wonder.initialProduction.map((opts, i) => <ResourceIcon key={i} r={opts[0]} size={22} />)}
          </span>
          <span className="sw-wboard-name">{wonder.name}</span>
          <span className="sw-wboard-side">{wonder.side}</span>
        </div>
      </div>
      <div className="sw-wboard-stages">
        {wonder.stages.map((stage, i) => {
          const isBuilt = i < built;
          const isNext = highlightNext && i === built;
          // Powers don't read from an icon alone: spell them out.
          const showText = stage.effects.length === 0 || stage.effects.some((e) => POWERS.has(e.kind));
          return (
            <div key={i} className={`sw-wstage ${isBuilt ? 'built' : ''} ${isNext ? 'next' : ''} ${fresh && i === built - 1 ? 'sw-fresh' : ''}`} title={`Stage ${i + 1}: ${stage.text}`}>
              <div className="sw-wstage-cost"><CostIcons cost={stage.cost} size={17} /></div>
              <div className="sw-wstage-fx">
                {stage.effects.length > 0 && <EffectIcons effects={stage.effects} size={26} />}
                {showText && <span className="sw-wstage-text">{stage.text}</span>}
              </div>
              {isBuilt && <span className="sw-wstage-done" aria-label="built">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A small strip of a neighbour's wonder with built-stage pips. */
export function WonderMini({ wonder, built, fresh = false }: { wonder: SwWonder; built: number; fresh?: boolean }) {
  return (
    <div className="sw-wmini" title={`${wonder.name} (${wonder.side}) — ${built}/${wonder.stages.length} stages built`}>
      <WonderArt wonder={wonder} />
      <div className="sw-wmini-bar">
        <span className="sw-wmini-name">{wonder.name.replace(/^(Pyramids|Colossus|Lighthouse|Temple|Statue of Zeus|Mausoleum|Hanging Gardens) (of|at) /, '')}</span>
        <span className="sw-wmini-pips">
          {wonder.stages.map((_, i) => <span key={i} className={`${i < built ? 'on' : ''}${fresh && i === built - 1 ? ' sw-fresh' : ''}`} />)}
        </span>
      </div>
    </div>
  );
}
