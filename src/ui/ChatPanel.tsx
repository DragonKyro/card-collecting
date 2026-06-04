// In-room chat. State lives on networkStore.chat (in-memory; not part of GameState).

import { useEffect, useRef, useState } from 'react';
import { useNetworkStore } from '@/store/networkStore';

export function ChatPanel() {
  const chat = useNetworkStore((s) => s.chat);
  const peers = useNetworkStore((s) => s.peers);
  const sendChat = useNetworkStore((s) => s.sendChat);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat.length, open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    sendChat(draft);
    setDraft('');
  }

  return (
    <div className={`chat-panel ${open ? 'open' : 'closed'}`}>
      <button className="chat-toggle" onClick={() => setOpen(!open)} type="button">
        {open ? '✕' : '💬'} {chat.length > 0 && !open ? `(${chat.length})` : ''}
      </button>
      {open && (
        <div className="chat-body">
          <div className="chat-log" ref={scrollRef}>
            {chat.length === 0 && <div className="chat-empty">No messages yet.</div>}
            {chat.map((m) => (
              <div key={`${m.byUuid}-${m.ts}`} className="chat-row">
                <strong>{peers[m.byUuid] ?? 'Player'}:</strong> <span>{m.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={submit} className="chat-form">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Say something…"
              maxLength={200}
            />
            <button type="submit" disabled={!draft.trim()}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}
