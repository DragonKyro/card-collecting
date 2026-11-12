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
  ArrowIcon, CARD_COLOR_HEX, CardArt, ChainIcon, CoinIcon, ColorChip, DiplomacyIcon, LossIcon, MaskIcon,
  MilitaryToken, ResourceIcon, ScienceIcon, ShieldIcon, VpIcon, WonderArt, WonderPowerIcon, WonderStageIcon,
} from './art';

const ROMAN = ['', 'I', 'II', 'III'] as const;

/** Text colour that reads on each card colour's band. */
const BAND_INK: Record<SwCardColor, string> = {
  brown: '#fff4e0', gray: '#1d1f24', blue: '#fff', yellow: '#2a1c0e', red: '#fff', green: '#fff',
  purple: '#fff', leader: '#2a1c0e', black: '#f3e9d6',
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
      const w = e.countWhat;
      const what = w.kind === 'cardColor' ? <ColorChip color={w.color} size={size} />
        : w.kind === 'wonderStages' ? <WonderStageIcon size={size} />
        : w.kind === 'victoryTokens' ? <MilitaryToken value={1} size={size} />
        : w.kind === 'leaders' ? <ColorChip color="leader" size={size} />
        : w.kind === 'coinSets' ? <CoinIcon n={3} size={size} />
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
    case 'coinLoss':
      return (
        <span className="sw-fx-group" title={`Every other city loses ${e.amount} coin${e.amount === 1 ? '' : 's'}${e.per === 'victoryToken' ? ' per victory token' : e.per === 'wonderStage' ? ' per wonder stage' : ''}`}>
          <LossIcon n={e.amount} size={size} />
          {e.per === 'victoryToken' && <><Per /><MilitaryToken value={1} size={size} /></>}
          {e.per === 'wonderStage' && <><Per /><WonderStageIcon size={size} /></>}
        </span>
      );
    case 'neighborsGain':
      return <span className="sw-fx-group" title={`Each neighbour takes ${e.amount} coin${e.amount === 1 ? '' : 's'}`}><Scope from="neighbors" size={size} /><CoinIcon n={e.amount} size={Math.round(size * 0.8)} /></span>;
    case 'diplomacy': return <DiplomacyIcon size={size} />;
    case 'mask': return <MaskIcon size={size} />;
    case 'tradeRebate':
      return (
        <span className="sw-fx-group" title={`The first resource you buy from your ${e.side} neighbour each turn costs 1 coin less`}>
          {e.side === 'west' && <ArrowIcon dir="west" size={Math.round(size * 0.75)} />}
          <CoinIcon n="−1" size={size} />
          {e.side === 'east' && <ArrowIcon dir="east" size={Math.round(size * 0.75)} />}
        </span>
      );
    case 'produceOwned':
      return <span className="sw-fx-group" title="One more of a resource your brown / gray cards or board produce"><ResourceIcon r="wood" size={Math.round(size * 0.8)} /><span className="sw-fx-text">+1 yours</span></span>;
    case 'produceMissing':
      return <span className="sw-fx-group" title="One resource your brown / gray cards and board don't produce"><ResourceIcon r="glass" size={Math.round(size * 0.8)} /><span className="sw-fx-text">+1 missing</span></span>;
    case 'freeWonderResources':
      return <span className="sw-fx-group" title="Wonder stages cost no resources"><WonderStageIcon size={size} /><span className="sw-fx-text">no resources</span></span>;
    case 'costDiscount':
      return (
        <span className="sw-fx-group" title="One resource less (your choice)">
          {e.target === 'wonderStage' ? <WonderStageIcon size={size} /> : <ColorChip color={e.color ?? 'brown'} size={size} />}
          <span className="sw-fx-text">−1 resource</span>
        </span>
      );
    case 'freeGuildResources':
      return <span className="sw-fx-group"><ColorChip color="purple" size={size} /><span className="sw-fx-text">no resources</span></span>;
    case 'freeLeaders':
      return <span className="sw-fx-group"><ColorChip color="leader" size={size} /><span className="sw-fx-text">free</span></span>;
    case 'leaderRebate':
      return <span className="sw-fx-group"><ColorChip color="leader" size={size} /><CoinIcon n={`−${e.self}`} size={size} /><Scope from="neighbors" size={size} /><CoinIcon n={`−${e.neighbors}`} size={Math.round(size * 0.8)} /></span>;
    case 'trigger': {
      const on = e.on.type === 'buildCardColor' ? <ColorChip color={e.on.color} size={size} />
        : e.on.type === 'buildViaChain' ? <ChainIcon size={size} />
        : e.on.type === 'victoryToken' ? <MilitaryToken value={1} size={size} />
        : <Scope from="neighbors" size={size} />;
      return <span className="sw-fx-group">{on}<Arrow /><CoinIcon n={e.coins} size={size} /></span>;
    }
    case 'scoreRule':
      switch (e.rule.type) {
        case 'completeRGBSet': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPerSet} size={size} /><Per /><Chips colors={['red', 'blue', 'green']} size={size} /></span>;
        case 'completeAllColorsSet': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPerSet} size={size} /><Per /><Chips colors={ALL_SEVEN} size={size} /></span>;
        case 'vpPerCoinSet': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPer} size={size} /><Per /><CoinIcon n={3} size={size} /></span>;
        case 'vpPerVictoryToken': return <span className="sw-fx-group"><VpIcon n={e.rule.vpPer} size={size} /><Per /><MilitaryToken value={1} size={size} /></span>;
      }
      return null;
    case 'scienceSetBonus':
      return (
        <span className="sw-fx-group">
          <VpIcon n={`+${e.vp}`} size={size} /><Per />
          <ScienceIcon s="compass" size={Math.round(size * 0.8)} /><ScienceIcon s="gear" size={Math.round(size * 0.8)} /><ScienceIcon s="tablet" size={Math.round(size * 0.8)} />
        </span>
      );
    case 'buyAnyResource':
      return <span className="sw-fx-group" title="Once a turn, buy any resource from the bank for 1 coin"><CoinIcon n={1} size={size} /><Arrow /><span className="sw-fx-text">any resource</span></span>;
    case 'buildFromDiscardOnRecruit': return <WonderPowerIcon power="buildFromDiscard" size={size} />;
    case 'defeatToVictor':
      return <span className="sw-fx-group" title="Your defeat tokens go to the victor"><MilitaryToken value={-1} size={size} /><Arrow /><Scope from="neighbors" size={size} /></span>;
    case 'defeatAsShield':
      return <span className="sw-fx-group" title="Each defeat token counts as a shield"><MilitaryToken value={-1} size={size} /><span className="sw-fx-text">=</span><ShieldIcon size={size} /></span>;
    case 'bankBonus':
      return <span className="sw-fx-group" title="Once a turn, +1 on coins from the bank"><CoinIcon n="+1" size={size} /></span>;
    case 'freeColorPerAge':
      return <span className="sw-fx-group" title={`One ${e.color} card per Age for free`}><ColorChip color={e.color} size={size} /><span className="sw-fx-text">free / Age</span></span>;
    case 'copyLeader':
      return <span className="sw-fx-group" title="Copy a neighbour's leader"><Scope from="neighbors" size={size} /><ColorChip color="leader" size={size} /><span className="sw-fx-text">copy</span></span>;
    case 'drawLeaders':
      return <span className="sw-fx-group" title={`Draw ${e.count} leaders`}><ColorChip color="leader" size={size} /><span className="sw-fx-text">+{e.count}</span></span>;
    case 'recruitNow':
      return <span className="sw-fx-group" title="Recruit a leader now"><ColorChip color="leader" size={size} /><span className="sw-fx-text">now</span></span>;
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

