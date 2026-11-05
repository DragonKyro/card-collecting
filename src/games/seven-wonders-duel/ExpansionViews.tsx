// 7 Wonders Duel — the expansions' table pieces and decision panels.
//
// Pantheon: the board's 6 spaces (face down in Age I — the viewer sees the
// name of a Divinity only if they placed it), the Mythology decks (counts
// only), the tokens on Enki; invoking from a space. Agora: the Senate (6
// Chambers, cubes per seat, the controller, Decrees face up or down), each
// player's cubes and Conspiracies — the viewer's own face up, the
// opponent's face down until triggered.
//
// Every decision is answered with `[data-choice]` elements; a decision in
// two steps (place a Divinity: which, then where; Isis: the card, then the
// wonder; Coercion: theirs, then yours; a Decree: from, then to) shows the
// second step once the first is picked. Hidden things (the decks, the box,
// what the opponent drew) only ever show to the player deciding.

import { useEffect, useState, type ReactNode } from 'react';
import type {
  DuelAction, DuelCard, DuelConspiracyId, DuelDivinityId, DuelMilitaryToken, DuelPlayer, DuelProgressTokenId,
  DuelState,
} from './types';
import { divinityById, divinityCost, MYTHOLOGIES, mythologyInfo, offeringChoices, spaceCost } from './pantheon';
import { CHAMBER_COUNT, CHAMBER_VP, chamberController, conspiracyById, decreeById, sectionChambers } from './agora';
import { progressTokenById } from './progress';
import { wonderById } from './wonders';
import { purse } from './resources';
import { backRowCards, gateOptions, militaryTokensLeft, swapOptions, treasonCards } from './reducer';
import { CardFace, ProgressToken, WonderCard } from './Card';
import { CoinIcon } from './art';
import {
  ConspiracyArt, ConspiracyBackArt, CubeIcon, DecreeArt, DecreeBackArt, DivinityBackArt, DivinityEmblem,
  MythologyTokenArt, OfferingTokenArt,
} from './artExpansions';

type Dispatch = (a: DuelAction) => void;

const other = (s: 0 | 1): 0 | 1 => (1 - s) as 0 | 1;
const nameOf = (state: DuelState, seat: 0 | 1) => state.seats[seat]?.name ?? state.players[seat].id;
const seatColor = (state: DuelState, seat: 0 | 1) => state.seats[seat]?.color ?? '#888';

function choiceProps(onPick: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    'data-choice': '',
    onClick: onPick,
    onKeyDown: (e: { key: string; preventDefault(): void }) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); }
    },
  } as const;
}

// ===================================================================
// Pantheon
// ===================================================================

/** A Divinity tile: emblem, name and (optionally) its text. */
export function DivinityTile({ id, footer, onPick, selected = false, compact = false }: {
  id: DuelDivinityId; footer?: ReactNode; onPick?: () => void; selected?: boolean; compact?: boolean;
}) {
  const d = divinityById(id);
  return (
    <div
      className={`swd-divinity ${compact ? 'compact' : ''} ${onPick ? 'pickable' : ''} ${selected ? 'selected' : ''}`}
      title={`${d.name}${d.mythology ? ` (${mythologyInfo(d.mythology).name})` : ''} — ${d.description}`}
      {...(onPick ? choiceProps(onPick) : {})}
    >
      <DivinityEmblem id={id} mythology={d.mythology} size={compact ? 26 : 36} />
      <div className="swd-divinity-text">
        <strong>{d.name}</strong>
        {!compact && <span>{d.description}</span>}
        {footer}
      </div>
    </div>
  );
}

