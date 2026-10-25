import { useState } from 'react';
import { Icon } from '../../../ui/Icon';
import { requestDraft } from '../outreach/client';
import { MAX_WORDS, gmailComposeUrl, mailtoUrl, wordCount, type Draft, type DraftKind } from '../outreach/draft';

export interface Contact {
  name: string;
  title: string;
  email?: string;
  linkedin?: string;
  /** "demo" contacts are labelled as such in the UI. */
  source: 'apollo' | 'demo' | 'manual';
}

const KINDS: [DraftKind, string][] = [['recruiter', 'Recruiter'], ['alum', 'Alum'], ['referrer', 'Referrer']];

/** Draft an intro email. Copy / Gmail / email app only: the student reviews and sends it; we never send. */
export function OutreachPanel({ company, role, studentName, school, highlight, contacts, onDrafted }: {
  company: string;
  role: string;
  studentName: string;
  school: string;
  highlight: string;
  contacts: Contact[];
  onDrafted: (who: string, words: number, source: 'llm' | 'template' | 'limited') => void;
}) {
  const [kind, setKind] = useState<DraftKind>('recruiter');
  const [contact, setContact] = useState<Contact>({ name: '', title: '', email: '', source: 'manual' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [limited, setLimited] = useState(false);

  const write = async () => {
    setBusy(true);
    setCopied(false);
    const out = await requestDraft({ kind, company, role, contact: { name: contact.name, title: contact.title, email: contact.email }, student: { name: studentName, school, highlight } });
    setBusy(false);
    if (out === 'rate_limited') {
      setLimited(true);
      onDrafted(contact.name, 0, 'limited');
      return;
    }
    setLimited(false);
    setDraft(out.draft);
    onDrafted(contact.name || 'this contact', wordCount(out.draft.body), out.source);
  };

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const words = draft ? wordCount(draft.body) : 0;

  return (
    <div className="outreach">
      {contacts.length > 0 && (
        <div className="contact-list" role="list" aria-label="Contacts">
          {contacts.map((c) => (
            <button key={`${c.name}-${c.title}`} role="listitem" className={`contact ${contact.name === c.name ? 'on' : ''}`} onClick={() => setContact(c)}>
              <b>{c.name}</b>
              <span>{c.title}</span>
              {c.source === 'demo' && <span className="chip withheld">Demo data</span>}
            </button>
          ))}
        </div>
      )}
      <div className="segmented" role="group" aria-label="Who you're writing to">
        {KINDS.map(([v, label]) => (
          <button key={v} className={kind === v ? 'on' : ''} aria-pressed={kind === v} onClick={() => setKind(v)}>{label}</button>
        ))}
      </div>
      <div className="pe-grid">
        <input className="field" aria-label="Contact name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value, source: 'manual' })} placeholder="Their name" />
        <input className="field" aria-label="Contact title" value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} placeholder="Their title" />
        <input className="field" aria-label="Contact email" value={contact.email ?? ''} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="Their email (optional)" />
        <button className="cta small" disabled={busy || !contact.name.trim()} onClick={write}><Icon name="edit" /> {busy ? 'Writing' : 'Write draft'}</button>
      </div>
      {limited && <p className="pe-note">That's a lot of drafts in a few minutes. Take a break and try again shortly.</p>}

      {draft && (
        <div className="draft">
          <input className="field wide" aria-label="To" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} placeholder="To" />
          <input className="field wide" aria-label="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          <textarea className="pe-area" rows={9} aria-label="Draft" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="draft-foot">
            <span className={words > MAX_WORDS ? 'over' : ''}>{words} / {MAX_WORDS} words</span>
            <div className="job-actions">
              <button className="ghost small" onClick={copy}><Icon name={copied ? 'check' : 'clipboard'} /> {copied ? 'Copied' : 'Copy'}</button>
              <a className="ghost small" href={gmailComposeUrl(draft)} target="_blank" rel="noreferrer noopener"><Icon name="mail" /> Open in Gmail</a>
              <a className="ghost small" href={mailtoUrl(draft)}><Icon name="mail" /> Email app</a>
            </div>
          </div>
          <p className="draft-note"><Icon name="lock" /> A draft only. You review it and send it from your own email; Hirearchy never sends anything.</p>
        </div>
      )}
    </div>
  );
}
