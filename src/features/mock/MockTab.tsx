import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '../../engine/types';
import { Drawer, Inspector, JudgeLegend, SPEEDS, clock, type Lens } from '../../ui/kit';
import { longReason, shortReason } from '../../ui/copy';
import type { TabProps } from '../types';
import { describeMock } from './copy';
import { MockPhone, type MockAction, type MockChatItem } from './MockPhone';
import { MockSwap, type MockState, type StateChange } from './mockSwap';
import { MOCK_SEEKER, SOLO_SEEKER } from './seed';

const PEOPLE: Record<string, string> = { m1: 'Aditya', m4: 'Jordan', m5: 'Priya', m8: 'Riya' };

interface Reply {
  after: number;
  text: string;
  time: string;
}

const stateAt = (history: StateChange[], cursor: number): MockState =>
  history.reduce<MockState>((s, h) => (h.afterEvents <= cursor ? h.to : s), 'IDLE');

const STATE_TEXT: Record<MockState, string> = {
  IDLE: 'Ready',
  MATCHING: 'Finding a partner',
  MATCH_FOUND: 'Partner found',
  NEGOTIATING: 'Negotiating',
  AWAITING_HUMANS: 'Waiting on students',
  AWAITING_CONSENT: 'Waiting on students',
  DECLINED: 'Someone said no',
  CONFIRMED: 'Confirmed',
  ROUND_1: 'Round 1',
  ROUND_2: 'Round 2',
  SCORING: 'Scoring',
  COMPLETED: 'Done',
  NO_PEER: 'No peer free',
  SOLO: 'Practicing with agent',
};

function heroStatus(state: MockState, solo: boolean): { text: string; tone: string } {
  if (state === 'COMPLETED') return { text: solo ? '✓ Practice done · self-scores saved privately' : '✓ Mock swap done · scores went privately to each person', tone: 'good' };
  if (state === 'ROUND_1' || state === 'ROUND_2') return { text: `${state === 'ROUND_1' ? 'Round 1' : 'Round 2'} of 2 is live. Timer's running ⏱`, tone: 'human' };
  if (state === 'SCORING') return { text: 'Rounds done. Each side scores the other, privately.', tone: 'human' };
  if (state === 'AWAITING_HUMANS' || state === 'AWAITING_CONSENT') return { text: 'Over to the students. Check their phones 👇', tone: 'human' };
  if (state === 'NO_PEER' || state === 'SOLO') return { text: 'No one free in this round, so the agent offers practice instead', tone: 'warn' };
  if (state === 'DECLINED') return { text: 'Partner couldn’t make it. Trying the backup…', tone: 'warn' };
  return { text: "Aditya's agent is finding a mock partner…", tone: 'busy' };
}

