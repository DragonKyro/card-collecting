import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type { MkAction, MkConfig, MkEdition, MkLogEntry, MkMove, MkPlayer, MkRowId, MkState } from './types';
import { EDITIONS, estDef, isEstablishment, lmDef } from './cards';
import {
  buildBlocker, canRollTwo, exchangeableCards, landmarksInForce, priceOf, rightOf, rulesOf,
} from './reducer';
import { expectedRoll } from './ai';
import { CardFace, CoinIcon, DeckBack, DieFace } from './Card';
import { DICE_MS, FxProvider, TweenedNumber, useFx } from './fx';
import { HistoryFeed, cardName } from './Sidebar';
import { Rules } from './rules';
import './machi-koro.css';

// ---------- Lobby ----------

const EDITION_BLURB: Record<MkEdition, string> = {
  mk2: 'Start with 5 coins and nothing built. Three opening build rounds, a 5-5-5 market, landmarks that change the rules for everyone. First to 3 landmarks — or the Launch Pad — wins.',
  mk1: 'The original. Start with a Wheat Field, a Bakery and 3 coins; every card is on sale. Build your four landmarks (Train Station, Shopping Mall, Amusement Park, Radio Tower) to win.',
};

function LobbyConfig({ config, seats, onChange }: { config: MkConfig; seats: Seat[]; onChange: (c: MkConfig) => void }) {
  const R = EDITIONS[config.edition];
  return (
    <div className="game-config mk-lobby">
      <h4 className="mk-lobby-h">Edition</h4>
      <div className="mk-edition-pick" role="radiogroup" aria-label="Edition">
        {(['mk2', 'mk1'] as const).map((ed) => (
          <button
            key={ed}
            type="button"
            role="radio"
            aria-checked={config.edition === ed}
            className={`mk-edition ${config.edition === ed ? 'selected' : 'secondary'}`}
            onClick={() => onChange({ ...config, edition: ed })}
          >
            <strong>{EDITIONS[ed].name}</strong>
            <span className="mk-edition-players">{EDITIONS[ed].minPlayers}–{EDITIONS[ed].maxPlayers} players</span>
            <span className="mk-edition-blurb">{EDITION_BLURB[ed]}</span>
          </button>
        ))}
      </div>
      {config.edition === 'mk2' && (
        <label className="mk-lobby-check">
          <input
            type="checkbox"
            checked={config.promoLandmarks}
            onChange={(e) => onChange({ ...config, promoLandmarks: e.target.checked })}
          />
          Landmark promo pack <span className="muted">(adds Private Club, City Hall, Renovation Company)</span>
        </label>
      )}
      {seats.length > R.maxPlayers && (
        <div className="mk-lobby-warn">{R.name} plays at most {R.maxPlayers} — remove a seat or switch edition.</div>
      )}
    </div>
  );
}

// ---------- Game view ----------

type Dispatch = (a: MkAction) => void;

