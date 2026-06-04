// 7 Wonders UI — LobbyConfig + GameView.

import { useEffect, useMemo, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SwState, SwAction, SwConfig, SwExpansionId,
  SwCard, SwPlayer, SwPendingPick, SwResource,
} from './types';
import { WONDERS, wonderById, wondersByName } from './wonders';
import {
  canChainBuild, shortfall, suggestCheapestPurchase,
  validatePayment, shieldsFor, productionFor, effectiveCostFor,
} from './resources';
import { getActiveExpansions, getAllExpansions } from './expansions/registry';
import { BilkisButton } from './expansions/leaders/ui';
import './seven-wonders.css';

const ALL_EXPANSIONS: Array<{ id: SwExpansionId; label: string; desc: string; implemented: boolean }> = [
  { id: 'leaders', label: 'Leaders', desc: 'Pick-and-pass draft of 4 leaders, then play one before each Age. All 36 leaders modeled.', implemented: true },
  { id: 'cities', label: 'Cities', desc: 'Adds ~9 black cards per age: diplomacy + debt mechanics. Per-card abilities are best-effort modeled; some are placeholder no-ops pending authoritative rulebook text.', implemented: true },
  { id: 'babel', label: 'Babel', desc: 'Adds 5 orange cards per age + 3 Babel-themed scoring rules. Central Tower of Babel / Great Projects boards NOT modeled in v1.', implemented: true },
  { id: 'armada', label: 'Armada', desc: 'Adds 5 navy cards per age + 3 Armada-themed scoring rules. Personal shipyards / naval combat / island cards NOT modeled in v1.', implemented: true },
  { id: 'edifice', label: 'Edifice', desc: '3 cooperative project tiles (one per age). Contribute by building a wonder stage in the matching age. Threshold met → reward contributors / penalize non-contributors at endgame.', implemented: true },
];

// ===================================================================
// LobbyConfig
// ===================================================================

