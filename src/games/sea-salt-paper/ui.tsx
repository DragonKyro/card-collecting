import { useEffect, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SspState, SspAction, SspConfig, SspCard, SspCardFamily, SspPlayer,
} from './types';
import { CardView, FaceDownCard } from './Card';
import { isValidDuoPair, isValidStarfishTrio, tentativeScore, totalScore } from './scoring';
import { FAMILY } from './cards';
import { EVENT_BY_ID } from './events';
import { Sidebar } from './Sidebar';
import './ssp.css';

function LobbyConfig({ config, seats, onChange }: { config: SspConfig; seats: Seat[]; onChange: (c: SspConfig) => void }) {
  const exp = config.expansions ?? {};
  const setExp = (patch: Partial<NonNullable<SspConfig['expansions']>>) =>
    onChange({ ...config, expansions: { ...exp, ...patch } });
  return (
    <div className="game-config">
      <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
        First to reach the target score wins. Default scales with player count:
        2p = 40, 3p = 35, 4p = 30.
      </p>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Target score:</span>
        <input
          type="number"
          min={20}
          max={100}
          value={config.targetScore}
          onChange={(e) => onChange({ ...config, targetScore: Number(e.target.value) })}
          style={{ width: 80 }}
        />
      </label>

      <h4 style={{ margin: '14px 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-muted)' }}>
        Expansions
      </h4>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
        <input
          type="checkbox"
          checked={!!exp.extraSalt}
          onChange={(e) => setExp({ extraSalt: e.target.checked })}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong>Extra Salt</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-muted)' }}>
            Adds 8 cards: jellyfish ×2, lobster ×2, starfish ×2, seahorse, basket of crabs.
          </span>
        </span>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
        <input
          type="checkbox"
          checked={!!exp.extraPepper}
          onChange={(e) => setExp({ extraPepper: e.target.checked })}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong>Extra Pepper</strong>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-muted)' }}>
            Adds an event deck — one event applies each round, awarded at round end.
          </span>
        </span>
      </label>

      <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 12 }}>
        {seats.length} {seats.length === 1 ? 'seat' : 'seats'}.
      </p>
    </div>
  );
}

