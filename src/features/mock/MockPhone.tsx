import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChatBubble, PhoneFrame, QuickReplies, TypingIndicator, useChatReveal, type RevealItem } from '../../ui/kit';
import { clean } from '../../ui/text';
import type { MockMsgKind } from './mockSwap';
import type { PackQuestion } from './questions';
import { RUBRIC, type Rubric, type ScoreEntry } from './scores';

export interface MockChatItem extends RevealItem {
  text: string;
  kind?: MockMsgKind;
  data?: Record<string, unknown>;
  /** A feature card (rating form, evidence file, …), shown full width. */
  custom?: ReactNode;
  time?: string;
}

export type MockAction =
  | { type: 'accept' | 'decline' | 'solo' | 'solo-no' | 'done' | 'end-round' }
  | { type: 'scores'; rubric: Rubric; note: string }
  | { type: 'self-scores'; rubric: Rubric };

/** Demo seconds per real second for the round timer, so a 30-minute round fits a live demo. */
const TIMER_RATE = { slow: 10, normal: 30, fast: 120 } as const;

/** A student's phone in the mock-interview swap. */
export function MockPhone({ owner, caption, items, interactive, pace, timerRate, liveRound, scores, onAction }: {
  owner: string;
  caption: string;
  items: MockChatItem[];
  interactive: boolean;
  pace: number;
  timerRate: keyof typeof TIMER_RATE;
  /** The round in progress (1 or 2), or null. */
  liveRound: number | null;
  /** The owner's own scores, read through the private vault (never anyone else's). */
  scores: ScoreEntry[];
  onAction: (action: MockAction, bubble: string) => void;
}) {
  const { visible, next, phase, timeOf, firstTime, awaitingHuman } = useChatReveal(items, pace);
  const chat = useRef<HTMLDivElement>(null);
  const last = visible.at(-1);
  const canAct = interactive && awaitingHuman;
  const lastRound = [...visible].reverse().find((i) => i.kind === 'round');

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [visible.length, phase]);

  const render = (item: MockChatItem) => {
    const time = item.from === 'agent' ? timeOf(item.key) : item.time;
    if (item.custom) return <div key={item.key} className="custom-card">{item.custom}</div>;
    switch (item.kind) {
      case 'pack':
        return (
          <div key={item.key} className="msg agent">
            <p className="bubble">{clean(item.text)}</p>
            <PackCard questions={item.data!.questions as PackQuestion[]} />
            <time>{time}</time>
          </div>
        );
      case 'round': {
        const n = item.data!.n as number;
        const live = item === lastRound && liveRound === n;
        return (
          <RoundCard
            key={item.key}
            n={n}
            text={item.text}
            role={item.data!.role as 'interviewer' | 'candidate'}
            live={live}
            canEnd={live && interactive && !next}
            rate={TIMER_RATE[timerRate]}
            onEnd={() => onAction({ type: 'end-round' }, `Ended round ${n}`)}
          />
        );
      }
      case 'scores':
        return (
          <div key={item.key} className="msg agent">
            <p className="bubble">{clean(item.text)}</p>
            <ScoresCard scores={scores} />
            <time>{time}</time>
          </div>
        );
      default:
        return <ChatBubble key={item.key} from={item.from} text={item.text} time={time} />;
    }
  };

  return (
    <PhoneFrame owner={owner} caption={caption} chatRef={chat} banner={{ show: phase !== 'idle' && Boolean(next?.needsHuman), text: next?.needsHuman ? next.text : '' }}>
      {visible.length === 0 && phase === 'idle' && <p className="chat-empty">No messages yet</p>}
      {visible.length > 0 && <p className="chat-day">Today {firstTime ?? ''}</p>}
      {visible.map(render)}
      {phase === 'typing' && <TypingIndicator />}
      {canAct && last?.kind === 'ask' && (
        <QuickReplies
          options={[
            { label: "I'm in", tone: 'yes', onClick: () => onAction({ type: 'accept' }, "I'm in") },
            { label: 'Not this time', tone: 'no', onClick: () => onAction({ type: 'decline' }, 'Not this time') },
          ]}
        />
      )}
      {canAct && last?.kind === 'solo-offer' && (
        <QuickReplies
          options={[
            { label: 'Practice with my agent', tone: 'yes', onClick: () => onAction({ type: 'solo' }, 'Practice with my agent') },
            { label: 'Not now', tone: 'no', onClick: () => onAction({ type: 'solo-no' }, 'Not now') },
          ]}
        />
      )}
      {canAct && last?.kind === 'solo-question' && (
        <QuickReplies options={[{ label: 'Done answering', tone: 'yes', onClick: () => onAction({ type: 'done' }, 'Done answering') }]} />
      )}
      {canAct && (last?.kind === 'rubric' || last?.kind === 'solo-rubric') && (
        <RubricForm
          self={last.kind === 'solo-rubric'}
          onSubmit={(rubric, note) =>
            last.kind === 'solo-rubric'
              ? onAction({ type: 'self-scores', rubric }, 'Rated myself')
              : onAction({ type: 'scores', rubric, note }, 'Sent my scores privately')
          }
        />
      )}
    </PhoneFrame>
  );
}