export function PantheonBoard({ state, viewerSeatIdx, canInvoke, selectedSpace, onPickSpace }: {
  state: DuelState; viewerSeatIdx: 0 | 1; canInvoke: boolean; selectedSpace: number | null; onPickSpace: (space: number) => void;
}) {
  const pan = state.pantheon;
  if (!pan) return null;
  const me = state.players[viewerSeatIdx];
  const best = offeringChoices(me.pantheon?.offeringTokens ?? []).at(-1) ?? [];
  return (
    <section className="swd-board-box swd-pantheon" aria-label="Pantheon">
      <h4>
        Pantheon <span className="swd-dim">{pan.revealed ? '· invoke a Divinity instead of taking a card' : '· face down until Age II'}</span>
      </h4>
      <div className="swd-pantheon-spaces">
        {pan.spaces.map((sp, i) => {
          const cost = spaceCost(state, viewerSeatIdx, i);
          const label = `Space ${i + 1}`;
          if (!sp) {
            return (
              <div key={i} className="swd-space empty" title={`${label} — empty`}>
                <span className="swd-space-label">{label}</span>
                <span className="swd-space-cost"><CoinIcon value={cost} size={16} /></span>
              </div>
            );
          }
          if (!pan.revealed) {
            const mine = sp.placedBy === viewerSeatIdx;
            const m = divinityById(sp.divinity).mythology!;
            return (
              <div key={i} className={`swd-space hidden-divinity ${mine ? 'mine' : ''}`} title={mine ? `${divinityById(sp.divinity).name} (only you know)` : `A ${mythologyInfo(m).name} Divinity`}>
                <span className="swd-space-label">{label}</span>
                {mine ? <DivinityEmblem id={sp.divinity} mythology={m} size={34} /> : <DivinityBackArt mythology={m} size={34} />}
                <span className="swd-space-name">{mine ? divinityById(sp.divinity).name : mythologyInfo(m).name}</span>
                <span className="swd-space-cost"><CoinIcon value={cost} size={16} /></span>
              </div>
            );
          }
          const d = divinityById(sp.divinity);
          const lowest = divinityCost(state, viewerSeatIdx, i, best);
          const affordable = canInvoke && lowest <= purse(me);
          return (
            <div
              key={i}
              className={`swd-space ${affordable ? 'pickable' : ''} ${selectedSpace === i ? 'selected' : ''}`}
              title={`${label}: ${d.name} — ${d.description}`}
              {...(affordable ? choiceProps(() => onPickSpace(i)) : {})}
            >
              <span className="swd-space-label">{label}</span>
              <DivinityEmblem id={sp.divinity} mythology={d.mythology} size={34} />
              <span className="swd-space-name">{d.name}</span>
              <span className="swd-space-cost"><CoinIcon value={divinityCost(state, viewerSeatIdx, i)} size={16} /></span>
            </div>
          );
        })}
      </div>
      <div className="swd-pantheon-foot">
        {MYTHOLOGIES.map((m) => (
          <span key={m.id} className="swd-myth-deck" title={`${m.name} deck: ${pan.decks[m.id].length} face down`}>
            <DivinityBackArt mythology={m.id} size={20} /> {pan.decks[m.id].length}
          </span>
        ))}
        {pan.enkiTokens.length > 0 && (
          <span className="swd-enki" title="On Enki">
            On Enki: {pan.enkiTokens.map((t) => <ProgressToken key={t} id={t} size={20} />)}
          </span>
        )}
      </div>
    </section>
  );
}