/** Plain-text summary of one effect. */
export function effectText(eff: SwCardEffect): string {
  switch (eff.kind) {
    case 'vp': return `+${eff.vp} VP`;
    case 'coins': return `+${eff.amount} coins`;
    case 'shields': return `+${eff.shields} shield${eff.shields === 1 ? '' : 's'}`;
    case 'science': return `science: ${eff.symbol}`;
    case 'scienceWild': return 'a science symbol of your choice';
    case 'produce': return eff.production.map((opts) => opts.join('/')).join(' + ');
    case 'tradeDiscountRaw': return `raw materials cost 1 coin (${eff.sides.join('/')})`;
    case 'tradeDiscountManufactured': return `manufactured goods cost 1 coin (${eff.sides.join('/')})`;
    case 'endVp': {
      const w = eff.countWhat;
      const what = w.kind === 'cardColor' ? `${w.color} card` : w.kind === 'wonderStages' ? 'wonder stage'
        : w.kind === 'victoryTokens' ? 'victory token' : w.kind === 'leaders' ? 'recruited leader'
        : w.kind === 'coinSets' ? '3 coins' : 'defeat token';
      const scope = eff.from === 'self' ? 'yours' : eff.from === 'neighbors' ? "neighbours'" : "yours and neighbours'";
      const bits: string[] = [];
      if (eff.coinsPerOnPlay) bits.push(`+${eff.coinsPerOnPlay} coin${eff.coinsPerOnPlay === 1 ? '' : 's'} now`);
      if (eff.vpPer) bits.push(`+${eff.vpPer} VP at the end`);
      return `${bits.join(' and ')} per ${what} (${scope})`;
    }
    case 'buildFromDiscard': return 'build a card from the discard pile for free';
    case 'playLastCard': return "play each Age's last card";
    case 'freeBuildPerAge': return 'once per Age, build a card for free';
    case 'copyGuild': return "copy a neighbour's guild at the end";
    case 'coinLoss': return `every other city loses ${eff.amount} coin${eff.amount === 1 ? '' : 's'}${eff.per === 'victoryToken' ? ' per victory token' : eff.per === 'wonderStage' ? ' per wonder stage' : ''}`;
    case 'neighborsGain': return `each neighbour takes ${eff.amount} coin${eff.amount === 1 ? '' : 's'}`;
    case 'diplomacy': return 'a diplomacy token (sit the next conflict out)';
    case 'mask': return "a mask: copy a neighbour's green-card science symbol at the end";
    case 'tradeRebate': return `the first resource bought from your ${eff.side} neighbour each turn costs 1 coin less`;
    case 'produceOwned': return 'one more of a resource your city produces, each turn';
    case 'produceMissing': return "one resource your city doesn't produce, each turn";
    case 'freeWonderResources': return 'wonder stages cost no resources';
    case 'costDiscount': return `${eff.target === 'wonderStage' ? 'wonder stages' : `${eff.color} cards`} cost one resource less`;
    case 'freeGuildResources': return 'guilds cost no resources';
    case 'freeLeaders': return 'recruit leaders for free';
    case 'leaderRebate': return `your leaders cost ${eff.self} coins less, your neighbours' ${eff.neighbors} less`;
    case 'trigger': {
      const on = eff.on.type === 'buildCardColor' ? `you build a ${eff.on.color} card` : eff.on.type === 'buildViaChain' ? 'you build through a chain'
        : eff.on.type === 'victoryToken' ? 'you take a victory token' : 'you buy from a neighbour';
      return `+${eff.coins} coin${eff.coins === 1 ? '' : 's'} each time ${on}`;
    }
    case 'scoreRule':
      switch (eff.rule.type) {
        case 'completeRGBSet': return `${eff.rule.vpPerSet} VP per red + blue + green set`;
        case 'completeAllColorsSet': return `${eff.rule.vpPerSet} VP per set of the seven Age colours`;
        case 'vpPerCoinSet': return `${eff.rule.vpPer} VP per 3 coins`;
        case 'vpPerVictoryToken': return `${eff.rule.vpPer} VP per victory token`;
      }
      return '';
    case 'scienceSetBonus': return `+${eff.vp} VP per science set`;
    case 'buyAnyResource': return 'once a turn, any resource from the bank for 1 coin';
    case 'buildFromDiscardOnRecruit': return 'build a card from the discard pile for free';
    case 'defeatToVictor': return 'your defeat tokens go to the victor';
    case 'defeatAsShield': return 'each defeat token counts as a shield';
    case 'bankBonus': return 'once a turn, +1 coin on coins from the bank';
    case 'freeColorPerAge': return `one ${eff.color} card per Age for free`;
    case 'copyLeader': return 'copy a leader of a neighbouring city';
    case 'drawLeaders': return `draw ${eff.count} leaders`;
    case 'recruitNow': return 'recruit a leader now';
  }
}

