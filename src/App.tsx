import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine, TRIGGER_AGENT_ID, type HumanReply, type PhoneMessage, type Skill, type TimeWindow } from './engine';
import { shortWindow } from './ui/format';
import { Graph } from './ui/Graph';
import { Inspector } from './ui/Inspector';
import { Phone } from './ui/Phone';
import { deriveGraph, stateAt } from './ui/view';
import summary from './ui/test-summary.json';

const IDS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
const VIEWER = TRIGGER_AGENT_ID;
const STEP_MS = 260;
// Demo personas for each student's own phone. Names on the graph come only from getIdentity().
const PHONES = [
  { id: 'a1', owner: "Aditya's phone" },
  { id: 'a2', owner: "Sumit's phone" },
  { id: 'a3', owner: "Maya's phone" },
  { id: 'a4', owner: "Jordan's phone" },
];

export default function App() {
  const engine = useMemo(() => new Engine(), []);
  const [, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState('');
  const phones = useRef<Record<string, PhoneMessage[]>>({});

  const events = engine.events();
  const caughtUp = cursor >= events.length;
  const shown = events.slice(0, cursor);
  const state = stateAt(engine.history(), cursor);
  const labels = engine.labels();

  // Replay new events one by one so the feed and graph read as a live conversation.
  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => setCursor((c) => c + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [cursor, caughtUp]);

  if (caughtUp) phones.current = Object.fromEntries(PHONES.map((p) => [p.id, engine.phone(p.id)]));

  const view = deriveGraph(shown, IDS, VIEWER);
  const names: Record<string, string> = {};
  if (view.revealed) {
    for (const id of IDS) {
      try {
        names[id] = engine.getIdentity(VIEWER, id).name;
      } catch {
        // locked: not in the circle or consent incomplete
      }
    }
  }

  const act = (fn: () => void) => {
    setError('');
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
    setVersion((v) => v + 1);
  };
  const reply = (id: string, r: HumanReply) => act(() => engine.reply(id, r));
  const reset = () => {
    engine.resetDemo();
    phones.current = {};
    setCursor(0);
    act(() => {});
  };

  const complete = caughtUp ? events.find((e) => e.type === 'COMPLETE') : undefined;
  const mayaCanDecline = caughtUp && Boolean(phones.current.a3?.at(-1)?.actions.length);
  const visiblePhones = PHONES.filter((p) => p.id !== 'a4' || (phones.current.a4?.length ?? 0) > 0);

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Hirearchy Agents</h1>
          <p className="tagline">
            Land an interview, and your agent finds students in the same pipeline to prep with. Names are shared only once everyone says yes.
          </p>
        </div>
        <div className="controls">
          <button className="primary" disabled={engine.state !== 'IDLE'} onClick={() => act(() => engine.simulateInterviewInvite())}>
            📩 Simulate interview invite
          </button>
          <button disabled={!mayaCanDecline} onClick={() => reply('a3', { kind: 'decline' })}>Decline as Maya</button>
          <span className="proof" title={`Leak-scan test: "${summary.privacyTest.name}"`}>
            {summary.privacyTest.passed ? '🔒' : '⚠'} Privacy proof · <i>{summary.privacyTest.name}</i> · {summary.passed}/{summary.total} tests passing
          </span>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {complete && (
        <section className="final">
          <span>
            Prep Circle Created ✓ · {(complete.payload.pipeline as { company: string; role: string }).company}{' '}
            {(complete.payload.pipeline as { company: string; role: string }).role} · {shortWindow(complete.payload.window as TimeWindow)} ·{' '}
            {(complete.payload.skills as Skill[]).join(', ')}
          </span>
          <button disabled title=".ics download arrives in phase 5">📅 Download .ics</button>
        </section>
      )}

      <main className="grid">
        <section className="panel">
          <header>
            <h2>Network · your view</h2>
          </header>
          <Graph ids={IDS} labels={labels} view={view} names={names} />
        </section>
        <Inspector events={shown} state={state} labels={labels} viewer={VIEWER} />
      </main>

      <section className="phones">
        {visiblePhones.map((p) => (
          <Phone
            key={p.id}
            owner={p.owner}
            subtitle={`Others see: ${labels[p.id]}`}
            messages={phones.current[p.id] ?? []}
            busy={!caughtUp}
            onReply={(r) => reply(p.id, r)}
          />
        ))}
      </section>

      <footer>
        <button className="reset" onClick={reset} title="Reset demo" aria-label="Reset demo">↺</button>
      </footer>
    </div>
  );
}
