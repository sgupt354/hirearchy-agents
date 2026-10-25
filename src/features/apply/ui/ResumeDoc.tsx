import type { Entry } from '../resume/profile';
import type { TailoredResume } from '../resume/tailor';

function Item({ e }: { e: Entry }) {
  return (
    <div className="rd-entry">
      <div className="rd-row"><b>{e.title}</b><span>{e.dates}</span></div>
      {(e.org || e.location) && <div className="rd-row rd-sub"><i>{e.org}</i><i>{e.location}</i></div>}
      {e.bullets.length > 0 && <ul>{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
    </div>
  );
}

function Section({ title, items }: { title: string; items: Entry[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h4>{title}</h4>
      {items.map((e, i) => <Item key={`${e.title}-${i}`} e={e} />)}
    </section>
  );
}

/** The tailored resume as a print-ready page (same content and order as the .tex). */
export function ResumeDoc({ r }: { r: TailoredResume }) {
  return (
    <article className="resume-doc">
      <header>
        <h3>{r.profile.name || 'Your name'}</h3>
        <p>{[r.profile.email, r.profile.phone, ...r.profile.links].filter(Boolean).join('  |  ')}</p>
      </header>
      <Section title="Education" items={r.education} />
      <Section title="Experience" items={r.experience} />
      <Section title="Projects" items={r.projects} />
      {r.skills.length > 0 && (
        <section>
          <h4>Skills</h4>
          <p className="rd-skills">{r.skills.join(', ')}</p>
        </section>
      )}
    </article>
  );
}
