import { useEffect, useRef } from 'react';
import type { AgentEvent, CoordinationState } from '../engine/types';
import { iconFor, relabel } from './format';
import { matchesLens, type Lens } from './view';

export function Inspector({ events, state, labels, viewer, lenses }: {
  events: AgentEvent[];
  state: CoordinationState;
  labels: Record<string, string>;
  viewer: string;
  lenses: Lens[];
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [events.length]);
  // Turning a lens on jumps to its first matching event.
  useEffect(() => {
    const hit = list.current?.querySelector<HTMLElement>('.lens-hit');
    if (list.current && hit) list.current.scrollTop = hit.offsetTop - 8;
  }, [lenses.join()]);
  // With a lens on, matching events are outlined in that lens's colour and the rest fade back.
  const highlight = (e: AgentEvent) => {
    if (!lenses.length) return '';
    const hit = lenses.find((l) => matchesLens(e, l));
    return hit ? `lens-hit lens-${hit}` : 'lens-dim';
  };
  const name = (id: string) => (id === viewer ? 'You' : (labels[id] ?? id));

  return (
    <section className="panel inspector">
      <header>
        <h2>Agent Inspector</h2>
        <span className={`state state-${state}`}>{state.replaceAll('_', ' ')}</span>
      </header>
      {events.length === 0 && <p className="empty">Waiting for an interview invite…</p>}
      <ol ref={list}>
        {events.map((e) => (
          <li key={e.id} className={`ev ev-${e.type} ${highlight(e)}`}>
            <span className="ev-icon">{iconFor(e)}</span>
            <div>
              <div className="ev-meta">
                <b>{e.type}</b> {name(e.from)} → {e.to.map(name).join(', ')}
              </div>
              <div>{relabel(e.human_readable, labels[viewer])}</div>
              <div className="chips">
                {e.disclosure.shared.map((s) => <span key={`s${s}`} className="chip shared">↗ {s}</span>)}
                {e.disclosure.abstracted.map((s) => <span key={`a${s}`} className="chip abstracted">≈ {s}</span>)}
                {e.disclosure.withheld.map((s) => <span key={`w${s}`} className="chip withheld">🔒 {s}</span>)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
