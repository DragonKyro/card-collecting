// Right-side panel: Cheatsheet showing the in-play menu with current-round
// frequencies + History + Chat. Mirrors the Sea Salt & Paper sidebar shape.

import { useEffect, useRef, useState } from 'react';
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

type Tab = 'cheat' | 'log' | 'chat';

export function Sidebar({ state, mySeatName }: { state: SushiGoState; mySeatName: string }) {
  const [tab, setTab] = useState<Tab>('cheat');
  return (
    <div className="ssp-sidebar">
      <div className="ssp-sidebar-tabs">
        <button className={tab === 'cheat' ? 'active' : ''} onClick={() => setTab('cheat')}>Menu</button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>History</button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
      </div>
      <div className="ssp-sidebar-body">
        {tab === 'cheat' && <Cheatsheet state={state} />}
        {tab === 'log' && <History state={state} />}
        {tab === 'chat' && <Chat mySeatName={mySeatName} />}
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

function History({ state }: { state: SushiGoState }) {
  const log = state.log ?? [];
  if (log.length === 0) return <p style={{ color: 'var(--fg-muted)' }}>No moves yet.</p>;
  return (
    <div className="ssp-log">
      {log.map((e) => (
        <LogLine key={e.seq} entry={e} state={state} />
      ))}
    </div>
  );
}

function LogLine({ entry, state }: { entry: SushiGoLogEntry; state: SushiGoState }) {
  const name = (id: PlayerId | null) => (id ? (state.seats.find((s) => s.id === id)?.name ?? id) : 'System');
  let cls = 'ssp-log-entry';
  let body: React.ReactNode = null;
  switch (entry.kind) {
    case 'pickSubmitted':
      body = (<><span className="who">{name(entry.playerId)}</span> submitted a pick.</>);
      break;
    case 'pickRevealed': {
      const names = entry.cards.map((c) => KIND_INFO[c.kind].label).join(' + ');
      body = (<><span className="who">{name(entry.playerId)}</span> played <strong>{names}</strong>.</>);
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

function Chat({ mySeatName }: { mySeatName: string }) {
  const msgs = useSushiGoChat((s) => s.msgs);
  const add = useSushiGoChat((s) => s.add);
  const [text, setText] = useState('');
  const threadRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [msgs.length]);
  function send() {
    const t = text.trim();
    if (!t) return;
    add({ who: mySeatName || 'You', text: t, at: msgs.length });
    setText('');
  }
  return (
    <div>
      <div className="ssp-chat-thread" ref={threadRef}>
        {msgs.length === 0 && <p style={{ color: 'var(--fg-muted)' }}>No messages yet. Online multiplayer chat coming with WebRTC.</p>}
        {msgs.map((m) => (
          <div key={m.id} className="ssp-chat-msg">
            <span className="who">{m.who}:</span>
            {m.text}
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
