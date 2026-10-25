import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CommunityHub } from '../community/community';
import { ChatBubble, Drawer, PhoneFrame, QuickReplies, SPEEDS, TypingIndicator, clean, clock, type TabProps } from '../../ui/kit';
import {
  SUGGESTED_QUESTIONS,
  answerQuestion,
  parseQuestion,
  parseQuestionWithLlm,
  startIntroConsent,
  type AskAnswer,
} from './logic';

interface Turn {
  question: string;
  answer: AskAnswer;
}

/** Ask the network: one text box, four deterministic intents, counts and anonymized content only. */
export function AskTab({ speed, resetKey }: TabProps) {
  const hub = useMemo(() => new CommunityHub(), []);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<AskAnswer | null>(null);
  const [typing, setTyping] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const chat = useRef<HTMLDivElement>(null);
  const pace = SPEEDS[speed].pace;

  const reset = () => {
    setDraft('');
    setTurns([]);
    setPending(null);
    setTyping(false);
    setDrawer(false);
    hub.reset();
  };

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [turns, typing, pending]);

  const apply = (question: string, answer: AskAnswer) => {
    setTurns((t) => [...t, { question, answer }]);
    setPending(answer.canStartConsent ? answer : null);
    setDraft('');
    setTyping(false);
  };

  const ask = async (raw: string) => {
    const text = raw.trim();
    if (!text || typing) return;
    setTyping(true);
    const wait = new Promise((r) => setTimeout(r, 520 * pace));
    const useLlm = import.meta.env.VITE_USE_LLM_COPY === 'true';
    const parsed = useLlm ? await parseQuestionWithLlm(text) : parseQuestion(text);
    await wait;
    apply(parsed.question, answerQuestion(parsed, hub));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(draft);
  };

  const latest = turns.at(-1)?.answer;
  const inspect = pending ?? latest;

  return (
    <div className="app started">
      <header className="hero">
        <h1>
          Ask the network. <span className="accent">Counts and intel, never names.</span>
        </h1>
        <p className="sub">
          One question in plain English. Your agent routes it to help, intel, pipeline stats, or an intro —
          and strips identity before anything is stored.
        </p>
        <div className="hero-meta">
          <span className="proof-pill">Anonymous answers · names only after both say yes</span>
          <button className="hood-btn" onClick={() => setDrawer(true)}>
            See what was shared versus hidden
          </button>
        </div>
      </header>

      <main className="phones">
        <PhoneFrame owner="Aditya" caption="asking the network" chatRef={chat}>
          <p className="chat-day">Today {clock()}</p>
          <ChatBubble from="agent" text="What do you need from the network? Help, intel, pipeline status, or an intro." />
          {turns.map((turn, i) => (
            <div key={`${turn.question}-${i}`}>
              <ChatBubble from="me" text={turn.question} />
              {turn.answer.lines.map((line) => (
                <ChatBubble key={line} from="agent" text={clean(line)} />
              ))}
            </div>
          ))}
          {typing && <TypingIndicator />}
          {pending?.canStartConsent && !typing && (
            <QuickReplies
              options={[
                {
                  label: 'Ask for an intro',
                  tone: 'yes',
                  onClick: () => {
                    const next = startIntroConsent(pending.company ?? 'BlackRock');
                    setTurns((t) => [...t, { question: 'Ask for an intro', answer: next }]);
                    setPending(null);
                  },
                },
                { label: 'Not now', tone: 'no', onClick: () => setPending(null) },
              ]}
            />
          )}
          <form className="composer" onSubmit={onSubmit}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask in plain English"
              aria-label="Ask the network"
              disabled={typing}
            />
            <button type="submit" className="send" disabled={typing || !draft.trim()} aria-label="Send">
              Send
            </button>
          </form>
        </PhoneFrame>

        <section className="card">
          <h3>Try a question</h3>
          <div className="chips">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} className="chip" type="button" onClick={() => void ask(q)} disabled={typing}>
                {q}
              </button>
            ))}
          </div>
          <p className="sub">Your agent picks the route. People stay hidden until a consent flow finishes on both sides.</p>
        </section>
      </main>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Under the hood"
        subtitle="Parsed intent and what left the agent versus what stayed private."
        badge={<span className="state-pill tone-good">{inspect?.intent ?? 'idle'}</span>}
      >
        <div className="drawer-body">
          <section className="card feed-card">
            <h3>Parsed intent</h3>
            <p className="msg">
              <b>INTENT</b> · {inspect?.intent ?? 'none yet'}
              {inspect?.company ? ` · company ${inspect.company}` : ''}
            </p>
          </section>
          <section className="card feed-card">
            <h3>Shared</h3>
            <div className="feed">
              {(inspect?.disclosure.shared.length ? inspect.disclosure.shared : ['nothing yet']).map((item) => (
                <p key={item} className="msg">
                  <b>SHARED</b> · {item}
                </p>
              ))}
            </div>
          </section>
          <section className="card feed-card">
            <h3>Hidden</h3>
            <div className="feed">
              {(inspect?.disclosure.hidden.length ? inspect.disclosure.hidden : ['identity']).map((item) => (
                <p key={item} className="msg">
                  <b>HIDDEN</b> · {item}
                </p>
              ))}
            </div>
          </section>
        </div>
      </Drawer>
    </div>
  );
}
