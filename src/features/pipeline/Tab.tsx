import { useEffect, useRef, useState } from 'react';
import { ChatBubble, Icon, PhoneFrame, SPEEDS, TypingIndicator, clock, type TabProps } from '../../ui/kit';
import {
  MIN_REPORTS,
  STAT_KEYS,
  getPipelineInspector,
  getPublicPipelineStats,
  type PublicPipelineStats,
  type StatKey,
} from './logic';

const COMPANIES = ['Microsoft', 'Stripe', 'Datadog'];
const DEFAULT_COMPANY = 'Microsoft';

const STAT_LABEL: Record<StatKey, string> = {
  pipeline: 'Pipeline',
  interview: 'Interview',
  offers: 'Offers',
};

/** Split "23 in your pipeline" into the number and its caption for the stat card. */
function splitDisplay(display: string): { value: string; caption: string } {
  const match = display.match(/^(\d+)\s+(.*)$/);
  return match ? { value: match[1], caption: match[2] } : { value: '', caption: display };
}

/** Pipeline: anonymous cohort stats, shown only once enough students have reported. */
export function PipelineTab({ speed, resetKey }: TabProps) {
  const [company, setCompany] = useState(DEFAULT_COMPANY);
  const [typing, setTyping] = useState(false);
  const chat = useRef<HTMLDivElement>(null);

  const pace = SPEEDS[speed].pace;

  /** Back to a fresh visit (global Reset). */
  const reset = () => {
    setCompany(DEFAULT_COMPANY);
    setTyping(false);
  };

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // The agent "types" before each company's numbers land; speed controls how long.
  useEffect(() => {
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 520 * pace);
    return () => clearTimeout(t);
  }, [company, pace]);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [company, typing]);

  // The threshold decision is made entirely in logic.ts; this component only renders the result.
  const stats: PublicPipelineStats = getPublicPipelineStats(company);
  const inspector = getPipelineInspector(company);
  const hiddenCount = inspector.filter((entry) => entry.status === 'hidden').length;

  return (
    <div className="app started">
      <header className="hero">
        <h1>
          See your pipeline. <span className="accent">Without seeing anyone.</span>
        </h1>
        <p className="sub">
          Once you track a role, your agent shows how that cohort is moving — in aggregate only. A number appears
          after {MIN_REPORTS}+ anonymous reports, never before.
        </p>
      </header>

      <main className="phones">
        <PhoneFrame owner="Aditya" caption="watching your applications" chatRef={chat}>
          <p className="chat-day">Today {clock()}</p>
          <ChatBubble from="agent" text={`Here's where your ${company} application stands.`} />
          {typing && <TypingIndicator />}
          {!typing && (
            <>
              <ChatBubble
                from="agent"
                text={`${stats.pipeline.display} · ${stats.interview.display} · ${stats.offers.display}.`}
              />
              <ChatBubble
                from="agent"
                text={`I'll show a number only when enough students have reported it — ${MIN_REPORTS} is the minimum.`}
              />
            </>
          )}
        </PhoneFrame>

        <section className="card">
          <h3>Your {company} application</h3>
          <div className="chips">
            {COMPANIES.map((name) => (
              <button
                key={name}
                className={`chip ${name === company ? 'on' : ''}`}
                aria-pressed={name === company}
                onClick={() => setCompany(name)}
              >
                {name}
              </button>
            ))}
          </div>

          {STAT_KEYS.map((key) => {
            const stat = stats[key];
            const { value, caption } = splitDisplay(stat.display);
            return (
              <article key={key} className="card">
                <span className="tag">{STAT_LABEL[key]}</span>
                <h3>{stat.visible ? value : <Icon name="lock" size={22} />}</h3>
                <p className="sub">{stat.visible ? caption : stat.display}</p>
              </article>
            );
          })}

          <p className="sub">
            {hiddenCount === 0
              ? `Every stat cleared the ${MIN_REPORTS}-report minimum.`
              : `${hiddenCount} stat${hiddenCount === 1 ? '' : 's'} held back until more students report.`}
          </p>
        </section>
      </main>

    </div>
  );
}
