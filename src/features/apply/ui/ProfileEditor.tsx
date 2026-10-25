import { useState } from 'react';
import { Icon } from '../../../ui/Icon';
import { DEMO_PROFILE, parseResumeText, type Entry, type Profile } from '../resume/profile';

type ListKey = 'experience' | 'projects' | 'education';
const LISTS: [ListKey, string][] = [['experience', 'Experience'], ['projects', 'Projects'], ['education', 'Education']];
const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** The student's profile: paste a resume (parsed deterministically, then editable) or edit the fields directly. */
export function ProfileEditor({ profile, isDemo, onChange }: { profile: Profile; isDemo: boolean; onChange: (p: Profile, demo?: boolean) => void }) {
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState('');
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  const setEntry = (k: ListKey, i: number, patch: Partial<Entry>) => set({ [k]: profile[k].map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const read = () => {
    const p = parseResumeText(paste);
    const found = p.experience.length + p.projects.length + p.education.length;
    if (!p.name && !found) return setNote("I couldn't find any sections. Use headings like Education, Experience, Projects and Skills.");
    onChange(p, false);
    setNote(`Read ${found} ${found === 1 ? 'entry' : 'entries'} and ${p.skills.length} ${p.skills.length === 1 ? 'skill' : 'skills'}. Check them below; nothing else was added.`);
  };

  return (
    <div className="profile-editor">
      <div className="pe-head">
        <span className={`chip ${isDemo ? 'withheld' : 'shared'}`}>{isDemo ? 'Sample profile' : 'Your profile'}</span>
        {!isDemo && <button className="ghost small" onClick={() => onChange(DEMO_PROFILE, true)}>Use sample profile</button>}
      </div>
      <label className="pe-label" htmlFor="pe-paste">Paste your resume text</label>
      <textarea id="pe-paste" className="pe-area" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Name, contact line, then Education / Experience / Projects / Skills with one bullet per line" />
      <div className="pe-actions">
        <button className="cta small" disabled={!paste.trim()} onClick={read}><Icon name="file" /> Read my resume</button>
        {note && <span className="pe-note">{note}</span>}
      </div>

      <div className="pe-grid">
        <input className="field" aria-label="Name" value={profile.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name" />
        <input className="field" aria-label="Email" value={profile.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email" />
        <input className="field" aria-label="Phone" value={profile.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Phone" />
        <input className="field" aria-label="Links" value={profile.links.join(', ')} onChange={(e) => set({ links: split(e.target.value) })} placeholder="Links, comma separated" />
      </div>
      <label className="pe-label" htmlFor="pe-skills">Skills</label>
      <input id="pe-skills" className="field wide" value={profile.skills.join(', ')} onChange={(e) => set({ skills: split(e.target.value) })} />

      {LISTS.map(([k, title]) => (
        <div key={k} className="pe-section">
          <div className="pe-section-head">
            <b>{title}</b>
            <button className="ghost small" onClick={() => set({ [k]: [...profile[k], { title: '', org: '', dates: '', location: '', bullets: [] }] })}>Add</button>
          </div>
          {profile[k].map((e, i) => (
            <div key={i} className="pe-entry">
              <div className="pe-grid">
                <input className="field" aria-label={`${title} ${i + 1} title`} value={e.title} onChange={(ev) => setEntry(k, i, { title: ev.target.value })} placeholder="Title" />
                <input className="field" aria-label={`${title} ${i + 1} organization`} value={e.org} onChange={(ev) => setEntry(k, i, { org: ev.target.value })} placeholder={k === 'projects' ? 'Tech' : 'Organization'} />
                <input className="field" aria-label={`${title} ${i + 1} dates`} value={e.dates} onChange={(ev) => setEntry(k, i, { dates: ev.target.value })} placeholder="Dates" />
                <button className="ghost small" onClick={() => set({ [k]: profile[k].filter((_, j) => j !== i) })}>Remove</button>
              </div>
              <textarea
                className="pe-area"
                rows={Math.max(2, e.bullets.length)}
                aria-label={`${title} ${i + 1} bullets`}
                value={e.bullets.join('\n')}
                onChange={(ev) => setEntry(k, i, { bullets: ev.target.value.split('\n') })}
                onBlur={(ev) => setEntry(k, i, { bullets: ev.target.value.split('\n').map((b) => b.trim()).filter(Boolean) })}
                placeholder="One bullet per line, in your own words"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
