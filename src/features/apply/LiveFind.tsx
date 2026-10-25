import { useEffect, useRef, useState } from 'react';
import { ChatBubble, PhoneFrame, TypingIndicator, clock } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import type { TabProps } from '../types';
import { searchLive, type LiveOutcome } from './client';
import { ageText, type Level, type ScoredPosting } from './jobs/match';
import { useApplyStore } from './store';

const LEVELS: [Level, string][] = [['intern', 'Internship'], ['newgrad', 'New grad'], ['both', 'Both']];

interface Line {
  from: 'agent' | 'me';
  text: string;
  time: string;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Find, live: the agent reads public company job boards (443 of them) and ranks real postings. */
export function LiveFind({ resetKey }: TabProps) {
  const store = useApplyStore();
  const [roles, setRoles] = useState('software engineer');
  const [level, setLevel] = useState<Level>('intern');
  const [sponsorship, setSponsorship] = useState(false);
  const [companies, setCompanies] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<LiveOutcome | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const chat = useRef<HTMLDivElement>(null);
  const run = useRef(0);

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstReset.current) return;
    run.current += 1;
    store.resetFor(resetKey);
    setRoles('software engineer');
    setLevel('intern');
    setSponsorship(false);
    setCompanies('');
    setBusy(false);
    setOutcome(null);
    setLines([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length, busy]);

  const say = (from: Line['from'], text: string) => setLines((ls) => [...ls, { from, text, time: clock() }]);

  async function search() {
    const id = ++run.current;
    setBusy(true);
    say('me', `Find ${roles.trim() || 'software engineer'} roles${companies.trim() ? ` at ${companies.trim()}` : ''}`);
    const out = await searchLive({ roles, level, sponsorship, companies });
    if (id !== run.current) return; // reset or a newer search
    setBusy(false);
    setOutcome(out);
    if (out.source === 'demo') {
      say('agent', "The job boards aren't reachable right now, so these are demo postings. Try again in a minute.");
      return;
    }
    const top = out.results[0];
    say('agent', `Read ${out.read.toLocaleString('en-US')} jobs from ${out.okBoards} of ${out.boards} company boards in ${seconds(out.ms)}${out.cached ? ' (cached)' : ''}. ${out.results.length} match.`);
    if (top) say('agent', `Top match: ${top.title} at ${top.company}, ${top.location || 'location not listed'}.`);
  }

  const track = (p: ScoredPosting) => {
    if (!outcome) return;
    store.track(p, outcome.source, clock());
    say('me', `Track ${p.company}`);
    say('agent', `Tracked ${p.title} at ${p.company}. Open the Apply tab for a tailored resume and an intro draft.`);
  };

  const now = Date.now();

  return (
    <div className="app started">
      <header className="hero">
        <h1>
          Find the job. <span className="accent">Live from 443 company job boards.</span>
        </h1>
        <form
          className="live-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) search();
          }}
        >
          <input className="field" value={roles} onChange={(e) => setRoles(e.target.value)} aria-label="Role" placeholder="Role, e.g. software engineer" />
          <div className="segmented" role="group" aria-label="Level">
            {LEVELS.map(([v, label]) => (
              <button type="button" key={v} className={level === v ? 'on' : ''} aria-pressed={level === v} onClick={() => setLevel(v)}>{label}</button>
            ))}
          </div>
          <input className="field narrow" value={companies} onChange={(e) => setCompanies(e.target.value)} aria-label="Companies (optional)" placeholder="Companies (optional)" />
          <label className="check">
            <input type="checkbox" checked={sponsorship} onChange={(e) => setSponsorship(e.target.checked)} /> I need visa sponsorship
          </label>
          <button type="submit" className="cta small" disabled={busy}>
            <Icon name="search" /> {busy ? 'Searching' : 'Search live boards'}
          </button>
        </form>
        <div className="hero-meta">
          <span className="proof-pill">
            {outcome?.source === 'demo' ? 'Demo data · live boards unreachable' : 'Public Greenhouse, Lever, Ashby and SmartRecruiters job boards · cached 10 min'}
          </span>
        </div>
      </header>

      <main className="phones">
        <PhoneFrame owner="Aditya" caption="looking for a SWE internship" chatRef={chat}>
          <p className="chat-day">Today {lines[0]?.time ?? clock()}</p>
          <ChatBubble from="agent" text="Live search reads public job boards from 443 companies. Pick a role and level, and I'll check the top boards now." />
          {lines.map((l, i) => <ChatBubble key={i} from={l.from} text={l.text} time={l.time} />)}
          {busy && <TypingIndicator />}
        </PhoneFrame>

        <section className="card job-list" aria-label="Postings">
          <h3>{outcome ? (outcome.source === 'live' ? 'Live postings' : 'Demo postings') : 'Postings'}</h3>
          {!outcome && !busy && <p className="feed-empty">Search to see real postings with apply links.</p>}
          {busy && <p className="feed-empty">Checking company boards…</p>}
          {outcome && outcome.results.length === 0 && <p className="feed-empty">No matches. Try a broader role or level.</p>}
          {outcome?.results.map((p) => {
            const tracked = store.isTracked(p.id);
            return (
              <article key={p.id} className="job-row">
                <div className="job-head">
                  <b>{p.title}</b>
                  <span>{p.company} · {p.location || 'Location not listed'}{p.posted ? ` · ${ageText(p.posted, now)}` : ''}</span>
                </div>
                <div className="job-chips">
                  {p.reasons.slice(0, 3).map((r) => <span key={r} className="chip">{r}</span>)}
                  {outcome.source === 'demo' && <span className="chip withheld">Demo data</span>}
                </div>
                {p.visaFlag && <p className="job-warn"><Icon name="alert" /> Mentions citizenship, clearance or no sponsorship</p>}
                <div className="job-actions">
                  {p.url && (
                    <a className="ghost small" href={p.url} target="_blank" rel="noreferrer noopener">
                      Apply <Icon name="share" />
                    </a>
                  )}
                  <button className={tracked ? 'ghost small' : 'cta small'} disabled={tracked} onClick={() => track(p)}>
                    {tracked ? <><Icon name="check" /> Tracked</> : 'Track'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
