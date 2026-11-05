// Babel — UI: the tile draft overlay, the tower and the current Great Project
// on the table, and a failed project's "discard a card" choice. Lazily loaded
// (it draws with the game's art).

import { sharedDeviceHumans } from '@/core/seats';
import type { SwOverlayProps, SwTablePanelProps } from '../types';
import { CardFace, CostIcons } from '../../Card';
import { BabelArt, ColorChip, ParticipationIcon, TileIcon } from '../../art';
import { babelTileById, greatProjectById, penaltyText, rewardText, towerVp } from './cards';
import { activeTiles, towerSpaces } from './tower';
import { penaltyChoices } from './projects';

function seatName(state: SwOverlayProps['state'], id: string | null | undefined): string {
  return state.seats.find((s) => s.id === id)?.name ?? id ?? '?';
}

/** The tile draft (before Age I). */
export function TowerOverlay({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const me = state.players.find((p) => p.id === localPlayerId);
  const hand = state.babelDraftHands?.[localPlayerId ?? ''] ?? [];
  const submitted = me?.babelDraftPick != null;
  const picked = state.players.filter((p) => p.babelDraftPick != null).length;
  const hide = submitted && sharedDeviceHumans(state.seats) >= 2;
  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span className="sw-h-icon"><TileIcon size={20} /> Tower of Babel · tile draft, round {state.babelDraftRound} of 2</span>
        <span className="sw-hint">Picked {picked} / {state.players.length}</span>
      </h3>
      <p className="sw-hint">Keep one tile; the rest pass to the player on your right (the last one is kept). Your tiles: {(me?.babelHand ?? []).map((t) => `#${t}`).join(', ') || 'none yet'}.</p>
      {!me ? <p className="sw-empty">Spectator — the tile hands are hidden.</p>
        : hide ? <p className="sw-empty">Your pick is locked in; your tiles are hidden while the others pick.</p>
        : (
          <div className="sw-tile-choices">
            {hand.map((id) => (
              <button key={id} className={`sw-tile-choice ${me.babelDraftPick === id ? 'on' : ''}`} disabled={submitted}
                onClick={() => dispatch({ type: 'submitBabelDraft', playerId: me.id, tileId: id })}>
                <TileIcon n={id} size={30} /><span>{babelTileById(id).text}</span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

/** The tower: the tiles showing (their rules in force) and what lies under them. */
export function TowerPanel({ state, localPlayerId }: SwTablePanelProps) {
  const tower = state.babelTower ?? Array.from({ length: towerSpaces(state.players.length) }, () => []);
  const active = activeTiles(state);
  const me = state.players.find((p) => p.id === localPlayerId);
  return (
    <div className="sw-panel sw-tower">
      <div className="sw-tower-art"><BabelArt kind="tower" /></div>
      <div className="sw-tower-body">
        <h4><TileIcon size={16} /> Tower of Babel {active.size === 0 && <span className="sw-hint">— no tile built yet</span>}</h4>
        <div className="sw-tower-spaces">
          {tower.map((stack, i) => {
            const top = stack[stack.length - 1];
            return (
              <div key={i} className={`sw-tower-space ${top ? 'on' : ''} ${(state.babelNextSpace ?? 0) % tower.length === i ? 'next' : ''}`}
                title={top ? babelTileById(top).text : 'Empty'}>
                {top ? <><TileIcon n={top} size={22} /><span>{babelTileById(top).text}</span></> : <span className="sw-hint">empty</span>}
                {stack.length > 1 && <span className="sw-hint"> (covers {stack.slice(0, -1).map((t) => `#${t}`).join(', ')})</span>}
              </div>
            );
          })}
        </div>
        {me && (me.babelHand ?? []).length > 0 && (
          <p className="sw-hint">Your tiles: {(me.babelHand ?? []).map((t) => `#${t}`).join(', ')} · built {me.babelBuilt ?? 0} ({towerVp(me.babelBuilt ?? 0)} VP)</p>
        )}
      </div>
    </div>
  );
}

/** The current Age's Great Project. */
export function ProjectPanel({ state, localPlayerId }: SwTablePanelProps) {
  const pr = state.project;
  if (!pr) return null;
  const card = greatProjectById(pr.projectId);
  const total = state.players.length - 1;
  const joined = state.players.filter((p) => (p.participations ?? 0) > 0);
  const me = state.players.find((p) => p.id === localPlayerId);
  return (
    <div className="sw-panel sw-project">
      <div className="sw-tower-art"><BabelArt kind="project" /></div>
      <div className="sw-tower-body">
        <h4>
          <ColorChip color={card.color} size={16} /> Great Project · {card.name}
          <span className="sw-hint"> — {pr.outcome === null ? `${pr.tokensLeft} of ${total} tokens left` : pr.outcome === 'success' ? 'built!' : 'failed'}</span>
        </h4>
        <p className="sw-plan-row">Join: build a {card.color} card and pay <CostIcons cost={card.cost} size={15} /></p>
        <p className="sw-plan-row"><strong>Reward</strong> (per token, if every token is taken): {rewardText(card.reward)}</p>
        <p className="sw-plan-row"><strong>Penalty</strong> (if not, for each city without a token): {penaltyText(card.penalty)}</p>
        <p className="sw-hint">
          {Array.from({ length: Math.max(0, total - pr.tokensLeft) }, (_, i) => <ParticipationIcon key={i} size={15} />)}
          {joined.length > 0 ? ` Joined: ${joined.map((p) => `${seatName(state, p.id)}${(p.participations ?? 0) > 1 ? ` ×${p.participations}` : ''}`).join(', ')}` : ' Nobody has joined yet.'}
          {me && (me.participations ?? 0) > 0 && ' (you are in)'}
        </p>
      </div>
    </div>
  );
}

/** A failed project: the penalised cities choose the card they discard. */
export function ProjectPenaltyOverlay({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const queue = state.projectPenaltyQueue ?? [];
  const me = state.players.find((p) => p.id === localPlayerId);
  const card = state.project ? greatProjectById(state.project.projectId) : null;
  if (!me || !queue.includes(me.id) || !card) {
    return (
      <div className="sw-panel sw-hand-area">
        <h3><span>The Great Project failed</span></h3>
        <p className="sw-hint">{queue.map((id) => seatName(state, id)).join(', ')} {queue.length === 1 ? 'is' : 'are'} choosing the card to discard…</p>
      </div>
    );
  }
  const choices = new Set(penaltyChoices(state, me));
  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span>{card.name} failed — {penaltyText(card.penalty)}</span>
        <span className="sw-hint">You didn't take part, so you pay the penalty.</span>
      </h3>
      <div className="sw-hand">
        {me.tableau.filter((c) => choices.has(c.id)).map((c) => (
          <CardFace key={c.id} card={c} size="md" onClick={() => dispatch({ type: 'projectPenalty', playerId: me.id, cardId: c.id })} />
        ))}
      </div>
    </div>
  );
}
