import { useEffect, useRef, useState } from 'react';
import {
  ChatBubble,
  PhoneFrame,
  QuickReplies,
  SPEEDS,
  TypingIndicator,
  clock,
  type TabProps,
} from '../../ui/kit';
import {
  EMPTY_FIND_STATE,
  SEED_JOBS,
  STUDENT_FILTERS,
  dismissJob,
  surfacedMatches,
  trackJob,
  type FindState,
  type JobPosting,
} from './logic';
import { STUDENT, applyStore } from '../apply/store';

interface Said {
  afterJobId: string;
  text: string;
  time: string;
}

const intro = (count: number) => `I found ${count} new ${count === 1 ? 'match' : 'matches'} for you.`;

const pitch = (job: JobPosting) =>
  `New match: ${job.company} ${job.role} · posted ${job.posted}. ${job.location} · ${job.reasons.join(' · ')}. Track it?`;

/** Find: the agent surfaces matching roles; the student tracks or passes. */
export function FindTab({ speed, resetKey }: TabProps) {
  const [state, setState] = useState<FindState>(EMPTY_FIND_STATE);
  const [said, setSaid] = useState<Said[]>([]);
  const [typing, setTyping] = useState(false);
  const chat = useRef<HTMLDivElement>(null);

  const pace = SPEEDS[speed].pace;

  /** Back to a fresh visit (global Reset). */
  const reset = () => {
    setState(EMPTY_FIND_STATE);
    setSaid([]);
    setTyping(false);
  };

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Every decision comes from logic.ts; the component only renders what it returns.
  const remaining = surfacedMatches(state, STUDENT_FILTERS, SEED_JOBS);
  const current = remaining[0];

  // The agent "types" before each new match; speed controls how long.
  useEffect(() => {
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 520 * pace);
    return () => clearTimeout(t);
  }, [current?.id, pace]);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [said.length, typing]);

  const decide = (job: JobPosting, next: FindState, bubble: string) => {
    setState(next);
    setSaid((s) => [...s, { afterJobId: job.id, text: bubble, time: clock() }]);
  };

  const track = (job: JobPosting) => {
    decide(job, trackJob(state, job.id, SEED_JOBS), 'Track it');
    // One record per job across the product: Find says "marked applied", so the application starts there.
    applyStore.recordApplication({ owner: STUDENT, company: job.company, role: job.role, stage: 'Applied' });
  };

  const pass = (job: JobPosting) => decide(job, dismissJob(state, job.id), 'Not for me');

  const decided = SEED_JOBS.filter((job) => !remaining.includes(job));

  return (
    <div className="app started">
      <header className="hero">
        <h1>
          Find the job. <span className="accent">Your agent is already looking.</span>
        </h1>
        <p className="sub">
          Your agent watches the roles you want and brings matches to you. Track one and it flows into your
          applications, intel and prep circle.
        </p>
      </header>

      <main className="phones">
        <PhoneFrame owner="Aditya" caption="looking for a SWE internship" chatRef={chat}>
          <p className="chat-day">Today {clock()}</p>
          <ChatBubble from="agent" text={intro(SEED_JOBS.length)} />

          {decided.map((job) => {
            const reply = said.find((s) => s.afterJobId === job.id);
            return (
              <span key={job.id}>
                <ChatBubble from="agent" text={pitch(job)} />
                {reply && <ChatBubble from="me" text={reply.text} time={reply.time} />}
                {reply?.text === 'Track it' && (
                  <ChatBubble from="agent" text={`Tracked. You're marked applied for ${job.company}.`} />
                )}
              </span>
            );
          })}

          {current && !typing && <ChatBubble from="agent" text={pitch(current)} />}
          {typing && <TypingIndicator />}

          {current && !typing && (
            <QuickReplies
              options={[
                { label: 'Track it', tone: 'yes', onClick: () => track(current) },
                { label: 'Not for me', tone: 'no', onClick: () => pass(current) },
              ]}
            />
          )}

          {!current && !typing && (
            <ChatBubble from="agent" text="That's every match for now. I'll keep watching and ping you." />
          )}
        </PhoneFrame>

        <section className="card">
          <h3>Your applications</h3>
          {state.tracked.length === 0 ? (
            <p className="feed-empty">Nothing tracked yet. Track a match to get started.</p>
          ) : (
            state.tracked.map((app) => (
              <article key={app.jobId} className="card">
                <h3>{app.company}</h3>
                <span className="tag">status · {app.status}</span>
              </article>
            ))
          )}
          <p className="sub">Tracked roles power your Pipeline stats, Intel and prep circles.</p>
        </section>
      </main>
    </div>
  );
}
