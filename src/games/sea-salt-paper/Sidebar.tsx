// Right-side panel: tabbed Cheatsheet / History / Chat for Sea Salt & Paper.
// The chat log is in-memory only — lives in a small zustand store local to this
// game (so it survives tab switches without leaking into SspState, which is
// replicated over the wire).

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { SspState, SspLogEntry, SspCardFamily } from './types';
import { FAMILY, FAMILY_ORDER } from './cards';
import type { PlayerId } from '@/core/types';

interface ChatMsg { id: number; who: string; text: string; at: number }
interface ChatStore {
  msgs: ChatMsg[];
  add(msg: Omit<ChatMsg, 'id'>): void;
  clear(): void;
}
export const useSspChat = create<ChatStore>((set) => ({
  msgs: [],
  add: (m) => set((s) => ({ msgs: [...s.msgs, { ...m, id: s.msgs.length + 1 }] })),
  clear: () => set({ msgs: [] }),
}));

type Tab = 'cheat' | 'log' | 'chat';

export function Sidebar({ state, mySeatName }: { state: SspState; mySeatName: string }) {
  const [tab, setTab] = useState<Tab>('cheat');
  return (
    <div className="ssp-sidebar">
      <div className="ssp-sidebar-tabs">
        <button className={tab === 'cheat' ? 'active' : ''} onClick={() => setTab('cheat')}>Cards</button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>History</button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
      </div>
      <div className="ssp-sidebar-body">
        {tab === 'cheat' && <Cheatsheet />}
        {tab === 'log' && <History state={state} />}
        {tab === 'chat' && <Chat mySeatName={mySeatName} />}
      </div>
    </div>
  );
}

function Cheatsheet() {
  const dueByCat: Record<string, SspCardFamily[]> = { duo: [], collector: [], multiplier: [], mermaid: [], special: [] };
  for (const f of FAMILY_ORDER) dueByCat[FAMILY[f].category].push(f);
  return (
    <div>
      <h4>Duo pairs (1 pt + ability)</h4>
      {dueByCat.duo.map((f) => (
        <div key={f} className="ssp-cheat-row">
          <div className="name">{FAMILY[f].label}<br /><span style={{ fontSize: 10, opacity: 0.6 }}>×{FAMILY[f].count}</span></div>
          <div>
            <div className="desc">{FAMILY[f].rule}</div>
            {FAMILY[f].ability && <div className="ability">{FAMILY[f].ability}</div>}
          </div>
        </div>
      ))}
      <h4>Collectors (sets)</h4>
      {dueByCat.collector.map((f) => (
        <div key={f} className="ssp-cheat-row">
          <div className="name">{FAMILY[f].label}<br /><span style={{ fontSize: 10, opacity: 0.6 }}>×{FAMILY[f].count}</span></div>
          <div className="desc">{FAMILY[f].rule}</div>
        </div>
      ))}
      <h4>Multipliers</h4>
      {dueByCat.multiplier.map((f) => (
        <div key={f} className="ssp-cheat-row">
          <div className="name">{FAMILY[f].label}<br /><span style={{ fontSize: 10, opacity: 0.6 }}>×{FAMILY[f].count}</span></div>
          <div className="desc">{FAMILY[f].rule}</div>
        </div>
      ))}
      <h4>Mermaid</h4>
      {dueByCat.mermaid.map((f) => (
        <div key={f} className="ssp-cheat-row">
          <div className="name">{FAMILY[f].label}<br /><span style={{ fontSize: 10, opacity: 0.6 }}>×{FAMILY[f].count}</span></div>
          <div className="desc">{FAMILY[f].rule}</div>
        </div>
      ))}
      {dueByCat.special.length > 0 && (
        <>
          <h4>Special (Extra Salt)</h4>
          {dueByCat.special.map((f) => (
            <div key={f} className="ssp-cheat-row">
              <div className="name">{FAMILY[f].label}<br /><span style={{ fontSize: 10, opacity: 0.6 }}>×{FAMILY[f].count}</span></div>
              <div className="desc">{FAMILY[f].rule}</div>
            </div>
          ))}
        </>
      )}
      <h4>End of round</h4>
      <div className="ssp-cheat-row">
        <div className="name">STOP</div>
        <div className="desc">Call when your score is 7+. Round ends, everyone scores normally.</div>
      </div>
      <div className="ssp-cheat-row">
        <div className="name">LAST CHANCE</div>
        <div className="desc">Bet your hand is best: opponents take one last turn, then if your card-points still lead you keep yours and they forfeit theirs. If they catch up, you forfeit yours instead.</div>
      </div>
    </div>
  );
}

