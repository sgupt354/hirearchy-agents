import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine, PIPELINE, TRIGGER_AGENT_ID, type CoordinationState, type HumanReply, type PhoneMessage } from './engine';
import { prettify, studentCopy, windowText } from './ui/copy';
import { downloadIcs, generateMessage, notifyPhone, parseInvite } from './ui/integrationsStub';
import { InviteModal } from './ui/InviteModal';
import { IPhone, type ChatItem } from './ui/IPhone';
import { UnderTheHood } from './ui/UnderTheHood';
import { deriveGraph, inviteOutcome, messagesAvailable, stateAt, type InviteOutcome, type Lens } from './ui/view';
import summary from './ui/test-summary.json';

const IDS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
const VIEWER = TRIGGER_AGENT_ID;
// Event replay step (ms) and chat pacing per presentation speed.
const SPEEDS = { slow: { step: 700, pace: 1.6 }, normal: { step: 260, pace: 1 }, fast: { step: 80, pace: 0.4 } } as const;
type Speed = keyof typeof SPEEDS;
// Each student's own phone. Jordan's only appears once Jordan's agent sends a message (backup branch).
const PEOPLE = [
  { id: 'a1', name: 'Aditya' },
  { id: 'a2', name: 'Sumit' },
  { id: 'a3', name: 'Maya' },
  { id: 'a4', name: 'Jordan' },
];

interface Reply {
  after: number; // id of the agent message it answers
  text: string;
  time: string;
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
const clock = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function heroStatus(state: CoordinationState, window: string): { text: string; tone: string } {
  if (['CONSENT_COMPLETE', 'IDENTITIES_REVEALED', 'COMPLETED'].includes(state)) return { text: `✓ Prep circle created · Tonight ${window}`, tone: 'good' };
  if (['AWAITING_HUMANS', 'AWAITING_CONSENT', 'COUNTERED'].includes(state)) return { text: 'Over to the students. Check their phones 👇', tone: 'human' };
  if (['DECLINED', 'DISSOLVED', 'REDISCOVERING'].includes(state)) return { text: "Someone couldn't make it. Finding a new match…", tone: 'warn' };
  return { text: "Aditya's agent is finding a prep circle…", tone: 'busy' };
}

export default function App() {
  const engine = useMemo(() => new Engine(), []);
  const [, setVersion] = useState(0);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePending, setInvitePending] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteOutcome | null>(null);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const requested = useRef(new Set<string>());
  // Bumped on reset so async results and phone state from a previous run are dropped.
  const run = useRef(0);

  const events = engine.events();
  const caughtUp = cursor >= events.length;
  const shown = events.slice(0, cursor);
  const state = stateAt(engine.history(), cursor);
  const labels = engine.labels();
  const label = (id: string) => (id === VIEWER ? 'You' : id === 'broker' ? 'Broker' : (labels[id] ?? id));