/** Invoking the selected space: Offering tokens to use, the price, Invoke. */
export function InvokePanel({ state, viewerSeatIdx, space, dispatch, onClear }: {
  state: DuelState; viewerSeatIdx: 0 | 1; space: number; dispatch: Dispatch; onClear: () => void;
}) {
  // Which of the player's Offering tokens (by index) to spend.
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [space]);
  const sp = state.pantheon?.spaces[space];
  const me = state.players[viewerSeatIdx];
  if (!sp) return null;
  const owned = me.pantheon?.offeringTokens ?? [];
  const use = picked.filter((i) => i < owned.length).map((i) => owned[i]);
  const cost = divinityCost(state, viewerSeatIdx, space, use);
  const can = cost <= purse(me);
  const toggle = (idx: number) => setPicked(picked.includes(idx) ? picked.filter((i) => i !== idx) : [...picked, idx]);
  return (
    <div className="swd-pick-panel">
      <p className="swd-pick-hint">Invoke {divinityById(sp.divinity).name}?</p>
      <DivinityTile id={sp.divinity} />
      {owned.length > 0 && (
        <div className="swd-offerings">
          <span className="swd-pick-sub">Use Offering tokens:</span>
          {owned.map((v, i) => {
            const on = picked.includes(i);
            return (
              <button key={i} type="button" className={`swd-offering-toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(i)}>
                <OfferingTokenArt value={v} size={22} />
              </button>
            );
          })}
        </div>
      )}
      <div className="swd-pick-buttons">
        <button disabled={!can} onClick={() => { dispatch({ type: 'invokeDivinity', playerId: me.id, space, ...(use.length ? { offerings: use } : {}) }); onClear(); }}>
          <span>Invoke</span>
          <span className="swd-btn-cost"><CoinIcon value={cost} size={18} /></span>
        </button>
        <button className="secondary swd-btn-cancel" onClick={onClear}>Cancel</button>
      </div>
      <div className="swd-pick-sub">You have <CoinIcon value={purse(me)} size={16} /> coins.</div>
    </div>
  );
}

// ===================================================================
// Agora: the Senate
// ===================================================================

export function SenateBoard({ state, highlight = [] }: { state: DuelState; highlight?: number[] }) {
  const ag = state.agora;
  if (!ag) return null;
  return (
    <section className="swd-board-box swd-senate" aria-label="Senate">
      <h4>Senate <span className="swd-dim">· most cubes controls a Chamber and its Decree</span></h4>
      <div className="swd-chambers">
        {Array.from({ length: CHAMBER_COUNT }, (_, c) => {
          const ctrl = chamberController(ag, c);
          return (
            <div
              key={c}
              className={`swd-chamber ${ctrl !== null ? 'controlled' : ''} ${highlight.includes(c) ? 'highlight' : ''}`}
              style={ctrl !== null ? { ['--swd-ctrl' as string]: seatColor(state, ctrl) } : undefined}
              data-chamber={c + 1}
              title={`Chamber ${c + 1} (${['left', 'centre', 'right'][Math.floor(c / 2)]} section) — ${CHAMBER_VP[c]} VP${ctrl !== null ? `, controlled by ${nameOf(state, ctrl)}` : ''}`}
            >
              <div className="swd-chamber-head">
                <span>{c + 1}</span>
                <span className="swd-chamber-vp">{CHAMBER_VP[c]} VP</span>
              </div>
              <div className="swd-chamber-decrees">
                {ag.decrees[c].length === 0 && <span className="swd-dim">no Decree</span>}
                {ag.decrees[c].map((d, i) => (
                  d.faceUp ? (
                    <span key={i} className="swd-decree" title={`${decreeById(d.id).name}: ${decreeById(d.id).description}`}>
                      <DecreeArt id={d.id} size={30} />
                      <span className="swd-decree-name">{decreeById(d.id).name}</span>
                    </span>
                  ) : (
                    <span key={i} className="swd-decree" title="A face-down Decree (turns up once someone controls the Chamber)">
                      <DecreeBackArt size={30} />
                    </span>
                  )
                ))}
              </div>
              <div className="swd-chamber-cubes">
                {([0, 1] as const).map((seat) => (
                  <span key={seat} className={`swd-cubes ${ag.chambers[c][seat] ? '' : 'none'}`} title={`${nameOf(state, seat)}: ${ag.chambers[c][seat]}`}>
                    <CubeIcon color={seatColor(state, seat)} size={14} /> {ag.chambers[c][seat]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ===================================================================
// Player extras
// ===================================================================

/** A seat's Pantheon and Agora holdings, as the viewer may see them. */
export function PlayerExtras({ state, seatIdx, viewerSeatIdx }: { state: DuelState; seatIdx: 0 | 1; viewerSeatIdx: 0 | 1 }) {
  const p = state.players[seatIdx];
  const pan = p.pantheon;
  const ag = p.agora;
  if (!pan && !ag) return null;
  const mine = seatIdx === viewerSeatIdx;
  return (
    <div className="swd-player-extras">
      {pan && pan.astarteCoins > 0 && (
        <span className="swd-extra" title="Coins on Astarte: spendable, safe from coin losses, 1 VP each">
          <DivinityEmblem id="astarte" mythology="phoenician" size={18} /> <CoinIcon value={pan.astarteCoins} size={18} />
        </span>
      )}
      {pan && pan.divinities.length > 0 && (
        <span className="swd-extra" title="Divinities invoked">
          {pan.divinities.map((d, i) => (
            <span key={i} className="swd-owned-divinity" title={`${divinityById(d).name} — ${divinityById(d).description}`}>
              <DivinityEmblem id={d} mythology={divinityById(d).mythology} size={20} />
            </span>
          ))}
        </span>
      )}
      {pan && pan.mythologyTokens.length > 0 && (
        <span className="swd-extra" title="Mythology tokens (they make Grand Temples free)">
          {pan.mythologyTokens.map((m, i) => <MythologyTokenArt key={i} mythology={m} size={20} />)}
        </span>
      )}
      {pan && pan.offeringTokens.length > 0 && (
        <span className="swd-extra" title="Offering tokens (a discount on a Divinity, once)">
          {pan.offeringTokens.map((v, i) => <OfferingTokenArt key={i} value={v} size={20} />)}
        </span>
      )}
      {pan?.snake && (
        <span className="swd-extra" title={`The Snake (Nisaba) lends the symbol of ${state.cardsById[pan.snake.cardId]?.name ?? 'a green card'}`}>
          <DivinityEmblem id="nisaba" mythology="mesopotamian" size={18} />
        </span>
      )}
      {ag && (
        <span className="swd-extra" title={`${ag.cubes} Influence cubes left`}>
          <CubeIcon color={seatColor(state, seatIdx)} size={16} /> {ag.cubes}
        </span>
      )}
      {ag && ag.conspiracies.length > 0 && (
        <span className="swd-extra swd-conspiracies" aria-label={`${mine ? 'Your' : `${nameOf(state, seatIdx)}'s`} Conspiracies`}>
          {ag.conspiracies.map((c, i) => {
            const shown = c.triggered || mine;
            const prepared = c.preparedWith !== null;
            const info = shown ? conspiracyById(c.id) : null;
            return (
              <span
                key={i}
                className={`swd-conspiracy ${c.triggered ? 'triggered' : ''} ${prepared ? 'prepared' : ''} ${shown ? '' : 'face-down'}`}
                title={info ? `${info.name}${c.triggered ? ' (triggered)' : prepared ? ' (prepared)' : ''} — ${info.description}` : prepared ? 'A prepared Conspiracy' : 'A Conspiracy'}
              >
                {shown ? <ConspiracyArt id={c.id} size={24} /> : <ConspiracyBackArt size={24} />}
                {info && <span className="swd-conspiracy-name">{info.name}</span>}
                {prepared && !c.triggered && <span className="swd-tag">ready</span>}
              </span>
            );
          })}
        </span>
      )}
    </div>
  );
}

// ===================================================================
// Decisions
// ===================================================================

/** Sub-phase titles: [the decider's, everyone else's]. */
export const EXPANSION_TITLES: Partial<Record<DuelState['subPhase'], [string, string]>> = {
  placeDivinity: ['place a Divinity in the Pantheon', 'placing a Divinity'],
  enki: ['Enki: keep a Progress token', 'choosing on Enki'],
  snake: ["Nisaba: the Snake on an opponent's green card", 'placing the Snake'],
  takeCard: ['take a brown or gray card', 'taking a card'],
  zeus: ['Zeus: discard any card of the structure', 'invoking Zeus'],
  anubis: ['Anubis: un-build a wonder', 'invoking Anubis'],
  isis: ['Isis: build a wonder with a discarded card', 'invoking Isis'],
  takeWonder: ["take an opponent's unbuilt wonder", 'taking a wonder'],
  minerva: ["Minerva: place her pawn", 'placing Minerva'],
  neptuneDiscard: ['Neptune: discard a military token', 'invoking Neptune'],
  neptuneApply: ['Neptune: apply a military token', 'invoking Neptune'],
  gate: ['the Gate: invoke a revealed Divinity', 'at the Gate'],
  theaterDeck: ['the Divine Theater: pick a Mythology deck', 'at the Divine Theater'],
  theater: ['the Divine Theater: invoke a Divinity', 'at the Divine Theater'],
  senate: ['Senate actions', 'taking Senate actions'],
  placeInfluence: ['place an Influence cube', 'placing a cube'],
  moveInfluence: ['move an Influence cube?', 'moving a cube'],
  removeInfluence: ["remove an opponent's cube", 'removing a cube'],
  conspirator: ['a Conspirator: a cube, or Conspire', 'with a Conspirator'],
  conspire: ['Conspire: keep a Conspiracy', 'conspiring'],
  remnant: ['the other Conspiracy: top or bottom?', 'conspiring'],
  triggerUnprepared: ['Curia Julia: trigger a Conspiracy?', 'at Curia Julia'],
  lockToken: ['Obscurantism: lock a Progress token away', 'triggering Obscurantism'],
  backRowBuild: ['Property Fraud: build a back-row card', 'triggering Property Fraud'],
  boxBuild: ['Treason: build a boxed card', 'triggering Treason'],
  espionage: ['Espionage: take a boxed token', 'triggering Espionage'],
  discardAvailable: ['Turn of Events: discard an accessible card', 'triggering Turn of Events'],
  swap: ['Coercion: swap a card', 'triggering Coercion'],
  moveDecree: ['Insider Influence: move a Decree', 'triggering Insider Influence'],
  sabotage: ["Sabotage: return a built wonder to the box", 'triggering Sabotage'],
};

/** The decider's panel for every expansion decision. */
export function ExpansionDecision({ state, viewerSeatIdx, dispatch }: { state: DuelState; viewerSeatIdx: 0 | 1; dispatch: Dispatch }) {
  const me = state.players[viewerSeatIdx];
  const opp = state.players[other(viewerSeatIdx)];
  const playerId = me.id;
  const p = state.pending[0];
  const [step, setStep] = useState<string | number | null>(null);
  // A new decision starts over.
  useEffect(() => setStep(null), [state.subPhase, state.logSeq]);
  const send = (a: DuelAction) => { setStep(null); dispatch(a); };
  const skip = (label: string) => (
    <button className="secondary" {...choiceProps(() => send({ type: 'skip', playerId }))}>{label}</button>
  );
  const cards = (list: DuelCard[], onPick: (c: DuelCard) => void, size: 'sm' | 'md' = 'sm') => (
    <div className="swd-card-choices">
      {list.map((c) => <CardFace key={c.id} card={c} size={size} className="pickable" onClick={() => onPick(c)} />)}
    </div>
  );
  const chamberButtons = (list: number[], onPick: (c: number) => void) => (
    <div className="swd-chamber-choices">
      {list.map((c) => <button key={c} {...choiceProps(() => onPick(c))}>Chamber {c + 1}</button>)}
    </div>
  );
  const tokens = (ids: DuelProgressTokenId[], onPick: (t: DuelProgressTokenId) => void) => (
    <div className="swd-token-choices">
      {ids.map((tid) => {
        const t = progressTokenById(tid);
        return (
          <div key={tid} className="swd-progress-choice pickable" {...choiceProps(() => onPick(tid))}>
            <ProgressToken id={tid} size={40} />
            <div><strong>{t.name}</strong><span>{t.description}</span></div>
          </div>
        );
      })}
    </div>
  );
  const wonders = (ids: string[], onPick: (w: string) => void) => (
    <div className="swd-wonder-choices">
      {ids.map((w) => <WonderCard key={w} wonder={wonderById(w)} size="sm" className="pickable" onClick={() => onPick(w)} />)}
    </div>
  );
  const ag = state.agora;
  const myCubeChambers = ag ? Array.from({ length: CHAMBER_COUNT }, (_, c) => c).filter((c) => ag.chambers[c][viewerSeatIdx] > 0) : [];
  const moveTargets = (from: number) => [from - 1, from + 1].filter((t) => t >= 0 && t < CHAMBER_COUNT);
  const moveStep = (onDone: (from: number, to: number) => void) => (
    typeof step === 'number' ? (
      <>
        <p className="swd-pick-sub">Move the cube from Chamber {step + 1} to:</p>
        {chamberButtons(moveTargets(step), (to) => onDone(step, to))}
      </>
    ) : (
      <>
        <p className="swd-pick-sub">Move one of your cubes from:</p>
        {chamberButtons(myCubeChambers, (c) => setStep(c))}
      </>
    )
  );
  const body = ((): ReactNode => {
    switch (state.subPhase) {
      case 'placeDivinity': {
        if (p?.kind !== 'placeDivinity') return null;
        const empty = state.pantheon!.spaces.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
        if (typeof step !== 'string') {
          return (
            <>
              <p className="swd-pick-sub">You drew these {mythologyInfo(p.mythology).name} Divinities: place one face down (only its Mythology shows to your opponent); the other goes back on its deck.</p>
              <div className="swd-divinity-choices">
                {(p.options ?? []).map((d) => <DivinityTile key={d} id={d} onPick={() => setStep(d)} />)}
              </div>
            </>
          );
        }
        return (
          <>
            <DivinityTile id={step as DuelDivinityId} compact />
            <p className="swd-pick-sub">On which space? (its cost for you)</p>
            <div className="swd-chamber-choices">
              {empty.map((i) => (
                <button key={i} {...choiceProps(() => send({ type: 'placeDivinity', playerId, divinity: step as DuelDivinityId, space: i }))}>
                  Space {i + 1} <CoinIcon value={spaceCost(state, viewerSeatIdx, i)} size={14} />
                </button>
              ))}
            </div>
            <button className="secondary swd-btn-cancel" onClick={() => setStep(null)}>Back</button>
          </>
        );
      }
      case 'enki': return tokens(state.pantheon?.enkiTokens ?? [], (tokenId) => send({ type: 'chooseProgressToken', playerId, tokenId }));
      case 'espionage': return tokens(state.progressBox, (tokenId) => send({ type: 'chooseProgressToken', playerId, tokenId }));
      case 'snake':
        return cards(opp.tableau.filter((c) => c.color === 'green'), (c) => send({ type: 'placeSnake', playerId, cardId: c.id }));
      case 'takeCard':
        return cards(opp.tableau.filter((c) => c.color === 'brown' || c.color === 'gray'), (c) => send({ type: 'takeCard', playerId, cardId: c.id }));
      case 'zeus':
        return <p className="swd-pick-sub">Click any card of the structure, face up or face down.</p>;
      case 'discardAvailable':
        return (
          <>
            <p className="swd-pick-sub">Click an accessible card of the structure.</p>
            {p?.kind === 'discardAvailable' && p.optional && skip('No second card')}
          </>
        );
      case 'anubis':
        return wonders(state.players.flatMap((x) => x.wonders.filter((w) => w.built).map((w) => w.wonderId)), (wonderId) => send({ type: 'chooseWonder', playerId, wonderId }));
      case 'takeWonder':
        return wonders(opp.wonders.filter((w) => !w.built).map((w) => w.wonderId), (wonderId) => send({ type: 'chooseWonder', playerId, wonderId }));
      case 'sabotage':
        return wonders(opp.wonders.filter((w) => w.built).map((w) => w.wonderId), (wonderId) => send({ type: 'chooseWonder', playerId, wonderId }));
      case 'isis': {
        if (typeof step !== 'number') {
          return (
            <>
              <p className="swd-pick-sub">Pick a discarded card…</p>
              {cards(state.discard.slice().reverse(), (c) => setStep(c.id))}
            </>
          );
        }
        return (
          <>
            <p className="swd-pick-sub">…and the wonder to build with it, for free.</p>
            {wonders(me.wonders.filter((w) => !w.built).map((w) => w.wonderId), (wonderId) => send({ type: 'wonderFromDiscard', playerId, cardId: step, wonderId }))}
            <button className="secondary swd-btn-cancel" onClick={() => setStep(null)}>Back</button>
          </>
        );
      }
      case 'minerva': {
        const toward = viewerSeatIdx === 0 ? -1 : 1;
        return (
          <>
            <p className="swd-pick-sub">The conflict pawn will stop before entering her space.</p>
            <div className="swd-minerva-track">
              {Array.from({ length: 19 }, (_, i) => i - 9).map((pos) => {
                const rel = (pos - state.militaryPawn) * toward;
                const label = rel > 0 ? `${rel} toward you` : `${-rel} toward ${nameOf(state, other(viewerSeatIdx))}`;
                return pos === state.militaryPawn
                  ? <span key={pos} className="swd-minerva-cell pawn" title="The conflict pawn">◆</span>
                  : <button key={pos} className="swd-minerva-cell" title={label} aria-label={`Space ${pos}: ${label}`} {...choiceProps(() => send({ type: 'placeMinerva', playerId, position: pos }))}>{Math.abs(pos)}</button>;
              })}
            </div>
          </>
        );
      }
      case 'neptuneDiscard':
      case 'neptuneApply': {
        const apply = state.subPhase === 'neptuneApply';
        const side = (t: DuelMilitaryToken) => (t.startsWith('p1') ? nameOf(state, 1) : nameOf(state, 0));
        return (
          <>
            <p className="swd-pick-sub">{apply ? (ag ? 'Its effect: a Senate action for you.' : 'Your opponent loses its coins.') : 'It is discarded without effect.'}</p>
            <div className="swd-chamber-choices">
              {militaryTokensLeft(state).map((t) => (
                <button key={t} {...choiceProps(() => send({ type: 'chooseMilitaryToken', playerId, token: t }))}>
                  {t.endsWith('6') ? 'Large' : 'Small'} token on {side(t)}&rsquo;s side
                </button>
              ))}
            </div>
          </>
        );
      }
      case 'gate':
        return (
          <div className="swd-divinity-choices">
            {gateOptions(state).map((d) => <DivinityTile key={d} id={d} onPick={() => send({ type: 'chooseDivinity', playerId, divinity: d })} />)}
          </div>
        );
      case 'theaterDeck':
        return (
          <div className="swd-chamber-choices">
            {MYTHOLOGIES.filter((m) => (state.pantheon?.decks[m.id].length ?? 0) > 0).map((m) => (
              <button key={m.id} {...choiceProps(() => send({ type: 'chooseMythology', playerId, mythology: m.id }))}>
                <DivinityBackArt mythology={m.id} size={18} /> {m.name} ({state.pantheon!.decks[m.id].length})
              </button>
            ))}
          </div>
        );
      case 'theater': {
        if (p?.kind !== 'theater') return null;
        const deck = state.pantheon!.decks[p.mythology];
        if (typeof step !== 'string') {
          return (
            <div className="swd-divinity-choices">
              {deck.map((d) => (
                <DivinityTile key={d} id={d} onPick={() => (deck.length === 3 ? setStep(d) : send({ type: 'chooseDivinity', playerId, divinity: d }))} />
              ))}
            </div>
          );
        }
        const rest = deck.filter((d) => d !== step);
        return (
          <>
            <DivinityTile id={step as DuelDivinityId} compact />
            <p className="swd-pick-sub">Which of the others goes back on top of the deck?</p>
            <div className="swd-divinity-choices">
              {rest.map((d) => <DivinityTile key={d} id={d} compact onPick={() => send({ type: 'chooseDivinity', playerId, divinity: step as DuelDivinityId, top: d })} />)}
            </div>
          </>
        );
      }
      case 'senate': {
        if (p?.kind !== 'senate') return null;
        const canPlace = (me.agora?.cubes ?? 0) > 0;
        return (
          <>
            <p className="swd-pick-sub">{p.left} action{p.left === 1 ? '' : 's'} left: place a cube in the {['left', 'centre', 'right'][p.section - 1]} section, or move one of yours to the next Chamber.</p>
            {canPlace && typeof step !== 'number' && chamberButtons(sectionChambers(p.section), (c) => send({ type: 'placeInfluence', playerId, chamber: c + 1 }))}
            {myCubeChambers.length > 0 && moveStep((from, to) => send({ type: 'moveInfluence', playerId, from: from + 1, to: to + 1 }))}
            {skip('Done')}
          </>
        );
      }
      case 'placeInfluence':
        return chamberButtons(Array.from({ length: CHAMBER_COUNT }, (_, c) => c), (c) => send({ type: 'placeInfluence', playerId, chamber: c + 1 }));
      case 'moveInfluence':
        return (
          <>
            {moveStep((from, to) => send({ type: 'moveInfluence', playerId, from: from + 1, to: to + 1 }))}
            {skip("Don't move")}
          </>
        );
      case 'removeInfluence':
        return chamberButtons(
          ag ? Array.from({ length: CHAMBER_COUNT }, (_, c) => c).filter((c) => ag.chambers[c][other(viewerSeatIdx)] > 0) : [],
          (c) => send({ type: 'removeInfluence', playerId, chamber: c + 1 }),
        );
      case 'conspirator':
        return (
          <div className="swd-pick-buttons">
            {(me.agora?.cubes ?? 0) > 0 && <button {...choiceProps(() => send({ type: 'conspiratorChoice', playerId, choice: 'influence' }))}>Place an Influence cube</button>}
            {(ag?.conspiracyDeck.length ?? 0) > 0 && <button {...choiceProps(() => send({ type: 'conspiratorChoice', playerId, choice: 'conspire' }))}>Conspire (draw 2, keep 1)</button>}
          </div>
        );
      case 'conspire':
        return p?.kind === 'conspire' ? (
          <div className="swd-conspiracy-choices">
            {(p.options ?? []).map((c) => <ConspiracyTile key={c} id={c} onPick={() => send({ type: 'chooseConspiracy', playerId, conspiracy: c })} />)}
          </div>
        ) : null;
      case 'remnant':
        return p?.kind === 'remnant' ? (
          <>
            <ConspiracyTile id={p.conspiracy} />
            <div className="swd-pick-buttons">
              <button {...choiceProps(() => send({ type: 'placeRemnant', playerId, top: true }))}>On top of the deck</button>
              <button className="secondary" {...choiceProps(() => send({ type: 'placeRemnant', playerId, top: false }))}>At the bottom</button>
            </div>
          </>
        ) : null;
      case 'triggerUnprepared':
        return (
          <>
            <div className="swd-conspiracy-choices">
              {(me.agora?.conspiracies ?? []).filter((c) => !c.triggered && c.preparedWith === null).map((c) => (
                <ConspiracyTile key={c.id} id={c.id} onPick={() => send({ type: 'triggerConspiracy', playerId, conspiracy: c.id })} />
              ))}
            </div>
            {skip('Trigger none')}
          </>
        );
      case 'lockToken':
        return (
          <>
            {state.progressOffer.length > 0 && <p className="swd-pick-sub">On the board</p>}
            {tokens(state.progressOffer, (tokenId) => send({ type: 'lockProgressToken', playerId, tokenId }))}
            {opp.progressTokens.length > 0 && <p className="swd-pick-sub">{nameOf(state, other(viewerSeatIdx))}&rsquo;s</p>}
            {tokens(opp.progressTokens, (tokenId) => send({ type: 'lockProgressToken', playerId, tokenId }))}
            {state.progressBox.length > 0 && <p className="swd-pick-sub">In the box (only you see these)</p>}
            {tokens(state.progressBox, (tokenId) => send({ type: 'lockProgressToken', playerId, tokenId }))}
          </>
        );
      case 'backRowBuild':
        return cards(backRowCards(state), (c) => send({ type: 'buildCard', playerId, cardId: c.id }));
      case 'boxBuild':
        return (
          <>
            <p className="swd-pick-sub">The cards returned to the box unseen (only you see them):</p>
            {cards(treasonCards(state), (c) => send({ type: 'buildCard', playerId, cardId: c.id }))}
          </>
        );
      case 'swap': {
        const opts = swapOptions(state, viewerSeatIdx);
        if (typeof step !== 'number') {
          const theirs = [...new Map(opts.map(([t]) => [t.id, t])).values()];
          return (
            <>
              <p className="swd-pick-sub">Take one of {nameOf(state, other(viewerSeatIdx))}&rsquo;s cards…</p>
              {cards(theirs, (c) => setStep(c.id))}
            </>
          );
        }
        return (
          <>
            <p className="swd-pick-sub">…and give one of yours of the same colour.</p>
            {cards(opts.filter(([t]) => t.id === step).map(([, g]) => g), (g) => send({ type: 'swapCards', playerId, takeId: step, giveId: g.id }))}
            <button className="secondary swd-btn-cancel" onClick={() => setStep(null)}>Back</button>
          </>
        );
      }
      case 'moveDecree': {
        if (!ag) return null;
        const withDecree = Array.from({ length: CHAMBER_COUNT }, (_, c) => c).filter((c) => ag.decrees[c].length > 0);
        if (typeof step !== 'number') {
          return (
            <>
              <p className="swd-pick-sub">Move the Decree of Chamber…</p>
              {chamberButtons(withDecree, (c) => setStep(c))}
            </>
          );
        }
        return (
          <>
            <p className="swd-pick-sub">…from Chamber {step + 1} to Chamber:</p>
            {chamberButtons(Array.from({ length: CHAMBER_COUNT }, (_, c) => c).filter((c) => c !== step), (to) => send({ type: 'moveDecree', playerId, from: step + 1, to: to + 1 }))}
            <button className="secondary swd-btn-cancel" onClick={() => setStep(null)}>Back</button>
          </>
        );
      }
      default:
        return null;
    }
  })();
  const [title] = EXPANSION_TITLES[state.subPhase] ?? [''];
  return (
    <div className="swd-pick-panel swd-pick-panel-wide">
      <p className="swd-pick-hint">{title.charAt(0).toUpperCase() + title.slice(1)}</p>
      {body}
    </div>
  );
}

export function ConspiracyTile({ id, onPick }: { id: DuelConspiracyId; onPick?: () => void }) {
  const c = conspiracyById(id);
  return (
    <div className={`swd-conspiracy-tile ${onPick ? 'pickable' : ''}`} title={c.description} {...(onPick ? choiceProps(onPick) : {})}>
      <ConspiracyArt id={id} size={36} />
      <div>
        <strong>{c.name}</strong>
        <span>{c.description}</span>
      </div>
    </div>
  );
}

/** Turn-start options with Agora: trigger a prepared Conspiracy. */
export function TriggerChoices({ state, seat, dispatch }: { state: DuelState; seat: 0 | 1; dispatch: Dispatch }) {
  const me: DuelPlayer = state.players[seat];
  if (!state.agora || state.agora.triggeredThisTurn) return null;
  const ready = (me.agora?.conspiracies ?? []).filter((c) => c.preparedWith !== null && !c.triggered);
  if (ready.length === 0) return null;
  return (
    <div className="swd-trigger">
      <p className="swd-pick-sub">Before you take a card, you may trigger a prepared Conspiracy:</p>
      <div className="swd-conspiracy-choices">
        {ready.map((c) => (
          <ConspiracyTile key={c.id} id={c.id} onPick={() => dispatch({ type: 'triggerConspiracy', playerId: me.id, conspiracy: c.id })} />
        ))}
      </div>
    </div>
  );
}

/** A face-down structure card with a Pantheon token lying on it. */
export function StructureTokenBadge({ token }: { token: NonNullable<DuelState['pyramid'][number]['token']> }) {
  return (
    <span className="swd-slot-token" title={token.kind === 'mythology' ? `${mythologyInfo(token.mythology).name} Mythology token` : `−${token.value} Offering token`}>
      {token.kind === 'mythology' ? <MythologyTokenArt mythology={token.mythology} size={28} /> : <OfferingTokenArt value={token.value} size={28} />}
    </span>
  );
}
