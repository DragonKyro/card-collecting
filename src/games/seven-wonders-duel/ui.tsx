// 7 Wonders Duel — UI bundle (LobbyConfig + GameView).
//
// Layout (top to bottom): the opponent's city, the military track, the
// table (pyramid + the picked card's actions, or the wonder draft / progress
// pick / wonder construction pickers), the viewer's city. Side column: the
// progress-token offer and the discard pile.
//
// The pyramid is laid out from each slot's row / col: row 0 is the uncovered
// row, drawn nearest the player and on top; every deeper row sits one step up
// and half a card across, so a covered card shows only its top band, as on the
// table. Face-down cards show their age's back — or the guild back for an
// Age III guild, the one identity a back gives away.

import { useMemo, useState, type ReactNode } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  DuelAction, DuelCardColor, DuelConfig, DuelPlayer, DuelResource, DuelScience, DuelState,
} from './types';
import { DUEL_ALL_SCIENCE } from './types';
import { isSlotAvailable } from './pyramid';
import { wonderById } from './wonders';
import { progressTokenById } from './progress';
import {
  canChainBuild, effectiveCostForCard, effectiveCostForWonder,
  productionCanSupply, productionFor, purchaseCost, shieldsFor,
} from './resources';
import { CardBack, CardBand, CardFace, ProgressToken, WonderCard, costText } from './Card';
import {
  ChipGlyph, CoinIcon, Icon, LaurelIcon, MilitaryTrackArt, ProgressGlyph, ScienceIcon, ShieldIcon, WonderGlyph,
} from './art';
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
  const oppSeatIdx = (1 - viewerSeatIdx) as 0 | 1;

  const isMyTurn = state.activeSeatIdx === viewerSeatIdx;

  if (state.phase === 'gameOver') {
    return <GameOver state={state} />;
  }

  return (
    <div className="swd-game">
      <div className="swd-main">
        <PlayerPanel state={state} seatIdx={oppSeatIdx} />
        <MilitaryTrack state={state} />
        <section className="swd-table">
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
        </section>
        <PlayerPanel state={state} seatIdx={viewerSeatIdx} />
      </div>
      <aside className="swd-side">
        <ProgressOffer state={state} />
        <DiscardPile state={state} />
      </aside>
    </div>
  );
}

// ===================================================================
// Players
// ===================================================================

const CITY_ORDER: DuelCardColor[] = ['brown', 'gray', 'yellow', 'red', 'blue', 'green', 'purple'];

