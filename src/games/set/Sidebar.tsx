// Right-hand rail: who's scoring, how the deck is doing, the practice controls,
// and — once the deck is dead — the session readout.
//
// The elapsed clock ticks here, in the view. The reducer never reads a clock; it
// only ever gets a timestamp handed to it in an action payload.

import { useEffect, useState } from 'react';
import type { PlayerId } from '@/core/types';
import { formatMs, formatSeconds, matchStats } from './stats';
import type { SetModeSpec } from './modes';
import type { SetState } from './types';
import type { BoardLayout } from './BoardView';

interface Props {
  state: SetState;
  spec: SetModeSpec;
  layout: BoardLayout;
  showShortcuts: boolean;
  onToggleLayout(): void;
  onToggleShortcuts(): void;
  onClaimant(playerId: PlayerId): void;
  onHint(): void;
  onQuit(): void;
}

export function SetSidebar({
  state, spec, layout, showShortcuts,
  onToggleLayout, onToggleShortcuts, onClaimant, onHint, onQuit,
}: Props) {
  const elapsed = useElapsed(state);
  const stats = matchStats(state);
  const multiSeat = state.seats.length > 1;
  const over = state.phase === 'gameOver';

  return (
    <aside className="set-sidebar">
      <div className="set-panel">
        <div className="set-mode-name">{spec.name}</div>
        <div className="set-mode-blurb">{spec.blurb}</div>
      </div>

      <div className="set-panel set-stat-grid">
        <Stat label="Elapsed" value={formatMs(elapsed, false)} />
        <Stat label="In deck" value={String(Math.max(0, state.deck.length - state.boardSize))} />
        <Stat label="Found" value={String(stats.totalSets)} />
        <Stat label="Misses" value={String(stats.totalMistakes)} />
        {spec.puzzle && (
          <>
            <Stat label="On board" value={String(state.foundKeys.length)} />
            <Stat label="Boards" value={String(stats.boardsCleared)} />
          </>
        )}
      </div>

      <div className="set-panel">
        <h4 className="set-panel-h">{multiSeat ? 'Players' : 'Score'}</h4>
        <ul className="set-score-list">
          {state.seats.map((seat, i) => {
            // Solo play has nothing to choose between, so no highlight.
            const isClaimant = multiSeat && seat.id === state.claimantId;
            return (
              <li key={seat.id}>
                <button
                  type="button"
                  className={`set-seat-chip${isClaimant ? ' is-active' : ''}`}
                  onClick={() => onClaimant(seat.id)}
                  disabled={over || !multiSeat}
                  title={multiSeat ? `Claim as ${seat.name} (press ${i + 1})` : undefined}
                >
                  <span className="set-seat-swatch" style={{ background: seat.color }} />
                  <span className="set-seat-name">{seat.name}</span>
                  <span className="set-seat-score">{state.scores[seat.id] ?? 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {multiSeat && !over && (
          <p className="set-hint-text">
            Shared screen: pick your name (or press its number) before you call the {ruleNoun(spec)}.
          </p>
        )}
      </div>

      {!over && (
        <div className="set-panel set-controls">
          <button className="secondary" onClick={onToggleLayout}>
            {layout === 'rows' ? '⬍ Three columns' : '⬌ Three rows'}
          </button>
          <button className="secondary" onClick={onToggleShortcuts}>
            {showShortcuts ? 'Hide keys' : 'Show keys'}
          </button>
          {state.config.enableHints && (
            <button className="secondary" onClick={onHint}>
              💡 Hint ({state.hintsUsed})
            </button>
          )}
          <button className="secondary" onClick={onQuit}>Finish now</button>
        </div>
      )}

      {over && (
        <div className="set-panel">
          <h4 className="set-panel-h">Session</h4>
          <div className="set-stat-grid">
            <Stat label="Total time" value={formatMs(stats.elapsedMs, false)} />
            <Stat label="Hints" value={String(stats.hintsUsed)} />
          </div>
          {stats.seats.map((s) => {
            const seat = state.seats.find((x) => x.id === s.playerId);
            return (
              <div key={s.playerId} className="set-seat-stats">
                <div className="set-seat-stats-head" style={{ color: seat?.color }}>
                  {seat?.name ?? s.playerId}
                </div>
                <div className="set-stat-grid">
                  <Stat label="Found" value={String(s.sets)} />
                  <Stat label="Accuracy" value={`${Math.round(s.accuracy * 100)}%`} />
                  <Stat label="Fastest" value={s.bestMs === null ? '—' : formatSeconds(s.bestMs)} />
                  <Stat label="Median" value={s.medianMs === null ? '—' : formatSeconds(s.medianMs)} />
                </div>
                {s.splits.length > 1 && <SplitChart splits={s.splits} color={seat?.color ?? 'var(--accent)'} />}
              </div>
            );
          })}
          <p className="set-hint-text">
            Session only — nothing is saved between visits.
          </p>
        </div>
      )}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-stat">
      <span className="set-stat-label">{label}</span>
      <span className="set-stat-value">{value}</span>
    </div>
  );
}

/** Bar chart of split times — where the drilling payoff shows up. */
function SplitChart({ splits, color }: { splits: readonly number[]; color: string }) {
  const max = Math.max(...splits);
  const w = 200;
  const h = 46;
  const barW = w / splits.length;
  return (
    <svg className="set-split-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Split times">
      {splits.map((ms, i) => {
        const barH = max === 0 ? 0 : (ms / max) * (h - 4);
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={h - barH}
            width={Math.max(1, barW - 1)}
            height={barH}
            fill={color}
            opacity={0.75}
          />
        );
      })}
    </svg>
  );
}

function ruleNoun(spec: SetModeSpec): string {
  switch (spec.family) {
    case 'ultraset': return 'UltraSet';
    case 'ghostset': return 'GhostSet';
    case '4set': return '4Set';
    default: return 'set';
  }
}

/** Ticks once a second while the match is live. */
function useElapsed(state: SetState): number {
  const [now, setNow] = useState(() => Date.now());
  const running = state.phase === 'playing' && state.startedAtMs !== null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [running]);
  if (state.startedAtMs === null) return 0;
  if (state.phase !== 'playing') {
    const last = state.history[state.history.length - 1];
    return last ? Math.max(0, last.atMs - state.startedAtMs) : 0;
  }
  return Math.max(0, now - state.startedAtMs);
}
