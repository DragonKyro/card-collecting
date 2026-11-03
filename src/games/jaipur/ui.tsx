// Jaipur — lobby options and the in-game view.
//
// Layout: the opponent's row (face-down hand, herd, tokens) on top, the
// market rug (deck · five cards · discard pile) in the middle, the viewer's
// hand, herd, tokens and action bar below; the price board (every goods pile,
// the bonus piles, the camel token) and the log on the right.
//
// A turn is built by selection: click market goods, hand cards and herd
// camels, and the action bar names the move they add up to (take one / take
// the camels / trade / sell) — or says what's missing. Quick buttons cover
// the common one-click moves (take camels, sell all of a good).
//
// Hidden information is gated here: the opponent's hand is drawn face down
// and their bonus tokens without values until the round is scored. With no
// seated viewer (all-AI demo) both hands are shown.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  JaipurAction, JaipurBonusSize, JaipurCard, JaipurCardType, JaipurConfig, JaipurGood, JaipurLogEntry, JaipurPlayer,
  JaipurState,
} from './types';
import {
  BONUS_SIZES, CARD_INFO, GOODS, HAND_LIMIT, EMPTY_PILES_TO_END, bonusSizeFor, cardLabel, minSale,
} from './cards';
import { canCompleteTrade, countCards, emptyCounts, emptyGoodCounts, isCompleteTrade } from './rules';
import { emptyPiles, tradeContext } from './reducer';
import { goodsPoints, rupees } from './scoring';
import { BonusTokenArt, CamelTokenArt, GoodsTokenArt, SealArt, TokenSvg, TypeIcon, bonusColor } from './art';
import { BonusTokenView, CardBack, CardView, GoodsTokenView } from './Card';
import { JaipurFlipProvider, cardKey, useFlipAnchor } from './flip';
import { Rules } from './RuleBook';
import { AI_LEVELS, aiLevelOf } from './levels';
import './jaipur.css';

// ---------------------------------------------------------------------------
// Lobby