function History({ state }: { state: SspState }) {
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

function LogLine({ entry, state }: { entry: SspLogEntry; state: SspState }) {
  const name = (id: PlayerId | null) => (id ? (state.seats.find((s) => s.id === id)?.name ?? id) : 'System');
  const fam = (f: SspCardFamily) => FAMILY[f].label;
  let cls = 'ssp-log-entry';
  let body: React.ReactNode = null;
  switch (entry.kind) {
    case 'drawDeck':
      body = (<><span className="who">{name(entry.playerId)}</span> drew 2 from deck, kept <strong>{fam(entry.keptFamily)}</strong>, discarded <strong>{fam(entry.discardedFamily)}</strong> to pile {entry.toPile + 1}.</>);
      break;
    case 'drawDiscard':
      body = (<><span className="who">{name(entry.playerId)}</span> took <strong>{fam(entry.family)}</strong> from pile {entry.pile + 1}.</>);
      break;
    case 'playPair': {
      const [a, b] = entry.families;
      const label = a === b ? `${fam(a)} pair` : `${fam(a)} + ${fam(b)}`;
      body = (<><span className="who">{name(entry.playerId)}</span> played <strong>{label}</strong>.</>);
      break;
    }
    case 'crabPick':
      body = (<><span className="who">{name(entry.playerId)}</span> (crab) took <strong>{fam(entry.family)}</strong> from pile {entry.pile + 1}.</>);
      break;
    case 'sharkSteal':
      body = (<><span className="who">{name(entry.playerId)}</span> (shark+swimmer) stole <strong>{fam(entry.family)}</strong> from {name(entry.targetPlayerId)}.</>);
      break;
    case 'fishDraw':
      body = (<><span className="who">{name(entry.playerId)}</span> (fish) drew <strong>{fam(entry.family)}</strong> from the deck.</>);
      break;
    case 'stop':
      body = (<><span className="who">{name(entry.playerId)}</span> called <strong>STOP</strong> at {entry.score} pts.</>);
      break;
    case 'lastChance':
      body = (<><span className="who">{name(entry.playerId)}</span> called <strong>LAST CHANCE</strong> at {entry.score} pts.</>);
      break;
    case 'pass':
      body = (<><span className="who">{name(entry.playerId)}</span> ended their turn.</>);
      break;
    case 'roundEnd':
      cls += ' round-end system';
      body = (<><span className="who">Round {entry.round} ended</span> — {entry.endedBy === 'stop' && `${name(entry.endedByPlayerId)} stopped`}{entry.endedBy === 'lastChance' && `${name(entry.endedByPlayerId)}'s LAST CHANCE ${entry.lastChanceWon ? 'won' : 'lost'}`}{entry.endedBy === 'deckEmpty' && 'deck ran out'}{entry.endedBy === 'mermaid' && '4 mermaids!'}.</>);
      break;
    case 'mermaidWin':
      cls += ' match-end system';
      body = (<><span className="who">{name(entry.playerId)}</span> collected 4 mermaids — instant win!</>);
      break;
    case 'matchEnd':
      cls += ' match-end system';
      body = (<><span className="who">Match over</span> — {name(entry.winnerId)} wins!</>);
      break;
    case 'playTrio': {
      const [a, b, c] = entry.families;
      body = (<><span className="who">{name(entry.playerId)}</span> played a <strong>{fam(a)}+{fam(b)}+{fam(c)}</strong> trio (3 pts, ability cancelled).</>);
      break;
    }
    case 'lobsterPick':
      body = (<><span className="who">{name(entry.playerId)}</span> (lobster) revealed 5 cards and kept <strong>{fam(entry.family)}</strong>.</>);
      break;
    case 'jellyfishLock':
      body = (<><span className="who">{name(entry.playerId)}</span> (jellyfish) locked {name(entry.targetPlayerId)}'s next turn.</>);
      break;
    case 'angelfishDraw':
      body = (<><span className="who">{name(entry.playerId)}</span> (Angelfish event) drew <strong>{fam(entry.family)}</strong> for free.</>);
      break;
    case 'eventReveal':
      cls += ' system';
      body = (<><span className="who">Round {entry.round}</span> — Event revealed: <strong>{entry.eventId}</strong>.</>);
      break;
    case 'eventAwarded':
      cls += ' system';
      body = entry.playerId
        ? (<><span className="who">Event awarded</span> — <strong>{entry.eventId}</strong> goes to {name(entry.playerId)}.</>)
        : (<><span className="who">Event discarded</span> — <strong>{entry.eventId}</strong> applied this round only.</>);
      break;
  }
  return <div className={cls}>{body}</div>;
}

function Chat({ mySeatName }: { mySeatName: string }) {
  const msgs = useSspChat((s) => s.msgs);
  const add = useSspChat((s) => s.add);
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
