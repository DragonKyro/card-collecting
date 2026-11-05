// 7 Wonders Duel — UI bundle (LobbyConfig + GameView).
//
// Layout (top to bottom): the opponent's city, the conflict track, the table
// (the wonder draft, or the pyramid with a decision panel beside it), the
// viewer's city. Side column: the Progress tokens on the board, the discard
// pile and the move history.
//
// The pyramid is laid out as on the table: row 0 (taken last) at the back, at
// the top; each row toward the players sits one step down and on top of the
// row behind it, half a card across, so a covered card shows only its top
// band. Face-down cards show their age's back — or the guild back for an
// Age III guild, the one identity a back gives away. A pyramid wider than the
// table (a phone) is zoomed down to fit; the decision panel shows the picked
// card full size.
//
// The decision panel follows the sub-phase: the picked card's build / wonder /
// discard choices on a turn, then — when an effect asks — a Progress token, an
// opponent's card to destroy, a discarded card to build, or who starts the
// next age. Payment is always the cheapest one (the reducer works it out), so
// the panel only shows what it will cost.
//
// Animation (flip.tsx): taken cards fly from the pyramid to a city, the
// discard pile or under a wonder; drafted wonders and Progress tokens fly to
// their owner; uncovered cards turn over; the pawn slides; coin changes float
// over the counters. An AI's move flies slowly when a human is watching.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  DuelAction, DuelCard, DuelCardColor, DuelConfig, DuelLogEntry, DuelPlayer, DuelProgressTokenId, DuelPyramidSlot,
  DuelState,
} from './types';
import { DUEL_CARD_SCIENCE } from './types';
import { isSlotAvailable } from './pyramid';
import { wonderById } from './wonders';
import { progressTokenById } from './progress';
import { cardPayment, discardCoins, distinctScience, scienceSymbols, shieldsFor, wonderPayment, type Payment } from './resources';
import { CardBack, CardBand, CardFace, ProgressToken, WonderCard, costText } from './Card';
import {
  ChipGlyph, CoinIcon, Icon, LaurelIcon, MilitaryTrackArt, ProgressGlyph, ScienceIcon, ShieldIcon, WonderGlyph,
} from './art';
import { DuelFlipProvider, cardKey, tokenKey, useAnimateOn, useFlip, wonderKey } from './flip';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import './seven-wonders-duel.css';

// ===================================================================
// LobbyConfig
// ===================================================================

function LobbyConfig({ config, seats, onChange }: { config: DuelConfig; seats: Seat[]; onChange: (c: DuelConfig) => void }) {
  void onChange; void config; void seats;
  return (
    <div className="game-config swd-lobby">
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 0 }}>
        The first player, the wonders on offer and the Progress tokens are drawn from the seed.
      </p>
    </div>
  );
}

