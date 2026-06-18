// 7 Wonders Duel — UI bundle (LobbyConfig + GameView).
//
// Layout:
//   - Top bar: opponent's tableau + military pawn indicator + endgame status.
//   - Center: pyramid view (rows of cards, available ones highlighted).
//   - Bottom: own tableau + wonders + actions.
//   - Side: progress token offer.
//
// Modals: wonder-draft picker, progress-token picker, wonder-construct picker.

import { useMemo, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  DuelAction, DuelCard, DuelConfig, DuelPlayer, DuelResource, DuelState,
} from './types';
import { isSlotAvailable } from './pyramid';
import { WONDERS, wonderById } from './wonders';
import { ALL_PROGRESS_TOKENS, progressTokenById } from './progress';
import {
  canChainBuild, effectiveCostForCard, effectiveCostForWonder,
  productionCanSupply, productionFor, purchaseCost,
} from './resources';
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
        Wonder draft + progress tokens are randomized per match from the seed.
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
                <RulesTile icon="🏛️" label="Civilian" hint="Most VP after Age III ends." accent="#6aa0ff" />
                <RulesTile icon="⚔️" label="Military Supremacy" hint="Push the military pawn to ±9 (opponent's capital)." accent="#ff7070" />
                <RulesTile icon="🔬" label="Science Supremacy" hint="Collect 6 distinct science symbols (of 7). Instant win." accent="#9ed27c" />
              </RulesGrid>
              <h3>Each turn</h3>
              <RulesGrid cols={3}>
                <RulesTile icon="🃏" label="Take from pyramid" hint="Any face-up card with no covers above it." accent="#f4d268" />
                <RulesTile icon="🏗️" label="Build / Bury / Discard" hint="Same options as base 7W." accent="#b984c9" />
                <RulesTile icon="⚡" label="Science triggers" hint="A second matching symbol grants a Progress Token." accent="#67d4d4" />
              </RulesGrid>
            </>
          ),
        },
        {
          title: 'Military &amp; trade',
          body: (
            <>
              <h3>Military pawn</h3>
              <p>
                The pawn lives at 0 and slides toward the opponent's capital with
                each shield played. Sliding past key markers drains coins from
                the side being pushed.
              </p>
              <table className="tight">
                <thead><tr><th>Pawn at</th><th>Effect</th></tr></thead>
                <tbody>
                  <tr><td>±3</td><td>Opponent loses 2 coins</td></tr>
                  <tr><td>±6</td><td>Opponent loses 5 coins</td></tr>
                  <tr><td>±9</td><td><strong>Military Supremacy win</strong></td></tr>
                </tbody>
              </table>
              <h3>Resource purchase</h3>
              <p>
                Cost = <code>2 + opponent's fixed production of that resource</code>,
                flattened to 1 if you've built the matching trade-discount card.
                With Economy, opponent gains your trade coins; without it, coins
                go to the bank.
              </p>
            </>
          ),
        },
        {
          title: 'Wonder draft',
          body: (
            <>
              <p>
                Pre-Age I, players alternate picking from 8 randomly drawn
                wonders. Pick order is <code>[0,1,1,0,0,1,1,0]</code> — each
                ending with 4 wonders.
              </p>
              <RulesTile icon="🏛️" label="7 total built" hint="Across both players. Once the 7th is built, all unbuilt wonders are discarded." accent="#d4a85a" />
            </>
          ),
        },
        {
          title: 'Progress Tokens',
          body: (
            <>
              <p>5 of 10 are drawn deterministically at match start.</p>
              <table className="tight">
                <thead><tr><th>Token</th><th>Effect</th></tr></thead>
                <tbody>
                  <tr><td>Agriculture</td><td>+4 coins now, +4 VP at end</td></tr>
                  <tr><td>Architecture</td><td>Wonders cost 2 fewer resources</td></tr>
                  <tr><td>Economy</td><td>Opponent's trade coins flow to you</td></tr>
                  <tr><td>Law</td><td>Wild +1 toward science supremacy</td></tr>
                  <tr><td>Masonry</td><td>Civilian (blue) cards cost 2 fewer resources</td></tr>
                  <tr><td>Mathematics</td><td>+3 VP per progress token at end</td></tr>
                  <tr><td>Philosophy</td><td>+7 VP at end</td></tr>
                  <tr><td>Strategy</td><td>+1 shield per red card</td></tr>
                  <tr><td>Theology <span className="muted">(NOT modeled)</span></td><td>Wonder builds grant an extra turn</td></tr>
                  <tr><td>Urbanism</td><td>+6 coins now; +4 coins per chain link</td></tr>
                </tbody>
              </table>
              <p className="muted">
                Wonder-only effects <code>extraTurn</code> (Hanging Gardens,
                Piraeus, Sphinx, Appian Way) and <code>pickFromDiscard</code>
                (Mausoleum, Great Library) recognize numerical components but
                skip the interactive sub-phase in v1.
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

function GameView({
  state, localPlayerId, dispatch,
}: {
  state: DuelState; localPlayerId: PlayerId | null; dispatch: (a: DuelAction) => void;
}) {
  const localSeatIdx: 0 | 1 | null = useMemo(() => {
    if (!localPlayerId) return null;
    if (state.players[0].id === localPlayerId) return 0;
    if (state.players[1].id === localPlayerId) return 1;
    return null;
  }, [state.players, localPlayerId]);

  // "Active view" — in hot-seat, this is the currently-active seat. In online, the local seat.
  const viewerSeatIdx: 0 | 1 = localSeatIdx ?? state.activeSeatIdx;
  const me = state.players[viewerSeatIdx];
  const opp = state.players[(1 - viewerSeatIdx) as 0 | 1];

  const isMyTurn = state.activeSeatIdx === viewerSeatIdx;

  if (state.phase === 'gameOver') {
    return <GameOver state={state} />;
  }

  return (
    <div className="swd-game">
      <OpponentStrip player={opp} state={state} />
      <MilitaryTrack state={state} viewerSeatIdx={viewerSeatIdx} />
      <main className="swd-center">
        {state.subPhase === 'wonderDraft' && (
          <WonderDraftPanel state={state} viewerSeatIdx={viewerSeatIdx} isMyTurn={isMyTurn} dispatch={dispatch} />
        )}
        {state.subPhase === 'turn' && (
          <PyramidView state={state} viewerSeatIdx={viewerSeatIdx} isMyTurn={isMyTurn} dispatch={dispatch} />
        )}
        {state.subPhase === 'progressPick' && (
          <ProgressPickPanel state={state} viewerSeatIdx={viewerSeatIdx} isMyTurn={isMyTurn} dispatch={dispatch} />
        )}
        {state.subPhase === 'wonderConstruct' && (
          <WonderConstructPanel state={state} viewerSeatIdx={viewerSeatIdx} isMyTurn={isMyTurn} dispatch={dispatch} />
        )}
      </main>
      <SelfPanel state={state} viewerSeatIdx={viewerSeatIdx} player={me} />
      <ProgressOfferStrip state={state} />
    </div>
  );
}

// ===================================================================
// Components
// ===================================================================

function OpponentStrip({ player, state }: { player: DuelPlayer; state: DuelState }) {
  void state;
  return (
    <div className="swd-opp-strip">
      <h4 style={{ margin: '0 6px 4px 0' }}>{playerName(player, state)}</h4>
      <div className="swd-stat-row">
        <span>🪙 {player.coins}</span>
        <span>🛡 {shieldsCount(player)}</span>
        <span>Wonders: {player.wonders.filter((w) => w.built).length} / {player.wonders.length}</span>
        <span>Progress: {player.progressTokens.length}</span>
      </div>
      <div className="swd-tableau" style={{ minHeight: 32 }}>
        {player.tableau.map((c) => (
          <span key={c.id} className="swd-mini-card" style={{ background: cardColorHex(c.color) }} title={c.name} />
        ))}
      </div>
    </div>
  );
}

function MilitaryTrack({ state, viewerSeatIdx }: { state: DuelState; viewerSeatIdx: 0 | 1 }) {
  void viewerSeatIdx;
  const pawn = state.militaryPawn;
  const positions: number[] = [];
  for (let i = -9; i <= 9; i++) positions.push(i);
  return (
    <div className="swd-military">
      <div className="swd-track-row">
        {positions.map((pos) => {
          const isThreshold = Math.abs(pos) === 3 || Math.abs(pos) === 6 || Math.abs(pos) === 9;
          return (
            <div
              key={pos}
              className={`swd-track-cell ${pawn === pos ? 'pawn' : ''} ${isThreshold ? 'threshold' : ''}`}
              title={pawn === pos ? 'Military pawn here' : ''}
            >
              {pawn === pos ? '⚔' : pos === 0 ? '|' : ''}
            </div>
          );
        })}
      </div>
      <div className="swd-track-labels">
        <span>{state.seats[0]?.name ?? 'P1'} ←</span>
        <span>→ {state.seats[1]?.name ?? 'P2'}</span>
      </div>
    </div>
  );
}

function WonderDraftPanel({
  state, viewerSeatIdx, isMyTurn, dispatch,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; dispatch: (a: DuelAction) => void;
}) {
  if (!state.wonderDraft) return null;
  const me = state.players[viewerSeatIdx];
  const pickerLabel = isMyTurn ? 'Your pick' : 'Opponent picking';
  return (
    <div className="swd-panel">
      <h3>Wonder Draft — {pickerLabel} ({state.wonderDraft.pickIdx + 1} / 8)</h3>
      <div className="swd-wonder-grid">
        {state.wonderDraft.pool.map((wid) => {
          const w = wonderById(wid);
          return (
            <div
              key={wid}
              className={`swd-wonder-card ${isMyTurn ? 'pickable' : 'locked'}`}
              onClick={() => {
                if (!isMyTurn) return;
                dispatch({ type: 'submitWonderDraft', playerId: me.id, wonderId: wid });
              }}
            >
              <div className="swd-wonder-name">{w.name}</div>
              <div className="swd-wonder-cost">
                Cost: {formatCost(w.cost)}
              </div>
              <div className="swd-wonder-desc">{w.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PyramidView({
  state, viewerSeatIdx, isMyTurn, dispatch,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; dispatch: (a: DuelAction) => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const me = state.players[viewerSeatIdx];
  // Group slots by row.
  const rows: Array<typeof state.pyramid> = [];
  for (const s of state.pyramid) {
    while (rows.length <= s.row) rows.push([]);
    rows[s.row].push(s);
  }
  for (const r of rows) r.sort((a, b) => a.col - b.col);

  const onPick = (cardId: number) => {
    if (!isMyTurn) return;
    setSelectedCardId(cardId === selectedCardId ? null : cardId);
  };

  return (
    <div className="swd-pyramid-wrap">
      <h3>Age {state.age} — {isMyTurn ? 'Your turn' : `${state.seats[state.activeSeatIdx]?.name ?? 'Opponent'} turn`}</h3>
      <div className="swd-pyramid">
        {rows.map((row, ri) => (
          <div key={ri} className="swd-pyramid-row">
            {row.map((slot) => {
              const card = state.cardsById[slot.cardId];
              const avail = isSlotAvailable(slot, state.pyramid);
              const selected = slot.cardId === selectedCardId;
              return (
                <div
                  key={slot.index}
                  className={`swd-pyramid-slot ${slot.taken ? 'taken' : ''} ${slot.faceUp ? 'faceup' : 'facedown'} ${avail ? 'available' : ''} ${selected ? 'selected' : ''}`}
                  onClick={() => slot.faceUp && avail && !slot.taken && onPick(slot.cardId)}
                  style={{ background: !slot.taken && slot.faceUp && card ? cardColorHex(card.color) : undefined }}
                  title={slot.faceUp && card ? card.name : 'face-down'}
                >
                  {slot.taken ? '' : slot.faceUp ? cardLabel(card) : '?'}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {selectedCardId !== null && isMyTurn && (
        <SelectedCardActions
          state={state} viewerSeatIdx={viewerSeatIdx}
          cardId={selectedCardId}
          dispatch={dispatch}
          onClear={() => setSelectedCardId(null)}
        />
      )}
      {!isMyTurn && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-muted)' }}>
          Waiting for opponent…
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-muted)' }}>
        Your coins: {me.coins}
      </div>
    </div>
  );
}

function SelectedCardActions({
  state, viewerSeatIdx, cardId, dispatch, onClear,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; cardId: number;
  dispatch: (a: DuelAction) => void;
  onClear: () => void;
}) {
  const me = state.players[viewerSeatIdx];
  const opp = state.players[(1 - viewerSeatIdx) as 0 | 1];
  const card = state.cardsById[cardId];
  if (!card) return null;

  // Compute the recommended purchase.
  const effCost = effectiveCostForCard(me, card);
  const required = effCost.resources ?? [];
  const prod = productionFor(me);
  const selfCovered: DuelResource[] = [];
  const purchase: DuelResource[] = [];
  for (const r of required) {
    const tryWith = selfCovered.concat([r]);
    if (productionCanSupply(prod, tryWith)) selfCovered.push(r);
    else purchase.push(r);
  }
  const chainFree = canChainBuild(me, card);
  const purchaseCoins = chainFree ? 0 : purchaseCost(me, opp, purchase);
  const totalCoins = chainFree ? 0 : (effCost.coins ?? 0) + purchaseCoins;
  const canAfford = me.coins >= totalCoins;
  const alreadyBuilt = me.tableau.some((c) => c.name === card.name);
  const canBury = me.wonders.some((w) => !w.built);

  return (
    <div className="swd-card-actions">
      <div className="swd-card-actions-title">
        <strong>{card.name}</strong> ({card.color})
        {alreadyBuilt && <span style={{ color: '#e08070' }}> — already built</span>}
      </div>
      <div className="swd-card-actions-info" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
        Cost: {formatCost(effCost)} {chainFree ? '(CHAIN FREE)' : ''} —
        Total coins to spend: {totalCoins} (you have {me.coins})
      </div>
      <div className="swd-card-actions-buttons">
        <button
          disabled={alreadyBuilt || !canAfford}
          onClick={() => {
            dispatch({ type: 'takeAndBuild', playerId: me.id, cardId, purchase });
            onClear();
          }}
        >Build</button>
        <button
          disabled={!canBury}
          onClick={() => {
            dispatch({ type: 'takeAndBury', playerId: me.id, cardId });
            onClear();
          }}
        >Bury under wonder</button>
        <button
          onClick={() => {
            dispatch({ type: 'takeAndDiscard', playerId: me.id, cardId });
            onClear();
          }}
        >Discard for coins</button>
        <button onClick={onClear}>Cancel</button>
      </div>
    </div>
  );
}

function ProgressPickPanel({
  state, viewerSeatIdx, isMyTurn, dispatch,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; dispatch: (a: DuelAction) => void;
}) {
  const me = state.players[viewerSeatIdx];
  return (
    <div className="swd-panel">
      <h3>Pick a Progress Token</h3>
      {!isMyTurn && <p>Opponent is picking…</p>}
      <div className="swd-progress-grid">
        {state.progressOffer.map((tid) => {
          const t = progressTokenById(tid);
          return (
            <div
              key={tid}
              className={`swd-progress-card ${isMyTurn ? 'pickable' : 'locked'}`}
              onClick={() => {
                if (!isMyTurn) return;
                dispatch({ type: 'chooseProgressToken', playerId: me.id, tokenId: tid });
              }}
            >
              <strong>{t.name}</strong>
              <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{t.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WonderConstructPanel({
  state, viewerSeatIdx, isMyTurn, dispatch,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; dispatch: (a: DuelAction) => void;
}) {
  if (!state.pendingWonderBury) return null;
  const me = state.players[viewerSeatIdx];
  const opp = state.players[(1 - viewerSeatIdx) as 0 | 1];
  const unbuilt = me.wonders.filter((w) => !w.built);
  return (
    <div className="swd-panel">
      <h3>Pick a wonder to construct</h3>
      {!isMyTurn && <p>Opponent is choosing…</p>}
      <div className="swd-wonder-grid">
        {unbuilt.map((ws) => {
          const w = wonderById(ws.wonderId);
          const eff = effectiveCostForWonder(me, w);
          const required = eff.resources ?? [];
          const prod = productionFor(me);
          const selfCovered: DuelResource[] = [];
          const purchase: DuelResource[] = [];
          for (const r of required) {
            const tryWith = selfCovered.concat([r]);
            if (productionCanSupply(prod, tryWith)) selfCovered.push(r);
            else purchase.push(r);
          }
          const totalCoins = (eff.coins ?? 0) + purchaseCost(me, opp, purchase);
          const canAfford = me.coins >= totalCoins;
          return (
            <div
              key={ws.wonderId}
              className={`swd-wonder-card ${isMyTurn && canAfford ? 'pickable' : 'locked'}`}
              onClick={() => {
                if (!isMyTurn || !canAfford) return;
                dispatch({ type: 'chooseWonderToBury', playerId: me.id, wonderId: ws.wonderId, purchase });
              }}
            >
              <div className="swd-wonder-name">{w.name}</div>
              <div className="swd-wonder-cost">Cost: {formatCost(eff)} — Total: {totalCoins} coins</div>
              <div className="swd-wonder-desc">{w.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SelfPanel({
  state, viewerSeatIdx, player,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; player: DuelPlayer;
}) {
  void viewerSeatIdx;
  return (
    <div className="swd-self-strip">
      <h4 style={{ margin: '0 6px 4px 0' }}>{playerName(player, state)}</h4>
      <div className="swd-stat-row">
        <span>🪙 {player.coins}</span>
        <span>🛡 {shieldsCount(player)}</span>
        <span>Wonders: {player.wonders.filter((w) => w.built).length} / {player.wonders.length}</span>
        <span>Progress: {player.progressTokens.length}</span>
      </div>
      <div className="swd-tableau">
        {player.tableau.map((c) => (
          <div key={c.id} className="swd-tab-card" style={{ background: cardColorHex(c.color) }} title={c.name}>
            {cardLabel(c)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        {player.wonders.map((ws) => {
          const w = wonderById(ws.wonderId);
          return (
            <span key={ws.wonderId} className={`swd-wonder-chip ${ws.built ? 'built' : ''}`} title={w.description}>
              {w.name}{ws.built ? ' ✓' : ''}
            </span>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        {player.progressTokens.map((tid) => {
          const t = progressTokenById(tid);
          return (
            <span key={tid} className="swd-prog-chip" title={t.description}>{t.name}</span>
          );
        })}
      </div>
    </div>
  );
}

function ProgressOfferStrip({ state }: { state: DuelState }) {
  if (state.progressOffer.length === 0) return null;
  return (
    <aside className="swd-offer-strip">
      <h4 style={{ margin: 0 }}>Progress Token Offer</h4>
      {state.progressOffer.map((tid) => {
        const t = progressTokenById(tid);
        return (
          <div key={tid} className="swd-offer-chip" title={t.description}>
            <strong>{t.name}</strong>
            <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{t.description}</span>
          </div>
        );
      })}
    </aside>
  );
}

function GameOver({ state }: { state: DuelState }) {
  const winner = state.winnerSeatIdx !== null ? state.players[state.winnerSeatIdx] : null;
  const winnerSeat = state.winnerSeatIdx !== null ? state.seats[state.winnerSeatIdx] : null;
  const reasonText = state.endReason === 'military' ? 'Military Supremacy'
    : state.endReason === 'science' ? 'Science Supremacy'
    : 'Civilian Victory';
  return (
    <div className="swd-game-over">
      <h2>Game Over — {reasonText}</h2>
      <p>
        Winner: {winnerSeat?.name ?? '—'} ({winner?.id ?? '—'})
      </p>
      {state.finalScoringBreakdown && (
        <table className="swd-score-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Civ</th><th>Sci</th><th>Comm</th><th>Guild</th>
              <th>Wonders</th><th>Treas</th><th>Mil</th><th>Prog</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {state.finalScoringBreakdown.map((row) => {
              const seat = state.seats.find((s) => s.id === row.playerId);
              return (
                <tr key={row.playerId}>
                  <td>{seat?.name ?? row.playerId}</td>
                  <td>{row.civilian}</td>
                  <td>{row.science}</td>
                  <td>{row.commercial}</td>
                  <td>{row.guild}</td>
                  <td>{row.wonders}</td>
                  <td>{row.treasury}</td>
                  <td>{row.military}</td>
                  <td>{row.progress}</td>
                  <td><strong>{row.total}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ===================================================================
// Helpers
// ===================================================================

function cardLabel(card: DuelCard | undefined): string {
  if (!card) return '';
  return card.name.length > 10 ? card.name.slice(0, 10) + '…' : card.name;
}

function shieldsCount(player: DuelPlayer): number {
  let s = 0;
  for (const c of player.tableau) for (const eff of c.effects) {
    if (eff.kind === 'shields') s += eff.shields;
  }
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    const w = wonderById(ws.wonderId);
    for (const eff of w.effects) if (eff.kind === 'shields' && eff.shields) s += eff.shields;
  }
  return s;
}

function playerName(p: DuelPlayer, state: DuelState): string {
  const seat = state.seats.find((s) => s.id === p.id);
  return seat?.name ?? p.id;
}

function formatCost(cost: { coins?: number; resources?: DuelResource[] }): string {
  const parts: string[] = [];
  if (cost.coins) parts.push(`${cost.coins}🪙`);
  if (cost.resources && cost.resources.length > 0) {
    const grouped: Record<string, number> = {};
    for (const r of cost.resources) grouped[r] = (grouped[r] ?? 0) + 1;
    for (const [r, n] of Object.entries(grouped)) parts.push(`${n}×${r}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'free';
}

function cardColorHex(c: DuelCard['color']): string {
  switch (c) {
    case 'brown': return '#8b5e2a';
    case 'gray': return '#969aa8';
    case 'blue': return '#3d6da0';
    case 'yellow': return '#e7b13e';
    case 'red': return '#b73c3c';
    case 'green': return '#5fa552';
    case 'purple': return '#8d6cc0';
  }
}

void WONDERS; void ALL_PROGRESS_TOKENS;

// ===================================================================
// Export bundle
// ===================================================================

export const bundle: GameUiBundle<DuelState, DuelAction, DuelConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
