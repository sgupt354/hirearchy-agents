import { useEffect, useRef, useState } from 'react';
import type { HumanReply, PhoneMessage } from '../engine/types';

export function Phone({ owner, subtitle, messages, busy, onReply }: {
  owner: string;
  subtitle: string;
  messages: PhoneMessage[];
  busy: boolean;
  onReply: (reply: HumanReply) => void;
}) {
  const [text, setText] = useState('');
  const bubbles = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bubbles.current) bubbles.current.scrollTop = bubbles.current.scrollHeight;
  }, [messages.length, busy]);
  const last = messages.at(-1);
  const canAct = !busy && Boolean(last?.actions.length);

  return (
    <section className="phone">
      <header>
        <b>{owner}</b>
        <small>{subtitle}</small>
      </header>
      <div className="bubbles" ref={bubbles}>
        {messages.length === 0 && <p className="empty">No messages</p>}
        {messages.map((m) => <p key={m.id} className="bubble">{m.text}</p>)}
        {busy && <p className="bubble typing">agent is working…</p>}
      </div>
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) onReply({ kind: 'counter', text });
          setText('');
        }}
      >
        <button type="button" className="accept" disabled={!canAct} onClick={() => onReply({ kind: 'accept' })}>Accept</button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder='e.g. "8pm?"' disabled={!canAct} aria-label="Counter time" />
        <button type="submit" className="counter" disabled={!canAct || !text.trim()}>Counter</button>
        <button type="button" className="decline" disabled={!canAct} onClick={() => onReply({ kind: 'decline' })}>Decline</button>
      </form>
    </section>
  );
}