function Rules() {
  return (
    <RulesBook
      pages={[
        {
          title: 'Overview',
          body: (
            <>
              <RulesHero
                title="7 Wonders Duel"
                subtitle="Standalone 2-player 7 Wonders. Pyramid draft, three paths to victory."
                accent="linear-gradient(135deg, #8b3a2e 0%, #d4a85a 100%)"
              />
              <h3>Three paths to victory</h3>
              <RulesGrid cols={3}>
                <RulesTile icon="🏛️" label="Civilian" hint="Most VP after Age III. Tie: most blue-card VP, then shared." accent="#6aa0ff" />
                <RulesTile icon="⚔️" label="Military Supremacy" hint="Push the conflict pawn into your opponent's capital. Instant win." accent="#ff7070" />
                <RulesTile icon="🔬" label="Scientific Supremacy" hint="Gather 6 different science symbols. Instant win." accent="#9ed27c" />
              </RulesGrid>
              <h3>Each turn</h3>
              <p>
                Take one accessible card — one with nothing overlapping it — and either
                <strong> build</strong> it (pay its cost), <strong>discard</strong> it for 2 coins + 1 per
                yellow card in your city, or use it to <strong>build a wonder</strong> (pay the wonder's cost;
                the card goes under it face down). Cards it uncovers turn face up.
              </p>
              <RulesGrid cols={3}>
                <RulesTile icon="⛓️" label="Chains" hint="A card whose chain symbol you already show is free." accent="#f4d268" />
                <RulesTile icon="🔁" label="Play again" hint="Some wonders (and Theology) give you another turn at once." accent="#b984c9" />
                <RulesTile icon="⚗️" label="Science pairs" hint="Two matching symbols: take a Progress token from the board." accent="#67d4d4" />
              </RulesGrid>
              <p className="muted">
                Between ages, the player with the pawn on their side (or whoever took the last card, if
                it is centred) chooses who starts the next age.
              </p>
            </>
          ),
        },
        {
          title: 'Trade & military',
          body: (
            <>
              <h3>Buying resources</h3>
              <p>
                Any resource you don't make is bought from the bank for <code>2 + the number your
                opponent makes with brown and gray cards</code> (yellow cards and wonders don't count).
                A Reserve or the Customs House fixes the price at 1 coin. The app always pays the
                cheapest way: your production first, then the cheapest purchases.
              </p>
              <h3>The conflict pawn</h3>
              <p>Each shield moves the pawn one space toward your opponent's capital.</p>
              <table className="tight">
                <thead><tr><th>Spaces from the centre</th><th>Effect</th></tr></thead>
                <tbody>
                  <tr><td>1–2</td><td>2 VP at the end</td></tr>
                  <tr><td>3–5</td><td>5 VP; reaching 3 loots 2 of your opponent's coins</td></tr>
                  <tr><td>6–8</td><td>10 VP; reaching 6 loots 5 coins</td></tr>
                  <tr><td>9</td><td><strong>Military Supremacy</strong></td></tr>
                </tbody>
              </table>
            </>
          ),
        },
        {
          title: 'Wonders',
          body: (
            <>
              <p>
                Before Age I, 4 wonders are revealed: the first player takes 1, the other player 2, the
                first player the last. Then 4 more, the other player choosing first. Only 7 wonders can
                be built: when the 7th is, the last one goes back to the box.
              </p>
              <table className="tight">
                <thead><tr><th>Wonder</th><th>Effect</th></tr></thead>
                <tbody>
                  {['appian-way', 'circus-maximus', 'colossus', 'great-library', 'great-lighthouse', 'hanging-gardens',
                    'mausoleum', 'piraeus', 'pyramids', 'sphinx', 'statue-of-zeus', 'temple-of-artemis'].map((id) => {
                    const w = wonderById(id);
                    return <tr key={id}><td>{w.name}</td><td>{w.description} <span className="muted">({costText(w.cost)})</span></td></tr>;
                  })}
                </tbody>
              </table>
            </>
          ),
        },
        {
          title: 'Progress tokens',
          body: (
            <>
              <p>5 of the 10 are on the board; the Great Library draws from the other 5.</p>
              <table className="tight">
                <thead><tr><th>Token</th><th>Effect</th></tr></thead>
                <tbody>
                  {(['agriculture', 'architecture', 'economy', 'law', 'masonry', 'mathematics', 'philosophy', 'strategy', 'theology', 'urbanism'] as const)
                    .map((id) => progressTokenById(id))
                    .map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.description}</td></tr>)}
                </tbody>
              </table>
              <h3>Scoring</h3>
              <p>
                Blue, green, yellow and wonder VP as printed, guilds (counted in the city with the
                most of their kind), Progress tokens, 1 VP per 3 coins, and the conflict pawn's zone.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

// ===================================================================
// GameView
// ===================================================================

type Dispatch = (a: DuelAction) => void;

function GameView({ state, localPlayerId, dispatch }: { state: DuelState; localPlayerId: PlayerId | null; dispatch: Dispatch }) {
  const localSeatIdx: 0 | 1 | null = useMemo(() => {
    if (!localPlayerId) return null;
    if (state.players[0].id === localPlayerId) return 0;
    if (state.players[1].id === localPlayerId) return 1;
    return null;
  }, [state.players, localPlayerId]);

  // Hot-seat: the active seat. Online: the local seat.
  const viewerSeatIdx: 0 | 1 = localSeatIdx ?? state.activeSeatIdx;
  const oppSeatIdx = (1 - viewerSeatIdx) as 0 | 1;
  const isMyTurn = state.phase === 'playing' && state.activeSeatIdx === viewerSeatIdx && !state.seats[viewerSeatIdx]?.isAI;

  // An AI's move flies slowly when a human is watching, so it can be followed.
  const anyHuman = state.seats.some((s) => !s.isAI);
  const last = [...state.log].reverse().find((e) => 'playerId' in e);
  const lastByAI = !!last && 'playerId' in last && !!state.seats.find((s) => s.id === last.playerId)?.isAI;
  const pace = anyHuman && lastByAI ? 'slow' : 'normal';

  if (state.phase === 'gameOver') return <GameOver state={state} />;

  return (
    <DuelFlipProvider scene={`${viewerSeatIdx}`} pace={pace}>
      <div className="swd-game">
        <div className="swd-main">
          <PlayerPanel key={oppSeatIdx} state={state} seatIdx={oppSeatIdx} />
          <MilitaryTrack state={state} />
          <section className="swd-table">
            {state.subPhase === 'wonderDraft'
              ? <WonderDraftPanel state={state} viewerSeatIdx={viewerSeatIdx} isMyTurn={isMyTurn} dispatch={dispatch} />
              : <PyramidView state={state} viewerSeatIdx={viewerSeatIdx} isMyTurn={isMyTurn} dispatch={dispatch} />}
          </section>
          <PlayerPanel key={viewerSeatIdx} state={state} seatIdx={viewerSeatIdx} />
        </div>
        <aside className="swd-side">
          <ProgressOffer state={state} />
          <DiscardPile state={state} />
          <History state={state} />
        </aside>
      </div>
    </DuelFlipProvider>
  );
}

// ===================================================================
// Players
// ===================================================================

const CITY_ORDER: DuelCardColor[] = ['brown', 'gray', 'yellow', 'red', 'blue', 'green', 'purple'];

/** Recent changes of a number, each shown for a moment (the floating ±N). */
function useDeltas(value: number): { id: number; d: number }[] {
  const [items, setItems] = useState<{ id: number; d: number }[]>([]);
  const last = useRef(value);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const d = value - last.current;
    last.current = value;
    if (d === 0) return;
    const id = ++seq.current;
    setItems((xs) => [...xs, { id, d }]);
    timers.current.push(setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 1500));
  }, [value]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return items;
}

function CoinStat({ coins }: { coins: number }) {
  const deltas = useDeltas(coins);
  return (
    <span className="swd-stat swd-coins" title="Coins">
      <CoinIcon size={24} title="coins" /> {coins}
      {deltas.map((x) => (
        <span key={x.id} className={`swd-delta ${x.d > 0 ? 'up' : 'down'}`}>{x.d > 0 ? `+${x.d}` : `−${-x.d}`}</span>
      ))}
    </span>
  );
}

function CityBand({ card, seatIdx }: { card: DuelCard; seatIdx: 0 | 1 }) {
  return <CardBand card={card} nodeRef={useFlip(cardKey(card.id), `city${seatIdx}`)} />;
}

function PlayerToken({ id, seatIdx }: { id: DuelProgressTokenId; seatIdx: 0 | 1 }) {
  return <ProgressToken id={id} size={28} nodeRef={useFlip(tokenKey(id), `tokens${seatIdx}`)} />;
}

function PlayerWonder({ state, seatIdx, wonderId }: { state: DuelState; seatIdx: 0 | 1; wonderId: string }) {
  const ws = state.players[seatIdx].wonders.find((w) => w.wonderId === wonderId)!;
  const buried = ws.buriedCardId !== null ? state.cardsById[ws.buriedCardId] : undefined;
  const ref = useRef<HTMLDivElement | null>(null);
  const flip = useFlip(wonderKey(wonderId), `wonders${seatIdx}`);
  const tuck = useFlip(buried ? cardKey(buried.id) : undefined, `tuck${seatIdx}`);
  useAnimateOn(ref, ws.built, (now) => now, BUILT_GLOW, 900, 300);
  return (
    <WonderCard
      wonder={wonderById(wonderId)}
      size="sm"
      built={ws.built}
      buriedAge={ws.built ? (buried?.age ?? 1) : undefined}
      nodeRef={(node) => { ref.current = node; return flip(node); }}
      tuckRef={tuck}
    />
  );
}

const BUILT_GLOW: Keyframe[] = [
  { filter: 'drop-shadow(0 0 0 rgba(255, 217, 112, 0))' },
  { filter: 'drop-shadow(0 0 10px rgba(255, 217, 112, 1))', offset: 0.35 },
  { filter: 'drop-shadow(0 0 0 rgba(255, 217, 112, 0))' },
];

function PlayerPanel({ state, seatIdx }: { state: DuelState; seatIdx: 0 | 1 }) {
  const player = state.players[seatIdx];
  const seat = state.seats[seatIdx];
  const active = state.phase !== 'gameOver' && state.activeSeatIdx === seatIdx;
  const sciences = scienceSymbols(player);
  const distinct = distinctScience(player);
  const builtWonders = player.wonders.filter((w) => w.built).length;
  return (
    <section
      className={`swd-player ${active ? 'active' : ''}`}
      style={{ ['--swd-seat' as string]: seat?.color ?? '#888' }}
      aria-label={`${playerName(player, state)}'s city`}
    >
      <header className="swd-player-head">
        <span className="swd-seat-dot" />
        <strong className="swd-player-name">{playerName(player, state)}</strong>
        {seat?.isAI && <span className="swd-tag">AI</span>}
        {active && <span className="swd-tag swd-tag-turn">to play</span>}
        <CoinStat coins={player.coins} />
        <span className="swd-stat" title="Shields on your cards and wonders"><ShieldIcon size={22} /> {shieldsFor(player)}</span>
        <span className="swd-stat" title="Wonders built"><Icon size={22} title="wonders"><WonderGlyph /></Icon> {builtWonders}/{player.wonders.length}</span>
        <span className="swd-science" title={`${distinct} of 6 different symbols for Scientific Supremacy`}>
          {[...DUEL_CARD_SCIENCE, ...(sciences.has('law') ? ['law' as const] : [])].map((s) => {
            const n = sciences.get(s) ?? 0;
            return (
              <span key={s} className={`swd-sci ${n > 0 ? 'have' : ''}`}>
                <ScienceIcon symbol={s} size={20} />
                {n > 1 && <b>{n}</b>}
              </span>
            );
          })}
          <span className="swd-sci-count">{distinct}/6</span>
        </span>
        {player.progressTokens.length > 0 && (
          <span className="swd-player-tokens">
            {player.progressTokens.map((tid) => <PlayerToken key={tid} id={tid} seatIdx={seatIdx} />)}
          </span>
        )}
      </header>
      <div className="swd-player-body">
        <div className="swd-city">
          {player.tableau.length === 0 && <span className="swd-empty">No buildings yet</span>}
          {CITY_ORDER.map((color) => {
            const cards = player.tableau.filter((c) => c.color === color);
            if (cards.length === 0) return null;
            return (
              <div key={color} className="swd-city-col">
                {cards.map((c) => <CityBand key={c.id} card={c} seatIdx={seatIdx} />)}
              </div>
            );
          })}
        </div>
        <div className="swd-player-wonders">
          {player.wonders.map((ws) => <PlayerWonder key={ws.wonderId} state={state} seatIdx={seatIdx} wonderId={ws.wonderId} />)}
        </div>
      </div>
    </section>
  );
}

function MilitaryTrack({ state }: { state: DuelState }) {
  const pawn = state.militaryPawn;
  const left = state.seats[0]?.name ?? 'P1';
  const right = state.seats[1]?.name ?? 'P2';
  const lead = pawn === 0 ? 'Even' : pawn > 0 ? `${left} pushes ${pawn}` : `${right} pushes ${-pawn}`;
  return (
    <div className="swd-military">
      <MilitaryTrackArt
        pawn={pawn}
        awards={state.militaryAwards}
        leftColor={state.seats[0]?.color ?? '#8a6a4a'}
        rightColor={state.seats[1]?.color ?? '#8a6a4a'}
      />
      <div className="swd-military-labels">
        <span>◀ {left}’s capital</span>
        <span className="swd-military-lead">{lead}</span>
        <span>{right}’s capital ▶</span>
      </div>
    </div>
  );
}

// ===================================================================
// Wonder draft
// ===================================================================

function DraftWonder({ wonderId, pickable, onPick }: { wonderId: string; pickable: boolean; onPick: () => void }) {
  const w = wonderById(wonderId);
  return (
    <WonderCard
      wonder={w}
      className={pickable ? 'pickable' : 'locked'}
      onClick={pickable ? onPick : undefined}
      nodeRef={useFlip(wonderKey(wonderId), 'draft')}
      footer={<div className="swd-wonder-desc">{w.description}</div>}
    />
  );
}

function WonderDraftPanel({ state, viewerSeatIdx, isMyTurn, dispatch }: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; dispatch: Dispatch;
}) {
  const draft = state.wonderDraft;
  if (!draft) return null;
  const me = state.players[viewerSeatIdx];
  const picker = state.seats[state.activeSeatIdx]?.name ?? 'Opponent';
  const group = draft.pickIdx < 4 ? 1 : 2;
  return (
    <div className="swd-panel">
      <h3 className="swd-table-title">
        Wonder draft · {isMyTurn ? 'your pick' : `${picker} is picking`}{' '}
        <span className="swd-dim">(pick {draft.pickIdx + 1} of 8 · group {group} of 2)</span>
      </h3>
      <div className="swd-wonder-grid">
        {draft.pool.map((wid) => (
          <DraftWonder
            key={wid}
            wonderId={wid}
            pickable={isMyTurn}
            onPick={() => dispatch({ type: 'submitWonderDraft', playerId: me.id, wonderId: wid })}
          />
        ))}
      </div>
    </div>
  );
}

// ===================================================================
// Pyramid
// ===================================================================

/** Pyramid geometry at full size, px: a card, the step between card centres, and between rows. */
const PYRAMID = { cardW: 84, cardH: 128, stepX: 90, stepY: 52 };

/** The element's content width, kept current; null until measured (or in jsdom). */
function useWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth || null);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const REVEAL: Keyframe[] = [
  { transform: 'perspective(500px) rotateY(90deg)' },
  { transform: 'perspective(500px) rotateY(0deg)' },
];

function PyramidSlot({ slot, card, age, minX, pickable, available, selected, onPick }: {
  slot: DuelPyramidSlot; card: DuelCard | undefined; age: 1 | 2 | 3; minX: number;
  pickable: boolean; available: boolean; selected: boolean; onPick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // A covered card turning up flips over once the card above has flown off.
  useAnimateOn(ref, slot.faceUp, (now) => now, REVEAL, 380, 220);
  const flip = useFlip(slot.faceUp && card ? cardKey(card.id) : undefined, 'pyramid');
  const cls = ['swd-slot', available ? 'available' : '', pickable ? 'pickable' : '', selected ? 'selected' : ''].filter(Boolean).join(' ');
  return (
    <div
      ref={ref}
      className={cls}
      style={{
        left: ((slot.x - minX) * PYRAMID.stepX) / 2,
        top: slot.row * PYRAMID.stepY,
        zIndex: slot.row + 1 + (selected ? 10 : 0),
      }}
    >
      {slot.faceUp && card
        ? <CardFace card={card} size="md" nodeRef={flip} onClick={pickable ? onPick : undefined} />
        : <CardBack age={age} guild={card?.color === 'purple'} size="md" />}
    </div>
  );
}

const SUBPHASE_TITLE: Partial<Record<DuelState['subPhase'], [string, string]>> = {
  // [your title, opponent's]
  turn: ['your turn', 'turn'],
  progressPick: ['choose a Progress token', 'choosing a Progress token'],
  libraryPick: ['the Great Library: keep a token', 'choosing at the Great Library'],
  destroyCard: ['destroy a card', 'destroying a card'],
  discardBuild: ['the Mausoleum: build a discarded card', 'building from the discard pile'],
  chooseStarter: ['who starts this age?', 'choosing who starts'],
};

function PyramidView({ state, viewerSeatIdx, isMyTurn, dispatch }: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; dispatch: Dispatch;
}) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const xs = state.pyramid.map((s) => s.x);
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(0, ...xs);
  const nRows = Math.max(1, ...state.pyramid.map((s) => s.row + 1));
  const fullW = ((maxX - minX) * PYRAMID.stepX) / 2 + PYRAMID.cardW;
  const fullH = PYRAMID.stepY * (nRows - 1) + PYRAMID.cardH;
  const rowW = useWidth(rowRef);
  const scale = rowW !== null && rowW < fullW ? rowW / fullW : 1;

  const picking = state.subPhase === 'turn' && isMyTurn;
  // A stale selection (the card was taken meanwhile) shows nothing.
  const selectedSlot = state.pyramid.find((s) => s.cardId === selectedCardId && isSlotAvailable(s, state.pyramid));
  const selected = picking && selectedSlot ? selectedSlot.cardId : null;

  // On a phone the decision panel sits under the pyramid, often below the
  // fold: bring it into view when there is something to decide.
  const deciding = isMyTurn && state.subPhase !== 'turn';
  useEffect(() => {
    if ((selected === null && !deciding) || !window.matchMedia?.('(max-width: 600px)').matches) return;
    rowRef.current?.querySelector('.swd-pick-panel')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [selected, deciding]);

  const actor = state.seats[state.activeSeatIdx]?.name ?? 'Opponent';
  const [mine, theirs] = SUBPHASE_TITLE[state.subPhase] ?? ['', ''];
  return (
    <div className="swd-table-row" ref={rowRef}>
      <div className="swd-pyramid-wrap">
        <h3 className="swd-table-title">
          Age {['I', 'II', 'III'][state.age - 1]} · {isMyTurn ? mine : `${actor}${state.subPhase === 'turn' ? '’s' : ' is'} ${theirs}`}
        </h3>
        <div
          className="swd-pyramid"
          style={{ width: fullW, height: fullH, ...(scale < 1 ? { zoom: scale } : {}) }}
        >
          {state.pyramid.map((slot) => {
            if (slot.taken) return null;
            const available = isSlotAvailable(slot, state.pyramid) && slot.faceUp;
            return (
              <PyramidSlot
                key={slot.index}
                slot={slot}
                card={state.cardsById[slot.cardId]}
                age={state.age}
                minX={minX}
                available={available}
                pickable={picking && available}
                selected={slot.cardId === selected}
                onPick={() => setSelectedCardId(slot.cardId === selectedCardId ? null : slot.cardId)}
              />
            );
          })}
        </div>
      </div>
      <DecisionPanel
        state={state}
        viewerSeatIdx={viewerSeatIdx}
        isMyTurn={isMyTurn}
        cardId={selected}
        dispatch={dispatch}
        onClear={() => setSelectedCardId(null)}
      />
    </div>
  );
}

// ===================================================================
// Decision panel
// ===================================================================

function DecisionPanel(props: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; cardId: number | null; dispatch: Dispatch; onClear: () => void;
}) {
  const { state, isMyTurn } = props;
  if (!isMyTurn) {
    const actor = state.seats[state.activeSeatIdx]?.name ?? 'your opponent';
    return (
      <div className="swd-pick-panel">
        <p className="swd-pick-hint">Waiting for {actor}…</p>
        {state.subPhase === 'chooseStarter' && <p className="swd-pick-sub">They choose who takes the first card of Age {['I', 'II', 'III'][state.age - 1]}.</p>}
      </div>
    );
  }
  switch (state.subPhase) {
    case 'turn': return <CardActionsPanel {...props} />;
    case 'chooseStarter': return <StarterPanel {...props} />;
    case 'progressPick':
    case 'libraryPick': return <TokenChoicePanel {...props} />;
    case 'destroyCard':
    case 'discardBuild': return <CardChoicePanel {...props} />;
    default: return null;
  }
}