function LobbyConfig({ config, seats, onChange }: { config: SwConfig; seats: Seat[]; onChange: (c: SwConfig) => void }) {
  const wonderGroups = useMemo(() => wondersByName(), []);

  const toggleExpansion = (id: SwExpansionId) => {
    const has = config.expansions.includes(id);
    const next = has ? config.expansions.filter((x) => x !== id) : [...config.expansions, id];
    onChange({ ...config, expansions: next });
  };

  const setSide = (side: 'random' | 'A' | 'B') => onChange({ ...config, wonderSide: side });
  const setAssignment = (a: 'random' | 'preset') => onChange({ ...config, wonderAssignment: a });

  const setPresetFor = (seatIdx: number, wonderId: string) => {
    const next = (config.presetWonders ?? []).slice();
    while (next.length < seats.length) next.push(WONDERS[0].id);
    next[seatIdx] = wonderId;
    onChange({ ...config, presetWonders: next });
  };

  return (
    <div className="game-config sw-lobby">
      <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 0 }}>
        3 ages, simultaneous draft. Pick your wonder side (A or B) or let it be random.
        Expansions are listed here but none are implemented yet — toggling them has no effect.
      </p>

      <h4 style={{ margin: '12px 0 4px' }}>Wonders</h4>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderAssignment === 'random'} onChange={() => setAssignment('random')} />
          Random assignment
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderAssignment === 'preset'} onChange={() => setAssignment('preset')} />
          Manual per-seat
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', alignSelf: 'center' }}>Side:</span>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderSide === 'A'} onChange={() => setSide('A')} />A
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderSide === 'B'} onChange={() => setSide('B')} />B
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderSide === 'random'} onChange={() => setSide('random')} />random
        </label>
      </div>

      {config.wonderAssignment === 'preset' && (
        <div>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Pick a wonder for each seat:</p>
          {seats.map((s, i) => {
            const current = config.presetWonders?.[i] ?? '';
            return (
              <div key={s.id} className="sw-expansion-row">
                <span style={{ width: 110, fontSize: 13 }}>{s.name}</span>
                <select
                  value={current}
                  onChange={(e) => setPresetFor(i, e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">— random —</option>
                  {wonderGroups.flatMap((g) => [
                    <option key={g.a.id} value={g.a.id}>{g.name} (A)</option>,
                    <option key={g.b.id} value={g.b.id}>{g.name} (B)</option>,
                  ])}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <h4 style={{ margin: '14px 0 4px' }}>Expansions</h4>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 8px' }}>
        Toggle expansions. Only the ones marked <em>implemented</em> actually affect play.
      </p>
      {ALL_EXPANSIONS.map((e) => (
        <div key={e.id} className="sw-expansion-row">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={config.expansions.includes(e.id)}
              onChange={() => toggleExpansion(e.id)}
              disabled={!e.implemented}
            />
            <strong>{e.label}</strong>
            {!e.implemented && (
              <span style={{ fontSize: 10, color: 'var(--fg-muted)', fontStyle: 'italic' }}>(not implemented)</span>
            )}
          </label>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{e.desc}</span>
        </div>
      ))}
      {/* Render implemented expansions' LobbySection components */}
      {getAllExpansions()
        .filter((ext) => config.expansions.includes(ext.id) && ext.LobbySection)
        .map((ext) => {
          const Section = ext.LobbySection!;
          return (
            <div key={ext.id} style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(0,0,0,0.04)', borderRadius: 4 }}>
              <strong style={{ fontSize: 12 }}>{ext.label}:</strong>
              <Section config={config} onChange={onChange} />
            </div>
          );
        })}
      <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 12 }}>
        Player count is taken from the seat list ({seats.length} seat{seats.length === 1 ? '' : 's'}).
        7 Wonders supports 3–7 players.
      </p>
    </div>
  );
}

// ===================================================================
// GameView
// ===================================================================

function GameView({
  state,
  localPlayerId,
  dispatch,
}: {
  state: SwState;
  localPlayerId: PlayerId | null;
  dispatch: (a: SwAction) => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [mode, setMode] = useState<'build' | 'wonder' | 'discard' | null>(null);

  useEffect(() => {
    setSelectedCardId(null);
    setMode(null);
  }, [state.age, state.ageRound, state.subPhase]);

  const me = state.players.find((p) => p.id === localPlayerId) ?? null;
  const opponents = state.players.filter((p) => p.id !== localPlayerId);
  const mySeatName = state.seats.find((s) => s.id === localPlayerId)?.name ?? 'You';

  if (state.phase === 'gameOver') {
    return <GameOver state={state} />;
  }

  if (state.subPhase === 'militaryEnd') {
    return (
      <div className="sw">
        <div className="sw-board">
          <MilitaryBanner state={state} />
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <button onClick={() => dispatch({ type: 'continue' })}>
              Continue to Age {Math.min(state.age + 1, 3)} →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expansion-owned subphase: defer rendering to its overlay.
  const expansionOverlay = (() => {
    for (const ext of getActiveExpansions(state.config)) {
      if (ext.ownsSubPhase?.(state.subPhase) && ext.GameOverlay) {
        const Overlay = ext.GameOverlay;
        return (
          <div className="sw">
            <div className="sw-board">
              <div className="sw-status">
                <span>Age {state.age}</span>
                <span>{state.subPhase}</span>
              </div>
              <div className="sw-opponents">
                {opponents.map((p) => (
                  <OpponentStrip key={p.id} player={p} state={state} />
                ))}
              </div>
              {me && (
                <>
                  <WonderArea player={me} />
                  <SelfTableau player={me} />
                </>
              )}
              <Overlay state={state} localPlayerId={localPlayerId} dispatch={dispatch} />
            </div>
          </div>
        );
      }
    }
    return null;
  })();
  if (expansionOverlay) return expansionOverlay;

  const submitted = me?.pendingPick != null;
  const submittedCount = state.players.filter((p) => p.pendingPick !== null).length;

  return (
    <div className="sw">
      <div className="sw-board">
        <div className="sw-status">
          <span>Age {state.age} · Pick {state.ageRound} / 6</span>
          <span>Pass: {state.passDirection === 'cw' ? '→ CW' : '← CCW'}</span>
          <span>Submitted: {submittedCount} / {state.players.length}</span>
        </div>

        <div className="sw-opponents">
          {opponents.map((p) => (
            <OpponentStrip key={p.id} player={p} state={state} />
          ))}
        </div>

        {me ? (
          <>
            <WonderArea player={me} />
            <SelfTableau player={me} />
            <HandPanel
              state={state}
              me={me}
              mySeatName={mySeatName}
              selectedCardId={selectedCardId}
              setSelectedCardId={setSelectedCardId}
              mode={mode}
              setMode={setMode}
              submitted={submitted}
              dispatch={dispatch}
            />
          </>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.7)' }}>Spectator view — no hand shown.</p>
        )}
      </div>
    </div>
  );
}

function OpponentStrip({ player, state }: { player: SwPlayer; state: SwState }) {
  const seat = state.seats.find((s) => s.id === player.id);
  const w = wonderById(player.wonderId);
  const submitted = player.pendingPick != null;
  const leaders = player.leaderTableau ?? [];
  return (
    <div className={`sw-player-strip ${submitted ? 'active' : ''}`}>
      <header>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: seat?.color ?? '#888', borderRadius: 2 }} />
          {seat?.name ?? player.id}
          {seat?.isAI && <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>(AI)</span>}
          {submitted && <span style={{ fontSize: 10, color: '#f4d268', marginLeft: 4 }}>✓</span>}
        </span>
        <span style={{ fontSize: 11, opacity: 0.85 }}>
          🪙 {player.coins} · ⚔ {shieldsFor(player)}
        </span>
      </header>
      <div style={{ fontSize: 11, opacity: 0.75 }}>
        {w.name} ({w.side}) · Stage {player.wonderStagesBuilt}/{w.stages.length}
        {leaders.length > 0 && <span> · 👤 {leaders.length}</span>}
      </div>
      <div className="sw-tableau">
        {player.tableau.map((c) => (
          <div
            key={c.id}
            className={`sw-tableau-card ${c.color}`}
            title={`${c.name} — ${cardEffectsText(c)}`}
          />
        ))}
        {leaders.map((c) => (
          <div
            key={c.id}
            className={`sw-tableau-card leader`}
            style={{ background: '#d8c598', color: '#3a2e15' }}
            title={`Leader: ${c.name}`}
          />
        ))}
      </div>
    </div>
  );
}

function SelfTableau({ player }: { player: SwPlayer }) {
  const byColor = {
    brown: player.tableau.filter((c) => c.color === 'brown'),
    gray: player.tableau.filter((c) => c.color === 'gray'),
    blue: player.tableau.filter((c) => c.color === 'blue'),
    yellow: player.tableau.filter((c) => c.color === 'yellow'),
    red: player.tableau.filter((c) => c.color === 'red'),
    green: player.tableau.filter((c) => c.color === 'green'),
    purple: player.tableau.filter((c) => c.color === 'purple'),
  };
  const leaders = player.leaderTableau ?? [];
  const totalCards = player.tableau.length + leaders.length;
  return (
    <div className="sw-hand-area">
      <h3>
        <span>Your tableau · {totalCards} card{totalCards === 1 ? '' : 's'}</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          🪙 {player.coins} · ⚔ {shieldsFor(player)}
        </span>
      </h3>
      {totalCards === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>You haven't built anything yet.</p>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(Object.keys(byColor) as (keyof typeof byColor)[]).map((color) => {
            const arr = byColor[color];
            if (arr.length === 0) return null;
            return (
              <div key={color}>
                <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'capitalize' }}>{color}</div>
                <div className="sw-tableau">
                  {arr.map((c) => (
                    <div
                      key={c.id}
                      className={`sw-tableau-card ${c.color}`}
                      title={`${c.name} — ${cardEffectsText(c)}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {leaders.length > 0 && (
            <div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Leaders</div>
              <div className="sw-tableau">
                {leaders.map((c) => (
                  <div
                    key={c.id}
                    className="sw-tableau-card leader"
                    style={{ background: '#d8c598', color: '#3a2e15' }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WonderArea({ player }: { player: SwPlayer }) {
  const w = wonderById(player.wonderId);
  return (
    <div className="sw-wonder">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{w.name} (side {w.side})</strong>
        <span style={{ fontSize: 12, opacity: 0.85 }}>
          Initial: {w.initialProduction.map((opts) => opts.join('/')).join(' · ')}
        </span>
      </div>
      <div className="sw-wonder-stages">
        {w.stages.map((stage, i) => {
          const built = i < player.wonderStagesBuilt;
          const next = i === player.wonderStagesBuilt;
          return (
            <div
              key={i}
              className={`sw-wonder-stage ${built ? 'built' : ''} ${next ? 'next' : ''}`}
              title={stage.text}
            >
              <div style={{ fontSize: 10, opacity: 0.8 }}>Stage {i + 1}</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>
                Cost: {stage.cost.resources?.join(' + ') || 'free'}
                {stage.cost.coins ? ` + ${stage.cost.coins}🪙` : ''}
              </div>
              <div style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>{stage.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HandPanel({
  state, me, mySeatName,
  selectedCardId, setSelectedCardId,
  mode, setMode,
  submitted, dispatch,
}: {
  state: SwState; me: SwPlayer; mySeatName: string;
  selectedCardId: number | null;
  setSelectedCardId: (n: number | null) => void;
  mode: 'build' | 'wonder' | 'discard' | null;
  setMode: (m: 'build' | 'wonder' | 'discard' | null) => void;
  submitted: boolean;
  dispatch: (a: SwAction) => void;
}) {
  const card = selectedCardId ? me.hand.find((c) => c.id === selectedCardId) ?? null : null;
  const wonder = wonderById(me.wonderId);
  const stageIdx = me.wonderStagesBuilt;
  const canBuildAnotherStage = stageIdx < wonder.stages.length;

  // For the build mode: compute payment plan automatically (cheapest).
  const buildPlan = useMemo(() => {
    if (!card || mode !== 'build') return null;
    return computeBuildPlan(state, me, card);
  }, [state, me, card, mode]);

  const wonderPlan = useMemo(() => {
    if (!card || mode !== 'wonder' || !canBuildAnotherStage) return null;
    return computeWonderPlan(state, me, stageIdx);
  }, [state, me, card, mode, stageIdx, canBuildAnotherStage]);

  function submit() {
    if (!card || submitted) return;
    if (mode === 'discard') {
      dispatch({ type: 'submitPick', playerId: me.id, pick: { kind: 'discard', cardId: card.id } });
      return;
    }
    if (mode === 'build' && buildPlan) {
      const pick: SwPendingPick = {
        kind: 'build', cardId: card.id,
        payment: { fromWest: buildPlan.fromWest, fromEast: buildPlan.fromEast, coins: 0 },
      };
      dispatch({ type: 'submitPick', playerId: me.id, pick });
      return;
    }
    if (mode === 'wonder' && wonderPlan) {
      const pick: SwPendingPick = {
        kind: 'wonder', cardId: card.id, stageIndex: stageIdx,
        payment: { fromWest: wonderPlan.fromWest, fromEast: wonderPlan.fromEast, coins: 0 },
      };
      dispatch({ type: 'submitPick', playerId: me.id, pick });
      return;
    }
  }

  const hasBilkis = (me.leaderTableau ?? []).some((c) => c.name === 'Bilkis');

  return (
    <div className="sw-hand-area">
      <h3>
        <span>{mySeatName}'s hand · {me.hand.length} card{me.hand.length === 1 ? '' : 's'}</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {submitted ? 'Submitted. Waiting for others…' : 'Click a card to inspect.'}
        </span>
      </h3>

      {hasBilkis && !submitted && (
        <div style={{ marginBottom: 8 }}>
          <BilkisButton state={state} me={me} dispatch={dispatch} />
          {me.transientResources && me.transientResources.length > 0 && (
            <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>
              Bilkis resource: {me.transientResources.join(', ')}
            </span>
          )}
        </div>
      )}

      <div className="sw-hand">
        {me.hand.map((c) => {
          const sel = c.id === selectedCardId;
          const dup = me.tableau.some((t) => t.name === c.name);
          return (
            <div
              key={c.id}
              className={`sw-card ${sel ? 'selected' : ''} ${submitted ? 'disabled' : ''}`}
              onClick={() => {
                if (submitted) return;
                setSelectedCardId(c.id);
                setMode(dup ? 'discard' : 'build');
              }}
            >
              <div className={`sw-card-color-bar`} style={{ background: cardColorHex(c.color) }} />
              <div className="sw-card-name">{c.name}</div>
              <div className="sw-card-cost">
                {c.cost.resources && c.cost.resources.length > 0
                  ? c.cost.resources.map((r, i) => <span key={i} className={`sw-resource-pill ${r}`}>{r}</span>)
                  : (c.cost.coins ? `${c.cost.coins} 🪙` : 'free')}
                {dup && <div style={{ color: '#c83e3a', marginTop: 4 }}>(duplicate)</div>}
              </div>
              <div className="sw-card-effect">{cardEffectsText(c)}</div>
            </div>
          );
        })}
        {me.hand.length === 0 && <p style={{ fontSize: 12 }}>No cards in hand.</p>}
      </div>

      {!submitted && card && (
        <div className="sw-pay-dialog">
          <h4>{card.name}</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <button
              className={mode === 'build' ? '' : 'secondary'}
              onClick={() => setMode('build')}
              disabled={me.tableau.some((t) => t.name === card.name)}
              title={me.tableau.some((t) => t.name === card.name) ? 'You already have one in your tableau.' : ''}
            >
              Build
            </button>
            <button
              className={mode === 'wonder' ? '' : 'secondary'}
              onClick={() => setMode('wonder')}
              disabled={!canBuildAnotherStage}
            >
              Bury under wonder (stage {stageIdx + 1})
            </button>
            <button
              className={mode === 'discard' ? '' : 'secondary'}
              onClick={() => setMode('discard')}
            >
              Discard for 3 🪙
            </button>
          </div>

          {mode === 'build' && (
            <BuildSummary card={card} plan={buildPlan} />
          )}
          {mode === 'wonder' && canBuildAnotherStage && (
            <WonderSummary
              stage={wonder.stages[stageIdx]}
              plan={wonderPlan}
            />
          )}
          {mode === 'discard' && (
            <p style={{ margin: '6px 0' }}>You'll discard <strong>{card.name}</strong> and gain 3 coins.</p>
          )}

          <div className="sw-actions">
            <button onClick={submit} disabled={!canSubmit(card, me, mode, buildPlan, wonderPlan)}>
              Submit
            </button>
            <button className="secondary" onClick={() => { setSelectedCardId(null); setMode(null); }}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function canSubmit(
  card: SwCard | null,
  me: SwPlayer,
  mode: 'build' | 'wonder' | 'discard' | null,
  buildPlan: ReturnType<typeof computeBuildPlan> | null,
  wonderPlan: ReturnType<typeof computeWonderPlan> | null,
): boolean {
  if (!card || !mode) return false;
  if (mode === 'discard') return true;
  if (mode === 'build') {
    if (me.tableau.some((t) => t.name === card.name)) return false;
    return buildPlan?.canBuild === true;
  }
  if (mode === 'wonder') {
    return wonderPlan?.canBuild === true;
  }
  return false;
}

function BuildSummary({ card, plan }: { card: SwCard; plan: ReturnType<typeof computeBuildPlan> | null }) {
  if (!plan) return <p>—</p>;
  if (plan.chainFree) {
    return <p>Free build — chain link from a previous card you own.</p>;
  }
  if (!plan.canBuild) {
    return <p style={{ color: '#ff9a9a' }}>Cannot build: {plan.reason}</p>;
  }
  return (
    <div>
      {card.cost.coins ? <div>Coin cost: {card.cost.coins} 🪙</div> : null}
      {plan.fromWest.length > 0 && (
        <div>
          From west: {plan.fromWest.map((r, i) => <span key={i} className={`sw-resource-pill ${r}`}>{r}</span>)}
          {' '}({plan.coinsToWest} 🪙)
        </div>
      )}
      {plan.fromEast.length > 0 && (
        <div>
          From east: {plan.fromEast.map((r, i) => <span key={i} className={`sw-resource-pill ${r}`}>{r}</span>)}
          {' '}({plan.coinsToEast} 🪙)
        </div>
      )}
      <div style={{ marginTop: 4 }}>Total: <strong>{plan.totalCoins} 🪙</strong></div>
    </div>
  );
}

function WonderSummary({ stage, plan }: { stage: { cost: { resources?: SwResource[]; coins?: number }; text: string }; plan: ReturnType<typeof computeWonderPlan> | null }) {
  if (!plan) return <p>—</p>;
  if (!plan.canBuild) {
    return <p style={{ color: '#ff9a9a' }}>Cannot build: {plan.reason}</p>;
  }
  return (
    <div>
      <div>{stage.text}</div>
      {stage.cost.coins ? <div>Coin cost: {stage.cost.coins} 🪙</div> : null}
      {plan.fromWest.length > 0 && (
        <div>From west: {plan.fromWest.map((r, i) => <span key={i} className={`sw-resource-pill ${r}`}>{r}</span>)} ({plan.coinsToWest} 🪙)</div>
      )}
      {plan.fromEast.length > 0 && (
        <div>From east: {plan.fromEast.map((r, i) => <span key={i} className={`sw-resource-pill ${r}`}>{r}</span>)} ({plan.coinsToEast} 🪙)</div>
      )}
      <div style={{ marginTop: 4 }}>Total: <strong>{plan.totalCoins} 🪙</strong></div>
    </div>
  );
}

function MilitaryBanner({ state }: { state: SwState }) {
  const summary = state.lastMilitaryResolution;
  if (!summary) return <p>Resolving military…</p>;
  return (
    <div className="sw-military-banner">
      <h3 style={{ margin: '0 0 8px' }}>Age {summary.age} — Military resolution</h3>
      <table className="sw-final-table">
        <thead>
          <tr><th>Player</th><th>vs West</th><th>vs East</th><th>Tokens this age</th></tr>
        </thead>
        <tbody>
          {summary.perPlayer.map((row) => (
            <tr key={row.playerId}>
              <td>{state.seats.find((s) => s.id === row.playerId)?.name ?? row.playerId}</td>
              <td>{row.vsWest}</td>
              <td>{row.vsEast}</td>
              <td>{row.tokenGained >= 0 ? `+${row.tokenGained}` : row.tokenGained}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameOver({ state }: { state: SwState }) {
  const breakdown = state.finalScoringBreakdown ?? [];
  const sorted = [...breakdown].sort((a, b) => b.total - a.total);
  const winnerId = sorted[0]?.playerId ?? null;
  // Collect extras columns from active expansions.
  const extraCategories = Array.from(new Set(
    getActiveExpansions(state.config).flatMap((e) => e.scoreCategories ?? [])
  ));
  return (
    <div className="sw">
      <div className="sw-board">
        <h2 style={{ margin: 0 }}>
          {winnerId
            ? `${state.seats.find((s) => s.id === winnerId)?.name ?? winnerId} wins!`
            : 'Match complete'}
        </h2>
        <table className="sw-final-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Military</th>
              <th>Treasury</th>
              <th>Wonder</th>
              <th>Civilian</th>
              <th>Commercial</th>
              <th>Guild</th>
              <th>Science</th>
              {extraCategories.map((c) => (
                <th key={c} style={{ textTransform: 'capitalize' }}>{c}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.playerId}>
                <td>{state.seats.find((s) => s.id === row.playerId)?.name ?? row.playerId}</td>
                <td>{row.military}</td>
                <td>{row.treasury}</td>
                <td>{row.wonder}</td>
                <td>{row.civilian}</td>
                <td>{row.commercial}</td>
                <td>{row.guild}</td>
                <td>{row.science}</td>
                {extraCategories.map((c) => (
                  <td key={c}>{row.extras?.[c] ?? 0}</td>
                ))}
                <td><strong>{row.total}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- helpers ----------

function cardEffectsText(c: SwCard): string {
  const parts: string[] = [];
  for (const eff of c.effects) {
    if (eff.kind === 'vp') parts.push(`+${eff.vp} VP`);
    else if (eff.kind === 'coins') parts.push(`+${eff.amount} 🪙`);
    else if (eff.kind === 'shields') parts.push(`+${eff.shields} ⚔`);
    else if (eff.kind === 'science') parts.push(`science: ${eff.symbol}`);
    else if (eff.kind === 'produce') {
      parts.push(eff.production.map((opts) => opts.join('/')).join(' · '));
    }
    else if (eff.kind === 'tradeDiscountRaw') parts.push(`raw discount (${eff.sides.join('/')})`);
    else if (eff.kind === 'tradeDiscountManufactured') parts.push(`manufactured discount (${eff.sides.join('/')})`);
    else if (eff.kind === 'endVp') {
      const what =
        eff.countWhat.kind === 'cardColor' ? `${eff.countWhat.color} cards`
        : eff.countWhat.kind === 'wonderStages' ? 'wonder stages'
        : 'defeat tokens';
      const scope = eff.from;
      const bits: string[] = [];
      if (eff.coinsPerOnPlay) bits.push(`+${eff.coinsPerOnPlay} 🪙 / ${what} (${scope}) on play`);
      if (eff.vpPer) bits.push(`+${eff.vpPer} VP / ${what} (${scope}) at end`);
      parts.push(bits.join(' · '));
    }
  }
  return parts.join(' · ') || '—';
}

function cardColorHex(c: SwCard['color']): string {
  switch (c) {
    case 'brown': return '#8b5e2a';
    case 'gray': return '#969aa8';
    case 'blue': return '#3d6da0';
    case 'yellow': return '#e7b13e';
    case 'red': return '#b73c3c';
    case 'green': return '#5fa552';
    case 'purple': return '#8d6cc0';
    case 'leader': return '#d8c598';
    case 'black': return '#2b2b2b';
    case 'orange': return '#d97a2e';
    case 'navy': return '#1f3a68';
  }
}

interface PlanResult {
  canBuild: boolean;
  chainFree: boolean;
  reason?: string;
  fromWest: SwResource[];
  fromEast: SwResource[];
  coinsToWest: number;
  coinsToEast: number;
  totalCoins: number;
}

function computeBuildPlan(state: SwState, me: SwPlayer, card: SwCard): PlanResult {
  // Chain free build.
  if (canChainBuild(me, card)) {
    return { canBuild: true, chainFree: true, fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: 0 };
  }
  const effCost = effectiveCostFor(state, me, { kind: 'card', card });
  const sf = shortfall(state, me, effCost);
  if (sf.selfCovers) {
    const total = effCost.coins ?? 0;
    if (me.coins < total) {
      return { canBuild: false, chainFree: false, reason: 'Not enough coins.', fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: total };
    }
    return { canBuild: true, chainFree: false, fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: total };
  }
  const plan = suggestCheapestPurchase(state, me, sf.stillNeed);
  if (!plan) {
    return { canBuild: false, chainFree: false, reason: 'Neighbors cannot supply needed resources.', fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: 0 };
  }
  const baseCoins = effCost.coins ?? 0;
  const total = baseCoins + plan.coins;
  if (me.coins < total) {
    return { canBuild: false, chainFree: false, reason: 'Not enough coins.', fromWest: plan.fromWest, fromEast: plan.fromEast, coinsToWest: 0, coinsToEast: 0, totalCoins: total };
  }
  // Validate via reducer logic.
  const v = validatePayment(state, me, effCost, { fromWest: plan.fromWest, fromEast: plan.fromEast, coins: 0 });
  if (!v.ok) {
    return { canBuild: false, chainFree: false, reason: v.error, fromWest: plan.fromWest, fromEast: plan.fromEast, coinsToWest: 0, coinsToEast: 0, totalCoins: total };
  }
  return {
    canBuild: true, chainFree: false,
    fromWest: plan.fromWest, fromEast: plan.fromEast,
    coinsToWest: v.toWest, coinsToEast: v.toEast,
    totalCoins: v.totalCoins,
  };
}

function computeWonderPlan(state: SwState, me: SwPlayer, stageIdx: number): PlanResult {
  const wonder = wonderById(me.wonderId);
  if (stageIdx >= wonder.stages.length) {
    return { canBuild: false, chainFree: false, reason: 'No more stages.', fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: 0 };
  }
  const stage = wonder.stages[stageIdx];
  const cost = effectiveCostFor(state, me, { kind: 'wonderStage', stageIndex: stageIdx, stage });
  const sf = shortfall(state, me, cost);
  if (sf.selfCovers) {
    const total = cost.coins ?? 0;
    if (me.coins < total) {
      return { canBuild: false, chainFree: false, reason: 'Not enough coins.', fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: total };
    }
    return { canBuild: true, chainFree: false, fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: total };
  }
  const plan = suggestCheapestPurchase(state, me, sf.stillNeed);
  if (!plan) {
    return { canBuild: false, chainFree: false, reason: 'Neighbors cannot supply needed resources.', fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: 0 };
  }
  const baseCoins = cost.coins ?? 0;
  const total = baseCoins + plan.coins;
  if (me.coins < total) {
    return { canBuild: false, chainFree: false, reason: 'Not enough coins.', fromWest: plan.fromWest, fromEast: plan.fromEast, coinsToWest: 0, coinsToEast: 0, totalCoins: total };
  }
  const v = validatePayment(state, me, cost, { fromWest: plan.fromWest, fromEast: plan.fromEast, coins: 0 });
  if (!v.ok) {
    return { canBuild: false, chainFree: false, reason: v.error, fromWest: plan.fromWest, fromEast: plan.fromEast, coinsToWest: 0, coinsToEast: 0, totalCoins: total };
  }
  return {
    canBuild: true, chainFree: false,
    fromWest: plan.fromWest, fromEast: plan.fromEast,
    coinsToWest: v.toWest, coinsToEast: v.toEast,
    totalCoins: v.totalCoins,
  };
}

void productionFor;

export const bundle: GameUiBundle<SwState, SwAction, SwConfig> = {
  LobbyConfig,
  GameView,
};
