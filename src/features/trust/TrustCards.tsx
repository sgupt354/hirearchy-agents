import { useState } from 'react';
import { Icon } from '../../ui/Icon';
import { RUBRIC } from '../mock/scores';
import { mockOverall, type EvidenceFile } from './evidence';
import { MIN_RATINGS, type Rating } from './ledger';

/** Private post-session rating of each other member: showed up (yes/no) and helpful (1–5). */
export function RatingCard({ people, onSubmit }: { people: { id: string; name: string }[]; onSubmit: (ratings: Record<string, Rating>) => void }) {
  const [draft, setDraft] = useState<Record<string, Partial<Rating>>>({});
  const set = (id: string, patch: Partial<Rating>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const complete = people.every(({ id }) => draft[id]?.showedUp === false || (draft[id]?.showedUp === true && draft[id]?.helpful));
  return (
    <form
      className="rubric-card rating-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!complete) return;
        onSubmit(Object.fromEntries(people.map(({ id }) => [id, { showedUp: Boolean(draft[id].showedUp), helpful: draft[id].showedUp ? draft[id].helpful! : 1 }])));
      }}
    >
      {people.map(({ id, name }) => (
        <fieldset key={id} className="rate-person">
          <legend>{name}</legend>
          <div className="rate-row">
            <span>Showed up?</span>
            <div className="score-chips yn" role="radiogroup" aria-label={`Did ${name} show up?`}>
              {([true, false] as const).map((v) => (
                <button type="button" key={String(v)} role="radio" aria-checked={draft[id]?.showedUp === v} className={`score-chip ${draft[id]?.showedUp === v ? 'on' : ''}`} onClick={() => set(id, { showedUp: v })}>
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>
          {draft[id]?.showedUp !== false && (
            <div className="rate-row">
              <span>Helpful?</span>
              <div className="score-chips" role="radiogroup" aria-label={`How helpful was ${name}?`}>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button type="button" key={v} role="radio" aria-checked={draft[id]?.helpful === v} className={`score-chip ${draft[id]?.helpful === v ? 'on' : ''}`} onClick={() => set(id, { helpful: v })}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </fieldset>
      ))}
      <button type="submit" className="cal-add" disabled={!complete}>Rate privately</button>
    </form>
  );
}

/** "Your proof of work": the student's private evidence file, on their own phone. */
export function EvidenceCard({ file, badge }: { file: EvidenceFile; badge?: string | null }) {
  const overall = mockOverall(file.mockAverages);
  const m = file.mentoring;
  return (
    <div className="evidence-card">
      <div className="ev-title">
        <Icon name="award" />
        <b>Your proof of work</b>
        {badge && <span className="ev-badge">{badge}</span>}
      </div>
      <dl>
        <div><dt>Sessions attended</dt><dd>{file.sessionsAttended}</dd></div>
        <div>
          <dt>Average rating</dt>
          <dd>{file.averageRating !== null ? `★ ${file.averageRating.toFixed(1)} · ${file.ratingCount} ratings` : `After ${MIN_RATINGS} ratings (${file.ratingCount} so far)`}</dd>
        </div>
        <div>
          <dt>Mock interviews</dt>
          <dd>{overall !== null ? `${overall.toFixed(1)} avg · ${file.mockCount} peer ${file.mockCount === 1 ? 'mock' : 'mocks'}` : 'None yet'}</dd>
        </div>
        {file.mockAverages && (
          <div className="ev-rubric">
            {RUBRIC.map(({ key, label }) => (
              <span key={key}>{label} {file.mockAverages![key].toFixed(1)}</span>
            ))}
          </div>
        )}
        <div><dt>Intel reports shared</dt><dd>{file.intelReports}</dd></div>
        {m && (
          <div>
            <dt>Mentoring</dt>
            <dd>
              Helped {m.newcomersHelped} {m.newcomersHelped === 1 ? 'newcomer' : 'newcomers'} · {m.averageRating !== null ? `★ ${m.averageRating.toFixed(1)}` : `rating after ${MIN_RATINGS} (${m.ratingCount} so far)`}
            </dd>
          </div>
        )}
        {file.thankYouNotes.length > 0 && (
          <div>
            <dt>Thank-you notes</dt>
            <dd>
              <ul className="ev-thanks">
                {file.thankYouNotes.map((n, i) => (
                  <li key={`${n.at}-${i}`}>
                    <i>{n.fromLabel}</i>: {n.text}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
      <div className="ev-chips">
        {file.skillsTaught.map((s) => <span key={s} className="taught">Taught {s}</span>)}
        {file.targetRoles.map((r) => <span key={r}>{r}</span>)}
      </div>
      <p className="score-foot">Private to you. Your agent shares it step by step, only with your OK. Thank-you notes never leave this card.</p>
    </div>
  );
}
