import { useEffect, useRef } from 'react';
import type { AgentEvent, CoordinationState } from '../engine/types';
import { iconFor, relabel } from './format';

export function Inspector({ events, state, labels, viewer }: {
  events: AgentEvent[];
  state: CoordinationState;
  labels: Record<string, string>;
  viewer: string;
}) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [events.length]);
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
          <li key={e.id} className={`ev ev-${e.type}`}>
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
