// 7 Wonders UI — LobbyConfig + GameView.

import { Suspense, useEffect, useMemo, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SwState, SwAction, SwConfig, SwExpansionId,
  SwCard, SwCardColor, SwPlayer, SwPendingPick, SwResource, SwScience, SwWonderStage,
} from './types';
import { WONDERS, wonderById, wondersByName } from './wonders';
import {
  canChainBuild, shortfall, suggestCheapestPurchase,
  validatePayment, shieldsFor, productionFor, effectiveCostFor,
} from './resources';
import { getActiveExpansions, getAllExpansions } from './expansions/registry';
import { BilkisButton } from './expansions/leaders/ui';
import {
  AGE_HEX, AgeIcon, ArrowIcon, ChainIcon, CoinIcon, ColorChip, DebtIcon, DiplomacyIcon, MilitaryToken,
  ResourceIcon, ScienceIcon, ShieldIcon, VpIcon, WonderStageIcon,
} from './art';
import {
  CardFace, CostIcons, EffectIcons, TableauColumns, WonderBoard, WonderMini, type CardStatus,
} from './Card';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
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
      <h4 style={{ margin: '0 0 4px' }}>Wonders</h4>
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
                {current && <WonderMini wonder={wonderById(current)} built={0} />}
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
                title="7 Wonders"
                subtitle="Draft your way through 3 Ages. Build a civilization."
                accent="linear-gradient(135deg, #8b6f3a 0%, #d4a85a 100%)"
              />
              <h3>Each tick</h3>
              <RulesGrid cols={3}>
                <RulesTile icon="🏛️" label="Build" hint="Pay the card's cost from your production + neighbor purchases. Chain-build for free if pre-req is met." accent="#9ed27c" />
                <RulesTile icon="⛏️" label="Bury" hint="Slip it under your next wonder stage. Pay the stage's cost; gain its effect." accent="#6aa0ff" />
                <RulesTile icon="🪙" label="Discard" hint="Discard for 3 coins. Always legal." accent="#f4d268" />
              </RulesGrid>
              <h3>Hand rotation</h3>
              <p>
                After every simultaneous pick, hands rotate one seat. Ages I &amp;
                III pass <strong>clockwise</strong>, Age II passes
                <strong> counter-clockwise</strong>. Each Age is 6 picks; the 7th
                card of each hand is discarded (unless Halicarnassus / Solomon
                can recover it).
              </p>
            </>
          ),
        },
        {
          title: 'Military &amp; trade',
          body: (
            <>
              <h3>End-of-age military</h3>
              <p>Shields are compared with BOTH neighbors. Winner gains a victory token; loser gains a −1 defeat token.</p>
              <table className="tight">
                <thead><tr><th>Age</th><th className="num">Win</th><th className="num">Loss</th></tr></thead>
                <tbody>
                  <tr><td>Age I</td><td className="num">+1</td><td className="num">−1</td></tr>
                  <tr><td>Age II</td><td className="num">+3</td><td className="num">−1</td></tr>
                  <tr><td>Age III</td><td className="num">+5</td><td className="num">−1</td></tr>
                </tbody>
              </table>
              <h3>Resource trading</h3>
              <RulesGrid cols={2}>
                <RulesTile icon="🪙" label="2 coins / unit" hint="Buy a missing resource from either neighbor. Coins go to that neighbor." accent="#f4d268" />
                <RulesTile icon="🛒" label="1 coin / unit" hint="If you've built the matching trade-discount card (e.g. East/West Trading Post)." accent="#9ed27c" />
              </RulesGrid>
            </>
          ),
        },
        {
          title: 'Scoring',
          body: (
            <>
              <h3>Final scoring (after Age III)</h3>
              <RulesGrid cols={2}>
                <RulesTile icon="⚔️" label="Military" hint="Sum of victory + defeat tokens." accent="#ff7070" />
                <RulesTile icon="🪙" label="Coins" hint="1 VP per 3 coins." accent="#f4d268" />
                <RulesTile icon="🏛️" label="Wonder stages" hint="Face value of every built stage." accent="#c9a47c" />
                <RulesTile icon="📘" label="Civilian (blue)" hint="Face value VP." accent="#6aa0ff" />
                <RulesTile icon="🛍️" label="Commercial (yellow)" hint="End-of-game effects only." accent="#e8a04a" />
                <RulesTile icon="🎭" label="Guilds (purple)" hint="End-of-game effects (lots of conditional VP)." accent="#b984c9" />
                <RulesTile icon="🔬" label="Science (green)" hint="t² + c² + g² + 7 · min(t,c,g). Wild symbols pick highest." accent="#9ed27c" />
              </RulesGrid>
            </>
          ),
        },
        {
          title: 'Expansions',
          body: (
            <>
              <RulesGrid cols={2}>
                <RulesTile icon="👑" label="Leaders" hint="Draft 4 leaders pre-Age I; play one per Age." accent="#b984c9" />
                <RulesTile icon="🏙️" label="Cities" hint="+9 black cards per Age. Debt + diplomacy mechanics." accent="#2a2a36" />
                <RulesTile icon="🗼" label="Babel" hint="+5 orange cards per Age. 3 Babel scoring rules. Central Tower NOT modeled." accent="#e8a04a" />
                <RulesTile icon="⚓" label="Armada" hint="+5 navy cards per Age. Naval combat NOT modeled." accent="#1c5f9e" />
                <RulesTile icon="🏗️" label="Edifice" hint="3 cooperative project tiles. Build a wonder stage in the matching Age to contribute." accent="#c2c8cc" />
              </RulesGrid>
              <h3>Deck sizing</h3>
              <p className="muted">
                Each Age deals <strong>playerCount × 7</strong> cards. Age III is
                base cards + guilds (playerCount + 2 guilds shown). Expansion
                cards are mixed into each Age's pool when active.
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

const ROMAN = ['', 'I', 'II', 'III'] as const;

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
  const mySeatName = state.seats.find((s) => s.id === localPlayerId)?.name ?? 'You';

  if (state.phase === 'gameOver') {
    return <GameOver state={state} />;
  }

  if (state.subPhase === 'militaryEnd') {
    return (
      <div className="sw">
        <div className="sw-board">
          <MilitaryBanner state={state} />
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => dispatch({ type: 'continue' })}>
              {state.age < 3 ? `Continue to Age ${ROMAN[state.age + 1]} →` : 'Final scoring →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const submittedCount = state.players.filter((p) => p.pendingPick !== null).length;
  const header = (
    <>
      <StatusBar state={state} submittedCount={submittedCount} />
      <Opponents state={state} localPlayerId={localPlayerId} />
      {me && (
        <div className="sw-self">
          <WonderBoard wonder={wonderById(me.wonderId)} built={me.wonderStagesBuilt} highlightNext />
          <SelfCity player={me} />
        </div>
      )}
    </>
  );

  // Expansion-owned subphase: defer the bottom panel to its overlay.
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.ownsSubPhase?.(state.subPhase) && ext.GameOverlay) {
      const Overlay = ext.GameOverlay;
      return (
        <div className="sw">
          <div className="sw-board">
            {header}
            {/* Overlays may be lazy (their art ships with this chunk, not the module). */}
            <Suspense fallback={null}>
              <Overlay state={state} localPlayerId={localPlayerId} dispatch={dispatch} />
            </Suspense>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="sw">
      <div className="sw-board">
        {header}
        {me ? (
          <HandPanel
            state={state}
            me={me}
            mySeatName={mySeatName}
            selectedCardId={selectedCardId}
            setSelectedCardId={setSelectedCardId}
            mode={mode}
            setMode={setMode}
            submitted={me.pendingPick != null}
            dispatch={dispatch}
          />
        ) : (
          <p className="sw-empty">Spectator view — no hand shown.</p>
        )}
      </div>
    </div>
  );
}

function StatusBar({ state, submittedCount }: { state: SwState; submittedCount: number }) {
  const picking = state.subPhase === 'picking';
  return (
    <div className="sw-status">
      <span className="sw-pill sw-pill-age" style={{ ['--sw-age' as string]: AGE_HEX[state.age] }}>
        <AgeIcon age={state.age} size={22} />
        Age {ROMAN[state.age]}{picking && <> · pick {state.ageRound} of 6</>}
      </span>
      {picking && (
        <span className="sw-pill" title="Hands pass this way after every pick">
          <span className="sw-pass">{state.passDirection === 'cw' ? '↻' : '↺'}</span>
          Pass {state.passDirection === 'cw' ? 'clockwise' : 'counter-clockwise'}
        </span>
      )}
      {picking && <span className="sw-pill">Picked {submittedCount} / {state.players.length}</span>}
      <span className="sw-pill" title="Discarded cards">Discard pile · {state.discard.length}</span>
    </div>
  );
}

/** Opponents in table order, from the west neighbour round to the east one. */
function Opponents({ state, localPlayerId }: { state: SwState; localPlayerId: PlayerId | null }) {
  const n = state.players.length;
  const idx = state.players.findIndex((p) => p.id === localPlayerId);
  const order: Array<{ player: SwPlayer; side: 'west' | 'east' | null }> = idx < 0
    ? state.players.map((player) => ({ player, side: null }))
    : Array.from({ length: n - 1 }, (_, k) => ({
      player: state.players[(idx - (k + 1) + n) % n],
      side: k === 0 ? 'west' as const : k === n - 2 ? 'east' as const : null,
    }));
  return (
    <div className="sw-opponents">
      {order.map(({ player, side }) => <OpponentStrip key={player.id} player={player} side={side} state={state} />)}
    </div>
  );
}

function OpponentStrip({ player, side, state }: { player: SwPlayer; side: 'west' | 'east' | null; state: SwState }) {
  const seat = state.seats.find((s) => s.id === player.id);
  const submitted = player.pendingPick != null;
  const cards = [...player.tableau, ...(player.leaderTableau ?? [])];
  return (
    <div className={`sw-opp ${side ? `sw-opp-${side}` : ''} ${submitted ? 'done' : ''}`}>
      <header>
        <span className="sw-dot" style={{ background: seat?.color ?? '#888' }} />
        <strong>{seat?.name ?? player.id}</strong>
        {seat?.isAI && <span className="sw-tag">AI</span>}
        {side === 'west' && <span className="sw-tag sw-tag-side"><ArrowIcon dir="west" size={10} light /> West neighbour</span>}
        {side === 'east' && <span className="sw-tag sw-tag-side">East neighbour <ArrowIcon dir="east" size={10} light /></span>}
        {state.subPhase === 'picking' && <span className={`sw-opp-state ${submitted ? 'on' : ''}`}>{submitted ? '✓ picked' : 'choosing…'}</span>}
      </header>
      <div className="sw-opp-row">
        <WonderMini wonder={wonderById(player.wonderId)} built={player.wonderStagesBuilt} />
        <CityStats player={player} />
      </div>
      {cards.length > 0 ? <TableauColumns cards={cards} size="sm" /> : <p className="sw-empty">No buildings yet.</p>}
    </div>
  );
}

function scienceCounts(player: SwPlayer): Record<SwScience, number> {
  const out: Record<SwScience, number> = { compass: 0, gear: 0, tablet: 0 };
  for (const c of [...player.tableau, ...(player.leaderTableau ?? [])]) {
    for (const e of c.effects) if (e.kind === 'science') out[e.symbol]++;
  }
  return out;
}

function CityStats({ player }: { player: SwPlayer }) {
  const sci = scienceCounts(player);
  return (
    <div className="sw-stats">
      <span className="sw-stat" title="Coins"><CoinIcon size={18} />{player.coins}</span>
      <span className="sw-stat" title="Shields"><ShieldIcon size={18} />{shieldsFor(player)}</span>
      {(Object.keys(sci) as SwScience[]).filter((s) => sci[s] > 0).map((s) => (
        <span key={s} className="sw-stat"><ScienceIcon s={s} size={18} />{sci[s]}</span>
      ))}
      {player.debtTokens ? <span className="sw-stat"><DebtIcon size={18} />{player.debtTokens}</span> : null}
      {player.diplomacyTokens ? <span className="sw-stat"><DiplomacyIcon size={18} />{player.diplomacyTokens}</span> : null}
      {player.militaryTokens.length > 0 && (
        <span className="sw-stat sw-tokens" title="Military tokens">
          {player.militaryTokens.map((t, i) => <MilitaryToken key={i} value={t} size={17} />)}
        </span>
      )}
    </div>
  );
}

function SelfCity({ player }: { player: SwPlayer }) {
  const cards = [...player.tableau, ...(player.leaderTableau ?? [])];
  return (
    <div className="sw-panel sw-self-city">
      <h3>
        <span>Your city · {cards.length} card{cards.length === 1 ? '' : 's'}</span>
        <CityStats player={player} />
      </h3>
      {cards.length === 0
        ? <p className="sw-empty">You haven't built anything yet. Built cards tuck in here by colour.</p>
        : <TableauColumns cards={cards} size="md" />}
    </div>
  );
}

function cardStatus(state: SwState, me: SwPlayer, card: SwCard): CardStatus {
  if (me.tableau.some((t) => t.name === card.name)) return { kind: 'owned' };
  const plan = computeBuildPlan(state, me, card);
  if (plan.chainFree) return { kind: 'chain' };
  if (!plan.canBuild) return { kind: 'blocked', reason: plan.reason ?? "Can't build" };
  return plan.totalCoins > 0 ? { kind: 'pay', coins: plan.totalCoins } : { kind: 'free' };
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
  const pending = me.pendingPick;

  // For the build mode: compute payment plan automatically (cheapest).
  const buildPlan = useMemo(() => {
    if (!card || mode !== 'build') return null;
    return computeBuildPlan(state, me, card);
  }, [state, me, card, mode]);

  const wonderPlan = useMemo(() => {
    if (!card || mode !== 'wonder' || !canBuildAnotherStage) return null;
    return computeWonderPlan(state, me, stageIdx);
  }, [state, me, card, mode, stageIdx, canBuildAnotherStage]);

  const statuses = useMemo(() => new Map(me.hand.map((c) => [c.id, cardStatus(state, me, c)])), [state, me]);

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
  const dup = card ? me.tableau.some((t) => t.name === card.name) : false;
  const pendingLabel = pending
    ? pending.kind === 'build' ? 'build' : pending.kind === 'wonder' ? `bury under stage ${pending.stageIndex + 1}` : 'sell for 3 coins'
    : '';

  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span>{mySeatName}'s hand · {me.hand.length} card{me.hand.length === 1 ? '' : 's'}</span>
        <span className="sw-hint">
          {submitted ? `Locked in: ${pendingLabel}. Waiting for the others…` : 'Pick a card, then build it, bury it under your wonder or sell it.'}
        </span>
      </h3>

      {hasBilkis && !submitted && (
        <div style={{ marginBottom: 8 }}>
          <BilkisButton state={state} me={me} dispatch={dispatch} />
          {me.transientResources && me.transientResources.length > 0 && (
            <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.8 }}>
              Bilkis resource: {me.transientResources.map((r, i) => <ResourceIcon key={i} r={r} size={14} />)}
            </span>
          )}
        </div>
      )}

      <div className="sw-hand">
        {me.hand.map((c) => (
          <CardFace
            key={c.id}
            card={c}
            selected={c.id === selectedCardId || pending?.cardId === c.id}
            disabled={submitted && pending?.cardId !== c.id}
            status={statuses.get(c.id)}
            onClick={submitted ? undefined : () => {
              setSelectedCardId(c.id);
              const st = statuses.get(c.id);
              setMode(st?.kind === 'owned' || st?.kind === 'blocked' ? 'discard' : 'build');
            }}
          />
        ))}
        {me.hand.length === 0 && <p className="sw-empty">No cards in hand.</p>}
      </div>

      {!submitted && card && (
        <div className="sw-pay-dialog">
          <div className="sw-choices">
            <button
              className={`sw-choice ${mode === 'build' ? 'on' : ''}`}
              onClick={() => setMode('build')}
              disabled={dup}
              title={dup ? 'You already have one in your city.' : ''}
            >
              <span className="sw-choice-icon"><EffectIcons effects={card.effects} name={card.name} size={16} /></span>
              Build {card.name}
            </button>
            <button
              className={`sw-choice ${mode === 'wonder' ? 'on' : ''}`}
              onClick={() => setMode('wonder')}
              disabled={!canBuildAnotherStage}
              title={canBuildAnotherStage ? '' : 'Your wonder is complete.'}
            >
              <span className="sw-choice-icon"><WonderStageIcon size={18} /></span>
              {canBuildAnotherStage ? `Bury under stage ${stageIdx + 1}` : 'Wonder complete'}
            </button>
            <button className={`sw-choice ${mode === 'discard' ? 'on' : ''}`} onClick={() => setMode('discard')}>
              <span className="sw-choice-icon"><CoinIcon n={3} size={18} /></span>
              Sell for 3 coins
            </button>
          </div>

          <div className="sw-plan">
            {mode === 'build' && <BuildSummary card={card} plan={buildPlan} />}
            {mode === 'wonder' && canBuildAnotherStage && <WonderSummary stage={wonder.stages[stageIdx]} plan={wonderPlan} />}
            {mode === 'discard' && <p className="sw-plan-row">Discard <strong>{card.name}</strong> face down and take <CoinIcon n={3} size={16} /> from the bank.</p>}
          </div>

          <div className="sw-actions">
            <button onClick={submit} disabled={!canSubmit(card, me, mode, buildPlan, wonderPlan)}>
              Confirm
            </button>
            <button className="secondary" onClick={() => { setSelectedCardId(null); setMode(null); }}>
              Cancel
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

function Purchases({ plan }: { plan: PlanResult }) {
  return (
    <>
      {plan.fromWest.length > 0 && (
        <div className="sw-plan-row">
          <ArrowIcon dir="west" size={14} light /> Buy from west:
          {plan.fromWest.map((r, i) => <ResourceIcon key={i} r={r} size={16} />)}
          <CoinIcon n={plan.coinsToWest} size={16} />
        </div>
      )}
      {plan.fromEast.length > 0 && (
        <div className="sw-plan-row">
          Buy from east:
          {plan.fromEast.map((r, i) => <ResourceIcon key={i} r={r} size={16} />)}
          <CoinIcon n={plan.coinsToEast} size={16} /> <ArrowIcon dir="east" size={14} light />
        </div>
      )}
    </>
  );
}

function BuildSummary({ card, plan }: { card: SwCard; plan: PlanResult | null }) {
  if (!plan) return <p>—</p>;
  if (plan.chainFree) {
    return <p className="sw-plan-row"><ChainIcon size={16} /> Free build — you own {card.chainFrom?.join(' or ') ?? 'its chain card'}.</p>;
  }
  if (!plan.canBuild) {
    return <p className="sw-plan-bad">Can't build: {plan.reason}</p>;
  }
  return (
    <div>
      <div className="sw-plan-row">Cost: <CostIcons cost={card.cost} size={16} free /></div>
      <Purchases plan={plan} />
      <div className="sw-plan-row">Total to pay: <CoinIcon n={plan.totalCoins} size={18} /></div>
    </div>
  );
}

function WonderSummary({ stage, plan }: { stage: SwWonderStage; plan: PlanResult | null }) {
  if (!plan) return <p>—</p>;
  return (
    <div>
      <div className="sw-plan-row">
        Stage: <CostIcons cost={stage.cost} size={16} /> <span className="sw-fx-arrow">→</span>
        {stage.effects.length > 0 ? <EffectIcons effects={stage.effects} size={18} /> : null}
        <span className="sw-plan-note">{stage.text}</span>
      </div>
      {plan.canBuild
        ? (
          <>
            <Purchases plan={plan} />
            <div className="sw-plan-row">Total to pay: <CoinIcon n={plan.totalCoins} size={18} /></div>
          </>
        )
        : <p className="sw-plan-bad">Can't build: {plan.reason}</p>}
    </div>
  );
}

function ResultCell({ result, age }: { result: 'win' | 'loss' | 'draw'; age: 1 | 2 | 3 }) {
  if (result === 'win') return <MilitaryToken value={age === 1 ? 1 : age === 2 ? 3 : 5} size={22} />;
  if (result === 'loss') return <MilitaryToken value={-1} size={22} />;
  return <span className="sw-muted">draw</span>;
}

function MilitaryBanner({ state }: { state: SwState }) {
  const summary = state.lastMilitaryResolution;
  if (!summary) return <p>Resolving military…</p>;
  return (
    <div className="sw-panel sw-military-banner">
      <h3><span className="sw-h-icon"><ShieldIcon size={22} /> Age {ROMAN[summary.age]} — military conflicts</span></h3>
      <p className="sw-hint">Every city compares shields with both neighbours: the stronger side takes a victory token, the weaker one a defeat token.</p>
      <table className="sw-table">
        <thead>
          <tr><th>City</th><th><ShieldIcon size={16} /></th><th>vs west</th><th>vs east</th><th>This age</th></tr>
        </thead>
        <tbody>
          {summary.perPlayer.map((row) => {
            const p = state.players.find((x) => x.id === row.playerId);
            const seat = state.seats.find((s) => s.id === row.playerId);
            return (
              <tr key={row.playerId}>
                <td><span className="sw-dot" style={{ background: seat?.color ?? '#888' }} /> {seat?.name ?? row.playerId}</td>
                <td>{p ? shieldsFor(p) : '—'}</td>
                <td><ResultCell result={row.vsWest} age={summary.age} /></td>
                <td><ResultCell result={row.vsEast} age={summary.age} /></td>
                <td className={row.tokenGained > 0 ? 'sw-good' : row.tokenGained < 0 ? 'sw-bad' : ''}>
                  {row.tokenGained > 0 ? `+${row.tokenGained}` : row.tokenGained}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const EXTRA_ICON: Record<string, SwCardColor> = { leaders: 'leader', cities: 'black', babel: 'orange', armada: 'navy' };

function GameOver({ state }: { state: SwState }) {
  const breakdown = state.finalScoringBreakdown ?? [];
  const sorted = [...breakdown].sort((a, b) => b.total - a.total);
  const winnerId = sorted[0]?.playerId ?? null;
  const winnerSeat = state.seats.find((s) => s.id === winnerId);
  const winner = state.players.find((p) => p.id === winnerId);
  // Collect extras columns from active expansions.
  const extraCategories = Array.from(new Set(
    getActiveExpansions(state.config).flatMap((e) => e.scoreCategories ?? [])
  ));
  return (
    <div className="sw">
      <div className="sw-board">
        <div className="sw-panel sw-gameover">
          <div className="sw-gameover-title">
            <VpIcon size={46} />
            <div>
              <h2>{winnerSeat ? `${winnerSeat.name} wins!` : 'Match complete'}</h2>
              {sorted[0] && <p className="sw-hint">{sorted[0].total} victory points{winner && <> · {wonderById(winner.wonderId).name}</>}</p>}
            </div>
          </div>
          <table className="sw-table sw-final-table">
            <thead>
              <tr>
                <th>City</th>
                <th title="Military"><ShieldIcon size={18} /></th>
                <th title="Treasury (1 VP per 3 coins)"><CoinIcon size={18} /></th>
                <th title="Wonder"><WonderStageIcon size={18} /></th>
                <th title="Civilian"><ColorChip color="blue" size={18} /></th>
                <th title="Commercial"><ColorChip color="yellow" size={18} /></th>
                <th title="Guilds"><ColorChip color="purple" size={18} /></th>
                <th title="Science"><ScienceIcon s="gear" size={18} /></th>
                {extraCategories.map((c) => (
                  <th key={c} title={c}>{EXTRA_ICON[c] ? <ColorChip color={EXTRA_ICON[c]} size={18} /> : <span style={{ textTransform: 'capitalize' }}>{c}</span>}</th>
                ))}
                <th title="Total"><VpIcon size={20} /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const seat = state.seats.find((s) => s.id === row.playerId);
                return (
                  <tr key={row.playerId} className={row.playerId === winnerId ? 'sw-winner' : ''}>
                    <td><span className="sw-dot" style={{ background: seat?.color ?? '#888' }} /> {seat?.name ?? row.playerId}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="sw-opponents">
          {sorted.map((row) => {
            const p = state.players.find((x) => x.id === row.playerId);
            const seat = state.seats.find((s) => s.id === row.playerId);
            if (!p) return null;
            return (
              <div key={row.playerId} className="sw-opp">
                <header><span className="sw-dot" style={{ background: seat?.color ?? '#888' }} /><strong>{seat?.name ?? p.id}</strong></header>
                <div className="sw-opp-row">
                  <WonderMini wonder={wonderById(p.wonderId)} built={p.wonderStagesBuilt} />
                  <CityStats player={p} />
                </div>
                <TableauColumns cards={[...p.tableau, ...(p.leaderTableau ?? [])]} size="sm" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------

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
  Rules,
};