function GameView({ state, localPlayerId, dispatch }: { state: MkState; localPlayerId: PlayerId | null; dispatch: Dispatch }) {
  const seatOf = (id: PlayerId | null) => state.seats.find((s) => s.id === id);
  const nameOf = (id: PlayerId | null) => seatOf(id)?.name ?? '?';
  const me = state.players.find((p) => p.id === localPlayerId) ?? null;
  const myTurn = !!me && state.phase === 'playing' && state.activePlayerId === me.id;

  // Local selections, reset whenever the decision changes.
  const [selected, setSelected] = useState<string | null>(null);
  const [give, setGive] = useState<string | null>(null);
  const [take, setTake] = useState<{ pid: PlayerId; cardId: string } | null>(null);
  useEffect(() => {
    setSelected(null);
    setGive(null);
    setTake(null);
  }, [state.subPhase, state.turnNumber, state.turn.exchangesLeft]);

  const act = (a: MkMove) => {
    if (!me) return;
    dispatch({ ...a, playerId: me.id } as MkAction);
  };

  const building = myTurn && (state.subPhase === 'build' || state.subPhase === 'setupBuild');
  const canBuy = (cardId: string) => building && me !== null && buildBlocker(state, me, cardId) === null;
  const onMarketClick = (cardId: string) => {
    if (!canBuy(cardId)) return;
    setSelected((cur) => (cur === cardId ? null : cardId));
  };

  // Cards the roll activated this turn — they keep a ring until the turn ends.
  const activated = useMemo(() => {
    const keys = new Set<string>();
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.turn !== state.turnNumber) break;
      if (e.kind === 'coins' && e.source.type !== 'rule') keys.add(`${e.source.ownerId}:${e.source.id}`);
    }
    return keys;
  }, [state.log, state.turnNumber]);

  // Town-card clicks: Business Center picks and Moving Company gifts.
  const onTownCard = (owner: MkPlayer, cardId: string) => {
    if (!myTurn || !me) return;
    if (state.subPhase === 'gift' && owner.id === me.id) {
      act({ type: 'gift', cardId });
    } else if (state.subPhase === 'exchange') {
      if (owner.id === me.id && exchangeableCards(state, me).includes(cardId)) setGive((g) => (g === cardId ? null : cardId));
      else if (owner.id !== me.id && exchangeableCards(state, owner).includes(cardId)) {
        setTake((t) => (t && t.pid === owner.id && t.cardId === cardId ? null : { pid: owner.id, cardId }));
      }
    }
  };
  const townCardClickable = (owner: MkPlayer, cardId: string): boolean => {
    if (!myTurn || !me) return false;
    if (state.subPhase === 'gift') return owner.id === me.id;
    if (state.subPhase === 'exchange') return exchangeableCards(state, owner).includes(cardId);
    return false;
  };

  return (
    <FxProvider state={state} nameOf={nameOf}>
      <div className="mk-layout">
        <div className="mk-main">
          {state.phase === 'gameOver' && <GameOver state={state} nameOf={nameOf} />}
          <TurnBar
            state={state}
            me={me}
            myTurn={myTurn}
            nameOf={nameOf}
            selected={selected}
            give={give}
            take={take}
            act={act}
          />
          <Market state={state} me={me} building={building} selected={selected} canBuy={canBuy} onPick={onMarketClick} />
          <div className="mk-towns">
            {state.players.map((p, i) => (
              <Town
                key={p.id}
                state={state}
                player={p}
                seat={seatOf(p.id)}
                isMe={me?.id === p.id}
                isFirst={i === state.firstIdx}
                active={state.phase === 'playing' && state.activePlayerId === p.id}
                activated={activated}
                selection={{ give: me?.id === p.id ? give : null, take: take?.pid === p.id ? take.cardId : null, lm: selected }}
                cardClickable={(id) => townCardClickable(p, id)}
                onCard={(id) => onTownCard(p, id)}
                landmarkClickable={(id) => me?.id === p.id && rulesOf(state).landmarks === 'personal' && canBuy(id)}
                onLandmark={(id) => onMarketClick(id)}
              />
            ))}
          </div>
        </div>
        <aside className="mk-sidebar">
          <div className="mk-sidebar-head">History</div>
          <HistoryFeed state={state} nameOf={nameOf} />
        </aside>
      </div>
    </FxProvider>
  );
}

// ---------- Turn bar: status, dice, actions ----------

