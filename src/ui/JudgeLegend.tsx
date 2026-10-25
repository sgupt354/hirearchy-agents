import { LENSES, type Lens } from './view';

/** Toggle chips that map the feed onto the three judging criteria. */
export function JudgeLegend({ active, onToggle }: { active: Lens[]; onToggle: (lens: Lens) => void }) {
  return (
    <div className="lenses" role="group" aria-label="Judging criteria">
      <span>Judging lens</span>
      {LENSES.map((l) => (
        <button
          key={l.id}
          className={`lens-chip lens-${l.id} ${active.includes(l.id) ? 'on' : ''}`}
          aria-pressed={active.includes(l.id)}
          onClick={() => onToggle(l.id)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
