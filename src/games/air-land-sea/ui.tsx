// Air, Land & Sea — lobby config and in-game view.

import { useEffect, useMemo, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  AlsState, AlsAction, AlsConfig, AlsTheaterId,
} from './types';
import { AlsCardView, FaceDownCard } from './Card';
import { TheaterColumn } from './Theater';
import { Sidebar } from './Sidebar';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import {
  BASE_THEATER_IDS, SLS_THEATER_IDS, THEATER_DEFS, DEFAULT_TARGET_VP, ALL_THEATER_IDS, CARD_TEMPLATES,
} from './cards';
import { ownerHasOngoing, vpForWithdraw, adjacentTheaters } from './scoring';
import './als.css';

// ============================================================================
// Lobby config
// ============================================================================

function LobbyConfig({ config, seats, onChange }: { config: AlsConfig; seats: Seat[]; onChange: (c: AlsConfig) => void }) {
  void seats;
  const slsOn = !!config.expansions?.spiesLiesSupplies;
  const epic = config.theaters.length === 5;

  const setExp = (sls: boolean) => {
    const next: AlsConfig = {
      ...config,
      expansions: { ...config.expansions, spiesLiesSupplies: sls },
    };
    if (!sls) {
      // Strip SLS theaters and force back to base 3.
      next.theaters = BASE_THEATER_IDS.slice();
    }
    onChange(next);
  };

  const toggleTheater = (id: AlsTheaterId) => {
    const inList = config.theaters.includes(id);
    const next = inList
      ? config.theaters.filter((t) => t !== id)
      : [...config.theaters, id];
    onChange({ ...config, theaters: next });
  };

  const setEpic = (on: boolean) => {
    if (on) {
      if (!slsOn) {
        // Turn SLS on and seed with all 5 of base + intel + diplo.
        onChange({
          ...config,
          expansions: { ...config.expansions, spiesLiesSupplies: true },
          theaters: ['intel', 'diplo', 'econ', 'land', 'sea'],
        });
      } else {
        onChange({ ...config, theaters: ['intel', 'diplo', 'econ', 'land', 'sea'] });
      }
    } else {
      onChange({ ...config, theaters: config.theaters.slice(0, 3) });
    }
  };

  const availableTheaters: AlsTheaterId[] = slsOn ? ALL_THEATER_IDS.slice() : BASE_THEATER_IDS.slice();

  return (
    <div className="game-config">
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Target VP:</span>
        <input
          type="number"
          min={6}
          max={30}
          value={config.targetVp}
          onChange={(e) => onChange({ ...config, targetVp: Number(e.target.value) || DEFAULT_TARGET_VP })}
          style={{ width: 80 }}
        />
      </label>

      <h4 style={{ margin: '14px 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-muted)' }}>
        Expansion
      </h4>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
        <input
          type="checkbox"
          checked={slsOn}
          onChange={(e) => setExp(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong>Spies, Lies, &amp; Supplies</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-muted)' }}>
            Adds 3 theaters (Intelligence, Diplomacy, Economics) and 18 cards. Per-card abilities not yet modeled — cards play with raw strength only.
          </span>
        </span>
      </label>

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', opacity: slsOn ? 1 : 0.5 }}>
        <input
          type="checkbox"
          checked={epic}
          onChange={(e) => setEpic(e.target.checked)}
          disabled={!slsOn}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong>Epic Mode</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-muted)' }}>
            5 theaters at once (instead of 3); each player draws 9 cards per battle instead of 6. Requires the expansion.
          </span>
        </span>
      </label>

      <h4 style={{ margin: '14px 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-muted)' }}>
        Theaters in play ({config.theaters.length}/{epic ? 5 : 3})
      </h4>
      <p className="als-cheat-note" style={{ marginTop: 0 }}>
        Pick {epic ? 5 : 3} theaters. Order is L→R on the board for battle 1; the rightmost shifts to the left front after each battle.
      </p>
      <div className="als-theater-picker">
        {availableTheaters.map((t) => {
          const def = THEATER_DEFS[t];
          const selected = config.theaters.includes(t);
          return (
            <button
              key={t}
              type="button"
              className={`als-theater-pill ${selected ? 'selected' : ''}`}
              onClick={() => toggleTheater(t)}
            >
              {def.name}
              {def.expansion ? <small> (SLS)</small> : null}
            </button>
          );
        })}
      </div>

    </div>
  );
}