function TurnBar({ state, me, myTurn, nameOf, selected, give, take, act }: {
  state: MkState;
  me: MkPlayer | null;
  myTurn: boolean;
  nameOf: (id: PlayerId | null) => string;
  selected: string | null;
  give: string | null;
  take: { pid: PlayerId; cardId: string } | null;
  act: (a: MkMove) => void;
}) {
  const R = rulesOf(state);
  const ed = state.config.edition;
  const active = state.players[state.currentIdx];
  const activeName = nameOf(active.id);
  const lastRoll = useMemo(() => findLast(state.log, (e): e is Extract<MkLogEntry, { kind: 'roll' }> => e.kind === 'roll'), [state.log]);
  const rollIsCurrent = !!lastRoll && lastRoll.turn === state.turnNumber;

  const phaseLabel = state.phase === 'gameOver'
    ? 'Game over'
    : state.subPhase === 'setupBuild'
      ? `Opening round ${state.setupRound} / ${R.setupRounds}`
      : `Round ${state.round}`;

  let prompt: React.ReactNode = null;
  let buttons: React.ReactNode = null;
  const who = myTurn ? 'You' : activeName;

  if (state.phase === 'playing') {
    switch (state.subPhase) {
      case 'setupBuild':
        prompt = myTurn ? 'Build one establishment from the market, or skip.' : `${activeName} is building…`;
        if (myTurn) buttons = <BuildButtons state={state} me={me!} selected={selected} act={act} passLabel="Skip" />;
        break;
      case 'roll': {
        prompt = myTurn ? 'Roll the dice.' : `${activeName} is about to roll…`;
        if (myTurn && me) {
          const idx = state.currentIdx;
          const two = canRollTwo(state, me.id);
          buttons = (
            <>
              <button onClick={() => act({ type: 'roll', dice: 1 })}>
                🎲 Roll 1 die <span className="mk-ev">avg {fmtEv(expectedRoll(state, idx, 1))}</span>
              </button>
              <button
                onClick={() => act({ type: 'roll', dice: 2 })}
                disabled={!two}
                title={two ? undefined : 'Build the Train Station to roll two dice.'}
              >
                🎲🎲 Roll 2 dice {two && <span className="mk-ev">avg {fmtEv(expectedRoll(state, idx, 2))}</span>}
              </button>
            </>
          );
        }
        break;
      }
      case 'reroll':
        prompt = myTurn
          ? <>Radio Tower: keep the {state.turn.roll?.total}, or reroll once?</>
          : `${activeName} is deciding whether to reroll…`;
        if (myTurn && me) {
          buttons = (
            <>
              <button onClick={() => act({ type: 'keepRoll' })}>Keep {state.turn.roll?.total}</button>
              <button className="secondary" onClick={() => act({ type: 'reroll', dice: 1 })}>Reroll 1 die</button>
              {canRollTwo(state, me.id) && (
                <button className="secondary" onClick={() => act({ type: 'reroll', dice: 2 })}>Reroll 2 dice</button>
              )}
            </>
          );
        }
        break;
      case 'tvTarget':
        prompt = myTurn ? 'TV Station: take 5 coins from…' : `${activeName} is choosing who pays for the TV Station…`;
        if (myTurn && me) {
          buttons = state.players.filter((p) => p !== me).map((p) => (
            <button key={p.id} onClick={() => act({ type: 'tvTarget', targetId: p.id })} disabled={p.coins === 0}>
              {nameOf(p.id)} ({p.coins} <CoinIcon size={13} />)
            </button>
          ));
        }
        break;
      case 'exchange':
        prompt = myTurn
          ? (
            <>
              Business Center{state.turn.exchangesLeft > 1 ? ` (×${state.turn.exchangesLeft})` : ''}: pick one of
              your establishments{give ? <> — <b>{cardName(ed, give)}</b></> : ''}, then one of an
              opponent’s{take ? <> — <b>{nameOf(take.pid)}’s {cardName(ed, take.cardId)}</b></> : ''}.
              {!R.exchangePurples && ' (Purple cards can’t be traded.)'}
            </>
          )
          : `${activeName} may swap an establishment (Business Center)…`;
        if (myTurn) {
          buttons = (
            <>
              <button
                disabled={!give || !take}
                onClick={() => give && take && act({ type: 'exchange', give, targetId: take.pid, take: take.cardId })}
              >
                Swap
              </button>
              <button className="secondary" onClick={() => act({ type: 'skipExchange' })}>Don’t swap</button>
            </>
          );
        }
        break;
      case 'gift': {
        const to = nameOf(rightOf(state, state.currentIdx).id);
        prompt = myTurn
          ? <>Moving Company — you rolled doubles. Click one of your establishments to give to <b>{to}</b>.</>
          : `${activeName} must give an establishment to ${to} (Moving Company)…`;
        break;
      }
      case 'build': {
        prompt = myTurn ? 'Build one card from the market, or pass.' : `${activeName} is building…`;
        if (myTurn && me) {
          const airport = landmarksInForce(state, me.id).some((l) => l.def.effect.kind === 'skipBuildBonus');
          buttons = <BuildButtons state={state} me={me} selected={selected} act={act} passLabel={airport ? 'Pass (+5 Airport)' : 'Pass'} />;
        }
        break;
      }
    }
  }

  return (
    <div className={`mk-turnbar ${myTurn ? 'mine' : ''}`}>
      <div className="mk-turnbar-info">
        <span className="mk-phase">{phaseLabel}</span>
        {state.phase === 'playing' && (
          <span className="mk-whose">
            <span className="mk-dot" style={{ background: state.seats[state.currentIdx]?.color }} />
            {myTurn ? 'Your turn' : `${who}’s turn`}
            {state.turn.extraTurn && <span className="mk-tag">extra turn next</span>}
          </span>
        )}
        <div className="mk-prompt">{prompt}</div>
        {buttons && <div className="mk-actions">{buttons}</div>}
      </div>
      <DiceTray roll={lastRoll} current={rollIsCurrent} nameOf={nameOf} />
    </div>
  );
}

