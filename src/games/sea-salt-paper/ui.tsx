import { useEffect, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SspState, SspAction, SspConfig, SspCard, SspCardFamily, SspPlayer,
} from './types';
import { CardView, FaceDownCard } from './Card';
import { isValidDuoPair, tentativeScore, totalScore } from './scoring';
import { FAMILY } from './cards';
import './ssp.css';

function LobbyConfig({ config, seats, onChange }: { config: SspConfig; seats: Seat[]; onChange: (c: SspConfig) => void }) {
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
      <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
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
  // Selected card ids for forming a duo pair.
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    // clear selection when our turn changes
    setSelected([]);
  }, [state.activePlayerId, state.subPhase, state.round]);

  const isLocalActive = localPlayerId !== null && state.activePlayerId === localPlayerId;
  const me = state.players.find((p) => p.id === localPlayerId) ?? null;
  const opponents = state.players.filter((p) => p.id !== localPlayerId);

  if (state.phase === 'gameOver') {
    return <GameOver state={state} />;
  }

  if (state.subPhase === 'roundEnd') {
    return (
      <div className="ssp">
        <RoundSummary state={state} />
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button onClick={() => dispatch({ type: 'nextRound' })}>Next round →</button>
        </div>
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

  const myTentative = me ? tentativeScore(me.hand, me.table) : 0;
  const canStop = isLocalActive && state.subPhase === 'awaitingPlayOrEnd' && myTentative >= 7 && state.lastChanceFrom === null;
  const canLastChance = canStop && state.players.length > 1;
  const canPass = isLocalActive && state.subPhase === 'awaitingPlayOrEnd';

  const toggleSelect = (cardId: number) => {
    setSelected((prev) => {
      if (prev.includes(cardId)) return prev.filter((x) => x !== cardId);
      if (prev.length >= 2) return [prev[1], cardId];
      return [...prev, cardId];
    });
  };

  return (
    <div className="ssp">
      <div className="board">
        <div className="target-info">
          <span>Round {state.round}</span>
          <span>Target: {state.config.targetScore} pts to win the match</span>
          <span>{state.deck.length} cards left in deck</span>
        </div>

        <div className="opponents">
          {opponents.map((p) => (
            <PlayerStrip key={p.id} player={p} seat={getSeat(state, p.id)} isActive={state.activePlayerId === p.id} reveal={false} />
          ))}
        </div>

        <CenterStrip state={state} dispatch={dispatch} isLocalActive={isLocalActive} me={me} />

        {state.subPhase === 'awaitingKeep' && state.pendingDraw.length === 2 && isLocalActive && (
          <PendingDrawPanel pending={state.pendingDraw as [SspCard, SspCard]} dispatch={dispatch} />
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
              {me.hand.length === 0 && <p className="help">No cards yet — draw to start.</p>}
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
                  <button
                    disabled={!canPlaySelectedPair}
                    onClick={() => {
                      if (!canPlaySelectedPair) return;
                      dispatch({ type: 'playPair', cardIds: [selected[0], selected[1]] });
                      setSelected([]);
                    }}
                  >
                    Play pair {selected.length === 2 ? `(${describeSelection(me, selected)})` : ''}
                  </button>
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
  );
}

function CenterStrip({
  state, dispatch, isLocalActive,
}: { state: SspState; dispatch: (a: SspAction) => void; isLocalActive: boolean; me: SspPlayer | null }) {
  const canDraw =
    isLocalActive && state.subPhase === 'awaitingAction';
  return (
    <div className="center">
      <div className="deck-stack">
        <FaceDownCard />
        <button disabled={!canDraw || state.deck.length < 2} onClick={() => dispatch({ type: 'drawPair' })}>
          Draw 2
        </button>
        <span>{state.deck.length}</span>
      </div>
      {[0, 1].map((i) => {
        const pile = state.discards[i];
        const top = pile[pile.length - 1];
        return (
          <div key={i} className={`pile ${pile.length === 0 ? 'empty' : ''}`}>
            {top ? <CardView card={top} /> : <div className="empty-slot">empty</div>}
            <button
              disabled={!canDraw || !top}
              onClick={() => dispatch({ type: 'drawFromDiscard', pile: i as 0 | 1 })}
            >
              Take from pile {i + 1}
            </button>
            <span>{pile.length} card{pile.length === 1 ? '' : 's'}</span>
          </div>
        );
      })}
    </div>
  );
}

function PendingDrawPanel({ pending, dispatch }: { pending: [SspCard, SspCard]; dispatch: (a: SspAction) => void }) {
  const [keep, setKeep] = useState<0 | 1 | null>(null);
  const [discardPile, setDiscardPile] = useState<0 | 1>(0);
  return (
    <div className="pending-draw">
      <div>
        <p style={{ margin: '0 0 8px', textAlign: 'center', fontSize: 13 }}>
          Pick one to keep — the other goes face-up onto a discard pile.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {pending.map((c, i) => (
            <CardView
              key={c.id}
              card={c}
              selectable
              selected={keep === i}
              onClick={() => setKeep(i as 0 | 1)}
            />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
        <span>Discard the other onto:</span>
        <label><input type="radio" name="dp" checked={discardPile === 0} onChange={() => setDiscardPile(0)} /> Pile 1</label>
        <label><input type="radio" name="dp" checked={discardPile === 1} onChange={() => setDiscardPile(1)} /> Pile 2</label>
        <button
          disabled={keep === null}
          onClick={() => keep !== null && dispatch({ type: 'keepFromDraw', keepIndex: keep, discardToPile: discardPile })}
        >
          Confirm
        </button>
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

function PlayerStrip({ player, seat, isActive, reveal }: {
  player: SspPlayer; seat: Seat | undefined; isActive: boolean; reveal: boolean;
}) {
  const total = totalScore([...player.hand, ...player.table]);
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