function LobbyConfig({ config, seats, onChange }: { config: JaipurConfig; seats: Seat[]; onChange: (c: JaipurConfig) => void }) {
  const options: Array<{ seals: number; label: string }> = [
    { seals: 1, label: 'Single round' },
    { seals: 2, label: 'Best of 3' },
    { seals: 3, label: 'Best of 5' },
  ];
  const hasAI = seats.some((s) => s.isAI);
  const level = aiLevelOf(config);
  // Start fetching the level's policy while the lobby is still open (the
  // Start button awaits it either way).
  useEffect(() => {
    if (hasAI) void import('./aiLevels').then((m) => m.prepareAiLevel(level)).catch(() => {});
  }, [hasAI, level]);
  return (
    <div className="game-config">
      {hasAI && AI_LEVELS.length > 1 && (
        <>
          <h4 className="jp-lobby-h">AI difficulty</h4>
          <div role="radiogroup" aria-label="AI difficulty" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {AI_LEVELS.map((l) => (
              <button
                key={l.id}
                role="radio"
                aria-checked={level === l.id}
                className={level === l.id ? undefined : 'secondary'}
                onClick={() => onChange({ ...config, aiLevel: l.id })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
      <h4 className="jp-lobby-h">Match length</h4>
      <div role="radiogroup" aria-label="Match length" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <button
            key={o.seals}
            role="radio"
            aria-checked={config.sealsToWin === o.seals}
            className={config.sealsToWin === o.seals ? undefined : 'secondary'}
            onClick={() => onChange({ ...config, sealsToWin: o.seals })}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers

const seatOf = (state: JaipurState, id: PlayerId | null | undefined): Seat | undefined =>
  state.seats.find((s) => s.id === id);
const nameOf = (state: JaipurState, id: PlayerId | null | undefined): string => seatOf(state, id)?.name ?? 'Someone';

/** Hand sorted by good (the order of the price board), stable by id. */
function sortedHand(hand: JaipurCard[]): JaipurCard[] {
  return hand.slice().sort((a, b) => GOODS.indexOf(a.type as JaipurGood) - GOODS.indexOf(b.type as JaipurGood) || a.id - b.id);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function listTypes(types: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n} ${cardLabel(t as JaipurGood, n)}`).join(' + ');
}

/** One log entry in words, as `viewerId` may see it. */
function describe(state: JaipurState, e: JaipurLogEntry, viewerId: PlayerId | null, revealAll: boolean): string {
  const who = 'playerId' in e ? nameOf(state, e.playerId) : '';
  switch (e.kind) {
    case 'takeOne':
      return `${who} took ${cardLabel(e.good)}${e.refill ? ` (the deck turned up ${cardLabel(e.refill)})` : ''}.`;
    case 'takeCamels':
      return `${who} took ${plural(e.count, 'camel')}${e.refills.length ? ` (the deck turned up ${listTypes(e.refills)})` : ''}.`;
    case 'exchange':
      return `${who} traded ${listTypes(e.gave)} for ${listTypes(e.took)}.`;
    case 'sell': {
      const total = e.tokens.reduce((a, b) => a + b, 0);
      const mine = revealAll || e.playerId === viewerId;
      const bonus = !e.bonus ? '' : mine ? ` + a ×${e.bonus.size} bonus worth ${e.bonus.value}` : ` + a ×${e.bonus.size} bonus token`;
      return `${who} sold ${e.count} ${cardLabel(e.good, e.count)} for ${total}${bonus}.`;
    }
    case 'roundEnd':
      return `Round ${e.round} over (${e.endedBy === 'deck' ? 'the deck ran out' : 'three goods sold out'}) — `
        + (e.winnerId ? `${nameOf(state, e.winnerId)} wins a seal.` : 'a tie: no seal.');
    case 'matchEnd':
      return `${nameOf(state, e.winnerId)} wins the match!`;
  }
}

/** Card / token ids the game state keeps off screen, by the anchor they come from. */
function flipOrigins(state: JaipurState): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of state.deck) m.set(cardKey(c.id), 'deck');
  return m;
}

// ---------------------------------------------------------------------------
// Selection → intent

interface Selection {
  market: number[];
  hand: number[];
  herd: number[];
}

const NO_SELECTION: Selection = { market: [], hand: [], herd: [] };

interface Intent {
  /** The move the selection adds up to, if it's legal. */
  action: JaipurAction | null;
  /** Button label. */
  label: string;
  /** What to do next / why it's not legal. */
  hint: string;
  tone: 'idle' | 'ready' | 'error';
}

function intentOf(state: JaipurState, me: JaipurPlayer, sel: Selection): Intent {
  const market = sel.market.map((id) => state.market.find((c) => c.id === id)!).filter(Boolean);
  const hand = sel.hand.map((id) => me.hand.find((c) => c.id === id)!).filter(Boolean);
  const herd = sel.herd.map((id) => me.herd.find((c) => c.id === id)!).filter(Boolean);
  const goods = market.filter((c) => c.type !== 'camel');
  const camels = market.filter((c) => c.type === 'camel');
  const given = hand.length + herd.length;

  if (camels.length > 0) {
    return { action: { type: 'takeCamels' }, label: `Take ${plural(camels.length, 'camel')}`, hint: 'Camels are always taken all together.', tone: 'ready' };
  }
  if (goods.length === 0) {
    if (hand.length > 0 && herd.length === 0) {
      const good = hand[0].type as JaipurGood;
      if (hand.some((c) => c.type !== good)) {
        return { action: null, label: 'Sell', hint: 'Sell one type of good at a time.', tone: 'error' };
      }
      const n = hand.length;
      if (n < minSale(good)) {
        return { action: null, label: `Sell ${n} ${cardLabel(good, n)}`, hint: `${CARD_INFO[good].plural} sell ${minSale(good)} at a time at least.`, tone: 'error' };
      }
      return {
        action: { type: 'sell', cardIds: hand.map((c) => c.id) },
        label: `Sell ${n} ${cardLabel(good, n)}`,
        hint: salePreview(state, good, n) + ' — or pick market goods to trade these for.',
        tone: 'ready',
      };
    }
    if (given > 0) {
      return { action: null, label: 'Trade', hint: `Now pick the goods to take from the market (${given} card${given === 1 ? '' : 's'} offered).`, tone: 'idle' };
    }
    return {
      action: null,
      label: 'Choose',
      hint: 'Take cards from the market (click goods, or a camel for all of them) or sell from your hand.',
      tone: 'idle',
    };
  }
  if (goods.length === 1 && given === 0) {
    if (me.hand.length >= HAND_LIMIT) {
      return { action: null, label: `Take ${cardLabel(goods[0].type)}`, hint: `Your hand is full (${HAND_LIMIT}). Sell, trade, or take camels.`, tone: 'error' };
    }
    return {
      action: { type: 'takeOne', cardId: goods[0].id },
      label: `Take ${cardLabel(goods[0].type)}`,
      hint: 'Or pick more goods to trade for cards from your hand / herd.',
      tone: 'ready',
    };
  }
  // A trade.
  const ctx = tradeContext(state, me);
  const draft = { take: emptyGoodCounts(), give: emptyCounts() };
  for (const c of goods) draft.take[c.type as JaipurGood]++;
  for (const c of [...hand, ...herd]) draft.give[c.type]++;
  const t = goods.length;
  const label = `Trade ${t} for ${given}`;
  if (t < 2) return { action: null, label, hint: 'A trade takes at least 2 goods from the market.', tone: 'error' };
  if (hand.some((c) => draft.take[c.type as JaipurGood] > 0)) {
    return { action: null, label, hint: "You can't give back a good of a type you're taking.", tone: 'error' };
  }
  if (!canCompleteTrade(ctx, { take: draft.take, give: emptyCounts() })) {
    return { action: null, label, hint: `You can't pay for ${t} goods (hand limit ${HAND_LIMIT}, or not enough cards to give).`, tone: 'error' };
  }
  if (given < t) {
    return { action: null, label, hint: `Pick ${t - given} more card${t - given === 1 ? '' : 's'} to give — from your hand or your herd.`, tone: 'idle' };
  }
  if (given > t) {
    return { action: null, label, hint: `You're giving ${given} cards for ${t}. Give exactly as many as you take.`, tone: 'error' };
  }
  if (!isCompleteTrade(ctx, draft)) {
    return { action: null, label, hint: `That would leave more than ${HAND_LIMIT} cards in your hand — give more goods, fewer camels.`, tone: 'error' };
  }
  return {
    action: { type: 'exchange', takeIds: goods.map((c) => c.id), giveIds: [...hand, ...herd].map((c) => c.id) },
    label: `Trade ${t} for ${t}`,
    hint: `Take ${listTypes(goods.map((c) => c.type))} for ${listTypes([...hand, ...herd].map((c) => c.type))}.`,
    tone: 'ready',
  };
}

function salePreview(state: JaipurState, good: JaipurGood, n: number): string {
  const toks = state.tokens[good].slice(0, n).map((t) => t.value);
  const size = bonusSizeFor(n);
  const pays = toks.length ? `${toks.join(' + ')} = ${toks.reduce((a, b) => a + b, 0)}` : 'no tokens left';
  return `Pays ${pays}${size && state.bonus[size].length ? ` + a ×${size} bonus` : ''}`;
}

// ---------------------------------------------------------------------------
// Game view

function GameView({ state, localPlayerId, dispatch }: {
  state: JaipurState;
  localPlayerId: PlayerId | null;
  dispatch: (a: JaipurAction) => void;
}) {
  const viewer = state.players.find((p) => p.id === localPlayerId) ?? null;
  const allAI = state.seats.every((s) => s.isAI);
  const revealAll = !viewer && allAI;
  const bottom = viewer ?? state.players[0];
  const top = state.players.find((p) => p.id !== bottom.id)!;
  const myTurn = !!viewer && state.phase === 'playing' && state.subPhase === 'turn' && state.activePlayerId === viewer.id;

  const [sel, setSel] = useState<Selection>(NO_SELECTION);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSel(NO_SELECTION);
    setError(null);
  }, [state.logSeq, state.activePlayerId, state.round]);

  // Market cards that arrived since the previous move (soft glow).
  const prevMarket = useRef<{ round: number; ids: Set<number> }>({ round: state.round, ids: new Set(state.market.map((c) => c.id)) });
  const freshIds = useMemo(() => {
    const prev = prevMarket.current;
    if (prev.round !== state.round) return new Set<number>();
    return new Set(state.market.filter((c) => !prev.ids.has(c.id)).map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.logSeq, state.round]);
  useEffect(() => {
    prevMarket.current = { round: state.round, ids: new Set(state.market.map((c) => c.id)) };
  }, [state.logSeq, state.round]);

  const origins = useMemo(() => flipOrigins(state), [state]);
  // The summary and game-over panels sit over the board (fading in late), so
  // the round's last move still flies; a new round or a change of point of
  // view (hot-seat hand-over) animates nothing.
  const scene = `${state.round}:${bottom.id}`;
  // An AI's move flies slowly when a human is watching, so it can be followed.
  const lastMove = [...state.log].reverse().find((e) => 'playerId' in e);
  const pace = !allAI && lastMove && 'playerId' in lastMove && seatOf(state, lastMove.playerId)?.isAI ? 'slow' : 'normal';

  const act = (a: JaipurAction | null) => {
    if (!a) return;
    try {
      dispatch(a);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = (zone: keyof Selection, id: number) => {
    setSel((s) => {
      const has = s[zone].includes(id);
      const next: Selection = { ...s, [zone]: has ? s[zone].filter((x) => x !== id) : [...s[zone], id] };
      // Camels in the market are taken alone; anything else drops them.
      const camelIds = state.market.filter((c) => c.type === 'camel').map((c) => c.id);
      if (zone !== 'market' || !camelIds.includes(id)) next.market = next.market.filter((x) => !camelIds.includes(x));
      return next;
    });
  };
  const clickMarket = (card: JaipurCard) => {
    if (card.type !== 'camel') return toggle('market', card.id);
    const camelIds = state.market.filter((c) => c.type === 'camel').map((c) => c.id);
    setSel((s) => (s.market.some((id) => camelIds.includes(id)) ? NO_SELECTION : { market: camelIds, hand: [], herd: [] }));
  };

  const intent = myTurn && viewer ? intentOf(state, viewer, sel) : null;
  const takingTypes = new Set(sel.market.map((id) => state.market.find((c) => c.id === id)?.type).filter(Boolean));

  return (
    <JaipurFlipProvider origins={origins} scene={scene} pace={pace}>
      <div className="jp-layout">
        <div className="jp-board">
          <StatusStrip state={state} />
          <PlayerRow
            state={state}
            player={top}
            position="top"
            reveal={revealAll}
            active={state.activePlayerId === top.id && state.subPhase === 'turn'}
          />
          <MarketRug
            state={state}
            selected={sel.market}
            selectable={myTurn}
            freshIds={freshIds}
            onClick={clickMarket}
          />
          <PlayerRow
            state={state}
            player={bottom}
            position="bottom"
            reveal={!!viewer || revealAll}
            active={state.activePlayerId === bottom.id && state.subPhase === 'turn'}
            selection={myTurn ? sel : undefined}
            takingTypes={takingTypes}
            onHandClick={myTurn ? (c) => toggle('hand', c.id) : undefined}
            onHerdClick={myTurn ? (c) => toggle('herd', c.id) : undefined}
          >
            {myTurn && viewer && intent && (
              <ActionBar
                state={state}
                me={viewer}
                intent={intent}
                error={error}
                onAct={act}
                onClear={() => setSel(NO_SELECTION)}
                hasSelection={sel.market.length + sel.hand.length + sel.herd.length > 0}
              />
            )}
            {!myTurn && viewer && state.phase === 'playing' && state.subPhase === 'turn' && (
              <p className="jp-waiting">Waiting for {nameOf(state, state.activePlayerId)}…</p>
            )}
            {!viewer && !allAI && <p className="jp-waiting">Spectating.</p>}
          </PlayerRow>
          {state.subPhase === 'roundEnd' && state.phase === 'playing' && state.lastRoundSummary && (
            <RoundSummary state={state} onNext={() => act({ type: 'nextRound' })} canAdvance={!allAI} />
          )}
          {state.phase === 'gameOver' && <GameOver state={state} />}
        </div>
        <aside className="jp-side">
          <PriceBoard state={state} />
          <GameLog state={state} viewerId={viewer?.id ?? null} revealAll={revealAll} />
        </aside>
      </div>
    </JaipurFlipProvider>
  );
}

function StatusStrip({ state }: { state: JaipurState }) {
  const empty = emptyPiles(state);
  return (
    <div className="jp-status">
      <span className="jp-status-round">Round {state.round}</span>
      <span>Deck <strong>{state.deck.length}</strong></span>
      <span title="The round ends when three goods piles are empty">
        Sold out <strong>{empty}</strong>/{EMPTY_PILES_TO_END}
      </span>
      <span className="jp-status-goal">
        {state.config.sealsToWin === 1 ? 'Single round' : `First to ${state.config.sealsToWin} seals`}
      </span>
    </div>
  );
}

function Seals({ have, need, size = 18 }: { have: number; need: number; size?: number }) {
  return (
    <span className="jp-seals" aria-label={`${have} of ${need} seals`}>
      {Array.from({ length: need }, (_, i) => (
        <svg key={i} viewBox="0 0 40 40" width={size} height={size} className={i < have ? 'earned' : ''}>
          <SealArt earned={i < have} />
        </svg>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Players

function PlayerRow({
  state, player, position, reveal, active, selection, takingTypes, onHandClick, onHerdClick, children,
}: {
  state: JaipurState;
  player: JaipurPlayer;
  position: 'top' | 'bottom';
  /** Show the hand face up and bonus values. */
  reveal: boolean;
  active: boolean;
  selection?: Selection;
  takingTypes?: Set<string | undefined>;
  onHandClick?: (c: JaipurCard) => void;
  onHerdClick?: (c: JaipurCard) => void;
  children?: ReactNode;
}) {
  const seat = seatOf(state, player.id);
  const hand = reveal ? sortedHand(player.hand) : player.hand;
  const small = position === 'top';
  const showBonus = reveal || state.phase === 'gameOver';
  const score = rupees(player);
  return (
    <section className={`jp-player jp-player-${position}${active ? ' active' : ''}`} style={{ ['--seat' as string]: seat?.color ?? '#888' }}>
      <header className="jp-player-head">
        <span className="jp-player-name">
          <span className="dot" />
          {seat?.name ?? player.id}
          {seat?.isAI && <span className="jp-tag">AI</span>}
          {active && <span className="jp-tag jp-tag-turn">to play</span>}
        </span>
        <Seals have={player.seals} need={state.config.sealsToWin} />
        <span className="jp-player-score" title="Rupees from tokens so far (the camel token is awarded at the end of the round)">
          {showBonus
            ? <>₹ <strong>{score}</strong></>
            : <>₹ <strong>{goodsPoints(player)}</strong>{player.bonusTokens.length > 0 && <span className="muted"> + {plural(player.bonusTokens.length, 'bonus token')}</span>}</>}
        </span>
      </header>
      <div className="jp-player-body">
        <div className="jp-zone jp-hand-zone">
          <div className="jp-zone-label">
            Hand <span className="muted">{player.hand.length}/{HAND_LIMIT}</span>
          </div>
          <div className={`jp-hand ${small ? 'jp-hand-small' : ''}`} style={{ ['--n' as string]: Math.max(1, player.hand.length) }}>
            {hand.map((c) => {
              const selected = selection?.hand.includes(c.id) ?? false;
              const blocked = !!onHandClick && !selected && takingTypes?.has(c.type);
              return (
                <CardView
                  key={c.id}
                  card={c}
                  zone={`hand-${player.id}`}
                  faceDown={!reveal}
                  size={small ? 'small' : 'normal'}
                  selectable={!!onHandClick}
                  selected={selected}
                  disabled={blocked}
                  title={blocked ? "You can't give back a type you're taking" : undefined}
                  onClick={() => onHandClick?.(c)}
                />
              );
            })}
            {player.hand.length === 0 && <span className="jp-empty">empty</span>}
          </div>
        </div>
        <div className="jp-zone jp-herd-zone">
          <div className="jp-zone-label">Herd <span className="muted">{player.herd.length}</span></div>
          <div className="jp-herd">
            {player.herd.map((c, i) => (
              <CardView
                key={c.id}
                card={c}
                zone={`herd-${player.id}`}
                size="tiny"
                selectable={!!onHerdClick}
                selected={selection?.herd.includes(c.id) ?? false}
                onClick={() => onHerdClick?.(c)}
                style={{ zIndex: i }}
              />
            ))}
            {player.herd.length === 0 && <span className="jp-empty">no camels</span>}
          </div>
        </div>
        <div className="jp-zone jp-tokens-zone">
          <div className="jp-zone-label">Tokens</div>
          <div className="jp-tokens">
            {player.goodsTokens.map((t) => (
              <GoodsTokenView key={t.id} token={t} zone={`tokens-${player.id}`} size="small" />
            ))}
            {player.bonusTokens.map((t) => (
              <BonusTokenView key={t.id} token={t} zone={`tokens-${player.id}`} revealed={showBonus} size="small" />
            ))}
            {player.goodsTokens.length + player.bonusTokens.length === 0 && <span className="jp-empty">none yet</span>}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Market

function MarketRug({ state, selected, selectable, freshIds, onClick }: {
  state: JaipurState;
  selected: number[];
  selectable: boolean;
  freshIds: Set<number>;
  onClick: (c: JaipurCard) => void;
}) {
  const deckRef = useFlipAnchor('deck');
  const layers = Math.min(4, Math.ceil(state.deck.length / 10));
  return (
    <div className="jp-rug">
      <div className="jp-pile">
        <div className="jp-deck" ref={deckRef}>
          {state.deck.length === 0
            ? <div className="jp-card jp-card-normal jp-slot-empty">empty</div>
            : Array.from({ length: layers }, (_, i) => (
              <CardBack key={i} style={{ position: i === 0 ? 'relative' : 'absolute', top: -i * 2, left: -i * 2 }} />
            ))}
        </div>
        <div className="jp-pile-label">Deck · {state.deck.length}</div>
      </div>
      <div className="jp-market" aria-label="Market" style={{ ['--n' as string]: Math.max(1, state.market.length) }}>
        {state.market.map((c) => (
          <CardView
            key={c.id}
            card={c}
            zone="market"
            selectable={selectable}
            selected={selected.includes(c.id)}
            fresh={freshIds.has(c.id)}
            onClick={() => onClick(c)}
            title={c.type === 'camel' ? 'Camel — click to select every camel' : CARD_INFO[c.type].label}
          />
        ))}
      </div>
      <div className="jp-pile">
        <div className="jp-discard">
          {state.discard.length === 0 && <div className="jp-card jp-card-normal jp-slot-empty">sold cards</div>}
          {state.discard.map((c, i) => (
            <CardView
              key={c.id}
              card={c}
              zone="discard"
              style={{
                position: i === 0 ? 'relative' : 'absolute', top: 0, left: 0,
                transform: `rotate(${((c.id * 37) % 15) - 7}deg)`,
              }}
            />
          ))}
        </div>
        <div className="jp-pile-label">Sold · {state.discard.length}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions

function ActionBar({ state, me, intent, error, onAct, onClear, hasSelection }: {
  state: JaipurState;
  me: JaipurPlayer;
  intent: Intent;
  error: string | null;
  onAct: (a: JaipurAction | null) => void;
  onClear: () => void;
  hasSelection: boolean;
}) {
  const counts = countCards(me.hand);
  const camels = state.market.filter((c) => c.type === 'camel').length;
  const quickSells = GOODS.filter((g) => counts[g] >= minSale(g));
  return (
    <div className="jp-actions">
      <div className={`jp-intent jp-intent-${intent.tone}`}>
        <button className="jp-go" disabled={!intent.action} onClick={() => onAct(intent.action)}>
          {intent.label}
        </button>
        <span className="jp-intent-hint">{error ?? intent.hint}</span>
        {hasSelection && <button className="secondary jp-clear" onClick={onClear}>Clear</button>}
      </div>
      <div className="jp-quick">
        {camels > 0 && (
          <button className="secondary" onClick={() => onAct({ type: 'takeCamels' })}>
            <TypeIcon type="camel" /> Take {plural(camels, 'camel')}
          </button>
        )}
        {quickSells.map((g) => {
          const n = counts[g];
          const pay = state.tokens[g].slice(0, n).reduce((a, t) => a + t.value, 0);
          const size = bonusSizeFor(n);
          return (
            <button
              key={g}
              className="secondary"
              onClick={() => onAct({ type: 'sell', cardIds: me.hand.filter((c) => c.type === g).map((c) => c.id) })}
              title={salePreview(state, g, n)}
            >
              <TypeIcon type={g} /> Sell {n} · ₹{pay}{size && state.bonus[size].length ? ` +×${size}` : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price board + log

function PriceBoard({ state }: { state: JaipurState }) {
  return (
    <div className="jp-prices">
      <h4>Price board</h4>
      {GOODS.map((g) => (
        <div key={g} className={`jp-price-row${state.tokens[g].length === 0 ? ' soldout' : ''}`}>
          <TypeIcon type={g} size={22} />
          <div className="jp-price-tokens">
            {state.tokens[g].map((t) => (
              <GoodsTokenView key={t.id} token={t} zone={`pile-${g}`} size="small" />
            ))}
            {state.tokens[g].length === 0 && <span className="jp-soldout">sold out</span>}
          </div>
        </div>
      ))}
      <div className="jp-bonus-piles">
        {BONUS_SIZES.map((size) => <BonusPile key={size} state={state} size={size} />)}
        <div className="jp-bonus-pile" title="Camel token: 5 rupees to the bigger herd at the end of the round">
          <TokenSvg className="jp-token jp-token-small"><CamelTokenArt /></TokenSvg>
          <span className="jp-bonus-count">most camels</span>
        </div>
      </div>
    </div>
  );
}

function BonusPile({ state, size }: { state: JaipurState; size: JaipurBonusSize }) {
  const pile = state.bonus[size];
  return (
    <div className="jp-bonus-pile" title={`${pile.length} ×${size} bonus tokens left (for selling ${size === 5 ? '5+' : size} at once)`}>
      <div className="jp-bonus-stack">
        {pile.length === 0 && (
          <svg viewBox="0 0 40 40" className="jp-token jp-token-small" style={{ opacity: 0.25 }}><BonusTokenArt size={size} /></svg>
        )}
        {pile.slice().reverse().map((t, i) => (
          <BonusTokenView
            key={t.id}
            token={t}
            zone={`bonus-${size}`}
            revealed={false}
            size="small"
            style={{ position: i === 0 ? 'relative' : 'absolute', top: -i * 1.5, left: 0 }}
          />
        ))}
      </div>
      <span className="jp-bonus-count" style={{ color: bonusColor(size) }}>×{size} · {pile.length}</span>
    </div>
  );
}

function GameLog({ state, viewerId, revealAll }: { state: JaipurState; viewerId: PlayerId | null; revealAll: boolean }) {
  const entries = state.log.slice(-40).reverse();
  return (
    <div className="jp-log">
      <h4>Log</h4>
      <ol>
        {entries.map((e) => <LogLine key={e.seq} state={state} e={e} viewerId={viewerId} revealAll={revealAll} />)}
        {entries.length === 0 && <li className="muted">No moves yet.</li>}
      </ol>
    </div>
  );
}

/** One card type in a log line: its icon, and ×n when there are several. */
function LogCards({ type, n }: { type: JaipurCardType; n: number }) {
  return (
    <span className="jp-log-cards">
      <TypeIcon type={type} size={16} />
      {n > 1 && <span className="jp-log-n">×{n}</span>}
    </span>
  );
}

/** Several cards, grouped by type in the order they first appear. */
function LogCardList({ types }: { types: readonly JaipurCardType[] }) {
  const counts = new Map<JaipurCardType, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return <>{[...counts].map(([t, n]) => <LogCards key={t} type={t} n={n} />)}</>;
}

/** What the deck turned up to refill the market: small and faded, after ⟳. */
function LogRefill({ types }: { types: readonly JaipurCardType[] }) {
  if (!types.length) return null;
  return (
    <span className="jp-log-refill">
      ⟳<LogCardList types={types} />
    </span>
  );
}

/** A log entry as symbols — `+` took, `⇄` traded (gave ⇄ took), `₹` sold
 *  (→ the tokens' total, then any bonus token) — with the sentence from
 *  `describe` as its tooltip and for screen readers. */
function LogLine({ state, e, viewerId, revealAll }: {
  state: JaipurState; e: JaipurLogEntry; viewerId: PlayerId | null; revealAll: boolean;
}) {
  const text = describe(state, e, viewerId, revealAll);
  if (!('playerId' in e)) {
    return <li className={`jp-log-${e.kind}`}><span className="muted">R{e.round}</span> {text}</li>;
  }
  let body: ReactNode;
  switch (e.kind) {
    case 'takeOne':
      body = <><span className="jp-log-verb">+</span><LogCards type={e.good} n={1} /><LogRefill types={e.refill ? [e.refill] : []} /></>;
      break;
    case 'takeCamels':
      body = <><span className="jp-log-verb">+</span><LogCards type="camel" n={e.count} /><LogRefill types={e.refills} /></>;
      break;
    case 'exchange':
      body = <><LogCardList types={e.gave} /><span className="jp-log-verb">⇄</span><LogCardList types={e.took} /></>;
      break;
    case 'sell': {
      const mine = revealAll || e.playerId === viewerId;
      body = (
        <>
          <span className="jp-log-verb">₹</span>
          <LogCards type={e.good} n={e.count} />
          <span className="jp-log-rupees">→ {e.tokens.reduce((a, b) => a + b, 0)}</span>
          {e.bonus && (
            <TokenSvg className="jp-log-bonus">
              <BonusTokenArt size={e.bonus.size} value={mine ? e.bonus.value : undefined} />
            </TokenSvg>
          )}
        </>
      );
      break;
    }
  }
  return (
    <li className={`jp-log-${e.kind}`} title={text}>
      <span className="muted">R{e.round}</span>
      <span className="jp-log-who" aria-hidden="true" style={{ color: seatOf(state, e.playerId)?.color }}>{nameOf(state, e.playerId)}</span>
      <span className="jp-sr-only">{text}</span>
      <span className="jp-log-move" aria-hidden="true">{body}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Round summary + game over

function ScoreTable({ state, summary }: { state: JaipurState; summary: NonNullable<JaipurState['lastRoundSummary']> }) {
  return (
    <div className="jp-score-cols">
      {summary.perPlayer.map((row) => {
        const p = state.players.find((x) => x.id === row.playerId)!;
        const won = summary.winnerId === row.playerId;
        return (
          <div key={row.playerId} className={`jp-score-col${won ? ' won' : ''}`}>
            <div className="jp-score-name" style={{ color: seatOf(state, p.id)?.color }}>{nameOf(state, p.id)}</div>
            {won && (
              <svg viewBox="0 0 40 40" className="jp-seal-pop" width={64} height={64}><SealArt earned /></svg>
            )}
            <div className="jp-score-line">
              <span>Goods tokens ({row.goodsCount})</span><strong>{row.goods}</strong>
            </div>
            <div className="jp-score-tokens">
              {p.goodsTokens.map((t) => (
                <TokenSvg key={t.id} className="jp-token jp-token-small"><GoodsTokenArt good={t.good} value={t.value} /></TokenSvg>
              ))}
            </div>
            <div className="jp-score-line">
              <span>Bonus tokens ({row.bonusCount})</span><strong>{row.bonus}</strong>
            </div>
            <div className="jp-score-tokens">
              {p.bonusTokens.map((t) => (
                <TokenSvg key={t.id} className="jp-token jp-token-small"><BonusTokenArt size={t.size} value={t.value} /></TokenSvg>
              ))}
            </div>
            <div className="jp-score-line">
              <span>Camel token ({plural(row.herd, 'camel')})</span>
              <strong>{row.camel ? <span className="jp-camel-win">+5</span> : 0}</strong>
            </div>
            <div className="jp-score-total"><span>Total</span><strong>₹ {row.total}</strong></div>
          </div>
        );
      })}
    </div>
  );
}

const DECIDED_BY: Record<string, string> = {
  rupees: '',
  bonusTokens: ' (tied on rupees — more bonus tokens)',
  goodsTokens: ' (tied on rupees and bonus tokens — more goods tokens)',
  tie: '',
};

function RoundSummary({ state, onNext, canAdvance }: { state: JaipurState; onNext: () => void; canAdvance: boolean }) {
  const s = state.lastRoundSummary!;
  const next = s.winnerId ? state.players.find((p) => p.id !== s.winnerId)!.id : null;
  return (
    <div className="jp-overlay">
      <div className="jp-overlay-card">
        <div className="jp-overlay-eyebrow">
          Round {s.round} · {s.endedBy === 'deck' ? 'the deck ran out' : 'three goods sold out'}
        </div>
        <h3>
          {s.winnerId ? <>{nameOf(state, s.winnerId)} wins a Seal of Excellence!</> : <>A perfect tie — no seal this round.</>}
          <span className="jp-decided">{DECIDED_BY[s.decidedBy]}</span>
        </h3>
        <ScoreTable state={state} summary={s} />
        {canAdvance ? (
          <button className="jp-go" onClick={onNext}>
            Next round →{next ? <span className="muted"> {nameOf(state, next)} starts</span> : null}
          </button>
        ) : (
          <p className="muted">Dealing the next round…</p>
        )}
      </div>
    </div>
  );
}

function GameOver({ state }: { state: JaipurState }) {
  const s = state.lastRoundSummary;
  const winner = state.players.find((p) => p.id === state.winnerId);
  return (
    <div className="jp-overlay">
      <div className="jp-overlay-card">
        <div className="jp-overlay-eyebrow">Match over</div>
        <h3>
          {winner ? <>{nameOf(state, winner.id)} is the Maharaja's trader!</> : 'Match over'}
        </h3>
        <div className="jp-final-seals">
          {state.players.map((p) => (
            <div key={p.id} className="jp-final-seal">
              <span style={{ color: seatOf(state, p.id)?.color }}>{nameOf(state, p.id)}</span>
              <Seals have={p.seals} need={state.config.sealsToWin} size={34} />
            </div>
          ))}
        </div>
        {s && <ScoreTable state={state} summary={s} />}
        <table className="tight jp-history">
          <thead>
            <tr>
              <th>Round</th>
              {state.players.map((p) => <th key={p.id} className="num">{nameOf(state, p.id)}</th>)}
              <th>Ended by</th>
              <th>Seal</th>
            </tr>
          </thead>
          <tbody>
            {state.roundHistory.map((r) => (
              <tr key={r.round}>
                <td>{r.round}</td>
                {state.players.map((p) => {
                  const row = r.perPlayer.find((x) => x.playerId === p.id)!;
                  return <td key={p.id} className="num">{row.total}</td>;
                })}
                <td>{r.endedBy === 'deck' ? 'deck ran out' : 'goods sold out'}</td>
                <td>{r.winnerId ? nameOf(state, r.winnerId) : 'tie'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Use “Play again” above for a rematch.</p>
      </div>
    </div>
  );
}

export const bundle: GameUiBundle<JaipurState, JaipurAction, JaipurConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};

/** Exposed for tests. */
export const _internals = { intentOf, describe };