function paymentLines(payment: Payment, card?: DuelCard): ReactNode {
  if (payment.chained) return <span>Free — you own {card?.chainFrom}</span>;
  return (
    <>
      {payment.bought.length > 0 && <span>Buy {payment.bought.join(', ')}: {payment.trade} coin{payment.trade === 1 ? '' : 's'}</span>}
      {payment.waived.length > 0 && <span>Skipped (Masonry / Architecture): {payment.waived.join(', ')}</span>}
      {payment.bought.length === 0 && payment.coins === 0 && <span>You make everything it needs</span>}
    </>
  );
}

function CardActionsPanel({ state, viewerSeatIdx, cardId, dispatch, onClear }: {
  state: DuelState; viewerSeatIdx: 0 | 1; cardId: number | null; dispatch: Dispatch; onClear: () => void;
}) {
  const [mode, setMode] = useState<'actions' | 'wonder'>('actions');
  useEffect(() => setMode('actions'), [cardId]);
  const me = state.players[viewerSeatIdx];
  const card = cardId !== null ? state.cardsById[cardId] : undefined;
  if (!card || cardId === null) {
    return (
      <div className="swd-pick-panel">
        <p className="swd-pick-hint">Pick a glowing card from the pyramid.</p>
        <p className="swd-pick-sub">Then build it, use it to build a wonder, or discard it for coins.</p>
      </div>
    );
  }

  const payment = cardPayment(state, viewerSeatIdx, card);
  const alreadyBuilt = me.tableau.some((c) => c.name === card.name);
  const canAfford = me.coins >= payment.coins;
  const unbuilt = me.wonders.filter((w) => !w.built);
  const wonderOptions = unbuilt.map((ws) => {
    const w = wonderById(ws.wonderId);
    const pay = wonderPayment(state, viewerSeatIdx, w);
    return { w, pay, ok: pay.coins <= me.coins };
  });
  const anyWonder = wonderOptions.some((o) => o.ok);
  const done = (a: DuelAction) => { dispatch(a); onClear(); };

  if (mode === 'wonder') {
    return (
      <div className="swd-pick-panel swd-pick-panel-wonders">
        <p className="swd-pick-hint">Build which wonder with {card.name}?</p>
        <div className="swd-wonder-choices">
          {wonderOptions.map(({ w, pay, ok }) => (
            <WonderCard
              key={w.id}
              wonder={w}
              size="sm"
              className={ok ? 'pickable' : 'locked'}
              onClick={ok ? () => done({ type: 'takeAndWonder', playerId: me.id, cardId, wonderId: w.id }) : undefined}
              footer={(
                <div className={`swd-wonder-desc ${ok ? '' : 'short'}`}>
                  {ok ? 'Costs' : 'Needs'} <CoinIcon value={pay.coins} size={15} />{ok ? '' : ` — you have ${me.coins}`}
                </div>
              )}
            />
          ))}
        </div>
        <button className="secondary swd-btn-cancel" onClick={() => setMode('actions')}>Back</button>
      </div>
    );
  }

  return (
    <div className="swd-pick-panel swd-pick-panel-card">
      <CardFace card={card} size="lg" />
      <div className="swd-pick-cost">
        <span>Cost: {costText(card.cost)}</span>
        {paymentLines(payment, card)}
      </div>
      <div className="swd-pick-buttons">
        <button
          disabled={alreadyBuilt || !canAfford}
          title={alreadyBuilt ? 'Already in your city' : !canAfford ? `Needs ${payment.coins} coins (you have ${me.coins})` : ''}
          onClick={() => done({ type: 'takeAndBuild', playerId: me.id, cardId })}
        >
          <span>Build</span>
          <span className="swd-btn-cost"><CoinIcon value={payment.coins} size={18} /></span>
        </button>
        <button
          className="secondary"
          disabled={!anyWonder}
          title={unbuilt.length === 0 ? 'No unbuilt wonder left' : !anyWonder ? 'You can\'t afford any of your wonders' : ''}
          onClick={() => setMode('wonder')}
        >
          <span>Build a wonder with it</span>
          <span className="swd-btn-cost"><Icon size={18}><WonderGlyph /></Icon></span>
        </button>
        <button className="secondary" onClick={() => done({ type: 'takeAndDiscard', playerId: me.id, cardId })}>
          <span>Discard for coins</span>
          <span className="swd-btn-cost">+<CoinIcon value={discardCoins(me)} size={18} /></span>
        </button>
        <button className="secondary swd-btn-cancel" onClick={onClear}>Cancel</button>
      </div>
      <div className="swd-pick-sub">You have <CoinIcon value={me.coins} size={16} /> coins.</div>
    </div>
  );
}

