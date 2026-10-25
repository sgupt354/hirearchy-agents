import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '../engine/types';
import { describe, prettify, type EventView, type FeedContext } from './copy';
import { matchesLens, type Lens } from './view';

/** Live agent feed for judges: human titles, raw type as a tag, compact disclosure that expands. */
export function Inspector({ events, label, lenses, describeEvent = describe }: {
  events: AgentEvent[];
  label: (id: string) => string;
  lenses: Lens[];
  /** Plain-English title/body for an event; defaults to the prep-circle wording. */
  describeEvent?: (e: AgentEvent, ctx: FeedContext) => EventView;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [events.length]);
  // Turning a lens on jumps to its first matching event.
  useEffect(() => {
    const hit = list.current?.querySelector<HTMLElement>('.lens-hit');
    if (list.current && hit) list.current.scrollTo({ top: hit.offsetTop - 8, behavior: 'smooth' });
  }, [lenses.join()]);

  const lensClass = (e: AgentEvent) => {
    if (!lenses.length) return '';
    const hit = lenses.find((l) => matchesLens(e, l));
    return hit ? `lens-hit lens-${hit}` : 'lens-dim';
  };

  return (
    <ol className="feed" ref={list}>
      {events.length === 0 && <li className="feed-empty">Nothing yet. Start the demo and the agents' conversation shows up here.</li>}
      {events.map((e) => {
        const v = describeEvent(e, { label, byId });
        const d = e.disclosure;
        const total = d.shared.length + d.abstracted.length + d.withheld.length;
        const expanded = open === e.id;
        return (
          <li key={e.id} className={`row tone-${v.tone} ${lensClass(e)}`}>
            <span className="row-icon">{v.icon}</span>
            <div className="row-main">
              <div className="row-head">
                <b>{v.title}</b>
                <span className="tag">{e.type}</span>
                <span className="route">{label(e.from)} → {e.to.length > 3 ? `${e.to.length} agents` : e.to.map(label).join(', ')}</span>
              </div>
              <p>{v.body}</p>
              {total > 0 && (
                <button className={`disclosure ${expanded ? 'open' : ''}`} onClick={() => setOpen(expanded ? null : e.id)} aria-expanded={expanded}>
                  {[
                    d.shared.length && `Shared ${d.shared.length}`,
                    d.abstracted.length && `Summarized ${d.abstracted.length}`,
                    d.withheld.length && `Hidden ${d.withheld.length}`,
                  ].filter(Boolean).join(' · ')}
                  <span className="chev">›</span>
                </button>
              )}
              {expanded && (
                <div className="chips">
                  {d.shared.map((s) => <span key={`s${s}`} className="chip shared">↗ {prettify(s)}</span>)}
                  {d.abstracted.map((s) => <span key={`a${s}`} className="chip abstracted">≈ {prettify(s)}</span>)}
                  {d.withheld.map((s) => <span key={`w${s}`} className="chip withheld">🔒 {prettify(s)}</span>)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
