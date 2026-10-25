import { useEffect, useRef, useState } from 'react';
import {
  ChatBubble,
  Drawer,
  PhoneFrame,
  QuickReplies,
  SPEEDS,
  TypingIndicator,
  clock,
  type TabProps,
} from '../../ui/kit';
import {
  EMPTY_CREDITS,
  GRACE_PERIOD_HOURS,
  MICROSOFT_SEED_INTEL,
  anonymizeReport,
  checkIntelAccess,
  describeAccess,
  describeAnonymization,
  recordContribution,
  selectRelevantIntel,
  type CreditState,
  type PrivacyEvent,
  type RawInterviewReport,
  type SharedInterviewReport,
} from './logic';

const COMPANY = 'Microsoft';
const ROUNDS = ['Technical screen', 'Technical round 2', 'Behavioral', 'Final round'];
const TOPICS = ['arrays', 'hash maps', 'graphs', 'BFS', 'system design', 'behavioral', 'STAR', 'debugging'];
const DIFFICULTIES = [1, 2, 3, 4, 5];

/** The student answers the agent one question at a time. */
type Step = 'intro' | 'round' | 'topics' | 'difficulty' | 'tip' | 'done';

interface Said {
  after: Step;
  text: string;
  time: string;
}

const EVENT_LABEL: Record<PrivacyEvent['kind'], string> = {
  shared: 'SHARED',
  summarized: 'SUMMARIZED',
  hidden: 'HIDDEN',
  gate: 'GATE',
};

const PROMPT: Record<Step, string> = {
  intro: `How did your ${COMPANY} interview go? A quick anonymous report helps everyone else in your pipeline — and unlocks theirs.`,
  round: 'Which round was it?',
  topics: 'What came up? Pick as many as you like.',
  difficulty: 'How hard was it, 1 to 5?',
  tip: 'One tip for the next student?',
  done: 'Shared anonymously. Your report helps the next student in line.',
};