function StarterPanel({ state, viewerSeatIdx, dispatch }: { state: DuelState; viewerSeatIdx: 0 | 1; dispatch: Dispatch }) {
  const me = state.players[viewerSeatIdx];
  const opp = state.players[(1 - viewerSeatIdx) as 0 | 1];
  const why = state.militaryPawn === 0 ? 'You took the last card of the age' : 'The conflict pawn is on your side';
  return (
    <div className="swd-pick-panel">
      <p className="swd-pick-hint">Who takes the first card of Age {['I', 'II', 'III'][state.age - 1]}?</p>
      <p className="swd-pick-sub">{why}, so you choose.</p>
      <div className="swd-pick-buttons">
        <button onClick={() => dispatch({ type: 'chooseStarter', playerId: me.id, starterId: me.id })}>I start</button>
        <button className="secondary" onClick={() => dispatch({ type: 'chooseStarter', playerId: me.id, starterId: opp.id })}>
          {playerName(opp, state)} starts
        </button>
      </div>
    </div>
  );
}

function TokenChoicePanel({ state, viewerSeatIdx, dispatch }: { state: DuelState; viewerSeatIdx: 0 | 1; dispatch: Dispatch }) {
  const me = state.players[viewerSeatIdx];
  const p = state.pending[0];
  const library = state.subPhase === 'libraryPick';
  const options = library ? (p?.kind === 'library' ? p.options : []) : state.progressOffer;
  return (
    <div className="swd-pick-panel">
      <p className="swd-pick-hint">{library ? 'The Great Library: keep one' : 'A pair of science symbols! Take a Progress token'}</p>
      <div className="swd-token-choices">
        {options.map((tid) => {
          const t = progressTokenById(tid);
          const pick = () => dispatch({ type: 'chooseProgressToken', playerId: me.id, tokenId: tid });
          return (
            <div
              key={tid}
              className="swd-progress-choice pickable"
              role="button"
              tabIndex={0}
              onClick={pick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
            >
              <ProgressToken id={tid} size={44} />
              <div>
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardChoicePanel({ state, viewerSeatIdx, dispatch }: { state: DuelState; viewerSeatIdx: 0 | 1; dispatch: Dispatch }) {
  const me = state.players[viewerSeatIdx];
  const opp = state.players[(1 - viewerSeatIdx) as 0 | 1];
  const p = state.pending[0];
  const destroy = state.subPhase === 'destroyCard';
  const cards = destroy ? opp.tableau.filter((c) => p?.kind === 'destroy' && c.color === p.color) : state.discard.slice().reverse();
  return (
    <div className="swd-pick-panel">
      <p className="swd-pick-hint">
        {destroy ? `Put one of ${playerName(opp, state)}'s ${p?.kind === 'destroy' ? p.color : ''} cards on the discard pile` : 'Build one of the discarded cards for free'}
      </p>
      <div className="swd-card-choices">
        {cards.map((c) => (
          <CardFace
            key={c.id}
            card={c}
            size="sm"
            className="pickable"
            onClick={() => dispatch(destroy
              ? { type: 'destroyCard', playerId: me.id, cardId: c.id }
              : { type: 'buildFromDiscard', playerId: me.id, cardId: c.id })}
          />
        ))}
      </div>
    </div>
  );
}

// ===================================================================
// Side column
// ===================================================================

function OfferToken({ id }: { id: DuelProgressTokenId }) {
  const t = progressTokenById(id);
  return (
    <div className="swd-offer-row" title={t.description}>
      <ProgressToken id={id} size={40} nodeRef={useFlip(tokenKey(id), 'offer')} />
      <div>
        <strong>{t.name}</strong>
        <span>{t.description}</span>
      </div>
    </div>
  );
}

function ProgressOffer({ state }: { state: DuelState }) {
  if (state.progressOffer.length === 0) return null;
  return (
    <div className="swd-side-box">
      <h4>Progress tokens</h4>
      {state.progressOffer.map((tid) => <OfferToken key={tid} id={tid} />)}
    </div>
  );
}

function DiscardBand({ card }: { card: DuelCard }) {
  return <CardBand card={card} nodeRef={useFlip(cardKey(card.id), 'discard')} />;
}

function DiscardPile({ state }: { state: DuelState }) {
  return (
    <div className="swd-side-box">
      <h4>Discard pile · {state.discard.length}</h4>
      {state.discard.length > 0
        ? <div className="swd-discard">{state.discard.slice().reverse().map((c) => <DiscardBand key={c.id} card={c} />)}</div>
        : <span className="swd-dim">Empty</span>}
    </div>
  );
}

function logText(state: DuelState, e: DuelLogEntry): string | null {
  const name = (id: PlayerId) => state.seats.find((s) => s.id === id)?.name ?? id;
  const coins = (n: number) => `${n} coin${n === 1 ? '' : 's'}`;
  switch (e.kind) {
    case 'wonderDrafted': return `${name(e.playerId)} drafted ${wonderById(e.wonderId).name}`;
    case 'ageStart': return `— Age ${['I', 'II', 'III'][e.age - 1]} —`;
    case 'starterChosen': return e.starterId === e.playerId ? `${name(e.playerId)} starts the age` : `${name(e.playerId)} lets ${name(e.starterId)} start`;
    case 'cardBuilt':
      return `${name(e.playerId)} built ${e.cardName}${e.fromDiscard ? ' from the discard pile' : e.chained ? ' (free, chain)' : e.paid ? ` (${coins(e.paid)})` : ''}`;
    case 'wonderBuilt': return `${name(e.playerId)} built ${wonderById(e.wonderId).name}${e.paid ? ` (${coins(e.paid)})` : ''}`;
    case 'cardDiscarded': return `${name(e.playerId)} discarded ${e.cardName} for ${coins(e.coinsGained)}`;
    case 'cardDestroyed': return `${name(e.playerId)} destroyed ${name(e.ownerId)}'s ${e.cardName}`;
    case 'militaryAdvance': return `${name(e.playerId)} +${e.amount} shield${e.amount === 1 ? '' : 's'}`;
    case 'looted': return e.coins > 0 ? `${name(e.playerId)} is looted: −${coins(e.coins)}` : null;
    case 'coinsLost': return `${name(e.playerId)} loses ${coins(e.coins)}`;
    case 'progressTaken': return `${name(e.playerId)} took ${progressTokenById(e.tokenId).name}${e.fromBox ? ' (Great Library)' : ''}`;
    case 'wonderRemoved': return `${wonderById(e.wonderId).name} goes back to the box`;
    case 'playAgain': return `${name(e.playerId)} plays again`;
    case 'gameEnd': return null;
  }
}

function History({ state }: { state: DuelState }) {
  const lines: { seq: number; text: string }[] = [];
  for (let i = state.log.length - 1; i >= 0 && lines.length < 14; i--) {
    const text = logText(state, state.log[i]);
    if (text) lines.push({ seq: state.log[i].seq, text });
  }
  if (lines.length === 0) return null;
  return (
    <div className="swd-side-box">
      <h4>History</h4>
      <ol className="swd-log">{lines.map((l) => <li key={l.seq}>{l.text}</li>)}</ol>
    </div>
  );
}

// ===================================================================
// Game over
// ===================================================================

function GameOver({ state }: { state: DuelState }) {
  const winnerSeat = state.winnerSeatIdx !== null ? state.seats[state.winnerSeatIdx] : null;
  const reasonText = state.endReason === 'military' ? 'Military Supremacy'
    : state.endReason === 'science' ? 'Scientific Supremacy'
    : winnerSeat ? 'Civilian Victory' : 'Shared victory';
  const reasonIcon = state.endReason === 'military' ? <ShieldIcon size={34} />
    : state.endReason === 'science' ? <ScienceIcon symbol="globe" size={34} />
    : <LaurelIcon size={34} />;
  const head = (title: string, icon: ReactNode) => <th title={title}><span className="swd-th">{icon}</span></th>;
  const chip = (c: DuelCardColor) => <Icon size={22}><ChipGlyph color={c} /></Icon>;
  return (
    <div className="swd-game swd-game-over">
      <div className="swd-main">
        <div className="swd-gameover">
          <div className="swd-gameover-banner">
            {reasonIcon}
            <div>
              <h2>{winnerSeat ? `${winnerSeat.name} wins` : 'Draw'}</h2>
              <span>{reasonText}</span>
            </div>
          </div>
          {state.finalScoringBreakdown && (
            <div className="swd-score-wrap">
              <table className="swd-score-table">
                <thead>
                  <tr>
                    <th />
                    {head('Civilian (blue cards)', chip('blue'))}
                    {head('Science (green cards)', chip('green'))}
                    {head('Commercial (yellow cards)', chip('yellow'))}
                    {head('Guilds', chip('purple'))}
                    {head('Wonders', <Icon size={22}><WonderGlyph /></Icon>)}
                    {head('Progress tokens', <Icon size={22}><ProgressGlyph /></Icon>)}
                    {head('Treasury (1 VP per 3 coins)', <CoinIcon size={22} />)}
                    {head('Military', <ShieldIcon size={22} />)}
                    {head('Total', <LaurelIcon value="VP" size={28} title="total VP" />)}
                  </tr>
                </thead>
                <tbody>
                  {state.finalScoringBreakdown.map((row) => {
                    const seat = state.seats.find((s) => s.id === row.playerId);
                    return (
                      <tr key={row.playerId} className={winnerSeat?.id === row.playerId ? 'winner' : ''}>
                        <td><span className="swd-seat-dot" style={{ ['--swd-seat' as string]: seat?.color ?? '#888' }} /> {seat?.name ?? row.playerId}</td>
                        <td>{row.civilian}</td>
                        <td>{row.science}</td>
                        <td>{row.commercial}</td>
                        <td>{row.guild}</td>
                        <td>{row.wonders}</td>
                        <td>{row.progress}</td>
                        <td>{row.treasury}</td>
                        <td>{row.military}</td>
                        <td><strong>{row.total}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {state.endReason !== 'civilian' && <p className="swd-pick-sub">The VP above are for interest: a supremacy wins outright.</p>}
        </div>
        <PlayerPanel state={state} seatIdx={1} />
        <MilitaryTrack state={state} />
        <PlayerPanel state={state} seatIdx={0} />
      </div>
    </div>
  );
}

// ===================================================================
// Helpers
// ===================================================================

function playerName(p: DuelPlayer, state: DuelState): string {
  const seat = state.seats.find((s) => s.id === p.id);
  return seat?.name ?? p.id;
}

// ===================================================================
// Export bundle
// ===================================================================

export const bundle: GameUiBundle<DuelState, DuelAction, DuelConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
