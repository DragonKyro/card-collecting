// Right-hand rail: who's scoring, how the deck is doing, the practice controls,
// and — once the deck is dead — the session readout.
//
// The elapsed clock ticks here, in the view. The reducer never reads a clock; it
// only ever gets a timestamp handed to it in an action payload.
//
// Numbers that change on a find (found, misses, cards left, a seat's score) are
// keyed on their value so each change pops in; the deck meter drains as the
// deck does, and the split strip grows a bar per find.

import { useEffect, useState, type CSSProperties } from 'react';
import type { PlayerId } from '@/core/types';
import { formatMs, formatSeconds, matchStats } from './stats';
import type { SetModeSpec } from './modes';
import type { SetHistoryEntry, SetState } from './types';
import type { BoardLayout } from './BoardView';

interface Props {
  state: SetState;
  spec: SetModeSpec;
  /** Cards in a full deck of this mode, for the deck meter. */
  deckSize: number;
  layout: BoardLayout;
  showShortcuts: boolean;
  onToggleLayout(): void;
  onToggleShortcuts(): void;
  onClaimant(playerId: PlayerId): void;
  onHint(): void;
  onQuit(): void;
}

export function SetSidebar({
  state, spec, deckSize, layout, showShortcuts,
  onToggleLayout, onToggleShortcuts, onClaimant, onHint, onQuit,
}: Props) {
  const elapsed = useElapsed(state);
  const stats = matchStats(state);
  const multiSeat = state.seats.length > 1;
  const over = state.phase === 'gameOver';
  const inDeck = Math.max(0, state.deck.length - state.boardSize);
  const deckFrac = deckSize > 0 ? Math.min(1, inDeck / deckSize) : 0;

  return (
    <aside className="set-sidebar">
      <div className="set-panel set-mode-panel">
        <div className="set-mode-name">{spec.name}</div>
        <div className="set-mode-blurb">{spec.blurb}</div>
      </div>

      <div className="set-panel set-stats-panel">
        <div className="set-stat-grid">
          <Stat label="Elapsed" value={formatMs(elapsed, false)} />
          <Stat label="In deck" value={String(inDeck)} pop />
          <Stat label="Found" value={String(stats.totalSets)} pop tone="good" />
          <Stat label="Misses" value={String(stats.totalMistakes)} pop tone="bad" />
          {spec.puzzle && (
            <>
              <Stat label="On board" value={String(state.foundKeys.length)} pop />
              <Stat label="Boards" value={String(stats.boardsCleared)} pop />
            </>
          )}
        </div>
        <div className="set-deck-meter" title={`${inDeck} of ${deckSize} cards left in the deck`}>
          <span style={{ transform: `scaleX(${deckFrac})` }} />
        </div>
        {!over && <SplitStrip state={state} />}
      </div>

      <div className={`set-panel set-players${multiSeat ? ' is-shared' : ''}`}>
        <h4 className="set-panel-h">{multiSeat ? 'Players' : 'Score'}</h4>
        <ul className="set-score-list">
          {state.seats.map((seat, i) => {
            // Solo play has nothing to choose between, so no highlight; nor
            // is there once the match is over.
            const isClaimant = multiSeat && !over && seat.id === state.claimantId;
            const score = state.scores[seat.id] ?? 0;
            return (
              <li key={seat.id}>
                <button
                  type="button"
                  className={`set-seat-chip${isClaimant ? ' is-active' : ''}`}
                  style={{ ['--seat' as string]: seat.color } as CSSProperties}
                  onClick={() => onClaimant(seat.id)}
                  disabled={over || !multiSeat}
                  title={multiSeat ? `Claim as ${seat.name} (press ${i + 1})` : undefined}
                >
                  {multiSeat && <kbd className="set-seat-key" aria-hidden="true">{i + 1}</kbd>}
                  <span className="set-seat-swatch" style={{ background: seat.color }} />
                  <span className="set-seat-name">{seat.name}</span>
                  <span className="set-seat-score" key={score}>{score}</span>
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
        <div className="set-panel set-session">
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
                {s.splits.length > 1 && <SplitChart splits={s.splits} color={seat?.color ?? 'var(--set-accent)'} />}
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

function Stat({ label, value, pop, tone }: {
  label: string;
  value: string;
  /** Re-mount the value on change so it pops. */
  pop?: boolean;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className={`set-stat${tone ? ` is-${tone}` : ''}`}>
      <span className="set-stat-label">{label}</span>
      <span className={`set-stat-value${pop ? ' is-pop' : ''}`} key={pop ? value : undefined}>{value}</span>
    </div>
  );
}

const STRIP_BARS = 14;

/** The last few finds as bars (taller = slower), newest on the right, in the
 *  finder's colour; the fastest so far is gold. */
function SplitStrip({ state }: { state: SetState }) {
  const finds = state.history.filter((h): h is SetHistoryEntry => h.kind === 'set' && h.splitMs > 0);
  if (finds.length === 0) return null;
  const recent = finds.slice(-STRIP_BARS);
  const max = Math.max(...recent.map((h) => h.splitMs));
  const best = Math.min(...finds.map((h) => h.splitMs));
  const colorOf = (id: PlayerId | null) => state.seats.find((s) => s.id === id)?.color ?? 'var(--set-accent)';
  const last = recent[recent.length - 1];
  return (
    <div className="set-strip">
      <div className="set-strip-head">
        <span>Splits</span>
        <span>
          last <strong key={last.atMs} className="set-strip-last">{formatSeconds(last.splitMs)}</strong>
          {' · '}best <strong className="set-strip-best">{formatSeconds(best)}</strong>
        </span>
      </div>
      <div className="set-strip-bars" aria-hidden="true">
        {recent.map((h) => (
          <span
            key={h.atMs}
            className={h.splitMs === best ? 'is-best' : undefined}
            style={{
              height: `${Math.max(10, (h.splitMs / max) * 100)}%`,
              ['--bar' as string]: colorOf(h.byPlayerId),
            } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}

/** Bar chart of split times — where the drilling payoff shows up. */
function SplitChart({ splits, color }: { splits: readonly number[]; color: string }) {
  const max = Math.max(...splits);
  const best = Math.min(...splits);
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
            rx={Math.min(2, barW / 4)}
            fill={ms === best ? '#ffc53d' : color}
            opacity={ms === best ? 1 : 0.8}
            style={{ ['--i' as string]: i } as CSSProperties}
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
