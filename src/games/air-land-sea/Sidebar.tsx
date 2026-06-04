// Right-side panel: tabbed Cheatsheet / History / Chat for Air, Land & Sea.

import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import type { AlsState, AlsLogEntry, AlsCardTemplate } from './types';
import { THEATER_DEFS } from './cards';
import type { PlayerId } from '@/core/types';

interface ChatMsg { id: number; who: string; text: string; at: number }
interface ChatStore {
  msgs: ChatMsg[];
  add(msg: Omit<ChatMsg, 'id'>): void;
  clear(): void;
}
export const useAlsChat = create<ChatStore>((set) => ({
  msgs: [],
  add: (m) => set((s) => ({ msgs: [...s.msgs, { ...m, id: s.msgs.length + 1 }] })),
  clear: () => set({ msgs: [] }),
}));

type Tab = 'cheat' | 'log' | 'chat';

export function Sidebar({ state, mySeatName }: { state: AlsState; mySeatName: string }) {
  const [tab, setTab] = useState<Tab>('cheat');
  return (
    <div className="als-sidebar">
      <div className="als-sidebar-tabs">
        <button className={tab === 'cheat' ? 'active' : ''} onClick={() => setTab('cheat')}>Cards</button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>History</button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Chat</button>
      </div>
      <div className="als-sidebar-body">
        {tab === 'cheat' && <Cheatsheet state={state} />}
        {tab === 'log' && <History state={state} />}
        {tab === 'chat' && <Chat mySeatName={mySeatName} />}
      </div>
    </div>
  );
}

function Cheatsheet({ state }: { state: AlsState }) {
  const theatersInPlay = new Set(state.config.theaters);
  // Group cards by theater (only theaters in play).
  const byTheater: Record<string, AlsCardTemplate[]> = {};
  for (const id of Object.keys(state.deckPool)) {
    const c = state.deckPool[Number(id)];
    if (!theatersInPlay.has(c.theater)) continue;
    if (!byTheater[c.theater]) byTheater[c.theater] = [];
    byTheater[c.theater].push(c);
  }
  for (const k of Object.keys(byTheater)) byTheater[k].sort((a, b) => a.strength - b.strength);

  return (
    <div>
      <h4>Turn options</h4>
      <p className="als-cheat-note">
        Each turn: <strong>Deploy</strong> a card face-up to its matching theater,
        <strong> Improvise</strong> any card face-down to any theater (wild,
        strength 2, no ability), or <strong>Withdraw</strong> to end the battle.
      </p>
      <h4>Withdraw VP chart</h4>
      <p className="als-cheat-note">
        When you withdraw, the opponent gets VP based on cards left in your hand:<br />
        6+ → 2 VP &nbsp;•&nbsp; 4-5 → 3 VP &nbsp;•&nbsp; 2-3 → 4 VP &nbsp;•&nbsp; 0-1 → 6 VP (same as a full-hand loss).
      </p>
      {state.config.theaters.map((tid) => (
        <div key={tid}>
          <h4 style={{ marginTop: 14 }}>{THEATER_DEFS[tid].name}</h4>
          {(byTheater[tid] ?? []).map((c) => (
            <div key={c.id} className="als-cheat-row">
              <div className="name">{c.strength} · {c.name}</div>
              <div className="desc">{c.abilityText}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function History({ state }: { state: AlsState }) {
  const log = state.log ?? [];
  if (log.length === 0) return <p style={{ color: 'var(--fg-muted)' }}>No moves yet.</p>;
  return (
    <div className="als-log">
      {log.map((e) => (
        <LogLine key={e.seq} entry={e} state={state} />
      ))}
    </div>
  );
}

function LogLine({ entry, state }: { entry: AlsLogEntry; state: AlsState }) {
  const name = (id: PlayerId | null) => (id ? (state.seats.find((s) => s.id === id)?.name ?? id) : 'System');
  const cardName = (id: number) => state.deckPool[id]?.name ?? `card${id}`;
  let cls = 'als-log-entry';
  let body: React.ReactNode = null;
  switch (entry.kind) {
    case 'deploy':
      body = (<><span className="who">{name(entry.playerId)}</span> deployed <strong>{cardName(entry.cardId)}</strong>.</>);
      break;
    case 'improvise':
      body = (<><span className="who">{name(entry.playerId)}</span> played a face-down card.</>);
      break;
    case 'withdraw':
      cls += ' system';
      body = (<><span className="who">{name(entry.playerId)}</span> withdrew with {entry.cardsLeftInHand} card{entry.cardsLeftInHand === 1 ? '' : 's'} left.</>);
      break;
    case 'flip':
      body = (<><span className="who">{name(entry.playerId)}</span> flipped <strong>{cardName(entry.cardId)}</strong> {entry.now}.</>);
      break;
    case 'transport':
      body = (<><span className="who">{name(entry.playerId)}</span> transported <strong>{cardName(entry.cardId)}</strong>.</>);
      break;
    case 'redeploy':
      body = (<><span className="who">{name(entry.playerId)}</span> redeployed (returned face-down card to hand).</>);
      break;
    case 'reinforce':
      body = entry.theaterIdx === null
        ? (<><span className="who">{name(entry.playerId)}</span> reinforced — declined to place.</>)
        : (<><span className="who">{name(entry.playerId)}</span> reinforced face-down.</>);
      break;
    case 'containment':
      cls += ' system';
      body = (<><span className="who">Containment</span> discarded a face-down play.</>);
      break;
    case 'blockade':
      cls += ' system';
      body = (<><span className="who">Blockade</span> discarded a newly-played card.</>);
      break;
    case 'supplyTokenPlaced':
      body = (<><span className="who">{name(entry.playerId)}</span> placed a supply token.</>);
      break;
    case 'battleEnd':
      cls += ' system';
      body = (<><span className="who">Battle {entry.battle} ended</span> — {entry.result.endedBy === 'withdraw' ? 'withdraw' : 'full play'}; winner gains {entry.result.vpAwardedToWinner} VP.</>);
      break;
    case 'matchEnd':
      cls += ' system match-end';
      body = (<><span className="who">Match over</span>.</>);
      break;
  }
  return <div className={cls}>{body}</div>;
}

function Chat({ mySeatName }: { mySeatName: string }) {
  const msgs = useAlsChat((s) => s.msgs);
  const add = useAlsChat((s) => s.add);
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
      <div className="als-chat-thread" ref={threadRef}>
        {msgs.length === 0 && <p style={{ color: 'var(--fg-muted)' }}>No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className="als-chat-msg">
            <span className="who">{m.who}:</span> {m.text}
          </div>
        ))}
      </div>
      <div className="als-chat-input">
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
