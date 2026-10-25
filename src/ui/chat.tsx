import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

// Building blocks for an iMessage-style phone. IPhone (prep circle) is assembled from these; other tabs can
// reuse them through src/ui/kit.ts.

export const clock = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Current time ("8:42 PM"), refreshed every 15 s. */
export function useClock(): string {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Anything shown in a chat: who sent it, plus whether it needs the human (banner first, quick replies after). */
export interface RevealItem {
  key: string;
  from: 'agent' | 'me';
  needsHuman?: boolean;
}

/**
 * Reveals agent messages one at a time, iMessage style: (notification banner →) typing dots → bubble.
 * The user's own messages appear right after the agent message they answer. `pace` scales the timing.
 */
export function useChatReveal<T extends RevealItem>(items: T[], pace: number) {
  const agentItems = items.filter((i) => i.from === 'agent');
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'banner' | 'typing'>('idle');
  const times = useRef(new Map<string, string>());

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
  return {
    visible,
    next,
    phase,
    /** Time each agent message appeared ("8:42 PM"). */
    timeOf: (key: string) => times.current.get(key),
    firstTime: times.current.get(agentItems[0]?.key ?? ''),
    /** Last message is the agent asking the human, and nothing else is on its way. */
    awaitingHuman: !next && visible.at(-1)?.from === 'agent' && Boolean(visible.at(-1)?.needsHuman),
  };
}

/** iOS notification banner that slides down from the top of the screen. */
export function NotificationBanner({ show, text, app = 'Hirearchy Agent', icon = '🤖' }: { show: boolean; text: string; app?: string; icon?: string }) {
  return (
    <div className={`ios-banner ${show ? 'show' : ''}`} role="status">
      <span className="app-icon">{icon}</span>
      <div>
        <div className="banner-top"><b>{app}</b><span>now</span></div>
        <p>{show ? text : ''}</p>
      </div>
    </div>
  );
}

export function ChatBubble({ from, text, time }: { from: 'agent' | 'me'; text: string; time?: string }) {
  return (
    <div className={`msg ${from}`}>
      <p className="bubble">{text}</p>
      <time>{time}</time>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="msg agent">
      <p className="bubble typing" aria-label="Agent is typing"><i /><i /><i /></p>
    </div>
  );
}

export interface QuickReplyOption {
  label: string;
  onClick: () => void;
  /** 'yes' = filled blue, 'no' = quiet; default = outlined. */
  tone?: 'yes' | 'no';
  on?: boolean;
}

/** Tappable reply chips inside the chat; `children` renders under them (e.g. a time picker). */
export function QuickReplies({ options, children }: { options: QuickReplyOption[]; children?: ReactNode }) {
  return (
    <div className="quick-replies">
      {options.map((o) => (
        <button key={o.label} className={`qr ${o.tone ?? ''} ${o.on ? 'on' : ''}`.trim()} onClick={o.onClick}>{o.label}</button>
      ))}
      {children}
    </div>
  );
}

/** iPhone bezel, status bar, contact header and compose bar around a scrolling chat. */
export function PhoneFrame({ owner, caption, banner, chatRef, contact = 'Hirearchy Agent 🤖', children }: {
  owner: string;
  caption: string;
  banner?: { show: boolean; text: string };
  chatRef?: RefObject<HTMLDivElement | null>;
  contact?: string;
  children: ReactNode;
}) {
  const now = useClock();
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

            <NotificationBanner show={Boolean(banner?.show)} text={banner?.text ?? ''} />

            <header className="chat-head">
              <span className="avatar bot">🤖</span>
              <b>{contact}</b>
              <small>iMessage</small>
            </header>

            <div className="chat" ref={chatRef}>{children}</div>

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

export interface CalendarCardData {
  title: string;
  when: string;
  skills: string[];
  people: { name: string; you: boolean }[];
  onAdd: () => void;
}

/** Calendar-invite card with avatars and names unlocking (names must already be consent-cleared). */
export function CalendarCard({ title, when, skills, people, onAdd }: CalendarCardData) {
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