function Rules() {
  // Group cards by theater for the per-theater reference pages.
  const byTheater: Record<string, typeof CARD_TEMPLATES[number][]> = {};
  for (const c of CARD_TEMPLATES) {
    if (!byTheater[c.theater]) byTheater[c.theater] = [];
    byTheater[c.theater].push(c);
  }
  for (const k of Object.keys(byTheater)) byTheater[k].sort((a, b) => a.strength - b.strength);
  const cardRows = (tid: AlsTheaterId) => (byTheater[tid] ?? []).map((c) => (
    <tr key={c.id}>
      <td className="num">{c.strength}</td>
      <td>{c.name}</td>
      <td className="muted">{c.abilityText}</td>
    </tr>
  ));

  return (
    <RulesBook
      pages={[
        {
          title: 'Overview',
          body: (
            <>
              <RulesHero
                title="Air, Land & Sea"
                subtitle="2-player tactical battles. First to 12 VP across multiple battles."
                accent="linear-gradient(135deg, #234d5e 0%, #2ecc71 100%)"
              />
              <h3>Turn options (alternating single actions)</h3>
              <RulesGrid cols={3}>
                <RulesTile icon="⚡" label="Deploy" hint="Face-up to matching theater. Triggers the card's ability." accent="#9ed27c" />
                <RulesTile icon="🃏" label="Improvise" hint="Face-down to ANY theater for strength 2. No ability." accent="#6aa0ff" />
                <RulesTile icon="🏳️" label="Withdraw" hint="Battle ends. Opponent scores VP." accent="#ff7070" />
              </RulesGrid>
              <h3>Withdraw VP</h3>
              <table className="tight">
                <thead><tr><th>Cards left in hand</th><th className="num">VP to opponent</th></tr></thead>
                <tbody>
                  <tr><td>6+ cards</td><td className="num">2</td></tr>
                  <tr><td>4–5 cards</td><td className="num">3</td></tr>
                  <tr><td>2–3 cards</td><td className="num">4</td></tr>
                  <tr><td>0–1 cards (full-play loss)</td><td className="num">6</td></tr>
                </tbody>
              </table>
            </>
          ),
        },
        {
          title: 'Battles',
          body: (
            <>
              <p>
                A battle ends when either player withdraws or both hands are empty.
              </p>
              <RulesGrid cols={2}>
                <RulesTile icon="📊" label="Control" hint="Higher total strength on your side wins that theater." accent="#f4d268" />
                <RulesTile icon="🏆" label="Win condition" hint="Control more than half the theaters (2/3 or 3/5)." accent="#9ed27c" />
                <RulesTile icon="🥇" label="Ties" hint="Go to the player whose card landed in the theater first." accent="#6aa0ff" />
                <RulesTile icon="🔁" label="Between battles" hint="Theater row rotates 1 step right→front; 1st-player swaps." accent="#b984c9" />
              </RulesGrid>
              <h3>Hidden info</h3>
              <p>
                Face-down cards are hidden from the opponent (and from the inactive
                seat in hot-seat play). Ongoing abilities still emit while covered
                — being flipped face-down is the only way to silence them.
              </p>
            </>
          ),
        },
        {
          title: 'Air cards',
          body: (
            <table className="tight">
              <thead><tr><th className="num">Str</th><th>Name</th><th>Ability</th></tr></thead>
              <tbody>{cardRows('air')}</tbody>
            </table>
          ),
        },
        {
          title: 'Land cards',
          body: (
            <table className="tight">
              <thead><tr><th className="num">Str</th><th>Name</th><th>Ability</th></tr></thead>
              <tbody>{cardRows('land')}</tbody>
            </table>
          ),
        },
        {
          title: 'Sea cards',
          body: (
            <table className="tight">
              <thead><tr><th className="num">Str</th><th>Name</th><th>Ability</th></tr></thead>
              <tbody>{cardRows('sea')}</tbody>
            </table>
          ),
        },
        {
          title: 'SLS expansion',
          body: (
            <>
              <p>
                Adds 3 theaters (Intelligence / Diplomacy / Economics) and 18
                cards. Epic Mode plays with all 5 theaters and 9-card hands.
              </p>
              <p className="muted">
                Per-card SLS abilities are placeholder no-ops in v1; cards still
                contribute their raw strength normally.
              </p>
              <h3>Intel cards</h3>
              <table className="tight">
                <thead><tr><th className="num">Str</th><th>Name</th><th>Ability</th></tr></thead>
                <tbody>{cardRows('intel')}</tbody>
              </table>
              <h3>Diplomacy cards</h3>
              <table className="tight">
                <thead><tr><th className="num">Str</th><th>Name</th><th>Ability</th></tr></thead>
                <tbody>{cardRows('diplo')}</tbody>
              </table>
              <h3>Economics cards</h3>
              <table className="tight">
                <thead><tr><th className="num">Str</th><th>Name</th><th>Ability</th></tr></thead>
                <tbody>{cardRows('econ')}</tbody>
              </table>
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

function GameView({
  state,
  localPlayerId,
  dispatch,
}: {
  state: AlsState;
  localPlayerId: PlayerId | null;
  dispatch: (a: AlsAction) => void;
}) {
  // Selected card in hand (waiting for the user to click a theater).
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<'deploy' | 'improvise' | null>(null);

  // Reset selection on turn change or sub-phase change.
  useEffect(() => {
    setSelectedCardId(null);
    setPendingAction(null);
  }, [state.activePlayerId, state.subPhase, state.battleNumber]);

  const localSeatIdx = useMemo<0 | 1 | -1>(() => {
    if (state.players[0].id === localPlayerId) return 0;
    if (state.players[1].id === localPlayerId) return 1;
    return -1;
  }, [state.players, localPlayerId]);
  const isLocalActive = localSeatIdx !== -1 && state.activePlayerId === localPlayerId;
  const me = localSeatIdx === -1 ? null : state.players[localSeatIdx];
  const opp = localSeatIdx === -1 ? null : state.players[localSeatIdx === 0 ? 1 : 0];
  const mySeatName = state.seats.find((s) => s.id === localPlayerId)?.name ?? 'You';

  if (state.phase === 'gameOver') {
    return (
      <div className="als-layout">
        <div className="als">
          <GameOver state={state} />
        </div>
        <Sidebar state={state} mySeatName={mySeatName} />
      </div>
    );
  }

  if (state.subPhase === 'battleEnd') {
    return (
      <div className="als-layout">
        <div className="als">
          <BattleEndPanel state={state} localSeatIdx={localSeatIdx} dispatch={dispatch} />
        </div>
        <Sidebar state={state} mySeatName={mySeatName} />
      </div>
    );
  }

  // Compute theater highlights based on selection / sub-phase.
  const highlightTheaters = new Set<number>();
  const highlightCards = new Set<string>();
  if (isLocalActive && pendingAction && selectedCardId !== null && me) {
    const card = state.deckPool[selectedCardId];
    if (card) {
      if (pendingAction === 'deploy') {
        const matchIdx = state.config.theaters.findIndex((t) => t === card.theater);
        if (matchIdx !== -1) highlightTheaters.add(matchIdx);
        if (card.strength <= 3 && ownerHasOngoing(state, localSeatIdx as 0 | 1, 'aerodrome')) {
          for (let i = 0; i < state.config.theaters.length; i++) highlightTheaters.add(i);
        }
        if (state.players[localSeatIdx as 0 | 1].airDropArmed) {
          for (let i = 0; i < state.config.theaters.length; i++) highlightTheaters.add(i);
        }
      } else {
        for (let i = 0; i < state.config.theaters.length; i++) highlightTheaters.add(i);
      }
    }
  }
  if (isLocalActive && state.subPhase === 'awaitingFlipTarget' && state.pendingAbility) {
    const pa = state.pendingAbility;
    const allowedSides: Array<0 | 1> = pa.kind === 'disrupt' ? [pa.chooserSeatIdx] : [0, 1];
    const allowedTheaters = pa.kind === 'maneuver'
      ? adjacentTheaters(state.config.theaters.length, pa.sourceTheaterIdx)
      : Array.from({ length: state.config.theaters.length }, (_, i) => i);
    for (const t of allowedTheaters) {
      for (const side of allowedSides) {
        const stack = state.playedCards[t][side];
        if (stack.length === 0) continue;
        const top = stack[stack.length - 1];
        highlightCards.add(`${t}:${side}:${top.cardId}`);
      }
    }
  }
  if (isLocalActive && state.subPhase === 'awaitingTransportTarget' && state.pendingAbility?.kind === 'transport') {
    const pa = state.pendingAbility;
    if (pa.pickedCardId === undefined) {
      // Step 1: highlight own top cards.
      for (let t = 0; t < state.playedCards.length; t++) {
        const stack = state.playedCards[t][pa.chooserSeatIdx];
        if (stack.length === 0) continue;
        const top = stack[stack.length - 1];
        highlightCards.add(`${t}:${pa.chooserSeatIdx}:${top.cardId}`);
      }
    } else {
      // Step 2: highlight all theaters except the source.
      for (let i = 0; i < state.config.theaters.length; i++) {
        if (i !== pa.pickedFromTheaterIdx) highlightTheaters.add(i);
      }
    }
  }
  if (isLocalActive && state.subPhase === 'awaitingRedeployTarget' && me) {
    for (let t = 0; t < state.playedCards.length; t++) {
      const stack = state.playedCards[t][localSeatIdx as 0 | 1];
      if (stack.length === 0) continue;
      const top = stack[stack.length - 1];
      if (top.faceDown) highlightCards.add(`${t}:${localSeatIdx}:${top.cardId}`);
    }
  }
  if (isLocalActive && state.subPhase === 'awaitingReinforcePlacement') {
    for (let i = 0; i < state.config.theaters.length; i++) highlightTheaters.add(i);
  }

  // Handler when a theater is clicked.
  const onTheaterClick = (theaterIdx: number) => {
    if (!isLocalActive || !me) return;
    if (state.subPhase === 'awaitingAction' && pendingAction && selectedCardId !== null) {
      const card = state.deckPool[selectedCardId];
      if (!card) return;
      // Validate legal target client-side; reducer also validates.
      if (pendingAction === 'deploy') {
        const ok = highlightTheaters.has(theaterIdx);
        if (!ok) return;
        dispatch({ type: 'deploy', playerId: me.id, cardId: selectedCardId, theaterIdx });
      } else {
        dispatch({ type: 'improvise', playerId: me.id, cardId: selectedCardId, theaterIdx });
      }
      setSelectedCardId(null);
      setPendingAction(null);
      return;
    }
    if (state.subPhase === 'awaitingTransportTarget' && state.pendingAbility?.kind === 'transport') {
      const pa = state.pendingAbility;
      if (pa.pickedCardId !== undefined && pa.pickedFromTheaterIdx !== theaterIdx) {
        dispatch({ type: 'chooseTransportDestination', playerId: me.id, theaterIdx });
      }
      return;
    }
    if (state.subPhase === 'awaitingReinforcePlacement') {
      dispatch({ type: 'reinforcePlace', playerId: me.id, theaterIdx });
      return;
    }
  };

  // Handler when a placed card is clicked.
  const onCardClick = (theaterIdx: number, sideIdx: 0 | 1, cardId: number) => {
    if (!isLocalActive || !me) return;
    const key = `${theaterIdx}:${sideIdx}:${cardId}`;
    if (!highlightCards.has(key)) return;
    if (state.subPhase === 'awaitingFlipTarget') {
      dispatch({ type: 'chooseFlipTarget', playerId: me.id, theaterIdx, sideIdx });
    } else if (state.subPhase === 'awaitingTransportTarget') {
      dispatch({ type: 'chooseTransportCard', playerId: me.id, theaterIdx, cardId });
    } else if (state.subPhase === 'awaitingRedeployTarget') {
      dispatch({ type: 'chooseRedeployTarget', playerId: me.id, theaterIdx, cardId });
    }
  };

  return (
    <div className="als-layout">
      <div className="als">
        <Header state={state} me={me} opp={opp} mySeatName={mySeatName} />

        {state.subPhase === 'awaitingReinforcePlacement' && state.pendingAbility?.kind === 'reinforce' && me && (
          <ReinforcePreview state={state} dispatch={dispatch} myId={me.id} />
        )}

        <div className="als-board" style={{ ['--als-theater-count' as string]: state.config.theaters.length }}>
          {state.config.theaters.map((_, t) => (
            <TheaterColumn
              key={t}
              state={state}
              theaterIdx={t}
              localSeatIdx={localSeatIdx}
              onCardClick={onCardClick}
              onTheaterClick={onTheaterClick}
              highlightTheaters={highlightTheaters}
              highlightCards={highlightCards}
            />
          ))}
        </div>

        {me ? (
          <HandArea
            state={state}
            me={me}
            isLocalActive={isLocalActive}
            localSeatIdx={localSeatIdx as 0 | 1}
            selectedCardId={selectedCardId}
            setSelectedCardId={setSelectedCardId}
            pendingAction={pendingAction}
            setPendingAction={setPendingAction}
            dispatch={dispatch}
          />
        ) : (
          <p className="help">Spectator view.</p>
        )}

        {!isLocalActive && me && (
          <p className="help center" style={{ marginTop: 12 }}>
            Waiting for {(state.seats.find((s) => s.id === state.activePlayerId)?.name ?? 'opponent')}…
          </p>
        )}
      </div>

      <Sidebar state={state} mySeatName={mySeatName} />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Header({ state, me, opp, mySeatName }: { state: AlsState; me: AlsState['players'][0] | null; opp: AlsState['players'][0] | null; mySeatName: string }) {
  const firstName = state.seats.find((s) => s.id === state.players[state.firstPlayerSeatIdx].id)?.name ?? '?';
  const activeName = state.seats.find((s) => s.id === state.activePlayerId)?.name ?? '?';
  return (
    <div className="als-header">
      <div className="als-header-side">
        <strong>{mySeatName}</strong>
        <span>VP: {me?.vp ?? 0}</span>
        {me?.airDropArmed ? <span className="als-tag">Air Drop armed</span> : null}
      </div>
      <div className="als-header-middle">
        <div>Battle {state.battleNumber} · Target {state.config.targetVp} VP</div>
        <div className="als-header-sub">
          {firstName} is 1st player &nbsp;·&nbsp; {activeName}'s turn
        </div>
      </div>
      <div className="als-header-side right">
        <strong>{state.seats.find((s) => s.id === opp?.id)?.name ?? 'Opponent'}</strong>
        <span>VP: {opp?.vp ?? 0}</span>
      </div>
    </div>
  );
}

function HandArea({
  state, me, isLocalActive, localSeatIdx, selectedCardId, setSelectedCardId,
  pendingAction, setPendingAction, dispatch,
}: {
  state: AlsState;
  me: AlsState['players'][0];
  isLocalActive: boolean;
  localSeatIdx: 0 | 1;
  selectedCardId: number | null;
  setSelectedCardId: (v: number | null) => void;
  pendingAction: 'deploy' | 'improvise' | null;
  setPendingAction: (v: 'deploy' | 'improvise' | null) => void;
  dispatch: (a: AlsAction) => void;
}) {
  const opp = state.players[localSeatIdx === 0 ? 1 : 0];
  const canAct = isLocalActive && state.subPhase === 'awaitingAction';
  const hint = (() => {
    if (!isLocalActive) return null;
    switch (state.subPhase) {
      case 'awaitingAction':
        if (selectedCardId !== null && pendingAction) {
          return pendingAction === 'deploy'
            ? 'Click a highlighted theater to deploy face-up.'
            : 'Click any theater to improvise (face-down, strength 2, no ability).';
        }
        return 'Pick a card from your hand, then choose Deploy / Improvise.';
      case 'awaitingFlipTarget':
        if (state.pendingAbility?.kind === 'maneuver') return 'Maneuver — click a card in an adjacent theater to flip it.';
        if (state.pendingAbility?.kind === 'ambush') return 'Ambush — click any uncovered card to flip it.';
        if (state.pendingAbility?.kind === 'disrupt') return 'Disrupt — flip one of your own uncovered cards.';
        return 'Pick a target to flip.';
      case 'awaitingTransportTarget':
        return state.pendingAbility?.kind === 'transport' && state.pendingAbility.pickedCardId === undefined
          ? 'Transport — click one of your cards to move.'
          : 'Transport — click a different theater for the destination.';
      case 'awaitingRedeployTarget':
        return 'Redeploy — click one of your face-down cards to return to your hand. You will take another turn.';
      case 'awaitingReinforcePlacement':
        return 'Reinforce — click a theater to place the top card face-down, or skip.';
      default:
        return null;
    }
  })();

  return (
    <div className="als-hand-area">
      <div className="als-opp-hand">
        <span className="als-opp-hand-label">{opp.hand.length} card{opp.hand.length === 1 ? '' : 's'} in opponent's hand</span>
        <div className="als-opp-hand-row">
          {opp.hand.map((_, i) => <FaceDownCard key={i} size="small" />)}
        </div>
      </div>

      {hint && <div className="als-hint">{hint}</div>}

      <div className="als-hand">
        {me.hand.length === 0 && <p className="help">No cards in hand.</p>}
        {me.hand.map((cardId) => {
          const card = state.deckPool[cardId];
          if (!card) return null;
          const selected = selectedCardId === cardId;
          return (
            <AlsCardView
              key={cardId}
              card={card}
              selectable={canAct}
              selected={selected}
              onClick={canAct ? () => {
                setSelectedCardId(cardId);
                if (!pendingAction) setPendingAction('deploy');
              } : undefined}
            />
          );
        })}
      </div>

      <div className="als-actions">
        {canAct && (
          <>
            <button
              className="primary"
              disabled={selectedCardId === null}
              onClick={() => setPendingAction('deploy')}
            >
              Deploy (face-up)
            </button>
            <button
              className="secondary"
              disabled={selectedCardId === null}
              onClick={() => setPendingAction('improvise')}
            >
              Improvise (face-down)
            </button>
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`Withdraw with ${me.hand.length} card${me.hand.length === 1 ? '' : 's'} in hand?\nOpponent gains ${vpForWithdraw(me.hand.length)} VP.`)) {
                  dispatch({ type: 'withdraw', playerId: me.id });
                }
              }}
            >
              Withdraw ({vpForWithdraw(me.hand.length)} VP to opp)
            </button>
          </>
        )}
        {isLocalActive && state.subPhase === 'awaitingReinforcePlacement' && (
          <button onClick={() => dispatch({ type: 'reinforcePlace', playerId: me.id, theaterIdx: null })}>
            Skip Reinforce
          </button>
        )}
      </div>
    </div>
  );
}

function ReinforcePreview({ state, dispatch, myId }: { state: AlsState; dispatch: (a: AlsAction) => void; myId: PlayerId }) {
  const pa = state.pendingAbility;
  if (!pa || pa.kind !== 'reinforce') return null;
  const id = pa.revealedTopCardId;
  if (id === null) return null;
  const card = state.deckPool[id];
  if (!card) return null;
  void dispatch; void myId;
  return (
    <div className="als-reinforce-preview">
      <span>Top of deck (reveal):</span>
      <AlsCardView card={card} size="small" />
      <span className="als-cheat-note">If placed, it goes face-down (strength 2, no ability).</span>
    </div>
  );
}

function BattleEndPanel({ state, localSeatIdx, dispatch }: { state: AlsState; localSeatIdx: 0 | 1 | -1; dispatch: (a: AlsAction) => void }) {
  const result = state.lastBattleResult;
  if (!result) return null;
  const winnerName = result.winnerSeatIdx !== null
    ? (state.seats.find((s) => s.id === state.players[result.winnerSeatIdx!].id)?.name ?? '?')
    : 'Nobody';
  const isMyTurn = localSeatIdx !== -1 && state.activePlayerId === state.players[localSeatIdx].id;
  return (
    <div className="als-battle-end">
      <h2>Battle {result.battleNumber} complete</h2>
      <p>
        Ended by <strong>{result.endedBy === 'withdraw' ? 'withdraw' : 'full play'}</strong>.
        Winner: <strong>{winnerName}</strong> (+{result.vpAwardedToWinner} VP).
      </p>
      <table>
        <thead>
          <tr><th>Theater</th><th>Side 1 str</th><th>Side 2 str</th><th>Control</th></tr>
        </thead>
        <tbody>
          {state.config.theaters.map((tid, t) => {
            const ctrlName = state.seats.find((s) => s.id === state.players[result.theaterControl[t]].id)?.name ?? '—';
            return (
              <tr key={t}>
                <td>{tid}</td>
                <td>{result.theaterStrengths[t][0]}</td>
                <td>{result.theaterStrengths[t][1]}</td>
                <td>{ctrlName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        Match VP: {state.seats[0]?.name ?? '?'} {state.players[0].vp} · {state.seats[1]?.name ?? '?'} {state.players[1].vp}
        &nbsp;(first to {state.config.targetVp})
      </p>
      {isMyTurn && (
        <button className="primary" onClick={() => dispatch({ type: 'continueBattle' })}>
          Next battle →
        </button>
      )}
    </div>
  );
}

function GameOver({ state }: { state: AlsState }) {
  const winnerSeatIdx: 0 | 1 = state.players[0].vp >= state.players[1].vp ? 0 : 1;
  const winnerName = state.seats.find((s) => s.id === state.players[winnerSeatIdx].id)?.name ?? '?';
  return (
    <div className="als-gameover">
      <h1>{winnerName} wins the war!</h1>
      <p>Final VP — {state.seats[0]?.name ?? '?'} {state.players[0].vp} · {state.seats[1]?.name ?? '?'} {state.players[1].vp}</p>
    </div>
  );
}

// ---------- Unused-imports placation ----------
void SLS_THEATER_IDS;

export const bundle: GameUiBundle<AlsState, AlsAction, AlsConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
