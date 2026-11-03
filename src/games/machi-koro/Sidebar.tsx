// Match history: one line per log entry, grouped under a header per turn,
// newest at the bottom (auto-scrolls while you're at the bottom).

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { PlayerId } from '@/core/types';
import type { MkEdition, MkLogEntry, MkSource, MkState } from './types';
import { estDef, isEstablishment, lmDef } from './cards';
import { COLOR_HEX } from './Card';

export function cardName(edition: MkEdition, id: string): string {
  return isEstablishment(edition, id) ? estDef(edition, id).name : lmDef(edition, id).name;
}

function CardTag({ edition, id }: { edition: MkEdition; id: string }) {
  const color = isEstablishment(edition, id) ? COLOR_HEX[estDef(edition, id).color] : COLOR_HEX.landmark;
  return <span className="mk-log-card" style={{ borderColor: color, color }}>{cardName(edition, id)}</span>;
}

function sourceLabel(edition: MkEdition, s: MkSource): ReactNode {
  if (s.type === 'rule') return <span className="muted">had no coins</span>;
  return <>
    <CardTag edition={edition} id={s.id} />
    {s.copies && s.copies > 1 ? <span className="muted"> ×{s.copies}</span> : null}
  </>;
}

export function HistoryFeed({ state, nameOf }: { state: MkState; nameOf: (id: PlayerId | null) => string }) {
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [state.logSeq]);
  const ed = state.config.edition;
  const who = (id: PlayerId | null) => <b>{nameOf(id)}</b>;
  // Only the most recent entries — the full log grows with every payout.
  const entries = state.log.slice(-400);

  const line = (e: MkLogEntry): ReactNode => {
    switch (e.kind) {
      case 'firstPlayer': return <>🎲 {who(e.playerId)} goes first.</>;
      case 'setupDone': return <span className="mk-log-sep">Opening rounds over — the dice come out</span>;
      case 'turnStart': return null;
      case 'roll':
        return <>🎲 {who(e.playerId)} {e.reroll ? 'rerolled' : 'rolled'} {e.dice.join(' + ')}{e.dice.length > 1 ? ` = ${e.total}` : ''}{e.doubles ? ' — doubles!' : ''}</>;
      case 'keepRoll': return <>{who(e.playerId)} keeps the roll.</>;
      case 'addToRoll': return <>⚓ {who(e.playerId)} adds {e.amount} with the <CardTag edition={ed} id={e.source.id} /> = {e.total}</>;
      case 'bonusRoll':
        return <>🎣 {who(e.playerId)} rolls {e.dice.join(' + ')} = {e.total} · <CardTag edition={ed} id={e.source.id} /></>;
      case 'coins':
        if (e.from === null) return <>🪙 {who(e.to)} +{e.amount} · {sourceLabel(ed, e.source)}</>;
        return (
          <>
            🪙 {who(e.from)} → {who(e.to)}: {e.amount}
            {e.amount < e.owed && <span className="mk-log-short"> (owed {e.owed})</span>} · {sourceLabel(ed, e.source)}
          </>
        );
      case 'payBank':
        return (
          <>
            🪙 {who(e.from)} → bank: {e.amount}
            {e.amount < e.owed && <span className="mk-log-short"> (owed {e.owed})</span>} · {sourceLabel(ed, e.source)}
          </>
        );
      case 'redistribute':
        return <>🌳 <CardTag edition={ed} id={e.source.id} />: everyone now has {e.each}{e.fromBank > 0 ? ` (the bank adds ${e.fromBank})` : ''}.</>;
      case 'renovate': return <>🚧 {who(e.playerId)} sends every <CardTag edition={ed} id={e.cardId} /> for renovation.</>;
      case 'closed':
        return <span className="muted">🚧 {nameOf(e.playerId)}’s <CardTag edition={ed} id={e.cardId} />{e.copies > 1 ? ` ×${e.copies}` : ''} closes for renovation.</span>;
      case 'reopened':
        return <span className="muted">🚧 {nameOf(e.playerId)}’s <CardTag edition={ed} id={e.cardId} />{e.copies > 1 ? ` ×${e.copies}` : ''} reopens instead of paying.</span>;
      case 'demolish': return <>💥 {who(e.playerId)} demolishes their <CardTag edition={ed} id={e.landmarkId} />.</>;
      case 'give': return <>📦 {who(e.playerId)} gives <CardTag edition={ed} id={e.cardId} /> to {who(e.toId)}.</>;
      case 'invest': return <>💼 {who(e.playerId)} invests 1 in the Tech Startup ({e.total} on it).</>;
      case 'exhibit':
        return e.cardId === null
          ? <>{who(e.playerId)} keeps their <CardTag edition={ed} id={e.hallId} />.</>
          : <>🎪 {who(e.playerId)} activates <CardTag edition={ed} id={e.cardId} /> with the <CardTag edition={ed} id={e.hallId} />, which goes back to the market.</>;
      case 'exchange':
        return <>🔁 {who(e.playerId)} swaps <CardTag edition={ed} id={e.gave} /> for {who(e.withId)}’s <CardTag edition={ed} id={e.took} />.</>;
      case 'skipExchange': return <>{who(e.playerId)} keeps their town (Business Center).</>;
      case 'gift': return <>📦 {who(e.playerId)} gives <CardTag edition={ed} id={e.cardId} /> to {who(e.toId)}.</>;
      case 'build':
        return (
          <>
            {e.landmark ? '★' : '🏗️'} {who(e.playerId)} builds <CardTag edition={ed} id={e.cardId} />
            {e.cost < 0 ? ` and gets ${-e.cost}.` : ` for ${e.cost}.`}
          </>
        );
      case 'pass': return <span className="muted">{nameOf(e.playerId)} builds nothing.</span>;
      case 'extraTurn': return <>🔄 {who(e.playerId)} gets another turn · {sourceLabel(ed, e.source)}</>;
      case 'win':
        return <span className="mk-log-win">🏆 {nameOf(e.playerId)} wins{e.reason === 'launchPad' ? ' with the Launch Pad!' : '!'}</span>;
    }
  };

  return (
    <div
      className="mk-feed"
      ref={box}
      onScroll={(ev) => {
        const el = ev.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {entries.map((e) => {
        if (e.kind === 'turnStart') {
          return (
            <div key={e.seq} className="mk-log-turn">
              {nameOf(e.playerId)}{e.extra ? ' — extra turn' : ''}
            </div>
          );
        }
        const body = line(e);
        return body ? <div key={e.seq} className="mk-log-line">{body}</div> : null;
      })}
    </div>
  );
}