/** Interview intel: contribute an anonymized report, unlock what everyone else shared. */
export function IntelTab({ speed, resetKey }: TabProps) {
  const [step, setStep] = useState<Step>('intro');
  const [round, setRound] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(0);
  const [draft, setDraft] = useState('');
  const [said, setSaid] = useState<Said[]>([]);
  const [credits, setCredits] = useState<CreditState>(EMPTY_CREDITS);
  const [shared, setShared] = useState<SharedInterviewReport | null>(null);
  const [events, setEvents] = useState<PrivacyEvent[]>([]);
  const [typing, setTyping] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const chat = useRef<HTMLDivElement>(null);

  const pace = SPEEDS[speed].pace;

  /** Back to a fresh visit (global Reset). */
  const reset = () => {
    setStep('intro');
    setRound('');
    setTopics([]);
    setDifficulty(0);
    setDraft('');
    setSaid([]);
    setCredits(EMPTY_CREDITS);
    setShared(null);
    setEvents([]);
    setTyping(false);
    setDrawer(false);
  };

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // The agent "types" before each new question; speed controls how long.
  useEffect(() => {
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 520 * pace);
    return () => clearTimeout(t);
  }, [step, pace]);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [said.length, step, typing]);

  const answer = (after: Step, text: string, nextStep: Step) => {
    setSaid((s) => [...s, { after, text, time: clock() }]);
    setStep(nextStep);
  };

  /** Hand the report to logic.ts: it anonymizes, explains and credits. The UI only renders the result. */
  const submit = (finalTip: string) => {
    const raw: RawInterviewReport = {
      company: COMPANY,
      round,
      topics,
      difficulty,
      tip: finalTip,
      // The exact date never leaves logic.ts; it becomes "this week".
      interviewDate: new Date().toLocaleDateString('en-CA'),
    };

    setShared(anonymizeReport(raw));
    setEvents(describeAnonymization(raw));
    setCredits((c) => recordContribution(c, raw));
    answer('tip', finalTip, 'done');
  };

  const hasContributed = credits.credits > 0;
  // The gate is decided by logic.ts, never by the component. `now` is injected, so this stays honest.
  const now = new Date();
  const gate = checkIntelAccess({
    hasContributed,
    // A student who just arrived is inside their grace period; this demo starts the clock now.
    gracePeriodStart: now,
    now,
  });
  const gateEvent = describeAccess(gate);
  const intel = gate.allowed ? selectRelevantIntel(MICROSOFT_SEED_INTEL, COMPANY) : [];
  const allEvents = [...events, gateEvent];

  const bubbles: Array<{ key: string; node: React.ReactNode }> = [];
  const order: Step[] = ['intro', 'round', 'topics', 'difficulty', 'tip', 'done'];
  for (const s of order) {
    if (order.indexOf(s) > order.indexOf(step)) break;
    bubbles.push({ key: `q-${s}`, node: <ChatBubble from="agent" text={PROMPT[s]} /> });
    for (const [i, r] of said.entries()) {
      if (r.after === s) bubbles.push({ key: `a-${i}`, node: <ChatBubble from="me" text={r.text} time={r.time} /> });
    }
  }

  return (
    <div className="app started">
      <header className="hero">
        <h1>
          Trade interview intel. <span className="accent">Anonymously.</span>
        </h1>
        <p className="sub">
          Give to get: share one anonymous report and you unlock what everyone else in your {COMPANY} pipeline
          learned. New students get a {GRACE_PERIOD_HOURS}-hour grace period first.
        </p>
        <div className="hero-meta">
          <span className="proof-pill">No names, emails, phone numbers or handles ever leave your report</span>
          <button className="hood-btn" onClick={() => setDrawer(true)}>
            See what was shared and hidden
          </button>
        </div>
      </header>

      <main className="phones">
        <PhoneFrame owner="Aditya" caption={`just interviewed at ${COMPANY}`} chatRef={chat}>
          <p className="chat-day">Today {clock()}</p>
          {bubbles.map((b) => (
            <span key={b.key}>{b.node}</span>
          ))}
          {typing && <TypingIndicator />}

          {!typing && step === 'intro' && (
            <QuickReplies
              options={[
                { label: 'Write my report', tone: 'yes', onClick: () => answer('intro', 'Write my report', 'round') },
              ]}
            />
          )}

          {!typing && step === 'round' && (
            <QuickReplies
              options={ROUNDS.map((r) => ({
                label: r,
                onClick: () => {
                  setRound(r);
                  answer('round', r, 'topics');
                },
              }))}
            />
          )}

          {!typing && step === 'topics' && (
            <QuickReplies
              options={[
                ...TOPICS.map((t) => ({
                  label: t,
                  on: topics.includes(t),
                  onClick: () => setTopics((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t])),
                })),
                {
                  label: '→ Next',
                  tone: 'yes' as const,
                  onClick: () => answer('topics', topics.join(', '), 'difficulty'),
                },
              ].filter((o) => o.label !== '→ Next' || topics.length > 0)}
            />
          )}

          {!typing && step === 'difficulty' && (
            <QuickReplies
              options={DIFFICULTIES.map((d) => ({
                label: '★'.repeat(d),
                onClick: () => {
                  setDifficulty(d);
                  answer('difficulty', `${'★'.repeat(d)} (${d}/5)`, 'tip');
                },
              }))}
            />
          )}

          {!typing && step === 'tip' && (
            <QuickReplies options={[]}>
              <form
                className="compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) submit(draft.trim());
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="e.g. think out loud before you code"
                  aria-label="One tip for the next student"
                />
                <button type="submit" className="send" disabled={!draft.trim()} aria-label="Send">
                  ↑
                </button>
              </form>
            </QuickReplies>
          )}
        </PhoneFrame>

        <section className="card">
          <h3>{gate.allowed ? 'Intel unlocked' : 'Give to get'}</h3>
          <p className="sub">
            {hasContributed
              ? `Thanks for contributing. +${credits.credits} give-back credit.`
              : gate.allowed
                ? `You're inside your ${GRACE_PERIOD_HOURS}-hour grace period. Contribute a report to keep access.`
                : 'Share one anonymous report to unlock intel from your pipeline.'}
          </p>

          {shared && (
            <div className="card">
              <h3>Your report, anonymized</h3>
              <p className="chat-day">
                {shared.round} · {'★'.repeat(shared.difficulty)} · {shared.when}
              </p>
              <div className="chips">
                {shared.topics.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
              {shared.tip && <p className="sub">“{shared.tip}”</p>}
            </div>
          )}

          {intel.map((report, i) => (
            <article key={`${report.round}-${i}`} className="card">
              <h3>
                {report.round} · {'★'.repeat(report.difficulty)}
              </h3>
              <div className="chips">
                {report.topics.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
              <p className="sub">“{report.tip}”</p>
              <span className="tag">Anonymous student · {report.when}</span>
            </article>
          ))}

          {!gate.allowed && <p className="feed-empty">Intel locked: contribution required.</p>}
        </section>
      </main>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Under the hood"
        subtitle="What your report shared, summarized and hid. Students never see this."
        badge={<span className={`state-pill ${gate.allowed ? 'tone-good' : 'tone-warn'}`}>{gateEvent.detail}</span>}
      >
        <div className="drawer-body">
          <section className="card feed-card">
            <h3>Privacy events</h3>
            <div className="feed">
              {allEvents.map((e, i) => (
                <p key={`${e.kind}-${i}`} className="msg">
                  <b>{EVENT_LABEL[e.kind]}</b> · {e.detail}
                </p>
              ))}
              {events.length === 0 && <p className="feed-empty">Submit your report to see the privacy rules fire.</p>}
            </div>
          </section>
        </div>
      </Drawer>
    </div>
  );
}
