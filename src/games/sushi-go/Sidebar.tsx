// Right-side panel: Cheatsheet showing the in-play menu with current-round
// frequencies + History + Chat. Mirrors the Sea Salt & Paper sidebar shape.

import { useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { SushiGoState, SushiGoLogEntry, SushiGoCardKind } from './types';
import { KIND_INFO } from './cards';
import type { PlayerId } from '@/core/types';

interface ChatMsg { id: number; who: string; text: string; at: number }
interface ChatStore {
  msgs: ChatMsg[];
  add(msg: Omit<ChatMsg, 'id'>): void;
  clear(): void;
}
export const useSushiGoChat = create<ChatStore>((set) => ({
  msgs: [],
  add: (m) => set((s) => ({ msgs: [...s.msgs, { ...m, id: s.msgs.length + 1 }] })),
  clear: () => set({ msgs: [] }),
}));

export function Sidebar({ state, mySeatName }: { state: SushiGoState; mySeatName: string }) {
  void Cheatsheet; // retained for future use
  return (
    <div className="ssp-sidebar">
      <div className="ssp-sidebar-tabs">
        <button className="active" disabled>History &amp; Chat</button>
      </div>
      <div className="ssp-sidebar-body">
        <Feed state={state} mySeatName={mySeatName} />
      </div>
    </div>
  );
}

/** For each menu kind, count cards currently in play this round (deck + every
 *  hand + every table). For desserts, also count what's stashed in dessert piles. */
function currentFrequencies(state: SushiGoState): Record<SushiGoCardKind, { inRound: number; inDessertPiles?: number }> {
  const out: Record<SushiGoCardKind, { inRound: number; inDessertPiles?: number }> = {} as Record<SushiGoCardKind, { inRound: number; inDessertPiles?: number }>;
  for (const k of state.config.menu) out[k] = { inRound: 0 };
  const tally = (k: SushiGoCardKind) => { if (out[k]) out[k].inRound += 1; };
  for (const c of state.deck) tally(c.kind);
  for (const p of state.players) {
    for (const c of p.hand) tally(c.kind);
    for (const c of p.table) tally(c.kind);
    for (const c of p.pendingPick ?? []) tally(c.kind);
  }
  for (const k of state.config.menu) {
    if (KIND_INFO[k].category === 'dessert') {
      let pile = 0;
      for (const p of state.players) pile += p.dessertPile.filter((c) => c.kind === k).length;
      out[k].inDessertPiles = pile;
    }
  }
  return out;
}

function Cheatsheet({ state }: { state: SushiGoState }) {
  const freq = currentFrequencies(state);
  const groupedByCategory = ['nigiri', 'roll', 'appetizer', 'special', 'dessert'] as const;
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--fg-muted)', margin: '0 0 8px' }}>
        Round {state.round} of {state.config.rounds}. Frequencies = cards still in play this round (deck + hands + tables).
        Dessert pile shows what's already locked in across rounds.
      </p>
      {groupedByCategory.map((cat) => {
        const items = state.config.menu.filter((k) => KIND_INFO[k].category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat}>
            <h4>{categoryLabel(cat)}</h4>
            {items.map((k) => {
              const info = KIND_INFO[k];
              const f = freq[k];
              return (
                <div key={k} className="ssp-cheat-row">
                  <div className="name">
                    {info.label}
                    <br />
                    <span style={{ fontSize: 10, opacity: 0.6 }}>
                      {f ? `×${f.inRound}` : '—'}
                      {f?.inDessertPiles !== undefined && f.inDessertPiles > 0 && (
                        <> · piles: {f.inDessertPiles}</>
                      )}
                    </span>
                  </div>
                  <div className="desc">{info.rule}</div>
                </div>
              );
            })}
          </div>
        );
      })}
      <h4>Round flow</h4>
      <div className="ssp-cheat-row">
        <div className="name">Pick</div>
        <div className="desc">All players choose 1 card from their hand simultaneously. Chopsticks/spoon let you pick 2.</div>
      </div>
      <div className="ssp-cheat-row">
        <div className="name">Pass</div>
        <div className="desc">After picks reveal, hands rotate. Round 1+3 clockwise, round 2 counter-clockwise.</div>
      </div>
    </div>
  );
}

function categoryLabel(cat: string): string {
  switch (cat) {
    case 'nigiri': return 'Nigiri';
    case 'roll': return 'Rolls';
    case 'appetizer': return 'Appetizers';
    case 'special': return 'Specials';
    case 'dessert': return 'Desserts';
    default: return cat;
  }
}

function Feed({ state, mySeatName }: { state: SushiGoState; mySeatName: string }) {
  const log = state.log ?? [];
  const msgs = useSushiGoChat((s) => s.msgs);
  const add = useSushiGoChat((s) => s.add);
  const [text, setText] = useState('');
  const threadRef = useRef<HTMLDivElement | null>(null);
  type FeedItem =
    | { kind: 'log'; key: string; sortKey: number; entry: SushiGoLogEntry }
    | { kind: 'chat'; key: string; sortKey: number; msg: typeof msgs[number] };
  const items: FeedItem[] = [
    ...log.map((e) => ({ kind: 'log' as const, key: `l-${e.seq}`, sortKey: e.seq * 10, entry: e })),
    ...msgs.map((m) => ({ kind: 'chat' as const, key: `c-${m.id}`, sortKey: m.at * 10 + 1, msg: m })),
  ].sort((a, b) => a.sortKey - b.sortKey);
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length, log.length, msgs.length]);
  function send() {
    const t = text.trim();
    if (!t) return;
    add({ who: mySeatName || 'You', text: t, at: log.length + msgs.length });
    setText('');
  }
  return (
    <div className="ssp-feed">
      <div className="ssp-feed-thread" ref={threadRef}>
        {items.length === 0 && (
          <p style={{ color: 'var(--fg-muted)' }}>No moves yet — chat or play to fill this feed.</p>
        )}
        {items.map((it) => (
          it.kind === 'log'
            ? <LogLine key={it.key} entry={it.entry} state={state} />
            : <div key={it.key} className="ssp-chat-msg">
                <span className="who">{it.msg.who}:</span> {it.msg.text}
              </div>
        ))}
      </div>
      <div className="ssp-chat-input">
        <input
          value={text}
          placeholder="Type a message…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}

function LogLine({ entry, state }: { entry: SushiGoLogEntry; state: SushiGoState }) {
  const name = (id: PlayerId | null) => {
    if (!id) return <span className="who">System</span>;
    const seat = state.seats.find((s) => s.id === id);
    return <span className="who" style={{ color: seat?.color ?? undefined }}>{seat?.name ?? id}</span>;
  };
  let cls = 'ssp-log-entry';
  let body: React.ReactNode = null;
  switch (entry.kind) {
    case 'pickSubmitted':
      body = (<>{name(entry.playerId)} submitted a pick.</>);
      break;
    case 'pickRevealed': {
      const names = entry.cards.map((c) => KIND_INFO[c.kind].label).join(' + ');
      body = (<>{name(entry.playerId)} played <strong>{names}</strong>.</>);
      break;
    }
    case 'roundEnd':
      cls += ' round-end system';
      body = (<><span className="who">Round {entry.round} ended</span> — scores tallied.</>);
      break;
    case 'matchEnd':
      cls += ' match-end system';
      body = (<><span className="who">Match over</span> — {name(entry.winnerId)} wins!</>);
      break;
  }
  return <div className={cls}>{body}</div>;
}