function GameView({
  state,
  localPlayerId,
  dispatch,
}: {
  state: SspState;
  localPlayerId: PlayerId | null;
  dispatch: (a: SspAction) => void;
}) {
  // selected hand-card ids for forming a duo pair
  const [selected, setSelected] = useState<number[]>([]);
  // streamlined keep-from-draw: which of the two pending-draw cards to keep
  const [keepIndex, setKeepIndex] = useState<0 | 1 | null>(null);

  useEffect(() => {
    setSelected([]);
    setKeepIndex(null);
  }, [state.activePlayerId, state.subPhase, state.round]);

  const isLocalActive = localPlayerId !== null && state.activePlayerId === localPlayerId;
  const me = state.players.find((p) => p.id === localPlayerId) ?? null;
  const opponents = state.players.filter((p) => p.id !== localPlayerId);
  const mySeatName = getSeat(state, localPlayerId ?? '')?.name ?? 'You';

  // ----- Auto-end-turn: if active human has no plays AND can't stop, just pass.
  // We let the AI driver in GameHost handle AI seats; for humans we only auto
  // when the local player is the active seat AND it's their turn AND no plays
  // are available AND they cannot call STOP/LAST CHANCE.
  useEffect(() => {
    if (!isLocalActive) return;
    if (state.subPhase !== 'awaitingPlayOrEnd') return;
    if (!me) return;
    const pairs = findHandPairs(me.hand);
    const opts = {
      trioCancelledIds: new Set<number>((me.trios ?? []).flat()),
      trios: me.trios?.length ?? 0,
      doubleColorBonus: state.event?.current === 'calmWaters',
    };
    const score = tentativeScore(me.hand, me.table, opts);
    const noPair = pairs.length === 0;
    const stopThreshold = (me.heldEvents ?? []).includes('stopAtFive') ? 5 : 7;
    const cannotEnd = score < stopThreshold;
    if (noPair && cannotEnd) {
      const t = setTimeout(() => dispatch({ type: 'pass' }), 400);
      return () => clearTimeout(t);
    }
  }, [isLocalActive, state.subPhase, me?.hand.length, me?.table.length, state.event?.current]);

  if (state.phase === 'gameOver') {
    return (
      <div className="ssp-layout">
        <div className="ssp"><GameOver state={state} /></div>
        <Sidebar state={state} mySeatName={mySeatName} />
      </div>
    );
  }

  if (state.subPhase === 'roundEnd') {
    return (
      <div className="ssp-layout">
        <div className="ssp">
          <RoundSummary state={state} />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => dispatch({ type: 'nextRound' })}>Next round →</button>
          </div>
        </div>
        <Sidebar state={state} mySeatName={mySeatName} />
      </div>
    );
  }

  const canPlaySelectedPair =
    selected.length === 2 && me &&
    (() => {
      const a = me.hand.find((c) => c.id === selected[0]);
      const b = me.hand.find((c) => c.id === selected[1]);
      return a && b && isValidDuoPair(a, b);
    })();

  const canPlaySelectedTrio =
    selected.length === 3 && me &&
    (() => {
      const cards = selected.map((id) => me.hand.find((c) => c.id === id));
      if (cards.some((c) => !c)) return false;
      return isValidStarfishTrio(cards[0]!, cards[1]!, cards[2]!);
    })();

  const myScoringOpts = me ? {
    trioCancelledIds: new Set<number>((me.trios ?? []).flat()),
    trios: me.trios?.length ?? 0,
    doubleColorBonus: state.event?.current === 'calmWaters',
  } : {};
  const myTentative = me ? tentativeScore(me.hand, me.table, myScoringOpts) : 0;
  const myStopThreshold = me && (me.heldEvents ?? []).includes('stopAtFive') ? 5 : 7;
  const isLocked = state.nextTurnLockedPlayerId != null && state.activePlayerId === state.nextTurnLockedPlayerId;
  const canStop = isLocalActive && state.subPhase === 'awaitingPlayOrEnd' && myTentative >= myStopThreshold && state.lastChanceFrom === null && !isLocked;
  const canLastChance = canStop && state.players.length > 1 && !(me && (me.heldEvents ?? []).includes('stormySeas'));
  const canPass = isLocalActive && state.subPhase === 'awaitingPlayOrEnd';

  const toggleSelect = (cardId: number) => {
    setSelected((prev) => {
      if (prev.includes(cardId)) return prev.filter((x) => x !== cardId);
      // Allow up to 3 to support starfish trios (2 duo + 1 starfish).
      if (prev.length >= 3) return [prev[1], prev[2], cardId];
      return [...prev, cardId];
    });
  };

  // Keep-from-draw helper: when the user clicks a pile we commit the draw with
  // the previously-selected keepIndex.
  const onPileClick = (pileIdx: 0 | 1) => {
    if (!isLocalActive) return;
    if (state.subPhase === 'awaitingAction') {
      // direct draw from this discard pile
      if (state.discards[pileIdx].length === 0) return;
      dispatch({ type: 'drawFromDiscard', pile: pileIdx });
      return;
    }
    if (state.subPhase === 'awaitingKeep' && keepIndex !== null) {
      dispatch({ type: 'keepFromDraw', keepIndex, discardToPile: pileIdx });
      setKeepIndex(null);
      return;
    }
    if (state.subPhase === 'awaitingCrabPick') {
      // surfaced in CrabPicker; ignore on the pile itself for now
      return;
    }
  };

  const onDeckClick = () => {
    if (!isLocalActive) return;
    if (state.subPhase === 'awaitingAction' && state.deck.length >= 2) {
      dispatch({ type: 'drawPair' });
    }
  };

  return (
    <div className="ssp-layout">
      <div className="ssp">
        <div className="board">
          <div className="target-info">
            <span>Round {state.round}</span>
            <span>Target: {state.config.targetScore} pts to win the match</span>
            <span>{state.deck.length} cards left in deck</span>
          </div>

          {state.event?.current && (
            <div className="ssp-event-banner" title={EVENT_BY_ID[state.event.current].rule}>
              <span className="ssp-event-tag">Event</span>
              <strong>{EVENT_BY_ID[state.event.current].name}</strong>
              <span className="ssp-event-rule">{EVENT_BY_ID[state.event.current].rule}</span>
            </div>
          )}

          <div className="opponents">
            {opponents.map((p) => (
              <PlayerStrip key={p.id} player={p} seat={getSeat(state, p.id)} isActive={state.activePlayerId === p.id} reveal={false} />
            ))}
          </div>

          <CenterStrip
            state={state}
            isLocalActive={isLocalActive}
            keepIndex={keepIndex}
            onDeckClick={onDeckClick}
            onPileClick={onPileClick}
          />

          {state.subPhase === 'awaitingKeep' && state.pendingDraw.length === 2 && isLocalActive && (
            <PendingDrawPanel
              pending={state.pendingDraw as [SspCard, SspCard]}
              keepIndex={keepIndex}
              setKeepIndex={setKeepIndex}
            />
          )}

          {me ? (
            <div className="hand-area">
              <h3>
                <span>{getSeat(state, me.id)?.name ?? 'You'} — {myTentative} pt{myTentative === 1 ? '' : 's'}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {me.matchScore} match • {me.hand.length} in hand
                </span>
              </h3>

              <div className="cards">
                {me.hand.map((c) => {
                  const allowSelect =
                    isLocalActive && state.subPhase === 'awaitingPlayOrEnd';
                  return (
                    <CardView
                      key={c.id}
                      card={c}
                      selectable={allowSelect}
                      selected={selected.includes(c.id)}
                      onClick={allowSelect ? () => toggleSelect(c.id) : undefined}
                    />
                  );
                })}
                {me.hand.length === 0 && <p className="help">No cards yet — click the deck or a discard pile to draw.</p>}
              </div>

              {me.table.length > 0 && (
                <>
                  <h3 style={{ marginTop: 14 }}>
                    <span>On the table</span>
                  </h3>
                  <div className="table-strip">
                    {me.table.map((c) => (
                      <CardView key={c.id} card={c} size="small" />
                    ))}
                  </div>
                </>
              )}

              <div className="actions">
                {state.subPhase === 'awaitingPlayOrEnd' && (
                  <>
                    {isLocked && (
                      <div className="locked-banner">
                        Locked by Jellyfish — you can only draw two cards and pass this turn.
                      </div>
                    )}
                    <button
                      disabled={!canPlaySelectedPair || isLocked}
                      onClick={() => {
                        if (!canPlaySelectedPair) return;
                        dispatch({ type: 'playPair', cardIds: [selected[0], selected[1]] });
                        setSelected([]);
                      }}
                    >
                      Play pair {selected.length === 2 ? `(${describeSelection(me, selected)})` : ''}
                    </button>
                    {selected.length === 3 && (
                      <button
                        disabled={!canPlaySelectedTrio || isLocked}
                        onClick={() => {
                          if (!canPlaySelectedTrio) return;
                          dispatch({ type: 'playTrio', cardIds: [selected[0], selected[1], selected[2]] });
                          setSelected([]);
                        }}
                      >
                        Play trio (starfish + duo)
                      </button>
                    )}
                    <button className="stop" disabled={!canStop} onClick={() => dispatch({ type: 'stop' })}>
                      STOP {canStop ? `(${myTentative})` : ''}
                    </button>
                    <button className="lastchance" disabled={!canLastChance} onClick={() => dispatch({ type: 'lastChance' })}>
                      LAST CHANCE
                    </button>
                    <button className="pass" disabled={!canPass} onClick={() => dispatch({ type: 'pass' })}>
                      End turn
                    </button>
                  </>
                )}
                {state.subPhase === 'awaitingSharkSteal' && isLocalActive && (
                  <StealPicker state={state} dispatch={dispatch} />
                )}
                {state.subPhase === 'awaitingCrabPick' && isLocalActive && (
                  <CrabPicker state={state} dispatch={dispatch} />
                )}
                {state.subPhase === 'awaitingLobsterPick' && isLocalActive && (
                  <LobsterPicker state={state} dispatch={dispatch} />
                )}
              </div>
            </div>
          ) : (
            <p className="help">Spectator view.</p>
          )}
        </div>

        {!isLocalActive && (
          <p className="help center" style={{ marginTop: 12 }}>
            Waiting for {getSeat(state, state.activePlayerId ?? '')?.name ?? 'opponent'}…
          </p>
        )}
      </div>

      <Sidebar state={state} mySeatName={mySeatName} />
    </div>
  );
}