/** Plain-text summary of a card's effects (tooltips, logs). */
export function cardEffectsText(c: Pick<SwCard, 'effects' | 'name'>): string {
  return c.effects.map(effectText).filter(Boolean).join(' · ') || '—';
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
export const TABLEAU_ORDER: SwCardColor[] = ['brown', 'gray', 'yellow', 'red', 'green', 'blue', 'purple', 'black', 'leader'];

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

const POWERS = new Set<SwCardEffect['kind']>(['buildFromDiscard', 'playLastCard', 'freeBuildPerAge', 'copyGuild', 'scienceWild', 'coinLoss', 'drawLeaders', 'recruitNow']);

/** `fresh`: the last built stage went up on the last turn (it glows). */
export function WonderBoard({ wonder, built, highlightNext = false, fresh = false }: { wonder: SwWonder; built: number; highlightNext?: boolean; fresh?: boolean }) {
  return (
    <div className={`sw-wboard sw-side-${wonder.side.toLowerCase()}`}>
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
      {wonder.boardText && (
        <div className="sw-wboard-power" title="Board power, in force from the start">
          <EffectIcons effects={wonder.boardEffects ?? []} size={18} /> <span>{wonder.boardText}</span>
        </div>
      )}
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
    <div className={`sw-wmini${fresh ? ' sw-wmini-fresh' : ''}`} title={`${wonder.name} (${wonder.side}) — ${built}/${wonder.stages.length} stages built`}>
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