function PlayerPanel({ state, seatIdx }: { state: DuelState; seatIdx: 0 | 1 }) {
  const player = state.players[seatIdx];
  const seat = state.seats[seatIdx];
  const active = state.phase !== 'gameOver' && state.activeSeatIdx === seatIdx;
  const sciences = scienceCounts(player);
  const distinct = sciences.size + (player.progressTokens.includes('law') ? 1 : 0);
  const builtWonders = player.wonders.filter((w) => w.built).length;
  return (
    <section
      className={`swd-player ${active ? 'active' : ''}`}
      style={{ ['--swd-seat' as string]: seat?.color ?? '#888' }}
      aria-label={`${playerName(player, state)}'s city`}
    >
      <header className="swd-player-head">
        <span className="swd-seat-dot" />
        <strong className="swd-player-name">{playerName(player, state)}</strong>
        {seat?.isAI && <span className="swd-tag">AI</span>}
        {active && <span className="swd-tag swd-tag-turn">to play</span>}
        <span className="swd-stat" title="Coins"><CoinIcon size={24} title="coins" /> {player.coins}</span>
        <span className="swd-stat" title="Shields"><ShieldIcon size={22} /> {shieldsFor(player)}</span>
        <span className="swd-stat" title="Wonders built"><Icon size={22} title="wonders"><WonderGlyph /></Icon> {builtWonders}/{player.wonders.length}</span>
        <span className="swd-science" title={`${distinct} of 6 different symbols for Science Supremacy`}>
          {DUEL_ALL_SCIENCE.map((s) => {
            const n = sciences.get(s) ?? 0;
            return (
              <span key={s} className={`swd-sci ${n > 0 ? 'have' : ''}`}>
                <ScienceIcon symbol={s} size={20} />
                {n > 1 && <b>{n}</b>}
              </span>
            );
          })}
          <span className="swd-sci-count">{distinct}/6</span>
        </span>
        {player.progressTokens.length > 0 && (
          <span className="swd-player-tokens">
            {player.progressTokens.map((tid) => <ProgressToken key={tid} id={tid} size={28} />)}
          </span>
        )}
      </header>
      <div className="swd-player-body">
        <div className="swd-city">
          {player.tableau.length === 0 && <span className="swd-empty">No buildings yet</span>}
          {CITY_ORDER.map((color) => {
            const cards = player.tableau.filter((c) => c.color === color);
            if (cards.length === 0) return null;
            return (
              <div key={color} className="swd-city-col">
                {cards.map((c) => <CardBand key={c.id} card={c} />)}
              </div>
            );
          })}
        </div>
        <div className="swd-player-wonders">
          {player.wonders.map((ws) => {
            const buried = ws.buriedCardId !== null ? state.cardsById[ws.buriedCardId] : undefined;
            return (
              <WonderCard
                key={ws.wonderId}
                wonder={wonderById(ws.wonderId)}
                size="sm"
                built={ws.built}
                buriedAge={ws.built ? (buried?.age ?? 1) : undefined}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MilitaryTrack({ state }: { state: DuelState }) {
  const pawn = state.militaryPawn;
  const left = state.seats[0]?.name ?? 'P1';
  const right = state.seats[1]?.name ?? 'P2';
  const lead = pawn === 0 ? 'Even' : pawn > 0 ? `${left} pushes ${pawn}` : `${right} pushes ${-pawn}`;
  return (
    <div className="swd-military">
      <MilitaryTrackArt
        pawn={pawn}
        awards={state.militaryAwards}
        leftColor={state.seats[0]?.color ?? '#8a6a4a'}
        rightColor={state.seats[1]?.color ?? '#8a6a4a'}
      />
      <div className="swd-military-labels">
        <span>◀ {left}’s capital</span>
        <span className="swd-military-lead">{lead}</span>
        <span>{right}’s capital ▶</span>
      </div>
    </div>
  );
}

// ===================================================================
// Table panels
// ===================================================================

function WonderDraftPanel({
  state, viewerSeatIdx, isMyTurn, dispatch,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; dispatch: (a: DuelAction) => void;
}) {
  if (!state.wonderDraft) return null;
  const me = state.players[viewerSeatIdx];
  const picker = state.seats[state.activeSeatIdx]?.name ?? 'Opponent';
  return (
    <div className="swd-panel">
      <h3 className="swd-table-title">
        Wonder draft · {isMyTurn ? 'your pick' : `${picker} is picking`} <span className="swd-dim">({state.wonderDraft.pickIdx + 1} / 8)</span>
      </h3>
      <div className="swd-wonder-grid">
        {state.wonderDraft.pool.map((wid) => (
          <WonderCard
            key={wid}
            wonder={wonderById(wid)}
            className={isMyTurn ? 'pickable' : 'locked'}
            onClick={isMyTurn ? () => dispatch({ type: 'submitWonderDraft', playerId: me.id, wonderId: wid }) : undefined}
            footer={<div className="swd-wonder-desc">{wonderById(wid).description}</div>}
          />
        ))}
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
  const rowLen: number[] = [];
  for (const s of state.pyramid) rowLen[s.row] = Math.max(rowLen[s.row] ?? 0, s.col + 1);
  const nRows = Math.max(rowLen.length, 1);
  const maxLen = Math.max(1, ...rowLen.filter((n) => n !== undefined));

  // A stale selection (the card was taken meanwhile) shows nothing.
  const selectedSlot = state.pyramid.find((s) => s.cardId === selectedCardId && !s.taken && isSlotAvailable(s, state.pyramid));
  const selected = isMyTurn && selectedSlot ? selectedSlot.cardId : null;

  const onPick = (cardId: number) => {
    if (!isMyTurn) return;
    setSelectedCardId(cardId === selectedCardId ? null : cardId);
  };

  return (
    <div className="swd-table-row">
      <div className="swd-pyramid-wrap">
        <h3 className="swd-table-title">
          Age {['I', 'II', 'III'][state.age - 1]} · {isMyTurn ? 'your turn' : `${state.seats[state.activeSeatIdx]?.name ?? 'Opponent'}’s turn`}
        </h3>
        <div
          className="swd-pyramid"
          style={{
            width: `calc(var(--swd-step-x) * ${maxLen - 1} + var(--swd-card-w))`,
            height: `calc(var(--swd-step-y) * ${nRows - 1} + var(--swd-card-h))`,
          }}
        >
          {state.pyramid.map((slot) => {
            if (slot.taken) return null;
            const card = state.cardsById[slot.cardId];
            const n = rowLen[slot.row];
            const x = slot.col - (n - 1) / 2 + (maxLen - 1) / 2;
            const y = nRows - 1 - slot.row;
            const avail = isSlotAvailable(slot, state.pyramid) && slot.faceUp;
            const pickable = isMyTurn && avail;
            const cls = ['swd-slot', avail ? 'available' : '', pickable ? 'pickable' : '', slot.cardId === selected ? 'selected' : '']
              .filter(Boolean).join(' ');
            return (
              <div
                key={slot.index}
                className={cls}
                style={{
                  left: `calc(var(--swd-step-x) * ${x})`,
                  top: `calc(var(--swd-step-y) * ${y})`,
                  zIndex: nRows - slot.row + (slot.cardId === selected ? 10 : 0),
                }}
              >
                {slot.faceUp && card
                  ? <CardFace card={card} size="md" onClick={pickable ? () => onPick(slot.cardId) : undefined} />
                  : <CardBack age={state.age} guild={card?.color === 'purple'} size="md" />}
              </div>
            );
          })}
        </div>
      </div>
      <CardActionsPanel
        state={state}
        viewerSeatIdx={viewerSeatIdx}
        isMyTurn={isMyTurn}
        cardId={selected}
        dispatch={dispatch}
        onClear={() => setSelectedCardId(null)}
      />
    </div>
  );
}

/** Greedy split of a cost into what the player makes and what they buy. */
function planPurchase(me: DuelPlayer, opp: DuelPlayer, required: DuelResource[]): { purchase: DuelResource[]; coins: number } {
  const prod = productionFor(me);
  const selfCovered: DuelResource[] = [];
  const purchase: DuelResource[] = [];
  for (const r of required) {
    if (productionCanSupply(prod, selfCovered.concat([r]))) selfCovered.push(r);
    else purchase.push(r);
  }
  return { purchase, coins: purchaseCost(me, opp, purchase) };
}

function CardActionsPanel({
  state, viewerSeatIdx, isMyTurn, cardId, dispatch, onClear,
}: {
  state: DuelState; viewerSeatIdx: 0 | 1; isMyTurn: boolean; cardId: number | null;
  dispatch: (a: DuelAction) => void;
  onClear: () => void;
}) {
  const me = state.players[viewerSeatIdx];
  const opp = state.players[(1 - viewerSeatIdx) as 0 | 1];
  if (!isMyTurn) {
    return (
      <div className="swd-pick-panel">
        <p className="swd-pick-hint">Waiting for {state.seats[state.activeSeatIdx]?.name ?? 'your opponent'}…</p>
      </div>
    );
  }
  const card = cardId !== null ? state.cardsById[cardId] : undefined;
  if (!card || cardId === null) {
    return (
      <div className="swd-pick-panel">
        <p className="swd-pick-hint">Pick a glowing card from the pyramid.</p>
        <p className="swd-pick-sub">Then build it, use it to build a wonder, or discard it for coins.</p>
      </div>
    );
  }

  const effCost = effectiveCostForCard(me, card);
  const chainFree = canChainBuild(me, card);
  const { purchase, coins: buyCoins } = planPurchase(me, opp, effCost.resources ?? []);
  const totalCoins = chainFree ? 0 : (effCost.coins ?? 0) + buyCoins;
  const canAfford = me.coins >= totalCoins;
  const alreadyBuilt = me.tableau.some((c) => c.name === card.name);
  const canBury = me.wonders.some((w) => !w.built);
  const discardCoins = 2 + me.tableau.filter((c) => c.color === 'yellow').length;

  return (
    <div className="swd-pick-panel">
      <CardFace card={card} size="lg" />
      <div className="swd-pick-cost">
        {chainFree
          ? <span>Free — chained from {card.chainFrom?.find((n) => me.tableau.some((c) => c.name === n)) ?? 'a card you own'}</span>
          : (
            <>
              <span>Cost: {costText(effCost)}</span>
              {purchase.length > 0 && <span>Buy {purchase.join(', ')}: {buyCoins} coins</span>}
            </>
          )}
      </div>
      <div className="swd-pick-buttons">
        <button
          disabled={alreadyBuilt || !canAfford}
          title={alreadyBuilt ? 'Already in your city' : !canAfford ? `Needs ${totalCoins} coins (you have ${me.coins})` : ''}
          onClick={() => {
            dispatch({ type: 'takeAndBuild', playerId: me.id, cardId, purchase });
            onClear();
          }}
        >
          <span>Build</span>
          <span className="swd-btn-cost"><CoinIcon value={totalCoins} size={18} /></span>
        </button>
        <button
          className="secondary"
          disabled={!canBury}
          onClick={() => {
            dispatch({ type: 'takeAndBury', playerId: me.id, cardId });
            onClear();
          }}
        >
          <span>Build a wonder with it</span>
          <span className="swd-btn-cost"><Icon size={18}><WonderGlyph /></Icon></span>
        </button>
        <button
          className="secondary"
          onClick={() => {
            dispatch({ type: 'takeAndDiscard', playerId: me.id, cardId });
            onClear();
          }}
        >
          <span>Discard for coins</span>
          <span className="swd-btn-cost">+<CoinIcon value={discardCoins} size={18} /></span>
        </button>
        <button className="secondary swd-btn-cancel" onClick={onClear}>Cancel</button>
      </div>
      <div className="swd-pick-sub">You have <CoinIcon value={me.coins} size={16} /> coins.</div>
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
      <h3 className="swd-table-title">
        {isMyTurn ? 'Two matching science symbols — choose a progress token' : `${state.seats[state.activeSeatIdx]?.name ?? 'Opponent'} is choosing a progress token…`}
      </h3>
      <div className="swd-progress-grid">
        {state.progressOffer.map((tid) => {
          const t = progressTokenById(tid);
          return (
            <div
              key={tid}
              className={`swd-progress-choice ${isMyTurn ? 'pickable' : 'locked'}`}
              role={isMyTurn ? 'button' : undefined}
              tabIndex={isMyTurn ? 0 : undefined}
              onClick={isMyTurn ? () => dispatch({ type: 'chooseProgressToken', playerId: me.id, tokenId: tid }) : undefined}
              onKeyDown={isMyTurn ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch({ type: 'chooseProgressToken', playerId: me.id, tokenId: tid }); }
              } : undefined}
            >
              <ProgressToken id={tid} size={72} />
              <strong>{t.name}</strong>
              <span>{t.description}</span>
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
  const buried = state.cardsById[state.pendingWonderBury.cardId];
  return (
    <div className="swd-panel">
      <h3 className="swd-table-title">
        {isMyTurn ? 'Choose a wonder to build' : `${state.seats[state.activeSeatIdx]?.name ?? 'Opponent'} is choosing a wonder…`}
      </h3>
      <div className="swd-construct">
        <div className="swd-construct-card">
          <CardBack age={buried?.age ?? state.age} size="md" />
          <span>tucked under it</span>
        </div>
        <div className="swd-wonder-grid">
          {unbuilt.map((ws) => {
            const w = wonderById(ws.wonderId);
            const eff = effectiveCostForWonder(me, w);
            const { purchase, coins } = planPurchase(me, opp, eff.resources ?? []);
            const totalCoins = (eff.coins ?? 0) + coins;
            const canAfford = me.coins >= totalCoins;
            const pickable = isMyTurn && canAfford;
            return (
              <WonderCard
                key={ws.wonderId}
                wonder={w}
                costOverride={eff}
                className={pickable ? 'pickable' : 'locked'}
                onClick={pickable ? () => dispatch({ type: 'chooseWonderToBury', playerId: me.id, wonderId: ws.wonderId, purchase }) : undefined}
                footer={(
                  <div className={`swd-wonder-desc ${canAfford ? '' : 'short'}`}>
                    {canAfford ? 'Costs' : 'Needs'} <CoinIcon value={totalCoins} size={15} /> {canAfford ? '' : `— you have ${me.coins}`}
                  </div>
                )}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// Side column
// ===================================================================

function ProgressOffer({ state }: { state: DuelState }) {
  if (state.progressOffer.length === 0) return null;
  return (
    <div className="swd-side-box">
      <h4>Progress tokens</h4>
      {state.progressOffer.map((tid) => {
        const t = progressTokenById(tid);
        return (
          <div key={tid} className="swd-offer-row" title={t.description}>
            <ProgressToken id={tid} size={40} />
            <div>
              <strong>{t.name}</strong>
              <span>{t.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiscardPile({ state }: { state: DuelState }) {
  const top = state.discard[state.discard.length - 1];
  return (
    <div className="swd-side-box">
      <h4>Discard pile · {state.discard.length}</h4>
      {top ? (
        <div className="swd-discard">
          <CardFace card={top} size="sm" />
          <span>Last discarded: <strong>{top.name}</strong></span>
        </div>
      ) : (
        <span className="swd-dim">Empty</span>
      )}
    </div>
  );
}

// ===================================================================
// Game over
// ===================================================================

function GameOver({ state }: { state: DuelState }) {
  const winnerSeat = state.winnerSeatIdx !== null ? state.seats[state.winnerSeatIdx] : null;
  const reasonText = state.endReason === 'military' ? 'Military Supremacy'
    : state.endReason === 'science' ? 'Science Supremacy'
    : 'Civilian Victory';
  const reasonIcon = state.endReason === 'military' ? <ShieldIcon size={34} />
    : state.endReason === 'science' ? <ScienceIcon symbol="compass" size={34} />
    : <LaurelIcon size={34} />;
  const head = (title: string, icon: ReactNode) => <th title={title}><span className="swd-th">{icon}</span></th>;
  const chip = (c: DuelCardColor) => <Icon size={22}><ChipGlyph color={c} /></Icon>;
  return (
    <div className="swd-game swd-game-over">
      <div className="swd-main">
        <div className="swd-gameover">
          <div className="swd-gameover-banner">
            {reasonIcon}
            <div>
              <h2>{winnerSeat ? `${winnerSeat.name} wins` : 'Draw'}</h2>
              <span>{reasonText}</span>
            </div>
          </div>
          {state.finalScoringBreakdown && (
            <table className="swd-score-table">
              <thead>
                <tr>
                  <th />
                  {head('Civilian (blue cards)', chip('blue'))}
                  {head('Science', <ScienceIcon symbol="gear" size={22} />)}
                  {head('Commercial (yellow cards)', chip('yellow'))}
                  {head('Guilds', chip('purple'))}
                  {head('Wonders', <Icon size={22}><WonderGlyph /></Icon>)}
                  {head('Treasury (1 VP per 3 coins)', <CoinIcon size={22} />)}
                  {head('Military', <ShieldIcon size={22} />)}
                  {head('Progress tokens', <Icon size={22}><ProgressGlyph /></Icon>)}
                  {head('Total', <LaurelIcon value="VP" size={28} title="total VP" />)}
                </tr>
              </thead>
              <tbody>
                {state.finalScoringBreakdown.map((row) => {
                  const seat = state.seats.find((s) => s.id === row.playerId);
                  return (
                    <tr key={row.playerId} className={winnerSeat?.id === row.playerId ? 'winner' : ''}>
                      <td><span className="swd-seat-dot" style={{ ['--swd-seat' as string]: seat?.color ?? '#888' }} /> {seat?.name ?? row.playerId}</td>
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
        <PlayerPanel state={state} seatIdx={1} />
        <MilitaryTrack state={state} />
        <PlayerPanel state={state} seatIdx={0} />
      </div>
    </div>
  );
}

// ===================================================================
// Helpers
// ===================================================================

/** Science symbols a player holds (green cards + built wonders). */
function scienceCounts(player: DuelPlayer): Map<DuelScience, number> {
  const counts = new Map<DuelScience, number>();
  for (const c of player.tableau) {
    for (const eff of c.effects) {
      if (eff.kind === 'science') counts.set(eff.symbol, (counts.get(eff.symbol) ?? 0) + 1);
    }
  }
  for (const ws of player.wonders) {
    if (!ws.built) continue;
    for (const eff of wonderById(ws.wonderId).effects) {
      if (eff.kind === 'science' && eff.symbol) counts.set(eff.symbol, (counts.get(eff.symbol) ?? 0) + 1);
    }
  }
  return counts;
}

function playerName(p: DuelPlayer, state: DuelState): string {
  const seat = state.seats.find((s) => s.id === p.id);
  return seat?.name ?? p.id;
}

// ===================================================================
// Export bundle
// ===================================================================

export const bundle: GameUiBundle<DuelState, DuelAction, DuelConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