function CenterStrip({
  state, isLocalActive, keepIndex, onDeckClick, onPileClick,
}: {
  state: SspState;
  isLocalActive: boolean;
  keepIndex: 0 | 1 | null;
  onDeckClick: () => void;
  onPileClick: (pile: 0 | 1) => void;
}) {
  const canDraw = isLocalActive && state.subPhase === 'awaitingAction';
  const canCommitKeep = isLocalActive && state.subPhase === 'awaitingKeep' && keepIndex !== null;

  return (
    <div className="center">
      <div
        className={`deck-stack ${canDraw && state.deck.length >= 2 ? 'clickable' : ''}`}
        onClick={canDraw && state.deck.length >= 2 ? onDeckClick : undefined}
        title={canDraw ? 'Click to draw two from the deck' : ''}
      >
        <FaceDownCard />
        <div className="label">Deck · {state.deck.length}</div>
        {canDraw && <div className="label" style={{ color: '#f4d268' }}>Click to draw 2</div>}
      </div>
      {[0, 1].map((i) => {
        const pile = state.discards[i];
        const top = pile[pile.length - 1];
        const canTakeFromPile = canDraw && !!top;
        const canDropHere = canCommitKeep;
        const clickable = canTakeFromPile || canDropHere;
        return (
          <div
            key={i}
            className={`pile ${pile.length === 0 ? 'empty' : ''} ${clickable ? 'clickable' : ''} ${canDropHere ? 'target-discard' : ''}`}
            onClick={clickable ? () => onPileClick(i as 0 | 1) : undefined}
            title={canTakeFromPile ? `Click to take ${FAMILY[top.family].label} from pile ${i + 1}` : canDropHere ? `Discard the other card to pile ${i + 1}` : ''}
          >
            {top ? <CardView card={top} /> : <div className="empty-slot">empty</div>}
            <div className="label">Pile {i + 1} · {pile.length} card{pile.length === 1 ? '' : 's'}</div>
            {canTakeFromPile && <div className="label" style={{ color: '#f4d268' }}>Click to take</div>}
            {canDropHere && <div className="label" style={{ color: '#f4d268' }}>Drop here</div>}
          </div>
        );
      })}
    </div>
  );
}

