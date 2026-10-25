import { useEffect, useRef, useState } from 'react';
import { openTab } from '../../app/navigate';
import type { TabProps } from '../types';
import { STAGES, nextSteps, type Application, type JourneyLink } from '../apply/applications';
import { STUDENT, useApplyStore } from '../apply/store';

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

/** "Oct 25" from YYYY-MM-DD, without the real clock or the viewer's time zone getting involved. */
export function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`;
}

/** My applications: one record per job, with everything the other tabs did for it. */
export function ApplicationsTab({ resetKey }: TabProps) {
  const store = useApplyStore();
  const [owner, setOwner] = useState(STUDENT);
  const [selected, setSelected] = useState<string | null>(null);

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstReset.current) return;
    store.resetFor(resetKey);
    setOwner(STUDENT);
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const all = store.applications();
  const owners = [...new Set([STUDENT, ...all.map((a) => a.owner)])];
  const mine = all.filter((a) => a.owner === owner);
  const app = mine.find((a) => a.id === selected) ?? mine[0] ?? null;

  return (
    <div className="app started">
      <header className="hero">
        <h1>One record per job. <span className="accent">Your whole journey in one place.</span></h1>
        <p className="sub">Track a job in Find and every step after it lands here: prep circle, mocks, intel, referral and community help. Each student's agent keeps their own.</p>
        <div className="cta-row">
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
        {app && <JourneyCard app={app} onStage={(s) => store.setStage(app.id, s)} />}
      </main>
    </div>
  );
}

function JourneyCard({ app, onStage }: { app: Application; onStage: (s: Application['stage']) => void }) {
  const steps = nextSteps(app);
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
