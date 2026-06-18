// Right-side panel: tabbed Cheatsheet / History / Chat for Sea Salt & Paper.
// The chat log is in-memory only — lives in a small zustand store local to this
// game (so it survives tab switches without leaking into SspState, which is
// replicated over the wire).

import { useLayoutEffect, useRef, useState } from 'react';
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

export function Sidebar({ state, mySeatName, localPlayerId }: { state: SspState; mySeatName: string; localPlayerId: PlayerId | null }) {
  void Cheatsheet; // retained for potential future use
  return (
    <div className="ssp-sidebar">
      <div className="ssp-sidebar-tabs">
        <button className="active" disabled>History &amp; Chat</button>
      </div>
      <div className="ssp-sidebar-body">
        <Feed state={state} mySeatName={mySeatName} localPlayerId={localPlayerId} />
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

function Feed({ state, mySeatName, localPlayerId }: { state: SspState; mySeatName: string; localPlayerId: PlayerId | null }) {
  const log = state.log ?? [];
  const msgs = useSspChat((s) => s.msgs);
  const add = useSspChat((s) => s.add);
  const [text, setText] = useState('');
  const threadRef = useRef<HTMLDivElement | null>(null);

  // Merge log entries + chat messages on a single time axis. Each log entry has
  // a sequence number; chat messages use their msg id. Render oldest first so
  // the newest items sit at the BOTTOM and the thread auto-scrolls to bottom
  // (matches chat conventions — scroll up to read older).
  type FeedItem =
    | { kind: 'log'; key: string; sortKey: number; entry: SspLogEntry }
    | { kind: 'chat'; key: string; sortKey: number; msg: typeof msgs[number] };
  const items: FeedItem[] = [
    ...log.map((e) => ({ kind: 'log' as const, key: `l-${e.seq}`, sortKey: e.seq * 10, entry: e })),
    ...msgs.map((m) => ({ kind: 'chat' as const, key: `c-${m.id}`, sortKey: m.at * 10 + 1, msg: m })),
  ].sort((a, b) => a.sortKey - b.sortKey);

  // Auto-scroll the feed to the bottom whenever new entries (either log
  // entries or chat messages) arrive. useLayoutEffect fires synchronously
  // before paint so the scroll lands on the latest DOM, not on stale content.
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
            ? <LogLine key={it.key} entry={it.entry} state={state} localPlayerId={localPlayerId} />
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

function LogLine({ entry, state, localPlayerId }: { entry: SspLogEntry; state: SspState; localPlayerId: PlayerId | null }) {
  const name = (id: PlayerId | null) => {
    if (!id) return <span className="who">System</span>;
    const seat = state.seats.find((s) => s.id === id);
    return (
      <span className="who" style={{ color: seat?.color ?? undefined }}>
        {seat?.name ?? id}
      </span>
    );
  };
  const fam = (f: SspCardFamily) => FAMILY[f].label;
  let cls = 'ssp-log-entry';
  let body: React.ReactNode = null;
  switch (entry.kind) {
    case 'drawDeck': {
      // The kept card is hidden info to non-owners (it's still in the player's
      // hand). Only show the family if it's the local player's own action.
      const isMine = entry.playerId === localPlayerId;
      body = isMine
        ? (<>{name(entry.playerId)} drew 2 from deck, kept <strong>{fam(entry.keptFamily)}</strong>, discarded <strong>{fam(entry.discardedFamily)}</strong> to pile {entry.toPile + 1}.</>)
        : (<>{name(entry.playerId)} drew 2 from deck, discarded <strong>{fam(entry.discardedFamily)}</strong> to pile {entry.toPile + 1}.</>);
      break;
    }
    case 'drawDiscard':
      body = (<>{name(entry.playerId)} took <strong>{fam(entry.family)}</strong> from pile {entry.pile + 1}.</>);
      break;
    case 'playPair': {
      const [a, b] = entry.families;
      const label = a === b ? `${fam(a)} pair` : `${fam(a)} + ${fam(b)}`;
      body = (<>{name(entry.playerId)} played <strong>{label}</strong>.</>);
      break;
    }
    case 'crabPick': {
      // The crab pull becomes hidden info once it's in the player's hand.
      // Only the acting player sees the card identity.
      const isMine = entry.playerId === localPlayerId;
      body = isMine
        ? (<>{name(entry.playerId)} (crab) took <strong>{fam(entry.family)}</strong> from pile {entry.pile + 1}.</>)
        : (<>{name(entry.playerId)} (crab) took a card from pile {entry.pile + 1}.</>);
      break;
    }
    case 'sharkSteal': {
      // The identity of the stolen card is hidden from non-participants
      // (both stealer and target know it; everyone else just sees a steal).
      const isParticipant = entry.playerId === localPlayerId || entry.targetPlayerId === localPlayerId;
      body = isParticipant
        ? (<>{name(entry.playerId)} (shark+swimmer) stole <strong>{fam(entry.family)}</strong> from {name(entry.targetPlayerId)}.</>)
        : (<>{name(entry.playerId)} (shark+swimmer) stole a card from {name(entry.targetPlayerId)}.</>);
      break;
    }
    case 'fishDraw': {
      const isMine = entry.playerId === localPlayerId;
      body = isMine
        ? (<>{name(entry.playerId)} (fish) drew <strong>{fam(entry.family)}</strong> from the deck.</>)
        : (<>{name(entry.playerId)} (fish) drew a card from the deck.</>);
      break;
    }
    case 'stop':
      body = (<>{name(entry.playerId)} called <strong>STOP</strong> at {entry.score} pts.</>);
      break;
    case 'lastChance':
      body = (<>{name(entry.playerId)} called <strong>LAST CHANCE</strong> at {entry.score} pts.</>);
      break;
    case 'pass':
      body = (<>{name(entry.playerId)} ended their turn.</>);
      break;
    case 'roundEnd':
      cls += ' round-end system';
      body = (
        <>
          <span className="who">Round {entry.round} ended</span> —{' '}
          {entry.endedBy === 'stop' && (<>{name(entry.endedByPlayerId)} stopped</>)}
          {entry.endedBy === 'lastChance' && (<>{name(entry.endedByPlayerId)}'s LAST CHANCE {entry.lastChanceWon ? 'won' : 'lost'}</>)}
          {entry.endedBy === 'deckEmpty' && 'deck ran out'}
          {entry.endedBy === 'mermaid' && '4 mermaids!'}.
        </>
      );
      break;
    case 'mermaidWin':
      cls += ' match-end system';
      body = (<>{name(entry.playerId)} collected 4 mermaids — instant win!</>);
      break;
    case 'matchEnd':
      cls += ' match-end system';
      body = (<><span className="who">Match over</span> — {name(entry.winnerId)} wins!</>);
      break;
    case 'playTrio': {
      const [a, b, c] = entry.families;
      body = (<>{name(entry.playerId)} played a <strong>{fam(a)}+{fam(b)}+{fam(c)}</strong> trio (3 pts, ability cancelled).</>);
      break;
    }
    case 'lobsterPick': {
      const isMine = entry.playerId === localPlayerId;
      body = isMine
        ? (<>{name(entry.playerId)} (lobster) revealed 5 cards and kept <strong>{fam(entry.family)}</strong>.</>)
        : (<>{name(entry.playerId)} (lobster) revealed 5 cards and kept one.</>);
      break;
    }
    case 'jellyfishLock':
      body = (<>{name(entry.playerId)} (jellyfish) locked {name(entry.targetPlayerId)}'s next turn.</>);
      break;
    case 'angelfishDraw': {
      const isMine = entry.playerId === localPlayerId;
      body = isMine
        ? (<>{name(entry.playerId)} (Angelfish event) drew <strong>{fam(entry.family)}</strong> for free.</>)
        : (<>{name(entry.playerId)} (Angelfish event) drew a card for free.</>);
      break;
    }
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

