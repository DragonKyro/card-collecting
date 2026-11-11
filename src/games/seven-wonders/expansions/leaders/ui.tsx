// Leaders expansion — UI overlays for its sub-phases: the leader draft, the
// Recruitment phase, Solomon's build from the discard, the Courtesans' Guild's
// copy and Rome B's recruit. Lazily loaded (it draws with the game's art).

import { useState } from 'react';
import { sharedDeviceHumans } from '@/core/seats';
import type { SwCard, SwLeaderPlayPick, SwPlayer, SwState } from '../../types';
import type { SwOverlayProps } from '../types';
import { CardFace, CostIcons, EffectIcons } from '../../Card';
import { CoinIcon, ResourceIcon, TileIcon, WonderStageIcon } from '../../art';
import { effectiveCostFor, planPayment } from '../../resources';
import { wonderById } from '../../wonders';
import { DiscardPicker, fromPaymentPlan } from '../../ui';
import { babelTileById } from '../babel/cards';
import { getActiveExpansions } from '../registry';
import { leaderDescription, leadersGuildDescription } from './cards';
import { courtesanOptions, recruitCost, romeOptions } from './reducer';

export function LeadersOverlay({ state, localPlayerId, dispatch }: SwOverlayProps) {
  switch (state.subPhase) {
    case 'leaderDraft': return <LeaderDraftPanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
    case 'leaderPlay': return <LeaderPlayPanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
    case 'solomonAwaitPick': return <SolomonPanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
    case 'courtesan': return <CourtesanPanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
    case 'romeRecruit': return <RomePanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
    default: return null;
  }
}

function seatName(state: SwState, id: string | null | undefined): string {
  return state.seats.find((s) => s.id === id)?.name ?? id ?? '?';
}

/** A leader's rules text (the card list's description). */
export function leaderText(card: SwCard): string {
  return leaderDescription(card.name) || leadersGuildDescription(card.name) || '';
}

function LeaderCard({ card, selected, disabled, onPick, note }: {
  card: SwCard; selected?: boolean; disabled?: boolean; onPick?: () => void; note?: string;
}) {
  return (
    <CardFace
      card={card}
      selected={selected}
      disabled={disabled}
      onClick={onPick}
      text={<>{leaderText(card)}{note ? <><br /><em>{note}</em></> : null}</>}
      title={`${card.name} — ${leaderText(card)}`}
    />
  );
}

// ===== Draft =====

function LeaderDraftPanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const me = state.players.find((p) => p.id === localPlayerId);
  const hand = (state.leaderDraftHands ?? {})[localPlayerId ?? ''] ?? [];
  const submitted = me?.leaderDraftPick != null;
  const submittedCount = state.players.filter((p) => p.leaderDraftPick != null).length;
  // Players sharing a device: a locked-in draft hand stays hidden.
  const hideHand = submitted && sharedDeviceHumans(state.seats) >= 2;
  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span>Leader draft · round {state.leaderDraftRound} of 4</span>
        <span className="sw-hint">Picked {submittedCount} / {state.players.length}</span>
      </h3>
      <p className="sw-hint">Keep one leader; the rest pass to the player on your right. Your drafted leaders: {(me?.leaderHand ?? []).map((c) => c.name).join(', ') || 'none yet'}.</p>
      {me && hideHand ? (
        <p className="sw-empty">Your pick is locked in; your draft hand is hidden while the others pick.</p>
      ) : me ? (
        // Draft hands pass right (east), so after the first round they come in from the west.
        <div className={`sw-hand ${(state.leaderDraftRound ?? 1) > 1 ? 'sw-from-west' : 'sw-from-deck'}`}>
          {hand.map((c) => (
            <LeaderCard
              key={c.id} card={c}
              disabled={submitted}
              selected={me.leaderDraftPick?.cardId === c.id}
              onPick={submitted ? undefined : () => dispatch({ type: 'submitLeaderDraft', playerId: me.id, cardId: c.id })}
              note={`Costs ${c.cost.coins ?? 0} to recruit`}
            />
          ))}
          {hand.length === 0 && <p>No leaders in your draft hand.</p>}
        </div>
      ) : (
        <p className="sw-empty">Spectator — the draft hands are hidden.</p>
      )}
    </div>
  );
}

// ===== Recruitment phase =====

type PlayMode = 'play' | 'bury' | 'discard' | 'babelTile';

function LeaderPlayPanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const me = state.players.find((p) => p.id === localPlayerId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<PlayMode>('play');
  const [tileId, setTileId] = useState<number | null>(null);
  const waiting = state.players.filter((p) => (p.leaderHand ?? []).length > 0 || p.leaderPlayPick != null);
  const submittedCount = waiting.filter((p) => p.leaderPlayPick != null).length;

  if (!me) {
    return <div className="sw-panel sw-hand-area"><p className="sw-empty">Spectator — the cities are choosing their leaders.</p></div>;
  }
  const hand = me.leaderHand ?? [];
  const submitted = me.leaderPlayPick != null;
  const hideHand = submitted && sharedDeviceHumans(state.seats) >= 2;
  const card = hand.find((c) => c.id === selectedId) ?? null;
  const cost = card ? recruitCost(state, me, card) : 0;
  const stagePlan = buryPlan(state, me);
  const tiles = me.babelHand ?? [];
  const hasTower = getActiveExpansions(state.config).some((e) => e.pickKinds?.includes('babelTile'));

  function submit() {
    if (!card || !me) return;
    let pick: SwLeaderPlayPick | null = null;
    if (mode === 'play') pick = { kind: 'play', cardId: card.id, payment: { fromWest: [], fromEast: [], coins: 0 } };
    else if (mode === 'bury' && stagePlan?.canBuild) pick = { kind: 'bury', cardId: card.id, payment: stagePlan.payment };
    else if (mode === 'discard') pick = { kind: 'discard', cardId: card.id };
    else if (mode === 'babelTile' && tileId !== null) pick = { kind: 'babelTile', cardId: card.id, tileId };
    if (pick) dispatch({ type: 'submitLeaderPlay', playerId: me.id, pick });
  }

  const canConfirm = !!card && (
    (mode === 'play' && me.coins >= cost)
    || (mode === 'bury' && !!stagePlan?.canBuild)
    || mode === 'discard'
    || (mode === 'babelTile' && tileId !== null)
  );
  const stage = wonderById(me.wonderId).stages[me.wonderStagesBuilt];

  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span>Recruitment · before Age {['', 'I', 'II', 'III'][state.age]}</span>
        <span className="sw-hint">Picked {submittedCount} / {waiting.length} · <CoinIcon n={me.coins} size={16} /></span>
      </h3>
      {hand.length === 0 ? (
        <p className="sw-empty">You have no leader left to play — waiting for the others…</p>
      ) : submitted ? (
        <p className="sw-empty">Locked in. Waiting for the others…</p>
      ) : hideHand ? null : (
        <>
          <p className="sw-hint">Pick a leader: recruit it (pay its coins), build your next wonder stage with it, or discard it for 3 coins.</p>
          <div className="sw-hand">
            {hand.map((c) => {
              const coins = recruitCost(state, me, c);
              return (
                <LeaderCard
                  key={c.id} card={c}
                  selected={c.id === selectedId}
                  onPick={() => { setSelectedId(c.id); setMode(me.coins >= coins ? 'play' : 'discard'); }}
                  note={coins === (c.cost.coins ?? 0) ? `Recruit: ${coins} coins` : `Recruit: ${coins} coins (printed ${c.cost.coins ?? 0})`}
                />
              );
            })}
          </div>
          {card && (
            <div className="sw-pay-dialog">
              <div className="sw-choices">
                <button className={`sw-choice ${mode === 'play' ? 'on' : ''}`} onClick={() => setMode('play')} disabled={me.coins < cost}
                  title={me.coins < cost ? `Needs ${cost} coins` : ''}>
                  <span className="sw-choice-icon"><CoinIcon n={cost} size={18} /></span>
                  Recruit {card.name}
                </button>
                <button className={`sw-choice ${mode === 'bury' ? 'on' : ''}`} onClick={() => setMode('bury')} disabled={!stage}>
                  <span className="sw-choice-icon"><WonderStageIcon size={18} /></span>
                  {stage ? `Wonder stage ${me.wonderStagesBuilt + 1}` : 'Wonder complete'}
                </button>
                <button className={`sw-choice ${mode === 'discard' ? 'on' : ''}`} onClick={() => setMode('discard')}>
                  <span className="sw-choice-icon"><CoinIcon n={3} size={18} /></span>
                  Discard for 3 coins
                </button>
                {hasTower && tiles.length > 0 && (
                  <button className={`sw-choice ${mode === 'babelTile' ? 'on' : ''}`} onClick={() => setMode('babelTile')}>
                    <span className="sw-choice-icon"><TileIcon size={18} /></span>
                    Build a Babel tile
                  </button>
                )}
              </div>
              <div className="sw-plan">
                {mode === 'play' && <p className="sw-plan-row">Recruit <strong>{card.name}</strong> for <CoinIcon n={cost} size={16} />: {leaderText(card)}</p>}
                {mode === 'bury' && stage && (
                  <div>
                    <div className="sw-plan-row">Stage: <CostIcons cost={stage.cost} size={16} /> → <EffectIcons effects={stage.effects} size={18} /> <span className="sw-plan-note">{stage.text}</span></div>
                    {stagePlan?.canBuild
                      ? (
                        <>
                          {stagePlan.fromWest.length > 0 && <div className="sw-plan-row">Buy from west: {stagePlan.fromWest.map((r, i) => <ResourceIcon key={i} r={r} size={16} />)} <CoinIcon n={stagePlan.coinsToWest} size={16} /></div>}
                          {stagePlan.fromEast.length > 0 && <div className="sw-plan-row">Buy from east: {stagePlan.fromEast.map((r, i) => <ResourceIcon key={i} r={r} size={16} />)} <CoinIcon n={stagePlan.coinsToEast} size={16} /></div>}
                          {stagePlan.totalCoins > 0 && <div className="sw-plan-row">Total to pay: <CoinIcon n={stagePlan.totalCoins} size={18} /></div>}
                        </>
                      )
                      : <p className="sw-plan-bad">Can't build: {stagePlan?.reason}</p>}
                  </div>
                )}
                {mode === 'discard' && <p className="sw-plan-row">Discard <strong>{card.name}</strong> and take <CoinIcon n={3} size={16} />.</p>}
                {mode === 'babelTile' && (
                  <div className="sw-tile-choices">
                    {tiles.map((id) => (
                      <button key={id} className={`sw-tile-choice ${tileId === id ? 'on' : ''}`} onClick={() => setTileId(id)} title={babelTileById(id).text}>
                        <TileIcon n={id} size={26} /><span>{babelTileById(id).text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="sw-actions">
                <button onClick={submit} disabled={!canConfirm}>Confirm</button>
                <button className="secondary" onClick={() => setSelectedId(null)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buryPlan(state: SwState, me: SwPlayer) {
  const idx = me.wonderStagesBuilt;
  const stage = wonderById(me.wonderId).stages[idx];
  if (!stage) return null;
  return fromPaymentPlan(planPayment(state, me, effectiveCostFor(state, me, { kind: 'wonderStage', stageIndex: idx, stage })));
}

// ===== Solomon =====

function SolomonPanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [participate, setParticipate] = useState(false);
  const pickerId = state.solomonQueue?.[0] ?? null;
  const me = state.players.find((p) => p.id === localPlayerId);
  if (!me || me.id !== pickerId) {
    return (
      <div className="sw-panel sw-hand-area">
        <h3><span>Solomon</span></h3>
        <p className="sw-hint">{seatName(state, pickerId)} is building a card from the discard pile with Solomon…</p>
      </div>
    );
  }
  return (
    <DiscardPicker
      state={state} me={me} title="Solomon"
      selected={selected} setSelected={setSelected}
      participate={participate} setParticipate={setParticipate}
      onBuild={(cardId, join, payment) => dispatch({ type: 'solomonPick', playerId: me.id, cardId, ...(join ? { participate: true, payment } : {}) })}
      onPass={() => dispatch({ type: 'solomonPick', playerId: me.id, cardId: null })}
    />
  );
}

// ===== Courtesans' Guild =====

function CourtesanPanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const chooser = state.courtesanQueue?.[0] ?? null;
  const me = state.players.find((p) => p.id === localPlayerId);
  if (!me || me.id !== chooser) {
    return (
      <div className="sw-panel sw-hand-area">
        <h3><span>Courtesans' Guild</span></h3>
        <p className="sw-hint">{seatName(state, chooser)} is placing the Courtesan on a neighbouring leader…</p>
      </div>
    );
  }
  const options = courtesanOptions(state, me);
  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span>Courtesans' Guild · place the Courtesan</span>
        <span className="sw-hint">Your city gains the power of the leader you choose.</span>
      </h3>
      <div className="sw-hand">
        {options.map((c) => {
          const owner = state.players.find((p) => (p.leaderTableau ?? []).some((x) => x.id === c.id));
          return (
            <LeaderCard key={c.id} card={c} note={`In ${seatName(state, owner?.id)}'s city`}
              onPick={() => dispatch({ type: 'courtesanPick', playerId: me.id, leaderId: c.id })} />
          );
        })}
      </div>
    </div>
  );
}

// ===== Rome B =====

function RomePanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const chooser = state.romeRecruitQueue?.[0] ?? null;
  const me = state.players.find((p) => p.id === localPlayerId);
  if (!me || me.id !== chooser) {
    return (
      <div className="sw-panel sw-hand-area">
        <h3><span>Colosseum in Rome</span></h3>
        <p className="sw-hint">{seatName(state, chooser)} may recruit a leader now…</p>
      </div>
    );
  }
  const options = new Set(romeOptions(state, me).map((c) => c.id));
  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span>Colosseum in Rome · recruit a leader now</span>
        <span className="sw-hint"><CoinIcon n={me.coins} size={16} /></span>
      </h3>
      <div className="sw-hand">
        {(me.leaderHand ?? []).map((c) => (
          <LeaderCard key={c.id} card={c} disabled={!options.has(c.id)}
            note={`Recruit: ${recruitCost(state, me, c)} coins`}
            onPick={options.has(c.id) ? () => dispatch({ type: 'romeRecruit', playerId: me.id, cardId: c.id }) : undefined} />
        ))}
      </div>
      <div className="sw-actions">
        <button className="secondary" onClick={() => dispatch({ type: 'romeRecruit', playerId: me.id, cardId: null })}>Recruit nobody</button>
      </div>
    </div>
  );
}