function PackCard({ questions }: { questions: PackQuestion[] }) {
  return (
    <ol className="pack-card">
      {questions.map((q) => (
        <li key={q.id}>
          <span className="q-area">{q.area} · {q.difficulty}</span>
          <b>{q.prompt}</b>
          <small>Look for: {q.lookFor}</small>
        </li>
      ))}
      <li className="pack-foot">Rubric: communication, problem solving, code quality, behavioral structure (1–5)</li>
    </ol>
  );
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function RoundCard({ n, text, role, live, canEnd, rate, onEnd }: {
  n: number;
  text: string;
  role: 'interviewer' | 'candidate';
  live: boolean;
  canEnd: boolean;
  rate: number;
  onEnd: () => void;
}) {
  const [left, setLeft] = useState(30 * 60);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - rate / 4)), 250);
    return () => clearInterval(t);
  }, [live, rate]);

  return (
    <div className={`round-card ${live ? 'live' : 'done'}`}>
      <div className="round-top">
        <span className="round-badge">{role === 'interviewer' ? 'You ask' : 'You answer'}</span>
        <span className={`timer ${left === 0 ? 'up' : ''}`}>{live ? (left === 0 ? "Time's up" : mmss(left)) : '✓ Done'}</span>
      </div>
      <p>{clean(text)}</p>
      {live && (
        <button className="round-end" onClick={onEnd} disabled={!canEnd}>
          End round {n}
        </button>
      )}
    </div>
  );
}

function RubricForm({ self, onSubmit }: { self: boolean; onSubmit: (rubric: Rubric, note: string) => void }) {
  const [picked, setPicked] = useState<Partial<Rubric>>({});
  const [note, setNote] = useState('');
  const done = RUBRIC.every(({ key }) => picked[key]);
  return (
    <form
      className="rubric-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (done) onSubmit(picked as Rubric, note);
      }}
    >
      {RUBRIC.map(({ key, label }) => (
        <div key={key} className="rubric-row">
          <span>{label}</span>
          <div className="score-chips" role="radiogroup" aria-label={label}>
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                type="button"
                key={v}
                role="radio"
                aria-checked={picked[key] === v}
                className={`score-chip ${picked[key] === v ? 'on' : ''}`}
                onClick={() => setPicked((p) => ({ ...p, [key]: v }))}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!self && <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="One note to help them improve" aria-label="Feedback note" />}
      <button type="submit" className="cal-add" disabled={!done}>{self ? 'Save privately' : 'Send privately'}</button>
    </form>
  );
}

function ScoresCard({ scores }: { scores: ScoreEntry[] }) {
  const latest = scores.at(-1);
  if (!latest) return null;
  return (
    <div className="scores-card">
      {RUBRIC.map(({ key, label }) => (
        <div key={key} className="score-row">
          <span>{label}</span>
          <span className="bar"><i style={{ width: `${latest.rubric[key] * 20}%` }} /></span>
          <b>{latest.rubric[key]}</b>
        </div>
      ))}
      {latest.note && !latest.practice && <p className="score-note">“{latest.note}”</p>}
      <p className="score-foot">
        {latest.practice ? 'Only you can see this. Practice self-scores stay in your notes, not your proof of work.' : 'Only you can see this. It goes into your proof of work.'}
      </p>
    </div>
  );
}
