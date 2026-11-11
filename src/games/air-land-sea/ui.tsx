// Air, Land & Sea — lobby config, rule book and in-game view.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type { AlsAction, AlsAnswer, AlsConfig, AlsPending, AlsState, AlsTheaterId } from './types';
import { AlsCardView, FaceDownCard, MiniFace } from './Card';
import { TheaterColumn } from './Theater';
import { Sidebar, abilityName, possessive, wins } from './Sidebar';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import {
  ALL_THEATER_IDS, BASE_THEATER_IDS, CARD_TEMPLATES, DEFAULT_TARGET_VP, SLS_THEATER_IDS, THEATER_DEFS,
  WITHDRAW_CHARTS, cardById, cardIdsForTheaters, cardLabel,
} from './cards';
import { isEpic, locate, otherSeat, playOptions, vpForWithdraw } from './rules';
import { ControlFlag, MedalIcon, SupplyToken, TheaterBanner, TheaterEmblem, THEATER_TINT, WhiteFlag } from './art';
import { useArrivals, useBoardFx } from './boardFx';
import './als.css';

// ============================================================================
// Lobby config
// ============================================================================

const EPIC_DEFAULT: AlsTheaterId[] = ['intel', 'diplo', 'econ', 'land', 'sea'];

function LobbyConfig({ config, onChange }: { config: AlsConfig; seats: Seat[]; onChange: (c: AlsConfig) => void }) {
  const sls = !!config.expansions?.spiesLiesSupplies;
  const epic = config.theaters.length > 3 || !!config.epic;
  const want = epic ? 5 : 3;

  const setSls = (on: boolean) => onChange({
    ...config,
    expansions: { ...config.expansions, spiesLiesSupplies: on },
    epic: false,
    theaters: on ? SLS_THEATER_IDS.slice() : BASE_THEATER_IDS.slice(),
  });
  const setEpic = (on: boolean) => onChange({
    ...config,
    epic: on,
    theaters: on ? EPIC_DEFAULT.slice() : config.theaters.slice(0, 3),
    targetVp: config.beginner ? config.targetVp : on ? 6 : DEFAULT_TARGET_VP,
  });
  const toggle = (id: AlsTheaterId) => {
    if (config.theaters.includes(id)) onChange({ ...config, theaters: config.theaters.filter((t) => t !== id) });
    else if (config.theaters.length < want) onChange({ ...config, theaters: [...config.theaters, id] });
  };
  const setBeginner = (on: boolean) => onChange({ ...config, beginner: on, targetVp: on ? 3 : epic ? 6 : DEFAULT_TARGET_VP });
  const available = sls ? ALL_THEATER_IDS : BASE_THEATER_IDS;
  const random = config.randomOrder !== false;

  return (
    <div className="game-config als-lobby">
      <label className="als-lobby-check">
        <input type="checkbox" checked={sls} onChange={(e) => setSls(e.target.checked)} />
        <span>
          <strong>Spies, Lies &amp; Supplies</strong>
          <small>Intelligence, Diplomacy and Economics: 18 new cards and supply tokens. Play any three theaters from either box.</small>
        </span>
      </label>
      {sls && (
        <label className="als-lobby-check">
          <input type="checkbox" checked={epic} onChange={(e) => setEpic(e.target.checked)} />
          <span>
            <strong>Epic Mode</strong>
            <small>Five theaters, 10-card hands; win a battle by holding 3. Withdrawals use the Epic column, and ongoing abilities reach only their own and the adjacent theaters.</small>
          </span>
        </label>
      )}

      <h4 className="als-lobby-heading">Theaters ({config.theaters.length}/{want})</h4>
      <div className="als-theater-picker">
        {available.map((t) => {
          const at = config.theaters.indexOf(t);
          const full = at === -1 && config.theaters.length >= want;
          return (
            <button
              key={t}
              type="button"
              className={`als-theater-pill ${at !== -1 ? 'selected' : ''}`}
              style={{ '--als-tint': THEATER_TINT[t].main, '--als-tint-dark': THEATER_TINT[t].dark } as CSSProperties}
              disabled={full}
              onClick={() => toggle(t)}
            >
              <TheaterEmblem theater={t} size={16} />
              {THEATER_DEFS[t].name}
              {!random && at !== -1 && <small>#{at + 1}</small>}
            </button>
          );
        })}
      </div>
      <label className="als-lobby-check">
        <input type="checkbox" checked={random} onChange={(e) => onChange({ ...config, randomOrder: e.target.checked })} />
        <span>Deal the theater row in a random order <small>(otherwise left to right in the order picked)</small></span>
      </label>

      <h4 className="als-lobby-heading">Scoring</h4>
      <label className="als-lobby-inline">
        <span>Play to</span>
        <input
          type="number"
          min={1}
          max={30}
          value={config.targetVp}
          onChange={(e) => onChange({ ...config, targetVp: Math.max(1, Math.min(30, Number(e.target.value) || DEFAULT_TARGET_VP)) })}
        />
        <span>VP</span>
        <small>12 standard · 18 for a longer war{epic ? ' · 6 suggested for Epic' : ''}</small>
      </label>
      <label className="als-lobby-check">
        <input type="checkbox" checked={!!config.beginner} onChange={(e) => setBeginner(e.target.checked)} />
        <span>
          <strong>Beginner Mode</strong>
          <small>Every battle won is 1 VP, however it ends; first to 3.</small>
        </span>
      </label>
    </div>
  );
}

// ============================================================================
// Rule book
// ============================================================================

function CardTable({ theater }: { theater: AlsTheaterId }) {
  return (
    <table className="tight">
      <thead><tr><th className="num">Str</th><th>{THEATER_DEFS[theater].name}</th><th>Ability</th></tr></thead>
      <tbody>
        {CARD_TEMPLATES.filter((c) => c.theater === theater).map((c) => (
          <tr key={c.id}>
            <td className="num">{c.strength}</td>
            <td>{c.name}</td>
            <td className="muted">{c.trigger ? <><strong>{c.trigger === 'instant' ? 'Instant' : 'Ongoing'}:</strong> {c.text}</> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartTable({ mode }: { mode: 'standard' | 'epic' }) {
  const rows = (seat: 'first' | 'second') => {
    const chart = WITHDRAW_CHARTS[mode][seat];
    return chart.map((r, i) => {
      const top = i === 0 ? null : chart[i - 1].minCards - 1;
      return { vp: r.vp, cards: i === 0 ? `${r.minCards}+` : top === r.minCards ? `${r.minCards}` : `${r.minCards}–${top}` };
    });
  };
  const first = rows('first');
  const second = rows('second');
  return (
    <table className="tight">
      <thead><tr><th className="num">Opponent scores</th><th>1st Player has left</th><th>2nd Player has left</th></tr></thead>
      <tbody>
        {first.map((r, i) => (
          <tr key={r.vp}><td className="num">{r.vp} VP</td><td>{r.cards}</td><td>{second[i].cards}</td></tr>
        ))}
      </tbody>
    </table>
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
                title="Air, Land & Sea"
                subtitle="Two commanders, a row of theaters, a series of battles. First to 12 VP wins the war."
                accent="linear-gradient(135deg, #4d5a66 0%, #5f8f3e 50%, #2f7db3 100%)"
              />
              <p>
                Each battle, the theaters are laid in a row (random order). The red Supreme Commander is the
                1st Player: they move first and win tied theaters. The deck is the six cards of each theater in
                play; each player is dealt 6 and the rest stay face down. You don't draw during a battle unless
                an ability says so.
              </p>
              <h3>On your turn, do one thing</h3>
              <RulesGrid cols={3}>
                <RulesTile icon="⚡" label="Deploy" hint="Play a card face up to its matching theater. Its Tactical Ability takes effect." accent="#9ed27c" />
                <RulesTile icon="🃏" label="Improvise" hint="Play a card face down to any theater: strength 2, no ability." accent="#6aa0ff" />
                <RulesTile icon="🏳️" label="Withdraw" hint="Concede the battle. Your opponent scores off your Supreme Commander card." accent="#ff7070" />
              </RulesGrid>
              <p>A newly played card covers your earlier cards in that theater; only the top one is uncovered.</p>
            </>
          ),
        },
        {
          title: 'Winning battles',
          body: (
            <>
              <p>
                A battle ends when someone withdraws, or once both players have played every card in hand. You
                control a theater with more total strength there than your opponent; the 1st Player wins ties
                and empty theaters. Whoever controls more theaters (2 of 3, or 3 of 5 in Epic Mode) wins.
              </p>
              <RulesGrid cols={2}>
                <RulesTile icon="🏆" label="Fought to the end" hint="The winner scores 6 VP." accent="#f4d268" />
                <RulesTile icon="🏳️" label="Withdrawal" hint="The more cards you still hold, the fewer VP your opponent gets." accent="#ff7070" />
              </RulesGrid>
              <h3>Supreme Commander charts</h3>
              <ChartTable mode="standard" />
              <p className="muted">
                Between battles the rightmost theater moves to the left end, and the players swap Supreme
                Commanders. Beginner Mode: every battle won is 1 VP; first to 3.
              </p>
            </>
          ),
        },
        {
          title: 'Tactical abilities',
          body: (
            <>
              <p>
                <strong>Instant</strong> abilities take effect right after the card is played face up, or when a
                face-down card is flipped face up. When several happen together they resolve in the order they
                happened, each fully before the next — and once one starts it always finishes, even if its card
                is flipped face down meanwhile. <strong>Ongoing</strong> abilities work while their card is face
                up, covered or not.
              </p>
              <p>You must carry out an ability unless it says “may”; one that is impossible does nothing.</p>
              <table className="tight">
                <tbody>
                  <tr><td><strong>Flip</strong></td><td>Turn a card over — yours or your opponent's, unless the ability says otherwise.</td></tr>
                  <tr><td><strong>Uncovered</strong></td><td>If an ability doesn't say uncovered or covered, it can affect any card.</td></tr>
                  <tr><td><strong>Play</strong></td><td>Taking a card from your hand into a theater, following the normal rules unless told otherwise.</td></tr>
                  <tr><td><strong>Non-matching</strong></td><td>A card that ends up in another type's theater stays there and counts normally.</td></tr>
                  <tr><td><strong>Destroy</strong></td><td>Face down to the bottom of the deck. A card destroyed as it is played never uses its ability.</td></tr>
                  <tr><td><strong>Occupied</strong></td><td>Count both players' cards in the theater.</td></tr>
                  <tr><td><strong>Move</strong></td><td>To another theater on the same side, on top. Moving is not playing.</td></tr>
                </tbody>
              </table>
            </>
          ),
        },
        {
          title: 'Air, Land & Sea cards',
          body: (
            <>
              <CardTable theater="air" />
              <CardTable theater="land" />
              <CardTable theater="sea" />
            </>
          ),
        },
        {
          title: 'Spies, Lies & Supplies',
          body: (
            <>
              <p>
                Three new theaters — Intelligence, Diplomacy, Economics — played on their own or mixed with the
                base game: any three theaters from either box.
              </p>
              <table className="tight">
                <tbody>
                  <tr><td><SupplyToken size={16} /> <strong>Supply</strong></td><td>A token on your side of a theater, worth +1 strength there.</td></tr>
                  <tr><td><strong>Reveal</strong></td><td>Show a card from your hand to your enemy, then keep it. No reveal, no benefit.</td></tr>
                  <tr><td><strong>Higher / lower</strong></td><td>A card in hand counts its printed strength; in play, the value showing (a face-down card is 2).</td></tr>
                  <tr><td><strong>Name</strong></td><td>A card is named by theater and strength (“Diplomacy 3”), not just its title.</td></tr>
                </tbody>
              </table>
              <CardTable theater="intel" />
              <CardTable theater="diplo" />
              <CardTable theater="econ" />
            </>
          ),
        },
        {
          title: 'Epic Mode',
          body: (
            <>
              <p>
                Five theaters from either box, 10-card hands. If nobody withdraws, the winner is whoever controls
                at least 3 theaters. Ongoing abilities reach only their own theater and the adjacent ones.
                Playing to 6 VP keeps the war a sensible length.
              </p>
              <h3>Epic Supreme Commander charts</h3>
              <ChartTable mode="epic" />
              <h3>Notes for this table</h3>
              <ul>
                <li>A player whose hand is empty while the opponent still holds cards passes their turn.</li>
                <li>Revealed cards stay visible in the revealer's hand (marked) until they are played.</li>
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}

// ============================================================================
// In-game view
// ============================================================================

interface Selection { cardId: number; faceDown: boolean }

const BOARD_PICK = new Set(['flip', 'destroy', 'destroyOwn', 'redeployPick', 'incite', 'retrofit']);

function GameView({ state, localPlayerId, dispatch }: { state: AlsState; localPlayerId: PlayerId | null; dispatch: (a: AlsAction) => void }) {
  const viewer = useMemo<0 | 1 | -1>(() => {
    if (state.players[0].id === localPlayerId) return 0;
    if (state.players[1].id === localPlayerId) return 1;
    return -1;
  }, [state.players, localPlayerId]);
  const [sel, setSel] = useState<Selection | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  useEffect(() => {
    setSel(null);
    setMoving(null);
    setConfirmWithdraw(false);
  }, [state.logSeq, state.activePlayerId, state.subPhase, state.battleNumber]);

  const name = (s: 0 | 1) => state.seats.find((x) => x.id === state.players[s].id)?.name ?? `Seat ${s + 1}`;

  // Entrance animations: what changed on the board, which hand cards are new.
  const fx = useBoardFx(state);
  const freshHand = useArrivals(
    viewer === -1 ? [] : state.players[viewer].hand,
    viewer,
    state.battleNumber,
    state.log[state.log.length - 1]?.kind === 'battleStart',
  );

  if (state.phase === 'gameOver' || state.subPhase === 'battleEnd') {
    return (
      <div className="als-layout">
        <div className="als">
          {state.phase === 'gameOver' ? <GameOver state={state} name={name} /> : <BattleEnd state={state} viewer={viewer} name={name} dispatch={dispatch} />}
        </div>
        <Sidebar state={state} viewer={viewer} />
      </div>
    );
  }

  const me = viewer === -1 ? null : state.players[viewer];
  const myTurn = viewer !== -1 && state.subPhase === 'action' && state.activePlayerId === me!.id;
  const pending: AlsPending | null = state.subPhase === 'resolving' ? state.pending : null;
  const mine = pending && viewer !== -1 && pending.seat === viewer ? pending : null;
  const playMode = myTurn || mine?.prompt === 'redeployPlay';
  const answer = (a: AlsAnswer) => me && dispatch({ type: 'answer', playerId: me.id, answer: a });

  // ----- what can be picked
  const playable = (cardId: number) => {
    if (!playMode || viewer === -1) return null;
    if (mine?.prompt === 'redeployPlay' && !(mine.cards ?? []).includes(cardId)) return null;
    const o = playOptions(state, viewer, cardId);
    return o.faceUp.length + o.faceDown.length > 0 ? o : null;
  };
  const targetTheaters = new Set<number>();
  if (sel && viewer !== -1) {
    const o = playOptions(state, viewer, sel.cardId);
    for (const t of sel.faceDown ? o.faceDown : o.faceUp) targetTheaters.add(t);
  }
  if (mine && (mine.prompt === 'reinforce' || mine.prompt === 'supply')) for (const t of mine.theaters ?? []) targetTheaters.add(t);
  if (mine?.prompt === 'transport' && moving !== null) {
    const from = locate(state, moving)?.theaterIdx;
    state.theaters.forEach((_, t) => { if (t !== from) targetTheaters.add(t); });
  }
  const boardTargets = new Set<number>();
  if (mine && (BOARD_PICK.has(mine.prompt) || (mine.prompt === 'transport' && moving === null))) {
    for (const c of mine.cards ?? []) boardTargets.add(c);
  }
  const marked = new Set<number>();
  if (pending?.prompt === 'envoy') for (const c of pending.cards ?? []) marked.add(c);
  if (moving !== null) marked.add(moving);
  const handTargets = new Set<number>(mine?.prompt === 'reveal' ? mine.cards ?? [] : []);

  // ----- clicks
  const onTheater = (t: number) => {
    if (!me || !targetTheaters.has(t)) return;
    if (sel) {
      if (mine?.prompt === 'redeployPlay') answer({ kind: 'play', cardId: sel.cardId, theaterIdx: t, faceDown: sel.faceDown });
      else dispatch({ type: sel.faceDown ? 'improvise' : 'deploy', playerId: me.id, cardId: sel.cardId, theaterIdx: t });
    } else if (mine?.prompt === 'transport' && moving !== null) {
      answer({ kind: 'move', cardId: moving, theaterIdx: t });
    } else if (mine) {
      answer({ kind: 'theater', theaterIdx: t });
    }
  };
  const onBoardCard = (cardId: number) => {
    if (!mine || !boardTargets.has(cardId)) return;
    if (mine.prompt === 'transport') setMoving(cardId);
    else answer({ kind: 'card', cardId });
  };
  const onHandCard = (cardId: number) => {
    if (handTargets.has(cardId)) return answer({ kind: 'card', cardId });
    const o = playable(cardId);
    if (!o) return;
    if (sel?.cardId === cardId) return setSel(null);
    setSel({ cardId, faceDown: o.faceUp.length === 0 });
  };

  return (
    <div className="als-layout">
      <div className="als">
        <Header state={state} viewer={viewer} name={name} />
        {mine && mine.prompt !== 'redeployPlay'
          ? <Decision key={decisionKey(mine)} state={state} p={mine} name={name} moving={moving} onAnswer={answer} onCancelMove={() => setMoving(null)} />
          : pending && <Waiting key={decisionKey(pending)} p={pending} name={name} viewer={viewer} />}
        <div className={`als-board ${isEpic(state) ? 'epic' : ''}`} style={{ ['--als-theater-count' as string]: state.theaters.length }}>
          {state.theaters.map((_, t) => (
            <TheaterColumn
              key={`${state.battleNumber}-${t}`}
              state={state}
              theaterIdx={t}
              viewer={viewer}
              onCardClick={onBoardCard}
              onTheaterClick={onTheater}
              highlighted={targetTheaters.has(t)}
              highlightCards={boardTargets}
              markedCards={marked}
              fx={fx[t]}
            />
          ))}
        </div>
        {me ? (
          <Hand
            state={state}
            viewer={viewer as 0 | 1}
            sel={sel}
            setSel={setSel}
            playable={playable}
            handTargets={handTargets}
            onHandCard={onHandCard}
            myTurn={myTurn}
            redeploying={mine?.prompt === 'redeployPlay'}
            confirmWithdraw={confirmWithdraw}
            setConfirmWithdraw={setConfirmWithdraw}
            dispatch={dispatch}
            drawnCardId={mine?.drawnCardId}
            fresh={freshHand}
          />
        ) : (
          <p className="help">Spectating — every card is shown.</p>
        )}
        {me && !myTurn && !mine && state.subPhase === 'action' && (
          <p className="help center als-waiting-line"><span className="als-radio" aria-hidden="true" />Waiting for {name(state.turnSeatIdx)}…</p>
        )}
      </div>
      <Sidebar state={state} viewer={viewer} />
    </div>
  );
}

// ----- header

function Header({ state, viewer, name }: { state: AlsState; viewer: 0 | 1 | -1; name: (s: 0 | 1) => string }) {
  const left: 0 | 1 = viewer === -1 ? 0 : viewer;
  const right = otherSeat(left);
  const seatColor = (s: 0 | 1) => state.seats.find((x) => x.id === state.players[s].id)?.color;
  return (
    <div className="als-header">
      <CommanderPanel state={state} seat={left} name={name(left)} color={seatColor(left)} />
      <div className="als-header-middle">
        <div className="als-header-battle" key={state.battleNumber}>Battle {state.battleNumber}</div>
        <div className="als-header-sub">
          First to {state.config.targetVp} VP{state.config.beginner ? ' (Beginner)' : ''}{isEpic(state) ? ' · Epic Mode' : ''} · deck {state.deck.length}
        </div>
        <div className="als-header-sub als-header-turn">{possessive(name(state.turnSeatIdx))} turn</div>
      </div>
      <CommanderPanel state={state} seat={right} name={name(right)} color={seatColor(right)} alignRight />
    </div>
  );
}

function CommanderPanel({ state, seat, name, color, alignRight }: { state: AlsState; seat: 0 | 1; name: string; color?: string; alignRight?: boolean }) {
  const p = state.players[seat];
  const pct = Math.max(0, Math.min(100, (p.vp / Math.max(1, state.config.targetVp)) * 100));
  const first = state.firstPlayerSeatIdx === seat;
  const tags: string[] = [];
  if (p.airDrop) tags.push('Air Drop ready');
  if (p.neutralized.length) tags.push(`Neutralized: ${p.neutralized.map((c) => cardById(c).name).join(', ')}`);
  return (
    <div className={`als-header-side ${alignRight ? 'right' : ''} ${state.activePlayerId === p.id ? 'active' : ''}`}>
      <div className="als-commander">
        <span className="als-seat-dot" style={{ background: color ?? '#888' }} />
        <strong>{name}</strong>
        <span key={state.battleNumber} className={`als-first-tag ${first ? '' : 'second'}`} title={first ? '1st Player — wins tied theaters' : '2nd Player'}>{first ? '1st' : '2nd'}</span>
      </div>
      <div className="als-vp" title={`${p.vp} of ${state.config.targetVp} VP`}>
        <MedalIcon size={18} />
        <span className="als-vp-num">{p.vp}</span>
        <span className="als-vp-unit">VP</span>
        <span className="als-vp-bar"><span style={{ width: `${pct}%` }} /></span>
      </div>
      {tags.map((t) => <span key={t} className="als-tag">{t}</span>)}
    </div>
  );
}

// ----- decisions

function theaterName(state: AlsState, t: number | undefined): string {
  return t === undefined ? '' : THEATER_DEFS[state.theaters[t]].name;
}

/** What the chooser is asked, in their words. */
function promptText(state: AlsState, p: AlsPending, moving: number | null): string {
  const src = locate(state, p.sourceCardId);
  const here = theaterName(state, src?.theaterIdx);
  switch (p.prompt) {
    case 'flip':
      if (p.ability === 'maneuver' || p.ability === 'manipulate') return `Flip an uncovered card in a theater next to ${here}.`;
      if (p.ability === 'ambush') return 'Flip any uncovered card.';
      if (p.ability === 'disrupt') return 'Disrupt — flip one of your own uncovered cards.';
      if (p.ability === 'leverage') return 'Flip one of the highlighted cards (no stronger than the card you revealed).';
      if (p.ability === 'surveil') return 'Flip an uncovered face-up card.';
      return 'Flip one of the highlighted cards.';
    case 'transport':
      return moving === null
        ? 'You may move one of your cards to a different theater — pick the card.'
        : `Move ${cardById(moving).name} to which theater?`;
    case 'redeployPick':
      return 'You may return one of your face-down cards to your hand. If you do, you play a card.';
    case 'redeployPlay':
      return 'Play a card.';
    case 'reinforce':
      return `Play ${cardById(p.drawnCardId!).name} face down to a theater next to ${here}.`;
    case 'destroyOwn':
      return 'You may destroy one of your other cards — then destroy any uncovered card.';
    case 'destroy':
      return 'Destroy any uncovered card.';
    case 'reveal':
      if (p.ability === 'leverage') return 'You may reveal a card from your hand, then flip an uncovered card no stronger than it.';
      if (p.ability === 'requisition') return "You may reveal a card from your hand: 2 supplies in that card's theater.";
      if (p.ability === 'surveil' && p.revealedCardId !== undefined) {
        return `Your enemy revealed ${cardById(p.revealedCardId).name} (${cardById(p.revealedCardId).strength}). You may reveal a lower card to flip an uncovered face-up card.`;
      }
      return 'Surveil — you must reveal a card from your hand.';
    case 'giveOrKeep':
      return `You drew ${cardById(p.drawnCardId!).name}. Give it to your enemy and draw another, or keep it and your enemy draws 1.`;
    case 'incite':
      return "Use the instant ability of one of the highlighted cards as if it were on Incite.";
    case 'name':
      return "Name a card. If it's in your enemy's hand, they must reveal it and play it face down next time they play.";
    case 'retrofit':
      return "Choose one of your uncovered cards: gain supplies equal to its strength in its theater, then flip it.";
    case 'supply':
      return p.ability === 'armsRace' && p.seat !== locate(state, p.sourceCardId)?.side
        ? 'Arms Race — gain 2 supplies in a different theater from your enemy’s.'
        : 'Gain 2 supplies in a theater.';
    case 'envoy':
      return `Move Envoy onto ${cardById(p.cards![0]).name}?`;
  }
}

/** One key per decision, so a new prompt's panel plays its entrance. */
function decisionKey(p: AlsPending): string {
  return `${p.prompt}-${p.ability}-${p.sourceCardId}-${p.seat}-${p.revealedCardId ?? ''}-${p.drawnCardId ?? ''}`;
}

const SKIP_LABEL: Partial<Record<AlsPending['prompt'], string>> = {
  transport: "Don't move",
  redeployPick: "Don't return",
  destroyOwn: "Don't destroy",
  reveal: "Don't reveal",
};

function Decision({ state, p, name, moving, onAnswer, onCancelMove }: {
  state: AlsState; p: AlsPending; name: (s: 0 | 1) => string; moving: number | null;
  onAnswer: (a: AlsAnswer) => void; onCancelMove: () => void;
}) {
  const source = cardById(p.sourceCardId);
  const showCard = p.drawnCardId !== undefined ? cardById(p.drawnCardId) : null;
  return (
    <div className="als-decision" data-prompt={p.prompt}>
      <div className="als-decision-head">
        <span className="als-decision-stamp" aria-hidden="true">Orders</span>
        <span className="als-decision-ability">{abilityName(p.ability)}</span>
        {source.ability !== p.ability && <span className="als-decision-via">via {source.name}</span>}
        <span className="als-decision-who">{name(p.seat)}, your call</span>
      </div>
      <div className="als-decision-body">
        {showCard && <AlsCardView card={showCard} />}
        <div className="als-decision-text">
          <p>{promptText(state, p, moving)}</p>
          {p.prompt === 'name' && <NamePicker state={state} p={p} onName={(cardId) => onAnswer({ kind: 'name', cardId })} />}
          <div className="als-actions">
            {p.prompt === 'giveOrKeep' && (
              <>
                <button className="primary" onClick={() => onAnswer({ kind: 'option', option: 'give' })}>Give it, draw another</button>
                <button onClick={() => onAnswer({ kind: 'option', option: 'keep' })}>Keep it</button>
              </>
            )}
            {p.prompt === 'envoy' && (
              <>
                <button className="primary" onClick={() => onAnswer({ kind: 'option', option: 'move' })}>Move Envoy</button>
                <button onClick={() => onAnswer({ kind: 'option', option: 'stay' })}>Leave it</button>
              </>
            )}
            {p.prompt === 'transport' && moving !== null && <button onClick={onCancelMove}>Pick another card</button>}
            {p.optional && <button className="secondary" onClick={() => onAnswer({ kind: 'skip' })}>{SKIP_LABEL[p.prompt] ?? 'Skip'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Neutralize: every card of this battle, by theater. Cards you can see
 *  elsewhere (your hand, face up on the board) are dimmed — they can't be in
 *  your enemy's hand. */
function NamePicker({ state, p, onName }: { state: AlsState; p: AlsPending; onName: (cardId: number) => void }) {
  const seen = new Set<number>(state.players[p.seat].hand);
  for (const stacks of state.board) {
    for (const side of [0, 1] as const) for (const c of stacks[side]) if (!c.faceDown || side === p.seat) seen.add(c.cardId);
  }
  for (const c of state.players[otherSeat(p.seat)].known) seen.delete(c);
  const ids = new Set(cardIdsForTheaters(state.theaters));
  return (
    <div className="als-name-picker">
      {state.theaters.map((t) => (
        <div key={t} className="als-name-row">
          <TheaterEmblem theater={t} size={18} />
          {CARD_TEMPLATES.filter((c) => c.theater === t && ids.has(c.id)).map((c) => (
            <button
              key={c.id}
              type="button"
              className={`als-name-btn ${seen.has(c.id) ? 'seen' : ''}`}
              title={`${cardLabel(c.id)} — ${c.name}${seen.has(c.id) ? ' (you can see it is not in their hand)' : ''}`}
              onClick={() => onName(c.id)}
            >
              <span className="num">{c.strength}</span> {c.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Waiting({ p, name, viewer }: { p: AlsPending; name: (s: 0 | 1) => string; viewer: 0 | 1 | -1 }) {
  let what = `deciding (${abilityName(p.ability)})`;
  if (p.prompt === 'reveal' && p.ability === 'surveil' && p.revealedCardId === undefined) what = 'choosing a card to reveal for Surveil';
  else if (p.prompt === 'flip') what = `choosing a card to flip (${abilityName(p.ability)})`;
  else if (p.prompt === 'supply') what = `choosing where to put supplies (${abilityName(p.ability)})`;
  else if (p.prompt === 'name') what = 'naming a card (Neutralize)';
  else if (p.prompt === 'envoy') what = 'deciding whether to move Envoy';
  return (
    <div className="als-decision waiting">
      <span className="als-radio" aria-hidden="true" />
      <span className="als-decision-ability">{abilityName(p.ability)}</span>
      <span>{viewer === -1 ? '' : 'Waiting — '}{name(p.seat)} is {what}…</span>
    </div>
  );
}

// ----- hand

function Hand({
  state, viewer, sel, setSel, playable, handTargets, onHandCard, myTurn, redeploying, confirmWithdraw, setConfirmWithdraw, dispatch, drawnCardId, fresh,
}: {
  state: AlsState;
  viewer: 0 | 1;
  sel: Selection | null;
  setSel: (s: Selection | null) => void;
  playable: (cardId: number) => { faceUp: number[]; faceDown: number[] } | null;
  handTargets: Set<number>;
  onHandCard: (cardId: number) => void;
  myTurn: boolean;
  redeploying: boolean;
  confirmWithdraw: boolean;
  setConfirmWithdraw: (b: boolean) => void;
  dispatch: (a: AlsAction) => void;
  drawnCardId?: number;
  /** Cards new to the hand, with their place in the batch (deal-in stagger). */
  fresh: Map<number, number>;
}) {
  const me = state.players[viewer];
  const opp = state.players[otherSeat(viewer)];
  const selOptions = sel ? playable(sel.cardId) : null;
  const wvp = vpForWithdraw(state, viewer);
  const hint = (() => {
    if (redeploying) return sel ? (sel.faceDown ? 'Click any highlighted theater to play it face down.' : 'Click a highlighted theater to deploy it.') : 'Redeploy — play a card: pick one from your hand.';
    if (!myTurn) return null;
    if (me.neutralized.length) return `Neutralized: you must play ${me.neutralized.map((c) => cardById(c).name).join(' or ')} face down (or withdraw).`;
    if (sel) return sel.faceDown ? 'Click any theater to play it face down (strength 2, no ability).' : 'Click a highlighted theater to deploy it face up.';
    return 'Pick a card, then a theater — or withdraw.';
  })();

  return (
    <div className={`als-hand-area ${myTurn || redeploying || handTargets.size > 0 ? 'live' : ''}`}>
      <div className="als-opp-hand">
        <div className="als-opp-hand-row">
          {opp.hand.map((c, i) => (opp.known.includes(c)
            ? <MiniFace key={c} card={cardById(c)} label="Revealed" />
            : <FaceDownCard key={`b${i}`} size="mini" />))}
        </div>
        <span className="als-opp-hand-label">
          {opp.hand.length} card{opp.hand.length === 1 ? '' : 's'} in hand
          {opp.known.length > 0 && ` · ${opp.known.length} revealed`}
        </span>
      </div>

      {hint && <div className="als-hint" key={hint}>{hint}</div>}

      <div className="als-hand">
        {me.hand.length === 0 && <p className="help">No cards in hand.</p>}
        {me.hand.map((cardId) => {
          const can = playable(cardId) !== null || handTargets.has(cardId);
          const anyChoice = myTurn || redeploying || handTargets.size > 0;
          const badge = cardId === drawnCardId ? 'Drawn'
            : me.neutralized.includes(cardId) ? 'Face down next'
              : me.known.includes(cardId) ? 'Revealed' : null;
          const dealt = fresh.get(cardId);
          return (
            <AlsCardView
              key={cardId}
              className={dealt !== undefined ? 'als-fx-deal' : ''}
              style={dealt !== undefined ? ({ '--i': dealt } as CSSProperties) : undefined}
              card={cardById(cardId)}
              selectable={can}
              selected={sel?.cardId === cardId || handTargets.has(cardId)}
              muted={anyChoice && !can}
              onClick={() => onHandCard(cardId)}
              badge={badge}
            />
          );
        })}
      </div>

      <div className="als-actions">
        {(myTurn || redeploying) && (
          <>
            <button
              className={sel && !sel.faceDown ? 'primary' : ''}
              disabled={!sel || !selOptions || selOptions.faceUp.length === 0}
              onClick={() => sel && setSel({ ...sel, faceDown: false })}
            >
              Deploy<span className="als-btn-detail"> (face up)</span>
            </button>
            <button
              className={sel && sel.faceDown ? 'primary' : ''}
              disabled={!sel || !selOptions || selOptions.faceDown.length === 0}
              onClick={() => sel && setSel({ ...sel, faceDown: true })}
            >
              Improvise<span className="als-btn-detail"> (face down)</span>
            </button>
          </>
        )}
        {myTurn && !confirmWithdraw && (
          <button className="danger" onClick={() => setConfirmWithdraw(true)}>
            Withdraw<span className="als-btn-detail"> — opponent +{wvp} VP</span>
          </button>
        )}
        {myTurn && confirmWithdraw && (
          <div className="als-withdraw-confirm">
            <span className="als-withdraw-ask"><WhiteFlag size={22} /> Sound the retreat? Your enemy scores {wvp} VP.</span>
            <button className="danger" onClick={() => dispatch({ type: 'withdraw', playerId: me.id })}>
              Confirm withdraw (+{wvp} VP to opponent)
            </button>
            <button className="secondary" onClick={() => setConfirmWithdraw(false)}>Keep fighting</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- battle end / game over

function ResultTable({ state, name }: { state: AlsState; name: (s: 0 | 1) => string }) {
  const r = state.lastBattleResult;
  if (!r) return null;
  const color = (s: 0 | 1) => state.seats.find((x) => x.id === state.players[s].id)?.color ?? '#888';
  return (
    <table className="als-result-table">
      <thead>
        <tr>
          <th>Theater</th>
          {([0, 1] as const).map((s) => <th key={s} className="num"><span className="als-seat-dot" style={{ background: color(s) }} /> {name(s)}</th>)}
          <th>Held by</th>
        </tr>
      </thead>
      <tbody>
        {r.theaters.map((tid, t) => {
          const holder = r.theaterControl[t];
          return (
            <tr key={tid} style={{ '--i': t } as CSSProperties}>
              <td><span className="als-result-theater"><TheaterEmblem theater={tid} size={20} /> {THEATER_DEFS[tid].name}</span></td>
              <td className={`num ${holder === 0 ? 'won' : ''}`}>{r.theaterStrengths[t][0]}</td>
              <td className={`num ${holder === 1 ? 'won' : ''}`}>{r.theaterStrengths[t][1]}</td>
              <td><span className="als-result-holder"><ControlFlag size={14} /> {name(holder)}</span></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The VP a battle paid, as a row of medals popping in one by one. */
function MedalRow({ n }: { n: number }) {
  return (
    <div className="als-medal-row" aria-hidden="true">
      {Array.from({ length: Math.min(n, 12) }, (_, i) => (
        <span key={i} style={{ '--i': i } as CSSProperties}><MedalIcon size={26} /></span>
      ))}
    </div>
  );
}

/** Between battles: the 1st / 2nd Supreme Commander chips trade places and the
 *  rightmost theater swings round to the left end. */
function NextBattle({ state, viewer, name }: { state: AlsState; viewer: 0 | 1 | -1; name: (s: 0 | 1) => string }) {
  const r = state.lastBattleResult!;
  const left: 0 | 1 = viewer === -1 ? 0 : viewer;
  const right = otherSeat(left);
  const firstOnLeft = r.firstPlayerSeatIdx === left;
  const n = r.theaters.length;
  return (
    <div className="als-next" aria-hidden="true">
      <div className="als-next-swap">
        <span className="als-next-name">{name(left)}</span>
        <span className="als-next-track">
          <span className={`als-first-tag ${firstOnLeft ? 'from-left' : 'from-right'}`}>1st</span>
          <span className={`als-first-tag second ${firstOnLeft ? 'from-right' : 'from-left'}`}>2nd</span>
        </span>
        <span className="als-next-name">{name(right)}</span>
      </div>
      <div className="als-next-row" style={{ '--n': n } as CSSProperties}>
        {r.theaters.map((t, i) => (
          <span key={t} className={i === n - 1 ? 'last' : ''}><TheaterEmblem theater={t} size={24} /></span>
        ))}
      </div>
    </div>
  );
}

function BattleEnd({ state, viewer, name, dispatch }: { state: AlsState; viewer: 0 | 1 | -1; name: (s: 0 | 1) => string; dispatch: (a: AlsAction) => void }) {
  const r = state.lastBattleResult;
  if (!r) return null;
  const canContinue = viewer !== -1 && state.activePlayerId === state.players[viewer].id;
  const withdrew = r.endedBy === 'withdraw';
  const how: ReactNode = withdrew
    ? <>{name(r.withdrawerSeatIdx!)} withdrew with {r.cardsLeft} card{r.cardsLeft === 1 ? '' : 's'} left</>
    : <>Fought to the last card</>;
  return (
    <div className="als-battle-end">
      <div className="als-gameover-banners">
        {r.theaters.map((tid) => <div key={tid}><TheaterBanner theater={tid} /></div>)}
      </div>
      <div className="als-panel-eyebrow">Battle {r.battleNumber} complete</div>
      <div className={`als-stamp ${withdrew ? 'retreat' : ''}`} aria-hidden="true">{withdrew ? 'Withdrawal' : 'Battle won'}</div>
      <h2>{name(r.winnerSeatIdx)} {wins(name(r.winnerSeatIdx))} the battle</h2>
      <MedalRow n={r.vpAwarded} />
      <p className="als-panel-sub">{how} · +{r.vpAwarded} VP to {name(r.winnerSeatIdx)}</p>
      <ResultTable state={state} name={name} />
      <div className="als-result-score">
        {([0, 1] as const).map((s) => (
          <span key={s} className={`als-result-vp ${s === r.winnerSeatIdx ? 'gained' : ''}`}>{name(s)} <MedalIcon size={16} /> <strong>{state.players[s].vp}</strong></span>
        ))}
        <span className="als-panel-sub">first to {state.config.targetVp}</span>
      </div>
      <NextBattle state={state} viewer={viewer} name={name} />
      <p className="als-panel-sub">Next: the rightmost theater moves to the left end and the Supreme Commanders swap.</p>
      {canContinue
        ? <button className="primary als-next-btn" onClick={() => dispatch({ type: 'continueBattle' })}>Next battle →</button>
        : <p className="help">Waiting for {name(state.firstPlayerSeatIdx)} to start the next battle…</p>}
    </div>
  );
}

const CONFETTI = ['#c8452f', '#2b4c8c', '#f2c230', '#fbf6ea', '#5f8f3e'];

function GameOver({ state, name }: { state: AlsState; name: (s: 0 | 1) => string }) {
  const winner: 0 | 1 = state.players[0].vp >= state.config.targetVp ? 0 : 1;
  return (
    <div className="als-gameover">
      <div className="als-gameover-banners">
        {state.theaters.map((tid) => <div key={tid}><TheaterBanner theater={tid} /></div>)}
      </div>
      <div className="als-confetti" aria-hidden="true">
        {Array.from({ length: 22 }, (_, i) => (
          <span
            key={i}
            style={{
              '--x': `${(i * 41 + 7) % 100}%`,
              '--d': `${((i * 0.17) % 1.3).toFixed(2)}s`,
              '--r': `${(i * 67) % 360}deg`,
              '--c': CONFETTI[i % CONFETTI.length],
            } as CSSProperties}
          />
        ))}
      </div>
      <div className="als-gameover-medal"><MedalIcon size={72} /></div>
      <div className="als-stamp big" aria-hidden="true">Victory</div>
      <h1>{name(winner)} {wins(name(winner))} the war!</h1>
      <p className="als-panel-sub">
        Final VP — {name(0)} <strong>{state.players[0].vp}</strong> · {name(1)} <strong>{state.players[1].vp}</strong>
      </p>
      {state.lastBattleResult && <ResultTable state={state} name={name} />}
    </div>
  );
}

export const bundle: GameUiBundle<AlsState, AlsAction, AlsConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
