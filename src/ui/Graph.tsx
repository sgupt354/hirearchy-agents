import type { GraphView } from './view';

const W = 520;
const H = 440;
const R = 30;

// Ring slot per agent (45° apart, slot 0 at the top). Spread out so any 3-person circle reads as a wide triangle.
const SLOT: Record<string, number> = { a1: 0, a5: 1, a4: 2, a3: 3, a8: 4, a2: 5, a7: 6, a6: 7 };

function positions(ids: string[]) {
  return Object.fromEntries(
    ids.map((id, i) => {
      const a = -Math.PI / 2 + ((SLOT[id] ?? i) * 2 * Math.PI) / 8;
      return [id, { x: W / 2 + Math.cos(a) * 185, y: H / 2 + Math.sin(a) * 160 }];
    }),
  );
}

const STATUS_TEXT = { you: 'you', member: 'in circle', backup: 'backup', filtered: 'filtered', idle: '' };

export function Graph({ ids, labels, view, names }: {
  ids: string[];
  labels: Record<string, string>;
  view: GraphView;
  names: Record<string, string>;
}) {
  const pos = positions(ids);
  return (
    <div className="graph">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Agent network from your view">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
          </marker>
        </defs>
        {view.edges.map((e) => {
          const a = pos[e.from];
          const b = pos[e.to];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const ux = (b.x - a.x) / len;
          const uy = (b.y - a.y) / len;
          const [x1, y1, x2, y2] = [a.x + ux * R, a.y + uy * R, b.x - ux * (R + 4), b.y - uy * (R + 4)];
          const mx = (a.x + b.x) / 2 - uy * 16;
          const my = (a.y + b.y) / 2 + ux * 16;
          return (
            <g key={`${e.from}-${e.to}`} className="edge">
              <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#arrow)" />
              <text x={mx} y={my} className="edge-label">{e.skills.join(', ')}</text>
            </g>
          );
        })}
        {ids.map((id) => {
          const { x, y } = pos[id];
          const status = view.status[id];
          const name = names[id];
          const label = status === 'you' ? 'You' : labels[id];
          // Caption goes on the outer side of the ring, away from the edges.
          const cy = y < H / 2 ? y - R - 10 : y + R + 18;
          return (
            <g key={id} className={`node node-${status}`}>
              <title>{view.reasons[id] ? `${labels[id]}: ${view.reasons[id]}` : label}</title>
              <circle cx={x} cy={y} r={R} />
              <text x={x} y={y + 5} className="node-label">{label.replace('Applicant ', '')}</text>
              {name ? (
                <text key={name} x={x} y={cy} className="node-name">{name}</text>
              ) : (
                <text x={x} y={cy} className="node-sub">{status === 'you' ? '' : STATUS_TEXT[status]}</text>
              )}
            </g>
          );
        })}
      </svg>
      {Object.keys(view.reasons).length > 0 && (
        <ul className="reasons">
          {Object.entries(view.reasons).map(([id, reason]) => (
            <li key={id}><span>{labels[id]}</span> {reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