/** The mock-interview swap: reciprocal mocks with students in the same pipeline and round. */
export function MockTab({ speed, resetKey }: TabProps) {
  const mock = useMemo(() => new MockSwap(), []);
  const [, setVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [solo, setSolo] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [error, setError] = useState('');
  const run = useRef(0);

  const events = mock.events();
  const caughtUp = cursor >= events.length;
  const shown = events.slice(0, cursor);
  const state = stateAt(mock.history(), cursor);
  const labels = mock.labels();
  const viewer = solo ? SOLO_SEEKER : MOCK_SEEKER;
  const label = (id: string) => (id === viewer ? 'You' : id === 'broker' ? 'Broker' : (labels[id] ?? id));

  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speed].step);
    return () => clearTimeout(t);
  }, [cursor, caughtUp, speed]);

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [drawer]);

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

  function reset() {
    run.current += 1;
    mock.reset();
    setCursor(0);
    setSolo(false);
    setDrawer(false);
    setLenses([]);
    setReplies({});
    act(() => {});
  }

  const begin = (asSolo: boolean) => {
    setSolo(asSolo);
    act(() => mock.start(asSolo ? SOLO_SEEKER : MOCK_SEEKER));
  };

  const inbox = (id: string) => mock.phone(id).filter((m) => m.at <= cursor);

  const handle = (id: string, a: MockAction, bubble: string) => {
    const after = inbox(id).at(-1)?.id ?? 0;
    const ok = act(() => {
      if (a.type === 'accept' || a.type === 'decline') mock.reply(id, a.type);
      else if (a.type === 'solo') mock.practiceWithAgent(id);
      else if (a.type === 'solo-no') mock.declineSolo(id);
      else if (a.type === 'done') mock.soloDone(id);
      else if (a.type === 'end-round') mock.endRound(id);
      else if (a.type === 'scores') mock.submitScores(id, a.rubric, a.note);
      else if (a.type === 'self-scores') mock.submitSelfScores(id, a.rubric);
    });
    if (ok) setReplies((all) => ({ ...all, [id]: [...(all[id] ?? []), { after, text: bubble, time: clock() }] }));
  };

  const chatFor = (id: string): MockChatItem[] => {
    const items: MockChatItem[] = [];
    for (const m of inbox(id)) {
      items.push({ key: `m${m.id}`, from: 'agent', text: m.text, needsHuman: m.needsHuman, kind: m.kind, data: m.data });
      for (const [i, r] of (replies[id] ?? []).entries()) if (r.after === m.id) items.push({ key: `r${i}`, from: 'me', text: r.text, time: r.time });
    }
    return items;
  };

  // Own scores only: each phone reads its owner's scores through the private vault.
  const ownScores = (id: string) => {
    try {
      return mock.getScores(id, id);
    } catch {
      return [];
    }
  };

  const idle = mock.state === 'IDLE';
  const phones = solo ? [SOLO_SEEKER] : ['m1', 'm4', ...(inbox('m5').length ? ['m5'] : [])];
  const liveRound = state === 'ROUND_1' ? 1 : state === 'ROUND_2' ? 2 : null;
  const status = heroStatus(state, solo);

  return (
    <div className={`app ${idle ? '' : 'started'}`}>
      <header className="hero">
        <h1>Practice the real round. <span className="accent">Swap mock interviews with your pipeline.</span></h1>
        <p className="sub">Same company, same round. You interview them, they interview you. Your scores stay yours.</p>
        <div className="cta-row">
          {idle ? (
            <>
              <button className="cta" onClick={() => begin(false)}>🎤 Aditya's Microsoft technical round is Thursday →</button>
              <button className="ghost" onClick={() => begin(true)}>No one in your round? See Riya's Google round</button>
            </>
          ) : (
            <span key={status.text} className={`live-status ${status.tone}`}>
              {status.tone === 'busy' && <span className="spinner" />}
              {status.text}
            </span>
          )}
        </div>
        <div className="hero-meta">
          <span className="proof-pill">🔒 Scores go only to the person scored · names unlock after both say yes</span>
          <button className="hood-btn" onClick={() => setDrawer(true)}>🔍 See what the agents are doing</button>
        </div>
      </header>

      <main className="phones">
        {phones.map((id) => (
          <MockPhone
            key={`${run.current}:${id}`}
            owner={PEOPLE[id]}
            caption={`others see “${labels[id]}”`}
            items={chatFor(id)}
            interactive={caughtUp}
            pace={SPEEDS[speed].pace}
            timerRate={speed}
            liveRound={liveRound}
            scores={ownScores(id)}
            onAction={(a, bubble) => handle(id, a, bubble)}
          />
        ))}
      </main>

      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Under the hood"
        subtitle="How the agents found a mock partner. Students never see this."
        badge={<span className={`state-pill mock-${state}`}>{STATE_TEXT[state]}</span>}
      >
        <JudgeLegend active={lenses} onToggle={(l) => setLenses((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]))} />
        <div className="drawer-body">
          <section className="card">
            <h3>Match board · {solo ? "Riya's" : "Aditya's"} view</h3>
            <MatchBoard events={shown} viewer={viewer} labels={labels} />
          </section>
          <section className="card feed-card">
            <h3>Agent conversation</h3>
            <Inspector events={shown} label={label} lenses={lenses} describeEvent={describeMock} />
          </section>
        </div>
      </Drawer>
    </div>
  );
}

const RULES = [
  'Same company and round',
  'At least 60 minutes free together',
  'Same difficulty preference',
  'Never a 3rd mock with the same person (private)',
  'Complementary weak spots first',
];

/** Every candidate from the seeker's side: matched, backup, skipped or filtered (with the reason). */
function MatchBoard({ events, viewer, labels }: { events: AgentEvent[]; viewer: string; labels: Record<string, string> }) {
  const status: Record<string, { text: string; tone: string; title?: string }> = {};
  let current: string[] = [];
  for (const e of events.filter((x) => x.from === viewer || x.to.includes(viewer))) {
    if (e.type === 'FILTERED') status[e.payload.handle as string] = { text: shortMockReason(e.payload.reason as string), tone: 'muted', title: longReason(e.payload.reason as string) };
    if (e.type === 'REJECT' && e.payload.handle) status[e.payload.handle as string] = { text: 'Skipped · private rule', tone: 'warn' };
    if (e.type === 'DISCOVER' && e.payload.match) {
      for (const id of current) if (id !== viewer) status[id] = { text: 'Earlier match', tone: 'muted' };
      current = (e.payload.match as { members: string[] }).members;
      for (const id of current) if (id !== viewer) status[id] = { text: 'Paired ✓', tone: 'good' };
      for (const id of e.payload.backups as string[]) status[id] = { text: 'Backup', tone: 'info' };
    }
  }
  const ids = Object.keys(labels).filter((id) => id !== viewer);
  return (
    <div className="board">
      <ul className="board-list">
        {ids.map((id) => (
          <li key={id} className={`board-row tone-${status[id]?.tone ?? 'idle'}`} title={status[id]?.title}>
            <b>{labels[id]}</b>
            <span>{status[id]?.text ?? (events.length ? 'Checking…' : 'Waiting')}</span>
          </li>
        ))}
      </ul>
      <h3>Rules the agents enforce</h3>
      <ul className="rules">
        {RULES.map((r) => <li key={r}>✓ {r}</li>)}
      </ul>
    </div>
  );
}

function shortMockReason(reason: string): string {
  if (/round/.test(reason)) return 'Different round';
  if (/60 minutes/.test(reason)) return 'Not enough time together';
  if (/difficulty/.test(reason)) return 'Different difficulty';
  return shortReason(reason);
}
