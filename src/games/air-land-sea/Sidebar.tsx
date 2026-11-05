// Right-side panel: the battle history, written for the viewing seat. Cards
// that seat can't see (an opponent's improvised, drawn, returned or destroyed
// face-down card) are "a card"; everything played or flipped face up is named.
// (Online chat is the shell's floating panel.)

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { AlsAbilityKind, AlsLogEntry, AlsState, AlsTheaterId } from './types';
import { cardById, cardLabel, CARD_TEMPLATES, THEATER_DEFS } from './cards';

const ABILITY_NAME: Record<AlsAbilityKind, string> = Object.fromEntries(
  CARD_TEMPLATES.filter((c) => c.ability).map((c) => [c.ability!, c.name]),
) as Record<AlsAbilityKind, string>;

export function abilityName(a: AlsAbilityKind): string {
  return ABILITY_NAME[a];
}

/** "Ann's", and "Your" for the default local seat name "You". */
export function possessive(name: string): string {
  return name === 'You' ? 'Your' : `${name}'s`;
}

/** "Ann wins" / "You win". */
export function wins(name: string): string {
  return name === 'You' ? 'win' : 'wins';
}

export function Sidebar({ state, viewer }: { state: AlsState; viewer: 0 | 1 | -1 }) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.log.length]);

  const rows = state.theaters;
  const theatersByBattle = new Map<number, AlsTheaterId[]>();
  for (const e of state.log) if (e.kind === 'battleStart') theatersByBattle.set(e.battle, e.theaters);

  return (
    <div className="als-sidebar">
      <div className="als-sidebar-title">History</div>
      <div className="als-sidebar-body" ref={threadRef}>
        {state.log.length === 0 && <p className="als-cheat-note">No moves yet.</p>}
        {state.log.map((e) => (
          <LogLine key={e.seq} entry={e} state={state} viewer={viewer} theaters={theatersByBattle.get(e.battle) ?? rows} />
        ))}
      </div>
    </div>
  );
}

function LogLine({ entry: e, state, viewer, theaters }: { entry: AlsLogEntry; state: AlsState; viewer: 0 | 1 | -1; theaters: AlsTheaterId[] }) {
  const seat = (s: 0 | 1) => state.seats.find((x) => x.id === state.players[s].id);
  const who = (s: 0 | 1) => <span className="who" style={{ color: seat(s)?.color }}>{seat(s)?.name ?? `Seat ${s + 1}`}</span>;
  const whose = (s: 0 | 1) => <span className="who" style={{ color: seat(s)?.color }}>{possessive(seat(s)?.name ?? `Seat ${s + 1}`)}</span>;
  const named = (id: number) => <strong title={cardLabel(id)}>{cardById(id).name}</strong>;
  const sees = (owner: 0 | 1) => viewer === -1 || viewer === owner;
  const secret = (id: number, owner: 0 | 1, otherwise = 'a card') => (sees(owner) ? named(id) : <>{otherwise}</>);
  const th = (t: number) => THEATER_DEFS[theaters[t]]?.name ?? `theater ${t + 1}`;

  let cls = 'als-log-entry';
  let body: ReactNode;
  switch (e.kind) {
    case 'battleStart':
      cls += ' system';
      body = <>Battle {e.battle} — 1st player: {who(e.firstSeat)}. {e.theaters.map((t) => THEATER_DEFS[t].name).join(' · ')}</>;
      break;
    case 'deploy':
      body = <>{who(e.seat)} deployed {named(e.cardId)} to {th(e.theaterIdx)}{e.via ? <> ({e.via === 'airDrop' ? 'Air Drop' : e.via === 'aerodrome' ? 'Aerodrome' : 'Supply Lines'})</> : null}.</>;
      break;
    case 'improvise':
      body = <>{who(e.seat)} played {secret(e.cardId, e.private)} face down to {th(e.theaterIdx)}.</>;
      break;
    case 'forcedPlay':
      body = <>{who(e.seat)} played {secret(e.cardId, e.private, 'the drawn card')} face down to {th(e.theaterIdx)}.</>;
      break;
    case 'withdraw':
      cls += ' system';
      body = <>{who(e.seat)} withdrew with {e.cardsLeft} card{e.cardsLeft === 1 ? '' : 's'} left.</>;
      break;
    case 'pass':
      body = <>{who(e.seat)} has no cards left and passes.</>;
      break;
    case 'ability':
      cls += ' ability';
      body = e.viaIncite
        ? <>{whose(e.seat)} Incite uses <strong>{abilityName(e.ability)}</strong>{e.noEffect ? ' — no effect.' : '.'}</>
        : <>{whose(e.seat)} <strong>{cardById(e.cardId).name}</strong>{e.noEffect ? ' — no effect.' : '.'}</>;
      break;
    case 'flip':
      body = <>{who(e.seat)} flipped {e.seat === e.ownerSeat ? 'their' : whose(e.ownerSeat)} {named(e.cardId)} face {e.now} in {th(e.theaterIdx)}.</>;
      break;
    case 'move':
      body = <>{who(e.seat)} moved {e.faceDown ? secret(e.cardId, e.seat, 'a face-down card') : named(e.cardId)} from {th(e.from)} to {th(e.to)}{e.ability === 'envoy' ? ' (Envoy)' : ''}.</>;
      break;
    case 'toHand':
      body = <>{who(e.seat)} returned {secret(e.cardId, e.private, 'a face-down card')} from {th(e.from)} to their hand.</>;
      break;
    case 'draw':
      body = <>{who(e.seat)} drew {secret(e.cardId, e.private)}.</>;
      break;
    case 'give':
      body = <>{who(e.seat)} gave {named(e.cardId)} to {who(e.seat === 0 ? 1 : 0)}.</>;
      break;
    case 'keep':
      body = <>{who(e.seat)} kept the card; {who(e.seat === 0 ? 1 : 0)} draws one.</>;
      break;
    case 'destroy': {
      cls += ' system';
      const what = e.faceDown ? secret(e.cardId, e.ownerSeat, 'a face-down card') : named(e.cardId);
      const why = e.reason === 'containment' ? 'Containment' : e.reason === 'blockade' ? 'Blockade' : 'Relinquish';
      body = <>{why} destroyed {whose(e.ownerSeat)} {what} in {th(e.theaterIdx)}.</>;
      break;
    }
    case 'reveal':
      body = <>{who(e.seat)} revealed {named(e.cardId)} ({abilityName(e.ability)}).</>;
      break;
    case 'supply':
      body = <>{who(e.seat)} gained {e.amount} suppl{e.amount === 1 ? 'y' : 'ies'} in {th(e.theaterIdx)} ({abilityName(e.ability)}).</>;
      break;
    case 'name':
      body = <>{who(e.seat)} named <strong>{cardLabel(e.cardId)}</strong> ({cardById(e.cardId).name}) — {e.hit ? 'it must be played face down next.' : 'not in hand.'}</>;
      break;
    case 'battleEnd':
      cls += ' system';
      body = <>{who(e.result.winnerSeatIdx)} {wins(seat(e.result.winnerSeatIdx)?.name ?? '')} battle {e.result.battleNumber}: +{e.result.vpAwarded} VP{e.result.endedBy === 'withdraw' ? ' (withdrawal)' : ''}.</>;
      break;
    case 'matchEnd':
      cls += ' system match-end';
      body = <>{who(e.winnerSeatIdx)} {wins(seat(e.winnerSeatIdx)?.name ?? '')} the war!</>;
      break;
  }
  return <div className={cls}>{body}</div>;
}
