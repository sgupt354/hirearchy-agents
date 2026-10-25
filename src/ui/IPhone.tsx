import { useEffect, useRef, useState } from 'react';
import type { HumanReply } from '../engine/types';

export interface CalendarCardData {
  title: string;
  when: string;
  skills: string[];
  people: { name: string; you: boolean }[];
  onAdd: () => void;
}

export interface ChatItem {
  key: string;
  from: 'agent' | 'me';
  text: string;
  /** Agent message that needs the human: banner first, quick replies after. */
  needsHuman?: boolean;
  card?: CalendarCardData;
  time?: string;
}

const TIME_CHIPS = ['7:30 PM', '8:00 PM', '8:30 PM'];
const clock = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function IPhone({ owner, caption, items, interactive, pace, onReply }: {
  owner: string;
  caption: string;
  items: ChatItem[];
  /** False while the agents are still mid-conversation. */
  interactive: boolean;
  /** Multiplier for typing / banner timing (presentation speed). */
  pace: number;
  onReply: (reply: HumanReply, bubble: string) => void;
}) {
  const agentItems = items.filter((i) => i.from === 'agent');
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'banner' | 'typing'>('idle');
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState('');
  const [now, setNow] = useState(clock);
  const times = useRef(new Map<string, string>());
  const chat = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 15000);
    return () => clearInterval(t);
  }, []);

  // Reveal agent messages one at a time: (banner →) typing dots → bubble.
  const next = agentItems[shown];
  useEffect(() => {
    if (!next) return;
    if (phase === 'idle') {
      setPhase(next.needsHuman ? 'banner' : 'typing');
      return;
    }
    const t = setTimeout(
      () => {
        if (phase === 'banner') return setPhase('typing');
        times.current.set(next.key, clock());
        setShown((s) => s + 1);
        setPhase('idle');
      },
      (phase === 'banner' ? 1300 : 800) * pace,
    );
    return () => clearTimeout(t);
  }, [next?.key, phase, pace]);

  // Everything up to (not including) the next unrevealed agent message.
  const cut = next ? items.indexOf(next) : items.length;
  const visible = items.slice(0, cut);
  const last = visible.at(-1);
  const canReply = interactive && !next && last?.from === 'agent' && Boolean(last.needsHuman);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [visible.length, phase, picking]);

  const send = (reply: HumanReply, bubble: string) => {
    setPicking(false);
    setCustom('');
    onReply(reply, bubble);
  };

  return (
    <figure className="device">
      <div className="iphone">
        <div className="bezel">
        <div className="screen">
          <div className="status-bar">
            <span className="sb-time">{now.replace(/ (AM|PM)/, '')}</span>
            <span className="island" />
            <span className="sb-icons" aria-hidden>
              <svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>
              <svg width="15" height="11" viewBox="0 0 15 11"><path d="M7.5 2.2c2.1 0 4 .8 5.4 2.1l1.1-1.1A9.2 9.2 0 0 0 7.5.6 9.2 9.2 0 0 0 1 3.2l1.1 1.1a7.6 7.6 0 0 1 5.4-2.1Zm0 3.1c1.2 0 2.4.5 3.2 1.3l1.1-1.1a6.1 6.1 0 0 0-8.6 0l1.1 1.1c.8-.8 2-1.3 3.2-1.3Zm0 3.1c.4 0 .8.2 1.1.5L7.5 10 6.4 8.9c.3-.3.7-.5 1.1-.5Z" /></svg>
              <svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5" /><rect x="2" y="2" width="16" height="8" rx="1.8" /><rect x="22.5" y="4" width="1.6" height="4" rx=".8" opacity=".5" /></svg>
            </span>
          </div>

          <div className={`ios-banner ${phase !== 'idle' && next?.needsHuman ? 'show' : ''}`} role="status">
            <span className="app-icon">🤖</span>
            <div>
              <div className="banner-top"><b>Hirearchy Agent</b><span>now</span></div>
              <p>{next?.needsHuman ? next.text : ''}</p>
            </div>
          </div>

          <header className="chat-head">
            <span className="avatar bot">🤖</span>
            <b>Hirearchy Agent 🤖</b>
            <small>iMessage</small>
          </header>

          <div className="chat" ref={chat}>
            {visible.length === 0 && phase === 'idle' && <p className="chat-empty">No messages yet</p>}
            {visible.length > 0 && <p className="chat-day">Today {times.current.get(agentItems[0]?.key) ?? ''}</p>}
            {visible.map((item) =>
              item.card ? (
                <CalendarCard key={item.key} {...item.card} />
              ) : (
                <div key={item.key} className={`msg ${item.from}`}>
                  <p className="bubble">{item.text}</p>
                  <time>{item.from === 'agent' ? times.current.get(item.key) : item.time}</time>
                </div>
              ),
            )}
            {phase === 'typing' && (
              <div className="msg agent">
                <p className="bubble typing" aria-label="Agent is typing"><i /><i /><i /></p>
              </div>
            )}
            {canReply && (
              <div className="quick-replies">
                <button className="qr yes" onClick={() => send({ kind: 'accept' }, "✅ I'm in")}>✅ I'm in</button>
                <button className={`qr ${picking ? 'on' : ''}`} onClick={() => setPicking((v) => !v)}>🕗 Suggest a time</button>
                <button className="qr no" onClick={() => send({ kind: 'decline' }, 'Not this time')}>Not this time</button>
                {picking && (
                  <div className="time-picker">
                    {TIME_CHIPS.map((t) => (
                      <button key={t} className="qr time" onClick={() => send({ kind: 'counter', text: t }, `🕗 How about ${t}?`)}>{t}</button>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (custom.trim()) send({ kind: 'counter', text: custom }, `🕗 ${custom.trim()}`);
                      }}
                    >
                      <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="or type, e.g. 8:15pm" aria-label="Suggest a time" />
                      <button type="submit" className="send" disabled={!custom.trim()} aria-label="Send">↑</button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="compose" aria-hidden>
            <span className="plus">+</span>
            <span className="field">iMessage</span>
          </div>
          <span className="home-bar" />
        </div>
        </div>
      </div>
      <figcaption>
        <b>{owner}</b>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const HUES = [212, 152, 265, 32, 340, 190];
const hue = (name: string) => HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

function CalendarCard({ title, when, skills, people, onAdd }: CalendarCardData) {
  return (
    <div className="cal-card">
      <div className="cal-top">
        <span className="cal-icon"><b>TODAY</b>📅</span>
        <div>
          <b>{title}</b>
          <span>{when}</span>
        </div>
      </div>
      <div className="cal-skills">
        {skills.map((s) => <span key={s}>{s}</span>)}
      </div>
      <ul className="cal-people">
        {people.map((p, i) => (
          <li key={p.name} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>
            <span className="avatar person" style={{ background: `hsl(${hue(p.name)} 70% 45%)` }}>
              {initials(p.name)}
              <span className="unlock">🔓</span>
            </span>
            <span className="person-name">{p.you ? 'You' : p.name.split(' ')[0]}</span>
          </li>
        ))}
      </ul>
      <button className="cal-add" onClick={onAdd}>Add to calendar</button>
    </div>
  );
}