function PendingDrawPanel({
  pending, keepIndex, setKeepIndex,
}: {
  pending: [SspCard, SspCard];
  keepIndex: 0 | 1 | null;
  setKeepIndex: (i: 0 | 1) => void;
}) {
  return (
    <div className="pending-draw">
      <div style={{ width: '100%' }}>
        <div className="keep-hint">
          {keepIndex === null
            ? 'Step 1: click the card you want to keep.'
            : 'Step 2: click a discard pile (left) to drop the other card there.'}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {pending.map((c, i) => (
            <CardView
              key={c.id}
              card={c}
              selectable
              selected={keepIndex === i}
              onClick={() => setKeepIndex(i as 0 | 1)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StealPicker({ state, dispatch }: { state: SspState; dispatch: (a: SspAction) => void }) {
  const targets = state.players.filter((p) => p.id !== state.activePlayerId && p.hand.length > 0);
  if (targets.length === 0) return <p className="help">No valid steal target — pass to skip.</p>;
  return (
    <>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, alignSelf: 'center' }}>
        Steal from:
      </span>
      {targets.map((p) => (
        <button key={p.id} onClick={() => dispatch({ type: 'sharkSteal', targetPlayerId: p.id })}>
          {getSeat(state, p.id)?.name ?? p.id} ({p.hand.length})
        </button>
      ))}
    </>
  );
}

function CrabPicker({ state, dispatch }: { state: SspState; dispatch: (a: SspAction) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <p className="help" style={{ marginBottom: 4 }}>Pick any card from either discard pile:</p>
      {state.discards.map((pile, i) => (
        <div key={i}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Pile {i + 1}:</span>
          <div className="cards" style={{ marginTop: 4 }}>
            {pile.length === 0 && <p className="help">empty</p>}
            {pile.map((c) => (
              <CardView
                key={c.id}
                card={c}
                size="small"
                selectable
                onClick={() => dispatch({ type: 'crabPick', pile: i as 0 | 1, cardId: c.id })}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LobsterPicker({ state, dispatch }: { state: SspState; dispatch: (a: SspAction) => void }) {
  const pool = state.pendingLobsterPick ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <p className="help" style={{ marginBottom: 4 }}>
        Lobster reveal — keep one card from the top of the deck. The rest will be shuffled back in.
      </p>
      <div className="cards" style={{ marginTop: 4 }}>
        {pool.map((c) => (
          <CardView
            key={c.id}
            card={c}
            size="small"
            selectable
            onClick={() => dispatch({ type: 'lobsterPick', cardId: c.id })}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerStrip({ player, seat, isActive, reveal }: {
  player: SspPlayer; seat: Seat | undefined; isActive: boolean; reveal: boolean;
}) {
  const total = totalScore([...player.hand, ...player.table], {
    trioCancelledIds: new Set<number>((player.trios ?? []).flat()),
    trios: player.trios?.length ?? 0,
  });
  return (
    <div className={`player-strip ${isActive ? 'active' : ''}`}>
      <header>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: seat?.color ?? '#888', borderRadius: 2 }} />
          {seat?.name ?? player.id}
          {seat?.isAI ? <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>(AI)</span> : null}
        </span>
        <span className="scores">
          <span>Match {player.matchScore}</span>
          <span>•</span>
          <span>{player.hand.length} cards</span>
        </span>
      </header>
      <div className="table-strip">
        {[...Array(player.hand.length)].map((_, i) => (
          reveal
            ? null
            : <FaceDownCard key={`fd-${i}`} size="small" />
        ))}
        {player.table.map((c) => (
          <CardView key={c.id} card={c} size="small" />
        ))}
      </div>
      {reveal && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          {total.total} pts • {total.cardPoints} cards + {total.colorBonus} bonus
        </div>
      )}
    </div>
  );
}

function RoundSummary({ state }: { state: SspState }) {
  const s = state.lastRoundSummary;
  if (!s) return null;
  return (
    <div className="round-summary">
      <h2>Round {s.round} complete</h2>
      <p style={{ margin: '6px 0', fontStyle: 'italic' }}>
        {s.endedBy === 'stop' && `${nameOf(state, s.endedByPlayerId)} called STOP.`}
        {s.endedBy === 'lastChance' && `${nameOf(state, s.endedByPlayerId)} called LAST CHANCE — ${s.lastChanceWon ? 'bet won!' : 'bet lost.'}`}
        {s.endedBy === 'deckEmpty' && `The deck ran out — round ends with no penalty.`}
        {s.endedBy === 'mermaid' && `${nameOf(state, s.endedByPlayerId)} collected 4 mermaids!`}
      </p>
      <table>
        <thead>
          <tr><th>Player</th><th className="num">Cards</th><th className="num">Bonus</th><th className="num">Round</th><th className="num">Match</th></tr>
        </thead>
        <tbody>
          {s.perPlayer.map((row) => {
            const p = state.players.find((x) => x.id === row.playerId)!;
            return (
              <tr key={row.playerId} className={row.forfeitCards ? 'forfeit' : ''}>
                <td>{nameOf(state, row.playerId)}</td>
                <td className="num">{row.forfeitCards ? `(${row.cardPoints} ✕)` : row.cardPoints}</td>
                <td className="num">{row.colorBonus}</td>
                <td className="num"><strong>{row.total}</strong></td>
                <td className="num">{p.matchScore}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GameOver({ state }: { state: SspState }) {
  const sorted = [...state.players].sort((a, b) => b.matchScore - a.matchScore);
  const winner = sorted[0];
  const reason = state.mermaidWinnerId
    ? `${nameOf(state, state.mermaidWinnerId)} collected 4 mermaids — instant win!`
    : `${nameOf(state, winner.id)} reached ${state.config.targetScore}.`;
  return (
    <div className="ssp">
      <div className="gameover-banner">{reason}</div>
      <div className="round-summary">
        <h2>Final scores</h2>
        <table>
          <thead><tr><th>Player</th><th className="num">Score</th></tr></thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{nameOf(state, p.id)}</td>
                <td className="num">{p.matchScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function findHandPairs(hand: SspCard[]): Array<[SspCard, SspCard]> {
  const out: Array<[SspCard, SspCard]> = [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (isValidDuoPair(hand[i], hand[j])) out.push([hand[i], hand[j]]);
    }
  }
  return out;
}

function getSeat(state: SspState, id: PlayerId): Seat | undefined {
  return state.seats.find((s) => s.id === id);
}
function nameOf(state: SspState, id: PlayerId | null): string {
  if (!id) return '—';
  return getSeat(state, id)?.name ?? id;
}
function describeSelection(me: SspPlayer, ids: number[]): string {
  const cards = ids.map((id) => me.hand.find((c) => c.id === id)).filter(Boolean) as SspCard[];
  if (cards.length !== 2) return '';
  return cards.map((c) => FAMILY[c.family as SspCardFamily].label).join(' + ');
}

export const bundle: GameUiBundle<SspState, SspAction, SspConfig> = {
  LobbyConfig,
  GameView,
};
