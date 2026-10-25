import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChatBubble, Drawer, PhoneFrame, QuickReplies, clock } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import type { TabProps } from '../types';
import { findContacts, type ContactsOutcome } from './outreach/contacts';
import { F1_LABEL, GRAD_LABEL, classifyF1, classifyGradWindow, gradYearOf } from './jobs/screen';
import { DEMO_POSTINGS } from './postings';
import { OVERLEAF_URL, overleafFields, renderLatex, resumeFileName } from './resume/latex';
import { tailor } from './resume/tailor';
import { useApplyStore } from './store';
import { HUNTR_URL, toCsv, toJson, trackerFileName, trackerRows } from './tracker/export';
import { OutreachPanel } from './ui/OutreachPanel';
import { ProfileEditor } from './ui/ProfileEditor';
import { ResumeDoc } from './ui/ResumeDoc';

interface Line {
  from: 'agent' | 'me';
  text: string;
  time: string;
}

const list = (xs: string[]) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** Apply: a resume tailored to one posting, built only from the student's own profile, exported as .tex / Overleaf / PDF. */
export function ApplyTab({ resetKey }: TabProps) {
  const store = useApplyStore();
  const [view, setView] = useState<'resume' | 'outreach' | 'tracker' | 'profile'>('resume');
  const [lines, setLines] = useState<Line[]>([]);
  const [printing, setPrinting] = useState(false);
  const [found, setFound] = useState<(ContactsOutcome & { postingId: string }) | null>(null);
  const [looking, setLooking] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const chat = useRef<HTMLDivElement>(null);

  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey === firstReset.current) return;
    store.resetFor(resetKey);
    setView('resume');
    setLines([]);
    setFound(null);
    setDrawer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const postings = [...store.tracked(), ...DEMO_POSTINGS.filter((d) => !store.isTracked(d.id))];
  const posting = postings.find((p) => p.id === store.selected()) ?? postings[0];
  const profile = store.profile();
  const r = useMemo(() => tailor(profile, posting), [profile, posting]);
  const tex = useMemo(() => renderLatex(r), [r]);
  const fileName = resumeFileName(posting.company, posting.title);

  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length, posting.id]);

  const did = (me: string, agent: string) => setLines((ls) => [...ls, { from: 'me', text: me, time: clock() }, { from: 'agent', text: agent, time: clock() }]);

  const save = (content: string, type: string, name: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const exportTracker = (ext: 'csv' | 'json') => {
    const rows = trackerRows(store.tracked(), today);
    save(ext === 'csv' ? toCsv(rows) : toJson(rows, new Date().toISOString()), ext === 'csv' ? 'text/csv' : 'application/json', trackerFileName(ext, today));
    did(`Export tracker (${ext.toUpperCase()})`, `Saved ${rows.length} tracked ${rows.length === 1 ? 'job' : 'jobs'} as "${trackerFileName(ext, today)}". It stays on your computer.`);
  };

  const downloadTex = () => {
    save(tex, 'application/x-tex', `${fileName}.tex`);
    did('Download LaTeX', `Saved "${fileName}.tex". It stays on your computer; nothing was sent.`);
  };

  const openOverleaf = () => {
    const form = Object.assign(document.createElement('form'), { method: 'POST', action: OVERLEAF_URL, target: '_blank' });
    for (const [name, value] of Object.entries(overleafFields(tex, fileName))) form.append(Object.assign(document.createElement('input'), { type: 'hidden', name, value }));
    document.body.append(form);
    form.submit();
    form.remove();
    did('Open in Overleaf', 'Opened a new Overleaf project with your resume. You can edit and compile it there.');
  };

  // Print once the print-only copy of the resume is in the page; the title becomes the default PDF file name.
  useEffect(() => {
    if (!printing) return;
    const title = document.title;
    document.title = fileName;
    window.print();
    document.title = title;
    setPrinting(false);
  }, [printing, fileName]);

  const savePdf = () => {
    setPrinting(true);
    did('Save as PDF', `Opened the print dialog. Choose "Save as PDF"; the file is named "${fileName}".`);
  };

  const demoPosting = posting.source === 'demo';
  const contacts = found?.postingId === posting.id ? found : null;

  const lookUp = async () => {
    setLooking(true);
    const out = await findContacts(posting.company, posting.title);
    setLooking(false);
    setFound({ ...out, postingId: posting.id });
    did(
      `Find contacts at ${posting.company}`,
      out.source === 'apollo'
        ? `Found ${out.contacts.length} people at ${posting.company} through Apollo. Pick one and I'll draft an intro; you send it.`
        : `Here are 3 sample contacts, clearly marked as demo data${out.note === 'rate_limited' ? ' (Apollo is rate limited right now)' : ''}. Real ones need an Apollo key on the server.`,
    );
  };

  return (
    <div className="app started">
      <header className="hero">
        <h1>
          Apply with proof. <span className="accent">A tailored resume, in your own words.</span>
        </h1>
        <div className="live-form">
          <select className="field wide" aria-label="Posting" value={posting.id} onChange={(e) => store.select(e.target.value)}>
            {postings.map((p) => (
              <option key={p.id} value={p.id}>{`${p.company} · ${p.title}${p.source === 'demo' ? ' (demo posting)' : ''}`}</option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="View">
            {(['resume', 'outreach', 'tracker', 'profile'] as const).map((v) => (
              <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className="hero-meta">
          <span className="proof-pill">Only your own bullets and skills · requirements you don't meet are listed, never invented</span>
          <button className="hood-btn" onClick={() => setDrawer(true)}>See what the agent is doing</button>
        </div>
      </header>

      <main className="phones">
        <PhoneFrame owner="Aditya" caption={demoPosting ? 'applying (demo posting)' : `applying to ${posting.company}`} chatRef={chat}>
          <p className="chat-day">Today {lines[0]?.time ?? clock()}</p>
          <ChatBubble from="agent" text={`For ${posting.company} ${posting.title}: I picked ${r.kept} of your ${r.total} bullets${r.matched.length ? ` and put ${list(r.matched.slice(0, 4))} first` : ''}. I only used what's in your profile.`} />
          <ChatBubble
            from="agent"
            text={r.unmet.length ? `${r.unmet.length} ${r.unmet.length === 1 ? 'requirement' : 'requirements'} you don't show yet: ${list(r.unmet.slice(0, 5))}. I left ${r.unmet.length === 1 ? 'it' : 'them'} out rather than invent anything.` : 'Your profile covers every requirement I can see in this posting.'}
          />
          {lines.map((l, i) => <ChatBubble key={i} from={l.from} text={l.text} time={l.time} />)}
          <QuickReplies
            options={[
              { label: 'Download LaTeX', tone: 'yes', onClick: downloadTex },
              { label: 'Open in Overleaf', onClick: openOverleaf },
              { label: 'Save as PDF', onClick: savePdf },
            ]}
          />
        </PhoneFrame>

        <section className="card resume-card" aria-label={view === 'resume' ? 'Tailored resume' : view === 'outreach' ? 'Outreach draft' : 'Your profile'}>
          {view === 'tracker' ? (
            <>
              <h3>Your tracker</h3>
              {store.tracked().length === 0 ? (
                <p className="feed-empty">Nothing tracked yet. Turn on Live search in Find and track a posting.</p>
              ) : (
                store.tracked().map((t) => (
                  <article key={t.id} className="job-row">
                    <div className="job-head">
                      <b>{t.title}</b>
                      <span>{t.company} · {t.location || 'Location not listed'} · saved {t.trackedAt}</span>
                    </div>
                    {t.source === 'demo' && <div className="job-chips"><span className="chip withheld">Demo data</span></div>}
                  </article>
                ))
              )}
              <div className="job-actions tracker-actions">
                <button className="ghost small" onClick={() => exportTracker('csv')}><Icon name="file" /> Download CSV</button>
                <button className="ghost small" onClick={() => exportTracker('json')}><Icon name="file" /> Download JSON</button>
                <a className="ghost small" href={HUNTR_URL} target="_blank" rel="noreferrer noopener">Open Huntr <Icon name="share" /></a>
              </div>
              <p className="draft-note"><Icon name="alert" /> Huntr has no public integration for individual students (its API is only for career centers). Keep this file, import it into any tracker that reads CSV, or add jobs in Huntr with its Chrome extension.</p>
            </>
          ) : view === 'outreach' ? (
            <>
              <h3>Intro email · {posting.company}</h3>
              <div className="find-contacts">
                <button className="ghost small" disabled={looking} onClick={lookUp}><Icon name="users" /> {looking ? 'Looking' : `Find contacts at ${posting.company}`}</button>
                {contacts && <span className={`chip ${contacts.source === 'apollo' ? 'shared' : 'withheld'}`}>{contacts.source === 'apollo' ? 'From Apollo' : 'Demo data'}</span>}
              </div>
              <OutreachPanel
                key={posting.id}
                company={posting.company}
                role={posting.title}
                studentName={profile.name}
                school={profile.education[0]?.org ?? ''}
                highlight={r.experience[0]?.bullets[0] ?? r.projects[0]?.bullets[0] ?? ''}
                contacts={(contacts?.contacts ?? []).map((c) => ({ name: c.name, title: c.title, email: c.email, linkedin: c.linkedin, source: contacts!.source }))}
                onDrafted={(who, words, source) =>
                  source === 'limited'
                    ? did('Write draft', "That's a lot of drafts in a few minutes, so I paused. Try again shortly.")
                    : did(`Draft an email to ${who}`, `Draft for ${who} is ready (${words} words${source === 'llm' ? ', reworded by Claude from your facts only' : ''}). Review it and send it yourself; I never send anything.`)
                }
              />
            </>
          ) : view === 'resume' ? (
            <>
              <h3>{fileName}</h3>
              <div className="resume-scale"><ResumeDoc r={r} /></div>
              <div className="unmet">
                <b><Icon name="alert" /> Requirements you don't meet</b>
                {r.unmet.length ? <p>{r.unmet.join(' · ')}</p> : <p>None found in this posting.</p>}
                {(() => {
                  const f1 = classifyF1(posting.description);
                  const year = gradYearOf(profile.education[0]?.dates);
                  const grad = year ? classifyGradWindow(posting.description, year, posting.isIntern) : null;
                  const quote = f1.evidence ?? grad?.evidence;
                  return (
                    <>
                      <p>{F1_LABEL[f1.status]}{grad && year ? ` · ${GRAD_LABEL(grad.status, year)}` : ''}</p>
                      {quote && <p className="job-quote">“{quote}”</p>}
                    </>
                  );
                })()}
              </div>
            </>
          ) : (
            <ProfileEditor profile={profile} isDemo={store.profileIsDemo()} onChange={(p, demo) => store.setProfile(p, demo)} />
          )}
        </section>
      </main>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Under the hood" subtitle="What your agent did for this application, and what left your device.">
        <div className="drawer-body single">
          <section className="card feed-card">
            <h3>Steps</h3>
            <ol className="steps">
              {[
                { t: `Read the ${posting.company} posting`, shared: [], summarized: [`${r.matched.length + r.unmet.length} requirement terms`], hidden: [] },
                { t: 'Tailored your resume', shared: [], summarized: [`${r.kept} of ${r.total} of your bullets`], hidden: ['bullets it left out', 'anything you didn\'t write'] },
                ...(contacts ? [{ t: contacts.source === 'apollo' ? 'Looked up contacts through Apollo' : 'Showed demo contacts', shared: contacts.source === 'apollo' ? [`company: ${posting.company}`, 'job titles'] : [], summarized: [], hidden: ['your profile', 'your resume'] }] : []),
                ...lines.filter((l) => l.from === 'me').map((l) => ({ t: l.text, shared: [], summarized: [], hidden: [/draft/i.test(l.text) ? 'the draft: you send it yourself' : 'the file stays on your computer'] })),
              ].map((st, i) => (
                <li key={i} className="step">
                  <b>{st.t}</b>
                  <div className="job-chips">
                    {st.shared.length ? st.shared.map((x) => <span key={x} className="chip shared">Shared: {x}</span>) : <span className="chip shared">Shared: nothing</span>}
                    {st.summarized.map((x) => <span key={x} className="chip abstracted">Summarized: {x}</span>)}
                    {st.hidden.map((x) => <span key={x} className="chip withheld">Hidden: {x}</span>)}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </Drawer>

      {printing && createPortal(<div className="print-root"><ResumeDoc r={r} /></div>, document.body)}
    </div>
  );
}