function BuildButtons({ state, me, selected, act, passLabel }: {
  state: MkState; me: MkPlayer; selected: string | null; act: (a: MkMove) => void; passLabel: string;
}) {
  const ed = state.config.edition;
  return (
    <>
      <button disabled={!selected} onClick={() => selected && act({ type: 'build', cardId: selected })}>
        {selected
          ? <>Build {cardName(ed, selected)} for {priceOf(state, me, selected)} <CoinIcon size={13} /></>
          : 'Pick a card to build'}
      </button>
      <button className="secondary" onClick={() => act({ type: 'pass' })}>{passLabel}</button>
    </>
  );
}

function fmtEv(v: number): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
}

function findLast<T, S extends T>(xs: T[], pred: (x: T) => x is S): S | null {
  for (let i = xs.length - 1; i >= 0; i--) if (pred(xs[i])) return xs[i] as S;
  return null;
}

function DiceTray({ roll, current, nameOf }: {
  roll: Extract<MkLogEntry, { kind: 'roll' }> | null;
  current: boolean;
  nameOf: (id: PlayerId | null) => string;
}) {
  const mountSeq = useRef(roll?.seq ?? 0);
  const [tumble, setTumble] = useState<number[] | null>(null);
  const seq = roll?.seq ?? 0;
  const n = roll?.dice.length ?? 0;
  useEffect(() => {
    if (!seq || seq <= mountSeq.current) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const face = () => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    setTumble(face());
    const spin = setInterval(() => setTumble(face()), 75);
    const stop = setTimeout(() => { clearInterval(spin); setTumble(null); }, DICE_MS);
    return () => { clearInterval(spin); clearTimeout(stop); setTumble(null); };
  }, [seq, n]);

  if (!roll) {
    return (
      <div className="mk-dice idle">
        <div className="mk-dice-row"><DieFace value={1} size={46} className="ghost" /><DieFace value={6} size={46} className="ghost" /></div>
        <div className="mk-dice-label">No roll yet</div>
      </div>
    );
  }
  const showing = tumble ?? roll.dice;
  return (
    <div className={`mk-dice ${current ? '' : 'stale'} ${tumble ? 'rolling' : 'landed'}`} key={roll.seq}>
      <div className="mk-dice-row">
        {showing.map((v, i) => <DieFace key={i} value={v} size={52} className={tumble ? `tumble t${i}` : 'settle'} />)}
      </div>
      <div className="mk-dice-label">
        {tumble ? 'Rolling…' : (
          <>
            {nameOf(roll.playerId)} {roll.reroll ? 'rerolled' : 'rolled'} <b className="mk-total">{roll.total}</b>
            {roll.doubles && <span className="mk-tag hot">doubles!</span>}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Market ----------

const ROW_LABEL: Record<MkRowId, string> = { low: '1–6', high: '7+', landmark: 'Landmarks' };

function Market({ state, me, building, selected, canBuy, onPick }: {
  state: MkState; me: MkPlayer | null; building: boolean; selected: string | null;
  canBuy: (id: string) => boolean; onPick: (id: string) => void;
}) {
  const fx = useFx();
  const R = rulesOf(state);
  const ed = state.config.edition;
  const rows: MkRowId[] = R.landmarks === 'market' ? ['low', 'high', 'landmark'] : ['low', 'high'];
  return (
    <section className={`mk-market ${R.market}`}>
      <div className="mk-market-head">
        <h3>{R.market === 'rows' ? 'Marketplace' : 'Supply'}</h3>
        <div className="mk-bank" ref={fx.anchor('bank')} title="The bank never runs out.">
          <span className="mk-bank-stack"><CoinIcon size={20} /><CoinIcon size={20} /><CoinIcon size={20} /></span>
          Bank
        </div>
      </div>
      {rows.map((row) => {
        const r = state.market[row];
        return (
          <div key={row} className={`mk-market-row row-${row}`}>
            <div className="mk-row-label">
              <span>{ROW_LABEL[row]}</span>
              {R.market === 'rows' && <DeckBack label="deck" count={r.deck.length} size="sm" />}
            </div>
            <div className="mk-row-cards">
              {r.slots.map((slot) => {
                const why = building && me ? buildBlocker(state, me, slot.cardId) : null;
                const buyable = canBuy(slot.cardId);
                const isLm = !isEstablishment(ed, slot.cardId);
                return (
                  <div
                    key={slot.cardId}
                    ref={fx.anchor(`market:${slot.cardId}`)}
                    className={`mk-slot ${slot.count === 0 ? 'soldout' : ''} ${buyable ? 'buyable' : ''} ${selected === slot.cardId ? 'selected' : ''} ${building && !buyable ? 'dim' : ''}`}
                  >
                    <CardFace
                      edition={ed}
                      cardId={slot.cardId}
                      size="lg"
                      count={slot.count}
                      priceIndex={isLm && me ? me.landmarks.length : undefined}
                      price={isLm && me ? priceOf(state, me, slot.cardId) : undefined}
                      onClick={buyable ? () => onPick(slot.cardId) : undefined}
                      title={why ? `${cardName(ed, slot.cardId)}: ${why}` : undefined}
                    />
                    {slot.count === 0 && <span className="mk-soldout">Sold out</span>}
                  </div>
                );
              })}
              {r.slots.length === 0 && <span className="muted">Empty</span>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ---------- Towns ----------

function Town({
  state, player, seat, isMe, isFirst, active, activated, selection, cardClickable, onCard, landmarkClickable, onLandmark,
}: {
  state: MkState;
  player: MkPlayer;
  seat: Seat | undefined;
  isMe: boolean;
  isFirst: boolean;
  active: boolean;
  activated: Set<string>;
  selection: { give: string | null; take: string | null; lm: string | null };
  cardClickable: (cardId: string) => boolean;
  onCard: (cardId: string) => void;
  landmarkClickable: (lmId: string) => boolean;
  onLandmark: (lmId: string) => void;
}) {
  const fx = useFx();
  const R = rulesOf(state);
  const ed = state.config.edition;
  const won = state.winnerId === player.id;
  const cards = Object.entries(player.city)
    .map(([id, count]) => ({ def: estDef(ed, id), count }))
    .sort((a, b) => a.def.activation[0] - b.def.activation[0] || a.def.activation.length - b.def.activation.length || a.def.name.localeCompare(b.def.name));
  const landmarkIds = R.landmarks === 'personal' ? R.landmarkDefs.map((l) => l.id) : player.landmarks;
  const slotsLeft = R.landmarks === 'market' ? Math.max(0, R.landmarksToWin - player.landmarks.length) : 0;

  return (
    <section className={`mk-town ${active ? 'active' : ''} ${won ? 'won' : ''}`} style={{ ['--mk-seat' as string]: seat?.color ?? '#888' }}>
      <header className="mk-town-head">
        <span className="mk-dot" />
        <span className="mk-town-name">{seat?.name ?? player.id}</span>
        {isMe && <span className="mk-tag">you</span>}
        {seat?.isAI && <span className="mk-tag ai">AI</span>}
        {isFirst && <span className="mk-tag" title="First player">1st</span>}
        {won && <span className="mk-tag win">winner</span>}
        <span className="mk-town-stars" title={`${player.landmarks.length} of ${R.landmarksToWin} landmarks`}>
          {Array.from({ length: R.landmarksToWin }, (_, i) => (
            <span key={i} className={i < player.landmarks.length ? 'on' : ''}>★</span>
          ))}
        </span>
        <span className="mk-coins" ref={fx.anchor(`coins:${player.id}`)}>
          <CoinIcon size={20} /> <TweenedNumber value={player.coins} />
        </span>
      </header>
      <div className="mk-town-body">
        <div className="mk-town-landmarks">
          {landmarkIds.map((id) => {
            const built = player.landmarks.includes(id);
            const clickable = !built && landmarkClickable(id);
            return (
              <div key={id} ref={fx.anchor(`lm:${player.id}:${id}`)} className={`mk-town-card ${clickable ? 'buyable' : ''} ${selection.lm === id && clickable ? 'selected' : ''}`}>
                <CardFace
                  edition={ed}
                  cardId={id}
                  size="sm"
                  unbuilt={!built}
                  price={!built ? priceOf(state, player, id) : undefined}
                  onClick={clickable ? () => onLandmark(id) : undefined}
                  title={`${lmDef(ed, id).name}${built ? '' : ` (not built — ${priceOf(state, player, id)} coins)`} — ${lmDef(ed, id).text}`}
                />
              </div>
            );
          })}
          {Array.from({ length: slotsLeft }, (_, i) => <div key={`empty${i}`} className="mk-lm-slot" title="Landmark slot">★</div>)}
        </div>
        <div className="mk-town-cards">
          {cards.length === 0 && <span className="muted mk-empty-town">No establishments yet</span>}
          {cards.map(({ def, count }) => {
            const clickable = cardClickable(def.id);
            const sel = selection.give === def.id || selection.take === def.id;
            return (
              <div
                key={def.id}
                ref={fx.anchor(`city:${player.id}:${def.id}`)}
                className={`mk-town-card ${activated.has(`${player.id}:${def.id}`) ? 'activated' : ''} ${clickable ? 'pickable' : ''} ${sel ? 'selected' : ''}`}
              >
                <CardFace edition={ed} cardId={def.id} size="sm" count={count} onClick={clickable ? () => onCard(def.id) : undefined} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- Game over ----------

function GameOver({ state, nameOf }: { state: MkState; nameOf: (id: PlayerId | null) => string }) {
  const R = rulesOf(state);
  const standings = state.players
    .map((p) => ({ p, est: Object.values(p.city).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => Number(b.p.id === state.winnerId) - Number(a.p.id === state.winnerId)
      || b.p.landmarks.length - a.p.landmarks.length || b.p.coins - a.p.coins);
  return (
    <div className="mk-gameover">
      <div className="mk-confetti" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}
      </div>
      <h2>{state.winReason === 'launchPad' ? '🚀' : '🏆'} {nameOf(state.winnerId)} wins!</h2>
      <p className="muted">
        {state.winReason === 'launchPad'
          ? 'Launched from the Launch Pad.'
          : `Built ${R.landmarksToWin === 4 ? 'all four' : `${R.landmarksToWin}`} landmarks`} · round {state.round}
      </p>
      <table className="mk-standings">
        <thead><tr><th /><th>Player</th><th>Landmarks</th><th>Coins</th><th>Establishments</th></tr></thead>
        <tbody>
          {standings.map(({ p, est }, i) => (
            <tr key={p.id} className={p.id === state.winnerId ? 'win' : ''}>
              <td>{i + 1}</td>
              <td>{nameOf(p.id)}</td>
              <td>{p.landmarks.map((id) => lmDef(state.config.edition, id).name).join(', ') || '—'}</td>
              <td>{p.coins}</td>
              <td>{est}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const bundle: GameUiBundle<MkState, MkAction, MkConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
