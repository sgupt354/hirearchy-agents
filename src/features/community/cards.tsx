import type { ReactNode } from 'react';
import type { RuleCheck } from './community';
import { PACKS } from './packs';
import { levelOf, nextLevel, LEVELS, type PointEntry } from './points';

// Cards shared by the Community tab's two views (help requests and the project board).

export function LevelProgress({ name, points }: { name: string; points: number }) {
  const level = levelOf(points);
  const next = nextLevel(points);
  const floor = LEVELS.filter((l) => l.min <= points).at(-1)?.min ?? 0;
  const pct = next ? Math.round(((points - floor) / (next.min - floor)) * 100) : 100;
  return (
    <div className="lvl">
      <div className="lvl-head">
        <b>{name} · {level}</b>
        <span>{points} pts{next ? ` · ${next.min - points} to ${next.level}` : ''}</span>
      </div>
      <div className="lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${name}'s progress to the next level`}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PointsCard({ entry, before }: { entry: PointEntry; before: number }) {
  return (
    <div className="points-card">
      <span className="pts">{entry.capped ? '+0' : `+${entry.points}`} points</span>
      <small>{entry.capped ? entry.reason : `${entry.base} base x ${entry.multiplier}: ${entry.reason}. Both of you confirmed.`}</small>
      <LevelProgress name="You" points={before + entry.points} />
      {entry.levelAfter !== entry.levelBefore && <small>New level: {entry.levelAfter}. You get matching priority, a badge and more question packs. Never a referral.</small>}
    </div>
  );
}

/** Unlocked question packs: a few items each, every one labelled with where it came from. */
export function PacksCard({ ids }: { ids: string[] }) {
  const packs = ids.map((id) => PACKS.find((p) => p.id === id)!).filter(Boolean);
  return (
    <ol className="pack-card">
      {packs.map((p) => (
        <li key={p.id}>
          <span className="q-area">{p.title} · {p.items.length} items</span>
          {p.items.slice(0, packs.length === 1 ? 3 : 1).map((q) => (
            <span key={q.sourceId} className="pack-q">
              <b>{q.text}</b>
              <small>{q.kind === 'tip' ? 'Tip · ' : ''}{q.source}</small>
            </span>
          ))}
        </li>
      ))}
      <li className="pack-foot">Only from anonymized reports and shared intel. Nothing invented, no names.</li>
    </ol>
  );
}

export function RulesCard({ results, foot = 'Your rules stay with your agent. The newcomer never sees them.' }: { results: Pick<RuleCheck, 'label' | 'pass' | 'observed'>[]; foot?: ReactNode }) {
  return (
    <ul className="fit-card">
      {results.map((r) => (
        <li key={r.label} className={r.pass ? 'pass' : 'fail'}>
          <span aria-hidden>{r.pass ? '✓' : '✗'}</span>
          <span>{r.label}</span>
          <small>{r.observed}</small>
        </li>
      ))}
      <li className="fit-foot">{foot}</li>
    </ul>
  );
}