  // Replay new events one by one so the agents' conversation unfolds live.
  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speed].step);
    return () => clearTimeout(t);
  }, [cursor, caughtUp, speed]);

  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer]);

  // Each phone only shows messages whose causing event has been replayed.
  const inbox: Record<string, PhoneMessage[]> = {};
  for (const p of PEOPLE) {
    const all = engine.phone(p.id);
    inbox[p.id] = all.slice(0, messagesAvailable(events, cursor, p.id, all.length));
  }

  // Structured messages go through generateMessage(); Aditya's "needs you" messages also notifyPhone().
  useEffect(() => {
    const thisRun = run.current;
    for (const p of PEOPLE) {
      for (const m of inbox[p.id]) {
        const key = `${thisRun}:${p.id}:${m.id}`;
        if (requested.current.has(key)) continue;
        requested.current.add(key);
        const text = m.kind
          ? generateMessage({ recipientLabel: labels[p.id], kind: m.kind, details: m.details ?? {} }).catch(() => m.text)
          : Promise.resolve(m.text);
        text.then((t) => {
          if (run.current !== thisRun) return;
          if (m.kind) setGenerated((g) => ({ ...g, [key]: t }));
          if (p.id === VIEWER && m.actions.length) notifyPhone(t).catch(() => {});
        });
      }
    }
  });

  // An integration that rewrites a message wins; with the stub (template text) the UI's student copy is used.
  const display = (id: string, m: PhoneMessage) => {
    const g = generated[`${run.current}:${id}:${m.id}`];
    return g && g !== m.text ? prettify(g) : studentCopy(m, PIPELINE.company);
  };

  const view = deriveGraph(shown, IDS, VIEWER);
  const namesFor = (owner: string) => {
    const names: Record<string, string> = {};
    for (const id of IDS) {
      try {
        names[id] = engine.getIdentity(owner, id).name;
      } catch {
        // locked: not in the circle or consent incomplete
      }
    }
    return names;
  };
  const graphNames = view.revealed ? namesFor(VIEWER) : {};

  const act = (fn: () => void): boolean => {
    setError('');
    let ok = true;
    try {
      fn();
    } catch (e) {
      ok = false;
      setError((e as Error).message);
    }
    setVersion((v) => v + 1);
    return ok;
  };

  const start = () => act(() => engine.simulateInterviewInvite());

  const reply = (id: string, r: HumanReply, bubble: string) => {
    const after = inbox[id].at(-1)?.id ?? 0;
    if (act(() => engine.reply(id, r))) {
      setReplies((all) => ({ ...all, [id]: [...(all[id] ?? []), { after, text: bubble, time: clock() }] }));
    }
  };

  /** Back to the exact start state. Only the presenter's speed setting is kept. */
  const reset = () => {
    run.current += 1;
    engine.resetDemo();
    requested.current.clear();
    setGenerated({});
    setReplies({});
    setCursor(0);
    setDrawer(false);
    setLenses([]);
    setInviteOpen(false);
    setInvitePending(false);
    setInviteStatus(null);
    act(() => {});
  };

  const checkInvite = async (text: string) => {
    const thisRun = run.current;
    setInvitePending(true);
    setInviteStatus(null);
    const parsed = await parseInvite(text).catch(() => null);
    if (run.current !== thisRun) return;
    setInvitePending(false);
    const outcome = inviteOutcome(parsed, PIPELINE);
    setInviteStatus(outcome);
    if (outcome.start) {
      setInviteOpen(false);
      start();
    }
  };

  const chatFor = (id: string): ChatItem[] => {
    const items: ChatItem[] = [];
    for (const m of inbox[id]) {
      const item: ChatItem = { key: `m${m.id}`, from: 'agent', text: display(id, m), needsHuman: m.actions.length > 0 };
      if (m.kind === 'complete' && engine.window) {
        const slot = engine.window;
        const members = engine.circle?.members ?? [];
        const names = namesFor(id);
        item.card = {
          title: `${PIPELINE.company} ${PIPELINE.role} prep circle`,
          when: `Tonight · ${windowText(slot)}`,
          skills: (m.details?.skills ?? '').split(', '),
          people: [id, ...members.filter((x) => x !== id)].map((x) => ({ name: names[x] ?? 'Hidden', you: x === id })),
          onAdd: () =>
            downloadIcs({
              title: `${PIPELINE.company} ${PIPELINE.role} prep circle`,
              start: slot.start,
              end: slot.end,
              date: today(),
              description: `Skills: ${m.details?.skills}\nWith: ${members.filter((x) => x !== id).map((x) => names[x]).join(', ')}`,
            }),
        };
      }
      items.push(item);
      for (const [i, r] of (replies[id] ?? []).entries()) {
        if (r.after === m.id) items.push({ key: `r${i}`, from: 'me', text: r.text, time: r.time });
      }
    }
    return items;
  };

  const idle = engine.state === 'IDLE';
  const status = heroStatus(state, engine.window ? windowText(engine.window) : '');
  const phones = PEOPLE.filter((p) => p.id !== 'a4' || inbox.a4.length > 0);
  const pace = SPEEDS[speed].pace;

  return (
    <div className={`app ${idle ? '' : 'started'}`}>
      <nav className="topbar">
        <span className="brand"><span className="logo">◆</span>Hirearchy</span>
        <div className="corner">
          <button className="hood-btn" onClick={() => setDrawer(true)}>🔍 See what the agents are doing</button>
          <div className="segmented" role="group" aria-label="Playback speed">
            {(Object.keys(SPEEDS) as Speed[]).map((s) => (
              <button key={s} className={s === speed ? 'on' : ''} aria-pressed={s === speed} onClick={() => setSpeed(s)}>{s}</button>
            ))}
          </div>
          <button className="icon-btn reset" onClick={reset} title="Reset demo" aria-label="Reset demo">↺</button>
        </div>
      </nav>

      <header className="hero">
        <h1>Land the interview. <span className="accent">Your agent finds your prep circle.</span></h1>
        <p className="sub">Agents negotiate. You only decide what matters. Names stay hidden until everyone says yes.</p>
        <div className="cta-row">
          {idle ? (
            <>
              <button className="cta" onClick={start}>📩 Aditya just got a Microsoft interview invite →</button>
              <button className="ghost" onClick={() => setInviteOpen(true)}>Paste a real invite</button>
            </>
          ) : (
            <span key={status.text} className={`live-status ${status.tone}`}>
              {status.tone === 'busy' && <span className="spinner" />}
              {status.text}
            </span>
          )}
        </div>
        <span className="proof-pill" title={`Leak-scan test: "${summary.privacyTest.name}"`}>
          {summary.privacyTest.passed ? '🔒' : '⚠'} Privacy proof · <i>{summary.privacyTest.name}</i> · {summary.passed}/{summary.total} tests passing
        </span>
      </header>

      <main className="phones">
        {phones.map((p) => (
          <IPhone
            key={`${run.current}:${p.id}`}
            owner={p.name}
            caption={`others see “${labels[p.id]}”`}
            items={chatFor(p.id)}
            interactive={caughtUp}
            pace={pace}
            onReply={(r, bubble) => reply(p.id, r, bubble)}
          />
        ))}
      </main>

      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}

      <InviteModal
        key={run.current}
        open={inviteOpen}
        pending={invitePending}
        status={inviteStatus}
        onCheck={checkInvite}
        onClose={() => {
          setInviteOpen(false);
          setInviteStatus(null);
        }}
      />

      <UnderTheHood
        open={drawer}
        onClose={() => setDrawer(false)}
        state={state}
        events={shown}
        ids={IDS}
        labels={labels}
        label={label}
        view={view}
        names={graphNames}
        lenses={lenses}
        onToggleLens={(l) => setLenses((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]))}
      />
    </div>
  );
}
