import { useEffect, useRef, useState } from 'react';
import { ChatBubble, Icon, PhoneFrame, QuickReplies, TypingIndicator, useChatReveal, type RevealItem } from '../../ui/kit';
import { RUBRIC } from '../mock/scores';
import type { EvidenceStage1, EvidenceStage2 } from '../trust/evidence';
import type { ReferralMsgKind } from './referralBridge';
import type { RuleResult } from './rules';

export interface ReferralChatItem extends RevealItem {
  text: string;
  kind?: ReferralMsgKind;
  data?: Record<string, unknown>;
  time?: string;
}

export type ReferralAction =
  | { type: 'share' | 'not-now' | 'accept' | 'decline' | 'chat-done' | 'refer' | 'no' }
  | { type: 'not-yet'; note: string };

const DEFAULT_NOTE = 'Do one more system design mock first.';

/** A phone in the Referral Bridge: the seeker's or the referrer's. */
export function ReferralPhone({ owner, caption, items, interactive, pace, onAction }: {
  owner: string;
  caption: string;
  items: ReferralChatItem[];
  interactive: boolean;
  pace: number;
  onAction: (action: ReferralAction, bubble: string) => void;
}) {
  const { visible, next, phase, timeOf, firstTime, awaitingHuman } = useChatReveal(items, pace);
  const chat = useRef<HTMLDivElement>(null);
  const [coaching, setCoaching] = useState<string | null>(null);
  const last = visible.at(-1);
  const canAct = interactive && awaitingHuman;

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [visible.length, phase, coaching]);

  const render = (item: ReferralChatItem) => {
    const time = item.from === 'agent' ? timeOf(item.key) : item.time;
    const card =
      item.kind === 'summary' ? <SummaryCard summary={item.data!.summary as EvidenceStage1 | EvidenceStage2} />
      : item.kind === 'fit' ? <FitCard results={item.data!.results as RuleResult[]} />
      : item.kind === 'chat' ? <ChatCard when={item.data!.when as string} />
      : null;
    if (!card) return <ChatBubble key={item.key} from={item.from} text={item.text} time={time} />;
    return (
      <div key={item.key} className="msg agent">
        <p className="bubble">{item.text}</p>
        {card}
        <time>{time}</time>
      </div>
    );
  };

  return (
    <PhoneFrame owner={owner} caption={caption} chatRef={chat} banner={{ show: phase !== 'idle' && Boolean(next?.needsHuman), text: next?.needsHuman ? next.text : '' }}>
      {visible.length === 0 && phase === 'idle' && <p className="chat-empty">No messages yet</p>}
      {visible.length > 0 && <p className="chat-day">Today {firstTime ?? ''}</p>}
      {visible.map(render)}
      {phase === 'typing' && <TypingIndicator />}
      {canAct && last?.kind === 'ask-share' && (
        <QuickReplies
          options={[
            { label: 'Share my stats', tone: 'yes', onClick: () => onAction({ type: 'share' }, 'Share my stats') },
            { label: 'Not now', tone: 'no', onClick: () => onAction({ type: 'not-now' }, 'Not now') },
          ]}
        />
      )}
      {canAct && last?.kind === 'ask-chat' && (
        <QuickReplies
          options={[
            { label: "I'm in", tone: 'yes', onClick: () => onAction({ type: 'accept' }, "I'm in") },
            { label: 'Not this time', tone: 'no', onClick: () => onAction({ type: 'decline' }, 'Not this time') },
          ]}
        />
      )}
      {canAct && last?.kind === 'ask-done' && (
        <QuickReplies options={[{ label: 'We had the chat', tone: 'yes', onClick: () => onAction({ type: 'chat-done' }, 'We had the chat') }]} />
      )}
      {canAct && last?.kind === 'ask-decide' && (
        <QuickReplies
          options={[
            { label: 'Refer', tone: 'yes', onClick: () => onAction({ type: 'refer' }, 'Refer them') },
            { label: 'Not yet', on: coaching !== null, onClick: () => setCoaching((c) => (c === null ? DEFAULT_NOTE : null)) },
            { label: 'No', tone: 'no', onClick: () => onAction({ type: 'no' }, 'No, not this time') },
          ]}
        >
          {coaching !== null && (
            <form
              className="coach-form"
              onSubmit={(e) => {
                e.preventDefault();
                onAction({ type: 'not-yet', note: coaching }, `Not yet: “${coaching.trim() || DEFAULT_NOTE}”`);
              }}
            >
              <input value={coaching} onChange={(e) => setCoaching(e.target.value)} maxLength={200} aria-label="Coaching note" placeholder="What should they do next?" />
              <button type="submit" className="send" aria-label="Send note">↑</button>
            </form>
          )}
        </QuickReplies>
      )}
    </PhoneFrame>
  );
}

/** What the referrer's phone sees of the seeker: stage 1 stats, then stage 2 links + rubric. Never a name. */
function SummaryCard({ summary }: { summary: EvidenceStage1 | EvidenceStage2 }) {
  if (summary.stage === 2) {
    return (
      <div className="evidence-card summary-card">
        <div className="ev-title"><Icon name="file" /><b>Stage 2 · still anonymous</b></div>
        {summary.mockAverages && (
          <div className="ev-rubric">
            {RUBRIC.map(({ key, label }) => <span key={key}>{label} {summary.mockAverages![key].toFixed(1)}</span>)}
          </div>
        )}
        <ul className="ev-links">
          {summary.projectLinks.map((l) => <li key={l}><Icon name="link" size={12} /> {l}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <div className="evidence-card summary-card">
      <div className="ev-title"><Icon name="eyeOff" /><b>Stage 1 · anonymous stats</b></div>
      <dl>
        <div><dt>Prep sessions</dt><dd>{summary.sessionsAttended}</dd></div>
        <div><dt>Peer rating</dt><dd>{summary.averageRating !== null ? `★ ${summary.averageRating.toFixed(1)}` : 'Not enough ratings'}</dd></div>
        <div><dt>Mock average</dt><dd>{summary.mockAverage !== null ? summary.mockAverage.toFixed(1) : 'No peer mocks'}</dd></div>
        <div><dt>Intel reports</dt><dd>{summary.intelReports}</dd></div>
      </dl>
      <div className="ev-chips">
        {summary.skillsTaught.map((s) => <span key={s} className="taught">Taught {s}</span>)}
        {summary.targetRoles.map((r) => <span key={r}>{r}</span>)}
      </div>
    </div>
  );
}

/** The referrer's own private rules, checked by their agent. Shown only on the referrer's phone. */
function FitCard({ results }: { results: RuleResult[] }) {
  return (
    <ul className="fit-card">
      {results.map((r) => (
        <li key={r.id} className={r.pass ? 'pass' : 'fail'}>
          <span aria-hidden>{r.pass ? '✓' : '✗'}</span>
          <span>{r.label}</span>
          <small>{r.observed}</small>
        </li>
      ))}
      <li className="fit-foot">Your rules stay on your phone. The student never sees them.</li>
    </ul>
  );
}

function ChatCard({ when }: { when: string }) {
  return (
    <div className="cal-card chat-card">
      <div className="cal-top">
        <span className="cal-icon"><b>TODAY</b><Icon name="coffee" /></span>
        <div>
          <b>Coffee chat · 15 min</b>
          <span>{when}</span>
        </div>
      </div>
    </div>
  );
}
