// Leaders expansion — UI overlay components.
//
// Rendered by GameView when state.subPhase is leaderDraft / leaderPlay /
// solomonAwaitPick. Also exposes a Bilkis button (rendered inline by the base
// HandPanel when the player has Bilkis).

import { useState } from 'react';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SwAction, SwCard, SwConfig, SwResource, SwState,
} from '../../types';
import { ALL_RESOURCES } from '../../types';
import type { SwOverlayProps } from '../types';

export function LeadersOverlay({ state, localPlayerId, dispatch }: SwOverlayProps) {
  if (state.subPhase === 'leaderDraft') {
    return <LeaderDraftPanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
  }
  if (state.subPhase === 'leaderPlay') {
    return <LeaderPlayPanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
  }
  if (state.subPhase === 'solomonAwaitPick') {
    return <SolomonPickPanel state={state} localPlayerId={localPlayerId} dispatch={dispatch} />;
  }
  return null;
}

// ===== Draft =====

function LeaderDraftPanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const me = state.players.find((p) => p.id === localPlayerId);
  const hand = (state.leaderDraftHands ?? {})[localPlayerId ?? ''] ?? [];
  const submitted = me?.leaderDraftPick != null;
  const submittedCount = state.players.filter((p) => p.leaderDraftPick !== null).length;
  return (
    <div className="sw-hand-area">
      <h3>
        <span>Leader draft · round {state.leaderDraftRound} / 4</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Submitted: {submittedCount} / {state.players.length}
        </span>
      </h3>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
        Pick one leader. Remaining cards pass {state.leaderDraftPassDir === 'cw' ? 'clockwise' : 'counter-clockwise'}.
      </p>
      {me ? (
        <div className="sw-hand">
          {hand.map((c) => (
            <LeaderCard key={c.id} card={c}
              disabled={submitted}
              onPick={() => dispatch({ type: 'submitLeaderDraft', playerId: me.id, cardId: c.id })}
              actionLabel="Draft this leader"
            />
          ))}
          {hand.length === 0 && <p>No leaders in your draft hand.</p>}
        </div>
      ) : (
        <p style={{ color: 'rgba(255,255,255,0.7)' }}>Spectator — no leader draft visible.</p>
      )}
    </div>
  );
}

// ===== Play =====

function LeaderPlayPanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const me = state.players.find((p) => p.id === localPlayerId);
  const submitted = me?.leaderPlayPick != null;
  const submittedCount = state.players.filter((p) => p.leaderPlayPick !== null).length;
  const hand = me?.leaderHand ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (!me) {
    return (
      <div className="sw-hand-area">
        <p style={{ color: 'rgba(255,255,255,0.7)' }}>Spectator — no leader play visible.</p>
      </div>
    );
  }

  const selectedCard = hand.find((c) => c.id === selectedId) ?? null;
  const baseCoin = selectedCard?.cost.coins ?? 0;
  const maecenas = (me.leaderTableau ?? []).some((c) => c.name === 'Maecenas');
  const effCoin = maecenas ? 0 : baseCoin;
  const canAffordPlay = selectedCard ? me.coins >= effCoin : false;

  return (
    <div className="sw-hand-area">
      <h3>
        <span>Leader play · before Age {state.age}</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          Submitted: {submittedCount} / {state.players.length} · 🪙 {me.coins}
        </span>
      </h3>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
        Pick a leader to play, bury under your wonder, discard for 3 coins, or skip.
      </p>
      {submitted ? (
        <p style={{ fontSize: 12 }}>Submitted. Waiting for others…</p>
      ) : (
        <>
          <div className="sw-hand">
            {hand.map((c) => (
              <LeaderCard
                key={c.id} card={c}
                selected={c.id === selectedId}
                disabled={false}
                onPick={() => setSelectedId(c.id)}
                actionLabel="Select"
              />
            ))}
            {hand.length === 0 && <p>No leaders in your reserve.</p>}
          </div>
          {selectedCard && (
            <div className="sw-pay-dialog">
              <h4>{selectedCard.name}</h4>
              <div style={{ fontSize: 12, marginBottom: 8 }}>
                {leaderEffectText(selectedCard)}
              </div>
              <div className="sw-actions">
                <button
                  onClick={() => dispatch({
                    type: 'submitLeaderPlay', playerId: me.id,
                    pick: { kind: 'play', cardId: selectedCard.id, payment: { fromWest: [], fromEast: [], coins: 0 } },
                  })}
                  disabled={!canAffordPlay}
                  title={canAffordPlay ? `Pay ${effCoin} coins` : `Need ${effCoin} coins (have ${me.coins})`}
                >
                  Play ({effCoin}🪙)
                </button>
                <button
                  className="secondary"
                  onClick={() => dispatch({
                    type: 'submitLeaderPlay', playerId: me.id,
                    pick: { kind: 'discard', cardId: selectedCard.id },
                  })}
                >
                  Discard (+3🪙)
                </button>
                <button
                  className="secondary"
                  onClick={() => dispatch({
                    type: 'submitLeaderPlay', playerId: me.id, pick: { kind: 'skip' },
                  })}
                >
                  Skip
                </button>
              </div>
            </div>
          )}
          {!selectedCard && hand.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                className="secondary"
                onClick={() => dispatch({
                  type: 'submitLeaderPlay', playerId: me.id, pick: { kind: 'skip' },
                })}
              >
                Skip leader play this age
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===== Solomon =====

function SolomonPickPanel({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const isMine = state.solomonPickerId === localPlayerId;
  const seat = state.seats.find((s) => s.id === state.solomonPickerId) as Seat | undefined;
  return (
    <div className="sw-hand-area">
      <h3>
        <span>Solomon: pick from the discard pile</span>
        <span style={{ fontSize: 12, opacity: 0.75 }}>
          {isMine ? 'Your pick' : `Waiting on ${seat?.name ?? state.solomonPickerId}`}
        </span>
      </h3>
      {state.discard.length === 0 && <p>(Discard pile is empty — picking will resume automatically.)</p>}
      {isMine && state.discard.length > 0 && (
        <div className="sw-hand">
          {state.discard.map((c) => (
            <button
              key={c.id} className="sw-card"
              onClick={() => dispatch({ type: 'solomonPick', playerId: localPlayerId!, cardId: c.id })}
            >
              <div className="sw-card-name">{c.name}</div>
              <div className="sw-card-effect" style={{ fontSize: 10 }}>{cardEffectText(c)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== Bilkis button (rendered by HandPanel if Bilkis is in play) =====

export function BilkisButton({ state, me, dispatch }: { state: SwState; me: { id: PlayerId; coins: number; bilkisUsedThisTick?: boolean; leaderTableau?: SwCard[] }; dispatch: (a: SwAction) => void }) {
  const [open, setOpen] = useState(false);
  const hasBilkis = (me.leaderTableau ?? []).some((c) => c.name === 'Bilkis');
  if (!hasBilkis) return null;
  if (me.bilkisUsedThisTick) {
    return <span style={{ fontSize: 11, opacity: 0.6 }}>Bilkis: used this turn</span>;
  }
  if (me.coins < 1) {
    return <span style={{ fontSize: 11, opacity: 0.6 }}>Bilkis: need 1 coin</span>;
  }
  if (!open) {
    return (
      <button
        className="secondary"
        style={{ fontSize: 11 }}
        onClick={() => setOpen(true)}
      >
        Use Bilkis (1🪙 → +1 resource)
      </button>
    );
  }
  void state;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 11 }}>Pick resource:</span>
      {ALL_RESOURCES.map((r) => (
        <button
          key={r} style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => {
            dispatch({ type: 'useBilkis', playerId: me.id, resource: r as SwResource });
            setOpen(false);
          }}
        >
          {r}
        </button>
      ))}
      <button
        className="secondary"
        style={{ fontSize: 11 }}
        onClick={() => setOpen(false)}
      >
        cancel
      </button>
    </div>
  );
}

// ===== Lobby section =====

export function LeadersLobbySection({ config: _config, onChange: _onChange }: { config: SwConfig; onChange: (c: SwConfig) => void }) {
  // No lobby-side config for Leaders (just the on/off in the main panel).
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
      Leaders enabled. 36 leaders shuffled and pass-drafted at match start.
    </p>
  );
}

// ===== Helpers =====

function LeaderCard({
  card, selected, disabled, onPick, actionLabel,
}: {
  card: SwCard;
  selected?: boolean;
  disabled?: boolean;
  onPick: () => void;
  actionLabel: string;
}) {
  return (
    <div
      className={`sw-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => { if (!disabled) onPick(); }}
      title={actionLabel}
    >
      <div className="sw-card-color-bar" style={{ background: '#d8c598' }} />
      <div className="sw-card-name">{card.name}</div>
      <div className="sw-card-cost">{card.cost.coins ?? 0} 🪙</div>
      <div className="sw-card-effect">{leaderEffectText(card)}</div>
    </div>
  );
}

function leaderEffectText(card: SwCard): string {
  const parts: string[] = [];
  for (const eff of card.effects) {
    if (eff.kind === 'vp') parts.push(`+${eff.vp} VP`);
    else if (eff.kind === 'shields') parts.push(`+${eff.shields} ⚔`);
    else if (eff.kind === 'coins') parts.push(`+${eff.amount} 🪙`);
    else if (eff.kind === 'science') parts.push(`+1 ${eff.symbol}`);
    else if (eff.kind === 'endVp') {
      const what =
        eff.countWhat.kind === 'cardColor' ? `${eff.countWhat.color} cards`
        : eff.countWhat.kind === 'wonderStages' ? 'wonder stages'
        : 'defeat tokens';
      parts.push(`+${eff.vpPer ?? 0} VP / ${what} (${eff.from})`);
    }
    else if (eff.kind === 'leaderCostModifier') {
      if (eff.remove === 'oneResource' && eff.target === 'cardColor') {
        parts.push(`${eff.targetColor} cards: -1 resource`);
      } else if (eff.remove === 'oneResource' && eff.target === 'wonderStage') {
        parts.push(`wonder stages: -1 resource`);
      } else if (eff.remove === 'allResources') {
        parts.push(`guilds: free`);
      } else if (eff.remove === 'allCoins') {
        parts.push(`leaders: 0 🪙`);
      }
    }
    else if (eff.kind === 'leaderTrigger') {
      if (eff.on.type === 'buildCardColor') parts.push(`+${eff.reward.coins ?? 0} 🪙 / ${eff.on.color} card built`);
      else if (eff.on.type === 'buildViaChain') parts.push(`+${eff.reward.coins ?? 0} 🪙 / chain build`);
      else if (eff.on.type === 'militaryWin') parts.push(`+${eff.reward.coins ?? 0} 🪙 / military win`);
      else if (eff.on.type === 'neighborPurchase') parts.push(`+${eff.reward.coins ?? 0} 🪙 / neighbor purchase (max 1/turn)`);
    }
    else if (eff.kind === 'leaderScoreExtra') {
      if (eff.rule.type === 'completeScienceSet') parts.push(`+${eff.rule.vpPerSet} VP / science set`);
      else if (eff.rule.type === 'completeRGBSet') parts.push(`+${eff.rule.vpPerSet} VP / R+B+G set`);
      else if (eff.rule.type === 'completeAllColorsSet') parts.push(`+${eff.rule.vpPerSet} VP / 7-color set`);
      else if (eff.rule.type === 'midasCoinBonus') parts.push(`+1 VP / 3🪙`);
      else if (eff.rule.type === 'alexanderTokenBonus') parts.push(`+1 VP / victory token`);
    }
    else if (eff.kind === 'leaderActivated') parts.push('Once/turn: 1🪙 → 1 resource');
    else if (eff.kind === 'leaderOnRecruit') parts.push('On play: build a card from the discard for free');
  }
  return parts.join(' · ') || '—';
}

function cardEffectText(c: SwCard): string {
  return c.name + (c.cost.resources?.length ? ` (${c.cost.resources.join('+')})` : '');
}
