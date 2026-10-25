import { useEffect, useRef, useState } from 'react';
import { openTab } from '../../app/navigate';
import type { TabProps } from '../types';
import { STAGES, nextSteps, type Application, type JourneyLink } from '../apply/applications';
import { STUDENT, useApplyStore } from '../apply/store';
import { readiness, type Readiness } from './readiness';
import { planNudges, type Nudge } from './nudges';
import { planFollowUps, type FollowUp } from './closing';
import { CommunityPhone, type CommunityChatItem } from '../community/CommunityPhone';
import { useLiveHelp } from '../community/useLiveHelp';
import { isLiveRequested } from '../../live/client';
import { SPEEDS, clock } from '../../ui/kit';
import type { Stage } from '../apply/applications';

/** Each student's own view of their own records, so their own name is fine here. */
export const OWNER_NAMES: Record<string, string> = { p1: 'Aditya', p4: 'Jordan', p9: 'Priya', p10: 'Theo' };
const nameOf = (owner: string) => OWNER_NAMES[owner] ?? 'Student';

const LINK_TEXT: Record<JourneyLink['kind'], string> = {
  prep: 'Prep circle',
  mock: 'Mock interview',
  intel: 'Intel',
  'intel-shared': 'Intel shared',
  referral: 'Referral',
  community: 'Community',
};

/** "Sun, Oct 25 · 6:00 PM" for the demo clock. */
export function clockText(iso: string): string {
  const [d, t] = iso.split('T');
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${d}T00:00:00Z`).getUTCDay()];
  const [h, m] = t.split(':').map(Number);
  return `${day}, ${shortDate(d)} · ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** "Oct 25" from YYYY-MM-DD, without the real clock or the viewer's time zone getting involved. */
export function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`;
}

/** My applications: one record per job, with everything the other tabs did for it. */
export function ApplicationsTab({ speed, resetKey }: TabProps) {
  const store = useApplyStore();
  const [owner, setOwner] = useState(STUDENT);
  const [selected, setSelected] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, { text: string; time: string }>>({});
  const run = useRef(0);

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstReset.current) return;
    store.resetFor(resetKey);
    run.current += 1;
    setOwner(STUDENT);
    setSelected(null);
    setSaid({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // The proactive agent + post-interview follow-ups: plan on every change (tab always mounted).
  const version = store.getVersion();
  useEffect(() => {
    store.recordNudges(planNudges(store.applications(), store.now(), store.nudges()));
    store.recordFollowUps(planFollowUps(store.applications(), store.now(), store.followUps()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const answer = (n: Nudge, yes: boolean, bubble: string) => {
    if (store.nudgeAnswer(n.id)) return;
    store.answerNudge(n.id, yes ? 'yes' : 'no');
    setSaid((s) => ({ ...s, [n.id]: { text: bubble, time: clock() } }));
    if (yes) openTab(n.action.tab);
  };
  const mute = (n: Nudge) => {
    store.mute(n.appId);
    store.answerNudge(n.id, 'no');
    setSaid((s) => ({ ...s, [n.id]: { text: `Mute ${n.details.company} nudges`, time: clock() } }));
  };
  const answerFollowUp = (f: FollowUp, stage: Stage | 'share', bubble: string) => {
    if (store.followUps().done.includes(f.appId)) return;
    if (stage === 'share') {
      setSaid((s) => ({ ...s, [f.id]: { text: bubble, time: clock() } }));
      openTab('intel');
      return;
    }
    store.setStage(f.appId, stage);
    store.completeFollowUp(f.appId);
    setSaid((s) => ({ ...s, [f.id]: { text: bubble, time: clock() } }));
  };

  // Live mode: Aditya's open nudge also goes to Discord (yes / not now, or typed).
  const sent = store.nudges().sent;
  const openNudge = sent.filter((n) => n.owner === STUDENT && !store.nudgeAnswer(n.id)).at(-1);
  useLiveHelp({
    enabled: isLiveRequested(),
    runKey: run.current,
    kind: 'nudge',
    yesBubble: 'Yes · via Discord',
    noBubble: 'Not now · via Discord',
    pending: openNudge ? { prompt: sent.indexOf(openNudge) + 1, details: openNudge.details } : null,
    onReply: (choice, bubble) => openNudge && answer(openNudge, choice === 'accept', bubble),
  });

  const all = store.applications();
  const owners = [...new Set([STUDENT, ...all.map((a) => a.owner)])];
  const mine = all.filter((a) => a.owner === owner);
  const app = mine.find((a) => a.id === selected) ?? mine[0] ?? null;

  function agentChat(who: string): CommunityChatItem[] {
    const items: CommunityChatItem[] = [
      { key: 'intro', from: 'agent', text: "I watch your applications and nudge you when something needs doing: at most 2 a day, and you can mute anytime. After an interview I'll ask for a quick intel report." },
    ];
    for (const n of sent.filter((x) => x.owner === who)) {
      const answered = store.nudgeAnswer(n.id);
      items.push({
        key: n.id,
        from: 'agent',
        text: n.text,
        needsHuman: !answered,
        replies: answered ? undefined : [
          { label: n.action.label, tone: 'yes', onClick: () => answer(n, true, n.action.label) },
          { label: 'Not now', onClick: () => answer(n, false, 'Not now') },
          { label: 'Mute these', tone: 'no', onClick: () => mute(n) },
        ],
      });
      if (said[n.id]) items.push({ key: `${n.id}-me`, from: 'me', text: said[n.id].text, time: said[n.id].time });
    }
    for (const f of store.followUps().sent.filter((x) => x.owner === who)) {
      const done = store.followUps().done.includes(f.appId);
      items.push({
        key: f.id,
        from: 'agent',
        text: f.text,
        needsHuman: !done && !said[f.id],
        replies: done || said[f.id] ? undefined : [
          { label: 'Share intel', tone: 'yes', onClick: () => answerFollowUp(f, 'share', 'Share intel') },
          { label: 'Got an offer', onClick: () => answerFollowUp(f, 'Offer', 'Got an offer') },
          { label: 'Rejected', tone: 'no', onClick: () => answerFollowUp(f, 'Rejected', 'Rejected') },
        ],
      });
      if (said[f.id]) items.push({ key: `${f.id}-me`, from: 'me', text: said[f.id].text, time: said[f.id].time });
    }
    return items;
  }

  return (
    <div className="app started">
      <header className="hero">
        <h1>One record per job. <span className="accent">Your whole journey in one place.</span></h1>
        <p className="sub">Track a job in Find and every step after it lands here: prep circle, mocks, intel, referral and community help. Each student's agent keeps their own.</p>
        <div className="cta-row">
          <span className="live-status human">Now: {clockText(store.now())}</span>
          {app?.interviewDate && store.now() < `${addDays(app.interviewDate, -2)}T19:00` && (
            <button type="button" className="ghost" onClick={() => store.setNow(`${addDays(app.interviewDate!, -2)}T19:00`)}>
              Skip to 2 days before the interview
            </button>
          )}
          {app?.interviewDate && store.now() < `${app.interviewDate}T20:00` && (
            <button type="button" className="ghost" onClick={() => store.setNow(`${app.interviewDate}T20:00`)}>
              Skip to after the interview
            </button>
          )}
          <button type="button" className="ghost" aria-pressed={store.nudges().mutedAll} onClick={() => store.mute('all', !store.nudges().mutedAll)}>
            {store.nudges().mutedAll ? 'Unmute nudges' : 'Mute all nudges'}
          </button>
          {owners.length > 1 && (
            <div className="segmented" role="group" aria-label="Whose applications">
              {owners.map((o) => (
                <button key={o} type="button" className={o === owner ? 'on' : ''} aria-pressed={o === owner} onClick={() => { setOwner(o); setSelected(null); }}>
                  {nameOf(o)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="phones">
        <CommunityPhone key={`${run.current}:${owner}`} owner={nameOf(owner)} caption="their agent, nudging" items={agentChat(owner)} interactive pace={SPEEDS[speed].pace} />
        <section className="card apps-card" aria-label={`${nameOf(owner)}'s applications`}>
          <h3>{nameOf(owner)}'s applications</h3>
          {mine.length === 0 ? (
            <>
              <p className="board-note">Nothing yet. Track a job in Find, or start a prep circle from an interview invite; every step after that lands here.</p>
              <button className="ghost small" onClick={() => openTab('find')}>Open Find</button>
            </>
          ) : (
            <ul className="board-list">
              {mine.map((a) => (
                <li key={a.id}>
                  <button type="button" className={`board-row app-pick tone-${a.id === app?.id ? 'info' : 'idle'}`} aria-pressed={a.id === app?.id} onClick={() => setSelected(a.id)}>
                    <b>{a.company} · {a.role}</b>
                    <span>{a.stage}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {app && (
          <JourneyCard
            app={app}
            today={store.today()}
            onStage={(s) => store.setStage(app.id, s)}
            muted={store.nudges().mutedAll || store.nudges().muted.includes(app.id)}
            onMute={(on) => store.mute(app.id, on)}
          />
        )}
      </main>
    </div>
  );
}

function JourneyCard({ app, today, onStage, muted, onMute }: { app: Application; today: string; onStage: (s: Application['stage']) => void; muted: boolean; onMute: (on: boolean) => void }) {
  const steps = nextSteps(app);
  const ready = app.stage === 'OA' || app.stage === 'Interview' ? readiness(app, today) : null;
  const path = STAGES.filter((s) => s !== 'Rejected' || app.stage === 'Rejected');
  const reached = STAGES.indexOf(app.stage);
  return (
    <section className="card apps-card" aria-label={`${app.company} ${app.role} journey`}>
      <h3>{app.company} · {app.role}</h3>
      <ol className="stage-steps" aria-label="Stage">
        {path.map((s) => {
          const done = app.stage === 'Rejected' ? s === 'Rejected' || Boolean(app.dates[s]) : STAGES.indexOf(s) <= reached;
          return (
            <li key={s} className={`${done ? 'done' : ''} ${s === app.stage ? 'now' : ''}`.trim()}>
              <button type="button" onClick={() => onStage(s)} aria-pressed={s === app.stage} title={`Set stage: ${s}`}>
                <b>{s}</b>
                <span>{app.dates[s] ? shortDate(app.dates[s]!) : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {app.interviewDate && <p className="board-note">Interview: {shortDate(app.interviewDate)} (from the invite)</p>}
      {ready && <ReadinessBlock r={ready} />}
      <h3>Journey</h3>
      {app.links.length === 0 ? (
        <p className="board-note">No steps linked yet.</p>
      ) : (
        <ul className="board-list">
          {app.links.map((l) => (
            <li key={`${l.kind}-${l.ref}`} className="board-row tone-good">
              <b>{LINK_TEXT[l.kind]} · {l.summary}</b>
              <span>{shortDate(l.at)}</span>
            </li>
          ))}
        </ul>
      )}
      <label className="check mute-row">
        <input type="checkbox" checked={muted} onChange={(e) => onMute(e.target.checked)} /> Mute nudges for this job
      </label>
      <h3>Next steps</h3>
      {steps.length === 0 ? (
        <p className="board-note">{app.stage === 'Offer' ? 'Offer in hand. Congratulations.' : app.stage === 'Rejected' ? 'Closed. Everything you did still counts in your proof of work.' : 'Nothing pressing.'}</p>
      ) : (
        <div className="next-steps">
          {steps.map((s) => (
            <button key={s.label} type="button" className="ghost small" onClick={() => openTab(s.tab)}>
              {s.label} →
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** "Ready: 70%. Next: one System Design mock", with every reason and its points. */
function ReadinessBlock({ r }: { r: Readiness }) {
  if (!r.ready) return <p className="board-note">Readiness: {r.reason}</p>;
  return (
    <div className="readiness" aria-label="Readiness">
      <div className="lvl-head">
        <b>Ready: {r.score}%{r.next ? `. Next: ${r.next.text}` : '. Nothing missing'}</b>
        <span>{r.daysLeft === 0 ? 'Interview today' : `${r.daysLeft} ${r.daysLeft === 1 ? 'day' : 'days'} left`}</span>
      </div>
      <div className="lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.score} aria-label="Readiness">
        <i style={{ width: `${r.score}%` }} />
      </div>
      <ul className="readiness-parts">
        {r.parts.map((p) => (
          <li key={p.id} className={p.points === p.max ? 'full' : p.points === 0 ? 'none' : ''}>
            <span>{p.label}: {p.detail}</span>
            <b>{p.points}/{p.max}</b>
          </li>
        ))}
      </ul>
      {r.next && (
        <button type="button" className="cta small" onClick={() => openTab(r.next!.tab)}>
          {r.next.text.charAt(0).toUpperCase() + r.next.text.slice(1)} →
        </button>
      )}
    </div>
  );
}
